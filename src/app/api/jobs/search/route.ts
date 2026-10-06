/**
 * POST /api/jobs/search — 채용공고 조건 검색 (채용 페이지의 검색 시스템)
 * 입력: { sido?, ncs?, education?("무관"|"고졸"|"대졸"), career?("신입"), keyword? }
 * 마감 지난 공고 제외, 마감 임박순 정렬. LLM 없이 전부 코드 필터.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { careerMatchesFilter, dday, expandKeyword, findKeywordEvidence, hireBuckets, isPublicOrg } from "@/data/ncs";

const COLS = "job_id, source, title, company, region_names, region_sidos, is_national, ncs_codes, ncs_names, hire_types, career, education, salary_text, headcount, pbanc_begin, deadline, detail_url, search_text";
const COLS_T = COLS + ", deadline_time, summary, requirements";

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

  // 키워드는 동의어로 확장해 OR 검색 (예: agent → AI·인공지능·에이전트·생성형)
  const keywords = expandKeyword(body.keyword);

  // 상시·채용시 마감(deadline null)도 포함, 마감 임박순(상시는 뒤로)
  let q = db.from("job_postings").select(cols).or(`deadline.is.null,deadline.gte.${today}`).order("deadline", { ascending: true }).limit(300);
  if (body.sido) q = q.or(`is_national.eq.true,region_sidos.cs.{${body.sido}}`);
  if (body.ncs) q = q.contains("ncs_codes", [body.ncs]);
  if (keywords.length) q = q.or(keywords.map((k) => `search_text.ilike.*${k}*`).join(","));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `검색 실패: ${error.message}` }, { status: 500 });

  // select(cols)가 동적 문자열이라 supabase-js 타입 추론이 안 됨 — 사용하는 필드만 명시
  type Out = { source: string; career: string | null; hire_types: string[] | null; education: string | null; deadline: string | null; deadline_time?: string | null; search_text: string | null; match?: { term: string; before: string; after: string } | null } & Record<string, unknown>;
  let rows = (data ?? []) as unknown as Out[];

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

  // 원문 전체(search_text)는 응답에서 제거 — 근거 스니펫만 내려보낸다
  const jobs = rows.slice(0, 100).map(({ search_text: _s, ...r }) => ({ deadline_time: null, ...r, dday: dday(r.deadline) }));
  return NextResponse.json({ jobs, total: rows.length, keywords });
}
