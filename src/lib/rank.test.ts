import { test } from "node:test";
import assert from "node:assert/strict";
import { rrf, demotedPolicies, demotedJobs, fuseWithInterest, diversify } from "@/lib/rank";
import type { InterestEvent } from "@/types/interest";

const NOW = new Date("2026-10-07T00:00:00Z");

test("rrf: 양쪽 1위면 2/(k+1), 한쪽에만 있으면 그 순위만", () => {
  const out = rrf([["a", "b", "c"], ["a", "c"]], 60);
  assert.equal(out[0].id, "a");
  assert.ok(Math.abs(out[0].score - 2 / 61) < 1e-12);
  assert.deepEqual(out.map((x) => x.id), ["a", "c", "b"]);
});

test("rrf: 리스트 하나면 원래 순서 유지, 빈 리스트는 무시", () => {
  assert.deepEqual(rrf([["x", "y", "z"], []]).map((x) => x.id), ["x", "y", "z"]);
});

const ev = (policyId: string, signal: InterestEvent["signal"], occurredAt: string): InterestEvent => ({ policyId, signal, tags: [], occurredAt });

test("demotedPolicies: 마지막 담기/빼기가 빼기면 removed", () => {
  const d = demotedPolicies([ev("p1", "save", "2026-09-01"), ev("p1", "remove", "2026-09-05"), ev("p2", "remove", "2026-09-01"), ev("p2", "save", "2026-09-03")], NOW);
  assert.deepEqual([...d.removed], ["p1"]);
});

test("demotedPolicies: 기간 내 반복 노출됐지만 반응 없으면 stale", () => {
  const d = demotedPolicies(
    [
      ev("p1", "impression", "2026-10-01"), ev("p1", "impression", "2026-10-05"),
      ev("p2", "impression", "2026-10-01"), ev("p2", "impression", "2026-10-05"), ev("p2", "view", "2026-10-06"),
      ev("p3", "impression", "2026-08-01"), ev("p3", "impression", "2026-08-02"),
      ev("p4", "impression", "2026-10-05"),
    ],
    NOW,
    { windowDays: 14, minImpressions: 2 },
  );
  assert.deepEqual([...d.stale], ["p1"]);
});

test("diversify: 같은 키가 연속되지 않게 재배치(가능한 한), 상대 순서 유지", () => {
  const items = [{ id: 1, k: "A" }, { id: 2, k: "A" }, { id: 3, k: "B" }, { id: 4, k: "A" }, { id: 5, k: "C" }];
  assert.deepEqual(diversify(items, (x) => x.k).map((x) => x.id), [1, 3, 2, 5, 4]);
});

test("diversify: 불가능하면 남은 것을 순서대로, 키 없음(null)은 연속 허용", () => {
  assert.deepEqual(diversify([{ k: "A", id: 1 }, { k: "A", id: 2 }], (x) => x.k).map((x) => x.id), [1, 2]);
  assert.deepEqual(diversify([{ k: null, id: 1 }, { k: null, id: 2 }], (x) => x.k).map((x) => x.id), [1, 2]);
});

test("demotedJobs: 공고도 반복 노출·무반응이면 stale (담기·열람하면 제외)", () => {
  const je = (jobId: string, signal: InterestEvent["signal"], occurredAt: string): InterestEvent => ({ jobId, signal, tags: [], occurredAt });
  const d = demotedJobs([
    je("j1", "job_impression", "2026-10-01"), je("j1", "job_impression", "2026-10-05"),
    je("j2", "job_impression", "2026-10-01"), je("j2", "job_impression", "2026-10-05"), je("j2", "job_save", "2026-10-06"),
    ev("p1", "impression", "2026-10-01"), ev("p1", "impression", "2026-10-05"),
  ], NOW);
  assert.deepEqual([...d.stale], ["j1"]);
});

test("fuseWithInterest: 원래 순서와 관심 순서를 RRF로 합침, 관심 없으면 원래 순서 유지", () => {
  const interest: Record<string, number> = { c: 5, b: 1 };
  assert.deepEqual(fuseWithInterest(["a", "b", "c"], (id) => interest[id] ?? 0), ["c", "b", "a"]);
  assert.deepEqual(fuseWithInterest(["a", "b", "c"], () => 0), ["a", "b", "c"]);
});
