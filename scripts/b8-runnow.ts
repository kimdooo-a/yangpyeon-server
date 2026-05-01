/**
 * B8 helper — almanac-rss-fetch 즉시 1회 실행 (스케줄 무시).
 * cron registry runNow() 사용. AGGREGATOR dispatch + RSS fetcher + dedupe + INSERT 전 경로 라이브 검증.
 *
 * 사용:
 *   npx tsx scripts/b8-runnow.ts [job-name]
 *   기본 job: almanac-rss-fetch
 */
import { prisma } from "@/lib/prisma";
import { runNow } from "@/lib/cron/registry";

async function main() {
  const jobName = process.argv[2] ?? "almanac-rss-fetch";
  const t = await prisma.tenant.findUnique({
    where: { slug: "almanac" },
    select: { id: true },
  });
  if (!t) {
    console.error("almanac tenant 미존재");
    process.exit(2);
  }
  const job = await prisma.cronJob.findFirst({
    where: { tenantId: t.id, name: jobName },
    select: { id: true, name: true, kind: true, payload: true },
  });
  if (!job) {
    console.error(`cron job 미존재: tenant=almanac name=${jobName}`);
    process.exit(2);
  }
  console.log(`▶ runNow: ${job.name} (id=${job.id} kind=${job.kind})`);
  console.log(`  payload=${JSON.stringify(job.payload)}`);
  const start = Date.now();
  const result = await runNow(job.id);
  const elapsed = Date.now() - start;
  console.log(
    `  result: ${result.status} (${elapsed}ms) — ${result.message ?? "(no message)"}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("runNow failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
