import { z } from "zod";

// 폴더 내용 조회 쿼리
export const folderQuerySchema = z.object({
  parentId: z.string().uuid().optional(), // 없으면 루트
  userId: z.string().uuid().optional(),   // ADMIN용: 다른 유저 폴더 탐색
});

// 폴더 생성
export const createFolderSchema = z.object({
  name: z.string().min(1, "폴더 이름을 입력하세요").max(100, "폴더 이름이 너무 깁니다")
    .regex(/^[^<>"'`&\\\/\x00-\x1f]+$/, "사용할 수 없는 문자가 포함되어 있습니다"),
  parentId: z.string().uuid().optional(), // 없으면 루트에 생성
});

// 폴더 이름 변경
export const renameFolderSchema = z.object({
  name: z.string().min(1).max(100)
    .regex(/^[^<>"'`&\\\/\x00-\x1f]+$/, "사용할 수 없는 문자가 포함되어 있습니다"),
});

// 파일 업로드 (FormData에서 folderId만 검증)
export const fileUploadQuerySchema = z.object({
  folderId: z.string().uuid("잘못된 폴더 ID"),
});

// UUID 파라미터
export const uuidParamSchema = z.object({
  id: z.string().uuid("잘못된 ID"),
});
