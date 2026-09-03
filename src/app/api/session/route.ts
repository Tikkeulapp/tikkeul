import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getPersona } from "@/data/personas";

/**
 * POST /api/session — 페르소나 선택 시 데모 사용자를 users 테이블에 생성.
 * 실서비스에서는 회원가입/로그인이 이 자리를 대체한다.
 */
export async function POST(request: Request) {
  let personaId: string;
  try {
    ({ personaId } = await request.json());
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const persona = getPersona(personaId);
  if (!persona) {
    return NextResponse.json({ error: `알 수 없는 페르소나: ${personaId}` }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .insert({ kind: "demo", persona_id: persona.id, nickname: persona.name })
    .select("user_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ userId: data.user_id, createdAt: data.created_at });
}
