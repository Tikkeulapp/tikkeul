/**
 * 취업 후 시뮬레이션 — 결정론적 계산 엔진.
 * "숫자는 코드가, 해설은 AI가" 원칙: 실수령·지출·여유자금·도달 시점은 전부 여기서 계산한다.
 * LLM은 이 결과를 인용해 설명만 한다 (src/app/api/simulate/route.ts).
 */
import type { CardApproval, CardCategory } from "@/types/persona";
import {
  DEFAULT_LUMP_SUM_KRW,
  HOUSE_EXTRA_COST_RATE,
  HOUSE_LTV,
  HOUSE_MEDIAN_PRICE_KRW,
  HOUSE_PRICE_SOURCE,
  MARRIAGE_COST_KRW,
  MARRIAGE_COST_SOURCE,
  MARRIAGE_SELF_SHARE,
  LOAN_RATE_THRESHOLD,
  REFERENCE_AS_OF,
  SAVINGS_ANNUAL_RATE,
  TAX_PARAMS,
} from "@/data/postjob_reference";
import type {
  CompanyType,
  GoalType,
  GoalSpec,
  SimInput,
  SpendingProfile,
  NetPay,
  GoalItem,
  Milestone,
  Scenario,
  SimResult,
} from "@/types/simulate";

export const COMPANY_TYPES = ["대기업", "중견기업", "중소기업", "스타트업", "공기업", "공무원", "기타"] as const satisfies readonly CompanyType[];
export const GOAL_TYPES: GoalType[] = ["LUMP_SUM", "HOUSE", "MARRIAGE"];

/* ── 세후 실수령 ───────────────────────────────────────── */
const step = (x: number, table: [number, number, number][]) => {
  let prevCap = 0;
  for (const [cap, base, rate] of table) {
    if (x <= cap) return base + (x - prevCap) * rate;
    prevCap = cap;
  }
  return 0;
};

export function estimateNetPay(annualKrw: number, opts: { companyType: CompanyType; age: number | null }): NetPay {
  const T = TAX_PARAMS;
  const grossMonthly = annualKrw / 12;
  const civil = opts.companyType === "공무원";

  const pension = civil
    ? grossMonthly * T.civilServantPensionRate
    : Math.min(grossMonthly, T.pensionMonthlyCapKrw) * T.pensionRate;
  const health = grossMonthly * T.healthRate;
  const ltc = health * T.ltcRateOfHealth;
  const employment = civil ? 0 : grossMonthly * T.employmentRate;
  const insuranceAnnual = (pension + health + ltc + employment) * 12;

  // 과세표준 = 총급여 − 근로소득공제 − 기본공제 − 보험료공제
  const eiDeduction = Math.min(step(annualKrw, T.earnedIncomeDeduction), T.earnedIncomeDeductionCapKrw);
  const taxBase = Math.max(0, annualKrw - eiDeduction - T.basicDeductionKrw - insuranceAnnual);
  const computedTax = step(taxBase, T.brackets);
  // 근로소득세액공제
  let credit = computedTax <= 1_300_000 ? computedTax * 0.55 : 715_000 + (computedTax - 1_300_000) * 0.3;
  const creditCap =
    annualKrw <= 33_000_000
      ? 740_000
      : annualKrw <= 70_000_000
        ? Math.max(660_000, 740_000 - (annualKrw - 33_000_000) * 0.008)
        : annualKrw <= 120_000_000
          ? Math.max(500_000, 660_000 - (annualKrw - 70_000_000) * 0.5)
          : Math.max(200_000, 500_000 - (annualKrw - 120_000_000) * 0.5);
  credit = Math.min(credit, creditCap);
  let determinedTax = Math.max(0, computedTax - credit);

  // 중소기업 취업자 소득세 감면 (청년)
  const smeLike = opts.companyType === "중소기업" || opts.companyType === "스타트업";
  const reliefEligible = smeLike && opts.age !== null && opts.age <= T.smeYouthRelief.ageMax;
  const relief = reliefEligible ? Math.min(T.smeYouthRelief.capKrw, determinedTax * T.smeYouthRelief.rate) : 0;
  determinedTax -= relief;
  const localTax = determinedTax * T.localTaxRate;

  const netMonthly = grossMonthly - pension - health - ltc - employment - (determinedTax + localTax) / 12;
  const r = (n: number) => Math.round(n);
  return {
    grossMonthlyKrw: r(grossMonthly),
    pensionKrw: r(pension),
    healthKrw: r(health),
    ltcKrw: r(ltc),
    employmentKrw: r(employment),
    incomeTaxMonthlyKrw: r(determinedTax / 12),
    localTaxMonthlyKrw: r(localTax / 12),
    reliefAnnualKrw: r(relief),
    reliefApplied: relief > 0,
    netMonthlyKrw: r(netMonthly),
    note: civil
      ? "공무원연금 기여금 9%·고용보험 미가입 기준. 간이 계산 근사치"
      : relief > 0
        ? `중소기업 취업 청년 소득세 감면(90%, 연 ${T.smeYouthRelief.capKrw / 10000}만 원 한도) 반영. 업종 요건은 확인 필요`
        : "4대보험·근로소득세 간이 계산 근사치 (부양가족·카드공제 등 미반영)",
  };
}

