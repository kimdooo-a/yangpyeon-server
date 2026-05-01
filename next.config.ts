import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 배포 패키지 생성 — .next/standalone/server.js + 추적된 최소 node_modules
  // 기동: node .next/standalone/server.js (next start 아님 — 세션 3의 "next start 미동작"은 모드 특성)
  // 후처리 필수: .next/static 및 public/ 는 NFT 비추적 → 수동 복사 (scripts/pack-standalone.sh 참조)
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // s79 추가: filebox multipart 50MB part 가 Next.js 16 standalone router-server proxy 의 default 10MB body clone limit 에 걸려 truncate 되는 회귀 차단.
  // proxyClientMaxBodySize 미설정 시 router-server 의 cloneBodyStream → finalize() 가 잘린 buffer 로 원본 request body 를 replace 하여 route handler 가 truncated data 수신.
  // MAX_PART_SIZE=100MB (route 자체 cap) 와 동일값으로 설정.
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
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
