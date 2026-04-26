import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { email, password, name, phone } = parsed.data;

  // closed BaaS: 모든 사용자는 default tenant 소속 (ADR-022).
  const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

  // 이메일 중복 확인
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 회원가입 중복 이메일 확인, tenant 결정 전 단계
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: DEFAULT_TENANT_UUID, email } },
  });
  if (existing) {
    return errorResponse("EMAIL_EXISTS", "이미 사용 중인 이메일입니다", 409);
  }

  const passwordHash = await hashPassword(password);

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 신규 사용자 생성, tenant 결정 전 단계 (closed BaaS — 운영자 초대 전 가입)
  const user = await prisma.user.create({
    data: { tenantId: DEFAULT_TENANT_UUID, email, passwordHash, name, phone },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return successResponse(user, 201);
}
