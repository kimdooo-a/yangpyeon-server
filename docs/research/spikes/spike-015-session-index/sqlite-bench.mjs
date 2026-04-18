// SP-015 SQLite Session Index Benchmark
// - 10만 행 Session 삽입
// - 쿼리 플랜 EXPLAIN QUERY PLAN
// - 활성 세션 조회 p95 측정

import Database from "better-sqlite3";
import { performance } from "node:perf_hooks";
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "sp015-sqlite-"));
const dbPath = join(dir, "session-bench.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

console.log("=== SP-015 SQLite bench ===");
console.log("DB:", dbPath);

db.exec(`
  CREATE TABLE Session (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX idx_session_user_exp ON Session (userId, expiresAt);
`);

const N_USERS = 1000;
const SESSIONS_PER_USER = 100;
const N = N_USERS * SESSIONS_PER_USER;
const now = Date.now();

console.log(`Inserting ${N.toLocaleString()} rows...`);
const insert = db.prepare(
  "INSERT INTO Session (id, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)"
);
const insertAll = db.transaction((rows) => {
  for (const row of rows) insert.run(...row);
});

const t0 = performance.now();
const rows = [];
for (let u = 0; u < N_USERS; u += 1) {
  const userId = `user-${u.toString().padStart(5, "0")}`;
  for (let s = 0; s < SESSIONS_PER_USER; s += 1) {
    const hash = createHash("sha256").update(randomBytes(16)).digest("hex");
    const expiresAt = s < SESSIONS_PER_USER * 0.8
      ? now + 7 * 24 * 3600 * 1000
      : now - 3600 * 1000;
    rows.push([hash, userId, expiresAt, now - Math.floor(Math.random() * 86400000)]);
  }
}
insertAll(rows);
const tInsert = performance.now() - t0;
console.log(`Insert: ${tInsert.toFixed(0)}ms (${((N / tInsert) * 1000).toFixed(0)} rows/s)`);

const explainRows = db
  .prepare("EXPLAIN QUERY PLAN SELECT * FROM Session WHERE userId = ? AND expiresAt > ?")
  .all("user-00001", now);
console.log("\nEXPLAIN QUERY PLAN:");
for (const r of explainRows) console.log(" ", JSON.stringify(r));

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
}

const stmt = db.prepare(
  "SELECT * FROM Session WHERE userId = ? AND expiresAt > ?"
);
const times = [];
const ITER = 1000;
for (let i = 0; i < ITER; i += 1) {
  const userId = `user-${Math.floor(Math.random() * N_USERS).toString().padStart(5, "0")}`;
  const t = performance.now();
  stmt.all(userId, now);
  times.push(performance.now() - t);
}

console.log(`\nQuery (${ITER} iter):`, {
  min: Math.min(...times).toFixed(3),
  p50: percentile(times, 50).toFixed(3),
  p95: percentile(times, 95).toFixed(3),
  p99: percentile(times, 99).toFixed(3),
  max: Math.max(...times).toFixed(3),
  mean: (times.reduce((a, b) => a + b, 0) / ITER).toFixed(3),
});

try {
  const size = db
    .prepare("SELECT name, SUM(pgsize) AS bytes FROM dbstat WHERE name LIKE 'Session%' OR name LIKE 'idx%' GROUP BY name")
    .all();
  console.log("\nTable/Index size:", size);
} catch {
  console.log("\ndbstat 미지원 (compile-time option) — size 측정 생략");
}

db.close();
rmSync(dir, { recursive: true, force: true });
console.log("=== 완료 ===");
