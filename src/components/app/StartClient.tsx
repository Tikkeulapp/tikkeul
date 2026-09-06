"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Persona } from "@/data/personas";
import type { DerivedProfile } from "@/lib/derive";
import { formatKrw } from "@/lib/derive";
import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/landing/LogoMark";
import { SIDO_CANONICAL } from "@/lib/region";

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
  const [phase, setPhase] = useState<"pick" | "analyzing" | "result" | "form">("pick");
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

          {/* 직접 입력 시작 */}
          <button
            onClick={() => setPhase("form")}
            className="mt-4 w-full rounded-[24px] border-2 border-dashed border-line bg-card/60 p-6 text-left transition hover:border-ink hover:bg-card"
          >
            <span className="text-2xl">🙋</span>
            <p className="mt-2 text-lg font-bold">내 정보로 직접 시작하기</p>
            <p className="mt-1 text-[13.5px] text-mute">
              간단한 설문을 입력하면 내 조건으로 시작합니다. 입력한 정보는 DB에 저장돼요.
            </p>
          </button>
        </section>
      )}

      {/* ── 직접 입력 설문 ─────────────────────── */}
      {phase === "form" && <SignupForm onBack={() => setPhase("pick")} />}

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


const SIDO_LIST = [...SIDO_CANONICAL];

function SignupForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    // ① 기본 정보
    name: "",
    birthDate: "",
    gender: "",
    sido: "서울특별시",
    sigungu: "",
    education: "졸업",
    employmentStatus: "취업 준비 중",
    targetJob: "",
    household: "1인 가구",
    householdSize: "1",
    housingType: "월세",
    incomeBracket: "모름",
    assetBracket: "모름",
    military: "해당 없음",
    // ② 금융 정보 (본래 마이데이터로 자동 수집 — 데모에서는 직접 입력)
    monthlyIncomeMan: "", // 만원 단위
    assetsMan: "",
    monthlyRentMan: "",
    benefitName: "없음",
    benefitMonthlyMan: "",
    loanBalanceMan: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  /** ⚡ 자동기입 — 그럴듯한 랜덤값으로 채움 (귀찮은 사람용) */
  const autofill = () => {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const ri = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const year = ri(1994, 2004);
    const birth = `${year}-${String(ri(1, 12)).padStart(2, "0")}-${String(ri(1, 28)).padStart(2, "0")}`;
    const sido = pick(["서울특별시", "경기도", "인천광역시", "부산광역시", "대전광역시"]);
    const sigungu = pick({
      서울특별시: ["관악구", "중랑구", "노원구", "강서구"],
      경기도: ["수원시", "성남시", "부천시", "안양시"],
      인천광역시: ["부평구", "미추홀구"],
      부산광역시: ["부산진구", "해운대구"],
      대전광역시: ["서구", "유성구"],
    }[sido]!);
    const household = pick(["1인 가구", "부모님과 거주"]);
    const housing = household === "부모님과 거주" ? "본가" : pick(["월세", "전세"]);
    setF({
      name: pick(["김하늘", "이서준", "박지우", "최민서", "정도윤", "한예린", "윤지호", "장수아", "오유진", "송민재"]),
      birthDate: birth,
      gender: pick(["여성", "남성"]),
      sido,
      sigungu,
      education: pick(["졸업", "졸업", "졸업유예", "휴학"]),
      employmentStatus: pick(["취업 준비 중", "취업 준비 중", "이직 준비 중", "재취업 준비 중", "기타"]),
      targetJob: pick(["데이터 분석", "백엔드 개발", "마케팅", "품질관리", "UX 디자인"]),
      household,
      householdSize: household === "부모님과 거주" ? String(ri(2, 4)) : "1",
      housingType: housing,
      incomeBracket: pick(["모름", "~60%", "60~100%", "100~150%"]),
      assetBracket: pick(["모름", "2억 미만", "2~4억"]),
      military: pick(["해당 없음", "군필"]),
      monthlyIncomeMan: String(pick([0, 0, 30, 50, 80, 120])),
      assetsMan: String(ri(50, 1500)),
      monthlyRentMan: housing === "월세" ? String(pick([35, 45, 50, 55])) : "",
      benefitName: (() => {
        const pool = sido === "서울특별시" ? ["없음", "없음", "구직급여", "서울 청년수당"] : ["없음", "없음", "없음", "구직급여"];
        return pick(pool);
      })(),
      benefitMonthlyMan: "",
      loanBalanceMan: pick(["", "", "300", "600"]),
    });
    // 수당 월액 보정 (수당별 통상 금액)
    setF((prev) => ({
      ...prev,
      benefitMonthlyMan:
        prev.benefitName === "구직급여" ? "180" : prev.benefitName === "서울 청년수당" ? "50" : "",
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      localStorage.setItem(
        "tikkeul.session",
        JSON.stringify({
          personaId: null,
          profileId: json.profileId,
          userId: json.userId,
          name: json.name,
          startedAt: new Date().toISOString(),
        }),
      );
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const input = "w-full rounded-[8px] border border-line bg-card px-3 py-2.5 text-[14px]";
  const label = "text-[12.5px] font-bold text-mute";

  return (
    <section className="mx-auto w-full max-w-xl px-5 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">내 정보로 시작하기</h1>
          <p className="mt-2 text-[13.5px] text-mute">
            정책 자격 판정에 실제로 쓰이는 항목만 묻습니다. 모르는 항목은 비워두거나
            &ldquo;모름&rdquo;으로 두세요.
          </p>
        </div>
        <button
          type="button"
          onClick={autofill}
          className="shrink-0 rounded-full border border-line bg-card px-4 py-2 text-[13px] font-bold transition hover:border-ink"
        >
          ⚡ 자동기입
        </button>
      </div>

      <form onSubmit={submit} className="mt-6">
        {/* ── ① 기본 정보 ── */}
        <p className="text-[13px] font-bold text-leaf-deep">① 기본 정보</p>
        <div className="mt-2 grid gap-4 rounded-[16px] border border-line bg-card p-4 sm:grid-cols-2">
          <div>
            <p className={label}>이름 (닉네임) *</p>
            <input className={input} value={f.name} onChange={set("name")} required placeholder="홍길동" />
          </div>
          <div>
            <p className={label}>생년월일 *</p>
            <input className={input} type="date" value={f.birthDate} onChange={set("birthDate")} required />
          </div>
          <div>
            <p className={label}>성별</p>
            <select className={input} value={f.gender} onChange={set("gender")}>
              <option value="">선택 안 함</option>
              <option>여성</option>
              <option>남성</option>
            </select>
          </div>
          <div>
            <p className={label}>병역</p>
            <select className={input} value={f.military} onChange={set("military")}>
              <option>해당 없음</option>
              <option>군필</option>
              <option>미필</option>
            </select>
          </div>
          <div>
            <p className={label}>거주지 (시·도) *</p>
            <select className={input} value={f.sido} onChange={set("sido")}>
              {SIDO_LIST.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <p className={label}>거주지 (시·군·구)</p>
            <input className={input} value={f.sigungu} onChange={set("sigungu")} placeholder="예: 관악구" />
          </div>
          <div>
            <p className={label}>학력 상태</p>
            <select className={input} value={f.education} onChange={set("education")}>
              <option>재학</option>
              <option>휴학</option>
              <option>졸업유예</option>
              <option>졸업</option>
            </select>
          </div>
          <div>
            <p className={label}>취업 상태</p>
            <select className={input} value={f.employmentStatus} onChange={set("employmentStatus")}>
              <option>취업 준비 중</option>
              <option>이직 준비 중</option>
              <option>재취업 준비 중</option>
              <option>기타</option>
            </select>
          </div>
          <div>
            <p className={label}>목표 직무</p>
            <input className={input} value={f.targetJob} onChange={set("targetJob")} placeholder="예: 데이터 분석" />
          </div>
          <div>
            <p className={label}>가구 형태</p>
            <select className={input} value={f.household} onChange={set("household")}>
              <option>1인 가구</option>
              <option>부모님과 거주</option>
              <option>기타</option>
            </select>
          </div>
          <div>
            <p className={label}>가구원 수</p>
            <input className={input} type="number" min="1" value={f.householdSize} onChange={set("householdSize")} placeholder="예: 1" />
          </div>
          <div>
            <p className={label}>주거 형태</p>
            <select className={input} value={f.housingType} onChange={set("housingType")}>
              <option>월세</option>
              <option>전세</option>
              <option>본가</option>
              <option>기타</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <p className={label}>가구 중위소득 구간 (건강보험료 기준 — 모르면 &ldquo;모름&rdquo;)</p>
            <select className={input} value={f.incomeBracket} onChange={set("incomeBracket")}>
              <option>모름</option>
              <option value="~60%">중위소득 60% 이하</option>
              <option value="60~100%">60~100%</option>
              <option value="100~150%">100~150%</option>
              <option value="150%~">150% 초과</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <p className={label}>가구 자산 구간 (부동산·차량 등 — 모르면 &ldquo;모름&rdquo;)</p>
            <select className={input} value={f.assetBracket} onChange={set("assetBracket")}>
              <option>모름</option>
              <option value="2억 미만">2억 미만</option>
              <option value="2~4억">2~4억</option>
              <option value="4억 초과">4억 초과</option>
            </select>
          </div>
        </div>

        {/* ── ② 금융 정보 (마이데이터 대체 입력) ── */}
        <p className="mt-6 text-[13px] font-bold text-leaf-deep">② 금융 정보</p>
        <p className="mt-1 text-[12.5px] text-mute">
          ⚠ 이 항목들은 <b className="text-ink">실서비스에서는 마이데이터 연동으로 자동
          수집·계산</b>됩니다 (계좌 잔액·거래내역 분석). 데모에서는 직접 입력으로 대체합니다.
        </p>
        <div className="mt-2 grid gap-4 rounded-[16px] border border-dashed border-line bg-mint-soft/50 p-4 sm:grid-cols-2">
          <div>
            <p className={label}>월 평균 소득 — 알바 포함 (만원)</p>
            <input className={input} type="number" min="0" value={f.monthlyIncomeMan} onChange={set("monthlyIncomeMan")} placeholder="예: 50 (없으면 0)" />
          </div>
          <div>
            <p className={label}>보유 금융자산 — 예적금·잔고 (만원)</p>
            <input className={input} type="number" min="0" value={f.assetsMan} onChange={set("assetsMan")} placeholder="예: 300" />
          </div>
          <div>
            <p className={label}>월세 (만원, 월세 거주 시)</p>
            <input className={input} type="number" min="0" value={f.monthlyRentMan} onChange={set("monthlyRentMan")} placeholder="예: 45" />
          </div>
          <div>
            <p className={label}>대출 잔액 (만원)</p>
            <input className={input} type="number" min="0" value={f.loanBalanceMan} onChange={set("loanBalanceMan")} placeholder="없으면 비워두기" />
          </div>
          <div>
            <p className={label}>수급 중인 수당</p>
            <select className={input} value={f.benefitName} onChange={set("benefitName")}>
              <option>없음</option>
              <option>구직급여</option>
              <option>서울 청년수당</option>
              <option>구직촉진수당</option>
              <option>기타</option>
            </select>
          </div>
          <div>
            <p className={label}>수당 월 수령액 (만원)</p>
            <input className={input} type="number" min="0" value={f.benefitMonthlyMan} onChange={set("benefitMonthlyMan")} placeholder="수급 중일 때만" disabled={f.benefitName === "없음"} />
          </div>
        </div>

        {error && <p className="mt-3 text-[13px] font-bold text-[#d33]">⚠ {error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-leaf px-6 py-3 text-[15px] font-medium text-white transition hover:bg-[#333333] disabled:opacity-60"
          >
            {saving ? "저장 중…" : "이 정보로 시작하기 →"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-line bg-card px-6 py-3 text-[15px] font-medium transition hover:border-ink"
          >
            뒤로
          </button>
        </div>
      </form>
    </section>
  );
}
