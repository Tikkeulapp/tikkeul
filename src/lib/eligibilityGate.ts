/**
 * 파이프라인(추천티끌·일정 매칭)용 자격 게이트 — 규칙엔진 결과로 후보를 거르고 배지를 붙인다.
 * 에이전트(ReAct)를 거치지 않고 코드가 직접 판정을 반영한다: 단계가 고정된 흐름이라 도구 선택이
 * 필요 없고, 판정은 어차피 규칙엔진(classifyConditions)이 정한다.
 * 구조화 조건이 없는 정책(classifyPolicyForUser → null)은 판정을 지어내지 않고 "unjudged"로 둔다.
 */
import { ELIGIBILITY_CONDITIONS_NOT_DEFINED } from "@/lib/eligibility";
import type { EligibilityResult } from "@/types/eligibility";
import type { Verdict } from "@/types/policy";

export type EligibilityBadge = {
  status: "confirmed" | "insufficient_info" | "unjudged";
  missingFields: string[];
};

/** 규칙엔진 결과 → 배지. excluded면 null(후보에서 제외). 조건 미등록은 unjudged. */
export function badgeFor(result: EligibilityResult | null | undefined): EligibilityBadge | null {
  if (!result || result.missingFields.includes(ELIGIBILITY_CONDITIONS_NOT_DEFINED)) {
    return { status: "unjudged", missingFields: [] };
  }
  if (result.status === "excluded") return null;
  return { status: result.status, missingFields: [...result.missingFields] };
}

/** excluded 후보를 빼고 나머지에 배지를 붙인다 (입력 순서 유지). results에 없는 id는 unjudged. */
export function gateByEligibility<T>(
  items: T[],
  idOf: (t: T) => string,
  results: Map<string, EligibilityResult | null>,
): (T & { eligibility: EligibilityBadge })[] {
  const out: (T & { eligibility: EligibilityBadge })[] = [];
  for (const item of items) {
    const badge = badgeFor(results.get(idOf(item)));
    if (badge) out.push({ ...item, eligibility: badge });
  }
  return out;
}

const FIELD_LABELS: Record<string, string> = {
  age: "나이",
  region_sido: "거주지(시·도)",
  region_sigungu: "거주지(시·군·구)",
  education_status: "학력",
  employment_status: "취업상태",
  housing_type: "주거형태",
  income_bracket: "가구 중위소득 구간",
  parent_income_bracket: "부모 소득 구간",
  asset_bracket: "재산 구간",
};

/** 카드에 보일 문구. unjudged는 표시하지 않는다(null). */
export function badgeLabel(badge: EligibilityBadge): string | null {
  if (badge.status === "confirmed") return "✅ 자격 충족";
  if (badge.status === "unjudged") return null;
  if (badge.missingFields.length === 0) return "🟡 일부 조건 확인 필요";
  return `🟡 확인 필요: ${badge.missingFields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`;
}

/** user_policy_matches 저장용 Verdict. score·reason은 LLM 관련도, 판정은 배지에서만 온다. */
export function verdictFromBadge(badge: EligibilityBadge, score: number, reason: string): Verdict {
  return {
    score,
    eligibility: badge.status === "confirmed" ? "LIKELY" : "NEEDS_CHECK",
    reasons: [reason],
    missing_information: badge.status === "unjudged" ? [ELIGIBILITY_CONDITIONS_NOT_DEFINED] : [...badge.missingFields],
    evidence_todo: [],
  };
}

/** 이사 일정이면 목적지 시도 기준으로 판정해야 한다 — 시군구는 아직 모르므로 null. 원본은 건드리지 않는다. */
export function profileForMove(
  profileRow: Record<string, unknown> | null,
  toSido: string | null,
): Record<string, unknown> | null {
  if (!profileRow || !toSido || profileRow.region_sido === toSido) return profileRow;
  return { ...profileRow, region_sido: toSido, region_sigungu: null };
}
