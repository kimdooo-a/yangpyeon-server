# Spike-005 (심화) — Edge Functions 3층 하이브리드 운영성 검증

- **상태**: Wave 5 S1 — Phase 19 진입 전 필수 검증
- **작성일**: 2026-04-18 (kdywave Wave 5 S1 에이전트)
- **대상**: 양평 부엌 서버 대시보드 (stylelucky4u.com)
- **스택**: Node.js 24 LTS + Next.js 16 + isolated-vm@6.x + Deno 1.46+ + WSL2 + PM2
- **상위 청사진**: `02-architecture/10-edge-functions-blueprint.md` (Phase 19, 40h)
- **선행 스파이크**: `spikes/spike-005-edge-functions.md` (v1 — worker_threads lite 검증 완료)
- **관련 ADR**: ADR-009 (3층 하이브리드 채택)
- **관련 DQ**: DQ-1.4 (확정) / DQ-1.22 / DQ-1.23 / DQ-1.24
- **관련 TD**: TD-007 (isolated-vm v6 운영 부채 해소 대상)
- **kdyspike 명령**: `/kdyspike --full edge-functions-3-layer --max-hours 16`

---

## 0. 문서 목적 및 위치

### 0.1 이 스파이크가 필요한 이유

`spikes/spike-005-edge-functions.md`(v1)는 2026-04-12 작성된 선행 리서치로, `worker_threads + node:vm` Lite 모드의 타당성을 문서 기반으로 평가했다. 그 결론은 "관리자 전용 Lite 모드 → v2에서 isolated-vm 승격"이었다.

이후 Wave 1~4를 거치며 아키텍처가 크게 발전했다:

- **Wave 1**: isolated-vm v6가 3.85/5로 L1(빠른 격리) 역할 확정 (`01-isolated-vm-v2-deep-dive.md`)
- **Wave 1**: Deno embed가 4.22/5로 L2(Supabase 100% 호환) 역할 확정 (`02-deno-embed-deep-dive.md`)
- **Wave 2**: 3층 하이브리드 점수 4.3~4.5/5, 단독 후보 모두 초과 (`04-edge-functions-matrix.md`)
- **Wave 3**: Edge Functions = 리스크 TOP 1 (`10-14-categories-priority.md §6.2 R-TOP-1`)
- **Wave 4**: 3층 청사진 완성, `decideRuntime()` 코드 확정 (`10-edge-functions-blueprint.md`)

따라서 Phase 19 진입 전 이 스파이크는 **문서 기반 이론을 실측 데이터로 검증**하는 것이다. 특히 다음 3가지 질문이 미해결 상태다:

1. `decideRuntime()` 함수가 경계 케이스 30건을 실제로 100% 처리하는가?
2. isolated-vm v6가 Node.js 24 LTS 환경에서 cold start p95 ≤ 100ms를 달성하는가?
3. Deno 사이드카 HTTP IPC 추가 지연이 30ms 이내인가?

### 0.2 v1 스파이크와 차별점

| 항목 | v1 (spike-005-edge-functions.md) | v2 (이 문서) |
|------|----------------------------------|--------------|
| 검증 방식 | 문서·GitHub 기반 이론 평가 | 실측 실험 (코드 실행) |
| 대상 아키텍처 | worker_threads + node:vm Lite | isolated-vm v6 + Deno 사이드카 + Vercel Sandbox |
| decideRuntime() | 개념 없음 | 30 케이스 단위 테스트 |
| 메모리 누수 검증 | 언급만 | 4시간 부하 RSS 추적 |
| 사이드카 IPC | 언급 없음 | p50/p95/p99 실측 |
| 기간 | 없음 (사전 리서치) | 2일 / 16h |

---

## 1. 목적 (Phase 19 진입 전 검증)

### 1.1 검증 핵심

**3층 하이브리드(isolated-vm v6 + Deno 사이드카 + Vercel Sandbox 위임) 라우팅·통합·메모리 한계를 실제 코드 실행으로 검증하여, Phase 19 40h 공수 투입 전 치명적 리스크를 제거한다.**

Blueprint(`10-edge-functions-blueprint.md §3.2`)에 명시된 `decideRuntime()` 함수는 우선순위 P0~P5로 7개 분기를 처리한다. 이 로직이 명세대로 동작하지 않으면 보안 격리가 실패한다(리스크 TOP 1). 따라서 단위 테스트 30 케이스를 직접 실행하고, 실제 Edge Function 3개를 3층에서 실행하여 지연을 측정한다.

### 1.2 Phase 19와의 연계

```
spike-005-deep (2일, 16h)
    │
    ├─ 성공 → ADR-009 강화 + Phase 19 WBS 정밀화
    │         EF-02 (IsolatedVMPool) ~ EF-05 (API 라우트) 신뢰도 상승
    │
    ├─ 부분 성공 → Layer 1만 Phase 19 도입
    │              Layer 2/3는 Phase 22 보너스로 이연
    │
    └─ 실패 → Edge Functions 단일 isolated-vm v6 운영
              Deno/Sandbox는 Phase 22+ 재고
```

---

## 2. 가설 (5건)

### H1 — decideRuntime() 라우팅 정확도

**가설**: `decideRuntime()` 함수가 Blueprint §3.2에 정의된 P0~P5 우선순위 규칙에 따라 경계 케이스를 포함한 30개 케이스 중 ≥ 29건(96.7%)을 정확히 L1/L2/L3로 라우팅한다.

**배경**: Wave 3 리스크 매트릭스에서 "decideRuntime() 미커버리지"가 확률 35%, 영향 매우 높음으로 평가됐다. 경계 케이스(예: `isAiGenerated=true` + `runtimeHint='isolatedVm'` 동시 → P0이 P1을 무조건 덮어야 함)가 테스트 없이는 버그 위험이 있다.

**검증 방법**: Vitest 단위 테스트 30 케이스 실행. 케이스 구성:
- P0 보안 강제: 5건 (AI 생성 코드 + 다양한 runtimeHint 조합)
- P1 명시적 힌트: 6건 (sandbox/deno/isolatedVm/auto 각 조합)
- P2 기능 요구: 6건 (npm imports, 외부 네트워크, 양쪽 모두)
- P3 성능 요구: 5건 (timeout 경계값 499/500/501ms 등)
- P4 자동 승격: 4건 (l1EscalationCount 0/1/2/3/4)
- P5 기본값: 4건 (모든 플래그 false/undefined)

**성공 조건**: 30건 중 ≥ 29건 정확 (실패 허용 1건)

### H2 — isolated-vm v6 cold/warm start 지연

**가설**: isolated-vm v6는 Node.js 24 LTS + Next.js 16 환경(WSL2 + PM2)에서 cold start p95 ≤ 100ms, warm start p95 ≤ 50ms를 달성한다.

