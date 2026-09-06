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
import { ELIGIBILITY_CONDITIONS_NOT_DEFINED } from "@/lib/eligibility";

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
규칙: 발화에 없는 값은 null. 추측 금지. "다음주에 ○○로 이사가는데"처럼 확정된 예정 변경은 변경으로 본다. 단순 질문("안양에 뭐 있어?")이나 희망("이사 가고 싶다", "가면 어때")만 null. 시·군·구만 말했으면 그 지역의 시·도를 region_sido에 채운다(안양시→경기도, 영등포구→서울특별시).`;
const TRACKED = new Set(["region_sido", "education_status", "employment_status"]);

/** 발화의 시점 표현 → 적용일 (다음주/다음달/내일/N일 후). 없으면 오늘 */
function effectiveDateFrom(message: string): string {
  const d = new Date();
  if (/다음\s*주|내주/.test(message)) d.setDate(d.getDate() + 7);
  else if (/다음\s*달|내달/.test(message)) d.setMonth(d.getMonth() + 1);
  else if (/내일/.test(message)) d.setDate(d.getDate() + 1);
  else { const m = message.match(/(\d{1,2})\s*일\s*(후|뒤)/); if (m) d.setDate(d.getDate() + Number(m[1])); }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function applyProfilePatchDeterministically(userId: string, profileRowId: string, message: string) {
  let patch: ProfilePatch = { region_sido: null, region_sigungu: null, employment_status: null, education_status: null, housing_type: null };
  try {
    patch = await groqJson<ProfilePatch>(PATCH_SYSTEM, `발화: "${message}"`, 600);
  } catch { /* 아래 정규식 폴백 */ }
  // 정규식 폴백: "서울 영등포구로 이사", "경기도 안양으로 이주" — LLM이 놓쳐도 지역 변경은 잡는다
  if (!patch.region_sido) {
    const m = message.match(/(서울특별시|서울|경기도|경기|부산광역시|부산|대구광역시|대구|인천광역시|인천|광주광역시|광주|대전광역시|대전|울산광역시|울산|세종특별자치시|세종|강원특별자치도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주)\s*([가-힣]{1,6}?(?:시|구|군))?\s*(?:으로|로|에)\s*(?:이사|이주|전입|옮)/);
    if (m) { patch.region_sido = m[1]; if (m[2]) patch.region_sigungu = m[2]; }
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
  const today = effectiveDateFrom(message); // "다음주에 이사" → 그 시점부터 적용 (그 전까지는 예정 변화)
  const isFuture = today > new Date().toISOString().slice(0, 10);
  if (!isPersona && !isFuture) {
    const { error } = await db.from("profile_survey").update(cleaned).eq("id", profileRowId);
    if (error) return { applied: [] as string[], error: error.message };
  }
  const applied: string[] = [];
  for (const [field, newValue] of Object.entries(cleaned)) {
    if (!TRACKED.has(field)) { applied.push(field); continue; }
    // 같은 값이 이미 최신 이력이면 중복 기록하지 않는다
    const { data: last } = await db.from("profile_changes").select("new_value").eq("user_id", userId).eq("field", field).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.new_value === newValue) { applied.push(field); continue; }
    await db.from("profile_changes").insert({ user_id: userId, field, old_value: null, new_value: newValue, effective_from: today, source_event: "chat:deterministic", status: "applied" });
    applied.push(field);
  }
  return { applied, cleaned, personaLocked: isPersona, effectiveFrom: today, isFuture };
}

/** 이사 발화면 일정 매칭 엔진(event-match)의 이사 델타를 그대로 가져와 "새 지역에서 열리는/사라지는 혜택"을 답변에 넣는다 */
async function moveDeltaReply(origin: string, body: { userId: string; personaId?: string | null; profileId?: string | null }, message: string, effectiveFrom: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/api/event-match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, title: message, date: effectiveFrom }) });
    if (!res.ok) return null;
    const j = (await res.json()) as { recommendations?: { title: string; provider: string | null; benefit_summary: string; apply_url: string | null }[]; regionChange?: { from: string | null; to: string; opening: { title: string; provider: string | null; reason: string; apply_url: string | null }[]; closing: { title: string; reason: string }[]; openingTotal: number } | null };
    const rc = j.regionChange;
    const lines: string[] = [];
    if (rc) {
      lines.push(`🏠 **${rc.from ?? "현 거주지"} → ${rc.to} 이사**를 기준으로 정책 DB를 비교했습니다 (적용 ${effectiveFrom.slice(5).replace("-", "/")}부터).`);
      if (rc.opening.length) { lines.push(`\n🟢 **${rc.to}로 가면 새로 열리는 혜택** (${rc.opening.length}건 · 지역 정책 ${rc.openingTotal}건 중)`); for (const o of rc.opening) lines.push(`- **${o.title}**${o.provider ? ` · ${o.provider}` : ""} — ${o.reason}${o.apply_url ? ` [신청](${o.apply_url})` : ""}`); }
      if (rc.closing.length) { lines.push(`\n🔴 **${rc.from}을(를) 떠나면 사라지는 혜택** (${rc.closing.length}건)`); for (const c of rc.closing) lines.push(`- **${c.title}** — ${c.reason}`); lines.push("💡 이사 전에 신청 가능한 것은 지금 챙겨두세요."); }
    }
    if (j.recommendations?.length) { lines.push(`\n📦 **이사 자체에 붙는 혜택**`); for (const r of j.recommendations) lines.push(`- **${r.title}**${r.provider ? ` · ${r.provider}` : ""} — ${r.benefit_summary}${r.apply_url ? ` [신청](${r.apply_url})` : ""}`); }
    return lines.length ? lines.join("\n") : null;
  } catch {
    return null;
  }
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
    let skipPolicySearchIfEmpty = false; // 이사 델타가 이미 답에 들어갔으면 "찾지 못했습니다"로 덮어쓰지 않는다
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
      // eligibility_conditions_not_defined는 "이 정책에 자격조건이 등록 안 됐다"는 정책 쪽
      // sentinel이지 profile_survey/finance의 실제 필드가 아니다 — 그대로 넘기면 Profile Agent가
      // 이걸 진짜 슬롯필링 대상으로 착각해 사용자에게 "자격 조건을 알려주세요"라고 되묻는다.
      const missingFields = ((lastMatch?.missing_information as string[] | undefined) ?? []).filter(
        (f) => f !== ELIGIBILITY_CONDITIONS_NOT_DEFINED,
      );

      const deferUntil = deterministic?.isFuture ? deterministic.effectiveFrom : null;
      const profileReply = await runProfileAgent(userId, profileRowId, messages, missingFields, deferUntil);
      messages.push({ role: "assistant", content: profileReply });
      reply = profileReply;
      if (deterministic?.cleaned) {
        const FIELD_LABELS: Record<string, string> = { region_sido: "거주지(시·도)", region_sigungu: "거주지(시·군·구)", employment_status: "취업상태", education_status: "학력", housing_type: "주거형태" };
        const shown = Object.entries(deterministic.cleaned).map(([k, v]) => `${FIELD_LABELS[k] ?? k} → ${v}`).join(", ");
        const when = deterministic.isFuture ? ` (${deterministic.effectiveFrom.slice(5).replace("-", "/")}부터 적용 예정)` : "";
        reply += deterministic.personaLocked
          ? `\n\n✅ 반영됨(이 사용자에게만)${when}: ${shown}. 데모 페르소나의 기본 정보는 고정되어 있어 원본은 바뀌지 않고, 이후 추천·매칭은 변경된 값으로 계산됩니다.`
          : `\n\n✅ 프로필에 반영됨${when}: ${shown}`;
        // 이사면 새 지역에서 바뀌는 혜택(델타)을 코드가 붙인다 — "바뀌는 게 있어?" 질문의 실제 답
        if (deterministic.cleaned.region_sido && /이사|이주|전입/.test(message)) {
          const delta = await moveDeltaReply(new URL(request.url).origin, { userId, personaId, profileId }, message.trim(), deterministic.effectiveFrom);
          if (delta) { reply += `\n\n${delta}`; skipPolicySearchIfEmpty = true; }
        }
      }
      // Policy Agent가 갱신된 프로필을 보게 다시 조회 (finance/ 그래프의 "갱신된 snapshot" 전달과 동일)
      profile = await resolveProfile({ userId, personaId, profileId });
    }

    if (plan.intents.includes("policy_search")) {
      const ctx: ProfileCtx = { userId, profileRow: profile.profileRow, financeRow: profile.financeRow };
      const prior = plan.intents.includes("profile_update") ? reply : null; // 프로필 반영·이사 델타 답변은 유지
      let policyReply: string;
      if (plan.policyMode === "compare") {
        policyReply = await runPolicyCompare(ctx, messages, plan.compareTargets ?? []);
      } else if (plan.policyMode === "lookup_and_check") {
        policyReply = await runPolicyLookup(ctx, profile.sido, messages, plan.policyQuery, plan.referenceMatchId);
      } else {
        policyReply = await runPolicySearch(ctx, profile.sido, messages, plan.policyQuery);
        if (/답변을 정리하는 중 문제/.test(policyReply)) policyReply = await runPolicySearch(ctx, profile.sido, messages, plan.policyQuery); // 모델이 빈 답을 낸 경우 1회 재시도
      }
      if (skipPolicySearchIfEmpty && /찾지 못했/.test(policyReply)) policyReply = ""; // 델타가 이미 답이므로 빈 결과로 덮어쓰지 않음
      reply = [prior, policyReply].filter(Boolean).join("\n\n");
    }

    await db.from("chat_messages").insert({ user_id: userId, role: "assistant", content: reply });

    return NextResponse.json({ reply, plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "채팅 처리 실패" }, { status: 502 });
  }
}
