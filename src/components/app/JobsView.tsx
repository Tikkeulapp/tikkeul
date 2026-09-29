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
  ncs_names: string[]; hire_types: string[]; career: string | null; education: string | null; salary_text: string | null;
  headcount: number | null; pbanc_begin: string | null; deadline: string | null; detail_url: string | null; dday: number | null;
};

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
            <p className="mt-1 text-[14px] text-mute">지역을 &ldquo;전국 전체&rdquo;로 넓히거나 직무 분야·학력 조건을 풀어보세요.</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-[14px] text-mute">
              접수 중 공고 <b className="text-ink">{total}건</b> · 마감 임박순 {total > jobs.length ? `(상위 ${jobs.length}건 표시)` : ""}
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
                    {j.ncs_names.length > 0 && <> · {j.ncs_names.slice(0, 2).join("·")}</>}
                    {j.hire_types.length > 0 && <> · {j.hire_types.slice(0, 2).join("·")}</>}
                  </p>
                  <p className="text-[13.5px] text-mute">
                    {j.career && <>{j.career}</>}
                    {j.education && <> · {j.education}</>}
                    {j.salary_text && <> · {j.salary_text}</>}
                    {j.headcount ? <> · {j.headcount}명</> : null}
                  </p>
                  <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[13.5px]">
                    <span className="text-mute">
                      {j.deadline ? <>접수 {j.pbanc_begin?.slice(5).replace("-", "/")} ~ <b className="text-ink">{j.deadline.slice(5).replace("-", "/")}</b></> : "상시·채용 시 마감"}
                    </span>
                    {j.detail_url && <a href={j.detail_url} target="_blank" rel="noreferrer" className="font-bold underline">공고 원문 ↗</a>}
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
