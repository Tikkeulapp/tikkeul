import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedCron } from "./cronAuth";

test("시크릿과 일치하는 Bearer 헤더면 통과", () => {
  assert.equal(isAuthorizedCron("Bearer s3cret", "s3cret"), true);
});

test("시크릿이 설정돼 있으면 헤더가 없거나 틀릴 때 거부", () => {
  assert.equal(isAuthorizedCron(null, "s3cret"), false);
  assert.equal(isAuthorizedCron("Bearer wrong", "s3cret"), false);
  assert.equal(isAuthorizedCron("s3cret", "s3cret"), false);
});

test("시크릿이 설정되지 않았으면 통과 (Vercel Cron이 헤더 없이 호출)", () => {
  assert.equal(isAuthorizedCron(null, undefined), true);
  assert.equal(isAuthorizedCron(null, ""), true);
});
