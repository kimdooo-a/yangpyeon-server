import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/auth/mfa/webauthn/authenticators/{id}
 *
 * 인증된 사용자의 자기 Passkey 1건 삭제. 다른 사용자 소유 자격증명에 접근 불가 (userId 매칭 강제).
 * 마지막 1개 삭제는 허용 (사용자 자기 결정 — TOTP 가 활성화돼 있다면 MFA 유지됨).
 */
export const DELETE = withAuth(async (_request: NextRequest, user, context) => {
  if (user.sub === "legacy") {
    return errorResponse("LEGACY_SESSION", "실제 사용자로 로그인 후 삭제하세요", 401);
  }

  const { id } = await (context as RouteContext).params;

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 인증된 사용자 자신의 Passkey 소유권 확인, 글로벌 auth 라우트
  const existing = await prisma.webAuthnAuthenticator.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== user.sub) {
    return errorResponse("NOT_FOUND", "Passkey 가 존재하지 않거나 권한이 없습니다", 404);
  }

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 소유권 확인 후 Passkey 삭제, 글로벌 auth 라우트
  await prisma.webAuthnAuthenticator.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
