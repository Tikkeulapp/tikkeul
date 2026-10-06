import { test } from "node:test";
import assert from "node:assert/strict";
import { expandKeyword, findKeywordEvidence } from "./ncs";

test("expandKeyword: 하위 개념으로만 확장하고 상위로 역류하지 않는다", () => {
  assert.ok(expandKeyword("금융").includes("카드사"));
  assert.ok(expandKeyword("카드사").includes("여신"));
  const rag = expandKeyword("RAG");
  assert.ok(!rag.includes("AI")); // RAG → AI 역류 금지
  assert.ok(!rag.includes("LLM"));
});

test("expandKeyword: 한국어 합성어 오탐 토큰은 확장어에 포함되지 않는다", () => {
  // 실데이터 검증: '카드'→복지카드·교통카드, '보험'→국민건강보험공단, '페이'→홈페이지에 오탐
  assert.ok(!expandKeyword("카드사").includes("카드"));
  assert.ok(!expandKeyword("금융").includes("카드"));
  assert.ok(!expandKeyword("보험사").includes("보험"));
  assert.ok(!expandKeyword("금융").includes("보험"));
  assert.ok(!expandKeyword("핀테크").includes("페이"));
  assert.ok(!expandKeyword("결제").includes("페이"));
});

test("expandKeyword: 사전에 없는 단어는 입력 그대로만 검색한다", () => {
  assert.deepEqual(expandKeyword("쿠버네티스"), ["쿠버네티스"]);
});

test("findKeywordEvidence: 짧은 영문 토큰은 단어 경계를 요구한다", () => {
  assert.equal(findKeywordEvidence("sales training program", ["AI"]), null); // trAIning 오탐 방지
  assert.ok(findKeywordEvidence("생성형 AI 서비스 개발", ["AI"]));
  assert.ok(findKeywordEvidence("ML/DL 프레임워크 활용", ["DL"])); // 구분자 사이는 인정
});

test("findKeywordEvidence: 매칭 근거를 못 찾으면 null (근거 없는 매칭 금지)", () => {
  assert.equal(findKeywordEvidence("무관한 공고 본문", ["RAG"]), null);
  const ev = findKeywordEvidence("검색증강생성 경험 우대", ["RAG", "검색증강생성"]);
  assert.equal(ev?.term, "검색증강생성");
});
