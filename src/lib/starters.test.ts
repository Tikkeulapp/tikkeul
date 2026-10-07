import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStarters, blockedStarterIds, weeklyProactive, profileStarterSignals, upcomingEventTags } from "@/lib/starters";
import type { InterestEvent, StarterTemplate } from "@/types/interest";

const T: StarterTemplate[] = [
  { id: "fee", tag: "시험>응시료", question: "응시료 지원 있어?", opener: "응시료 지원을 찾아볼까요?" },
  { id: "fee2", tag: "시험>응시료", question: "응시료 환급 돼?", opener: "응시료 환급을 알아볼까요?" },
  { id: "suit", tag: "면접>정장", question: "정장 대여 돼?", opener: "정장 대여를 찾아볼까요?" },
  { id: "rent", tag: "주거>월세", question: "월세 지원 있어?", opener: "월세 지원을 찾아볼까요?" },
  { id: "profile:kookchwi", tag: null, question: "국민취업지원제도 나도 돼?", opener: "국민취업지원제도를 확인해볼까요?" },
  { id: "default:kookchwi", tag: null, question: "국민취업지원제도가 뭐야?", opener: "" },
  { id: "default:rent", tag: null, question: "청년 월세 지원이 뭐야?", opener: "" },
];
const DEFAULTS = ["default:kookchwi", "default:rent"];
const NOW = new Date("2026-10-07T00:00:00Z");

test("buildStarters: 다가오는 일정 → 관심사 → 프로필 → 기본 순, 태그당 1개, n개", () => {
  const out = buildStarters({ upcomingTags: ["면접>정장"], topTags: ["시험>응시료", "면접>정장"], profileTags: ["주거>월세"], profileStarterIds: ["profile:kookchwi"], blockedIds: [] }, T, DEFAULTS, 4);
  assert.deepEqual(out.map((x) => [x.id, x.reason]), [["suit", "event"], ["fee", "interest"], ["rent", "profile"], ["profile:kookchwi", "profile"]]);
});

test("buildStarters: 거절한 질문은 빼고 같은 태그의 다음 템플릿 사용", () => {
  const out = buildStarters({ upcomingTags: [], topTags: ["시험>응시료"], profileTags: [], profileStarterIds: [], blockedIds: ["fee"] }, T, DEFAULTS, 2);
  assert.deepEqual(out.map((x) => x.id), ["fee2", "default:kookchwi"]);
});

test("buildStarters: 신호가 없는 신규 사용자는 기본 질문", () => {
  const out = buildStarters({ upcomingTags: [], topTags: [], profileTags: [], profileStarterIds: [], blockedIds: [] }, T, DEFAULTS, 3);
  assert.deepEqual(out.map((x) => [x.id, x.reason]), [["default:kookchwi", "default"], ["default:rent", "default"]]);
});

const st = (signal: InterestEvent["signal"], starterId: string, occurredAt: string): InterestEvent => ({ signal, starterId, tags: [], occurredAt });

test("blockedStarterIds: 최근 28일 안에 거절한 선톡만", () => {
  const b = blockedStarterIds([st("starter_no", "fee", "2026-10-01"), st("starter_no", "rent", "2026-08-01"), st("starter_yes", "suit", "2026-10-01")], NOW);
  assert.deepEqual([...b], ["fee"]);
});

test("weeklyProactive: 이번 주 이미 답했으면 없음", () => {
  const picks = buildStarters({ upcomingTags: [], topTags: ["시험>응시료"], profileTags: [], profileStarterIds: [], blockedIds: [] }, T, DEFAULTS, 3);
  assert.equal(weeklyProactive(picks, [st("starter_shown", "fee", "2026-10-03"), st("starter_yes", "fee", "2026-10-03")], NOW, T), null);
});

test("weeklyProactive: 이번 주 보여줬지만 답이 없으면 같은 선톡을 유지", () => {
  const picks = buildStarters({ upcomingTags: ["면접>정장"], topTags: [], profileTags: [], profileStarterIds: [], blockedIds: [] }, T, DEFAULTS, 3);
  const r = weeklyProactive(picks, [st("starter_shown", "fee", "2026-10-03")], NOW, T);
  assert.deepEqual(r && [r.template.id, r.isNew], ["fee", false]);
});

test("weeklyProactive: 새 주에는 최근 4주 안에 안 보낸 첫 개인화 후보, 기본 질문은 선톡하지 않음", () => {
  const picks = buildStarters({ upcomingTags: [], topTags: ["시험>응시료", "주거>월세"], profileTags: [], profileStarterIds: [], blockedIds: [] }, T, DEFAULTS, 3);
  const r = weeklyProactive(picks, [st("starter_shown", "fee", "2026-09-20"), st("starter_no", "fee", "2026-09-20")], NOW, T);
  assert.deepEqual(r && [r.template.id, r.isNew], ["rent", true]);
  const cold = buildStarters({ upcomingTags: [], topTags: [], profileTags: [], profileStarterIds: [], blockedIds: [] }, T, DEFAULTS, 3);
  assert.equal(weeklyProactive(cold, [], NOW, T), null);
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
