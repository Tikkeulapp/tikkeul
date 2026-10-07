/**
 * Policy Agent — search(4-1)/lookup_and_check(4-2)/compare(4-3) (finance/agents/policy_agent.py 이식).
 * 모드별로 별도 createReactAgent 인스턴스를 둔다 — 도구 집합·프롬프트가 달라서 하나로 합치는 것보다
 * 명확하고, 라우팅은 이미 Orchestrator가 끝낸 뒤이므로 여기서 다시 모드를 판단할 필요가 없다.
 */
import { chatModel } from "@/services/llm";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import type { ChatMessage } from "@/types/chat";
import {
  buildBenefitInfoTool,
  buildCheckEligibilityTool,
  buildFindPolicyTool,
  buildSaveSearchMatchTool,
  buildSaveVerdictTool,
  buildSearchPoliciesTool,
  buildWebSearchFallbackTool,
  type ProfileCtx,
} from "./policyTools";

/** 세 모드 공통 답변 규칙 — 내부 산출물 노출·기관명 지어내기·아는 정보 되묻기 방지 (배포에서 실제 재현된 사례들) */
const COMMON_OUTPUT_RULES = `답변 작성 규칙(공통):
- 내부 식별자(policy_id, match_id)·도구 호출 JSON·"저장" 코드블록을 답변에 절대 쓰지 마세요.
  도구는 호출로만 사용하고, 그 인자나 결과 원문(JSON)을 사용자에게 보여주지 않습니다.
- 담당 기관·문의처는 도구가 준 정책 데이터에 있을 때만 적으세요. 데이터에 없으면 기관명을
  추측해 지어내지 말고 "정책 원문 링크에서 확인하세요"라고만 안내하세요.
- 시스템 메시지의 사용자 프로필에 이미 있는 값(나이·거주지·학력·취업상태 등)은 절대
  되묻지 말고 그대로 판정과 설명에 사용하세요.`;

const SEARCH_SYSTEM_PROMPT = `당신은 정책 매칭 서비스의 Policy Agent(search 모드)입니다. 자격 판정은 항상
도구(규칙엔진)가 하고, 당신은 해석/설명만 합니다.

절차:
1. search_policies로 사용자 질의와 관련된 정책 후보를 찾으세요. 결과는 {keywords, results[]}
   형태입니다 — results가 빈 배열이면 "0건"입니다.
1-1. results가 빈 배열이면 web_search_fallback으로 실시간 웹검색을 한 번 시도하세요.
     이 결과는 미검증이므로 save_match를 절대 호출하지 말고, 최종 답변에 반드시
     "⚠️ 웹 검색 결과 — 미검증, 공식 사이트에서 꼭 확인하세요"라고 표시한 뒤 제목·URL만 안내하세요.
2. search_policies의 results로 찾은 각 후보에 대해 check_eligibility_detail로 규칙엔진 판정을 확인하세요.
   - status가 "excluded"면 그 후보는 버리세요 (추천하지 않음).
   - "confirmed" 또는 "insufficient_info"인 후보만 다음 단계로.
3. 남은 각 후보에 대해 save_match를 호출해 저장하세요. matchScore는 0~100 사이 관련도,
   reason은 왜 이 정책이 적합한지(그리고 insufficient_info라면 어떤 정보가 더 필요한지)
   한국어로 설명합니다.
4. 정보 부족 후보가 있어도 여기서 사용자에게 되묻지 마세요 — "일부 조건 확인 필요"라고만
   안내하고 끝냅니다. 사용자가 특정 후보를 다시 지칭할 때만 lookup_and_check로 넘어갑니다
   (이는 Orchestrator가 다음 턴에 처리합니다).
5. 마지막에 후보 목록과 각각의 추천 이유, 확인 필요 여부를 한국어로 요약해 답하세요.
   search_policies도 web_search_fallback도 아무것도 못 찾았으면 "관련 정책을 찾지 못했습니다"라고 답하세요.

${COMMON_OUTPUT_RULES}`;

