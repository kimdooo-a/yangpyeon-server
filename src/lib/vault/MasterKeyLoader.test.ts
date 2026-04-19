import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import { loadMasterKey } from "./MasterKeyLoader";

// Phase 16a Vault — MasterKeyLoader TDD
// 참조: docs/superpowers/plans/2026-04-19-phase-16-plan.md §Task 48-2
// 검증 대상: /etc/luckystyle4u/secrets.env (mode=0640, MASTER_KEY=<64 hex>) 로딩 + 보안 검증.

vi.mock("node:fs");

describe("MasterKeyLoader", () => {
  beforeEach(() => vi.resetAllMocks());

  it("파일 미존재 시 throw", () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });
    expect(() => loadMasterKey("/etc/luckystyle4u/secrets.env")).toThrow(
      /not found|ENOENT/,
    );
  });

  it("권한 0644 이면 throw (0640 만 허용)", () => {
    vi.mocked(fs.statSync).mockReturnValue({ mode: 0o100644 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      "MASTER_KEY=" + "a".repeat(64),
    );
    expect(() => loadMasterKey("/etc/luckystyle4u/secrets.env")).toThrow(
      /permission|0640/,
    );
  });

  it("정상 파일(0640) 에서 64 hex 키를 32 byte Buffer 로 로딩", () => {
    vi.mocked(fs.statSync).mockReturnValue({ mode: 0o100640 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(
      "MASTER_KEY=" + "a".repeat(64),
    );
    const key = loadMasterKey("/etc/luckystyle4u/secrets.env");
    expect(key).toHaveLength(32);
    expect(key).toEqual(Buffer.from("a".repeat(64), "hex"));
  });

  it("64 hex 미만이면 throw", () => {
    vi.mocked(fs.statSync).mockReturnValue({ mode: 0o100640 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue("MASTER_KEY=abc");
    expect(() => loadMasterKey("/etc/luckystyle4u/secrets.env")).toThrow(
      /length|hex/,
    );
  });
});
