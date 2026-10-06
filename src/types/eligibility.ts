/** 자격 판정 규칙엔진 타입 (lib/eligibility). */

export type ConditionOperator = "=" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not in";

/** source_table은 AI_FINANCE 실제 테이블명(profile_survey/finance)을 그대로 쓴다. */
export type EligibilityCondition = {
  field: string;
  source_table: "profile_survey" | "finance";
  operator: ConditionOperator;
  value: unknown;
};

export type ConditionCheck = {
  field: string;
  source_table: string;
  operator: ConditionOperator;
  expected: unknown;
  actual: unknown;
  present: boolean;
  satisfied: boolean | null; // present가 false면 null
};

export type EligibilityStatus = "confirmed" | "excluded" | "insufficient_info";

export type EligibilityResult = {
  status: EligibilityStatus;
  missingFields: string[];
  checks: ConditionCheck[];
};
