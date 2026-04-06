import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPassword, COOKIE_NAME, MAX_AGE } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";

// 브루트포스 방지: IP별 실패 카운터
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5분

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // 브루트포스 체크
  const attempts = loginAttempts.get(ip);
  if (attempts) {
    if (
      attempts.count >= MAX_ATTEMPTS &&
      Date.now() - attempts.lastAttempt < LOCKOUT_DURATION
    ) {
      const remaining = Math.ceil(
        (LOCKOUT_DURATION - (Date.now() - attempts.lastAttempt)) / 1000
      );
      return NextResponse.json(
        { error: `너무 많은 시도. ${remaining}초 후 재시도하세요.` },
        { status: 429 }
      );
    }
    // 잠금 기간 지나면 초기화
    if (Date.now() - attempts.lastAttempt >= LOCKOUT_DURATION) {
      loginAttempts.delete(ip);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "잘못된 입력" }, { status: 400 });
  }

  const { password } = parsed.data;

  if (!verifyPassword(password)) {
    // 실패 카운터 증가
    const current = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    loginAttempts.set(ip, {
      count: current.count + 1,
      lastAttempt: Date.now(),
    });

    return NextResponse.json({ error: "비밀번호가 틀렸습니다" }, { status: 401 });
  }

  // 성공: 실패 카운터 초기화
  loginAttempts.delete(ip);

  const token = await createSession();

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });

  return response;
}
