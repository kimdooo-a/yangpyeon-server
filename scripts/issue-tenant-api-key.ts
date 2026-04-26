/**
 * scripts/issue-tenant-api-key.ts
 *
 * 운영자 1인 환경에서 tenant ApiKey 발급용 one-shot CLI.
 * 운영 콘솔 UI 가 도입되기 전까지의 임시 절차 (ADR-026 §6 추후 콘솔 도입 시 본 스크립트 deprecate).
 *
 * 사용법:
 *   wsl -- bash -lic 'cd ~/dev/ypserver-build && \
 *     DATABASE_URL="postgresql://postgres:...@localhost:5432/luckystyle4u?schema=public" \
 *     npx tsx scripts/issue-tenant-api-key.ts \
 *       --tenant=almanac --scope=srv --name="Almanac Vercel SSR" --owner=<adminUserId>'
 *
 * 출력:
 *   - 평문 키 (1회 노출). 발급 직후 안전 채널로 컨슈머 운영자에게 전달 후 본 stdout 폐기.
 *   - DB 저장본 메타 (id, prefix, createdAt) — 콘솔 검증용.
 *
 * 안전성:
 *   - keyHash = bcrypt(plaintext, 10) — DB 에는 해시만.
 *   - prefix = `<scope>_<tenant>_<random[:8]>` — 빠른 lookup + 운영자 식별.
 *   - tenantId FK 가 K3 cross-validation 의 핵심.
 */
import { issueTenantApiKey } from "@/lib/auth/keys-tenant-issue";
import { prisma } from "@/lib/prisma";

interface CliArgs {
  tenant: string;
  scope: "pub" | "srv";
  name: string;
  ownerId: string;
  scopes: string[];
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const get = (key: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${key}=`));
    return hit?.slice(key.length + 3);
  };
  const tenant = get("tenant");
  const scope = get("scope") as "pub" | "srv" | undefined;
  const name = get("name");
  const ownerId = get("owner");
  const scopesRaw = get("scopes") ?? "read:contents,read:sources,read:categories";

  if (!tenant || !scope || !name || !ownerId) {
    console.error(
      "Usage: tsx scripts/issue-tenant-api-key.ts --tenant=<slug> --scope=pub|srv --name=<label> --owner=<userId> [--scopes=a,b,c]",
    );
    process.exit(1);
  }
  if (scope !== "pub" && scope !== "srv") {
    console.error(`scope 는 "pub" 또는 "srv" 여야 합니다 (받음: ${scope})`);
    process.exit(1);
  }
  return {
    tenant,
    scope,
    name,
    ownerId,
    scopes: scopesRaw.split(",").map((s) => s.trim()).filter(Boolean),
  };
}

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

  const owner = await prisma.user.findUnique({
    where: { id: args.ownerId },
    select: { id: true, email: true, role: true },
  });
  if (!owner) {
    console.error(`owner User 미존재: id=${args.ownerId}`);
    process.exit(2);
  }
  if (owner.role !== "ADMIN") {
    console.error(
      `owner 가 ADMIN 이 아닙니다: ${owner.email} role=${owner.role}`,
    );
    process.exit(2);
  }

  const result = await issueTenantApiKey({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    scope: args.scope,
    name: args.name,
    scopes: args.scopes,
    ownerId: owner.id,
  });

  console.log("─".repeat(60));
  console.log("✅ tenant ApiKey 발급 완료 — 평문은 본 출력에만 1회 노출");
  console.log("─".repeat(60));
  console.log(`tenant.slug   : ${tenant.slug}`);
  console.log(`tenant.id     : ${tenant.id}`);
  console.log(`owner.email   : ${owner.email}`);
  console.log(`apiKey.id     : ${result.apiKey.id}`);
  console.log(`apiKey.prefix : ${result.apiKey.prefix}`);
  console.log(`scope         : ${args.scope.toUpperCase()}`);
  console.log(`scopes        : ${args.scopes.join(", ")}`);
  console.log(`createdAt     : ${result.apiKey.createdAt.toISOString()}`);
  console.log("");
  console.log("PLAINTEXT (Authorization: Bearer <plaintext>):");
  console.log(`  ${result.plaintext}`);
  console.log("");
  console.log(
    "⚠️ 위 평문은 DB 에 저장되지 않으며 다시 조회할 수 없습니다.",
  );
  console.log(
    "   안전 채널 (1Password / Vercel env / 직접 전달) 로 즉시 옮기고 본 stdout 폐기.",
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
