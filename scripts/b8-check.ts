/**
 * B8 helper — cron + source 1차 상태 점검 (활성화 직후 ~1분 후 실행 권장).
 */
import { prisma } from "@/lib/prisma";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";

async function main() {
  const t = await prisma.tenant.findUnique({
    where: { slug: "almanac" },
    select: { id: true },
  });
  if (!t) {
    console.error("almanac tenant 미존재");
    process.exit(2);
  }
  const tp = tenantPrismaFor({ tenantId: t.id });

  const jobs = await tp.cronJob.findMany({
    where: { tenantId: t.id, name: { startsWith: "almanac-" } },
    select: {
      name: true,
      enabled: true,
      lastRunAt: true,
      lastStatus: true,
      consecutiveFailures: true,
      circuitState: true,
    },
    orderBy: { name: "asc" },
  });
  const ingested = await tp.contentIngestedItem.count({
    where: { tenantId: t.id },
  });
  const items = await tp.contentItem.count({ where: { tenantId: t.id } });
  const sources = await tp.contentSource.findMany({
    where: { tenantId: t.id, active: true },
    select: {
      slug: true,
      lastFetchedAt: true,
      lastSuccessAt: true,
      consecutiveFailures: true,
      lastError: true,
    },
    orderBy: { slug: "asc" },
  });

  console.log("=== cron jobs ===");
  for (const j of jobs) {
    const last = j.lastRunAt?.toISOString().slice(11, 19) ?? "never";
    console.log(
      `  ${j.name.padEnd(22)} en=${j.enabled} last=${last} status=${j.lastStatus ?? "-"} fails=${j.consecutiveFailures} circ=${j.circuitState}`,
    );
  }
  console.log("=== sources active ===");
  for (const s of sources) {
    const fetched = s.lastFetchedAt?.toISOString().slice(11, 19) ?? "never";
    const success = s.lastSuccessAt?.toISOString().slice(11, 19) ?? "never";
    const err = s.lastError?.slice(0, 80) ?? "-";
    console.log(
      `  ${s.slug.padEnd(20)} fetched=${fetched} success=${success} fails=${s.consecutiveFailures} err=${err}`,
    );
  }
  console.log("=== counts ===");
  console.log(`  ingested=${ingested}  items=${items}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
