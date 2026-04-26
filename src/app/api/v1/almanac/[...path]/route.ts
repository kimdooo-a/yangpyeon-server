/**
 * /api/v1/almanac/* → /api/v1/t/almanac/* 308 Permanent Redirect alias
 *
 * Phase 1.6 (T1.6) — Almanac 첫 컨슈머 경로 편의 alias.
 * 308 = Permanent + 메서드 보존 (307 Temporary 와 달리 클라이언트가 새 URL 캐싱).
 *
 * 클라이언트가 기존 /api/v1/almanac/* 경로를 사용하고 있다면, 308 수신 후
 * /api/v1/t/almanac/* 로 영구 전환 가능.
 *
 * ADR-027 §URL path A + K3: 테넌트 라우팅은 /api/v1/t/<slug>/* 가 정식 경로.
 * 본 alias는 Almanac v1.0 출시 기간 동안만 유지 (plugin 마이그레이션 후 제거 예정).
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  path?: string[];
}

function buildTarget(req: NextRequest, params: RouteParams): string {
  const pathSegments = params.path ?? [];
  const pathStr = pathSegments.join("/");
  const search = req.nextUrl.search;
  return `/api/v1/t/almanac/${pathStr}${search}`;
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  const resolved = await params;
  const target = buildTarget(req, resolved);
  return NextResponse.redirect(new URL(target, req.url), 308);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
