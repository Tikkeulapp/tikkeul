import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { groqJson } from "@/lib/groq";
import { normalizeSido } from "@/lib/region";
import { PERSONAS } from "@/data/personas";
import { resolveProfile } from "@/lib/profile";
import { planTurn } from "@/agents/orchestrator";
import { runPolicyCompare, runPolicyLookup, runPolicySearch } from "@/agents/policyAgent";
import { runProfileAgent } from "@/agents/profileAgent";
import type { ChatMessage } from "@/agents/state";
import type { ProfileCtx } from "@/agents/policyTools";

const HISTORY_LIMIT = 12;

/* ── 프로필 변경 결정적 반영 ───────────────────────────────────────────────
 * Profile Agent(LLM ReAct)는 같은 발화에도 update_profile 도구를 부르지 않고 "저장했습니다"라고만 답하는
 * 경우가 있다(배포판에서 재현). 그래서 발화에서 변경 필드를 구조화 추출해 코드가 먼저 DB에 반영한다.
 * - 페르소나(minji/junho/seoyeon): 공용 원본은 건드리지 않고 이 사용자의 profile_changes에만 기록
 * - 직접 입력 사용자: profile_survey 갱신 + profile_changes 이력
 */
type ProfilePatch = { region_sido: string | null; region_sigungu: string | null; employment_status: string | null; education_status: string | null; housing_type: string | null };
const PATCH_SYSTEM = `사용자 발화에서 "본인 프로필의 변경"으로 명시된 정보만 추출해 JSON 하나로 출력하세요.
{"region_sido": 시·도 전체 명칭(예: "경기도", "서울특별시", "대전광역시") 또는 null, "region_sigungu": 시·군·구(예: "안양시", "영등포구") 또는 null, "employment_status": "재직중"|"미취업"|"미취업_단기알바중"|null, "education_status": "재학"|"휴학"|"졸업유예"|"졸업"|null, "housing_type": "본가"|"월세"|"전세"|null}
규칙: 발화에 없는 값은 null. 추측 금지. 질문("안양에 뭐 있어?")이나 희망("이사 가고 싶다")은 변경이 아니므로 null. 시·군·구만 말했으면 그 지역의 시·도를 region_sido에 채운다(안양시→경기도, 영등포구→서울특별시).`;
const TRACKED = new Set(["region_sido", "education_status", "employment_status"]);

async function applyProfilePatchDeterministically(userId: string, profileRowId: string, message: string) {
  let patch: ProfilePatch;
  try {
    patch = await groqJson<ProfilePatch>(PATCH_SYSTEM, `발화: "${message}"`, 600);
  } catch {
    return { applied: [] as string[] };
  }
  const cleaned: Record<string, string> = {};
  if (patch.region_sido) cleaned.region_sido = normalizeSido(patch.region_sido) ?? patch.region_sido;
  if (patch.region_sigungu) cleaned.region_sigungu = patch.region_sigungu;
  if (patch.employment_status) cleaned.employment_status = patch.employment_status;
  if (patch.education_status) cleaned.education_status = patch.education_status;
  if (patch.housing_type) cleaned.housing_type = patch.housing_type;
  if (!Object.keys(cleaned).length) return { applied: [] as string[] };

  const db = supabaseAdmin();
  const isPersona = PERSONAS.some((p) => p.id === profileRowId);
  if (!isPersona) {
    const { error } = await db.from("profile_survey").update(cleaned).eq("id", profileRowId);
    if (error) return { applied: [] as string[], error: error.message };
  }
  const today = new Date().toISOString().slice(0, 10);
  const applied: string[] = [];
  for (const [field, newValue] of Object.entries(cleaned)) {
    if (!TRACKED.has(field)) { applied.push(field); continue; }
    // 같은 값이 이미 최신 이력이면 중복 기록하지 않는다
    const { data: last } = await db.from("profile_changes").select("new_value").eq("user_id", userId).eq("field", field).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.new_value === newValue) { applied.push(field); continue; }
    await db.from("profile_changes").insert({ user_id: userId, field, old_value: null, new_value: newValue, effective_from: today, source_event: "chat:deterministic", status: "applied" });
    applied.push(field);
  }
  return { applied, cleaned, personaLocked: isPersona };
}


/**
 * POST /api/chat — 검색바 "모르는 거 물어보기"의 실제 진입점.
 * 지금까지 이 자리는 스텁이었다("AI 검색·채팅은 다음 단계에서 연결됩니다").
 * Orchestrator가 의도를 분해해 profile_update -> policy_search 순서로 실행한다
 * (finance/ 그래프의 route_after_orchestrator와 동일 순서). 두 의도가 다 있으면
 * 마지막에 실행된 쪽의 응답만 사용자에게 보여준다 — Policy Agent 응답은 이미
 * 갱신된 프로필을 전제로 나오므로 그 자체로 충분하다.
 */
