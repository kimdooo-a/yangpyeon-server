import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const COOKIE_NAME = "dashboard_session";

function getClientIp(request: NextRequest): string {
  return extractClientIp(request.headers);
}

function getRateLimitConfig(pathname: string, method: string) {
  if (pathname === "/api/auth/login") return RATE_LIMITS.login;
  if (pathname.match(/^\/api\/pm2\/\w+$/) && method === "POST") return RATE_LIMITS.pm2Action;
  if (pathname.startsWith("/api/")) return RATE_LIMITS.api;
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request);

  // 정적 파일은 통과
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // 공개 경로: 인증 불필요하지만 Rate Limit은 적용
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p);

  if (!isPublic) {
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
  }

  // Rate Limiting (API 요청)
  const rateLimitConfig = getRateLimitConfig(pathname, request.method);
  if (rateLimitConfig) {
    const key = `${ip}:${pathname}`;
    const result = checkRateLimit(key, rateLimitConfig.maxRequests, rateLimitConfig.windowMs);

    if (!result.allowed) {
      writeAuditLog({
        timestamp: new Date().toISOString(),
        method: request.method,
        path: pathname,
        ip,
        status: 429,
        action: "RATE_LIMITED",
      });

      const response = NextResponse.json(
        { error: `요청 한도 초과. ${Math.ceil(result.resetMs / 1000)}초 후 재시도하세요.` },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      response.headers.set("X-RateLimit-Remaining", "0");
      return response;
    }
  }

  // CORS/CSRF (API 요청)
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && !origin.includes(host ?? "")) {
      const allowedOrigins = [
        "https://stylelucky4u.com",
        "http://localhost:3000",
      ];
      if (!allowedOrigins.includes(origin)) {
        writeAuditLog({
          timestamp: new Date().toISOString(),
          method: request.method,
          path: pathname,
          ip,
          status: 403,
          action: "CORS_BLOCKED",
        });
        return NextResponse.json({ error: "CORS 차단" }, { status: 403 });
      }
    }

    if (request.method === "POST") {
      const referer = request.headers.get("referer") || origin || "";
      const isValid =
        referer.includes("stylelucky4u.com") ||
        referer.includes("localhost:3000");
      if (!isValid) {
        writeAuditLog({
          timestamp: new Date().toISOString(),
          method: request.method,
          path: pathname,
          ip,
          status: 403,
          action: "CSRF_BLOCKED",
        });
        return NextResponse.json({ error: "CSRF 차단" }, { status: 403 });
      }
    }

    // 감사 로그: POST 요청 (상태 변경 작업)
    if (request.method === "POST" && !pathname.includes("/auth/")) {
      writeAuditLog({
        timestamp: new Date().toISOString(),
        method: request.method,
        path: pathname,
        ip,
        action: "PM2_CONTROL",
      });
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
