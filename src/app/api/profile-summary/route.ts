import { NextResponse } from "next/server";
import { resolveProfile } from "@/lib/profile";

/**
 * GET /api/profile-summary — 대시보드 우측 프로필 카드용 요약.
 * 페르소나는 클라이언트가 data/personas.ts를 직접 들고 있어 필요 없지만, "내 정보로 시작하기"
 * (직접입력) 사용자는 profile_survey가 DB에만 있어 이걸로 가져와야 한다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const personaId = url.searchParams.get("personaId");
  const profileId = url.searchParams.get("profileId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });

  const profile = await resolveProfile({ userId, personaId, profileId });
  const row = profile.profileRow ?? {};
  return NextResponse.json({
    name: (row.name as string | undefined) ?? null,
    age: profile.age,
    birthDate: (row.birth_date as string | undefined) ?? null,
    sido: profile.sido,
    sigungu: profile.sigungu,
    educationStatus: (row.education_status as string | undefined) ?? null,
    employmentStatus: (row.employment_status as string | undefined) ?? null,
    incomeBracket: (row.income_bracket as string | undefined) ?? null,
    assetBracket: (row.asset_bracket as string | undefined) ?? null,
    housingType: (row.housing_type as string | undefined) ?? null,
  });
}
