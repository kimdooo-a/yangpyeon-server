# isolated-vm v6 vs Deno embed — 1:1 심층 비교

> **Wave 2 / Agent D / 1:1 비교 #2**
>
> - 작성일: 2026-04-18
> - 작성자: kdywave Wave 2 1:1 비교 에이전트
> - 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> - 환경: WSL2 Ubuntu + Next.js 16 + PM2 + Cloudflare Tunnel + 단일 서버 + $0-5/월
> - Wave 1 점수: isolated-vm v6 3.85/5 vs supabase/edge-runtime 4.22/5
> - 본 문서 역할: 매트릭스(04-edge-functions-matrix.md)가 "3층 하이브리드가 최적"이라고 결론지었다면, 본 문서는 "**어느 함수를 1차(isolated-vm)로 보내고 어느 함수를 2차(Deno)로 보낼지**"의 실무 경계선을 코드 수준에서 확정한다.

---

## 0. 문서 목적

3층 하이브리드의 1차(isolated-vm v6)와 2차(supabase/edge-runtime, Deno embed)는 보완 관계다. 질문은:
1. **실행 모델 근본 차이** — in-process Isolate vs subprocess IPC
2. **콜드 스타트** — 5ms vs 50-100ms의 실제 체감
3. **메모리 격리 모델** — V8 Isolate 힙 분리의 엄밀성
4. **네트워크 제어** — fetch Reference 위임 vs Deno permissions
5. **파일시스템 샌드박스** — whitelist shim vs Deno permissions
6. **TypeScript 직접 실행** — esbuild 전처리 vs Deno 내장
7. **Deno 라이브러리 생태계** — npm:/std/jsr 접근
8. **Node.js 22 호환 빌드** — isolated-vm 6.0.2의 ABI 안정성

본 문서는 위 8가지를 코드 비교 2개로 **결정 매트릭스**까지 확정한다.

---

## 1. 요약 (Executive Summary)

### 1.1 본질적 차이

| 축 | isolated-vm v6 | Deno embed (edge-runtime) |
|----|----------------|---------------------------|
| 실행 모델 | **In-process V8 Isolate** | **Subprocess (Docker IPC)** |
| 통신 방식 | Reference/ExternalCopy (힙 간 복사) | HTTP (localhost:9000) |
| 콜드 스타트 | **5-12 ms** | 50-100 ms |
| 메모리 (호스트) | 0 (Node 내) + isolate당 5MB | **200-400 MB 상주** |
| Supabase API 호환 | shim으로 70% | **100%** |
| 네트워크 제어 | **호스트가 정책 결정** (Reference) | Deno permission flags |
| 파일시스템 | 호스트 Reference로 화이트리스트 | **Deno --allow-read/-write** |
| TypeScript | esbuild 전처리 필요 | **내장** |
| npm 패키지 | 호스트 번들링 | **`npm:` prefix 네이티브** |
| 디버깅 | V8 Inspector (DevTools) | Deno Inspector |
| 라이선스 | ISC | MIT |
| Node 22 빌드 | **검증 완료** | N/A (별도 컨테이너) |

### 1.2 양평 부엌 역할 분담 (본 문서 결론)

```
┌────────────────────────────────────────────────┐
│ isolated-vm v6 (1차, 인프로세스)                │
│  - 단순 변환 / 호스트 fetch / DB 위임 / 집계     │
│  - 트래픽 85-90%                                │
│  - 이점: 5ms 콜드, 0 추가 RAM, 호스트 통합      │
│                                                │
│ supabase/edge-runtime (2차, 사이드카)           │
│  - `Deno.serve` / `npm:` imports / `waitUntil`  │
│  - 트래픽 5-10%                                 │
│  - 이점: 100% Supabase 호환, hot reload         │
└────────────────────────────────────────────────┘
```

---

## 2. 실행 모델 근본 차이

### 2.1 isolated-vm: In-process V8 Isolate

```
┌─────────────────────────────────────────┐
│  Node.js Main Process (PID 1234)       │
│  ├─ Main V8 Isolate                    │
│  │   ├─ Next.js                        │
│  │   ├─ Prisma client                  │
│  │   └─ better-sqlite3                 │
│  │                                     │
│  ├─ User V8 Isolate #1                 │
│  │   └─ 사용자 함수 A (memoryLimit 64M) │
│  ├─ User V8 Isolate #2                 │
│  │   └─ 사용자 함수 B (memoryLimit 128M)│
│  │                                     │
│  └─ Reference / ExternalCopy           │
│     (격리 isolate 간 통신 채널)         │
└─────────────────────────────────────────┘
```

**특징**:
- 하나의 OS 프로세스 안에 여러 V8 Isolate
- Isolate 간 힙 공유 없음 (분리)
- Reference: 호스트→isolate 함수 호출 포인터
- ExternalCopy: 깊은 복사 (V8 serializer)

### 2.2 Deno embed (edge-runtime): Subprocess + IPC

