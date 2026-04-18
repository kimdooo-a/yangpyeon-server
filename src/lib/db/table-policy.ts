import type { Role } from "@/generated/prisma/client";

export type TableOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

/** 민감 테이블 — 전 작업 차단 (전용 관리 페이지가 존재) */
const FULL_BLOCK = new Set([
  "users",
  "api_keys",
  "_prisma_migrations",
]);

/** 역사 자산 — DELETE(ADMIN)만 허용, INSERT/UPDATE 차단. SELECT는 운영자(ADMIN/MANAGER)만. */
const DELETE_ONLY = new Set(["edge_function_runs"]);

/**
 * Phase 14b: 테이블×작업×역할 기반 CRUD 허용 여부.
 * Phase 14c-VIEWER: SELECT 작업 추가 — USER 롤이 비민감 테이블 SELECT 허용.
 * 1차 권한 검사(withRole)를 통과한 뒤 호출한다.
 */
export function checkTablePolicy(
  table: string,
  operation: TableOperation,
  role: Role,
): PolicyDecision {
  if (FULL_BLOCK.has(table)) {
    return {
      allowed: false,
      reason: `${table}은 Table Editor에서 접근할 수 없습니다 (전용 페이지 사용)`,
    };
  }

  if (DELETE_ONLY.has(table)) {
    if (operation === "SELECT") {
      if (role !== "ADMIN" && role !== "MANAGER") {
        return { allowed: false, reason: "운영자 권한이 필요합니다" };
      }
      return { allowed: true };
    }
    if (operation !== "DELETE") {
      return {
        allowed: false,
        reason: `${table}은 조회와 삭제만 가능합니다`,
      };
    }
    if (role !== "ADMIN") {
      return { allowed: false, reason: "삭제는 ADMIN만 가능합니다" };
    }
    return { allowed: true };
  }

  // 일반 업무 테이블
  if (operation === "SELECT") {
    return { allowed: true };
  }
  if (operation === "DELETE" && role !== "ADMIN") {
    return { allowed: false, reason: "삭제는 ADMIN만 가능합니다" };
  }
  if (
    (operation === "INSERT" || operation === "UPDATE") &&
    role !== "ADMIN" &&
    role !== "MANAGER"
  ) {
    return { allowed: false, reason: "MANAGER 이상 권한이 필요합니다" };
  }
  return { allowed: true };
}

/** 민감 컬럼 — 감사 로그 detail에서 [REDACTED] 처리 */
const REDACT_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["password_hash", "passwordHash"]),
  api_keys: new Set(["key_hash", "keyHash", "secret"]),
};

export function redactSensitiveValues(
  table: string,
  diff: Record<string, unknown>,
): Record<string, unknown> {
  const set = REDACT_COLUMNS[table];
  if (!set) return diff;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(diff)) {
    result[k] = set.has(k) ? "[REDACTED]" : v;
  }
  return result;
}
