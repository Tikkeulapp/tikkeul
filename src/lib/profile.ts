import { getPersona } from "@/data/personas";
import { derive } from "@/lib/derive";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeSido } from "@/lib/region";

/**
 * 사용자 프로필 해석 — 페르소나(코드) 또는 직접입력 회원(DB) + profile_changes(이사·졸업 등) 반영.
 * effective_from ≤ 오늘인 변경은 적용, 미래 변경은 pending으로 노출.
 */
export type ProfileChange = {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string;
  effective_from: string;
  source_event: string | null;
  status: string;
};

export type EffectiveProfile = {
  summary: Record<string, unknown>; // LLM에 넘길 요약
  sido: string | null;
  sigungu: string | null;
  age: number | null;
  applied: ProfileChange[];
  pending: ProfileChange[];
};

const TODAY = () => new Date().toISOString().slice(0, 10);
const ageFrom = (birth: string | null | undefined) =>
  birth ? new Date().getFullYear() - Number(String(birth).slice(0, 4)) : null;

export async function resolveProfile(opts: {
  userId?: string | null;
  personaId?: string | null;
  profileId?: string | null;
}): Promise<EffectiveProfile> {
  const db = supabaseAdmin();
  let summary: Record<string, unknown> = { 참고: "프로필 미상 — 일정 관련성 위주로 판단" };
  let sido: string | null = null;
  let sigungu: string | null = null;
  let age: number | null = null;

  const p = opts.personaId ? getPersona(opts.personaId) : undefined;
  if (p) {
    const d = derive(p.mydata);
    sido = normalizeSido(p.declared.region.sido);
    sigungu = p.declared.region.sigungu;
    age = ageFrom(p.declared.birthDate);
    summary = {
      나이: age,
      거주지: `${sido} ${sigungu}`,
      취업상태: p.declared.employmentStatus,
      학력: p.declared.education.status,
      가구중위소득구간: p.declared.incomeBracket,
      월평균근로소득: d.incomes.find((i) => i.kind === "WORK")?.avgMonthlyKrw ?? null,
      수급중수당: d.benefits.map((b) => b.name),
    };
  } else if (opts.profileId) {
    const { data: sv } = await db
      .from("profile_survey")
      .select("birth_date, region_sido, region_sigungu, education_status, income_bracket, housing_type, target_job")
      .eq("id", opts.profileId)
      .single();
    if (sv) {
      sido = normalizeSido(sv.region_sido);
      sigungu = sv.region_sigungu ?? null;
      age = ageFrom(sv.birth_date);
      summary = {
        나이: age,
        거주지: `${sido ?? ""} ${sigungu ?? ""}`.trim(),
        학력: sv.education_status,
        주거형태: sv.housing_type,
        목표직무: sv.target_job,
        가구중위소득구간: sv.income_bracket,
      };
    }
  }

  // ── profile_changes 반영 ──
  const applied: ProfileChange[] = [];
  const pending: ProfileChange[] = [];
  if (opts.userId) {
    const { data } = await db
      .from("profile_changes")
      .select("id, field, old_value, new_value, effective_from, source_event, status")
      .eq("user_id", opts.userId)
      .eq("status", "applied")
      .order("effective_from", { ascending: true });
    const today = TODAY();
    for (const c of (data ?? []) as ProfileChange[]) {
      if (c.effective_from <= today) {
        applied.push(c);
        if (c.field === "region_sido") {
          sido = normalizeSido(c.new_value) ?? c.new_value;
          sigungu = null;
          summary["거주지"] = `${c.new_value} (${c.effective_from} 이사)`;
        } else if (c.field === "education_status") summary["학력"] = c.new_value;
        else if (c.field === "employment_status") summary["취업상태"] = c.new_value;
      } else {
        pending.push(c);
      }
    }
    if (pending.length) {
      summary["예정된_변화"] = pending.map((c) => `${c.effective_from}부터 ${c.field}=${c.new_value}`);
    }
  }

  return { summary, sido, sigungu, age, applied, pending };
}
