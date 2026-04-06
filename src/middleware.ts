import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const COOKIE_NAME = "dashboard_session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 파일, public 경로는 통과
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p)
  ) {
    return NextResponse.next();
  }

  // 세션 토큰 확인
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return redirectToLogin(request);
    await jwtVerify(token, new TextEncoder().encode(secret));
  } catch {
    return redirectToLogin(request);
  }

  // CORS: API 요청에 대해 Origin 검증
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    // 같은 origin이거나 origin 없음(서버 사이드)이면 허용
    if (origin && !origin.includes(host ?? "")) {
      const allowedOrigins = [
        "https://stylelucky4u.com",
        "http://localhost:3000",
      ];
      if (!allowedOrigins.includes(origin)) {
        return NextResponse.json({ error: "CORS 차단" }, { status: 403 });
      }
    }

    // CSRF: POST 요청에 대해 Origin/Referer 검증
    if (request.method === "POST") {
      const referer = request.headers.get("referer") || origin || "";
      const isValid =
        referer.includes("stylelucky4u.com") ||
        referer.includes("localhost:3000");
      if (!isValid) {
        return NextResponse.json({ error: "CSRF 차단" }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
