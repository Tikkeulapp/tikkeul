import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/signup — 사용자가 직접 입력한 정보로 시작.
 * profile_survey(설문) + users(계정) + finance(설문 복사 피처) 3개 테이블에 저장.
 * 마이데이터 미연동 상태이므로 RAW 도출 피처는 전부 NULL → "추가 확인 필요"로 다뤄진다.
 */
export async function POST(request: Request) {
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const name = String(b.name ?? "").trim();
  const birthDate = String(b.birthDate ?? "");
  const sido = String(b.sido ?? "").trim();
  const sigungu = String(b.sigungu ?? "").trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !sido) {
    return NextResponse.json(
      { error: "이름, 생년월일, 거주지(시도)는 필수입니다" },
      { status: 400 },
    );
  }

  const profileId = `u_${crypto.randomUUID().slice(0, 8)}`;
  const db = supabaseAdmin();

  // 1) 설문 저장
  const survey = {
    id: profileId,
    name,
    birth_date: birthDate,
    gender: (b.gender as string) || null,
    military_served: b.military === "군필" ? true : b.military === "미필" ? false : null,
    region_sido: sido,
    region_sigungu: sigungu || null,
    education_status: (b.education as string) || null,
    target_job: String(b.targetJob ?? "").trim() || null,
    living_with_parents:
      b.household === "부모님과 거주" ? true : b.household === "1인 가구" ? false : null,
    housing_type: (b.housingType as string) || null,
    income_bracket: b.incomeBracket === "모름" ? null : (b.incomeBracket as string) || null,
  };
  const surveyRes = await db.from("profile_survey").insert(survey);
  if (surveyRes.error) {
    return NextResponse.json({ error: surveyRes.error.message }, { status: 500 });
  }

  // 2) 계정 생성
  const { data: user, error: userErr } = await db
    .from("users")
    .insert({ kind: "member", persona_id: profileId, nickname: name })
    .select("user_id")
    .single();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  // 3) FINANCE — 설문 복사 + 직접 입력한 금융 정보
  //    (실서비스에서는 마이데이터 RAW에서 derive가 계산하는 항목들을 데모에서는 직접 입력으로 대체)
  const man = (v: unknown): number | null => {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n) * 10000 : null;
  };
  const monthlyIncome = man(b.monthlyIncomeMan);
  const benefitMonthly = man(b.benefitMonthlyMan);
  const benefitName = String(b.benefitName ?? "없음");
  const loanBalance = man(b.loanBalanceMan);
  const finRes = await db.from("finance").insert({
    user_id: profileId,
    as_of: new Date().toISOString().slice(0, 10),
    income_bracket: survey.income_bracket,
    monthly_work_income_krw: monthlyIncome,
    annualized_income_krw: monthlyIncome !== null ? monthlyIncome * 12 : null,
    financial_assets_krw: man(b.assetsMan),
    monthly_rent_krw: man(b.monthlyRentMan),
    receiving_benefits:
      benefitName !== "없음"
        ? [{ name: benefitName, monthly_krw: benefitMonthly, source: "직접 입력" }]
        : [],
    loans_by_type: loanBalance !== null ? { 미상: loanBalance } : {},
  });
  if (finRes.error) {
    console.error("finance insert 실패:", finRes.error.message);
  }

  return NextResponse.json({ userId: user.user_id, profileId, name });
}
