// Cluster (4 workers) — PM2 cluster:4 equivalent
const cluster = require("node:cluster");
const os = require("node:os");

const N_WORKERS = 4;

if (cluster.isPrimary) {
  console.log(`[primary] pid=${process.pid}, spawning ${N_WORKERS} workers`);
  for (let i = 0; i < N_WORKERS; i += 1) {
    const w = cluster.fork({ NODE_APP_INSTANCE: String(i) });
    w.on("exit", (code) => console.log(`[primary] worker ${i} exited code=${code}`));
  }
} else {
  require("./server.cjs");
}
