// SP-010 테스트 서버 — 최소 Express 대체 (http.createServer)
// CPU bound 작업을 일부 섞어 fork vs cluster 차이가 드러나게 함
const http = require("node:http");
const crypto = require("node:crypto");

const PORT = parseInt(process.env.PORT || "3001", 10);

const server = http.createServer((req, res) => {
  // 간단 CPU 작업 (~1-2ms)
  const buf = crypto.randomBytes(256);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: true,
    pid: process.pid,
    worker: process.env.NODE_APP_INSTANCE ?? "fork",
    hash: hash.slice(0, 16),
  }));
});

server.listen(PORT, () => {
  console.log(`[${process.pid}] listening on :${PORT}`);
});
