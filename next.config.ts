import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // 백업 라우트에서 pg_dump 바이너리/Prisma 엔진을 번들에서 제외 (NFT cosmetic 경고는 잔존 — Turbopack이 동적 fs 연산을 보수적으로 추적하는 구조적 한계)
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
