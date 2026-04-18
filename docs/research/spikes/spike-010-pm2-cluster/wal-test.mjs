import Database from "better-sqlite3";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (isMainThread) {
  const dir = mkdtempSync(join(tmpdir(), "sp010-wal-"));
  const dbPath = join(dir, "t.db");
  const seed = new Database(dbPath);
  seed.pragma("journal_mode = WAL");
  seed.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT, ts INTEGER)");
  seed.close();

  const NWORKERS = 4;
  const DURATION = 10000;
  const RATE = 50;

  const results = await Promise.all(
    Array.from({ length: NWORKERS }, (_, i) =>
      new Promise((resolve) => {
        const w = new Worker(new URL(import.meta.url), {
          workerData: { id: i, dbPath, duration: DURATION, rate: RATE },
        });
        w.on("message", resolve);
      })
    )
  );

  const writes = results.reduce((a, r) => a + r.writes, 0);
  const busy = results.reduce((a, r) => a + r.busy, 0);
  const total = writes + busy;
  console.log(JSON.stringify({
    workers: NWORKERS,
    total_attempts: total,
    writes_ok: writes,
    busy: busy,
    busy_rate_pct: ((busy / total) * 100).toFixed(3),
    per_worker: results,
  }, null, 2));

  rmSync(dir, { recursive: true, force: true });
} else {
  const { id, dbPath, duration, rate } = workerData;
  const db = new Database(dbPath, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  const stmt = db.prepare("INSERT INTO t (v, ts) VALUES (?, ?)");
  const start = Date.now();
  let writes = 0;
  let busy = 0;
  const intervalMs = 1000 / rate;
  while (Date.now() - start < duration) {
    const t0 = Date.now();
    try {
      stmt.run(`w${id}-${writes}`, t0);
      writes += 1;
    } catch (e) {
      if (String(e.code || "").includes("SQLITE_BUSY")) busy += 1;
      else throw e;
    }
    const elapsed = Date.now() - t0;
    const pause = Math.max(0, intervalMs - elapsed);
    if (pause > 0) await new Promise((r) => setTimeout(r, pause));
  }
  db.close();
  parentPort.postMessage({ id, writes, busy });
}
