/**
 * 관심 신호 기록·조회 (I/O 전용). 점수 계산은 src/lib/interest.ts, 다운랭크는 src/lib/rank.ts,
 * 질문 선별은 src/lib/starters.ts.
 * 개인화는 부가기능이다 — 여기 실패(테이블 미생성 등)는 로그만 남기고 본 기능을 막지 않는다.
 */
import { supabaseAdmin } from "@/services/supabase";
import { llmJson } from "@/services/llm";
import { resolveProfile } from "@/services/profile";
import { getPersona } from "@/data/personas";
import { INTEREST_SOURCE_LABEL, INTEREST_TAGS } from "@/data/interests";
import { DEFAULT_STARTER_IDS, STARTER_TEMPLATES } from "@/data/starters";
import { derive } from "@/lib/derive";
import { normalizeSido } from "@/lib/region";
import { chatInterestEvents, eventsFromTexts, explainInterests, matchTags, scoreInterests, shouldExtractInterests, topInterests } from "@/lib/interest";
import { demotedPolicies } from "@/lib/rank";
import { blockedStarterIds, blockedStarterTags, buildProfileReport, buildStarters, filterGeneratedStarters, profileStarterSignals, upcomingEventTags, weeklyProactive } from "@/lib/starters";
import type { InterestEvent, InterestSignal, StarterPick, StarterTemplate } from "@/types/interest";

const LOOKBACK_DAYS = 180;

async function insertEvents(rows: Record<string, unknown>[], what: string): Promise<void> {
  if (!rows.length) return;
  try {
    const { error } = await supabaseAdmin().from("user_interest_events").insert(rows);
    if (error) console.error(`${what} 기록 실패:`, error.message);
  } catch (e) {
    console.error(`${what} 기록 실패:`, e instanceof Error ? e.message : e);
  }
}

/** 정책 단위 신호(담기·빼기·열람) 기록. text가 없으면 policies에서 제목·요약을 읽어 태그를 붙인다. */
export async function recordPolicySignal(opts: {
  userId: string;
  policyId: string;
  signal: Extract<InterestSignal, "save" | "remove" | "view">;
  text?: string | null;
}): Promise<void> {
  let text = opts.text ?? null;
  if (!text) {
    try {
      const { data } = await supabaseAdmin().from("policies").select("title, search_text").eq("policy_id", opts.policyId).maybeSingle();
      text = data ? `${data.title} ${(data.search_text ?? "").slice(0, 300)}` : null;
    } catch { /* 태그 없이 기록 */ }
  }
  await insertEvents([{ user_id: opts.userId, signal: opts.signal, policy_id: opts.policyId, tags: matchTags(text, INTEREST_TAGS) }], `관심 신호(${opts.signal})`);
}

/** 추천 노출 기록 — "여러 번 보여줬는데 반응 없음" 다운랭크용. */
export async function recordImpressions(userId: string, policyIds: string[]): Promise<void> {
  await insertEvents(policyIds.map((policy_id) => ({ user_id: userId, signal: "impression", policy_id, tags: [] })), "노출");
}

/** 선톡 id → 태그. LLM 생성 질문은 "gen:<태그>" 형태. */
export function starterTag(starterId: string): string | null {
  if (starterId.startsWith("gen:")) {
    const tag = starterId.slice(4);
    return INTEREST_TAGS.some((t) => t.id === tag) ? tag : null;
  }
  return STARTER_TEMPLATES.find((t) => t.id === starterId)?.tag ?? null;
}

/** 선톡 노출·응답 기록. */
export async function recordStarterSignal(userId: string, starterId: string, signal: Extract<InterestSignal, "starter_shown" | "starter_yes" | "starter_no">): Promise<void> {
  const tag = starterTag(starterId);
  await insertEvents([{ user_id: userId, signal, starter_id: starterId, tags: tag ? [tag] : [] }], `선톡(${signal})`);
}

/** "티끌이 이해한 나" 카드의 "아니에요" — 해당 태그를 강하게 내린다. */
export async function rejectInterest(userId: string, tag: string): Promise<boolean> {
  if (!INTEREST_TAGS.some((t) => t.id === tag)) return false;
  await insertEvents([{ user_id: userId, signal: "reject", tags: [tag] }], "관심사 거절");
  return true;
}

