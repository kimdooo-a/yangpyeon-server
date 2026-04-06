import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { uploadFile, validateFile, getOrCreateRootFolder } from "@/lib/filebox-db";

export const runtime = "nodejs";

// 파일 업로드
export const POST = withAuth(async (request: NextRequest, user) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("INVALID_REQUEST", "잘못된 요청 형식", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return errorResponse("NO_FILE", "파일이 없습니다", 400);
  }

  // 파일 검증
  const validation = validateFile(file);
  if (!validation.valid) {
    return errorResponse("INVALID_FILE", validation.error!, 400);
  }

  // folderId 확인 (없으면 루트)
  let folderId = formData.get("folderId") as string | null;
  if (!folderId) {
    const root = await getOrCreateRootFolder(user.sub);
    folderId = root.id;
  }

  try {
    const metadata = await uploadFile(file, folderId, user.sub);
    return successResponse(metadata, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드 실패";
    const status = message.includes("용량 초과") ? 413 : 500;
    return errorResponse("UPLOAD_FAILED", message, status);
  }
});
