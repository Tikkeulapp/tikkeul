/**
 * /api/chat 한 턴의 최종 답변 합치기 — 프로필 반영(·이사 혜택) 답변 뒤에 Policy Agent 답변을 붙인다.
 * Policy Agent가 실패해 폴백 문구만 냈을 때, 앞에 이미 쓸 만한 답이 있으면 "문제가 생겼어요"로
 * 답변 전체를 실패처럼 보이게 하지 않는다.
 */

/** Policy Agent가 빈 답·예외 끝에 내는 폴백 문구 (extractReply·runWithRetry 공용) */
export const POLICY_FALLBACK_TEXT = "답변을 정리하는 중 문제가 생겼어요. 다시 한 번 말씀해 주시겠어요?";
const POLICY_RETRY_HINT = "💬 받을 수 있는 지원 정책은 지금 정리하지 못했어요. \"받을 수 있는 지원 있어?\"라고 한 번 더 물어봐 주세요.";

export const isPolicyFallback = (s: string) => s.includes(POLICY_FALLBACK_TEXT);

export function mergeChatReply(prior: string | null, policyReply: string, opts: { deltaShown: boolean }): string {
  if (!prior) return policyReply;
  const failed = isPolicyFallback(policyReply);
  // 이사 혜택(델타)이 이미 답이면 정책 쪽 실패·0건은 덧붙일 내용이 없다
  if (opts.deltaShown && (failed || /찾지 못했/.test(policyReply))) return prior;
  return [prior, failed ? POLICY_RETRY_HINT : policyReply].filter(Boolean).join("\n\n");
}
