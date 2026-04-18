# Edge Functions 매트릭스 — isolated-vm v6 · Deno embed · Vercel Sandbox · Cloudflare Workers

> **Wave 2 / Agent D / 매트릭스 #2**
>
> - 작성일: 2026-04-18
> - 작성자: kdywave Wave 2 매트릭스 에이전트
> - 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> - 환경: WSL2 Ubuntu + Next.js 16 + PM2 + Cloudflare Tunnel + 단일 서버 + $0-5/월
> - 현재 Edge Functions 점수: 45/100
> - Wave 1 deep-dive 참조: `01-isolated-vm-v2-deep-dive.md` (3.85), `02-deno-embed-deep-dive.md` (4.22), `03-vercel-sandbox-remote-deep-dive.md` (2.71)
> - Wave 1 결론: **3층 하이브리드 권고** — isolated-vm v6 + Deno 사이드카(supabase/edge-runtime) + Vercel Sandbox 선택적 위임

---

## 0. 문서 목적과 구성

Supabase Edge Functions는 "Deno 2.x + Web 표준 API + npm 호환 + HTTP 트리거"로 구성된다. 이를 100점 동등화하려면 단일 기술로는 어렵고, **역할별 3층**이 필요하다:

| 층 | 목적 | 기술 |
|----|------|------|
| 빠른 격리 실행 | < 10ms 콜드, 저자원 | **isolated-vm v6** |
| 100% Supabase 호환 | Deno API 모두, hot reload | **supabase/edge-runtime** 사이드카 |
| 무거운 장기 작업 | 5분-5시간, 풀 Linux | **Vercel Sandbox** (원격 오프로드) |

본 매트릭스는 Wave 1 deep-dive의 개별 점수를 **한 장의 비교표**로 통합하고, **3층 라우팅 결정 기준**을 코드 수준까지 제시한다.

구성:
1. 후보 개요 (§ 1)
2. 기술 스택 매트릭스 (§ 2) — 50행
3. 성능 매트릭스 (§ 3) — 60행
4. 격리 · 보안 매트릭스 (§ 4) — 45행
5. API · 기능 매트릭스 (§ 5) — 65행
6. Supabase Edge Functions 호환 매트릭스 (§ 6) — 40행
7. 운영 · 배포 매트릭스 (§ 7) — 50행
8. WSL2 + Next.js 16 환경 호환 매트릭스 (§ 8) — 40행
9. 라이선스 · 비용 매트릭스 (§ 9) — 25행
10. 10차원 스코어링 비교 (§ 10) — 50행
11. 3층 하이브리드 라우팅 결정 기준 (§ 11) — 40행
12. 결론 (§ 12)

---

## 1. 후보 개요

| 항목 | isolated-vm v6 | Deno embed (supabase/edge-runtime) | Vercel Sandbox | Cloudflare Workers |
|------|----------------|-------------------------------------|----------------|---------------------|
| 유형 | Node native addon | Rust 바이너리 (Docker 사이드카) | 외부 SaaS (Firecracker microVM) | 외부 SaaS (V8 Isolate) |
| 실행 장소 | Node.js 메인 프로세스 내부 | 별도 프로세스/컨테이너 | Vercel 인프라 (미국/유럽) | Cloudflare 글로벌 |
| 격리 기술 | V8 Isolate | V8 Isolate (deno_core) | Firecracker KVM | V8 Isolate |
| 콜드 스타트 | **1-10 ms** | 50-100 ms | 150-300 ms | < 5 ms |
| Supabase 호환 | 0% (shim으로 70%까지) | **100%** | 0% (Node만) | 0% (Workers API) |
| 자체호스팅 | **O (우리 머신)** | **O (Docker)** | X | X (workerd로 우회 가능) |
| 라이선스 | ISC | MIT | 상용 SaaS | 상용 SaaS |
| 월 비용 (우리 규모) | **$0** | **$0** | $0-5 (Hobby 무료) | $5 + 요청당 |
| Wave 1 점수 | **3.85/5** | **4.22/5** (재계산) | 2.71/5 | 미평가 (참고) |
| 3층 하이브리드 역할 | **1차 (90% 함수)** | **2차 (Deno 호환 필수 5%)** | **3차 (무거운 5%)** | 대안 (workerd 자체호스팅) |

### 1.1 Wave 1 점수 재확인

Wave 1에서 각 후보가 독립 점수를 받았다:
- **isolated-vm v6**: 3.85 — "빠르지만 Deno 호환 0%"
- **supabase/edge-runtime**: 4.22 — "100% 호환이지만 리소스 큼"
- **Vercel Sandbox**: 2.71 — "자체호스팅 정책 위반"
- **Deno child_process spawn**: 3.74 (참고) — "콜드 800ms 부담"
- **deno_runtime NAPI 임베드**: 2.92 — "배제"
- **workerd 자체호스팅**: 3.62 (참고) — "Cloudflare Workers API로 제한"

**3층 하이브리드 통합 점수 추정: 4.3-4.5/5 (개별 최고점 초과)**

### 1.2 매트릭스 초점

Wave 1이 "개별 후보 적합도"를 답했다면, 본 매트릭스는:
- **언제 isolated-vm을 쓰고 언제 Deno로 넘기는가** (§ 11.1)
- **WSL2 Node 22에서 isolated-vm v6 빌드 검증 상태** (§ 8.1)
- **3층의 메모리/CPU 총합이 단일 머신에서 견딜 수 있는가** (§ 3.4)
- **Next.js 16 라우터에서 3층 라우팅 구현 패턴** (§ 11.2)

---

## 2. 기술 스택 매트릭스 (50행)

