import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

/**
 * GET /api/auth/me
 * 대시보드 쿠키 세션에서 현재 사용자 정보 반환
 */
export async function GET() {
  const session = await getSessionFromCookies();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "인증되지 않은 요청" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    user: {
      sub: session.sub,
      email: session.email,
      role: session.role,
    },
  });
}
