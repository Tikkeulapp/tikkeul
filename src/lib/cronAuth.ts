/**
 * 크론 엔드포인트 인증 — Vercel Cron은 CRON_SECRET이 설정돼 있으면
 * `Authorization: Bearer <CRON_SECRET>` 헤더를 붙여 호출한다.
 * 시크릿이 없으면 통과시킨다: 미설정 상태에서도 Vercel Cron이 헤더 없이 호출해 동작하도록.
 * (대신 이 상태에선 누구나 호출 가능 — 운영에선 Vercel에 CRON_SECRET을 등록할 것)
 */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}
