import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateCards, estimateNetPay, simulate } from "@/lib/simulate";
import type { SpendingProfile } from "@/types/simulate";

test("실수령은 세전보다 작고 0보다 크다", () => {
  const n = estimateNetPay(36_000_000, { companyType: "대기업", age: 27 });
  assert.equal(n.grossMonthlyKrw, 3_000_000);
  assert.ok(n.netMonthlyKrw > 0 && n.netMonthlyKrw < n.grossMonthlyKrw);
  assert.equal(n.reliefApplied, false);
});

test("중소기업 청년은 소득세 감면 적용, 나이 초과·미상이면 미적용", () => {
  const sme = estimateNetPay(36_000_000, { companyType: "중소기업", age: 27 });
  const big = estimateNetPay(36_000_000, { companyType: "대기업", age: 27 });
  assert.equal(sme.reliefApplied, true);
  assert.ok(sme.netMonthlyKrw > big.netMonthlyKrw);
  assert.equal(estimateNetPay(36_000_000, { companyType: "중소기업", age: 50 }).reliefApplied, false);
  assert.equal(estimateNetPay(36_000_000, { companyType: "중소기업", age: null }).reliefApplied, false);
});

test("공무원은 고용보험 없음", () => {
  assert.equal(estimateNetPay(36_000_000, { companyType: "공무원", age: 27 }).employmentKrw, 0);
});

test("aggregateCards — 카테고리별 월평균, 큰 순서", () => {
  const r = aggregateCards([
    { date: "2026-07-01", merchant: "a", category: "식비", amountKrw: 300_000 },
    { date: "2026-08-01", merchant: "b", category: "식비", amountKrw: 100_000 },
    { date: "2026-08-02", merchant: "c", category: "교통", amountKrw: 80_000 },
  ]);
  assert.equal(r.monthsObserved, 2);
  assert.deepEqual(r.cardByCategory, [
    { category: "식비", monthlyKrw: 200_000 },
    { category: "교통", monthlyKrw: 40_000 },
  ]);
  assert.equal(r.cardMonthlyKrw, 240_000);
  assert.equal(aggregateCards([]).cardMonthlyKrw, 0);
});

const sp: SpendingProfile = {
  source: "직접 입력",
  rentMonthlyKrw: 500_000,
  fixedCosts: [{ label: "통신비", monthlyKrw: 50_000 }],
  loans: [],
  cardByCategory: [{ category: "식비", monthlyKrw: 400_000 }],
  cardMonthlyKrw: 400_000,
  otherVariableMonthlyKrw: 50_000,
  monthsObserved: 3,
  liquidAssetsKrw: 2_000_000,
  savingsKrw: 1_000_000,
};

test("simulate — 결정론: 같은 입력이면 같은 결과", () => {
  const input = { companyType: "중견기업" as const, annualSalaryKrw: 40_000_000, goals: [{ type: "LUMP_SUM" as const, targetKrw: 50_000_000 }], startMonth: "2027-03" };
  assert.deepEqual(simulate(input, sp, { age: 27 }), simulate(input, sp, { age: 27 }));
});

test("simulate — 3 시나리오, 저축 많은 시나리오가 더 빨리 도달", () => {
  const r = simulate(
    { companyType: "중견기업", annualSalaryKrw: 40_000_000, goals: [{ type: "LUMP_SUM", targetKrw: 50_000_000 }], startMonth: "2027-03" },
    sp,
    { age: 27 },
  );
  assert.equal(r.startMonth, "2027-03");
  assert.deepEqual(r.scenarios.map((s) => s.key), ["보수", "기본", "공격"]);
  assert.ok(r.surplusMonthlyKrw > 0);
  const [cons, base, aggr] = r.scenarios.map((s) => s.monthsToAll);
  assert.ok(cons !== null && base !== null && aggr !== null);
  assert.ok(cons >= base && base >= aggr);
  assert.equal(r.debt.advice, "NONE");
});

test("simulate — 잘못된 startMonth는 무시하고 YYYY-MM 반환", () => {
  const r = simulate({ companyType: "대기업", annualSalaryKrw: 40_000_000, goals: [], startMonth: "next" }, sp, { age: 27 });
  assert.match(r.startMonth, /^\d{4}-\d{2}$/);
});
