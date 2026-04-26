/**
 * tenant-router/membership — TenantMembership 조회 (cookie 인증 경로).
 *
 * P0-membership (세션 61) — Phase 1.2 의 fail-closed stub 본문을 실 prisma 호출로 교체.
 *
 * 호출 흐름:
 *   1. T1.2 router 의 cookie 분기에서 사용자가 인증된 후 (userId 확정).
 *   2. 요청 path 의 <tenant> slug 로 tenant.id 를 lookup.
 *   3. 본 함수가 (tenantId, userId) 멤버십 행 조회.
 *   4. row 존재 → 멤버 → 핸들러로 분기. row 없음 → null → 403.
 *
 * RLS 의도적 미적용 (T1.4 spec §2.4 Tenant-bypass 카테고리):
 *   - 멤버십 조회는 tenant context 가 *결정되기 전* 단계 — RLS 가 app.tenant_id 를 요구하면
 *     self-defeating (어느 tenant 에 속하는지 본 query 가 판정 중).
 *   - (tenantId, userId) 양쪽 명시 bind parameter 이므로 cross-tenant 안전.
 *   - 따라서 prismaWithTenant 가 아닌 base prisma 를 사용한다.
 *
 * Prisma generated client 가 @ts-nocheck 인 영향으로 tenantMembership 모델이 외부 typecheck 에서
 * unknown 일 수 있다 — 다른 호출 사이트(jwks/store.ts, sessions/tokens.ts)와 동일하게 any 캐스트.
 */
// eslint-disable-next-line no-restricted-imports -- 본 모듈은 인증 인프라 — base prisma 직접 사용 정당.
import { prisma } from "@/lib/prisma";
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
 * @returns 멤버십 row 또는 null (미가입). DB 에러 시에는 throw — fail-loud 로 422/500 변환.
 */
export async function findTenantMembership(
  input: FindMembershipInput,
): Promise<TenantMembershipRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).tenantMembership.findUnique({
    where: {
      tenantId_userId: { tenantId: input.tenantId, userId: input.userId },
    },
    select: { role: true },
  });
  if (!row) return null;

  // role 은 DB 에서 string 으로 저장되지만 TenantRole literal union 으로 narrow.
  // 비정상 값(예: schema 변경 후 stale row)이 들어오면 미멤버로 처리하여 fail-closed 유지.
  const role = row.role as TenantRole;
  if (role !== "OWNER" && role !== "ADMIN" && role !== "MEMBER" && role !== "VIEWER") {
    return null;
  }
  return { role };
}