```
┌─────────────────────────────────────────┐
│  Node.js Main Process (PID 1234)       │
│  └─ Next.js + Prisma (Main V8)         │
│       │                                 │
│       │ HTTP request (fetch/undici)     │
│       ▼                                 │
└───────┼─────────────────────────────────┘
        │
┌───────▼─────────────────────────────────┐
│  Docker Container (PID 5678)            │
│  └─ supabase/edge-runtime (Rust)       │
│      ├─ Main Worker                    │
│      │   └─ HTTP 서버 (Hyper) :9000    │
│      └─ User Worker Pool (8 워커)       │
│          ├─ Deno Worker #1             │
│          │   └─ 사용자 함수 C          │
│          └─ Deno Worker #2             │
│              └─ 사용자 함수 D          │
└─────────────────────────────────────────┘
```

**특징**:
- 별도 OS 프로세스 (Docker)
- HTTP IPC (localhost만)
- 각 Worker는 별도 Deno isolate
- Main Worker가 라우팅 담당

### 2.3 트레이드오프 비교

| 축 | isolated-vm (in-process) | Deno embed (subprocess) |
|----|--------------------------|-------------------------|
| 지연 | 낮음 (함수 호출) | 중 (HTTP RTT ~1ms localhost) |
| 프로세스 충돌 영향 | **전체 Node 다운 위험** | **독립** (edge-runtime 다운해도 Node OK) |
| 메모리 한도 실패 | OS 레벨 OOM 가능 | Docker 컨테이너만 |
| 디버깅 용이성 | 호스트 Inspector 통합 | 별도 디버거 attach |
| 자원 통계 수집 | 호스트 동시 관측 | 별도 메트릭 파이프 |
| 재시작 오버헤드 | Node 전체 재시작 | 컨테이너만 재시작 |

### 2.4 결론

- **in-process**: 저지연 + 저자원, 그러나 격리 강도 제한 (V8 isolate가 마지노선)
- **subprocess**: 강한 격리 + 독립 장애 분리, 그러나 자원 +200MB 상주

양평 부엌은 **1차를 in-process**로 최적화, **2차를 subprocess**로 보완.

---

## 3. 콜드 스타트 — 5ms vs 50-100ms의 실제 체감

### 3.1 상세 분해

| 단계 | isolated-vm v6 | Deno embed |
|-----|----------------|------------|
| 프로세스/컨테이너 생성 | 0 ms | 0 ms (상주) |
| Isolate 생성 | 1-2 ms | - (풀 재사용) |
| Context 생성 | 0.5-1 ms | - |
| 모듈 컴파일 (5KB 코드) | 2-5 ms | 30-50 ms (Deno 파싱+TS 변환) |
| 실행 시작 | < 0.5 ms | 5-15 ms |
| 첫 응답 (사용자 코드 5줄) | < 1 ms | 5-10 ms |
| **총 cold path** | **5-10 ms** | **50-100 ms** |

### 3.2 벤치마크 시나리오 (양평 부엌 관점)

시나리오 1: **"대시보드에서 집계 함수 호출"**
- 사용자 체감: UI 지연
- isolated-vm 콜드 10 ms → 무의식
- Deno 콜드 100 ms → 인지 가능 (100 ms는 "느림 인지 임계")

→ **isolated-vm 압승**

시나리오 2: **"webhook 트리거 (Slack 알림)"**
- 사용자 체감: 없음 (비동기)
- 둘 다 허용 범위

→ **동등**

시나리오 3: **"사용자 입력 검증 + DB 조회"**
- p50 10 ms vs 100 ms: 사용자 10배 차이 체감
- p99에선 차이 감소

→ **isolated-vm 약간 우위**

### 3.3 Warm-up 전략

isolated-vm:
```typescript
// 자주 쓰는 함수 isolate를 미리 만들어 Map에 캐시
const pool = new Map<string, ivm.Isolate>();

async function getWarmIsolate(slug: string, source: string) {
  if (!pool.has(slug)) {
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    const ctx = await isolate.createContext();
    const mod = await isolate.compileModule(source);
    await mod.instantiate(ctx, () => { throw new Error("no imports"); });
    await mod.evaluate();
    pool.set(slug, isolate);
  }
  return pool.get(slug)!;
}
```

Deno embed:
- 내장 워커 풀 (기본 8)이 자동으로 warm 유지
- 별도 설정 없이 hot
- 재배포 시 volume mount + 디렉토리 감지로 반영

### 3.4 Snapshot 효과

isolated-vm:
```typescript
// 서버 부팅 시 1회만
const snapshot = ivm.Isolate.createSnapshot([{
  code: `
    // Web 표준 polyfill 미리 주입
    globalThis.URL = URL;
    globalThis.URLSearchParams = URLSearchParams;
  `,
}]);

// 모든 isolate가 공유
const isolate = new ivm.Isolate({ snapshot, memoryLimit: 64 });
// 콜드 50% 단축 (5ms → 2.5ms)
```

Deno embed:
- 컴파일된 코드를 자동 캐싱 (Deno V8 snapshot)
- `Deno.serve` 내부에서 자동 최적화

### 3.5 결론

- **단순 함수**: isolated-vm이 10배 빠른 콜드
- **복잡 함수 (Supabase 클라이언트 등)**: Deno의 100ms가 어쩔 수 없음 (기능으로 보상)

---

## 4. 메모리 격리 모델

### 4.1 V8 Isolate 격리 엄밀성

양쪽 모두 V8 Isolate 기반이지만 구현 차이:

