/**
 * 마이데이터 스냅샷 → 도출 프로필.
 * 결정론적 규칙 기반 — LLM을 쓰지 않는다 ("금액과 날짜는 계산 코드가" 원칙).
 * 페르소나(mock)든 실서비스(API)든 동일하게 동작한다.
 */
import type { MyDataSnapshot, Transaction } from "@/types/persona";
import type { BenefitStatus, DerivedProfile, RecurringIncome } from "@/types/profile";

/** 수당류 통상 수급 개월 수 (종료 추정용 — 정확한 값은 공식 확인 필요) */
const BENEFIT_TYPICAL_MONTHS: { pattern: RegExp; months: number }[] = [
  { pattern: /구직급여|실업급여/, months: 5 },
  { pattern: /청년수당/, months: 6 },
  { pattern: /구직촉진수당/, months: 6 },
];

const WORK_RE = /급여|아르바이트|알바/;
const BENEFIT_RE = /구직급여|실업급여|청년수당|구직촉진수당|지원금/;
const FAMILY_RE = /가족|부모|용돈/;
const RENT_RE = /월세/;
const FIXED_RE = /통신비|보험료|구독/;
const JOB_PREP_RE =
  /응시료|토익|SQLD|GTQ|시험|면접|정장|증명사진|사진 촬영|강의|인강|학원|부트캠프|첨삭|KTX|고속버스/;

const month = (date: string) => date.slice(0, 7);

/** 같은 설명의 거래가 2개월 이상 관측되면 '정기'로 본다 */
function groupRecurring(txs: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const key = tx.description;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }
  const recurring: { label: string; txs: Transaction[]; months: number }[] = [];
  const oneOff: Transaction[] = [];
  for (const [label, list] of groups) {
    const months = new Set(list.map((t) => month(t.date))).size;
    if (months >= 2) recurring.push({ label, txs: list, months });
    else oneOff.push(...list);
  }
  return { recurring, oneOff };
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function derive(mydata: MyDataSnapshot): DerivedProfile {
  const liquidAssetsKrw = mydata.accounts
    .filter((a) => a.type === "수시입출금" || a.type === "CMA")
    .reduce((sum, a) => sum + a.balanceKrw, 0);

  const inTxs = mydata.transactions.filter((t) => t.direction === "IN");
  const outTxs = mydata.transactions.filter((t) => t.direction === "OUT");

  // ── 정기 수입 분류 ──
  const { recurring: recurringIn } = groupRecurring(inTxs);
  const incomes: RecurringIncome[] = [];
  const benefits: BenefitStatus[] = [];
  for (const g of recurringIn) {
    const total = g.txs.reduce((s, t) => s + t.amountKrw, 0);
    const avg = Math.round(total / g.months);
    if (BENEFIT_RE.test(g.label)) {
      const firstSeen = g.txs.map((t) => month(t.date)).sort()[0];
      const rule = BENEFIT_TYPICAL_MONTHS.find((r) => r.pattern.test(g.label));
      benefits.push({
        name: g.label,
        monthlyKrw: avg,
        firstSeenMonth: firstSeen,
        endEstimateMonth: rule ? addMonths(firstSeen, rule.months - 1) : null,
      });
    } else {
      const kind = WORK_RE.test(g.label) ? "WORK" : FAMILY_RE.test(g.label) ? "FAMILY" : "WORK";
      incomes.push({ label: g.label, kind, avgMonthlyKrw: avg, monthsObserved: g.months });
    }
  }
  const noRegularWorkIncome = !incomes.some((i) => i.kind === "WORK");

  // ── 정기 지출: 월세·고정비 ──
  const { recurring: recurringOut } = groupRecurring(outTxs);
  let rentMonthlyKrw: number | null = null;
  const fixedCosts: { label: string; monthlyKrw: number }[] = [];
  for (const g of recurringOut) {
    const avg = Math.round(g.txs.reduce((s, t) => s + t.amountKrw, 0) / g.months);
    if (RENT_RE.test(g.label)) rentMonthlyKrw = avg;
    else if (FIXED_RE.test(g.label)) fixedCosts.push({ label: g.label, monthlyKrw: avg });
  }

  // ── 취준 지출 감지 — 전체 지출 대상 (반복 결제된 교통비 등도 포함) ──
  const jobPrepSpending = outTxs
    .filter((t) => JOB_PREP_RE.test(t.description))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ date, description, amountKrw }) => ({ date, description, amountKrw }));
  const jobPrepTotalKrw = jobPrepSpending.reduce((s, t) => s + t.amountKrw, 0);

  return {
    liquidAssetsKrw,
    incomes,
    noRegularWorkIncome,
    rentMonthlyKrw,
    benefits,
    fixedCosts,
    jobPrepSpending,
    jobPrepTotalKrw,
  };
}

export const formatKrw = (n: number) => `${n.toLocaleString("ko-KR")}원`;
