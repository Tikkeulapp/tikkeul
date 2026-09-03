/**
 * 페르소나 = 실서비스와 동일한 프로필 스키마의 미리 채워진 인스턴스.
 * - declared: 마이데이터로 알 수 없는 정보 (실서비스에서는 설문 → DB)
 * - mydata:   마이데이터 표준 규격을 따른 mock 스냅샷 (실서비스에서는 API 연동)
 * 소득·월세·수급 등은 여기 직접 적지 않는다 — mydata에서 derive.ts가 계산한다.
 */

export type Declared = {
  birthDate: string;
  gender: "여성" | "남성";
  /** 군필 여부 — 일부 정책은 복무기간만큼 나이 상한 연장 */
  military: { served: boolean; months: number } | null;
  region: { sido: string; sigungu: string; since: string };
  education: {
    status: "재학" | "휴학" | "졸업유예" | "졸업";
    major: string;
    graduatedAt: string | null;
  };
  targetJob: string;
  household: {
    livingWithParents: boolean;
    size: number;
    housing: "본가" | "월세" | "전세";
    depositKrw: number | null;
  };
  /** 가구 중위소득 구간 — 모르면 null ("추가 확인 필요"로 안내) */
  incomeBracket: "~60%" | "60~100%" | "100~150%" | "150%~" | null;
  assetBracket: "2억 미만" | "2~4억" | "4억 초과" | null;
  /** 과거 수급 이력 — 중복·재참여 배제 판정용 */
  benefitHistory: string[];
  certificates: string[];
};

export type Transaction = {
  date: string; // YYYY-MM-DD
  description: string;
  amountKrw: number;
  direction: "IN" | "OUT";
};

export type MyDataSnapshot = {
  asOf: string;
  accounts: {
    accountId: string;
    org: string;
    type: "수시입출금" | "적금" | "예금" | "CMA";
    balanceKrw: number;
  }[];
  transactions: Transaction[];
};

export type SeedEvent = {
  date: string;
  title: string;
  location?: string;
};

export type Persona = {
  id: "minji" | "junho" | "seoyeon";
  name: string;
  emoji: string;
  /** 선택 카드에 보여줄 한 줄 */
  intro: string;
  tagline: string;
  declared: Declared;
  mydata: MyDataSnapshot;
  seedEvents: SeedEvent[];
};

const AS_OF = "2026-09-03";

/* ─────────────────────────────────────────────
 * 페르소나 1 — 김민지 (24) "시험이 몰린 달"
 * 매칭 축: 응시료(중랑구)·정장대여·내일배움카드·청년수당
 * ───────────────────────────────────────────── */
const minji: Persona = {
  id: "minji",
  name: "김민지",
  emoji: "🎯",
  intro: "올해 2월 졸업, 데이터분석 준비 중. 이번 달에만 시험 2개, 면접 2개.",
  tagline: "시험이 몰린 달",
  declared: {
    birthDate: "2002-03-14",
    gender: "여성",
    military: null,
    region: { sido: "서울특별시", sigungu: "중랑구", since: "2023-06-01" },
    education: { status: "졸업", major: "통계학", graduatedAt: "2026-02-20" },
    targetJob: "데이터 분석",
    household: { livingWithParents: true, size: 3, housing: "본가", depositKrw: null },
    incomeBracket: "100~150%",
    assetBracket: "2~4억",
    benefitHistory: [],
    certificates: ["컴퓨터활용능력 1급"],
  },
  mydata: {
    asOf: AS_OF,
    accounts: [
      { accountId: "MINJI_CHK", org: "K은행", type: "수시입출금", balanceKrw: 1830000 },
      { accountId: "MINJI_SAV", org: "K은행", type: "적금", balanceKrw: 3000000 },
    ],
    transactions: [
      // 알바 소득 (정기 입금 → 도출: 월 평균 ~50만)
      { date: "2026-06-25", description: "카페 아르바이트 급여", amountKrw: 480000, direction: "IN" },
      { date: "2026-07-25", description: "카페 아르바이트 급여", amountKrw: 510000, direction: "IN" },
      { date: "2026-08-25", description: "카페 아르바이트 급여", amountKrw: 520000, direction: "IN" },
      // 정기 지출
      { date: "2026-06-15", description: "통신비 자동납부", amountKrw: 55000, direction: "OUT" },
      { date: "2026-07-15", description: "통신비 자동납부", amountKrw: 55000, direction: "OUT" },
      { date: "2026-08-15", description: "통신비 자동납부", amountKrw: 55000, direction: "OUT" },
      { date: "2026-06-26", description: "적금 자동이체", amountKrw: 100000, direction: "OUT" },
      { date: "2026-07-26", description: "적금 자동이체", amountKrw: 100000, direction: "OUT" },
      { date: "2026-08-26", description: "적금 자동이체", amountKrw: 100000, direction: "OUT" },
      // 취준 지출 (도출: 취준 비용 감지)
      { date: "2026-08-08", description: "토익 응시료", amountKrw: 52000, direction: "OUT" },
      { date: "2026-08-20", description: "SQLD 응시료", amountKrw: 50000, direction: "OUT" },
      { date: "2026-08-12", description: "스튜디오 증명사진 촬영", amountKrw: 20000, direction: "OUT" },
      { date: "2026-08-28", description: "온라인 데이터분석 강의 결제", amountKrw: 89000, direction: "OUT" },
      { date: "2026-08-05", description: "스터디카페", amountKrw: 6500, direction: "OUT" },
      { date: "2026-08-19", description: "스터디카페", amountKrw: 7000, direction: "OUT" },
      // 생활 지출
      { date: "2026-08-03", description: "교통카드 충전", amountKrw: 60000, direction: "OUT" },
      { date: "2026-08-14", description: "배달앱 결제", amountKrw: 27400, direction: "OUT" },
      { date: "2026-08-22", description: "편의점", amountKrw: 12800, direction: "OUT" },
    ],
  },
  seedEvents: [
    { date: "2026-09-05", title: "토익 시험", location: "서울" },
    { date: "2026-09-13", title: "SQLD 시험", location: "서울" },
    { date: "2026-09-18", title: "A기업 면접", location: "서울 강남" },
    { date: "2026-09-23", title: "B기업 면접", location: "서울 마포" },
    { date: "2026-10-06", title: "Python 데이터분석 강의 시작" },
  ],
};

