"use client";

/**
 * 채용공고 검색 화면 — 조건(지역·직무분야·학력·경력)과 다중 키워드를 조합해 검색한다.
 * 키워드는 노션 다중선택처럼 칩으로 쌓고(Enter), 결과 상단의 키워드 토글 버튼으로
 * 켠 키워드의 합집합만 본다. 카드에는 어떤 키워드가 원문 어디에 걸렸는지 근거를 하이라이트.
 * 키워드마다 방향성 동의어 확장(하위 개념만) 적용. 필터·정렬·근거는 전부 코드가 처리(LLM 없음).
 * /app/jobs?kw=RAG,카드사 로 진입하면 칩이 미리 채워져 자동 검색된다 (메인 위젯 연동).
 */
import { useCallback, useEffect, useState } from "react";
import { NCS_CATEGORIES } from "@/data/ncs";
import { SIDO_CANONICAL } from "@/lib/region";
import type { SimSession } from "@/components/app/SimulateView";
import { isPublicOrg } from "@/data/ncs";

type Evidence = { term: string; before: string; after: string };
type Job = {
  job_id: string; source: string; title: string; company: string | null; region_names: string[]; is_national: boolean;
  ncs_codes: string[]; ncs_names: string[]; hire_types: string[]; career: string | null; education: string | null; salary_text: string | null;
  headcount: number | null; summary?: string | null; requirements?: string | null; pbanc_begin: string | null; deadline: string | null; deadline_time: string | null; detail_url: string | null; dday: number | null;
  match?: Evidence | null;
};

const TODAY_KST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

const EDUCATIONS = [
  { value: "", label: "전체" },
  { value: "무관", label: "학력무관만" },
  { value: "고졸", label: "고졸 지원 가능" },
];
const CAREERS = [
  { value: "", label: "전체" },
  { value: "신입", label: "신입 지원 가능" },
  { value: "경력", label: "경력 지원 가능" },
];
const HIRES = [
  { value: "", label: "전체" },
  { value: "정규직", label: "정규직" },
  { value: "계약·기간제", label: "계약·기간제" },
  { value: "인턴·전환형", label: "인턴·전환형" },
];
const ORGS = [
  { value: "", label: "전체" },
  { value: "공공기관", label: "공공기관" },
  { value: "사기업", label: "사기업" },
];

