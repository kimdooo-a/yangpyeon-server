// =============================================================================
// 모듈: aggregator/promote
// 역할: content_ingested_items.status='ready' → content_items 로 승격
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/promote.ts
// 변경 (multi-tenant 적응):
//   - import { prisma } → import { tenantPrismaFor, withTenantTx, type TenantContext }
//   - 함수 시그니처: promotePending(batch?) → promotePending(ctx, batch?)
//     ctx 가 있어야 RLS 가 SET LOCAL app.tenant_id 를 적용 (memory rule
//     project_workspace_singleton_globalthis — Prisma 7 ALS propagation 깨짐 방지
//     위해 tenantPrismaFor + withTenantTx 사용)
//   - findMany 2건은 tenantPrismaFor(ctx) 사용 (단일 statement)
//   - upsert + update 2건은 withTenantTx 로 1 transaction 격리
// 정책:
//   - upsert (ingestedItemId 유니크) 로 재실행 안전
//   - 카테고리 슬러그가 있으면 content_categories 조회로 categoryId 결합
//   - 트랜잭션 내에서 ingested.status='promoted', processedAt=now 갱신
//   - 폴백: excerpt(aiSummary→summary→title), track(suggestedTrack ?? "general"),
//     publishedAt(item.publishedAt ?? item.fetchedAt)
// =============================================================================

import {
  tenantPrismaFor,
  withTenantTx,
  type TenantContext,
} from "@/lib/db/prisma-tenant-client";

const DEFAULT_BATCH = 50;
const DEFAULT_TRACK = "general";

interface PromoteResult {
  promoted: number;
  errors: number;
}

/**
 * 한국어/영문 제목을 URL-safe slug 로 변환한다.
 * - 영숫자/하이픈/한글만 허용
 * - 공백/구분자 → 하이픈
 * - 길이 제한 60자
 *
 * B5 spec port-time fix: spec 의 NFKD-only 가 한글 음절(가-힣 U+AC00~U+D7A3)을
 * jamo(U+1100~U+11FF)로 분해 → 이후 [가-힣] regex 가 jamo 와 매치 실패 → 한글
 * 제목이 모두 hyphen 으로 변환되어 빈 슬러그 생성. NFKD 후 NFC 재결합으로
 * Hangul 복원 + Latin diacritic 제거 효과는 보존(NFKD → strip combining mark →
 * NFC = base char 만 남음).
 */
function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // 결합 분음 부호 제거
      .normalize("NFC") // 한글 음절 재결합
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

/**
 * status='ready' 인 ingested 아이템을 content_items 로 승격.
 * 이미 처리된 항목은 ingestedItemId 유니크 제약으로 자동 재정합.
 */
export async function promotePending(
  ctx: TenantContext,
  batch = DEFAULT_BATCH,
): Promise<PromoteResult> {
  const result: PromoteResult = { promoted: 0, errors: 0 };
  const prisma = tenantPrismaFor(ctx);

  const ready = await prisma.contentIngestedItem.findMany({
    where: { status: "ready" },
    take: batch,
    orderBy: { id: "asc" },
  });

  if (ready.length === 0) return result;

  // 슬러그 → categoryId 매핑을 한 번에 미리 조회
  const slugs = Array.from(
    new Set(
      ready
        .map((r) => r.suggestedCategorySlug)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  );
  const categoryRows =
    slugs.length > 0
      ? await prisma.contentCategory.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true },
        })
      : [];
  const categoryIdBySlug = new Map(categoryRows.map((r) => [r.slug, r.id]));

  for (const item of ready) {
    try {
      const baseSlug = slugify(item.title);
      const hashSuffix = item.urlHash.slice(0, 8);
      const slug = `${baseSlug}-${hashSuffix}`;

      const categoryId = item.suggestedCategorySlug
        ? (categoryIdBySlug.get(item.suggestedCategorySlug) ?? null)
        : null;

      const excerpt =
        item.aiSummary?.trim() || item.summary?.trim() || item.title.slice(0, 200);
      const track = item.suggestedTrack ?? DEFAULT_TRACK;
      const publishedAt = item.publishedAt ?? item.fetchedAt;

      await withTenantTx(ctx.tenantId, async (tx) => {
        await tx.contentItem.upsert({
          where: { ingestedItemId: item.id },
          create: {
            ingestedItemId: item.id,
            sourceId: item.sourceId,
            categoryId,
            slug,
            title: item.title,
            excerpt,
            url: item.url,
            aiSummary: item.aiSummary,
            imageUrl: item.imageUrl,
            author: item.author,
            track,
            tags: item.aiTags ?? [],
            language: item.aiLanguage,
            publishedAt,
          },
          update: {
            categoryId,
            title: item.title,
            excerpt,
            aiSummary: item.aiSummary,
            imageUrl: item.imageUrl,
            author: item.author,
            track,
            tags: item.aiTags ?? [],
            language: item.aiLanguage,
            publishedAt,
          },
        });

        await tx.contentIngestedItem.update({
          where: { id: item.id },
          data: { status: "promoted", processedAt: new Date() },
        });
      });

      result.promoted += 1;
    } catch (err) {
      console.error(
        `[promote] ingested #${item.id} 승격 실패:`,
        (err as Error).message,
      );
      result.errors += 1;
    }
  }

  return result;
}
