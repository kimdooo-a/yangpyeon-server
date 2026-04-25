import { statSync, readFileSync } from "node:fs";

/**
 * Phase 16a Vault — MasterKeyLoader
 * 참조: docs/superpowers/specs/2026-04-19-phase-16-design.md §16a
 *
 * /etc/luckystyle4u/secrets.env (PM2 env_file, mode=0640, owner=root:ubuntu) 에서
 * MASTER_KEY= 라인을 읽어 32 byte Buffer 로 반환.
 *
 * 보안 가드:
 *   - 파일 미존재 시 throw (명확한 에러)
 *   - 권한이 0640 이 아니면 throw (leak 방지 — world-readable 금지)
 *   - 64 hex (32 byte) 정확히 일치해야 함 (AES-256 요건)
 *
 * Windows dev 환경에서는 statSync 의 mode 가 POSIX 그대로 반환되지 않아
 * 실행 시 에러 발생 가능 — 실제 사용은 WSL/Linux 한정, 테스트는 mock 기반.
 */

export const DEFAULT_MASTER_KEY_PATH = "/etc/luckystyle4u/secrets.env";

export function resolveMasterKeyPath(): string {
  return process.env.MASTER_KEY_PATH ?? DEFAULT_MASTER_KEY_PATH;
}

export function loadMasterKey(path: string): Buffer {
  let stat;
  try {
    stat = statSync(path);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`MASTER_KEY file not found at ${path}: ${msg}`);
  }

  const mode = stat.mode & 0o777;
  if (mode !== 0o640) {
    throw new Error(
      `MASTER_KEY file must have permission 0640, got 0${mode.toString(8)}`,
    );
  }

  const content = readFileSync(path, "utf8");
  const match = content.match(/^MASTER_KEY=([0-9a-fA-F]+)$/m);
  if (!match) {
    throw new Error("MASTER_KEY= line not found");
  }

  const hex = match[1];
  if (hex.length !== 64) {
    throw new Error(
      `MASTER_KEY must be 64 hex chars (32 bytes), got ${hex.length}`,
    );
  }

  return Buffer.from(hex, "hex");
}
