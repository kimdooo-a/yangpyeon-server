import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";
import { isIpAllowed } from "@/lib/ip-whitelist-cache";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/login-v2",
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
];
const COOKIE_NAME = "dashboard_session";

function getClientIp(request: NextRequest): string {
  return extractClientIp(request.headers);
}

function getRateLimitConfig(pathname: string, method: string) {
  if (pathname === "/api/auth/login") return RATE_LIMITS.login;
  if (pathname === "/api/v1/auth/register") return RATE_LIMITS.v1Register;
  if (pathname === "/api/v1/auth/login") return RATE_LIMITS.v1Login;
  if (pathname.startsWith("/api/v1/")) return RATE_LIMITS.v1Api;
  if (pathname.match(/^\/api\/pm2\/\w+$/) && method === "POST") return RATE_LIMITS.pm2Action;
  if (pathname.startsWith("/api/filebox") && method === "POST") return RATE_LIMITS.fileUpload;
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

  // IP 화이트리스트 검사 (캐시 기반, Edge 호환)
  if (!isIpAllowed(ip)) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: pathname,
      ip,
      status: 403,
      action: "IP_BLOCKED",
    });
    return NextResponse.json(
      { error: "접근이 차단된 IP입니다" },
      { status: 403 }
    );
  }

  // 공개 경로: 인증 불필요하지만 Rate Limit은 적용
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p);

  if (!isPublic) {
    // v1 API는 각 Route에서 Bearer Token 인증 처리 (쿠키 인증 스킵)
    if (!pathname.startsWith("/api/v1/")) {
      // 기존 대시보드 쿠키 인증
      const token = request.cookies.get(COOKIE_NAME)?.value;

      if (!token) {
        return redirectToLogin(request);
      }

      let jwtPayload;
      try {
        const secret = process.env.AUTH_SECRET;
        if (!secret) return redirectToLogin(request);
        const { payload } = await jwtVerify(
          token,
          new TextEncoder().encode(secret),
        );
        jwtPayload = payload;
      } catch {
        return redirectToLogin(request);
      }

      // 역할 기반 접근 제어
      // 레거시 쿠키(role 없음)는 ADMIN으로 간주 (30일 전환 기간)
      const role = (jwtPayload.role as string) ?? "ADMIN";

      // ADMIN 전용 라우트 (POST만 제한, GET 조회는 허용)
      const ADMIN_ONLY_PATHS = [
        "/api/pm2/",     // PM2 액션 (POST만)
        "/api/settings/", // 설정 API
        "/audit",         // 감사 로그 페이지
        "/settings/",     // 설정 페이지
      ];

      const isAdminOnlyPath = ADMIN_ONLY_PATHS.some((p) =>
        pathname.startsWith(p),
      );

      if (isAdminOnlyPath && role !== "ADMIN") {
        // PM2 GET 요청은 viewer도 허용 (프로세스 목록 조회 등)
        const isPm2GetRequest =
          pathname.startsWith("/api/pm2/") && request.method === "GET";

        if (!isPm2GetRequest) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              { error: "관리자 권한 필요" },
              { status: 403 },
            );
          }
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
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

  // CORS/CSRF (API 요청) — v1 API는 Bearer Token 인증이므로 CSRF 스킵
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/v1/")) {
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

    // 감사 로그: POST/DELETE 요청 (상태 변경 작업)
    if ((request.method === "POST" || request.method === "DELETE") && !pathname.includes("/auth/")) {
      const action = pathname.startsWith("/api/filebox")
        ? (request.method === "POST" ? "FILEBOX_UPLOAD" : "FILEBOX_DELETE")
        : "PM2_CONTROL";
      writeAuditLog({
        timestamp: new Date().toISOString(),
        method: request.method,
        path: pathname,
        ip,
        action,
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
