import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabase";
import { notifyPolicyDeadlines } from "@/services/notifications";
import { isAuthorizedCron } from "@/lib/cronAuth";

/** GET /api/cron/notify — 마감 임박 알림 (Vercel Cron 일 1회 / 수동 호출 가능).
 * /api/cron/discover와 같은 인증 패턴(CRON_SECRET). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: users, error } = await db.from("users").select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let usersChecked = 0;
  let remindersCreated = 0;
  for (const u of users ?? []) {
    usersChecked += 1;
    remindersCreated += await notifyPolicyDeadlines(u.user_id);
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), users_checked: usersChecked, reminders_created: remindersCreated });
}
