/**
 * Policy Agent(search/lookup_and_check/compare) 공용 도구.
 * check_eligibility_detail은 규칙엔진만 실행하는 읽기전용 도구다 — 여기서 LLM을 부르지 않는다.
 * 바깥의 ReAct 에이전트(policyAgent.ts) 자신이 설명을 생성하므로, 도구 안에서 또 Groq를
 * 부르면 판정 근거를 이중으로 만드는 셈이라 안 한다.
 * save_* 도구는 저장 직전 규칙엔진을 다시 돌려 최종 판정을 검증한다 — 에이전트(LLM)가 인자로
 * 넘긴 값이 아니라 여기서 재계산한 값이 진실이다.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";
import { classifyPolicyForUser, saveMatchResult, type Verdict } from "@/lib/policyMatch";

export type ProfileCtx = {
  userId: string;
  profileRow: Record<string, unknown> | null;
  financeRow: Record<string, unknown> | null;
};

export function buildFindPolicyTool() {
  return tool(
    async ({ titleQuery, referenceMatchId }: { titleQuery?: string | null; referenceMatchId?: string | null }) => {
      const db = supabaseAdmin();
      if (referenceMatchId) {
        const { data: match } = await db
          .from("user_policy_matches")
          .select("policy_id")
          .eq("match_id", referenceMatchId)
          .maybeSingle();
        if (!match) return JSON.stringify({ found: false, reason: "no such match_id" });
        const { data: policy } = await db.from("policies").select("*").eq("policy_id", match.policy_id).maybeSingle();
        return JSON.stringify({ found: !!policy, policy });
      }
      if (titleQuery) {
        // 전체 문구 그대로는 어순이 다르면 실패하기 쉬움(예: "중랑구 자격증 응시료 지원" vs 실제
        // "중랑구 미취업청년 자격증 응시료 지원") — 단어별로 나눠 title에 전부 포함되는지(AND) 확인.
        const words = titleQuery.split(/\s+/).map((w) => w.replace(/[%,()]/g, "")).filter(Boolean);
        let q = db.from("policies").select("*");
        for (const w of words) q = q.ilike("title", `%${w}%`);
        const { data: rows } = await q.limit(1);
        if (rows && rows.length > 0) return JSON.stringify({ found: true, policy: rows[0] });

        const { data: fallback } = await db
          .from("policies")
          .select("*")
          .ilike("search_text", `%${titleQuery.replace(/[%,()]/g, "")}%`)
          .limit(1);
        if (fallback && fallback.length > 0) return JSON.stringify({ found: true, policy: fallback[0] });
      }
      return JSON.stringify({ found: false });
    },
    {
      name: "find_policy",
      description:
        "정책 1건을 특정합니다. referenceMatchId가 있으면 그것으로(직전 결과 재지칭, title 재검색 생략), " +
        "없으면 titleQuery로 제목 검색(신규 지칭)합니다.",
      schema: z.object({
        titleQuery: z.string().nullable().optional().describe("정책명/제목 텍스트"),
        referenceMatchId: z.string().nullable().optional().describe("직전 결과의 match_id"),
      }),
    },
  );
}

// 질의 전체 문구를 통짜로 ilike하면 "면접 준비하는데 도움되는 지원금" 같은 자연어 문장이
// search_text에 그대로 있을 리 없어 거의 항상 0건이 나온다(실제로 확인된 문제 — 모델도
// 재시도 없이 바로 "못 찾음"으로 답해버림). 단어 단위로 쪼개 OR 매칭한다
// (src/app/api/event-match/route.ts의 키워드 추출과 같은 원칙).
const GENERIC_WORDS = new Set([
  "준비", "작성", "지원", "신청", "등록", "참여", "운영", "안내", "프로그램",
  "청년", "사업", "활동", "일정", "도움", "있어", "관련", "혜택", "제도", "있나요",
]);

function extractKeywords(query: string): string[] {
  const words = query
    .replace(/[%,()?!~]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !GENERIC_WORDS.has(w));
  return words.length > 0 ? words.slice(0, 6) : [query.replace(/[%,()]/g, "").trim()];
}

export function buildSearchPoliciesTool(regionSido: string | null) {
  return tool(
    async ({ query, topK }: { query: string; topK?: number }) => {
      const keywords = extractKeywords(query);
      const kwOr = keywords.map((k) => `search_text.ilike.%${k}%`).join(",");
      let q = supabaseAdmin()
        .from("policies")
        .select("policy_id, title, provider, region_sidos, is_national, apply_url, search_text")
        .or(kwOr);
      if (regionSido) q = q.or(`is_national.eq.true,region_sidos.cs.{"${regionSido}"}`);
      const { data } = await q.limit(topK ?? 5);
      return JSON.stringify(data ?? []);
    },
    {
      name: "search_policies",
      description:
        "자유 텍스트 질의로 정책 후보를 키워드 검색합니다 (pgvector 도입 전까지의 임시 구현 — ilike 기반, " +
        "검색추천_3단설계.md의 v1과 동일한 방식). 문장을 그대로 넘겨도 내부에서 단어 단위로 쪼개 검색합니다.",
      schema: z.object({
        query: z.string().describe("검색 질의 (문장 그대로 넘겨도 됨)"),
        topK: z.number().optional().describe("최대 개수 (기본 5)"),
      }),
    },
  );
}

export function buildCheckEligibilityTool(ctx: ProfileCtx) {
  return tool(
    async ({ policyId }: { policyId: string }) => {
      const classified = await classifyPolicyForUser(policyId, ctx.profileRow, ctx.financeRow);
      if (!classified) {
        return JSON.stringify({
          status: "insufficient_info",
          missingFields: ["eligibility_conditions_not_defined"],
          checks: [],
        });
      }
      return JSON.stringify(classified.result);
    },
    {
      name: "check_eligibility_detail",
      description:
        "이 정책의 eligibility_json 조건을 항목별로 규칙엔진이 확인한 결과를 읽기 전용으로 반환합니다. " +
        "이 결과의 status(confirmed/excluded/insufficient_info)를 뒤집지 말고 그대로 인용해 설명하세요.",
      schema: z.object({ policyId: z.string() }),
    },
  );
}

export function buildBenefitInfoTool() {
  return tool(
    async ({ policyId }: { policyId: string }) => {
      const { data } = await supabaseAdmin()
        .from("policy_eligibility")
        .select("benefit_type, benefit_amount_krw, benefit_period, eligibility_text")
        .eq("policy_id", policyId)
        .maybeSingle();
      return JSON.stringify(data ?? { benefit_type: null, benefit_amount_krw: null, benefit_period: null, eligibility_text: null });
    },
    {
      name: "get_benefit_info",
      description:
        "정책의 구조화된 혜택 정보(benefit_type/benefit_amount_krw/benefit_period)를 읽습니다. " +
        "금액·기간은 이 값을 그대로 인용하고 원문에서 다시 추측하지 마세요.",
      schema: z.object({ policyId: z.string() }),
    },
  );
}

async function computeVerdictForSave(ctx: ProfileCtx, policyId: string) {
  const classified = await classifyPolicyForUser(policyId, ctx.profileRow, ctx.financeRow);
  if (!classified) return { status: "insufficient_info" as const, missingFields: ["eligibility_conditions_not_defined"] };
  return { status: classified.result.status, missingFields: classified.result.missingFields };
}

/** search 모드 전용 — 규칙엔진이 excluded면 저장을 거부한다 (finance/의 4-1 step 5와 동일 원칙:
 * 확정 불가 후보는 결과에서 제외). */
