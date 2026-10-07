/**
 * 챗봇 답변에 언급된 DB 정책 추출 — Policy Agent(ReAct) 실행 기록에서 도구가 돌려준 정책 행을 모으고,
 * 최종 답변 텍스트에 제목이 나온 것만 골라 "마이티끌에 담기" 카드로 넘긴다.
 * LLM이 정책 ID를 직접 내보내게 하지 않는다 — 후보는 도구(DB 조회) 결과에서만, 선별은 제목 문자열 대조로.
 * 규칙엔진이 excluded로 판정한 정책은 답변에 "대상 아님"으로 언급돼도 담기 대상에서 뺀다.
 */
import type { ChatPolicy } from "@/types/chat";

/** LangChain 메시지에서 쓰는 필드만 — AIMessage.tool_calls, ToolMessage.tool_call_id·content */
export type AgentRunMessage = {
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: { id?: string; name: string; args: Record<string, unknown> }[];
};

type PolicyRow = {
  policy_id?: unknown;
  title?: unknown;
  provider?: unknown;
  region_sidos?: unknown;
  is_national?: unknown;
  apply_url?: unknown;
  end_date?: unknown;
  always_open?: unknown;
};

const VERDICT_TOOLS = new Set(["check_eligibility_detail", "save_match", "save_lookup_result", "save_compare_result"]);
const MIN_TITLE_LEN = 4; // "수당"처럼 짧은 제목은 우연 일치가 많아 제외

/** 공백·문장부호·괄호 기호·연도 표기 제거 — "[중랑구] 2026년 ○○ 지원" ≈ "중랑구 ○○지원" */
const normalize = (s: string) => s.replace(/\d{4}년도?/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();

function parseJson(content: unknown): unknown {
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function toChatPolicy(r: PolicyRow): ChatPolicy | null {
  if (typeof r.policy_id !== "string" || typeof r.title !== "string" || !r.policy_id || !r.title) return null;
  const sidos = Array.isArray(r.region_sidos) ? r.region_sidos.filter((x): x is string => typeof x === "string") : [];
  return {
    policyId: r.policy_id,
    title: r.title,
    provider: typeof r.provider === "string" ? r.provider : null,
    region: r.is_national === true || sidos.length === 0 ? "전국" : sidos.join(", "),
    applyUrl: typeof r.apply_url === "string" && r.apply_url ? r.apply_url : null,
    endDate: typeof r.end_date === "string" ? r.end_date : null,
    alwaysOpen: r.always_open === true,
  };
}

export function chatPoliciesFromAgentRun(messages: AgentRunMessage[], reply: string, max = 5): ChatPolicy[] {
  const calls = new Map<string, { name: string; args: Record<string, unknown> }>();
  for (const m of messages) for (const c of m.tool_calls ?? []) if (c.id) calls.set(c.id, { name: c.name, args: c.args ?? {} });

  const candidates = new Map<string, ChatPolicy>();
  const excluded = new Set<string>();
  const addRow = (r: unknown) => {
    if (!r || typeof r !== "object") return;
    const p = toChatPolicy(r as PolicyRow);
    if (p && !candidates.has(p.policyId)) candidates.set(p.policyId, p);
  };

  for (const m of messages) {
    if (!m.tool_call_id) continue;
    const call = calls.get(m.tool_call_id);
    const out = parseJson(m.content) as Record<string, unknown> | null;
    if (!call || !out || typeof out !== "object") continue;
    if (call.name === "search_policies" && Array.isArray(out.results)) out.results.forEach(addRow);
    else if (call.name === "find_policy" && out.found === true) addRow(out.policy);
    else if (VERDICT_TOOLS.has(call.name) && out.status === "excluded" && typeof call.args.policyId === "string") excluded.add(call.args.policyId);
  }

  const normReply = normalize(reply);
  return [...candidates.values()]
    .filter((p) => !excluded.has(p.policyId))
    .map((p) => ({ p, key: normalize(p.title) }))
    .filter(({ key }) => key.length >= MIN_TITLE_LEN)
    .map(({ p, key }) => ({ p, at: normReply.indexOf(key) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map(({ p }) => p);
}
