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
  chatInterestEvents,
  shouldExtractInterests,
  explainInterests,
  rollupParents,
  summarizeInterests,
  explainBy,
  scoreForTags,
  orderByInterest,
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

test("shouldExtractInterests: 인사·짧은 말은 건너뛰고, 태그 키워드나 관심 표현이 있으면 추출", () => {
  assert.equal(shouldExtractInterests("안녕", TAX), false);
  assert.equal(shouldExtractInterests("고마워요!", TAX), false);
  assert.equal(shouldExtractInterests("응시료가 너무 비싸요", TAX), true);
  assert.equal(shouldExtractInterests("요즘 공부하느라 돈이 부담돼요", TAX), true);
  assert.equal(shouldExtractInterests("오늘 날씨 어때요 진짜로", TAX), false);
});

test("chatInterestEvents: 화이트리스트·강도×지속성 가중치·일시적 관심 14일 만료·최대 3개", () => {
  const out = chatInterestEvents(
    { interests: [
      { tag: "시험>응시료", strength: "strong", persistence: "persistent" },
      { tag: "면접>정장", strength: "weak", persistence: "temporary" },
      { tag: "가족>육아", strength: "strong", persistence: "persistent" },
      { tag: "주거>월세", strength: "strong", persistence: "temporary" },
      { tag: "주거>이사", strength: "weak", persistence: "persistent" },
    ] },
    NOW,
    TAX.map((t) => t.id),
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((e) => [e.tags[0], e.weight, e.expiresAt ?? null]), [
    ["시험>응시료", 2, null],
    ["면접>정장", 0.5, "2026-10-21T00:00:00.000Z"],
    ["주거>월세", 1.5, "2026-10-21T00:00:00.000Z"],
  ]);
  assert.ok(out.every((e) => e.signal === "chat"));
});

test("chatInterestEvents: 형식이 깨진 LLM 출력은 빈 배열", () => {
  assert.deepEqual(chatInterestEvents(null, NOW, ["시험>응시료"]), []);
  assert.deepEqual(chatInterestEvents({ interests: "x" }, NOW, ["시험>응시료"]), []);
  assert.deepEqual(chatInterestEvents({ interests: [{ tag: "시험>응시료", strength: "?", persistence: "persistent" }] }, NOW, ["시험>응시료"]), []);
});

test("SIGNAL_WEIGHT: reject는 강한 음수", () => {
  assert.ok(SIGNAL_WEIGHT.reject <= -5);
});

test("explainInterests: 상위 태그별 점수와 양수 기여 신호(큰 순), reject된 태그는 빠진다", () => {
  const out = explainInterests(
    [
      ev({ signal: "spend", tags: ["시험>응시료"] }),
      ev({ signal: "save", tags: ["시험>응시료"] }),
      ev({ signal: "calendar", tags: ["면접>정장"] }),
      ev({ signal: "save", tags: ["주거>월세"] }),
      ev({ signal: "reject", tags: ["주거>월세"] }),
    ],
    NOW,
    TAX,
    5,
  );
  assert.deepEqual(out.map((x) => x.tag), ["시험>응시료", "면접>정장"]);
  assert.deepEqual(out[0].sources, ["save", "spend"]);
  assert.equal(out[0].label, "응시료");
  assert.equal(out[0].score, 5);
});

test("rollupParents: 자식 태그의 양수 점수를 부모로 합산", () => {
  assert.deepEqual(rollupParents({ "시험>응시료": 2, "시험>자격증": 1, "주거>월세": -1, "면접>정장": 0.5 }), { 시험: 3, 면접: 0.5 });
});

test("summarizeInterests: 라벨 0~2개로 덜 구체적인 한 문장", () => {
  assert.equal(summarizeInterests([]), null);
  assert.equal(summarizeInterests(["시험 응시료"]), "시험 응시료에 관심이 많아 보여요.");
  assert.equal(summarizeInterests(["시험 응시료", "교통비", "면접 비용"]), "시험 응시료, 교통비에 관심이 많아 보여요.");
});

test("explainInterests: 택소노미에 없는 태그(채용 ncs:·org: 등)는 정책 관심사에서 빠진다", () => {
  const out = explainInterests([ev({ signal: "job_save", tags: ["ncs:20", "org:public"] }), ev({ signal: "save", tags: ["주거>월세"] })], NOW, TAX, 5);
  assert.deepEqual(out.map((x) => x.tag), ["주거>월세"]);
});

test("explainBy: 라벨 함수가 있는 태그만, 근거 신호 포함", () => {
  const out = explainBy([ev({ signal: "job_save", tags: ["org:public"] }), ev({ signal: "job_view", tags: ["org:public", "주거>월세"] })], NOW, 3, (t) => (t.startsWith("org:") ? "공공기관" : null));
  assert.deepEqual(out, [{ tag: "org:public", label: "공공기관", score: 4, sources: ["job_save", "job_view"] }]);
});

test("SIGNAL_WEIGHT: 공고 담기 3, 열람 1, 강점 키워드 1, 노출 0", () => {
  assert.deepEqual([SIGNAL_WEIGHT.job_save, SIGNAL_WEIGHT.job_view, SIGNAL_WEIGHT.job_keyword, SIGNAL_WEIGHT.job_impression], [3, 1, 1, 0]);
});

test("scoreForTags: 태그들의 양수 점수 합", () => {
  assert.equal(scoreForTags(["a", "b", "c"], { a: 2, b: -1 }), 2);
});

test("orderByInterest: 관심 점수 높은 순으로 안정 정렬 (동점·무관은 원래 순서)", () => {
  const items = [{ n: "적금 상품" }, { n: "월세 지원" }, { n: "청약" }, { n: "주거비 보조" }];
  const out = orderByInterest(items, (x) => x.n, { "주거>월세": 2, "시험>응시료": 5 }, TAX);
  assert.deepEqual(out.map((x) => x.n), ["월세 지원", "주거비 보조", "적금 상품", "청약"]);
});
