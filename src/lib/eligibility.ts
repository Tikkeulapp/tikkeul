/**
 * 자격 판정 규칙엔진 (finance/rules/eligibility.py 이식).
 * 판정(confirmed/excluded/insufficient_info)은 여기서만 결정된다 — LLM은 이 결과를
 * 설명하는 역할만 한다 (src/services/policyMatch.ts 참고).
 */

import type { ConditionCheck, ConditionOperator, EligibilityCondition, EligibilityResult, EligibilityStatus } from "@/types/eligibility";

/** classifyConditions가 conditions 자체를 못 받았을 때(정책에 자격조건이 아직 등록 안 됨) 쓰는
 * sentinel — 실제 사용자 프로필 필드가 아니므로, 이 값을 profile_survey/finance 필드처럼 사용자에게
 * 되묻는 downstream 소비자(Profile Agent 등)가 있으면 반드시 필터링해야 한다. */
export const ELIGIBILITY_CONDITIONS_NOT_DEFINED = "eligibility_conditions_not_defined";

/** profile_survey/finance의 소득·재산 구간은 텍스트 등급이라, 임계값 비교(<=, >=)를 하려면
 * 서수로 변환해야 한다. finance/의 스키마는 애초에 숫자였지만 여기선 실제 컬럼이 텍스트다. */
const INCOME_BRACKET_RANK: Record<string, number> = {
  "~60%": 1,
  "60~100%": 2,
  "100~150%": 3,
  "150%~": 4,
};
const ASSET_BRACKET_RANK: Record<string, number> = {
  "2억 미만": 1,
  "2~4억": 2,
  "4억 초과": 3,
};
const ORDINAL_FIELDS: Record<string, Record<string, number>> = {
  income_bracket: INCOME_BRACKET_RANK,
  parent_income_bracket: INCOME_BRACKET_RANK,
  asset_bracket: ASSET_BRACKET_RANK,
};

/** Supabase(node-postgres)는 numeric/bigint를 문자열로 반환하는 경우가 있어, 숫자로 보이는
 * 문자열은 비교 전에 숫자로 맞춰준다. 아니면 "3" !== 3 같은 이유로 조건이 조용히 깨진다. */
function toComparable(field: string, value: unknown): unknown {
  if (field in ORDINAL_FIELDS && typeof value === "string") {
    return ORDINAL_FIELDS[field][value] ?? value;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

function makeOperators(field: string): Record<ConditionOperator, (a: unknown, b: unknown) => boolean> {
  const c = (v: unknown) => toComparable(field, v);
  return {
    "=": (a, b) => c(a) === c(b),
    "!=": (a, b) => c(a) !== c(b),
    "<": (a, b) => (c(a) as number) < (c(b) as number),
    "<=": (a, b) => (c(a) as number) <= (c(b) as number),
    ">": (a, b) => (c(a) as number) > (c(b) as number),
    ">=": (a, b) => (c(a) as number) >= (c(b) as number),
    in: (a, b) => Array.isArray(b) && b.map(c).includes(c(a)),
    "not in": (a, b) => Array.isArray(b) && !b.map(c).includes(c(a)),
  };
}

export function computeAge(birthDate: string, asOf: Date): number {
  const [y, m, d] = birthDate.slice(0, 10).split("-").map(Number);
  let age = asOf.getFullYear() - y;
  const beforeBirthdayThisYear = asOf.getMonth() + 1 < m || (asOf.getMonth() + 1 === m && asOf.getDate() < d);
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

function resolveField(
  field: string,
  sourceTable: EligibilityCondition["source_table"],
  profile: Record<string, unknown> | null,
  financial: Record<string, unknown> | null,
  asOf: Date,
): { actual: unknown; present: boolean } {
  if (field === "age") {
    const birthDate = profile?.birth_date as string | null | undefined;
    if (!birthDate) return { actual: null, present: false };
    return { actual: computeAge(String(birthDate), asOf), present: true };
  }
  const table = sourceTable === "profile_survey" ? profile : financial;
  const value = table?.[field];
  if (value === undefined || value === null) return { actual: null, present: false };
  return { actual: value, present: true };
}

export function evaluateCondition(
  condition: EligibilityCondition,
  profile: Record<string, unknown> | null,
  financial: Record<string, unknown> | null,
  asOf: Date = new Date(),
): ConditionCheck {
  const { actual, present } = resolveField(condition.field, condition.source_table, profile, financial, asOf);
  const satisfied = present ? makeOperators(condition.field)[condition.operator](actual, condition.value) : null;
  return {
    field: condition.field,
    source_table: condition.source_table,
    operator: condition.operator,
    expected: condition.value,
    actual,
    present,
    satisfied,
  };
}

export function classifyConditions(
  conditions: EligibilityCondition[],
  profile: Record<string, unknown> | null,
  financial: Record<string, unknown> | null,
  asOf: Date = new Date(),
): EligibilityResult {
  if (!conditions || conditions.length === 0) {
    return { status: "insufficient_info", missingFields: [ELIGIBILITY_CONDITIONS_NOT_DEFINED], checks: [] };
  }

  const checks = conditions.map((c) => evaluateCondition(c, profile, financial, asOf));
  const missingFields = checks.filter((c) => !c.present).map((c) => c.field);

  // 이미 확인된 미충족이 있으면 부족필드보다 우선해서 제외한다 —
  // 다른 필드를 더 물어봐도 이미 탈락이 확정이므로 되물을 이유가 없다.
  const hasKnownFailure = checks.some((c) => c.present && c.satisfied === false);
  const status: EligibilityStatus = hasKnownFailure
    ? "excluded"
    : missingFields.length > 0
      ? "insufficient_info"
      : "confirmed";

  return { status, missingFields, checks };
}
