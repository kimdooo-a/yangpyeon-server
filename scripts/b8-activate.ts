/**
 * B8 helper — almanac 5 소스 + 6 cron job 일괄 활성화 (또는 비활성화 롤백).
 *
 * 사용:
 *   npx tsx scripts/b8-activate.ts                 # 활성화 (active=TRUE / enabled=TRUE)
 *   npx tsx scripts/b8-activate.ts --rollback     # 비활성화 (active=FALSE / enabled=FALSE)
 *
 * 5 소스 선정 (Track B B8 wave-wiggly-axolotl 가이드):
 *   - anthropic-news  (RSS en build)
 *   - openai-blog     (RSS en build)
 *   - vercel-blog     (RSS en build)
 *   - toss-tech       (RSS ko build — B3 한글 boundary 라이브 검증)
 *   - hn-algolia-front(API en community — fetchers/api.ts 라이브 검증)
 */
import { prisma } from "@/lib/prisma";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";

const SELECTED_SOURCES = [
  "anthropic-news",
  "openai-blog",
  "vercel-blog",
  "toss-tech",
  "hn-algolia-front",
];

async function main() {
  const rollback = process.argv.includes("--rollback");
  const active = !rollback;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: "almanac" },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    console.error("almanac tenant 미등록");
    process.exit(2);
  }
  const tp = tenantPrismaFor({ tenantId: tenant.id });

  console.log("─".repeat(60));
  console.log(`B8 ${rollback ? "ROLLBACK" : "ACTIVATE"} — tenant=${tenant.slug}`);
  console.log("─".repeat(60));

  const sourceResult = await tp.contentSource.updateMany({
    where: { tenantId: tenant.id, slug: { in: SELECTED_SOURCES } },
    data: { active, consecutiveFailures: 0 },
  });
  console.log(
    `[sources] ${SELECTED_SOURCES.length}건 대상 → ${sourceResult.count}건 active=${active}`,
  );
  for (const s of SELECTED_SOURCES) {
    const row = await tp.contentSource.findFirst({
      where: { tenantId: tenant.id, slug: s },
      select: { slug: true, kind: true, active: true, country: true },
    });
    if (row) {
      console.log(
        `  ${row.active ? "ON " : "OFF"} ${row.kind.padEnd(10)} ${row.country?.padEnd(4) ?? "    "} ${row.slug}`,
      );
    } else {
      console.log(`  --- (slug=${s} 미존재 — 건너뜀)`);
    }
  }

  const cronResult = await tp.cronJob.updateMany({
    where: { tenantId: tenant.id, name: { startsWith: "almanac-" } },
    data: { enabled: active, consecutiveFailures: 0, circuitState: "CLOSED" },
  });
  console.log(
    `[cron jobs] almanac-* → ${cronResult.count}건 enabled=${active}`,
  );
  const jobs = await tp.cronJob.findMany({
    where: { tenantId: tenant.id, name: { startsWith: "almanac-" } },
    select: { name: true, schedule: true, kind: true, enabled: true },
    orderBy: { name: "asc" },
  });
  for (const j of jobs) {
    console.log(
      `  ${j.enabled ? "ON " : "OFF"} ${j.kind.padEnd(11)} ${j.schedule.padEnd(12)} ${j.name}`,
    );
  }

  console.log("─".repeat(60));
  if (active) {
    console.log("✅ 활성화 완료. 다음 cron tick 부터 fetch 시작.");
    console.log(
      "   매 6h fetch / 매 30m classify+promote / 매일 3am cleanup.",
    );
    console.log(
      "   롤백: npx tsx scripts/b8-activate.ts --rollback",
    );
  } else {
    console.log("✅ 롤백 완료. cron 비활성, 소스 비활성.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
