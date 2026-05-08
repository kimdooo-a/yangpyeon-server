/**
 * UUIDv7 generator unit tests — F2-1 (M4 Phase 2 prerequisite).
 *
 * UUIDv7 spec (RFC 9562 §5.7):
 *   - 60-bit unix_ts_ms (most significant) + 12-bit rand_a + 62-bit rand_b
 *   - version nibble = 0x7 (7th hex char of UUID string)
 *   - variant nibble = 0b10xx (top 2 bits of 17th hex char)
 *
 * Why: clientGeneratedId 의 시간 단조 증가 = 같은 conversation 내 메시지 순서
 * 결정적, 멱등 idempotency key 역할. UUIDv4 random 보다 cursor pagination + dedupe
 * 친화. Backend zod schema (`sendMessageSchema.clientGeneratedId`) 는 그냥 UUID 검증만,
 * v7 는 클라이언트 책임.
 */
import { describe, it, expect, vi } from "vitest";
import { uuidv7 } from "./uuidv7";

describe("uuidv7", () => {
  it("형식 = 8-4-4-4-12 hex (RFC 4122)", () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("version nibble = 7 (13th hex char, 7th group 첫 char)", () => {
    const id = uuidv7();
    // ASCII pos: 14 = "xxxxxxxx-xxxx-Vxxx-..." 의 V
    expect(id[14]).toBe("7");
  });

  it("variant nibble top 2 bits = 0b10 (17th 0-indexed hex char ∈ {8,9,a,b})", () => {
    const id = uuidv7();
    const variantChar = id[19];
    expect(["8", "9", "a", "b"]).toContain(variantChar);
  });

  it("같은 ms 안에서도 단조 증가 (rand_a counter increment)", () => {
    // year 2033 future timestamp 으로 monotonicity guard clamp 회피
    const fixed = 2_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixed);
    const ids = Array.from({ length: 50 }, () => uuidv7());
    vi.restoreAllMocks();

    // 정렬했을 때 원래 순서 보존 (단조 증가) — sort 후 join 동일하면 단조
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    // 모두 unique
    expect(new Set(ids).size).toBe(50);
  });

  it("ms 증가 시 ts hex 도 증가 (시간 정렬 가능, 12-char ts portion)", () => {
    // year 2033 fixed → 같은 ms 부터 시작 (monotonicity clamp 회피)
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_001_000);
    const earlier = uuidv7();
    // +1ms 후 — ts hex 마지막 char 1 증가
    vi.spyOn(Date, "now").mockReturnValue(2_000_000_001_001);
    const later = uuidv7();
    vi.restoreAllMocks();

    // 12-char ts portion = chars [0..8) + chars [9..13) (첫 8자 + 중간 4자)
    const tsOf = (id: string) => id.slice(0, 8) + id.slice(9, 13);
    expect(tsOf(later) > tsOf(earlier)).toBe(true);
  });
});
