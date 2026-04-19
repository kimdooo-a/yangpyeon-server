import { describe, it, expect } from "vitest";
import {
  generateOpaqueToken,
  hashToken,
  REFRESH_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_SEC,
} from "./tokens";

describe("generateOpaqueToken — opaque 랜덤 토큰", () => {
  it("32 bytes = 64 hex chars", () => {
    const token = generateOpaqueToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("매 호출마다 고유 값", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateOpaqueToken());
    expect(set.size).toBe(100);
  });
});

describe("hashToken — SHA-256 hex", () => {
  it("same input → same hash (결정성)", () => {
    const h1 = hashToken("abc123");
    const h2 = hashToken("abc123");
    expect(h1).toBe(h2);
  });

  it("different input → different hash (충돌 없음)", () => {
    const h1 = hashToken("abc123");
    const h2 = hashToken("abc124");
    expect(h1).not.toBe(h2);
  });

  it("hex 64 chars (256 bits / 4 bits per hex)", () => {
    const h = hashToken("x");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("빈 문자열도 처리 (SHA-256 e3b0... empty hash)", () => {
    const h = hashToken("");
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("REFRESH_TOKEN_MAX_AGE — 7일 상수", () => {
  it("MS 는 7일", () => {
    expect(REFRESH_TOKEN_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("SEC 는 MS / 1000 (604800)", () => {
    expect(REFRESH_TOKEN_MAX_AGE_SEC).toBe(604800);
  });
});