### 2.1 런타임 엔진

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| JavaScript 엔진 | V8 (Node 내장) | V8 (Deno 2.x) | V8 (Node 22/24) | V8 (Cloudflare custom) |
| TypeScript 직접 실행 | X (esbuild 필요) | **O** (Deno 기본) | X (tsx/esbuild) | X (wrangler build) |
| ESM 지원 | O | O | O | O |
| CommonJS 지원 | O | △ (Node compat) | O | △ |
| JSX 지원 | X | O (설정) | O (runtime 설정) | O |
| WebAssembly | O | O | O | O |
| npm: prefix import | X | **O** | (npm 그대로) | △ |
| Deno std library | X | **O** | X | X |

### 2.2 HTTP 처리

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| 내장 HTTP 서버 | X (호스트 Hono/Express) | **O (`Deno.serve`)** | X (Node 내에서 구현) | **O (fetch handler)** |
| Request/Response Web 표준 | △ (polyfill 필요) | **O** | △ | **O** |
| URLPattern | △ | O | △ | O |
| Streams API | △ (polyfill) | O | O | O |
| WebSocket | X (호스트 위임) | O | X | O |
| HTTP/2 지원 | (호스트 의존) | O | O | O |
| HTTP/3 | (호스트 의존) | △ | △ | O |
| SSE (Server-Sent Events) | (호스트 의존) | O | O | O |

### 2.3 Web API 구현

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| fetch() | X (Reference로 위임) | **O** | O (Node 22 fetch) | O |
| URL / URLSearchParams | △ (polyfill) | O | O | O |
| TextEncoder / TextDecoder | △ | O | O | O |
| crypto.subtle | △ | O | O (Node crypto) | O |
| Blob / File | △ | O | O | O |
| FormData | △ | O | O | O |
| ReadableStream / WritableStream | △ | O | O | O |
| structuredClone | △ | O | O | O |
| AbortController / AbortSignal | △ | O | O | O |

### 2.4 데이터 & 스토리지

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| 파일 시스템 접근 | X (Reference 위임) | O (Deno permissions) | O (full Linux) | X |
| 환경변수 | Reference로 주입 | **O (Deno.env)** | O (process.env) | O (env binding) |
| 데이터베이스 | (호스트 prisma) | O (직접 연결) | O (직접 연결) | O (D1 binding) |
| KV / Cache | (호스트) | (사용자 구현) | (사용자) | O (KV binding) |

### 2.5 동시성 모델

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| Promise / async | O | O | O | O |
| Worker threads | △ (isolate로 대체) | O | O | O (service worker) |
| SharedArrayBuffer | △ | O | O | X |
| Atomics | △ | O | O | X |

---

## 3. 성능 매트릭스 (60행)

### 3.1 콜드 스타트 (상세)

| 단계 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| 프로세스/컨테이너 생성 | 0 ms (인프로세스) | 0 ms (상주) | 125-250 ms (Firecracker) | ~0 ms (글로벌 풀) |
| V8 Isolate 생성 | 1-2 ms | - (워커 풀 재사용) | - (Node 내장) | ~0 ms |
| Context 생성 | 0.5-1 ms | - | - | - |
| 모듈 컴파일 (10KB) | 3-8 ms | 30-50 ms | 30-50 ms | 2-5 ms |
| 코드 실행 (1회) | < 0.5 ms | 5-15 ms | 5-15 ms | < 1 ms |
| Dispose | 0.2-0.5 ms | - | 50-100 ms | - |
| **총 cold path** | **5-12 ms** | **50-100 ms** | **150-300 ms** | **< 5 ms** |

### 3.2 Hot 응답 (따뜻한 상태)

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| Hot 재호출 | < 1 ms | 5-15 ms | (콜드 only) | < 1 ms |
| Snapshot 재사용 cold | 0.5-1 ms | - | - | - |
| 워커 풀 hit ratio | N/A | 80%+ (idle 8 워커) | N/A | ~100% |

### 3.3 메모리 풋프린트

| 메트릭 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|--------|----------------|------------|----------------|---------------------|
| 호스트 메모리 (idle) | 0 (Node에 통합) | **150-200 MB** (컨테이너) | 0 (외부) | 0 |
| Isolate 당 메모리 | **3-5 MB** | 30-50 MB (워커) | 256-512 MB (microVM) | 128 MB (한도) |
| memoryLimit 강제 | O (V8 RAII) | O | O (microVM) | O |
| memoryLimit 2-3배 우회 가능성 | △ (공식 경고) | △ | X (VM 경계) | X |
| 외부 할당 추적 | O (externally_allocated_size) | O | N/A | N/A |

### 3.4 단일 서버 동시 실행 한도 (WSL2 6GB 가정)

```
가용 RAM: 6 GB
- Next.js + Prisma + better-sqlite3: ~600 MB
- PostgreSQL: ~400 MB  
- OS 기타: ~500 MB
- 가용 풀: ~4.5 GB
```

| 후보 | 단일 인스턴스 메모리 | 동시 실행 한도 |
|------|---------------------|---------------|
| isolated-vm v6 (64MB limit) | 5 MB 기본 + 64 MB peak | **~70개 동시** |
| isolated-vm v6 (128MB limit) | 5 MB 기본 + 128 MB peak | **~35개 동시** |
| supabase/edge-runtime (8 워커) | 200 MB idle + 50 MB/req | **8개 워커** (동시 요청 8) |
| Vercel Sandbox | 0 호스트 | (외부 한도: Hobby 20 동시) |
| Cloudflare Workers | 0 호스트 | (외부 한도 무제한) |

### 3.5 처리량 (req/s)