**배경**: Wave 1 deep-dive (`01-isolated-vm-v2-deep-dive.md §1`)에서 "cold isolate 생성 ~3-5ms"로 문서화됐으나, 이는 bare Node.js 실험 기준이다. Next.js 16 서버 컨텍스트 + IsolatedVMPool 초기화 오버헤드 + WSL2 레이어가 추가될 때의 실측값이 필요하다.

**검증 방법**:
```bash
# 측정 도구: Node.js performance.now() + PM2 metrics
# 시나리오 1: 신규 Isolate 생성 (cold) × 100회, p50/p95/p99 계산
# 시나리오 2: 풀에서 기존 Isolate 재사용 (warm) × 100회, p50/p95/p99 계산
# 샘플 함수: JSON 파싱 + 단순 연산 (실제 Edge Function 최소 단위)
```

**성공 조건**: cold p95 ≤ 100ms / warm p95 ≤ 50ms

### H3 — Deno 사이드카 HTTP IPC 추가 지연

**가설**: Deno 사이드카(별도 PM2 프로세스, localhost:9000 HTTP IPC)가 isolated-vm 메모리 격리 한계(128MB)를 보완하며, HTTP IPC 추가 지연이 ≤ 30ms(p95)이다.

**배경**: Blueprint §11.3에서 "HTTP localhost IPC 오버헤드 50ms+ 발생 시 L2 cold start p95 > 200ms"를 리스크로 식별했으나 실측 데이터가 없다. WSL2의 네트워크 스택 특성상 `127.0.0.1` 루프백이 Linux 네이티브 대비 추가 지연 가능성이 있다.

**검증 방법**:
```bash
# 측정 도구: wrk + Node.js performance.now() + pm2 logs
# 시나리오: Deno 사이드카 /invoke 엔드포인트에 HTTP POST 100회
# 함수: hello-world (최소 연산)로 IPC 순수 오버헤드만 측정
# p50 / p95 / p99 계산, WSL2 루프백 vs Linux 네이티브 비교
```

**성공 조건**: HTTP IPC 추가 지연 p95 ≤ 30ms (기준: Node.js fetch 왕복 측정)

### H4 — 3층 graceful shutdown + timeout 강제

**가설**: L1(isolated-vm), L2(Deno 사이드카), L3(Sandbox 위임 stub) 모두 5초 timeout 강제 + PM2 graceful shutdown 100ms 내 완료가 보장된다.

**배경**: Blueprint §3.3에서 각 Layer별 timeout 설정(`evalClosure({ timeout })`, AbortController)을 명시했으나, 무한루프 함수 실행 중 PM2 `SIGTERM`이 오면 실제로 격리가 즉시 해제되는지 검증이 필요하다.

**검증 방법**:
```typescript
// 테스트 1: 무한루프 함수 실행 중 5s timeout → MemoryLimitExceededError 또는 TimeoutError
// 테스트 2: 무한루프 함수 실행 중 PM2 SIGTERM → graceful shutdown 100ms 내
// 테스트 3: L2 Deno 사이드카에서 30s timeout 함수 → AbortSignal 작동 확인
// 측정: process.hrtime.bigint() 기준 shutdown latency
```

**성공 조건**: timeout 100% 발동 / graceful shutdown ≤ 100ms

### H5 — 1인 환경 3층 동시 모니터링 가능성

**가설**: WSL2 단일 서버 환경에서 L1(IsolatedVMPool) + L2(Deno 사이드카) + Next.js 3개 프로세스를 PM2가 동시 관리하고, `pm2 monit`으로 RSS/CPU를 실시간 확인할 수 있다.

**배경**: 1인 운영자 환경에서 3층 구조의 관찰 가능성이 확인되지 않으면 운영 부담이 너무 크다. PM2 ecosystem.config.js에 `deno-sidecar` 앱을 추가했을 때 전체 메모리 예산이 얼마나 되는지 실측이 필요하다.

**검증 방법**:
```bash
# 도구: pm2 monit / pm2 status / process_resident_memory_bytes (Prometheus)
# 시나리오: 3개 프로세스 동시 기동 후 RSS 총합 측정
# 예상: Next.js ~1GB + isolated-vm(20개 함수 × 128MB) ~2.56GB + Deno ~400MB = ~4GB
# WSL2 16GB 기준 여유 판단
```

**성공 조건**: 3개 프로세스 동시 기동 후 총 RSS ≤ 6GB (WSL2 16GB의 37.5%), `pm2 monit` 실시간 표시 정상

---

## 3. 실험 계획 (5단계)

### 3.1 환경 준비

**WSL2 Ubuntu 22.04 설정**:

```bash
# 1. Node.js 24 LTS 설치 (nvm 경유)
nvm install 24
nvm use 24
node --version  # v24.x.x 확인

# 2. isolated-vm v6 빌드 의존성
sudo apt-get update
sudo apt-get install -y python3 build-essential g++ make

# 3. isolated-vm v6 설치
npm install isolated-vm@6
# 빌드 성공 확인: node -e "require('isolated-vm')"

# 4. Deno 1.46+ 설치
curl -fsSL https://deno.land/install.sh | sh
deno --version  # deno 1.46+ 확인

# 5. 테스트 도구
npm install -D vitest
brew install wrk  # 또는 apt-get install wrk
npm install -g k6

# 6. PM2 ecosystem.config.js에 deno-sidecar 추가 (Blueprint 부록 A 참조)
pm2 start ecosystem.config.js --only deno-sidecar
pm2 status  # deno-sidecar online 확인

# 7. Deno 사이드카 health check
curl http://localhost:9000/health  # "ok" 응답 확인
```

**환경 전제 조건**:
- WSL2 메모리: 최소 8GB, 권장 16GB (`.wslconfig` 설정)
- NVMe SSD 여유 공간: 최소 10GB
- Node.js 24 LTS (v24.x.x)
- isolated-vm 6.x (`node-gyp` 빌드 성공)
- Deno 1.46 이상
- Vercel 계정 (Hobby 무료) — L3 Stub 실험용

**메모리 예산 계산**:
```
Next.js 16 프로세스:              ~1,000MB
IsolatedVMPool (함수 5개 × 128MB): ~640MB (최대)
Deno 사이드카:                     ~400MB
SeaweedFS (별도 스파이크 환경):    미포함
PostgreSQL:                       ~256MB
PM2 daemon:                       ~50MB
────────────────────────────────────────
예상 총합:                        ~2,346MB
WSL2 16GB 여유:                   ~13,654MB (85.3%)
```

---

### 3.2 실험 1 — Layer 1 단독: decideRuntime() 단위 테스트 30 케이스

**목표**: P0~P5 모든 우선순위 경로가 명세대로 동작함을 검증한다.

