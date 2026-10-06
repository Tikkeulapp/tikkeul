/** 사용자 프로필 타입 — 마이데이터 도출 피처(lib/derive)와 실효 프로필(services/profile). */

export type RecurringIncome = {
  label: string;
  kind: "WORK" | "BENEFIT" | "FAMILY";
  avgMonthlyKrw: number;
  monthsObserved: number;
};

export type BenefitStatus = {
  name: string;
  monthlyKrw: number;
  firstSeenMonth: string; // YYYY-MM
  /** 제도별 통상 수급 기간으로 추정한 종료 시점 — 어디까지나 추정 */
  endEstimateMonth: string | null;
};

export type DerivedProfile = {
  liquidAssetsKrw: number;
  incomes: RecurringIncome[];
  /** 정기 근로소득이 관측되지 않으면 true */
  noRegularWorkIncome: boolean;
  rentMonthlyKrw: number | null;
  benefits: BenefitStatus[];
  fixedCosts: { label: string; monthlyKrw: number }[];
  /** 취준 관련으로 분류된 지출 (최근 순) */
  jobPrepSpending: { date: string; description: string; amountKrw: number }[];
  jobPrepTotalKrw: number;
};

export type ProfileChange = {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string;
  effective_from: string;
  source_event: string | null;
  status: string;
};

export type EffectiveProfile = {
  summary: Record<string, unknown>; // LLM에 넘길 요약
  sido: string | null;
  sigungu: string | null;
  age: number | null;
  applied: ProfileChange[];
  pending: ProfileChange[];
  /** profile_survey 원본 행(profile_changes 반영 후) — 규칙엔진용. 페르소나/직접입력 둘 다
   * scripts/seed.mts, /api/signup으로 DB에 있으므로 항상 조회를 시도한다. */
  profileRow: Record<string, unknown> | null;
  /** finance 원본 행 — 규칙엔진용 */
  financeRow: Record<string, unknown> | null;
};
