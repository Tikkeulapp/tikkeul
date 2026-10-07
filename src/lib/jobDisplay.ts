/**
 * 채용공고 카드 표시용 정규화 (순수 함수).
 * 소스(잡알리오·고용24·기업 API)마다 경력·학력 표기와 본문 형식이 제각각이라,
 * 카드는 항상 같은 폼(경력 5종 · 학력 4종 · 주요업무/지원자격 각 1줄)으로 보여준다.
 * LLM 정규화(services/normalizeJobs)가 아직 안 돈 공고도 이 코드 경로로 균일하게 표시된다.
 */

/** LLM 정규화가 "원문에 해당 정보 없음"으로 판정했을 때 저장하는 센티널 —
 *  null로 두면 매 실행마다 다시 정규화 대상으로 뽑혀 같은 공고에 LLM을 반복 호출하게 된다. */
export const NO_INFO = "정보 없음";

export type CareerBucket = "신입" | "경력" | "신입·경력" | "인턴" | "경력무관";
export type EducationBucket = "학력무관" | "고졸 이상" | "대졸 이상" | "석·박사";

export function normalizeCareer(raw: string | null | undefined): CareerBucket | null {
  const t = (raw ?? "").replace(/\s/g, "");
  if (!t) return null;
  if (/무관|제한없음/.test(t)) return "경력무관";
  const hasNew = /신입/.test(t);
  const hasExp = /경력/.test(t);
  if (hasNew && hasExp) return "신입·경력";
  if (hasNew) return "신입"; // "신입·인턴"도 신입 공고로 본다
  if (hasExp) return "경력";
  if (/인턴/.test(t)) return "인턴";
  return null; // 직군명 등 경력이 아닌 값
}

export function normalizeEducation(raw: string | null | undefined): EducationBucket | null {
  const t = (raw ?? "").replace(/\s/g, "");
  if (!t) return null;
  if (/무관|제한없음/.test(t)) return "학력무관"; // "학력무관, 고졸"처럼 무관이 섞이면 무관
  if (/고졸|고등학교/.test(t)) return "고졸 이상"; // 고졸 포함이면 하한이 고졸
  if (/대졸|학사|대학교|전문대|초대졸/.test(t)) return "대졸 이상";
  if (/석사|박사/.test(t)) return "석·박사";
  return null;
}

/** 불릿·머리기호·대괄호 머리말을 걷어내고 공백을 정리한다 */
function cleanText(raw: string): string {
  return raw
    .replace(/\[[^\]]{0,20}\]/g, " ") // [일반직] 같은 머리말
    .replace(/[○●□■▶▷◆◇■※•·]\s*/g, (m) => (m.trim() === "·" ? " · " : " ")) // 불릿 (가운뎃점은 구분자로 유지)
    .replace(/(^|\s)[-–—]\s+/g, " · ") // " - " 구분자 → 가운뎃점
    .replace(/(^|\s)\d+[.)]\s+/g, " ") // "1. " 번호 매김
    .replace(/\s+/g, " ")
    .replace(/^\s*[·,]\s*/, "")
    .trim();
}

/** 원문을 한 줄(max자 이내)로 압축 — 절 경계(· , / ;)에서 자르고 말줄임을 붙인다 */
export function condenseLine(raw: string | null | undefined, max = 70): string | null {
  if (!raw) return null;
  const t = cleanText(raw);
  if (!t || t === NO_INFO) return null;
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  // 절 경계 후보 중 가장 뒤쪽(최소 max의 절반 이상 위치)
  let cut = -1;
  for (const sep of [" · ", ", ", " / ", "; ", ". ", " "]) {
    const i = head.lastIndexOf(sep);
    if (i >= Math.floor(max * 0.5) && i > cut) cut = i;
  }
  const body = (cut > 0 ? head.slice(0, cut) : head).replace(/[\s·,/;.]+$/, "");
  return `${body}…`;
}
