import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStarters, avoidTagsFromScores, profileStarterSignals, upcomingEventTags, buildProfileReport, filterGeneratedStarters } from "@/lib/starters";
import type { StarterTemplate } from "@/types/interest";

const T: StarterTemplate[] = [
  { id: "fee", tag: "시험>응시료", question: "응시료 지원 있어?" },
  { id: "suit", tag: "면접>정장", question: "정장 대여 돼?" },
  { id: "rent", tag: "주거>월세", question: "월세 지원 있어?" },
  { id: "profile:kookchwi", tag: null, question: "국민취업지원제도 나도 돼?" },
  { id: "default:kookchwi", tag: null, question: "국민취업지원제도가 뭐야?" },
  { id: "default:rent", tag: null, question: "청년 월세 지원이 뭐야?" },
];
const DEFAULTS = ["default:kookchwi", "default:rent"];
const NONE = { upcomingTags: [], topTags: [], profileTags: [], profileStarterIds: [], avoidTags: [] };

test("buildStarters: 다가오는 일정 → 관심사 → 프로필 → 기본 순, 태그당 1개, n개", () => {
  const out = buildStarters({ ...NONE, upcomingTags: ["면접>정장"], topTags: ["시험>응시료", "면접>정장"], profileTags: ["주거>월세"], profileStarterIds: ["profile:kookchwi"] }, T, DEFAULTS, 4);
  assert.deepEqual(out.map((x) => [x.id, x.reason]), [["suit", "event"], ["fee", "interest"], ["rent", "profile"], ["profile:kookchwi", "profile"]]);
});

test("buildStarters: \"아니에요\"로 내린 주제(avoidTags)는 일정·프로필에서 나와도 빼고 다음 후보로", () => {
  const out = buildStarters({ ...NONE, upcomingTags: ["면접>정장"], profileTags: ["주거>월세"], avoidTags: ["면접>정장", "주거>월세"] }, T, DEFAULTS, 2);
  assert.deepEqual(out.map((x) => x.id), ["default:kookchwi", "default:rent"]);
});

test("buildStarters: 신호가 없는 신규 사용자는 기본 질문", () => {
  const out = buildStarters(NONE, T, DEFAULTS, 3);
  assert.deepEqual(out.map((x) => [x.id, x.reason]), [["default:kookchwi", "default"], ["default:rent", "default"]]);
});

test("avoidTagsFromScores: 점수가 음수인 태그(거절·빼기로 내려간 주제)", () => {
  assert.deepEqual(avoidTagsFromScores({ "시험>응시료": 3, "면접>정장": -9.5, "주거>월세": -0.5, "교통>교통비": 0 }), ["면접>정장", "주거>월세"]);
});

test("profileStarterSignals: 월세 → 주거>월세, 구직급여 수급 → 수당>실업급여, 미취업 → 국민취업지원제도", () => {
  assert.deepEqual(profileStarterSignals({ housing: "1인가구(월세)", employment: "취업 준비 중", benefits: ["구직급여"] }), {
    profileTags: ["수당>실업급여", "주거>월세"],
    profileStarterIds: ["profile:kookchwi"],
  });
  assert.deepEqual(profileStarterSignals({ housing: "본가", employment: "이직 준비 중", benefits: [] }), { profileTags: [], profileStarterIds: [] });
  assert.deepEqual(profileStarterSignals({ housing: null, employment: "미취업", benefits: [] }).profileStarterIds, ["profile:kookchwi"]);
});

test("upcomingEventTags: 오늘~14일 안 일정만, 가까운 순, 태그 중복 제거", () => {
  const TAX = [
    { id: "면접>면접비", label: "면접", keywords: ["면접"] },
    { id: "시험>자격증", label: "시험", keywords: ["시험"] },
  ];
  const tags = upcomingEventTags(
    [
      { title: "SQLD 시험", start_at: "2026-10-15" },
      { title: "A사 면접", start_at: "2026-10-09" },
      { title: "B사 면접", start_at: "2026-10-10" },
      { title: "지난 시험", start_at: "2026-10-01" },
      { title: "먼 면접", start_at: "2026-11-30" },
    ],
    new Date("2026-10-07T00:00:00Z"),
    TAX,
  );
  assert.deepEqual(tags, ["면접>면접비", "시험>자격증"]);
});

