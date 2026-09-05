import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const FIELDS = new Set(["region_sido", "education_status", "employment_status"]);

/** GET /api/profile-change?userId=… — 사용자의 프로필 변경 이력 */
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("profile_changes")
    .select("id, field, old_value, new_value, effective_from, source_event, status, created_at")
    .eq("user_id", userId)
    .order("effective_from", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changes: data });
}

/** POST /api/profile-change — 상태 변화 적용 (이사·졸업·퇴사 등) */
export async function POST(request: Request) {
  let b: { userId?: string; field?: string; oldValue?: string | null; newValue?: string; effectiveFrom?: string; sourceEvent?: string };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  if (!b.userId || !b.field || !b.newValue || !b.effectiveFrom) {
    return NextResponse.json({ error: "userId, field, newValue, effectiveFrom은 필수입니다" }, { status: 400 });
  }
  if (!FIELDS.has(b.field)) return NextResponse.json({ error: `지원하지 않는 필드: ${b.field}` }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.effectiveFrom)) {
    return NextResponse.json({ error: "effectiveFrom은 YYYY-MM-DD" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("profile_changes")
    .insert({
      user_id: b.userId,
      field: b.field,
      old_value: b.oldValue ?? null,
      new_value: b.newValue,
      effective_from: b.effectiveFrom,
      source_event: b.sourceEvent ?? null,
      status: "applied",
    })
    .select("id, field, old_value, new_value, effective_from, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ change: data });
}
