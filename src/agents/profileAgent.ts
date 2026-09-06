/**
 * Profile Agent (finance/agents/profile_agent.py 이식) — 대화형 슬롯필링.
 */
import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { extractReply } from "./policyAgent";
import { buildProfileTools } from "./profileTools";
import type { ChatMessage } from "./state";

const SYSTEM_PROMPT = `당신은 정책 매칭 서비스의 Profile Agent입니다. 대화에서 언급된 개인정보를 구조화해
profile_survey를 갱신합니다. 당신의 역할은 여기까지입니다 — 정책 자격 여부·추가 확인 필요 항목은
Policy Agent가 별도로 판단하므로, 사용자가 같은 발화에 정책 질문("~받을 수 있나요?" 등)을 같이
했더라도 그 질문에는 절대 답하지 마세요. 당신에게는 자격 판정 도구가 없어 근거 없이 추측하게 됩니다
(이미 프로필에 있는 정보를 "확인 필요"라고 잘못 말하는 사고가 실제로 있었습니다).

절차:
1. missing_fields로 부족한 필드가 전달됐다면, 그 필드를 먼저 사용자에게 되묻거나
   (이미 발화에 답이 있다면) 우선적으로 채우세요.
2. get_profile로 이미 알고 있는 값을 확인한 뒤, 대화에서 새로 확인되거나 정정된 값만
   update_profile로 저장하세요. 확실하지 않은 값은 저장하지 마세요.
3. 마지막에는 무엇을 저장했는지, 그리고 (부족한 필드가 남아 있다면) 무엇을 더 물어야
   하는지 한국어로 간결히 정리해서 답하세요. 이때 절대 내부 필드명(region_sido,
   living_with_parents, income_bracket 등 영문 snake_case)이나 true/false를 그대로
   보여주지 마세요 — 항상 자연스러운 한국어 표현으로 바꿔서 말하세요.
   예) living_with_parents: false → "부모님과 따로 거주(독립)", employment_status: "미취업" →
   "미취업 상태", income_bracket: "~60%" → "가구 중위소득 60% 이하".`;

export async function runProfileAgent(
  userId: string,
  profileRowId: string,
  messages: ChatMessage[],
  missingFields: string[],
  deferUntil: string | null = null,
): Promise<string> {
  const llm = new ChatGroq({ model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b", temperature: 0 });
  const agent = createReactAgent({
    llm,
    tools: buildProfileTools(userId, profileRowId, deferUntil),
    prompt: SYSTEM_PROMPT,
  });
  const turnMessages = [...messages];
  if (missingFields.length > 0) {
    turnMessages.push({ role: "system", content: `Policy Agent가 요청한 부족한 필드: ${missingFields.join(", ")}` });
  }
  const result = await agent.invoke({ messages: turnMessages });
  return extractReply(result);
}
