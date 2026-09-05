/**
 * POST /api/simulate — 취업 후 시뮬레이션
 * 입력: { personaId | profileId, userId, input: { companyType, annualSalaryKrw, goal, startMonth, monthlyCardSpendKrw? } }
 * 흐름: 프로필·마이데이터(카드·대출·계좌) 해석 → simulate() 결정론 계산 → 제도 규칙 판정 → LLM은 해설만
 */
import { NextResponse } from "next/server";
import { getPersona, type Loan } from "@/data/personas";
import { derive } from "@/lib/derive";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveProfile } from "@/lib/profile";
import { groqJson } from "@/lib/groq";
import { aggregateCards, simulate, COMPANY_TYPES, type SimInput, type SpendingProfile, type CompanyType } from "@/lib/simulate";
import { judgePrograms, type ProgramCtx } from "@/data/postjob_programs";
import { HOUSE_REGIONS, type HouseRegion } from "@/data/postjob_reference";

export const maxDuration = 60;

type Body = {
  personaId?: string | null;
  profileId?: string | null;
  userId?: string | null;
  input?: Partial<SimInput> & { monthlyCardSpendKrw?: number };
};

type AiComment = { summary: string; priorities: string[]; cautions: string[] };

const AI_SYSTEM = `너는 취업을 앞둔 청년의 재무 코치다. 제공된 계산 결과(JSON)를 바탕으로 한국어로 짧게 설명한다.
규칙:
1) 숫자(금액·금리·기간·비율)는 제공된 값만 인용한다. 새 숫자를 만들거나 계산하지 않는다.
2) 제도·정책은 제공된 목록 안에서만 언급한다. 목록에 없는 제도를 추천하지 않는다.
3) 단정 대신 "~로 보입니다" 톤. 최종 확인은 공식 기관에서 한다는 전제.
4) 소비 카테고리를 언급할 때는 제공된 카테고리명만 쓴다.
5) 반드시 JSON만 출력: {"summary": "3~4문장", "priorities": ["우선순위 1", "우선순위 2", "우선순위 3"], "cautions": ["주의 1", "주의 2"]}`;

