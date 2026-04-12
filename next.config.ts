import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // pg_dump 바이너리는 런타임 spawn 호출이라 NFT 추적 불가 — 전역 프로젝트 스캔으로 번짐
  // 백업 라우트와 SQLite Drizzle 마이그레이션 경로만 외부 의존으로 명시 제외
  outputFileTracingExcludes: {
    "/api/v1/backups": ["**/pg_dump*", "**/node_modules/@prisma/engines/**"],
    "/api/v1/backups/[filename]/download": ["**/pg_dump*"],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
