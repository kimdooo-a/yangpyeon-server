// =============================================================================
// 모듈: aggregator/promote
// 역할: content_ingested_items.status='ready' → content_items 로 승격
// 정책:
//   - upsert (ingestedItemId 유니크) 로 재실행 안전
//   - 카테고리 슬러그가 있으면 content_categories 조회로 categoryId 결합
//   - 트랜잭션 내에서 ingested.status='promoted', processedAt=now 갱신
//   - 필수 필드(excerpt/track/publishedAt) 폴백:
//       excerpt    = aiSummary ?? summary ?? title (최후 폴백)
//       track      = suggestedTrack ?? "general"
//       publishedAt = ingested.publishedAt ?? fetchedAt
// =============================================================================

import { prisma } from "@/lib/prisma";

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
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diacritics 제거
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

/**
 * status='ready' 인 ingested 아이템을 content_items 로 승격.
 * 이미 처리된 항목은 ingestedItemId 유니크 제약으로 자동 재정합.
 */
export async function promotePending(batch = DEFAULT_BATCH): Promise<PromoteResult> {
  const result: PromoteResult = { promoted: 0, errors: 0 };

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
  const categoryRows = slugs.length > 0
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
        ? categoryIdBySlug.get(item.suggestedCategorySlug) ?? null
        : null;

      const excerpt =
        item.aiSummary?.trim() ||
        item.summary?.trim() ||
        item.title.slice(0, 200);
      const track = item.suggestedTrack ?? DEFAULT_TRACK;
      const publishedAt = item.publishedAt ?? item.fetchedAt;

      await prisma.$transaction(async (tx) => {
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
      console.error(`[promote] ingested #${item.id} 승격 실패:`, (err as Error).message);
      result.errors += 1;
    }
  }

  return result;
}
