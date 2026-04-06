import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { getOrCreateRootFolder, getFolderContents, getBreadcrumb, createFolder } from "@/lib/filebox-db";
import { folderQuerySchema, createFolderSchema } from "@/lib/schemas/filebox";

export const runtime = "nodejs";

// 폴더 내용 조회 (하위 폴더 + 파일 + 브레드크럼)
export const GET = withAuth(async (request: NextRequest, user) => {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = folderQuerySchema.safeParse(params);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "잘못된 쿼리 파라미터", 400);
  }

  const isAdmin = user.role === "ADMIN";
  const targetUserId = (isAdmin && parsed.data.userId) ? parsed.data.userId : user.sub;

  // parentId가 없으면 루트 폴더
  let folderId = parsed.data.parentId;
  if (!folderId) {
    const root = await getOrCreateRootFolder(targetUserId);
    folderId = root.id;
  }

  const contents = await getFolderContents(folderId, user.sub, isAdmin);
  if (!contents) {
    return errorResponse("NOT_FOUND", "폴더를 찾을 수 없습니다", 404);
  }

  const breadcrumb = await getBreadcrumb(folderId);

  return successResponse({
    currentFolder: { id: contents.folder.id, name: contents.folder.name, isRoot: contents.folder.isRoot },
    breadcrumb,
    folders: contents.folders,
    files: contents.files,
  });
});

// 폴더 생성
export const POST = withAuth(async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  // parentId 없으면 루트에 생성
  let parentId = parsed.data.parentId;
  if (!parentId) {
    const root = await getOrCreateRootFolder(user.sub);
    parentId = root.id;
  }

  try {
    const folder = await createFolder(parsed.data.name, parentId, user.sub);
    return successResponse(folder, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "폴더 생성 실패";
    return errorResponse("CREATE_FAILED", message, 400);
  }
});