const NON_VARIABLE_RE = /월세|통신비|보험료|구독|적금/;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const raw = body.input ?? {};
  const companyType = raw.companyType as CompanyType | undefined;
  if (!companyType || !COMPANY_TYPES.includes(companyType)) return NextResponse.json({ error: "기업구분이 필요합니다" }, { status: 400 });
  const annual = Number(raw.annualSalaryKrw);
  if (!isFinite(annual) || annual < 10_000_000 || annual > 1_000_000_000) return NextResponse.json({ error: "연봉은 1,000만~10억 원 사이로 입력하세요" }, { status: 400 });
  const goalType = raw.goal?.type;
  if (goalType !== "LUMP_SUM" && goalType !== "HOUSE" && goalType !== "MARRIAGE") return NextResponse.json({ error: "목적이 필요합니다" }, { status: 400 });
  const houseRegion = raw.goal?.houseRegion;
  if (goalType === "HOUSE" && (!houseRegion || !HOUSE_REGIONS.includes(houseRegion as HouseRegion))) return NextResponse.json({ error: "내집마련 지역을 선택하세요" }, { status: 400 });

  const input: SimInput = {
    companyType,
    annualSalaryKrw: Math.round(annual),
    goal: { type: goalType, targetKrw: raw.goal?.targetKrw ? Number(raw.goal.targetKrw) : undefined, houseRegion: houseRegion as HouseRegion | undefined },
    startMonth: raw.startMonth,
  };

  // ── 프로필 + 지출 구조 ──
  const prof = await resolveProfile({ userId: body.userId, personaId: body.personaId, profileId: body.profileId });
  let sp: SpendingProfile;
  let housing: ProgramCtx["housing"] = null;
  const notes: string[] = [];

  const p = body.personaId ? getPersona(body.personaId) : undefined;
  if (p) {
    const d = derive(p.mydata);
    const cards = aggregateCards(p.mydata.cardApprovals);
    // 계좌 기타 지출: 월세·고정비·적금·취준 지출을 제외한 일회성 출금의 월평균
    const jobPrepKeys = new Set(d.jobPrepSpending.map((t) => `${t.date}|${t.description}`));
    const outTxs = p.mydata.transactions.filter((t) => t.direction === "OUT");
    const months = new Set(outTxs.map((t) => t.date.slice(0, 7))).size || 1;
    const other = outTxs
      .filter((t) => !NON_VARIABLE_RE.test(t.description) && !jobPrepKeys.has(`${t.date}|${t.description}`))
      .reduce((s, t) => s + t.amountKrw, 0);
    sp = {
      source: "마이데이터",
      rentMonthlyKrw: d.rentMonthlyKrw ?? 0,
      fixedCosts: d.fixedCosts,
      loans: p.mydata.loans,
      cardByCategory: cards.cardByCategory,
      cardMonthlyKrw: cards.cardMonthlyKrw,
      otherVariableMonthlyKrw: Math.round(other / months),
      monthsObserved: cards.monthsObserved,
      liquidAssetsKrw: d.liquidAssetsKrw,
      savingsKrw: p.mydata.accounts.filter((a) => a.type === "적금" || a.type === "예금").reduce((s, a) => s + a.balanceKrw, 0),
    };
    housing = p.declared.household.housing;
    notes.push(`카드 승인내역 ${p.mydata.cardApprovals.length}건(${cards.monthsObserved}개월)·대출 ${p.mydata.loans.length}건·계좌 ${p.mydata.accounts.length}개를 마이데이터에서 읽었습니다`);
  } else if (body.profileId) {
    const db = supabaseAdmin();
    const [{ data: sv }, { data: fin }] = await Promise.all([
      db.from("profile_survey").select("housing_type").eq("id", body.profileId).maybeSingle(),
      db.from("finance").select("monthly_rent_krw, financial_assets_krw, loans_by_type").eq("user_id", body.profileId).maybeSingle(),
    ]);
    const loansByType = (fin?.loans_by_type ?? {}) as Record<string, number>;
    const loans: Loan[] = Object.entries(loansByType)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => {
        const type: Loan["type"] = k === "학자금" || k === "신용" || k === "전세" ? k : "기타";
        const rate = type === "학자금" ? 1.7 : type === "전세" ? 3.5 : 5.0; // 금리 미상 → 유형별 가정치
        return { loanId: `direct-${k}`, org: "직접 입력", type, balanceKrw: Number(v), interestRate: rate, monthlyPaymentKrw: Math.round(Number(v) / 60) };
      });
    if (loans.length) notes.push("대출 금리·상환액은 직접 입력에 없어 유형별 가정치(60개월 균등)로 계산했습니다");
    sp = {
      source: "직접 입력",
      rentMonthlyKrw: Number(fin?.monthly_rent_krw ?? 0),
      fixedCosts: [],
      loans,
      cardByCategory: [],
      cardMonthlyKrw: Math.max(0, Math.round(Number(raw.monthlyCardSpendKrw ?? 0))),
      otherVariableMonthlyKrw: 0,
      monthsObserved: 0,
      liquidAssetsKrw: Number(fin?.financial_assets_krw ?? 0),
      savingsKrw: 0,
    };
    housing = (sv?.housing_type as ProgramCtx["housing"]) ?? null;
  } else {
    return NextResponse.json({ error: "프로필 정보가 필요합니다 (페르소나 또는 직접 입력)" }, { status: 400 });
  }

  // ── 계산 (결정론) ──
  const result = simulate(input, sp, { age: prof.age });
  const programs = judgePrograms({
    age: prof.age,
    annualSalaryKrw: input.annualSalaryKrw,
    companyType,
    goal: goalType,
    housing,
    homeless: housing === "본가" ? null : housing ? true : null,
    loans: sp.loans.map((l) => ({ type: l.type, interestRate: l.interestRate })),
  });

  // ── LLM 해설 (실패해도 계산 결과는 그대로 반환) ──
  let ai: AiComment | null = null;
  let aiError: string | null = null;
  try {
    const man = (n: number) => {
      const m = Math.round(n / 10000);
      if (Math.abs(m) < 10000) return `${m.toLocaleString()}만 원`;
      const eok = Math.floor(m / 10000), rest = m % 10000;
      return rest ? `${eok}억 ${rest.toLocaleString()}만 원` : `${eok}억 원`;
    };
    const ym = (v: string | null) => (v ? `${v.slice(0, 4)}년 ${Number(v.slice(5, 7))}월` : "도달 불가");
    const adviceLabel = { PAY_FIRST: "상환 우선", SAVE_FIRST: "저축 병행", NONE: "대출 없음" }[result.debt.advice];
    const payload = {
      입력: { 기업구분: companyType, 연봉: man(input.annualSalaryKrw), 목표: result.goal.label, 목표금액: man(result.goal.targetKrw), 입사예정: ym(result.startMonth), 나이: prof.age, 주거형태: housing },
      세후월실수령: man(result.net.netMonthlyKrw),
      소득세감면적용: result.net.reliefApplied,
      월지출: { 월세: man(sp.rentMonthlyKrw), 고정지출_월세포함: man(result.spending.fixedKrw), 대출상환: man(result.spending.loanKrw), 변동소비: man(result.spending.variableKrw), 합계: man(result.spending.totalKrw) },
      소비상위카테고리: result.spending.topCategories.map((c) => `${c.category} ${man(c.monthlyKrw)}(${c.pct}%)`),
      월여유자금: man(result.surplusMonthlyKrw),
      시나리오: result.scenarios.map((s) => ({ 이름: s.key, 월저축: man(s.savingsMonthlyKrw), 도달시점: ym(s.goalMonth), 소요개월: s.monthsToGoal })),
      대출: { 판정: adviceLabel, 잔액: man(result.debt.totalKrw), 월상환: man(result.debt.monthlyKrw), 이유: result.debt.reason },
      경고: result.warnings,
      열리는제도: [...programs.likely, ...programs.needsCheck].map((x) => ({ 이름: x.name, 판정: x.status, 이유: x.reason })),
    };
    ai = await groqJson<AiComment>(AI_SYSTEM, JSON.stringify(payload), 1200);
    if (!ai || typeof ai.summary !== "string") ai = null;
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    input,
    profile: { age: prof.age, housing, source: sp.source, region: prof.sido },
    spending: sp,
    result,
    programs,
    ai,
    aiError,
    notes,
    disclaimer: "간이 계산·참고값 기준의 시뮬레이션입니다. 세금은 연말정산 결과와, 제도 요건은 각 기관 공고와 다를 수 있습니다.",
  });
}
