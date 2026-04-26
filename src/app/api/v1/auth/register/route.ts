import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/schemas/auth";
import { successResponse, errorResponse } from "@/lib/api-response";

// T1.4 sweep: /api/v1/auth/register 는 글로벌 등록 엔드포인트. 운영자 콘솔 전용 → 'default' sentinel (패턴 c).
const ADMIN_TENANT_ID = "default";

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

  // T1.4 sweep: (tenantId, email) composite unique 로 전환. 글로벌 @unique 의존 제거.
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: ADMIN_TENANT_ID, email } },
  });
  if (existing) {
    return errorResponse("EMAIL_EXISTS", "이미 사용 중인 이메일입니다", 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, passwordHash, name, phone },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return successResponse(user, 201);
}
