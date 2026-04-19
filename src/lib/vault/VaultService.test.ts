import { describe, it, expect, beforeEach, vi } from "vitest";
import { VaultService } from "./VaultService";
import type { PrismaClient } from "@/generated/prisma/client";

// Phase 16a Vault — VaultService TDD (6 cases)
// 참조: docs/superpowers/plans/2026-04-19-phase-16-plan.md §Task 48-3
// 검증: encrypt row 생성 / round-trip / tamper throw / not-found / IV 유일성 / 32-byte 가드

const mockPrisma = {
  secretItem: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
} as unknown as PrismaClient;

const MASTER_KEY = Buffer.from("a".repeat(64), "hex");

describe("VaultService", () => {
  let vault: VaultService;

  beforeEach(() => {
    vi.resetAllMocks();
    vault = new VaultService(MASTER_KEY, mockPrisma);
  });

  it("encrypt 는 SecretItem row 를 올바른 shape 으로 생성", async () => {
    vi.mocked(mockPrisma.secretItem.create).mockResolvedValue(
      {} as never,
    );
    await vault.encrypt("plain-text", "mfa.master_key");
    expect(mockPrisma.secretItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "mfa.master_key",
        kekVersion: 1,
        encryptedValue: expect.any(Buffer),
        iv: expect.any(Buffer),
        tag: expect.any(Buffer),
      }),
    });
  });

  it("encrypt → decrypt round-trip 값이 일치", async () => {
    let stored: Record<string, unknown> | undefined;
    vi.mocked(mockPrisma.secretItem.create).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        stored = data;
        return data as never;
      },
    );
    vi.mocked(mockPrisma.secretItem.findUnique).mockImplementation(
      async () => stored as never,
    );

    await vault.encrypt("super-secret-value", "test.key");
    const decrypted = await vault.decrypt("test.key");
    expect(decrypted).toBe("super-secret-value");
  });

  it("tag 변조 시 decrypt 는 throw", async () => {
    let stored: { tag: Buffer } & Record<string, unknown> = {} as never;
    vi.mocked(mockPrisma.secretItem.create).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        stored = data as typeof stored;
        return data as never;
      },
    );
    await vault.encrypt("plain", "test.tamper");
    stored.tag = Buffer.alloc(16); // GCM tag 변조
    vi.mocked(mockPrisma.secretItem.findUnique).mockResolvedValue(
      stored as never,
    );
    await expect(vault.decrypt("test.tamper")).rejects.toThrow(
      /authenticate|tag/i,
    );
  });

  it("미존재 키 decrypt 는 throw", async () => {
    vi.mocked(mockPrisma.secretItem.findUnique).mockResolvedValue(null);
    await expect(vault.decrypt("nope")).rejects.toThrow(/not found|nope/);
  });

  it("IV 는 매 encrypt 마다 달라야 한다 (100회 유일성)", async () => {
    const ivs = new Set<string>();
    vi.mocked(mockPrisma.secretItem.create).mockImplementation(
      async ({ data }: { data: { iv: Buffer } }) => {
        ivs.add(data.iv.toString("hex"));
        return data as never;
      },
    );
    for (let i = 0; i < 100; i++) {
      await vault.encrypt("same-plain", `k${i}`);
    }
    expect(ivs.size).toBe(100);
  });

  it("32 bytes 미만 masterKey 로 생성자 호출 시 throw (AES-256 요건)", () => {
    expect(() => new VaultService(Buffer.alloc(16), mockPrisma)).toThrow(
      /32 bytes/,
    );
  });
});
