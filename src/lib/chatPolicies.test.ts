import { test } from "node:test";
import assert from "node:assert/strict";
import { chatPoliciesFromAgentRun } from "./chatPolicies";

const row = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  policy_id: id, title, provider: "고용노동부", region_sidos: null, is_national: true,
  apply_url: `https://example.go.kr/${id}`, end_date: null, always_open: true, ...extra,
});
const ai = (calls: { id: string; name: string; args: Record<string, unknown> }[]) => ({ content: "", tool_calls: calls });
const toolMsg = (id: string, payload: unknown) => ({ tool_call_id: id, content: JSON.stringify(payload) });

test("chatPoliciesFromAgentRun: search_policies 후보 중 답변에 언급된 정책만, 답변 순서대로", () => {
  const msgs = [
    ai([{ id: "c1", name: "search_policies", args: { query: "지원" } }]),
    toolMsg("c1", { keywords: [], results: [row("a", "국민취업지원제도"), row("b", "국민내일배움카드"), row("c", "햇살론유스")] }),
  ];
  const reply = "1. **햇살론유스** — 저금리\n2. **국민취업지원제도** — 수당";
  const out = chatPoliciesFromAgentRun(msgs, reply);
  assert.deepEqual(out.map((p) => p.policyId), ["c", "a"]);
  assert.deepEqual(out[0], {
    policyId: "c", title: "햇살론유스", provider: "고용노동부", region: "전국",
    applyUrl: "https://example.go.kr/c", endDate: null, alwaysOpen: true,
  });
});

test("chatPoliciesFromAgentRun: 공백·괄호·연도 표기 차이는 무시하고 매칭", () => {
  const msgs = [
    ai([{ id: "c1", name: "search_policies", args: {} }]),
    toolMsg("c1", { results: [row("a", "[중랑구] 미취업청년 자격증 응시료 지원"), row("b", "2026년 서울 청년수당")] }),
  ];
  const out = chatPoliciesFromAgentRun(msgs, "- 중랑구 미취업청년 자격증 응시료지원\n- 서울 청년수당");
  assert.deepEqual(out.map((p) => p.policyId), ["a", "b"]);
});

test("chatPoliciesFromAgentRun: find_policy 결과도 후보, 지역 정책은 시도명을 region으로", () => {
  const msgs = [
    ai([{ id: "f1", name: "find_policy", args: { titleQuery: "청년수당" } }]),
    toolMsg("f1", { found: true, policy: row("s", "서울 청년수당", { is_national: false, region_sidos: ["서울특별시"], always_open: null, end_date: "2026-11-30" }) }),
  ];
  const [p] = chatPoliciesFromAgentRun(msgs, "**서울 청년수당**은 신청 가능합니다.");
  assert.equal(p.region, "서울특별시");
  assert.equal(p.endDate, "2026-11-30");
  assert.equal(p.alwaysOpen, false);
});

test("chatPoliciesFromAgentRun: 규칙엔진이 excluded로 판정한 정책은 언급돼도 제외", () => {
  const msgs = [
    ai([{ id: "c1", name: "search_policies", args: {} }]),
    toolMsg("c1", { results: [row("a", "국민취업지원제도"), row("b", "국민내일배움카드")] }),
    ai([{ id: "e1", name: "check_eligibility_detail", args: { policyId: "a" } }, { id: "e2", name: "check_eligibility_detail", args: { policyId: "b" } }]),
    toolMsg("e1", { status: "excluded" }),
    toolMsg("e2", { status: "insufficient_info" }),
  ];
  const out = chatPoliciesFromAgentRun(msgs, "국민취업지원제도는 대상이 아니고, 국민내일배움카드는 확인 필요");
  assert.deepEqual(out.map((p) => p.policyId), ["b"]);
});

test("chatPoliciesFromAgentRun: 언급 안 된 후보·깨진 JSON·제목 없는 행·너무 짧은 제목은 무시", () => {
  const msgs = [
    ai([{ id: "c1", name: "search_policies", args: {} }, { id: "c2", name: "search_policies", args: {} }]),
    toolMsg("c1", { results: [row("a", "국민취업지원제도"), { policy_id: "x" }, row("s", "수당")] }),
    toolMsg("c2", "not json{"),
    { tool_call_id: "c2", content: "not json{" },
  ];
  assert.deepEqual(chatPoliciesFromAgentRun(msgs, "관련 정책을 찾지 못했습니다. 수당은 없어요"), []);
});

test("chatPoliciesFromAgentRun: 같은 정책 중복 제거 + 최대 개수 제한", () => {
  const titles = ["가나다라정책", "마바사아정책", "자차카타정책", "파하가나정책"];
  const msgs = [
    ai([{ id: "c1", name: "search_policies", args: {} }, { id: "c2", name: "find_policy", args: {} }]),
    toolMsg("c1", { results: titles.map((t, i) => row(String(i), t)) }),
    toolMsg("c2", { found: true, policy: row("0", titles[0]) }),
  ];
  const out = chatPoliciesFromAgentRun(msgs, titles.join(", "), 3);
  assert.deepEqual(out.map((p) => p.policyId), ["0", "1", "2"]);
});