const CHAT_INTEREST_SYSTEM = `사용자 발화에서 "사용자 본인의 관심사"로 직접 드러난 것만 아래 [태그 목록]에서 골라 JSON 하나로 출력하세요.
{"interests": [{"tag": "목록의 id 그대로", "strength": "strong" | "weak", "persistence": "persistent" | "temporary"}]}
규칙:
- 목록에 없는 태그 금지. 최대 3개. 해당 없으면 {"interests": []}.
- 발화에 명시된 것만. 가족 구성·성별·나이·건강·직업 같은 신상을 추측하지 마세요 (예: "아이 등원"에서 "부모"를 추론하지 않음).
- 다른 사람을 위한 것(선물, 친구 부탁)이나 단순한 용어 질문("~가 뭐야?")은 weak.
- 본인의 준비·계획·고민·부담 표현("준비 중", "받고 싶어", "부담돼")은 strong.
- 이번 한 번의 일(이번 주 면접 교통비)은 temporary, 지속되는 상태(자격증 공부 중, 월세 살아)는 persistent.`;

/** 채팅 발화 → 관심 태그 (PANDA-lite). 규칙 필터를 통과한 발화만 LLM을 부른다. userId는 LLM에 보내지 않는다. */
export async function recordChatInterests(userId: string, message: string): Promise<void> {
  if (!shouldExtractInterests(message, INTEREST_TAGS)) return;
  try {
    const tagList = INTEREST_TAGS.map((t) => `${t.id} (${t.label})`).join("\n");
    const raw = await llmJson<unknown>(CHAT_INTEREST_SYSTEM, `[태그 목록]\n${tagList}\n\n[발화]\n${message.trim().slice(0, 500)}`, 400);
    const events = chatInterestEvents(raw, new Date(), INTEREST_TAGS.map((t) => t.id));
    await insertEvents(
      events.map((e) => ({ user_id: userId, signal: "chat", tags: e.tags, weight: e.weight, expires_at: e.expiresAt ?? null })),
      "대화 관심",
    );
  } catch (e) {
    console.error("대화 관심 추출 실패:", e instanceof Error ? e.message : e);
  }
}

export type InterestContext = {
  events: InterestEvent[];
  calendar: { title: string; start_at: string }[];
  scores: Record<string, number>;
  topTags: string[];
  removed: Set<string>;
  stale: Set<string>;
};

/** 저장된 신호 + 캘린더 일정 + (페르소나) 마이데이터 취준 지출 → 관심 점수·다운랭크 대상. */
export async function loadInterestContext(opts: { userId?: string | null; personaId?: string | null }): Promise<InterestContext> {
  const now = new Date();
  const events: InterestEvent[] = [];
  let calendar: { title: string; start_at: string }[] = [];

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
        db.from("user_interest_events").select("signal, tags, policy_id, starter_id, weight, occurred_at, expires_at").eq("user_id", opts.userId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(1000),
        db.from("user_calendar").select("title, start_at").eq("user_id", opts.userId).gte("start_at", since.slice(0, 10)),
      ]);
      if (ev.error) console.error("관심 신호 조회 실패:", ev.error.message);
      for (const r of ev.data ?? []) {
        events.push({ signal: r.signal, tags: r.tags ?? [], policyId: r.policy_id, starterId: r.starter_id, weight: r.weight, occurredAt: r.occurred_at, expiresAt: r.expires_at });
      }
      calendar = cal.data ?? [];
      events.push(...eventsFromTexts(calendar.map((c) => ({ text: c.title, at: c.start_at })), "calendar", INTEREST_TAGS));
    } catch (e) {
      console.error("관심 컨텍스트 조회 실패:", e instanceof Error ? e.message : e);
    }
  }

  const scores = scoreInterests(events, now);
  return { events, calendar, scores, topTags: topInterests(scores, 3), ...demotedPolicies(events, now) };
}

const GEN_SYSTEM = `당신은 청년 취업준비생에게 지원정책을 안내하는 서비스 "티끌"의 질문 추천기입니다.
[사용자 프로필 보고서]를 보고, 이 사용자가 지금 궁금해할 만한 청년 지원정책 질문 4개를 JSON 하나로 출력하세요:
{"starters": [{"tag": "[태그 목록]의 id 또는 null", "question": "사용자가 챗봇에게 보낼 질문", "opener": "AI가 먼저 말을 거는 문장"}]}
규칙:
- question: 반말 구어체 한 문장, 40자 이내, 물음표나 "~알려줘"로 끝. 예: "면접 보러 갈 때 교통비 지원받을 수 있어?"
- opener: 존댓말 1~2문장, 70자 이내, "~볼까요?"처럼 물음표로 끝. 예: "면접 보러 다니는 교통비도 지원받을 수 있어요. 찾아볼까요?"
- 청년·취업준비생 지원정책(수당·바우처·훈련·상담·주거·교통·대출·저축 등)에 관한 질문만. 잡담·일반 상식 금지.
- 질문 하나에 주제 하나. 연도·날짜·금액·나이 숫자를 넣지 마세요.
- 보고서에 없는 사실을 단정하거나 사용자의 행동을 구체적으로 말하지 마세요 ("지난주 결제하신~" 금지). 특정 기업·상품 홍보 금지.
- 다가오는 일정과 관심사에 맞는 질문을 우선하고, 4개는 서로 다른 태그로. [피할 주제]의 태그는 쓰지 마세요.`;

