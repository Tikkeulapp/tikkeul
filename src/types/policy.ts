/** 정책 × 사용자 판정 결과 타입 (services/policyMatch). */

export type Verdict = {
  score: number;
  eligibility: "LIKELY" | "NEEDS_CHECK" | "UNLIKELY";
  reasons: string[];
  missing_information: string[];
  evidence_todo: string[];
};

export type PolicyInput = {
  title: string;
  benefit?: string;
  target?: string;
  content?: string;
  region?: string;
};
