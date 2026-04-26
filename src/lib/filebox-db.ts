// 파일박스 DB 코어 로직 — Prisma + 로컬 파일시스템
//
// [T1.4 정당화] filebox-db 는 현재 플랫폼 운영자(단일 사용자) 전용 파일 저장소이며,
// 멀티테넌트 RLS 적용은 "첫 컨슈머 Almanac v1.0 출시 후 packages/tenant-almanac/ 마이그레이션"
// (ADR-024 부속 결정) 이후 별도 PR 에서 수행 예정.
// 현재 모든 prisma 호출은 ownerId(userId) 기준 소유권 검증이 인라인으로 적용되어
// cross-tenant leak 위험 없음 — 단일 플랫폼 운영자 컨텍스트에서만 호출됨.
// TODO(T1.5): withTenantQuery(tenantId, ...) 패턴으로 전환 (멀티테넌트 filebox 지원 시).
/* eslint-disable tenant/no-raw-prisma-without-tenant */
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

// 파일 저장 디렉토리
const FILEBOX_DIR = process.env.FILEBOX_DIR || path.join(process.env.HOME || "/tmp", "filebox");
const FILES_DIR = path.join(FILEBOX_DIR, "files");
const MAX_FILE_SIZE = Number(process.env.FILEBOX_MAX_SIZE) || 50 * 1024 * 1024;
const DEFAULT_STORAGE_LIMIT = Number(process.env.FILEBOX_USER_LIMIT) || 500 * 1024 * 1024; // 500MB
const ADMIN_STORAGE_LIMIT = Number(process.env.FILEBOX_ADMIN_LIMIT) || 100 * 1024 * 1024 * 1024; // 100GB

async function getUserStorageLimit(userId: string, role?: string): Promise<number> {
  if (role === "ADMIN") return ADMIN_STORAGE_LIMIT;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "ADMIN" ? ADMIN_STORAGE_LIMIT : DEFAULT_STORAGE_LIMIT;
}
const MAX_FOLDER_DEPTH = 10;

// MIME 타입 화이트리스트
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "text/plain", "text/csv",
  "application/json",
  "application/zip", "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/msword", "application/vnd.ms-powerpoint",
  "application/x-hwp", "application/haansofthwp",
]);

// 실행 파일 차단
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".ps1", ".sh", ".bash",
  ".com", ".msi", ".scr", ".vbs", ".wsf",
]);

// 디렉토리 초기화
export async function initFilesDir(): Promise<void> {
  await fs.mkdir(FILES_DIR, { recursive: true });
}

export class StaleSessionError extends Error {
  constructor(userId: string) {
    super(`세션 유저(${userId})가 DB에 존재하지 않습니다. 재로그인이 필요합니다.`);
    this.name = "StaleSessionError";
  }
}

// 유저 루트 폴더 조회 또는 생성
export async function getOrCreateRootFolder(userId: string) {
  const existing = await prisma.folder.findFirst({
    where: { ownerId: userId, isRoot: true },
  });
  if (existing) return existing;

  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!userExists) throw new StaleSessionError(userId);

  return prisma.folder.create({
    data: {
      name: "내 파일",
      ownerId: userId,
      isRoot: true,
      parentId: null,
    },
  });
}

// 폴더 내용 조회 (하위 폴더 + 파일)
export async function getFolderContents(folderId: string, userId: string, isAdmin: boolean) {
  // 소유권 확인
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) return null;
  if (!isAdmin && folder.ownerId !== userId) return null;

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    }),
    prisma.file.findMany({
      where: { folderId },
      orderBy: { createdAt: "desc" },
      select: { id: true, originalName: true, size: true, mimeType: true, createdAt: true },
    }),
  ]);

  return { folder, folders, files };
}

// 브레드크럼 경로 조회 (루트까지 역추적)
export async function getBreadcrumb(folderId: string) {
  const crumbs: { id: string; name: string }[] = [];
  let current = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, parentId: true, isRoot: true },
  });

  while (current) {
    crumbs.unshift({ id: current.id, name: current.name });
    if (current.isRoot || !current.parentId) break;
    current = await prisma.folder.findUnique({
      where: { id: current.parentId },
      select: { id: true, name: true, parentId: true, isRoot: true },
    });
  }
  return crumbs;
}

// 폴더 깊이 확인
async function getFolderDepth(folderId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = folderId;
  while (currentId) {
    depth++;
    const folder: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = folder?.parentId ?? null;
  }
  return depth;
}

// 폴더 생성
export async function createFolder(name: string, parentId: string, userId: string) {
  // 부모 폴더 소유권 확인
  const parent = await prisma.folder.findUnique({ where: { id: parentId } });
  if (!parent || parent.ownerId !== userId) {
    throw new Error("폴더를 찾을 수 없습니다");
  }

  // 깊이 제한
  const depth = await getFolderDepth(parentId);
  if (depth >= MAX_FOLDER_DEPTH) {
    throw new Error(`폴더 깊이 제한 초과 (최대 ${MAX_FOLDER_DEPTH}단계)`);
  }

  // 동일 이름 확인
  const duplicate = await prisma.folder.findFirst({
    where: { parentId, name, ownerId: userId },
  });
  if (duplicate) {
    throw new Error("같은 이름의 폴더가 이미 존재합니다");
  }

  return prisma.folder.create({
    data: { name, parentId, ownerId: userId },
  });
}

