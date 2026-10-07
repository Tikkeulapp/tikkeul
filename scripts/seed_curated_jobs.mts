/**
 * 수기 큐레이션 공채 등록기 — scripts/data/curated_jobs.json → job_postings upsert.
 * 플랫폼 크롤링 대신, 기업 공식 채용 사이트에서 사람이 확인한 공채를 등록하는 경로.
 * 실행: npx tsx scripts/seed_curated_jobs.mts
 * 마감(deadline)이 지나면 검색 API가 자동으로 제외하므로 별도 정리는 불필요.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ncsCodesForCategoryText } from "../src/data/ncs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    process.env[k.trim()] ??= rest.join("=").trim();
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
  process.exit(1);
}

type CuratedJob = {
  slug: string; company: string; title: string;
  region_names: string[]; region_sidos: string[];
  hire_types: string[]; career: string | null; education: string | null;
  summary: string | null; requirements: string | null;
  pbanc_begin: string | null; deadline: string | null; deadline_time: string | null;
  detail_url: string; verified_from: string; extra_keywords?: string[];
};

const { jobs } = JSON.parse(readFileSync("scripts/data/curated_jobs.json", "utf-8")) as { jobs: CuratedJob[] };
const now = new Date().toISOString();

const rows = jobs.map((j) => {
  if (!/^https?:\/\//.test(j.detail_url)) throw new Error(`detail_url은 공식 페이지 절대 URL이어야 합니다: ${j.slug}`);
  return {
    job_id: `curated:${j.slug}`,
    source: "company", // 기업 공식 채널 기준으로 검증했으므로 company로 분류 (사기업 배지)
    title: j.title,
    company: j.company,
    region_names: j.region_names,
    region_sidos: j.region_sidos,
    is_national: j.region_sidos.length === 0,
    ncs_codes: ncsCodesForCategoryText([j.title, j.summary ?? "", ...(j.extra_keywords ?? [])].join(" ")),
    ncs_names: [],
    hire_types: j.hire_types,
    career: j.career,
    education: j.education,
    salary_text: null,
    headcount: null,
    summary: j.summary,
    requirements: j.requirements,
    pbanc_begin: j.pbanc_begin,
    deadline: j.deadline,
    deadline_time: j.deadline_time,
    detail_url: j.detail_url,
    search_text: [j.title, j.company, j.summary, ...(j.extra_keywords ?? []), `출처: ${j.verified_from}`].filter(Boolean).join(" | "),
    collected_at: now,
  };
});

const db = createClient(url, key, { auth: { persistSession: false } });
db.from("job_postings").upsert(rows, { onConflict: "job_id" })
  .then(({ error }) => {
    if (error) { console.error("❌", error.message); process.exit(1); }
    console.log(`✅ 큐레이션 공채 ${rows.length}건 upsert 완료:`);
    for (const r of rows) console.log(`  - ${r.company} | ${r.title} (마감 ${r.deadline ?? "상시"}) → ${r.detail_url}`);
  });
