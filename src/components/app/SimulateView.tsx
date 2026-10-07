"use client";

import { useState } from "react";
import { COMPANY_TYPES } from "@/lib/simulate";
import type { CompanyType, GoalType, SimResult, SpendingProfile } from "@/types/simulate";
import { HOUSE_REGIONS, type HouseRegion } from "@/data/postjob_reference";
import type { JudgedProgram } from "@/data/postjob_programs";
import { Donut } from "@/components/app/Donut";

export type SimSession = { personaId: string | null; profileId?: string | null; userId?: string | null; name?: string };

type ApiResponse = {
  result: SimResult;
  spending: SpendingProfile;
  profile: { age: number | null; housing: string | null; source: string; region: string | null };
  programs: { likely: JudgedProgram[]; needsCheck: JudgedProgram[]; unlikely: { id: string; name: string; reason: string }[] };
  dbPolicies: { policy_id: string; source: string; title: string; provider: string | null; region: string; theme: string | null; end_date: string | null; always_open: boolean; apply_url: string | null; score: number; reason: string; benefit_summary: string; goal_tags: string[] }[];
  dbCandidates: number;
  dbError: string | null;
  ai: { summary: string; priorities: string[]; cautions: string[] } | null;
  aiError: string | null;
  notes: string[];
  disclaimer: string;
};

/* ── 포맷 ─────────────────────────────────────────────── */
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

/* ── 스타일 토큰: 강조는 굵기 대신 색으로 ───────────────── */
const EM = "text-[#1b8f47]"; // 강조 (초록)
const ALLOC_COLOR_BY_LABEL: Record<string, string> = {
  "고정지출(월세·통신·보험)": "#1f1d3d",
  "대출 상환": "#6b6b6b",
  "변동소비(카드 등)": "#f28b82",
  "저축·투자": "#2fbf5f",
  "예비 여유": "#dceeb1",
};
const allocColor = (label: string) => ALLOC_COLOR_BY_LABEL[label] ?? "#c9c2b8";
const CAT_COLORS = ["#1f1d3d", "#2fbf5f", "#f6c453", "#8ab4f8", "#f28b82", "#c9c2b8"];
const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  LIKELY: { text: "가능성 높음", cls: "bg-[#2fbf5f] text-white" },
  NEEDS_CHECK: { text: "확인 필요", cls: "bg-[#f6e05e] text-ink" },
};
const SOURCE_LABEL: Record<string, string> = { ontong: "온통청년", gov24: "행안부 공공서비스", curated: "큐레이션" };
const GOAL_META: Record<GoalType, { emoji: string; label: string; hint: string }> = {
  LUMP_SUM: { emoji: "💰", label: "목돈 모으기", hint: "금액을 정해 모으기" },
  HOUSE: { emoji: "🏠", label: "내집마련", hint: "권역별 참고 주택가격 기준" },
  MARRIAGE: { emoji: "💍", label: "결혼", hint: "주택 제외 평균 결혼비용 기준" },
};

