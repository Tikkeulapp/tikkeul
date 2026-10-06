import type { NextConfig } from "next";

/** 기본 보안 헤더. CSP는 외부 폰트 CDN·인라인 스크립트 영향 검토 전이라 아직 넣지 않는다.
 *  HSTS는 Vercel이 기본으로 붙인다. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
