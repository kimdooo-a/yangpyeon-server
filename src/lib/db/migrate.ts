// 드리즐 마이그레이션 러너 (TypeScript) — 기동 시 self-heal 용 (instrumentation.ts 에서 호출).
// drizzle-kit 의 _journal.json + sha256(content) 트래킹 포맷을 호환한다.
//
// CLI 빌드타임 게이트는 scripts/run-migrations.cjs (CJS, 동등 알고리즘) 사용.
// 두 구현이 동일한 __drizzle_migrations 테이블을 공유하므로 서로 멱등.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import Database from "better-sqlite3";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  tables: string[];
}

const REQUIRED_TABLES = ["audit_logs", "ip_whitelist", "metrics_history"] as const;

function resolveMigrationsFolder(): string {
  if (process.env.DRIZZLE_MIGRATIONS_DIR) return process.env.DRIZZLE_MIGRATIONS_DIR;
  // 우선순위: standalone 번들 동봉 경로 → 소스 경로 (dev).
  const candidates = [
    path.join(process.cwd(), "db-migrations"),
    path.join(process.cwd(), "src", "lib", "db", "migrations"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  }
  throw new Error(
    `[migrate] migrations folder not found. tried: ${candidates.join(", ")} — set DRIZZLE_MIGRATIONS_DIR to override.`,
  );
}

function resolveDbPath(): string {
  return process.env.SQLITE_DB_PATH ?? path.join(process.cwd(), "data", "dashboard.db");
}

// 단일 SQL statement 실행 헬퍼. better-sqlite3 의 prepare().run() 은 다중 statement 를
// 거부하므로, drizzle 은 statement 마다 `--> statement-breakpoint` 로 잘라 저장한다.
function runStmt(sqlite: Database.Database, stmt: string): void {
  sqlite.prepare(stmt).run();
}

export function applyPendingMigrations(opts?: {
  dbPath?: string;
  migrationsFolder?: string;
  log?: (msg: string) => void;
}): MigrationResult {
  const log = opts?.log ?? ((m: string) => console.log(m));
  const dbPath = opts?.dbPath ?? resolveDbPath();
  const migrationsFolder = opts?.migrationsFolder ?? resolveMigrationsFolder();

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string; when?: number }> };

  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("journal_mode = WAL");
    runStmt(
      sqlite,
      "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
    );
    const appliedRows = sqlite
      .prepare("SELECT hash FROM __drizzle_migrations")
      .all() as Array<{ hash: string }>;
    const appliedHashes = new Set(appliedRows.map((r) => r.hash));

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const entry of journal.entries) {
      const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        throw new Error(`[migrate] missing migration SQL: ${sqlPath}`);
      }
      const sql = fs.readFileSync(sqlPath, "utf8");
      const hash = crypto.createHash("sha256").update(sql).digest("hex");

      if (appliedHashes.has(hash)) {
        skipped.push(entry.tag);
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
      applied.push(entry.tag);
      log(`[migrate] applied ${entry.tag}`);
    }

    const tableRows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    return { applied, skipped, tables: tableRows.map((r) => r.name) };
  } finally {
    sqlite.close();
  }
}

export interface SchemaCheck {
  ok: boolean;
  missing: string[];
  dbPath: string;
}

export function verifySchema(opts?: { dbPath?: string }): SchemaCheck {
  const dbPath = opts?.dbPath ?? resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    return { ok: false, missing: [...REQUIRED_TABLES], dbPath };
  }
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const rows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const present = new Set(rows.map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    return { ok: missing.length === 0, missing, dbPath };
  } finally {
    sqlite.close();
  }
}
