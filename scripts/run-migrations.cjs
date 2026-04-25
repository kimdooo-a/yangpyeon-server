#!/usr/bin/env node
// 드리즐 마이그레이션 러너 (CJS) — 빌드타임 게이트 (wsl-build-deploy.sh).
// src/lib/db/migrate.ts 와 동등한 알고리즘이며 같은 __drizzle_migrations 테이블을 공유한다.
//
// 사용법 (WSL build dir 에서):
//   SQLITE_DB_PATH=/home/smart/ypserver/data/dashboard.db \
//   DRIZZLE_MIGRATIONS_DIR=$PWD/src/lib/db/migrations \
//   node scripts/run-migrations.cjs

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

function resolveMigrationsFolder() {
  if (process.env.DRIZZLE_MIGRATIONS_DIR) return process.env.DRIZZLE_MIGRATIONS_DIR;
  const candidates = [
    path.join(process.cwd(), "db-migrations"),
    path.join(process.cwd(), "src", "lib", "db", "migrations"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  }
  console.error(
    `[migrate] FATAL: migrations folder not found. tried: ${candidates.join(", ")}`,
  );
  process.exit(2);
}

function resolveDbPath() {
  return process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "dashboard.db");
}

// 단일 SQL statement 실행 헬퍼 (다중 statement 거부 보장)
function runStmt(sqlite, stmt) {
  sqlite.prepare(stmt).run();
}

function main() {
  const dbPath = resolveDbPath();
  const migrationsFolder = resolveMigrationsFolder();
  console.log(`[migrate] db=${dbPath}`);
  console.log(`[migrate] migrations=${migrationsFolder}`);

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );

  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("journal_mode = WAL");
    runStmt(
      sqlite,
      "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
    );
    const applied = new Set(
      sqlite.prepare("SELECT hash FROM __drizzle_migrations").all().map((r) => r.hash),
    );

    let appliedCount = 0;
    for (const entry of journal.entries) {
      const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        console.error(`[migrate] FATAL: missing SQL file: ${sqlPath}`);
        process.exit(3);
      }
      const sql = fs.readFileSync(sqlPath, "utf8");
      const hash = crypto.createHash("sha256").update(sql).digest("hex");
      if (applied.has(hash)) {
        console.log(`[migrate] skip ${entry.tag} (already applied)`);
        continue;
      }
      const txn = sqlite.transaction(() => {
        for (const stmt of sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
          runStmt(sqlite, stmt);
        }
        sqlite
          .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
          .run(hash, Date.now());
      });
      txn();
      console.log(`[migrate] applied ${entry.tag}`);
      appliedCount++;
    }

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    console.log(`[migrate] done — applied=${appliedCount} | tables: ${tables.join(", ")}`);
  } finally {
    sqlite.close();
  }
}

main();
