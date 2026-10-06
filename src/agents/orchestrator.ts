/**
 * Orchestrator Agent (finance/agents/orchestrator.py 이식) — 라우터가 아니라 플래너.
 * DB 쓰기는 하지 않는다.
 *
 * 처음엔 "최근 매치 목록 조회" 도구(list_active_matches)를 tools로 주고 responseFormat도
 * 같이 썼는데, 실제로 돌려보니 구조화 출력 추출 단계에서 모델이 또 도구를 호출하려다
 * "Tool choice is none, but model called a tool" 에러로 4번 중 2번꼴로 실패했다(직접 확인).
 * tools 없이 responseFormat만 쓰는 게 훨씬 안정적이어서, 최근 매치 목록은 도구 호출로 얻는 대신
 * planTurn()이 미리 조회해 시스템 메시지로 프롬프트에 박아넣는다.
 */
import { chatModel } from "@/services/llm";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { supabaseAdmin } from "@/services/supabase";
import { PlanSchema, type Plan } from "./state";
import type { ChatMessage } from "@/types/chat";

const SYSTEM_PROMPT = `당신은 정책 매칭 서비스의 Orchestrator Agent입니다. 라우터가 아니라 플래너입니다.
사용자 발화 하나에 여러 의도가 섞여 있을 수 있다는 전제로, 다음을 판단해 Plan으로 출력하세요.

1. intents: 발화에 담긴 의도를 리스트로 분해합니다. 값은 "profile_update"(개인정보 변경/신규 언급),
   "policy_search"(정책 추천/자격 질의) 중에서 고릅니다.
2. policy_search가 있다면 policyMode를 결정합니다.
   - "compare": 정책이 2개 이상 명시되거나, 직전 결과에서 2개 이상을 지칭하는 경우
     (예: "국민취업지원제도랑 청년내일저축계좌 비교해줘", "1번이랑 3번 비교해줘").
     compareTargets 배열에 각 정책을 문자열 하나씩 채우세요 — 신규 지칭이면 정책명 텍스트
     그대로, 직전 결과 재지칭이면 "match:<match_id>" 형식(시스템 메시지의 [최근 매칭 목록]에서
     match_id를 확인). 예: ["국민취업지원제도", "match:3b9100ce-..."]. compareTargets를 쓸 때는
     최상위 policyQuery/referenceMatchId는 null로 비워두세요.
   - "lookup_and_check": 정책이 정확히 1건 특정됐을 때 — 새로 지칭됐거나(예: "국민취업지원제도
     저 되나요?"), 직전 대화의 후보 하나를 다시 지칭(예: "1번 저 되나요?", "그거 자세히 봐줘").
     후자의 경우 시스템 메시지의 [최근 매칭 목록]에서 해당 후보의 match_id를 찾아
     referenceMatchId에 채우세요. title 재검색이 필요 없습니다(전자와 구분).
   - "search": 정책명이 특정되지 않은 넓은 질의(예: "나한테 맞는 지원금 뭐 있어").
3. policyQuery: search 모드면 검색 질의, lookup_and_check이면서 신규 지칭이면 정책명(제목) 텍스트.
   referenceMatchId를 쓰는 경우나 compare 모드에서는 비워도 됩니다.
4. reasoning: 판단 근거를 한두 문장으로.

중요한 제약:
- "정보 부족" 후보가 과거에 있었다고 해서 자동으로 lookup_and_check/compare를 이어붙이지 마세요.
  사용자가 해당 후보를 이번 발화에서 다시 지칭할 때만 opt-in으로 라우팅합니다.
- profile_update와 policy_search가 함께 있으면 실행 순서는 항상 Profile Agent가 먼저입니다
  (이 순서는 그래프가 처리하므로 당신은 intents만 정확히 뽑으면 됩니다).
- 개인정보나 정책과 무관한 잡담이면 intents를 빈 리스트로 두세요.`;

export function makeOrchestrator(temperature = 0) {
  const llm = chatModel(temperature);
  return createReactAgent({
    llm,
    tools: [],
    prompt: SYSTEM_PROMPT,
    responseFormat: PlanSchema,
  });
}

async function fetchActiveMatchesSummary(userId: string, limit = 5): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("user_policy_matches")
    .select("match_id, policy_id, eligibility_status, status, checked_at")
    .eq("user_id", userId)
    .order("checked_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  const policyIds = [...new Set(rows.map((r) => r.policy_id))];
  const { data: policies } =
    policyIds.length > 0
      ? await db.from("policies").select("policy_id, title").in("policy_id", policyIds)
      : { data: [] as { policy_id: string; title: string }[] };
  const titleById = new Map((policies ?? []).map((p) => [p.policy_id, p.title]));
  const summary = rows.map((r) => ({
    match_id: r.match_id,
    title: titleById.get(r.policy_id) ?? null,
    eligibility_status: r.eligibility_status,
    status: r.status,
  }));
  return JSON.stringify(summary);
}

/** Groq의 strict JSON 스키마 구조화 출력이 가끔 필수 속성을 빠뜨린 채로 생성해 검증에
 * 실패한다(groq.ts의 llmJson()이 이미 같은 이유로 재시도하는 것과 동일한 문제) —
 * 최대 2회까지 재시도한다. */
export async function planTurn(userId: string, messages: ChatMessage[]): Promise<Plan> {
  const activeMatches = await fetchActiveMatchesSummary(userId);
  const turnMessages: ChatMessage[] = [
    ...messages,
    { role: "system", content: `[최근 매칭 목록]\n${activeMatches}` },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // temperature=0으로 그대로 재시도하면 같은 입력에 같은(깨진) 출력이 그대로 반복될 수 있다
      // (직접 확인함 — 특정 발화가 3회 연속 output_parse_failed로 실패) — 재시도부터는 온도를
      // 살짝 올려 같은 실패를 벗어날 여지를 준다.
      const agent = makeOrchestrator(attempt === 0 ? 0 : 0.4);
      const result = await agent.invoke({ messages: turnMessages });
      return result.structuredResponse as Plan;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/json_validate_failed|does not validate|missing properties|tool_use_failed|tool.*called|output_parse_failed|parsing failed/i.test(msg)) {
        throw e;
      }
    }
  }
  throw lastError;
}
