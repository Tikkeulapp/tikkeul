import { test } from "node:test";
import assert from "node:assert/strict";
import { derive, formatKrw } from "@/lib/derive";
import { PERSONAS } from "@/data/personas";
import type { MyDataSnapshot } from "@/types/persona";

const snapshot: MyDataSnapshot = {
  asOf: "2026-09-03",
  accounts: [
    { accountId: "a1", org: "은행", type: "수시입출금", balanceKrw: 1_000_000 },
    { accountId: "a2", org: "증권", type: "CMA", balanceKrw: 500_000 },
    { accountId: "a3", org: "은행", type: "적금", balanceKrw: 9_000_000 },
  ],
  transactions: [
    { date: "2026-07-10", description: "청년수당", amountKrw: 500_000, direction: "IN" },
    { date: "2026-08-10", description: "청년수당", amountKrw: 500_000, direction: "IN" },
    { date: "2026-07-05", description: "부모님 용돈", amountKrw: 300_000, direction: "IN" },
    { date: "2026-08-05", description: "부모님 용돈", amountKrw: 300_000, direction: "IN" },
    { date: "2026-07-01", description: "월세", amountKrw: 450_000, direction: "OUT" },
    { date: "2026-08-01", description: "월세", amountKrw: 450_000, direction: "OUT" },
    { date: "2026-07-20", description: "통신비", amountKrw: 50_000, direction: "OUT" },
    { date: "2026-08-20", description: "통신비", amountKrw: 50_000, direction: "OUT" },
    { date: "2026-08-25", description: "토익 응시료", amountKrw: 52_500, direction: "OUT" },
    { date: "2026-07-25", description: "면접 정장", amountKrw: 200_000, direction: "OUT" },
  ],
  cardApprovals: [],
  loans: [],
};

test("유동자산은 수시입출금+CMA만 합산", () => {
  assert.equal(derive(snapshot).liquidAssetsKrw, 1_500_000);
});

test("정기 수당 감지 + 통상 수급기간으로 종료 추정", () => {
  const d = derive(snapshot);
  assert.equal(d.benefits.length, 1);
  assert.deepEqual(d.benefits[0], { name: "청년수당", monthlyKrw: 500_000, firstSeenMonth: "2026-07", endEstimateMonth: "2026-12" });
});

test("가족 지원은 FAMILY, 근로소득 없음 플래그", () => {
  const d = derive(snapshot);
  assert.deepEqual(d.incomes.map((i) => i.kind), ["FAMILY"]);
  assert.equal(d.noRegularWorkIncome, true);
});

test("월세·고정비·취준 지출(최신순) 분류", () => {
  const d = derive(snapshot);
  assert.equal(d.rentMonthlyKrw, 450_000);
  assert.deepEqual(d.fixedCosts, [{ label: "통신비", monthlyKrw: 50_000 }]);
  assert.deepEqual(d.jobPrepSpending.map((s) => s.description), ["토익 응시료", "면접 정장"]);
  assert.equal(d.jobPrepTotalKrw, 252_500);
});

test("페르소나 mock 전부 예외 없이 도출", () => {
  for (const p of PERSONAS) {
    const d = derive(p.mydata);
    assert.ok(d.liquidAssetsKrw >= 0, p.id);
    assert.equal(d.jobPrepTotalKrw, d.jobPrepSpending.reduce((s, t) => s + t.amountKrw, 0));
  }
});

test("formatKrw — 천 단위 구분 + 원", () => {
  assert.equal(formatKrw(1234567), "1,234,567원");
});
