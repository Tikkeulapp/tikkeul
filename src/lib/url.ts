/**
 * 공고 원문 URL 정규화 (순수 함수).
 * 잡알리오 srcUrl에는 기관이 손으로 적은 값이 그대로 들어온다 — '.', '없음', '해당없음',
 * 'www.도메인' 등. 상대 URL로 렌더되면 <a href=".">가 앱 내부(/app)로 이동하는 버그가 된다.
 */

/** 도메인처럼 보이는 문자열: 점으로 구분된 레이블 + 2자 이상 TLD (경로 허용) */
const DOMAIN_LIKE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/\S*)?$/i;

/** http(s) 절대 URL만 통과시키고, 스킴 없는 도메인은 https를 붙이고,
 *  그 외('.', '없음' 등)는 폴백 URL(없으면 null)로 대체한다. */
export function sanitizeDetailUrl(raw: string | null | undefined, fallback: string | null): string | null {
  const v = (raw ?? "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (DOMAIN_LIKE.test(v)) return `https://${v}`;
  return fallback;
}
