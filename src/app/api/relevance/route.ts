import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import { derive } from "@/lib/derive";
import { resolveProfile } from "@/lib/profile";
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
  // resolveProfile()을 반드시 거쳐야 한다 — 예전엔 profile_survey/finance를 직접 조회해서
  // 채팅·프로필 카드로 저장한 profile_changes 오버레이(예: income_bracket)가 전혀 반영이 안 됐고,
  // 그 결과 "채팅에서는 자격 충족인데 상세보기 AI 판정은 소득 정보 없음"이라는 불일치가 실제로
  // 있었다(직접 확인함). /api/chat과 똑같이 resolveProfile을 써서 항상 같은 값을 보게 한다.
  if (!personaId && !profileId) {
    return NextResponse.json({ error: "personaId 또는 profileId가 필요합니다" }, { status: 400 });
  }
  const resolved = await resolveProfile({ userId, personaId, profileId });
  const profileRow = resolved.profileRow;
  const financeRow = resolved.financeRow;

  let userProfile: Record<string, unknown>;
  if (personaId) {
    const p = getPersona(personaId);
    if (!p) return NextResponse.json({ error: "알 수 없는 페르소나" }, { status: 400 });
    const d = derive(p.mydata);
    userProfile = {
      출처: "설문 + 마이데이터 도출",
      생년월일: p.declared.birthDate,
      성별: p.declared.gender,
      병역: p.declared.military,
      거주지: `${resolved.sido ?? p.declared.region.sido} ${resolved.sigungu ?? p.declared.region.sigungu}`,
      거주시작일: p.declared.region.since,
      학력: profileRow?.education_status ?? p.declared.education.status,
      취업상태: profileRow?.employment_status ?? p.declared.employmentStatus,
      목표직무: p.declared.targetJob,
      가구: p.declared.household,
      가구중위소득구간: profileRow?.income_bracket ?? p.declared.incomeBracket,
      가구재산구간: profileRow?.asset_bracket ?? p.declared.assetBracket,
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
      // 판정 LLM이 "응시료 결제 = 해당 시험 응시"를 매번 스스로 추론하게 두면 같은 사용자·같은 정책에서
      // 판정이 흔들린다(실제로 신청 가능성 높음 ↔ 미충족이 오갔음). 결제내역에서 응시 사실을 코드로 뽑아
      // 확정 사실로 넘긴다 — "숫자·사실은 코드가, 해설은 AI가" 원칙.
      자격시험_응시이력: d.jobPrepSpending
        .filter((t) => /응시료|시험/.test(t.description))
        .map((t) => `${t.date} ${t.description.replace(/\s*응시료.*$/, "")} 응시 (응시료 ${t.amountKrw.toLocaleString("ko-KR")}원 결제, 마이데이터 확정)`),
      자격시험_응시여부: d.jobPrepSpending.some((t) => /응시료|시험/.test(t.description)) ? "있음 (2025년 이후 응시료 결제내역 존재)" : "결제내역상 확인되지 않음",
    };
  } else {
    if (!profileRow) return NextResponse.json({ error: "프로필을 찾을 수 없습니다" }, { status: 404 });
    // 식별정보(id·이름·생성시각)는 LLM에 보내지 않는다 — 판정에 필요한 속성만 전달.
    const { id: _id, name: _name, created_at: _c, ...surveyAttrs } = profileRow;
    void _id; void _name; void _c;
    const { user_id: _u, ...finAttrs } = (financeRow ?? {}) as Record<string, unknown>;
    void _u;
    userProfile = { 출처: "설문 + 직접 입력 금융정보", 설문: surveyAttrs, 금융: finAttrs };
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
