/**
 * 세션 14: Data API 테이블 allowlist
 * - readRoles: 읽기 허용 역할
 * - writeRoles: 쓰기 허용 역할 (ADMIN만)
 * - exposedColumns: 클라이언트로 노출 가능한 컬럼 (passwordHash 등 영구 제외)
 * - forcedWhere: 역할/사용자별 강제 필터 (USER는 본인 소유만)
 */

import type { TableAllowlistEntry } from "@/lib/types/supabase-clone";

export const DATA_API_ALLOWLIST: Record<string, TableAllowlistEntry> = {
  User: {
    table: "User",
    readRoles: ["ADMIN", "MANAGER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "email",
      "name",
      "phone",
      "role",
      "isActive",
      "lastLoginAt",
      "createdAt",
      "updatedAt",
    ],
    // passwordHash는 exposedColumns에 절대 포함하지 않음
  },
  Folder: {
    table: "Folder",
    readRoles: ["ADMIN", "MANAGER", "USER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "name",
      "parentId",
      "ownerId",
      "isRoot",
      "createdAt",
      "updatedAt",
    ],
    forcedWhere: (role, userId) => {
      // USER는 본인 소유 폴더만 (ADMIN/MANAGER는 전체 가시)
      if (role === "USER") return { ownerId: userId };
      return {};
    },
  },
  File: {
    table: "File",
    readRoles: ["ADMIN", "MANAGER", "USER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "name",
      "size",
      "mimeType",
      "folderId",
      "ownerId",
      "createdAt",
    ],
    forcedWhere: (role, userId) => {
      if (role === "USER") return { ownerId: userId };
      return {};
    },
  },
};

/** allowlist에서 엔트리 조회 (대소문자 구분) */
export function getAllowlistEntry(table: string): TableAllowlistEntry | null {
  return DATA_API_ALLOWLIST[table] ?? null;
}

/** 모든 테이블 엔트리 목록 (UI 노출용) */
export function listAllowlistEntries(): TableAllowlistEntry[] {
  return Object.values(DATA_API_ALLOWLIST);
}
