/**
 * 취준 시험 공식 일정 (2026년 하반기) — 각 주관기관 공지에서 직접 확인해 옮긴 값.
 * 규칙으로 추정하지 않는다. 회차가 없는 시험은 sessions를 비워두고 화면에서 "공식 일정 확인"으로 안내한다.
 * 갱신: 주관기관 공지가 바뀌면 이 파일만 수정. 각 항목에 출처·확인일을 남긴다.
 */
export type ExamSession = {
  round?: string; // 회차
  examDate: string; // YYYY-MM-DD
  regStart: string | null; // 정기접수 시작
  regEnd: string; // 정기접수 마감 (알림 기준)
  lateRegEnd?: string | null; // 특별·추가접수 마감
  resultDate?: string | null;
  note?: string;
};

export type ExamSchedule = {
  /** exam_fees.ts의 name과 동일 키 */
  exam: string;
  source: string; // 출처 URL
  sourceLabel: string;
  checkedAt: string; // 확인일
  sessions: ExamSession[];
};

export const EXAM_SCHEDULES: ExamSchedule[] = [
  {
    exam: "TOEIC",
    source: "https://www.toeicstory.co.kr/2523",
    sourceLabel: "한국TOEIC위원회 토익스토리 — 2026년 토익 시험 일정 발표",
    checkedAt: "2026-09-05",
    sessions: [
      { round: "제579회", examDate: "2026-09-20", regStart: "2026-08-03", regEnd: "2026-09-07", lateRegEnd: "2026-09-17", resultDate: "2026-09-29" },
      { round: "제580회", examDate: "2026-10-11", regStart: "2026-08-24", regEnd: "2026-09-28", lateRegEnd: "2026-10-07", resultDate: "2026-10-20" },
      { round: "제581회", examDate: "2026-10-31", regStart: "2026-09-14", regEnd: "2026-10-19", lateRegEnd: "2026-10-28", resultDate: "2026-11-10" },
      { round: "제582회", examDate: "2026-11-15", regStart: "2026-09-28", regEnd: "2026-11-02", lateRegEnd: "2026-11-12", resultDate: "2026-11-24" },
      { round: "제583회", examDate: "2026-11-29", regStart: "2026-10-12", regEnd: "2026-11-16", lateRegEnd: "2026-11-26", resultDate: "2026-12-08" },
      { round: "제584회", examDate: "2026-12-13", regStart: "2026-10-26", regEnd: "2026-11-30", lateRegEnd: "2026-12-10", resultDate: "2026-12-22" },
      { round: "제585회", examDate: "2026-12-27", regStart: "2026-11-09", regEnd: "2026-12-14", lateRegEnd: "2026-12-23", resultDate: "2027-01-06" },
    ],
  },
  {
    exam: "TOEIC Speaking",
    source: "https://www.toeicswt.co.kr",
    sourceLabel: "YBM 토익스피킹 (일정 정리: 링커리어 2026 토익스피킹 일정)",
    checkedAt: "2026-09-05",
    sessions: [
      { examDate: "2026-09-05", regStart: "2026-08-03", regEnd: "2026-09-02" }, { examDate: "2026-09-06", regStart: "2026-08-03", regEnd: "2026-09-03" },
      { examDate: "2026-09-12", regStart: "2026-08-10", regEnd: "2026-09-09" }, { examDate: "2026-09-13", regStart: "2026-08-10", regEnd: "2026-09-10" },
      { examDate: "2026-09-19", regStart: "2026-08-17", regEnd: "2026-09-16" }, { examDate: "2026-09-20", regStart: "2026-08-17", regEnd: "2026-09-17" },
      { examDate: "2026-09-26", regStart: "2026-08-24", regEnd: "2026-09-23" }, { examDate: "2026-09-27", regStart: "2026-08-24", regEnd: "2026-09-24" },
      { examDate: "2026-10-03", regStart: "2026-08-31", regEnd: "2026-09-30" }, { examDate: "2026-10-04", regStart: "2026-08-31", regEnd: "2026-10-01" },
      { examDate: "2026-10-10", regStart: "2026-09-07", regEnd: "2026-10-07" }, { examDate: "2026-10-11", regStart: "2026-09-07", regEnd: "2026-10-08" },
      { examDate: "2026-10-17", regStart: "2026-09-14", regEnd: "2026-10-14" }, { examDate: "2026-10-18", regStart: "2026-09-14", regEnd: "2026-10-15" },
      { examDate: "2026-10-24", regStart: "2026-09-21", regEnd: "2026-10-21" }, { examDate: "2026-10-25", regStart: "2026-09-21", regEnd: "2026-10-22" },
      { examDate: "2026-10-31", regStart: "2026-09-28", regEnd: "2026-10-28" }, { examDate: "2026-11-01", regStart: "2026-09-28", regEnd: "2026-10-29" },
      { examDate: "2026-11-07", regStart: "2026-10-05", regEnd: "2026-11-04" }, { examDate: "2026-11-08", regStart: "2026-10-05", regEnd: "2026-11-05" },
      { examDate: "2026-11-14", regStart: "2026-10-12", regEnd: "2026-11-11" }, { examDate: "2026-11-15", regStart: "2026-10-12", regEnd: "2026-11-12" },
      { examDate: "2026-11-21", regStart: "2026-10-19", regEnd: "2026-11-18" }, { examDate: "2026-11-22", regStart: "2026-10-19", regEnd: "2026-11-19" },
      { examDate: "2026-11-28", regStart: "2026-10-26", regEnd: "2026-11-25" }, { examDate: "2026-11-29", regStart: "2026-10-26", regEnd: "2026-11-26" },
      { examDate: "2026-12-05", regStart: "2026-11-02", regEnd: "2026-12-02" }, { examDate: "2026-12-06", regStart: "2026-11-02", regEnd: "2026-12-03" },
      { examDate: "2026-12-12", regStart: "2026-11-09", regEnd: "2026-12-09" }, { examDate: "2026-12-13", regStart: "2026-11-09", regEnd: "2026-12-10" },
      { examDate: "2026-12-19", regStart: "2026-11-16", regEnd: "2026-12-16" }, { examDate: "2026-12-20", regStart: "2026-11-16", regEnd: "2026-12-17" },
      { examDate: "2026-12-26", regStart: "2026-11-23", regEnd: "2026-12-23" }, { examDate: "2026-12-27", regStart: "2026-11-23", regEnd: "2026-12-24" },
    ],
  },
  {
    exam: "SQLD",
    source: "https://www.dataq.or.kr/www/accept/schedule.do",
    sourceLabel: "한국데이터산업진흥원 데이터자격검정 2026 시험일정",
    checkedAt: "2026-09-05",
    sessions: [
      { round: "제62회", examDate: "2026-08-22", regStart: "2026-07-20", regEnd: "2026-07-24", resultDate: "2026-09-11" },
      { round: "제63회", examDate: "2026-11-14", regStart: "2026-10-12", regEnd: "2026-10-16", resultDate: "2026-12-04" },
    ],
  },
  {
    exam: "ADsP",
    source: "https://www.dataq.or.kr/www/accept/schedule.do",
    sourceLabel: "한국데이터산업진흥원 데이터자격검정 2026 시험일정",
    checkedAt: "2026-09-05",
    sessions: [
      { round: "제50회", examDate: "2026-08-08", regStart: "2026-07-06", regEnd: "2026-07-10", resultDate: "2026-08-28" },
      { round: "제51회", examDate: "2026-10-31", regStart: "2026-09-28", regEnd: "2026-10-02", resultDate: "2026-11-20" },
    ],
  },
  {
    exam: "정보처리기사",
    source: "https://www.q-net.or.kr",
    sourceLabel: "한국산업인력공단 큐넷 2026 국가기술자격 시행일정 (정기 3회)",
    checkedAt: "2026-09-05",
    sessions: [
      { round: "정기 3회 필기", examDate: "2026-08-07", regStart: "2026-07-20", regEnd: "2026-07-23", resultDate: "2026-09-09", note: "필기시험 8.7~9.1 기간 중 선택" },
      { round: "정기 3회 실기", examDate: "2026-10-24", regStart: "2026-09-21", regEnd: "2026-09-28", resultDate: "2026-12-11", note: "실기시험 10.24~11.13 기간 중 선택" },
    ],
  },
  {
    exam: "한국사능력검정시험",
    source: "https://m.historyexam.go.kr/main/examSchedule.do",
    sourceLabel: "국사편찬위원회 한국사능력검정시험 시험일정",
    checkedAt: "2026-09-05",
    sessions: [
      { round: "제80회 (심화)", examDate: "2026-10-17", regStart: "2026-09-15", regEnd: "2026-09-22", lateRegEnd: "2026-10-02", note: "접수는 지역별 단계적 진행, 추가접수는 취소좌석 대상" },
    ],
  },
  {
    exam: "JLPT",
    source: "https://www.bsjlpt.or.kr/web/guide/exam_explanation.html",
    sourceLabel: "JLPT 영남 전용사이트(공식 시행기관) — 2026 제2회 시험 안내",
    checkedAt: "2026-09-05",
    sessions: [{ round: "2026 제2회", examDate: "2026-12-06", regStart: "2026-09-01", regEnd: "2026-09-20", note: "접수 9/1~9/20 24:00, 온라인·방문 접수 — 인기 고사장은 조기 마감" }],
  },
  // 상시 시험 (회차 개념 없음): OPIc, 컴퓨터활용능력 — sessions 없이 exam_fees.ts의 regNote로 안내
  { exam: "TEPS", source: "https://www.teps.or.kr/receiption/examschedule", sourceLabel: "TEPS관리위원회 정기시험 일정", checkedAt: "2026-09-05", sessions: [] },
  { exam: "HSK", source: "https://www.hsk.or.kr", sourceLabel: "HSK 한국사무국", checkedAt: "2026-09-05", sessions: [] },
  { exam: "GTQ", source: "https://license.kpc.or.kr", sourceLabel: "한국생산성본부 자격인증", checkedAt: "2026-09-05", sessions: [] },
];

