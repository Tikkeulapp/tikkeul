/**
 * POST /api/jobs/recommend — 프로필 기반 채용공고 추천 (메인 좌측 "채용" 탭)
 * 입력: { userId, personaId | profileId }
 * 흐름: resolveProfile(이사 반영) → 목표 직무 → NCS 코드(코드 매핑) → 지역/전국 후보 풀(마감 전)
 *       → 코드 점수화 상위 25 → LLM이 6건 선별+이유 (실패 시 코드 점수순 폴백)
 * 마감 D-7 이하는 urgent로 따로 내려 "마감 임박" 표시에 쓴다.
 * 개인화: 공고 담기·열람·강점 키워드에서 쌓인 채용 선호(직무분야·기관 구분·고용형태·지역·키워드)로
 *         후보 풀을 넓히고 코드 점수 순위와 RRF 융합, 반복 노출·무반응 공고는 뒤로. 지원 자격 판단과는 무관.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabase";
import { resolveProfile } from "@/services/profile";
import { loadInterestContext, recordJobImpressions } from "@/services/interests";
import { jobTagLabel } from "@/data/interests";
import { jobInterestScore, jobTags } from "@/lib/jobInterest";
import { topInterests } from "@/lib/interest";
import { fuseWithInterest } from "@/lib/rank";
import { getPersona } from "@/data/personas";
import { llmJson } from "@/services/llm";
import { ncsCodesForTargetJob, careerOpenToNewcomer, educationSatisfied, dday, NCS_NAME_BY_CODE, isPublicOrg } from "@/data/ncs";

export const maxDuration = 60;

const COLS = "job_id, source, title, company, region_names, region_sidos, is_national, ncs_codes, ncs_names, hire_types, career, education, salary_text, headcount, pbanc_begin, deadline, detail_url, search_text";

type Row = {
  job_id: string; source: string; title: string; company: string | null; region_names: string[]; region_sidos: string[]; is_national: boolean;
  ncs_codes: string[]; ncs_names: string[]; hire_types: string[]; career: string | null; education: string | null;
  salary_text: string | null; headcount: number | null; pbanc_begin: string | null; deadline: string | null; deadline_time?: string | null; summary?: string | null; requirements?: string | null; detail_url: string | null; search_text: string | null;
};

const SYSTEM = `당신은 한국 취업준비생 채용공고 추천 어시스턴트입니다. [사용자]와 [공고 후보](공공기관 채용정보 API에서 수집한 실제 공고)를 보고,
이 사용자가 지금 지원을 검토할 가치가 있는 공고를 관련도 순으로 최대 6개 골라 JSON 하나로 출력하세요:
{"picks": [{"job_id": "...", "score": 0~100, "reason": "왜 이 사용자의 직무·지역·상황에 맞는지 1문장(존댓말)"}]}
규칙:
- 후보에 없는 job_id 금지. reason은 그 후보의 정보에만 근거하고 자격요건을 지어내지 마세요.
- 사용자의 목표 직무와 직무분야(NCS)가 가까울수록, 거주지와 근무지역이 가까울수록 우선.
- "경력" 단독 공고는 제외. score 55 미만 제외. 무관하면 빈 배열.
- 적합도가 비슷하면 사기업과 공공기관 공고를 섞어 추천하세요 (한쪽에 몰지 않기). 상시채용(마감 없음)도 불리하게 보지 마세요.
- [사용자]의 선호는 최근 공고 담기·열람·검색에서 추정한 참고 정보입니다. 비슷한 후보끼리의 우선순위에만 쓰고, 자격 판단 근거로 쓰거나 reason에서 행동을 구체적으로 언급하지 마세요.`;

export async function POST(request: Request) {
  let body: { userId?: string | null; personaId?: string | null; profileId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  if (!body.personaId && !body.profileId) return NextResponse.json({ error: "personaId 또는 profileId가 필요합니다" }, { status: 400 });

  const db = supabaseAdmin();
  const [prof, interest] = await Promise.all([
    resolveProfile({ userId: body.userId, personaId: body.personaId, profileId: body.profileId }),
    loadInterestContext({ userId: body.userId, personaId: body.personaId }),
  ]);
  const prefTags = topInterests(interest.jobScores, 4);
  const persona = body.personaId ? getPersona(body.personaId) : null;
  const targetJob = (persona?.declared.targetJob ?? (prof.summary["목표직무"] as string | undefined) ?? "").toString();
  const education = (prof.summary["학력"] as string | undefined) ?? null;
  const ncs = ncsCodesForTargetJob(targetJob);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  // 후보 풀: 직무분야별 (거주지+전국) / 마감 전만
  type Res = { data: Row[] | null; error: { message: string } | null };
  // deadline_time 컬럼이 없는 DB(ALTER 전) 호환
  const probe = await db.from("job_postings").select("deadline_time, summary, requirements").limit(1);
  const cols = probe.error ? COLS : COLS + ", deadline_time, summary, requirements";

  const openOr = `deadline.is.null,deadline.gte.${today}`; // 상시·채용시 마감 포함
  const pools: Promise<Res>[] = ncs.map((code) => {
    let q = db.from("job_postings").select(cols).or(openOr).contains("ncs_codes", [code]).order("deadline", { ascending: true }).limit(60);
    if (prof.sido) q = q.or(`is_national.eq.true,region_sidos.cs.{${prof.sido}}`);
    return q as unknown as Promise<Res>;
  });
  // 선호 직무분야(목표 직무 밖에서 자주 담은 분야)·강점 키워드로 후보 풀 보강
  for (const code of prefTags.filter((t) => t.startsWith("ncs:")).map((t) => t.slice(4)).filter((c) => !ncs.includes(c)).slice(0, 2)) {
    let q = db.from("job_postings").select(cols).or(openOr).contains("ncs_codes", [code]).order("deadline", { ascending: true }).limit(30);
    if (prof.sido) q = q.or(`is_national.eq.true,region_sidos.cs.{${prof.sido}}`);
    pools.push(q as unknown as Promise<Res>);
  }
  for (const kw of prefTags.filter((t) => t.startsWith("kw:")).map((t) => t.slice(3).replace(/[,%()*"'\\]/g, "")).filter(Boolean).slice(0, 2)) {
    pools.push(db.from("job_postings").select(cols).or(openOr).ilike("search_text", `%${kw}%`).order("deadline", { ascending: true }).limit(20) as unknown as Promise<Res>);
  }
  // 직무 무관, 거주 지역 공고도 소량 (지역 밀착 공고 커버)
  if (prof.sido) pools.push(db.from("job_postings").select(cols).or(openOr).contains("region_sidos", [prof.sido]).order("deadline", { ascending: true }).limit(30) as unknown as Promise<Res>);

  const seen = new Set<string>();
  const raw: Row[] = [];
  for (const res of await Promise.all(pools)) {
    if (res.error) return NextResponse.json({ error: `공고 검색 실패: ${res.error.message}` }, { status: 500 });
    for (const r of res.data ?? []) if (!seen.has(r.job_id)) { seen.add(r.job_id); raw.push(r); }
  }

  const jobTokens = targetJob.split(/[\s·,/]+/).filter((t) => t.length >= 2);
  const scoreOf = (r: Row) => {
    let sc = 0;
    if (r.ncs_codes.includes(ncs[0])) sc += 4;
    else if (r.ncs_codes.some((c) => ncs.includes(c))) sc += 2;
    if (prof.sido && r.region_sidos.includes(prof.sido)) sc += 3;
    else if (r.is_national) sc += 1;
    if (careerOpenToNewcomer(r.career)) sc += 2; else sc -= 6;
    const edu = educationSatisfied(r.education, education);
    if (edu === true) sc += 1; else if (edu === false) sc -= 5;
    const d = dday(r.deadline);
    if (d !== null && d <= 7) sc += 3; else if (d !== null && d <= 14) sc += 2;
    if (r.hire_types.some((h) => /정규직/.test(h))) sc += 1;
    if (jobTokens.some((t) => (r.title + " " + (r.search_text ?? "")).includes(t))) sc += 2;
    return sc;
  };

  // 코드 점수 순위 + 채용 선호 순위를 RRF로 합치고, 반복 노출에 반응 없던 공고는 뒤로
  const scored = raw.map((r) => ({ r, sc: scoreOf(r) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc);
  const prefOf = new Map(scored.map(({ r }) => [
    r.job_id,
    jobInterestScore(jobTags({ ncs_codes: r.ncs_codes, isPublic: isPublicOrg(r.source, r.company), hire_types: r.hire_types, region_sidos: r.region_sidos }), `${r.title} ${r.search_text ?? ""}`, interest.jobScores),
  ]));
  const fused = fuseWithInterest(scored.map((x) => x.r.job_id), (id) => prefOf.get(id) ?? 0);
  const order = [...fused.filter((id) => !interest.jobStale.has(id)), ...fused.filter((id) => interest.jobStale.has(id))];
  const rankOf = new Map(order.map((id, i) => [id, i]));
  const sorted = [...scored].sort((a, b) => rankOf.get(a.r.job_id)! - rankOf.get(b.r.job_id)!);
  // 후보 25건 — 공채(마감 가중) 위주로 쏠리지 않게 민간(company) 상위 8건은 쿼터로 보장
  const companyTop = sorted.filter((x) => x.r.source === "company").slice(0, 8);
  const rest = sorted.filter((x) => !companyTop.includes(x));
  const cands = [...companyTop, ...rest].slice(0, 25).sort((a, b) => rankOf.get(a.r.job_id)! - rankOf.get(b.r.job_id)!);
  const byId = new Map(cands.map((x) => [x.r.job_id, x]));

  const toRec = (r: Row, score: number, reason: string) => ({
    id: r.job_id, source: r.source, title: r.title, company: r.company,
    region: r.is_national && r.region_sidos.length === 0 ? "전국" : r.region_names.join("·"),
    ncs: r.ncs_names.slice(0, 2).join("·"), career: r.career, education: r.education, hireTypes: r.hire_types.join("·"),
    salary: r.salary_text, summary: r.summary ?? null, requirements: r.requirements ?? null, deadline: r.deadline, deadlineTime: r.deadline_time ?? null,
    pbancBegin: r.pbanc_begin, dday: dday(r.deadline), url: r.detail_url, score, reason,
  });

  const prefLabels = prefTags.map(jobTagLabel).filter((l): l is string => !!l);
  let recommendations: ReturnType<typeof toRec>[] = [];
  let aiError: string | null = null;
  if (cands.length > 0) {
    try {
      const listForLlm = cands.map(({ r }) => ({
        job_id: r.job_id, 제목: r.title, 회사: r.company, 구분: isPublicOrg(r.source, r.company) ? "공공기관" : "사기업", 지역: r.region_names.join(","),
        직무분야: r.ncs_names.join(","), 채용구분: r.career, 학력: r.education, 급여: r.salary_text, 마감: r.deadline ?? "상시",
      }));
      const 선호 = prefLabels.length ? { 선호: prefLabels } : {};
      const userMsg = `[사용자]\n${JSON.stringify({ 목표직무: targetJob || "미상", 직무분야추정: ncs.map((c) => NCS_NAME_BY_CODE.get(c)), 거주지: `${prof.sido ?? ""} ${prof.sigungu ?? ""}`.trim(), 나이: prof.age, 학력: education, ...선호 })}\n\n[공고 후보]\n${JSON.stringify(listForLlm)}`;
      let out = await llmJson<{ picks: { job_id: string; score: number; reason: string }[] }>(SYSTEM, userMsg, 1600);
      if (!Array.isArray(out?.picks) || out.picks.length === 0) out = await llmJson<{ picks: { job_id: string; score: number; reason: string }[] }>(SYSTEM, userMsg, 1600);
      recommendations = (out.picks ?? [])
        .filter((p) => byId.has(p.job_id) && Number(p.score) >= 55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((p) => toRec(byId.get(p.job_id)!.r, p.score, p.reason));
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
    }
    if (recommendations.length === 0) {
      // LLM 실패/빈 결과 폴백 — 코드 점수 상위 6건, 이유는 규칙 문구
      recommendations = cands.slice(0, 6).map(({ r, sc }) =>
        toRec(r, Math.min(95, 55 + sc * 4), [
          r.ncs_codes.some((c) => ncs.includes(c)) ? "목표 직무와 같은 직무분야" : null,
          prof.sido && r.region_sidos.includes(prof.sido) ? "거주지와 근무지역 일치" : r.is_national ? "전국 지원 가능" : null,
          careerOpenToNewcomer(r.career) ? "신입 지원 가능" : null,
        ].filter(Boolean).join(" · ") + "인 공고입니다."),
      );
    }
  }

  // 균형 보정(코드) — 민간 후보가 있는데 추천이 전부 공공이면 상위 민간 2건을 보장
  const mkRuleReason = (r: Row) => [
    r.ncs_codes.some((c) => ncs.includes(c)) ? "목표 직무와 같은 분야" : null,
    prof.sido && r.region_sidos.includes(prof.sido) ? "거주지와 근무지역 일치" : r.is_national ? "전국 지원 가능" : null,
    "사기업 공고",
  ].filter(Boolean).join(" · ") + "입니다.";
  if (recommendations.length > 0 && !recommendations.some((x) => x.source === "company") && companyTop.length > 0) {
    const extra = companyTop.slice(0, 2).map(({ r, sc }) => toRec(r, Math.min(90, 55 + sc * 4), mkRuleReason(r)));
    recommendations = [...recommendations.slice(0, 6 - extra.length), ...extra];
  }

  if (body.userId) await recordJobImpressions(body.userId, recommendations.map((x) => x.id));

  const urgent = recommendations.filter((x) => x.dday !== null && x.dday <= 7).sort((a, b) => (a.dday ?? 99) - (b.dday ?? 99)).slice(0, 3);
  return NextResponse.json({ recommendations, urgent, candidates: raw.length, aiError, preferences: prefLabels, profile: { sido: prof.sido, targetJob, ncs: ncs.map((c) => NCS_NAME_BY_CODE.get(c)) } });
}
