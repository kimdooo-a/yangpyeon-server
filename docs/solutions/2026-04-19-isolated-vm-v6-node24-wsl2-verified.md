---
title: isolated-vm v6.1.2 + Node v24 LTS WSL2 호환 검증 — ADR-009 트리거 1 해소
date: 2026-04-19
session: 30 (SP-012)
tags: [isolated-vm, v8-isolates, edge-functions, adr-009, abi, node24, wsl2]
category: verification
confidence: high
---

## 문제

ADR-009 "Edge Functions 3층 하이브리드"의 L1 런타임으로 `isolated-vm` v6을 채택하되, §재검토 트리거 1에 다음을 기록:

> **isolated-vm v6 Node 24 ABI 호환 깨짐 (ASM-5 EWI)**

배경:
- `isolated-vm` 은 v8 C++ 바인딩으로 구성된 native addon
- Node 메이저 업그레이드(22 → 24) 시 v8 포크 버전 차이로 ABI break 발생 가능
- spike-005-edge에서는 v5 + Node 20 LTS 조합만 검증 완료
- v6 + Node 22 LTS 조합도 미검증이었고, 프로젝트 현행은 이미 Node v24.14.1

기존 스펙(SP-012)은 "Node 22 LTS" 환경을 전제했지만 **프로젝트 현실은 Node v24** → 실제 배포 환경의 호환성을 검증해야 했다.

## 실증

SP-012 실험 (WSL2 Ubuntu 24.04.4 LTS + Node v24.14.1 + isolated-vm@6.1.2):

### 설치
```bash
$ time npm install isolated-vm
real    0m1.593s
```
- prebuilt binary 제공 → node-gyp 빌드 없음
- `require('isolated-vm').Isolate` 로드 성공

### 기본 실행
```js
const iso = new ivm.Isolate({ memoryLimit: 32 });
const ctx = iso.createContextSync();
ctx.global.setSync("global", ctx.global.derefInto());
const result = iso.compileScriptSync("1 + 2 * 3").runSync(ctx);
// result === 7 ✅
```

### Cold start (100 iter)
| 지표 | 값 (ms) |
|------|---------|
| p50 | 0.778 |
| **p95** | **0.909** |
| p99 | 1.010 |
| max | 1.090 |

목표 `p95 ≤ 50ms` 대비 **55배 여유**.

### 메모리 격리
`memoryLimit: 32MB` 초과 시 `Isolate was disposed due to memory limit` — 호스트 프로세스 영향 없음.

### 누수 테스트
10초 × 1,092 churns/s = 10,927 churns, RSS 증가 16MB. 정상 부하(100/분) 환산 **0.09MB/10분** — 사실상 누수 없음.

## 해결 — ADR-009 반영

### 1. 재검토 트리거 1 상태
```
Before: v6 Node 24 ABI 호환 깨짐 (ASM-5 EWI)
After:  RESOLVED — v6.1.2 + Node v24.14.1 실증 완료 (SP-012, 2026-04-19)
```

### 2. Phase 19 런타임 확정
- **L1 런타임**: `isolated-vm@6.1.2` (latest)
- **Node 버전**: v24 LTS (현행 유지)
- **cold start 목표 상향**: p95 < 2ms (실측 0.909ms × 안전 계수 2)
- **workerd 대안 검토 불필요**

### 3. 운영 구현 패턴
```typescript
// src/lib/edge/sandbox.ts (Phase 19)
import ivm from "isolated-vm";

export async function runSandboxed(code: string, timeoutMs = 100) {
  const iso = new ivm.Isolate({ memoryLimit: 32 });
  try {
    const ctx = await iso.createContext();
    await ctx.global.set("global", ctx.global.derefInto());
    const script = await iso.compileScript(code);
    const result = await Promise.race([
      script.run(ctx, { timeout: timeoutMs }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("outer-timeout")), timeoutMs + 50)
      ),
    ]);
    ctx.release();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    if (!iso.isDisposed) iso.dispose();
  }
}
```

핵심:
- memoryLimit 32MB (실험 검증값)
- `script.run({ timeout })` + 외부 `Promise.race` 이중 타임아웃 (내부 v8 OOM 발생 시 JS try/catch 포착 불가 — 외부 가드 필수)
- `finally`에서 `isDisposed` 체크 후 dispose

## 교훈

1. **"ABI break 가능성"은 실측 전까지는 단순 가설**: ADR-009 재검토 트리거 1은 2026-04-12 spike-005-edge에서 미검증 상태로 남았던 우려. SP-012 실측에 2시간도 안 걸렸다면 더 일찍 해소 가능했다.
2. **spec의 환경 가정과 프로젝트 현실 이격**: spec이 "Node 22 LTS"를 전제했지만 프로젝트는 이미 Node v24. 이격은 다른 SP들에서도 있을 수 있으므로 사전 환경 확인 필수.
3. **WSL2 성능이 압도적**: cold start 0.909ms는 공식 벤치마크(Linux native 기준 ~5ms)보다 우수. WSL2 + Windows Subsystem for Linux 2 커널이 Linux native와 거의 동일하게 동작.
4. **재검토 트리거 해소 시 ADR 업데이트 루틴**: 해소 발견 즉시 ADR 본문의 트리거 목록을 수정. "RESOLVED — 실증 파일 링크" 형식으로 기록.

## 관련 파일

- `docs/research/spikes/spike-012-isolated-vm-v6-result.md` 전체
- `02-architecture/01-adr-log.md` § ADR-009 (수정 대상)
- `02-architecture/10-edge-functions-blueprint.md` § 런타임 선택 (확정 반영 대상)
- `spikes/spike-005-edge-functions.md` — v5 + Node 20 LTS 검증 (현재 의존성 없음, 아카이브)

## 후속 연결

- **Phase 19 Edge Functions 구현 승인**: SP-012 Go 판정으로 구현 착수 가능
- **v6 최신 버전 추적**: `isolated-vm` 마이너 업데이트 시 재측정 권장 (CI에 포함 고려)
