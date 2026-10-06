import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabase";
import { notifyCalendarEvent } from "@/services/notifications";

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

  // 멱등 등록: 같은 (사용자, 날짜, 제목) 일정이 이미 있으면 새로 만들지 않고 그 행을 돌려준다 —
  // 공고 '캘린더에 담기'를 새로고침 후 다시 눌러도 중복 행이 쌓이지 않게.
  const { data: existing } = await supabaseAdmin()
    .from("user_calendar")
    .select("event_id, title, start_at, location, event_type, source, created_at")
    .eq("user_id", userId)
    .eq("start_at", date)
    .eq("title", title.trim())
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ event: existing, deduped: true });

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

/** DELETE /api/events?eventId=...&userId=... — 사용자가 등록한 일정 삭제 (본인 것만) */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const userId = url.searchParams.get("userId");
  if (!eventId || !userId) return NextResponse.json({ error: "eventId, userId가 필요합니다" }, { status: 400 });
  // reminders.event_id가 user_calendar를 참조(FK)하므로, 알림이 붙은 일정(공고 마감 등)은
  // 알림을 먼저 지워야 한다 — 안 지우면 409로 삭제가 실패해 일정이 지워지지 않는 버그가 된다.
  const { error: remErr } = await supabaseAdmin()
    .from("reminders")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (remErr) return NextResponse.json({ error: remErr.message }, { status: 500 });
  const { error, count } = await supabaseAdmin()
    .from("user_calendar")
    .delete({ count: "exact" })
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
