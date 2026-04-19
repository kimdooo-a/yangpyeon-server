// 세션 43 — Prisma ORM parsing-side TZ 시프트 재현 스크립트 (tsx 실행)
//
// 목적: `prisma.X.findMany({ select: { createdAt: true } })` 가 반환하는 Date 의 toISOString() 가
//       실제 DB 저장값(epoch) 대비 9h 시프트되는지 검증.
//       세션 41/42 CK 의 "parsing-side 시프트 잔존" 가설에 대한 실측.
//
// 실행: wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && \
//         npx tsx /mnt/e/00_develop/260406_luckystyle4u_server/scripts/session43-parsing-repro.ts"

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 미설정");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

interface RawUserRow {
  id: string;
  email: string;
  created_at_text: string;
  updated_at_text: string;
  created_epoch: bigint;
  updated_epoch: bigint;
}

(async () => {
  const ormRows = await prisma.user.findMany({
    select: { id: true, email: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  const rawRows = await prisma.$queryRaw<RawUserRow[]>`
    SELECT id, email,
           (created_at::text) AS created_at_text,
           (updated_at::text) AS updated_at_text,
           EXTRACT(EPOCH FROM created_at)::BIGINT AS created_epoch,
           EXTRACT(EPOCH FROM updated_at)::BIGINT AS updated_epoch
    FROM users
    ORDER BY created_at ASC
    LIMIT 2
  `;

  console.log("=== ORM findMany (parsing-side) ===");
  for (const r of ormRows) {
    console.log(
      JSON.stringify({
        id: r.id.slice(0, 8),
        email: r.email,
        ormCreatedIso: r.createdAt.toISOString(),
        ormUpdatedIso: r.updatedAt.toISOString(),
      })
    );
  }

  console.log("=== raw ::text + EPOCH (authoritative) ===");
  for (const r of rawRows) {
    console.log(
      JSON.stringify({
        id: r.id.slice(0, 8),
        email: r.email,
        rawCreatedText: r.created_at_text,
        rawUpdatedText: r.updated_at_text,
        epochIsoCreated: new Date(Number(r.created_epoch) * 1000).toISOString(),
        epochIsoUpdated: new Date(Number(r.updated_epoch) * 1000).toISOString(),
      })
    );
  }

  console.log("=== diff (ms) between ORM vs EPOCH ===");
  for (let i = 0; i < ormRows.length; i++) {
    const ormMs = ormRows[i].createdAt.getTime();
    const epochMs = Number(rawRows[i].created_epoch) * 1000;
    const diffMs = ormMs - epochMs;
    console.log(
      JSON.stringify({
        id: ormRows[i].id.slice(0, 8),
        diffMs,
        diffHours: diffMs / 3_600_000,
      })
    );
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
