import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeChatReply, POLICY_FALLBACK_TEXT } from "./chatReply";

test("mergeChatReply: 프로필 답변 + 정책 답변을 이어 붙인다", () => {
  assert.equal(mergeChatReply("프로필 반영", "정책 3건", { deltaShown: false }), "프로필 반영\n\n정책 3건");
});

test("mergeChatReply: 앞선 답변이 있으면 정책 쪽 실패 문구는 붙이지 않고 다시 물어보라고 안내", () => {
  const out = mergeChatReply("✅ 거주지 반영", POLICY_FALLBACK_TEXT, { deltaShown: false });
  assert.ok(out.startsWith("✅ 거주지 반영"));
  assert.ok(!out.includes(POLICY_FALLBACK_TEXT));
  assert.match(out, /한 번 더 물어/);
});

test("mergeChatReply: 이사 혜택(델타)이 이미 답이면 정책 실패·0건 문구는 아무것도 붙이지 않는다", () => {
  assert.equal(mergeChatReply("이사 혜택 목록", POLICY_FALLBACK_TEXT, { deltaShown: true }), "이사 혜택 목록");
  assert.equal(mergeChatReply("이사 혜택 목록", "관련 정책을 찾지 못했습니다.", { deltaShown: true }), "이사 혜택 목록");
});

test("mergeChatReply: 앞선 답변이 없으면 정책 답변(실패 문구 포함)을 그대로", () => {
  assert.equal(mergeChatReply(null, POLICY_FALLBACK_TEXT, { deltaShown: false }), POLICY_FALLBACK_TEXT);
  assert.equal(mergeChatReply(null, "정책 3건", { deltaShown: false }), "정책 3건");
});
