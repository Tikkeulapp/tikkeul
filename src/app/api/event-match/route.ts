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
규칙: 후보 목록에 없는 policy_id를 만들지 않는다. 지역·나이가 명백히 안 맞으면 제외한다. 맞는 게 없으면 빈 배열.`;

export async function POST(request: Request) {
  let body: { personaId?: string | null; title?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { personaId, title, date } = body;
  if (!title?.trim()) return NextResponse.json({ error: "title이 필요합니다" }, { status: 400 });

  // 사용자 요약 (판정 근거용 — 페르소나 또는 기본값)
  const p = personaId ? getPersona(personaId) : undefined;
  const userSummary = p
    ? {
        나이: new Date().getFullYear() - Number(p.declared.birthDate.slice(0, 4)),
        거주지: `${p.declared.region.sido} ${p.declared.region.sigungu}`,
        취업상태: p.declared.employmentStatus,
        가구중위소득구간: p.declared.incomeBracket,
      }
    : { 참고: "프로필 미상 — 일정 관련성 위주로 판단" };
  const userSido = p?.declared.region.sido ?? null;

  try {
    // ── 1) 일정 의미 추출 ──
    const extracted = await groqJson<Extracted>(
      EXTRACT_SYSTEM,
      `일정: "${title.trim()}"${date ? ` (날짜: ${date})` : ""}`,
      300,
    );
    const keywords = (extracted.keywords ?? []).filter(Boolean).slice(0, 6);
    if (keywords.length === 0) keywords.push(title.trim());
    const regions = [extracted.region_sido, userSido].filter(Boolean) as string[];

    // ── 2) SQL 후보 압축: (해당 지역 또는 전국) AND (키워드 일치) ──
    const db = supabaseAdmin();
    let q = db
      .from("policies")
      .select("policy_id, title, provider, theme, region_sidos, is_national, age_min, age_max, apply_url, search_text")
      .limit(15);
    if (regions.length > 0) {
      const regionOr = ["is_national.eq.true", ...regions.map((r) => `region_sidos.cs.{"${r}"}`)];
      q = q.or(regionOr.join(","));
    }
    q = q.or(keywords.map((k) => `search_text.ilike.%${k.replace(/[%,()]/g, "")}%`).join(","));
    const { data: candidates, error } = await q;
    if (error) throw new Error(`정책 검색 실패: ${error.message}`);

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
      800,
    );

    const byId = new Map(candidates.map((c) => [c.policy_id, c]));
    const recommendations = (ranked.recommendations ?? [])
      .filter((r) => byId.has(r.policy_id))
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
