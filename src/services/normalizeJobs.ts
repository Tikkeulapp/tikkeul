/**
 * 채용공고 카드 정보 LLM 정규화 (서버 전용, 작업용 LLM = Groq).
 * 원문이 길거나 비어 있는 공고의 '주요 업무'·'지원 자격'을 각 1줄(≤60자)로 다듬어
 * summary / requirements 컬럼에 저장한다. 검색·근거 매칭에 쓰는 search_text는 건드리지 않는다.
 * 규칙: 원문에 없는 내용은 만들지 않는다(없으면 null). 일일 호출 상한을 둬 무료 쿼터를 지킨다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { llmJson } from "@/services/llm";

const SYSTEM = `당신은 한국 채용공고를 카드 형식으로 요약하는 도구입니다. 각 공고에 대해 아래 JSON만 출력하세요.
{"items":[{"job_id":"...","summary":"핵심 업무 1줄(최대 60자, 명사형으로 끝맺음)","requirements":"핵심 지원 자격 1줄(최대 60자)"}]}
규칙: ① 반드시 공고 원문에 있는 내용만 사용 — 추측·보강 금지, 해당 정보가 없으면 null ② 불릿·머리기호·"[공통]" 같은 머리말 제거
③ 자격은 학력/경력/자격증/병역 중 공고가 명시한 핵심만 ④ 모든 job_id를 빠짐없이 포함`;

type Row = { job_id: string; title: string; company: string | null; summary: string | null; requirements: string | null; search_text: string | null };
type Out = { items: { job_id: string; summary: string | null; requirements: string | null }[] };

const needs = (r: Row) => !r.summary || r.summary.length > 90 || !r.requirements || r.requirements.length > 90;
const trimLine = (s: unknown, max = 80) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t && t !== "null" ? t.slice(0, max) : null;
};

/** 정규화가 필요한 접수 중 공고를 최대 limit건 골라 LLM으로 다듬고 저장. 반환: 처리 건수 */
export async function normalizeJobCards(db: SupabaseClient, log: (m: string) => void, limit = 200, batchSize = 6): Promise<number> {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("job_postings")
    .select("job_id, title, company, summary, requirements, search_text")
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("deadline", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`normalize 조회 실패: ${error.message}`);
  const targets = ((data ?? []) as Row[]).filter(needs).filter((r) => (r.search_text ?? "").length > 40).slice(0, limit);
  log(`normalize: 대상 ${targets.length}건 (상한 ${limit})`);

  let done = 0;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const user = batch
      .map((r) => `### job_id: ${r.job_id}\n제목: ${r.title}\n회사: ${r.company ?? ""}\n요약: ${(r.summary ?? "").slice(0, 300)}\n자격: ${(r.requirements ?? "").slice(0, 300)}\n원문: ${(r.search_text ?? "").slice(0, 500)}`)
      .join("\n\n");
    try {
      const out = await llmJson<Out>(SYSTEM, user, 1200, { purpose: "task" });
      for (const it of out.items ?? []) {
        const row = batch.find((r) => r.job_id === it.job_id);
        if (!row) continue;
        const summary = trimLine(it.summary) ?? (row.summary ? row.summary.slice(0, 90) : null);
        const requirements = trimLine(it.requirements) ?? (row.requirements ? row.requirements.slice(0, 90) : null);
        const { error: upErr } = await db.from("job_postings").update({ summary, requirements }).eq("job_id", row.job_id);
        if (!upErr) done++;
      }
    } catch (e) {
      log(`normalize 배치 실패(${i / batchSize + 1}): ${e instanceof Error ? e.message : String(e)}`);
      // 레이트리밋이면 잠시 쉬고 계속
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  log(`normalize: ${done}건 저장`);
  return done;
}
