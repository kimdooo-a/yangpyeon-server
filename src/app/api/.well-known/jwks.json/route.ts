import { NextResponse } from "next/server";
import { getActivePublicJwks } from "@/lib/jwks/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * JWKS endpoint — 공개 키 집합 제공.
 * 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md §7.2.1
 *
 * SP-014 실측 (2026-04-19):
 *   - jose cacheMaxAge=180s 적용 시 검증 p95 0.189ms, hit rate 99.0%.
 *   - 키 회전 grace는 "엔드포인트가 구·신 키 동시 서빙"으로 성립 — 클라이언트 캐시 만으로는 부족.
 *
 * Cache-Control 전략:
 *   - max-age=180 (3분): jose client cacheMaxAge와 일치. 회전 시 grace 보장.
 *   - stale-while-revalidate=600 (10분): CDN 장애 시 구 응답 서빙 허용.
 */
export async function GET() {
  const keys = await getActivePublicJwks();
  return NextResponse.json(
    { keys },
    {
      headers: {
        "Cache-Control": "public, max-age=180, stale-while-revalidate=600",
        "Content-Type": "application/jwk-set+json",
      },
    },
  );
}
