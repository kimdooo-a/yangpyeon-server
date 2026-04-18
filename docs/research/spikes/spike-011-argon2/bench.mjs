// SP-011 argon2id vs bcrypt 성능 비교
// 이 스크립트는 @node-rs/argon2 설치된 임시 프로젝트에서 실행되어야 함.
// bcrypt는 프로젝트 node_modules 경유로 가능.

import { hash as argonHash, verify as argonVerify, Algorithm } from "@node-rs/argon2";
import bcrypt from "bcrypt";
import { performance } from "node:perf_hooks";

const PASSWORD = "MySecureTestPassword2026!";
const ITERATIONS = 50;

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
}

function summary(label, times) {
  return `${label.padEnd(30)} | p50=${percentile(times, 50).toFixed(1).padStart(7)} | p95=${percentile(times, 95).toFixed(1).padStart(7)} | mean=${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1).padStart(7)}  (ms)`;
}

console.log("=== SP-011 argon2id vs bcrypt ===");
console.log("Node:", process.version);
console.log("ITERATIONS:", ITERATIONS);

// 1) bcrypt cost=12 해시 생성
{
  const times = [];
  let sample;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t = performance.now();
    sample = await bcrypt.hash(PASSWORD, 12);
    times.push(performance.now() - t);
  }
  console.log(summary("bcrypt(12) hash", times));

  // verify
  const vtimes = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t = performance.now();
    await bcrypt.compare(PASSWORD, sample);
    vtimes.push(performance.now() - t);
  }
  console.log(summary("bcrypt(12) verify", vtimes));
}

// 2) argon2id 기본 파라미터 해시 생성
{
  const times = [];
  let sample;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t = performance.now();
    sample = await argonHash(PASSWORD, { algorithm: Algorithm.Argon2id });
    times.push(performance.now() - t);
  }
  console.log(summary("argon2id(default) hash", times));

  const vtimes = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const t = performance.now();
    await argonVerify(sample, PASSWORD);
    vtimes.push(performance.now() - t);
  }
  console.log(summary("argon2id(default) verify", vtimes));
}

// 3) 점진 마이그레이션 시뮬레이션
// - 1000 사용자 중 500명은 bcrypt, 500명은 argon2 해시 보유
// - 모두 "로그인" → bcrypt 접두사(`$2`) 감지 시 argon2로 재해시
//   새로 저장, 다음 로그인은 argon2로 검증
{
  console.log("\n[점진 마이그레이션 시뮬레이션 — 1000 사용자]");
  const users = [];
  const N = 1000;
  const halfN = N / 2;
  for (let i = 0; i < halfN; i += 1) {
    users.push({ id: i, hash: await bcrypt.hash(`pw${i}`, 10) });
  }
  for (let i = halfN; i < N; i += 1) {
    users.push({ id: i, hash: await argonHash(`pw${i}`, { algorithm: Algorithm.Argon2id }) });
  }

  let errors = 0;
  let migrated = 0;
  const migTimes = [];
  for (const u of users) {
    const pw = `pw${u.id}`;
    const t = performance.now();
    try {
      let ok = false;
      if (u.hash.startsWith("$2")) {
        ok = await bcrypt.compare(pw, u.hash);
        if (ok) {
          // 재해시 → 저장 (in-memory)
          u.hash = await argonHash(pw, { algorithm: Algorithm.Argon2id });
          migrated += 1;
        }
      } else {
        ok = await argonVerify(u.hash, pw);
      }
      if (!ok) errors += 1;
    } catch (e) {
      errors += 1;
    }
    migTimes.push(performance.now() - t);
  }

  console.log(`  마이그레이션 성공: ${migrated}/${halfN}`);
  console.log(`  오류: ${errors}/${N}`);
  console.log(summary("  로그인 지연", migTimes));

  // 2차 로그인 (모두 argon2)
  const reloginTimes = [];
  let relogErrors = 0;
  for (const u of users) {
    const pw = `pw${u.id}`;
    const t = performance.now();
    try {
      const ok = u.hash.startsWith("$2")
        ? await bcrypt.compare(pw, u.hash)
        : await argonVerify(u.hash, pw);
      if (!ok) relogErrors += 1;
    } catch {
      relogErrors += 1;
    }
    reloginTimes.push(performance.now() - t);
  }
  console.log(summary("  2차 로그인(전체 argon2)", reloginTimes));
  console.log(`  2차 오류: ${relogErrors}/${N}`);
}

console.log("\n=== 완료 ===");
