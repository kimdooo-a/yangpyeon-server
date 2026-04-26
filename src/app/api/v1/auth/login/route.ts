import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// closed BaaS: 모든 사용자는 default tenant 소속 (ADR-022).
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
import { verifyPasswordHash, needsRehash, hashPassword } from "@/lib/password";
import { loginSchema } from "@/lib/schemas/auth";
import { errorResponse } from "@/lib/api-response";
import { issueMfaChallenge, CHALLENGE_MAX_AGE } from "@/lib/mfa/challenge";
import { applyRateLimit } from "@/lib/rate-limit-guard";
import { finalizeLoginResponse } from "@/lib/sessions/login-finalizer";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { email, password } = parsed.data;

  // Step 6 Rate Limit: IP 와 email 별도 카운트. 둘 중 먼저 초과한 쪽 적용.
  // 임계값: 분당 10회 — login 정상 사용자는 1~3회 시도. 초과 시 brute-force 의심.
  const blocked = await applyRateLimit(request, {
    scope: "v1Login",
    maxRequests: 10,
    windowMs: 60 * 1000,
    identifier: { dimension: "email", value: email },
  });
  if (blocked) return blocked;

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: email→userId 결정 단계로 tenant context 이전 실행 (login flow)
  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: DEFAULT_TENANT_UUID, email } },
  });
  if (!user || !user.isActive) {
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  const valid = await verifyPasswordHash(password, user.passwordHash);
  if (!valid) {
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  // lastLoginAt 업데이트 + (bcrypt → argon2id 점진 마이그레이션) Phase 17 / SP-011 / ADR-019
  const updateData: { lastLoginAt: Date; passwordHash?: string } = {
    lastLoginAt: new Date(),
  };
  if (needsRehash(user.passwordHash)) {
    updateData.passwordHash = await hashPassword(password);
  }
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 로그인 완료 직후 lastLoginAt/passwordHash 갱신, tenant context 결정 전 단계
  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  // 2차 인증 확장 판단: TOTP 활성 또는 Passkey 등록 중 하나라도 있으면 MFA 필요.
  // Phase 15 Step 4/5 / FR-6.1, FR-6.2.
  const [enrollment, passkeyCount] = await Promise.all([
    // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: MFA enrollment 확인은 세션 발급 전 단계 (tenant context 결정 이전)
    prisma.mfaEnrollment.findUnique({
      where: { userId: user.id },
      select: { confirmedAt: true },
    }),
    // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: Passkey 카운트 확인은 세션 발급 전 단계 (tenant context 결정 이전)
    prisma.webAuthnAuthenticator.count({ where: { userId: user.id } }),
  ]);
  const hasTotp = user.mfaEnabled && Boolean(enrollment?.confirmedAt);
  const hasPasskey = passkeyCount > 0;

  if (hasTotp || hasPasskey) {
    const methods: ("totp" | "recovery" | "passkey")[] = [];
    if (hasTotp) methods.push("totp", "recovery");
    if (hasPasskey) methods.push("passkey");

    const challenge = await issueMfaChallenge(user.id);
    return NextResponse.json(
      {
        success: true,
        data: {
          mfaRequired: true,
          methods,
          challenge,
          challengeExpiresIn: CHALLENGE_MAX_AGE,
        },
      },
      { status: 200 },
    );
  }

  return finalizeLoginResponse({
    request,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    method: "password",
  });
}
