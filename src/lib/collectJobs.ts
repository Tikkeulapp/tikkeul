/**
 * 채용공고 수집·최신화 로직 — scripts/collect_jobs.mts(수동 실행)와
 * /api/cron/discover(매일 자동)가 공유하는 단일 구현.
 *
 * 최신화 알고리즘 (매 실행마다):
 *  1. 소스별 어댑터가 공식 API에서 현재 공고를 받는다 (키 없는 소스는 건너뜀).
 *  2. 정규화: 지역→표준 시도, 직무→NCS 코드, 마감일(상시=null), 학력·경력·급여.
 *  3. job_id 기준 upsert — 신규 공고는 추가되고, 기존 공고는 최신 값(마감 연장 등)으로 덮어쓴다.
 *  4. 철회 감지(전수 스냅샷 소스만): 마감 전인데 이번 스냅샷에서 사라진 공고는 조기마감·철회로
 *     보고 삭제한다. 부분 수집 소스(사람인: 최신 N건만)는 삭제하지 않고 마감일로만 자연 소멸.
 *  5. 마감 지난 공고는 삭제하지 않아도 모든 조회가 deadline 필터로 자동 제외한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSido } from "@/lib/region";
import { NCS_NAME_BY_CODE, ncsCodesForCategoryText } from "@/data/ncs";

export type JobRow = {
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
export const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

/* ── 사람인 (민간) — 최신 N건 부분 스냅샷 ───────────── */
async function collectSaramin(now: string, log: (m: string) => void): Promise<JobRow[]> {
  const key = process.env.SARAMIN_API_KEY;
  if (!key) {
    log("saramin: SARAMIN_API_KEY 없음 — 건너뜀");
    return [];
  }
  const rows: JobRow[] = [];
  const PAGES = Number(process.env.SARAMIN_PAGES ?? 10); // 110건 × 10페이지 = 최신 1,100건
  for (let page = 0; page < PAGES; page++) {
    const url = `https://oapi.saramin.co.kr/job-search?access-key=${encodeURIComponent(key)}&count=110&start=${page}&sort=pd`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) throw new Error(`saramin API ${res.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text);
    const items: Record<string, unknown>[] = json.jobs?.job ?? [];
    if (page === 0) log(`saramin: 전체 ${json.jobs?.total ?? "?"}건 중 최신 ${PAGES * 110}건 수집`);
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
      const mid = nameOf("job-mid-code");
      const jobCode = nameOf("job-code");
      const industry = nameOf("industry");
      const closeType = s((it["close-type"] as Record<string, unknown> | undefined)?.name);
      const isOpenEnd = !!closeType && /상시|채용시|수시/.test(closeType);
      const companyDetail = (it.company as Record<string, unknown> | undefined)?.detail as Record<string, unknown> | undefined;
      rows.push({
        job_id: `saramin:${id}`,
        source: "saramin",
        title,
        company: s(companyDetail?.name) ?? s((it.company as Record<string, unknown> | undefined)?.name),
        region_names: regionNames,
        region_sidos: sidos,
        is_national: regionNames.some((r) => /전국|해외/.test(r)) || regionNames.length === 0,
        ncs_codes: ncsCodesForCategoryText([mid, jobCode, title].filter(Boolean).join(" ")),
        ncs_names: [mid, jobCode].filter((x): x is string => !!x).slice(0, 2),
        hire_types: [nameOf("job-type")].filter((x): x is string => !!x),
        career: nameOf("experience-level"),
        education: nameOf("required-education-level"),
        salary_text: s((it.salary as Record<string, unknown> | undefined)?.name),
        headcount: null,
        pbanc_begin: tsToYmd(it["posting-timestamp"]),
        deadline: isOpenEnd ? null : (tsToYmd(it["expiration-timestamp"]) ?? ymd(it["expiration-date"])),
        detail_url: s(it.url),
        search_text: [title, s(companyDetail?.name), mid, jobCode, industry, s(it.keyword)?.slice(0, 300)].filter(Boolean).join(" | "),
        collected_at: now,
      });
    }
    if (items.length < 110) break;
  }
  return rows;
}

/* ── 공공기관 (잡알리오) — 접수 중 전수 스냅샷 ─────────── */
async function collectPubinst(now: string, log: (m: string) => void): Promise<JobRow[]> {
  const raw = process.env.DATA_GO_KR_API_KEY;
  if (!raw) {
    log("pubinst: DATA_GO_KR_API_KEY 없음 — 건너뜀");
    return [];
  }
  const KEY = raw.includes("%") ? raw : encodeURIComponent(raw);
  const rows: JobRow[] = [];
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
      log(`pubinst: 접수 중 ${total}건`);
    }
    for (const it of arr) {
      const sn = s(it.recrutPblntSn);
      const title = s(it.recrutPbancTtl);
      if (!sn || !title) continue;
      const regionNames = list(it.workRgnNmLst);
      const sidos = [...new Set(regionNames.map((r) => normalizeSido(r)).filter((x): x is string => !!x))];
      // ncsCdLst는 "R600011"처럼 끝 2자리가 NCS 대분류 번호
      const ncsCodes = [...new Set(list(it.ncsCdLst).map((c) => c.match(/(\d{2})\s*$/)?.[1]).filter((x): x is string => !!x))];
      const ncsNames = list(it.ncsCdNmLst).length ? list(it.ncsCdNmLst) : ncsCodes.map((c) => NCS_NAME_BY_CODE.get(c) ?? c);
      const education = list(it.acbgCondNmLst).join(", ") || null;
      rows.push({
        job_id: `pubinst:${sn}`,
        source: "pubinst",
        title,
        company: s(it.instNm),
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
        search_text: [title, s(it.instNm), ncsNames.join(" "), s(it.recrutSeNm), education, s(it.aplyQlfcCn)?.slice(0, 400), s(it.prefCondCn)?.slice(0, 200)].filter(Boolean).join(" | "),
        collected_at: now,
      });
    }
    if (arr.length === 0) break;
    page += 1;
  }
  return rows;
}

export type RefreshReport = {
  collected: Record<string, number>;
  upserted: number;
  withdrawn_removed: number;
  open_total: number | null;
  errors: string[];
};

/** 전체 소스 수집 → upsert → 철회 정리. 크론과 수동 스크립트의 공용 진입점. */
export async function refreshJobPostings(db: SupabaseClient, log: (m: string) => void = () => {}): Promise<RefreshReport> {
  const now = new Date().toISOString();
  const errors: string[] = [];
  const results = await Promise.allSettled([collectSaramin(now, log), collectPubinst(now, log)]);
  const rows: JobRow[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === "rejected") { errors.push((r.reason as Error).message); continue; }
    for (const row of r.value) if (!seen.has(row.job_id)) { seen.add(row.job_id); rows.push(row); }
  }
  const collected: Record<string, number> = {};
  for (const r of rows) collected[r.source] = (collected[r.source] ?? 0) + 1;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from("job_postings").upsert(chunk, { onConflict: "job_id" });
    if (error) throw new Error(`upsert 실패 (${i}): ${error.message}`);
  }

  // 철회 감지 — 전수 스냅샷 소스(pubinst)만: 마감 전인데 이번 수집에 없는 공고는 조기마감·철회
  let withdrawn = 0;
  const today = todayKst();
  if ((collected.pubinst ?? 0) > 0) {
    const current = new Set(rows.filter((r) => r.source === "pubinst").map((r) => r.job_id));
    const { data: existing } = await db.from("job_postings").select("job_id").eq("source", "pubinst").or(`deadline.is.null,deadline.gte.${today}`);
    const gone = (existing ?? []).map((r) => r.job_id).filter((id) => !current.has(id));
    for (let i = 0; i < gone.length; i += 100) {
      const { error } = await db.from("job_postings").delete().in("job_id", gone.slice(i, i + 100));
      if (!error) withdrawn += Math.min(100, gone.length - i);
    }
    if (gone.length) log(`철회·조기마감 정리: ${gone.length}건 삭제`);
  }

  const { count } = await db.from("job_postings").select("job_id", { count: "exact", head: true }).or(`deadline.is.null,deadline.gte.${today}`);
  return { collected, upserted: rows.length, withdrawn_removed: withdrawn, open_total: count, errors };
}