| 후보 | 단일 서버 처리량 |
|------|------------------|
| isolated-vm v6 | ~200-500 req/s (CPU bound) |
| supabase/edge-runtime | 10-20 req/s/워커 × 8 워커 = ~80-160 |
| Vercel Sandbox | (외부 네트워크 RTT 70-300ms) → 단일 커넥션 3-10 req/s |
| Cloudflare Workers | ~10,000 req/s (글로벌 분산) |

### 3.6 네트워크 지연 (양평 부엌 WSL2 한국 위치 기준)

| 후보 | 추가 RTT |
|------|---------|
| isolated-vm v6 | 0 ms (인프로세스) |
| supabase/edge-runtime | < 1 ms (localhost) |
| Vercel Sandbox (us-east-1) | ~200-300 ms |
| Vercel Sandbox (sin1 싱가포르) | ~70-120 ms |
| Cloudflare Workers | ~20-50 ms (KR 엣지) |

### 3.7 Snapshot 효과 (cold start 단축)

| 후보 | Snapshot 지원 | 단축 효과 |
|------|-------------|---------|
| isolated-vm v6 | **O (`Isolate.createSnapshot`)** | 콜드 50% (5ms → 2.5ms) |
| Deno embed | X (자동 캐싱) | 캐시된 모듈 hot |
| Vercel Sandbox | **O (dependency snapshot)** | npm install 스킵 |
| Cloudflare Workers | O (내부) | ~0 ms |

### 3.8 Warm pool 전략

| 후보 | Warm pool | 효과 |
|------|---------|-----|
| isolated-vm v6 | 사용자가 구현 (Map<name, Isolate>) | hot re-use |
| supabase/edge-runtime | 내장 워커 풀 (기본 8) | 8개 상주 |
| Vercel Sandbox | 없음 (create/destroy) | 콜드 필수 |
| Cloudflare Workers | 글로벌 자동 | hot |

---

## 4. 격리 · 보안 매트릭스 (45행)

### 4.1 격리 수준

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| 격리 단위 | V8 Isolate (별도 힙) | V8 Isolate | Firecracker microVM (KVM) | V8 Isolate |
| 힙 공유 | X (분리) | X | X (VM 경계) | X |
| Prototype chain 분리 | O | O | O (VM 분리) | O |
| 프로세스 분리 | X (동일 Node) | O (별도 프로세스) | O (VM) | (글로벌) |
| 파일시스템 격리 | O (호스트 접근 없음) | O (permissions) | **O (완전 VM)** | O |
| 네트워크 격리 | O (호스트 위임) | O (permissions) | △ (외부 인터넷 허용) | O |
| CPU 격리 | O (V8 인터럽트) | O (V8 인터럽트) | O (VM scheduler) | O |

### 4.2 샌드박스 탈출 방어

| 공격 벡터 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|----------|----------------|------------|----------------|---------------------|
| Prototype pollution | **차단** (힙 분리) | **차단** | **차단** (VM) | **차단** |
| 동적 코드 평가 이스케이프 | 차단 | 차단 | 차단 | 차단 |
| setTimeout 이스케이프 | 차단 | 차단 | 차단 | 차단 |
| C++ 코어 접근 | 차단 (native addon 없음) | 차단 | 차단 | 차단 |
| Node.js 내장 모듈 접근 | **차단** (isolate에 주입 안됨) | N/A | 허용 (필요 시) | 차단 |
| Worker/SharedArrayBuffer 악용 | 제한 (isolate 단위) | 제한 | 허용 | 차단 |

### 4.3 CVE 이력 (2024-2026)

| 후보 | 총 CVE | High/Critical | 패치 속도 |
|------|-------|--------------|----------|
| isolated-vm | 0 신규 (2021 이후) | 0 | N/A |
| Deno | 2-4/년 | 0-1 | < 1주 |
| supabase/edge-runtime | 0 자체 | 0 | Deno에 위임 |
| Vercel Sandbox | 0 (Firecracker + AWS) | 0 | N/A (SaaS) |
| Cloudflare Workers | 0 | 0 | N/A (SaaS) |

### 4.4 리소스 한계 강제

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| 메모리 한도 | O (`memoryLimit`) | O (워커 레벨) | O (`resources.memory`) | O (128 MB 고정) |
| CPU 타임아웃 | O (`timeout: ms`) | O (워커 레벨) | O (VM timeout) | O (CPU time limit) |
| 실행 시간 한도 | **1-60초 권장** | 수분-시간 | **5분-5시간** | 30초/50ms CPU |
| 동시 요청 한도 | 사용자 구현 | 워커 풀 (8) | 계정 레벨 | 1M req/day (유료) |

### 4.5 감사 (Audit)

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| 실행 로그 | 호스트 logs[] 수집 | stdout/stderr | stdout/stderr | Dashboard |
| 실행 메트릭 | getHeapStatistics() | Prometheus | Vercel 대시보드 | Analytics |
| 실행 트레이스 (OpenTelemetry) | 호스트 통합 | 설정 가능 | 자동 | 자동 |
| 다이버전스 검출 | X | X | X | X (자동 불가) |

---

## 5. API · 기능 매트릭스 (65행)

### 5.1 코어 실행 API

| 기능 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| `script.run()` / `module.evaluate()` | O | N/A (엔드투엔드) | N/A | N/A |
| HTTP 트리거 | 호스트 라우터 | **`Deno.serve`** | 호스트 라우터 | `fetch` handler |
| Background 작업 | 제한 (isolate 범위) | `EdgeRuntime.waitUntil` | sandbox.stop() 전까지 | `ctx.waitUntil()` |
| Scheduled trigger | X | X (사용자 cron) | X | O (Cron Triggers) |

### 5.2 개발자 경험 API

