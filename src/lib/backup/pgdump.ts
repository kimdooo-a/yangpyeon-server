import { spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { getBackupsDir } from "./paths";

// paths.ts의 경량 유틸 재노출 (기존 import 경로 호환)
export { backupsEnabled, sanitizeBackupFilename, getBackupsDir } from "./paths";

const PG_DUMP_BIN = process.env.PG_DUMP_BIN || "pg_dump";
const TIMEOUT_MS = 120_000; // 2분

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export async function ensureBackupsDir(): Promise<void> {
  await fs.mkdir(getBackupsDir(), { recursive: true });
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  await ensureBackupsDir();
  const entries = await fs.readdir(getBackupsDir());
  const results: BackupFileInfo[] = [];
  for (const name of entries) {
    if (!name.endsWith(".sql.gz")) continue;
    const full = path.join(getBackupsDir(), name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    results.push({
      filename: name,
      sizeBytes: stat.size,
      createdAt: stat.birthtime.toISOString(),
    });
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}

function tsFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `backup_${y}${m}${d}_${hh}${mm}${ss}.sql.gz`;
}

/**
 * pg_dump을 실행해 backups/<timestamp>.sql.gz 로 저장한다.
 * 타임아웃 초과 또는 실패 시 파일을 삭제한다.
 */
export async function createBackup(): Promise<BackupFileInfo> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다");

  await ensureBackupsDir();
  const filename = tsFilename();
  const outPath = path.join(getBackupsDir(), filename);

  const child = spawn(PG_DUMP_BIN, ["--no-owner", "--no-acl", "--format=plain", dbUrl], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrBuf = "";
  child.stderr.on("data", (chunk) => {
    stderrBuf += chunk.toString();
    if (stderrBuf.length > 8_000) {
      stderrBuf = stderrBuf.slice(-8_000);
    }
  });

  const timeoutHandle = setTimeout(() => {
    child.kill("SIGTERM");
  }, TIMEOUT_MS);

  const gzip = createGzip();
  const out = createWriteStream(outPath);

  const cleanup = async () => {
    clearTimeout(timeoutHandle);
    await fs.unlink(outPath).catch(() => {});
  };

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
  });

  try {
    await pipeline(child.stdout, gzip, out);
    const code = await exitPromise;
    clearTimeout(timeoutHandle);
    if (code !== 0) {
      await cleanup();
      throw new Error(`pg_dump 종료 코드 ${code}: ${stderrBuf.slice(-500)}`);
    }
  } catch (err) {
    await cleanup();
    throw err instanceof Error ? err : new Error(String(err));
  }

  const stat = await fs.stat(outPath);
  return {
    filename,
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
  };
}