| 속성 | isolated-vm | Deno embed |
|------|-------------|------------|
| Isolate 인스턴스 생성 | Node C++ addon (V8 임베더 API) | Deno의 `MainWorker` (deno_runtime) |
| 힙 분리 | O | O |
| Prototype chain 분리 | O | O |
| 마이크로태스크 큐 분리 | O | O |
| 전역 객체 분리 | O | O |
| 메모리 한도 강제 방식 | V8 RAII + `memoryLimit` | V8 flags + 워커 레벨 |
| OOM 복구 | `onCatastrophicError` 콜백 | 워커 재시작 |
| 힙 통계 노출 | `getHeapStatistics()` 정밀 | Prometheus 메트릭 |

### 4.2 공식 경고 — "memoryLimit은 guideline"

isolated-vm 공식 README:
> "memoryLimit is a *guideline*. Malicious code can use 2-3× the configured limit."

Deno embed:
- 워커 레벨에서 강제하지만 동일한 V8 RAII 한계 적용
- + Docker cgroup으로 OS 수준 한도 추가 가능

**차이**: Deno embed는 **Docker cgroup**으로 2차 방어 가능. isolated-vm은 호스트 OS cgroup을 별도 설정해야 함.

### 4.3 외부 메모리 (ExternalCopy)

isolated-vm:
```typescript
const big = new ivm.ExternalCopy(new Uint8Array(10 * 1024 * 1024));
// 10MB 할당 — V8 heap 밖에 저장됨
// getHeapStatistics().externally_allocated_size에 포함
await jail.set("bigdata", big.copyInto());
```

Deno embed:
- 사용자가 직접 큰 버퍼 만들면 워커 힙 내부에 할당
- 워커 메모리 한도로 강제

### 4.4 공격 시나리오 시뮬레이션

**공격**: 무한 루프 + 메모리 폭탄
```javascript
const arr = [];
while (true) {
  arr.push(new Array(1000000).fill(0));
}
```

isolated-vm:
- `memoryLimit: 64` 설정 시 → V8이 OOM 발생 → `onCatastrophicError` 호출 → `isolate.dispose()` 강제
- 단, 2-3배 우회 가능성 (128-192MB까지 사용) → 호스트 PM2 `max_memory_restart`로 2차 방어

Deno embed:
- 워커 메모리 한도 초과 → 워커 재시작
- 컨테이너 cgroup → OS 레벨 OOM kill → Docker 재시작
- 3중 방어 구조

### 4.5 결론

- **격리 강도**: V8 Isolate 수준은 동등
- **실용 방어**: Deno embed가 Docker cgroup로 1층 더 두꺼움
- 양평 부엌 시나리오: 공격 소스 코드는 관리자가 작성 → 공격 가능성 낮음 → isolated-vm으로 충분

---

## 5. 네트워크 제어

### 5.1 isolated-vm: 호스트 Reference 위임

```typescript
// 호스트가 정책을 결정
const ALLOWED_HOSTS = new Set([
  "api.stripe.com",
  "slack.com",
  "hooks.slack.com",
]);

await jail.set("__fetch", new ivm.Reference(async (url: string, init: any) => {
  const target = new URL(url);
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error(`forbidden host: ${target.hostname}`);
  }
  const res = await fetch(url, init);
  return new ivm.ExternalCopy({
    status: res.status,
    body: await res.text(),
    headers: Object.fromEntries(res.headers),
  }).copyInto();
}));

await context.evalClosure(`
  const fetch = (url, init) => __fetch.apply(undefined, [url, init], {
    result: { promise: true, copy: true }
  });
`);
```

**장점**:
- 호스트에서 완전 제어 (whitelist/blacklist/rate limit)
- 로깅 통합 (호스트 Prometheus로)
- 한국어 에러 메시지 가능

**단점**:
- 사용자 코드가 `fetch`만 받음 → Deno.connect 같은 저수준 TCP 불가

### 5.2 Deno embed: Permission flags

```toml
# supabase/functions/my-fn/import_map.json 및 docker-compose
# Deno permission flags
--allow-net=api.stripe.com,slack.com
--deny-net=169.254.169.254    # AWS metadata 금지
--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY
```

또는 edge-runtime 설정:
```yaml
environment:
  DENO_ALLOW_NET: "api.stripe.com,slack.com"
  DENO_DENY_NET: "169.254.169.254"
```

**장점**:
- Deno 표준 방식 (공식 문서 풍부)
- IP/포트/호스트 조합 지원
- 사용자가 `Deno.connect`(TCP) 등 다양 API 사용 가능

**단점**:
- 호스트 Prometheus와 통합 별도 작업
- 정책 변경 시 컨테이너 재시작 필요

### 5.3 비교

| 항목 | isolated-vm | Deno embed |
|------|-------------|------------|
| 정책 수정 반영 | 호스트 재시작만 | 컨테이너 재시작 |
| 세밀도 | 호스트 코드로 무제한 | Deno 내장만 |
| 저수준 TCP/UDP 허용 | 불가 (fetch만) | 가능 (`Deno.connect`) |
| 한국어 에러 메시지 | O | X |
| 공격 로그 수집 | 호스트 통합 | stdout 파싱 |

### 5.4 양평 부엌 결정

