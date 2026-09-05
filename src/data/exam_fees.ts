/**
 * 취준 시험 응시료 참고값 — 마이티끌에 "시험 + 응시료 지원 정책"을 담을 때 절약액 추정에 쓴다.
 * 출처: 각 시험 주관기관 공시 응시료(2025년 정기접수 기준, 원). 변동 가능 → 화면에 '참고' 표기.
 */
export type ExamFee = { name: string; pattern: RegExp; feeKrw: number; org: string; note?: string };

export const EXAM_FEES: ExamFee[] = [
  { name: "TOEIC", pattern: /토익(?!\s*스피킹)|toeic(?!\s*speaking)/i, feeKrw: 52500, org: "YBM 한국TOEIC위원회", note: "정기접수 기준" },
  { name: "TOEIC Speaking", pattern: /토익\s*스피킹|토스|toeic\s*speaking/i, feeKrw: 84000, org: "YBM" },
  { name: "OPIc", pattern: /오픽|opic/i, feeKrw: 84000, org: "ACTFL·크레듀" },
  { name: "TEPS", pattern: /텝스|teps/i, feeKrw: 46000, org: "서울대 TEPS관리위원회" },
  { name: "SQLD", pattern: /sqld/i, feeKrw: 50000, org: "한국데이터산업진흥원" },
  { name: "ADsP", pattern: /adsp/i, feeKrw: 50000, org: "한국데이터산업진흥원" },
  { name: "정보처리기사", pattern: /정보처리기사/, feeKrw: 19400, org: "한국산업인력공단", note: "필기 기준 (실기 22,600원)" },
  { name: "컴퓨터활용능력", pattern: /컴활|컴퓨터활용능력/, feeKrw: 20500, org: "대한상공회의소", note: "1급 필기 기준 (실기 25,000원)" },
  { name: "한국사능력검정시험", pattern: /한국사/, feeKrw: 27000, org: "국사편찬위원회", note: "심화 기준" },
  { name: "JLPT", pattern: /jlpt|일본어능력/i, feeKrw: 60000, org: "JLPT 한국사무국", note: "N1~N2 기준" },
  { name: "HSK", pattern: /hsk/i, feeKrw: 80000, org: "HSK 한국사무국", note: "5급 기준(급수별 상이)" },
  { name: "GTQ", pattern: /gtq/i, feeKrw: 33000, org: "한국생산성본부", note: "1급 기준" },
];

/** 일정 제목에서 시험을 인식해 참고 응시료를 돌려준다 */
export function examFeeFor(title: string | null | undefined): ExamFee | null {
  if (!title) return null;
  return EXAM_FEES.find((e) => e.pattern.test(title)) ?? null;
}
