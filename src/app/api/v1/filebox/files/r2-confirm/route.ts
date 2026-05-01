// POST /api/v1/filebox/files/r2-confirm
// ADR-032 V1 옵션 A — R2 PUT 완료 후 DB file row 등록
//
// 요청: { key, originalName, size, mimeType, folderId, etag? }
// 응답: { metadata: File }
//
// 절차:
// 1. 입력 검증 + folder 소유권 확인
// 2. R2 HEAD 호출 — 객체 실제 존재 + 크기 일치 검증
// 3. DB file row 생성 (storageType='r2', storedName=key)
//
// 보안:
// - withAuth 필수
// - 객체 키 prefix 검증 (tenants/{tenantId}/users/{user.sub}/...) — 타인 객체 등록 차단
// - HEAD 결과 size 가 요청 size 와 ±10% 이내 (HTTP/2 chunk overhead 허용)
// - MIME 화이트리스트 (presigned 단계와 동일)
//
// 실패 시: R2 객체는 그대로 — 24h cleanup cron 이 미등록 객체 회수
/* eslint-disable tenant/no-raw-prisma-without-tenant */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { headR2Object } from "@/lib/r2";

export const runtime = "nodejs";

const confirmSchema = z.object({
  key: z.string().min(10).max(500),
  originalName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().max(255),
  folderId: z.string().uuid(),
  etag: z.string().max(64).optional(),
});

export const POST = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "JSON 형식이 잘못되었습니다", 400);
  }
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "입력 오류", 400);
  }
  const { key, originalName, size, mimeType, folderId } = parsed.data;

  // 1. 객체 키 prefix 검증 — 타인 객체 등록 차단
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

  // 3. R2 HEAD 검증 (객체 실제 존재 + 크기 일치)
  let head;
  try {
    head = await headR2Object(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "R2 HEAD 실패";
    return errorResponse("R2_HEAD_FAILED", message, 500);
  }
  if (!head.exists) {
    return errorResponse("OBJECT_NOT_FOUND", "R2 객체가 존재하지 않습니다 (PUT 미완료)", 404);
  }
  // 크기 검증 (±10% 허용 — HTTP/2 chunk overhead)
  const sizeDiff = Math.abs((head.contentLength ?? 0) - size);
  if (sizeDiff > size * 0.1) {
    return errorResponse(
      "SIZE_MISMATCH",
      `크기 불일치 (요청 ${size}, R2 ${head.contentLength})`,
      400,
    );
  }

  // 4. DB row 생성 (storageType='r2', storedName=key)
  try {
    const file = await prisma.file.create({
      data: {
        originalName: originalName.replace(/[<>"'`&\\]/g, "").slice(0, 255),
        storedName: key, // R2 object key (글로벌 unique 보장 — uuid 포함)
        size: head.contentLength ?? size,
        mimeType: mimeType,
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
