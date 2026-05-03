/**
 * scripts/seed-aggregator-cron.ts
 *
 * Track B B7 — almanac tenant 의 6 cron jobs (AGGREGATOR + cleanup SQL) 시드.
 *
 * 사용법:
 *   wsl -- bash -lic 'cd ~/dev/ypserver-build && \
 *     DATABASE_URL="postgresql://postgres:...@localhost:5432/luckystyle4u?schema=public" \
 *     npx tsx scripts/seed-aggregator-cron.ts --tenant=almanac [--enabled]'
 *
 * - 기본: enabled=FALSE (B7 단계 — 코드 미배포 상태에서 cron 자동 가동 방지).
 * - --enabled: enabled=TRUE (B8 단계 — 운영자 승인 후 활성화).
 * - 멱등: (tenantId, name) composite unique 기반 upsert. 재실행 시 schedule/payload/enabled 만 동기화.
 *
 * 6 jobs (계획서 §3.2):
 *   - almanac-rss-fetch      (every 6h, AGGREGATOR rss-fetcher)
 *   - almanac-html-scrape    (every 6h, AGGREGATOR html-scraper)
 *   - almanac-api-poll       (every 6h, AGGREGATOR api-poller)
 *   - almanac-classify       (every 30m, AGGREGATOR classifier batch=50)
 *   - almanac-promote        (every 30m, AGGREGATOR promoter   batch=50)
 *   - almanac-cleanup        (0 3 * * *, AGGREGATOR module=cleanup, 30일 경과 rejected/duplicate 삭제)
 *
 * S84+ (2026-05-03): cleanup 이 SQL kind 였으나 cron runner.ts 의 SQL 핸들러가
 * runReadonly 풀을 사용해 DELETE 가 "cannot execute DELETE in a read-only
 * transaction" 으로 매번 FAILURE. AGGREGATOR module=cleanup 으로 이전
 * (aggregator/cleanup.ts).
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

  const tenant = get("tenant") ?? "almanac";
  const enabled = has("enabled");
  return { tenant, enabled };
}

interface CronJobSeed {
  name: string;
  schedule: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK" | "AGGREGATOR";
  payload: Prisma.InputJsonValue;
}

const ALMANAC_CRON_JOBS: CronJobSeed[] = [
  {
    name: "almanac-rss-fetch",
    schedule: "every 6h",
    kind: "AGGREGATOR",
    payload: { module: "rss-fetcher" },
  },
  {
    name: "almanac-html-scrape",
    schedule: "every 6h",
    kind: "AGGREGATOR",
    payload: { module: "html-scraper" },
  },
  {
    name: "almanac-api-poll",
    schedule: "every 6h",
    kind: "AGGREGATOR",
    payload: { module: "api-poller" },
  },
  {
    name: "almanac-classify",
    schedule: "every 30m",
    kind: "AGGREGATOR",
    payload: { module: "classifier", batch: 50 },
  },
  {
    name: "almanac-promote",
    schedule: "every 30m",
    kind: "AGGREGATOR",
    payload: { module: "promoter", batch: 50 },
  },
  {
    name: "almanac-cleanup",
    schedule: "0 3 * * *",
    kind: "AGGREGATOR",
    payload: { module: "cleanup" },
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
    `Aggregator cron seed — tenant=${tenant.slug} (id=${tenant.id})`,
  );
  console.log(`enabled flag: ${args.enabled ? "TRUE" : "FALSE"}`);
  console.log("─".repeat(60));

  const summary: Array<{ name: string; created: boolean; enabled: boolean }> =
    [];

  for (const job of ALMANAC_CRON_JOBS) {
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
      summary.push({
        name: job.name,
        created: false,
        enabled: args.enabled,
      });
      console.log(
        `  [UPDATE] ${job.name.padEnd(22)} ${job.schedule.padEnd(12)} enabled=${args.enabled}`,
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
      summary.push({
        name: job.name,
        created: true,
        enabled: args.enabled,
      });
      console.log(
        `  [CREATE] ${job.name.padEnd(22)} ${job.schedule.padEnd(12)} enabled=${args.enabled}`,
      );
    }
  }

  const created = summary.filter((s) => s.created).length;
  const updated = summary.length - created;
  console.log("─".repeat(60));
  console.log(
    `완료: ${summary.length}건 (신규 ${created} / 갱신 ${updated}) · enabled=${args.enabled}`,
  );
  if (!args.enabled) {
    console.log(
      "ℹ️  --enabled 미지정 — cron 은 비활성 상태로 시드됨. 활성화 시 재실행:",
    );
    console.log(
      `    npx tsx scripts/seed-aggregator-cron.ts --tenant=${tenant.slug} --enabled`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
