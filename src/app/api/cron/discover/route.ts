import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { groqJson } from "@/lib/groq";
import { refreshJobPostings } from "@/lib/collectJobs";

export const maxDuration = 60;

/**
 * GET /api/cron/discover — 신규 정책 발견 (Vercel Cron 일 1회 / 수동 호출 가능)
 *
 * A. 국가 API 증분: 온통청년·gov24 최신분을 받아 DB에 없는 정책 → policies에 편입(공식 소스) + 큐에 merged 기록
 * B. 웹검색(선택): TAVILY_API_KEY가 있으면 검색 → DB에 없는 후보 → 큐에 'new'로 격리 (검증 전엔 추천에 안 씀)
 *
 * 원칙: 웹 발견물은 절대 policies에 직접 넣지 않는다.
 */

const SIDO: Record<string, string> = {
  "11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시", "29": "광주광역시",
  "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시", "41": "경기도", "42": "강원특별자치도",
  "51": "강원특별자치도", "43": "충청북도", "44": "충청남도", "45": "전북특별자치도", "52": "전북특별자치도",
  "46": "전라남도", "47": "경상북도", "48": "경상남도", "50": "제주특별자치도", "12": "전남광주통합특별시",
};
const SIDO_NAMES = [...new Set(Object.values(SIDO))];
const JOBSEEKER_RE = /구직|취업|미취업|취준|면접|자격증|어학|직업훈련|인턴|일경험|채용|청년.{0,6}(수당|지원|활동)|재직|근로자|직장인|자산형성|저축|통장|청약|전세|월세|주거비|신혼|결혼|근속|내일채움|공제|도약계좌|연금|이차보전/;
const str = (v: unknown) => (v == null ? "" : String(v).trim());

type Row = Record<string, unknown>;

function normalizeOntong(it: Row) {
  const codes = str(it.zipCd).split(",").map((c) => c.trim()).filter(Boolean);
  const sidos = [...new Set(codes.map((c) => SIDO[c.slice(0, 2)]).filter(Boolean))];
  const national = sidos.length >= 10;
  const aply = str(it.aplyYmd);
  const m = aply.match(/(\d{8})\s*~\s*(\d{8})/);
  const fmt = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const n = (v: unknown) => { const x = Number(str(v)); return Number.isFinite(x) && x > 0 ? x : null; };
  return {
    policy_id: `ontong:${str(it.plcyNo)}`, source: "ontong", source_id: str(it.plcyNo),
    title: str(it.plcyNm), provider: str(it.sprvsnInstCdNm) || str(it.rgtrInstCdNm) || null,
    theme: str(it.lclsfNm).split(",")[0] || null, region_sidos: national ? [] : sidos, is_national: national,
    zip_codes: str(it.zipCd).slice(0, 2000) || null, age_min: n(it.sprtTrgtMinAge), age_max: n(it.sprtTrgtMaxAge),
    income_condition: str(it.earnEtcCn).slice(0, 300) || null,
    start_date: m ? fmt(m[1]) : null, end_date: m ? fmt(m[2]) : null, always_open: !aply,
    apply_url: str(it.aplyUrlAddr) || str(it.refUrlAddr1) || null,
    search_text: [str(it.plcyNm), str(it.plcyKywdNm), str(it.lclsfNm), str(it.mclsfNm), str(it.plcyExplnCn).slice(0, 800), str(it.plcySprtCn).slice(0, 800)].join(" | ").slice(0, 2500),
  };
}

