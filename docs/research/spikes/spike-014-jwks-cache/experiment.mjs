// SP-014 JWKS Cache Experiment
// 실험 1~3: 로컬 JWKS endpoint + jose createRemoteJWKSet 측정
// 실험 4: Cloudflare Tunnel RTT (stylelucky4u.com 기존 엔드포인트 경유)
//
// 실행: node docs/research/spikes/spike-014-jwks-cache/experiment.mjs
// Node 요건: v20+ (v24.14.1 확인됨)
// jose: ^6.2.2 (프로젝트 기존 설치)

import { createServer, request as httpRequest } from "node:http";
import { performance } from "node:perf_hooks";
import { request as httpsRequest } from "node:https";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  jwtVerify,
  createRemoteJWKSet,
  createLocalJWKSet,
} from "jose";

// ─────────────────────────────────────────────────────────────────
// 유틸: 통계
// ─────────────────────────────────────────────────────────────────

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, rank)];
}

function stats(values) {
  if (!values || values.length === 0) {
    return { count: 0, note: "no data (서버 미기동/연결 실패)" };
  }
  return {
    count: values.length,
    min: Math.min(...values).toFixed(3),
    p50: percentile(values, 50).toFixed(3),
    p95: percentile(values, 95).toFixed(3),
    p99: percentile(values, 99).toFixed(3),
    max: Math.max(...values).toFixed(3),
    mean: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(3),
  };
}

// ─────────────────────────────────────────────────────────────────
// JWKS mock server
// ─────────────────────────────────────────────────────────────────

async function buildJwks(key) {
  const jwk = await exportJWK(key.publicKey);
  jwk.alg = "ES256";
  jwk.use = "sig";
  jwk.kid = key.kid;
  return { keys: [jwk] };
}

function startJwksServer(port, jwksRef) {
  let fetchCount = 0;
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      fetchCount += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(jwksRef.value));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, getFetchCount: () => fetchCount })
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// 실험 1: 캐시 없음 (매 요청 fetch)
// ─────────────────────────────────────────────────────────────────

async function exp1_noCache(port, token) {
  console.log("\n[실험 1] 캐시 없음 (매 요청 JWKS fetch)");
  const times = [];
  for (let i = 0; i < 100; i += 1) {
    // cacheMaxAge=0 → 매번 fetch
    const jwks = createRemoteJWKSet(
      new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`),
      { cacheMaxAge: 0, cooldownDuration: 0 }
    );
    const t0 = performance.now();
    await jwtVerify(token, jwks);
    times.push(performance.now() - t0);
  }
  return stats(times);
}

// ─────────────────────────────────────────────────────────────────
// 실험 2: cacheMaxAge=180_000 (3분) 적용
// ─────────────────────────────────────────────────────────────────

async function exp2_cache180s(port, token, jwksFetchCounter) {
  console.log("\n[실험 2] cacheMaxAge=180_000 (3분)");
  const jwks = createRemoteJWKSet(
    new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`),
    { cacheMaxAge: 180_000, cooldownDuration: 30_000 }
  );
  const times = [];
  const startFetch = jwksFetchCounter();
  for (let i = 0; i < 100; i += 1) {
    const t0 = performance.now();
    await jwtVerify(token, jwks);
    times.push(performance.now() - t0);
  }
  const endFetch = jwksFetchCounter();
  const fetchDelta = endFetch - startFetch;
  return { ...stats(times), fetchCount: fetchDelta, hitRate: (((100 - fetchDelta) / 100) * 100).toFixed(1) + "%" };
}

// ─────────────────────────────────────────────────────────────────
// 실험 3: 키 회전 grace 기간 동안 구 키 검증
// ─────────────────────────────────────────────────────────────────

