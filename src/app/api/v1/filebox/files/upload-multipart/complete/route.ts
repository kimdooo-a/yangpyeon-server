// POST /api/v1/filebox/files/upload-multipart/complete
// ADR-033 후속 (S78-A) — multipart 완료 + DB row 생성
//
// 요청: { uploadId, key, parts: [{partNumber, etag}, ...], originalName, size, mimeType, folderId }
// 응답: 생성된 File row (storageType='r2', storedName=key)
//
// 절차:
// 1. 입력 검증 + key prefix + folder 소유권
// 2. CompleteMultipartUpload 호출 (모든 part 의 etag 를 partNumber 순서로 전달)
// 3. HEAD 검증 — 객체 실제 존재 + 크기 일치 (±10% — multipart commit 정합성 확인)
// 4. DB file row 생성 (storageType='r2', storedName=key)
//
// 보안:
// - withAuth 필수
// - key prefix tenants/{tenantId}/users/{user.sub}/... — 타인 객체 등록 차단
//
// 실패 시: SeaweedFS 객체는 그대로 — 24h cleanup (S78-B 별도 cron) 이 미등록 객체 회수
/* eslint-disable tenant/no-raw-prisma-without-tenant */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { completeMultipartUpload, headR2Object } from "@/lib/r2";

export const runtime = "nodejs";

const completeSchema = z.object({
  uploadId: z.string().min(10).max(500),
  key: z.string().min(10).max(500),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10000),
        etag: z.string().min(1).max(64),
      }),
    )
    .min(1)
    .max(10000),
  originalName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().max(255),
  folderId: z.string().uuid(),
});

export const POST = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "JSON 형식이 잘못되었습니다", 400);
  }

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "입력 오류", 400);
  }
  const { uploadId, key, parts, originalName, size, mimeType, folderId } = parsed.data;

  // 1. key prefix 검증
  const tenantId = "00000000-0000-0000-0000-000000000000"; // 'default'. T1.5 시 user.tenantId.
  const expectedPrefix = `tenants/${tenantId}/users/${user.sub}/`;
  if (!key.startsWith(expectedPrefix)) {
    return errorResponse("INVALID_KEY", "다른 사용자의 객체는 등록할 수 없습니다", 403);
  }

  // 2. 폴더 소유권
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { ownerId: true },
  });
  if (!folder || folder.ownerId !== user.sub) {
    return errorResponse("FOLDER_NOT_FOUND", "폴더를 찾을 수 없습니다", 404);
  }

  // 3. multipart 완료
  try {
    await completeMultipartUpload({ key, uploadId, parts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "multipart 완료 실패";
    return errorResponse("MULTIPART_COMPLETE_FAILED", message, 500);
  }

  // 4. HEAD 검증 — 실제 commit 된 객체의 존재/크기 확인
  let head;
  try {
    head = await headR2Object(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "HEAD 실패";
    return errorResponse("STORAGE_HEAD_FAILED", message, 500);
  }
  if (!head.exists) {
    return errorResponse("OBJECT_NOT_FOUND", "객체가 commit 되지 않았습니다", 404);
  }
  // 크기 검증 (±10% — part 경계 padding 등 가능성 차단)
  const sizeDiff = Math.abs((head.contentLength ?? 0) - size);
  if (sizeDiff > size * 0.1) {
    return errorResponse(
      "SIZE_MISMATCH",
      `크기 불일치 (요청 ${size}, 실제 ${head.contentLength})`,
      400,
    );
  }

  // 5. DB file row 생성
  try {
    const file = await prisma.file.create({
      data: {
        originalName: originalName.replace(/[<>"'`&\\]/g, "").slice(0, 255),
        storedName: key, // SeaweedFS object key (uuid 포함 글로벌 unique)
        size: head.contentLength ?? size,
        mimeType,
        folderId,
        ownerId: user.sub,
        storageType: "r2",
      },
    });
    return successResponse(file, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "DB 등록 실패";
    return errorResponse("DB_CREATE_FAILED", message, 500);
  }
});
/* eslint-enable tenant/no-raw-prisma-without-tenant */
