import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/jwt-v1";
import { createSession, COOKIE_NAME, MAX_AGE } from "@/lib/auth";

// v1 accessToken을 검증하고 대시보드 세션 쿠키를 발급
export async function POST(request: NextRequest) {
  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const token = body.accessToken;
  if (!token) {
    return NextResponse.json({ error: "토큰 필요" }, { status: 400 });
  }

  const payload = await verifyAccessToken(token);
  if (!payload) {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 401 });
  }

  // 대시보드 세션 쿠키 발급
  const sessionToken = await createSession();
  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });

  return response;
}
