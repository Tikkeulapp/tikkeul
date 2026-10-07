/**
 * 검색바 추천 질문 (카나나 관심사 선톡의 "무엇을 물을지"만 가져옴).
 * - LLM 생성 질문은 filterGeneratedStarters로 검증 (Generate → Filter)
 * - buildStarters: 생성이 실패하거나 모자랄 때 채우는 규칙 템플릿 (다가오는 일정 → 관심사 → 프로필 → 기본 순)
 */
import type { InterestTagDef, StarterPick, StarterTemplate } from "@/types/interest";
import { matchTags } from "@/lib/interest";

const DAY_MS = 86_400_000;

export type StarterInput = {
  upcomingTags: string[];      // 2주 안 일정에서 나온 태그 (가까운 순)
  topTags: string[];           // 관심 점수 상위 태그
  profileTags: string[];       // 프로필 상태에서 나온 태그 (월세 → 주거>월세 등)
  profileStarterIds: string[]; // 프로필 전용 질문 (미취업 → 국민취업지원제도 등)
  avoidTags: string[];         // "아니에요"·빼기로 점수가 음수가 된 주제
};

export function buildStarters(input: StarterInput, templates: StarterTemplate[], defaultIds: string[], n = 3): StarterPick[] {
  const out: StarterPick[] = [];
  const usedIds = new Set<string>();
  const usedTags = new Set<string>();
  const avoid = new Set(input.avoidTags);
  const push = (t: StarterTemplate | undefined, reason: StarterPick["reason"]) => {
    if (!t || out.length >= n || usedIds.has(t.id)) return;
    if (t.tag && (usedTags.has(t.tag) || avoid.has(t.tag))) return;
    usedIds.add(t.id);
    if (t.tag) usedTags.add(t.tag);
    out.push({ ...t, reason });
  };
  const forTag = (tag: string) => templates.find((t) => t.tag === tag && !usedIds.has(t.id));

  for (const tag of input.upcomingTags) push(forTag(tag), "event");
  for (const tag of input.topTags) push(forTag(tag), "interest");
  for (const tag of input.profileTags) push(forTag(tag), "profile");
  for (const id of input.profileStarterIds) push(templates.find((t) => t.id === id), "profile");
  for (const id of defaultIds) push(templates.find((t) => t.id === id), "default");
  return out;
}

/** 점수가 음수인 태그 — "아니에요"·빼기로 내려간 주제는 추천 질문에서도 피한다. */
export function avoidTagsFromScores(scores: Record<string, number>): string[] {
  return Object.entries(scores).filter(([, v]) => v < 0).map(([k]) => k);
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

/** LLM 출력 {starters:[{tag,question}]} → 검증된 질문. 규칙에 걸리면 버리고, 비슷한 문장(바이그램 Jaccard ≥ 0.6)은 하나만. */
export function filterGeneratedStarters(raw: unknown, validTags: string[], avoidTags: string[], n: number): StarterTemplate[] {
  const list = (raw as { starters?: unknown } | null)?.starters;
  if (!Array.isArray(list)) return [];
  const out: StarterTemplate[] = [];
  const grams: Set<string>[] = [];
  const usedTags = new Set<string>();
  for (const it of list) {
    if (out.length >= n) break;
    if (!it || typeof it !== "object") continue;
    const { tag: rawTag, question: rawQ } = it as Record<string, unknown>;
    const tag = rawTag == null ? null : typeof rawTag === "string" && validTags.includes(rawTag) ? rawTag : undefined;
    if (tag === undefined || (tag && (avoidTags.includes(tag) || usedTags.has(tag)))) continue;
    const question = typeof rawQ === "string" ? rawQ.trim() : "";
    if (question.length < 8 || question.length > 45 || !QUESTION_END.test(question)) continue;
    if (!ON_TOPIC.test(question) || HAS_NUMBER_FACT.test(question) || MULTI_TOPIC.test(question)) continue;
    const g = bigrams(question);
    if (grams.some((x) => jaccard(x, g) >= 0.6)) continue;
    grams.push(g);
    if (tag) usedTags.add(tag);
    out.push({ id: tag ? `gen:${tag}` : `gen:${hashId(question)}`, tag, question });
  }
  return out;
}