/* ─────────────────────────────────────────────
 * 페르소나 2 — 박준호 (27) "면접 러시, 왕복 4시간"
 * 매칭 축: 면접수당(경기)·광역 구직활동비·국취제 I유형·정장대여
 * ───────────────────────────────────────────── */
const junho: Persona = {
  id: "junho",
  name: "박준호",
  emoji: "🚄",
  intro: "미취업 14개월째, 품질관리 직무. 이번 달 면접 3곳 — 한 곳은 충남 아산.",
  tagline: "면접 러시, 왕복 4시간",
  declared: {
    birthDate: "1999-07-02",
    gender: "남성",
    military: { served: true, months: 18 },
    region: { sido: "경기도", sigungu: "수원시", since: "2021-03-01" },
    education: { status: "졸업", major: "기계공학", graduatedAt: "2024-08-20" },
    targetJob: "품질·생산관리",
    household: { livingWithParents: false, size: 1, housing: "월세", depositKrw: 5000000 },
    incomeBracket: "~60%",
    assetBracket: "2억 미만",
    benefitHistory: [],
    certificates: ["품질경영기사"],
  },
  mydata: {
    asOf: AS_OF,
    accounts: [{ accountId: "JUNHO_CHK", org: "N은행", type: "수시입출금", balanceKrw: 920000 }],
    transactions: [
      // 근로 소득 없음 — 가족 지원으로 생활 (도출: 미취업 추정)
      { date: "2026-06-05", description: "가족 생활비 이체", amountKrw: 500000, direction: "IN" },
      { date: "2026-07-05", description: "가족 생활비 이체", amountKrw: 500000, direction: "IN" },
      { date: "2026-08-05", description: "가족 생활비 이체", amountKrw: 500000, direction: "IN" },
      // 월세 (정기이체 → 도출: 월세 45만)
      { date: "2026-06-01", description: "월세 이체", amountKrw: 450000, direction: "OUT" },
      { date: "2026-07-01", description: "월세 이체", amountKrw: 450000, direction: "OUT" },
      { date: "2026-08-01", description: "월세 이체", amountKrw: 450000, direction: "OUT" },
      // 정기 지출
      { date: "2026-06-20", description: "통신비 자동납부", amountKrw: 49000, direction: "OUT" },
      { date: "2026-07-20", description: "통신비 자동납부", amountKrw: 49000, direction: "OUT" },
      { date: "2026-08-20", description: "통신비 자동납부", amountKrw: 49000, direction: "OUT" },
      // 취준 지출 — 면접 이동이 많다
      { date: "2026-07-18", description: "고속버스 승차권", amountKrw: 24000, direction: "OUT" },
      { date: "2026-07-30", description: "KTX 승차권", amountKrw: 47000, direction: "OUT" },
      { date: "2026-08-11", description: "스튜디오 증명사진 촬영", amountKrw: 25000, direction: "OUT" },
      { date: "2026-08-18", description: "자기소개서 첨삭 결제", amountKrw: 30000, direction: "OUT" },
      { date: "2026-08-27", description: "고속버스 승차권", amountKrw: 24000, direction: "OUT" },
      // 생활 지출
      { date: "2026-08-07", description: "마트 장보기", amountKrw: 43200, direction: "OUT" },
      { date: "2026-08-16", description: "편의점", amountKrw: 9800, direction: "OUT" },
      { date: "2026-08-24", description: "배달앱 결제", amountKrw: 18900, direction: "OUT" },
    ],
  },
  seedEvents: [
    { date: "2026-09-09", title: "면접 스터디", location: "수원" },
    { date: "2026-09-10", title: "C기업 면접", location: "서울 구로" },
    { date: "2026-09-16", title: "D기업 면접", location: "충남 아산" },
    { date: "2026-09-24", title: "E기업 2차 면접", location: "서울 강서" },
  ],
};

