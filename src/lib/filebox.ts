// 파일박스 코어 로직 — 로컬 파일시스템 + JSON 메타데이터
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

export interface FileMetadata {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

// 환경변수 기반 설정
const FILEBOX_DIR = process.env.FILEBOX_DIR || path.join(process.env.HOME || "/tmp", "filebox");
const FILES_DIR = path.join(FILEBOX_DIR, "files");
const METADATA_PATH = path.join(FILEBOX_DIR, "metadata.json");
const MAX_FILE_SIZE = Number(process.env.FILEBOX_MAX_SIZE) || 50 * 1024 * 1024; // 50MB
const TOTAL_LIMIT = Number(process.env.FILEBOX_TOTAL_LIMIT) || 500 * 1024 * 1024; // 500MB

// MIME 타입 화이트리스트
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/x-hwp",
  "application/haansofthwp",
]);

// 실행 파일 확장자 블랙리스트
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".ps1", ".sh", ".bash",
  ".com", ".msi", ".scr", ".vbs", ".js", ".wsf",
]);

// 동시 쓰기 보호 (인메모리 mutex)
let writeLock: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = writeLock;
  let release: () => void;
  writeLock = new Promise((r) => (release = r));
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
}

// 디렉토리 초기화
export async function initFileboxDir(): Promise<void> {
  await fs.mkdir(FILES_DIR, { recursive: true });
  try {
    await fs.access(METADATA_PATH);
  } catch {
    await fs.writeFile(METADATA_PATH, "[]", "utf-8");
  }
}

// 메타데이터 읽기
export async function getMetadata(): Promise<FileMetadata[]> {
  await initFileboxDir();
  const raw = await fs.readFile(METADATA_PATH, "utf-8");
  return JSON.parse(raw) as FileMetadata[];
}

// 메타데이터 저장
async function saveMetadata(data: FileMetadata[]): Promise<void> {
  await fs.writeFile(METADATA_PATH, JSON.stringify(data, null, 2), "utf-8");
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

// 파일 저장
export async function saveFile(file: File): Promise<FileMetadata> {
  return withLock(async () => {
    await initFileboxDir();

    // 용량 확인
    const metadata = await getMetadata();
    const usedBytes = metadata.reduce((sum, f) => sum + f.size, 0);
    if (usedBytes + file.size > TOTAL_LIMIT) {
      throw new Error(`저장 용량 초과 (${formatBytes(usedBytes)}/${formatBytes(TOTAL_LIMIT)} 사용 중)`);
    }

    const id = randomUUID();
    const storedName = id;
    const filePath = path.join(FILES_DIR, storedName);

    // path traversal 방지: 저장 경로가 FILES_DIR 내부인지 확인
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(FILES_DIR))) {
      throw new Error("잘못된 파일 경로");
    }

    // 파일 바이너리 저장
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const entry: FileMetadata = {
      id,
      originalName: sanitizeFilename(file.name),
      storedName,
      size: file.size,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    };

    metadata.push(entry);
    await saveMetadata(metadata);
    return entry;
  });
}

// 파일 삭제
export async function deleteFile(id: string): Promise<void> {
  return withLock(async () => {
    const metadata = await getMetadata();
    const index = metadata.findIndex((f) => f.id === id);
    if (index === -1) throw new Error("파일을 찾을 수 없습니다");

    const entry = metadata[index];
    const filePath = path.join(FILES_DIR, entry.storedName);

    // path traversal 방지
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(FILES_DIR))) {
      throw new Error("잘못된 파일 경로");
    }

    try {
      await fs.unlink(filePath);
    } catch {
      // 파일이 이미 삭제되었어도 메타데이터는 정리
    }

    metadata.splice(index, 1);
    await saveMetadata(metadata);
  });
}

// 파일 경로 조회 (다운로드용)
export async function getFilePath(id: string): Promise<{ filePath: string; metadata: FileMetadata } | null> {
  const metadata = await getMetadata();
  const entry = metadata.find((f) => f.id === id);
  if (!entry) return null;

  const filePath = path.join(FILES_DIR, entry.storedName);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(FILES_DIR))) return null;

  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  return { filePath: resolved, metadata: entry };
}

// 저장 용량 조회
export async function getStorageUsage(): Promise<{ used: number; limit: number }> {
  const metadata = await getMetadata();
  const used = metadata.reduce((sum, f) => sum + f.size, 0);
  return { used, limit: TOTAL_LIMIT };
}

// 파일명 새니타이즈 (XSS 방지, 제어문자 제거)
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>"'`&\\]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 255);
}

// 바이트 포맷
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
