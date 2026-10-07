/**
 * 채용공고 카드 정보(주요 업무·지원 자격 1줄) LLM 정규화 수동 실행기 — 실제 로직은 src/services/normalizeJobs.ts.
 * 실행: npx tsx scripts/normalize_jobs.mts [상한건수=300]
 * 크론(/api/cron/discover)이 수집 직후 150건씩 자동으로도 돌린다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeJobCards } from "../src/services/normalizeJobs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    process.env[k.trim()] ??= rest.join("=").trim();
  }
}
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요"); process.exit(1); }
const limit = Number(process.argv[2] ?? 300);
normalizeJobCards(createClient(url, key, { auth: { persistSession: false } }), (m) => console.log(m), limit)
  .then((n) => console.log(`✅ ${n}건 정규화 완료`))
  .catch((e) => { console.error("❌", e.message); process.exit(1); });
