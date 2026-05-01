// POST /api/v1/filebox/files/upload-multipart/init
// ADR-033 후속 (S78-A) — SeaweedFS multipart upload 초기화
//
// 요청: { fileName, fileSize, mimeType, folderId? }
// 응답: { uploadId, key, partSize, partCount, folderId }
//
// 클라이언트는 응답의 uploadId/key 로 part 1..partCount 까지 업로드 후
// upload-multipart/complete 호출. 실패 시 upload-multipart/abort.
//
// 보안:
// - withAuth 필수
// - 파일 크기 사전 검증 (MAX_R2_FILE_SIZE)
// - quota 사전 검증 (storageType='r2' 사용량 + 본 요청 ≤ 한도)
// - 확장자 차단 (filebox-db.ts 와 동일)
// - 폴더 소유권 확인
//
// 패턴:
// - 본 라우트는 multipart 시작만 — DB row 는 complete 단계에서 생성
// - abandoned uploadId 는 24h 후 SeaweedFS cleanup (S78-B 별도 cron)
//
// T1.5 멀티테넌트 filebox 전환 시 prismaWithTenant 적용 필요 (TODO 표기)
/* eslint-disable tenant/no-raw-prisma-without-tenant */
import { NextRequest } from "next/server";
import { z } from "zod";
import path from "path";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  buildR2Key,
  createMultipartUpload,
  MAX_R2_FILE_SIZE,
  MULTIPART_PART_SIZE,
  R2_USER_QUOTA,
  R2_ADMIN_QUOTA,
} from "@/lib/r2";

export const runtime = "nodejs";

const initSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_R2_FILE_SIZE),
  mimeType: z.string().max(255),
  folderId: z.string().uuid().optional(),
});

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".ps1", ".sh", ".bash",
  ".com", ".msi", ".scr", ".vbs", ".wsf",
]);

export const POST = withAuth(async (request: NextRequest, user) => {
  // 1. 입력 검증
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "JSON 형식이 잘못되었습니다", 400);
  }

  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "입력 오류", 400);
  }
  const { fileName, fileSize, mimeType, folderId } = parsed.data;

  // 2. 확장자 차단
  const ext = path.extname(fileName).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return errorResponse("BLOCKED_EXTENSION", `실행 파일은 업로드할 수 없습니다: ${ext}`, 400);
  }

  // 3. 폴더 결정 (없으면 루트)
  let resolvedFolderId = folderId;
  if (!resolvedFolderId) {
    const root = await prisma.folder.findFirst({
      where: { ownerId: user.sub, isRoot: true },
      select: { id: true },
    });
    if (!root) {
      return errorResponse("ROOT_FOLDER_MISSING", "루트 폴더를 먼저 생성하세요", 400);
    }
    resolvedFolderId = root.id;
  } else {
    const folder = await prisma.folder.findUnique({
      where: { id: resolvedFolderId },
      select: { ownerId: true },
    });
    if (!folder || folder.ownerId !== user.sub) {
      return errorResponse("FOLDER_NOT_FOUND", "폴더를 찾을 수 없습니다", 404);
    }
  }

  // 4. quota 사전 검증 (storageType='r2' 만 합산)
  const isAdmin = user.role === "ADMIN";
  const storageLimit = isAdmin ? R2_ADMIN_QUOTA : R2_USER_QUOTA;
  const storageUsed = await prisma.file.aggregate({
    where: { ownerId: user.sub, storageType: "r2" },
    _sum: { size: true },
  });
  const storageUsedBytes = storageUsed._sum.size ?? 0;
  if (storageUsedBytes + fileSize > storageLimit) {
    return errorResponse(
      "QUOTA_EXCEEDED",
      `저장 한도 초과 (${storageUsedBytes}/${storageLimit} 사용, 요청 ${fileSize})`,
      413,
    );
  }

  // 5. key 생성 + multipart 시작
  const tenantId = "00000000-0000-0000-0000-000000000000"; // 'default' tenant. T1.5 시 user.tenantId 로 전환.
  const key = buildR2Key({ tenantId, userId: user.sub, originalName: fileName });

  let uploadId: string;
  try {
    const result = await createMultipartUpload({ key, contentType: mimeType });
    uploadId = result.uploadId;
  } catch (err) {
    const message = err instanceof Error ? err.message : "multipart 시작 실패";
    return errorResponse("MULTIPART_INIT_FAILED", message, 500);
  }

  const partCount = Math.ceil(fileSize / MULTIPART_PART_SIZE);
  return successResponse({
    uploadId,
    key,
    partSize: MULTIPART_PART_SIZE,
    partCount,
    folderId: resolvedFolderId,
  });
});
/* eslint-enable tenant/no-raw-prisma-without-tenant */
