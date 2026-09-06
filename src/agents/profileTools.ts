/**
 * Profile Agent 도구 (finance/tools/profile_tools.py 이식).
 * profile_survey/finance는 이미 있는 테이블을 그대로 읽고 쓴다 — 새 스키마 불필요.
 * region_sido/education_status/employment_status 3개는 /api/profile-change와 같은 감사로그
 * (profile_changes)에도 남긴다 — 이사·졸업·퇴사 같은 "상태 변화"는 시점이 중요해서 이미 그렇게
 * 설계돼 있었고(이사 델타 리포트가 이 로그를 읽는다), 다른 필드는 단발성 정보라 로그 없이 갱신한다.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase";
import { PERSONAS } from "@/data/personas";

const isPersonaId = (id: string) => PERSONAS.some((p) => p.id === id);

const TRACKED_FIELDS = new Set(["region_sido", "education_status", "employment_status", "income_bracket", "asset_bracket"]);

const ProfileFieldsSchema = z.object({
  region_sido: z.string().nullable().optional(),
  region_sigungu: z.string().nullable().optional(),
  education_status: z.enum(["재학", "휴학", "졸업유예", "졸업"]).nullable().optional(),
  major: z.string().nullable().optional(),
  employment_status: z.string().nullable().optional().describe("자유텍스트, 예: 재직중|미취업|미취업_단기알바중"),
  target_job: z.string().nullable().optional(),
  housing_type: z.enum(["본가", "월세", "전세"]).nullable().optional(),
  living_with_parents: z.boolean().nullable().optional(),
  household_size: z.number().nullable().optional(),
  income_bracket: z.enum(["~60%", "60~100%", "100~150%", "150%~"]).nullable().optional(),
  asset_bracket: z.enum(["2억 미만", "2~4억", "4억 초과"]).nullable().optional(),
  military_served: z.boolean().nullable().optional(),
});

export function buildProfileTools(userId: string, profileId: string, deferUntil: string | null = null) {
  const getProfile = tool(
    async () => {
      const db = supabaseAdmin();
      const [{ data: survey }, { data: fin }] = await Promise.all([
        db.from("profile_survey").select("*").eq("id", profileId).maybeSingle(),
        db.from("finance").select("*").eq("user_id", profileId).maybeSingle(),
      ]);
      return JSON.stringify({ profile_survey: survey ?? null, finance: fin ?? null });
    },
    {
      name: "get_profile",
      description: "사용자의 현재 profile_survey/finance 값을 조회합니다. 이미 알고 있는 값은 다시 묻지 마세요.",
      schema: z.object({}),
    },
  );

  const updateProfile = tool(
    async (fields: z.infer<typeof ProfileFieldsSchema>) => {
      const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));
      if (Object.keys(cleaned).length === 0) return JSON.stringify({ updated: {} });

      const db = supabaseAdmin();
      // 페르소나(minji/junho/seoyeon)는 데모 공용 행이므로 절대 수정하지 않는다.
      // 대신 이 사용자에게만 적용되는 profile_changes 이력으로 남긴다 (resolveProfile이 반영).
      if (isPersonaId(profileId)) {
        const today = deferUntil ?? new Date().toISOString().slice(0, 10);
        const recorded: string[] = [];
        for (const [field, newValue] of Object.entries(cleaned)) {
          if (!TRACKED_FIELDS.has(field)) continue;
          // 같은 값이 이미 최신 이력이면(예: chat route가 먼저 결정적으로 기록) 중복 기록하지 않는다
          const { data: last } = await db.from("profile_changes").select("new_value").eq("user_id", userId).eq("field", field).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (last?.new_value === String(newValue)) { recorded.push(field); continue; }
          await db.from("profile_changes").insert({
            user_id: userId, field, old_value: null, new_value: String(newValue),
            effective_from: today, source_event: "chat:profile_agent", status: "applied",
          });
          recorded.push(field);
        }
        return JSON.stringify({
          updated: {},
          persona_locked: true,
          recorded_as_profile_change: recorded,
          note: "데모 페르소나의 기본 정보는 고정되어 있어 직접 수정하지 않았습니다. 거주지·학력·취업상태 변경은 이 사용자에게만 적용되는 변경 이력으로 기록했습니다.",
        });
      }
      // 미래 시점 변경("다음주에 이사")이면 원본은 그대로 두고 예정 이력만 남긴다 — resolveProfile이 그 날부터 적용
      if (!deferUntil) {
        const { error } = await db.from("profile_survey").update(cleaned).eq("id", profileId);
        if (error) return JSON.stringify({ error: error.message });
      }

      // region_sido/education_status/employment_status는 profile_changes에도 남긴다 (감사로그 겸
      // 이사 델타 리포트 등 기존 기능이 참조하는 이력).
      const today = deferUntil ?? new Date().toISOString().slice(0, 10);
      const trackedEntries = Object.entries(cleaned).filter(([k]) => TRACKED_FIELDS.has(k));
      for (const [field, newValue] of trackedEntries) {
        const { data: last } = await db.from("profile_changes").select("new_value").eq("user_id", userId).eq("field", field).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (last?.new_value === String(newValue)) continue; // 중복 이력 방지
        await db.from("profile_changes").insert({
          user_id: userId,
          field,
          old_value: null,
          new_value: String(newValue),
          effective_from: today,
          source_event: "chat:profile_agent",
          status: "applied",
        });
      }
      return JSON.stringify(deferUntil ? { scheduled: cleaned, effective_from: deferUntil, note: `${deferUntil}부터 적용되도록 예약했습니다(그 전까지는 현재 정보 유지)` } : { updated: cleaned });
    },
    {
      name: "update_profile",
      description:
        "대화에서 새로 확인되거나 정정된 필드만 저장합니다. 확실하지 않은 값은 저장하지 마세요. " +
        "생략한 필드는 그대로 유지됩니다.",
      schema: ProfileFieldsSchema,
    },
  );

  return [getProfile, updateProfile];
}
