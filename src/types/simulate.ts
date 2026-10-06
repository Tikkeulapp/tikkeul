/** 취업 후 시뮬레이션 타입 (lib/simulate). */
import type { CardCategory, Loan } from "@/types/persona";
import type { HouseRegion } from "@/data/postjob_reference";

export type CompanyType = "대기업" | "중견기업" | "중소기업" | "스타트업" | "공기업" | "공무원" | "기타";
export type GoalType = "LUMP_SUM" | "HOUSE" | "MARRIAGE";

export type GoalSpec = { type: GoalType; targetKrw?: number; houseRegion?: HouseRegion };

export type SimInput = {
  companyType: CompanyType;
  annualSalaryKrw: number;
  /** 여러 목적을 동시에 선택할 수 있다 — 합산 목표와 순차 도달 시점을 함께 계산 */
  goals: GoalSpec[];
  /** 입사 예정 월 YYYY-MM (없으면 다음 달) */
  startMonth?: string;
};

/** 마이데이터(또는 직접 입력)에서 뽑은 지출 구조 */
export type SpendingProfile = {
  source: "마이데이터" | "직접 입력";
  rentMonthlyKrw: number;
  fixedCosts: { label: string; monthlyKrw: number }[];
  loans: Loan[];
  /** 카드 승인내역 월평균 (카테고리별) */
  cardByCategory: { category: CardCategory; monthlyKrw: number }[];
  cardMonthlyKrw: number;
  /** 계좌 기타 지출(카드 외 소액 결제 등) 월평균 */
  otherVariableMonthlyKrw: number;
  monthsObserved: number;
  liquidAssetsKrw: number;
  savingsKrw: number; // 예·적금 등
};

export type NetPay = {
  grossMonthlyKrw: number;
  pensionKrw: number;
  healthKrw: number;
  ltcKrw: number;
  employmentKrw: number;
  incomeTaxMonthlyKrw: number; // 감면 후
  localTaxMonthlyKrw: number;
  reliefAnnualKrw: number; // 중소기업 감면액(연)
  reliefApplied: boolean;
  netMonthlyKrw: number;
  note: string;
};

export type GoalItem = {
  type: GoalType;
  label: string;
  emoji: string;
  targetKrw: number;
  detail: Record<string, number | string>;
  assumptions: string[];
};

export type Milestone = {
  type: GoalType;
  label: string;
  /** 이 목표까지의 누적 목표액 (작은 목표부터 순서대로 달성 가정) */
  cumulativeTargetKrw: number;
  monthsToGoal: number | null;
  goalMonth: string | null; // YYYY-MM
};

export type Scenario = {
  key: "보수" | "기본" | "공격";
  label: string;
  savingsMonthlyKrw: number;
  spendingCutKrw: number;
  milestones: Milestone[];
  monthsToAll: number | null;
  goalMonthAll: string | null;
};

export type SimResult = {
  startMonth: string;
  net: NetPay;
  spending: {
    fixedKrw: number; // 월세+고정비
    loanKrw: number;
    variableKrw: number; // 카드+기타
    totalKrw: number;
    topCategories: { category: CardCategory; monthlyKrw: number; pct: number }[];
  };
  surplusMonthlyKrw: number;
  allocation: { label: string; krw: number; pct: number }[]; // 기본 시나리오 기준
  scenarios: Scenario[];
  goals: GoalItem[];
  totalTargetKrw: number;
  startingAssetsKrw: number;
  assumptions: string[];
  debt: {
    totalKrw: number;
    monthlyKrw: number;
    advice: "PAY_FIRST" | "SAVE_FIRST" | "NONE";
    reason: string;
  };
  warnings: string[];
  references: { label: string; asOf: string }[];
};
