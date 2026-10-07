import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDetailUrl } from "./url";

const FB = "https://job.alio.go.kr/recruitview.do?idx=305768";

test("sanitizeDetailUrl: 정상 http(s) URL은 그대로 통과", () => {
  assert.equal(sanitizeDetailUrl("https://example.com/job/1", FB), "https://example.com/job/1");
  assert.equal(sanitizeDetailUrl("http://example.com", FB), "http://example.com");
});

test("sanitizeDetailUrl: 스킴 없는 도메인은 https를 붙인다", () => {
  // 실데이터: 'www.kohom.or.kr', 'mpva.go.kr' 같은 값이 잡알리오 srcUrl로 들어온다
  assert.equal(sanitizeDetailUrl("www.kohom.or.kr", FB), "https://www.kohom.or.kr");
  assert.equal(sanitizeDetailUrl("mpva.go.kr/recruit", FB), "https://mpva.go.kr/recruit");
});

test("sanitizeDetailUrl: 쓰레기 값('.', '없음', '/')은 폴백으로 대체", () => {
  // 실데이터: '.', '/', '없음', '해당없음', '없음.' — 상대 URL로 렌더되면 앱 내부로 이동해버린다
  for (const junk of [".", "/", "없음", "해당없음", "없음.", "", "  ", null, undefined]) {
    assert.equal(sanitizeDetailUrl(junk as string | null | undefined, FB), FB);
  }
});

test("sanitizeDetailUrl: 폴백이 없으면 null (링크 미표시)", () => {
  assert.equal(sanitizeDetailUrl("없음", null), null);
  assert.equal(sanitizeDetailUrl("www.kohom.or.kr", null), "https://www.kohom.or.kr");
});
