import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

const URL_ = "http://localhost/api/cron/discover";

test("CRON_SECRET이 설정돼 있으면 시크릿이 틀린 호출은 DB·외부 API를 건드리기 전에 401", async () => {
  process.env.CRON_SECRET = "s3cret";
  const res = await GET(new Request(URL_, { headers: { authorization: "Bearer wrong" } }));
  assert.equal(res.status, 401);
  delete process.env.CRON_SECRET;
});

test("CRON_SECRET이 설정돼 있으면 헤더 없는 호출도 401", async () => {
  process.env.CRON_SECRET = "s3cret";
  const res = await GET(new Request(URL_));
  assert.equal(res.status, 401);
  delete process.env.CRON_SECRET;
});