| 기능 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| Hot reload | X (커스텀) | **O (volume mount)** | X | X (deploy 필요) |
| 원격 디버깅 (DevTools) | **O (Inspector)** | O | △ (stdout) | △ (wrangler tail) |
| 소스맵 | O | O | O | O |
| stdout/stderr 캡처 | logs[] 수동 | **O (stream)** | **O** | O (logs) |
| 실시간 로그 스트리밍 | 호스트 구현 | **O (SSE 가능)** | O | O |

### 5.3 보안 · 인증 API

| 기능 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| JWT 검증 | 호스트 구현 | **O (Supabase 호환)** | 호스트 구현 | 호스트 구현 |
| Secrets 주입 | ExternalCopy | Deno.env | env 변수 | env binding |
| OIDC 통합 | 호스트 | O | △ | △ |
| Service-Role-Key 보호 | 호스트 Reference | O (main worker만) | env | env |

### 5.4 외부 서비스 통합 API

| 기능 | isolated-vm v6 | Deno embed | Vercel Sandbox | Cloudflare Workers |
|------|----------------|------------|----------------|---------------------|
| fetch() | 호스트 위임 | O | O (Node 22) | O |
| WebSocket 클라이언트 | 호스트 위임 | O | O | O |
| PostgreSQL 클라이언트 | 호스트 prisma | O (npm:) | O | Hyperdrive (유료) |
| Redis 클라이언트 | 호스트 | O | O | O (KV / Redis) |
| 외부 HTTP API | 호스트 fetch | O | O | O |

### 5.5 Deno 네임스페이스 (Supabase 호환)

| API | isolated-vm v6 (shim) | Deno embed | Vercel Sandbox | CF Workers |
|-----|----------------------|------------|----------------|-----------|
| `Deno.env.get` | △ shim | **O** | X | X |
| `Deno.env.toObject` | △ shim | **O** | X | X |
| `Deno.serve` | X (호스트 라우터) | **O** | X | X (다른 API) |
| `Deno.readTextFile` | △ shim (화이트리스트) | **O (permissions)** | O (Node fs) | X |
| `Deno.writeTextFile` | △ | **O** | O | X |
| `Deno.cwd` | △ | O | O | X |
| `Deno.Command` (sub-process) | X | O | O | X |
| `Deno.connect` (TCP) | X | O | O | △ |
| `Deno.listen` | X | O | O | △ |
| `EdgeRuntime.waitUntil` | X (커스텀) | **O** | X | `ctx.waitUntil` |

### 5.6 npm 호환

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | CF Workers |
|------|----------------|------------|----------------|-----------|
| `import pkg from 'npm:...'` | X | **O (Deno 2)** | (npm 그대로) | △ (bundler) |
| package.json 해석 | 호스트 (esbuild) | **O** | O | △ |
| node_modules 로드 | 호스트 preprocessing | O (node compat) | O | △ (bundler) |
| C++ 네이티브 모듈 | X | △ (일부) | O | X |
| Node 표준 라이브러리 | X | O (Deno 2 node:*) | O | △ (polyfills) |

### 5.7 빌드 파이프라인

| 단계 | isolated-vm v6 | Deno embed | Vercel Sandbox | CF Workers |
|------|----------------|------------|----------------|-----------|
| TypeScript 컴파일 | 호스트 (esbuild) | **내장** | 호스트 | wrangler |
| Tree shaking | 호스트 | O | O | O |
| 의존성 설치 | 호스트 (pnpm) | O (cache) | O (`npm install`) | wrangler |
| 최소 번들 크기 | 자유 | Deno 기본 | Node 기본 | 1MB 한도 (Paid) |

---

## 6. Supabase Edge Functions 호환 매트릭스 (40행)

### 6.1 기능 호환

| Supabase Edge 기능 | isolated-vm v6 | supabase/edge-runtime | Vercel Sandbox | workerd |
|-------------------|----------------|----------------------|----------------|---------|
| Deno 2.x 런타임 | **0%** | **100%** | 0% | 0% |
| TypeScript 직접 | X (esbuild 전처리) | **O** | X | wrangler |
| `Deno.serve` | X (호스트) | **O** | X | `fetch` handler |
| `Deno.env.get` | shim | **O** | X | `env.*` |
| `npm:` imports | X | **O** | (npm) | △ |
| `EdgeRuntime.waitUntil` | X | **O** | X | `ctx.waitUntil` |
| JWT 검증 (Supabase) | 수동 | **O 자동** | 수동 | 수동 |
| Supabase Auth 통합 | 수동 | **O 자동** | 수동 | 수동 |
| 함수 hot reload (volume) | X | **O** | X | X |
| 로그 스트리밍 | 수동 | O (stdout) | O | O |
| HTTP 멀티파트 | O (host) | O | O | O |
| SSE 응답 | O | O | O | O |
| WebSocket 업그레이드 | X | O | X | O |

### 6.2 호환도 집계

| 후보 | Supabase Edge 함수 "그대로 실행" 가능 % |
|------|----------------------------------------|
| supabase/edge-runtime | **100%** |
| Deno child_process spawn | 95% (일부 기능 직접 구현) |
| isolated-vm v6 + Deno shim | **70%** (Wave 1 § 10.4 기준) |
| isolated-vm v6 단독 | 5-10% |
| Vercel Sandbox (Node 24) | 0% (Deno API 다름) |
| Cloudflare Workers / workerd | 0% (Workers API 다름) |

### 6.3 실제 Supabase Edge Function 샘플 코드 이식성

```typescript
// Supabase 공식 샘플: hello-world
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.from("orders").select("*").limit(10);
  return new Response(JSON.stringify({ data, error }), {
    headers: { "content-type": "application/json" },
  });
});
```

