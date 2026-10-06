import { getPersona } from "@/data/personas";
import { derive } from "@/lib/derive";
import { supabaseAdmin } from "@/services/supabase";
import { normalizeSido } from "@/lib/region";
import type { EffectiveProfile, ProfileChange } from "@/types/profile";

/**
 * 사용자 프로필 해석 — 페르소나(코드) 또는 직접입력 회원(DB) + profile_changes(이사·졸업 등) 반영.
 * effective_from ≤ 오늘인 변경은 적용, 미래 변경은 pending으로 노출.
 */

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
  let profileRow: Record<string, unknown> | null = null;
  let financeRow: Record<string, unknown> | null = null;

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
    const [{ data: pr }, { data: fr }] = await Promise.all([
      db.from("profile_survey").select("*").eq("id", opts.personaId as string).maybeSingle(),
      db.from("finance").select("*").eq("user_id", opts.personaId as string).maybeSingle(),
    ]);
    profileRow = pr ?? null;
    financeRow = fr ?? null;
  } else if (opts.profileId) {
    const [{ data: sv }, { data: fr }] = await Promise.all([
      db.from("profile_survey").select("*").eq("id", opts.profileId).maybeSingle(),
      db.from("finance").select("*").eq("user_id", opts.profileId).maybeSingle(),
    ]);
    if (sv) {
      sido = normalizeSido(sv.region_sido as string | null);
      sigungu = (sv.region_sigungu as string | null) ?? null;
      age = ageFrom(sv.birth_date as string | null);
      summary = {
        나이: age,
        거주지: `${sido ?? ""} ${sigungu ?? ""}`.trim(),
        학력: sv.education_status,
        주거형태: sv.housing_type,
        목표직무: sv.target_job,
        가구중위소득구간: sv.income_bracket,
      };
      profileRow = sv;
      financeRow = fr ?? null;
    }
  }

  // ── profile_changes 반영 — summary뿐 아니라 규칙엔진이 볼 profileRow에도 반영해야
  // 두 경로가 서로 다른 값을 보지 않는다. ──
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
          if (profileRow) {
            profileRow = { ...profileRow, region_sido: c.new_value, region_sigungu: null };
          }
        } else if (c.field === "education_status") {
          summary["학력"] = c.new_value;
          if (profileRow) profileRow = { ...profileRow, education_status: c.new_value };
        } else if (c.field === "employment_status") {
          summary["취업상태"] = c.new_value;
          if (profileRow) profileRow = { ...profileRow, employment_status: c.new_value };
        } else if (c.field === "income_bracket") {
          summary["가구중위소득구간"] = c.new_value;
          if (profileRow) profileRow = { ...profileRow, income_bracket: c.new_value };
        } else if (c.field === "asset_bracket") {
          if (profileRow) profileRow = { ...profileRow, asset_bracket: c.new_value };
        } else if (c.field === "housing_type") {
          if (profileRow) profileRow = { ...profileRow, housing_type: c.new_value };
        } else if (c.field === "region_sigungu") {
          sigungu = c.new_value;
          if (profileRow) profileRow = { ...profileRow, region_sigungu: c.new_value };
        } else if (c.field === "birth_date") {
          age = ageFrom(c.new_value);
          if (profileRow) profileRow = { ...profileRow, birth_date: c.new_value };
        }
      } else {
        pending.push(c);
      }
    }
    if (pending.length) {
      summary["예정된_변화"] = pending.map((c) => `${c.effective_from}부터 ${c.field}=${c.new_value}`);
    }
  }

  return { summary, sido, sigungu, age, applied, pending, profileRow, financeRow };
}
