import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse } from "@/lib/api-response";
import { getUserStorageInfo } from "@/lib/filebox-db";

export const runtime = "nodejs";

// 내 사용량 조회
export const GET = withAuth(async (_request: NextRequest, user) => {
  const info = await getUserStorageInfo(user.sub);
  return successResponse(info);
});
