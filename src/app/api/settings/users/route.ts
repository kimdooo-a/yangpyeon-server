import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";

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
export const GET = withRole(["ADMIN"], async () => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return successResponse(users);
});

/**
 * POST /api/settings/users
 * 사용자 생성 (ADMIN 전용)
 */
export const POST = withRole(["ADMIN"], async (request) => {
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

  // 이메일 중복 확인
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return errorResponse("DUPLICATE_EMAIL", "이미 등록된 이메일입니다", 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name: name ?? null,
      passwordHash,
      role: role as Role,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return successResponse(user, 201);
});

/**
 * PATCH /api/settings/users
 * 사용자 역할/상태 변경 (ADMIN 전용)
 */
export const PATCH = withRole(["ADMIN"], async (request) => {
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

  // 대상 사용자 존재 확인
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다", 404);
  }

  const updateData: Record<string, unknown> = {};
  if (role !== undefined) updateData.role = role;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return successResponse(updated);
});
