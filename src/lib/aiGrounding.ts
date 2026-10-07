/**
 * AI 해설 근거 검증 (순수 함수).
 * "숫자는 코드가, 해설은 AI가" 원칙을 출력 단계에서 강제한다 — AI 문장 속 금액·연월·%·기간이
 * 계산 엔진이 넘긴 입력(JSON 문자열)에 실제로 있는지 대조하고, 목록 밖 제도 언급을 잡아낸다.
 * 표기 차이("3,600만 원" vs "3600만원", "1억 원" vs "1억")는 값 단위로 정규화해 비교한다.
 */

export type NumericClaim = { key: string; text: string };
export type GroundingReport = {
  ok: boolean;
  claims: number; // 문장에서 찾은 숫자 주장 수
  ungrounded: string[]; // 입력에 없는 숫자 (정규화 키)
  forbiddenMentions: string[]; // 목록 밖 제도 이름
};

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : 0);

/** 텍스트에서 금액·연월·%·기간을 뽑아 정규화 키로 돌려준다. 단위 없는 숫자는 주장으로 보지 않는다. */
export function extractNumericClaims(text: string): NumericClaim[] {
  const out: NumericClaim[] = [];
  let rest = text;
  const take = (re: RegExp, toKey: (m: RegExpExecArray) => string) => {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      out.push({ key: toKey(m), text: m[0].trim() });
      return " ";
    });
  };
  // 1) 연월 — 먼저 떼어내 '년'이 기간으로 다시 잡히지 않게
  take(/(\d{4})\s*년\s*(\d{1,2})\s*월/g, (m) => `${m[1]}년${Number(m[2])}월`);
  // 2) 금액 — 억(+만) / 만 / 원
  take(/(\d[\d,]*)\s*억(?:\s*(\d[\d,]*)\s*만)?(?:\s*원)?/g, (m) => `${num(m[1]) * 10000 + num(m[2])}만원`);
  take(/(\d[\d,]*)\s*만(?:\s*원)?/g, (m) => `${num(m[1])}만원`);
  take(/(\d[\d,]*)\s*원/g, (m) => `${num(m[1])}원`);
  // 3) 퍼센트
  take(/(\d+(?:\.\d+)?)\s*%/g, (m) => `${m[1]}%`);
  // 4) 기간 — "5년 8개월" / "8개월" / "6년"
  take(/(\d+)\s*년\s*(\d+)\s*개월/g, (m) => `${m[1]}년${m[2]}개월`);
  take(/(\d+)\s*개월/g, (m) => `${m[1]}개월`);
  take(/(\d+)\s*년(?!\s*\d)/g, (m) => `${m[1]}년`);
  return out;
}

/** AI 출력 문장들이 입력(source, 보통 JSON.stringify(payload))에 근거하는지 검사한다. */
export function checkGrounding(texts: string[], source: string, opts: { forbiddenNames?: string[] } = {}): GroundingReport {
  const allowed = new Set(extractNumericClaims(source).map((c) => c.key));
  const claims = texts.flatMap((t) => extractNumericClaims(t));
  const ungrounded = [...new Set(claims.filter((c) => !allowed.has(c.key)).map((c) => c.key))];
  const joined = texts.join("\n");
  const forbiddenMentions = (opts.forbiddenNames ?? []).filter((n) => n && joined.includes(n));
  return { ok: ungrounded.length === 0 && forbiddenMentions.length === 0, claims: claims.length, ungrounded, forbiddenMentions };
}
