// POST /api/v1/filebox/files/r2-presigned
// ADR-032 V1 옵션 A — R2 PUT presigned URL 발급
//
// 요청: { fileName, fileSize, mimeType, folderId? }
// 응답: { fileId, key, uploadUrl, expiresAt, maxSize }
//
// 클라이언트는 응답의 uploadUrl 로 PUT 후 r2-confirm 호출.
//
// 보안:
// - withAuth 필수
// - 파일 크기 사전 검증 (MAX_R2_FILE_SIZE)
// - quota 사전 검증 (R2 사용량 + 본 요청 크기 ≤ R2_USER_QUOTA)
// - MIME 화이트리스트 (filebox-db.ts 와 동일)
// - 폴더 소유권 확인
//
// patten:
// - 본 라우트는 "예약" 만 함 — DB row 는 status='pending' 상태로 생성
// - r2-confirm 에서 R2 HEAD 검증 후 status='active' 로 전환
// - 24h 후 pending row 자동 cleanup (별도 cron)
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
  presignR2PutUrl,
  MAX_R2_FILE_SIZE,
  R2_USER_QUOTA,
  R2_ADMIN_QUOTA,
} from "@/lib/r2";

export const runtime = "nodejs";

const presignSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_R2_FILE_SIZE),
  mimeType: z.string().max(255),
  folderId: z.string().uuid().optional(),
});

// 차단 확장자 (filebox-db.ts 와 동일 — 향후 공통 모듈로 추출)
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

  const parsed = presignSchema.safeParse(body);
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

  // 4. R2 quota 사전 검증
  const isAdmin = user.role === "ADMIN";
  const r2Limit = isAdmin ? R2_ADMIN_QUOTA : R2_USER_QUOTA;
  const r2Used = await prisma.file.aggregate({
    where: { ownerId: user.sub, storageType: "r2" },
    _sum: { size: true },
  });
  const r2UsedBytes = r2Used._sum.size ?? 0;
  if (r2UsedBytes + fileSize > r2Limit) {
    return errorResponse(
      "QUOTA_EXCEEDED",
      `R2 저장 한도 초과 (${r2UsedBytes}/${r2Limit} 사용, 요청 ${fileSize})`,
      413,
    );
  }

  // 5. R2 key 생성
  const tenantId = "00000000-0000-0000-0000-000000000000"; // 'default' tenant. T1.5 시 user.tenantId 로 전환
  const key = buildR2Key({ tenantId, userId: user.sub, originalName: fileName });

  // 6. presigned URL 발급
  let presigned: { url: string; expiresAt: number };
  try {
    presigned = await presignR2PutUrl({ key, contentLength: fileSize, contentType: mimeType });
  } catch (err) {
    const message = err instanceof Error ? err.message : "R2 URL 발급 실패";
    return errorResponse("R2_PRESIGN_FAILED", message, 500);
  }

  // 7. DB 예약 row (status 컬럼 미도입 — V1.1 추가 예정. 현재는 우선 file row 만 생성하지 않고 응답)
  //    클라이언트가 PUT 후 r2-confirm 호출 시 file row 생성됨.
  //    이 단계에서 row 미생성 이유: PUT 실패 시 DB cleanup 부담 회피 + R2 객체만 깨끗이 정리.

  return successResponse({
    key,
    uploadUrl: presigned.url,
    expiresAt: presigned.expiresAt,
    maxSize: MAX_R2_FILE_SIZE,
    folderId: resolvedFolderId,
  });
});
/* eslint-enable tenant/no-raw-prisma-without-tenant */
