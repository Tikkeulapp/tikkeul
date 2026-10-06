/**
 * POST /api/simulate — 취업 후 시뮬레이션
 * 입력: { personaId | profileId, userId, input: { companyType, annualSalaryKrw, goals[], startMonth, monthlyCardSpendKrw? } }
 * 흐름: 프로필·마이데이터(카드·대출·계좌) 해석 → simulate() 결정론 계산 → 제도 규칙 판정 → LLM은 해설만
 */
import { NextResponse } from "next/server";
import { getPersona } from "@/data/personas";
import type { Loan } from "@/types/persona";
import { derive } from "@/lib/derive";
import { supabaseAdmin } from "@/services/supabase";
import { resolveProfile } from "@/services/profile";
import { groqJson } from "@/services/groq";
import {
  aggregateCards,
  simulate,
  COMPANY_TYPES,
  GOAL_TYPES,
} from "@/lib/simulate";
import type { CompanyType, GoalSpec, GoalType, SimInput, SpendingProfile } from "@/types/simulate";
import { judgePrograms, type ProgramCtx } from "@/data/postjob_programs";
import { HOUSE_REGIONS, type HouseRegion } from "@/data/postjob_reference";

export const maxDuration = 60;

type Body = {
  personaId?: string | null;
  profileId?: string | null;
  userId?: string | null;
  input?: Partial<Omit<SimInput, "goals">> & { goals?: Partial<GoalSpec>[]; monthlyCardSpendKrw?: number };
};

type AiComment = { summary: string; priorities: string[]; cautions: string[] };

const AI_SYSTEM = `너는 취업을 앞둔 청년의 재무 코치다. 제공된 계산 결과(JSON)를 바탕으로 한국어로 짧게 설명한다.
규칙:
1) 숫자(금액·금리·기간·비율)는 제공된 값만 인용한다. 새 숫자를 만들거나 계산하지 않는다.
2) 제도·정책은 제공된 목록 안에서만 언급한다. 목록에 없는 제도를 추천하지 않는다.
3) 단정 대신 "~로 보입니다" 톤. 최종 확인은 공식 기관에서 한다는 전제.
4) 소비 카테고리를 언급할 때는 제공된 카테고리명만 쓴다. 목표가 여러 개면 순서대로 언급한다.
5) 반드시 JSON만 출력: {"summary": "3~4문장", "priorities": ["우선순위 1", "우선순위 2", "우선순위 3"], "cautions": ["주의 1", "주의 2"]}`;

const NON_VARIABLE_RE = /월세|통신비|보험료|구독|적금/;

