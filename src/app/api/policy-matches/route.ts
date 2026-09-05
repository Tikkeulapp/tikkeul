import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type MatchRow = {
  match_id: string;
  policy_id: string;
  match_mode: string;
  eligibility_status: string;
  match_score: number | null;
  reason: string | null;
  status: string;
  missing_information: string[];
  checked_at: string;
};

/** GET /api/policy-matches?userId=... — 마이티끌(찜) 목록 + 과거 판정 이력.
 * 정책별 최신 1건만 반환 (같은 정책을 여러 번 판정했을 수 있으므로). */
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("user_policy_matches")
    .select("match_id, policy_id, match_mode, eligibility_status, match_score, reason, status, missing_information, checked_at")
    .eq("user_id", userId)
    .order("checked_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latestByPolicy = new Map<string, MatchRow>();
  for (const row of (data ?? []) as MatchRow[]) {
    if (!latestByPolicy.has(row.policy_id)) latestByPolicy.set(row.policy_id, row);
  }
  return NextResponse.json({ matches: [...latestByPolicy.values()] });
}

/** POST /api/policy-matches — 마이티끌 담기/빼기.
 * body: {userId, policyId, action: "save"|"remove"}
 * "담기"는 아직 AI 판정을 안 거쳤을 수 있어(자세히보기 없이 바로 담기) eligibility_status를
 * insufficient_info로 두고 status만 recommended로 표시한다 — 실제 자격은 /api/relevance가 갱신한다.
 * match_mode는 항상 lookup_and_check로 남긴다 — "search"는 event-match처럼 AI가 여러 후보를
 * 먼저 제안하는 흐름 전용이고, 마이티끌은 사용자가 정책 1건을 직접 고른 행위라 의미가 다르다
 * (프론트에서 마이티끌 목록을 계산할 때 match_mode==='search'인 행은 제외한다).
 * 기존 행이 있으면(이미 판정된 적 있으면) 새로 만들지 않고 status만 바꾼다. */
export async function POST(request: Request) {
  let body: { userId?: string; policyId?: string; action?: "save" | "remove" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, policyId, action } = body;
  if (!userId || !policyId || (action !== "save" && action !== "remove")) {
    return NextResponse.json({ error: "userId, policyId, action(save|remove)은 필수입니다" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("user_policy_matches")
    .select("match_id")
    .eq("user_id", userId)
    .eq("policy_id", policyId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (action === "remove") {
    if (!existing) return NextResponse.json({ ok: true });
    const { error } = await db.from("user_policy_matches").update({ status: "dismissed" }).eq("match_id", existing.match_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (existing) {
    const { error } = await db.from("user_policy_matches").update({ status: "recommended" }).eq("match_id", existing.match_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const { error } = await db.from("user_policy_matches").insert({
    user_id: userId,
    policy_id: policyId,
    match_mode: "lookup_and_check",
    eligibility_status: "insufficient_info",
    reason: "사용자가 직접 담음 (AI 판정 전)",
    status: "recommended",
    missing_information: [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
