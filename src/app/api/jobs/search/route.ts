/**
 * POST /api/jobs/search — 채용공고 조건 검색 (채용 페이지의 검색 시스템)
 * 입력: { sido?, ncs?, education?("무관"|"고졸"|"대졸"), career?("신입"), keyword? }
 * 마감 지난 공고 제외, 마감 임박순 정렬. LLM 없이 전부 코드 필터.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { careerOpenToNewcomer, dday } from "@/data/ncs";

const COLS = "job_id, title, company, region_names, region_sidos, is_national, ncs_codes, ncs_names, hire_types, career, education, headcount, pbanc_begin, deadline, detail_url";

export async function POST(request: Request) {
  let body: { sido?: string | null; ncs?: string | null; education?: string | null; career?: string | null; keyword?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  let q = db.from("job_postings").select(COLS).gte("deadline", today).order("deadline", { ascending: true }).limit(300);
  if (body.sido) q = q.or(`is_national.eq.true,region_sidos.cs.{${body.sido}}`);
  if (body.ncs) q = q.contains("ncs_codes", [body.ncs]);
  if (body.keyword?.trim()) q = q.ilike("search_text", `%${body.keyword.trim()}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: `검색 실패: ${error.message}` }, { status: 500 });

  let rows = data ?? [];
  if (body.career === "신입") rows = rows.filter((r) => careerOpenToNewcomer(r.career));
  if (body.education === "무관") rows = rows.filter((r) => !r.education || /무관|제한없음/.test(r.education));
  else if (body.education === "고졸") rows = rows.filter((r) => !r.education || !/대졸이상|학사이상|석사|박사/.test(r.education.replace(/\s/g, "")));

  const jobs = rows.slice(0, 100).map((r) => ({ ...r, dday: dday(r.deadline) }));
  return NextResponse.json({ jobs, total: rows.length });
}
