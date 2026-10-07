/**
 * "정책 1건 × 사용자" 자격판정의 단일 진입점.
 *
 * policy_eligibility에 구조화 조건이 채워진 정책은 규칙엔진(src/lib/eligibility.ts)이
 * confirmed/excluded/insufficient_info를 확정하고, LLM은 그 결과를 설명만 한다.
 * 아직 조건이 없는 정책(대다수 — eligibility_json 백필은 별도 후속작업)은 지금까지처럼
 * LLM이 search_text/target/content 원문을 보고 통째로 판정하는 폴백 경로를 그대로 쓴다.
 * 이 함수를 쓰는 곳(/api/relevance, /api/event-match)은 이 과도기적 분기를 몰라도 된다.
 */
import { supabaseAdmin } from "@/services/supabase";
import { llmJson } from "@/services/llm";
import { classifyConditions } from "@/lib/eligibility";
import type { EligibilityCondition, EligibilityResult } from "@/types/eligibility";
import type { PolicyInput, Verdict } from "@/types/policy";
import { notifyNewMatch } from "@/services/notifications";


const STATUS_TO_ELIGIBILITY = {
  confirmed: "LIKELY",
  excluded: "UNLIKELY",
  insufficient_info: "NEEDS_CHECK",
} as const;

const ELIGIBILITY_TO_STATUS = {
  LIKELY: "confirmed",
  UNLIKELY: "excluded",
  NEEDS_CHECK: "insufficient_info",
} as const;

/** 규칙엔진 결과를 사람이 읽을 설명으로 바꾸는 프롬프트 — 결론 자체는 절대 뒤집지 않는다. */
const EXPLAIN_SYSTEM = `당신은 한국 청년·취업준비생 정책의 자격 판정 "결과"를 설명하는 어시스턴트입니다.
자격 여부(확정 가능/제외/정보 부족)는 이미 규칙엔진이 정했습니다. 당신은 그 결론을 절대 바꾸지 말고,
왜 그런 결론이 났는지와 (정보 부족이면) 무엇을 더 확인해야 하는지만 한국어로 설명하세요.

반드시 JSON 하나만 출력:
{"score": 0~100 정수, "reasons": ["..."], "missing_information": ["..."], "evidence_todo": ["..."]}
- score: 확정 가능이면 70~100, 제외면 0~30, 정보 부족이면 충족된 조건 비율에 비례해 30~70
- reasons: 존댓말, 각 1문장. 항목별 충족/미충족 결과를 구체적으로 인용할 것
- evidence_todo: 신청 시 미리 챙길 증빙. 없으면 빈 배열`;

/** 구조화 조건이 없는 정책용 폴백 — 기존 relevance/route.ts와 동일한 프롬프트. */
const FALLBACK_SYSTEM = `당신은 한국 청년·취업준비생 정책의 자격 판정 어시스턴트입니다.

규칙 (반드시 지킬 것):
1. 제공된 사용자 정보와 정책 정보만 사용한다. 세상 지식으로 정책 조건을 지어내지 않는다.
2. 모르는 조건은 절대 추측하지 않는다 — 확인이 필요하면 eligibility를 NEEDS_CHECK로 하고 missing_information에 "무엇을 어떻게 확인할지"를 적는다.
3. 사용자 정보의 null은 "모름"이라는 뜻이다. null인 조건이 판정에 필요하면 missing_information에 넣는다.
4. 명백히 미충족인 조건(나이 초과, 타지역 거주 등)이 있으면 UNLIKELY로 하고 그 이유를 reasons에 적는다.
5. '미취업' 요건 판정 시: 아르바이트 등 단기 근로소득이 있어도 취업상태가 미취업이면 미취업으로 본다 (정책이 근로시간 제한을 명시한 경우에만 확인 필요로 처리).
6. evidence_todo에는 신청에 대비해 미리 챙길 증빙(면접확인서, 영수증 등)을 적는다. 없으면 빈 배열.
7. 지원 한도(예: 연 최대 10만 원, 월 50만 원)는 지급액 상한일 뿐 자격 조건이 아니다. 사용자의 지출·소득이 한도를 넘는다는 이유로 UNLIKELY로 판정하지 않는다.
8. 사용자 정보의 '자격시험_응시이력'에 항목이 있으면 그 시험에 실제로 응시한 것으로 확정한다(마이데이터 결제내역 기준). 자격시험·어학시험 응시 요건은 이 이력으로 충족된 것으로 판정하고, 별도 확인 대상으로 남기지 않는다. '보유자격증'도 확정 사실로 본다.
9. 반드시 JSON 하나만 출력한다:
{"score": 0~100 정수, "eligibility": "LIKELY"|"NEEDS_CHECK"|"UNLIKELY", "reasons": ["..."], "missing_information": ["..."], "evidence_todo": ["..."]}
- score: 이 사용자에게 이 정책이 얼마나 유의미한지 (자격 + 상황 관련성 종합)
- reasons: 한국어 존댓말, 각 1문장`;