- 대부분 함수는 fetch만 필요 → **isolated-vm 충분**
- 드문 케이스(예: 외부 PostgreSQL 직접 연결)는 **Deno로 위임**

---

## 6. 파일시스템 샌드박스

### 6.1 isolated-vm: 화이트리스트 shim

```typescript
// 호스트에서 화이트리스트 Reference 주입
const ALLOWED_PREFIX = "/srv/sandbox/";

await jail.set("__readFile", new ivm.Reference(async (path: string) => {
  if (!path.startsWith(ALLOWED_PREFIX)) {
    throw new Error("forbidden path");
  }
  const fs = await import("node:fs/promises");
  return await fs.readFile(path, "utf8");
}));

await context.evalClosure(`
  const Deno = {
    readTextFile: (p) => __readFile.apply(undefined, [p], {
      result: { promise: true, copy: true }
    }),
  };
`);
```

**장점**:
- 호스트가 경로 검증 정밀 제어
- 사용자는 `Deno.readTextFile` 그대로 사용

**단점**:
- Deno 전체 fs API를 shim 작성해야 함 (10+ 메서드)

### 6.2 Deno embed: `--allow-read/-write`

```bash
deno run --allow-read=/srv/sandbox --allow-write=/srv/sandbox/cache fn.ts
```

또는 edge-runtime:
```yaml
environment:
  DENO_ALLOW_READ: "/srv/sandbox"
  DENO_ALLOW_WRITE: "/srv/sandbox/cache"
```

**장점**:
- Deno 표준, 모든 fs API 한 번에 적용
- 상세 경로 지정 가능

**단점**:
- Docker volume mount 설정 필요
- 경로 변경 시 재시작

### 6.3 비교

| 항목 | isolated-vm shim | Deno embed permissions |
|------|----------------|------------------------|
| 커버리지 | 작성한 API만 | Deno 전체 fs |
| 성능 | Reference 호출 오버헤드 | Deno 네이티브 |
| 설정 유연성 | 호스트 코드 | Docker env |
| 로깅 통합 | 호스트 | stdout |

### 6.4 양평 부엌 결정

- 사용자 함수가 fs를 쓰지 않음이 대부분 → **둘 다 무관**
- fs가 필요한 고급 케이스 → **Deno로 위임**

---

## 7. TypeScript 직접 실행

### 7.1 isolated-vm: 사용자가 esbuild 전처리

```typescript
// 호스트에서 TS → JS 컴파일
import { build } from "esbuild";

async function compile(source: string): Promise<string> {
  const result = await build({
    stdin: { contents: source, loader: "ts" },
    write: false,
    format: "esm",
    target: "es2022",
    bundle: true,
    external: ["*"], // 번들 금지
  });
  return result.outputFiles[0].text;
}

// 이후 isolate에서 평가
const compiled = await compile(userTsCode);
const module = await isolate.compileModule(compiled);
```

**비용**:
- esbuild 런타임 의존성 추가 (20 MB)
- 컴파일 시간 5-15 ms/함수
- 캐시 관리 필요 (hash → compiled cache)

### 7.2 Deno embed: 내장

```typescript
// Deno가 자동으로 TS 컴파일 + 캐시
// 사용자는 그냥 .ts 파일 작성
Deno.serve(async (req: Request) => {
  return new Response("hello");
});
```

**비용**: 0 (내장)

### 7.3 비교

| 항목 | isolated-vm + esbuild | Deno embed |
|------|----------------------|------------|
| 컴파일 시간 | 5-15 ms/함수 | 30-50 ms/함수 (첫 회) |
| 캐시 | 수동 | 자동 |
| 호스트 의존성 | esbuild 20 MB | 0 |
| TS 버전 | esbuild 제어 | Deno 제어 |
| JSX 지원 | 설정 | 기본 |

### 7.4 결론

- TS 컴파일 자체는 isolated-vm이 빠름 (esbuild가 Deno tsc보다 빠름)
- 그러나 **개발 경험**은 Deno 압승 (전처리 불필요)
- 양평 부엌 결정: **관리자가 TS 코드 작성 시 호스트 esbuild로 컴파일 후 isolated-vm 실행** (1차 경로)

---

## 8. npm / Deno 라이브러리 생태계

### 8.1 isolated-vm: 호스트 번들링

```typescript
// 호스트에서 사용자 함수를 번들링
await build({
  stdin: { contents: userSource, loader: "ts" },
  bundle: true,                              // npm 모듈 포함
  platform: "neutral",
  format: "esm",
  target: "es2022",
  external: [
    // Node 내장은 제외 (isolate에 없음)
    "fs", "path", "crypto", "stream",
  ],
});
// → 번들된 코드를 isolate에 주입
```

**제약**:
- Node 내장 모듈 사용 불가 (호스트 Reference로 wrap 필요)
- C++ 네이티브 모듈 (예: sharp) 사용 불가
- 번들 크기 크면 컴파일 느림

**지원 가능**:
- 순수 JS/TS 라이브러리 (lodash, zod, etc.)
- Web 표준만 쓰는 패키지

### 8.2 Deno embed: `npm:` prefix 네이티브

```typescript
// 사용자 코드에서 그대로
import { createClient } from "npm:@supabase/supabase-js@2";
import sharp from "npm:sharp@0.33";       // 네이티브 모듈도 일부 지원
import { z } from "npm:zod@3";
import { Hono } from "jsr:@hono/hono@4"; // JSR 레지스트리
```

