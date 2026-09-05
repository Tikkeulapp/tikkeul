"use client";

import { useState } from "react";
import { COMPANY_TYPES, type CompanyType, type GoalType, type SimResult, type SpendingProfile } from "@/lib/simulate";
import { HOUSE_REGIONS, type HouseRegion } from "@/data/postjob_reference";
import type { JudgedProgram } from "@/data/postjob_programs";

type SimSession = { personaId: string | null; profileId?: string | null; userId?: string | null; name?: string };

type ApiResponse = {
  result: SimResult;
  spending: SpendingProfile;
  profile: { age: number | null; housing: string | null; source: string; region: string | null };
  programs: { likely: JudgedProgram[]; needsCheck: JudgedProgram[]; unlikely: { id: string; name: string; reason: string }[] };
  ai: { summary: string; priorities: string[]; cautions: string[] } | null;
  aiError: string | null;
  notes: string[];
  disclaimer: string;
};

const man = (krw: number) => {
  const m = Math.round(krw / 10000);
  if (Math.abs(m) < 10000) return `${m.toLocaleString("ko-KR")}만 원`;
  const eok = Math.floor(m / 10000), rest = m % 10000;
  return rest ? `${eok}억 ${rest.toLocaleString("ko-KR")}만 원` : `${eok}억 원`;
};
const won = (krw: number) => `${Math.round(krw).toLocaleString("ko-KR")}원`;
const ymLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
const dur = (n: number) => (n < 12 ? `${n}개월` : `${Math.floor(n / 12)}년${n % 12 ? ` ${n % 12}개월` : ""}`);
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
};

const ALLOC_COLORS = ["#1f1d3d", "#6b6b6b", "#c9c2b8", "#2fbf5f", "#dceeb1"];
const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  LIKELY: { text: "가능성 높음", cls: "bg-[#2fbf5f] text-white" },
  NEEDS_CHECK: { text: "확인 필요", cls: "bg-[#f6e05e] text-ink" },
};