// 폴더 이름 변경
export async function renameFolder(folderId: string, name: string, userId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== userId) throw new Error("폴더를 찾을 수 없습니다");
  if (folder.isRoot) throw new Error("루트 폴더는 이름을 변경할 수 없습니다");

  // 동일 이름 확인
  const duplicate = await prisma.folder.findFirst({
    where: { parentId: folder.parentId, name, ownerId: userId, id: { not: folderId } },
  });
  if (duplicate) throw new Error("같은 이름의 폴더가 이미 존재합니다");

  return prisma.folder.update({ where: { id: folderId }, data: { name } });
}

// 폴더 삭제 (하위 파일 물리 삭제 포함)
export async function deleteFolder(folderId: string, userId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== userId) throw new Error("폴더를 찾을 수 없습니다");
  if (folder.isRoot) throw new Error("루트 폴더는 삭제할 수 없습니다");

  // 하위 모든 파일의 storedName 수집 (물리 파일 삭제용)
  const filesToDelete = await collectFilesRecursive(folderId);

  // DB 삭제 (onDelete: Cascade로 하위 폴더/파일 자동 삭제)
  await prisma.folder.delete({ where: { id: folderId } });

  // 물리 파일 삭제
  await initFilesDir();
  for (const storedName of filesToDelete) {
    const filePath = path.join(FILES_DIR, storedName);
    try { await fs.unlink(filePath); } catch { /* 이미 삭제됨 */ }
  }
}

// 재귀적으로 하위 파일 수집
async function collectFilesRecursive(folderId: string): Promise<string[]> {
  const files = await prisma.file.findMany({
    where: { folderId },
    select: { storedName: true },
  });
  const childFolders = await prisma.folder.findMany({
    where: { parentId: folderId },
    select: { id: true },
  });
  const childFiles = await Promise.all(
    childFolders.map((f) => collectFilesRecursive(f.id))
  );
  return [...files.map((f) => f.storedName), ...childFiles.flat()];
}

// 파일 검증
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `파일 크기 초과 (최대 ${formatBytes(MAX_FILE_SIZE)})` };
  }
  if (file.size === 0) {
    return { valid: false, error: "빈 파일은 업로드할 수 없습니다" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { valid: false, error: `허용되지 않는 파일 형식: ${file.type || "알 수 없음"}` };
  }
  const ext = path.extname(file.name).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `실행 파일은 업로드할 수 없습니다: ${ext}` };
  }
  return { valid: true };
}

// 파일 업로드
export async function uploadFile(file: File, folderId: string, userId: string, role?: string) {
  // 폴더 소유권 확인
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder || folder.ownerId !== userId) {
    throw new Error("폴더를 찾을 수 없습니다");
  }

  // 용량 확인
  const usage = await getUserStorageUsage(userId);
  const limit = await getUserStorageLimit(userId, role);
  if (usage + file.size > limit) {
    throw new Error(`저장 용량 초과 (${formatBytes(usage)}/${formatBytes(limit)} 사용 중)`);
  }

  await initFilesDir();
  const storedName = randomUUID();
  const filePath = path.join(FILES_DIR, storedName);

  // path traversal 방지
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(FILES_DIR))) {
    throw new Error("잘못된 파일 경로");
  }

  // 파일 저장
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  // DB 레코드 생성
  return prisma.file.create({
    data: {
      originalName: sanitizeFilename(file.name),
      storedName,
      size: file.size,
      mimeType: file.type,
      folderId,
      ownerId: userId,
    },
  });
}

// 파일 다운로드 경로 조회
export async function getFileForDownload(fileId: string, userId: string, isAdmin: boolean) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  if (!isAdmin && file.ownerId !== userId) return null;

  const filePath = path.resolve(path.join(FILES_DIR, file.storedName));
  if (!filePath.startsWith(path.resolve(FILES_DIR))) return null;

  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  return { filePath, metadata: file };
}

// 파일 삭제
export async function deleteFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.ownerId !== userId) throw new Error("파일을 찾을 수 없습니다");

  const filePath = path.join(FILES_DIR, file.storedName);
  await prisma.file.delete({ where: { id: fileId } });

  try { await fs.unlink(filePath); } catch { /* 이미 삭제됨 */ }
}

// 유저 사용량 조회
export async function getUserStorageUsage(userId: string): Promise<number> {
  const result = await prisma.file.aggregate({
    where: { ownerId: userId },
    _sum: { size: true },
  });
  return result._sum.size ?? 0;
}

// 유저 사용량 + 한도
export async function getUserStorageInfo(userId: string, role?: string) {
  const [used, limit] = await Promise.all([
    getUserStorageUsage(userId),
    getUserStorageLimit(userId, role),
  ]);
  return { used, limit };
}

// 파일명 새니타이즈
function sanitizeFilename(name: string): string {
  return name.replace(/[<>"'`&\\]/g, "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 255);
}

// 바이트 포맷
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
/* eslint-enable tenant/no-raw-prisma-without-tenant */
