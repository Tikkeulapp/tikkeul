import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeFor, badgeLabel, gateByEligibility, profileForMove, verdictFromBadge } from "@/lib/eligibilityGate";
import { ELIGIBILITY_CONDITIONS_NOT_DEFINED } from "@/lib/eligibility";
import type { EligibilityResult } from "@/types/eligibility";

const confirmed: EligibilityResult = { status: "confirmed", missingFields: [], checks: [] };
const excluded: EligibilityResult = { status: "excluded", missingFields: [], checks: [] };
const insufficient: EligibilityResult = { status: "insufficient_info", missingFields: ["income_bracket"], checks: [] };

test("badgeFor: 규칙엔진 결과를 배지로, excluded는 null", () => {
  assert.deepEqual(badgeFor(confirmed), { status: "confirmed", missingFields: [] });
  assert.deepEqual(badgeFor(insufficient), { status: "insufficient_info", missingFields: ["income_bracket"] });
  assert.equal(badgeFor(excluded), null);
});

test("badgeFor: 구조화 조건 미등록(null·sentinel)은 unjudged", () => {
  assert.deepEqual(badgeFor(null), { status: "unjudged", missingFields: [] });
  assert.deepEqual(badgeFor(undefined), { status: "unjudged", missingFields: [] });
  const sentinel: EligibilityResult = { status: "insufficient_info", missingFields: [ELIGIBILITY_CONDITIONS_NOT_DEFINED], checks: [] };
  assert.deepEqual(badgeFor(sentinel), { status: "unjudged", missingFields: [] });
});

test("gateByEligibility: excluded 제거, 나머지는 순서 유지 + 배지 부착", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const results = new Map<string, EligibilityResult | null>([
    ["a", insufficient],
    ["b", excluded],
    ["c", confirmed],
    // d: 조회 결과 없음 → unjudged
  ]);
  const out = gateByEligibility(items, (x) => x.id, results);
  assert.deepEqual(out.map((x) => x.id), ["a", "c", "d"]);
  assert.equal(out[0].eligibility.status, "insufficient_info");
  assert.equal(out[1].eligibility.status, "confirmed");
  assert.equal(out[2].eligibility.status, "unjudged");
});

test("badgeLabel: 사용자에게 보일 문구 (필드명 대신 한국어)", () => {
  assert.equal(badgeLabel({ status: "confirmed", missingFields: [] }), "✅ 자격 충족");
  assert.equal(badgeLabel({ status: "insufficient_info", missingFields: ["income_bracket", "employment_status"] }), "🟡 확인 필요: 가구 중위소득 구간, 취업상태");
  assert.equal(badgeLabel({ status: "insufficient_info", missingFields: [] }), "🟡 일부 조건 확인 필요");
  assert.equal(badgeLabel({ status: "insufficient_info", missingFields: ["unknown_field"] }), "🟡 확인 필요: unknown_field");
  assert.equal(badgeLabel({ status: "unjudged", missingFields: [] }), null);
});

test("verdictFromBadge: 저장용 Verdict — 판정은 배지(규칙엔진)에서만 온다", () => {
  assert.deepEqual(verdictFromBadge({ status: "confirmed", missingFields: [] }, 80, "면접 일정과 연결"), {
    score: 80, eligibility: "LIKELY", reasons: ["면접 일정과 연결"], missing_information: [], evidence_todo: [],
  });
  assert.equal(verdictFromBadge({ status: "insufficient_info", missingFields: ["income_bracket"] }, 70, "r").eligibility, "NEEDS_CHECK");
  assert.deepEqual(verdictFromBadge({ status: "insufficient_info", missingFields: ["income_bracket"] }, 70, "r").missing_information, ["income_bracket"]);
  // 미판정은 sentinel로 남긴다 — 채팅 route가 이 값을 걸러 Profile Agent가 되묻지 않게
  const u = verdictFromBadge({ status: "unjudged", missingFields: [] }, 65, "r");
  assert.equal(u.eligibility, "NEEDS_CHECK");
  assert.deepEqual(u.missing_information, [ELIGIBILITY_CONDITIONS_NOT_DEFINED]);
});

test("profileForMove: 이사 목적지 기준 프로필 (시군구는 모름으로)", () => {
  const row = { region_sido: "서울특별시", region_sigungu: "관악구", birth_date: "2000-01-01" };
  assert.deepEqual(profileForMove(row, "대전광역시"), { region_sido: "대전광역시", region_sigungu: null, birth_date: "2000-01-01" });
  assert.equal(profileForMove(row, "서울특별시"), row); // 같은 시도면 그대로
  assert.equal(profileForMove(row, null), row);
  assert.equal(profileForMove(null, "대전광역시"), null);
  assert.equal(row.region_sido, "서울특별시"); // 원본 불변
});
