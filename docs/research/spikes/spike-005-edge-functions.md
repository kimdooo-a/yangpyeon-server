# Spike 005 — Edge Functions 경량 이식 (Node.js + WSL2/PM2)

- 상태: Research
- 작성일: 2026-04-12
- 대상: stylelucky4u.com 서버 대시보드
- 관련 세션: 세션 8 준비용 선행 리서치

---

## 목적

Supabase Edge Functions(Deno 기반)의 UX를 Next.js 15 + Node.js 환경에서 "lite"로 재현한다.
사용자가 작은 JS/TS 스니펫을 저장하고 HTTP(`POST /api/v1/functions/:id/run`)로 트리거한다. WSL2 Ubuntu + PM2 단일 인스턴스 전제이므로 **멀티테넌트급 강격리**가 아니라 "신뢰된 관리자용 스크립트 러너" 수준을 목표로 한다.

---

## GitHub 레퍼런스 (격리 실행)

| 후보 | URL | 샌드박스 안전성 |
|---|---|---|
| `isolated-vm` | https://github.com/laverdet/isolated-vm | ★★★★☆ V8 Isolate 분리, 메모리/CPU 타임 제한 API, 네이티브 애드온 — 프로덕션 다수 사례(CloudFlare 초기, Figma 등). 빌드 복잡(node-gyp), Node 메이저 업데이트 시 지연 존재 |
| `vm2` | https://github.com/patriksimek/vm2 | ★☆☆☆☆ **DEPRECATED (2023-07)**. CVE-2023-37466/37903 등 탈출 취약점 다수. 신규 도입 금지 |
| `worker_threads` 러너 예시 | https://github.com/nodejs/node/blob/main/doc/api/worker_threads.md (공식) / 참고 OSS: https://github.com/breejs/bree | ★★☆☆☆ 프로세스/스레드 수준 격리만 제공. `vm` 모듈과 결합해도 완전 샌드박스는 아님. `resourceLimits`로 메모리/스택 제한 가능 |
| `@e2b/dev` SDK | https://github.com/e2b-dev/E2B | ★★★★★ Firecracker microVM 원격 실행. 로컬 WSL 자체 호스팅 목적과는 불일치(외부 API) |
| Vercel Sandbox | https://vercel.com/docs/vercel-sandbox | ★★★★★ Firecracker 기반 ephemeral VM, 2026 GA. Vercel 런타임 전용 — WSL/PM2 자체 서버에는 직접 적용 불가 |

선정 순위: **`isolated-vm` (권장)** > `worker_threads`+`node:vm` 조합(lite) > Vercel Sandbox(장기 이전 옵션). `vm2`는 채택 금지.

---

## 공식 Docs

- `node:worker_threads` — https://nodejs.org/api/worker_threads.html
  - `new Worker(filename, { resourceLimits: { maxOldGenerationSizeMb, maxYoungGenerationSizeMb, codeRangeSizeMb, stackSizeMb } })`
  - `stdin/stdout/stderr` 옵션으로 파이프 캡처, `worker.terminate()`로 강제 종료
  - `execArgv`로 Node 플래그 개별 전달
- `node:vm` — https://nodejs.org/api/vm.html
  - `vm.Script` / `vm.createContext` / `script.runInContext(ctx, { timeout, breakOnSigint })`
  - 제약: **진정한 샌드박스 아님** (docs에 명시). `require`/`process`가 컨텍스트에 노출되면 탈출 가능. 타임아웃은 동기 코드에만 적용
- `isolated-vm` — https://www.npmjs.com/package/isolated-vm
  - `ivm.Isolate({ memoryLimit: 128 })`, `isolate.createContext()`, `script.run(context, { timeout })`
  - 별도 V8 힙, CPU 시간(`isolate.cpuTime`)/메모리(`isolate.getHeapStatistics()`) 측정
- Vercel Sandbox — https://vercel.com/docs/vercel-sandbox

---

## 자체 구현 난이도 (WSL2 + PM2 로컬)

| 요구사항 | 난이도 | 비고 |
|---|---|---|
| 실행 타임아웃 30s | 낮음 | `worker.terminate()` + `setTimeout` / `isolated-vm`의 `timeout` 옵션 |
| 메모리 상한 | 낮음~중간 | `resourceLimits.maxOldGenerationSizeMb` 또는 `ivm` `memoryLimit` |
| CPU 제한 | 중간 | 단일 워커 1코어 점유. WSL2에서는 cgroup 접근 어려움 → 소프트 타임박스로 대체 |
| 파일시스템 격리 | 높음 | Node `fs`는 워커에서도 접근 가능. `isolated-vm`에서 `fs` 바인딩 **제거**하고 필요 시 가상 FS(Map) 제공 |
| 네트워크 격리(fetch 제한) | 중간 | 글로벌 `fetch`를 래핑하여 도메인 화이트리스트·호출 카운트 제한. `undici` 커스텀 `Agent`로 SSRF 방어(127.0.0.1/169.254.169.254/사설망 차단) |
| stdout/stderr 캡처 | 낮음 | `MessagePort`로 `console.*` 리다이렉트, 최대 바이트 캡 |
| 모듈 import | 높음 | 임의 `require` 허용 시 탈출 위험. **화이트리스트만 주입** (예: `fetch`, `crypto`, `dayjs`) |

