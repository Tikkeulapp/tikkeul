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
  /** 접수 방식 설명 (공식 회차 일정은 exam_schedules.ts) */
  regNote: string;
  /** 공식 시험 일정·접수 페이지 */
  scheduleUrl: string;
};

export const EXAM_FEES: ExamFee[] = [
  { name: "TOEIC", pattern: /토익(?!\s*스피킹)|toeic(?!\s*speaking)/i, feeKrw: 52500, org: "YBM 한국TOEIC위원회", note: "정기접수 기준", regNote: "정기접수 마감 후 특별추가접수(추가 요금) 기간이 별도로 있음", scheduleUrl: "https://exam.toeic.co.kr/receipt/examSchList.php" },
  { name: "TOEIC Speaking", pattern: /토익\s*스피킹|토스|toeic\s*speaking/i, feeKrw: 84000, org: "YBM", regNote: "매주 토·일 시행, 회차별 접수 마감 상이", scheduleUrl: "https://www.toeicswt.co.kr" },
  { name: "OPIc", pattern: /오픽|opic/i, feeKrw: 84000, org: "ACTFL·크레듀", regNote: "상시 시험, 시험일 3일 전까지 접수", scheduleUrl: "https://www.opic.or.kr" },
  { name: "TEPS", pattern: /텝스|teps/i, feeKrw: 46000, org: "서울대 TEPS관리위원회", regNote: "연 20회 정기시험, 회차별 정기접수 기간 상이", scheduleUrl: "https://www.teps.or.kr" },
  { name: "SQLD", pattern: /sqld/i, feeKrw: 50000, org: "한국데이터산업진흥원", regNote: "접수기간이 5일로 짧음", scheduleUrl: "https://www.dataq.or.kr" },
  { name: "ADsP", pattern: /adsp/i, feeKrw: 50000, org: "한국데이터산업진흥원", regNote: "접수기간이 5일로 짧음", scheduleUrl: "https://www.dataq.or.kr" },
  { name: "정보처리기사", pattern: /정보처리기사/, feeKrw: 19400, org: "한국산업인력공단", note: "필기 기준 (실기 22,600원)", regNote: "큐넷 원서접수, 첫날 10시 시작·마지막 날 18시 마감", scheduleUrl: "https://www.q-net.or.kr" },
  { name: "컴퓨터활용능력", pattern: /컴활|컴퓨터활용능력/, feeKrw: 20500, org: "대한상공회의소", note: "1급 필기 기준 (실기 25,000원)", regNote: "상시 시험, 시험일 4일 전까지 접수", scheduleUrl: "https://license.korcham.net" },
  { name: "한국사능력검정시험", pattern: /한국사/, feeKrw: 27000, org: "국사편찬위원회", note: "심화 기준", regNote: "접수는 지역별 단계적 진행", scheduleUrl: "https://www.historyexam.go.kr" },
  { name: "JLPT", pattern: /jlpt|일본어능력/i, feeKrw: 60000, org: "JLPT 한국사무국", note: "N1~N2 기준", regNote: "연 2회(7월·12월), 온라인 선착순 접수", scheduleUrl: "https://www.jlpt.or.kr" },
  { name: "HSK", pattern: /hsk/i, feeKrw: 80000, org: "HSK 한국사무국", note: "5급 기준(급수별 상이)", regNote: "매월 시행, 회차별 접수 마감 상이", scheduleUrl: "https://www.hsk.or.kr" },
  { name: "GTQ", pattern: /gtq/i, feeKrw: 33000, org: "한국생산성본부", note: "1급 기준", regNote: "회차별 접수 기간 상이", scheduleUrl: "https://license.kpc.or.kr" },
];

/** 일정 제목에서 시험을 인식해 참고 응시료·접수 규칙을 돌려준다 */
export function examFeeFor(title: string | null | undefined): ExamFee | null {
  if (!title) return null;
  return EXAM_FEES.find((e) => e.pattern.test(title)) ?? null;
}
