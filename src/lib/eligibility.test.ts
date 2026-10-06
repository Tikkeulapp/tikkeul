import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyConditions,
  computeAge,
  ELIGIBILITY_CONDITIONS_NOT_DEFINED,
  evaluateCondition,
} from "@/lib/eligibility";
import type { EligibilityCondition } from "@/types/eligibility";

const AS_OF = new Date(2026, 8, 15); // 2026-09-15

test("computeAge — 생일 전후로 만 나이 계산", () => {
  assert.equal(computeAge("2000-09-15", AS_OF), 26);
  assert.equal(computeAge("2000-09-16", AS_OF), 25);
  assert.equal(computeAge("2000-01-01T00:00:00Z", AS_OF), 26);
});

test("조건이 없으면 insufficient_info + sentinel", () => {
  const r = classifyConditions([], {}, {}, AS_OF);
  assert.equal(r.status, "insufficient_info");
  assert.deepEqual(r.missingFields, [ELIGIBILITY_CONDITIONS_NOT_DEFINED]);
});

const ageMax34: EligibilityCondition = { field: "age", source_table: "profile_survey", operator: "<=", value: 34 };
const incomeMax: EligibilityCondition = { field: "income_bracket", source_table: "finance", operator: "<=", value: "60~100%" };

test("모든 조건 충족 → confirmed", () => {
  const r = classifyConditions([ageMax34, incomeMax], { birth_date: "2000-01-01" }, { income_bracket: "~60%" }, AS_OF);
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.missingFields, []);
});

test("소득 구간은 서수로 비교", () => {
  const r = classifyConditions([incomeMax], {}, { income_bracket: "100~150%" }, AS_OF);
  assert.equal(r.status, "excluded");
});

test("미충족이 하나라도 확인되면 누락 필드보다 우선해 excluded", () => {
  const r = classifyConditions([ageMax34, incomeMax], { birth_date: "1980-01-01" }, null, AS_OF);
  assert.equal(r.status, "excluded");
  assert.deepEqual(r.missingFields, ["income_bracket"]);
});

test("값이 없으면 insufficient_info + 누락 필드", () => {
  const r = classifyConditions([ageMax34, incomeMax], { birth_date: "2000-01-01" }, {}, AS_OF);
  assert.equal(r.status, "insufficient_info");
  assert.deepEqual(r.missingFields, ["income_bracket"]);
});

test("숫자 문자열은 숫자로 맞춰 비교, in/not in 지원", () => {
  const num = evaluateCondition({ field: "household_size", source_table: "profile_survey", operator: "=", value: 3 }, { household_size: "3" }, null, AS_OF);
  assert.equal(num.satisfied, true);
  const inOp = evaluateCondition({ field: "sido", source_table: "profile_survey", operator: "in", value: ["서울특별시", "경기도"] }, { sido: "경기도" }, null, AS_OF);
  assert.equal(inOp.satisfied, true);
  const notIn = evaluateCondition({ field: "sido", source_table: "profile_survey", operator: "not in", value: ["서울특별시"] }, { sido: "서울특별시" }, null, AS_OF);
  assert.equal(notIn.satisfied, false);
  const missing = evaluateCondition(ageMax34, {}, null, AS_OF);
  assert.equal(missing.present, false);
  assert.equal(missing.satisfied, null);
});
