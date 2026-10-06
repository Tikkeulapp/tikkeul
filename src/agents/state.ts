/**
 * Orchestrator의 구조화 출력 (finance/state.py의 Plan/PolicyReference 이식).
 *
 * 필드는 .nullable()만 쓰고 .optional()은 쓰지 않는다 — Groq의 strict JSON schema 구조화
 * 출력은 모든 속성이 required에 있어야 하고 생략(optional)은 못 받는다("missing properties"
 * 에러로 직접 확인됨). 없는 값은 "키 생략"이 아니라 "값이 null"로 표현해야 한다.
 *
 * compareTargets는 (한때) {policyQuery, referenceMatchId} 객체 배열로 설계했으나, "배열 원소마다
 * 서로 다른 nullable 필드 조합"이 이 모델의 strict 스키마 생성에서 실제로 불안정함을 확인했다
 * (같은 요청을 반복해도 간헐적으로 필수 속성 누락 에러 발생, 재시도 1회로도 해소 안 됨). 그래서
 * 문자열 배열로 단순화했다 — 신규 지칭은 정책명 그대로, 재지칭은 "match:<match_id>" 접두어.
 * 파싱은 policyAgent.ts에서 한다.
 */
import { z } from "zod";

export const PlanSchema = z.object({
  intents: z
    .array(z.enum(["profile_update", "policy_search"]))
    .describe("발화에 담긴 의도. 순서 무관 — 실행 순서는 그래프가 결정한다."),
  policyMode: z
    .enum(["search", "lookup_and_check", "compare"])
    .nullable()
    .describe("policy_search가 intents에 있을 때만 채움, 아니면 null"),
  policyQuery: z
    .string()
    .nullable()
    .describe(
      "search 모드의 벡터/키워드 검색 질의, 또는 lookup_and_check 신규 지칭의 정책명. compare에서는 null",
    ),
  referenceMatchId: z
    .string()
    .nullable()
    .describe("lookup_and_check에서 직전 결과를 재지칭할 때의 match_id. compare에서는 null"),
  compareTargets: z
    .array(z.string())
    .nullable()
    .describe(
      "policyMode가 compare일 때만 채움 — 비교 대상 2건 이상. 각 항목은 정책명 텍스트를 그대로 쓰거나" +
        "(신규 지칭), 직전 결과를 재지칭하는 경우 'match:<match_id>' 형식으로 쓴다. 아니면 null.",
    ),
  reasoning: z.string().nullable().describe("판단 근거 한두 문장 (디버깅용)"),
});
export type Plan = z.infer<typeof PlanSchema>;