/* ── 카드 승인내역 집계 ────────────────────────────────── */
export function aggregateCards(cards: CardApproval[]) {
  const months = new Set(cards.map((c) => c.date.slice(0, 7))).size || 1;
  const byCat = new Map<CardCategory, number>();
  for (const c of cards) byCat.set(c.category, (byCat.get(c.category) ?? 0) + c.amountKrw);
  const cardByCategory = [...byCat.entries()]
    .map(([category, total]) => ({ category, monthlyKrw: Math.round(total / months) }))
    .sort((a, b) => b.monthlyKrw - a.monthlyKrw);
  const cardMonthlyKrw = cardByCategory.reduce((s, c) => s + c.monthlyKrw, 0);
  return { cardByCategory, cardMonthlyKrw, monthsObserved: months };
}

/* ── 목표 도달 개월 수: A(1+i)^n + S((1+i)^n−1)/i = T ─────── */
function monthsToReach(assets: number, monthlySave: number, target: number, annualRate = SAVINGS_ANNUAL_RATE): number | null {
  if (assets >= target) return 0;
  if (monthlySave <= 0) return null;
  const i = annualRate / 12;
  const n = Math.log((target * i + monthlySave) / (assets * i + monthlySave)) / Math.log(1 + i);
  if (!isFinite(n) || n < 0) return null;
  return Math.ceil(n);
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const nextMonth = () => addMonths(new Date().toISOString().slice(0, 7), 1);
const manStr = (krw: number) => `${Math.round(krw / 10000).toLocaleString()}만 원`;

/* ── 목표 항목 구성 ────────────────────────────────────── */
function buildGoal(spec: GoalSpec, references: SimResult["references"]): GoalItem {
  if (spec.type === "HOUSE") {
    const region = spec.houseRegion ?? "수도권";
    const price = HOUSE_MEDIAN_PRICE_KRW[region];
    const equity = Math.round(price * (1 - HOUSE_LTV));
    const extra = Math.round(price * HOUSE_EXTRA_COST_RATE);
    references.push({ label: `${region} 아파트 중위 매매가격 참고값`, asOf: REFERENCE_AS_OF });
    return {
      type: "HOUSE",
      label: `내집마련 (${region})`,
      emoji: "🏠",
      targetKrw: equity + extra,
      detail: { "참고 주택가격": price, "필요 자기자본": equity, "부대비용(취득세 등)": extra, "대출 필요액": price - equity },
      assumptions: [
        `LTV ${Math.round(HOUSE_LTV * 100)}% 가정 — 생애최초·비규제지역은 최대 80%까지 가능`,
        `부대비용 ${Math.round(HOUSE_EXTRA_COST_RATE * 100)}% (취득세 1.1% + 중개·법무 등)`,
        HOUSE_PRICE_SOURCE,
      ],
    };
  }
  if (spec.type === "MARRIAGE") {
    const target = Math.round(MARRIAGE_COST_KRW * MARRIAGE_SELF_SHARE);
    references.push({ label: "평균 결혼비용 참고값", asOf: REFERENCE_AS_OF });
    return {
      type: "MARRIAGE",
      label: "결혼 자금",
      emoji: "💍",
      targetKrw: target,
      detail: { "주택 제외 평균 결혼비용": MARRIAGE_COST_KRW, "본인 부담(50%)": target },
      assumptions: ["양가·배우자와 균등 분담 가정, 신혼집 보증금 제외", MARRIAGE_COST_SOURCE],
    };
  }
  const target = spec.targetKrw && spec.targetKrw > 0 ? Math.round(spec.targetKrw) : DEFAULT_LUMP_SUM_KRW;
  return { type: "LUMP_SUM", label: "목돈 모으기", emoji: "💰", targetKrw: target, detail: {}, assumptions: [] };
}

/* ── 메인 ──────────────────────────────────────────────── */
export function simulate(input: SimInput, sp: SpendingProfile, ctx: { age: number | null }): SimResult {
  const startMonth = input.startMonth && /^\d{4}-\d{2}$/.test(input.startMonth) ? input.startMonth : nextMonth();
  const net = estimateNetPay(input.annualSalaryKrw, { companyType: input.companyType, age: ctx.age });

  const fixedKrw = sp.rentMonthlyKrw + sp.fixedCosts.reduce((s, f) => s + f.monthlyKrw, 0);
  const loanKrw = sp.loans.reduce((s, l) => s + l.monthlyPaymentKrw, 0);
  const variableKrw = sp.cardMonthlyKrw + sp.otherVariableMonthlyKrw;
  const totalKrw = fixedKrw + loanKrw + variableKrw;
  const surplus = net.netMonthlyKrw - totalKrw;
  const topCategories = sp.cardByCategory.slice(0, 5).map((c) => ({
    ...c,
    pct: sp.cardMonthlyKrw ? Math.round((c.monthlyKrw / sp.cardMonthlyKrw) * 100) : 0,
  }));

  // ── 목표 (여러 개) ──
  const references: SimResult["references"] = [{ label: `세금·4대보험 파라미터 — ${TAX_PARAMS.asOf}`, asOf: TAX_PARAMS.asOf }];
  const specs = input.goals.length ? input.goals : [{ type: "LUMP_SUM" as GoalType }];
  const goals = specs.map((g) => buildGoal(g, references));
  const totalTargetKrw = goals.reduce((s, g) => s + g.targetKrw, 0);
  const startingAssets = sp.liquidAssetsKrw + sp.savingsKrw;
  // 작은 목표부터 순서대로 달성한다고 가정 → 누적 목표액
  const ordered = [...goals].sort((a, b) => a.targetKrw - b.targetKrw);
  const assumptions = [
    `저축 수익률 연 ${(SAVINGS_ANNUAL_RATE * 100).toFixed(1)}% (세후 근사), 현재 예·적금 ${manStr(startingAssets)}에서 시작`,
    ...(goals.length > 1 ? [`목표가 여러 개면 금액이 작은 목표부터 순서대로 달성한다고 가정 (${ordered.map((g) => g.label).join(" → ")})`] : []),
    ...goals.flatMap((g) => g.assumptions),
  ];

  // ── 시나리오 ──
  const mk = (key: Scenario["key"], label: string, rate: number, cutRate: number): Scenario => {
    const cut = Math.round(variableKrw * cutRate);
    const save = Math.max(0, Math.round(surplus * rate) + cut);
    let cum = 0;
    const milestones: Milestone[] = ordered.map((g) => {
      cum += g.targetKrw;
      const n = monthsToReach(startingAssets, save, cum);
      return { type: g.type, label: g.label, cumulativeTargetKrw: cum, monthsToGoal: n, goalMonth: n === null ? null : addMonths(startMonth, n) };
    });
    const last = milestones[milestones.length - 1];
    return { key, label, savingsMonthlyKrw: save, spendingCutKrw: cut, milestones, monthsToAll: last?.monthsToGoal ?? null, goalMonthAll: last?.goalMonth ?? null };
  };
  const scenarios = [mk("보수", "여유자금의 50% 저축", 0.5, 0), mk("기본", "여유자금의 70% 저축", 0.7, 0), mk("공격", "90% 저축 + 소비 15% 절감", 0.9, 0.15)];

  // ── 배분 (기본 시나리오) ──
  const baseSave = scenarios[1].savingsMonthlyKrw;
  const spare = Math.max(0, net.netMonthlyKrw - totalKrw - baseSave);
  const allocRaw = [
    { label: "고정지출(월세·통신·보험)", krw: fixedKrw },
    { label: "대출 상환", krw: loanKrw },
    { label: "변동소비(카드 등)", krw: variableKrw },
    { label: "저축·투자", krw: baseSave },
    { label: "예비 여유", krw: spare },
  ].filter((a) => a.krw > 0);
  const denom = net.netMonthlyKrw || 1;
  const allocation = allocRaw.map((a) => ({ ...a, pct: Math.round((a.krw / denom) * 100) }));

  // ── 대출 조언 (규칙) ──
  const totalDebt = sp.loans.reduce((s, l) => s + l.balanceKrw, 0);
  const highRate = sp.loans.filter((l) => l.interestRate / 100 > LOAN_RATE_THRESHOLD);
  let debt: SimResult["debt"];
  if (!sp.loans.length) debt = { totalKrw: 0, monthlyKrw: 0, advice: "NONE", reason: "마이데이터에 대출이 없습니다" };
  else if (highRate.length)
    debt = {
      totalKrw: totalDebt,
      monthlyKrw: loanKrw,
      advice: "PAY_FIRST",
      reason: `${highRate.map((l) => `${l.type}(${l.interestRate}%)`).join(", ")} 금리가 저축 수익률(${(SAVINGS_ANNUAL_RATE * 100).toFixed(0)}%)보다 높아 상환을 먼저`,
    };
  else
    debt = {
      totalKrw: totalDebt,
      monthlyKrw: loanKrw,
      advice: "SAVE_FIRST",
      reason: `${sp.loans.map((l) => `${l.type}(${l.interestRate}%)`).join(", ")} 금리가 낮아 정상 상환하면서 저축 병행`,
    };

  // ── 경고 ──
  const warnings: string[] = [];
  if (surplus <= 0) warnings.push("현재 지출 구조로는 세후 실수령보다 지출이 많습니다. 소비 절감 없이는 저축이 어렵습니다.");
  if (sp.rentMonthlyKrw && sp.rentMonthlyKrw / net.netMonthlyKrw > 0.3) warnings.push(`월세가 실수령의 ${Math.round((sp.rentMonthlyKrw / net.netMonthlyKrw) * 100)}%입니다. 통상 권고선(30%)을 넘습니다.`);
  if (sp.source === "직접 입력") warnings.push("카드 소비는 직접 입력값입니다. 실서비스에서는 마이데이터 카드 승인내역으로 자동 집계됩니다.");
  if (scenarios[1].monthsToAll !== null && scenarios[1].monthsToAll > 240) warnings.push("기본 시나리오로 모든 목표까지 20년 이상 걸립니다. 목표 지역·금액을 조정하거나 정책 대출·청약을 함께 검토하세요.");

  return {
    startMonth,
    net,
    spending: { fixedKrw, loanKrw, variableKrw, totalKrw, topCategories },
    surplusMonthlyKrw: surplus,
    allocation,
    scenarios,
    goals,
    totalTargetKrw,
    startingAssetsKrw: startingAssets,
    assumptions,
    debt,
    warnings,
    references,
  };
}