const dayDiff = (a: string, b: string) => Math.round((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86400000);

export type ExamSessionMatch = {
  schedule: ExamSchedule;
  session: ExamSession | null;
  /** exact: 일정 날짜 = 공식 시험일 / nearest: 일정 날짜 전후 가장 가까운 공식 회차 / none: 회차 정보 없음 */
  kind: "exact" | "nearest" | "none";
};

/** 일정 날짜에 해당하는 공식 회차를 찾는다. 같은 날이 없으면 앞뒤 30일 안에서 가장 가까운 회차 */
export function findExamSession(examName: string, eventDate: string): ExamSessionMatch | null {
  const schedule = EXAM_SCHEDULES.find((s) => s.exam === examName);
  if (!schedule) return null;
  if (!schedule.sessions.length) return { schedule, session: null, kind: "none" };
  const exact = schedule.sessions.find((s) => s.examDate === eventDate);
  if (exact) return { schedule, session: exact, kind: "exact" };
  const nearest = [...schedule.sessions]
    .map((s) => ({ s, d: Math.abs(dayDiff(s.examDate, eventDate)) }))
    .filter((x) => x.d <= 30)
    .sort((a, b) => a.d - b.d)[0];
  return nearest ? { schedule, session: nearest.s, kind: "nearest" } : { schedule, session: null, kind: "none" };
}
