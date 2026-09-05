import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { groqJson } from "@/lib/groq";
import { resolveProfile } from "@/lib/profile";
import { normalizeSido } from "@/lib/region";

/**
 * POST /api/event-match — 일정 텍스트 → 관련 정책 추천 (서비스의 심장)
 * 1) LLM이 일정의 의미(유형·지역·키워드)를 추출
 * 2) policies 테이블에서 지역·키워드로 후보 압축 (SQL) — 일정 지역 우선
 * 3) LLM이 사용자 프로필과 대조해 상위 추천 + 이유
 * + 이사(MOVE)로 거주지가 바뀌면: 프로필 변경 제안 + 델타 리포트(열리는/사라지는 혜택)
 */

type Extracted = {
  event_type: "INTERVIEW" | "EXAM" | "EDUCATION" | "MOVE" | "HOUSING" | "APPLICATION" | "GRADUATE" | "RESIGN" | "EMPLOYED" | "ETC";
  region_sido: string | null;
  keywords: string[];
};

type Ranked = {
  recommendations: { policy_id: string; score: number; reason: string; benefit_summary: string }[];
};

type Delta = {
  opening: { policy_id: string; score: number; reason: string }[];
  closing: { policy_id: string; reason: string }[];
};

type Cand = {
  policy_id: string; title: string; provider: string | null; theme: string | null;
  region_sidos: string[] | null; is_national: boolean; age_min: number | null; age_max: number | null;
  apply_url: string | null; search_text: string | null;
};
const COLS = "policy_id, title, provider, theme, region_sidos, is_national, age_min, age_max, apply_url, search_text";

const EXTRACT_SYSTEM = `당신은 한국 취업준비생의 캘린더 일정 텍스트를 분석합니다.
일정에서 다음을 추출해 JSON 하나만 출력하세요:
{"event_type": "INTERVIEW|EXAM|EDUCATION|MOVE|HOUSING|APPLICATION|GRADUATE|RESIGN|EMPLOYED|ETC",
 "region_sido": "일정에 지역이 언급되면 시도 정식명칭 (서울특별시/대전광역시/경기도/전남광주통합특별시 등), 없으면 null",
 "keywords": ["이 일정과 관련된 지원정책을 찾기 위한 한국어 검색 키워드 3~6개"]}
MOVE = 이사·이주·전입(거주지가 바뀜). GRADUATE = 졸업. RESIGN = 퇴사. EMPLOYED = 취업·입사.
예: "대전 이사" → MOVE, "대전광역시", ["이사", "주거", "전입", "정착", "월세"]
예: "SKT 면접" → INTERVIEW, null, ["면접", "구직활동", "면접비", "정장"]`;

const RANK_SYSTEM = `당신은 한국 청년·취준생 정책 추천 어시스턴트입니다.
사용자 정보, 일정, 정책 후보 목록이 주어집니다.
이 일정을 계기로 사용자에게 실제로 유의미한 정책만 최대 3개 골라 JSON 하나로 출력하세요:
{"recommendations": [{"policy_id": "...", "score": 0~100, "reason": "왜 이 사용자·일정에 맞는지 1문장 (존댓말)", "benefit_summary": "받는 혜택 요약 1구절"}]}
규칙: 후보 목록에 없는 policy_id를 만들지 않는다. 지역·나이가 명백히 안 맞으면 제외한다. 이사·이주 일정이면 목적지 지역의 정책을 우선하고, 떠나는 지역 전용 정책은 제외한다. 정책의 지원내용이 이 일정의 활동(면접·시험·자소서·이사 등)과 직접 연결되지 않으면 절대 포함하지 않는다 — 억지로 채우지 말고 빈 배열이 낫다. reason에는 정책 내용 중 이 일정과 맞닿는 요소를 구체적으로 인용한다. score 60 미만은 포함하지 않는다.`;

