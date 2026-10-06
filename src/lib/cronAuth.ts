/**
 * 크론 엔드포인트 인증 — Vercel Cron은 CRON_SECRET이 설정돼 있으면
 * `Authorization: Bearer <CRON_SECRET>` 헤더를 붙여 호출한다.
 * 시크릿이 없으면 거부한다(fail-closed): 설정 누락이 곧 공개 엔드포인트가 되지 않게.
 */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}
