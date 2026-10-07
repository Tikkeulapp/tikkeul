/**
 * POST /api/recommend — 프로필 기반 추천 (추천 탭)
 * 입력: { userId, personaId | profileId }
 * 흐름: resolveProfile(이사 반영) → 취준 키워드별 거주지/전국 후보 풀(마감 지난 정책 제외) → 코드 점수화
 *       → 관심사 순위와 RRF 융합·피드백 다운랭크 → 40건 → LLM 6건 선별 → 테마 다양성 재배치
 * 관심사(담기·열람·일정·응시료 지출)는 순위에만 쓴다 — 자격 판정·금액과는 무관.
 * 금액은 원문에 명시된 경우에만 추출(없으면 null) — 절약 위젯 합산용.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabase";
import { resolveProfile } from "@/services/profile";
import { llmJson } from "@/services/llm";
import { loadInterestContext, recordImpressions } from "@/services/interests";
import { INTEREST_TAGS } from "@/data/interests";
import { interestScoreForText, keywordsForTags } from "@/lib/interest";
import { diversify, rrf } from "@/lib/rank";

export const maxDuration = 60;

type Cand = {
  policy_id: string; source: string; title: string; provider: string | null; theme: string | null; region_sidos: string[] | null;
  is_national: boolean | null; end_date: string | null; always_open: boolean | null; apply_url: string | null; search_text: string | null;
};
type Pick = { policy_id: string; score: number; reason: string; benefit_summary: string; amount_krw: number | null; amount_basis: string | null };

const COLS = "policy_id, source, title, provider, theme, region_sidos, is_national, end_date, always_open, apply_url, search_text";
const BASE_KW = ["취업", "구직", "면접", "자격증", "응시료", "구직활동", "취업지원", "정장", "직업훈련", "청년수당", "인턴", "일경험"];
const STRONG = ["응시료", "면접", "정장", "수당", "구직활동", "취업지원", "청년", "미취업", "교통비", "월세"];

/** 원문에서 지원 금액을 규칙으로 읽는다 (예: "월 50만 원", "최대 10만원", "500,000원"). 없으면 0 */
export function parseAmountKrw(text: string | null | undefined): number {
  if (!text) return 0;
  const m1 = text.match(/(\d{1,3}(?:,\d{3})?|\d+)\s*만\s*원/);
  if (m1) return Math.round(Number(m1[1].replace(/,/g, "")) * 10000);
  const m2 = text.match(/(\d{1,3}(?:,\d{3}){1,2})\s*원/);
  if (m2) return Number(m2[1].replace(/,/g, ""));
  return 0;
}

const SYSTEM = `당신은 한국 취업준비생 정책 어시스턴트입니다. [사용자]와 [정책 후보](공공 API에서 수집한 실제 정책)를 보고,
이 사용자가 지금 신청을 검토할 가치가 있는 정책을 관련도 순으로 최대 6개 골라 JSON 하나로 출력하세요:
{"picks": [{"policy_id": "...", "score": 0~100, "reason": "왜 이 사용자에게 맞는지 1문장(존댓말)", "benefit_summary": "혜택 핵심 12자 내외", "amount_krw": 원문에 명시된 지원 금액(원, 숫자)이 있을 때만, 없으면 null, "amount_basis": "금액 근거 원문 구절 또는 null"}]}
규칙:
- 후보에 없는 policy_id 금지. reason·benefit_summary·amount는 그 후보의 요약 원문에만 근거. 원문에 없는 금액·조건을 만들지 마세요.
- 사용자의 거주지(시·도, 시·군·구)·나이·취업상태에 명백히 어긋나면 제외. 다른 시·군·구 전용 정책은 제외.
- 재직자 전용·기업(사업주) 지급 장려금·창업·농업·결혼·출산 정책은 제외.
- 같은 정책이 여러 후보로 있으면 하나만. score 60 미만 제외. 무관하면 빈 배열.
- [사용자]의 관심사는 최근 행동에서 추정한 참고 정보입니다. 비슷한 후보끼리의 우선순위에만 쓰고, 자격 판단 근거로 쓰거나 reason에서 행동을 구체적으로 언급하지 마세요.`;

