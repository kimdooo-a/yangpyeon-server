/**
 * scripts/seed-messenger-cron.ts
 *
 * S96 M5-ATTACH-2 — messenger 첨부 30일 dereference cron 시드.
 *
 * 사용법:
 *   wsl -- bash -lic 'cd ~/dev/ypserver-build && \
 *     DATABASE_URL="postgresql://postgres:...@localhost:5432/luckystyle4u?schema=public" \
 *     npx tsx scripts/seed-messenger-cron.ts --tenant=default [--enabled]'
 *
 * - 기본: enabled=FALSE (코드 미배포 상태에서 cron 자동 가동 방지).
 * - --enabled: enabled=TRUE (운영자 승인 후 활성화).
 * - 멱등: (tenantId, name) composite unique 기반 upsert. 재실행 시 schedule/payload/enabled 만 동기화.
 *
 * 1 job:
 *   - messenger-attachments-deref (0 4 * * *, AGGREGATOR module=messenger-attachments-deref)
 *     ADR-030 §Q8 (b) — 회수된 메시지의 첨부를 30일 경과 시 deref.
 *     매일 04:00 KST 실행. aggregator-cleanup (03:00) 와 시간 분산.
 */
import { prisma } from "@/lib/prisma";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import type { Prisma } from "@/generated/prisma/client";

interface CliArgs {
  tenant: string;
  enabled: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const get = (key: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${key}=`));
    return hit?.slice(key.length + 3);
  };
  const has = (key: string): boolean => argv.includes(`--${key}`);

  const tenant = get("tenant") ?? "default";
  const enabled = has("enabled");
  return { tenant, enabled };
}

interface CronJobSeed {
  name: string;
  schedule: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK" | "AGGREGATOR";
  payload: Prisma.InputJsonValue;
}

const MESSENGER_CRON_JOBS: CronJobSeed[] = [
  {
    name: "messenger-attachments-deref",
    schedule: "0 4 * * *",
    kind: "AGGREGATOR",
    payload: { module: "messenger-attachments-deref" },
  },
];

async function main() {
  const args = parseArgs();

  const tenant = await prisma.tenant.findUnique({
    where: { slug: args.tenant },
    select: { id: true, slug: true, status: true },
  });
  if (!tenant) {
    console.error(`tenant 미등록: slug=${args.tenant}`);
    process.exit(2);
  }
  if (tenant.status !== "active") {
    console.error(
      `tenant 비활성: slug=${tenant.slug} status=${tenant.status}`,
    );
    process.exit(2);
  }

  const ctx = { tenantId: tenant.id };
  const tenantPrisma = tenantPrismaFor(ctx);

  console.log("─".repeat(60));
  console.log(
    `Messenger cron seed — tenant=${tenant.slug} (id=${tenant.id})`,
  );
  console.log(`enabled flag: ${args.enabled ? "TRUE" : "FALSE"}`);
  console.log("─".repeat(60));

  for (const job of MESSENGER_CRON_JOBS) {
    const existing = await tenantPrisma.cronJob.findFirst({
      where: { tenantId: tenant.id, name: job.name },
      select: { id: true, enabled: true },
    });

    if (existing) {
      await tenantPrisma.cronJob.update({
        where: { id: existing.id },
        data: {
          schedule: job.schedule,
          kind: job.kind,
          payload: job.payload,
          enabled: args.enabled,
        },
      });
      console.log(
        `  [UPDATE] ${job.name.padEnd(30)} ${job.schedule.padEnd(12)} enabled=${args.enabled}`,
      );
    } else {
      await tenantPrisma.cronJob.create({
        data: {
          tenantId: tenant.id,
          name: job.name,
          schedule: job.schedule,
          kind: job.kind,
          payload: job.payload,
          enabled: args.enabled,
        },
      });
      console.log(
        `  [CREATE] ${job.name.padEnd(30)} ${job.schedule.padEnd(12)} enabled=${args.enabled}`,
      );
    }
  }

  console.log("─".repeat(60));
  console.log(`완료: ${MESSENGER_CRON_JOBS.length}건 · enabled=${args.enabled}`);
  if (!args.enabled) {
    console.log(
      "ℹ️  --enabled 미지정 — cron 은 비활성 상태로 시드됨. 활성화 시 재실행:",
    );
    console.log(
      `    npx tsx scripts/seed-messenger-cron.ts --tenant=${tenant.slug} --enabled`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
