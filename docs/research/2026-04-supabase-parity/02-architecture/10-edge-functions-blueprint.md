# 10. Edge Functions Blueprint — 카테고리 8 (Phase 19)

> Wave 4 · Tier 2 · B3 Compute 클러스터 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B3)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [02-architecture/](./) → **이 문서**
> 연관: [01-adr-log.md](./01-adr-log.md) (ADR-009) · [00-system-overview.md](./00-system-overview.md) · [07-storage-blueprint.md](./07-storage-blueprint.md) · [../00-vision/02-functional-requirements.md](../00-vision/02-functional-requirements.md) (FR-8.1~8.4) · [../01-research/08-edge-functions/](../01-research/08-edge-functions/)

---

## 0. 문서 목적 및 범위

본 문서는 양평 부엌 서버 대시보드의 **Edge Functions 카테고리(카테고리 8)** 구현 청사진이다. Wave 1~3에서 확정된 아키텍처 결정(ADR-009: 3층 하이브리드)을 바탕으로, Phase 19에서 현재 45점을 92점으로 끌어올리는 구체적 설계를 제시한다.

**Edge Functions는 14개 카테고리 중 가장 복잡한 카테고리이며, Wave 3 리스크 TOP 1으로 지정되었다.** (`10-14-categories-priority.md §3`) isolated-vm v6 native addon + Deno 사이드카 subprocess + Vercel Sandbox 원격 위임이라는 세 런타임을 하나의 `decideRuntime()` 라우터로 결합하는 설계는 구현 복잡도가 가장 높다.

### 문서 범위

- **포함**: 3층 아키텍처 다이어그램, decideRuntime() 코드, 컴포넌트 설계, API 설계, 데이터 모델, 보안 격리, UI, 통합 포인트, 단계적 롤아웃, 리스크 완화, DQ 답변, Phase 19 WBS
- **제외**: Wave 5 대상 pg_cron Edge Functions 연동 (P2), 완전한 Deno std API 포팅

---

## 1. 요약 — 최대 복잡도 카테고리, 리스크 TOP 1

### 1.1 현재 상태 (45점)

Wave 2 D 매트릭스 기준 Edge Functions 현재 점수 45점.

| 항목 | 현황 | 갭 |
|------|------|-----|
| L1 isolated-vm v6 기본 실행 | Next.js `node:vm` 임시 구현 (비격리) | 25점 |
| L2 Deno 사이드카 실행 | 없음 | 20점 |
| L3 Vercel Sandbox 위임 | 없음 | 10점 (P2) |
| 함수 배포/버전 관리 UI | 없음 | 10점 |
| Monaco 에디터 연동 | 없음 | 5점 |
| 로그 스트림 | 없음 | 5점 |

**최대 갭 75점** 중 Phase 19에서 **47점 해소**, 나머지 28점(L3 P2, 완전한 Supabase 호환)은 Phase 22에서 처리.

### 1.2 Phase 19 목표

```
현재: 45점
↓ FR-8.1 L1 isolated-vm v6 (in-process V8 격리)        +20점
↓ FR-8.4 함수 배포/버전 관리 + Monaco 에디터              +12점
↓ FR-8.2 L2 Deno 사이드카 (npm 호환, 긴 실행)            +10점
↓ 로그 스트림 + 스케줄(Cron) 트리거                        +5점
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
목표: 92점
```

### 1.3 "경쟁이 아니라 역할 분담" — Wave 2 D Compound Knowledge

Wave 2 D 1:1 비교(`../01-research/08-edge-functions/05-isolated-vm-vs-deno-embed.md §1.2`)에서 확정된 핵심 통찰:

> "isolated-vm v6와 Deno 사이드카는 경쟁 관계가 아니다. **isolated-vm은 빠른 격리(5ms cold start)**를, **Deno는 Supabase 100% 호환성**을 담당한다. 두 기술을 `decideRuntime()` 라우터가 투명하게 선택한다."

이 원칙이 3층 하이브리드 아키텍처의 근간이다. Vercel Sandbox는 `decideRuntime()`이 "신뢰 불가 코드" 또는 "장기 실행" 플래그를 감지할 때만 선택된다(P2).

---

## 2. Wave 1-2 채택안 — 3층 역할 분담

### 2.1 Wave 1 점수 (deep-dive 결과)

| 후보 | Wave 1 점수 | 3층 역할 | 핵심 강점 | 핵심 약점 |
|------|-----------|---------|---------|---------|
| **Deno embed (edge-runtime)** | **4.22/5** | L2 (Supabase 호환) | 100% Supabase API 호환, npm: prefix | 200-400MB 상주, Docker 의존 |
| **isolated-vm v6** | **3.85/5** | L1 (빠른 격리) | 5-12ms cold start, in-process, $0 | Deno 호환 0%, shim으로 70% |
| **Vercel Sandbox** | **2.71/5** (재계산 3.55) | L3 (장기 실행) | Firecracker 완전 격리 | 외부 SaaS, 비용, 레이턴시 150-300ms |

### 2.2 Wave 2 매트릭스 재검증

Wave 2 D 매트릭스(`../01-research/08-edge-functions/04-edge-functions-matrix.md §10`) 결과:

| 차원 | L1 (isolated-vm) | L2 (Deno sidecar) | L3 (Vercel Sandbox) |
|------|-----------------|-------------------|---------------------|
| Cold Start | **1-10ms** | 50-100ms | 150-300ms |
| Supabase 호환 | △ 70% (shim) | ✅ 100% | ❌ 0% (Node) |
| RAM 추가 | **$0 (in-process)** | 200-400MB | 외부 SaaS |
| 자체호스팅 | ✅ | ✅ (subprocess) | ❌ |
| npm 패키지 | ❌ | ✅ | ✅ |
| 격리 강도 | V8 Isolate | V8 Isolate (별도 PID) | **Firecracker KVM** |
| 라이선스 | ISC | MIT | 상용 SaaS |
| 월 비용 | **$0** | **$0** | $0~5 (Hobby) |

**3층 하이브리드 통합 점수**: 4.3~4.5/5 (개별 최고점 초과)

### 2.3 ADR-009 재검토 트리거 (현재 상태)

| 트리거 조건 | 현재 상태 | 발동 여부 |
|----------|---------|---------|
| isolated-vm v6 Node 24 ABI 호환 깨짐 | 미발생 | ❌ |
| Deno 2.x Next.js 통합 공식 지원 | 미발생 | ❌ |
| Edge function invocation 월 > 10만 | 미발생 | ❌ |

→ ADR-009 현재 상태: **Accepted (유지)**

---

## 3. 3층 아키텍처 다이어그램 + decideRuntime() 구현

### 3.1 3층 아키텍처 전체 구조