export async function POST(request: Request) {
  let body: { userId?: string | null; personaId?: string | null; profileId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  if (!body.personaId && !body.profileId) return NextResponse.json({ error: "personaId 또는 profileId가 필요합니다" }, { status: 400 });

  const db = supabaseAdmin();
  const [prof, interest] = await Promise.all([
    resolveProfile({ userId: body.userId, personaId: body.personaId, profileId: body.profileId }),
    loadInterestContext({ userId: body.userId, personaId: body.personaId }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const openOr = `end_date.is.null,end_date.gte.${today},always_open.eq.true`;

  // 프로필·관심사에 따라 키워드 보강 — 개인화 키워드를 앞에 두어야 slice에서 잘리지 않는다
  const summary = prof.summary as Record<string, unknown>;
  const kws: string[] = [];
  if (String(summary["주거형태"] ?? "").includes("월세")) kws.push("월세", "주거");
  const benefits = (summary["수급중수당"] as string[] | undefined) ?? [];
  if (benefits.some((b) => /구직급여|실업급여/.test(b))) kws.push("재취업", "실업급여");
  for (const tag of interest.topTags) kws.push(...keywordsForTags([tag], INTEREST_TAGS).slice(0, 2));
  const focus = [...new Set([...kws, ...BASE_KW])].slice(0, 16);

  type Res = { data: Cand[] | null; error: { message: string } | null };
  const pools: Promise<Res>[] = [];
  for (const k of focus) {
    if (prof.sido) pools.push(db.from("policies").select(COLS).contains("region_sidos", [prof.sido]).eq("is_national", false).ilike("search_text", `%${k}%`).or(openOr).limit(30) as unknown as Promise<Res>);
    pools.push(db.from("policies").select(COLS).eq("is_national", true).ilike("search_text", `%${k}%`).or(openOr).limit(20) as unknown as Promise<Res>);
  }
  const seen = new Set<string>();
  const raw: Cand[] = [];
  for (const res of await Promise.all(pools)) {
    if (res.error) return NextResponse.json({ error: `정책 검색 실패: ${res.error.message}` }, { status: 500 });
    for (const r of res.data ?? []) if (!seen.has(r.policy_id)) { seen.add(r.policy_id); raw.push(r); }
  }

  const userGu = prof.sigungu ? prof.sigungu.replace(/(특례시|시|군|구)$/, "") : null;
  const age = prof.age;
  const scoreOf = (c: Cand) => {
    const text = c.search_text ?? "";
    let sc = STRONG.filter((k) => c.title.includes(k)).length * 3 + focus.filter((k) => text.includes(k)).length;
    if (userGu && (c.provider ?? "").includes(userGu)) sc += 4;
    if (!c.is_national) sc += 1;
    if (c.source === "ontong" || c.source === "curated") sc += 1;
    const m = (c.provider ?? "").match(/(?:특별시|광역시|특별자치시|도|특별자치도)\s*([가-힣]+?)(?:특례시|시|군|구)(?=\s|$)/);
    if (m && userGu && !m[1].startsWith(userGu)) sc -= 5;
    if (m && !userGu) sc -= 2;
    if (/재직자|사업주|기업\s*지원|출산|임산부|결혼|농업|창업/.test(c.title)) sc -= 4;
    return sc;
  };
  const norm = (t: string) => t.replace(/\s|\(.*?\)|\[.*?\]|\d{4}년?|지원사업|지원|사업|모집|시험/g, "");
  const seenTitle = new Set<string>();
  const ranked = raw
    .filter((c) => !interest.removed.has(c.policy_id)) // 사용자가 마이티끌에서 뺀 정책
    .map((c) => ({ c, sc: scoreOf(c) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .filter((x) => { const t = norm(x.c.title); if (seenTitle.has(t)) return false; seenTitle.add(t); return true; })
    .map((x) => x.c);
  // 코드 점수 순위 + 관심사 순위를 RRF로 합치고, 반복 노출에 반응 없던 정책은 뒤로 보낸다
  const interestOrder = ranked
    .map((c) => ({ id: c.policy_id, s: interestScoreForText(`${c.title} ${(c.search_text ?? "").slice(0, 300)}`, interest.scores, INTEREST_TAGS) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  const fused = rrf([ranked.map((c) => c.policy_id), interestOrder]).map((x) => x.id);
  const fusedOrder = [...fused.filter((id) => !interest.stale.has(id)), ...fused.filter((id) => interest.stale.has(id))];
  const rankedById = new Map(ranked.map((c) => [c.policy_id, c]));
  const cands = fusedOrder.slice(0, 40).map((id) => rankedById.get(id)!);

  const byId = new Map(cands.map((c) => [c.policy_id, c]));
  const list = cands.map((c) => ({
    policy_id: c.policy_id, title: c.title, 기관: c.provider, 지역: c.is_national ? "전국" : (c.region_sidos ?? []).join(","),
    마감: c.end_date ?? (c.always_open ? "상시" : null), 요약: (c.search_text ?? "").slice(0, 300),
  }));
  const 관심사 = interest.topTags.map((id) => INTEREST_TAGS.find((t) => t.id === id)?.label ?? id);
  const userMsg = `[사용자]\n${JSON.stringify({ ...summary, 나이: age, 거주지: `${prof.sido ?? ""} ${prof.sigungu ?? ""}`.trim(), ...(관심사.length ? { 관심사 } : {}) })}\n\n[정책 후보]\n${JSON.stringify(list)}`;

  let picks: Pick[] = [];
  let aiError: string | null = null;
  try {
    let out = await llmJson<{ picks: Pick[] }>(SYSTEM, userMsg, 2000);
    if (!Array.isArray(out?.picks) || out.picks.length === 0) out = await llmJson<{ picks: Pick[] }>(SYSTEM, userMsg, 2000);
    picks = (out.picks ?? []).filter((p) => byId.has(p.policy_id) && Number(p.score) >= 60).sort((a, b) => b.score - a.score).slice(0, 6);
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e);
  }

  const recommendations = diversify(picks, (p) => byId.get(p.policy_id)?.theme ?? null).map((p) => {
    const c = byId.get(p.policy_id)!;
    const llmAmount = typeof p.amount_krw === "number" && p.amount_krw > 0 && p.amount_krw < 100_000_000 ? Math.round(p.amount_krw) : 0;
    const parsed = llmAmount || parseAmountKrw(p.benefit_summary) || parseAmountKrw((c.search_text ?? "").slice(0, 400));
    const amount = parsed > 0 && parsed < 100_000_000 ? parsed : 0;
    return {
      id: c.policy_id, title: c.title, benefit: p.benefit_summary, amountMaxKrw: amount, amountBasis: p.amount_basis ?? (amount ? "원문 금액 규칙 추출" : null),
      region: c.is_national ? "전국" : (c.region_sidos ?? []).join(", "), provider: c.provider, content: c.search_text?.slice(0, 600) ?? null,
      url: c.apply_url, source: "db" as const, sourceName: c.source, endDate: c.end_date, alwaysOpen: !!c.always_open, score: p.score, reason: p.reason,
    };
  });

  if (body.userId) await recordImpressions(body.userId, recommendations.map((r) => r.id));

  return NextResponse.json({ recommendations, candidates: cands.length, aiError, interests: 관심사, profile: { sido: prof.sido, sigungu: prof.sigungu, age } });
}