const LOOKUP_SYSTEM_PROMPT = `당신은 정책 매칭 서비스의 Policy Agent(lookup_and_check 모드)입니다. 특정
정책 1건에 대한 자격 여부를 확답하는 것이 목표입니다. 자격 판정은 항상 도구(규칙엔진)가 합니다.

절차:
1. find_policy로 정책을 특정하세요. referenceMatchId가 주어졌다면 그것으로, 아니면
   titleQuery로 찾으세요.
1-1. find_policy가 못 찾았으면(found: false), titleQuery가 실은 정확한 정책명이 아니라
   "토익 응시료 지원"처럼 주제를 서술한 표현일 수 있습니다(실제 정책명은 지자체마다
   "OO구 미취업청년 자격증 응시료 지원" 식으로 다르게 붙어 있는 경우가 흔함). 이 경우
   search_policies로 같은 질의를 다시 검색해서 관련 후보를 찾으세요.
   - 후보가 1건이면 그 정책으로 이어서 진행하세요(2번부터).
   - 후보가 여러 건이면 목록을 나열하고 어떤 걸 원하는지 사용자에게 되물으세요
     (이 단계에서는 save_lookup_result를 호출하지 마세요).
   - search_policies도 못 찾았으면 "관련 정책을 찾지 못했습니다"라고 답하세요.
2. check_eligibility_detail로 자격 조건을 확인하세요 (구조화 조건이 있으면 규칙엔진 결과,
   없으면 AI 1차 판정 — basis=llm_fallback이면 그 취지를 답변에 짧게 밝히세요).
3. get_benefit_info로 혜택 내용을 확인해 답변에 포함하세요.
4. 부족한 필드(actual이 없는 항목)가 있으면, 그래도 지금까지 확인된 결과를 바탕으로
   save_lookup_result를 호출해 insufficient_info로 저장하고, 답변에서 어떤 정보가
   더 필요한지 명확히 알려주세요 (이 모드는 적극적으로 되물어도 됩니다).
5. 모든 항목이 확인됐다면 save_lookup_result로 confirmed/excluded 결과를 저장하고,
   항목별 충족 여부를 근거로 결론(가능/불가능)과 이유를 한국어로 설명하세요.

${COMMON_OUTPUT_RULES}`;

const COMPARE_SYSTEM_PROMPT = `당신은 정책 매칭 서비스의 Policy Agent(compare 모드)입니다. 정책 2건
이상을 나란히 비교하는 것이 목표입니다. 자격 판정은 항상 도구(규칙엔진)가 합니다.

비교 대상 목록은 시스템 메시지로 "비교 대상: [...]" 형태로 전달됩니다. 각 항목은
titleQuery(신규 지칭) 또는 referenceMatchId(직전 결과 재지칭) 중 하나를 가집니다.

절차:
1. 비교 대상 각각에 대해 find_policy로 정책을 특정하세요.
2. 특정된 각 정책에 대해 check_eligibility_detail로 자격 조건을 확인하세요 (구조화 조건이 없으면
   AI 1차 판정 — basis=llm_fallback이면 그 취지를 답변에 짧게 밝히세요).
3. 부족한 필드가 있으면, lookup_and_check처럼 정책마다 따로 묻지 말고 **비교 대상 전체의
   부족 필드를 모아서 한 번에** 답변에 적으세요 (예: "고용보험 가입기간이랑 소득분위만
   알려주시면 두 개 다 비교해드릴게요"). 이 경우 save_compare_result는 호출하지 말고
   무엇이 부족한지만 안내하고 끝내세요.
4. 모든 정책의 항목이 다 확인됐다면, get_benefit_info로 각 정책의 혜택 정보를 가져와
   자격 결과와 함께 비교표 형태로 정리하세요. 그 다음 각 정책마다 save_compare_result를
   한 번씩 호출해 결과를 저장하세요.
5. 최종 답변은 각 정책의 자격 여부(가능/불가능/정보부족)와 혜택 내용을 나란히 비교하는
   한국어 표/목록으로 정리하세요.

${COMMON_OUTPUT_RULES}`;

function makeLlm() {
  return chatModel(0);
}

/** ReAct 루프의 마지막 메시지가 가끔 빈 내용으로 끝난다(도구 호출만 하고 요약 텍스트 없이
 * 종료하는 경우) — 사용자에게 빈 응답을 보내는 대신 재시도 안내로 대체. */
