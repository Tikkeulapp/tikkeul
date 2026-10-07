import { NextResponse } from "next/server";
import { loadInterestContext, rejectInterest } from "@/services/interests";
import { INTEREST_PARENT_LABEL, INTEREST_SOURCE_LABEL, INTEREST_TAGS } from "@/data/interests";
import { explainInterests, rollupParents, summarizeInterests, topInterests } from "@/lib/interest";

/**
 * GET /api/interests?userId&personaId — "티끌이 이해한 나" 카드 (Persona-lite + 투명성).
 * 관심사와 근거를 보여주되 근거는 신호 종류(담은 정책·캘린더 일정·취준 지출·대화)까지만 —
 * 날짜·결제 내역·검색어 같은 구체 정보는 내보내지 않는다. 머리 문장도 넓은 범주(부모 태그)로 말한다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  const ctx = await loadInterestContext({ userId, personaId: url.searchParams.get("personaId") });
  const now = new Date();
  const items = explainInterests(ctx.events, now, INTEREST_TAGS, 4).map((x) => ({
    tag: x.tag,
    label: x.label,
    sources: x.sources.map((s) => INTEREST_SOURCE_LABEL[s]).filter((s): s is string => !!s).slice(0, 2),
  }));
  const parents = topInterests(rollupParents(ctx.scores), 2).map((p) => INTEREST_PARENT_LABEL[p] ?? p);
  return NextResponse.json({ summary: summarizeInterests(parents), items });
}

/** POST /api/interests — "아니에요": 해당 관심 태그를 내린다. body: {userId, tag} */
export async function POST(request: Request) {
  let body: { userId?: string; tag?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  if (!body.userId || !body.tag) return NextResponse.json({ error: "userId, tag가 필요합니다" }, { status: 400 });
  const ok = await rejectInterest(body.userId, body.tag);
  if (!ok) return NextResponse.json({ error: "알 수 없는 관심 태그" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