/** 정책 DB(온통청년·행안부 수집분)에서 "취업 후" 받을 수 있는 정책을 고르는 LLM 계약 */
type DbPick = { policy_id: string; score: number; reason: string; benefit_summary: string; goal_tags: string[] };
export type DbPolicy = {
  policy_id: string; source: string; title: string; provider: string | null; region: string; theme: string | null;
  end_date: string | null; always_open: boolean; apply_url: string | null; score: number; reason: string; benefit_summary: string; goal_tags: string[];
};
const DB_PICK_SYSTEM = `당신은 한국 청년 정책 어시스턴트입니다. 사용자는 곧 취업합니다(입력의 기업구분·연봉·입사월). [정책 후보]는 공공 API(온통청년·행정안전부)에서 수집한 실제 정책입니다.
취업 후(재직 중)에 이 사용자가 받을 수 있고, 사용자의 목표(목돈·내집마련·결혼)나 자산관리에 도움이 되는 정책을 최대 8개 골라 JSON 하나로 출력하세요:
{"picks": [{"policy_id": "...", "score": 0~100, "reason": "왜 이 사용자·목표에 맞는지 1문장(존댓말)", "benefit_summary": "혜택 핵심 10자 내외", "goal_tags": ["LUMP_SUM"|"HOUSE"|"MARRIAGE"|"GENERAL"]}]}
규칙:
- 후보에 없는 policy_id 금지. reason과 benefit_summary는 반드시 그 후보의 snippet 내용에만 근거하세요. 다른 정책의 내용을 섞거나 snippet에 없는 금액·조건을 만들지 마세요.
- 미취업·구직자만 대상인 정책(구직수당·취업준비 지원)은 제외.
- 후보 원문에 소득 상한이 있고 사용자의 연봉이 그 상한을 넘으면 제외(예: "연소득 3,500만 원 이하"인데 연봉 4,800만 원 → 제외).
- 개인이 아니라 기업·사업주에게 지급되는 장려금·보조금(고용장려금 등)은 제외.
- 나이·거주지 요건이 명백히 어긋나면 제외. 사용자의 시·군·구가 아닌 다른 시·군·구 전용 정책은 제외. 같은 정책이 여러 후보로 있으면 하나만.
- score 60 미만 제외. 무관하면 빈 배열.`;
const POSTJOB_KW = ["재직", "근로자", "직장인", "자산형성", "저축", "통장", "청약", "전세", "월세", "주거", "신혼", "결혼", "근속", "공제", "이차보전", "대출"];

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

  // ── 목적 (복수) 검증 ──
  const rawGoals = Array.isArray(raw.goals) ? raw.goals : [];
  if (!rawGoals.length) return NextResponse.json({ error: "목적을 하나 이상 선택하세요" }, { status: 400 });
  const goals: GoalSpec[] = [];
  for (const g of rawGoals) {
    const type = g?.type as GoalType | undefined;
    if (!type || !GOAL_TYPES.includes(type)) return NextResponse.json({ error: "알 수 없는 목적입니다" }, { status: 400 });
    if (goals.some((x) => x.type === type)) continue; // 중복 제거
    if (type === "HOUSE") {
      const region = g.houseRegion as HouseRegion | undefined;
      if (!region || !HOUSE_REGIONS.includes(region)) return NextResponse.json({ error: "내집마련 지역을 선택하세요" }, { status: 400 });
      goals.push({ type, houseRegion: region });
    } else if (type === "LUMP_SUM") {
      const t = Number(g.targetKrw);
      goals.push({ type, targetKrw: isFinite(t) && t > 0 ? t : undefined });
    } else goals.push({ type });
  }

  const input: SimInput = { companyType, annualSalaryKrw: Math.round(annual), goals, startMonth: raw.startMonth };

  // ── 프로필 + 지출 구조 ──
  const db = supabaseAdmin();
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
    goals: goals.map((g) => g.type),
    housing,
    homeless: housing === "본가" ? null : housing ? true : null,
    loans: sp.loans.map((l) => ({ type: l.type, interestRate: l.interestRate })),
  });

  // ── 정책 DB에서 "취업 후" 정책 후보 조회 (실제 수집 데이터) ──
  type CandRow = { policy_id: string; source: string; title: string; provider: string | null; theme: string | null; region_sidos: string[] | null; is_national: boolean | null; end_date: string | null; always_open: boolean | null; apply_url: string | null; search_text: string | null };
  const today = new Date().toISOString().slice(0, 10);
  const kwOr = POSTJOB_KW.map((k) => `search_text.ilike.%${k}%`).join(",");
  const openOr = `end_date.is.null,end_date.gte.${today},always_open.eq.true`;
  const CAND_COLS = "policy_id, source, title, provider, theme, region_sidos, is_national, end_date, always_open, apply_url, search_text";
  const EXCLUDE = ["임산부", "출산", "다자녀", "노인", "장애", "북한이탈", "자활", "기초생활", "한부모", "농업", "어업", "예술인", "구직자", "미취업"];
  const baseQuery = () => {
    let q = db.from("policies").select(CAND_COLS).in("source", ["ontong", "gov24"]).ilike("search_text", "%청년%").or(kwOr).or(openOr);
    for (const x of EXCLUDE) q = q.not("search_text", "ilike", `%${x}%`);
    return q;
  };
  // 거주지(시도) 정책과 전국 정책을 따로 넓게 뽑은 뒤 코드가 관련도 점수로 압축한다
  const [regionRes, nationalRes] = await Promise.all([
    prof.sido ? baseQuery().contains("region_sidos", [prof.sido]).eq("is_national", false).limit(120) : Promise.resolve({ data: [], error: null }),
    baseQuery().eq("is_national", true).limit(150),
  ]);
  const candErr = regionRes.error ?? nationalRes.error;
  const STRONG = ["자산형성", "저축", "통장", "청약", "전세", "월세", "근속", "공제", "이차보전", "주택", "신혼", "결혼", "세액", "소득세"];
  const userGu = prof.sigungu ? prof.sigungu.replace(/(특례시|시|군|구)$/, "") : null;
  const rawCands = [...(regionRes.data ?? []), ...(nationalRes.data ?? [])] as CandRow[];
  const candRows = rawCands
    .filter((c) => {
      // 다른 시·군·구 전용(소관기관이 특정 시군구) 정책은 제외 — 사용자 시군구와 다르면 받을 수 없다
      const m = (c.provider ?? "").match(/(?:특별시|광역시|특별자치시|도|특별자치도)\s*([가-힣]+?)(?:특례시|시|군|구)(?=\s|$)/);
      if (m && userGu && !m[1].startsWith(userGu)) return false;
      if (m && !userGu) return false;
      return true;
    })
    .map((c) => {
      const text = c.search_text ?? "";
      const score = STRONG.filter((k) => c.title.includes(k)).length * 3 + POSTJOB_KW.filter((k) => text.includes(k)).length + (c.source === "ontong" ? 1 : 0) + (c.is_national ? 0 : 1);
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 45)
    .map((x) => x.c);
  const cands = candRows;
  const candById = new Map(cands.map((c) => [c.policy_id, c]));
  const regionOf = (c: CandRow) => (c.is_national ? "전국" : (c.region_sidos ?? []).slice(0, 2).join("·") || "지역");

  const man = (n: number) => {
    const m = Math.round(n / 10000);
    if (Math.abs(m) < 10000) return `${m.toLocaleString()}만 원`;
    const eok = Math.floor(m / 10000), rest = m % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString()}만 원` : `${eok}억 원`;
  };
  const ym = (v: string | null) => (v ? `${v.slice(0, 4)}년 ${Number(v.slice(5, 7))}월` : "도달 불가");
  const adviceLabel = { PAY_FIRST: "상환 우선", SAVE_FIRST: "저축 병행", NONE: "대출 없음" }[result.debt.advice];
  const userBrief = {
    나이: prof.age, 거주지: `${prof.sido ?? ""} ${prof.sigungu ?? ""}`.trim(), 주거형태: housing, 기업구분: companyType, 연봉: man(input.annualSalaryKrw),
    입사예정: ym(result.startMonth), 목표: result.goals.map((g) => `${g.type}:${g.label} ${man(g.targetKrw)}`), 세후월실수령: man(result.net.netMonthlyKrw),
  };

  // ── LLM 2건 병렬: (a) 정책 DB 선별 (b) 해설 — 둘 다 실패해도 계산 결과는 그대로 반환 ──
  let dbPolicies: DbPolicy[] = [];
  let dbError: string | null = candErr?.message ?? null;
  let ai: AiComment | null = null;
  let aiError: string | null = null;
  const pickTask = (async () => {
    if (!cands.length) return;
    const list = cands.map((c) => ({ policy_id: c.policy_id, source: c.source, title: c.title, provider: c.provider, region: regionOf(c), theme: c.theme, end_date: c.end_date ?? (c.always_open ? "상시" : null), snippet: (c.search_text ?? "").slice(0, 320) }));
    const userMsg = JSON.stringify({ 사용자: userBrief, 정책후보: list });
    let out = await groqJson<{ picks: DbPick[] }>(DB_PICK_SYSTEM, userMsg, 2000);
    // 모델이 간헐적으로 빈 배열을 내면 한 번 더 시도 (비결정성 완화)
    if (!Array.isArray(out?.picks) || out.picks.length === 0) out = await groqJson<{ picks: DbPick[] }>(DB_PICK_SYSTEM, userMsg, 2000);
    console.log(`[simulate] db picks: ${out?.picks?.length ?? 0} / cands ${list.length}`);
    const seenTitle = new Set<string>();
    const seenReason = new Set<string>();
    dbPolicies = (out.picks ?? [])
      .filter((p) => candById.has(p.policy_id) && Number(p.score) >= 60)
      .sort((a, b) => b.score - a.score)
      .filter((p) => { const t = candById.get(p.policy_id)!.title.replace(/\s|\(.*?\)/g, ""); if (seenTitle.has(t)) return false; seenTitle.add(t); return true; })
      .filter((p) => { const r = (p.reason ?? "").trim(); if (r && seenReason.has(r)) return false; seenReason.add(r); return true; }) // 같은 설명이 복붙된 항목은 환각 가능성 → 제외
      .slice(0, 8)
      .map((p) => {
        const c = candById.get(p.policy_id)!;
        return { policy_id: c.policy_id, source: c.source, title: c.title, provider: c.provider, region: regionOf(c), theme: c.theme, end_date: c.end_date, always_open: !!c.always_open, apply_url: c.apply_url, score: Number(p.score), reason: p.reason, benefit_summary: p.benefit_summary, goal_tags: Array.isArray(p.goal_tags) ? p.goal_tags : [] };
      });
  })().catch((e) => { dbError = e instanceof Error ? e.message : String(e); });
  const commentTask = (async () => {
    const payload = {
      입력: { ...userBrief, 총목표금액: man(result.totalTargetKrw) },
      소득세감면적용: result.net.reliefApplied,
      월지출: { 월세: man(sp.rentMonthlyKrw), 고정지출_월세포함: man(result.spending.fixedKrw), 대출상환: man(result.spending.loanKrw), 변동소비: man(result.spending.variableKrw), 합계: man(result.spending.totalKrw) },
      소비상위카테고리: result.spending.topCategories.map((c) => `${c.category} ${man(c.monthlyKrw)}(${c.pct}%)`),
      월여유자금: man(result.surplusMonthlyKrw),
      시나리오: result.scenarios.map((s) => ({ 이름: s.key, 월저축: man(s.savingsMonthlyKrw), 목표별도달: s.milestones.map((m) => `${m.label} → ${ym(m.goalMonth)}`), 전체도달: ym(s.goalMonthAll) })),
      대출: { 판정: adviceLabel, 잔액: man(result.debt.totalKrw), 월상환: man(result.debt.monthlyKrw), 이유: result.debt.reason },
      경고: result.warnings,
      열리는제도: [...programs.likely, ...programs.needsCheck].map((x) => ({ 이름: x.name, 판정: x.status, 이유: x.reason })),
    };
    const out = await groqJson<AiComment>(AI_SYSTEM, JSON.stringify(payload), 1200);
    ai = out && typeof out.summary === "string" ? out : null;
  })().catch((e) => { aiError = e instanceof Error ? e.message : String(e); });
  await Promise.all([pickTask, commentTask]);

  return NextResponse.json({
    input,
    profile: { age: prof.age, housing, source: sp.source, region: prof.sido },
    spending: sp,
    result,
    programs,
    dbPolicies,
    dbCandidates: cands.length,
    dbError,
    ai,
    aiError,
    notes,
    disclaimer: "간이 계산·참고값 기준의 시뮬레이션입니다. 세금은 연말정산 결과와, 제도 요건은 각 기관 공고와 다를 수 있습니다.",
  });
}