/** policy_eligibility + 규칙엔진만 실행 (LLM 호출 없음). judgePolicy 내부와 에이전트 도구
 * (src/agents/policyTools.ts)가 공유하는 지점 — 에이전트 경로에서는 바깥 ReAct 에이전트 자신이
 * 설명을 생성하므로 여기서 또 Groq를 부를 필요가 없다. conditions가 비어 있으면(아직 백필 전)
 * null을 반환해 호출자가 각자의 폴백을 쓰게 한다. */
export async function classifyPolicyForUser(
  policyId: string,
  profileRow: Record<string, unknown> | null,
  financeRow: Record<string, unknown> | null,
): Promise<{ result: EligibilityResult; eligibilityText: string | null } | null> {
  const eligRow = (
    await supabaseAdmin()
      .from("policy_eligibility")
      .select("conditions, eligibility_text")
      .eq("policy_id", policyId)
      .maybeSingle()
  ).data;
  const conditions = (eligRow?.conditions ?? []) as EligibilityCondition[];
  if (conditions.length === 0) return null;
  return {
    result: classifyConditions(conditions, profileRow, financeRow, new Date()),
    eligibilityText: eligRow?.eligibility_text ?? null,
  };
}

/** classifyPolicyForUser의 일괄판 — 후보 N건을 쿼리 1번으로 판정한다 (추천티끌·일정 매칭 게이트용).
 * 조건이 없는 정책은 null. 조회 실패 시 빈 Map을 반환해 호출자가 전부 unjudged로 다루게 한다
 * (판정은 부가 정보지 추천 자체의 전제조건이 아니다). */
export async function classifyPoliciesForUser(
  policyIds: string[],
  profileRow: Record<string, unknown> | null,
  financeRow: Record<string, unknown> | null,
): Promise<Map<string, EligibilityResult | null>> {
  const out = new Map<string, EligibilityResult | null>();
  if (policyIds.length === 0) return out;
  const { data, error } = await supabaseAdmin()
    .from("policy_eligibility")
    .select("policy_id, conditions")
    .in("policy_id", policyIds);
  if (error) {
    console.error("policy_eligibility 일괄 조회 실패:", error.message);
    return out;
  }
  const now = new Date();
  for (const row of data ?? []) {
    const conditions = (row.conditions ?? []) as EligibilityCondition[];
    out.set(row.policy_id, conditions.length ? classifyConditions(conditions, profileRow, financeRow, now) : null);
  }
  return out;
}

