import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const FIELDS = new Set(["region_sido", "region_sigungu", "birth_date", "education_status", "employment_status", "income_bracket", "asset_bracket", "housing_type"]);

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

/** DELETE /api/profile-change?userId=… — 이 사용자의 변경 이력을 전부 지워 페르소나 원본 기본값으로
 * 되돌린다. 페르소나는 profile_survey 원본을 건드리지 않고 이 이력만으로 덮어써 왔으므로(resolveProfile
 * 참고), 이력을 지우면 자동으로 코드에 박힌 초기값이 다시 보인다. 직접입력 회원은 이 이력이 감사로그일
 * 뿐 profile_survey 원본이 이미 갱신돼 있어 되돌릴 "초기값"이 없다 — 프론트에서 페르소나에만 노출한다. */
export async function DELETE(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  const { error } = await supabaseAdmin().from("profile_changes").delete().eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
