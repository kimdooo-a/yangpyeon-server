import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";
import { isIpAllowed } from "@/lib/ip-whitelist-cache";

// Next.js 16 proxy는 암시적으로 Node.js 런타임에서만 동작 — `runtime` 선언 금지.

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

/**
 * Next.js 16 proxy (네트워크 경계 전담).
 *
 * Auth/RBAC은 Layout + Route Handler에서 재검증 — CVE-2025-29927 방어.
 * 책임: IP 화이트리스트, Rate Limit, CORS/CSRF, 감사 로그.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = extractClientIp(request.headers);

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // 1. IP 화이트리스트
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
      { status: 403 },
    );
  }

  // 2. Rate Limit
  const rlCfg = getRateLimitConfig(pathname, request.method);
  if (rlCfg) {
    const result = checkRateLimit(
      `${ip}:${pathname}`,
      rlCfg.maxRequests,
      rlCfg.windowMs,
    );
    if (!result.allowed) {
      writeAuditLog({
        timestamp: new Date().toISOString(),
        method: request.method,
        path: pathname,
        ip,
        status: 429,
        action: "RATE_LIMITED",
      });
      const res = NextResponse.json(
        {
          error: `요청 한도 초과. ${Math.ceil(result.resetMs / 1000)}초 후 재시도하세요.`,
        },
        { status: 429 },
      );
      res.headers.set("Retry-After", String(Math.ceil(result.resetMs / 1000)));
      res.headers.set("X-RateLimit-Remaining", "0");
      return res;
    }
  }

  // 3. CORS/CSRF + 상태변경 감사 로그 (대시보드 API만, v1 제외 — v1은 Bearer 기반)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/v1/")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin && !origin.includes(host ?? "")) {
      const allowed = [
        "https://stylelucky4u.com",
        "http://localhost:3000",
      ];
      if (!allowed.includes(origin)) {
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

    if (
      (request.method === "POST" || request.method === "DELETE") &&
      !pathname.includes("/auth/")
    ) {
      const action = pathname.startsWith("/api/filebox")
        ? request.method === "POST"
          ? "FILEBOX_UPLOAD"
          : "FILEBOX_DELETE"
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