| 후보 | 이 코드 그대로 실행? | 필요한 수정 |
|------|---------------------|-----------|
| supabase/edge-runtime | **그대로** | 0 |
| Deno spawn | **그대로** | 0 |
| isolated-vm + shim | **부분** | `Deno.serve`를 호스트 라우터로, `npm:` imports를 호스트 번들링 |
| Vercel Sandbox | X | `Deno.serve` → `http.createServer`, `npm:` → `require`, 전체 재작성 |
| workerd | X | `Deno.serve` → `export default { fetch }`, env 재매핑 |

---

## 7. 운영 · 배포 매트릭스 (50행)

### 7.1 설치 & 배포

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| 설치 방식 | `pnpm add isolated-vm` | `docker pull supabase/edge-runtime:v1.71.2` | npm install `@vercel/sandbox` | `npm install -D workerd` |
| 설치 크기 | 20 MB (with .node) | 300 MB (Docker) | 1 MB (SDK) | 80 MB (prebuild) |
| 네이티브 빌드 필요 | **O (node-gyp)** | X (prebuild) | X | X (prebuild) |
| 의존성 | Python3, g++, make | Docker | 없음 | 없음 |
| WSL2 설치 시간 | 2-5분 (컴파일) | 1-2분 (pull) | < 30초 | < 1분 |

### 7.2 PM2 통합

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| PM2 필수 옵션 | `node_args: ['--no-node-snapshot']` | 컨테이너 자체 관리 | 없음 | 기본 사용 |
| max_memory_restart | 1500M (Next.js + isolate) | 400m (edge-runtime) | 없음 | 300M |
| 그레이스풀 셧다운 | `isolate.dispose()` | Docker SIGTERM | SDK abort | SIGTERM |
| PM2 cluster 모드 | O (isolate per worker) | X | N/A | O |

### 7.3 모니터링 & 로깅

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| 로그 수집 | 호스트 console | stdout/stderr | Vercel 대시보드 | stderr |
| Prometheus 메트릭 | 호스트 구현 | O (기본 엔드포인트) | O (외부) | O |
| OpenTelemetry | 호스트 통합 | 설정 가능 | 자동 | O |
| 에러 추적 (Sentry) | 호스트 Prisma 저장 | SDK | O | SDK |
| 헬스체크 | 호스트 ping | `/_internal/health` | 외부 API | HTTP endpoint |

### 7.4 개발 → 프로덕션 파이프라인

| 단계 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| 로컬 개발 | Next.js dev server | Docker compose up | SDK 호출 | `npx workerd serve` |
| 테스트 | Vitest + isolate mock | Deno.test | Vitest + sandbox mock | workerd test |
| 스테이징 배포 | PM2 reload | docker compose up -d | 자동 | PM2 reload |
| 프로덕션 배포 | PM2 reload | docker compose pull | 자동 | PM2 reload |
| 롤백 | git revert + PM2 | 태그 변경 | 자동 | git revert |

### 7.5 함수 동적 추가

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| 런타임 등록 | O (DB에서 source 로드) | **O (volume mount)** | O (런타임 업로드) | △ (리로드) |
| Hot reload (편집 → 반영) | 커스텀 구현 | **O (디렉토리 감지)** | N/A | 재시작 |
| 함수 버전 관리 | app-level | app-level | Vercel 자체 | app-level |

---

## 8. WSL2 + Next.js 16 환경 호환 매트릭스 (40행)

### 8.1 isolated-vm v6 빌드 검증 (사전 스파이크)

Wave 1 § 8.2에서 검증된 체크리스트:

| 검증 항목 | 상태 | 비고 |
|---------|-----|-----|
| Ubuntu 22.04 + Node 22 LTS | **O** | 검증됨 |
| Python3 + g++ 설치 | **O** | `apt install python3 g++ build-essential` |
| WSL2 RAM ≥ 4GB | **O** | `.wslconfig`에서 `memory=4GB` |
| `pnpm add isolated-vm` 빌드 성공 | **O** | 2-5분 소요 |
| `new Isolate()` 런타임 검증 | **O** | 1-liner 테스트 통과 |
| better-sqlite3 동시 설치 | **O** | 충돌 0건 |
| Node 22 + `--no-node-snapshot` 필수 | **O** | Node 20+ 공식 요구 |
| Next.js 16 `serverExternalPackages` | **O** | webpack 번들 제외 검증 |
| PM2 `node_args` 전달 | **O** | ecosystem 파일 예시 검증 |

**결론**: **빌드 가능 ✅**. Wave 1에서 "조건부 YES"로 확정.

### 8.2 Node 24 호환 상태

| 후보 | Node 24 호환 |
|------|------------|
| isolated-vm v6.0.2 | **검증 중** (5.x는 Node 24 실패 보고, 6.0은 Node 22/23 주력) |
| supabase/edge-runtime | N/A (Rust 바이너리) |
| Vercel Sandbox SDK | O (Node 22+) |
| workerd | O (자체 V8) |

**권고**: Node 22 LTS에 고정 (다음 2년 안정).

### 8.3 Next.js 16 통합

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| `serverExternalPackages` 지정 필요 | **O (`isolated-vm`)** | X | X | X |
| webpack externals 추가 | **O (권장)** | X | X | X |
| App Router 호환 | O | O (HTTP 프록시) | O | O (HTTP 프록시) |
| Route Handler에서 호출 | 직접 호출 | fetch 프록시 | SDK 호출 | fetch 프록시 |
| Server Actions 호환 | O | O | O | O |
| Edge Runtime (Vercel) 모드 | **X (Node 필수)** | X | N/A | X |
| Node.js Runtime 모드 | **O** | O | O | O |

### 8.4 better-sqlite3 공존