export async function POST(request: Request) {
  let body: { userId?: string; personaId?: string | null; profileId?: string | null; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, personaId, profileId, message } = body;
  if (!userId || !message?.trim()) {
    return NextResponse.json({ error: "userId, message는 필수입니다" }, { status: 400 });
  }
  const profileRowId = personaId ?? profileId ?? null;

  const db = supabaseAdmin();

  try {
    const [{ data: history }, initialProfile] = await Promise.all([
      db
        .from("chat_messages")
        .select("role, content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      resolveProfile({ userId, personaId, profileId }),
    ]);

    const messages: ChatMessage[] = [
      ...((history ?? []) as ChatMessage[]).reverse(),
      { role: "user", content: message.trim() },
    ];

    await db.from("chat_messages").insert({ user_id: userId, role: "user", content: message.trim() });

    const plan = await planTurn(userId, messages);
    // Orchestrator(LLM)가 "이사했어" 같은 개인정보 변경 발화를 간헐적으로 놓친다(같은 문장도 실행마다 다름).
    // 거주지·학력·취업상태 변경을 뜻하는 표현이 있으면 profile_update 의도를 결정적으로 보장한다.
    const PROFILE_HINT = /이사|거주지|주소|살고\s*있|살아|살게|이주|전입|졸업했|졸업함|휴학|복학|취업했|입사|퇴사|재직|월세로|전세로|본가로|독립했/;
    if (PROFILE_HINT.test(message) && !plan.intents.includes("profile_update")) {
      plan.intents = ["profile_update", ...plan.intents];
    }

    let reply = "정책 관련 질문이나 궁금한 지원제도를 물어봐 주세요. 예: \"국민취업지원제도 저 되나요?\"";
    let profile = initialProfile;

    let deterministic: Awaited<ReturnType<typeof applyProfilePatchDeterministically>> | null = null;
    if (plan.intents.includes("profile_update") && profileRowId) {
      // 1) 코드가 먼저 반영 (에이전트가 도구 호출을 건너뛰어도 DB는 바뀐다)
      deterministic = await applyProfilePatchDeterministically(userId, profileRowId, message.trim());
      // Policy Agent가 직전에 남긴 missing_information이 있으면 슬롯필링 우선순위로 넘겨준다
      // (finance/ 그래프의 missing_fields 전달과 동일 — 여기선 checkpointer 대신 DB에서 조회).
      const { data: lastMatch } = await db
        .from("user_policy_matches")
        .select("missing_information")
        .eq("user_id", userId)
        .eq("eligibility_status", "insufficient_info")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const missingFields = (lastMatch?.missing_information as string[] | undefined) ?? [];

      const profileReply = await runProfileAgent(userId, profileRowId, messages, missingFields);
      messages.push({ role: "assistant", content: profileReply });
      reply = profileReply;
      if (deterministic?.cleaned) {
        const shown = Object.entries(deterministic.cleaned).map(([k, v]) => `${k} → ${v}`).join(", ");
        reply += deterministic.personaLocked
          ? `\n\n✅ 반영됨(이 사용자에게만): ${shown}. 데모 페르소나의 기본 정보는 고정되어 있어 원본은 바뀌지 않고, 이후 추천·매칭은 변경된 값으로 계산됩니다.`
          : `\n\n✅ 프로필에 반영됨: ${shown}`;
      }
      // Policy Agent가 갱신된 프로필을 보게 다시 조회 (finance/ 그래프의 "갱신된 snapshot" 전달과 동일)
      profile = await resolveProfile({ userId, personaId, profileId });
    }

    if (plan.intents.includes("policy_search")) {
      const ctx: ProfileCtx = { userId, profileRow: profile.profileRow, financeRow: profile.financeRow };
      if (plan.policyMode === "compare") {
        reply = await runPolicyCompare(ctx, messages, plan.compareTargets ?? []);
      } else if (plan.policyMode === "lookup_and_check") {
        reply = await runPolicyLookup(ctx, messages, plan.policyQuery, plan.referenceMatchId);
      } else {
        reply = await runPolicySearch(ctx, profile.sido, messages, plan.policyQuery);
      }
    }

    await db.from("chat_messages").insert({ user_id: userId, role: "assistant", content: reply });

    return NextResponse.json({ reply, plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "채팅 처리 실패" }, { status: 502 });
  }
}
