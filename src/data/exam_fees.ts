/**
 * 취준 시험 응시료·접수 규칙 참고값 — 응시료 지원 정책의 절약액 추정과 접수 마감(추정) 알림에 쓴다.
 * 출처: 각 시험 주관기관 공시 응시료(2025년 정기접수 기준, 원). 변동 가능 → 화면에 '참고' 표기.
 */
export type ExamFee = {
  name: string;
  pattern: RegExp;
  feeKrw: number;
  org: string;
  note?: string;
  /** 정기접수 마감이 시험일보다 며칠 앞서는지(통상 규칙, 추정). null = 상시 접수 */
  regDeadlineDaysBefore: number | null;
  /** 접수 규칙 설명 */
  regNote: string;
  /** 공식 시험 일정·접수 페이지 */
  scheduleUrl: string;
};

export const EXAM_FEES: ExamFee[] = [
  { name: "TOEIC", pattern: /토익(?!\s*스피킹)|toeic(?!\s*speaking)/i, feeKrw: 52500, org: "YBM 한국TOEIC위원회", note: "정기접수 기준", regDeadlineDaysBefore: 12, regNote: "정기접수는 시험일 약 2주 전 마감, 특별추가접수는 약 1주 전(추가 요금)", scheduleUrl: "https://exam.toeic.co.kr/receipt/examSchList.php" },
  { name: "TOEIC Speaking", pattern: /토익\s*스피킹|토스|toeic\s*speaking/i, feeKrw: 84000, org: "YBM", regDeadlineDaysBefore: 4, regNote: "시험일 약 4일 전 접수 마감(회차별 상이)", scheduleUrl: "https://www.toeicswt.co.kr" },
  { name: "OPIc", pattern: /오픽|opic/i, feeKrw: 84000, org: "ACTFL·크레듀", regDeadlineDaysBefore: 3, regNote: "상시 시험, 시험일 3일 전까지 접수", scheduleUrl: "https://www.opic.or.kr" },
  { name: "TEPS", pattern: /텝스|teps/i, feeKrw: 46000, org: "서울대 TEPS관리위원회", regDeadlineDaysBefore: 20, regNote: "정기접수 시험일 약 3주 전 마감", scheduleUrl: "https://www.teps.or.kr" },
  { name: "SQLD", pattern: /sqld/i, feeKrw: 50000, org: "한국데이터산업진흥원", regDeadlineDaysBefore: 25, regNote: "접수기간이 시험일 약 5~4주 전(짧게 열림)", scheduleUrl: "https://www.dataq.or.kr" },
  { name: "ADsP", pattern: /adsp/i, feeKrw: 50000, org: "한국데이터산업진흥원", regDeadlineDaysBefore: 25, regNote: "접수기간이 시험일 약 5~4주 전(짧게 열림)", scheduleUrl: "https://www.dataq.or.kr" },
  { name: "정보처리기사", pattern: /정보처리기사/, feeKrw: 19400, org: "한국산업인력공단", note: "필기 기준 (실기 22,600원)", regDeadlineDaysBefore: 28, regNote: "큐넷 원서접수 시험일 약 4주 전 마감", scheduleUrl: "https://www.q-net.or.kr" },
  { name: "컴퓨터활용능력", pattern: /컴활|컴퓨터활용능력/, feeKrw: 20500, org: "대한상공회의소", note: "1급 필기 기준 (실기 25,000원)", regDeadlineDaysBefore: 4, regNote: "상시 시험, 시험일 4일 전까지 접수", scheduleUrl: "https://license.korcham.net" },
  { name: "한국사능력검정시험", pattern: /한국사/, feeKrw: 27000, org: "국사편찬위원회", note: "심화 기준", regDeadlineDaysBefore: 28, regNote: "접수기간 시험일 약 4주 전 마감", scheduleUrl: "https://www.historyexam.go.kr" },
  { name: "JLPT", pattern: /jlpt|일본어능력/i, feeKrw: 60000, org: "JLPT 한국사무국", note: "N1~N2 기준", regDeadlineDaysBefore: 75, regNote: "연 2회, 시험일 약 2~3개월 전 접수 마감", scheduleUrl: "https://www.jlpt.or.kr" },
  { name: "HSK", pattern: /hsk/i, feeKrw: 80000, org: "HSK 한국사무국", note: "5급 기준(급수별 상이)", regDeadlineDaysBefore: 28, regNote: "시험일 약 4주 전 접수 마감", scheduleUrl: "https://www.hsk.or.kr" },
  { name: "GTQ", pattern: /gtq/i, feeKrw: 33000, org: "한국생산성본부", note: "1급 기준", regDeadlineDaysBefore: 21, regNote: "접수기간 시험일 약 3주 전 마감", scheduleUrl: "https://license.kpc.or.kr" },
];

/** 시험일(YYYY-MM-DD) → 추정 접수 마감일. 상시 접수면 null */
export function estimateRegDeadline(examDate: string, info: ExamFee): string | null {
  if (info.regDeadlineDaysBefore === null) return null;
  const [y, m, d] = examDate.split("-").map(Number);
  const t = new Date(y, m - 1, d - info.regDeadlineDaysBefore);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** 일정 제목에서 시험을 인식해 참고 응시료·접수 규칙을 돌려준다 */
export function examFeeFor(title: string | null | undefined): ExamFee | null {
  if (!title) return null;
  return EXAM_FEES.find((e) => e.pattern.test(title)) ?? null;
}
