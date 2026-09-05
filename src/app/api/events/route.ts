import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyCalendarEvent } from "@/lib/notifications";

/** GET /api/events?userId=... — 해당 사용자의 캘린더 일정 목록 */
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("user_calendar")
    .select("event_id, title, start_at, location, event_type, source, created_at")
    .eq("user_id", userId)
    .order("start_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

/** POST /api/events — 사용자가 직접 입력한 일정 저장 */
export async function POST(request: Request) {
  let body: { userId?: string; date?: string; title?: string; location?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, date, title, location } = body;
  if (!userId || !date || !title?.trim()) {
    return NextResponse.json({ error: "userId, date, title은 필수입니다" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date는 YYYY-MM-DD 형식이어야 합니다" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("user_calendar")
    .insert({
      user_id: userId,
      start_at: date,
      title: title.trim(),
      location: location?.trim() || null,
      source: "user",
    })
    .select("event_id, title, start_at, location, event_type, source, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // user_calendar 갱신 -> Notification Scheduler 트리거 (select 절에 user_id가 없어 별도로 넘김)
  await notifyCalendarEvent({ ...data, user_id: userId });
  return NextResponse.json({ event: data });
}