function DdayBadge({ d }: { d: number | null }) {
  if (d === null) return <span className="rounded-full bg-paper px-2 py-0.5 text-[12.5px] font-bold text-mute">상시</span>;
  const urgent = d <= 7;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[12.5px] font-bold ${urgent ? "bg-[#fde8e8] text-[#c0392b]" : "bg-mint text-leaf-deep"}`}>
      {d === 0 ? "오늘 마감" : `D-${d}`}
    </span>
  );
}

type SearchParams = { sido: string; ncs: string; education: string; career: string; hire: string; org: string; keywords: string[] };

const cleanKw = (raw: string) => raw.trim().replace(/[,%()*"'\\]/g, "").slice(0, 20);

type JobsResult = {
  jobsMap: Record<string, Job>;
  matchedBy: Record<string, string[]>; // job_id → 매칭된 키워드들
  evidence: Record<string, Record<string, Evidence>>; // job_id → {kw: 근거}
  expandedByKw: Record<string, string[]>;
  aiByKw: Record<string, boolean>; // 키워드 → AI(LLM) 확장 여부 (사전 미등록어)
  singleTotal: number; // 키워드 없는 검색의 전체 건수
};

/** /api/jobs/search 호출 — 키워드가 여럿이면 키워드별로 불러 합집합. state는 건드리지 않는다. */
async function fetchJobs(params: SearchParams): Promise<JobsResult> {
  const base = { sido: params.sido || null, ncs: params.ncs || null, education: params.education || null, career: params.career || null, hire: params.hire || null, org: params.org || null };
  const call = async (keyword: string | null) => {
    const res = await fetch("/api/jobs/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, keyword }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "검색 실패");
    return json as { jobs: Job[]; total: number; keywords: string[]; aiExpanded?: boolean };
  };

  const jobsMap: Record<string, Job> = {};
  const matchedBy: Record<string, string[]> = {};
  const evidence: Record<string, Record<string, Evidence>> = {};
  const expandedByKw: Record<string, string[]> = {};
  const aiByKw: Record<string, boolean> = {};

  if (params.keywords.length === 0) {
    const r = await call(null);
    for (const j of r.jobs) jobsMap[j.job_id] = j;
    return { jobsMap, matchedBy, evidence, expandedByKw, aiByKw, singleTotal: r.total };
  }
  const results = await Promise.all(params.keywords.map(async (k) => ({ k, r: await call(k) })));
  for (const { k, r } of results) {
    expandedByKw[k] = r.keywords;
    aiByKw[k] = !!r.aiExpanded;
    for (const j of r.jobs) {
      jobsMap[j.job_id] = j;
      const kws = (matchedBy[j.job_id] ??= []);
      if (!kws.includes(k)) kws.push(k);
      if (j.match) (evidence[j.job_id] ??= {})[k] = j.match;
    }
  }
  return { jobsMap, matchedBy, evidence, expandedByKw, aiByKw, singleTotal: 0 };
}

function urlKwChips(): string[] {
  if (typeof window === "undefined") return [];
  const kwParam = new URLSearchParams(window.location.search).get("kw") ?? "";
  return [...new Set(kwParam.split(",").map(cleanKw).filter(Boolean))].slice(0, 8);
}

export function JobsView({ session }: { session: SimSession }) {
  // /app/jobs?kw=... 로 진입하면 그 키워드로 시작한다. 필터 기본값은 전부 "전체".
  // JobsView는 세션 로드 후 클라이언트에서만 렌더되므로 초기값에서 window를 읽어도 된다.
  const [urlChips] = useState(urlKwChips);
  const [sido, setSido] = useState("");
  const [ncs, setNcs] = useState("");
  const [education, setEducation] = useState("");
  const [career, setCareer] = useState("");
  const [hire, setHire] = useState("");
  const [org, setOrg] = useState("");
  const [kwDraft, setKwDraft] = useState("");
  const [kwChips, setKwChips] = useState<string[]>(urlChips);

  const [jobsMap, setJobsMap] = useState<Record<string, Job>>({});
  const [matchedBy, setMatchedBy] = useState<Record<string, string[]>>({}); // job_id → 매칭된 키워드들
  const [evidence, setEvidence] = useState<Record<string, Record<string, Evidence>>>({}); // job_id → {kw: 근거}
  const [expandedByKw, setExpandedByKw] = useState<Record<string, string[]>>({});
  const [aiByKw, setAiByKw] = useState<Record<string, boolean>>({});
  const [resultKws, setResultKws] = useState<string[]>([]); // 마지막 검색에 쓴 키워드들 (토글 버튼)
  const [selectedKw, setSelectedKw] = useState<Set<string>>(new Set());
  const [singleTotal, setSingleTotal] = useState(0); // 키워드 없는 검색의 전체 건수
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(true); // 마운트 직후 자동 검색이 돈다
  const [error, setError] = useState<string | null>(null);
  const [appliedNcs, setAppliedNcs] = useState("");
  const [page, setPage] = useState(1); // 결과 페이지 (10건씩)
  const [calSaved, setCalSaved] = useState<Set<string>>(new Set());
  const [calBusy, setCalBusy] = useState<string | null>(null);

  const applyResult = useCallback((params: SearchParams, r: JobsResult) => {
    setSingleTotal(r.singleTotal);
    setJobsMap(r.jobsMap);
    setMatchedBy(r.matchedBy);
    setEvidence(r.evidence);
    setExpandedByKw(r.expandedByKw);
    setAiByKw(r.aiByKw);
    setResultKws(params.keywords);
    setSelectedKw(new Set(params.keywords));
    setAppliedNcs(params.ncs);
    setPage(1);
    setSearched(true);
    setLoading(false);
  }, []);

  const applyError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setJobsMap({});
    setSearched(true);
    setLoading(false);
  }, []);

  const search = useCallback((params: SearchParams) => {
    setLoading(true);
    setError(null);
    fetchJobs(params).then((r) => applyResult(params, r), applyError);
  }, [applyResult, applyError]);

  // 첫 진입: 조건 없이(전체) 자동 검색 — URL의 ?kw= 가 있으면 그 키워드만 적용
  useEffect(() => {
    // 첫 자동 검색 — loading은 초기값이 true라 여기선 결과 반영만 (콜백 안 setState)
    const params: SearchParams = { sido: "", ncs: "", education: "", career: "", hire: "", org: "", keywords: urlChips };
    fetchJobs(params).then((r) => applyResult(params, r), applyError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addChip = (raw: string) => {
    const kw = cleanKw(raw);
    if (!kw) return;
    setKwChips((prev) => (prev.some((k) => k.toLowerCase() === kw.toLowerCase()) || prev.length >= 8 ? prev : [...prev, kw]));
    setKwDraft("");
  };

  const runSearch = (chipsOverride?: string[]) => {
    const chips = chipsOverride ?? (kwDraft.trim() ? [...kwChips, cleanKw(kwDraft)].filter(Boolean).slice(0, 8) : kwChips);
    if (kwDraft.trim()) { setKwChips(chips); setKwDraft(""); }
    void search({ sido, ncs, education, career, hire, org, keywords: chips });
  };

  /** 결과 토글에서 키워드 자체를 삭제 — 칩에서 빼고 남은 키워드로 재검색 */
  const removeKeyword = (k: string) => {
    const chips = kwChips.filter((x) => x !== k);
    setKwChips(chips);
    void search({ sido, ncs, education, career, hire, org, keywords: chips });
  };

  const toggleKw = (k: string) => {
    setSelectedKw((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    setPage(1);
  };

  const countOf = (k: string) => Object.values(matchedBy).filter((ks) => ks.includes(k)).length;

  const visible = Object.values(jobsMap)
    .filter((j) => resultKws.length === 0 || (matchedBy[j.job_id] ?? []).some((k) => selectedKw.has(k)))
    .sort((a, b) => ((a.deadline ?? "9999") < (b.deadline ?? "9999") ? -1 : 1));

  // 페이지네이션 — 10건씩, 번호로 이동. 현재 페이지 ±2와 처음/끝만 보여주고 사이는 …
  const PER_PAGE = 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const paged = visible.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  const pageNums: (number | "…")[] = [];
  for (let n = 1; n <= pageCount; n++) {
    if (n === 1 || n === pageCount || Math.abs(n - curPage) <= 2) pageNums.push(n);
    else if (pageNums[pageNums.length - 1] !== "…") pageNums.push("…");
  }
  const goPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), pageCount));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** 직무분야 표시: 검색에 쓴 분야와 일치하는 항목을 맨 앞으로 */
  const orderedNcs = (j: Job): { names: string[]; matchedFirst: boolean; more: number } => {
    let names = j.ncs_names;
    let matchedFirst = false;
    const i = appliedNcs ? j.ncs_codes.indexOf(appliedNcs) : -1;
    if (i > 0) names = [j.ncs_names[i], ...j.ncs_names.filter((_, k) => k !== i)];
    if (i >= 0) matchedFirst = true;
    return { names: names.slice(0, 3), matchedFirst, more: Math.max(0, names.length - 3) };
  };

  /** 공고의 접수 시작일·마감일을 내 캘린더 일정으로 등록 (시작일은 미래일 때만) */
  const addToCalendar = async (j: Job) => {
    if (!j.deadline || calBusy) return;
    setCalBusy(j.job_id);
    try {
      const post = (date: string, label: string) =>
        fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.userId, date, title: `📋 [${label}] ${(j.company ? j.company + " — " : "") + j.title}`.slice(0, 90) }),
        });
      const reqs = [post(j.deadline, `공고마감${j.deadline_time ? ` ${j.deadline_time}` : ""}`)];
      if (j.pbanc_begin && j.pbanc_begin > TODAY_KST()) reqs.push(post(j.pbanc_begin, "접수시작"));
      const results = await Promise.all(reqs);
      if (results.some((r) => !r.ok)) throw new Error("등록 실패");
      setCalSaved((prev) => new Set(prev).add(j.job_id));
    } catch {
      setError("캘린더 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setCalBusy(null);
    }
  };

  const label = "text-[13px] font-bold text-mute";
  const input = "w-full rounded-[10px] border border-line bg-card px-3 py-2 text-[15px] outline-none focus:border-ink";

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* ── 검색 조건 ── */}
      <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} className="h-fit rounded-[18px] border border-line bg-card p-4 lg:sticky lg:top-4">
        <p className="text-[15px] font-bold">검색 조건</p>
        <p className="mt-1 text-[12.5px] text-mute">조건을 고르면 접수 중 공고가 마감 임박순으로 나와요.</p>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className={label}>근무 지역</p>
            <select className={input} value={sido} onChange={(e) => setSido(e.target.value)} aria-label="근무 지역">
              <option value="">전국 전체</option>
              {SIDO_CANONICAL.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="mt-1 text-[12px] text-mute">지역을 고르면 전국 모집 공고도 함께 나와요.</p>
          </div>
          <div>
            <p className={label}>직무 분야 (NCS)</p>
            <select className={input} value={ncs} onChange={(e) => setNcs(e.target.value)} aria-label="직무 분야">
              <option value="">전체 분야</option>
              {NCS_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <p className={label}>학력 요건</p>
            <select className={input} value={education} onChange={(e) => setEducation(e.target.value)} aria-label="학력 요건">
              {EDUCATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className={label}>경력 구분</p>
              <select className={input} value={career} onChange={(e) => setCareer(e.target.value)} aria-label="경력 구분">
                {CAREERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <p className={label}>고용형태</p>
              <select className={input} value={hire} onChange={(e) => setHire(e.target.value)} aria-label="고용형태">
                {HIRES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className={label}>기관 형태</p>
            <select className={input} value={org} onChange={(e) => setOrg(e.target.value)} aria-label="기관 형태">
              {ORGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={loading} className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {loading ? "검색 중…" : "공고 검색 →"}
          </button>
        </div>
      </form>

      {/* ── 결과 ── */}
      <section>
        {/* 나만의 강점으로 직무찾기 — 내 기술·강점 키워드로 공고를 찾는 기능 (동의어 확장 + 원문 근거 하이라이트) */}
        <div className="mb-4 rounded-[18px] border border-[#6b4fbb]/25 bg-gradient-to-r from-[#efe9fb] to-[#f8f5fe] p-4">
          <p className="text-[16px] font-extrabold text-[#4a3a85]">🔍 나만의 강점으로 직업찾기</p>
          {kwChips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {kwChips.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[13px] font-bold text-[#6b4fbb] shadow-sm">
                  {k}
                  <button type="button" onClick={() => setKwChips((prev) => prev.filter((x) => x !== k))} className="text-[#6b4fbb]/60 hover:text-[#6b4fbb]" aria-label={`${k} 키워드 삭제`}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-2.5 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-[10px] border border-[#6b4fbb]/30 bg-white px-3 py-2 text-[15px] outline-none placeholder:text-[#6b4fbb]/45 focus:border-[#6b4fbb]"
              value={kwDraft}
              onChange={(e) => setKwDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (kwDraft.trim()) addChip(kwDraft);
                  else runSearch();
                }
              }}
              placeholder="내 기술·강점을 적어보세요 — 예: RAG, Tool-Use (Enter로 여러 개 추가)"
              aria-label="키워드"
            />
            <button type="button" onClick={() => runSearch()} disabled={loading} className="shrink-0 rounded-full bg-[#6b4fbb] px-5 py-2 text-[14.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">
              {loading ? "검색 중…" : "강점으로 찾기 →"}
            </button>
          </div>
        </div>

        {error && <p className="mb-3 rounded-[12px] bg-[#fde8e8] px-4 py-3 text-[14.5px] font-bold text-[#c0392b]">⚠ {error}</p>}

        {/* 키워드 토글 — 켠 키워드의 합집합만 표시 */}
        {resultKws.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {resultKws.map((k) => {
              const on = selectedKw.has(k);
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] font-bold transition ${on ? "border-[#6b4fbb] bg-[#efe9fb] text-[#6b4fbb]" : "border-line bg-card text-mute"}`}
                  title={expandedByKw[k]?.length > 1 ? `확장 검색어: ${expandedByKw[k].join(", ")}${aiByKw[k] ? " (AI 연관어 확장)" : ""}` : undefined}
                >
                  <button onClick={() => toggleKw(k)} className="inline-flex items-center gap-1">
                    {on ? "✓ " : ""}{k} <span className="font-normal">({countOf(k)})</span>
                  </button>
                  {aiByKw[k] && <span className="rounded bg-[#6b4fbb] px-1 text-[10px] font-bold text-white" title="사전에 없는 단어라 AI가 동일·하위 개념 연관어로 확장했어요">AI</span>}
                  <button onClick={() => removeKeyword(k)} className="text-current opacity-50 hover:opacity-100" aria-label={`${k} 키워드 삭제`} title="이 키워드 삭제">✕</button>
                </span>
              );
            })}
            <span className="text-[12.5px] text-mute">버튼을 켜고 끄면 해당 키워드만 · ✕는 키워드 삭제</span>
          </div>
        )}

        {!searched || loading ? (
          <p className="rounded-[18px] border border-line bg-card p-6 text-[15px] text-mute">공고를 불러오는 중…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-card p-6">
            <p className="text-[15.5px] font-bold">조건에 맞는 접수 중 공고가 없어요.</p>
            {resultKws.length > 0 && (
              <p className="mt-1 text-[14px] text-mute">
                키워드는 동의어까지 넓혀 찾았어요 — {resultKws.filter((k) => (expandedByKw[k]?.length ?? 0) > 1).map((k) => `${k}: ${expandedByKw[k].join("·")}`).join(" / ") || resultKws.join("·")}
              </p>
            )}
            <p className="mt-1 text-[14px] text-mute">지역을 &ldquo;전국 전체&rdquo;로 넓히거나 직무 분야·학력·키워드 조건을 풀어보세요.</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-[14px] text-mute">
              접수 중 공고 <b className="text-ink">{resultKws.length ? visible.length : singleTotal}건</b> · 마감 임박순
              {resultKws.length === 0 && singleTotal > visible.length ? ` (상위 ${visible.length}건 표시)` : ""}
              {pageCount > 1 && <> · {curPage}/{pageCount} 페이지</>}
              {resultKws.some((k) => (expandedByKw[k]?.length ?? 0) > 1) && (
                <> · 확장: {resultKws.filter((k) => (expandedByKw[k]?.length ?? 0) > 1).map((k) => `${k}→${expandedByKw[k].filter((x) => x !== k).join("·")}`).join(" / ")}</>
              )}
            </p>
            <ul className="grid gap-3 xl:grid-cols-2">
              {paged.map((j) => (
                <li key={j.job_id} className="flex flex-col rounded-[14px] border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13.5px] font-bold text-leaf-deep">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11.5px] ${isPublicOrg(j.source, j.company) ? "bg-mint-soft text-leaf-deep" : "bg-[#efe9fb] text-[#6b4fbb]"}`}>{isPublicOrg(j.source, j.company) ? "공공기관" : "사기업"}</span>
                      {j.company ?? "기업 미상"}
                    </p>
                    <DdayBadge d={j.dday} />
                  </div>
                  <p className="mt-1 text-[16px] font-bold leading-snug">{j.title}</p>
                  {resultKws.length > 0 && (matchedBy[j.job_id] ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(matchedBy[j.job_id] ?? []).map((k) => (
                        <span key={k} className="rounded-full bg-[#efe9fb] px-2 py-0.5 text-[11.5px] font-bold text-[#6b4fbb]">#{k}</span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-[13.5px] text-mute">
                    {(j.is_national && j.region_names.length === 0 ? "전국" : j.region_names.join("·")) || "지역 미상"}
                    {(() => { const o = orderedNcs(j); return o.names.length > 0 && (
                      <> · {o.matchedFirst ? <b className="text-leaf-deep">✓ {o.names[0]}</b> : o.names[0]}{o.names.slice(1).map((n) => <span key={n}> · {n}</span>)}{o.more > 0 && <span> 외 {o.more}분야</span>}</>
                    ); })()}
                    {j.hire_types.length > 0 && <> · {j.hire_types.slice(0, 2).join("·")}</>}
                  </p>
                  <p className="text-[13.5px] text-mute">
                    {j.career && <>{j.career}</>}
                    {j.education && <> · {j.education}</>}
                    {j.salary_text && <> · {j.salary_text}</>}
                    {j.headcount ? <> · {j.headcount}명</> : null}
                  </p>
                  {j.summary && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink/80">{j.summary}</p>}
                  {j.requirements && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-mute">자격 · {j.requirements}</p>}
                  {/* 키워드가 공고 원문 어디에 걸렸는지 — 근거 하이라이트 (켜진 키워드만, 최대 2개) */}
                  {Object.entries(evidence[j.job_id] ?? {}).filter(([k]) => selectedKw.has(k)).slice(0, 2).map(([k, m]) => (
                    <p key={k} className="mt-1 rounded-[8px] bg-paper px-2 py-1 text-[12.5px] leading-snug text-mute">
                      <span className="font-bold text-[#6b4fbb]">#{k}</span> → “{m.before}
                      <mark className="rounded-[3px] bg-[#efe9fb] px-0.5 font-bold text-[#6b4fbb] underline decoration-2">{m.term}</mark>
                      {m.after}”
                    </p>
                  ))}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line pt-2 text-[13.5px]">
                    <span className="text-mute">
                      {j.deadline ? (
                        <>접수 {j.pbanc_begin?.slice(5).replace("-", "/")} ~ <b className="text-ink">{j.deadline.slice(5).replace("-", "/")}{j.deadline_time ? ` ${j.deadline_time}` : ""}</b>
                        {!j.deadline_time && <span title="이 소스는 마감 시각을 제공하지 않아요 — 당일 마감 시각은 공고 원문에서 확인"> (시각은 원문 확인)</span>}</>
                      ) : "상시·채용 시 마감"}
                    </span>
                    <span className="flex items-center gap-3">
                      {j.deadline && (
                        calSaved.has(j.job_id)
                          ? <span className="font-bold text-leaf-deep">✓ 캘린더에 담김</span>
                          : <button onClick={() => void addToCalendar(j)} disabled={calBusy === j.job_id} className="font-bold text-leaf-deep underline disabled:opacity-50">
                              {calBusy === j.job_id ? "담는 중…" : "📅 캘린더에 담기"}
                            </button>
                      )}
                      {j.detail_url?.startsWith("http") && <a href={j.detail_url} target="_blank" rel="noreferrer" className="font-bold underline">공고 원문 ↗</a>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {pageCount > 1 && (
              <nav className="mt-4 flex flex-wrap items-center justify-center gap-1.5" aria-label="페이지 이동">
                <button onClick={() => goPage(curPage - 1)} disabled={curPage === 1} className="rounded-[10px] border border-line bg-card px-3 py-1.5 text-[14px] font-bold text-mute transition hover:text-ink disabled:opacity-40">
                  ← 이전
                </button>
                {pageNums.map((n, i) =>
                  n === "…" ? (
                    <span key={`e${i}`} className="px-1 text-[14px] text-mute">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => goPage(n)}
                      aria-current={n === curPage ? "page" : undefined}
                      className={`min-w-9 rounded-[10px] px-3 py-1.5 text-[14px] font-bold transition ${n === curPage ? "bg-ink text-white" : "border border-line bg-card text-mute hover:text-ink"}`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button onClick={() => goPage(curPage + 1)} disabled={curPage === pageCount} className="rounded-[10px] border border-line bg-card px-3 py-1.5 text-[14px] font-bold text-mute transition hover:text-ink disabled:opacity-40">
                  다음 →
                </button>
              </nav>
            )}
            <p className="mt-3 text-[12.5px] text-mute">출처: 기업 공식 채용 채널(네이버·카카오·쿠팡·당근·크래프톤 등 공개 API) · 고용24 공채속보 · 기획재정부 공공기관 채용정보 잡알리오 — 지원 자격·일정은 반드시 공고 원문에서 확인하세요.</p>
          </>
        )}
      </section>
    </div>
  );
}