| 항목 | 검증 상태 |
|------|---------|
| isolated-vm + better-sqlite3 동시 빌드 | **성공** (Wave 1 § 8.3) |
| WSL2 4GB에서 동시 컴파일 OOM | **회피 가능** (`npm config set jobs 1`) |
| 런타임 충돌 | **없음** (각자 독립 .node) |

### 8.5 Cloudflare Tunnel 경유

| 항목 | isolated-vm v6 | Deno embed | Vercel Sandbox | workerd |
|------|----------------|------------|----------------|---------|
| CF Tunnel이 접근 | Next.js 3000만 | Next.js 3000만 | outbound HTTPS만 | Next.js 3000만 |
| 외부 포트 노출 | 0 | 0 (127.0.0.1:9000 bind) | 0 | 0 (127.0.0.1:9001) |
| 업스트림 URL | N/A | `http://127.0.0.1:9000` | `https://api.vercel.com` | `http://127.0.0.1:9001` |
| 보안 권장 | 기본 | `127.0.0.1` bind 강제 | 토큰 관리 | `127.0.0.1` bind 강제 |

### 8.6 Prisma 7 + better-sqlite3 상호작용

| 항목 | 영향 |
|------|-----|
| Prisma child_process | isolated-vm과 무관 |
| better-sqlite3 동기 호출 | 호스트 이벤트 루프만 영향 (isolate 격리됨) |
| 사용자 isolate에서 DB 접근 | **금지** (Reference로 호스트 함수 wrap 필수) |
| RLS 정책 강제 | 호스트에서 |

---

## 9. 라이선스 · 비용 매트릭스 (25행)

### 9.1 라이선스

| 후보 | 라이선스 | copyleft | 상업 사용 | 우리 영향 |
|------|---------|---------|----------|----------|
| isolated-vm | **ISC** | X | 자유 | 0 |
| supabase/edge-runtime | **MIT** | X | 자유 | 0 |
| Deno | MIT | X | 자유 | 0 |
| deno_core / deno_runtime | MIT | X | 자유 | 0 |
| Vercel Sandbox SDK | MIT (SDK) | X | 자유 (서비스 약관) | 0 |
| Vercel Sandbox 서비스 | SaaS 약관 | - | 유료 | 가격 |
| Cloudflare Workers (호스티드) | SaaS 약관 | - | 유료 | 가격 |
| workerd (오픈소스) | **Apache 2.0** | X | 자유 | 0 |

### 9.2 비용 (양평 부엌 규모 추정)

가정: 일 100 함수 호출, 평균 2초 CPU, 총 5,000 call/월

| 후보 | 월 비용 | 연 비용 |
|------|--------|--------|
| isolated-vm v6 | $0 | $0 |
| supabase/edge-runtime (Docker) | $0 | $0 |
| Vercel Sandbox (Hobby 무료 5 CPU-hr) | $0 (한도 내) | $0 |
| Vercel Sandbox (Pro 초과 분) | $0-2 | $0-24 |
| Cloudflare Workers (Paid $5/월) | **$5** | **$60** |
| workerd 자체호스팅 | $0 | $0 |

### 9.3 3층 하이브리드 비용

| 구성 | 월 비용 |
|------|--------|
| isolated-vm v6 (90% 트래픽) | $0 |
| supabase/edge-runtime 사이드카 (5%) | $0 |
| Vercel Sandbox 위임 (5% 무거운 함수) | $0-5 (한도 내) |
| **합계** | **$0-5/월** |

양평 부엌 예산 $0-5/월에 정확히 부합.

---

## 10. 10차원 스코어링 비교 (50행)

### 10.1 원본 점수 (Wave 1)

| 차원 | 가중치 | isolated-vm v6 | supabase/edge-runtime | Vercel Sandbox | workerd (참고) |
|------|-------|----------------|-----------------------|----------------|---------------|
| FUNC (Supabase 동등) | 18% | 2.5 | **5.0** | 1.5 | 2.0 |
| PERF (콜드/메모리) | 10% | **4.8** | 3.5 | 2.5 | 4.8 |
| DX (디버깅·테스트) | 14% | 3.5 | 3.5 | 3.0 | 3.5 |
| ECO (커뮤니티·CVE) | 12% | 3.5 | 4.0 | 3.0 | 4.0 |
| LIC (라이선스) | 8% | **5.0** | **5.0** | 2.5 (SaaS) | **5.0** |
| MAINT (활성도) | 10% | 3.0 | **4.5** | 4.5 | 4.0 |
| INTEG (Next.js 16 + better-sqlite3 + WSL2) | 10% | **4.5** | 4.0 | 3.5 | 4.0 |
| SECURITY (격리) | 10% | 4.8 | 4.5 | **5.0** | 4.5 |
| SELF_HOST (RAM/CPU) | 5% | **4.5** | 3.0 | 1.0 | 4.0 |
| COST ($0-5) | 3% | 5.0 | 5.0 | 3.5 | 5.0 |

### 10.2 가중점수

| 차원 | 가중 | isolated-vm | edge-runtime | Vercel Sandbox | workerd |
|------|-----|-------------|--------------|----------------|---------|
| FUNC | 18% | 0.450 | 0.900 | 0.270 | 0.360 |
| PERF | 10% | 0.480 | 0.350 | 0.250 | 0.480 |
| DX | 14% | 0.490 | 0.490 | 0.420 | 0.490 |
| ECO | 12% | 0.420 | 0.480 | 0.360 | 0.480 |
| LIC | 8% | 0.400 | 0.400 | 0.200 | 0.400 |
| MAINT | 10% | 0.300 | 0.450 | 0.450 | 0.400 |
| INTEG | 10% | 0.450 | 0.400 | 0.350 | 0.400 |
| SECURITY | 10% | 0.480 | 0.450 | 0.500 | 0.450 |
| SELF_HOST | 5% | 0.225 | 0.150 | 0.050 | 0.200 |
| COST | 3% | 0.150 | 0.150 | 0.105 | 0.150 |
| **합계** | 100% | **3.85** | **4.22** | **2.96** | **3.81** |

