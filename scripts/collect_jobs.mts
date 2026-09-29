/**
 * 공공기관 채용공고 수집 (기획재정부 공공기관 채용정보 — 잡알리오, data.go.kr).
 * 실행: npx tsx scripts/collect_jobs.mts
 * 필요: .env.local의 DATA_GO_KR_API_KEY (해당 API 활용신청 필요), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * ongoingYn=Y(접수 중 공고)를 전부 페이지 순회로 받아 job_postings에 upsert.
 * 지역은 기존 정책 파이프라인과 같은 normalizeSido()로 정규화한다.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeSido } from "../src/lib/region";
import { NCS_NAME_BY_CODE } from "../src/data/ncs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    process.env[k.trim()] ??= rest.join("=").trim();
  }
}

const RAW_KEY = process.env.DATA_GO_KR_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!RAW_KEY || !SB_URL || !SB_KEY) {
  console.error("❌ DATA_GO_KR_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
  process.exit(1);
}
// 포털이 주는 키는 URL 인코딩본 — 쿼리에 그대로 붙인다 (재인코딩 금지)
const KEY = RAW_KEY.includes("%") ? RAW_KEY : encodeURIComponent(RAW_KEY);
const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

type RawItem = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const list = (v: unknown): string[] => (s(v) ? (s(v) as string).split(",").map((x) => x.trim()).filter(Boolean) : []);
const ymd = (v: unknown): string | null => {
  const t = s(v);
  if (!t) return null;
  const m = t.replace(/[.\-/]/g, "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

function mapItem(it: RawItem) {
  const sn = s(it.recrutPblntSn);
  if (!sn) return null;
  const title = s(it.recrutPbancTtl) ?? s(it.title);
  if (!title) return null;
  const regionNames = list(it.workRgnNmLst);
  const sidos = [...new Set(regionNames.map((r) => normalizeSido(r)).filter((x): x is string => !!x))];
  const isNational = regionNames.some((r) => /전국|무관|해외/.test(r)) || regionNames.length === 0;
  const ncsCodes = list(it.ncsCdLst).map((c) => c.padStart(2, "0"));
  const ncsNames = list(it.ncsCdNmLst).length ? list(it.ncsCdNmLst) : ncsCodes.map((c) => NCS_NAME_BY_CODE.get(c) ?? c);
  const company = s(it.instNm);
  const career = s(it.recrutSeNm);
  const education = list(it.acbgCondNmLst).join(", ") || null;
  const qual = s(it.aplyQlfcCn);
  const pref = s(it.prefCondCn);
  return {
    job_id: `pubinst:${sn}`,
    source: "pubinst",
    title,
    company,
    region_names: regionNames,
    region_sidos: sidos,
    is_national: isNational,
    ncs_codes: ncsCodes,
    ncs_names: ncsNames,
    hire_types: list(it.hireTypeNmLst),
    career,
    education,
    headcount: Number(s(it.recrutNope)) || null,
    pbanc_begin: ymd(it.pbancBgngYmd),
    deadline: ymd(it.pbancEndYmd),
    detail_url: s(it.srcUrl) ?? `https://job.alio.go.kr/recruitview.do?idx=${sn}`,
    search_text: [title, company, ncsNames.join(" "), career, education, qual?.slice(0, 400), pref?.slice(0, 200)].filter(Boolean).join(" | "),
    collected_at: new Date().toISOString(),
  };
}

async function fetchPage(pageNo: number): Promise<{ items: RawItem[]; total: number }> {
  const url = `https://apis.data.go.kr/1051000/recruitment/list?serviceKey=${KEY}&resultType=json&numOfRows=100&pageNo=${pageNo}&ongoingYn=Y&sortOrder=DESC`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok || text.startsWith("<")) throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  // 응답 골격이 문서와 다를 수 있어 방어적으로 파싱
  const body = json.response?.body ?? json;
  const items: RawItem[] = body.items?.item ?? body.items ?? body.result ?? [];
  const total: number = Number(body.totalCount ?? json.totalCount ?? 0);
  return { items: Array.isArray(items) ? items : [items], total };
}

async function main() {
  let page = 1;
  let total = Infinity;
  let collected = 0;
  const rows: NonNullable<ReturnType<typeof mapItem>>[] = [];
  while ((page - 1) * 100 < total && page <= 30) {
    const { items, total: t } = await fetchPage(page);
    if (page === 1) {
      total = t || items.length;
      console.log(`총 ${total}건 (접수 중). 첫 항목 필드:`, Object.keys(items[0] ?? {}).join(", "));
    }
    for (const it of items) {
      const row = mapItem(it);
      if (row) rows.push(row);
    }
    collected += items.length;
    if (items.length === 0) break;
    page += 1;
  }
  console.log(`수집 ${collected}건 → 매핑 ${rows.length}건. upsert 시작…`);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from("job_postings").upsert(chunk, { onConflict: "job_id" });
    if (error) throw new Error(`upsert 실패 (${i}): ${error.message}`);
  }
  // 마감 지난 공고 정리 (검색·추천은 어차피 deadline 필터를 걸지만 테이블도 가볍게 유지)
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const { count } = await db.from("job_postings").select("job_id", { count: "exact", head: true }).lt("deadline", today);
  console.log(`✅ upsert 완료 ${rows.length}건 (마감 지난 행 ${count ?? 0}건은 조회에서 제외됨)`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