export function buildSaveSearchMatchTool(ctx: ProfileCtx) {
  return tool(
    async ({ policyId, reason, matchScore }: { policyId: string; reason: string; matchScore?: number }) => {
      const { status, missingFields } = await computeVerdictForSave(ctx, policyId);
      if (status === "excluded") {
        return JSON.stringify({ saved: false, status, note: "규칙엔진이 제외 판정 — 저장하지 않음, 다른 후보로 넘어가세요" });
      }
      const verdict: Verdict = {
        score: matchScore ?? 50,
        eligibility: status === "confirmed" ? "LIKELY" : "NEEDS_CHECK",
        reasons: [reason],
        missing_information: missingFields,
        evidence_todo: [],
      };
      await saveMatchResult({ userId: ctx.userId, policyId, matchMode: "search", verdict });
      return JSON.stringify({ saved: true, status });
    },
    {
      name: "save_match",
      description:
        "search 모드 매칭 결과를 저장합니다. 규칙엔진이 'excluded'로 판단하면 저장하지 않고 다음 후보로 " +
        "넘어가세요. reason은 이 정책이 왜 적합한지(또는 어떤 정보가 더 필요한지) 한국어로 설명합니다.",
      schema: z.object({
        policyId: z.string(),
        reason: z.string(),
        matchScore: z.number().optional().describe("0~100 관련도"),
      }),
    },
  );
}

/** lookup_and_check/compare 전용 — excluded도 저장한다(status=dismissed). 사용자가 정책 1건을
 * 콕 집어 물었으니 "안 됩니다"라는 확답 자체가 결과다 (search처럼 숨길 이유가 없다). */
export function buildSaveVerdictTool(ctx: ProfileCtx, matchMode: "lookup_and_check" | "compare") {
  return tool(
    async ({ policyId, reason }: { policyId: string; reason: string }) => {
      const { status, missingFields } = await computeVerdictForSave(ctx, policyId);
      const verdict: Verdict = {
        score: status === "confirmed" ? 90 : status === "excluded" ? 10 : 50,
        eligibility: status === "confirmed" ? "LIKELY" : status === "excluded" ? "UNLIKELY" : "NEEDS_CHECK",
        reasons: [reason],
        missing_information: missingFields,
        evidence_todo: [],
      };
      await saveMatchResult({ userId: ctx.userId, policyId, matchMode, verdict });
      return JSON.stringify({ saved: true, status });
    },
    {
      name: matchMode === "compare" ? "save_compare_result" : "save_lookup_result",
      description:
        matchMode === "compare"
          ? "비교 대상 정책 1건의 판정을 저장합니다. 비교 대상마다 한 번씩 호출하세요."
          : "이 정책 1건의 최종 판정을 저장합니다. 규칙엔진 결과(confirmed/excluded/insufficient_info)를 그대로 반영하세요.",
      schema: z.object({ policyId: z.string(), reason: z.string() }),
    },
  );
}
