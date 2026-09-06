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
  employmentStatus: string; // 취업 준비 중 | 이직 준비 중 | 재취업 준비 중 | 기타
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

/** 카드 승인내역 카테고리 (마이데이터 카드 업권 — 가맹점 업종코드를 서비스 분류로 매핑) */
export type CardCategory =
  | "식비" | "카페·간식" | "교통" | "생활·마트" | "쇼핑" | "구독·디지털" | "문화·여가" | "의료·건강" | "취업준비" | "기타";

export type CardApproval = {
  date: string; // YYYY-MM-DD
  merchant: string;
  category: CardCategory;
  amountKrw: number;
};

/** 대출 (마이데이터 은행·여전 업권) — 취업 후 상환 개시를 가정한 월 상환액 포함 */
export type Loan = {
  loanId: string;
  org: string;
  type: "학자금" | "신용" | "전세" | "기타";
  balanceKrw: number;
  interestRate: number; // % (연)
  monthlyPaymentKrw: number;
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
  /** 카드 승인내역 (수집 가정) — 소비습관 분석·취업 후 시뮬레이션에 사용 */
  cardApprovals: CardApproval[];
  loans: Loan[];
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
    employmentStatus: "취업 준비 중",
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
    // 카드 승인내역 (체크카드) — 본가 거주, 월 15~17만 소비. 구독·카페 비중 높음
    cardApprovals: [
      { date: "2026-07-03", merchant: "스타벅스", category: "카페·간식", amountKrw: 5900 },
      { date: "2026-07-06", merchant: "올리브영", category: "쇼핑", amountKrw: 32000 },
      { date: "2026-07-09", merchant: "넷플릭스", category: "구독·디지털", amountKrw: 13500 },
      { date: "2026-07-12", merchant: "김밥천국", category: "식비", amountKrw: 8500 },
      { date: "2026-07-14", merchant: "CGV", category: "문화·여가", amountKrw: 15000 },
      { date: "2026-07-17", merchant: "다이소", category: "생활·마트", amountKrw: 12000 },
      { date: "2026-07-19", merchant: "투썸플레이스", category: "카페·간식", amountKrw: 6800 },
      { date: "2026-07-22", merchant: "무신사", category: "쇼핑", amountKrw: 49000 },
      { date: "2026-07-25", merchant: "맘스터치", category: "식비", amountKrw: 9800 },
      { date: "2026-07-28", merchant: "유튜브 프리미엄", category: "구독·디지털", amountKrw: 14900 },
      { date: "2026-07-30", merchant: "GS25", category: "생활·마트", amountKrw: 7200 },
      { date: "2026-08-02", merchant: "스타벅스", category: "카페·간식", amountKrw: 6100 },
      { date: "2026-08-04", merchant: "서브웨이", category: "식비", amountKrw: 9900 },
      { date: "2026-08-09", merchant: "넷플릭스", category: "구독·디지털", amountKrw: 13500 },
      { date: "2026-08-10", merchant: "ChatGPT Plus", category: "구독·디지털", amountKrw: 29000 },
      { date: "2026-08-15", merchant: "CU", category: "생활·마트", amountKrw: 5400 },
      { date: "2026-08-17", merchant: "메가커피", category: "카페·간식", amountKrw: 3800 },
      { date: "2026-08-21", merchant: "교보문고 (SQLD 문제집)", category: "취업준비", amountKrw: 24000 },
      { date: "2026-08-23", merchant: "올리브영", category: "쇼핑", amountKrw: 18500 },
      { date: "2026-08-26", merchant: "유튜브 프리미엄", category: "구독·디지털", amountKrw: 14900 },
      { date: "2026-08-29", merchant: "배스킨라빈스", category: "카페·간식", amountKrw: 8900 },
    ],
    loans: [],
  },
  seedEvents: [
    { date: "2026-09-20", title: "토익 시험", location: "서울" }, // 제579회 (실제 2026 회차)
    { date: "2026-09-13", title: "컴활 1급 실기 시험", location: "서울" }, // 상시 시험
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
    employmentStatus: "취업 준비 중",
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
    // 카드 승인내역 — 자취, 마트·생활 위주 절약형 소비 (월 10~12만)
    cardApprovals: [
      { date: "2026-07-02", merchant: "이마트24", category: "생활·마트", amountKrw: 6500 },
      { date: "2026-07-05", merchant: "쿠팡", category: "쇼핑", amountKrw: 27800 },
      { date: "2026-07-08", merchant: "버거킹", category: "식비", amountKrw: 9500 },
      { date: "2026-07-11", merchant: "넷플릭스", category: "구독·디지털", amountKrw: 13500 },
      { date: "2026-07-15", merchant: "홈플러스", category: "생활·마트", amountKrw: 38400 },
      { date: "2026-07-19", merchant: "컴포즈커피", category: "카페·간식", amountKrw: 3500 },
      { date: "2026-07-23", merchant: "크린토피아 (면접 정장 세탁)", category: "취업준비", amountKrw: 12000 },
      { date: "2026-07-27", merchant: "온누리약국", category: "의료·건강", amountKrw: 8900 },
      { date: "2026-08-01", merchant: "쿠팡", category: "쇼핑", amountKrw: 19900 },
      { date: "2026-08-06", merchant: "김가네", category: "식비", amountKrw: 9000 },
      { date: "2026-08-10", merchant: "넷플릭스", category: "구독·디지털", amountKrw: 13500 },
      { date: "2026-08-13", merchant: "홈플러스", category: "생활·마트", amountKrw: 41200 },
      { date: "2026-08-17", merchant: "컴포즈커피", category: "카페·간식", amountKrw: 3500 },
      { date: "2026-08-20", merchant: "롯데리아", category: "식비", amountKrw: 8700 },
      { date: "2026-08-25", merchant: "다이소", category: "생활·마트", amountKrw: 9000 },
      { date: "2026-08-29", merchant: "이마트24", category: "생활·마트", amountKrw: 5800 },
    ],
    // 학자금대출 — 거치 중, 취업 후 상환 개시 가정 (원리금 월 6.2만)
    loans: [{ loanId: "JUNHO_KOSAF", org: "한국장학재단", type: "학자금", balanceKrw: 6800000, interestRate: 1.7, monthlyPaymentKrw: 62000 }],
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
    employmentStatus: "재취업 준비 중",
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
    // 카드 승인내역 (신용카드) — 직장 생활 소비 패턴 유지 중 (월 40~45만). 운동·쇼핑·구독 비중 높음
    cardApprovals: [
      { date: "2026-07-01", merchant: "쿠팡", category: "쇼핑", amountKrw: 45600 },
      { date: "2026-07-04", merchant: "스타벅스", category: "카페·간식", amountKrw: 6300 },
      { date: "2026-07-07", merchant: "샐러디", category: "식비", amountKrw: 11500 },
      { date: "2026-07-10", merchant: "넷플릭스", category: "구독·디지털", amountKrw: 17000 },
      { date: "2026-07-12", merchant: "Adobe Creative Cloud", category: "취업준비", amountKrw: 30800 },
      { date: "2026-07-15", merchant: "올리브영", category: "쇼핑", amountKrw: 41000 },
      { date: "2026-07-18", merchant: "필라테스 월회원권", category: "의료·건강", amountKrw: 180000 },
      { date: "2026-07-21", merchant: "스타벅스", category: "카페·간식", amountKrw: 6300 },
      { date: "2026-07-24", merchant: "이마트", category: "생활·마트", amountKrw: 62300 },
      { date: "2026-07-27", merchant: "CGV", category: "문화·여가", amountKrw: 16000 },
      { date: "2026-08-01", merchant: "쿠팡", category: "쇼핑", amountKrw: 38900 },
      { date: "2026-08-03", merchant: "스타벅스", category: "카페·간식", amountKrw: 6300 },
      { date: "2026-08-06", merchant: "샐러디", category: "식비", amountKrw: 12000 },
      { date: "2026-08-10", merchant: "넷플릭스", category: "구독·디지털", amountKrw: 17000 },
      { date: "2026-08-12", merchant: "Adobe Creative Cloud", category: "취업준비", amountKrw: 30800 },
      { date: "2026-08-16", merchant: "필라테스 월회원권", category: "의료·건강", amountKrw: 180000 },
      { date: "2026-08-19", merchant: "무신사", category: "쇼핑", amountKrw: 68000 },
      { date: "2026-08-23", merchant: "이마트", category: "생활·마트", amountKrw: 58700 },
      { date: "2026-08-27", merchant: "스타벅스", category: "카페·간식", amountKrw: 6300 },
      { date: "2026-08-30", merchant: "배스킨라빈스", category: "카페·간식", amountKrw: 12000 },
    ],
    // 마이너스통장 — 퇴사 후 생활비 보전용. 고금리 → 상환 우선 판정 케이스
    loans: [{ loanId: "SEOYEON_MINUS", org: "S은행", type: "신용", balanceKrw: 3000000, interestRate: 6.8, monthlyPaymentKrw: 100000 }],
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
