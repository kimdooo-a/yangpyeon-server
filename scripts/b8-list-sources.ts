/**
 * B8 helper — almanac 의 ContentSource 60종 인벤토리 출력 (slug, kind, active, country, default_track).
 * 활성화 후보 5개 선택용.
 *
 * 사용:
 *   wsl -- bash -lic 'cd ~/dev/ypserver-build && \
 *     DATABASE_URL=$(grep ^DATABASE_URL ~/ypserver/.env | cut -d= -f2- | tr -d \") \
 *     npx tsx scripts/b8-list-sources.ts'
 */
import { prisma } from "@/lib/prisma";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "almanac" },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    console.error("almanac tenant 미등록");
    process.exit(2);
  }
  const tp = tenantPrismaFor({ tenantId: tenant.id });
  const sources = await tp.contentSource.findMany({
    select: {
      slug: true,
      name: true,
      kind: true,
      active: true,
      country: true,
      defaultTrack: true,
    },
    orderBy: [{ kind: "asc" }, { slug: "asc" }],
  });
  console.log(`Total ${sources.length} sources for tenant=${tenant.slug}`);
  console.log("─".repeat(110));
  console.log(
    "kind".padEnd(10) +
      "active".padEnd(8) +
      "country".padEnd(8) +
      "track".padEnd(14) +
      "slug".padEnd(40) +
      "name",
  );
  console.log("─".repeat(110));
  for (const s of sources) {
    console.log(
      s.kind.padEnd(10) +
        String(s.active).padEnd(8) +
        (s.country ?? "-").padEnd(8) +
        (s.defaultTrack ?? "-").padEnd(14) +
        s.slug.padEnd(40) +
        s.name,
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