function normalizeGov24(it: Row) {
  const provider = str(it["소관기관명"]);
  const sido = SIDO_NAMES.find((s) => provider.startsWith(s)) ?? (provider.startsWith("강원도") ? "강원특별자치도" : provider.startsWith("전라북도") ? "전북특별자치도" : null);
  const deadline = str(it["신청기한"]);
  return {
    policy_id: `gov24:${str(it["서비스ID"])}`, source: "gov24", source_id: str(it["서비스ID"]),
    title: str(it["서비스명"]), provider: provider || null, theme: str(it["서비스분야"]).split(",")[0] || null,
    region_sidos: sido ? [sido] : [], is_national: !sido, zip_codes: null, age_min: null, age_max: null,
    income_condition: str(it["선정기준"]).slice(0, 300) || null, start_date: null, end_date: null,
    always_open: /상시|연중|수시/.test(deadline) || deadline === "",
    apply_url: str(it["상세조회URL"]) || `https://www.gov.kr/portal/rcvfvrSvc/dtlEx/${str(it["서비스ID"])}`,
    search_text: [str(it["서비스명"]), str(it["지원유형"]), str(it["서비스분야"]), str(it["지원대상"]).slice(0, 600), str(it["선정기준"]).slice(0, 500), str(it["지원내용"]).slice(0, 600)].join(" | ").slice(0, 2500),
  };
}

