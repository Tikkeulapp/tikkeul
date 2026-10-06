import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSession } from "@/components/app/useStoredSession";

test("저장된 세션 JSON을 파싱", () => {
  assert.deepEqual(parseSession('{"personaId":"minji","userId":"u1"}'), { personaId: "minji", userId: "u1" });
});

test("없거나 깨진 값은 null", () => {
  assert.equal(parseSession(null), null);
  assert.equal(parseSession(""), null);
  assert.equal(parseSession("{not json"), null);
  assert.equal(parseSession("null"), null);
  assert.equal(parseSession("42"), null);
});