export function SimulateModal({ session, onClose }: { session: SimSession; onClose: () => void }) {
  const [stage, setStage] = useState<"form" | "loading" | "result">("form");
  const [companyType, setCompanyType] = useState<CompanyType>("중소기업");
  const [salaryMan, setSalaryMan] = useState("3600");
  const [goal, setGoal] = useState<GoalType>("LUMP_SUM");
  const [targetMan, setTargetMan] = useState("10000");
  const [region, setRegion] = useState<HouseRegion>("수도권");
  const [startMonth, setStartMonth] = useState(nextMonth());
  const [cardMan, setCardMan] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [showUnlikely, setShowUnlikely] = useState(false);
  const isPersona = !!session.personaId;

  const run = async () => {
    setError(null);
    setStage("loading");
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: session.personaId,
          profileId: session.profileId ?? null,
          userId: session.userId ?? null,
          input: {
            companyType,
            annualSalaryKrw: Number(salaryMan) * 10000,
            goal: { type: goal, targetKrw: goal === "LUMP_SUM" ? Number(targetMan) * 10000 : undefined, houseRegion: goal === "HOUSE" ? region : undefined },
            startMonth,
            monthlyCardSpendKrw: isPersona ? undefined : Number(cardMan) * 10000,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "계산 실패");
      setData(json as ApiResponse);
      setStage("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 실패");
      setStage("form");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-card p-6 shadow-lift ${stage === "result" ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-mute">취업 후엔 어떻게 될까</p>
            <h2 className="text-[19px] font-extrabold tracking-tight">🎯 취업 후 시뮬레이션</h2>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-mute" aria-label="닫기">×</button>
        </div>

        {stage !== "result" && (
          <div className="mt-4 space-y-5 text-[13px]">
            <p className="text-mute">
              {isPersona ? "마이데이터에서 읽은 카드 소비·대출·월세 구조에" : "입력하신 금융정보에"} 예상 연봉을 얹어, 목표까지 얼마나 걸리는지와 취업하면 열리는 제도를 계산합니다.
            </p>

            <div>
              <p className="mb-1.5 font-bold">기업 구분</p>
              <div className="flex flex-wrap gap-1.5">
                {COMPANY_TYPES.map((c) => (
                  <button key={c} type="button" onClick={() => setCompanyType(c)}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${companyType === c ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="font-bold">세전 연봉 (만 원)</span>
                <input type="number" min={1000} max={100000} step={100} value={salaryMan} onChange={(e) => setSalaryMan(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-ink" />
              </label>
              <label className="block">
                <span className="font-bold">입사 예정 월</span>
                <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-ink" />
              </label>
            </div>

            <div>
              <p className="mb-1.5 font-bold">목적 <span className="font-normal text-mute">(하나 선택)</span></p>
              <div className="grid gap-2">
                <div role="button" tabIndex={0} onClick={() => setGoal("LUMP_SUM")} onKeyDown={(e) => e.key === "Enter" && setGoal("LUMP_SUM")}
                  className={`cursor-pointer rounded-2xl border p-3 text-left transition ${goal === "LUMP_SUM" ? "border-ink bg-mint-soft" : "border-line hover:border-ink"}`}>
                  <p className="font-bold">💰 목돈 모으기</p>
                  {goal === "LUMP_SUM" && (
                    <label className="mt-2 flex items-center gap-2 text-[12.5px]" onClick={(e) => e.stopPropagation()}>
                      목표 금액
                      <input type="number" min={100} step={100} value={targetMan} onChange={(e) => setTargetMan(e.target.value)}
                        className="w-28 rounded-lg border border-line px-2 py-1 outline-none focus:border-ink" />
                      만 원 <span className="text-mute">(기본 1억)</span>
                    </label>
                  )}
                </div>
                <div role="button" tabIndex={0} onClick={() => setGoal("HOUSE")} onKeyDown={(e) => e.key === "Enter" && setGoal("HOUSE")}
                  className={`cursor-pointer rounded-2xl border p-3 text-left transition ${goal === "HOUSE" ? "border-ink bg-mint-soft" : "border-line hover:border-ink"}`}>
                  <p className="font-bold">🏠 내집마련</p>
                  {goal === "HOUSE" && (
                    <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {HOUSE_REGIONS.map((r) => (
                        <button key={r} type="button" onClick={() => setRegion(r)}
                          className={`rounded-full border px-2.5 py-1 text-[12px] font-bold ${region === r ? "border-ink bg-ink text-white" : "border-line"}`}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div role="button" tabIndex={0} onClick={() => setGoal("MARRIAGE")} onKeyDown={(e) => e.key === "Enter" && setGoal("MARRIAGE")}
                  className={`cursor-pointer rounded-2xl border p-3 text-left transition ${goal === "MARRIAGE" ? "border-ink bg-mint-soft" : "border-line hover:border-ink"}`}>
                  <p className="font-bold">💍 결혼</p>
                </div>
              </div>
            </div>

            {!isPersona && (
              <label className="block">
                <span className="font-bold">월 평균 카드 소비 (만 원)</span>
                <input type="number" min={0} step={5} value={cardMan} onChange={(e) => setCardMan(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-ink" />
                <span className="mt-1 block text-[11.5px] text-mute">실서비스에서는 마이데이터 카드 승인내역으로 자동 집계됩니다.</span>
              </label>
            )}

            {error && <p className="rounded-xl bg-butter px-3 py-2 text-[12.5px] font-bold">{error}</p>}

            <div className="flex gap-2">
              <button onClick={run} disabled={stage === "loading"}
                className="rounded-full bg-leaf px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#333333] disabled:opacity-60">
                {stage === "loading" ? "계산 중… (AI 해설 포함 5~10초)" : "시뮬레이션 실행 →"}
              </button>
              <button onClick={onClose} className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold">닫기</button>
            </div>
          </div>
        )}

        {stage === "result" && data && <Result data={data} onBack={() => setStage("form")} showUnlikely={showUnlikely} setShowUnlikely={setShowUnlikely} />}
      </div>
    </div>
  );
}

function Result({ data, onBack, showUnlikely, setShowUnlikely }: { data: ApiResponse; onBack: () => void; showUnlikely: boolean; setShowUnlikely: (v: boolean) => void }) {
  const r = data.result;
  const n = r.net;
  return (
    <div className="mt-4 space-y-5 text-[13px]">
      {/* 실수령 */}
      <section className="rounded-2xl bg-leaf-deep p-5 text-white">
        <p className="text-[11.5px] font-bold opacity-80">{ymLabel(r.startMonth)} 입사 기준 · 세후 월 실수령 (근사)</p>
        <p className="mt-1 text-[30px] font-extrabold tracking-tight">{won(n.netMonthlyKrw)}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] opacity-85">
          <span>세전 {won(n.grossMonthlyKrw)}</span>
          <span>연금 −{won(n.pensionKrw)}</span>
          <span>건강·요양 −{won(n.healthKrw + n.ltcKrw)}</span>
          {n.employmentKrw > 0 && <span>고용 −{won(n.employmentKrw)}</span>}
          <span>소득세+지방세 −{won(n.incomeTaxMonthlyKrw + n.localTaxMonthlyKrw)}</span>
        </div>
        <p className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${n.reliefApplied ? "bg-[#2fbf5f] text-white" : "bg-white/15"}`}>{n.note}</p>
      </section>

      {/* 배분 */}
      <section className="rounded-2xl border border-line p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-extrabold">한 달 흐름 (기본 시나리오)</h3>
          <span className="text-[11.5px] text-mute">지출 {won(r.spending.totalKrw)} · 여유 {won(r.surplusMonthlyKrw)}</span>
        </div>
        <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-line">
          {r.allocation.map((a, i) => (
            <div key={a.label} style={{ width: `${a.pct}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} title={`${a.label} ${won(a.krw)}`} />
          ))}
        </div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {r.allocation.map((a, i) => (
            <li key={a.label} className="flex items-center gap-2 text-[12.5px]">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
              <span className="text-mute">{a.label}</span>
              <span className="ml-auto font-bold">{won(a.krw)} <span className="text-mute">({a.pct}%)</span></span>
            </li>
          ))}
        </ul>
        {r.spending.topCategories.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-[11.5px] font-bold text-mute">마이데이터 카드 승인내역 {data.spending.monthsObserved}개월 평균 · 소비 상위</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.spending.topCategories.map((c) => (
                <span key={c.category} className="rounded-full bg-mint-soft px-2.5 py-1 text-[12px]"><b>{c.category}</b> {won(c.monthlyKrw)} · {c.pct}%</span>
              ))}
            </div>
          </div>
        )}
        <p className={`mt-3 rounded-xl px-3 py-2 text-[12.5px] ${r.debt.advice === "PAY_FIRST" ? "bg-butter" : "bg-mint-soft"}`}>
          <b>{r.debt.advice === "NONE" ? "대출 없음" : r.debt.advice === "PAY_FIRST" ? "상환 우선" : "저축 병행"}</b>
          {r.debt.totalKrw > 0 && <> · 잔액 {man(r.debt.totalKrw)} · 월 {won(r.debt.monthlyKrw)}</>} — {r.debt.reason}
        </p>
      </section>

      {/* 목표·시나리오 */}
      <section className="rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-extrabold">{r.goal.label} · 목표 {man(r.goal.targetKrw)}</h3>
          <span className="text-[11.5px] text-mute">현재 예·적금 {man(r.goal.startingAssetsKrw)}에서 시작</span>
        </div>
        {Object.keys(r.goal.detail).length > 0 && (
          <ul className="mt-2 grid gap-1 text-[12.5px] sm:grid-cols-2">
            {Object.entries(r.goal.detail).map(([k, v]) => (
              <li key={k} className="flex justify-between rounded-lg bg-mint-soft px-3 py-1.5"><span className="text-mute">{k}</span><b>{typeof v === "number" ? man(v) : v}</b></li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {r.scenarios.map((s) => (
            <div key={s.key} className={`rounded-2xl border p-3 ${s.key === "기본" ? "border-ink" : "border-line"}`}>
              <p className="text-[11.5px] font-bold text-mute">{s.key} · {s.label}</p>
              <p className="mt-1 text-[15px] font-extrabold">월 {man(s.savingsMonthlyKrw)}</p>
              {s.monthsToGoal === null ? (
                <p className="mt-1 text-[12px] font-bold text-[#b45309]">현재 구조로는 도달 불가</p>
              ) : (
                <p className="mt-1 text-[12px]"><b>{s.goalMonth ? ymLabel(s.goalMonth) : "-"}</b> <span className="text-mute">· {dur(s.monthsToGoal)}</span></p>
              )}
              {s.spendingCutKrw > 0 && <p className="mt-0.5 text-[11px] text-mute">소비 절감 {won(s.spendingCutKrw)} 포함</p>}
            </div>
          ))}
        </div>
        <ul className="mt-3 list-disc pl-4 text-[11.5px] text-mute">
          {r.goal.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      {r.warnings.length > 0 && (
        <ul className="space-y-1">
          {r.warnings.map((w) => <li key={w} className="rounded-xl bg-butter px-3 py-2 text-[12.5px]">⚠️ {w}</li>)}
        </ul>
      )}

      {/* 제도 */}
      <section className="rounded-2xl border border-line p-4">
        <h3 className="font-extrabold">취업하면 열리는 제도 <span className="text-[12px] font-normal text-mute">규칙 판정 · {data.programs.likely.length + data.programs.needsCheck.length}건</span></h3>
        <ul className="mt-2 space-y-2">
          {[...data.programs.likely, ...data.programs.needsCheck].map((p) => (
            <li key={p.id} className="rounded-2xl bg-mint-soft p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[p.status]?.cls ?? ""}`}>{STATUS_BADGE[p.status]?.text}</span>
                <b>{p.name}</b>
                <span className="text-[11.5px] text-mute">{p.provider} · {p.category}</span>
              </div>
              <p className="mt-1 text-[12.5px]">{p.summary}</p>
              <p className="mt-0.5 text-[12.5px]"><span className="font-bold text-leaf-deep">🎁 {p.benefit}</span></p>
              <p className="mt-0.5 text-[12px] text-mute">판정 근거: {p.reason} · 기준 {p.asOf}</p>
              <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-bold underline">공식 페이지 ↗</a>
            </li>
          ))}
        </ul>
        {data.programs.unlikely.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setShowUnlikely(!showUnlikely)} className="text-[12px] font-bold text-mute underline">
              요건 미충족 {data.programs.unlikely.length}건 {showUnlikely ? "접기" : "보기"}
            </button>
            {showUnlikely && (
              <ul className="mt-1 space-y-0.5 text-[12px] text-mute">
                {data.programs.unlikely.map((u) => <li key={u.id}>· {u.name} — {u.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* AI */}
      <section className="rounded-2xl border border-line p-4">
        <h3 className="font-extrabold">🤖 AI 코치 한마디 <span className="text-[12px] font-normal text-mute">계산값만 인용해 설명</span></h3>
        {data.ai ? (
          <>
            <p className="mt-2 leading-relaxed">{data.ai.summary}</p>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5">
              {data.ai.priorities.map((p) => <li key={p}>{p}</li>)}
            </ol>
            {data.ai.cautions.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[12.5px] text-mute">
                {data.ai.cautions.map((c) => <li key={c}>⚠️ {c}</li>)}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-mute">AI 해설을 불러오지 못했습니다{data.aiError ? ` (${data.aiError})` : ""}. 위 계산 결과는 코드로 산출된 값이라 그대로 유효합니다.</p>
        )}
      </section>

      <footer className="text-[11px] text-mute">
        {data.notes.map((x) => <p key={x}>· {x}</p>)}
        {r.references.map((x) => <p key={x.label}>· {x.label} (기준 {x.asOf})</p>)}
        <p className="mt-1">{data.disclaimer}</p>
      </footer>

      <div className="flex gap-2">
        <button onClick={onBack} className="rounded-full bg-leaf px-5 py-2.5 text-[13.5px] font-bold text-white transition hover:bg-[#333333]">조건 바꿔 다시 계산</button>
      </div>
    </div>
  );
}