const GEN_TIMEOUT_MS = 8000;

/** 프로필 보고서 → Groq가 청년정책 질문 생성 → 코드가 검증·중복 제거. 실패하면 빈 배열(템플릿으로 채움). */
async function generateStarters(report: ReturnType<typeof buildProfileReport>, avoidTags: string[]): Promise<StarterTemplate[]> {
  try {
    const tagList = INTEREST_TAGS.map((t) => `${t.id} (${t.label})`).join("\n");
    const user = `[태그 목록]\n${tagList}\n\n[피할 주제]\n${avoidTags.join(", ") || "없음"}\n\n[사용자 프로필 보고서]\n${JSON.stringify(report)}`;
    const raw = await Promise.race([
      llmJson<unknown>(GEN_SYSTEM, user, 900, { purpose: "task" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), GEN_TIMEOUT_MS)),
    ]);
    return filterGeneratedStarters(raw, INTEREST_TAGS.map((t) => t.id), avoidTags, 4);
  } catch (e) {
    console.error("선톡 질문 생성 실패 — 템플릿 사용:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** 검색바 추천 질문 + 이번 주 선톡. 새 선톡이면 노출을 기록해 같은 주에는 같은 것을 유지한다.
 * 질문은 LLM이 프로필 보고서를 보고 생성(Generate) → 코드가 검증(Filter), 모자라면 규칙 템플릿으로 채운다. */
export async function loadStarters(opts: { userId: string; personaId?: string | null; profileId?: string | null }): Promise<{
  questions: StarterPick[];
  proactive: StarterTemplate | null;
  generated: boolean;
}> {
  const now = new Date();
  const [ctx, prof] = await Promise.all([
    loadInterestContext({ userId: opts.userId, personaId: opts.personaId }),
    resolveProfile(opts).catch(() => null),
  ]);
  const summary = (prof?.summary ?? {}) as Record<string, unknown>;
  const row = (prof?.profileRow ?? {}) as Record<string, unknown>;
  const persona = opts.personaId ? getPersona(opts.personaId) : undefined;
  // DB 조회가 실패해도 페르소나는 코드에 선언값이 있으니 그걸로 대신한다
  const housing = (row.housing_type as string | undefined) ?? persona?.declared.household.housing ?? null;
  const employment = (row.employment_status as string | undefined) ?? (summary["취업상태"] as string | undefined) ?? persona?.declared.employmentStatus ?? null;
  const benefits = (summary["수급중수당"] as string[] | undefined) ?? (persona ? derive(persona.mydata).benefits.map((b) => b.name) : []);
  const upcomingTags = upcomingEventTags(ctx.calendar, now, INTEREST_TAGS);
  const avoidTags = [...blockedStarterTags(ctx.events, now)];

  const report = buildProfileReport({
    age: prof?.age ?? null,
    sido: prof?.sido ?? (persona ? normalizeSido(persona.declared.region.sido) : null),
    employment,
    housing,
    benefits,
    interests: explainInterests(ctx.events, now, INTEREST_TAGS, 4).map((x) => ({
      label: x.label,
      sources: x.sources.map((s) => INTEREST_SOURCE_LABEL[s]).filter((s): s is string => !!s),
    })),
    upcoming: upcomingTags.map((t) => INTEREST_TAGS.find((x) => x.id === t)?.label ?? t),
  });
  const generated = await generateStarters(report, avoidTags);

  const templatePicks = buildStarters(
    { upcomingTags, topTags: ctx.topTags, ...profileStarterSignals({ housing, employment, benefits }), blockedIds: [...blockedStarterIds(ctx.events, now)] },
    STARTER_TEMPLATES,
    DEFAULT_STARTER_IDS,
    4,
  );
  // 생성 질문 먼저, 같은 태그의 템플릿은 빼고 나머지로 채운다
  const genTags = new Set(generated.map((g) => g.tag).filter(Boolean));
  const picks: StarterPick[] = [
    ...generated.map((g): StarterPick => ({ ...g, reason: g.tag && upcomingTags.includes(g.tag) ? "event" : "interest" })),
    ...templatePicks.filter((t) => !t.tag || !genTags.has(t.tag)),
  ].slice(0, 4);

  const weekly = weeklyProactive(picks, ctx.events, now, STARTER_TEMPLATES);
  if (weekly?.isNew) await recordStarterSignal(opts.userId, weekly.template.id, "starter_shown");
  // 선톡으로 띄운 질문은 칩에서 빼서 같은 질문이 두 번 보이지 않게
  const questions = picks.filter((p) => p.id !== weekly?.template.id).slice(0, 3);
  return { questions, proactive: weekly?.template ?? null, generated: generated.length > 0 };
}
