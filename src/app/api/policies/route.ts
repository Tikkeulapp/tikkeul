/**
 * GET /api/policies?ids=a,b,c — 정책 기본정보 조회 (마이티끌에 담긴 DB 정책 카드 렌더용)
 * 최대 50건. 원문(search_text)은 600자까지만 내려준다.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  if (!ids.length) return NextResponse.json({ policies: [] });

  const { data, error } = await supabaseAdmin()
    .from("policies")
    .select("policy_id, source, title, provider, theme, region_sidos, is_national, end_date, always_open, apply_url, income_condition, search_text")
    .in("policy_id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const policies = (data ?? []).map((p) => ({
    ...p,
    search_text: typeof p.search_text === "string" ? p.search_text.slice(0, 600) : null,
  }));
  return NextResponse.json({ policies });
}
