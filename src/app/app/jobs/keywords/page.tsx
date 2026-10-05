"use client";

/**
 * 키워드별 공고 모아보기 — /app/jobs/keywords?kw=RAG,카드사
 * 메인 우측 "키워드로 공고 찾기" 위젯에서 진입. 키워드마다 동의어 확장 검색을 돌리고,
 * 상단 키워드 버튼(노션 다중선택 느낌)을 켜고 끄면 해당 키워드로 걸린 공고만 보인다.
 * 여러 개 켜면 합집합. 어떤 키워드로 걸렸는지 카드에 태그로 표시한다.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { getPersona } from "@/data/personas";
import type { SimSession } from "@/components/app/SimulateView";
import { EmploymentToggle } from "@/components/app/EmploymentToggle";

type Evidence = { term: string; before: string; after: string };
type Job = {
  job_id: string; source: string; title: string; company: string | null; region_names: string[]; is_national: boolean;
  ncs_names: string[]; hire_types: string[]; career: string | null; education: string | null; salary_text: string | null;
  summary?: string | null; requirements?: string | null; pbanc_begin: string | null; deadline: string | null; deadline_time: string | null; detail_url: string | null; dday: number | null;
  match?: Evidence | null;
};

const TODAY_KST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export default function KeywordJobsPage() {
  const [session, setSession] = useState<SimSession | null | undefined>(undefined);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  const [matchedBy, setMatchedBy] = useState<Map<string, Set<string>>>(new Map());
  const [evidence, setEvidence] = useState<Map<string, Record<string, Evidence>>>(new Map()); // job_id → {키워드: 매칭 근거}
  const [expandedByKw, setExpandedByKw] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calSaved, setCalSaved] = useState<Set<string>>(new Set());
  const [calBusy, setCalBusy] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tikkeul.session");
      setSession(raw ? (JSON.parse(raw) as SimSession) : null);
    } catch {
      setSession(null);
    }
    const kw = new URLSearchParams(window.location.search).get("kw") ?? "";
    const list = [...new Set(kw.split(",").map((k) => k.trim()).filter(Boolean))].slice(0, 8);
    setKeywords(list);
    setSelected(new Set(list));
  }, []);

  useEffect(() => {
    if (keywords.length === 0) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(keywords.map(async (k) => {
          const res = await fetch("/api/jobs/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: k }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? `'${k}' 검색 실패`);
          return { k, jobs: (json.jobs ?? []) as Job[], expanded: (json.keywords ?? []) as string[] };
        }));
        if (!alive) return;
        const jm = new Map<string, Job>();
        const mb = new Map<string, Set<string>>();
        const ev = new Map<string, Record<string, Evidence>>();
        const ex: Record<string, string[]> = {};
        for (const r of results) {
          ex[r.k] = r.expanded;
          for (const j of r.jobs) {
            jm.set(j.job_id, j);
            if (!mb.has(j.job_id)) mb.set(j.job_id, new Set());
            mb.get(j.job_id)!.add(r.k);
            if (j.match) ev.set(j.job_id, { ...(ev.get(j.job_id) ?? {}), [r.k]: j.match });
          }
        }
        setJobs(jm);
        setMatchedBy(mb);
        setEvidence(ev);
        setExpandedByKw(ex);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [keywords]);

  const toggle = (k: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const countOf = (k: string) => [...matchedBy.values()].filter((s) => s.has(k)).length;

  const visible = [...jobs.values()]
    .filter((j) => { const m = matchedBy.get(j.job_id); return m && [...m].some((k) => selected.has(k)); })
    .sort((a, b) => (a.deadline ?? "9999") < (b.deadline ?? "9999") ? -1 : 1);

  const addToCalendar = useCallback(async (j: Job) => {
    if (!session || !j.deadline || calBusy) return;
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
  }, [session, calBusy]);

  if (session === undefined) return null;
  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6">
        <div className="text-center">
          <p className="text-xl font-bold">프로필이 없어요</p>
          <Link href="/app/start" className="mt-4 inline-block rounded-full bg-leaf px-6 py-3 font-medium text-white">시작하기</Link>
        </div>
      </main>
    );
  }
  const persona = session.personaId ? getPersona(session.personaId) : null;
  const displayName = session.name ?? "회원";

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-[1600px] items-center gap-2.5 px-6 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-auto flex items-center gap-2.5 text-[16px] text-mute">
          <EmploymentToggle />
          <span>{persona ? `${persona.emoji} ${persona.name}` : `🙋 ${displayName}`}님 · <Link href="/app/start" className="underline">프로필 변경</Link></span>
        </span>
      </header>

      <div className="mx-auto w-full max-w-[1200px] px-6 pb-16">
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold text-mute"><Link href="/app" className="underline">← 캘린더</Link> · 키워드 검색</p>
            <h1 className="text-[34px] font-extrabold tracking-tight">🔎 키워드별 공고</h1>
          </div>
          <p className="max-w-xl text-[15px] text-mute">키워드 버튼을 켜고 끄면 해당 키워드로 걸린 공고만 보여요. 여러 개 켜면 모두 합쳐 보입니다.</p>
        </div>

        {/* 키워드 토글 버튼 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {keywords.map((k) => {
            const on = selected.has(k);
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                className={`rounded-full border px-4 py-2 text-[14.5px] font-bold transition ${on ? "border-[#6b4fbb] bg-[#efe9fb] text-[#6b4fbb]" : "border-line bg-card text-mute hover:text-ink"}`}
                title={expandedByKw[k]?.length > 1 ? `확장 검색어: ${expandedByKw[k].join(", ")}` : undefined}
              >
                {on ? "✓ " : ""}{k} <span className="font-normal">({countOf(k)})</span>
              </button>
            );
          })}
          <Link href="/app" className="rounded-full border border-dashed border-line px-4 py-2 text-[14.5px] text-mute hover:text-ink">+ 키워드 수정</Link>
        </div>

        {keywords.some((k) => (expandedByKw[k]?.length ?? 0) > 1) && (
          <p className="mt-2 text-[12.5px] text-mute">
            동의어 확장: {keywords.filter((k) => (expandedByKw[k]?.length ?? 0) > 1).map((k) => `${k} → ${expandedByKw[k].join("·")}`).join(" / ")}
          </p>
        )}

        {/* 결과 */}
        <section className="mt-5">
          {error && <p className="mb-3 rounded-[12px] bg-[#fde8e8] px-4 py-3 text-[14.5px] font-bold text-[#c0392b]">⚠ {error}</p>}
          {loading ? (
            <p className="rounded-[18px] border border-line bg-card p-6 text-[15px] text-mute">키워드별로 공고를 찾는 중…</p>
          ) : keywords.length === 0 ? (
            <p className="rounded-[18px] border border-line bg-card p-6 text-[15px] text-mute">키워드가 없어요. <Link href="/app" className="underline">캘린더 화면</Link> 우측에서 키워드를 담아 주세요.</p>
          ) : visible.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-card p-6">
              <p className="text-[15.5px] font-bold">켜진 키워드로 걸린 접수 중 공고가 없어요.</p>
              <p className="mt-1 text-[14px] text-mute">공공기관(잡알리오) + 민간(네이버·카카오·쿠팡·당근 등 기업 공식 채널) 공고에서 찾았어요. 키워드를 바꾸거나 수를 줄여 보세요.</p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[14px] text-mute">공고 <b className="text-ink">{visible.length}건</b> · 마감 임박순</p>
              <ul className="grid gap-3 md:grid-cols-2">
                {visible.map((j) => (
                  <li key={j.job_id} className="flex flex-col rounded-[14px] border border-line bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[13.5px] font-bold text-leaf-deep">
                        <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11.5px] ${j.source === "pubinst" ? "bg-mint-soft text-leaf-deep" : "bg-[#efe9fb] text-[#6b4fbb]"}`}>{j.source === "pubinst" ? "공공기관" : "사기업"}</span>
                        {j.company ?? "기업 미상"}
                      </p>
                      {j.dday === null
                        ? <span className="rounded-full bg-paper px-2 py-0.5 text-[12.5px] font-bold text-mute">상시</span>
                        : <span className={`rounded-full px-2 py-0.5 text-[12.5px] font-bold ${j.dday <= 7 ? "bg-[#fde8e8] text-[#c0392b]" : "bg-mint text-leaf-deep"}`}>{j.dday === 0 ? "오늘 마감" : `D-${j.dday}`}</span>}
                    </div>
                    <p className="mt-1 text-[16px] font-bold leading-snug">{j.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {[...(matchedBy.get(j.job_id) ?? [])].map((k) => (
                        <span key={k} className="rounded-full bg-[#efe9fb] px-2 py-0.5 text-[11.5px] font-bold text-[#6b4fbb]">#{k}</span>
                      ))}
                    </div>
                    {j.summary && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink/80">{j.summary}</p>}
                    {j.requirements && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-mute">자격 · {j.requirements}</p>}
                    {/* 어떤 단어가 공고 어디에 걸렸는지 — 근거 문맥을 하이라이트로 */}
                    {Object.entries(evidence.get(j.job_id) ?? {}).filter(([k]) => selected.has(k)).slice(0, 2).map(([k, m]) => (
                      <p key={k} className="mt-1 rounded-[8px] bg-paper px-2 py-1 text-[12.5px] leading-snug text-mute">
                        <span className="font-bold text-[#6b4fbb]">#{k}</span> → “{m.before}
                        <mark className="rounded-[3px] bg-[#efe9fb] px-0.5 font-bold text-[#6b4fbb] underline decoration-2">{m.term}</mark>
                        {m.after}”
                      </p>
                    ))}
                    <p className="mt-1.5 text-[13.5px] text-mute">
                      {(j.is_national && j.region_names.length === 0 ? "전국" : j.region_names.join("·")) || "지역 미상"}
                      {j.ncs_names.length > 0 && <> · {j.ncs_names.slice(0, 2).join("·")}</>}
                      {j.career && <> · {j.career}</>}
                      {j.salary_text && <> · {j.salary_text}</>}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line pt-2 text-[13.5px]">
                      <span className="text-mute">
                        {j.deadline ? <>~ <b className="text-ink">{j.deadline.slice(5).replace("-", "/")}{j.deadline_time ? ` ${j.deadline_time}` : ""}</b></> : "상시·채용 시 마감"}
                      </span>
                      <span className="flex items-center gap-3">
                        {j.deadline && (
                          calSaved.has(j.job_id)
                            ? <span className="font-bold text-leaf-deep">✓ 캘린더에 담김</span>
                            : <button onClick={() => void addToCalendar(j)} disabled={calBusy === j.job_id} className="font-bold text-leaf-deep underline disabled:opacity-50">📅 캘린더에 담기</button>
                        )}
                        {j.detail_url && <a href={j.detail_url} target="_blank" rel="noreferrer" className="font-bold underline">공고 원문 ↗</a>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
