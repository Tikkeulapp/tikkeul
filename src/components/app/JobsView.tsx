"use client";

/**
 * 채용공고 검색 화면 — 조건(지역·직무분야·학력·경력·키워드)을 고르면 마감 전 공고가 마감 임박순으로 나온다.
 * 데이터: 공공기관 채용정보(잡알리오) 수집분(job_postings). 필터·정렬은 전부 코드가 처리(LLM 없음).
 * 첫 진입 시 프로필(거주지·목표 직무 → NCS)을 기본 조건으로 채워 "본인 조건 검색"이 한 번에 되게 한다.
 */
import { useCallback, useEffect, useState } from "react";
import { getPersona } from "@/data/personas";
import { NCS_CATEGORIES, ncsCodesForTargetJob } from "@/data/ncs";
import { SIDO_CANONICAL } from "@/lib/region";
import type { SimSession } from "@/components/app/SimulateView";

type Job = {
  job_id: string; source: string; title: string; company: string | null; region_names: string[]; is_national: boolean;
  ncs_codes: string[]; ncs_names: string[]; hire_types: string[]; career: string | null; education: string | null; salary_text: string | null;
  headcount: number | null; pbanc_begin: string | null; deadline: string | null; deadline_time: string | null; detail_url: string | null; dday: number | null;
};

const TODAY_KST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

const EDUCATIONS = [
  { value: "", label: "전체" },
  { value: "무관", label: "학력무관만" },
  { value: "고졸", label: "고졸 지원 가능" },
];
const CAREERS = [
  { value: "신입", label: "신입 지원 가능" },
  { value: "", label: "전체(경력 포함)" },
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

export function JobsView({ session }: { session: SimSession }) {
  const persona = session.personaId ? getPersona(session.personaId) : null;
  const defaultSido = persona ? persona.declared.region.sido : "";
  const defaultNcs = ncsCodesForTargetJob(persona?.declared.targetJob)[0] ?? "";

  const [sido, setSido] = useState(defaultSido);
  const [ncs, setNcs] = useState(defaultNcs);
  const [education, setEducation] = useState("");
  const [career, setCareer] = useState("신입");
  const [keyword, setKeyword] = useState("");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedNcs, setAppliedNcs] = useState(defaultNcs); // 마지막 검색에 쓴 직무분야 (일치 항목 우선 표시용)
  const [usedKeywords, setUsedKeywords] = useState<string[]>([]); // 동의어 확장된 검색어 (빈 결과 안내용)
  const [calSaved, setCalSaved] = useState<Set<string>>(new Set()); // 캘린더에 담은 공고
  const [calBusy, setCalBusy] = useState<string | null>(null);

  const search = useCallback(async (params: { sido: string; ncs: string; education: string; career: string; keyword: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sido: params.sido || null, ncs: params.ncs || null,
          education: params.education || null, career: params.career || null, keyword: params.keyword || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "검색 실패");
      setJobs(json.jobs ?? []);
      setTotal(json.total ?? 0);
      setAppliedNcs(params.ncs);
      setUsedKeywords(json.keywords ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 첫 진입: 프로필 기본 조건으로 자동 검색
  useEffect(() => {
    void search({ sido: defaultSido, ncs: defaultNcs, education: "", career: "신입", keyword: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void search({ sido, ncs, education, career, keyword });
  };

  /** 직무분야 표시: 검색에 쓴 분야와 일치하는 항목을 맨 앞으로 (대형 공채는 분야가 5개+라 잘리면 안 맞아 보임) */
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
      <form onSubmit={onSubmit} className="h-fit rounded-[18px] border border-line bg-card p-4 lg:sticky lg:top-4">
        <p className="text-[15px] font-bold">검색 조건</p>
        <p className="mt-1 text-[12.5px] text-mute">처음에는 내 프로필(거주지·목표 직무) 기준으로 검색돼요.</p>
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
          <div>
            <p className={label}>경력 구분</p>
            <select className={input} value={career} onChange={(e) => setCareer(e.target.value)} aria-label="경력 구분">
              {CAREERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <p className={label}>키워드</p>
            <input className={input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 데이터, 전산, 행정" aria-label="키워드" />
          </div>
          <button type="submit" disabled={loading} className="rounded-full bg-ink px-5 py-2.5 text-[15px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            {loading ? "검색 중…" : "공고 검색 →"}
          </button>
        </div>
      </form>

      {/* ── 결과 ── */}
      <section>
        {error && <p className="rounded-[12px] bg-[#fde8e8] px-4 py-3 text-[14.5px] font-bold text-[#c0392b]">⚠ {error}</p>}
        {jobs === null || loading ? (
          <p className="rounded-[18px] border border-line bg-card p-6 text-[15px] text-mute">공고를 불러오는 중…</p>
        ) : jobs.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-card p-6">
            <p className="text-[15.5px] font-bold">조건에 맞는 접수 중 공고가 없어요.</p>
            {usedKeywords.length > 1 && (
              <p className="mt-1 text-[14px] text-mute">키워드는 동의어까지 넓혀 찾았어요: {usedKeywords.join(" · ")}</p>
            )}
            <p className="mt-1 text-[14px] text-mute">지역을 &ldquo;전국 전체&rdquo;로 넓히거나 직무 분야·학력 조건을 풀어보세요.</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-[14px] text-mute">
              접수 중 공고 <b className="text-ink">{total}건</b> · 마감 임박순 {total > jobs.length ? `(상위 ${jobs.length}건 표시)` : ""}
              {usedKeywords.length > 1 && <> · 키워드 확장: {usedKeywords.join("·")}</>}
            </p>
            <ul className="grid gap-3 xl:grid-cols-2">
              {jobs.map((j) => (
                <li key={j.job_id} className="flex flex-col rounded-[14px] border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13.5px] font-bold text-leaf-deep">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11.5px] ${j.source === "pubinst" ? "bg-mint-soft text-leaf-deep" : "bg-[#efe9fb] text-[#6b4fbb]"}`}>{j.source === "pubinst" ? "공공기관" : "민간"}</span>
                      {j.company ?? "기업 미상"}
                    </p>
                    <DdayBadge d={j.dday} />
                  </div>
                  <p className="mt-1 text-[16px] font-bold leading-snug">{j.title}</p>
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
                      {j.detail_url && <a href={j.detail_url} target="_blank" rel="noreferrer" className="font-bold underline">공고 원문 ↗</a>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-mute">출처: 사람인 오픈API(민간) · 기획재정부 공공기관 채용정보 잡알리오(공공) — 지원 자격·일정은 반드시 공고 원문에서 확인하세요.</p>
          </>
        )}
      </section>
    </div>
  );
}