const DELTA_SYSTEM = `당신은 한국 청년·취준생 정책 어시스턴트입니다. 사용자가 거주지를 옮깁니다.
[새 지역 정책 후보]에서 이 취준생에게 유의미한 것을 최대 6개(opening), [현 거주지 정책 후보]에서 떠나면 못 받게 되는 취준 관련 혜택을 최대 4개(closing) 골라 JSON 하나로 출력하세요:
{"opening": [{"policy_id": "...", "score": 0~100, "reason": "1문장 (존댓말)"}],
 "closing": [{"policy_id": "...", "reason": "1문장 (존댓말)"}]}
규칙: 후보에 없는 policy_id 금지. 나이·상태가 명백히 안 맞으면 제외. 취업준비(구직·면접·시험·교육·주거·생활비)와 무관한 정책(결혼·출산·농업·창업 등)은 제외. opening은 score 60 미만 제외.`;

export async function POST(request: Request) {
  let body: { userId?: string | null; personaId?: string | null; profileId?: string | null; title?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, personaId, profileId, title, date } = body;
  if (!title?.trim()) return NextResponse.json({ error: "title이 필요합니다" }, { status: 400 });

  const profile = await resolveProfile({ userId, personaId, profileId });
  const userSido = profile.sido;
  const db = supabaseAdmin();

  try {
    // ── 1) 일정 의미 추출 ──
    const extracted = await groqJson<Extracted>(
      EXTRACT_SYSTEM,
      `일정: "${title.trim()}"${date ? ` (날짜: ${date})` : ""}`,
      1200,
    );
    extracted.region_sido = normalizeSido(extracted.region_sido); // 옛 명칭·약칭 → 표준 시도명
    const GENERIC = new Set(["준비", "작성", "지원", "신청", "등록", "참여", "운영", "안내", "프로그램", "청년", "사업", "활동", "일정"]);
    const keywords = (extracted.keywords ?? [])
      .map((k) => String(k).trim())
      .filter((k) => k.length >= 2 && !GENERIC.has(k))
      .slice(0, 6);
    if (keywords.length === 0) keywords.push(title.trim());

    // ── 2) SQL 후보 압축 — 일정 지역 우선, 전국·거주지로 채움 ──
    const kwOr = keywords.map((k) => `search_text.ilike.%${k.replace(/[%,()]/g, "")}%`).join(",");
    const seen = new Set<string>();
    const candidates: Cand[] = [];
    const push = (rows: Cand[] | null) => {
      for (const r of rows ?? []) if (!seen.has(r.policy_id)) { seen.add(r.policy_id); candidates.push(r); }
    };
    if (extracted.region_sido) {
      const { data, error } = await db.from("policies").select(COLS)
        .contains("region_sidos", [extracted.region_sido]).or(kwOr).limit(12);
      if (error) throw new Error(`정책 검색 실패: ${error.message}`);
      push(data as Cand[] | null);
    }
    {
      const regionOr = ["is_national.eq.true", ...(userSido ? [`region_sidos.cs.{"${userSido}"}`] : [])].join(",");
      const { data, error } = await db.from("policies").select(COLS).or(regionOr).or(kwOr).limit(extracted.region_sido ? 10 : 18);
      if (error) throw new Error(`정책 검색 실패: ${error.message}`);
      push(data as Cand[] | null);
    }

    const compact = (list: Cand[]) => list.map((c) => ({
      policy_id: c.policy_id,
      title: c.title,
      기관: c.provider,
      지역: c.is_national ? "전국" : (c.region_sidos ?? []).join(","),
      나이: c.age_min || c.age_max ? `${c.age_min ?? "?"}~${c.age_max ?? "?"}세` : "제한 없음",
      요약: (c.search_text ?? "").slice(0, 200),
    }));
    const shape = (c: Cand) => ({
      policy_id: c.policy_id, title: c.title, provider: c.provider,
      region: c.is_national ? "전국" : (c.region_sidos ?? []).join(", "), apply_url: c.apply_url,
    });

    // ── 3) LLM 선별 (일정에 직접 붙는 혜택) ──
    let recommendations: object[] = [];
    if (candidates.length > 0) {
      const ranked = await groqJson<Ranked>(
        RANK_SYSTEM,
        `[사용자]\n${JSON.stringify(profile.summary)}\n\n[일정]\n"${title.trim()}" (${date ?? "날짜 미상"}, 유형: ${extracted.event_type})\n\n[정책 후보]\n${JSON.stringify(compact(candidates), null, 1)}`,
        2000,
      );
      const byId = new Map(candidates.map((c) => [c.policy_id, c]));
      recommendations = (ranked.recommendations ?? [])
        .filter((r) => byId.has(r.policy_id) && r.score >= 60)
        .slice(0, 3)
        .map((r) => ({ ...shape(byId.get(r.policy_id)!), score: r.score, reason: r.reason, benefit_summary: r.benefit_summary }));
    }

    // ── + 거주지 변경(MOVE) → 프로필 변경 제안 + 델타 리포트 ──
    let regionChange: object | null = null;
    if (extracted.event_type === "MOVE" && extracted.region_sido && extracted.region_sido !== userSido) {
      const newSido = extracted.region_sido;
      // 새 지역 후보: 취준 관련 키워드로 먼저 걸러 60건 (대규모 통합지역에서 농촌·문화 정책에 밀리지 않게)
      const JOB_OR = "search_text.ilike.%취업%,search_text.ilike.%구직%,search_text.ilike.%면접%,search_text.ilike.%자격증%,search_text.ilike.%응시%,search_text.ilike.%수당%,search_text.ilike.%월세%,search_text.ilike.%주거%,search_text.ilike.%직업훈련%,search_text.ilike.%인턴%";
      const [{ data: openRows }, { data: closeRows }, { count: openingTotal }] = await Promise.all([
        db.from("policies").select(COLS).contains("region_sidos", [newSido]).or(JOB_OR).limit(60),
        userSido
          ? db.from("policies").select(COLS).contains("region_sidos", [userSido]).eq("is_national", false)
              .or("search_text.ilike.%취업%,search_text.ilike.%구직%,search_text.ilike.%면접%,search_text.ilike.%수당%,search_text.ilike.%응시%").limit(30)
          : Promise.resolve({ data: [] as Cand[] }),
        db.from("policies").select("*", { count: "exact", head: true }).contains("region_sidos", [newSido]),
      ]);
      const open = (openRows ?? []) as Cand[];
      const close = (closeRows ?? []) as Cand[];
      let delta: Delta = { opening: [], closing: [] };
      if (open.length + close.length > 0) {
        delta = await groqJson<Delta>(
          DELTA_SYSTEM,
          `[사용자]\n${JSON.stringify(profile.summary)}\n\n[이동] ${userSido ?? "미상"} → ${newSido} (${date ?? "날짜 미상"})\n\n[새 지역 정책 후보]\n${JSON.stringify(compact(open), null, 1)}\n\n[현 거주지 정책 후보]\n${JSON.stringify(compact(close), null, 1)}`,
          2500,
        );
      }
      const openById = new Map(open.map((c) => [c.policy_id, c]));
      const closeById = new Map(close.map((c) => [c.policy_id, c]));
      regionChange = {
        field: "region_sido",
        from: userSido,
        to: newSido,
        effectiveFrom: date ?? new Date().toISOString().slice(0, 10),
        opening: (delta.opening ?? []).filter((o) => openById.has(o.policy_id) && o.score >= 60).slice(0, 6)
          .map((o) => ({ ...shape(openById.get(o.policy_id)!), score: o.score, reason: o.reason })),
        closing: (delta.closing ?? []).filter((c) => closeById.has(c.policy_id)).slice(0, 4)
          .map((c) => ({ ...shape(closeById.get(c.policy_id)!), reason: c.reason })),
        openingTotal: openingTotal ?? open.length,
      };
    }

    return NextResponse.json({ extracted, recommendations, regionChange, profile: { sido: profile.sido, pending: profile.pending } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "매칭 실패" }, { status: 502 });
  }
}
