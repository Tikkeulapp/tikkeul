/**
 * 관심사 점수 (UFO-lite) — 행동 신호 → 관심 태그 → time-decay 점수.
 * 관심사는 추천 순위에만 쓴다. 자격 판정·금액에는 절대 넣지 않는다 ("숫자는 코드가, 해설은 AI가").
 */
import type { InterestEvent, InterestSignal, InterestTagDef } from "@/types/interest";

/** 신호별 기본 가중치. impression은 노출 기록(다운랭크용)일 뿐 관심이 아니다. */
export const SIGNAL_WEIGHT: Record<InterestSignal, number> = {
  save: 3,
  calendar: 2,
  spend: 2,
  chat: 1,
  view: 1,
  impression: 0,
  remove: -2,
};

const DAY_MS = 86_400_000;

export function matchTags(text: string | null | undefined, taxonomy: InterestTagDef[]): string[] {
  if (!text) return [];
  return taxonomy
    .filter((t) => t.keywords.some((k) => (typeof k === "string" ? text.includes(k) : k.test(text))))
    .map((t) => t.id);
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
    if (e.expiresAt && new Date(e.expiresAt).getTime() < now.getTime()) continue;
    const w = e.weight ?? SIGNAL_WEIGHT[e.signal];
    if (!w) continue;
    const ageDays = Math.max(0, (now.getTime() - new Date(e.occurredAt).getTime()) / DAY_MS);
    const v = w * Math.pow(0.5, ageDays / halfLife);
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