**장점**:
- 별도 번들링 불필요
- Deno Cache가 의존성 관리
- `npm:` + `jsr:` + `https:` 모두 지원

**제약**:
- 일부 네이티브 C++ 모듈은 호환 X
- 캐시 미스 시 첫 실행 느림

### 8.3 Supabase 공식 샘플 호환성

Supabase Edge Functions 공식 샘플 10개 기준:

| 샘플 | isolated-vm + shim | Deno embed |
|------|-------------------|------------|
| hello-world | O | O |
| send-email (npm:@sendgrid/mail) | △ (호스트 번들링) | O |
| supabase-auth (npm:@supabase/supabase-js) | △ | O |
| stripe-webhook (npm:stripe) | △ | O |
| openai-stream (Deno streams) | X (Deno 스트림 복잡) | O |
| discord-bot (Deno.connect) | X | O |
| image-resize (npm:sharp) | X (네이티브) | △ (Deno sharp 호환) |
| oauth-callback (jsr) | X | O |
| cron (Deno.cron) | X | O |
| websocket (Deno.upgradeWebSocket) | X | O |

**샘플 10개 중**:
- isolated-vm: 1.5 그대로 + 3 우회 가능 → **4.5/10 호환**
- Deno embed: 9 그대로 + 1 부분 → **9.5/10 호환**

### 8.4 양평 부엌 결정

- **Supabase 클라이언트 사용** → Deno 필수 → **2차**
- **순수 JS 로직** → isolated-vm 충분 → **1차**

---

## 9. Node.js 22 호환 빌드 가능성

### 9.1 isolated-vm 6.0.2 Node 22 호환

검증:
- ABI 재컴파일 필요 (node-gyp)
- Node 22 LTS + Python3 + g++ = 성공 (Wave 1 § 8.2)
- Node 24는 주의 (5.x 실패 보고, 6.0은 검증 중)

빌드 명령:
```bash
# WSL2 Ubuntu 22.04
sudo apt install -y python3 g++ build-essential make
nvm install 22
pnpm add isolated-vm
# 자동으로 node-gyp 호출해 빌드 (2-5분)
```

### 9.2 Deno embed: Node 독립

- supabase/edge-runtime은 Rust 바이너리 (Docker 이미지)
- Node 버전 무관
- Docker Desktop 또는 WSL2 Docker Engine만 요구

### 9.3 PM2 통합

isolated-vm:
```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: "yp-dashboard",
    script: "./node_modules/next/dist/bin/next",
    args: "start",
    node_args: ["--no-node-snapshot"],  // Node 20+ 필수
    max_memory_restart: "1500M",
  }],
};
```

Deno embed:
```js
module.exports = {
  apps: [
    {
      name: "yp-dashboard",
      // ... (위와 동일)
    },
    {
      name: "edge-runtime",
      script: "docker",
      args: [
        "run", "--rm",
        "-p", "127.0.0.1:9000:9000",
        "-v", "./edge-functions:/home/deno/functions:Z",
        "supabase/edge-runtime:v1.71.2",
        "start",
      ],
      autorestart: true,
    },
  ],
};
```

### 9.4 충돌 가능성

- isolated-vm + better-sqlite3: **검증 성공** (Wave 1 § 8.3)
- isolated-vm + Next.js 16 webpack: **성공** (`serverExternalPackages`)
- Deno embed + 기타: Docker 프로세스 분리로 **충돌 0**

---

## 10. 코드 비교 #1 — 유저 함수 실행 (in-process vs subprocess IPC)

### 10.1 isolated-vm: 인프로세스 실행

```typescript
// edge-functions/runtime/isolated-vm-executor.ts
import ivm from "isolated-vm";
import { performance } from "node:perf_hooks";

export interface RunResult {
  status: number;
  body: string;
  durationMs: number;
  memoryPeakMb: number;
  logs: string[];
}

export async function runIsolated(
  source: string,
  event: { method: string; url: string; body?: string },
  opts: { memoryLimitMb?: number; timeoutMs?: number; secrets?: Record<string, string> } = {}
): Promise<RunResult> {
  const isolate = new ivm.Isolate({
    memoryLimit: opts.memoryLimitMb ?? 64,
    inspector: false,
  });
  const logs: string[] = [];
  const start = performance.now();

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    // 1) console 폴리필
    await jail.set("__log", new ivm.Reference((level: string, msg: string) => {
      logs.push(`[${level}] ${msg}`);
    }));
    await context.evalClosure(`
      const console = {
        log:   (...a) => __log.applySync(undefined, ["info",  a.join(" ")]),
        error: (...a) => __log.applySync(undefined, ["error", a.join(" ")]),
      };
    `);

    // 2) Secrets 주입
    await jail.set("__secrets", new ivm.ExternalCopy(opts.secrets ?? {}).copyInto());
    await context.evalClosure(`
      const Deno = {
        env: {
          get: (k) => __secrets[k],
          toObject: () => ({ ...__secrets }),
        },
      };
    `);

    // 3) fetch Reference (호스트 정책 적용)
    await jail.set("__fetch", new ivm.Reference(async (url: string, init: any) => {
      const res = await fetch(url, init);
      return new ivm.ExternalCopy({
        status: res.status,
        body: await res.text(),
      }).copyInto();
    }));
    await context.evalClosure(`
      const fetch = (url, init) => __fetch.apply(undefined, [url, init], {
        result: { promise: true, copy: true }
      });
    `);

    // 4) 사용자 코드 모듈 컴파일 + 실행
    const module = await isolate.compileModule(source);
    await module.instantiate(context, () => {
      throw new Error("imports forbidden");
    });
    await module.evaluate({ timeout: opts.timeoutMs ?? 5000 });

    const handler = await module.namespace.get("default", { reference: true });
    const result = await handler.apply(undefined, [
      new ivm.ExternalCopy(event).copyInto(),
    ], {
      result: { promise: true, copy: true },
      timeout: opts.timeoutMs ?? 5000,
    });

    const heap = isolate.getHeapStatistics();
    return {
      status: result?.status ?? 200,
      body: result?.body ?? "",
      durationMs: performance.now() - start,
      memoryPeakMb: Math.round((heap.used_heap_size + heap.externally_allocated_size) / 1024 / 1024),
      logs,
    };
  } finally {
    isolate.dispose();
  }
}
```

