import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveProfile } from "@/lib/profile";
import { planTurn } from "@/agents/orchestrator";
import { runPolicyCompare, runPolicyLookup, runPolicySearch } from "@/agents/policyAgent";
import { runProfileAgent } from "@/agents/profileAgent";
import type { ChatMessage } from "@/agents/state";
import type { ProfileCtx } from "@/agents/policyTools";

const HISTORY_LIMIT = 12;

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

    let reply = "정책 관련 질문이나 궁금한 지원제도를 물어봐 주세요. 예: \"국민취업지원제도 저 되나요?\"";
    let profile = initialProfile;

    if (plan.intents.includes("profile_update") && profileRowId) {
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
