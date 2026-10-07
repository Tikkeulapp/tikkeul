/**
 * 관심사 점수 (UFO-lite) — 행동 신호 → 관심 태그 → time-decay 점수.
 * 관심사는 추천 순위에만 쓴다. 자격 판정·금액에는 절대 넣지 않는다 ("숫자는 코드가, 해설은 AI가").
 */
import type { InterestEvent, InterestExplanation, InterestSignal, InterestTagDef } from "@/types/interest";

/** 신호별 기본 가중치. impression은 노출 기록(다운랭크용)일 뿐 관심이 아니다.
 * reject("아니에요")는 반감기가 몇 번 지나도 다시 떠오르지 않을 만큼 강한 음수. */
export const SIGNAL_WEIGHT: Record<InterestSignal, number> = {
  save: 3,
  calendar: 2,
  spend: 2,
  chat: 1,
  view: 1,
  impression: 0,
  remove: -2,
  reject: -10,
  job_save: 3,
  job_view: 1,
  job_keyword: 1,
  job_impression: 0,
};

const DAY_MS = 86_400_000;

export function matchTags(text: string | null | undefined, taxonomy: InterestTagDef[]): string[] {
  if (!text) return [];
  return taxonomy
    .filter((t) => t.keywords.some((k) => (typeof k === "string" ? text.includes(k) : k.test(text))))
    .map((t) => t.id);
}

/** 이벤트 1건의 현재 기여값 (만료면 0). */
function decayedValue(e: InterestEvent, now: Date, halfLife: number): number {
  if (e.expiresAt && new Date(e.expiresAt).getTime() < now.getTime()) return 0;
  const w = e.weight ?? SIGNAL_WEIGHT[e.signal];
  if (!w) return 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(e.occurredAt).getTime()) / DAY_MS);
  return w * Math.pow(0.5, ageDays / halfLife);
}

/** Σ weight × 0.5^(경과일/반감기). 미래 이벤트(다가오는 일정)는 경과 0으로 본다. */
export function scoreInterests(
  events: InterestEvent[],
  now: Date,
  opts: { halfLifeDays?: number } = {},
): Record<string, number> {
  const halfLife = opts.halfLifeDays ?? 30;
  const scores: Record<string, number> = {};
  for (const e of events) {
    const v = decayedValue(e, now, halfLife);
    if (!v) continue;
    for (const tag of e.tags) scores[tag] = (scores[tag] ?? 0) + v;
  }
  return scores;
}

export function topInterests(scores: Record<string, number>, n: number, minScore = 0.1): string[] {
  return Object.entries(scores)
    .filter(([, v]) => v >= minScore)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k]) => k);
}

export function keywordsForTags(tags: string[], taxonomy: InterestTagDef[]): string[] {
  const out: string[] = [];
  for (const id of tags) {
    const def = taxonomy.find((t) => t.id === id);
    for (const k of def?.keywords ?? []) if (typeof k === "string" && !out.includes(k)) out.push(k);
  }
  return out;
}

/** 텍스트(정책 제목·요약)가 걸린 태그들의 양수 관심 점수 합 — 순위 보조용. */
export function interestScoreForText(text: string | null | undefined, scores: Record<string, number>, taxonomy: InterestTagDef[]): number {
  return matchTags(text, taxonomy).reduce((s, tag) => s + Math.max(0, scores[tag] ?? 0), 0);
}

/** 일정 제목·지출 적요처럼 이미 있는 데이터를 런타임에 관심 이벤트로 바꾼다 (태그가 걸린 것만). */
export function eventsFromTexts(
  items: { text: string; at: string }[],
  signal: InterestSignal,
  taxonomy: InterestTagDef[],
): InterestEvent[] {
  const out: InterestEvent[] = [];
  for (const it of items) {
    const tags = matchTags(it.text, taxonomy);
    if (tags.length) out.push({ signal, tags, occurredAt: it.at });
  }
  return out;
}

// ── 대화 기반 관심 추출 (PANDA-lite) ─────────────────────────────────────────

const GREETING = /^(안녕|하이|hi|hello|고마워|고맙|감사|ㅎㅎ|ㅋㅋ|네|응|ㅇㅇ|ok|오케이|좋아요?)[\s!.~?]*$/i;
const INTEREST_HINT = /준비|공부|부담|비용|돈|지원|받고\s*싶|관심|알아보|필요|계획|고민/;

/** LLM을 부를 가치가 있는 발화인지 (규칙 기반 1차 필터) — 인사·짧은 말은 건너뛴다. */
export function shouldExtractInterests(text: string, taxonomy: InterestTagDef[]): boolean {
  const t = text.trim();
  if (t.length < 6 || GREETING.test(t)) return false;
  return matchTags(t, taxonomy).length > 0 || INTEREST_HINT.test(t);
}

