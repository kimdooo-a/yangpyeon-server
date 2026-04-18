import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { hashPassword, verifyPasswordHash, needsRehash } from "./password";

// Phase 15 Auth Advanced Step 2 — argon2id 도입 + bcrypt 점진 마이그레이션 검증
// 참조: docs/research/spikes/spike-011-argon2-result.md (13× faster, ADR-019)

const TEST_PASSWORD = "<ADMIN_PASSWORD>";
const WRONG_PASSWORD = "wrong-pw-x";

describe("hashPassword", () => {
  it("argon2id 포맷 ($argon2id$) 으로 해시한다", async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("동일 평문도 매번 다른 해시를 생성한다 (salt)", async () => {
    const a = await hashPassword(TEST_PASSWORD);
    const b = await hashPassword(TEST_PASSWORD);
    expect(a).not.toBe(b);
  });
});

describe("verifyPasswordHash", () => {
  it("argon2id 해시를 검증한다 (정답)", async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    expect(await verifyPasswordHash(TEST_PASSWORD, hash)).toBe(true);
  });

  it("argon2id 해시를 거부한다 (오답)", async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    expect(await verifyPasswordHash(WRONG_PASSWORD, hash)).toBe(false);
  });

  it("기존 bcrypt 해시도 검증한다 (역호환, $2 prefix 분기)", async () => {
    const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 4);
    expect(bcryptHash.startsWith("$2")).toBe(true);
    expect(await verifyPasswordHash(TEST_PASSWORD, bcryptHash)).toBe(true);
  });

  it("기존 bcrypt 해시도 오답을 거부한다", async () => {
    const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 4);
    expect(await verifyPasswordHash(WRONG_PASSWORD, bcryptHash)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("bcrypt 해시 ($2) 는 재해시가 필요하다", async () => {
    const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 4);
    expect(needsRehash(bcryptHash)).toBe(true);
  });

  it("argon2id 해시는 재해시가 불필요하다", async () => {
    const argonHash = await hashPassword(TEST_PASSWORD);
    expect(needsRehash(argonHash)).toBe(false);
  });
});
