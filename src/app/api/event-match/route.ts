import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import { supabaseAdmin } from "@/lib/supabase";
import { groqJson } from "@/lib/groq";

/**
 * POST /api/event-match — 일정 텍스트 → 관련 정책 추천 (서비스의 심장)
 * 1) LLM이 일정의 의미(유형·지역·키워드)를 추출
 * 2) policies 테이블에서 지역·키워드로 후보 압축 (SQL)
 * 3) LLM이 사용자 프로필과 대조해 상위 추천 + 이유
 */

type Extracted = {
  event_type: "INTERVIEW" | "EXAM" | "EDUCATION" | "MOVE" | "HOUSING" | "APPLICATION" | "ETC";
  region_sido: string | null;
  keywords: string[];
};

type Ranked = {
  recommendations: {
    policy_id: string;
    score: number;
    reason: string;
    benefit_summary: string;
  }[];
};

const EXTRACT_SYSTEM = `당신은 한국 취업준비생의 캘린더 일정 텍스트를 분석합니다.
일정에서 다음을 추출해 JSON 하나만 출력하세요:
{"event_type": "INTERVIEW|EXAM|EDUCATION|MOVE|HOUSING|APPLICATION|ETC",
 "region_sido": "일정에 지역이 언급되면 시도 정식명칭 (서울특별시/대전광역시/경기도 등), 없으면 null",
 "keywords": ["이 일정과 관련된 지원정책을 찾기 위한 한국어 검색 키워드 3~6개"]}
예: "대전 이사" → MOVE, "대전광역시", ["이사", "주거", "전입", "정착", "월세"]
예: "SKT 면접" → INTERVIEW, null, ["면접", "구직활동", "면접비", "정장"]`;

const RANK_SYSTEM = `당신은 한국 청년·취준생 정책 추천 어시스턴트입니다.
사용자 정보, 일정, 정책 후보 목록이 주어집니다.
이 일정을 계기로 사용자에게 실제로 유의미한 정책만 최대 3개 골라 JSON 하나로 출력하세요:
{"recommendations": [{"policy_id": "...", "score": 0~100, "reason": "왜 이 사용자·일정에 맞는지 1문장 (존댓말)", "benefit_summary": "받는 혜택 요약 1구절"}]}
규칙: 후보 목록에 없는 policy_id를 만들지 않는다. 지역·나이가 명백히 안 맞으면 제외한다. 이사·이주 일정이면 목적지 지역의 정책을 우선하고, 떠나는 지역 전용 정책은 제외한다. 정책의 지원내용이 이 일정의 활동(면접·시험·자소서·이사 등)과 직접 연결되지 않으면 절대 포함하지 않는다 — 억지로 채우지 말고 빈 배열이 낫다. reason에는 정책 내용 중 이 일정과 맞닿는 요소를 구체적으로 인용한다. score 60 미만은 포함하지 않는다.`;