**테스트 코드** (`decideRuntime.test.ts`):

```typescript
import { describe, test, expect } from 'vitest';
import { decideRuntime } from '../src/server/edge-functions/RuntimeRouter';

// 최소 EdgeFunction 픽스처
const fn = {
  id: 'test-fn-001',
  defaultTimeoutMs: 500,
  isAiGenerated: false,
  l1EscalationCount: 0,
};

describe('[P0] 보안 강제 — AI 생성 코드', () => {
  test('P0-1: isAiGenerated=true → L3 (runtimeHint 무시)', () => {
    expect(decideRuntime({ fn, isAiGenerated: true, runtimeHint: 'isolatedVm' }).layer)
      .toBe('L3_VERCEL_SANDBOX');
  });
  test('P0-2: isAiGenerated=true + runtimeHint=deno → L3', () => {
    expect(decideRuntime({ fn, isAiGenerated: true, runtimeHint: 'deno' }).layer)
      .toBe('L3_VERCEL_SANDBOX');
  });
  test('P0-3: isAiGenerated=true + hasNpmImports=true → L3', () => {
    expect(decideRuntime({ fn, isAiGenerated: true, hasNpmImports: true }).layer)
      .toBe('L3_VERCEL_SANDBOX');
  });
  test('P0-4: isAiGenerated=true + timeoutMs=10000 → L3', () => {
    expect(decideRuntime({ fn, isAiGenerated: true, timeoutMs: 10000 }).layer)
      .toBe('L3_VERCEL_SANDBOX');
  });
  test('P0-5: isAiGenerated=true + l1EscalationCount=5 → L3', () => {
    expect(decideRuntime({ fn, isAiGenerated: true, l1EscalationCount: 5 }).layer)
      .toBe('L3_VERCEL_SANDBOX');
  });
});

describe('[P1] 명시적 runtimeHint', () => {
  test('P1-1: runtimeHint=sandbox → L3', () => {
    expect(decideRuntime({ fn, runtimeHint: 'sandbox' }).layer).toBe('L3_VERCEL_SANDBOX');
  });
  test('P1-2: runtimeHint=deno → L2', () => {
    expect(decideRuntime({ fn, runtimeHint: 'deno' }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P1-3: runtimeHint=isolatedVm → L1', () => {
    expect(decideRuntime({ fn, runtimeHint: 'isolatedVm' }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P1-4: runtimeHint=auto → P2 이하 규칙 적용 (기본값 L1)', () => {
    expect(decideRuntime({ fn, runtimeHint: 'auto' }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P1-5: runtimeHint=deno + hasNpmImports=true → L2 (P1이 P2보다 우선)', () => {
    expect(decideRuntime({ fn, runtimeHint: 'deno', hasNpmImports: true }).layer)
      .toBe('L2_DENO_SIDECAR');
  });
  test('P1-6: runtimeHint=isolatedVm + hasNpmImports=true → L1 (사용자 명시 우선)', () => {
    expect(decideRuntime({ fn, runtimeHint: 'isolatedVm', hasNpmImports: true }).layer)
      .toBe('L1_ISOLATED_VM');
  });
});

describe('[P2] 기능 요구', () => {
  test('P2-1: hasNpmImports=true → L2', () => {
    expect(decideRuntime({ fn, hasNpmImports: true }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P2-2: needsExternalNetwork=true → L2', () => {
    expect(decideRuntime({ fn, needsExternalNetwork: true }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P2-3: hasNpmImports=true + needsExternalNetwork=true → L2', () => {
    expect(decideRuntime({ fn, hasNpmImports: true, needsExternalNetwork: true }).layer)
      .toBe('L2_DENO_SIDECAR');
  });
  test('P2-4: hasNpmImports=false + needsExternalNetwork=false → P3 이하 적용', () => {
    expect(decideRuntime({ fn, hasNpmImports: false, needsExternalNetwork: false }).layer)
      .toBe('L1_ISOLATED_VM');
  });
  test('P2-5: hasNpmImports=undefined → P3 이하 적용', () => {
    expect(decideRuntime({ fn }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P2-6: hasNpmImports=true + timeoutMs=100 → L2 (P2가 P3보다 우선)', () => {
    expect(decideRuntime({ fn, hasNpmImports: true, timeoutMs: 100 }).layer)
      .toBe('L2_DENO_SIDECAR');
  });
});

describe('[P3] 성능 요구 (timeout)', () => {
  test('P3-1: timeoutMs=501 → L2', () => {
    expect(decideRuntime({ fn, timeoutMs: 501 }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P3-2: timeoutMs=500 → L1 (경계값)', () => {
    expect(decideRuntime({ fn, timeoutMs: 500 }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P3-3: timeoutMs=1 → L1 (최소값)', () => {
    expect(decideRuntime({ fn, timeoutMs: 1 }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P3-4: timeoutMs=30000 → L2 (30초 장기 실행)', () => {
    expect(decideRuntime({ fn, timeoutMs: 30000 }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P3-5: timeoutMs=undefined + fn.defaultTimeoutMs=500 → L1', () => {
    expect(decideRuntime({ fn: { ...fn, defaultTimeoutMs: 500 } }).layer)
      .toBe('L1_ISOLATED_VM');
  });
});

describe('[P4] 자동 승격 (l1EscalationCount)', () => {
  test('P4-1: l1EscalationCount=3 → L2', () => {
    expect(decideRuntime({ fn, l1EscalationCount: 3 }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P4-2: l1EscalationCount=2 → L1 (임계 미달)', () => {
    expect(decideRuntime({ fn, l1EscalationCount: 2 }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P4-3: l1EscalationCount=10 → L2 (임계 초과)', () => {
    expect(decideRuntime({ fn, l1EscalationCount: 10 }).layer).toBe('L2_DENO_SIDECAR');
  });
  test('P4-4: l1EscalationCount=undefined → L1 (undefined = 0으로 처리)', () => {
    expect(decideRuntime({ fn, l1EscalationCount: undefined }).layer)
      .toBe('L1_ISOLATED_VM');
  });
});

describe('[P5] 기본값', () => {
  test('P5-1: 모든 플래그 false → L1', () => {
    expect(decideRuntime({ fn }).layer).toBe('L1_ISOLATED_VM');
  });
  test('P5-2: reason 포함 확인 → default_fast_isolation', () => {
    expect(decideRuntime({ fn }).reason).toBe('default_fast_isolation');
  });
  test('P5-3: layer별 reason 포맷 확인 (P0 케이스)', () => {
    expect(decideRuntime({ fn, isAiGenerated: true }).reason)
      .toBe('security_ai_generated_OVERRIDES_ALL');
  });
  test('P5-4: fallback 필드 존재 확인 (P0 케이스)', () => {
    expect(decideRuntime({ fn, isAiGenerated: true }).fallback)
      .toBe('L2_DENO_SIDECAR');
  });
});

// 실행: npx vitest run decideRuntime.test.ts --reporter=verbose
```

