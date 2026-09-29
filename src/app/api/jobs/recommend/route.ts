/**
 * POST /api/jobs/recommend — 프로필 기반 채용공고 추천 (메인 좌측 "채용" 탭)
 * 입력: { userId, personaId | profileId }
 * 흐름: resolveProfile(이사 반영) → 목표 직무 → NCS 코드(코드 매핑) → 지역/전국 후보 풀(마감 전)
 *       → 코드 점수화 상위 25 → LLM이 6건 선별+이유 (실패 시 코드 점수순 폴백)
 * 마감 D-7 이하는 urgent로 따로 내려 "마감 임박" 표시에 쓴다.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveProfile } from "@/lib/profile";
import { getPersona } from "@/data/personas";
import { groqJson } from "@/lib/groq";
import { ncsCodesForTargetJob, careerOpenToNewcomer, educationSatisfied, dday, NCS_NAME_BY_CODE } from "@/data/ncs";

export const maxDuration = 60;

const COLS = "job_id, source, title, company, region_names, region_sidos, is_national, ncs_codes, ncs_names, hire_types, career, education, salary_text, headcount, deadline, detail_url, search_text";

type Row = {
  job_id: string; source: string; title: string; company: string | null; region_names: string[]; region_sidos: string[]; is_national: boolean;
  ncs_codes: string[]; ncs_names: string[]; hire_types: string[]; career: string | null; education: string | null;
  salary_text: string | null; headcount: number | null; deadline: string | null; detail_url: string | null; search_text: string | null;
};

const SYSTEM = `당신은 한국 취업준비생 채용공고 추천 어시스턴트입니다. [사용자]와 [공고 후보](공공기관 채용정보 API에서 수집한 실제 공고)를 보고,
이 사용자가 지금 지원을 검토할 가치가 있는 공고를 관련도 순으로 최대 6개 골라 JSON 하나로 출력하세요:
{"picks": [{"job_id": "...", "score": 0~100, "reason": "왜 이 사용자의 직무·지역·상황에 맞는지 1문장(존댓말)"}]}
규칙:
- 후보에 없는 job_id 금지. reason은 그 후보의 정보에만 근거하고 자격요건을 지어내지 마세요.
- 사용자의 목표 직무와 직무분야(NCS)가 가까울수록, 거주지와 근무지역이 가까울수록 우선.
- "경력" 단독 공고는 제외. score 55 미만 제외. 무관하면 빈 배열.`;

export async function POST(request: Request) {
  let body: { userId?: string | null; personaId?: string | null; profileId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  if (!body.personaId && !body.profileId) return NextResponse.json({ error: "personaId 또는 profileId가 필요합니다" }, { status: 400 });

  const db = supabaseAdmin();
  const prof = await resolveProfile({ userId: body.userId, personaId: body.personaId, profileId: body.profileId });
  const persona = body.personaId ? getPersona(body.personaId) : null;
  const targetJob = (persona?.declared.targetJob ?? (prof.summary["목표직무"] as string | undefined) ?? "").toString();
  const education = (prof.summary["학력"] as string | undefined) ?? null;
  const ncs = ncsCodesForTargetJob(targetJob);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  // 후보 풀: 직무분야별 (거주지+전국) / 마감 전만
  type Res = { data: Row[] | null; error: { message: string } | null };
  const openOr = `deadline.is.null,deadline.gte.${today}`; // 상시·채용시 마감 포함
  const pools: Promise<Res>[] = ncs.map((code) => {
    let q = db.from("job_postings").select(COLS).or(openOr).contains("ncs_codes", [code]).order("deadline", { ascending: true }).limit(60);
    if (prof.sido) q = q.or(`is_national.eq.true,region_sidos.cs.{${prof.sido}}`);
    return q as unknown as Promise<Res>;
  });
  // 직무 무관, 거주 지역 공고도 소량 (지역 밀착 공고 커버)
  if (prof.sido) pools.push(db.from("job_postings").select(COLS).or(openOr).contains("region_sidos", [prof.sido]).order("deadline", { ascending: true }).limit(30) as unknown as Promise<Res>);

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

  const cands = raw.map((r) => ({ r, sc: scoreOf(r) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 25);
  const byId = new Map(cands.map((x) => [x.r.job_id, x]));

  const toRec = (r: Row, score: number, reason: string) => ({
    id: r.job_id, source: r.source, title: r.title, company: r.company,
    region: r.is_national && r.region_sidos.length === 0 ? "전국" : r.region_names.join("·"),
    ncs: r.ncs_names.slice(0, 2).join("·"), career: r.career, education: r.education, hireTypes: r.hire_types.join("·"),
    salary: r.salary_text, deadline: r.deadline, dday: dday(r.deadline), url: r.detail_url, score, reason,
  });

  let recommendations: ReturnType<typeof toRec>[] = [];
  let aiError: string | null = null;
  if (cands.length > 0) {
    try {
      const listForLlm = cands.map(({ r }) => ({
        job_id: r.job_id, 제목: r.title, 회사: r.company, 구분: r.source === "pubinst" ? "공공기관" : "민간", 지역: r.region_names.join(","),
        직무분야: r.ncs_names.join(","), 채용구분: r.career, 학력: r.education, 급여: r.salary_text, 마감: r.deadline ?? "상시",
      }));
      const userMsg = `[사용자]\n${JSON.stringify({ 목표직무: targetJob || "미상", 직무분야추정: ncs.map((c) => NCS_NAME_BY_CODE.get(c)), 거주지: `${prof.sido ?? ""} ${prof.sigungu ?? ""}`.trim(), 나이: prof.age, 학력: education })}\n\n[공고 후보]\n${JSON.stringify(listForLlm)}`;
      let out = await groqJson<{ picks: { job_id: string; score: number; reason: string }[] }>(SYSTEM, userMsg, 1600);
      if (!Array.isArray(out?.picks) || out.picks.length === 0) out = await groqJson<{ picks: { job_id: string; score: number; reason: string }[] }>(SYSTEM, userMsg, 1600);
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

  const urgent = recommendations.filter((x) => x.dday !== null && x.dday <= 7).sort((a, b) => (a.dday ?? 99) - (b.dday ?? 99)).slice(0, 3);
  return NextResponse.json({ recommendations, urgent, candidates: raw.length, aiError, profile: { sido: prof.sido, targetJob, ncs: ncs.map((c) => NCS_NAME_BY_CODE.get(c)) } });
}
