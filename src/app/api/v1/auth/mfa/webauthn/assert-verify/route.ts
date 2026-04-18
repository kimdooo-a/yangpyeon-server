import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";
import { verifyMfaChallenge } from "@/lib/mfa/challenge";
import { verifyAuthentication, consumeChallenge } from "@/lib/mfa/webauthn";
import {
  createAccessToken,
  createRefreshToken,
  V1_REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "@/lib/jwt-v1";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { applyRateLimit } from "@/lib/rate-limit-guard";

interface AssertVerifyBody {
  challenge: string;
  response: AuthenticationResponseJSON;
}

/**
 * POST /api/v1/auth/mfa/webauthn/assert-verify
 *
 * 2차 인증 대체 경로: Passkey assertion 검증 성공 시 access+refresh 발급.
 * MFA challenge 토큰에서 userId 를 얻고, Passkey 검증 결과 userId 와 일치해야 함.
 */
export async function POST(request: NextRequest) {
  // Step 6 Rate Limit: WebAuthn 은 user-level 락이 별도 모델이 아니므로 IP 임계값을 challenge 와 동일하게 운용.
  const blocked = await applyRateLimit(request, {
    scope: "webauthnAssert",
    maxRequests: 20,
    windowMs: 60 * 1000,
  });
  if (blocked) return blocked;

  let body: AssertVerifyBody;
  try {
    body = (await request.json()) as AssertVerifyBody;
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  if (!body.challenge || !body.response?.id) {
    return errorResponse("VALIDATION_ERROR", "challenge/response 가 필요합니다", 400);
  }

  const payload = await verifyMfaChallenge(body.challenge);
  if (!payload) {
    return errorResponse("INVALID_CHALLENGE", "챌린지 토큰이 유효하지 않거나 만료되었습니다", 401);
  }

  // WebAuthn challenge 는 response.clientDataJSON 내부 challenge 와 일치해야 함
  const clientChallenge = (() => {
    try {
      return JSON.parse(
        Buffer.from(body.response.response.clientDataJSON, "base64url").toString("utf8"),
      ).challenge as string;
    } catch {
      return null;
    }
  })();

  if (!clientChallenge) {
    return errorResponse("VALIDATION_ERROR", "clientDataJSON 에서 challenge 추출 실패", 400);
  }

  const consumed = await consumeChallenge(clientChallenge, "authentication");
  if (!consumed || (consumed.userId && consumed.userId !== payload.sub)) {
    return errorResponse("INVALID_CHALLENGE", "WebAuthn 챌린지 소유자 불일치", 401);
  }

  let result;
  try {
    result = await verifyAuthentication(body.response, clientChallenge);
  } catch (err) {
    return errorResponse(
      "VERIFICATION_FAILED",
      err instanceof Error ? err.message : "어설션 검증 실패",
      401,
    );
  }

  if (!result.verified.verified || result.userId !== payload.sub) {
    return errorResponse("VERIFICATION_FAILED", "Passkey 검증 실패", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    return errorResponse("INVALID_CREDENTIALS", "사용자를 찾을 수 없습니다", 401);
  }

  const accessToken = await createAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken(user.id);

  const response = NextResponse.json(
    {
      success: true,
      data: {
        accessToken,
        mfaMethod: "passkey",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    },
    { status: 200 },
  );

  response.cookies.set(V1_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE,
    path: "/api/v1/",
  });

  return response;
}
