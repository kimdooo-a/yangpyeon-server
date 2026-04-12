import { NextRequest, NextResponse } from "next/server";
import { getWhitelist, addIp, removeIp, syncCache } from "@/lib/ip-whitelist";
import { isCacheLoaded } from "@/lib/ip-whitelist-cache";
import { ipWhitelistAddSchema, ipWhitelistDeleteSchema } from "@/lib/schemas";
import { requireRoleApi } from "@/lib/auth-guard";

// 첫 요청 시 캐시 lazy load
async function ensureCacheLoaded() {
  if (!isCacheLoaded()) {
    await syncCache();
  }
}

/**
 * GET /api/settings/ip-whitelist — 목록 조회
 */
export async function GET() {
  const auth = await requireRoleApi("ADMIN");
  if (auth.response) return auth.response;

  try {
    await ensureCacheLoaded();
    const list = await getWhitelist();
    const enabled = process.env.IP_WHITELIST_ENABLED === "true";
    return NextResponse.json({ list, enabled });
  } catch (error) {
    return NextResponse.json(
      { error: "화이트리스트 조회 실패" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/ip-whitelist — IP 추가
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoleApi("ADMIN");
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = ipWhitelistAddSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "유효성 검증 실패" },
        { status: 400 }
      );
    }

    const result = await addIp(parsed.data.ip, parsed.data.description);
    return NextResponse.json({ success: true, item: result });
  } catch (error: unknown) {
    // UNIQUE 제약 위반 처리
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return NextResponse.json(
        { error: "이미 등록된 IP입니다" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "IP 추가 실패" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/ip-whitelist — IP 삭제
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireRoleApi("ADMIN");
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = ipWhitelistDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "유효성 검증 실패" },
        { status: 400 }
      );
    }

    await removeIp(parsed.data.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "IP 삭제 실패" },
      { status: 500 }
    );
  }
}
