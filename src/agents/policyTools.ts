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
import { classifyPolicyForUser, judgePolicy, saveMatchResult, type Verdict } from "@/lib/policyMatch";
import { ELIGIBILITY_CONDITIONS_NOT_DEFINED } from "@/lib/eligibility";
import { groqJson } from "@/lib/groq";
import { tavilySearch } from "@/lib/tavily";

export type ProfileCtx = {
  userId: string;
  profileRow: Record<string, unknown> | null;
  financeRow: Record<string, unknown> | null;
};

export function buildFindPolicyTool(regionSido: string | null = null, regionSigungu: string | null = null) {
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
        const { data: rows } = await q.limit(10);
        if (rows && rows.length > 0) {
          // 같은 제목으로 실제 수집 데이터(ontong/gov24)와 큐레이션 데모 정책(curated, 구조화
          // 자격조건 있음)이 동시에 잡힐 수 있다(예: "국민취업지원제도"가 5건) — 그중 curated가
          // 있으면 그걸 우선한다. 그래야 매번 다른 정책이 잡혀 판정이 들쭉날쭉해지지 않는다.
          const best = rows.find((r) => r.source === "curated") ?? rows[0];
          return JSON.stringify({ found: true, policy: best });
        }

        // 폴백: "토익 시험 응시료"처럼 정책명이 아닌 서술이면 키워드(동의어 포함)로 원문을 검색해 가장 관련 높은 1건
        const kws = searchKeywords(titleQuery);
        let q2 = db.from("policies").select("*");
        for (const k of kws.slice(0, 3)) q2 = q2.ilike("search_text", `%${k}%`);
        const { data: andRows } = await q2.limit(10);
        type Row = { title: string; search_text: string | null; is_national: boolean | null; region_sidos: string[] | null };
        const inRegion = (r: Row) => !regionSido || r.is_national || (r.region_sidos ?? []).includes(regionSido);
        let pool: Row[] = ((andRows ?? []) as Row[]).filter(inRegion);
        if (!pool.length) {
          // 거주지·전국 범위에서 키워드 OR로 넓게 (다른 지역 전용 정책이 1순위로 잡히지 않게 지역을 먼저 제한)
          const orExpr = kws.map((k) => `search_text.ilike.%${k}%`).join(",");
          let q3 = db.from("policies").select("*").or(orExpr);
          if (regionSido) q3 = q3.or(`is_national.eq.true,region_sidos.cs.{"${regionSido}"}`);
          const { data } = await q3.limit(60);
          pool = ((data ?? []) as Row[]);
        }
        if (!pool.length && andRows?.length) pool = andRows as Row[]; // 지역 내 후보가 전혀 없으면 타지역이라도 안내
        if (pool.length) {
          const scored = pool;
          const best = [...scored].sort((a, b) => {
            const gu = regionSigungu ? regionSigungu.replace(/(특례시|시|군|구)$/, "") : null;
            const sc = (r: { title: string; provider?: string | null; search_text: string | null; is_national: boolean | null }) => {
              let v = kws.filter((k) => r.title.includes(k)).length * 3 + kws.filter((k) => (r.search_text ?? "").includes(k)).length + (r.is_national ? 0 : 1);
              const prov = r.provider ?? "";
              if (gu && (prov.includes(gu) || r.title.includes(gu))) v += 5; // 사용자 시군구 정책 우선
              const m = prov.match(/(?:특별시|광역시|특별자치시|도|특별자치도)\s*([가-힣]+?)(?:특례시|시|군|구)(?=\s|$)/);
              if (m && gu && !m[1].startsWith(gu)) v -= 4; // 다른 시군구 전용은 감점
              return v;
            };
            return sc(b) - sc(a);
          })[0];
          return JSON.stringify({ found: true, policy: best, matched_by: "keywords", keywords: kws });
        }
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

const SEARCH_GENERIC = new Set(["정책", "지원", "제도", "혜택", "나한테", "저한테", "적합한", "있어", "있나요", "뭐", "무엇", "알려", "추천", "바뀌는게", "바뀌는", "받을", "수", "것", "거", "게", "있는", "내가", "저는", "나는", "다음주에", "이번", "관련"]);
const SEARCH_SYNONYMS: Record<string, string[]> = {
  실업보험: ["실업급여", "구직급여", "고용보험"], 실업: ["실업급여", "구직급여"], 정장: ["정장", "면접"], 토익: ["토익", "어학", "응시료"],
  시험: ["응시료", "자격증", "시험"], 자격증: ["자격증", "응시료"], 집: ["주거", "월세", "전세"], 이사: ["이사", "월세", "전세", "보증금", "주거"],
  월세: ["월세", "주거"], 취준: ["취업", "구직"], 취업: ["취업", "구직", "취업지원"], 수당: ["수당", "지원금"], 알바: ["아르바이트", "근로"],
  학원: ["교육", "훈련", "내일배움"], 교육: ["교육", "훈련"], 면접: ["면접", "정장", "면접수당"], 교통: ["교통비", "교통"], 대출: ["대출", "이자"],
};
const SEARCH_DEFAULT_KW = ["취업", "구직", "면접", "자격증", "응시료", "월세"];

/** 자유 질의 → 검색 키워드 (단어 분리 + 조사 제거 + 동의어 확장). 의미 있는 단어가 없으면 취준 기본 키워드 */
export function searchKeywords(query: string): string[] {
  const words = query.replace(/[%,()?!.]/g, " ").split(/\s+/).map((w) => w.replace(/(으로|에서|에게|까지|부터|이나|이랑|하고|으|로|은|는|이|가|을|를|의|에|도|만)$/, "")).filter((w) => w.length >= 2 && !SEARCH_GENERIC.has(w));
  const out: string[] = [];
  for (const w of words) for (const k of SEARCH_SYNONYMS[w] ?? [w]) if (!out.includes(k)) out.push(k);
  return (out.length ? out : SEARCH_DEFAULT_KW).slice(0, 8);
}

export function buildSearchPoliciesTool(regionSido: string | null) {
  return tool(
    async ({ query, topK }: { query: string; topK?: number }) => {
      const db = supabaseAdmin();
      const kws = searchKeywords(query);
      const today = new Date().toISOString().slice(0, 10);
      const openOr = `end_date.is.null,end_date.gte.${today},always_open.eq.true`;
      const COLS = "policy_id, title, provider, region_sidos, is_national, apply_url, search_text, end_date, always_open, source";
      type Row = { policy_id: string; title: string; provider: string | null; region_sidos: string[] | null; is_national: boolean | null; apply_url: string | null; search_text: string | null; end_date: string | null; always_open: boolean | null; source: string | null };
      // 키워드별로 거주지·전국 풀을 따로 조회 → 한 키워드가 후보를 독식하지 않게
      const pools: Promise<{ data: Row[] | null }>[] = [];
      for (const k of kws) {
        if (regionSido) pools.push(db.from("policies").select(COLS).contains("region_sidos", [regionSido]).eq("is_national", false).ilike("search_text", `%${k}%`).or(openOr).limit(20) as unknown as Promise<{ data: Row[] | null }>);
        pools.push(db.from("policies").select(COLS).eq("is_national", true).ilike("search_text", `%${k}%`).or(openOr).limit(15) as unknown as Promise<{ data: Row[] | null }>);
      }
      const seen = new Set<string>();
      const rows: Row[] = [];
      for (const r of await Promise.all(pools)) for (const x of r.data ?? []) if (!seen.has(x.policy_id)) { seen.add(x.policy_id); rows.push(x); }
      // 코드 점수화: 제목 일치 ×3 + 원문 키워드 수 + 거주지 정책 +1 + curated 출처 +2(같은 제목이
      // 실제 수집 데이터와 큐레이션 데모 정책 양쪽에 있을 때 항상 curated가 이기게), 마감·중복 제거
      const norm = (t: string) => t.replace(/\s|\(.*?\)|\[.*?\]|\d{4}년?|지원사업|지원|사업|모집|시험/g, "");
      const seenTitle = new Set<string>();
      const ranked = rows
        .map((r) => ({ r, sc: kws.filter((k) => r.title.includes(k)).length * 3 + kws.filter((k) => (r.search_text ?? "").includes(k)).length + (r.is_national ? 0 : 1) + (r.source === "curated" ? 2 : 0) }))
        .filter((x) => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .filter((x) => { const t = norm(x.r.title); if (seenTitle.has(t)) return false; seenTitle.add(t); return true; })
        .slice(0, topK ?? 8)
        .map(({ r }) => ({ policy_id: r.policy_id, title: r.title, provider: r.provider, region_sidos: r.region_sidos, is_national: r.is_national, apply_url: r.apply_url, end_date: r.end_date, always_open: r.always_open, search_text: (r.search_text ?? "").slice(0, 400) }));
      return JSON.stringify({ keywords: kws, results: ranked });
    },
    {
      name: "search_policies",
      description:
        "자유 텍스트 질의로 정책 후보를 검색합니다. 질의를 단어로 나눠 동의어를 보강하고, 거주지·전국 정책을 키워드별로 조회한 뒤 관련도 순으로 정렬합니다 (마감 지난 정책 제외). " +
        "결과는 {keywords, results[]} 형태입니다.",
      schema: z.object({
        query: z.string().describe("검색 질의 (사용자 문장 그대로여도 됨)"),
        topK: z.number().optional().describe("최대 개수 (기본 8)"),
      }),
    },
  );
}

const WEB_EXTRACT_PROMPT = `다음 웹페이지 제목·요약에서 청년/취준생 지원정책 정보를 JSON으로 추출:
{"is_policy": true|false, "title": "", "provider": "", "region_sido": "시도명 또는 null", "benefit": "혜택 요약", "target": "대상 요약"}
정책 공고가 아니면 is_policy=false.`;

/** DB 검색이 0건일 때만 쓰는 실시간 웹검색 폴백. src/app/api/cron/discover/route.ts의
 * 웹검색(B경로)과 같은 안전 원칙 — go.kr/or.kr 도메인만, 결과는 policy_discovery_queue에도
 * 큐잉해 나중에 검토·승격 가능하게 남김. 이 결과는 policies 테이블에 없으므로 절대
 * save_match로 저장하면 안 된다(도구 설명·에이전트 프롬프트 양쪽에 명시). */
export function buildWebSearchFallbackTool() {
  return tool(
    async ({ query }: { query: string }) => {
      const results = await tavilySearch(query, { maxResults: 5 });
      if (results.length === 0) return JSON.stringify([]);

      const db = supabaseAdmin();
      const items: { title: string; url: string; snippet: string; verified: false }[] = [];
      for (const r of results) {
        if (!r.title || !r.url) continue;
        let extracted: unknown = null;
        try {
          extracted = await groqJson(WEB_EXTRACT_PROMPT, `제목: ${r.title}\n요약: ${r.content.slice(0, 600)}\nURL: ${r.url}`, 800);
        } catch {
          /* 추출 실패해도 원문 스니펫은 그대로 큐잉 */
        }
        // policy_discovery_queue.url의 유니크 인덱스가 부분 인덱스(where url is not null)라서
        // .upsert({onConflict:"url"})가 "there is no unique or exclusion constraint matching
        // the ON CONFLICT specification"(42P10)로 실패한다 — 직접 확인함. 스키마를 안 건드리고
        // select-then-insert로 우회한다(discover 크론의 웹검색 경로에도 같은 문제가 있음, 별도 수정 필요).
        const { data: existing } = await db
          .from("policy_discovery_queue")
          .select("id")
          .eq("url", r.url)
          .maybeSingle();
        if (!existing) {
          const { error: insertError } = await db.from("policy_discovery_queue").insert({
            found_by: "web:tavily-livesearch",
            trigger_context: query,
            url: r.url,
            title: r.title,
            snippet: r.content.slice(0, 500),
            extracted,
            status: "new",
          });
          if (insertError) console.error("policy_discovery_queue 저장 실패:", insertError.message);
        }
        items.push({ title: r.title, url: r.url, snippet: r.content.slice(0, 300), verified: false });
      }
      return JSON.stringify(items);
    },
    {
      name: "web_search_fallback",
      description:
        "search_policies가 0건일 때만 쓰는 실시간 웹검색. 결과는 미검증(policies 테이블에 없음)이므로 " +
        "save_match를 절대 호출하지 말고, 최종 답변에서 반드시 '⚠️ 웹 검색 결과 — 미검증, 공식 사이트에서 " +
        "꼭 확인하세요'라고 명시하세요.",
      schema: z.object({ query: z.string().describe("검색할 질의") }),
    },
  );
}

/** classifyPolicyForUser(규칙엔진)로 판정 불가(구조화 조건 없음)일 때의 공용 LLM 1차 판정 —
 * check_eligibility_detail(사용자에게 보여줌)과 save_*(DB에 저장함)가 이걸 똑같이 호출해야
 * "화면엔 가능이라 해놓고 저장은 insufficient_info로 되는" 불일치가 안 생긴다(실제로 있었던 버그:
 * save 쪽만 이 판정을 안 쓰고 무조건 insufficient_info를 반환하고 있었음). */
async function judgeWhenUnstructured(ctx: ProfileCtx, policyId: string) {
  const db = supabaseAdmin();
  const { data: pol } = await db.from("policies").select("title, provider, region_sidos, is_national, search_text").eq("policy_id", policyId).maybeSingle();
  const row = ctx.profileRow ?? {};
  const birth = typeof row.birth_date === "string" ? row.birth_date : null;
  const age = birth ? new Date().getFullYear() - Number(birth.slice(0, 4)) : null;
  const summary = {
    나이: age, 거주지: `${row.region_sido ?? ""} ${row.region_sigungu ?? ""}`.trim() || null, 학력: row.education_status ?? null,
    취업상태: row.employment_status ?? null, 주거형태: row.housing_type ?? null, 가구중위소득구간: row.income_bracket ?? null,
    월평균근로소득: ctx.financeRow?.monthly_work_income_krw ?? null, 수급중수당: ctx.financeRow?.receiving_benefits ?? null,
  };
  try {
    const v = await judgePolicy({
      profileSummary: summary, profileRow: null, financeRow: null, policyId: null,
      policy: { title: pol?.title ?? policyId, region: pol?.is_national ? "전국" : (pol?.region_sidos ?? []).join(", "), target: (pol?.search_text ?? "").slice(0, 700), content: pol?.provider ?? undefined } as never,
    });
    const status = v.eligibility === "LIKELY" ? "confirmed" as const : v.eligibility === "UNLIKELY" ? "excluded" as const : "insufficient_info" as const;
    return { status, missingFields: v.missing_information ?? [], reasons: v.reasons ?? [], evidenceTodo: v.evidence_todo ?? [], score: v.score };
  } catch {
    return { status: "insufficient_info" as const, missingFields: [ELIGIBILITY_CONDITIONS_NOT_DEFINED], reasons: [] as string[], evidenceTodo: [] as string[], score: undefined };
  }
}

export function buildCheckEligibilityTool(ctx: ProfileCtx) {
  return tool(
    async ({ policyId }: { policyId: string }) => {
      const classified = await classifyPolicyForUser(policyId, ctx.profileRow, ctx.financeRow);
      if (!classified) {
        // 구조화 자격조건(policy_eligibility)이 없는 정책(대부분) → 정책 원문 + 프로필로 LLM 1차 판정 (자세히보기의 AI 판정과 같은 경로)
        const j = await judgeWhenUnstructured(ctx, policyId);
        return JSON.stringify({
          status: j.status, checks: [], missingFields: j.missingFields, reasons: j.reasons, evidence_todo: j.evidenceTodo, score: j.score,
          basis: "llm_fallback", note: "이 정책은 구조화 자격조건이 아직 없어 정책 원문과 프로필을 대조한 AI 1차 판정입니다. 최종 자격은 공식 기관 확인.",
        });
      }
      return JSON.stringify(classified.result);
    },
    {
      name: "check_eligibility_detail",
      description:
        "이 정책의 자격 조건을 확인합니다. 구조화 조건이 있으면 규칙엔진 항목별 결과를, 없으면(basis=llm_fallback) 정책 원문과 프로필을 대조한 AI 1차 판정(reasons·evidence_todo 포함)을 반환합니다. " +
        "status(confirmed/excluded/insufficient_info)를 뒤집지 말고 그대로 인용하고, reasons가 있으면 그 근거를 사용자에게 풀어 설명하세요. 내부 필드명(eligibility_conditions_not_defined 등)은 사용자에게 노출하지 마세요.",
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
  if (!classified) {
    const j = await judgeWhenUnstructured(ctx, policyId);
    return { status: j.status, missingFields: j.missingFields };
  }
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
