import { NextResponse } from "next/server";
import { loadStarters, recordStarterSignal } from "@/services/interests";
import { STARTER_TEMPLATES } from "@/data/starters";

/**
 * GET /api/starters?userId&personaId|profileId — 먼저 건네는 질문 (카나나 관심사 선톡-lite)
 * - questions: 검색바 추천 질문 칩 (다가오는 일정 → 관심사 → 프로필 → 기본 순)
 * - proactive: 이번 주 선톡 (주 1회, 답하면 그 주는 쉼, 4주 안에 보낸 주제는 다시 안 보냄)
 * 무엇을 물을지는 코드(src/lib/starters.ts)가 정하고 문장은 템플릿 — LLM 호출 없음.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  const { questions, proactive } = await loadStarters({
    userId,
    personaId: url.searchParams.get("personaId"),
    profileId: url.searchParams.get("profileId"),
  });
  return NextResponse.json({
    questions: questions.map((q) => ({ id: q.id, question: q.question })),
    proactive: proactive ? { id: proactive.id, opener: proactive.opener, question: proactive.question } : null,
  });
}

/** POST /api/starters — 선톡 응답 기록. body: {userId, starterId, answer: "yes"|"no"} */
export async function POST(request: Request) {
  let body: { userId?: string; starterId?: string; answer?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, starterId, answer } = body;
  if (!userId || !starterId || (answer !== "yes" && answer !== "no") || !STARTER_TEMPLATES.some((t) => t.id === starterId)) {
    return NextResponse.json({ error: "userId, starterId, answer(yes|no)가 필요합니다" }, { status: 400 });
  }
  await recordStarterSignal(userId, starterId, answer === "yes" ? "starter_yes" : "starter_no");
  return NextResponse.json({ ok: true });
}
