import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { withAuth } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { getFileForDownload, deleteFile } from "@/lib/filebox-db";
import { uuidParamSchema } from "@/lib/schemas/filebox";

export const runtime = "nodejs";

// 파일 다운로드
export const GET = withAuth(async (_request: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const idParsed = uuidParamSchema.safeParse({ id });
  if (!idParsed.success) return errorResponse("INVALID_ID", "잘못된 파일 ID", 400);

  const isAdmin = user.role === "ADMIN";
  const result = await getFileForDownload(id, user.sub, isAdmin);
  if (!result) return errorResponse("NOT_FOUND", "파일을 찾을 수 없습니다", 404);

  const buffer = await fs.readFile(result.filePath);
  const encodedName = encodeURIComponent(result.metadata.originalName);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": result.metadata.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(result.metadata.size),
    },
  });
});

// 파일 삭제
export const DELETE = withAuth(async (_request: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const idParsed = uuidParamSchema.safeParse({ id });
  if (!idParsed.success) return errorResponse("INVALID_ID", "잘못된 파일 ID", 400);

  try {
    await deleteFile(id, user.sub);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "삭제 실패";
    return errorResponse("DELETE_FAILED", message, 404);
  }
});
