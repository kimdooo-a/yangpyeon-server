// SP-019 — SQLite writer contention + instrumentation duplication check
// cluster 4 worker 가 동시에 SQLite WAL 모드로 insert 시 SQLITE_BUSY 발생률 측정
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const DB_PATH = '/tmp/sp019.db';
const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, worker INTEGER, ts INTEGER)`);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const worker = Number(process.env.NODE_APP_INSTANCE ?? -1);
const insert = db.prepare('INSERT INTO audit_log (id, worker, ts) VALUES (?, ?, ?)');

// instrumentation duplicate detection
const g = globalThis as any;
if (g.__spike019Scheduler) {
  console.log(JSON.stringify({ worker, type: 'instrumentation_duplicate', msg: 'scheduler already exists' }));
} else {
  g.__spike019Scheduler = `scheduler-w${worker}-${Date.now()}`;
  console.log(JSON.stringify({ worker, type: 'instrumentation_init', id: g.__spike019Scheduler }));
}

let count = 0;
let busy = 0;
let other = 0;

const START_TS = Date.now();
const DURATION_MS = 25_000;

const tick = setInterval(() => {
  try {
    insert.run(randomUUID(), worker, Date.now());
    count++;
  } catch (e: any) {
    if (e.code === 'SQLITE_BUSY') busy++;
    else other++;
  }
  if (Date.now() - START_TS >= DURATION_MS) {
    clearInterval(tick);
    console.log(JSON.stringify({
      worker,
      type: 'final',
      count,
      busy,
      other,
      duration_ms: Date.now() - START_TS,
    }));
  }
  if (count % 500 === 0 && count > 0) {
    console.log(JSON.stringify({ worker, type: 'progress', count, busy, other }));
  }
}, 5);
