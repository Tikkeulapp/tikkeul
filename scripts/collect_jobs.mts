/**
 * 채용공고 수집 (멀티 소스) — job_postings 테이블에 upsert.
 * 실행: npx tsx scripts/collect_jobs.mts
 *
 * 소스 (키가 있는 것만 수집, 없으면 건너뜀):
 *  1. saramin — 사람인 오픈API (민간 기업 실공고). .env.local: SARAMIN_API_KEY
 *     키 발급: https://oapi.saramin.co.kr (즉시 발급, 일 호출 쿼터 있음)
 *  2. pubinst — 기획재정부 공공기관 채용정보(잡알리오, data.go.kr). .env.local: DATA_GO_KR_API_KEY
 *     data.go.kr에서 "공공기관 채용정보" 활용신청 필요(자동승인)
 *
 * 직무분야는 소스마다 분류가 달라 NCS 대분류 24종으로 코드가 정규화한다(ncsCodesForCategoryText).
 * 상시·채용시 마감 공고는 deadline=null로 저장하고 조회 쪽에서 "상시"로 다룬다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeSido } from "../src/lib/region";
import { NCS_NAME_BY_CODE, ncsCodesForCategoryText } from "../src/data/ncs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    process.env[k.trim()] ??= rest.join("=").trim();
  }
}

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
  process.exit(1);
}
const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

type Row = {
  job_id: string; source: string; title: string; company: string | null;
  region_names: string[]; region_sidos: string[]; is_national: boolean;
  ncs_codes: string[]; ncs_names: string[]; hire_types: string[];
  career: string | null; education: string | null; salary_text: string | null; headcount: number | null;
  pbanc_begin: string | null; deadline: string | null; detail_url: string | null; search_text: string; collected_at: string;
};

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const list = (v: unknown): string[] => (s(v) ? (s(v) as string).split(",").map((x) => x.trim()).filter(Boolean) : []);
const ymd = (v: unknown): string | null => {
  const t = s(v);
  if (!t) return null;
  const m = t.replace(/[.\-/]/g, "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const tsToYmd = (v: unknown): string | null => {
  const n = Number(s(v));
  if (!n) return null;
  return new Date((n < 1e12 ? n * 1000 : n) + 9 * 3600000).toISOString().slice(0, 10);
};
const NOW = new Date().toISOString();

/* ── 1. 사람인 (민간) ─────────────────────────────── */
async function collectSaramin(): Promise<Row[]> {
  const key = process.env.SARAMIN_API_KEY;
  if (!key) {
    console.log("⏭ saramin: SARAMIN_API_KEY 없음 — 건너뜀 (oapi.saramin.co.kr에서 즉시 발급 가능)");
    return [];
  }
  const rows: Row[] = [];
  const PAGES = Number(process.env.SARAMIN_PAGES ?? 10); // 110건 × 10페이지 = 최신 1,100건
  for (let page = 0; page < PAGES; page++) {
    const url = `https://oapi.saramin.co.kr/job-search?access-key=${encodeURIComponent(key)}&count=110&start=${page}&sort=pd`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) throw new Error(`saramin API ${res.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    const items: Record<string, unknown>[] = json.jobs?.job ?? [];
    if (page === 0) console.log(`saramin: 전체 ${json.jobs?.total ?? "?"}건 중 최신 ${PAGES * 110}건 수집. 첫 항목 필드: ${Object.keys(items[0] ?? {}).join(", ")}`);
    if (!items.length) break;
    for (const it of items) {
      const id = s(it.id);
      const pos = (it.position ?? {}) as Record<string, unknown>;
      const nameOf = (k: string) => s((pos[k] as Record<string, unknown> | undefined)?.name);
      const title = s(pos.title);
      if (!id || !title) continue;
      const locName = nameOf("location") ?? "";
      const regionNames = [...new Set(locName.split(",").map((x) => x.split(">")[0].trim()).filter(Boolean))];
      const sidos = [...new Set(regionNames.map((r) => normalizeSido(r)).filter((x): x is string => !!x))];
      const isNational = regionNames.some((r) => /전국|해외/.test(r)) || regionNames.length === 0;
      const mid = nameOf("job-mid-code");
      const jobCode = nameOf("job-code");
      const industry = nameOf("industry");
      const ncsCodes = ncsCodesForCategoryText([mid, jobCode, title].filter(Boolean).join(" "));
      const closeType = s((it["close-type"] as Record<string, unknown> | undefined)?.name);
      const isOpenEnd = !!closeType && /상시|채용시|수시/.test(closeType);
      const company = s((it.company as Record<string, unknown> | undefined)?.detail && ((it.company as Record<string, unknown>).detail as Record<string, unknown>).name) ?? s((it.company as Record<string, unknown> | undefined)?.name);
      rows.push({
        job_id: `saramin:${id}`,
        source: "saramin",
        title,
        company,
        region_names: regionNames,
        region_sidos: sidos,
        is_national: isNational,
        ncs_codes: ncsCodes,
        ncs_names: [mid, jobCode].filter((x): x is string => !!x).slice(0, 2),
        hire_types: [nameOf("job-type")].filter((x): x is string => !!x),
        career: nameOf("experience-level"),
        education: nameOf("required-education-level"),
        salary_text: s((it.salary as Record<string, unknown> | undefined)?.name),
        headcount: null,
        pbanc_begin: tsToYmd(it["posting-timestamp"]),
        deadline: isOpenEnd ? null : (tsToYmd(it["expiration-timestamp"]) ?? ymd(it["expiration-date"])),
        detail_url: s(it.url),
        search_text: [title, company, mid, jobCode, industry, s(it.keyword)?.slice(0, 300)].filter(Boolean).join(" | "),
        collected_at: NOW,
      });
    }
    if (items.length < 110) break;
  }
  return rows;
}

/* ── 2. 공공기관 (잡알리오) ─────────────────────────── */
async function collectPubinst(): Promise<Row[]> {
  const raw = process.env.DATA_GO_KR_API_KEY;
  if (!raw) {
    console.log("⏭ pubinst: DATA_GO_KR_API_KEY 없음 — 건너뜀");
    return [];
  }
  const KEY = raw.includes("%") ? raw : encodeURIComponent(raw);
  const rows: Row[] = [];
  let page = 1;
  let total = Infinity;
  while ((page - 1) * 100 < total && page <= 30) {
    const url = `https://apis.data.go.kr/1051000/recruitment/list?serviceKey=${KEY}&resultType=json&numOfRows=100&pageNo=${page}&ongoingYn=Y&sortOrder=DESC`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok || text.startsWith("<")) throw new Error(`pubinst API ${res.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    const body = json.response?.body ?? json;
    const items: Record<string, unknown>[] = body.items?.item ?? body.items ?? body.result ?? [];
    const arr = Array.isArray(items) ? items : [items];
    if (page === 1) {
      total = Number(body.totalCount ?? json.totalCount ?? 0) || arr.length;
      console.log(`pubinst: 접수 중 ${total}건. 첫 항목 필드: ${Object.keys(arr[0] ?? {}).join(", ")}`);
    }
    for (const it of arr) {
      const sn = s(it.recrutPblntSn);
      const title = s(it.recrutPbancTtl);
      if (!sn || !title) continue;
      const regionNames = list(it.workRgnNmLst);
      const sidos = [...new Set(regionNames.map((r) => normalizeSido(r)).filter((x): x is string => !!x))];
      const ncsCodes = list(it.ncsCdLst).map((c) => c.padStart(2, "0"));
      const ncsNames = list(it.ncsCdNmLst).length ? list(it.ncsCdNmLst) : ncsCodes.map((c) => NCS_NAME_BY_CODE.get(c) ?? c);
      const company = s(it.instNm);
      const education = list(it.acbgCondNmLst).join(", ") || null;
      rows.push({
        job_id: `pubinst:${sn}`,
        source: "pubinst",
        title,
        company,
        region_names: regionNames,
        region_sidos: sidos,
        is_national: regionNames.some((r) => /전국|무관|해외/.test(r)) || regionNames.length === 0,
        ncs_codes: ncsCodes,
        ncs_names: ncsNames,
        hire_types: list(it.hireTypeNmLst),
        career: s(it.recrutSeNm),
        education,
        salary_text: null,
        headcount: Number(s(it.recrutNope)) || null,
        pbanc_begin: ymd(it.pbancBgngYmd),
        deadline: ymd(it.pbancEndYmd),
        detail_url: s(it.srcUrl) ?? `https://job.alio.go.kr/recruitview.do?idx=${sn}`,
        search_text: [title, company, ncsNames.join(" "), s(it.recrutSeNm), education, s(it.aplyQlfcCn)?.slice(0, 400), s(it.prefCondCn)?.slice(0, 200)].filter(Boolean).join(" | "),
        collected_at: NOW,
      });
    }
    if (arr.length === 0) break;
    page += 1;
  }
  return rows;
}

async function main() {
  const results = await Promise.allSettled([collectSaramin(), collectPubinst()]);
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === "rejected") { console.warn("⚠", (r.reason as Error).message); continue; }
    for (const row of r.value) if (!seen.has(row.job_id)) { seen.add(row.job_id); rows.push(row); }
  }
  if (!rows.length) {
    console.error("❌ 수집된 공고 0건 — API 키/활용신청 상태를 확인하세요.");
    process.exit(1);
  }
  console.log(`매핑 완료 ${rows.length}건 (saramin ${rows.filter((r) => r.source === "saramin").length} / pubinst ${rows.filter((r) => r.source === "pubinst").length}). upsert 시작…`);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from("job_postings").upsert(chunk, { onConflict: "job_id" });
    if (error) throw new Error(`upsert 실패 (${i}): ${error.message}`);
  }
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const { count } = await db.from("job_postings").select("job_id", { count: "exact", head: true }).or(`deadline.is.null,deadline.gte.${today}`);
  console.log(`✅ upsert 완료 ${rows.length}건 — 현재 접수 중(상시 포함) ${count ?? "?"}건`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