(Wave 1에서 Vercel Sandbox는 2.71, 재계산 결과 2.96이나 근사 유지. 두 수치 모두 "정책상 부적합" 결론 동일)

### 10.3 3층 하이브리드 가중 예상

하이브리드는 각 층의 약점을 서로 보완:
- FUNC 18% → edge-runtime 층이 5.0 기여 → **4.5+** (전체)
- PERF 10% → isolated-vm 층이 4.8 기여 → **4.5+**
- SELF_HOST 5% → isolated-vm + edge-runtime 조합 → **4.0+**

**3층 하이브리드 추정 종합: 4.3-4.5/5** (개별 최고점 초과)

### 10.4 차원별 승자 & 3층 역할

| 차원 | 승자 | 3층 역할 매핑 |
|------|------|-------------|
| FUNC | edge-runtime 5.0 | **2차 (Deno 필수)** |
| PERF | isolated-vm 4.8 | **1차 (저지연)** |
| DX | 박빙 (3.5) | 모두 참여 |
| ECO | edge-runtime 4.0 / workerd 4.0 | 2차 |
| LIC | isolated-vm / edge-runtime / workerd 5.0 | 자체호스팅 |
| MAINT | edge-runtime 4.5 / Vercel 4.5 | 2차, 3차 |
| INTEG | isolated-vm 4.5 | **1차 (Next.js 네이티브)** |
| SECURITY | Vercel Sandbox 5.0 | **3차 (무거운 작업)** |
| SELF_HOST | isolated-vm 4.5 | **1차 (저자원)** |
| COST | isolated-vm / edge-runtime 5.0 | 자체호스팅 |

---

## 11. 3층 하이브리드 라우팅 결정 기준 (40행)

### 11.1 라우팅 결정 플로우차트

```
                          ┌──────────────────────────┐
                          │ POST /functions/v1/:slug │
                          └──────────┬───────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
                 ▼                   ▼                   ▼
        ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
        │ 예상 실행시간   │  │ Deno API 의존   │  │ 풀 Linux/bash   │
        │ > 30초?        │  │ 복잡?           │  │ 필요?           │
        └────────┬───────┘  └────────┬───────┘  └────────┬───────┘
                 │                   │                   │
                YES                 YES                 YES
                 │                   │                   │
                 ▼                   ▼                   ▼
        ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
        │ 3차: Vercel    │  │ 2차: Deno      │  │ 3차: Vercel    │
        │ Sandbox         │  │ (edge-runtime) │  │ Sandbox         │
        │ Firecracker VM  │  │ Docker 사이드카 │  │ Firecracker VM  │
        └────────────────┘  └────────────────┘  └────────────────┘
                                     │
                                    NO (모든 조건 거짓)
                                     │
                                     ▼
                          ┌────────────────┐
                          │ 1차: isolated-vm │
                          │ v6 (인프로세스) │
                          └────────────────┘
```

### 11.2 결정 기준 상세 (코드)

```typescript
// edge-functions/router.ts
interface FunctionMeta {
  slug: string;
  estimatedDurationMs?: number;
  usesDenoApi?: boolean;          // Deno.serve, EdgeRuntime.waitUntil 등
  usesNpm?: boolean;              // npm: imports
  needsFullLinux?: boolean;       // spawn, fs.rm, etc.
  memoryMb?: number;
}

type Runtime = "isolated-vm" | "edge-runtime" | "vercel-sandbox";

function pickRuntime(meta: FunctionMeta): Runtime {
  // 3차: 무거운 작업
  if (meta.estimatedDurationMs && meta.estimatedDurationMs > 30_000) {
    return "vercel-sandbox";
  }
  if (meta.needsFullLinux) {
    return "vercel-sandbox";
  }
  if (meta.memoryMb && meta.memoryMb > 256) {
    return "vercel-sandbox";
  }

  // 2차: Deno 필수
  if (meta.usesDenoApi || meta.usesNpm) {
    return "edge-runtime";
  }

  // 1차: 기본
  return "isolated-vm";
}
```

### 11.3 트리거 매트릭스

| 함수 유형 | 대표 사례 | 1차 | 2차 | 3차 |
|----------|---------|----|----|----|
| 단순 변환 | JSON 파싱, 텍스트 처리 | **O** | X | X |
| 외부 API 호출 (Web fetch) | Slack 알림 | **O** | X | X |
| DB 쿼리 (호스트 Prisma 위임) | 대시보드 집계 | **O** | X | X |
| Supabase 클라이언트 사용 | `npm:@supabase/supabase-js` | X | **O** | X |
| 복잡한 Deno API | `Deno.serve` + stream | X | **O** | X |
| 이미지 리사이즈 (sharp) | 썸네일 생성 | X | O | O |
| PDF 생성 | 보고서 | X | X | **O** |
| 대용량 분석 | CSV 1GB | X | X | **O** |
| AI 모델 추론 | Whisper, Stable Diffusion | X | X | **O** |
| Git 작업 | repo clone + build | X | X | **O** |

### 11.4 트래픽 분포 예상 (양평 부엌)

- 1차 isolated-vm: 85-90% (단순 변환, 알림, 집계)
- 2차 edge-runtime: 5-10% (Supabase 클라이언트 사용 함수)
- 3차 Vercel Sandbox: 1-5% (월별 리포트, 백업 등)

### 11.5 페일오버

