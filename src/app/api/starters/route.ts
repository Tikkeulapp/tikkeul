import { NextResponse } from "next/server";
import { loadStarters } from "@/services/interests";

/**
 * GET /api/starters?userId&personaId|profileId — 검색바 추천 질문 (카나나 관심사 선톡에서 "무엇을 물을지"만 가져옴)
 * 질문은 Groq가 식별정보 없는 프로필 보고서를 보고 생성 → 코드가 검증(주제 이탈·숫자·다중 주제·중복)
 * → 모자라면 규칙 템플릿. 클라이언트가 하루 단위로 캐시해 사용자당 생성은 보통 하루 1회.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  const { questions, generated } = await loadStarters({
    userId,
    personaId: url.searchParams.get("personaId"),
    profileId: url.searchParams.get("profileId"),
  });
  return NextResponse.json({ questions: questions.map((q) => ({ id: q.id, question: q.question })), generated });
}