**실행 명령**:
```bash
npx vitest run decideRuntime.test.ts --reporter=verbose
# 예상 출력: 30 tests passed (또는 ≥29)
```

**예상 소요 시간**: 2시간 (코드 작성 1h + 실행·디버깅 1h)

---

### 3.3 실험 2 — Layer 1 메모리 부하: JSON 변환 + 메모리 누수 확인

**목표**: isolated-vm v6가 1MB / 10MB / 100MB JSON 페이로드를 처리할 때 메모리 누수 없이 정상 실행됨을 확인한다.

**테스트 코드** (`isolate-memory.bench.ts`):

```typescript
import ivm from 'isolated-vm';
import { performance } from 'node:perf_hooks';

interface BenchResult {
  payloadSizeMb: number;
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rssBefore: number;
  rssAfter: number;
  rssDeltaMb: number;
  success: boolean;
}

async function benchIsolateMemory(payloadSizeMb: number, iterations: number): Promise<BenchResult> {
  // RSS 측정 시작
  const rssBefore = process.memoryUsage().rss / 1024 / 1024;

  // 페이로드 생성 (JSON 배열)
  const payload = Array.from({ length: payloadSizeMb * 1000 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    value: Math.random(),
    timestamp: new Date().toISOString(),
  }));
  const payloadJson = JSON.stringify(payload);

  const latencies: number[] = [];
  let success = true;

  for (let i = 0; i < iterations; i++) {
    const isolate = new ivm.Isolate({ memoryLimit: 128 });
    const context = await isolate.createContext();

    try {
      const start = performance.now();

      // 페이로드를 Isolate 내부로 복사 후 변환
      const result = await context.evalClosure(
        `
        const data = JSON.parse($0);
        const transformed = data.map(item => ({
          ...item,
          processed: true,
          hash: item.id.toString(16),
        }));
        JSON.stringify(transformed);
        `,
        [payloadJson],
        { timeout: 5000 }
      );

      latencies.push(performance.now() - start);
    } catch (err) {
      console.error(`[실험 2] 반복 ${i + 1} 실패:`, err);
      success = false;
    } finally {
      // 반드시 dispose() 호출 (Blueprint §4.3 try-finally 패턴)
      await context.release();
      isolate.dispose();
    }
  }

  // 정렬 후 백분위 계산
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  // RSS 측정 완료
  const rssAfter = process.memoryUsage().rss / 1024 / 1024;

  return {
    payloadSizeMb,
    iterations,
    p50Ms: Math.round(p50 * 10) / 10,
    p95Ms: Math.round(p95 * 10) / 10,
    p99Ms: Math.round(p99 * 10) / 10,
    rssBefore: Math.round(rssBefore),
    rssAfter: Math.round(rssAfter),
    rssDeltaMb: Math.round((rssAfter - rssBefore) * 10) / 10,
    success,
  };
}

async function main() {
  console.log('=== 실험 2: isolated-vm v6 메모리 부하 테스트 ===\n');

  // 1MB 페이로드 × 20회
  const r1 = await benchIsolateMemory(1, 20);
  console.log('1MB 페이로드:', r1);

  // 10MB 페이로드 × 10회
  const r2 = await benchIsolateMemory(10, 10);
  console.log('10MB 페이로드:', r2);

  // 100MB 페이로드 × 3회 (memoryLimit: 128MB 경계 테스트)
  const r3 = await benchIsolateMemory(100, 3);
  console.log('100MB 페이로드 (경계 테스트):', r3);

  // 4시간 장기 누수 테스트 (선택적 — 야간 실행)
  console.log('\n4시간 누수 테스트는 야간 실행 권장:');
  console.log('  node isolate-memory-long-run.js  # 1MB × 14400회 (24회/분 × 600분)');
}

main().catch(console.error);
```

**4시간 장기 누수 테스트 스크립트**:
```bash
# 별도 파일: isolate-memory-long-run.sh
#!/bin/bash
echo "=== 4시간 메모리 누수 테스트 시작 ==="
START_RSS=$(ps aux --sort=-%mem | grep "node" | head -1 | awk '{print $6}')
echo "시작 RSS: ${START_RSS}KB"

# 10분마다 RSS 측정 (총 24회 = 4시간)
for i in $(seq 1 24); do
  sleep 600  # 10분
  RSS=$(ps aux --sort=-%mem | grep "node" | head -1 | awk '{print $6}')
  echo "[$((i * 10))분] RSS: ${RSS}KB"
done

END_RSS=$(ps aux --sort=-%mem | grep "node" | head -1 | awk '{print $6}')
DELTA=$((END_RSS - START_RSS))
echo "=== 완료: RSS 증가 = ${DELTA}KB ($((DELTA / 1024))MB) ==="
```

**성공 기준**:
- 1MB 페이로드: p95 ≤ 500ms
- 10MB 페이로드: p95 ≤ 2000ms
- 100MB 페이로드: `ivm.MemoryLimitExceededError` 또는 p95 ≤ 5000ms (한계 도달 확인)
- 4시간 후 RSS 증가 < 50MB

**예상 소요 시간**: 3시간 (코드 1h + 실행·측정 2h, 4h 장기 테스트는 야간)

---

### 3.4 실험 3 — Layer 2 사이드카 통신: HTTP IPC 지연 측정

**목표**: Deno 사이드카와 Next.js 간 HTTP localhost:9000 RPC의 실제 지연을 p50/p95/p99로 측정하고, 추가 오버헤드가 30ms 이내인지 확인한다.

**측정 절차**:

