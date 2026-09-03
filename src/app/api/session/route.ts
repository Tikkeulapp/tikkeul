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

  // 페르소나의 초기 일정을 캘린더에 시드 (source='seed')
  const seedRows = persona.seedEvents.map((e) => ({
    user_id: data.user_id,
    start_at: e.date,
    title: e.title,
    location: e.location ?? null,
    source: "seed",
  }));
  const seedRes = await db.from("user_calendar").insert(seedRows);
  if (seedRes.error) {
    // 시드 실패는 치명적이지 않음 — 사용자 생성은 유지하고 경고만
    console.error("seed events 실패:", seedRes.error.message);
  }

  return NextResponse.json({ userId: data.user_id, createdAt: data.created_at });
}