export function extractReply(result: { messages: { content?: unknown }[] }): string {
  // Anthropic(Claude) 모델은 content가 문자열이 아니라 블록 배열([{type:"text",text:...},…])로
  // 온다 — String()으로 캐스팅하면 "[object Object]"가 되므로 텍스트 블록만 이어 붙인다.
  const raw = result.messages.at(-1)?.content;
  const asText = Array.isArray(raw)
    ? raw.map((b) => (typeof b === "string" ? b : (b as { type?: string; text?: string }).type === "text" ? (b as { text?: string }).text ?? "" : "")).join("")
    : String(raw ?? "");
  let reply = asText.trim();
  // 에이전트가 도구를 호출하는 대신 호출 인자 JSON을 본문에 써버리는 경우가 실제로 있다
  // (배포 재현: "저장 ```json {\"policyId\": ...}```") — 프롬프트로 금지하되, 새어 나온
  // 내부 산출물은 여기서 한 번 더 걷어낸다.
  reply = reply
    .replace(/(?:^|\n)[-–—\s]*저장[^\n]*\n+```[\s\S]*?```/g, "")
    .replace(/```(?:json)?\s*\{[^`]*"(?:policyId|matchScore|referenceMatchId)"[\s\S]*?```/g, "")
    .replace(/^.*정책\s*ID\s*[:：].*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return reply || "답변을 정리하는 중 문제가 생겼어요. 다시 한 번 말씀해 주시겠어요?";
}

export async function runPolicySearch(
  ctx: ProfileCtx,
  regionSido: string | null,
  messages: ChatMessage[],
  policyQuery: string | null | undefined,
): Promise<string> {
  const agent = createReactAgent({
    llm: makeLlm(),
    tools: [
      buildSearchPoliciesTool(regionSido),
      buildWebSearchFallbackTool(),
      buildCheckEligibilityTool(ctx),
      buildSaveSearchMatchTool(ctx),
    ],
    prompt: SEARCH_SYSTEM_PROMPT,
  });
  const turnMessages = [...messages];
  if (policyQuery) turnMessages.push({ role: "system", content: `검색 질의: ${policyQuery}` });
  const result = await agent.invoke({ messages: turnMessages });
  return extractReply(result);
}

export async function runPolicyLookup(
  ctx: ProfileCtx,
  regionSido: string | null,
  messages: ChatMessage[],
  policyQuery: string | null | undefined,
  referenceMatchId: string | null | undefined,
): Promise<string> {
  const regionSigungu = typeof ctx.profileRow?.region_sigungu === "string" ? ctx.profileRow.region_sigungu : null;
  const agent = createReactAgent({
    llm: makeLlm(),
    tools: [
      buildFindPolicyTool(regionSido, regionSigungu),
      buildSearchPoliciesTool(regionSido),
      buildCheckEligibilityTool(ctx),
      buildBenefitInfoTool(),
      buildSaveVerdictTool(ctx, "lookup_and_check"),
    ],
    prompt: LOOKUP_SYSTEM_PROMPT,
  });
  const turnMessages = [...messages];
  let hint = policyQuery ? `정책명 후보: ${policyQuery}` : "";
  if (referenceMatchId) hint = `${hint} referenceMatchId=${referenceMatchId}`.trim();
  if (hint) turnMessages.push({ role: "system", content: hint });
  const result = await agent.invoke({ messages: turnMessages });
  return extractReply(result);
}

export async function runPolicyCompare(
  ctx: ProfileCtx,
  messages: ChatMessage[],
  compareTargets: string[],
): Promise<string> {
  const regionSido = typeof ctx.profileRow?.region_sido === "string" ? ctx.profileRow.region_sido : null;
  const regionSigungu = typeof ctx.profileRow?.region_sigungu === "string" ? ctx.profileRow.region_sigungu : null;
  const agent = createReactAgent({
    llm: makeLlm(),
    tools: [buildFindPolicyTool(regionSido, regionSigungu), buildCheckEligibilityTool(ctx), buildBenefitInfoTool(), buildSaveVerdictTool(ctx, "compare")],
    prompt: COMPARE_SYSTEM_PROMPT,
  });
  // Plan.compareTargets는 문자열 배열("match:<id>" 접두어로 재지칭 표현)이어야 하지만, Groq의
  // strict 스키마 강제가 항상 지켜지지 않아 가끔 {policyQuery, referenceMatchId} 객체를 그대로
  // 내보내기도 한다(직접 확인함) — 스키마 위반이어도 구조 자체는 유효하니 그대로 받아준다.
  const parsed = compareTargets.map((raw) => {
    if (typeof raw === "string") {
      return raw.startsWith("match:")
        ? { policyQuery: null, referenceMatchId: raw.slice("match:".length) }
        : { policyQuery: raw, referenceMatchId: null };
    }
    const obj = raw as { policyQuery?: string | null; referenceMatchId?: string | null };
    return { policyQuery: obj?.policyQuery ?? null, referenceMatchId: obj?.referenceMatchId ?? null };
  });
  const turnMessages = [...messages, { role: "system" as const, content: `비교 대상: ${JSON.stringify(parsed)}` }];
  const result = await agent.invoke({ messages: turnMessages });
  return extractReply(result);
}
