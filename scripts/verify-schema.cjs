#!/usr/bin/env node
// SQLite 스키마 검증 (CJS) — 빌드타임 게이트 + 운영 헬스체크.
// 필수 테이블이 모두 존재해야 exit 0. 누락 시 exit 1 + 누락 리스트 출력.
//
// 사용법:
//   SQLITE_DB_PATH=/home/smart/ypserver/data/dashboard.db node scripts/verify-schema.cjs

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const REQUIRED_TABLES = ["audit_logs", "ip_whitelist", "metrics_history"];

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
    console.log(`[verify-schema] OK — required tables present: ${REQUIRED_TABLES.join(", ")}`);
  } finally {
    sqlite.close();
  }
}

main();
