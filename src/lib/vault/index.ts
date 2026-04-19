import { loadMasterKey } from "./MasterKeyLoader";
import { VaultService } from "./VaultService";
import { prisma } from "@/lib/prisma";

/**
 * Phase 16a Vault — getVault 싱글톤
 * 참조: docs/superpowers/plans/2026-04-19-phase-16-plan.md §Task 48-4
 *
 * MASTER_KEY_PATH env (기본 /etc/luckystyle4u/secrets.env) 에서 key 로딩 →
 *   VaultService 인스턴스 생성 (프로세스 lifetime 유지).
 *
 * async 인 이유: 향후 KMS/HSM 키 로더 전환 시 비동기 IO 호환 (현재는 즉시 반환).
 */
let instance: VaultService | null = null;

export async function getVault(): Promise<VaultService> {
  if (instance) return instance;
  const keyPath =
    process.env.MASTER_KEY_PATH ?? "/etc/luckystyle4u/secrets.env";
  const masterKey = loadMasterKey(keyPath);
  instance = new VaultService(masterKey, prisma);
  return instance;
}

/**
 * 테스트용 — 싱글톤 초기화. 프로덕션 코드에서 호출 금지.
 */
export function __resetVaultForTests(): void {
  instance = null;
}

export { VaultService } from "./VaultService";
export { loadMasterKey } from "./MasterKeyLoader";