```typescript
// src/spikes/deno-ipc-bench.ts
import { performance } from 'node:perf_hooks';

// 최소 함수 — IPC 순수 오버헤드만 측정
const HELLO_WORLD_CODE = `
export default async (req: Request) => {
  return new Response(JSON.stringify({ message: "pong", ts: Date.now() }));
};
`;

async function measureIpcLatency(iterations: number) {
  const latencies: number[] = [];

  // 사전 워밍 (첫 5회 제외)
  for (let i = 0; i < 5; i++) {
    await fetch('http://localhost:9000/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fnId: 'bench-001',
        code: HELLO_WORLD_CODE,
        payload: {},
        env: {},
        timeoutMs: 5000,
      }),
    });
  }

  // 실제 측정
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    const response = await fetch('http://localhost:9000/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fnId: `bench-${i}`,
        code: HELLO_WORLD_CODE,
        payload: { iteration: i },
        env: {},
        timeoutMs: 5000,
      }),
    });

    if (!response.ok) {
      console.error(`[IPC] 반복 ${i + 1} 실패: HTTP ${response.status}`);
      continue;
    }

    latencies.push(performance.now() - start);

    // Keep-alive 유지 (Node.js 기본 활성)
    if (i % 50 === 0) {
      console.log(`진행: ${i + 1}/${iterations}`);
    }
  }

  latencies.sort((a, b) => a - b);
  return {
    iterations: latencies.length,
    p50: Math.round(latencies[Math.floor(latencies.length * 0.5)] * 10) / 10,
    p95: Math.round(latencies[Math.floor(latencies.length * 0.95)] * 10) / 10,
    p99: Math.round(latencies[Math.floor(latencies.length * 0.99)] * 10) / 10,
    min: Math.round(Math.min(...latencies) * 10) / 10,
    max: Math.round(Math.max(...latencies) * 10) / 10,
  };
}

async function main() {
  console.log('=== 실험 3: Deno 사이드카 IPC 지연 측정 ===');

  // 1. Deno 사이드카 health check
  const health = await fetch('http://localhost:9000/health');
  if (!health.ok) throw new Error('Deno 사이드카 미기동. pm2 start ecosystem.config.js 확인');

  // 2. 100회 측정
  const result = await measureIpcLatency(100);
  console.log('\nIPC 지연 측정 결과 (100회):');
  console.log(`  p50:  ${result.p50}ms`);
  console.log(`  p95:  ${result.p95}ms  ← 성공 기준: ≤ 30ms`);
  console.log(`  p99:  ${result.p99}ms`);
  console.log(`  min:  ${result.min}ms`);
  console.log(`  max:  ${result.max}ms`);

  // 3. wrk 부하 테스트 (별도 터미널)
  console.log('\nwrk 부하 테스트 명령:');
  console.log('  wrk -t2 -c10 -d30s -s deno-ipc-bench.lua http://localhost:9000/invoke');
}

main().catch(console.error);
```

**wrk Lua 스크립트** (`deno-ipc-bench.lua`):
```lua
wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"
wrk.body = '{"fnId":"wrk-bench","code":"export default async (req) => new Response(JSON.stringify({ok:true}));","payload":{},"env":{},"timeoutMs":5000}'
```

**실행 명령**:
```bash
# 터미널 1: 측정 스크립트
npx ts-node src/spikes/deno-ipc-bench.ts

# 터미널 2: wrk 부하 (동시 실행)
wrk -t2 -c10 -d30s -s deno-ipc-bench.lua http://localhost:9000/invoke

# pm2 logs 모니터링
pm2 logs deno-sidecar --lines 50
```

**예상 소요 시간**: 2시간 (환경 설정 1h + 실행·분석 1h)

---

### 3.5 실험 4 — Layer 3 Sandbox 위임: cold start + 비용 측정

**목표**: Vercel Sandbox API를 통한 함수 실행 cold start와 호출 비용을 측정하고, Phase 22 도입 타당성을 판단한다.

**참고**: Phase 19 MVP에서 L3는 `SandboxNotAvailableError`를 던지는 stub이다. 이 실험은 Phase 22 계획을 위한 선행 데이터 수집 목적이므로, 실패해도 Phase 19 진행에 영향 없다.

**측정 절차** (Vercel CLI 사용):
```bash
# 1. Vercel CLI 설치 및 로그인
npm i -g vercel
vercel login  # smartkdy7@naver.com

# 2. Sandbox 최소 함수 배포
mkdir -p /tmp/sandbox-test
cat > /tmp/sandbox-test/api/hello.js << 'EOF'
export default function handler(req, res) {
  res.status(200).json({ message: 'sandbox-pong', ts: Date.now() });
}
EOF

cd /tmp/sandbox-test
vercel deploy --prod --yes 2>&1 | tee vercel-deploy.log

# 3. cold start 측정 (배포 후 5분 대기 → cold 유도)
sleep 300
for i in $(seq 1 10); do
  time curl -s "https://sandbox-test.vercel.app/api/hello" | jq '.ts'
  sleep 5
done
```

**예상 측정값** (Blueprint §3.3 기준):
- Cold start: 150-300ms
- Warm start: 50-100ms
- 월 호출 비용 (Hobby): 무료 한도 내

**예상 소요 시간**: 2시간 (계정 설정 0.5h + 배포·측정 1h + 분석 0.5h)

---

### 3.6 실험 5 — 3층 통합 시나리오: 실제 Edge Function 3개

**목표**: 실제 Edge Function 3개를 3층에서 각각 실행하여 `decideRuntime()` → 실행 → 로그 저장 전체 플로우가 정상 동작함을 검증한다.

**테스트 함수 3개**:

**함수 1: DB CRUD (L1 예상)**
```typescript
// fn-db-crud.ts — DB 읽기 (read-only, 외부 네트워크 없음)
export default async (req: Request, ctx: { env: Record<string, string> }) => {
  // Prisma read-only proxy 시뮬레이션 (실제 DB 연결은 호스트 측)
  const items = await ctx.db.findMany({ take: 10 });
  return new Response(JSON.stringify({ count: items.length, items }));
};
// 예상 라우팅: L1 (npm 없음, 네트워크 없음, timeout=500ms)
// 예상 cold start: < 100ms
```

**함수 2: 외부 API 호출 (L2 예상)**
```typescript
// fn-external-api.ts — 외부 API 호출 (npm fetch + 외부 URL)
import { z } from 'npm:zod@3';  // npm import → L2 강제

export default async (req: Request) => {
  const schema = z.object({ url: z.string().url() });
  const { url } = schema.parse(await req.json());

  const response = await fetch(url);
  const data = await response.json();
  return new Response(JSON.stringify({ fetched: true, keys: Object.keys(data) }));
};
// 예상 라우팅: L2 (hasNpmImports=true)
// 예상 cold start: 50-100ms (Deno 사이드카)
```

**함수 3: 무거운 연산 (L1 → timeout 초과 시 L2 에스컬레이션)**
```typescript
// fn-heavy-compute.ts — CPU 집약 (소수 계산)
export default async (req: Request) => {
  const { n = 100000 } = await req.json();
  const primes: number[] = [];
  for (let i = 2; primes.length < n; i++) {
    let isPrime = true;
    for (let j = 2; j <= Math.sqrt(i); j++) {
      if (i % j === 0) { isPrime = false; break; }
    }
    if (isPrime) primes.push(i);
  }
  return new Response(JSON.stringify({ count: primes.length, last: primes[primes.length - 1] }));
};
// n=1000: L1 (fast), n=100000: timeout 초과 → L1EscalationError → L2 에스컬레이션 검증
```

