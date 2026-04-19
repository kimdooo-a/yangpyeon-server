import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Phase 16a Vault — VaultService (경량 envelope 암호화)
 * 참조: docs/superpowers/specs/2026-04-19-phase-16-design.md §16a
 * 실측 근거: SP-017 (IV 1M/충돌 0, GCM tamper throw, 100 rotate 1.18ms)
 *
 * 암호화: AES-256-GCM(MASTER_KEY, iv=random 12B)(plain) → encryptedValue + tag(16B)
 * 저장: DB row(SecretItem) — name 유일, kekVersion 보존 (회전 시 +1).
 * 복호화: row 조회 → setAuthTag → decipher → plain. tag 불일치 시 Node 가 throw.
 *
 * rotateKek(newMasterKey, newVersion): 전체 row 순회하며 구 KEK 로 decrypt → 신 KEK 로
 *   encrypt → update. 단일 for-loop (SP-017: 100건 1.18ms, 실용 규모 async chunk 불필요).
 */
export class VaultService {
  constructor(
    private readonly masterKey: Buffer,
    private readonly prisma: PrismaClient,
    private readonly currentKekVersion: number = 1,
  ) {
    if (masterKey.length !== 32) {
      throw new Error(
        `MASTER_KEY must be 32 bytes, got ${masterKey.length}`,
      );
    }
  }

  async encrypt(plainValue: string, name: string): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainValue, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    await this.prisma.secretItem.create({
      data: {
        name,
        encryptedValue: encrypted,
        iv,
        tag,
        kekVersion: this.currentKekVersion,
      },
    });
  }

  async decrypt(name: string): Promise<string> {
    const row = await this.prisma.secretItem.findUnique({ where: { name } });
    if (!row) throw new Error(`Secret not found: ${name}`);

    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, row.iv);
    decipher.setAuthTag(row.tag);
    const decrypted = Buffer.concat([
      decipher.update(row.encryptedValue),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  async rotateKek(
    newMasterKey: Buffer,
    newVersion: number,
  ): Promise<{ migratedCount: number }> {
    if (newMasterKey.length !== 32) {
      throw new Error("newMasterKey must be 32 bytes");
    }

    const rows = await this.prisma.secretItem.findMany();
    let count = 0;
    for (const row of rows) {
      const oldDecipher = createDecipheriv(
        "aes-256-gcm",
        this.masterKey,
        row.iv,
      );
      oldDecipher.setAuthTag(row.tag);
      const plain = Buffer.concat([
        oldDecipher.update(row.encryptedValue),
        oldDecipher.final(),
      ]);

      const newIv = randomBytes(12);
      const newCipher = createCipheriv("aes-256-gcm", newMasterKey, newIv);
      const newCt = Buffer.concat([
        newCipher.update(plain),
        newCipher.final(),
      ]);
      const newTag = newCipher.getAuthTag();

      await this.prisma.secretItem.update({
        where: { id: row.id },
        data: {
          encryptedValue: newCt,
          iv: newIv,
          tag: newTag,
          kekVersion: newVersion,
          rotatedAt: new Date(),
        },
      });
      count++;
    }
    return { migratedCount: count };
  }
}
