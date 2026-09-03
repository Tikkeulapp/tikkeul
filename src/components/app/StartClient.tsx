"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Persona } from "@/data/personas";
import type { DerivedProfile } from "@/lib/derive";
import { formatKrw } from "@/lib/derive";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";

type Item = { persona: Persona; derived: DerivedProfile };

const ANALYZE_STEPS = [
  "마이데이터 연결 중…",
  "계좌·거래내역 불러오는 중…",
  "정기 수입·지출 패턴 분석 중…",
  "취업 준비 지출 감지 중…",
];

function ageOf(birthDate: string, asOf = "2026-09-03"): number {
  const b = new Date(birthDate);
  const a = new Date(asOf);
  let age = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) age--;
  return age;
}

export function StartClient({ items }: { items: Item[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"pick" | "analyzing" | "result">("pick");
  const [step, setStep] = useState(0);

  const selected = items.find((i) => i.persona.id === selectedId) ?? null;

  // 분석 연출: 단계 메시지를 순차 표시 후 결과로
  useEffect(() => {
    if (phase !== "analyzing") return;
    if (step >= ANALYZE_STEPS.length) {
      const t = setTimeout(() => setPhase("result"), 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 550);
    return () => clearTimeout(t);
  }, [phase, step]);

  const pick = (id: string) => {
    setSelectedId(id);
    setStep(0);
    setPhase("analyzing");
  };

  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (!selected || starting) return;
    setStarting(true);
    try {
      // DB에 데모 사용자 생성 (users 테이블)
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: selected.persona.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "세션 생성 실패");
      localStorage.setItem(
        "tikkeul.session",
        JSON.stringify({
          personaId: selected.persona.id,
          userId: json.userId,
          startedAt: new Date().toISOString(),
        }),
      );
      router.push("/app");
    } catch (e) {
      alert(`시작에 실패했어요: ${e instanceof Error ? e.message : e}`);
      setStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex h-[64px] w-full max-w-4xl items-center gap-2.5 px-5 font-semibold">
        <LogoMark size={28} />
        <span>{BRAND.name}</span>
        <span className="ml-2 rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-bold text-leaf-deep">
          데모 — 페르소나로 체험
        </span>
      </header>

      {/* ── 1단계: 페르소나 선택 ─────────────────── */}
      {phase === "pick" && (
        <section className="mx-auto w-full max-w-4xl px-5 pb-24 pt-10">
          <h1 className="text-3xl font-semibold leading-tight sm:text-[36px]">
            어떤 취준생으로
            <br />
            체험해볼까요?
          </h1>
          <p className="mt-3 text-mute">
            실서비스에서는 마이데이터 연동과 간단한 설문으로 시작합니다. 데모에서는 가상의
            취준생 프로필을 선택하세요.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {items.map(({ persona }) => (
              <button
                key={persona.id}
                onClick={() => pick(persona.id)}
                className="rounded-[24px] border border-line bg-card p-6 text-left transition hover:-translate-y-0.5 hover:border-ink"
              >
                <span className="text-3xl">{persona.emoji}</span>
                <p className="mt-3 text-lg font-bold">
                  {persona.name}{" "}
                  <span className="font-medium text-mute">({ageOf(persona.declared.birthDate)})</span>
                </p>
                <p className="text-[13px] font-bold text-leaf-deep">“{persona.tagline}”</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-mute">{persona.intro}</p>
                <p className="mt-4 text-[12px] font-semibold text-mute">
                  {persona.declared.region.sido} {persona.declared.region.sigungu} ·{" "}
                  {persona.declared.targetJob}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 2단계: 마이데이터 분석 연출 ───────────── */}
      {phase === "analyzing" && selected && (
        <section className="mx-auto w-full max-w-md px-5 pb-24 pt-20 text-center">
          <span className="text-4xl">{selected.persona.emoji}</span>
          <h2 className="mt-4 text-xl font-bold">{selected.persona.name}님의 금융 데이터 분석</h2>
          <div className="mt-8 flex flex-col gap-3 text-left">
            {ANALYZE_STEPS.map((label, i) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-[12px] border px-4 py-3 text-[14px] transition ${
                  i < step
                    ? "border-line bg-card font-semibold"
                    : i === step
                      ? "border-ink bg-card font-semibold"
                      : "border-transparent text-mute"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-mint text-[11px] font-bold text-leaf-deep">
                  {i < step ? "✓" : "…"}
                </span>
                {label}
              </div>
            ))}
          </div>
          <p className="mt-6 text-[12px] text-mute">
            데모에서는 마이데이터 표준 규격을 따른 테스트 데이터를 사용합니다.
          </p>
        </section>
      )}

      {/* ── 3단계: 도출 프로필 ────────────────────── */}
      {phase === "result" && selected && (
        <ResultView item={selected} onStart={start} starting={starting} onBack={() => setPhase("pick")} />
      )}
    </main>
  );
}

function ResultView({ item, onStart, starting, onBack }: { item: Item; onStart: () => void; starting: boolean; onBack: () => void }) {
  const { persona, derived } = item;
  const d = persona.declared;
  return (
    <section className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10">
      <p className="text-[13px] font-bold text-leaf-deep">분석 완료</p>
      <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
        {persona.name}님, 데이터에서 이렇게 읽었어요
      </h1>

      {/* 도출: 마이데이터에서 계산된 것 */}
      <div className="mt-6 rounded-[24px] border border-line bg-card p-6">
        <p className="text-[12px] font-bold tracking-wide text-mute">
          마이데이터에서 자동으로 계산됨 · 계산 코드 기반
        </p>
        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Stat label="사용 가능 자산" value={formatKrw(derived.liquidAssetsKrw)} />
          {derived.incomes.map((inc) => (
            <Stat
              key={inc.label}
              label={inc.kind === "WORK" ? "월 평균 근로소득" : "월 가족 지원"}
              value={formatKrw(inc.avgMonthlyKrw)}
              hint={`${inc.monthsObserved}개월 입금 패턴`}
            />
          ))}
          {derived.noRegularWorkIncome && (
            <Stat label="정기 근로소득" value="관측 안 됨" hint="미취업 상태로 추정" />
          )}
          {derived.rentMonthlyKrw !== null && (
            <Stat label="월세" value={formatKrw(derived.rentMonthlyKrw)} hint="정기이체 감지" />
          )}
          {derived.benefits.map((b) => (
            <Stat
              key={b.name}
              label={`수급 중 — ${b.name}`}
              value={`월 ${formatKrw(b.monthlyKrw)}`}
              hint={b.endEstimateMonth ? `⚠ ${b.endEstimateMonth.replace("-", "년 ")}월 종료 추정` : undefined}
              warn={Boolean(b.endEstimateMonth)}
            />
          ))}
        </div>

        {derived.jobPrepSpending.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-[13px] font-bold">
              취업 준비 지출 감지 —{" "}
              <span className="text-leaf-deep">{formatKrw(derived.jobPrepTotalKrw)}</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-[13px] text-mute">
              {derived.jobPrepSpending.slice(0, 4).map((t) => (
                <li key={t.date + t.description} className="flex justify-between">
                  <span>
                    {t.date.slice(5).replace("-", "/")} {t.description}
                  </span>
                  <span>{formatKrw(t.amountKrw)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 설문(임의 설정): 마이데이터로 알 수 없는 것 */}
      <div className="mt-4 rounded-[24px] border border-line bg-mint-soft p-6">
        <p className="text-[12px] font-bold tracking-wide text-mute">
          설문 정보 · 실서비스에서는 가입 시 입력
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-semibold">
          <Chip>{ageOf(d.birthDate)}세</Chip>
          <Chip>
            {d.region.sido} {d.region.sigungu}
          </Chip>
          <Chip>{d.education.status} · {d.education.major}</Chip>
          <Chip>{d.targetJob} 준비</Chip>
          <Chip>{d.household.livingWithParents ? "부모님과 거주" : "1인 가구"}</Chip>
          {d.incomeBracket && <Chip>가구 중위소득 {d.incomeBracket}</Chip>}
          {d.military?.served && <Chip>군필 ({d.military.months}개월)</Chip>}
          {d.certificates.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          onClick={onStart}
          disabled={starting}
          className="rounded-full bg-leaf px-6 py-3 text-[16px] font-medium text-white transition hover:bg-[#333333] disabled:opacity-60"
        >
          {starting ? "시작하는 중…" : "이 프로필로 시작하기 →"}
        </button>
        <button onClick={onBack} className="rounded-full border border-line bg-card px-6 py-3 text-[16px] font-medium transition hover:border-ink">
          다른 프로필 보기
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[12px] font-bold text-mute">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {hint && (
        <p className={`text-[12px] ${warn ? "font-bold text-ink" : "text-mute"}`}>{hint}</p>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-card px-3 py-1.5">{children}</span>;
}