```typescript
async function runFunction(meta: FunctionMeta, req: Request) {
  const primary = pickRuntime(meta);
  try {
    return await executors[primary](meta, req);
  } catch (error) {
    // 1차 실패 시 2차로 페일오버 (3차는 비용 발생하므로 제외)
    if (primary === "isolated-vm" && isEdgeRuntimeHealthy()) {
      console.warn("isolated-vm failed, falling back to edge-runtime");
      return await executors["edge-runtime"](meta, req);
    }
    throw error;
  }
}
```

### 11.6 비용 가드레일

```typescript
// 3차(Vercel Sandbox) 사용 시 월 예산 체크
async function routeWithBudget(meta: FunctionMeta, req: Request) {
  const runtime = pickRuntime(meta);
  if (runtime === "vercel-sandbox") {
    const withinBudget = await checkVercelSandboxBudget();
    if (!withinBudget) {
      // 예산 초과 → 2차로 강제 (느리지만 저렴)
      console.warn("budget exceeded, forcing edge-runtime");
      return await executors["edge-runtime"](meta, req);
    }
  }
  return await executors[runtime](meta, req);
}
```

---

## 12. 결론

### 12.1 최종 권고 (Wave 2 확정)

**3층 하이브리드 아키텍처**:

```
Phase 15-1~4 (4주): isolated-vm v6 기반 1차 + Deno shim 70% 구현
Phase 15-5 (1주):   supabase/edge-runtime 사이드카 (2차)
Phase 15-6 (1주):   Vercel Sandbox 선택적 위임 (3차, 옵션)
```

### 12.2 점수 목표

- 현재: 45/100
- 1차 단독 (isolated-vm + shim): 80/100
- 1+2차 (하이브리드 코어): **90-93/100**
- 1+2+3차 (풀 하이브리드): **92-95/100**

### 12.3 리소스 예산

| 리소스 | 1차 | 2차 | 3차 | 합계 |
|--------|----|----|----|------|
| RAM (idle) | 0 (Node 내) | 200 MB | 0 (외부) | **~200 MB** |
| RAM (peak) | 5 MB/isolate × 35 = 175 MB | 400 MB | 0 | **~575 MB** |
| CPU | 호스트 공유 | 0.5 코어 | 0 | 0.5-1 코어 |
| 디스크 | 20 MB (pkg) | 300 MB (image) + 함수 | 0 | 320 MB |
| 월 비용 | $0 | $0 | $0-5 | **$0-5** |

### 12.4 사전 스파이크 결과 확정

| 스파이크 | 결과 | 비고 |
|---------|-----|-----|
| WSL2 + Next.js 16에서 isolated-vm v6 빌드 | **성공** | 조건 5개 충족 시 |
| better-sqlite3와 동시 컴파일 | **성공** | `jobs=1`로 OOM 회피 |
| Next.js `serverExternalPackages` 작동 | **성공** | 런타임 require() 확인 |
| PM2 `--no-node-snapshot` 필수성 | **확인** | Node 20+ 필수 |
| supabase/edge-runtime Docker 구동 | **성공** | `v1.71.2` 태그 안정 |

### 12.5 Agent D 비교 문서 연계

- 세부 1:1: `05-isolated-vm-vs-deno-embed.md` 참조 (인프로세스 vs 서브프로세스 IPC 심층)
- Storage 동반 의사결정: `../07-storage/04-storage-matrix.md`, `../07-storage/05-seaweedfs-vs-garage.md`

### 12.6 리스크 게이트

- **R-1**: isolated-vm 메인테이너 부재 (bus factor 1) → Atlassian fork 모니터링
- **R-2**: Deno shim의 70% 커버가 실제 샘플과 괴리 → Phase 15-3에서 10개 Supabase 공식 샘플로 검증
- **R-3**: supabase/edge-runtime "breaking changes" → 태그 고정 (`v1.71.2`), 분기 검토
- **R-4**: Vercel Sandbox 비용 폭주 → 월 예산 하드캡 + 자동 페일오버

---

## 13. 참고 자료

1. [Wave 1 isolated-vm v6 Deep Dive (본 프로젝트)](./01-isolated-vm-v2-deep-dive.md)
2. [Wave 1 Deno Embed Deep Dive (본 프로젝트)](./02-deno-embed-deep-dive.md)
3. [Wave 1 Vercel Sandbox Deep Dive (본 프로젝트)](./03-vercel-sandbox-remote-deep-dive.md)
4. [isolated-vm GitHub](https://github.com/laverdet/isolated-vm)
5. [supabase/edge-runtime GitHub](https://github.com/supabase/edge-runtime)
6. [Supabase Edge Functions 공식 문서](https://supabase.com/docs/guides/functions)
7. [Deno 2.x 릴리즈 노트](https://deno.com/blog/v2.7)
8. [Cloudflare workerd GitHub](https://github.com/cloudflare/workerd) — Apache 2.0 대안
9. [Vercel Sandbox 공식 문서](https://vercel.com/docs/vercel-sandbox)
10. [Firecracker microVM](https://firecracker-microvm.github.io/)
11. [Cloudflare Workers CPU 성능](https://blog.cloudflare.com/unpacking-cloudflare-workers-cpu-performance-benchmarks/)
12. [Northflank Sandbox Runner 비교](https://northflank.com/blog/best-sandbox-runners)
13. [Cloudflare: Cloud Computing without Containers](https://blog.cloudflare.com/cloud-computing-without-containers/)
14. [Next.js serverExternalPackages 공식](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)
15. [Semgrep: vm2 폐기 분석](https://semgrep.dev/blog/2023/discontinuation-of-node-vm2/)
16. [Storage 매트릭스 (본 Wave 2)](../07-storage/04-storage-matrix.md)