async function exp3_keyRotationGrace(port, oldKey, newKey, oldToken, newToken, jwksRef) {
  console.log("\n[실험 3] 키 회전 grace — 구 토큰 검증");
  // 시나리오:
  //   t=0   : JWKS에 oldKey만 존재 — 구 토큰 검증 성공
  //   t=1   : JWKS 교체 (newKey만) — grace 없음, 구 토큰 실패
  //   t=2   : JWKS에 both — grace 기간, 둘 다 성공
  const results = [];

  // 단계 A: 기본(oldKey) 상태 — 구 토큰 검증
  const jwks = createRemoteJWKSet(
    new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`),
    { cacheMaxAge: 180_000, cooldownDuration: 30_000 }
  );
  try {
    await jwtVerify(oldToken, jwks);
    results.push({ stage: "A(old only, old token)", ok: true });
  } catch (e) {
    results.push({ stage: "A(old only, old token)", ok: false, err: e.code || e.message });
  }

  // 단계 B: JWKS를 newKey만으로 교체 (캐시 내부), cooldown 우회 위해 새 jwks 인스턴스 + cacheMaxAge=0로 즉시 fetch
  const newJwk = await exportJWK(newKey.publicKey);
  newJwk.alg = "ES256"; newJwk.use = "sig"; newJwk.kid = newKey.kid;
  jwksRef.value = { keys: [newJwk] };

  const jwks2 = createRemoteJWKSet(
    new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`),
    { cacheMaxAge: 0, cooldownDuration: 0 }
  );
  try {
    await jwtVerify(oldToken, jwks2);
    results.push({ stage: "B(new only, old token)", ok: true });
  } catch (e) {
    results.push({ stage: "B(new only, old token)", ok: false, err: e.code || e.message });
  }

  // 단계 C: JWKS에 both 포함 — grace 기간 시뮬레이션
  const oldJwk = await exportJWK(oldKey.publicKey);
  oldJwk.alg = "ES256"; oldJwk.use = "sig"; oldJwk.kid = oldKey.kid;
  jwksRef.value = { keys: [oldJwk, newJwk] };

  const jwks3 = createRemoteJWKSet(
    new URL(`http://127.0.0.1:${port}/.well-known/jwks.json`),
    { cacheMaxAge: 0, cooldownDuration: 0 }
  );
  try {
    await jwtVerify(oldToken, jwks3);
    results.push({ stage: "C(both, old token)", ok: true });
  } catch (e) {
    results.push({ stage: "C(both, old token)", ok: false, err: e.code || e.message });
  }
  try {
    await jwtVerify(newToken, jwks3);
    results.push({ stage: "C(both, new token)", ok: true });
  } catch (e) {
    results.push({ stage: "C(both, new token)", ok: false, err: e.code || e.message });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────
// 실험 4: Cloudflare Tunnel RTT 측정 (stylelucky4u.com 기존 엔드포인트)
// ─────────────────────────────────────────────────────────────────

function tunnelRtt(host, path, count) {
  return new Promise((resolve) => {
    const times = [];
    let done = 0;
    const runOne = () => {
      if (done >= count) return resolve(stats(times));
      const t0 = performance.now();
      const req = httpsRequest(
        { host, path, method: "GET", timeout: 5000 },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => {
            const dt = performance.now() - t0;
            times.push(dt);
            done += 1;
            setTimeout(runOne, 50); // 50ms 간격, 버스트 방지
          });
        }
      );
      req.on("error", () => {
        done += 1;
        setTimeout(runOne, 50);
      });
      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });
      req.end();
    };
    runOne();
  });
}

// ─────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== SP-014 JWKS Cache Experiment ===");
  console.log("Node:", process.version);

  // 키 준비
  const oldKey = await generateKeyPair("ES256");
  oldKey.kid = "kid-old-2026-04";
  const newKey = await generateKeyPair("ES256");
  newKey.kid = "kid-new-2026-05";

  const oldJwk = await exportJWK(oldKey.publicKey);
  oldJwk.alg = "ES256"; oldJwk.use = "sig"; oldJwk.kid = oldKey.kid;
  const jwksRef = { value: { keys: [oldJwk] } };

  // mock JWKS 서버
  const port = 9001;
  const { server, getFetchCount } = await startJwksServer(port, jwksRef);
  console.log(`JWKS mock server: http://127.0.0.1:${port}/.well-known/jwks.json`);

  // 토큰 발급
  const oldToken = await new SignJWT({ sub: "user-1", role: "ADMIN" })
    .setProtectedHeader({ alg: "ES256", kid: oldKey.kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(oldKey.privateKey);

  const newToken = await new SignJWT({ sub: "user-1", role: "ADMIN" })
    .setProtectedHeader({ alg: "ES256", kid: newKey.kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(newKey.privateKey);

  // 실험 1
  const r1 = await exp1_noCache(port, oldToken);
  console.log("실험 1 결과 (ms):", r1);

  // 실험 2
  const r2 = await exp2_cache180s(port, oldToken, getFetchCount);
  console.log("실험 2 결과 (ms):", r2);

  // 실험 3
  const r3 = await exp3_keyRotationGrace(port, oldKey, newKey, oldToken, newToken, jwksRef);
  console.log("실험 3 결과:", r3);

  server.close();

  // 실험 4: Cloudflare Tunnel RTT
  console.log("\n[실험 4] Cloudflare Tunnel RTT (stylelucky4u.com)");
  try {
    const r4 = await tunnelRtt("stylelucky4u.com", "/login", 50);
    console.log("실험 4 결과 (ms):", r4);
  } catch (e) {
    console.log("실험 4 실패:", e.message);
  }

  // 로컬 비교
  console.log("\n[실험 4-로컬] localhost:3000 비교 (가용 시)");
  try {
    const r4local = await new Promise((resolve) => {
      const times = [];
      let done = 0;
      const runOne = () => {
        if (done >= 50) return resolve(stats(times));
        const t0 = performance.now();
        const req = httpRequest({ host: "127.0.0.1", port: 3000, path: "/login", timeout: 2000 }, (res) => {
          res.on("data", () => {});
          res.on("end", () => { times.push(performance.now() - t0); done += 1; setTimeout(runOne, 20); });
        });
        req.on("error", () => { done += 1; setTimeout(runOne, 20); });
        req.end();
      };
      runOne();
    });
    console.log("실험 4-로컬 결과 (ms):", r4local);
  } catch (e) {
    console.log("실험 4-로컬 스킵:", e.message);
  }

  console.log("\n=== 실험 완료 ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
