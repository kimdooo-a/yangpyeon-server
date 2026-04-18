import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import {
  verifyRegistration,
  persistAuthenticator,
  consumeChallenge,
} from "@/lib/mfa/webauthn";
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";

interface RegisterVerifyBody {
  response: RegistrationResponseJSON;
  friendlyName?: string;
}

/**
 * POST /api/v1/auth/mfa/webauthn/register-verify
 *
 * 브라우저가 `navigator.credentials.create()` 결과를 그대로 {response} 필드로 전달.
 * 검증 성공 시 authenticator DB 저장.
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  if (user.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 설정하세요", 401);
  }

  let body: RegisterVerifyBody;
  try {
    body = (await request.json()) as RegisterVerifyBody;
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }
  if (!body?.response?.id) {
    return errorResponse("VALIDATION_ERROR", "response 필드가 필요합니다", 400);
  }

  const challengeStr = body.response.response?.clientDataJSON
    ? JSON.parse(
        Buffer.from(body.response.response.clientDataJSON, "base64url").toString("utf8"),
      ).challenge
    : null;
  if (!challengeStr) {
    return errorResponse("VALIDATION_ERROR", "challenge 를 응답에서 추출할 수 없습니다", 400);
  }

  const consumed = await consumeChallenge(challengeStr, "registration");
  if (!consumed || consumed.userId !== user.sub) {
    return errorResponse("INVALID_CHALLENGE", "챌린지 검증 실패", 401);
  }

  let verified;
  try {
    verified = await verifyRegistration(body.response, challengeStr);
  } catch (err) {
    return errorResponse(
      "VERIFICATION_FAILED",
      err instanceof Error ? err.message : "등록 검증에 실패했습니다",
      401,
    );
  }

  if (!verified.verified || !verified.registrationInfo) {
    return errorResponse("VERIFICATION_FAILED", "등록 검증에 실패했습니다", 401);
  }

  const transports = (body.response.response?.transports ??
    []) as AuthenticatorTransportFuture[];

  await persistAuthenticator(user.sub, verified, transports, body.friendlyName ?? null);

  return NextResponse.json({
    success: true,
    data: { message: "Passkey 가 등록되었습니다" },
  });
});
