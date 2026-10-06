import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabase";

/** GET /api/reminders?userId=... — 인앱 알림 노출. 실제 이메일/푸시 발송 채널은 범위 밖. */
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("reminders")
    .select("reminder_id, policy_id, event_id, remind_at, message, status")
    .eq("user_id", userId)
    .order("remind_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 조회 즉시 "인앱 노출 완료"로 표시 — 발송 채널이 없으니 pending -> sent만 여기서 전이
  const pendingIds = (data ?? []).filter((r) => r.status === "pending").map((r) => r.reminder_id);
  if (pendingIds.length > 0) {
    await supabaseAdmin().from("reminders").update({ status: "sent" }).in("reminder_id", pendingIds);
  }

  return NextResponse.json({ reminders: data ?? [] });
}
