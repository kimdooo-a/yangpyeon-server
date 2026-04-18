import { describe, it, expect } from "vitest";
import { checkTablePolicy, redactSensitiveValues } from "./table-policy";
import type { Role } from "@/generated/prisma/client";

describe("checkTablePolicy — FULL_BLOCK tables", () => {
  const blocked = ["users", "api_keys", "_prisma_migrations"];
  const allRoles: Role[] = ["ADMIN", "MANAGER", "USER"];
  const allOps = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

  it.each(blocked.flatMap((t) => allRoles.flatMap((r) => allOps.map((o) => [t, r, o] as const))))(
    "blocks %s for %s %s",
    (table, role, op) => {
      const d = checkTablePolicy(table, op, role);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/전용 페이지/);
    },
  );
});

describe("checkTablePolicy — DELETE_ONLY tables (edge_function_runs)", () => {
  it("allows DELETE for ADMIN", () => {
    const d = checkTablePolicy("edge_function_runs", "DELETE", "ADMIN");
    expect(d.allowed).toBe(true);
  });

  it("blocks DELETE for MANAGER", () => {
    const d = checkTablePolicy("edge_function_runs", "DELETE", "MANAGER");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/ADMIN/);
  });

  it("blocks DELETE for USER", () => {
    const d = checkTablePolicy("edge_function_runs", "DELETE", "USER");
    expect(d.allowed).toBe(false);
  });

  it("blocks INSERT for ADMIN (조회와 삭제만)", () => {
    const d = checkTablePolicy("edge_function_runs", "INSERT", "ADMIN");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/조회와 삭제/);
  });

  it("blocks UPDATE for ADMIN (조회와 삭제만)", () => {
    const d = checkTablePolicy("edge_function_runs", "UPDATE", "ADMIN");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/조회와 삭제/);
  });

  it("allows SELECT for ADMIN", () => {
    expect(checkTablePolicy("edge_function_runs", "SELECT", "ADMIN").allowed).toBe(true);
  });

  it("allows SELECT for MANAGER", () => {
    expect(checkTablePolicy("edge_function_runs", "SELECT", "MANAGER").allowed).toBe(true);
  });

  it("blocks SELECT for USER (운영자 권한 필요)", () => {
    const d = checkTablePolicy("edge_function_runs", "SELECT", "USER");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/운영자/);
  });
});

describe("checkTablePolicy — 일반 업무 테이블 (folders)", () => {
  it("allows INSERT for ADMIN", () => {
    expect(checkTablePolicy("folders", "INSERT", "ADMIN").allowed).toBe(true);
  });

  it("allows INSERT for MANAGER", () => {
    expect(checkTablePolicy("folders", "INSERT", "MANAGER").allowed).toBe(true);
  });

  it("blocks INSERT for USER", () => {
    const d = checkTablePolicy("folders", "INSERT", "USER");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/MANAGER 이상/);
  });

  it("allows UPDATE for MANAGER", () => {
    expect(checkTablePolicy("folders", "UPDATE", "MANAGER").allowed).toBe(true);
  });

  it("blocks UPDATE for USER", () => {
    expect(checkTablePolicy("folders", "UPDATE", "USER").allowed).toBe(false);
  });

  it("allows DELETE for ADMIN only", () => {
    expect(checkTablePolicy("folders", "DELETE", "ADMIN").allowed).toBe(true);
    expect(checkTablePolicy("folders", "DELETE", "MANAGER").allowed).toBe(false);
    expect(checkTablePolicy("folders", "DELETE", "USER").allowed).toBe(false);
  });
});

describe("checkTablePolicy — 매트릭스 전수 검증 (folders = 일반 테이블)", () => {
  const matrix: Array<[Role, "SELECT" | "INSERT" | "UPDATE" | "DELETE", boolean]> = [
    ["ADMIN", "SELECT", true],
    ["ADMIN", "INSERT", true],
    ["ADMIN", "UPDATE", true],
    ["ADMIN", "DELETE", true],
    ["MANAGER", "SELECT", true],
    ["MANAGER", "INSERT", true],
    ["MANAGER", "UPDATE", true],
    ["MANAGER", "DELETE", false],
    ["USER", "SELECT", true],
    ["USER", "INSERT", false],
    ["USER", "UPDATE", false],
    ["USER", "DELETE", false],
  ];

  it.each(matrix)("folders %s %s → %s", (role, op, expected) => {
    expect(checkTablePolicy("folders", op, role).allowed).toBe(expected);
  });
});

describe("checkTablePolicy — VIEWER 확장 (USER × SELECT 매트릭스)", () => {
  it("USER 일반 테이블 SELECT 허용", () => {
    expect(checkTablePolicy("folders", "SELECT", "USER").allowed).toBe(true);
    expect(checkTablePolicy("files", "SELECT", "USER").allowed).toBe(true);
    expect(checkTablePolicy("sql_queries", "SELECT", "USER").allowed).toBe(true);
  });

  it("USER FULL_BLOCK 테이블 SELECT 차단", () => {
    expect(checkTablePolicy("users", "SELECT", "USER").allowed).toBe(false);
    expect(checkTablePolicy("api_keys", "SELECT", "USER").allowed).toBe(false);
    expect(checkTablePolicy("_prisma_migrations", "SELECT", "USER").allowed).toBe(false);
  });

  it("USER DELETE_ONLY 테이블 SELECT 차단 (운영 로그 보호)", () => {
    const d = checkTablePolicy("edge_function_runs", "SELECT", "USER");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/운영자/);
  });
});

describe("redactSensitiveValues", () => {
  it("returns diff unchanged for non-sensitive tables", () => {
    const diff = { name: "alice", count: 5 };
    expect(redactSensitiveValues("folders", diff)).toEqual(diff);
  });

  it("redacts password_hash on users table", () => {
    const diff = { email: "a@b.com", password_hash: "secret", passwordHash: "also" };
    const r = redactSensitiveValues("users", diff);
    expect(r).toEqual({
      email: "a@b.com",
      password_hash: "[REDACTED]",
      passwordHash: "[REDACTED]",
    });
  });

  it("redacts secret + key_hash on api_keys", () => {
    const diff = { label: "k1", key_hash: "abc", secret: "xyz", keyHash: "def" };
    const r = redactSensitiveValues("api_keys", diff);
    expect(r.label).toBe("k1");
    expect(r.key_hash).toBe("[REDACTED]");
    expect(r.secret).toBe("[REDACTED]");
    expect(r.keyHash).toBe("[REDACTED]");
  });

  it("leaves non-sensitive columns untouched in sensitive tables", () => {
    const diff = { name: "x", password_hash: "s" };
    const r = redactSensitiveValues("users", diff);
    expect(r.name).toBe("x");
    expect(r.password_hash).toBe("[REDACTED]");
  });
});
