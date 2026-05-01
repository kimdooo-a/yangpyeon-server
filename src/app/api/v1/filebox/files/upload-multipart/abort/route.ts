// POST /api/v1/filebox/files/upload-multipart/abort
// ADR-033 후속 (S78-A) — multipart 중단 (사용자 취소 / 네트워크 드롭 / 부분 실패)
//
// 요청: { uploadId, key }
// 응답: { ok: true }
//
// 보안:
// - withAuth 필수
// - key prefix 검증 — 타인의 multipart 중단 차단
//
// 멱등: 이미 abort/complete 된 uploadId 는 NoSuchUpload 응답을 200 으로 swallow.
// 실패 시 SeaweedFS 의 24h cleanup (S78-B cron) 이 결국 회수.
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { abortMultipartUpload } from "@/lib/r2";

export const runtime = "nodejs";

const abortSchema = z.object({
  uploadId: z.string().min(10).max(500),
  key: z.string().min(10).max(500),
});

export const POST = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "JSON 형식이 잘못되었습니다", 400);
  }

  const parsed = abortSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "입력 오류", 400);
  }
  const { uploadId, key } = parsed.data;

  // key prefix 검증 — 타인 multipart 중단 차단
  const tenantId = "00000000-0000-0000-0000-000000000000"; // 'default'. T1.5 시 user.tenantId.
  const expectedPrefix = `tenants/${tenantId}/users/${user.sub}/`;
  if (!key.startsWith(expectedPrefix)) {
    return errorResponse("INVALID_KEY", "다른 사용자의 multipart 는 중단할 수 없습니다", 403);
  }

  try {
    await abortMultipartUpload({ key, uploadId });
    return successResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "abort 실패";
    return errorResponse("MULTIPART_ABORT_FAILED", message, 500);
  }
});
