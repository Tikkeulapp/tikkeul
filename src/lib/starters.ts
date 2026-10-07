/**
 * 먼저 건네는 질문 (카나나 관심사 선톡-lite) — "무엇을 물을지"는 코드가 정하고, 문장은 템플릿.
 * - buildStarters: 검색바 추천 질문 칩 (다가오는 일정 → 관심사 → 프로필 → 기본 순)
 * - weeklyProactive: 주 1회 선톡 (답했으면 그 주는 쉬고, 4주 안에 보낸 주제는 다시 안 보냄)
 */
import type { InterestEvent, InterestTagDef, StarterPick, StarterTemplate } from "@/types/interest";
import { matchTags } from "@/lib/interest";

const DAY_MS = 86_400_000;

export type StarterInput = {
  upcomingTags: string[];      // 2주 안 일정에서 나온 태그 (가까운 순)
  topTags: string[];           // 관심 점수 상위 태그
  profileTags: string[];       // 프로필 상태에서 나온 태그 (월세 → 주거>월세 등)
  profileStarterIds: string[]; // 프로필 전용 질문 (미취업 → 국민취업지원제도 등)
  blockedIds: string[];        // 최근 거절한 선톡
};

export function buildStarters(input: StarterInput, templates: StarterTemplate[], defaultIds: string[], n = 3): StarterPick[] {
  const out: StarterPick[] = [];
  const usedIds = new Set<string>();
  const usedTags = new Set<string>();
  const blocked = new Set(input.blockedIds);
  const push = (t: StarterTemplate | undefined, reason: StarterPick["reason"]) => {
    if (!t || out.length >= n || usedIds.has(t.id) || blocked.has(t.id)) return;
    if (t.tag && usedTags.has(t.tag)) return;
    usedIds.add(t.id);
    if (t.tag) usedTags.add(t.tag);
    out.push({ ...t, reason });
  };
  const forTag = (tag: string) => templates.find((t) => t.tag === tag && !blocked.has(t.id) && !usedIds.has(t.id));

  for (const tag of input.upcomingTags) push(forTag(tag), "event");
  for (const tag of input.topTags) push(forTag(tag), "interest");
  for (const tag of input.profileTags) push(forTag(tag), "profile");
  for (const id of input.profileStarterIds) push(templates.find((t) => t.id === id), "profile");
  for (const id of defaultIds) push(templates.find((t) => t.id === id), "default");
  return out;
}

/** 최근 days일 안에 "괜찮아요"로 거절한 선톡 id. */
export function blockedStarterIds(history: InterestEvent[], now: Date, days = 28): Set<string> {
  const since = now.getTime() - days * DAY_MS;
  return new Set(
    history
      .filter((e) => e.signal === "starter_no" && e.starterId && new Date(e.occurredAt).getTime() >= since)
      .map((e) => e.starterId!),
  );
}

/**
 * 이번 주 선톡. 빈도는 규칙으로 정한다 (LinUCB 같은 발송 최적화는 데이터가 쌓인 뒤).
 * - 최근 7일 안에 답(yes/no)했으면 없음
 * - 최근 7일 안에 보여줬는데 답이 없으면 같은 선톡 유지 (isNew=false)
 * - 아니면 개인화 후보(일정·관심·프로필) 중 최근 28일 안에 안 보낸 첫 번째 (isNew=true). 기본 질문은 선톡하지 않는다.
 */
export function weeklyProactive(
  picks: StarterPick[],
  history: InterestEvent[],
  now: Date,
  templates: StarterTemplate[],
): { template: StarterTemplate; isNew: boolean } | null {
  const within = (e: InterestEvent, days: number) => new Date(e.occurredAt).getTime() >= now.getTime() - days * DAY_MS;
  const starters = history.filter((e) => e.starterId && e.signal.startsWith("starter_"));
  if (starters.some((e) => (e.signal === "starter_yes" || e.signal === "starter_no") && within(e, 7))) return null;

  const lastShown = starters
    .filter((e) => e.signal === "starter_shown" && within(e, 7))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  if (lastShown) {
    const id = lastShown.starterId!;
    // LLM 생성 선톡(gen:<태그>)은 오늘 다시 생성한 목록 → 없으면 같은 태그의 템플릿으로 유지
    const t =
      picks.find((p) => p.id === id) ??
      templates.find((x) => x.id === id) ??
      (id.startsWith("gen:") ? templates.find((x) => x.tag === id.slice(4) && x.opener) : undefined);
    if (!t) return null;
    const { reason: _r, ...template } = t as StarterPick;
    void _r;
    return { template, isNew: false };
  }

  const recent = new Set(starters.filter((e) => e.signal === "starter_shown" && within(e, 28)).map((e) => e.starterId));
  const pick = picks.find((p) => p.reason !== "default" && p.opener && !recent.has(p.id));
  if (!pick) return null;
  const { reason: _r, ...template } = pick;
  void _r;
  return { template, isNew: true };
}