**통합 테스트 실행**:
```bash
# 1. EdgeFunctionController를 통한 3개 함수 실행
npx ts-node src/spikes/integration-test.ts

# 2. 각 함수의 실행 레이어 + 지연 측정
# 예상 출력:
# fn-db-crud:        L1_ISOLATED_VM, 45ms
# fn-external-api:   L2_DENO_SIDECAR, 120ms
# fn-heavy-compute:  L1→에스컬레이션→L2_DENO_SIDECAR, 180ms

# 3. PM2 메트릭 동시 모니터링
pm2 monit
```

**예상 소요 시간**: 4시간 (함수 작성 1h + 통합 실행 2h + 분석·문서화 1h)

---

## 4. 성공 기준 (정량)

| 항목 | 성공 기준 | 측정 도구 | 비고 |
|------|----------|----------|------|
| **라우팅 정확도** | ≥ 29건 / 30건 (96.7%) | Vitest | 단위 테스트 실행 |
| **L1 cold start p95** | ≤ 100ms | `performance.now()` | 신규 Isolate 생성 100회 |
| **L1 warm start p95** | ≤ 50ms | `performance.now()` | 풀 재사용 100회 |
| **L2 사이드카 IPC p95** | ≤ 30ms | `performance.now()` + wrk | HTTP POST 왕복 순수 오버헤드 |
| **L2 cold start p95** | ≤ 200ms | `performance.now()` | Deno 사이드카 첫 실행 |
| **메모리 누수** | 4시간 후 RSS 증가 < 50MB | `process.memoryUsage()` | 야간 장기 테스트 |
| **graceful shutdown** | ≤ 100ms | `process.hrtime.bigint()` | SIGTERM 후 Isolate 해제 |
| **timeout 강제** | 100% 발동 | Vitest integration | 5s timeout 무한루프 함수 |
| **PM2 3층 동시 기동** | 총 RSS ≤ 6GB | `pm2 status` + `pm2 monit` | WSL2 16GB 기준 37.5% |
| **통합 시나리오** | 함수 3개 정상 실행 | 수동 확인 | 각 층 라우팅 정확 |

---

## 5. 실패 기준 및 대응

### 5.1 라우팅 정확도 < 90% → L1 단독 운영

**트리거**: decideRuntime() 테스트 30건 중 < 27건 통과

**의미**: 경계 케이스 처리에 버그가 있어 보안 격리가 불완전하다.

**대응 방안**:
```
즉시 조치:
  1. 실패 케이스 분석 → decideRuntime() 수정
  2. 수정 후 30 케이스 재실행

Phase 19 계획 변경:
  Option A: L1 단독 운영 (85-90% 케이스 처리)
            → Phase 19 Step 1~2만 진행 (L1 + UI)
            → L2는 EF-10~14 (Phase 19 Step 3)에서 독립 테스트 후 활성화
  Option B: decideRuntime() 단순화 (P0만 강제, 나머지는 runtimeHint)
            → 복잡도 감소 대신 자동 라우팅 포기

ADR-009 재검토 트리거:
  "Phase 19 단계적 롤아웃: Step 1 L1만 → 라우팅 버그 수정 후 Step 3"
```

### 5.2 L1 cold start > 200ms → isolated-vm v5 다운그레이드 검토

**트리거**: cold start p95 > 200ms (성공 기준 2배 초과)

**의미**: Node.js 24 LTS의 V8 변경 또는 WSL2 오버헤드가 isolated-vm v6 ABI와 충돌하거나, 추가 지연을 유발한다.

**대응 방안**:
```
즉시 조사:
  1. isolated-vm v5와 v6 cold start 비교 벤치마크
  2. WSL2 vs Linux 네이티브 cold start 비교 (VM 직접 접근 시)
  3. Node.js 22 LTS에서 동일 테스트 (v24 특이사항 배제)

결과별 대응:
  v5가 100ms 이내: v6 → v5 다운그레이드, ADR-009에 "v5 고정" 기록
  v5도 200ms 초과: WSL2 I/O 오버헤드 → IsolatedVMPool 사전 워밍 전략 검토
  Node.js 22가 100ms 이내: v24 특이사항 → v22로 고정 후 Phase 19 진행
```

### 5.3 사이드카 IPC > 100ms → Layer 2 폐기

**트리거**: HTTP IPC p95 > 100ms (성공 기준 3배 초과)

**의미**: WSL2 루프백 네트워크 스택의 지연이 Deno 사이드카를 실용 불가 수준으로 만든다.

**대응 방안**:
```
즉시 조사:
  1. Unix Domain Socket (UDS) IPC 전환 테스트
     Deno: Deno.listen({ path: "/tmp/deno-sidecar.sock" })
     Node: fetch("http://localhost:9000") → undici UnixSocket
  2. UDS p95 측정 (WSL2에서 UDS는 루프백보다 빠름)

결과별 대응:
  UDS p95 ≤ 30ms: HTTP → UDS 전환, Blueprint §11.3 업데이트
  UDS도 100ms 초과: Layer 2 폐기 → Layer 3 직접 위임 (AI 코드 → Vercel Sandbox)
  Layer 2 폐기 시: Phase 19 Step 3 (EF-10~14) 취소 + Phase 22 재고
```

### 5.4 메모리 누수 발생 → PM2 재시작 정책 강화

**트리거**: 4시간 장기 테스트 후 RSS 증가 ≥ 50MB

**의미**: Isolate.dispose() 호출 누락 또는 ExternalCopy 순환 참조로 V8 힙 누수가 발생한다.

**대응 방안**:
```
즉시 조사:
  1. Chrome DevTools V8 heap snapshot 전후 비교
  2. IsolatedVMPool.startIdleGC() 동작 확인 (30초 idle GC 발동 여부)
  3. try-finally 패턴에서 dispose() 누락 코드 점검

대응:
  패턴 버그: 수정 후 재테스트
  구조적 누수: PM2 max_memory_restart: '2G' 보강
               + Prometheus V8 heap 모니터링 경보 임계 낮춤 (2GB → 1.5GB)
```

### 5.5 PM2 3층 기동 RSS > 6GB → 아키텍처 재검토

**트리거**: 3개 프로세스 동시 기동 후 총 RSS > 6GB

**의미**: WSL2 16GB에서 안전 마진(37.5%)을 초과하여 SeaweedFS, PostgreSQL 등 다른 서비스와 메모리 경합 위험이 있다.

**대응 방안**:
```
즉시 조치:
  1. IsolatedVMPool MAX_POOL_SIZE 5 → 2로 축소 (함수당 Isolate 2개)
  2. Deno 사이드카 max_memory_restart: '300M' (400MB → 300MB 하향)
  3. Next.js 프로세스 max_memory_restart: '2G' (3G → 2G 하향)

결과별:
  축소 후 RSS ≤ 4GB: Phase 19 진행, DQ-EF-1 "함수당 2개 Isolate" 업데이트
  여전히 6GB 초과: Deno 사이드카를 동적 시작 방식으로 전환
                    (상시 기동 대신 L2 라우팅 시점에 spawn + 완료 후 kill)
```

