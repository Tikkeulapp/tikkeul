/**
 * 이벤트가 정책 판단에 영향 있는 유형인지 결정론적으로 거른다 (finance/rules/calendar_rules.py 패턴).
 * 관련 없으면 SQL 후보검색·랭킹 LLM 호출 자체를 생략해 비용·오탐을 줄인다 (src/app/api/event-match).
 *
 * ETC만 제외한다 — "생일" 같은 진짜 무관 이벤트가 몰리는 유형이고, 나머지 9종은 전부
 * 정책과 이어질 수 있어 놓치는(false negative) 쪽이 더 나쁘다.
 */
export const POLICY_RELEVANT_EVENT_TYPES = new Set([
  "INTERVIEW",
  "EXAM",
  "EDUCATION",
  "MOVE",
  "HOUSING",
  "APPLICATION",
  "GRADUATE",
  "RESIGN",
  "EMPLOYED",
]);

export function isPolicyRelevantEvent(eventType: string | null | undefined): boolean {
  return !!eventType && POLICY_RELEVANT_EVENT_TYPES.has(eventType);
}
