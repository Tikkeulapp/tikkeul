/**
 * GET /api/jobs/probe-seoul?svc=GetJobInfo — 서울 열린데이터광장 API 접속성 검증 (임시 진단용)
 * 이 저장소가 도는 서버에서는 8088 포트가 막혀 있어, Vercel(배포 환경)에서 실제로 호출되는지
 * 직접 확인하기 위한 라우트. 서울시 API는 "sample" 키로 5행까지 테스트 호출을 허용한다.
 * 검증 끝나면 제거 예정.
 */
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function GET(request: Request) {
  const u = new URL(request.url);
  const svc = (u.searchParams.get("svc") ?? "GetJobInfo").replace(/[^A-Za-z0-9_]/g, "");
  const key = (u.searchParams.get("key") ?? "sample").replace(/[^A-Za-z0-9]/g, "");
  const target = `http://openapi.seoul.go.kr:8088/${key}/json/${svc}/1/3/`;
  const started = Date.now();
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* XML 등 */ }
    const root = (parsed ?? {}) as Record<string, Record<string, unknown>>;
    const svcKey = Object.keys(root)[0];
    const body = svcKey ? root[svcKey] : null;
    const rows = (body?.row as Record<string, unknown>[] | undefined) ?? [];
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      target,
      resultMessage: (body?.RESULT as Record<string, unknown> | undefined)?.MESSAGE ?? (root?.RESULT as Record<string, unknown> | undefined)?.MESSAGE ?? null,
      totalCount: body?.list_total_count ?? null,
      firstRowFields: rows[0] ? Object.keys(rows[0]) : [],
      firstRow: rows[0] ?? null,
      rawHead: parsed ? undefined : text.slice(0, 300),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, target, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) });
  }
}
