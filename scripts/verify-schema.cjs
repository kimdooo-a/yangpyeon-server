#!/usr/bin/env node
// SQLite 스키마 검증 (CJS) — 빌드타임 게이트 + 운영 헬스체크.
// 필수 테이블이 모두 존재해야 exit 0. 누락 시 exit 1 + 누락 리스트 출력.
//
// 사용법:
//   SQLITE_DB_PATH=/home/smart/ypserver/data/dashboard.db node scripts/verify-schema.cjs

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

// Phase 1.7 (T1.7) ADR-029 — tenant_metrics_history 추가 + audit_logs.trace_id 컬럼 검증.
const REQUIRED_TABLES = [
  "audit_logs",
  "ip_whitelist",
  "metrics_history",
  "tenant_metrics_history",
];

// Phase 1.7 추가: 컬럼 존재 검증 (테이블별 필수 컬럼 화이트리스트).
const REQUIRED_COLUMNS = {
  audit_logs: ["tenant_id", "trace_id"],
  metrics_history: ["tenant_id"],
};

function resolveDbPath() {
  return process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "dashboard.db");
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`[verify-schema] db=${dbPath}`);
  if (!fs.existsSync(dbPath)) {
    console.error(`[verify-schema] FAIL: db file does not exist`);
    process.exit(1);
  }
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const present = new Set(rows.map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    if (missing.length > 0) {
      console.error(`[verify-schema] FAIL: missing tables: ${missing.join(", ")}`);
      console.error(`[verify-schema] present tables: ${[...present].sort().join(", ") || "(none)"}`);
      process.exit(1);
    }

    // Phase 1.7 — 컬럼 검증.
    const missingCols = [];
    for (const [tbl, cols] of Object.entries(REQUIRED_COLUMNS)) {
      const colRows = sqlite.prepare(`PRAGMA table_info(${tbl})`).all();
      const colNames = new Set(colRows.map((r) => r.name));
      for (const col of cols) {
        if (!colNames.has(col)) missingCols.push(`${tbl}.${col}`);
      }
    }
    if (missingCols.length > 0) {
      console.error(`[verify-schema] FAIL: missing columns: ${missingCols.join(", ")}`);
      process.exit(1);
    }

    console.log(
      `[verify-schema] OK — required tables: ${REQUIRED_TABLES.join(", ")}; required columns verified.`,
    );
  } finally {
    sqlite.close();
  }
}

main();