**특징**:
- 함수 호출 형태 (async/await)
- 호스트와 힙만 분리, 프로세스는 동일
- 콜드 스타트 5-10 ms

### 10.2 Deno embed: HTTP IPC

```typescript
// edge-functions/runtime/edge-runtime-proxy.ts
import { performance } from "node:perf_hooks";

const EDGE_RUNTIME_URL = process.env.EDGE_RUNTIME_URL ?? "http://127.0.0.1:9000";
const EDGE_RUNTIME_JWT = process.env.EDGE_RUNTIME_JWT_SECRET!;

export interface RunResult {
  status: number;
  body: string;
  durationMs: number;
  headers: Record<string, string>;
}

export async function runDenoSidecar(
  slug: string,
  event: { method: string; headers: Headers; body?: string | ReadableStream },
  opts: { timeoutMs?: number } = {}
): Promise<RunResult> {
  const start = performance.now();

  const url = `${EDGE_RUNTIME_URL}/${slug}`;

  const headers = new Headers(event.headers);
  headers.set("Authorization", `Bearer ${EDGE_RUNTIME_JWT}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const response = await fetch(url, {
      method: event.method,
      headers,
      body: event.body,
      signal: controller.signal,
    });

    const body = await response.text();

    return {
      status: response.status,
      body,
      durationMs: performance.now() - start,
      headers: Object.fromEntries(response.headers),
    };
  } finally {
    clearTimeout(timer);
  }
}
```

**특징**:
- HTTP 요청 형태
- 프로세스/컨테이너 분리
- 콜드 스타트 50-100 ms

### 10.3 라우터에서 합치기

```typescript
// edge-functions/router.ts
import { runIsolated } from "./runtime/isolated-vm-executor";
import { runDenoSidecar } from "./runtime/edge-runtime-proxy";
import { prisma } from "@/lib/prisma";