```
┌────────────────────────────────────────────────────────────────────────┐
│                      클라이언트 요청                                     │
│  POST /functions/v1/{name}  또는  스케줄(Cron)  또는  Realtime 트리거    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│                  EdgeFunctionController                                  │
│  - 함수 조회 (DB)                                                        │
│  - decideRuntime() 호출                                                  │
│  - 결과 수집 + 로그 저장                                                   │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
              ┌────────────────▼────────────────────────┐
              │           RuntimeRouter                   │
              │    decideRuntime(fn, invocationCtx)       │
              └───┬──────────────┬──────────────┬────────┘
                  │              │              │
         런타임 L1    런타임 L2      런타임 L3
                  │              │              │
┌─────────────────▼─┐  ┌─────────▼──────┐  ┌──▼──────────────────┐
│  IsolatedVMPool   │  │  DenoSidecar   │  │  SandboxDelegate    │
│                   │  │                │  │                     │
│  V8 Isolate 풀    │  │  subprocess    │  │  Vercel Sandbox API │
│  (워커 5개 사전 생성) │  │  localhost:9000│  │  (외부 SaaS)        │
│                   │  │                │  │                     │
│  cold: 5-12ms     │  │  cold: 50-100ms│  │  cold: 150-300ms    │
│  mem: 64-128MB    │  │  mem: 256MB    │  │  외부 처리           │
│  Deno 호환: 70%   │  │  Deno 호환:100%│  │  완전 격리(KVM)      │
│  npm: 불가        │  │  npm: 가능     │  │  신뢰 불가 코드 OK   │
└───────────────────┘  └────────────────┘  └─────────────────────┘
         │                    │                      │
┌────────▼────────────────────▼──────────────────────▼───────────────────┐
│                       공통 인프라                                         │
│  - Storage 버킷 접근 (L4 의존, read-only proxy)                           │
│  - Vault Secret 주입 (ADR-013)                                           │
│  - Realtime 트리거 이벤트 수신 (ADR-010)                                  │
│  - EdgeFunctionRun 로그 저장 (PostgreSQL)                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 decideRuntime() — TypeScript 실제 구현

```typescript
// src/server/edge-functions/RuntimeRouter.ts

export type RuntimeLayer = 'L1_ISOLATED_VM' | 'L2_DENO_SIDECAR' | 'L3_VERCEL_SANDBOX';

export interface RuntimeDecision {
  layer: RuntimeLayer;
  reason: string;
  fallback?: RuntimeLayer;
}

export interface InvocationContext {
  /** 함수 메타데이터 */
  fn: EdgeFunction;

  /** 런타임 타입 — 함수 배포 시 사용자가 명시 또는 자동 감지 */
  runtimeHint?: 'isolatedVm' | 'deno' | 'sandbox' | 'auto';

  /** 최대 실행 시간 (ms) — 기본 500ms (L1), 30000ms (L2), 제한없음 (L3) */
  timeoutMs?: number;

  /** 네트워크 접근 필요 여부 — npm fetch, Deno.connect 등 */
  needsExternalNetwork?: boolean;

  /** npm 패키지 사용 여부 — import 구문 정적 분석 결과 */
  hasNpmImports?: boolean;

  /** AI 생성 코드 플래그 — 신뢰 불가 코드로 간주 */
  isAiGenerated?: boolean;

  /** 이전 실행에서 L1 한계 초과 횟수 (자동 승격 기준) */
  l1EscalationCount?: number;
}

/**
 * decideRuntime: 함수 속성과 실행 컨텍스트를 분석하여 최적 런타임 결정
 *
 * 우선순위 순서 (높음 → 낮음):
 *   P0 보안 강제 (isAiGenerated → L3, 모든 힌트 무시)
 *   P1 명시적 runtimeHint (사용자/관리자 지정)
 *   P2 기능 요구 (npm imports → L2, 외부 네트워크 → L2)
 *   P3 성능 요구 (timeout > 500ms → L2)
 *   P4 자동 승격 (이전 L1 에스컬레이션 >= 3회 → L2)
 *   P5 기본값 (L1)
 */
export function decideRuntime(ctx: InvocationContext): RuntimeDecision {
  const { fn, runtimeHint, timeoutMs, needsExternalNetwork,
          hasNpmImports, isAiGenerated, l1EscalationCount } = ctx;

  // ─────────────────────────────────────────────────────────
  // P0: 보안 강제 — AI 생성 코드는 반드시 L3 (Firecracker KVM)
  // 어떤 runtimeHint보다 우선 처리됨
  // ─────────────────────────────────────────────────────────
  if (isAiGenerated === true) {
    return {
      layer: 'L3_VERCEL_SANDBOX',
      reason: 'security_ai_generated_OVERRIDES_ALL',
      fallback: 'L2_DENO_SIDECAR',
    };
  }

  // ─────────────────────────────────────────────────────────
  // P1: 명시적 runtimeHint — 사용자/관리자가 함수에 런타임 지정
  // ─────────────────────────────────────────────────────────
  if (runtimeHint && runtimeHint !== 'auto') {
    if (runtimeHint === 'sandbox') {
      return {
        layer: 'L3_VERCEL_SANDBOX',
        reason: 'explicit_hint_sandbox',
        fallback: 'L2_DENO_SIDECAR',
      };
    }
    if (runtimeHint === 'deno') {
      return {
        layer: 'L2_DENO_SIDECAR',
        reason: 'explicit_hint_deno',
      };
    }
    if (runtimeHint === 'isolatedVm') {
      return {
        layer: 'L1_ISOLATED_VM',
        reason: 'explicit_hint_l1',
      };
    }
  }

  // ─────────────────────────────────────────────────────────
  // P2: 기능 요구 — npm 패키지 또는 외부 네트워크 → L2
  // ─────────────────────────────────────────────────────────
  if (hasNpmImports === true) {
    return {
      layer: 'L2_DENO_SIDECAR',
      reason: 'requires_npm_packages',
    };
  }

  if (needsExternalNetwork === true) {
    return {
      layer: 'L2_DENO_SIDECAR',
      reason: 'requires_external_network_access',
    };
  }

  // ─────────────────────────────────────────────────────────
  // P3: 성능 요구 — timeout > 500ms는 L2로
  // ─────────────────────────────────────────────────────────
  const effectiveTimeout = timeoutMs ?? fn.defaultTimeoutMs ?? 500;
  if (effectiveTimeout > 500) {
    return {
      layer: 'L2_DENO_SIDECAR',
      reason: `timeout_exceeds_l1_limit_${effectiveTimeout}ms`,
    };
  }

  // ─────────────────────────────────────────────────────────
  // P4: 자동 승격 — L1 에스컬레이션 이력 3회 초과
  // ─────────────────────────────────────────────────────────
  if ((l1EscalationCount ?? 0) >= 3) {
    return {
      layer: 'L2_DENO_SIDECAR',
      reason: `auto_escalation_l1_exceeded_${l1EscalationCount}_times`,
    };
  }

  // ─────────────────────────────────────────────────────────
  // P5: 기본값 — L1 (빠른 격리, 85-90% 케이스)
  // ─────────────────────────────────────────────────────────
  return {
    layer: 'L1_ISOLATED_VM',
    reason: 'default_fast_isolation',
  };
}

/**
 * decideRuntimeFromSource: 함수 소스 코드를 정적 분석하여 runtimeHint 자동 결정
 * ESBuild의 메타파일(imports) 분석 기반
 */
