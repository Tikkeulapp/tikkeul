import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import { derive } from "@/lib/derive";
import { supabaseAdmin } from "@/lib/supabase";
import { groqJson } from "@/lib/groq";

type Verdict = {
  score: number;
  eligibility: "LIKELY" | "NEEDS_CHECK" | "UNLIKELY";
  reasons: string[];
  missing_information: string[];
  evidence_todo: string[];
};

const SYSTEM = `당신은 한국 청년·취업준비생 정책의 자격 판정 어시스턴트입니다.

규칙 (반드시 지킬 것):
1. 제공된 사용자 정보와 정책 정보만 사용한다. 세상 지식으로 정책 조건을 지어내지 않는다.
2. 모르는 조건은 절대 추측하지 않는다 — 확인이 필요하면 eligibility를 NEEDS_CHECK로 하고 missing_information에 "무엇을 어떻게 확인할지"를 적는다.
3. 사용자 정보의 null은 "모름"이라는 뜻이다. null인 조건이 판정에 필요하면 missing_information에 넣는다.
4. 명백히 미충족인 조건(나이 초과, 타지역 거주 등)이 있으면 UNLIKELY로 하고 그 이유를 reasons에 적는다.
5. '미취업' 요건 판정 시: 아르바이트 등 단기 근로소득이 있어도 취업상태가 미취업이면 미취업으로 본다 (정책이 근로시간 제한을 명시한 경우에만 확인 필요로 처리).
6. evidence_todo에는 신청에 대비해 미리 챙길 증빙(면접확인서, 영수증 등)을 적는다. 없으면 빈 배열.
7. 반드시 JSON 하나만 출력한다:
{"score": 0~100 정수, "eligibility": "LIKELY"|"NEEDS_CHECK"|"UNLIKELY", "reasons": ["..."], "missing_information": ["..."], "evidence_todo": ["..."]}
- score: 이 사용자에게 이 정책이 얼마나 유의미한지 (자격 + 상황 관련성 종합)
- reasons: 한국어 존댓말, 각 1문장`;

export async function POST(request: Request) {
  let body: {
    personaId?: string | null;
    profileId?: string | null;
    policy?: { title: string; benefit?: string; target?: string; content?: string; region?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { personaId, profileId, policy } = body;
  if (!policy?.title) {
    return NextResponse.json({ error: "policy 정보가 필요합니다" }, { status: 400 });
  }

  // ── 사용자 프로필 구성: 페르소나(코드) 또는 직접입력 사용자(DB) ──
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
  } else if (profileId) {
    const db = supabaseAdmin();
    const [{ data: survey }, { data: fin }] = await Promise.all([
      db.from("profile_survey").select("*").eq("id", profileId).single(),
      db.from("finance").select("*").eq("user_id", profileId).single(),
    ]);
    if (!survey) return NextResponse.json({ error: "프로필을 찾을 수 없습니다" }, { status: 404 });
    // 식별정보(id·이름·생성시각)는 LLM에 보내지 않는다 — 판정에 필요한 속성만 전달
    const { id: _id, name: _name, created_at: _c, ...surveyAttrs } = survey as Record<string, unknown>;
    void _id; void _name; void _c;
    const { user_id: _u, ...finAttrs } = (fin ?? {}) as Record<string, unknown>;
    void _u;
    userProfile = { 출처: "설문 + 직접 입력 금융정보", 설문: surveyAttrs, 금융: finAttrs };
  } else {
    return NextResponse.json({ error: "personaId 또는 profileId가 필요합니다" }, { status: 400 });
  }

  const user = `[오늘 날짜] ${new Date().toISOString().slice(0, 10)}

[사용자 정보]
${JSON.stringify(userProfile, null, 1)}

[정책 정보]
${JSON.stringify(policy, null, 1)}

이 사용자가 이 정책의 대상인지 판정하고 규칙대로 JSON만 출력하세요.`;

  try {
    const verdict = await groqJson<Verdict>(SYSTEM, user);
    return NextResponse.json({ verdict, disclaimer: "AI의 1차 판정입니다. 최종 자격은 공식 기관에서 확인하세요." });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "판정 실패" },
      { status: 502 },
    );
  }
}
