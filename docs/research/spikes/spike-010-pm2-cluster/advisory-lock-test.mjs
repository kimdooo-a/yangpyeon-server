// SP-010 node-cron advisory lock 중복 방지 테스트
// - 4개 worker가 동시 기동 (cluster 모드 가정)
// - 각자 "매 초"마다 DB advisory lock 시도
// - lock 획득한 worker만 작업 수행
// - 중복 실행 건수 집계

import pg from "pg";
import { setTimeout as sleep } from "node:timers/promises";

const { Client } = pg;
const url = process.env.PG_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
const WORKER_ID = parseInt(process.argv[2] || "0", 10);
const DURATION_SEC = 10;
const LOCK_KEY = 260406019; // 임의 BIGINT 키
const jobsExecuted = [];

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();

  console.log(`[worker ${WORKER_ID}] started pid=${process.pid}`);
  const startMs = Date.now();

  while ((Date.now() - startMs) / 1000 < DURATION_SEC) {
    // 매 1초마다 lock 시도
    const secBoundary = Math.floor((Date.now() - startMs) / 1000);
    const r = await client.query("SELECT pg_try_advisory_lock($1) AS got", [LOCK_KEY]);
    if (r.rows[0].got) {
      // 잡 실행 (가상)
      jobsExecuted.push({ sec: secBoundary, worker: WORKER_ID, at: Date.now() });
      await sleep(50); // 잡 수행 시간 모의
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
    // 다음 초까지 대기
    await sleep(1000 - ((Date.now() - startMs) % 1000));
  }

  await client.end();
  console.log(JSON.stringify({ worker: WORKER_ID, jobs: jobsExecuted }));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