test("buildProfileReport: 식별정보 없이 나이는 구간, 일정은 종류만", () => {
  const r = buildProfileReport({
    age: 27, sido: "서울특별시", employment: "취업 준비 중", housing: "1인가구(월세)", benefits: ["고용노동부 구직급여"],
    interests: [{ label: "시험 응시료", sources: ["취준 지출", "캘린더 일정"] }], upcoming: ["면접 비용"],
  });
  assert.deepEqual(r, {
    나이대: "20대 후반", 거주지: "서울특별시", 취업상태: "취업 준비 중", 주거형태: "1인가구(월세)",
    수급중수당: ["고용노동부 구직급여"], 관심사: [{ 주제: "시험 응시료", 근거: ["취준 지출", "캘린더 일정"] }], 다가오는일정종류: ["면접 비용"],
  });
  assert.equal(buildProfileReport({ age: null, sido: null, employment: null, housing: null, benefits: [], interests: [], upcoming: [] }).나이대, "미상");
  assert.equal(buildProfileReport({ age: 31, sido: null, employment: null, housing: null, benefits: [], interests: [], upcoming: [] }).나이대, "30대 초반");
});

const VALID = ["시험>응시료", "면접>정장", "주거>월세", "교통>교통비"];

test("filterGeneratedStarters: 주제 이탈·숫자(연도·금액·나이)·다중 주제·길이·형식 오류를 거른다", () => {
  const out = filterGeneratedStarters(
    { starters: [
      { tag: "시험>응시료", question: "자격증 응시료 돌려받는 정책 있어?" },
      { tag: "면접>정장", question: "2024년 면접 정장 대여 지원 있어?" },
      { tag: "주거>월세", question: "월세 20만원 지원 받을 수 있어?" },
      { tag: "교통>교통비", question: "면접 교통비 지원 그리고 정장 대여 알려줘" },
      { tag: null, question: "오늘 점심 뭐 먹지?" },
      { tag: "가족>육아", question: "육아휴직 지원금 받을 수 있어?" },
      { tag: "주거>월세", question: "청년 월세 지원 나도 받을 수 있어?" },
      { tag: null, question: "27살도 청년 지원 받을 수 있어?" },
      "깨진 항목",
    ] },
    VALID, [], 5,
  );
  assert.deepEqual(out.map((x) => [x.id, x.question]), [
    ["gen:시험>응시료", "자격증 응시료 돌려받는 정책 있어?"],
    ["gen:주거>월세", "청년 월세 지원 나도 받을 수 있어?"],
  ]);
});

test("filterGeneratedStarters: 피할 태그 제외, 태그당 1개, 비슷한 문장 중복 제거, n개", () => {
  const out = filterGeneratedStarters(
    { starters: [
      { tag: "시험>응시료", question: "자격증 응시료 지원받을 수 있는 정책 있어?" },
      { tag: null, question: "자격증 응시료 지원받을 수 있는 정책 있나요?" },
      { tag: "면접>정장", question: "면접 정장 무료 대여 신청할 수 있어?" },
      { tag: "주거>월세", question: "청년 월세 지원 신청 조건 알려줘" },
      { tag: null, question: "국민취업지원제도 나도 받을 수 있어?" },
    ] },
    VALID, ["면접>정장"], 2,
  );
  assert.deepEqual(out.map((x) => x.id), ["gen:시험>응시료", "gen:주거>월세"]);
  assert.deepEqual(filterGeneratedStarters(null, VALID, [], 3), []);
});
