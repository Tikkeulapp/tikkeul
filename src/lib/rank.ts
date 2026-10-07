/**
 * 추천 순위 후처리 — RRF 융합, 피드백 기반 다운랭크, 다양성 재배치. 모두 순수 함수.
 */
import type { InterestEvent } from "@/types/interest";

const DAY_MS = 86_400_000;

/** Reciprocal Rank Fusion — 학습 없이 여러 순위 리스트를 합친다. score = Σ 1/(k + rank), rank는 1부터. */
export function rrf(lists: string[][], k = 60): { id: string; score: number }[] {
  const score = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    list.forEach((id, i) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    });
  }
  return [...score.entries()]
    .map(([id, s]) => ({ id, score: s }))
    .sort((a, b) => b.score - a.score || firstSeen.get(a.id)! - firstSeen.get(b.id)!);
}

type DemoteOpts = { windowDays?: number; minImpressions?: number };

/**
 * 피드백으로 내릴 항목 (정책·공고 공통).
 * - removed: 마지막 담기/빼기 행위가 "빼기"인 항목 → 추천에서 제외
 * - stale: 최근 windowDays 안에 minImpressions번 이상 노출됐는데 열람·담기가 한 번도 없는 항목 → 순위 하향
 */
function demotedBy(events: InterestEvent[], now: Date, idOf: (e: InterestEvent) => string | null | undefined, opts: DemoteOpts) {
  const windowDays = opts.windowDays ?? 14;
  const minImpressions = opts.minImpressions ?? 2;
  const since = now.getTime() - windowDays * DAY_MS;
  const sorted = events.filter((e) => idOf(e)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const lastSaveOrRemove = new Map<string, string>();
  const impressions = new Map<string, number>();
  const engaged = new Set<string>();
  for (const e of sorted) {
    const id = idOf(e)!;
    const save = e.signal === "save" || e.signal === "job_save";
    if (save || e.signal === "remove") lastSaveOrRemove.set(id, save ? "save" : "remove");
    if (save || e.signal === "view" || e.signal === "job_view") engaged.add(id);
    if ((e.signal === "impression" || e.signal === "job_impression") && new Date(e.occurredAt).getTime() >= since) {
      impressions.set(id, (impressions.get(id) ?? 0) + 1);
    }
  }
  const removed = new Set([...lastSaveOrRemove].filter(([, s]) => s === "remove").map(([id]) => id));
  const stale = new Set([...impressions].filter(([id, n]) => n >= minImpressions && !engaged.has(id)).map(([id]) => id));
  return { removed, stale };
}

export function demotedPolicies(events: InterestEvent[], now: Date, opts: DemoteOpts = {}): { removed: Set<string>; stale: Set<string> } {
  return demotedBy(events, now, (e) => e.policyId, opts);
}

export function demotedJobs(events: InterestEvent[], now: Date, opts: DemoteOpts = {}): { removed: Set<string>; stale: Set<string> } {
  return demotedBy(events, now, (e) => e.jobId, opts);
}

/** 원래 순서(코드 점수·LLM 점수)와 관심 순서를 RRF로 합친다. 관심 점수가 모두 0이면 원래 순서 그대로. */
export function fuseWithInterest(ids: string[], interestOf: (id: string) => number): string[] {
  const interestOrder = ids
    .map((id) => ({ id, s: interestOf(id) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  return rrf([ids, interestOrder]).map((x) => x.id);
}

/** 같은 키(테마 등)가 연달아 나오지 않게 탐욕적으로 재배치. 불가능하면 남은 순서대로. null 키는 제약 없음. */
export function diversify<T>(items: T[], keyOf: (t: T) => string | null | undefined): T[] {
  const rest = [...items];
  const out: T[] = [];
  let lastKey: string | null | undefined = null;
  while (rest.length) {
    let idx = rest.findIndex((t) => { const k = keyOf(t); return k == null || lastKey == null || k !== lastKey; });
    if (idx < 0) idx = 0;
    const [picked] = rest.splice(idx, 1);
    out.push(picked);
    lastKey = keyOf(picked);
  }
  return out;
}
