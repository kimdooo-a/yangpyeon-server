#!/usr/bin/env node
// 세션 45 — HS256 legacy 제거 전 활성 세션 및 JWKS 현황 확인
// 사용: node scripts/session45-active-sessions.cjs (WSL2 ~/dashboard 에서)

const path = require('path');
const { PrismaClient } = require(path.join(process.cwd(), 'src/generated/prisma/client'));

(async () => {
  const p = new PrismaClient();
  try {
    const sessions = await p.$queryRaw`
      SELECT id, user_id,
             substr(token_hash, 1, 12) AS token_prefix,
             revoked_at::text AS revoked_at,
             expires_at::text AS expires_at,
             created_at::text AS created_at
      FROM sessions
      WHERE revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 30
    `;
    const jwks = await p.$queryRaw`
      SELECT kid,
             created_at::text AS created_at,
             retired_at::text AS retired_at
      FROM "SigningKey"
      ORDER BY created_at DESC
    `;
    console.log(JSON.stringify({ active_sessions: sessions, jwks_keys: jwks }, null, 2));
  } finally {
    await p.$disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
