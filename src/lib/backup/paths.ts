import path from "node:path";

/**
 * NFT 정적 분석 경고 방지를 위해 경로 상수는 지연 평가 함수로 노출한다.
 * 이 파일은 fs/spawn 등 무거운 Node API를 전혀 import하지 않아야 한다.
 */
export function getBackupsDir(): string {
  return path.resolve(process.cwd(), "backups");
}

export function backupsEnabled(): boolean {
  return process.env.ENABLE_DB_BACKUPS === "true";
}

/** 경로 traversal 방어: 안전한 파일명만 허용 */
export function sanitizeBackupFilename(name: string): string | null {
  if (!name) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (!name.endsWith(".sql.gz")) return null;
  return name;
}
