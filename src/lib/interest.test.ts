import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNAL_WEIGHT,
  matchTags,
  scoreInterests,
  topInterests,
  keywordsForTags,
  interestScoreForText,
  eventsFromTexts,
} from "@/lib/interest";
import type { InterestTagDef, InterestEvent } from "@/types/interest";

const TAX: InterestTagDef[] = [
  { id: "시험>응시료", label: "응시료", keywords: ["응시료"] },
  { id: "면접>정장", label: "정장", keywords: ["정장"] },
  { id: "주거>이사", label: "이사", keywords: [/이사(?!장|회)/] },
  { id: "주거>월세", label: "월세", keywords: ["월세", "주거비"] },
];
const NOW = new Date("2026-10-07T00:00:00Z");
const ev = (e: Partial<InterestEvent> & Pick<InterestEvent, "signal" | "tags">): InterestEvent => ({ occurredAt: "2026-10-07", ...e });

test("matchTags: 문자열·정규식 키워드로 태그를 찾는다", () => {
  assert.deepEqual(matchTags("청년 면접 정장 대여", TAX), ["면접>정장"]);
  assert.deepEqual(matchTags("다음주 이사", TAX), ["주거>이사"]);
  assert.deepEqual(matchTags("이사장 인사말", TAX), []);
  assert.deepEqual(matchTags("월세·주거비 지원", TAX), ["주거>월세"]);
  assert.deepEqual(matchTags("", TAX), []);
  assert.deepEqual(matchTags(null, TAX), []);
});

test("scoreInterests: 오늘 신호는 가중치 그대로, 반감기마다 절반", () => {
  const s = scoreInterests(
    [ev({ signal: "save", tags: ["면접>정장"] }), ev({ signal: "save", tags: ["주거>월세"], occurredAt: "2026-09-07" })],
    NOW,
    { halfLifeDays: 30 },
  );
  assert.equal(s["면접>정장"], SIGNAL_WEIGHT.save);
  assert.ok(Math.abs(s["주거>월세"] - SIGNAL_WEIGHT.save / 2) < 1e-9);
});

test("scoreInterests: 미래 일정은 감쇠 없이(나이 0) 반영", () => {
  const s = scoreInterests([ev({ signal: "calendar", tags: ["시험>응시료"], occurredAt: "2026-11-01" })], NOW);
  assert.equal(s["시험>응시료"], SIGNAL_WEIGHT.calendar);
});

test("scoreInterests: 만료된 이벤트는 무시, 명시 weight가 우선, remove는 음수", () => {
  const s = scoreInterests(
    [
      ev({ signal: "chat", tags: ["면접>정장"], weight: 1, expiresAt: "2026-10-01" }),
      ev({ signal: "chat", tags: ["주거>월세"], weight: 0.5, expiresAt: "2026-10-20" }),
      ev({ signal: "save", tags: ["시험>응시료"] }),
      ev({ signal: "remove", tags: ["시험>응시료"] }),
    ],
    NOW,
  );
  assert.equal(s["면접>정장"], undefined);
  assert.equal(s["주거>월세"], 0.5);
  assert.equal(s["시험>응시료"], SIGNAL_WEIGHT.save + SIGNAL_WEIGHT.remove);
});

test("scoreInterests: impression은 관심 점수에 기여하지 않는다", () => {
  const s = scoreInterests([ev({ signal: "impression", tags: ["면접>정장"] })], NOW);
  assert.equal(s["면접>정장"] ?? 0, 0);
});

test("topInterests: 양수만, 점수 내림차순, 최소점 미만 제외, n개", () => {
  const top = topInterests({ a: 1, b: 3, c: -2, d: 0.05, e: 2 }, 2);
  assert.deepEqual(top, ["b", "e"]);
  assert.deepEqual(topInterests({ a: 0.05 }, 3), []);
});

test("keywordsForTags: 문자열 키워드만 중복 없이", () => {
  assert.deepEqual(keywordsForTags(["주거>월세", "주거>이사", "면접>정장"], TAX), ["월세", "주거비", "정장"]);
});

test("interestScoreForText: 텍스트가 걸린 태그의 양수 점수 합", () => {
  const scores = { "면접>정장": 2, "주거>월세": -1, "시험>응시료": 1 };
  assert.equal(interestScoreForText("면접 정장 대여 및 월세 지원", scores, TAX), 2);
  assert.equal(interestScoreForText("응시료와 정장", scores, TAX), 3);
  assert.equal(interestScoreForText("무관", scores, TAX), 0);
});

test("eventsFromTexts: 일정·지출 텍스트 → 태그가 걸린 것만 이벤트로", () => {
  const out = eventsFromTexts(
    [{ text: "정보처리기사 응시료", at: "2026-09-01" }, { text: "점심", at: "2026-09-02" }],
    "spend",
    TAX,
  );
  assert.deepEqual(out, [{ signal: "spend", tags: ["시험>응시료"], occurredAt: "2026-09-01" }]);
});
