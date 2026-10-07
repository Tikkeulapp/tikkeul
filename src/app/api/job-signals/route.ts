import { NextResponse } from "next/server";
import { recordJobKeywords, recordJobSignal } from "@/services/interests";

/**
 * POST /api/job-signals — 채용 관심 신호 기록 (공고 추천 순위·시뮬레이션 기본값용, 지원 자격 판단과 무관)
 * body: {userId, signal: "save"|"view", jobId} | {userId, signal: "keyword", keywords: string[]}
 */
export async function POST(request: Request) {
  let body: { userId?: string; signal?: string; jobId?: string; keywords?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { userId, signal, jobId, keywords } = body;
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다" }, { status: 400 });
  if ((signal === "save" || signal === "view") && jobId) {
    await recordJobSignal(userId, jobId, signal === "save" ? "job_save" : "job_view");
    return NextResponse.json({ ok: true });
  }
  if (signal === "keyword" && Array.isArray(keywords)) {
    await recordJobKeywords(userId, keywords.filter((k): k is string => typeof k === "string"));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "signal(save|view)+jobId 또는 signal=keyword+keywords가 필요합니다" }, { status: 400 });
}
