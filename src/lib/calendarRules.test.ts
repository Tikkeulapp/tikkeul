import { test } from "node:test";
import assert from "node:assert/strict";
import { isPolicyRelevantEvent, POLICY_RELEVANT_EVENT_TYPES } from "@/lib/calendarRules";

test("ETC를 제외한 9종 이벤트는 정책 관련", () => {
  assert.equal(POLICY_RELEVANT_EVENT_TYPES.size, 9);
  for (const t of POLICY_RELEVANT_EVENT_TYPES) assert.equal(isPolicyRelevantEvent(t), true);
});

test("ETC·미지정·알 수 없는 유형은 무관", () => {
  assert.equal(isPolicyRelevantEvent("ETC"), false);
  assert.equal(isPolicyRelevantEvent(null), false);
  assert.equal(isPolicyRelevantEvent(undefined), false);
  assert.equal(isPolicyRelevantEvent(""), false);
  assert.equal(isPolicyRelevantEvent("BIRTHDAY"), false);
});
