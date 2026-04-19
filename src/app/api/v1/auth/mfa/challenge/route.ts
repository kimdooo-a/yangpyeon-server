import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";
import { mfaChallengeSchema } from "@/lib/schemas/mfa";
import { verifyMfaChallenge } from "@/lib/mfa/challenge";
import { verifyMfaSecondFactor } from "@/lib/mfa/service";
import { applyRateLimit } from "@/lib/rate-limit-guard";
import { finalizeLoginResponse, type LoginMethod } from "@/lib/sessions/login-finalizer";

/**
 * POST /api/v1/auth/mfa/challenge — 2차 인증 (TOTP 또는 recovery code).
 *
 * Body: { challenge, code?, recoveryCode? } — code/recoveryCode 중 하나만.
 * 성공 시 access+refresh 발급 (/v1/auth/login 후반부와 동일 형태).
 */
export async function POST(request: NextRequest) {
  // Step 6 Rate Limit: IP 만 카운트 (challenge 단계는 사용자 식별이 challenge 검증 후 가능).
  // 임계값: 분당 20회 — TOTP 6자리는 user-level lockedUntil 로 한 번 더 보호.
  const blocked = await applyRateLimit(request, {
    scope: "mfaChallenge",
    maxRequests: 20,
    windowMs: 60 * 1000,
  });
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = mfaChallengeSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const challengePayload = await verifyMfaChallenge(parsed.data.challenge);
  if (!challengePayload) {
    return errorResponse("INVALID_CHALLENGE", "챌린지 토큰이 유효하지 않거나 만료되었습니다", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: challengePayload.sub } });
  if (!user || !user.isActive) {
    return errorResponse("INVALID_CREDENTIALS", "사용자를 찾을 수 없습니다", 401);
  }

  const result = await verifyMfaSecondFactor(user.id, {
    code: parsed.data.code,
    recoveryCode: parsed.data.recoveryCode,
  });

  if (!result.ok) {
    if (result.reason === "LOCKED") {
      const lockedUntil = result.lockedUntil ?? new Date(Date.now() + 15 * 60 * 1000);
      const retryAfterSec = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MFA_LOCKED",
            message: "시도 한도 초과로 일시 잠금되었습니다",
            lockedUntil: lockedUntil.toISOString(),
            retryAfter: retryAfterSec,
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }
    return errorResponse("INVALID_CODE", "코드가 올바르지 않습니다", 401);
  }

  return finalizeLoginResponse({
    request,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    method: result.method as LoginMethod,
    extraData: { mfaMethod: result.method },
  });
}
