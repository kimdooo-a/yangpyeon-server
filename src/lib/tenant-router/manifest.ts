/**
 * tenant-router/manifest — slug → DB row 해석기.
 *
 * Phase 1.2 (T1.2) 1차 산출. ADR-027 §4.2 step 2 (Tenant Manifest 조회).
 * Phase 2 (T2.x) 에서 TS manifest + DB hybrid 로 확장된다 (ADR-026 옵션 C).
 *
 * 현재는 DB row 만으로 active 여부를 판정하며, manifest TS 정의가 추가되면
 * 본 함수가 양쪽을 병합한 effective tenant 를 반환하도록 확장된다.
 */
import { prisma } from "@/lib/prisma";
import type { ResolvedTenant } from "./types";

/**
 * URL path 의 tenant slug 로부터 DB row 를 조회하여 ResolvedTenant 로 매핑.
 *
 * @param slug 이미 lower-case + slug 정규식(`^[a-z0-9][a-z0-9-]{1,30}$`) 통과한 값.
 *   본 함수 자체는 검증을 수행하지 않으며, 호출자(`withTenant`)가 사전 검증을 책임진다.
 * @returns 매핑 row + active 여부, 또는 미등록 시 null.
 */
export async function resolveTenantFromSlug(
  slug: string,
): Promise<ResolvedTenant | null> {
  const row = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      displayName: true,
      status: true,
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    status: row.status,
    active: row.status === "active",
  };
}
