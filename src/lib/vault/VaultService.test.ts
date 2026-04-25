import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { VaultService } from "./VaultService";
import type { PrismaClient } from "@/generated/prisma/client";

// Phase 16a Vault — VaultService TDD (6 cases)
// 참조: docs/superpowers/plans/2026-04-19-phase-16-plan.md §Task 48-3
// 검증: encrypt row 생성 / round-trip / tamper throw / not-found / IV 유일성 / 32-byte 가드
//
// Prisma 7 의 Prisma__SecretItemClient 리턴 타입 엄격성 때문에 mock callback 에
// 공격적 캐스팅(as never) 사용. 런타임에는 PrismaPromise 가 Promise 호환이라 무관.

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
    vi.mocked(mockPrisma.secretItem.create).mockResolvedValue({} as never);
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
    (mockPrisma.secretItem.create as unknown as Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        stored = data;
        return Promise.resolve(data);
      },
    );
    (
      mockPrisma.secretItem.findUnique as unknown as Mock
    ).mockImplementation(() => Promise.resolve(stored));

    await vault.encrypt("super-secret-value", "test.key");
    const decrypted = await vault.decrypt("test.key");
    expect(decrypted).toBe("super-secret-value");
  });

  it("tag 변조 시 decrypt 는 throw", async () => {
    const stored: { tag: Buffer } & Record<string, unknown> =
      {} as { tag: Buffer } & Record<string, unknown>;
    (mockPrisma.secretItem.create as unknown as Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(stored, data);
        return Promise.resolve(data);
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
    (mockPrisma.secretItem.create as unknown as Mock).mockImplementation(
      ({ data }: { data: { iv: Buffer } }) => {
        ivs.add(data.iv.toString("hex"));
        return Promise.resolve(data);
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

  describe("rotateKek (S49 이월 단위 테스트, 2026-04-25)", () => {
    const NEW_MASTER_KEY = Buffer.from("b".repeat(64), "hex");

    it("rotateKek: 32 bytes 미만 newMasterKey 시 throw", async () => {
      await expect(
        vault.rotateKek(Buffer.alloc(16), 2),
      ).rejects.toThrow(/32 bytes/);
    });

    it("rotateKek: 모든 row 가 신 KEK 로 재암호화 + kekVersion 증가 + rotatedAt 갱신", async () => {
      // 구 KEK 로 2건 저장 (실제 encrypt 사용해 GCM 출력 정합성 확보)
      const rows: Array<Record<string, unknown>> = [];
      (mockPrisma.secretItem.create as unknown as Mock).mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          rows.push({ id: `id-${rows.length + 1}`, ...data });
          return Promise.resolve(data);
        },
      );
      await vault.encrypt("plain-1", "k1");
      await vault.encrypt("plain-2", "k2");

      // findMany 가 위 2건 반환하도록 mock
      (mockPrisma.secretItem.findMany as unknown as Mock).mockResolvedValue(
        rows.map((r) => ({ ...r })),
      );
      const updates: Array<Record<string, unknown>> = [];
      (mockPrisma.secretItem.update as unknown as Mock).mockImplementation(
        (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: args.where.id, ...args.data });
          return Promise.resolve(args.data);
        },
      );

      const { migratedCount } = await vault.rotateKek(NEW_MASTER_KEY, 2);

      expect(migratedCount).toBe(2);
      expect(updates).toHaveLength(2);
      for (const u of updates) {
        expect(u.kekVersion).toBe(2);
        expect(u.rotatedAt).toBeInstanceOf(Date);
        expect(u.encryptedValue).toBeInstanceOf(Buffer);
        expect(u.iv).toBeInstanceOf(Buffer);
        expect(u.tag).toBeInstanceOf(Buffer);
      }
    });

    it("rotateKek: 회전 후 신 KEK 로 round-trip decrypt 성공 (구 KEK 로는 실패)", async () => {
      // 구 KEK 로 1건 저장
      const stored: Record<string, unknown> = {};
      (mockPrisma.secretItem.create as unknown as Mock).mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(stored, { id: "id-1" }, data);
          return Promise.resolve(data);
        },
      );
      await vault.encrypt("rotation-payload", "rot.key");

      // findMany → 위 row 반환, update → 신 row 로 덮어쓰기
      (mockPrisma.secretItem.findMany as unknown as Mock).mockResolvedValue([
        { ...stored },
      ]);
      (mockPrisma.secretItem.update as unknown as Mock).mockImplementation(
        (args: { where: { id: string }; data: Record<string, unknown> }) => {
          Object.assign(stored, args.data);
          return Promise.resolve(args.data);
        },
      );

      await vault.rotateKek(NEW_MASTER_KEY, 2);

      // 신 VaultService 로 decrypt 시 성공
      const newVault = new VaultService(NEW_MASTER_KEY, mockPrisma, 2);
      (
        mockPrisma.secretItem.findUnique as unknown as Mock
      ).mockResolvedValue({ ...stored });
      const decrypted = await newVault.decrypt("rot.key");
      expect(decrypted).toBe("rotation-payload");

      // 구 VaultService 는 회전된 row 를 decrypt 하지 못함 (tag 불일치)
      const oldVault = new VaultService(MASTER_KEY, mockPrisma, 1);
      await expect(oldVault.decrypt("rot.key")).rejects.toThrow(
        /authenticate|tag/i,
      );
    });

    it("rotateKek: row 0건일 때 migratedCount=0 (no-op)", async () => {
      (mockPrisma.secretItem.findMany as unknown as Mock).mockResolvedValue(
        [],
      );
      const result = await vault.rotateKek(NEW_MASTER_KEY, 2);
      expect(result.migratedCount).toBe(0);
      expect(mockPrisma.secretItem.update).not.toHaveBeenCalled();
    });
  });
});