---

## 6. 기간 및 일정

**총 기간**: 2일 (16시간) — Phase 19 EF-01 시작 전 완료 필수

| 일차 | 시간 | 실험 | 작업 내용 |
|------|------|------|----------|
| **Day 1** | 09:00~11:00 | 환경 준비 | isolated-vm v6 빌드, Deno 설치, PM2 deno-sidecar 기동 |
| **Day 1** | 11:00~13:00 | 실험 1 | decideRuntime() 30 케이스 단위 테스트 작성 + 실행 |
| **Day 1** | 14:00~17:00 | 실험 2 | JSON 부하 테스트 (1MB/10MB/100MB) + 메모리 측정 |
| **Day 1** | 17:00~18:00 | 실험 3 | Deno IPC 지연 측정 준비 + 초기 실행 |
| **Day 1** | 18:00~ | 야간 | 4시간 메모리 누수 장기 테스트 (백그라운드) |
| **Day 2** | 09:00~11:00 | 실험 3 완료 | IPC 지연 p50/p95/p99 정리 + wrk 부하 테스트 |
| **Day 2** | 11:00~13:00 | 실험 4 | Vercel Sandbox cold start 측정 |
| **Day 2** | 14:00~17:00 | 실험 5 | 3층 통합 시나리오 (함수 3개 실행 + PM2 모니터링) |
| **Day 2** | 17:00~18:00 | 결과 정리 | ADR-009 업데이트 + Phase 19 WBS 정밀화 |

---

## 7. 필요 자원

### 7.1 하드웨어

| 자원 | 최소 요구 | 권장 | 비고 |
|------|---------|------|------|
| WSL2 메모리 | 8GB | 16GB | `.wslconfig` Memory=16GB |
| 디스크 여유 | 5GB | 10GB | Deno 캐시 + isolated-vm 빌드 산출물 |
| CPU | 4코어 | 8코어 | isolated-vm 컴파일 시간 단축 |

**WSL2 설정**:
```ini
# C:\Users\smart\.wslconfig
[wsl2]
memory=16GB
processors=8
swap=4GB
```

### 7.2 소프트웨어 의존성

```bash
# Ubuntu 패키지
sudo apt-get install -y \
  python3 \          # isolated-vm node-gyp 빌드
  build-essential \  # gcc, g++, make
  g++ \             # C++17 컴파일러
  curl \            # Deno 설치
  wrk               # HTTP 부하 테스트

# Node.js 패키지
npm install isolated-vm@6
npm install -D vitest @vitest/coverage-v8
npm install -g ts-node

# Deno
curl -fsSL https://deno.land/install.sh | sh

# k6 (선택적, 추가 부하 테스트)
# https://k6.io/docs/getting-started/installation/
```

### 7.3 외부 서비스

| 서비스 | 용도 | 비용 | 필수 여부 |
|--------|------|------|----------|
| Vercel 계정 (Hobby) | L3 Sandbox 실험 | $0 | 실험 4만 (Phase 22 선행 데이터) |
| ngrok (선택) | 외부 → 로컬 Deno 사이드카 테스트 | $0 (무료 티어) | 선택 |

---

## 8. 측정 도구 정리

| 도구 | 용도 | 명령 예시 |
|------|------|----------|
| `performance.now()` (Node.js) | L1/L2 cold/warm start 지연 | `const start = performance.now(); ... ; console.log(performance.now() - start)` |
| `process.memoryUsage().rss` | Node.js 프로세스 RSS 측정 | `console.log(process.memoryUsage().rss / 1024 / 1024, 'MB')` |
| `pm2 monit` | PM2 전체 프로세스 실시간 모니터링 | `pm2 monit` |
| `pm2 status` | 프로세스 상태 + 재시작 횟수 | `pm2 status` |
| `pm2 logs [name]` | 특정 프로세스 로그 스트림 | `pm2 logs deno-sidecar --lines 100` |
| `wrk` | HTTP 부하 + 처리량/지연 측정 | `wrk -t2 -c10 -d30s http://localhost:9000/invoke` |
| `k6` | 복합 시나리오 부하 테스트 | `k6 run --vus 10 --duration 30s edge-bench.js` |
| `Vitest` | 단위 테스트 (decideRuntime 30케이스) | `npx vitest run --reporter=verbose` |
| `process.hrtime.bigint()` | 나노초 정밀 지연 측정 | `const t = process.hrtime.bigint(); ... ; console.log(Number(process.hrtime.bigint() - t) / 1e6, 'ms')` |
| Chrome DevTools / `--inspect` | V8 heap snapshot | `node --inspect isolate-memory.js` → chrome://inspect |

---

## 9. 결과 분기

### 9.1 성공 (모든 가설 충족)

**조건**: H1(≥29/30), H2(cold ≤100ms, warm ≤50ms), H3(IPC ≤30ms), H4(timeout 100%), H5(RSS ≤6GB) 모두 충족

**후속 조치**:
```
1. ADR-009 업데이트:
   "Wave 5 spike-005-deep 검증 완료 — 3층 하이브리드 운영성 확인"
   - decideRuntime() 30/30 또는 29/30 통과
   - L1 cold start p95 = [실측값]ms ← Blueprint 기준 100ms 이내
   - L2 IPC 추가 지연 p95 = [실측값]ms ← Blueprint 기준 30ms 이내

2. Phase 19 WBS 정밀화:
   - EF-02 IsolatedVMPool: Blueprint §4.3 그대로 구현 (실측 근거)
   - EF-10 Deno 사이드카: HTTP IPC keep-alive 설정 포함 (실측 근거)
   - EF-03 decideRuntime(): 30 케이스 테스트 코드를 실제 테스트로 이식

3. Blueprint §성공 기준 수치 업데이트:
   - "cold start p95 ≤ 100ms" → "cold start p95 = [실측값]ms (검증 완료)"
   - "IPC 오버헤드 ≤ 30ms" → "IPC 오버헤드 = [실측값]ms (검증 완료)"

4. docs/research/decisions/ADR-009-reinforced.md 생성 (spike 결과 인용)
```

### 9.2 부분 성공 (H1 충족, H3 실패)

**조건**: 라우팅 정확도는 충족했으나 Deno IPC 지연이 100ms를 초과하는 경우

**후속 조치**:
```
Phase 19 계획 변경:
  - Layer 1만 Phase 19에서 도입 (Step 1~2)
  - Layer 2 (Deno 사이드카) → Unix Domain Socket IPC 전환 후 재테스트
  - Layer 3 → Phase 22 그대로 유지

ADR-009에 "L2 조건부 채택" 기록:
  "L2는 HTTP IPC p95 [실측값]ms로 기준 초과.
   Unix Domain Socket 전환 실험(spike-005-deep v2.1) 후 결정"

Phase 19 WBS 수정:
  EF-10~14 (L2 사이드카) 시작 전 UDS 전환 실험 1h 추가
```

