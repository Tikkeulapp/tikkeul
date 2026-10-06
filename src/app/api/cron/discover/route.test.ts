import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

const URL_ = "http://localhost/api/cron/discover";

test("CRON_SECRET 미설정이면 DB·외부 API를 건드리기 전에 401 (fail-closed)", async () => {
  delete process.env.CRON_SECRET;
  const res = await GET(new Request(URL_, { headers: { authorization: "Bearer anything" } }));
  assert.equal(res.status, 401);
});

test("시크릿이 틀리면 401", async () => {
  process.env.CRON_SECRET = "s3cret";
  const res = await GET(new Request(URL_, { headers: { authorization: "Bearer wrong" } }));
  assert.equal(res.status, 401);
  delete process.env.CRON_SECRET;
});