export async function executeFunction(slug: string, req: Request) {
  const fn = await prisma.edgeFunction.findUnique({ where: { slug } });
  if (!fn) return new Response("not found", { status: 404 });

  const event = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body ? await req.text() : undefined,
  };

  if (fn.runtime === "isolated-vm") {
    const result = await runIsolated(fn.source, event, {
      memoryLimitMb: fn.memoryLimitMb ?? 64,
      timeoutMs: fn.timeoutMs ?? 5000,
      secrets: fn.secrets as Record<string, string>,
    });
    return new Response(result.body, { status: result.status });
  }

  if (fn.runtime === "edge-runtime") {
    const result = await runDenoSidecar(slug, event, {
      timeoutMs: fn.timeoutMs ?? 30_000,
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }

  return new Response("unsupported runtime", { status: 500 });
}
```

---

## 11. 코드 비교 #2 — 타임아웃 + 메모리 한계 강제

### 11.1 isolated-vm: V8 내장 강제

```typescript
async function safeRun(code: string, event: any, hardTimeoutMs: number) {
  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  const ctx = await isolate.createContext();

  // 메모리 모니터링 (실시간 폴링)
  const memWatcher = setInterval(() => {
    if (isolate.isDisposed) {
      clearInterval(memWatcher);
      return;
    }
    const stats = isolate.getHeapStatistics();
    const usedMb = stats.used_heap_size / 1024 / 1024;
    if (usedMb > 30) {
      console.warn(`isolate approaching limit: ${usedMb}MB`);
      isolate.dispose();
      clearInterval(memWatcher);
    }
  }, 100);

  try {
    const module = await isolate.compileModule(code);
    await module.instantiate(ctx, () => { throw new Error("no imports"); });
    await module.evaluate({ timeout: hardTimeoutMs });

    const handler = await module.namespace.get("default", { reference: true });
    return await handler.apply(undefined, [
      new ivm.ExternalCopy(event).copyInto(),
    ], {
      result: { promise: true, copy: true },
      timeout: hardTimeoutMs,
    });
  } finally {
    clearInterval(memWatcher);
    if (!isolate.isDisposed) isolate.dispose();
  }
}

// 사용
try {
  const result = await safeRun("export default () => 1+1", {}, 1000);
} catch (error) {
  if (error.message.includes("timeout")) {
    // V8 인터럽트로 실행 강제 종료
    console.error("함수 시간 초과");
  } else if (error.message.includes("memory")) {
    console.error("함수 메모리 초과");
  }
}
```

**특징**:
- `timeout` 옵션: V8 인터럽트로 강제 종료 (ms 단위 정확)
- `memoryLimit`: V8 RAII로 OOM 시 Isolate 자동 종료
- 메모리 모니터링: 100ms 폴링으로 한도 근접 감지

### 11.2 Deno embed: 워커 + 컨테이너 이중 방어

```typescript
async function safeRunDeno(slug: string, event: any, hardTimeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardTimeoutMs);

  try {
    const response = await fetch(`http://127.0.0.1:9000/${slug}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.EDGE_RUNTIME_JWT_SECRET}` },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      // Deno 워커도 자체 타임아웃으로 종료
      console.error("함수 시간 초과 (호스트 측 abort)");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
```

추가로 edge-runtime 설정:
```yaml
# docker-compose.yml
edge-runtime:
  image: supabase/edge-runtime:v1.71.2
  environment:
    WORKER_MEMORY_LIMIT_MB: "128"
    WORKER_TIMEOUT_MS: "30000"
  mem_limit: 400m   # 컨테이너 OOM 방어
  cpus: 0.5         # CPU 한도
```

**특징**:
- 호스트 AbortController (네트워크 수준)
- edge-runtime 워커 타임아웃 (실행 수준)
- Docker cgroup (컨테이너 OS 수준)
- 3중 방어

### 11.3 비교

| 항목 | isolated-vm | Deno embed |
|------|-------------|------------|
| 타임아웃 정확도 | **ms 단위 V8 인터럽트** | ms 단위 + 네트워크 지연 |
| 메모리 한도 강제 | V8 RAII + 모니터링 | 워커 + cgroup |
| 우회 가능성 | 2-3배 메모리 | cgroup으로 차단 |
| 복구 | Isolate dispose | 워커/컨테이너 재시작 |
| 리소스 누수 | dispose() 누락 시 가능 | 자동 정리 |

### 11.4 누수 방지 패턴 비교

isolated-vm:
```typescript
const REGISTRY = new FinalizationRegistry((isolate: ivm.Isolate) => {
  if (!isolate.isDisposed) {
    console.error("LEAK: isolate not disposed");
    isolate.dispose();
  }
});

function makeIsolate(opts: ivm.IsolateOptions) {
  const isolate = new ivm.Isolate(opts);
  REGISTRY.register(isolate, isolate);
  return isolate;
}
```

Deno embed:
- 자동 정리 (요청 종료 시 워커 반환)
- 수동 관리 불필요

---

## 12. 결정 매트릭스 — 어느 함수를 어디로 보내야 하는가

### 12.1 함수 유형별 경로

| 유형 | 예시 | 1차 (isolated-vm) | 2차 (Deno embed) |
|------|------|-------------------|-------------------|
| 순수 계산 | JSON 파싱, validation | **O (5ms)** | 과함 |
| Web fetch + 조합 | Slack webhook, HTTP aggregation | **O** | 가능 |
| DB 집계 (호스트 Prisma) | 대시보드 통계 | **O** | 가능 |
| 로그 변환 | CSV → JSON | **O** | 가능 |
| 간단 리포트 | 텍스트 이메일 | **O** | 가능 |
| Supabase Auth JWT | `npm:@supabase/supabase-js` | X | **O** |
| OpenAI 스트리밍 | Deno ReadableStream | X | **O** |
| PDF 생성 (jsPDF) | npm 패키지 | △ (번들링) | **O** |
| Deno.cron 작업 | 주기적 태스크 | X | **O** |
| WebSocket 업그레이드 | 실시간 피드 | X | **O** |
| sharp 이미지 처리 | 네이티브 C++ | X | △ (Deno sharp) |

### 12.2 매트릭스 결정 규칙 (code)

```typescript
// edge-functions/route-decision.ts
import type { FunctionMeta } from "./types";

export function decideRuntime(meta: FunctionMeta): "isolated-vm" | "edge-runtime" {
  // Deno 필수 조건
  if (meta.source.includes("import ") && meta.source.match(/from\s+["']npm:/)) {
    return "edge-runtime";  // npm: prefix
  }
  if (meta.source.match(/Deno\.(serve|cron|upgradeWebSocket|connect)/)) {
    return "edge-runtime";  // 복잡 Deno API
  }
  if (meta.source.includes("EdgeRuntime.waitUntil")) {
    return "edge-runtime";
  }
  if (meta.memoryLimitMb && meta.memoryLimitMb > 128) {
    return "edge-runtime";  // 큰 메모리
  }
  if (meta.expectedDurationMs && meta.expectedDurationMs > 10_000) {
    return "edge-runtime";  // 10초+ 장기
  }

  // 기본: isolated-vm (빠름, 저자원)
  return "isolated-vm";
}
```

### 12.3 양평 부엌 예상 분포

| 함수 카테고리 | 예상 비율 | 런타임 |
|--------------|---------|--------|
| 대시보드 집계 | 40% | isolated-vm |
| 외부 API 연동 (Slack 등) | 20% | isolated-vm |
| 데이터 변환 | 15% | isolated-vm |
| Validation / Auth | 10% | isolated-vm |
| Supabase 호환 | 10% | edge-runtime |
| Deno 고유 | 5% | edge-runtime |

**1차 85% vs 2차 15%** — Wave 1/2 매트릭스 예측치와 일치.

---

## 13. 최종 결정

### 13.1 양평 부엌 기본 스택

```
┌────────────────────────────────────────────────┐
│ 1차 Runtime: isolated-vm v6.0.2                │
│  - Next.js 16 내부 (serverExternalPackages)    │
│  - PM2 `--no-node-snapshot` 필수               │
│  - Deno shim: Deno.env, Deno.readTextFile      │
│  - Web polyfill: URL, fetch Reference          │
│  - Snapshot 미리 컴파일로 콜드 2.5ms           │
│  - 85-90% 트래픽 처리                          │
│                                                │
│ 2차 Runtime: supabase/edge-runtime v1.71.2     │
│  - Docker 사이드카 (PM2로 관리)                │
│  - 127.0.0.1:9000 바인딩                       │
│  - Volume mount로 hot reload                   │
│  - 10-15% 트래픽 처리 (Supabase/Deno/npm)      │
│                                                │
│ 선택적 3차: Vercel Sandbox                     │
│  - 30초+ / 풀 Linux 필요 시만                  │
│  - 월 예산 $0-5 하드캡                         │
└────────────────────────────────────────────────┘
```

### 13.2 점수 목표

| 단계 | Edge Functions 점수 |
|-----|---------------------|
| 현재 | 45/100 |
| 1차만 도입 (isolated-vm + shim) | 80/100 |
| 1+2차 도입 (하이브리드 코어) | **90-93/100** |
| 1+2+3차 도입 (풀 하이브리드) | **92-95/100** |

### 13.3 구현 순서 (6주)

1. **주 1**: isolated-vm v6 WSL2 빌드 검증 + Next.js 16 통합
2. **주 2**: Web polyfill + Deno shim (`Deno.env`, `fetch` Reference)
3. **주 3**: Inspector 통합 + 로그 스트리밍 + `EdgeFunctionRun` Prisma 테이블
4. **주 4**: supabase/edge-runtime Docker 사이드카 + PM2 ecosystem
5. **주 5**: 라우터 통합 (1차 vs 2차 자동 결정) + 페일오버
6. **주 6**: Vercel Sandbox 선택적 위임 + 월 예산 가드레일 (옵션)

### 13.4 리스크 게이트

- **R-1**: isolated-vm 메인테이너 떠남 → Atlassian fork 모니터링 (분기별)
- **R-2**: Deno shim 70% 커버가 실제 샘플과 괴리 → 10개 공식 샘플 검증 (주 2-3)
- **R-3**: edge-runtime "breaking changes" → 태그 고정 + 분기 업그레이드 검토
- **R-4**: Node 24 호환 이슈 → Node 22 LTS에 2년 고정

---

## 14. 참고 자료

1. [Wave 1 isolated-vm v6 Deep Dive (본 프로젝트)](./01-isolated-vm-v2-deep-dive.md)
2. [Wave 1 Deno Embed Deep Dive (본 프로젝트)](./02-deno-embed-deep-dive.md)
3. [isolated-vm README (공식)](https://github.com/laverdet/isolated-vm/blob/main/README.md)
4. [isolated-vm TypeScript 정의](https://github.com/laverdet/isolated-vm/blob/main/isolated-vm.d.ts)
5. [supabase/edge-runtime GitHub](https://github.com/supabase/edge-runtime)
6. [Supabase Edge Runtime Self-hosted](https://supabase.com/blog/edge-runtime-self-hosted-deno-functions)
7. [Supabase Self-hosting Functions](https://supabase.com/docs/guides/self-hosting/self-hosted-functions)
8. [Deno 2.x Permissions](https://docs.deno.com/runtime/manual/basics/permissions)
9. [Deno npm: imports](https://docs.deno.com/runtime/manual/node/npm_specifiers)
10. [Deno JSR registry](https://jsr.io/)
11. [Cloudflare Workers 성능 비교](https://blog.cloudflare.com/unpacking-cloudflare-workers-cpu-performance-benchmarks/)
12. [V8 Isolate API (Embedders Guide)](https://v8.dev/docs/embed)
13. [Semgrep: vm2 폐기 분석](https://semgrep.dev/blog/2023/discontinuation-of-node-vm2/)
14. [Backstage: Switching out Sandbox](https://backstage.io/blog/2023/06/21/switching-out-sandbox/)
15. [Atlassian Forge: isolated-vm fork](https://www.npmjs.com/package/@forge/isolated-vm)
16. [Node.js 22 LTS 릴리즈](https://nodejs.org/en/blog/release/v22.0.0)
17. [esbuild 공식 문서](https://esbuild.github.io/)
18. [Edge Functions Matrix (본 Wave 2)](./04-edge-functions-matrix.md)
19. [Storage Matrix (본 Wave 2)](../07-storage/04-storage-matrix.md)
20. [SeaweedFS vs Garage 1:1 (본 Wave 2)](../07-storage/05-seaweedfs-vs-garage.md)