/** 외부 API 호출 — 온통청년 등은 간헐적 500을 내므로 3회 재시도(백오프) */
async function fetchJson(url: string, attempts = 3) {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "tikkeul-discover/0.1" } });
      if (!res.ok) throw new Error(`${url.split("?")[0]} → HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function GET(request: Request) {
  // Vercel Cron 인증 (CRON_SECRET 설정 시)
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const report: Record<string, unknown> = { ran_at: new Date().toISOString() };
  /** 후보 ID 중 DB에 이미 있는 것만 골라 Set으로 (PostgREST 1,000행 상한 회피) */
  const findKnown = async (ids: string[]) => {
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("policies").select("policy_id").in("policy_id", ids.slice(i, i + 200));
      for (const r of data ?? []) known.add(r.policy_id);
    }
    return known;
  };

  /** policy_discovery_queue.url의 유니크 인덱스가 부분 인덱스(where url is not null)라서
   * .upsert({onConflict:"url"})가 "no unique or exclusion constraint matching the ON CONFLICT
   * specification"(42P10)로 조용히 실패한다 — 직접 재현·확인함. select-then-insert로 우회.
   * url이 없는 행은 (부분 인덱스가 애초에 중복을 안 막으므로) 중복 체크 없이 바로 넣는다. */
  const queueDiscovery = async (rows: { url: string | null }[]) => {
    const urls = [...new Set(rows.map((r) => r.url).filter((u): u is string => !!u?.trim()))];
    const existing = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const { data } = await db.from("policy_discovery_queue").select("url").in("url", urls.slice(i, i + 200));
      for (const r of data ?? []) if (r.url) existing.add(r.url);
    }
    const toInsert = rows.filter((r) => !r.url?.trim() || !existing.has(r.url));
    if (toInsert.length === 0) return;
    const { error } = await db.from("policy_discovery_queue").insert(toInsert);
    if (error) console.error("policy_discovery_queue insert 실패:", error.message);
  };

  // ── A-1. 온통청년 최신 250건 ──
  try {
    const key = process.env.ONTONG_YOUTH_API_KEY;
    if (!key) throw new Error("ONTONG_YOUTH_API_KEY 없음");
    const rows: ReturnType<typeof normalizeOntong>[] = [];
    for (let page = 1; page <= 5; page++) {
      const p = await fetchJson(`https://www.youthcenter.go.kr/go/ythip/getPlcy?apiKeyNm=${key}&pageNum=${page}&pageSize=50&rtnType=json`);
      for (const it of p?.result?.youthPolicyList ?? []) {
        const row = normalizeOntong(it as Row);
        if (row.title) rows.push(row);
      }
    }
    const known = await findKnown(rows.map((r) => r.policy_id));
    const fresh = rows.filter((r) => !known.has(r.policy_id));
    report.ontong_checked = rows.length;
    if (fresh.length) {
      await db.from("policies").upsert(fresh);
      await queueDiscovery(
        fresh.map((r) => ({ found_by: "api:ontong", title: r.title, url: r.apply_url, status: "merged", candidate_policy_id: r.policy_id, reviewed_at: new Date().toISOString() })),
      );
    }
    report.ontong_new = fresh.length;
  } catch (e) { report.ontong_error = e instanceof Error ? e.message : String(e); }

  // ── A-2. gov24 최신 300건 중 취준 관련 ──
  try {
    const key = process.env.DATA_GO_KR_API_KEY;
    if (!key) throw new Error("DATA_GO_KR_API_KEY 없음");
    const rows: ReturnType<typeof normalizeGov24>[] = [];
    // 공공데이터포털 키는 인코딩 상태로 저장돼 있을 수 있어 디코딩 후 재인코딩
    const svcKey = encodeURIComponent(decodeURIComponent(key));
    for (let page = 1; page <= 3; page++) {
      const p = await fetchJson(`https://api.odcloud.kr/api/gov24/v3/serviceList?page=${page}&perPage=100&returnType=JSON&serviceKey=${svcKey}`);
      for (const it of p?.data ?? []) {
        const text = `${str(it["서비스명"])} ${str(it["지원대상"])} ${str(it["서비스목적요약"])} ${str(it["지원내용"])}`;
        if (!JOBSEEKER_RE.test(text)) continue;
        const row = normalizeGov24(it as Row);
        if (row.title) rows.push(row);
      }
    }
    const known = await findKnown(rows.map((r) => r.policy_id));
    const fresh = rows.filter((r) => !known.has(r.policy_id));
    report.gov24_checked = rows.length;
    if (fresh.length) {
      await db.from("policies").upsert(fresh);
      await queueDiscovery(
        fresh.map((r) => ({ found_by: "api:gov24", title: r.title, url: r.apply_url, status: "merged", candidate_policy_id: r.policy_id, reviewed_at: new Date().toISOString() })),
      );
    }
    report.gov24_new = fresh.length;
  } catch (e) { report.gov24_error = e instanceof Error ? e.message : String(e); }

  // ── B. 웹검색 (Tavily, 선택) → 격리 큐 ──
  const tavily = process.env.TAVILY_API_KEY;
  if (tavily) {
    try {
      const month = new Date().getMonth() + 1;
      const queries = [
        `${month}월 청년 취업준비생 지원사업 신규 공고`,
        `청년 면접수당 자격증 응시료 지원 신청 ${new Date().getFullYear()}`,
        `청년 구직활동 지원금 지자체 모집`,
      ];
      const { data: titles } = await db.from("policies").select("title").limit(20000);
      const knownTitles = new Set((titles ?? []).map((t) => String(t.title).replace(/\s+/g, "")));
      let queued = 0;
      for (const q of queries) {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tavily, query: q, max_results: 8, include_domains: ["go.kr", "or.kr"] }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        for (const r of json.results ?? []) {
          const title = str(r.title);
          if (!title || knownTitles.has(title.replace(/\s+/g, ""))) continue;
          let extracted: unknown = null;
          try {
            extracted = await groqJson(
              "다음 웹페이지 제목·요약에서 청년/취준생 지원정책 정보를 JSON으로 추출: {\"is_policy\": true|false, \"title\": \"\", \"provider\": \"\", \"region_sido\": \"시도명 또는 null\", \"benefit\": \"혜택 요약\", \"target\": \"대상 요약\"}. 정책 공고가 아니면 is_policy=false.",
              `제목: ${title}\n요약: ${str(r.content).slice(0, 600)}\nURL: ${str(r.url)}`, 800,
            );
          } catch { /* 추출 실패 시 원문만 저장 */ }
          const url = str(r.url);
          const { data: dup } = url ? await db.from("policy_discovery_queue").select("id").eq("url", url).maybeSingle() : { data: null };
          if (dup) continue;
          const { error } = await db.from("policy_discovery_queue").insert(
            { found_by: "web:tavily", trigger_context: q, url, title, snippet: str(r.content).slice(0, 500), extracted, status: "new" },
          );
          if (!error) queued++;
        }
      }
      report.web_queued = queued;
    } catch (e) { report.web_error = e instanceof Error ? e.message : String(e); }
  } else {
    report.web = "TAVILY_API_KEY 없음 — 웹검색 생략";
  }

  const { count } = await db.from("policies").select("*", { count: "exact", head: true });
  report.policies_total = count;

  // ── 채용공고 최신화 (Hobby 플랜 크론 2개 제한 → 별도 크론 대신 여기에 합류) ──
  try {
    report.jobs = await refreshJobPostings(db);
  } catch (e) {
    report.jobs_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(report);
}