### 9.3 실패 (H1 실패 또는 H2 심각 초과)

**조건**: 라우팅 정확도 < 90% 또는 L1 cold start p95 > 300ms

**후속 조치**:
```
즉시 대응:
  1. decideRuntime() 버그 수정 (라우팅 실패)
  2. isolated-vm v5 다운그레이드 실험 (cold start 심각 초과)

Phase 19 재계획:
  - Step 1: L1 단독 (decideRuntime() 단순화 버전)
  - Step 2: 안정화 1주 후 L2 여부 결정
  - Step 3: L3는 Phase 22로 완전 이연

ADR-009 재검토:
  "Wave 5 spike-005-deep 부분 실패 — L1 단독 운영으로 Phase 19 진행
   L2/L3 재도입은 Phase 22 spike에서 결정"
```

---

## 10. kdyspike 연계

```bash
# 전체 스파이크 실행 (16시간 타임박스)
/kdyspike --full edge-functions-3-layer --max-hours 16

# 단계별 실행 (개별 실험)
/kdyspike --experiment decideRuntime-30-cases --max-hours 2
/kdyspike --experiment isolate-memory-bench --max-hours 3
/kdyspike --experiment deno-ipc-latency --max-hours 2
/kdyspike --experiment vercel-sandbox-coldstart --max-hours 2
/kdyspike --experiment integration-3-layer --max-hours 4
/kdyspike --report edge-functions-3-layer  # 결과 정리
```

---

## 11. 관련 ADR / DQ / TD

### 11.1 ADR

| ADR | 내용 | 이 스파이크와의 관계 |
|-----|------|-------------------|
| **ADR-009** | 3층 하이브리드 Edge Functions 채택 | 이 스파이크가 ADR-009의 운영성 검증 증거를 제공 |
| ADR-008 | SeaweedFS 채택 | Edge Functions → Storage L4 접근 (통합 포인트 검증) |
| ADR-013 | Vault Secret 주입 | 실험 5에서 env 주입 경로 검증 포함 |
| ADR-018 | 9-레이어 아키텍처 | L5(Compute) → L4(Storage) 접근 패턴 검증 |

### 11.2 DQ

| DQ | 질문 | 이 스파이크 기여 |
|----|------|----------------|
| **DQ-1.4** | isolated-vm이 Supabase Edge Functions 100점 동등성을 달성하는가? | H2 실험으로 "단독 불가, 3층으로 가능" 실측 확인 |
| **DQ-1.22** | Deno embed API 안정성 | H3 실험으로 사이드카 IPC 안정성 검증 |
| **DQ-1.23** | isolated-vm v6 메모리 누수 조건 | H2 실험 (4시간 장기 테스트)로 직접 검증 |
| **DQ-1.24** | decideRuntime() 우선순위 충돌 처리 | H1 실험 30 케이스로 직접 검증 |
| **DQ-EF-1** | IsolatedVMPool 함수당 5개 Isolate 근거 | H5 실험 (RSS 측정)으로 메모리 예산 실측 |

### 11.3 TD (기술 부채)

| TD | 내용 | 해소 방법 |
|----|------|----------|
| **TD-007** | isolated-vm v6 운영 부채 — 빌드 의존성(python3, build-essential) 문서화 미비 | 이 스파이크 §3.1 환경 준비 절차가 부채 해소 증거 |

---

## 12. 선행 스파이크와의 관계

### 12.1 v1 → v2 진화 경로

```
spike-005-edge-functions.md (v1, 2026-04-12)
  결론: "worker_threads + node:vm Lite 모드 → v2에서 isolated-vm 승격"
  검증: 문서 기반 이론
  한계: 실측 없음, 3층 아키텍처 개념 없음
      │
      ▼ Wave 1~4 (이론 → 청사진)
spike-005-edge-functions-deep.md (v2, 2026-04-18, 이 문서)
  목적: 3층 하이브리드 운영성 실측 검증
  검증: 코드 실행 + 지연 측정 + 메모리 추적
  출력: Phase 19 WBS 정밀화 + ADR-009 강화
```

### 12.2 스파이크 의존 관계

```
spike-001 (frontend design) ─────────────────────────┐
spike-002 (SSE + Tunnel) ──────────────────────────── │
spike-004 (shadcn/ui 호환) ──────────────────────────  │
                                                      │
spike-005-edge-functions (v1) ──── ▶ spike-005-deep (이 문서)
spike-005-sql-editor                                  │
spike-005-advisors                                    │
spike-005-schema-visualizer                           │
spike-005-data-api                                    │
                                                      │
spike-007-seaweedfs-50gb ────────── ▶ Phase 17 Storage
(병렬 스파이크)                       (Phase 19와 독립)
```

---

## 부록 A. 환경변수 (스파이크용)

```bash
# 스파이크 전용 .env.spike (커밋 금지)
SPIKE_ISOLATED_VM_MEMORY_LIMIT_MB=128
SPIKE_ISOLATED_VM_POOL_SIZE=5
SPIKE_ISOLATED_VM_IDLE_TIMEOUT_MS=30000
SPIKE_DENO_SIDECAR_PORT=9000
SPIKE_DENO_SIDECAR_HEALTH_TIMEOUT_MS=1000
SPIKE_EF_DEFAULT_TIMEOUT_MS=500
SPIKE_EF_L1_ESCALATION_THRESHOLD=3
SPIKE_VERCEL_SANDBOX_ENABLED=false  # Phase 19 MVP에서는 stub
```

## 부록 B. 빠른 참조 (Quick Reference)

```bash
# 환경 확인
node --version && deno --version && pm2 status

# 단위 테스트 실행
npx vitest run decideRuntime.test.ts --reporter=verbose

# isolated-vm 빌드 확인
node -e "const ivm = require('isolated-vm'); console.log('isolated-vm OK');"

# Deno 사이드카 상태 확인
curl http://localhost:9000/health

# PM2 메모리 모니터링
pm2 monit

# 메모리 스냅샷 실시간 확인
watch -n 5 "pm2 status"

# 4시간 누수 테스트 백그라운드 실행
nohup bash isolate-memory-long-run.sh > /tmp/spike-memory.log 2>&1 &
tail -f /tmp/spike-memory.log
```

---

> **spike-005 (심화) 끝.** Wave 5 S1 · 2026-04-18 · Phase 19 진입 전 필수 · 16h 타임박스
> 상위 문서: `02-architecture/10-edge-functions-blueprint.md` · ADR-009 · DQ-1.4
> `/kdyspike --full edge-functions-3-layer --max-hours 16`