export async function POST(request: Request) {
  let body: { personaId?: string | null; profileId?: string | null; title?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { personaId, profileId, title, date } = body;
  if (!title?.trim()) return NextResponse.json({ error: "title이 필요합니다" }, { status: 400 });

  // 사용자 요약 (판정 근거용) — 페르소나(코드) 또는 직접입력 회원(DB)
  const p = personaId ? getPersona(personaId) : undefined;
  let userSummary: Record<string, unknown> = { 참고: "프로필 미상 — 일정 관련성 위주로 판단" };
  let userSido: string | null = null;
  if (p) {
    userSummary = {
      나이: new Date().getFullYear() - Number(p.declared.birthDate.slice(0, 4)),
      거주지: `${p.declared.region.sido} ${p.declared.region.sigungu}`,
      취업상태: p.declared.employmentStatus,
      가구중위소득구간: p.declared.incomeBracket,
    };
    userSido = p.declared.region.sido;
  } else if (profileId) {
    const { data: sv } = await supabaseAdmin()
      .from("profile_survey")
      .select("birth_date, region_sido, region_sigungu, education_status, income_bracket, housing_type")
      .eq("id", profileId)
      .single();
    if (sv) {
      userSummary = {
        나이: sv.birth_date ? new Date().getFullYear() - Number(String(sv.birth_date).slice(0, 4)) : null,
        거주지: `${sv.region_sido ?? ""} ${sv.region_sigungu ?? ""}`.trim(),
        학력: sv.education_status,
        주거형태: sv.housing_type,
        가구중위소득구간: sv.income_bracket,
      };
      userSido = sv.region_sido ?? null;
    }
  }

  try {
    // ── 1) 일정 의미 추출 ──
    const extracted = await groqJson<Extracted>(
      EXTRACT_SYSTEM,
      `일정: "${title.trim()}"${date ? ` (날짜: ${date})` : ""}`,
      1200,
    );
    const GENERIC = new Set(["준비", "작성", "지원", "신청", "등록", "참여", "운영", "안내", "프로그램", "청년", "사업", "활동", "일정"]);
    const keywords = (extracted.keywords ?? [])
      .map((k) => String(k).trim())
      .filter((k) => k.length >= 2 && !GENERIC.has(k))
      .slice(0, 6);
    if (keywords.length === 0) keywords.push(title.trim());
    const regions = [extracted.region_sido, userSido].filter(Boolean) as string[];

    // ── 2) SQL 후보 압축 — 일정 지역 정책을 먼저 확보하고, 전국·거주지 정책으로 채움 ──
    const db = supabaseAdmin();
    const kwOr = keywords.map((k) => `search_text.ilike.%${k.replace(/[%,()]/g, "")}%`).join(",");
    const cols = "policy_id, title, provider, theme, region_sidos, is_national, age_min, age_max, apply_url, search_text";
    type Cand = { policy_id: string; title: string; provider: string | null; theme: string | null; region_sidos: string[] | null; is_national: boolean; age_min: number | null; age_max: number | null; apply_url: string | null; search_text: string | null };
    const seen = new Set<string>();
    const candidates: Cand[] = [];
    const push = (rows: Cand[] | null) => {
      for (const r of rows ?? []) if (!seen.has(r.policy_id)) { seen.add(r.policy_id); candidates.push(r); }
    };
    // (a) 일정에 언급된 지역 우선 (예: "대전 이사" → 대전 정책)
    if (extracted.region_sido) {
      const { data, error } = await db.from("policies").select(cols)
        .contains("region_sidos", [extracted.region_sido]).or(kwOr).limit(12);
      if (error) throw new Error(`정책 검색 실패: ${error.message}`);
      push(data as Cand[] | null);
    }
    // (b) 전국 + 거주지 정책
    {
      const regionOr = ["is_national.eq.true", ...(userSido ? [`region_sidos.cs.{"${userSido}"}`] : [])].join(",");
      const { data, error } = await db.from("policies").select(cols).or(regionOr).or(kwOr).limit(extracted.region_sido ? 10 : 18);
      if (error) throw new Error(`정책 검색 실패: ${error.message}`);
      push(data as Cand[] | null);
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ extracted, recommendations: [], note: "조건에 맞는 정책 후보가 없습니다" });
    }

    // ── 3) LLM 선별 ──
    const compact = candidates.map((c) => ({
      policy_id: c.policy_id,
      title: c.title,
      기관: c.provider,
      지역: c.is_national ? "전국" : (c.region_sidos ?? []).join(","),
      나이: c.age_min || c.age_max ? `${c.age_min ?? "?"}~${c.age_max ?? "?"}세` : "제한 없음",
      요약: (c.search_text ?? "").slice(0, 220),
    }));
    const ranked = await groqJson<Ranked>(
      RANK_SYSTEM,
      `[사용자]\n${JSON.stringify(userSummary)}\n\n[일정]\n"${title.trim()}" (${date ?? "날짜 미상"}, 유형: ${extracted.event_type})\n\n[정책 후보]\n${JSON.stringify(compact, null, 1)}`,
      2000,
    );

    const byId = new Map(candidates.map((c) => [c.policy_id, c]));
    const recommendations = (ranked.recommendations ?? [])
      .filter((r) => byId.has(r.policy_id) && r.score >= 60)
      .slice(0, 3)
      .map((r) => {
        const c = byId.get(r.policy_id)!;
        return {
          policy_id: r.policy_id,
          title: c.title,
          provider: c.provider,
          region: c.is_national ? "전국" : (c.region_sidos ?? []).join(", "),
          score: r.score,
          reason: r.reason,
          benefit_summary: r.benefit_summary,
          apply_url: c.apply_url,
        };
      });

    return NextResponse.json({ extracted, recommendations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "매칭 실패" },
      { status: 502 },
    );
  }
}
