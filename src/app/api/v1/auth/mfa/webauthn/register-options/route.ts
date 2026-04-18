import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { createRegistrationOptions } from "@/lib/mfa/webauthn";

/**
 * POST /api/v1/auth/mfa/webauthn/register-options
 *
 * 인증된 사용자의 Passkey 등록용 challenge/options 발급.
 * 브라우저는 응답을 `navigator.credentials.create({ publicKey: options })` 로 전달.
 */
export const POST = withAuth(async (_request: NextRequest, user) => {
  if (user.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 설정하세요", 401);
  }
  const { options } = await createRegistrationOptions(user.sub, user.email);
  return NextResponse.json({ success: true, data: { options } });
});