/** 강도 × 지속성 → 가중치. 일시적 관심은 TEMP_DAYS 뒤 만료. */
const CHAT_WEIGHT = { strong: { persistent: 2, temporary: 1.5 }, weak: { persistent: 1, temporary: 0.5 } } as const;
const TEMP_DAYS = 14;
const MAX_CHAT_TAGS = 3;

/** LLM 출력 {interests:[{tag,strength,persistence}]}을 검증해 chat 이벤트로 — 화이트리스트 밖·형식 오류는 버린다. */
export function chatInterestEvents(raw: unknown, now: Date, validTags: string[]): InterestEvent[] {
  const list = (raw as { interests?: unknown } | null)?.interests;
  if (!Array.isArray(list)) return [];
  const out: InterestEvent[] = [];
  const seen = new Set<string>();
  for (const it of list) {
    const { tag, strength, persistence } = (it ?? {}) as Record<string, unknown>;
    if (typeof tag !== "string" || !validTags.includes(tag) || seen.has(tag)) continue;
    if ((strength !== "strong" && strength !== "weak") || (persistence !== "persistent" && persistence !== "temporary")) continue;
    seen.add(tag);
    out.push({
      signal: "chat",
      tags: [tag],
      weight: CHAT_WEIGHT[strength][persistence],
      occurredAt: now.toISOString(),
      expiresAt: persistence === "temporary" ? new Date(now.getTime() + TEMP_DAYS * DAY_MS).toISOString() : null,
    });
    if (out.length >= MAX_CHAT_TAGS) break;
  }
  return out;
}

// ── "티끌이 이해한 나" (Persona-lite) ────────────────────────────────────────

/** 라벨이 있는 태그만 골라 상위 n개의 점수와 근거(양수로 기여한 신호 종류, 큰 순).
 * 근거는 신호 종류까지만 — 날짜·내역은 노출하지 않는다. 정책 관심사와 채용 선호를 같은 방식으로 설명한다. */
export function explainBy(
  events: InterestEvent[],
  now: Date,
  n: number,
  labelOf: (tag: string) => string | null,
  opts: { halfLifeDays?: number } = {},
): InterestExplanation[] {
  const halfLife = opts.halfLifeDays ?? 30;
  const labels = new Map<string, string>();
  const scores: Record<string, number> = {};
  const bySignal: Record<string, Partial<Record<InterestEvent["signal"], number>>> = {};
  for (const e of events) {
    const v = decayedValue(e, now, halfLife);
    if (!v) continue;
    for (const tag of e.tags) {
      if (!labels.has(tag)) {
        const l = labelOf(tag);
        if (l === null) continue;
        labels.set(tag, l);
      }
      scores[tag] = (scores[tag] ?? 0) + v;
      if (v > 0) {
        const m = (bySignal[tag] ??= {});
        m[e.signal] = (m[e.signal] ?? 0) + v;
      }
    }
  }
  return topInterests(scores, n).map((tag) => ({
    tag,
    label: labels.get(tag)!,
    score: Math.round(scores[tag] * 100) / 100,
    sources: Object.entries(bySignal[tag] ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([sig]) => sig as InterestEvent["signal"]),
  }));
}

/** 정책 관심사 설명 — 택소노미 태그만 (채용 네임스페이스 태그는 제외). */
export function explainInterests(
  events: InterestEvent[],
  now: Date,
  taxonomy: InterestTagDef[],
  n: number,
  opts: { halfLifeDays?: number } = {},
): InterestExplanation[] {
  return explainBy(events, now, n, (tag) => taxonomy.find((t) => t.id === tag)?.label ?? null, opts);
}

/** 태그들의 양수 관심 점수 합. */
export function scoreForTags(tags: string[], scores: Record<string, number>): number {
  return tags.reduce((s, t) => s + Math.max(0, scores[t] ?? 0), 0);
}

/** 관심 점수 높은 순으로 안정 정렬 — 동점·무관 항목은 원래 순서 유지 (판정 그룹 안에서의 표시 순서용). */
export function orderByInterest<T>(items: T[], textOf: (t: T) => string, scores: Record<string, number>, taxonomy: InterestTagDef[]): T[] {
  return items
    .map((item, i) => ({ item, i, s: interestScoreForText(textOf(item), scores, taxonomy) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

/** 자식 태그("시험>응시료")의 양수 점수를 부모("시험")로 합산. */
export function rollupParents(scores: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [tag, v] of Object.entries(scores)) {
    if (v <= 0) continue;
    const parent = tag.split(">")[0];
    out[parent] = (out[parent] ?? 0) + v;
  }
  return out;
}

/** 카드 머리 문장 — 상위 라벨 2개까지만, 근거·내역 없이. */
export function summarizeInterests(labels: string[]): string | null {
  if (!labels.length) return null;
  return `${labels.slice(0, 2).join(", ")}에 관심이 많아 보여요.`; // 라벨 안에 "·"가 있어 구분자는 쉼표
}