/* ─────────────────────────────────────────────
 * 페르소나 3 — 이서연 (29) "퇴사 후 직무 전환"
 * 매칭 축: 내일배움카드·청년월세지원·국취제 연계(수급 종료 후)
 * ───────────────────────────────────────────── */
const seoyeon: Persona = {
  id: "seoyeon",
  name: "이서연",
  emoji: "🔄",
  intro: "마케팅 2년 하고 퇴사, UX로 전환 중. 구직급여가 11월이면 끝난다.",
  tagline: "퇴사 후 직무 전환",
  declared: {
    birthDate: "1997-11-20",
    gender: "여성",
    military: null,
    region: { sido: "서울특별시", sigungu: "관악구", since: "2022-04-01" },
    education: { status: "졸업", major: "시각디자인", graduatedAt: "2022-02-18" },
    targetJob: "UX 디자인",
    household: { livingWithParents: false, size: 1, housing: "월세", depositKrw: 10000000 },
    incomeBracket: "60~100%",
    assetBracket: "2억 미만",
    benefitHistory: [],
    certificates: [],
  },
  mydata: {
    asOf: AS_OF,
    accounts: [
      { accountId: "SEOYEON_CHK", org: "S은행", type: "수시입출금", balanceKrw: 4200000 },
      { accountId: "SEOYEON_DEP", org: "S은행", type: "예금", balanceKrw: 6000000 },
    ],
    transactions: [
      // 구직급여 (수당 입금 → 도출: 수급 중 + 종료 추정)
      { date: "2026-07-10", description: "고용노동부 구직급여", amountKrw: 1800000, direction: "IN" },
      { date: "2026-08-10", description: "고용노동부 구직급여", amountKrw: 1800000, direction: "IN" },
      // 마지막 급여 (6월 퇴사 흔적 → 도출: 고용보험 이력 추정)
      { date: "2026-06-25", description: "(주)마케팅컴퍼니 급여", amountKrw: 2350000, direction: "IN" },
      // 월세 (도출: 월세 55만)
      { date: "2026-06-05", description: "월세 이체", amountKrw: 550000, direction: "OUT" },
      { date: "2026-07-05", description: "월세 이체", amountKrw: 550000, direction: "OUT" },
      { date: "2026-08-05", description: "월세 이체", amountKrw: 550000, direction: "OUT" },
      // 정기 지출
      { date: "2026-06-20", description: "실손보험료 자동납부", amountKrw: 89000, direction: "OUT" },
      { date: "2026-07-20", description: "실손보험료 자동납부", amountKrw: 89000, direction: "OUT" },
      { date: "2026-08-20", description: "실손보험료 자동납부", amountKrw: 89000, direction: "OUT" },
      { date: "2026-06-15", description: "통신비 자동납부", amountKrw: 69000, direction: "OUT" },
      { date: "2026-07-15", description: "통신비 자동납부", amountKrw: 69000, direction: "OUT" },
      { date: "2026-08-15", description: "통신비 자동납부", amountKrw: 69000, direction: "OUT" },
      // 취준(전환) 지출
      { date: "2026-08-25", description: "GTQ 응시료", amountKrw: 33000, direction: "OUT" },
      { date: "2026-08-30", description: "UX 부트캠프 등록비", amountKrw: 50000, direction: "OUT" },
      { date: "2026-08-09", description: "디자인 강의 결제", amountKrw: 120000, direction: "OUT" },
      // 생활 지출
      { date: "2026-08-02", description: "마트 장보기", amountKrw: 56700, direction: "OUT" },
      { date: "2026-08-13", description: "배달앱 결제", amountKrw: 31200, direction: "OUT" },
      { date: "2026-08-21", description: "약국", amountKrw: 14500, direction: "OUT" },
    ],
  },
  seedEvents: [
    { date: "2026-09-08", title: "고용센터 실업인정일", location: "서울 관악" },
    { date: "2026-09-20", title: "GTQ 자격시험", location: "서울" },
    { date: "2026-10-06", title: "UX 부트캠프 개강", location: "서울" },
  ],
};

export const PERSONAS: Persona[] = [minji, junho, seoyeon];

export function getPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
