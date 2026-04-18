// SP-010 bench driver
// - fork 모드 서버 spawn → 2s 대기 → autocannon 10s → kill
// - cluster 모드 서버 spawn → 3s 대기 → autocannon 10s → kill
// - 결과 JSON 저장

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import autocannon from "autocannon";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function spawnServer(scriptPath) {
  const proc = spawn("node", [scriptPath], {
    cwd: __dirname,
    env: { ...process.env, PORT: "3001" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return proc;
}

async function runBench(label, warmupMs) {
  console.log(`\n=== ${label} ===`);
  await sleep(warmupMs);
  return new Promise((resolve, reject) => {
    autocannon(
      { url: "http://127.0.0.1:3001/", connections: 50, duration: 10, json: true },
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });
}

async function killProc(proc) {
  if (!proc.killed) proc.kill("SIGTERM");
  await sleep(500);
  if (!proc.killed) proc.kill("SIGKILL");
  await sleep(500);
}

function fmt(r) {
  return {
    rps: r.requests.average.toFixed(0),
    thr_mbs: (r.throughput.average / 1e6).toFixed(2),
    p50: r.latency.p50,
    p95: r.latency.p97_5,
    p99: r.latency.p99,
    errors: r.errors,
    timeouts: r.timeouts,
    non2xx: r.non2xx,
    total_reqs: r.requests.total,
  };
}

async function main() {
  // Fork
  const fork = await spawnServer("run-fork.cjs");
  const rFork = await runBench("fork", 2000);
  await killProc(fork);
  writeFileSync("/tmp/sp010-fork.json", JSON.stringify(rFork, null, 2));
  console.log("fork:", fmt(rFork));
  await sleep(2000);

  // Cluster
  const cl = await spawnServer("run-cluster.cjs");
  const rClu = await runBench("cluster:4", 3000);
  await killProc(cl);
  writeFileSync("/tmp/sp010-cluster.json", JSON.stringify(rClu, null, 2));
  console.log("cluster:4:", fmt(rClu));

  // 상대 비교
  const boost = ((rClu.requests.average / rFork.requests.average - 1) * 100).toFixed(1);
  console.log(`\n⇒ cluster:4 RPS = fork × ${(rClu.requests.average / rFork.requests.average).toFixed(2)} (+${boost}%)`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
