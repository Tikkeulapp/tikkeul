/**
 * 관심 신호 기록·조회 (I/O 전용). 점수 계산은 src/lib/interest.ts, 다운랭크는 src/lib/rank.ts.
 * 개인화는 부가기능이다 — 여기 실패(테이블 미생성 등)는 로그만 남기고 추천 자체를 막지 않는다.
 */
import { supabaseAdmin } from "@/services/supabase";
import { getPersona } from "@/data/personas";
import { INTEREST_TAGS } from "@/data/interests";
import { derive } from "@/lib/derive";
import { eventsFromTexts, matchTags, scoreInterests, topInterests } from "@/lib/interest";
import { demotedPolicies } from "@/lib/rank";
import type { InterestEvent, InterestSignal } from "@/types/interest";

const LOOKBACK_DAYS = 180;

/** 정책 단위 신호(담기·빼기·열람) 기록. text가 없으면 policies에서 제목·요약을 읽어 태그를 붙인다. */
export async function recordPolicySignal(opts: {
  userId: string;
  policyId: string;
  signal: Extract<InterestSignal, "save" | "remove" | "view">;
  text?: string | null;
}): Promise<void> {
  try {
    const db = supabaseAdmin();
    let text = opts.text ?? null;
    if (!text) {
      const { data } = await db.from("policies").select("title, search_text").eq("policy_id", opts.policyId).maybeSingle();
      text = data ? `${data.title} ${(data.search_text ?? "").slice(0, 300)}` : null;
    }
    const { error } = await db.from("user_interest_events").insert({
      user_id: opts.userId,
      signal: opts.signal,
      policy_id: opts.policyId,
      tags: matchTags(text, INTEREST_TAGS),
    });
    if (error) console.error(`관심 신호 기록 실패 (${opts.signal}):`, error.message);
  } catch (e) {
    console.error("관심 신호 기록 실패:", e instanceof Error ? e.message : e);
  }
}

/** 추천 노출 기록 — "여러 번 보여줬는데 반응 없음" 다운랭크용. */
export async function recordImpressions(userId: string, policyIds: string[]): Promise<void> {
  if (!policyIds.length) return;
  try {
    const { error } = await supabaseAdmin()
      .from("user_interest_events")
      .insert(policyIds.map((policy_id) => ({ user_id: userId, signal: "impression", policy_id, tags: [] })));
    if (error) console.error("노출 기록 실패:", error.message);
  } catch (e) {
    console.error("노출 기록 실패:", e instanceof Error ? e.message : e);
  }
}

export type InterestContext = {
  scores: Record<string, number>;
  topTags: string[];
  removed: Set<string>;
  stale: Set<string>;
};

const EMPTY: InterestContext = { scores: {}, topTags: [], removed: new Set(), stale: new Set() };

/** 저장된 신호 + 캘린더 일정 + (페르소나) 마이데이터 취준 지출 → 관심 점수·다운랭크 대상. */
export async function loadInterestContext(opts: { userId?: string | null; personaId?: string | null }): Promise<InterestContext> {
  const now = new Date();
  const events: InterestEvent[] = [];

  if (opts.personaId) {
    const p = getPersona(opts.personaId);
    if (p) {
      const spend = derive(p.mydata).jobPrepSpending.map((t) => ({ text: t.description, at: t.date }));
      events.push(...eventsFromTexts(spend, "spend", INTEREST_TAGS));
    }
  }

  if (opts.userId) {
    try {
      const db = supabaseAdmin();
      const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
      const [ev, cal] = await Promise.all([
        db.from("user_interest_events").select("signal, tags, policy_id, weight, occurred_at, expires_at").eq("user_id", opts.userId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(1000),
        db.from("user_calendar").select("title, start_at").eq("user_id", opts.userId).gte("start_at", since.slice(0, 10)),
      ]);
      if (ev.error) console.error("관심 신호 조회 실패:", ev.error.message);
      for (const r of ev.data ?? []) {
        events.push({ signal: r.signal, tags: r.tags ?? [], policyId: r.policy_id, weight: r.weight, occurredAt: r.occurred_at, expiresAt: r.expires_at });
      }
      events.push(...eventsFromTexts((cal.data ?? []).map((c) => ({ text: c.title, at: c.start_at })), "calendar", INTEREST_TAGS));
    } catch (e) {
      console.error("관심 컨텍스트 조회 실패:", e instanceof Error ? e.message : e);
      return EMPTY;
    }
  }

  const scores = scoreInterests(events, now);
  return { scores, topTags: topInterests(scores, 3), ...demotedPolicies(events, now) };
}
