/**
 * Notification Scheduler (finance/services/notification_scheduler.py 이식) — 이벤트/크론 기반, LLM 없음.
 */
import { supabaseAdmin } from "@/lib/supabase";

const DEADLINE_LEAD_DAYS = 7;

type Match = {
  user_id: string;
  policy_id: string;
  eligibility_status: string;
  status: string;
};

async function reminderExists(userId: string, policyId: string | null, eventId: string | null): Promise<boolean> {
  const db = supabaseAdmin();
  let q = db.from("reminders").select("reminder_id").eq("user_id", userId).neq("status", "failed").limit(1);
  if (policyId && eventId) q = q.or(`policy_id.eq.${policyId},event_id.eq.${eventId}`);
  else if (policyId) q = q.eq("policy_id", policyId);
  else if (eventId) q = q.eq("event_id", eventId);
  else return false;
  const { data } = await q;
  return !!data && data.length > 0;
}

/** 새 user_policy_matches 생성 시 호출 — 제외된 매칭은 알리지 않는다. */
export async function notifyNewMatch(match: Match): Promise<void> {
  if (match.eligibility_status === "excluded") return;
  if (await reminderExists(match.user_id, match.policy_id, null)) return;
  const db = supabaseAdmin();
  const { data: policy } = await db.from("policies").select("title").eq("policy_id", match.policy_id).maybeSingle();
  const title = policy?.title ?? match.policy_id;
  await db.from("reminders").insert({
    user_id: match.user_id,
    policy_id: match.policy_id,
    remind_at: new Date().toISOString(),
    message: `[정책 매칭] '${title}' 관련 새 추천이 있습니다.`,
  });
}

/** 크론 — 사용자의 추천/적용 매칭 중 정책 마감이 임박한 것에 알림. */
export async function notifyPolicyDeadlines(userId: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: matches } = await db
    .from("user_policy_matches")
    .select("policy_id, status")
    .eq("user_id", userId)
    .in("status", ["recommended", "applied"])
    .order("checked_at", { ascending: false })
    .limit(50);

  const seen = new Set<string>();
  let created = 0;
  const today = new Date();
  for (const m of matches ?? []) {
    if (seen.has(m.policy_id)) continue;
    seen.add(m.policy_id);
    const { data: policy } = await db.from("policies").select("title, end_date").eq("policy_id", m.policy_id).maybeSingle();
    if (!policy?.end_date) continue;
    const daysLeft = Math.floor((new Date(policy.end_date).getTime() - today.getTime()) / 86_400_000);
    if (daysLeft < 0 || daysLeft > DEADLINE_LEAD_DAYS) continue;
    if (await reminderExists(userId, m.policy_id, null)) continue;
    await db.from("reminders").insert({
      user_id: userId,
      policy_id: m.policy_id,
      remind_at: new Date().toISOString(),
      message: `[마감 임박] '${policy.title}' 신청 마감이 ${policy.end_date}입니다.`,
    });
    created += 1;
  }
  return created;
}

/** Calendar Agent/이벤트 등록 트리거 — 일정이 임박하면 알림. */
export async function notifyCalendarEvent(
  event: { event_id: string; user_id: string; title: string; start_at: string },
  leadDays = 3,
): Promise<void> {
  const daysLeft = Math.floor((new Date(event.start_at).getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0 || daysLeft > leadDays) return;
  if (await reminderExists(event.user_id, null, event.event_id)) return;
  await supabaseAdmin().from("reminders").insert({
    user_id: event.user_id,
    event_id: event.event_id,
    remind_at: new Date().toISOString(),
    message: `[일정 알림] '${event.title}' 일정이 곧 시작됩니다.`,
  });
}
