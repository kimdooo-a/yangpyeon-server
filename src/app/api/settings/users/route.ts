import type { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/api-response";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { hashPassword } from "@/lib/password";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import { requireRoleApi } from "@/lib/auth-guard";

/** 관리자 운영 콘솔 — 기본 테넌트(default) UUID */
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true } as const;

/** 사용자 raw SELECT row (Date ::text 캐스팅 결과) */
type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  last_login_at_text: string | null;
  created_at_text: string;
};

/** 사용자 생성 요청 스키마 */
const createUserSchema = z.object({
  email: z.string().email("유효한 이메일을 입력하세요"),
  name: z.string().min(1).max(50).optional(),
  password: z
    .string()
    .min(8, "비밀번호는 최소 8자입니다")
    .max(100, "비밀번호는 최대 100자입니다"),
  role: z.enum(["ADMIN", "MANAGER", "USER"]),
});

/** 사용자 역할/상태 변경 스키마 */
const updateUserSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "MANAGER", "USER"]).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/settings/users
 * 사용자 목록 조회 (ADMIN 전용)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(request, "ADMIN");
  if (auth.response) return auth.response;

  // 세션 43: Date 필드는 raw SELECT + ::text 로 정확 읽기 (parsing-side 시프트 회피).
  // ORDER BY created_at DESC 서버측 수행.
  const rows = await tenantPrismaFor(OPS_CTX).$queryRaw<UserRow[]>`
    SELECT id, email, name, role, is_active,
      (last_login_at::text) AS last_login_at_text,
      (created_at::text)    AS created_at_text
    FROM users
    ORDER BY created_at DESC
  `;
  const users = (rows as UserRow[]).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    isActive: r.is_active,
    lastLoginAt: r.last_login_at_text ? new Date(r.last_login_at_text).toISOString() : null,
    createdAt: new Date(r.created_at_text).toISOString(),
  }));

  return successResponse(users);
}

/**
 * POST /api/settings/users
 * 사용자 생성 (ADMIN 전용)
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(request, "ADMIN");
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "잘못된 요청 형식", 400);
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return errorResponse("VALIDATION_ERROR", msg, 400);
  }

  const { email, name, password, role } = parsed.data;

  const db = tenantPrismaFor(OPS_CTX);

  // 이메일 중복 확인
  const existing = await db.user.findUnique({
    where: { tenantId_email: { tenantId: DEFAULT_TENANT_UUID, email } },
  });
  if (existing) {
    return errorResponse("DUPLICATE_EMAIL", "이미 등록된 이메일입니다", 409);
  }

  const passwordHash = await hashPassword(password);

  const created = await db.user.create({
    data: {
      email,
      name: name ?? null,
      passwordHash,
      role: role as Role,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  // 세션 43: create 직후 createdAt 은 raw SELECT ::text 로 재조회.
  const rows = await db.$queryRaw<Array<{ created_at_text: string }>>`
    SELECT (created_at::text) AS created_at_text
    FROM users
    WHERE id = ${created.id}
    LIMIT 1
  `;
  const createdAt = rows[0] ? new Date(rows[0].created_at_text).toISOString() : null;

  return successResponse({ ...created, createdAt }, 201);
}

/**
 * PATCH /api/settings/users
 * 사용자 역할/상태 변경 (ADMIN 전용)
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireRoleApi(request, "ADMIN");
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "잘못된 요청 형식", 400);
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    return errorResponse("VALIDATION_ERROR", msg, 400);
  }

  const { userId, role, isActive } = parsed.data;

  const db = tenantPrismaFor(OPS_CTX);

  // 대상 사용자 존재 확인
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) {
    return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
  }

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;

  await db.user.update({
    where: { id: userId },
    data: updateData,
  });

  // 세션 43: update 직후 Date 필드는 raw SELECT ::text 로 재조회.
  const rows = await db.$queryRaw<UserRow[]>`
    SELECT id, email, name, role, is_active,
      (last_login_at::text) AS last_login_at_text,
      (created_at::text)    AS created_at_text
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  const row = rows[0]!;
  return successResponse({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at_text ? new Date(row.last_login_at_text).toISOString() : null,
    createdAt: new Date(row.created_at_text).toISOString(),
  });
}
