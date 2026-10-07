/**
 * POST /api/jobs/search — 채용공고 조건 검색 (채용 페이지의 검색 시스템)
 * 입력: { sido?, ncs?, education?("무관"|"고졸"|"대졸"), career?("신입"), keyword? }
 * 마감 지난 공고 제외, 마감 임박순 정렬. LLM 없이 전부 코드 필터.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabase";
import { careerMatchesFilter, dday, expandKeyword, findKeywordEvidence, hireBuckets, isPublicOrg } from "@/data/ncs";
import { llmJson } from "@/services/llm";

const COLS = "job_id, source, title, company, region_names, region_sidos, is_national, ncs_codes, ncs_names, hire_types, career, education, salary_text, headcount, pbanc_begin, deadline, detail_url, search_text";
const COLS_T = COLS + ", deadline_time, summary, requirements";

/** 사전 미등록 키워드의 LLM 연관어 확장 — 검색어 '후보'만 생성 (매칭·근거는 코드가 검증).
 *  서버리스 인스턴스 생존 동안 키워드별 캐시로 중복 호출을 줄인다. */
const aiExpandCache = new Map<string, string[]>();
async function aiExpandKeyword(kw: string): Promise<string[]> {
  const hit = aiExpandCache.get(kw);
  if (hit) return hit;
  try {
    const out = await llmJson<{ terms: string[] }>(
      `한국 채용공고 검색어 확장기. 입력된 기술/자격/직무 키워드에 대해, 채용공고 '원문'에 실제로 쓰일 법한 연관 표기를 제안한다.
규칙: ① 같은 개념의 다른 표기와 하위/인접 직무만 — 상위 개념이나 범용어(관리, 사무 등) 금지 ② 2글자 이상 한국어 또는 영문 용어 ③ 최대 6개 ④ JSON만 출력: {"terms": ["..."]}`,
      `키워드: ${kw}`,
      300,
    );
    const terms = (out.terms ?? []).map((t) => String(t).trim()).filter((t) => t.length >= 2 && t.length <= 20).slice(0, 6);
    aiExpandCache.set(kw, terms);
    return terms;
  } catch {
    return []; // LLM 실패 시 조용히 리터럴 검색으로 폴백
  }
}

export async function POST(request: Request) {
  let body: { sido?: string | null; ncs?: string | null; education?: string | null; career?: string | null; hire?: string | null; org?: string | null; keyword?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  // deadline_time 컬럼이 아직 없는 DB(ALTER 전)에서도 동작하도록 프리플라이트
  const probe = await db.from("job_postings").select("deadline_time, summary, requirements").limit(1);
  const cols = probe.error ? COLS : COLS_T;

  // 키워드는 동의어로 확장해 OR 검색 (예: agent → AI·인공지능·에이전트·생성형).
  // 사전에 없는 단어(확장 결과가 입력 그대로 1개)는 LLM이 연관 검색어를 제안하는 폴백을 쓴다 —
  // LLM은 '검색어 후보'만 만들고, 실제 매칭·근거 검증은 아래 코드가 그대로 수행하므로
  // 환각 매칭은 불가능하다 (근거 게이팅이 걸러냄). 결과는 인스턴스 내 캐시.
  let keywords = expandKeyword(body.keyword);
  let aiExpanded = false;
  if (keywords.length === 1 && keywords[0].length >= 2) {
    const extra = await aiExpandKeyword(keywords[0]);
    if (extra.length > 0) {
      keywords = [...new Set([...keywords, ...extra])].slice(0, 12);
      aiExpanded = true;
    }
  }

  // 상시·채용시 마감(deadline null)도 포함, 마감 임박순(상시는 뒤로).
  // 접수 중 공고 전체를 덮어야 JS 후처리 필터·페이지네이션이 전수 기준으로 동작한다 —
  // Supabase는 요청당 1,000행까지만 주므로 1,000행씩 이어받는다 (안전 상한 4,000행).
  const buildQuery = (from: number, to: number) => {
    let q = db.from("job_postings").select(cols).or(`deadline.is.null,deadline.gte.${today}`).order("deadline", { ascending: true }).order("job_id", { ascending: true }).range(from, to);
    if (body.sido) q = q.or(`is_national.eq.true,region_sidos.cs.{${body.sido}}`);
    if (body.ncs) q = q.contains("ncs_codes", [body.ncs]);
    if (keywords.length) q = q.or(keywords.map((k) => `search_text.ilike.*${k}*`).join(","));
    return q;
  };

  // select(cols)가 동적 문자열이라 supabase-js 타입 추론이 안 됨 — 사용하는 필드만 명시
  type Out = { source: string; career: string | null; hire_types: string[] | null; education: string | null; deadline: string | null; deadline_time?: string | null; search_text: string | null; match?: { term: string; before: string; after: string } | null } & Record<string, unknown>;
  let rows: Out[] = [];
  for (let off = 0; off < 4000; off += 1000) {
    const { data, error } = await buildQuery(off, off + 999);
    if (error) return NextResponse.json({ error: `검색 실패: ${error.message}` }, { status: 500 });
    rows = rows.concat((data ?? []) as unknown as Out[]);
    if ((data ?? []).length < 1000) break;
  }

  // 키워드 검색이면 매칭 근거(어느 확장어가 어디에 걸렸는지)를 코드로 확정 —
  // ilike는 짧은 영문 토큰(AI 등)이 단어 '속' 철자에도 걸리므로, 단어 경계 검사를 통과한 공고만 남긴다.
  if (keywords.length) {
    rows = rows
      .map((r) => ({ ...r, match: findKeywordEvidence(r.search_text, keywords) }))
      .filter((r) => r.match);
  }
  if (body.career) rows = rows.filter((r) => careerMatchesFilter(r.career, body.career!));
  if (body.hire) rows = rows.filter((r) => (hireBuckets(r.hire_types, r.career) as string[]).includes(body.hire!));
  if (body.org === "공공기관") rows = rows.filter((r) => isPublicOrg(r.source, r.company as string | null));
  else if (body.org === "사기업") rows = rows.filter((r) => !isPublicOrg(r.source, r.company as string | null));
  if (body.education === "무관") rows = rows.filter((r) => !r.education || /무관|제한없음/.test(r.education));
  else if (body.education === "고졸") rows = rows.filter((r) => !r.education || !/대졸이상|학사이상|석사|박사/.test(r.education.replace(/\s/g, "")));

  // 원문 전체(search_text)는 응답에서 제거 — 근거 스니펫만 내려보낸다.
  // 클라이언트가 10건씩 페이지네이션하므로 필터 통과분 전체(쿼리 상한 300건)를 내려보낸다.
  const jobs = rows.map(({ search_text: _s, ...r }) => ({ deadline_time: null, ...r, dday: dday(r.deadline) }));
  return NextResponse.json({ jobs, total: rows.length, keywords, aiExpanded });
}