export function SimulateView({ session }: { session: SimSession }) {
  const [stage, setStage] = useState<"idle" | "loading" | "result">("idle");
  const [companyType, setCompanyType] = useState<CompanyType>("중소기업");
  const [salaryMan, setSalaryMan] = useState("3600");
  const [goals, setGoals] = useState<GoalType[]>(["LUMP_SUM"]);
  const [targetYears, setTargetYears] = useState<string>(""); // "" = 기간 미설정
  const [targetMan, setTargetMan] = useState("10000");
  const [region, setRegion] = useState<HouseRegion>("수도권");
  const [startMonth, setStartMonth] = useState(nextMonth());
  const [cardMan, setCardMan] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const isPersona = !!session.personaId;

  const toggleGoal = (g: GoalType) =>
    setGoals((prev) => (prev.includes(g) ? (prev.length > 1 ? prev.filter((x) => x !== g) : prev) : [...prev, g]));

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
            targetYears: targetYears ? Number(targetYears) : null,
            goals: goals.map((g) =>
              g === "LUMP_SUM" ? { type: g, targetKrw: Number(targetMan) * 10000 } : g === "HOUSE" ? { type: g, houseRegion: region } : { type: g },
            ),
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
      setStage(data ? "result" : "idle");
    }
  };

  return (
    <div className="mt-6 grid gap-7 lg:grid-cols-[400px_1fr] xl:grid-cols-[440px_1fr]">
      {/* ── 왼쪽: 조건 입력 ─────────────────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-3xl border border-line bg-card p-6 text-[16px] shadow-lift">
          <p className="text-mute">
            {isPersona ? "마이데이터에서 읽은 카드 소비·대출·월세 구조에" : "입력하신 금융정보에"} 예상 연봉을 얹어, 목표까지 얼마나 걸리는지와 취업하면 열리는 제도를 계산합니다.
          </p>

          <div className="mt-5">
            <p className="mb-2 font-bold">기업 구분</p>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_TYPES.map((c) => (
                <button key={c} type="button" onClick={() => setCompanyType(c)}
                  className={`rounded-full border px-3 py-1.5 text-[15.5px] transition ${companyType === c ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="block">
              <span className="font-bold">세전 연봉 <span className="font-normal text-mute">(만 원)</span></span>
              <input type="number" min={1000} max={100000} step={100} value={salaryMan} onChange={(e) => setSalaryMan(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-[17px] outline-none focus:border-ink" />
            </label>
            <label className="block">
              <span className="font-bold">입사 예정 월</span>
              {/* 브라우저 기본 month 선택기는 연도 변경 UI가 숨어 있어 올해만 고를 수 있는 것처럼
                  보인다 — 연도·월을 명시적인 드롭다운으로 분리 */}
              <span className="mt-1 grid grid-cols-2 gap-2">
                <select
                  value={startMonth.slice(0, 4)}
                  onChange={(e) => setStartMonth(`${e.target.value}-${startMonth.slice(5, 7)}`)}
                  className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[17px] outline-none focus:border-ink"
                >
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                    <option key={y} value={String(y)}>{y}년</option>
                  ))}
                </select>
                <select
                  value={startMonth.slice(5, 7)}
                  onChange={(e) => setStartMonth(`${startMonth.slice(0, 4)}-${e.target.value}`)}
                  className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[17px] outline-none focus:border-ink"
                >
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                    <option key={m} value={m}>{Number(m)}월</option>
                  ))}
                </select>
              </span>
            </label>
          </div>

          <div className="mt-5">
            <p className="mb-2 font-bold">목적 <span className="font-normal text-mute">(여러 개 선택 가능)</span></p>
            <div className="grid gap-2">
              {(Object.keys(GOAL_META) as GoalType[]).map((g) => {
                const on = goals.includes(g);
                return (
                  <div key={g} role="checkbox" aria-checked={on} tabIndex={0} onClick={() => toggleGoal(g)} onKeyDown={(e) => e.key === "Enter" && toggleGoal(g)}
                    className={`cursor-pointer rounded-2xl border p-3 transition ${on ? "border-ink bg-mint-soft" : "border-line hover:border-ink"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`grid h-5 w-5 place-items-center rounded-md border text-[14px] ${on ? "border-ink bg-ink text-white" : "border-line"}`}>{on ? "✓" : ""}</span>
                      <span className="font-bold">{GOAL_META[g].emoji} {GOAL_META[g].label}</span>
                      <span className="ml-auto text-[14.5px] text-mute">{GOAL_META[g].hint}</span>
                    </div>
                    {on && g === "LUMP_SUM" && (
                      <label className="mt-2 flex items-center gap-2 text-[15.5px]" onClick={(e) => e.stopPropagation()}>
                        목표 금액
                        <input type="number" min={100} step={100} value={targetMan} onChange={(e) => setTargetMan(e.target.value)}
                          className="w-28 rounded-lg border border-line px-2 py-1.5 outline-none focus:border-ink" />
                        만 원 <span className="text-mute">(기본 1억)</span>
                      </label>
                    )}
                    {on && g === "HOUSE" && (
                      <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {HOUSE_REGIONS.map((r) => (
                          <button key={r} type="button" onClick={() => setRegion(r)}
                            className={`rounded-full border px-2.5 py-1 text-[15px] ${region === r ? "border-ink bg-ink text-white" : "border-line"}`}>{r}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-[15.5px]">
              <span className="font-bold">목표 기간</span>
              <input type="number" min={1} max={30} step={1} value={targetYears} placeholder="예: 3"
                onChange={(e) => setTargetYears(e.target.value)} aria-label="목표 기간(년)"
                className="w-20 rounded-lg border border-line bg-card px-2 py-1.5 outline-none focus:border-ink" />
              <span>년 안에</span>
              <span className="text-[14px] text-mute">비워두면 도달 시점만 계산 · 입력하면 기간 내 달성 여부와 필요 월 저축액까지</span>
            </label>
          </div>

          {!isPersona && (
            <label className="mt-5 block">
              <span className="font-bold">월 평균 카드 소비 <span className="font-normal text-mute">(만 원)</span></span>
              <input type="number" min={0} step={5} value={cardMan} onChange={(e) => setCardMan(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-[17px] outline-none focus:border-ink" />
              <span className="mt-1 block text-[14.5px] text-mute">실서비스에서는 마이데이터 카드 승인내역으로 자동 집계됩니다.</span>
            </label>
          )}

          {error && <p className="mt-4 rounded-xl bg-butter px-3 py-2 text-[15.5px]">{error}</p>}

          <button onClick={run} disabled={stage === "loading"}
            className="mt-5 w-full rounded-full bg-leaf px-5 py-3 text-[17px] font-bold text-white transition hover:bg-[#333333] disabled:opacity-60">
            {stage === "loading" ? "계산 중… (AI 해설 포함 5~10초)" : stage === "result" ? "조건 바꿔 다시 계산 →" : "시뮬레이션 실행 →"}
          </button>
        </div>
      </aside>

      {/* ── 오른쪽: 결과 ──────────────────────────────── */}
      <section>
        {stage === "idle" && <Placeholder isPersona={isPersona} />}
        {stage === "loading" && !data && (
          <div className="rounded-3xl border border-line bg-card p-8 text-[17px] text-mute shadow-lift">
            <p className="font-bold text-ink">계산하고 있어요</p>
            <p className="mt-2">세후 실수령 → 지출 구조 → 목표 도달 시점 → 열리는 제도 순서로 계산한 뒤, AI가 결과를 읽고 해설을 붙입니다.</p>
          </div>
        )}
        {data && (stage === "result" || stage === "loading") && (
          <div className={stage === "loading" ? "opacity-50 transition" : ""}>
            <Result data={data} />
          </div>
        )}
      </section>
    </div>
  );
}

function Placeholder({ isPersona }: { isPersona: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card p-8 text-[17px] shadow-lift">
      <p className="text-[20px] font-extrabold">왼쪽에서 조건을 넣고 실행하면 이런 결과가 나옵니다</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          ["💵", "세후 월 실수령", "4대보험·소득세를 뺀 실제 통장 입금액. 중소기업 청년 감면·공무원연금 반영"],
          ["🍩", "한 달 흐름 · 소비 습관", isPersona ? "마이데이터 카드 승인내역으로 고정지출·소비·저축 비율과 소비 상위 카테고리를 도넛으로" : "입력한 월세·카드 소비로 고정지출·소비·저축 비율을 도넛으로"],
          ["🎯", "목표 도달 시점", "목돈·내집·결혼을 여러 개 골라도 됩니다. 작은 목표부터 순서대로, 보수·기본·공격 3 시나리오"],
          ["🏛️", "취업하면 열리는 제도", "청년도약계좌·ISA·청년주택드림청약·중소기업 감면 등 14종을 규칙으로 판정"],
        ].map(([e, t, d]) => (
          <li key={t} className="rounded-2xl bg-mint-soft p-4">
            <p className="font-bold">{e} {t}</p>
            <p className="mt-1 text-[15.5px] text-mute">{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Result({ data }: { data: ApiResponse }) {
  const r = data.result;
  const n = r.net;
  const [showUnlikely, setShowUnlikely] = useState(false);

  const allocSegments = r.allocation.map((a) => ({ label: a.label, value: a.krw, color: allocColor(a.label) }));
  const catTop = r.spending.topCategories;
  const catRest = Math.max(0, data.spending.cardMonthlyKrw - catTop.reduce((s, c) => s + c.monthlyKrw, 0));
  const catSegments = [
    ...catTop.map((c, i) => ({ label: c.category, value: c.monthlyKrw, color: CAT_COLORS[i % CAT_COLORS.length] })),
    ...(catRest > 0 ? [{ label: "기타", value: catRest, color: CAT_COLORS[5] }] : []),
  ];

  return (
    <div className="space-y-5 text-[16.5px]">
      {/* 실수령 */}
      <section className="rounded-3xl bg-leaf-deep p-6 text-white shadow-lift">
        <p className="text-[15px] opacity-80">{ymLabel(r.startMonth)} 입사 기준 · 세후 월 실수령 (근사)</p>
        <p className="mt-1 text-[44px] font-extrabold tracking-tight text-[#7ddf9a]">{won(n.netMonthlyKrw)}</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] opacity-85">
          <span>세전 {won(n.grossMonthlyKrw)}</span>
          <span>연금 −{won(n.pensionKrw)}</span>
          <span>건강·요양 −{won(n.healthKrw + n.ltcKrw)}</span>
          {n.employmentKrw > 0 && <span>고용 −{won(n.employmentKrw)}</span>}
          <span>소득세+지방세 −{won(n.incomeTaxMonthlyKrw + n.localTaxMonthlyKrw)}</span>
        </div>
        <p className={`mt-3 inline-block rounded-full px-3 py-1 text-[14.5px] ${n.reliefApplied ? "bg-[#2fbf5f] text-white" : "bg-white/15"}`}>{n.note}</p>
      </section>

      {/* 도넛 2개 */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-line bg-card p-5 shadow-lift">
          <h3 className="text-[18px] font-extrabold">한 달 흐름 <span className="text-[15px] font-normal text-mute">기본 시나리오</span></h3>
          <div className="mt-3 flex flex-col items-center gap-4">
            <Donut segments={allocSegments} size={250} centerTitle="실수령" centerValue={man(n.netMonthlyKrw)} />
            <ul className="w-full space-y-1.5 text-[15.5px]">
              {r.allocation.map((a) => (
                <li key={a.label} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: allocColor(a.label) }} />
                  <span className="min-w-0 flex-1 truncate text-mute">{a.label}</span>
                  <span className="shrink-0 text-[14.5px] text-mute">{a.pct}%</span>
                  <span className={`w-24 shrink-0 text-right ${a.label.startsWith("저축") ? EM : ""}`}>{won(a.krw)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[15px] text-mute">
            지출 합계 {won(r.spending.totalKrw)} · 여유자금 <span className={EM}>{won(r.surplusMonthlyKrw)}</span>
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-card p-5 shadow-lift">
          <h3 className="text-[18px] font-extrabold">소비 습관 <span className="text-[15px] font-normal text-mute">{data.spending.source === "마이데이터" ? `카드 승인내역 ${data.spending.monthsObserved}개월 평균` : "직접 입력"}</span></h3>
          {catSegments.length ? (
            <div className="mt-3 flex flex-col items-center gap-4">
              <Donut segments={catSegments} size={250} centerTitle="카드 월평균" centerValue={man(data.spending.cardMonthlyKrw)} />
              <ul className="w-full space-y-1.5 text-[15.5px]">
                {catSegments.map((c) => (
                  <li key={c.label} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1 truncate text-mute">{c.label}</span>
                    <span className="shrink-0 text-[14.5px] text-mute">{data.spending.cardMonthlyKrw ? Math.round((c.value / data.spending.cardMonthlyKrw) * 100) : 0}%</span>
                    <span className="w-24 shrink-0 text-right">{won(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[15.5px] text-mute">카드 승인내역이 없어 카테고리 분석을 건너뛰었습니다. 월 카드 소비 {won(data.spending.cardMonthlyKrw)}로 계산했습니다.</p>
          )}
          <p className={`mt-3 rounded-xl px-3 py-2 text-[15px] ${r.debt.advice === "PAY_FIRST" ? "bg-butter" : "bg-mint-soft"}`}>
            <span className={r.debt.advice === "PAY_FIRST" ? "text-[#b23b3b]" : EM}>{r.debt.advice === "NONE" ? "대출 없음" : r.debt.advice === "PAY_FIRST" ? "상환 우선" : "저축 병행"}</span>
            {r.debt.totalKrw > 0 && <> · 잔액 {man(r.debt.totalKrw)} · 월 {won(r.debt.monthlyKrw)}</>} — {r.debt.reason}
          </p>
        </div>
      </section>

      {/* 목표·시나리오 */}
      <section className="rounded-3xl border border-line bg-card p-5 shadow-lift">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[18px] font-extrabold">
            목표 {r.goals.length > 1 ? `${r.goals.length}개 · 합계 ` : "· "}<span className={EM}>{man(r.totalTargetKrw)}</span>
          </h3>
          <span className="text-[15px] text-mute">현재 예·적금 {man(r.startingAssetsKrw)}에서 시작</span>
        </div>
        {r.targetMonths !== null && r.requiredMonthlyForTargetKrw !== null && (
          <p className="mt-2 rounded-xl bg-mint px-4 py-2.5 text-[15.5px] font-bold text-leaf-deep">
            🎯 목표 기간 <span className={EM}>{Math.round(r.targetMonths / 12)}년</span> — 기간 내 달성하려면 월 <span className={EM}>{man(r.requiredMonthlyForTargetKrw)}</span> 저축 필요
            {r.requiredMonthlyForTargetKrw <= r.scenarios[1].savingsMonthlyKrw
              ? " · 기본 시나리오 저축액으로 달성 가능해요"
              : ` (기본 시나리오보다 월 ${man(r.requiredMonthlyForTargetKrw - r.scenarios[1].savingsMonthlyKrw)} 더 필요)`}
          </p>
        )}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {r.goals.map((g) => (
            <li key={g.type} className="rounded-2xl bg-mint-soft p-3">
              <p>{g.emoji} {g.label} <span className={EM}>{man(g.targetKrw)}</span></p>
              {Object.entries(g.detail).length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[14.5px] text-mute">
                  {Object.entries(g.detail).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2"><span>{k}</span><span className="text-ink">{typeof v === "number" ? man(v) : v}</span></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {r.scenarios.map((s) => (
            <div key={s.key} className={`rounded-2xl border p-4 ${s.key === "기본" ? "border-ink" : "border-line"}`}>
              <p className="flex items-center justify-between text-[15px] text-mute">
                <span>{s.key} · {s.label}</span>
                {s.withinTarget != null && (
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${s.withinTarget ? "bg-mint text-leaf-deep" : "bg-[#fde8e8] text-[#c0392b]"}`}>
                    {s.withinTarget ? "기간 내 달성" : "기간 초과"}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[20px]">월 <span className={EM}>{man(s.savingsMonthlyKrw)}</span> 저축</p>
              {s.spendingCutKrw > 0 && <p className="text-[14.5px] text-mute">소비 절감 {won(s.spendingCutKrw)} 포함</p>}
              <ol className="mt-3 space-y-1.5 border-t border-line pt-3 text-[15.5px]">
                {s.milestones.map((m) => (
                  <li key={m.type} className="flex items-start justify-between gap-2">
                    <span className="text-mute">{GOAL_META[m.type].emoji} {m.label}</span>
                    {m.monthsToGoal === null ? (
                      <span className="text-[#b23b3b]">도달 불가</span>
                    ) : (
                      <span className="text-right"><span className={EM}>{m.goalMonth ? ymLabel(m.goalMonth) : "-"}</span><br /><span className="text-[14px] text-mute">{dur(m.monthsToGoal)}</span></span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <ul className="mt-4 list-disc pl-5 text-[14.5px] text-mute">
          {r.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>

      {r.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {r.warnings.map((w) => <li key={w} className="rounded-xl bg-butter px-4 py-2.5 text-[15.5px]">⚠️ {w}</li>)}
        </ul>
      )}

      {/* 정책 DB에서 선별한 실제 정책 */}
      <section className="rounded-3xl border border-line bg-card p-6 text-[16px] shadow-lift">
        <h3 className="text-[18px] font-extrabold">
          취업 후 받을 수 있는 정책 <span className="text-[15px] font-normal text-mute">정책 DB(온통청년·행안부 공공 API 수집분) 후보 {data.dbCandidates}건에서 AI가 선별</span>
        </h3>
        <p className="mt-1 text-[14px] text-mute">공공 API에 등록된 실제 정책입니다. 소득·거주 요건은 AI 1차 판단이므로 신청 전 공식 페이지에서 확인하세요.</p>
        {data.dbPolicies.length ? (
          <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {data.dbPolicies.map((p) => (
              <li key={p.policy_id} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-mute">
                  <span className="rounded-full bg-mint px-2 py-0.5 font-bold text-leaf-deep">{SOURCE_LABEL[p.source] ?? p.source}</span>
                  <span>{p.region}</span>
                  {p.theme && <span>· {p.theme}</span>}
                  <span className={`ml-auto ${EM}`}>관련도 {p.score}점</span>
                </div>
                <p className="mt-1.5 font-bold leading-snug">{p.title}</p>
                {p.provider && <p className="text-[13.5px] text-mute">{p.provider}</p>}
                <p className="mt-1.5 text-[15px]">{p.reason}</p>
                <p className={`mt-1 text-[15px] ${EM}`}>🎁 {p.benefit_summary}</p>
                <p className="mt-1 text-[13.5px] text-mute">{p.always_open ? "상시 신청" : p.end_date ? `마감 ${p.end_date}` : "기간 확인 필요"}</p>
                {p.apply_url && <a href={p.apply_url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[14px] underline">공식 페이지 ↗</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-mute">{data.dbError ? `정책 DB 선별에 실패했습니다 (${data.dbError}).` : "조건에 맞는 취업 후 정책을 정책 DB에서 찾지 못했습니다."} 아래 금융상품·세제 큐레이션은 그대로 유효합니다.</p>
        )}
      </section>

      {/* 제도 */}
      <section className="rounded-3xl border border-line bg-card p-5 shadow-lift">
        <h3 className="text-[18px] font-extrabold">금융상품·세제 혜택 <span className="text-[15px] font-normal text-mute">기관 공고 요약 큐레이션 14종 중 규칙 판정 · {data.programs.likely.length + data.programs.needsCheck.length}건</span></h3>
        <ul className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[...data.programs.likely, ...data.programs.needsCheck].map((p) => (
            <li key={p.id} className="rounded-2xl bg-mint-soft p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[14px] font-bold ${STATUS_BADGE[p.status]?.cls ?? ""}`}>{STATUS_BADGE[p.status]?.text}</span>
                <span className="font-bold">{p.name}</span>
              </div>
              <p className="mt-0.5 text-[14.5px] text-mute">{p.provider} · {p.category}</p>
              <p className="mt-1.5 text-[15.5px]">{p.summary}</p>
              <p className={`mt-1 text-[15.5px] ${EM}`}>🎁 {p.benefit}</p>
              <p className="mt-1 text-[14.5px] text-mute">판정 근거: {p.reason} · 기준 {p.asOf}</p>
              <a href={p.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[15px] underline">공식 페이지 ↗</a>
            </li>
          ))}
        </ul>
        {data.programs.unlikely.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowUnlikely(!showUnlikely)} className="text-[15px] text-mute underline">
              요건 미충족 {data.programs.unlikely.length}건 {showUnlikely ? "접기" : "보기"}
            </button>
            {showUnlikely && (
              <ul className="mt-1.5 space-y-0.5 text-[15px] text-mute">
                {data.programs.unlikely.map((u) => <li key={u.id}>· {u.name} — {u.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* AI */}
      <section className="rounded-3xl border border-line bg-card p-5 shadow-lift">
        <h3 className="text-[18px] font-extrabold">🤖 AI 코치 한마디 <span className="text-[15px] font-normal text-mute">계산값만 인용해 설명</span></h3>
        {data.ai ? (
          <>
            <p className="mt-3 leading-relaxed">{data.ai.summary}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              {data.ai.priorities.map((p) => <li key={p}><span className={EM}>{p}</span></li>)}
            </ol>
            {data.ai.cautions.length > 0 && (
              <ul className="mt-3 space-y-1 text-[15.5px] text-mute">
                {data.ai.cautions.map((c) => <li key={c}>⚠️ {c}</li>)}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-3 text-mute">AI 해설을 불러오지 못했습니다{data.aiError ? ` (${data.aiError})` : ""}. 위 계산 결과는 코드로 산출된 값이라 그대로 유효합니다.</p>
        )}
      </section>

      <footer className="text-[14.5px] text-mute">
        {data.notes.map((x) => <p key={x}>· {x}</p>)}
        {r.references.map((x) => <p key={x.label}>· {x.label} (기준 {x.asOf})</p>)}
        <p className="mt-1.5">{data.disclaimer}</p>
      </footer>
    </div>
  );
}
