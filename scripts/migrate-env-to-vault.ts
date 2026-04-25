import {
  loadMasterKey,
  resolveMasterKeyPath,
} from "@/lib/vault/MasterKeyLoader";
import { VaultService } from "@/lib/vault/VaultService";
import { prisma } from "@/lib/prisma";

/**
 * Phase 16a Vault — migrate-env-to-vault
 * 참조: docs/superpowers/plans/2026-04-19-phase-16-plan.md §Task 48-4
 *
 * 환경변수에 평문으로 저장된 시크릿을 Vault(SecretItem) 로 1회성 이관.
 * 이미 이관된 항목은 skip.
 *
 * 실행 (WSL):
 *   source ~/.nvm/nvm.sh
 *   cd ~/dashboard
 *   npx tsx /mnt/e/00_develop/260406_luckystyle4u_server/scripts/migrate-env-to-vault.ts
 *
 * 성공 시 JSON stdout: {"migrated":"<vault_name>"} 또는 {"skip":"<name>","reason":"..."}
 */

interface SecretMigration {
  envVar: string;
  vaultName: string;
}

const SECRETS: SecretMigration[] = [
  { envVar: "MFA_MASTER_KEY", vaultName: "mfa.master_key" },
];

async function main(): Promise<void> {
  const masterKey = loadMasterKey(resolveMasterKeyPath());
  const vault = new VaultService(masterKey, prisma);

  for (const { envVar, vaultName } of SECRETS) {
    const plain = process.env[envVar];
    if (!plain) {
      console.log(
        JSON.stringify({ skip: envVar, reason: "not in env" }),
      );
      continue;
    }

    const existing = await prisma.secretItem.findUnique({
      where: { name: vaultName },
    });
    if (existing) {
      console.log(
        JSON.stringify({ skip: vaultName, reason: "already migrated" }),
      );
      continue;
    }

    await vault.encrypt(plain, vaultName);
    console.log(JSON.stringify({ migrated: vaultName }));
  }

  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
});
