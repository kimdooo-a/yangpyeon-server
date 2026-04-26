/**
 * tenant-router/membership — TenantMembership 조회 스텁.
 *
 * Phase 1.2 (T1.2) 시점에는 prisma/schema.prisma 에 TenantMembership 모델이
 * 아직 없다 (T1.5 가 schema 소유권). 본 모듈은 그 공백을 메우는 스텁이며,
 * T1.5 가 모델을 추가한 후에는 prisma.tenantMembership.findUnique 호출로
 * 본문을 교체한다.
 *
 * TODO(T1.5): 본 파일 본문을 prisma 직접 호출로 교체할 것. 시그니처는 유지.
 *
 *   return prisma.tenantMembership.findUnique({
 *     where: { tenantId_userId: { tenantId, userId } },
 *     select: { role: true },
 *   });
 *
 * 그때까지는 항상 null 을 반환하여 cookie 경로를 안전하게 차단한다 — ADR-027
 * §4.2 step 3b 의 정책(미멤버 = 403)을 디폴트로 적용하는 fail-closed 모드.
 */
import type { TenantRole } from "./roles";

export interface TenantMembershipRow {
  role: TenantRole;
}

export interface FindMembershipInput {
  tenantId: string;
  userId: string;
}

/**
 * 주어진 (tenantId, userId) 조합의 멤버십을 조회.
 *
 * 현 단계 (Phase 1.2): 항상 null — cookie 경로는 항상 403 으로 차단됨.
 * T1.5 통합 시점에 실제 DB 조회로 교체.
 *
 * @returns 멤버십 row 또는 null (미가입 / 모델 미존재).
 */
export async function findTenantMembership(
  _input: FindMembershipInput,
): Promise<TenantMembershipRow | null> {
  // TODO(T1.5): prisma.tenantMembership.findUnique 호출로 교체.
  return null;
}
