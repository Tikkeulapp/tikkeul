import { NextResponse } from "next/server";
import { loadInterestContext } from "@/services/interests";
import { preferredCompanyType } from "@/lib/jobInterest";

/**
 * GET /api/interests?userId&personaId — 관심 신호에서 도출한 기본값 제안.
 * suggestedCompanyType: 채용에서 공공기관 공고 선호가 뚜렷하면 취업 후 시뮬레이션 기업구분 기본값으로 공기업을 제안.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  const ctx = await loadInterestContext({ userId, personaId: url.searchParams.get("personaId") });
  return NextResponse.json({ suggestedCompanyType: preferredCompanyType(ctx.jobScores) });
}
