/** 페르소나·마이데이터 스냅샷 타입 — 실서비스와 동일한 프로필 스키마. */

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
    housing: "1인가구(월세)" | "1인가구(전세)" | "본가";
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
