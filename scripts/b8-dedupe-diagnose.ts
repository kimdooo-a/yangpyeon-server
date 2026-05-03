/**
 * S84-D dedupe 진단 — runNow 의 inserted=0 duplicates=130 원인 분석.
 *
 * Hypothesis:
 *   H1) 5 신규 소스의 130 items 가 이전 runNow (S83 첫 검증) 에서 이미 ingested → 두 번째 runNow 가 100% dup
 *   H2) canonical URL 이 cross-source 충돌 (예: github 이 openai 글 인용 → URL 같음)
 *   H3) dedupe 가 너무 적극적 (트래킹 파라미터 제거 후 다른 글이 같은 hash 가 됨)
 *
 * 출력:
 *   1) 소스별 ingested item count + 첫/마지막 fetched_at
 *   2) 5 신규 소스의 urlHash 분포 — 자기 자신 N회 vs cross-source collision N회
 *   3) collision 표본 10건 (원본 url + canonical + hash)
 */
import { prisma } from "@/lib/prisma";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { canonicalizeUrl } from "@/lib/aggregator/dedupe";

const NEW_5_SOURCES = [
  "github-blog",
  "huggingface-blog",
  "stripe-blog",
  "kakao-tech",
  "techcrunch-ai",
];

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

  // 1) 소스별 ingested 카운트 + 시간 범위
  console.log("=== 소스별 ingested 카운트 ===");
  const sources = await tp.contentSource.findMany({
    where: { tenantId: t.id, active: true },
    select: { id: true, slug: true, lastFetchedAt: true, lastSuccessAt: true },
    orderBy: { slug: "asc" },
  });
  for (const s of sources) {
    const stats = await tp.contentIngestedItem.aggregate({
      where: { tenantId: t.id, sourceId: s.id },
      _count: { id: true },
      _min: { fetchedAt: true },
      _max: { fetchedAt: true },
    });
    const cnt = stats._count.id;
    const first = stats._min.fetchedAt?.toISOString().slice(0, 19) ?? "-";
    const last = stats._max.fetchedAt?.toISOString().slice(0, 19) ?? "-";
    const isNew = NEW_5_SOURCES.includes(s.slug) ? "★" : " ";
    console.log(
      `  ${isNew} ${s.slug.padEnd(20)} ingested=${String(cnt).padStart(4)} first=${first} last=${last}`,
    );
  }

  // 2) 5 신규 소스 ingested item 의 urlHash 가 다른 소스에도 있는지 (cross-source collision)
  console.log("\n=== 5 신규 소스 cross-source collision 분석 ===");
  for (const slug of NEW_5_SOURCES) {
    const src = sources.find((s) => s.slug === slug);
    if (!src) {
      console.log(`  ${slug}: 소스 미발견`);
      continue;
    }
    // 5 신규 소스의 모든 ingested item 의 urlHash 추출
    const myItems = await tp.contentIngestedItem.findMany({
      where: { tenantId: t.id, sourceId: src.id },
      select: { urlHash: true },
    });
    const myHashes = new Set(myItems.map((i) => i.urlHash));
    if (myHashes.size === 0) {
      console.log(`  ${slug}: ingested item 0건 — 이 소스가 이번 runNow 에서 0건 fetch 했거나 모두 다른 소스 hash 와 충돌`);
      continue;
    }
    // 같은 hash 가 다른 sourceId 로 등록됐는지 (자기 자신은 제외)
    const collisions = await tp.contentIngestedItem.findMany({
      where: {
        tenantId: t.id,
        urlHash: { in: Array.from(myHashes) },
        NOT: { sourceId: src.id },
      },
      select: { id: true, sourceId: true, urlHash: true, url: true },
      take: 50,
    });
    if (collisions.length === 0) {
      console.log(`  ${slug}: ingested ${myHashes.size}건 / cross-source collision 0건 (자기 hash 만 존재)`);
    } else {
      const otherSources = new Map<number, number>();
      for (const c of collisions) {
        otherSources.set(c.sourceId, (otherSources.get(c.sourceId) ?? 0) + 1);
      }
      const otherSlugs = Array.from(otherSources.entries())
        .map(([sid, cnt]) => {
          const found = sources.find((s) => s.id === sid);
          return `${found?.slug ?? `sid${sid}`}=${cnt}`;
        })
        .join(", ");
      console.log(
        `  ${slug}: ingested ${myHashes.size}건 / cross-source collision ${collisions.length}건 → ${otherSlugs}`,
      );
    }
  }

  // 3) 만약 5 신규 소스 모두 ingested 0건이면 → H1 (이전 runNow 에서 이미 모두 흡수됨)
  // 그렇다면 어느 다른 소스에 그들의 hash 가 등록돼있는지 추적
  console.log("\n=== H1 검증: 신규 소스 0건이면 이전 runNow 에서 ingested 됐다는 의미 ===");
  const totalIngested = await tp.contentIngestedItem.count({ where: { tenantId: t.id } });
  console.log(`  전체 ingested 카운트: ${totalIngested}`);
  console.log(`  S81 1차 runNow 결과: items=50 (S81 ffdd2dd 시점 첫 카드)`);
  console.log(`  S83 2차 runNow 결과: fetched=130 inserted=0 duplicates=130`);
  console.log(`  → 만약 totalIngested ≈ 50 이면 H1 차단 (5 신규 소스가 fetch 했지만 모든 hash 가 미스터리하게 이미 존재)`);
  console.log(`  → 만약 totalIngested ≈ 180 이면 H1 의외의 시점 ingested (S81 직후 자연 cron tick 가능성)`);

  // 4) status 분포
  const byStatus = await tp.contentIngestedItem.groupBy({
    by: ["status"],
    where: { tenantId: t.id },
    _count: { _all: true },
  });
  console.log("\n=== ingested status 분포 ===");
  for (const r of byStatus) {
    console.log(`  ${r.status.padEnd(10)} ${r._count._all}`);
  }

  // 5) 표본 5건 — 동일 hash 가 여러 소스에 등록된 경우 표본 출력
  console.log("\n=== cross-source collision 표본 (앞 5건) ===");
  const dupRows: Array<{ urlhash: string; cnt: bigint }> = await prisma.$queryRawUnsafe(
    `
    SELECT url_hash, COUNT(*) AS cnt
    FROM content_ingested_items
    WHERE tenant_id = $1
    GROUP BY url_hash
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 5
    `,
    t.id,
  );
  if (dupRows.length === 0) {
    console.log(`  (cross-source collision 0건 — 모든 url_hash 가 unique)`);
  } else {
    for (const r of dupRows) {
      console.log(`  hash=${r.urlhash.slice(0, 12)}... count=${r.cnt}`);
      // 해당 hash 의 모든 row 표본
      const samples = await tp.contentIngestedItem.findMany({
        where: { tenantId: t.id, urlHash: r.urlhash },
        select: { sourceId: true, url: true },
        take: 5,
      });
      for (const s of samples) {
        const src = sources.find((x) => x.id === s.sourceId);
        console.log(`    [${src?.slug ?? `sid${s.sourceId}`}] ${s.url.slice(0, 100)}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