**Lite 모드 권장** (관리자 전용, 단일 테넌트):
- 실행: `worker_threads` + `node:vm`, `require` 미노출, 주입 API = `fetch`(래핑)·`log()`·`env`(읽기전용)
- 금지: `child_process`, `fs`, `net`, `dgram`, dynamic `import()`, eval 문자열 전달
- 제한: 30s wall-clock, 128MB 힙, stdout 64KB, fetch 10회·화이트리스트 도메인

---

## 권장 아키텍처

### Prisma 모델
```prisma
model EdgeFunction {
  id        String   @id @default(cuid())
  name      String   @unique
  code      String   @db.Text
  runtime   String   @default("node-lite") // 'node-lite' | 'isolated-vm' (v2)
  timeoutMs Int      @default(30000)
  memoryMb  Int      @default(128)
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  runs      EdgeFunctionRun[]
}

model EdgeFunctionRun {
  id         String   @id @default(cuid())
  functionId String
  status     String   // 'success' | 'error' | 'timeout'
  durationMs Int
  stdout     String   @db.Text
  stderr     String   @db.Text
  createdAt  DateTime @default(now())
  function   EdgeFunction @relation(fields: [functionId], references: [id], onDelete: Cascade)
}
```

### API 라우트 (Next.js App Router)
- `GET/POST    /api/v1/functions` — 목록/생성
- `GET/PATCH/DELETE /api/v1/functions/[id]` — 단건
- `POST   /api/v1/functions/[id]/run` — 실행 (ADMIN만, CSRF 적용)
- `GET    /api/v1/functions/[id]/runs` — 실행 이력
- 런타임: **Node.js runtime 강제** (`export const runtime = 'nodejs'`), Edge runtime 금지

### 실행기 (`src/lib/functions/runner.ts`)
- `worker_threads.Worker`로 `runner-worker.js` 로드
- 부모가 `resourceLimits` + 30s 타임아웃 감시 → `worker.terminate()`
- 워커 내부는 `node:vm.createContext({ fetch: safeFetch, console: captureConsole, env: frozen })` 후 `script.runInContext(ctx, { timeout })`
- 결과는 `parentPort.postMessage({ ok, result, stdout, stderr })`

### UI
- `/functions` 목록 + `/functions/[id]` 편집 (Monaco Editor, `@monaco-editor/react`)
- 템플릿 카탈로그 3-5개:
  1. Hello World
  2. Webhook Receiver (request body → DB insert)
  3. Scheduled Fetcher (외부 API → 결과 저장)
  4. Slack/Discord Notifier
  5. Data Transformer (JSON → 정규화)
- "실행" 버튼 → `/run` 호출 후 stdout/stderr 패널에 스트리밍(초기엔 단건 응답, v2에서 SSE)

---

## 보안 주의

- **vm2 절대 금지** — deprecated, 공개 탈출 PoC 존재
- **`child_process.exec` / `spawn` 금지** — 코드 내 호출 차단(AST 검사 또는 컨텍스트 미노출)
- **파일시스템 기본 차단** — `fs`, `fs/promises`, `path.resolve` 미노출
- **SSRF 방어** — 래핑 `fetch`에서 사설 IP/169.254/localhost 차단, 리다이렉트 화이트리스트
- **코드 저장 크기 제한** — 256KB
- **ADMIN 전용** — `withAuth` + 역할 체크, CSRF 보호(회원관리와 동일 정책)
- **Audit 로그** — 누가 언제 어떤 함수 생성/수정/실행했는지 `EdgeFunctionRun`과 별도 `AuditLog` 연계

---

## 결정

- v1 = **Lite 모드** (`worker_threads` + `node:vm` + 화이트리스트 API). ADMIN 전용. 30s·128MB·fetch 화이트리스트
- v2 = 필요 시 **`isolated-vm`** 승격 (멀티 사용자 또는 외부 노출 시점). 빌드 CI에 `node-gyp` 준비
- v3 = 장기적으로 원격 `@e2b` 또는 Vercel Sandbox로 오프로딩 검토 (WSL 장애 시 페일오버)
- `vm2` 채택 금지 / 원격 Deno 실행 도입 금지 (스택 복잡도 상승)

---

## 다음 TODO

1. `prisma/schema.prisma`에 `EdgeFunction`, `EdgeFunctionRun` 추가 + 마이그레이션
2. `src/lib/functions/runner.ts` + `runner-worker.js` 구현 (lite 모드)
3. `src/lib/functions/safe-fetch.ts` — SSRF 가드 + 도메인 화이트리스트
4. `/api/v1/functions` CRUD 5개 라우트 (ADMIN 가드 + CSRF)
5. `/functions` UI + Monaco 에디터 + 템플릿 5종 JSON 시드
6. 해피패스 테스트: Hello World 실행 / 타임아웃 / 메모리 초과 / fetch 차단 도메인
7. 세션 8 MASTER-DEV-PLAN에 "Edge Functions v1 (Lite)" 항목 추가
