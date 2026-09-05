import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import { derive } from "@/lib/derive";
import { supabaseAdmin } from "@/lib/supabase";
import { judgePolicy, saveMatchResult } from "@/lib/policyMatch";

export async function POST(request: Request) {
  let body: {
    userId?: string | null;
    personaId?: string | null;
    profileId?: string | null;
    policyId?: string | null;
    policy?: { title: string; benefit?: string; target?: string; content?: string; region?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, personaId, profileId, policyId, policy } = body;
  if (!policy?.title) {
    return NextResponse.json({ error: "policy 정보가 필요합니다" }, { status: 400 });
  }

  // ── 사용자 프로필 구성: 페르소나(코드) 또는 직접입력 사용자(DB) ──
  // profileRow/financeRow는 규칙엔진(judgePolicy)용 원본 데이터, userProfile은 폴백 LLM 판정용 한국어 요약.
  let userProfile: Record<string, unknown>;
  let profileRow: Record<string, unknown> | null = null;
  let financeRow: Record<string, unknown> | null = null;
  const db = supabaseAdmin();

  if (personaId) {
    const p = getPersona(personaId);
    if (!p) return NextResponse.json({ error: "알 수 없는 페르소나" }, { status: 400 });
    const d = derive(p.mydata);
    userProfile = {
      출처: "설문 + 마이데이터 도출",
      생년월일: p.declared.birthDate,
      성별: p.declared.gender,
      병역: p.declared.military,
      거주지: `${p.declared.region.sido} ${p.declared.region.sigungu}`,
      거주시작일: p.declared.region.since,
      학력: p.declared.education,
      취업상태: p.declared.employmentStatus,
      목표직무: p.declared.targetJob,
      가구: p.declared.household,
      가구중위소득구간: p.declared.incomeBracket,
      가구재산구간: p.declared.assetBracket,
      과거수급이력: p.declared.benefitHistory,
      보유자격증: p.declared.certificates,
      마이데이터_도출: {
        월평균근로소득: d.incomes.find((i) => i.kind === "WORK")?.avgMonthlyKrw ?? null,
        정기근로소득없음_미취업추정: d.noRegularWorkIncome,
        월세이체액: d.rentMonthlyKrw,
        유동자산: d.liquidAssetsKrw,
        수급중수당: d.benefits,
        최근취준지출: d.jobPrepSpending.slice(0, 5),
      },
    };
    // 페르소나도 scripts/seed.mts로 profile_survey/finance에 시드돼 있으므로 규칙엔진용 원본을 조회.
    // (아직 시드 전이거나 실패했어도 null로 넘어가 규칙엔진이 insufficient_info로 처리하므로 안전)
    const [{ data: survey }, { data: fin }] = await Promise.all([
      db.from("profile_survey").select("*").eq("id", personaId).maybeSingle(),
      db.from("finance").select("*").eq("user_id", personaId).maybeSingle(),
    ]);
    profileRow = survey ?? null;
    financeRow = fin ?? null;
  } else if (profileId) {
    const [{ data: survey }, { data: fin }] = await Promise.all([
      db.from("profile_survey").select("*").eq("id", profileId).single(),
      db.from("finance").select("*").eq("user_id", profileId).single(),
    ]);
    if (!survey) return NextResponse.json({ error: "프로필을 찾을 수 없습니다" }, { status: 404 });
    // 식별정보(id·이름·생성시각)는 LLM에 보내지 않는다 — 판정에 필요한 속성만 전달.
    // profileRow/financeRow(규칙엔진용)는 원본 그대로 둔다 — 규칙엔진은 id/name을 쓰지 않고,
    // LLM에는 애초에 profileRow 자체가 아니라 이 값에서 뽑은 checks 배열만 전달되기 때문.
    const { id: _id, name: _name, created_at: _c, ...surveyAttrs } = survey as Record<string, unknown>;
    void _id; void _name; void _c;
    const { user_id: _u, ...finAttrs } = (fin ?? {}) as Record<string, unknown>;
    void _u;
    userProfile = { 출처: "설문 + 직접 입력 금융정보", 설문: surveyAttrs, 금융: finAttrs };
    profileRow = survey;
    financeRow = fin ?? null;
  } else {
    return NextResponse.json({ error: "personaId 또는 profileId가 필요합니다" }, { status: 400 });
  }

  try {
    const verdict = await judgePolicy({
      profileSummary: userProfile,
      profileRow,
      financeRow,
      policyId: policyId ?? null,
      policy,
    });
    // userId+policyId가 둘 다 있을 때만 저장 (policyId 없으면 policies에 없는 데모 정책이라
    // 저장할 방법이 없음 — saveMatchResult 내부에서도 FK 실패는 로그만 남기고 넘어감)
    if (userId && policyId) {
      await saveMatchResult({ userId, policyId, matchMode: "lookup_and_check", verdict });
    }
    return NextResponse.json({ verdict, disclaimer: "AI의 1차 판정입니다. 최종 자격은 공식 기관에서 확인하세요." });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "판정 실패" },
      { status: 502 },
    );
  }
}