/** 프로필 상태 → 질문 신호. 자격 판정이 아니라 "물어볼 만한 주제" 선별일 뿐이다. */
export function profileStarterSignals(p: { housing: string | null; employment: string | null; benefits: string[] }): {
  profileTags: string[];
  profileStarterIds: string[];
} {
  const profileTags: string[] = [];
  if (p.benefits.some((b) => /구직급여|실업급여/.test(b))) profileTags.push("수당>실업급여");
  if (/월세/.test(p.housing ?? "")) profileTags.push("주거>월세");
  const emp = p.employment ?? "";
  const profileStarterIds = /미취업|취업\s*준비|재취업/.test(emp) && !/재직|이직/.test(emp) ? ["profile:kookchwi"] : [];
  return { profileTags, profileStarterIds };
}

/** 오늘부터 days일 안 일정의 관심 태그 (가까운 순, 중복 제거). */
export function upcomingEventTags(
  events: { title: string; start_at: string }[],
  now: Date,
  taxonomy: InterestTagDef[],
  days = 14,
): string[] {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + days * DAY_MS).toISOString().slice(0, 10);
  const out: string[] = [];
  for (const e of [...events].sort((a, b) => a.start_at.localeCompare(b.start_at))) {
    if (e.start_at < today || e.start_at > until) continue;
    for (const tag of matchTags(e.title, taxonomy)) if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

/** 최근 days일 안에 거절한 선톡의 태그 — LLM 생성 질문에서도 그 주제를 피한다. */
export function blockedStarterTags(history: InterestEvent[], now: Date, days = 28): Set<string> {
  const since = now.getTime() - days * DAY_MS;
  return new Set(history.filter((e) => e.signal === "starter_no" && new Date(e.occurredAt).getTime() >= since).flatMap((e) => e.tags));
}

// ── LLM 질문 생성 (카카오 선톡의 "Generate → Filter") ─────────────────────────

export type ProfileReportInput = {
  age: number | null;
  sido: string | null;
  employment: string | null;
  housing: string | null;
  benefits: string[];
  interests: { label: string; sources: string[] }[];
  upcoming: string[]; // 다가오는 일정의 관심 라벨 (제목·날짜는 넣지 않는다)
};

/** LLM에 보낼 프로필 보고서 — 이름·id·정확한 나이·일정 제목·날짜·금액 없이 판단에 필요한 범주만. */
export function buildProfileReport(p: ProfileReportInput) {
  let 나이대 = "미상";
  if (p.age != null) {
    const d = Math.floor(p.age / 10) * 10;
    const r = p.age % 10;
    나이대 = `${d}대 ${r <= 3 ? "초반" : r <= 6 ? "중반" : "후반"}`;
  }
  return {
    나이대,
    거주지: p.sido ?? "미상",
    취업상태: p.employment ?? "미상",
    주거형태: p.housing ?? "미상",
    수급중수당: p.benefits,
    관심사: p.interests.map((i) => ({ 주제: i.label, 근거: i.sources })),
    다가오는일정종류: p.upcoming,
  };
}

const ON_TOPIC = /지원|정책|제도|수당|급여|혜택|신청|대출|계좌|카드|바우처|상담|프로그램|훈련|장학|보조|환급|무료|대여|컨설팅/;
const HAS_NUMBER_FACT = /\d{4}\s*년|\d+\s*(세|살)|\d[\d,]*\s*(만\s*)?원/; // 연도(최신성)·나이(개인정보)·금액(숫자는 코드가)
const MULTI_TOPIC = /그리고|및|[?？].+[?？]/;
const QUESTION_END = /([?？]|줘|줘요|요)$/;

function bigrams(s: string): Set<string> {
  const t = s.replace(/\s|[?？]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
function hashId(s: string): string {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** LLM 출력 {starters:[{tag,question,opener}]} → 검증된 질문. 규칙에 걸리면 버리고, 비슷한 문장(바이그램 Jaccard ≥ 0.6)은 하나만. */
export function filterGeneratedStarters(raw: unknown, validTags: string[], avoidTags: string[], n: number): StarterTemplate[] {
  const list = (raw as { starters?: unknown } | null)?.starters;
  if (!Array.isArray(list)) return [];
  const out: StarterTemplate[] = [];
  const grams: Set<string>[] = [];
  const usedTags = new Set<string>();
  for (const it of list) {
    if (out.length >= n) break;
    if (!it || typeof it !== "object") continue;
    const { tag: rawTag, question: rawQ, opener: rawO } = it as Record<string, unknown>;
    const tag = rawTag == null ? null : typeof rawTag === "string" && validTags.includes(rawTag) ? rawTag : undefined;
    if (tag === undefined || (tag && (avoidTags.includes(tag) || usedTags.has(tag)))) continue;
    const question = typeof rawQ === "string" ? rawQ.trim() : "";
    if (question.length < 8 || question.length > 45 || !QUESTION_END.test(question)) continue;
    if (!ON_TOPIC.test(question) || HAS_NUMBER_FACT.test(question) || MULTI_TOPIC.test(question)) continue;
    const g = bigrams(question);
    if (grams.some((x) => jaccard(x, g) >= 0.6)) continue;
    let opener = typeof rawO === "string" ? rawO.trim() : "";
    if (opener.length > 80 || HAS_NUMBER_FACT.test(opener) || !/[?？]$/.test(opener)) opener = "";
    grams.push(g);
    if (tag) usedTags.add(tag);
    out.push({ id: tag ? `gen:${tag}` : `gen:${hashId(question)}`, tag, question, opener });
  }
  return out;
}
