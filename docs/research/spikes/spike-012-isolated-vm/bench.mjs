// SP-012 isolated-vm v6 cold start + memory isolation + leak test
import ivm from "isolated-vm";
import { performance } from "node:perf_hooks";

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
}

console.log("=== SP-012 isolated-vm v6 ===");
console.log("Node:", process.version);
console.log("isolated-vm: 6.1.2");

// 1) 기본 동작
{
  console.log("\n[1] 기본 실행");
  const iso = new ivm.Isolate({ memoryLimit: 32 });
  const ctx = iso.createContextSync();
  const jail = ctx.global;
  jail.setSync("global", jail.derefInto());
  const script = iso.compileScriptSync("1 + 2 * 3");
  const result = script.runSync(ctx);
  console.log(" 결과:", result, "(기대 7)");
  ctx.release();
  iso.dispose();
}

// 2) Cold start 측정 (100회 Isolate 생성 → context 준비)
{
  console.log("\n[2] Cold start (Isolate + context, 100 iter)");
  const times = [];
  for (let i = 0; i < 100; i += 1) {
    const t0 = performance.now();
    const iso = new ivm.Isolate({ memoryLimit: 32 });
    const ctx = iso.createContextSync();
    ctx.global.setSync("global", ctx.global.derefInto());
    times.push(performance.now() - t0);
    ctx.release();
    iso.dispose();
  }
  console.log({
    p50: percentile(times, 50).toFixed(3),
    p95: percentile(times, 95).toFixed(3),
    p99: percentile(times, 99).toFixed(3),
    min: Math.min(...times).toFixed(3),
    max: Math.max(...times).toFixed(3),
    mean: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
  });
}

// 3) 메모리 격리
{
  console.log("\n[3] 메모리 격리 (32MB limit → OOM 처리)");
  const iso = new ivm.Isolate({ memoryLimit: 32 });
  const ctx = iso.createContextSync();
  ctx.global.setSync("global", ctx.global.derefInto());
  // 큰 문자열 반복 생성으로 32MB 한도 초과 유도
  const code = `
    const a = [];
    try {
      while (true) a.push(new Array(100000).fill('x'));
    } catch (e) {
      ({ok: false, err: String(e)});
    }
  `;
  const script = iso.compileScriptSync(code);
  try {
    const res = script.runSync(ctx);
    console.log(" 결과:", res);
  } catch (e) {
    console.log(" OOM 감지 — 호스트 안전 유지: " + String(e).slice(0, 120));
  }
  try { ctx.release(); } catch {}
  try { iso.dispose(); } catch {}
}

// 4) 장시간 실행 누수 — 10초 동안 100회/초 Isolate churn
{
  console.log("\n[4] 누수 테스트 (10초 × 100 Isolate/초)");
  const memBefore = process.memoryUsage().rss;
  const startMs = Date.now();
  let churns = 0;
  while (Date.now() - startMs < 10_000) {
    const iso = new ivm.Isolate({ memoryLimit: 32 });
    const ctx = iso.createContextSync();
    ctx.global.setSync("global", ctx.global.derefInto());
    iso.compileScriptSync("1+1").runSync(ctx);
    ctx.release();
    iso.dispose();
    churns += 1;
    await new Promise((r) => setImmediate(r));
  }
  const memAfter = process.memoryUsage().rss;
  const deltaMB = (memAfter - memBefore) / (1024 * 1024);
  console.log({
    churns,
    memBefore_MB: (memBefore / 1e6).toFixed(1),
    memAfter_MB: (memAfter / 1e6).toFixed(1),
    delta_MB: deltaMB.toFixed(2),
  });
}

console.log("\n=== 완료 ===");
