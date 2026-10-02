/**
 * 채용공고 수동 수집 실행기 — 실제 로직은 src/lib/collectJobs.ts (크론과 공유).
 * 실행: npx tsx scripts/collect_jobs.mts
 * 자동 갱신: /api/cron/discover(매일 06:00 KST)가 같은 함수를 호출한다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { refreshJobPostings } from "../src/lib/collectJobs";

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

const db = createClient(url, key, { auth: { persistSession: false } });
refreshJobPostings(db, (m) => console.log(m))
  .then((r) => console.log(`✅ 수집 ${JSON.stringify(r.collected)} · upsert ${r.upserted} · 철회정리 ${r.withdrawn_removed} · 접수중 ${r.open_total}${r.errors.length ? ` · 오류 ${r.errors.join(" / ")}` : ""}`))
  .catch((e) => { console.error("❌", e.message); process.exit(1); });
