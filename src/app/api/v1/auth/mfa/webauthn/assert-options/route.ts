import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { verifyMfaChallenge } from "@/lib/mfa/challenge";
import { createAuthenticationOptions } from "@/lib/mfa/webauthn";

interface AssertOptionsBody {
  challenge: string;
}

/**
 * POST /api/v1/auth/mfa/webauthn/assert-options
 *
 * 로그인 플로우에서 1차(password) 통과 후 Passkey 인증 options 발급.
 * MFA challenge 토큰(challenge)으로 유저 식별 → Passkey allowCredentials 스코프 한정.
 */
export async function POST(request: NextRequest) {
  let body: AssertOptionsBody;
  try {
    body = (await request.json()) as AssertOptionsBody;
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  if (!body.challenge) {
    return errorResponse("VALIDATION_ERROR", "challenge 가 필요합니다", 400);
  }

  const payload = await verifyMfaChallenge(body.challenge);
  if (!payload) {
    return errorResponse("INVALID_CHALLENGE", "챌린지 토큰이 유효하지 않거나 만료되었습니다", 401);
  }

  const options = await createAuthenticationOptions(payload.sub);
  return NextResponse.json({ success: true, data: { options } });
}
