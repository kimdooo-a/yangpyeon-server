// POST /api/v1/filebox/files/upload-multipart/part?uploadId=&key=&partNumber=
// ADR-033 후속 (S78-A) — multipart 단일 파트 업로드
//
// 쿼리: uploadId / key / partNumber (1..10000)
// body: raw bytes (Content-Type=application/octet-stream)
// Content-Length 헤더 필수
// 응답: { etag, partNumber }
//
// 보안:
// - withAuth 필수
// - key prefix 검증: tenants/{tenantId}/users/{user.sub}/... — 타인 객체 차단
// - Content-Length 5KB ~ 100MB 범위 검증 (마지막 part 만 5MB 미만 허용 — 5KB 가 마진)
//
// 흐름:
// - 본 라우트가 raw body 를 buffer 로 받아 SeaweedFS UploadPart 호출
// - browser → cloudflare tunnel (50MB OK) → ypserver → SeaweedFS localhost
// - 동시 호출 가능 (frontend Promise.race sliding window 3개)
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { uploadPart } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 120; // 2분 (50MB part 업로드 + 안전 마진)
export const dynamic = "force-dynamic";

const MIN_PART_SIZE = 5 * 1024;            // 5KB (마지막 part 도 통과)
const MAX_PART_SIZE = 100 * 1024 * 1024;   // 100MB (cloudflare tunnel 한계)

const querySchema = z.object({
  uploadId: z.string().min(10).max(500),
  key: z.string().min(10).max(500),
  partNumber: z.coerce.number().int().min(1).max(10000),
});

export const POST = withAuth(async (request: NextRequest, user) => {
  // 1. 쿼리 파싱
  const url = new URL(request.url);
  const queryParsed = querySchema.safeParse({
    uploadId: url.searchParams.get("uploadId"),
    key: url.searchParams.get("key"),
    partNumber: url.searchParams.get("partNumber"),
  });
  if (!queryParsed.success) {
    return errorResponse("INVALID_INPUT", queryParsed.error.issues[0]?.message ?? "쿼리 오류", 400);
  }
  const { uploadId, key, partNumber } = queryParsed.data;

  // 2. key prefix 검증 — 타인 객체 차단
  const tenantId = "00000000-0000-0000-0000-000000000000"; // 'default'. T1.5 시 user.tenantId.
  const expectedPrefix = `tenants/${tenantId}/users/${user.sub}/`;
  if (!key.startsWith(expectedPrefix)) {
    return errorResponse("INVALID_KEY", "다른 사용자의 객체에는 업로드할 수 없습니다", 403);
  }

  // 3. Content-Length 검증
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  if (
    !Number.isFinite(contentLength) ||
    contentLength < MIN_PART_SIZE ||
    contentLength > MAX_PART_SIZE
  ) {
    return errorResponse(
      "INVALID_CONTENT_LENGTH",
      `part 크기 부적절 (${contentLengthHeader ?? "헤더 없음"})`,
      400,
    );
  }

  // 4. body 읽기 (전체 buffer — UploadPart 는 ContentLength 명시 PUT)
  let buffer: Buffer;
  try {
    const arrayBuffer = await request.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
    if (buffer.length !== contentLength) {
      return errorResponse(
        "BODY_LENGTH_MISMATCH",
        `body 크기 불일치 (header ${contentLength}, body ${buffer.length})`,
        400,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "body 읽기 실패";
    return errorResponse("BODY_READ_FAILED", message, 500);
  }

  // 5. UploadPart 호출
  try {
    const result = await uploadPart({
      key,
      uploadId,
      partNumber,
      body: buffer,
      contentLength,
    });
    return successResponse({ etag: result.etag, partNumber });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UploadPart 실패";
    return errorResponse("UPLOAD_PART_FAILED", message, 500);
  }
});