export async function decideRuntimeFromSource(
  sourceCode: string,
): Promise<Pick<InvocationContext, 'hasNpmImports' | 'needsExternalNetwork'>> {
  // npm: prefix import 정적 분석
  const hasNpmImports = /(?:from|import)\s+['"]npm:/m.test(sourceCode)
    || /require\s*\(\s*['"]npm:/m.test(sourceCode);

  // Deno.serve, Deno.connect 등 Deno API 사용 감지
  const needsDenoApi = /Deno\.(serve|connect|listen|openKv|Command)/m.test(sourceCode);

  // 외부 네트워크 접근 의도 감지 (fetch + 절대 URL)
  const needsExternalNetwork = needsDenoApi
    || /fetch\s*\(\s*['"]https?:/m.test(sourceCode);

  return { hasNpmImports, needsExternalNetwork };
}
```

### 3.3 Layer별 상세 설명

**Layer 1 — isolated-vm v6 (기본, 85-90% 케이스)**

- **격리 기술**: V8 Isolate (별도 힙, 별도 GC, prototype chain 분리)
- **콜드 스타트**: 5-12ms (Main Isolate 내부 신규 Isolate 생성)
- **메모리**: 64MB 기본, 128MB 최대 (per function)
- **허용 API**: `fetch` (화이트리스트 도메인 한정), `crypto`, `console`, Prisma read-only proxy
- **차단 API**: `fs`, `child_process`, `net`, `process`, `eval` (제거 불가 시 에러)
- **TypeScript**: ESBuild로 사전 컴파일 후 JS 실행 (snapshot 캐시)
- **보안**: vm2 Pwning 클래스 취약점 구조적 차단 (V8 수준 격리)

**Layer 2 — Deno 사이드카 (5-10% 케이스)**

- **격리 기술**: 별도 OS 프로세스 (deno subprocess) + HTTP IPC
- **콜드 스타트**: 50-100ms (subprocess 시작 + Deno 부트스트랩)
- **메모리**: 256MB 기본 상주
- **허용 API**: 전체 Deno 표준 라이브러리, npm: prefix, `fetch` (Deno --allow-net)
- **파일시스템**: `--allow-read=/var/ef/code` 만 허용
- **Supabase 호환**: 100% (supabase/edge-runtime 패턴)
- **TypeScript**: Deno 내장 TS 런타임 (esbuild 불필요)
- **통신**: HTTP localhost:9000 (IPC 오버헤드 최소화)

**Layer 3 — Vercel Sandbox 위임 (P2, < 5% 케이스)**

- **격리 기술**: Firecracker microVM (완전 가상화)
- **콜드 스타트**: 150-300ms (microVM 부트)
- **메모리**: Vercel 인프라 관리
- **사용 케이스**: AI 생성 코드, 장기 실행 (> 30초), 리소스 집약 작업
- **네트워크**: 전체 인터넷 접근 가능 (Firecracker 격리)
- **폴백**: Vercel API 장애 시 L2로 degraded mode
- **비용**: Vercel Hobby 무료 티어 내 → 월 $0~5

---

## 4. 컴포넌트 설계

### 4.1 EdgeFunctionController

**위치**: `src/server/edge-functions/EdgeFunctionController.ts`

```typescript
export class EdgeFunctionController {
  constructor(
    private readonly router: RuntimeRouter,
    private readonly db: PrismaClient,
    private readonly logger: EdgeFunctionLogger,
  ) {}

  async invoke(name: string, params: InvokeParams): Promise<InvokeResult> {
    // 1. DB에서 함수 메타데이터 조회
    const fn = await this.db.edgeFunction.findUniqueOrThrow({ where: { name } });

    // 2. 소스 정적 분석 + decideRuntime 호출
    const sourceAnalysis = await decideRuntimeFromSource(fn.activeVersion.code);
    const { layer, reason, fallback } = decideRuntime({
      fn,
      ...sourceAnalysis,
      timeoutMs: params.timeoutMs,
      isAiGenerated: fn.isAiGenerated,
      l1EscalationCount: fn.l1EscalationCount,
    });

    // 3. 실행 로그 사전 생성 (비동기 저장)
    const run = await this.logger.createRun({ fnId: fn.id, layer, reason });

    // 4. 런타임 실행
    let result: InvokeResult;
    try {
      result = await this.router.execute(layer, fn, params);
    } catch (err) {
      // L1 한계 초과 → L2 에스컬레이션
      if (layer === 'L1_ISOLATED_VM' && isL1LimitError(err)) {
        await this.db.edgeFunction.update({
          where: { id: fn.id },
          data: { l1EscalationCount: { increment: 1 } },
        });
        result = await this.router.execute('L2_DENO_SIDECAR', fn, params);
      } else if (fallback && isTransientError(err)) {
        result = await this.router.execute(fallback, fn, params);
      } else {
        throw err;
      }
    }

    // 5. 실행 로그 완료 업데이트
    await this.logger.completeRun(run.id, result);

    return result;
  }
}
```

### 4.2 RuntimeRouter

**위치**: `src/server/edge-functions/RuntimeRouter.ts`

```typescript
export class RuntimeRouter {
  constructor(
    private readonly l1Pool: IsolatedVMPool,
    private readonly l2Sidecar: DenoSidecar,
    private readonly l3Delegate: SandboxDelegate,
  ) {}

  decide(ctx: InvocationContext): RuntimeDecision {
    return decideRuntime(ctx);  // § 3.2의 순수 함수
  }

  async execute(
    layer: RuntimeLayer,
    fn: EdgeFunction,
    params: InvokeParams,
  ): Promise<InvokeResult> {
    switch (layer) {
      case 'L1_ISOLATED_VM':
        return this.l1Pool.invoke(fn, params);
      case 'L2_DENO_SIDECAR':
        return this.l2Sidecar.invoke(fn, params);
      case 'L3_VERCEL_SANDBOX':
        return this.l3Delegate.invoke(fn, params);
    }
  }
}
```

### 4.3 IsolatedVMPool — 워커 재사용

**위치**: `src/server/edge-functions/IsolatedVMPool.ts`

```typescript
import ivm from 'isolated-vm';

interface PoolEntry {
  isolate: ivm.Isolate;
  context: ivm.Context;
  fnId: string;
  lastUsed: number;
}

export class IsolatedVMPool {
  private readonly pool: Map<string, PoolEntry[]> = new Map();
  private readonly MAX_POOL_SIZE = 5;        // 함수당 최대 5개 Isolate
  private readonly IDLE_TIMEOUT_MS = 30_000; // 30초 미사용 시 해제

  async invoke(fn: EdgeFunction, params: InvokeParams): Promise<InvokeResult> {
    const entry = this.acquireIsolate(fn.id, fn.activeVersion.compiledCode);

    try {
      const context = entry.context;
      await this.injectApis(context, params.env);

      const timeoutMs = params.timeoutMs ?? fn.defaultTimeoutMs ?? 500;
      const result = await context.evalClosure(
        `(async (params) => { ${fn.activeVersion.compiledCode} \n return handler(params); })($0)`,
        [new ivm.ExternalCopy(params.payload).copyInto()],
        { timeout: timeoutMs, promise: true },
      );

      return {
        success: true,
        output: result.copy(),
        stdout: await this.collectStdout(context),
        executedLayer: 'L1_ISOLATED_VM',
      };
    } finally {
      // try-finally로 항상 풀 반환 — 메모리 누수 방지
      this.releaseIsolate(fn.id, entry);
    }
  }

  private async injectApis(context: ivm.Context, env: Record<string, string>): Promise<void> {
    // fetch 화이트리스트 주입 (호스트 측 함수를 Reference로 노출)
    const fetchRef = new ivm.Reference(async (url: string, options?: RequestInit) => {
      if (!isAllowedUrl(url)) throw new Error(`fetch blocked: ${url}`);
      const res = await fetch(url, options);
      return new ivm.ExternalCopy({ status: res.status, body: await res.text() }).copyInto();
    });
    await context.global.set('fetch', fetchRef);

    // 환경변수 주입 (Vault에서 복호화된 값만)
    await context.global.set('__env', new ivm.ExternalCopy(env).copyInto());
  }

  private acquireIsolate(fnId: string, code: string): PoolEntry {
    const entries = this.pool.get(fnId) ?? [];
    const idle = entries.find(e => !e.isInUse);
    if (idle) {
      idle.isInUse = true;
      idle.lastUsed = Date.now();
      return idle;
    }
    // 새 Isolate 생성
    const isolate = new ivm.Isolate({ memoryLimit: 128 });
    const context = isolate.createContextSync();
    const entry: PoolEntry = { isolate, context, fnId, lastUsed: Date.now(), isInUse: true };
    entries.push(entry);
    this.pool.set(fnId, entries);
    return entry;
  }

  private releaseIsolate(fnId: string, entry: PoolEntry): void {
    entry.isInUse = false;
    entry.lastUsed = Date.now();
  }

  // 주기적 풀 정리 (idle > 30초)
  startIdleGC(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [fnId, entries] of this.pool) {
        const active = entries.filter(e => e.isInUse || now - e.lastUsed < this.IDLE_TIMEOUT_MS);
        const toDispose = entries.filter(e => !e.isInUse && now - e.lastUsed >= this.IDLE_TIMEOUT_MS);
        toDispose.forEach(e => e.isolate.dispose());
        this.pool.set(fnId, active);
      }
    }, 10_000);
  }

  private async collectStdout(context: ivm.Context): Promise<string[]> {
    return []; // console.log 수집 구현은 Phase 19 Step 2에서
  }
}
```

**메모리 누수 방지 전략** (DQ-1.23 완화):
1. 각 Isolate는 `memoryLimitMb: 128` 하드 제한
2. 실행 완료 후 `releaseIsolate()`에서 반드시 풀 반환 (try-finally 패턴)
3. 30초 미사용 Isolate 자동 `dispose()`
4. 함수 배포 새 버전 시 해당 fnId 풀 전체 flush
5. PM2 메모리 모니터링: Next.js 프로세스 `max_memory_restart: '3G'`

### 4.4 DenoSidecar — subprocess 관리

**위치**: `src/server/edge-functions/DenoSidecar.ts`

```typescript
export class DenoSidecar {
  private readonly port = 9000;

  // PM2가 별도 프로세스로 관리하는 Deno 서버에 HTTP IPC
  async invoke(fn: EdgeFunction, params: InvokeParams): Promise<InvokeResult> {
    if (!(await this.isHealthy())) {
      await this.restart();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (params.timeoutMs ?? 30_000) + 1000);

    try {
      const response = await fetch(`http://localhost:${this.port}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          fnId: fn.id,
          code: fn.activeVersion.code,   // TypeScript 그대로 (Deno 내장 TS)
          payload: params.payload,
          env: params.env,
          timeoutMs: params.timeoutMs ?? 30_000,
        }),
      });

      if (!response.ok) {
        throw new DenoSidecarError(`HTTP ${response.status}: ${await response.text()}`);
      }

      return response.json() as Promise<InvokeResult>;
    } finally {
      clearTimeout(timer);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${this.port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async restart(): Promise<void> {
    // PM2 REST API를 통해 deno-sidecar 프로세스 재시작
    await pm2RestartAppViaApi('deno-sidecar');
    // 헬스체크 대기 (최대 5초)
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (await this.isHealthy()) return;
    }
    throw new Error('Deno sidecar failed to restart within 5 seconds');
  }
}
```

**Deno 사이드카 서버** (`deno-sidecar/server.ts`):

```typescript
// PM2가 관리하는 별도 Deno 프로세스
// 실행 권한: --allow-net=:9000 --allow-read=/var/ef/code --allow-env=EF_*

Deno.serve({ port: 9000 }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === '/health') {
    return new Response('ok', { status: 200 });
  }

  if (url.pathname === '/invoke' && req.method === 'POST') {
    const { fnId, code, payload, env, timeoutMs } = await req.json();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 함수 코드를 Data URL로 동적 import (Deno 샌드박스 내)
      const dataUrl = `data:application/typescript;base64,${btoa(code)}`;
      const mod = await import(dataUrl);

      // 표준 Supabase Edge Runtime 인터페이스
      const result = await mod.default(
        new Request('http://localhost/', { body: JSON.stringify(payload) }),
        { env: new Map(Object.entries(env)) }
      );

      return new Response(JSON.stringify({
        success: true,
        output: await result.json(),
        executedLayer: 'L2_DENO_SIDECAR',
      }), { status: 200 });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: String(err) }),
        { status: 500 },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return new Response('Not Found', { status: 404 });
});
```

### 4.5 SandboxDelegate — Vercel API 위임 (P2)

**위치**: `src/server/edge-functions/SandboxDelegate.ts`

```typescript
export class SandboxDelegate {
  // Phase 19 MVP: 기본 구현 + 장애 감지만
  // Phase 22 P2: 실제 Vercel Sandbox API 연동

  async invoke(fn: EdgeFunction, params: InvokeParams): Promise<InvokeResult> {
    // P2 단계에서 실제 구현
    // 현재는 명시적 에러로 폴백 트리거
    throw new SandboxNotAvailableError(
      'L3 Vercel Sandbox not yet implemented (Phase 22). Fallback to L2.',
    );
  }
}
```

---

## 5. API 설계

### 5.1 함수 실행 엔드포인트

```
POST /functions/v1/{name}
  헤더: Authorization: Bearer {jwt}
  바디: { ...params }
  응답: { output, logs, executedLayer, durationMs }

POST /api/v1/edge-functions/{name}/invoke
  (내부 관리 API — 대시보드에서 테스트 실행)
  헤더: Authorization: Bearer {jwt}
  바디: { payload, runtimeHint?, timeoutMs? }
  응답: { success, output, layer, reason, durationMs, logs }
```

### 5.2 함수 관리 API

```
GET    /api/v1/edge-functions
  응답: EdgeFunction[] (목록)

POST   /api/v1/edge-functions
  바디: { name, code, trigger, defaultTimeoutMs, runtimeHint }
  응답: EdgeFunction (생성)

GET    /api/v1/edge-functions/{name}
  응답: EdgeFunction + versions[]

PATCH  /api/v1/edge-functions/{name}
  바디: { code?, trigger?, defaultTimeoutMs?, runtimeHint? }
  응답: EdgeFunction (업데이트 + 신규 버전 생성)

DELETE /api/v1/edge-functions/{name}
  응답: 204 No Content

POST   /api/v1/edge-functions/{name}/deploy
  바디: { versionId }  — 특정 버전을 active로 설정
  응답: EdgeFunction

GET    /api/v1/edge-functions/{name}/logs
  쿼리: ?since={iso}&limit=100
  응답: EdgeFunctionRun[]
```

### 5.3 스케줄(Cron) 관리 API

```
GET    /api/v1/edge-functions/{name}/schedules
POST   /api/v1/edge-functions/{name}/schedules
  바디: { cron, timezone, enabled }  예: { cron: "0 * * * *", timezone: "Asia/Seoul" }
PATCH  /api/v1/edge-functions/{name}/schedules/{id}
DELETE /api/v1/edge-functions/{name}/schedules/{id}
```

---

## 6. 데이터 모델

### 6.1 edge_functions 테이블 (확장)

```sql
CREATE TABLE edge_functions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  description         TEXT,
  runtime_hint        TEXT NOT NULL DEFAULT 'auto',
    -- 'auto' | 'isolatedVm' | 'deno' | 'sandbox'
  default_timeout_ms  INT NOT NULL DEFAULT 500,
  is_ai_generated     BOOLEAN NOT NULL DEFAULT FALSE,
  l1_escalation_count INT NOT NULL DEFAULT 0,

  -- 활성 버전
  active_version_id   UUID,

  -- 통계
  invocation_count    BIGINT NOT NULL DEFAULT 0,
  last_invoked_at     TIMESTAMPTZ,

  owner_id            UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ef_name ON edge_functions(name);
CREATE INDEX idx_ef_owner ON edge_functions(owner_id);
```

### 6.2 edge_function_versions 테이블

```sql
CREATE TABLE edge_function_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id       UUID NOT NULL REFERENCES edge_functions(id) ON DELETE CASCADE,
  version_number    INT NOT NULL,
  code              TEXT NOT NULL,
  compiled_code     TEXT,
  code_hash         TEXT NOT NULL,
  has_npm_imports   BOOLEAN NOT NULL DEFAULT FALSE,
  needs_ext_network BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(function_id, version_number)
);

CREATE INDEX idx_efv_function ON edge_function_versions(function_id, version_number DESC);
```

### 6.3 edge_function_runs 테이블

```sql
CREATE TABLE edge_function_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id     UUID NOT NULL REFERENCES edge_functions(id),
  version_id      UUID NOT NULL REFERENCES edge_function_versions(id),
  executed_layer  TEXT NOT NULL,
    -- 'L1_ISOLATED_VM' | 'L2_DENO_SIDECAR' | 'L3_VERCEL_SANDBOX'
  runtime_reason  TEXT NOT NULL,
  status          TEXT NOT NULL,
    -- 'running' | 'success' | 'error' | 'timeout'
  duration_ms     INT,
  stdout          TEXT,
  stderr          TEXT,
  error_message   TEXT,
  trigger_type    TEXT NOT NULL,
    -- 'http' | 'cron' | 'realtime'
  invoked_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_efr_function ON edge_function_runs(function_id, created_at DESC);
CREATE INDEX idx_efr_status   ON edge_function_runs(status, created_at DESC);
CREATE INDEX idx_efr_layer    ON edge_function_runs(executed_layer, created_at DESC);
```

### 6.4 edge_function_schedules 테이블

```sql
CREATE TABLE edge_function_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id     UUID NOT NULL REFERENCES edge_functions(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'Asia/Seoul',
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_efs_function ON edge_function_schedules(function_id);
CREATE INDEX idx_efs_next_run ON edge_function_schedules(next_run_at)
  WHERE enabled = TRUE;
```

### 6.5 Prisma 스키마 (핵심 모델)

```prisma
model EdgeFunction {
  id                 String    @id @default(uuid())
  name               String    @unique
  description        String?
  runtimeHint        String    @default("auto")
  defaultTimeoutMs   Int       @default(500)
  isAiGenerated      Boolean   @default(false)
  l1EscalationCount  Int       @default(0)
  activeVersionId    String?
  invocationCount    BigInt    @default(0)
  lastInvokedAt      DateTime?
  ownerId            String?
  owner              User?     @relation(fields: [ownerId], references: [id])
  versions           EdgeFunctionVersion[]
  runs               EdgeFunctionRun[]
  schedules          EdgeFunctionSchedule[]
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@map("edge_functions")
}

model EdgeFunctionVersion {
  id              String    @id @default(uuid())
  functionId      String
  function        EdgeFunction @relation(fields: [functionId], references: [id], onDelete: Cascade)
  versionNumber   Int
  code            String
  compiledCode    String?
  codeHash        String
  hasNpmImports   Boolean   @default(false)
  needsExtNetwork Boolean   @default(false)
  createdBy       String?
  createdAt       DateTime  @default(now())

  @@unique([functionId, versionNumber])
  @@index([functionId])
  @@map("edge_function_versions")
}
```

---

## 7. 보안 격리 — Layer별 보장

### 7.1 L1 — isolated-vm v6 격리 보장

| 보안 속성 | 구현 방법 | 검증 방법 |
|---------|---------|---------|
| 메모리 격리 | `new ivm.Isolate({ memoryLimit: 128 })` | Unit: 메모리 초과 시 `ivm.MemoryLimitExceededError` |
| Global 오염 방지 | 새 Context 생성 (`isolate.createContextSync()`) | Unit: 함수 A에서 `globalThis.x = 1` → 함수 B에서 `x` 접근 불가 |
| Prototype pollution | V8 Isolate 힙 완전 분리 | Unit: `Object.prototype` 수정 → 호스트 영향 없음 |
| `fs` 차단 | Context에 `fs` Reference 미주입 | Unit: `require('fs')` → ReferenceError |
| `child_process` 차단 | Context에 `child_process` Reference 미주입 | Unit: subprocess 생성 시도 → ReferenceError |
| CPU 시간 제한 | `evalClosure({ timeout: N })` | Unit: 무한루프 → TimeoutError |

### 7.2 L2 — Deno 사이드카 격리 보장

| 보안 속성 | 구현 방법 | 검증 방법 |
|---------|---------|---------|
| 파일시스템 격리 | `--allow-read=/var/ef/code` 만 허용 | Integration: `/etc/passwd` 읽기 시도 → PermissionDenied |
| 네트워크 격리 | `--allow-net=:9000` (IPC 포트만) | Integration: 허용 않은 외부 URL → PermissionDenied |
| 환경변수 격리 | `--allow-env=EF_*` 만 허용 | Integration: `Deno.env.get('DATABASE_URL')` → undefined |
| 프로세스 격리 | 별도 OS PID — 크래시 시 PM2가 재시작 | Integration: Deno 강제 종료 후 복구 시간 < 5초 |

### 7.3 L3 — Vercel Sandbox 격리 보장 (P2)

| 보안 속성 | 구현 방법 | 비고 |
|---------|---------|------|
| 완전 격리 | Firecracker microVM (KVM 가상화) | 호스트 커널과 완전 분리 |
| 네트워크 | Vercel 관리 VPC | Firecracker 내부에서 전체 인터넷 접근 |
| 비용 제한 | 월 한도 설정 + 초과 시 L2 fallback | SandboxDelegate 월 비용 추적 |

---

## 8. UI — Functions 대시보드

### 8.1 라우트 구조

```
/dashboard/functions
├── page.tsx                          — Functions 목록
├── new/
│   └── page.tsx                      — 신규 함수 생성
└── [name]/
    ├── page.tsx                      — 함수 상세 + 편집기
    ├── logs/
    │   └── page.tsx                  — 로그 스트림
    └── schedules/
        └── page.tsx                  — Cron 스케줄 관리
```

### 8.2 /dashboard/functions — 목록

```
┌──────────────────────────────────────────────────────────────┐
│  Edge Functions                            [+ New Function]   │
├──────────────────────────────────────────────────────────────┤
│  이름          런타임   상태    호출수    마지막 실행    레이어 │
│  ─────────────────────────────────────────────────────────   │
│  hello-world   auto    Active   1,234    2026-04-18  L1 ✓    │
│  send-email    deno    Active     89     2026-04-17  L2 ✓    │
│  data-export   auto    Active      5     2026-04-10  L2      │
└──────────────────────────────────────────────────────────────┘
```

### 8.3 /dashboard/functions/[name] — Monaco 편집기

```
┌──────────────────────────────────────────────────────────────┐
│  hello-world                    [Deploy] [Test] [Delete]      │
├─────────────────────────────┬────────────────────────────────┤
│  Monaco Editor (TypeScript) │  실행 결과                      │
│                             │  Layer: L1_ISOLATED_VM         │
│  import { serve } from ...  │  Duration: 12ms                 │
│                             │  Status: success                │
│  Deno.serve((req) => {      │                                 │
│    return new Response(...)  │  Output:                        │
│  })                         │  { message: "Hello, World!" }  │
│                             │                                 │
│                             │  Console:                       │
│                             │  [LOG] Function invoked        │
└─────────────────────────────┴────────────────────────────────┘
│  런타임 힌트: [auto ▾]   타임아웃: [500 ms]   버전: v3 ▾      │
└──────────────────────────────────────────────────────────────┘
```

**Monaco 설정**:
- 언어: TypeScript (Deno globals 타입 정의 포함)
- 테마: vs-dark (ADR-003 컨벤션)
- 자동완성: `@supabase/functions-js` 타입 정의
- 저장: Ctrl+S → Draft 저장, 배포 버튼 → 신규 버전 생성

### 8.4 /dashboard/functions/[name]/logs — 로그 스트림

Server-Sent Events(SSE) 실시간 로그:

```typescript
// GET /api/v1/edge-functions/{name}/logs/stream
export async function GET(req: Request, ctx: { params: { name: string } }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 초기 배치: 최근 50건
      const recent = await db.edgeFunctionRun.findMany({
        where: { function: { name: ctx.params.name } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      for (const run of recent.reverse()) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(run)}\n\n`));
      }
      // 실시간: PostgreSQL LISTEN/NOTIFY 기반
      await listenForNewRuns(ctx.params.name, (run) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(run)}\n\n`));
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```

---

## 9. 통합 포인트

### 9.1 Storage 버킷 접근 (ADR-018 L4→L5 의존)

Edge Functions(L5 Compute)에서 Storage(L4 저장) 읽기 전용 접근:

```typescript
// L1 isolated-vm에서 Storage 접근 (read-only proxy)
const storageProxy = {
  async getFile(bucket: string, key: string): Promise<string> {
    if (!fn.allowedBuckets.includes(bucket)) {
      throw new Error(`Bucket '${bucket}' not allowed for this function`);
    }
    const data = await storageService.download(bucket, key);
    return data.toString('base64');
  },
};
const storageRef = new ivm.Reference(storageProxy.getFile);
await context.global.set('storage', new ivm.ExternalCopy({ getFile: storageRef }).copyInto());
```

### 9.2 Vault Secret 주입 (ADR-013)

함수 실행 시 등록된 환경변수를 Vault에서 복호화 후 주입:

```typescript
// EdgeFunctionController.invoke() 내부
const envSecrets = await Promise.all(
  fn.envSecretKeys.map(async (key) => {
    const secret = await vaultService.getSecret(`ef_${fn.id}_${key}`);
    return [key, secret.value] as const;
  })
);
const env = Object.fromEntries(envSecrets);
// L1: context.global.set('__env', ...) 로 주입
// L2: HTTP 페이로드의 env 필드에 포함
```

### 9.3 Realtime 트리거 연동 (ADR-010)

wal2json 이벤트 → Edge Functions 자동 트리거:

```typescript
realtimeListener.on('change', async (event: WalEvent) => {
  const triggers = await db.edgeFunctionTrigger.findMany({
    where: {
      triggerType: 'db_change',
      table: event.table,
      operation: event.op,
    },
  });

  for (const trigger of triggers) {
    await edgeFunctionController.invoke(trigger.functionName, {
      payload: { event },
      triggerType: 'realtime',
    });
  }
});
```

---

## 10. 단계적 롤아웃

### 10.1 Phase 19 롤아웃 순서

```
Step 1: L1 isolated-vm v6 단독 배포
  └── IsolatedVMPool + API 라우트 + DB 스키마
  └── decideRuntime() 기본값 L1 강제 (L2/L3 비활성)
  └── 안정화 기간: 1주
  └── 검증: Unit + Integration 테스트 + Manual QA

Step 2: L1 폴백 모드 확인
  └── L1 에스컬레이션 로직 구현 (한도 초과 감지)
  └── L2 미구현 상태에서 에스컬레이션 → 명시적 에러 응답
  └── 로그에 "L2 not available" 기록
  └── 관리자 대시보드에서 L1 에스컬레이션 통계 확인

Step 3: L2 Deno 사이드카 추가
  └── DenoSidecar + PM2 deno-sidecar 앱 추가
  └── decideRuntime()에서 L2 활성화
  └── L1 에스컬레이션 → L2 자동 라우팅 확인
  └── Integration 테스트: npm 패키지 사용 함수 정상 실행

Step 4: UI + 편집기 + 로그 스트림
  └── Monaco 에디터 + 배포 버튼
  └── SSE 로그 스트림
  └── Cron 스케줄 관리 UI
```

### 10.2 L1 단독 폴백 (L2 장애 시나리오)

```typescript
async execute(layer: RuntimeLayer, fn: EdgeFunction, params: InvokeParams): Promise<InvokeResult> {
  if (layer === 'L2_DENO_SIDECAR') {
    const healthy = await this.l2Sidecar.isHealthy();
    if (!healthy) {
      // Deno 사이드카 장애 → L1 단독 운영 (degraded mode)
      logger.warn('[RuntimeRouter] L2 unavailable, falling back to L1 (degraded mode)');

      // L1에서 실행 가능한지 재검증
      if (fn.defaultTimeoutMs > 500) {
        throw new RuntimeUnavailableError(
          'L2 required but unavailable, L1 timeout limit exceeded',
        );
      }
      return this.l1Pool.invoke(fn, params);
    }
  }
  // ... 정상 실행
}
```

**운영자 알림**: Deno 사이드카 다운 시 Prometheus 알림 + 대시보드 배너 ("Edge Functions L2 degraded mode"). L1 단독 운영 중 npm 패키지 필요 함수는 503 반환 (명시적 실패).

---

## 11. 리스크 TOP 1 완화

### 11.1 리스크 — decideRuntime() 미커버리지

| 항목 | 내용 |
|------|------|
| **리스크** | decideRuntime()이 모든 케이스를 올바르게 처리하지 못하면 잘못된 런타임 → 보안 격리 실패 |
| **확률** | 중간 (35%) |
| **영향** | 매우 높음 — 격리 실패 시 보안 사고 |
| **Wave 3 리스크 매트릭스** | `10-14-categories-priority.md §3` 리스크 점수 2/5 (최하위 = 가장 위험) |

**완화 전략 1 — 100% 커버리지 테스트**:

```typescript
// decideRuntime.test.ts
describe('decideRuntime', () => {
  // P0 보안 강제
  test('AI generated → L3 (runtimeHint 무시)', () => {
    expect(decideRuntime({ fn, isAiGenerated: true, runtimeHint: 'isolatedVm' }).layer)
      .toBe('L3_VERCEL_SANDBOX');
  });
  // P1 명시적 힌트
  test('runtimeHint sandbox → L3', () =>
    expect(decideRuntime({ fn, runtimeHint: 'sandbox' }).layer).toBe('L3_VERCEL_SANDBOX'));
  test('runtimeHint deno → L2', () =>
    expect(decideRuntime({ fn, runtimeHint: 'deno' }).layer).toBe('L2_DENO_SIDECAR'));
  // P2 기능 요구
  test('npm imports → L2', () =>
    expect(decideRuntime({ fn, hasNpmImports: true }).layer).toBe('L2_DENO_SIDECAR'));
  test('외부 네트워크 → L2', () =>
    expect(decideRuntime({ fn, needsExternalNetwork: true }).layer).toBe('L2_DENO_SIDECAR'));
  // P3 성능 요구
  test('timeout > 500ms → L2', () =>
    expect(decideRuntime({ fn, timeoutMs: 1000 }).layer).toBe('L2_DENO_SIDECAR'));
  test('timeout = 500ms → L1', () =>
    expect(decideRuntime({ fn, timeoutMs: 500 }).layer).toBe('L1_ISOLATED_VM'));
  // P4 자동 승격
  test('l1EscalationCount = 3 → L2', () =>
    expect(decideRuntime({ fn, l1EscalationCount: 3 }).layer).toBe('L2_DENO_SIDECAR'));
  test('l1EscalationCount = 2 → L1', () =>
    expect(decideRuntime({ fn, l1EscalationCount: 2 }).layer).toBe('L1_ISOLATED_VM'));
  // P5 기본값
  test('기본값 → L1', () =>
    expect(decideRuntime({ fn }).layer).toBe('L1_ISOLATED_VM'));
});
```

**완화 전략 2 — 런타임 결정 감사 로그**: 모든 `decideRuntime()` 결정을 `edge_function_runs.runtime_reason`에 기록 → 비정상 패턴 모니터링.

**완화 전략 3 — spike-005-edge-functions 심화**: isolated-vm v6 메모리 누수 + decideRuntime() 경계 케이스 실제 실행 검증.

### 11.2 리스크 — isolated-vm v6 메모리 누수

| 항목 | 내용 |
|------|------|
| **리스크** | Isolate.dispose() 호출 누락 시 V8 힙 누수. 장시간 운영 후 OOM |
| **완화** | 1. try-finally 패턴 강제 (§4.3). 2. 30초 idle GC. 3. PM2 `max_memory_restart: '3G'`. 4. Prometheus V8 heap 모니터링 |
| **정량 기준** | V8 heap 30분 연속 모니터링 시 증가율 < 5MB/h |

### 11.3 리스크 — Deno 사이드카 IPC 지연

| 항목 | 내용 |
|------|------|
| **리스크** | HTTP localhost IPC 오버헤드 50ms+ 발생 시 L2 cold start p95 > 200ms |
| **완화** | 1. HTTP keep-alive. 2. JSON 페이로드 최소화. 3. p95 > 100ms 시 Unix socket IPC 전환 검토 |
| **정량 기준** | L2 cold start p95 < 200ms, IPC 단독 오버헤드 < 30ms |

---

## 12. DQ 답변

### 12.1 DQ-1.22 — Deno embed API 안정성

> **질문**: supabase/edge-runtime (Deno embed) API가 Deno 2.x 업그레이드에서 안정성을 유지하는가?

**답변**: **조건부 안전. L2는 별도 프로세스이므로 Next.js와 직접 통합 없음. Deno 2.x ABI 변경 모니터링 필요.**

근거:
1. DenoSidecar는 `localhost:9000` HTTP IPC — Next.js 프로세스와 완전 분리 (`§4.4`)
2. supabase/edge-runtime은 Deno v1.x에서 v2.x로 API 호환성 유지 (MIT 라이선스)
3. ADR-009 재검토 트리거: "Deno 2.x에서 Next.js 통합 공식 지원 시" — 현재 미발생

**정량 기준**:
- Deno 2.x 업그레이드 후 DenoSidecar `/health` 응답 < 100ms 유지
- L2 cold start p95 < 200ms (기존 100ms 대비 여유 2배)
- 월 1회 `deno --version` + `/health` 자동 체크 스크립트 실행

### 12.2 DQ-1.23 — isolated-vm v6 메모리 누수

> **질문**: isolated-vm v6에서 메모리 누수가 발생하는 조건과 방지 방법은?

**답변**: **알려진 누수 패턴 3가지 + 방지 코드 제시.**

**패턴 1: dispose() 미호출**

```typescript
// 잘못된 예 — 예외 발생 시 dispose() 미호출로 누수
const isolate = new ivm.Isolate({ memoryLimit: 128 });
const result = await isolate.context.evalClosure(...);  // 예외 가능
isolate.dispose();  // 예외 시 실행 안 됨

// 올바른 예 (§4.3) — try-finally 보장
try {
  result = await context.evalClosure(...);
} finally {
  this.releaseIsolate(fnId, entry);  // 항상 실행
}
```

**패턴 2: ExternalCopy 순환 참조**

```typescript
// 잘못된 예
const circular: Record<string, unknown> = {};
circular.self = circular;
new ivm.ExternalCopy(circular);  // 예외 발생

// 올바른 예: structuredClone 또는 JSON 라운드트립으로 순환 제거
const safe = JSON.parse(JSON.stringify(payload));
new ivm.ExternalCopy(safe).copyInto();
```

**패턴 3: Reference 미해제 (긴 수명 Isolate에서)**

- Isolate 해제 전 모든 Reference null 처리
- 풀 GC 시 `entry.isolate.dispose()` 후 `entry = null` (참조 끊기)

**정량 기준**: V8 heap 30분 모니터링 증가율 < 5MB/h. Prometheus `nodejs_heap_size_used_bytes` 그래프.

### 12.3 DQ-1.24 — decideRuntime() 판정 로직 명확화

> **질문**: decideRuntime()의 우선순위 충돌 시 판정 기준은?

**답변**: **보안 규칙(P0)이 명시적 힌트(P1)보다 항상 우선. § 3.2 우선순위 테이블이 단일 소스.**

핵심 원칙:
- `isAiGenerated = true` → 어떤 설정보다 L3 강제 (보안 절충 불가)
- `runtimeHint` 충돌(예: 'isolatedVm' + `hasNpmImports: true`) → runtimeHint가 P1으로 우선 (사용자가 의도적으로 지정했으므로)
- `hasNpmImports + timeoutMs <= 500` → npm imports가 우선하므로 L2

**정량 기준**:
- Unit 테스트 100% 라인 커버리지
- AI 생성 코드가 L1/L2로 라우팅되는 케이스: `ef_ai_non_l3_count = 0` (Prometheus)

### 12.4 DQ-EF-1 — IsolatedVMPool 풀 크기 최적화

> **질문**: 함수당 5개 Isolate 제한의 근거와 동시 요청 급증 대응 방법?

**답변**: **WSL2 RAM 예산 계산 결과 5개 = 안전 마진 내. 급증 시 임시 확장.**

계산:
- 활성 함수 최대 20개 × 5 Isolate × 128MB = 12.8GB (이론 최대)
- 실제: idle GC로 대부분 해제, 평균 1-2개 Isolate 활성
- WSL2 16GB - SeaweedFS 2GB - Deno 400MB - Next.js 1GB = 여유 12.6GB → 안전

급증 시 대응:
1. 풀 만원(5개) → 100ms 대기
2. 100ms 내 미확보 → 임시 신규 Isolate 생성 (풀 크기 임시 초과)
3. 완료 후 idle GC로 정리

**정량 기준**: 동시 요청 50개 p99 대기 < 200ms. `ef_pool_exhausted_total > 10/min` → Prometheus 알림.

---

## 13. Phase 19 WBS (공수 ~40h)

### 13.1 작업 분해 — 3층 단계

**Step 1: L1 기반 (15h)**

| 작업 ID | 작업명 | 공수 | 선행 | 산출물 |
|---------|-------|-----|------|-------|
| EF-01 | Prisma 스키마 마이그레이션 (4 테이블) | 2h | — | migrate 완료 |
| EF-02 | IsolatedVMPool (풀 관리 + injectApis) | 4h | EF-01 | Unit 테스트 통과 |
| EF-03 | decideRuntime() 순수 함수 + 100% 테스트 | 3h | — | 커버리지 100% |
| EF-04 | EdgeFunctionController + RuntimeRouter (L1만) | 3h | EF-02,03 | Integration 테스트 |
| EF-05 | API 라우트 /functions/v1/{name} + 관리 API | 3h | EF-04 | API 동작 확인 |

**Step 2: L1 안정화 + UI (12h)**

| 작업 ID | 작업명 | 공수 | 선행 | 산출물 |
|---------|-------|-----|------|-------|
| EF-06 | UI: Functions 목록 + 신규 생성 | 3h | EF-05 | Manual QA |
| EF-07 | UI: Monaco 에디터 + 배포 버튼 + 버전 관리 | 4h | EF-06 | Manual QA |
| EF-08 | UI: 로그 스트림 (SSE) | 2h | EF-07 | 실시간 로그 확인 |
| EF-09 | Cron 스케줄 관리 (node-cron 연동) | 3h | EF-05 | 스케줄 실행 확인 |

**Step 3: L2 Deno 사이드카 (13h)**

| 작업 ID | 작업명 | 공수 | 선행 | 산출물 |
|---------|-------|-----|------|-------|
| EF-10 | Deno 사이드카 서버 (server.ts) | 4h | — | Health check 통과 |
| EF-11 | PM2 deno-sidecar 앱 설정 | 1h | EF-10 | PM2 기동 확인 |
| EF-12 | DenoSidecar 클라이언트 + HTTP IPC | 3h | EF-11 | Integration 테스트 |
| EF-13 | decideRuntime() L2 활성화 + L1→L2 에스컬레이션 | 2h | EF-12,04 | 자동 승격 테스트 |
| EF-14 | Storage 접근 + Vault Secret 주입 + Realtime 트리거 | 3h | EF-13 | Integration 테스트 |

**총 공수**: 40h

### 13.2 마일스톤

| 마일스톤 | 완료 기준 | 예상 시점 |
|---------|---------|---------|
| M19-1 (L1 기반) | isolated-vm v6 HTTP 실행 + decideRuntime() 100% 테스트 | EF-01~05 완료 |
| M19-2 (UI) | Monaco 편집기 + 배포 + 로그 스트림 | EF-06~09 완료 |
| M19-3 (L2) | Deno 사이드카 + 자동 에스컬레이션 | EF-10~14 완료 |

### 13.3 완료 기준 (Phase 19 Edge Functions 92점)

- [ ] L1 cold start p95 < 100ms, warm p95 < 20ms
- [ ] decideRuntime() Unit 테스트 100% 라인 커버리지
- [ ] L1 → L2 에스컬레이션 자동 전환 Integration 테스트 통과
- [ ] L2 npm 패키지 사용 함수 정상 실행 (zod 등)
- [ ] Monaco 편집기 + 배포 버튼 Manual QA 통과
- [ ] SSE 로그 스트림 실시간 표시 확인
- [ ] Cron 스케줄 node-cron 연동 동작 확인
- [ ] Storage 버킷 read-only 접근 Integration 테스트
- [ ] Vault Secret 주입 → 함수 내 `__env` 접근 확인
- [ ] IsolatedVMPool idle GC 30초 동작 확인
- [ ] PM2 deno-sidecar autorestart 설정 확인
- [ ] AI 생성 코드 L3 강제 라우팅 테스트 (L1/L2 우회 불가 확인)

---

## 부록 A. PM2 ecosystem.config.js 추가 설정

```javascript
// ecosystem.config.js에 추가
{
  name: 'deno-sidecar',
  script: '/usr/local/bin/deno',
  args: [
    'run',
    '--allow-net=:9000',
    '--allow-read=/var/ef/code',
    '--allow-env=EF_*',
    '/opt/luckystyle4u/deno-sidecar/server.ts',
  ],
  interpreter: 'none',
  autorestart: true,
  watch: false,
  max_memory_restart: '512M',
  env: {
    DENO_DIR: '/var/cache/deno',
    EF_LOG_LEVEL: 'info',
  },
},
```

## 부록 B. next.config.ts 추가 설정

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: [
    'isolated-vm',   // V8 native addon — webpack 번들 제외 필수
    'better-sqlite3',
    '@aws-sdk/client-s3',
  ],
  // isolated-vm 사용 시 Node 20+ 필수 플래그:
  // PM2 ecosystem.config.js에서 node_args: '--no-node-snapshot' 추가 필요
};
```

## 부록 C. 환경변수 목록

```bash
# isolated-vm 설정
ISOLATED_VM_MEMORY_LIMIT_MB=128
ISOLATED_VM_POOL_SIZE=5
ISOLATED_VM_IDLE_TIMEOUT_MS=30000

# Deno 사이드카
DENO_SIDECAR_PORT=9000
DENO_SIDECAR_HEALTH_TIMEOUT_MS=1000
DENO_SIDECAR_RESTART_MAX_WAIT_MS=5000

# Edge Functions 일반
EF_DEFAULT_TIMEOUT_MS=500
EF_L1_ESCALATION_THRESHOLD=3
EF_LOG_RETENTION_HOURS=24
EF_ALLOWED_FETCH_DOMAINS=api.example.com,hooks.example.com

# Vercel Sandbox (P2 — Vault에서 런타임 조회)
# VERCEL_SANDBOX_API_KEY → Vault Secret으로 저장
# VERCEL_SANDBOX_TEAM_ID → Vault Secret으로 저장
```

---

> **Edge Functions Blueprint 끝.** Wave 4 · B3 · 2026-04-18 · 카테고리 8 · Phase 19 · 목표 92점 · 공수 40h · 리스크 TOP 1