export async function judgePolicy(opts: {
  /** 기존 방식대로 LLM에 보여줄 한국어 라벨 프로필 요약 (폴백 경로에서 사용) */
  profileSummary: Record<string, unknown>;
  /** profile_survey 원본 행 — 규칙엔진용. 없으면 null (규칙엔진은 insufficient_info로 처리) */
  profileRow: Record<string, unknown> | null;
  /** finance 원본 행 — 규칙엔진용 */
  financeRow: Record<string, unknown> | null;
  /** policy_eligibility 조회 키. 데모/미등록 정책이면 null — 이 경우 폴백 경로로만 감 */
  policyId: string | null;
  policy: PolicyInput;
}): Promise<Verdict> {
  const classified = opts.policyId
    ? await classifyPolicyForUser(opts.policyId, opts.profileRow, opts.financeRow)
    : null;

  if (!classified) {
    const fallback = await llmJson<Verdict>(
      FALLBACK_SYSTEM,
      `[오늘 날짜] ${new Date().toISOString().slice(0, 10)}\n\n[사용자 정보]\n${JSON.stringify(opts.profileSummary, null, 1)}\n\n[정책 정보]\n${JSON.stringify(opts.policy, null, 1)}\n\n이 사용자가 이 정책의 대상인지 판정하고 규칙대로 JSON만 출력하세요.`,
    );
    return fallback;
  }

  const { result, eligibilityText } = classified;
  const explained = await llmJson<{
    score: number;
    reasons: string[];
    missing_information: string[];
    evidence_todo: string[];
  }>(
    EXPLAIN_SYSTEM,
    `[규칙엔진 결론] ${result.status}\n\n[항목별 확인 결과]\n${JSON.stringify(result.checks, null, 1)}\n\n[정책 정보]\n${JSON.stringify(opts.policy, null, 1)}\n\n[정책 근거 원문]\n${eligibilityText ?? ""}`,
  );

  return {
    score: explained.score,
    eligibility: STATUS_TO_ELIGIBILITY[result.status],
    reasons: explained.reasons ?? [],
    missing_information: explained.missing_information?.length ? explained.missing_information : result.missingFields,
    evidence_todo: explained.evidence_todo ?? [],
  };
}

/** 판정 결과를 user_policy_matches에 영속화. policyId가 policies에 없는(curated 시드 전) 데모
 * 정책이면 FK 위반으로 실패하는데, 판정 응답 자체는 이미 사용자에게 나갔으니 여기 실패는 로그만
 * 남기고 삼킨다 — 저장은 부가기능이지 판정의 전제조건이 아니다. */
export async function saveMatchResult(opts: {
  userId: string;
  policyId: string;
  matchMode: "search" | "lookup_and_check" | "compare";
  verdict: Verdict;
}): Promise<void> {
  const eligibilityStatus = ELIGIBILITY_TO_STATUS[opts.verdict.eligibility];
  // status 의미: recommended/applied = 마이티끌에 보임, dismissed = 안 보임 (DB CHECK 제약상 이 세 값뿐).
  // "판정"은 "담기"가 아니다 — lookup/compare 판정만 한 행을 recommended로 저장하면 자세히보기·챗봇
  // 질문만 해도 마이티끌에 들어가는 버그가 된다. 판정 행은 dismissed로 두되, 이미 담아둔 정책의
  // 재판정이 담김 상태를 지우면 안 되므로 최신 행이 담김이면 그 status를 승계한다.
  // search(이벤트 매칭 AI 제안)는 기존대로 recommended — 프론트가 match_mode로 어차피 제외하고,
  // 신규 매칭 알림(notifyNewMatch)은 받아야 하기 때문.
  let status: string;
  if (eligibilityStatus === "excluded") status = "dismissed";
  else if (opts.matchMode === "search") status = "recommended";
  else {
    const { data: latest } = await supabaseAdmin()
      .from("user_policy_matches")
      .select("status, match_mode")
      .eq("user_id", opts.userId)
      .eq("policy_id", opts.policyId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const savedAlready = !!latest && latest.match_mode !== "search" && (latest.status === "recommended" || latest.status === "applied");
    status = savedAlready ? (latest.status as string) : "dismissed";
  }
  const { error } = await supabaseAdmin().from("user_policy_matches").insert({
    user_id: opts.userId,
    policy_id: opts.policyId,
    match_mode: opts.matchMode,
    eligibility_status: eligibilityStatus,
    match_score: opts.verdict.score,
    reason: opts.verdict.reasons.join(" "),
    status,
    missing_information: opts.verdict.missing_information,
  });
  if (error) {
    console.error(`user_policy_matches 저장 실패 (${opts.policyId}):`, error.message);
    return;
  }
  // 새 매칭 생성 -> Notification Scheduler 트리거 (spec 7번 트리거 중 하나)
  await notifyNewMatch({ user_id: opts.userId, policy_id: opts.policyId, eligibility_status: eligibilityStatus, status });
}
