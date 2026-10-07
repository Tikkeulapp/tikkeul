import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, extractNumericClaims } from "@/lib/aiGrounding";

test("금액·연월·%를 뽑아 표준 표기로 정규화한다", () => {
  const c = extractNumericClaims("현재 연봉 3,600만 원으로 월여유자금 246만 원을 확보, 결혼 자금은 2028년 9월에, 감면 90%");
  assert.deepEqual(c.map((x) => x.key).sort(), ["2028년9월", "246만원", "3600만원", "90%"].sort());
});

test("억 단위 금액은 만 원 단위 값으로 맞춘다 (원 생략도 인식)", () => {
  const keys = extractNumericClaims("합계 3억 410만 원, 목돈 1억 원, 누적 1억 3,250만").map((x) => x.key);
  assert.deepEqual(keys.sort(), ["10000만원", "13250만원", "30410만원"].sort());
});

test("기간 환산(약 6년, 5년 8개월)도 숫자 주장으로 잡는다", () => {
  const keys = extractNumericClaims("약 6년 걸리고, 다른 목표는 5년 8개월").map((x) => x.key);
  assert.deepEqual(keys.sort(), ["5년8개월", "6년"].sort());
});

test("연월 안의 '년'은 기간으로 중복 집계하지 않는다", () => {
  const keys = extractNumericClaims("2032년 7월에 달성").map((x) => x.key);
  assert.deepEqual(keys, ["2032년7월"]);
});

test("단위 없는 숫자(순번·나이 표기 아님)는 주장으로 보지 않는다", () => {
  assert.deepEqual(extractNumericClaims("우선순위 1번, 3가지 시나리오"), []);
});

test("모든 숫자가 입력에 있으면 통과", () => {
  const source = JSON.stringify({ 연봉: "3,600만 원", 월여유자금: "246만 원", 시나리오: [{ 목표별도달: ["결혼 자금 → 2028년 9월"] }] });
  const r = checkGrounding(["연봉 3,600만 원으로 월여유자금 246만 원, 결혼 자금은 2028년 9월"], source);
  assert.equal(r.ok, true);
  assert.equal(r.claims, 3);
  assert.deepEqual(r.ungrounded, []);
});

test("입력에 없는 숫자(재계산·반올림)는 실패로 보고한다", () => {
  const source = JSON.stringify({ 월여유자금: "246만 원" });
  const r = checkGrounding(["월여유자금 약 250만 원, 약 6년 뒤 달성"], source);
  assert.equal(r.ok, false);
  assert.deepEqual(r.ungrounded.sort(), ["250만원", "6년"].sort());
});

test("목록 밖 제도 이름을 언급하면 실패", () => {
  const source = JSON.stringify({ 열리는제도: [{ 이름: "ISA (개인종합자산관리계좌)" }] });
  const r = checkGrounding(["ISA 가입과 디딤돌 대출을 추천합니다"], source, { forbiddenNames: ["디딤돌 대출", "보금자리론"] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.forbiddenMentions, ["디딤돌 대출"]);
});
