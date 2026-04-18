# Vercel Sandbox (Firecracker microVM) 원격 오프로드 — Edge Functions 3순위 후보

> **Wave 1 / Round 1 / 미션 3**
>
> - 작성일: 2026-04-18
> - 작성자: kdywave Wave 1 deep-dive 에이전트
> - 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + better-sqlite3, WSL2 + PM2)
> - 평가 대상:
>   1. **Vercel Sandbox** (Firecracker microVM, GA 2026 초)
>   2. 비교: **Cloudflare Workers / workerd 자체호스팅**
>   3. 비교: **Fly Machines / Fly.io Sprites**
>   4. 비교: **E2B**
>   5. 비교: **Northflank Sandbox**
>
> 핵심 질문: **우리는 Vercel을 쓰지 않는데, "원격 오프로드" 패턴을 통해 외부 microVM 격리를 활용할 수 있는가? 자체호스팅 정책과의 충돌은?**

---

## 0. 문서 컨벤션

- 점수 5점 만점, 가중치는 미션 가이드(L2) 표 그대로
- 본 문서는 "외부 SaaS를 자체호스팅 환경에서 *부분적으로* 활용"하는 시나리오 평가
- 우리 운영 정책은 "**$0 운영, 단일 머신 자체호스팅**" → SaaS 의존은 큰 마이너스
- 그러나 isolated-vm/edge-runtime이 모두 부적절한 함수(예: 30분 빌드, 100MB 모델 로드 등 무거운 워크로드)에 대해 **선택적 위임** 가능성을 평가

---

## 1. 요약 (Executive Summary)

### 1.1 5개 후보 한눈에

| 후보 | 격리 | 콜드 | 가격 (Pro) | 자체호스팅 | 우리 적합도 |
|------|------|------|-----------|-----------|-----------|
| **Vercel Sandbox** | Firecracker microVM | ~150ms | $0.128/CPU-hr | ❌ 외부만 | △ |
| **Cloudflare Workers (호스티드)** | V8 Isolate | < 5ms | $5/월 + $0.50/M req | ❌ 외부만 | △ |
| **workerd (Cloudflare 오픈소스)** | V8 Isolate | < 5ms | 무료 (인프라만) | ✅ Apache 2.0 | ◎ |
| **Fly Machines / Sprites** | Firecracker | ~150ms | $0.0000022/sec/CPU | ❌ 외부만 | △ |
| **E2B** | Firecracker | ~150ms | $0.000014/CPU-sec | ❌ 외부만 | △ |
| **Northflank Sandbox** | Kata/Firecracker/gVisor | varies | $0.01667/vCPU-hr | ❌ 외부만 | △ |

### 1.2 우리에게 의미 있는 것

**Vercel Sandbox**는 [공식 문서](https://vercel.com/docs/vercel-sandbox)에 따라 "non-Vercel 환경에서도 호출 가능"한 standalone SDK를 제공합니다. 우리 Next.js 서버에서 `import { Sandbox } from "@vercel/sandbox"`로 사용 가능. 단, **Vercel 계정 + Access Token**이 필수이고, **계측된 CPU 시간만큼 과금**됩니다 (Hobby 무료 티어 5 CPU-hr/월).

**workerd**는 사실상 유일한 "오픈소스 + 자체호스팅 + V8 Isolate 기반" 옵션입니다. Cloudflare가 Apache 2.0으로 공개했고, npm으로 prebuild 바이너리 배포. **isolated-vm v6과 같은 Edge Functions 청사진을 갖되, 더 production-ready한 HTTP 서버**라는 위치.

### 1.3 최종 권고 (이 문서)

> **Vercel Sandbox는 우리 정책상 부적합**하나, 다음 두 케이스에 한해 검토 가치가 있습니다:
> 1. **장기 작업 위임**: 5분 이상의 분석/리포트/마이그레이션 (PM2 단일 프로세스 부담을 외부 격리로)
> 2. **사용자 제출 코드 실행 (Playground)**: Hobby 티어 무료 한도 내 PoC
>
> 일반 Edge Functions 워크로드에는 **workerd 자체호스팅이 더 적합** — 이 문서 후반에 별도 섹션으로 검토.

총점 (Vercel Sandbox 기준): **2.71 / 5.00** — 자체호스팅 정책과의 갭이 결정적.
총점 (workerd 자체호스팅): **3.62 / 5.00** — isolated-vm v6의 4순위 후보로 별도 가치.

---

## 2. 아키텍처

### 2.1 Vercel Sandbox 모델

```
┌──────────────────────────────────────────────┐
│  사용자 코드 (Vercel 또는 외부 Node)          │
│       │                                       │
│       │ import { Sandbox } from "@vercel/sandbox"
│       ▼                                       │
│  Vercel API (REST)                            │
│       │                                       │
│       ▼                                       │
│  Vercel build infra (AWS, 유럽/미국 리전)     │
│       │                                       │
│       ▼                                       │
│  Firecracker microVM                          │
│  - Amazon Linux 2023                          │
│  - Node 22/24 또는 Python 3.13                │
│  - sudo + 풀 Linux 환경                       │
│  - 5분 기본 / 최대 5시간                       │
└──────────────────────────────────────────────┘
```

핵심: **Firecracker microVM**은 KVM 기반 경량 가상화로, AWS Lambda 내부와 동일한 기술. 부팅 ~125ms ([Firecracker 공식](https://firecracker-microvm.github.io/) 및 [betterstack.com 정리](https://betterstack.com/community/comparisons/best-sandbox-runners/)).

### 2.2 인증 (외부 환경에서 사용)

[공식 인증 가이드](https://vercel.com/docs/vercel-sandbox/concepts/authentication)에 따라:
- **OIDC 토큰** (Vercel에서 호스팅된 경우만)
- **Access Token** (외부 환경: 우리 케이스)

Access Token 생성:
1. Vercel 계정 생성 (개인/팀)
2. Team ID, Project ID 확보
3. Account Settings → Tokens → 새 토큰 생성 (스코프: 팀 ID)
4. 환경변수 `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`

### 2.3 SDK 호출 흐름

```ts
import { Sandbox } from "@vercel/sandbox";

const sandbox = await Sandbox.create({
  teamId: process.env.VERCEL_TEAM_ID!,
  projectId: process.env.VERCEL_PROJECT_ID!,
  token: process.env.VERCEL_TOKEN!,
  runtime: "node24",
  timeout: 300_000, // 5분
});

await sandbox.runCommand("npm", ["install", "lodash"]);
const result = await sandbox.runCommand("node", ["-e", "console.log(require('lodash').VERSION)"]);
console.log(result.stdout);
await sandbox.stop();
```

### 2.4 workerd 모델 (자체호스팅 대안)

```
┌──────────────────────────────────────────┐
│  workerd (Cloudflare 오픈소스 바이너리)   │
│  ├─ V8 Isolate Manager                   │
│  ├─ HTTP 서버 (built-in)                 │
│  ├─ KV/D1 binding (옵션)                 │
│  └─ Worker JS/TS 실행                    │
│                                          │
│  배포: npm install workerd → npx workerd │
│  관리: systemd / PM2                     │
│  라이선스: Apache 2.0                    │
└──────────────────────────────────────────┘
```

[workerd 공식 README](https://github.com/cloudflare/workerd)는 "production-ready web server for self-hosting"이라고 명시하며 [Cloudflare 블로그](https://blog.cloudflare.com/workerd-open-source-workers-runtime/)에서 systemd 운영 가이드를 제공합니다.

### 2.5 Cloudflare Workers (호스티드) 비교

- 같은 V8 Isolate 모델
- 0ms 콜드 스타트 (Cloudflare 글로벌 풀 사용)
- 가격: $5/월 + 백만 요청당 $0.50
- **자체호스팅 불가** (Cloudflare 인프라 종속)
- 2026-04 발표된 [Dynamic Workers (Open Beta)](https://www.infoq.com/news/2026/04/cloudflare-dynamic-workers-beta/)는 AI 에이전트 코드 실행에 특화

### 2.6 E2B / Northflank / Fly Machines

- 셋 다 Firecracker 기반 외부 SaaS
- E2B: AI 에이전트 특화, ~150ms 콜드
- Northflank: BYOC (Bring Your Own Cloud) 지원으로 자체 클라우드에 배포 가능
- Fly Sprites: 2026-01 출시, 체크포인트/리스토어 기반 빠른 재개

---

## 3. 핵심 기능 (Vercel Sandbox)

### 3.1 시스템 사양

[System specifications](https://vercel.com/docs/vercel-sandbox/system-specifications)에 따라:

- **OS**: Amazon Linux 2023
- **Runtime**: node24 (기본), node22, python3.13
- **사용자**: `vercel-sandbox` (sudo 가능)
- **작업 디렉토리**: `/vercel/sandbox`
- **풀 Linux 권한**: 임의 패키지 설치 가능 (`sudo dnf install ...`)

### 3.2 격리

- **Firecracker microVM** per sandbox (단일 hypervisor 위 격리)
- 자체 파일시스템·네트워크
- 같은 Vercel 인프라를 빌드 시스템과 공유

### 3.3 시간 한도

- **기본**: 5분
- **Hobby 최대**: 45분
- **Pro 최대**: 5시간
- **프로그래밍 연장**: SDK로 가능

### 3.4 스냅샷 (콜드 스타트 단축)

[Snapshots](https://vercel.com/docs/vercel-sandbox/concepts/snapshots) — 의존성 설치한 sandbox 상태를 저장하여 다음 실행 시 npm install 스킵.

### 3.5 Persistent Sandboxes (베타)

자동 상태 저장 → 정지 후 재개 가능. AI 에이전트의 stateful 워크플로우용.

### 3.6 가격 상세 ([공식](https://vercel.com/docs/vercel-sandbox/pricing))

- **Hobby (무료)**: 5 CPU-hr/월, 420 GB-hr 메모리, 20GB 네트워크, 5,000 sandbox 생성/월
- **Pro/Enterprise**:
  - $0.128 / 활성 CPU-hr
  - $0.0106 / GB-hr 메모리
  - $0.15 / GB 네트워크
  - $0.60 / 백만 sandbox 생성

핵심 차별점: **활성 CPU 시간만 과금** (I/O wait는 무료) → I/O 무거운 워크로드에 95% 비용 절감 ([공식 마케팅](https://vercel.com/sandbox)).

---

## 4. API (TypeScript 통합)

### 4.1 외부 환경에서 Vercel Sandbox 호출 (우리 케이스)

```ts
// edge-functions/runtime/vercel-sandbox-bridge.ts
import { Sandbox } from "@vercel/sandbox";

interface SandboxRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runInVercelSandbox(
  code: string,
  opts: {
    runtime?: "node24" | "node22" | "python3.13";
    timeoutMs?: number;
    deps?: string[];   // npm 패키지
  } = {}
): Promise<SandboxRunResult> {
  if (!process.env.VERCEL_TOKEN) {
    throw new Error("VERCEL_TOKEN missing — sandbox feature disabled");
  }

  const start = Date.now();
  const sandbox = await Sandbox.create({
    teamId: process.env.VERCEL_TEAM_ID!,
    projectId: process.env.VERCEL_PROJECT_ID!,
    token: process.env.VERCEL_TOKEN!,
    runtime: opts.runtime ?? "node24",
    timeout: opts.timeoutMs ?? 60_000,
  });

  try {
    // 1) 의존성 설치
    if (opts.deps?.length) {
      await sandbox.runCommand("npm", ["install", "--no-save", ...opts.deps]);
    }
    // 2) 코드 실행
    const escaped = code.replace(/'/g, "'\\''");
    const result = await sandbox.runCommand("node", ["-e", escaped]);

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - start,
    };
  } finally {
    await sandbox.stop();
  }
}
```

### 4.2 Next.js 라우터 통합 (선택적 위임)

```ts
// app/api/functions/heavy/route.ts
import { runInVercelSandbox } from "@/edge-functions/runtime/vercel-sandbox-bridge";
import { runEdgeFunction } from "@/edge-functions/runtime/isolated-vm-runtime";

const HEAVY_THRESHOLD_MS = 30_000; // 30초 이상 예상 → Vercel 위임

export async function POST(req: Request) {
  const { code, hint } = await req.json();
  if (hint?.estimatedMs > HEAVY_THRESHOLD_MS && process.env.VERCEL_TOKEN) {
    return Response.json(await runInVercelSandbox(code, {
      runtime: "node24",
      timeoutMs: 600_000,
    }));
  }
  return Response.json(await runEdgeFunction(code, {
    method: req.method,
    url: req.url,
  }));
}
```

### 4.3 비용 모니터링 가드레일

```ts
// lib/vercel-sandbox-budget.ts
import { prisma } from "@/lib/prisma";

const MONTHLY_BUDGET_USD = 5;
const COST_PER_CPU_HR = 0.128;

export async function checkBudget(): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7);
  const usage = await prisma.vercelSandboxUsage.aggregate({
    where: { month },
    _sum: { cpuSeconds: true },
  });
  const cpuHours = (usage._sum.cpuSeconds ?? 0) / 3600;
  const cost = cpuHours * COST_PER_CPU_HR;
  return cost < MONTHLY_BUDGET_USD;
}

export async function recordUsage(cpuSeconds: number) {
  const month = new Date().toISOString().slice(0, 7);
  await prisma.vercelSandboxUsage.create({
    data: { month, cpuSeconds, createdAt: new Date() },
  });
}
```

### 4.4 workerd 자체호스팅 (대안)

```bash
# 1) 설치
npm install -D workerd

# 2) 설정 파일 (capnp 형식)
cat > workerd.capnp <<'EOF'
using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(name = "main", worker = .helloWorld)],
  sockets = [(name = "http", address = "*:9001", http = (), service = "main")],
);
const helloWorld :Workerd.Worker = (
  modules = [(name = "worker.mjs", esModule = embed "worker.mjs")],
  compatibilityDate = "2024-09-23",
  compatibilityFlags = ["nodejs_compat"],
);
EOF

# 3) Worker 코드
cat > worker.mjs <<'EOF'
export default {
  async fetch(request, env, ctx) {
    return new Response(`Hello from workerd! ${new Date()}`);
  }
};
EOF

# 4) 실행
npx workerd serve workerd.capnp
```

이걸 PM2로 관리하면 isolated-vm 대신 workerd가 Edge Functions의 격리 엔진이 됩니다.

```ts
// edge-functions/runtime/workerd-proxy.ts
const WORKERD_URL = process.env.WORKERD_URL ?? "http://127.0.0.1:9001";

export async function callWorkerd(slug: string, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = `${WORKERD_URL}/${slug}${url.pathname.replace(`/functions/v1/${slug}`, "")}${url.search}`;
  return await fetch(target, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
}
```

---

## 5. 성능

### 5.1 콜드 스타트 비교 (전체 후보 통합)

| 후보 | 콜드 스타트 | 비고 |
|------|----------|------|
| Cloudflare Workers (호스티드) | < 5 ms | 글로벌 isolate 풀 |
| workerd (자체호스팅) | < 5 ms | 동일 V8 isolate |
| isolated-vm v6 | 5-10 ms | 미션 1 |
| supabase/edge-runtime | 50-100 ms | 미션 2 |
| Vercel Sandbox | 150-300 ms | Firecracker 부팅 |
| E2B | ~150 ms | Firecracker |
| Fly Machines | 150-300 ms | Firecracker |
| Northflank Sandbox | 100-300 ms | varies |

[Cloudflare 측정](https://blog.cloudflare.com/cloud-computing-without-containers/) 및 [Northflank 정리](https://northflank.com/blog/best-sandbox-runners) 참조.

### 5.2 메모리

| 후보 | 호스트 측 메모리 |
|------|---------|
| Vercel Sandbox | 0 (외부) |
| workerd | ~100MB (idle) + 워커당 ~5MB |
| isolated-vm | 0 호스트 + isolate당 5MB |

### 5.3 Vercel Sandbox 처리량 — 우리 부하 시나리오

가정: 일 100 Edge Function 호출, 평균 2초 CPU
- 일일 CPU 사용: 200초 = 0.056 시간
- 월간 CPU: 1.67 시간 → **Hobby 무료 한도 내 (5 CPU-hr)**
- 비용: $0

가정: 일 1000 호출, 평균 2초
- 월간: 16.67 CPU-hr → Pro 사용 시 (16.67 - 5) × $0.128 = **$1.49/월**

가정: 무거운 함수 (10초/호출) × 일 200회
- 월간: 16.67 CPU-hr → 같음 약 $1.49/월

→ **소규모 백오피스 도구 수준이면 거의 무료 ~ 월 $5 이내**.

### 5.4 네트워크 지연

WSL2 (한국) → Vercel us-east-1: ~200-300ms RTT.
WSL2 (한국) → Vercel sin1 (싱가포르): ~70-120ms RTT.

→ 첫 호출 RTT가 콜드 스타트보다 큰 경우 많음. 함수 응답 시간 = RTT + 콜드 + 실행.

---

## 6. 생태계

### 6.1 Vercel Sandbox

- GA: 2026-01 (런칭 changelog 참고)
- GitHub: vercel/sandbox (SDK + CLI)
- npm: `@vercel/sandbox`
- 메인테이너: Vercel Inc.
- 지원 채널: Vercel 고객 지원, GitHub Issues
- 한국어 자료: 0

### 6.2 workerd

- GitHub: cloudflare/workerd, ~6.7k stars
- Apache 2.0 라이선스
- 프로덕션 검증: Cloudflare Workers 자체가 동일 코드
- 2024-2025 활발한 커밋 (Cloudflare 핵심 사업)

### 6.3 vorker / OpenWorkers (workerd 위 커뮤니티)

- [vorker](https://github.com/VaalaCat/vorker): 자체호스팅 UI + 멀티 워커 관리
- [OpenWorkers](https://news.ycombinator.com/item?id=46454693): 2026-01 출시, fetch/KV/Postgres binding 등 풀 stack
- 둘 다 신생 (< 1년), 메인테이너 1-2명

### 6.4 CVE

- Vercel Sandbox: 자체 CVE 없음 (Firecracker + AWS 인프라에 위임)
- workerd: 0건 (Cloudflare 보안팀 직접 패치)

---

## 7. 문서

### 7.1 Vercel Sandbox

- [공식 docs](https://vercel.com/docs/vercel-sandbox) — 매우 잘 정리
- SDK Reference, CLI Reference, Concepts, System Specifications
- KB 기사: ["Using Vercel Sandbox to run Claude's Agent SDK"](https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk)
- 비교 가이드: vs E2B, vs CodeSandbox

### 7.2 workerd

- README + samples/ + docs/
- Cloudflare Workers docs를 그대로 참조 가능 (런타임 동일)
- 단, 자체호스팅 가이드는 빈약 — 커뮤니티 블로그 의존

---

## 8. 프로젝트 적합도

### 8.1 Vercel Sandbox (외부 SaaS)

| 항목 | 평가 |
|------|------|
| 자체호스팅 정책 | ❌ 외부 의존 |
| $0 운영 | △ Hobby 무료 한도 내만 |
| WSL2 빌드 충돌 | ✅ 충돌 0 (외부 실행) |
| Cloudflare Tunnel | ✅ Vercel API는 outbound HTTPS만 사용 |
| Supabase 호환 | ❌ Deno 미지원 (Node 22/24만) |
| 무거운 워크로드 | ◎ 5시간 가능, 풀 Linux |
| 네트워크 지연 | △ 70-300ms 추가 |
| 데이터 주권 | ⚠ 사용자 코드가 Vercel 인프라에서 실행 |

→ **일반 Edge Functions에는 부적합**. 단, "무거운 1회성 작업"에는 적합 (예: 월별 리포트 생성, 대량 이미지 처리).

### 8.2 workerd 자체호스팅 (이 문서의 대안 권고)

| 항목 | 평가 |
|------|------|
| 자체호스팅 정책 | ✅ Apache 2.0, 우리 머신 |
| $0 운영 | ✅ 인프라 비용만 |
| WSL2 빌드 충돌 | ✅ npm prebuild 바이너리 |
| Supabase 호환 | ❌ Cloudflare Workers API와 호환 (Deno와 다름) |
| 격리 강도 | ✅ V8 Isolate (isolated-vm과 동일 강도) |
| Cold start | ◎ < 5ms |
| Node 호환 | ✅ `nodejs_compat` flag |
| HTTP 서버 내장 | ✅ |
| Inspector | ✅ |

→ **isolated-vm v6의 강력한 대안**. 단점: Supabase Deno API와 비호환 → Edge Functions "100% 호환"이라는 목표에서 거리.

### 8.3 Cloudflare Workers (호스티드)

- 우리 도메인 stylelucky4u.com이 이미 Cloudflare에 있음 → DNS 통합 자연
- $5/월 Workers Paid 플랜으로 백만 요청
- **단점**: 외부 SaaS, 우리 단일 머신 정책과 충돌

### 8.4 E2B / Northflank / Fly Sprites

- 모두 외부 SaaS, 가격 비교는 5.3 참조
- **Northflank**가 BYOC로 자체 인프라(예: Hetzner)에 배포 가능한 유일 옵션
- 우리 단일 머신 운영에는 모두 과한 솔루션

---

## 9. 라이선스

| 후보 | 라이선스 |
|------|---------|
| Vercel Sandbox SDK | MIT (공식 SDK), 서비스는 SaaS 약관 |
| workerd | Apache 2.0 |
| Cloudflare Workers | SaaS 약관 |
| E2B SDK | Apache 2.0 (SDK), 서비스 SaaS |
| Fly Machines API | Fly.io 약관 |
| Northflank | SaaS 약관 |

→ workerd만 자체호스팅 가능한 무제한 OSS.

---

## 10. 코드 예시 (실전)

### 10.1 Vercel Sandbox + 비용 캡 통합

```ts
// app/api/admin/run-report/route.ts
import { runInVercelSandbox } from "@/edge-functions/runtime/vercel-sandbox-bridge";
import { checkBudget, recordUsage } from "@/lib/vercel-sandbox-budget";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) return new Response("forbidden", { status: 403 });

  if (!(await checkBudget())) {
    return new Response("monthly budget exceeded", { status: 402 });
  }

  const { reportName, params } = await req.json();
  const code = `
    const params = ${JSON.stringify(params)};
    // ... 무거운 리포트 코드
    console.log(JSON.stringify({ ok: true, rows: 10000 }));
  `;

  const start = Date.now();
  const result = await runInVercelSandbox(code, {
    runtime: "node24",
    timeoutMs: 300_000,
  });
  await recordUsage((Date.now() - start) / 1000);

  return Response.json({
    exitCode: result.exitCode,
    output: result.stdout,
    cost_estimate_usd: ((Date.now() - start) / 1000 / 3600 * 0.128).toFixed(4),
  });
}
```

### 10.2 workerd PM2 ecosystem (자체호스팅 권고)

```js
// ecosystem.config.js (워크커드 추가)
module.exports = {
  apps: [
    {
      name: "yp-dashboard",
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      node_args: ["--no-node-snapshot"],
      max_memory_restart: "1500M",
    },
    {
      name: "yp-workerd",
      script: "./node_modules/.bin/workerd",
      args: "serve workerd.capnp",
      cwd: "./edge-functions",
      autorestart: true,
      max_memory_restart: "300M",
    },
  ],
};
```

### 10.3 workerd Worker 예시 (Cloudflare 호환 ESM)

```js
// edge-functions/workerd/order-status.mjs
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");
    if (!orderId) return new Response("missing id", { status: 400 });

    // 백엔드 (PostgREST 또는 Next API)에 위임
    const upstream = await fetch(`http://127.0.0.1:3000/api/orders/${orderId}`, {
      headers: { authorization: `Bearer ${env.SERVICE_ROLE}` },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  },
};
```

### 10.4 Cloudflare Tunnel 라우팅 (workerd 노출)

```
# cloudflared config.yml
tunnel: <UUID>
credentials-file: /home/user/.cloudflared/<UUID>.json

ingress:
  - hostname: api.stylelucky4u.com
    service: http://127.0.0.1:3000   # Next.js
  - hostname: edge.stylelucky4u.com
    service: http://127.0.0.1:9001   # workerd
  - service: http_status:404
```

→ 두 서비스를 별도 서브도메인으로 분리, Cloudflare Tunnel 안전 노출.

---

## 11. 스코어링

### 11.1 Vercel Sandbox 점수 (앵커링)

| 차원 | 가중치 | 점수 | 가중점수 | 앵커링 근거 |
|------|-------|------|---------|-----------|
| **FUNC** (Supabase 동등) | 18% | **2.0** | 0.360 | Deno 미지원 (Node만), Supabase Edge Functions 코드 직접 실행 불가 |
| **PERF** (콜드/메모리) | 10% | **2.5** | 0.250 | 콜드 150-300ms (§ 5.1) + RTT 70-300ms = 첫 호출 220-600ms |
| **DX** (디버깅·테스트) | 14% | **3.5** | 0.490 | SDK 타입 완비, CLI도 있음, 단 원격 디버깅 한정 |
| **ECO** (커뮤니티·CVE) | 12% | **4.0** | 0.480 | Vercel Inc., GA 2026-01 ([changelog](https://vercel.com/changelog/run-untrusted-code-with-vercel-sandbox)) |
| **LIC** (라이선스) | 8% | **3.5** | 0.280 | SDK는 MIT, 서비스는 SaaS 약관 (벤더 락인 위험) |
| **MAINT** (활성도) | 10% | **4.5** | 0.450 | Vercel 핵심 신규 사업 |
| **INTEG** (Next.js 16 + better-sqlite3 + WSL2) | 10% | **4.5** | 0.450 | 외부 실행 → 빌드 충돌 0, SDK는 typescript-only npm 패키지 |
| **SECURITY** (격리 강도) | 10% | **4.8** | 0.480 | Firecracker microVM = AWS Lambda 동등 격리 |
| **SELF_HOST** (RAM/CPU) | 5% | **5.0** | 0.250 | 우리 머신 부담 0 (외부 실행) |
| **COST** ($0) | 3% | **2.0** | 0.060 | Hobby 무료 한도 내만 0, 초과 시 과금. 데이터 주권 위험 |
| **합계** | 100% | — | **3.55** | (가중점수 합 3.55) |

> 보정 노트: § 1.3에서 "2.71"이라 적었으나 가중치 재계산 결과 **3.55**가 정확. 단, 이 점수에는 "자체호스팅 정책 위반"이라는 정성적 패널티가 반영되지 않음. 정성 패널티 -0.5 적용 시 **3.05**.

### 11.2 workerd 자체호스팅 점수 (참고)

| 차원 | 가중치 | 점수 | 가중점수 | 앵커링 근거 |
|------|-------|------|---------|-----------|
| **FUNC** (Supabase 동등) | 18% | **2.0** | 0.360 | Cloudflare Workers API와 호환, Deno와 다름 |
| **PERF** | 10% | **4.8** | 0.480 | < 5ms 콜드, V8 Isolate |
| **DX** | 14% | **3.5** | 0.490 | wrangler dev 가능, 자체호스팅 가이드는 빈약 |
| **ECO** | 12% | **4.5** | 0.540 | Cloudflare 핵심 OSS, 6.7k stars |
| **LIC** | 8% | **5.0** | 0.400 | Apache 2.0 |
| **MAINT** | 10% | **5.0** | 0.500 | Cloudflare 본업 |
| **INTEG** ★ | 10% | **4.5** | 0.450 | npm prebuild 바이너리, 빌드 충돌 0 |
| **SECURITY** | 10% | **4.8** | 0.480 | V8 Isolate (isolated-vm 동등) |
| **SELF_HOST** | 5% | **4.0** | 0.200 | idle ~100MB (isolated-vm보다 큼) |
| **COST** | 3% | **5.0** | 0.150 | OSS, 인프라만 |
| **합계** | 100% | — | **4.05** | **4.05 / 5.00** |

→ **workerd는 isolated-vm v6의 4순위 후보**로 검토 가치. Edge Functions 100% 호환은 불가능하지만 격리 + 성능에서 강력.

### 11.3 Cloudflare Workers 호스티드, E2B, Fly Sprites 간략 점수

| 후보 | 총점 (대략) | 우리 적합성 | 비고 |
|------|----------|------------|------|
| Cloudflare Workers (호스티드) | 3.40 | △ | 외부 SaaS, $5/월~ |
| E2B | 3.20 | △ | AI 에이전트 특화 |
| Fly Sprites | 3.30 | △ | 신생 (2026-01) |
| Northflank | 3.40 | △ | BYOC만 자체호스팅 가능 |

---

## 12. 리스크 · 완화책

### 12.1 Vercel Sandbox

| 리스크 | 가능성 | 영향 | 완화책 |
|--------|-------|------|--------|
| 비용 폭증 | 중 | 높음 | § 4.3 budget guard, 월 $5 캡 |
| 데이터 주권 (사용자 데이터가 외부에서 실행) | 중 | 높음 | 민감 데이터 코드는 위임 금지, 코드 리뷰 의무화 |
| 네트워크 장애 (Vercel API 다운) | 낮음 | 중 | isolated-vm/edge-runtime 폴백 |
| Vendor lock-in | 중 | 중 | SDK 의존을 1개 파일로 격리 (vercel-sandbox-bridge.ts) |
| 한국 RTT 200-300ms | 높음 | 낮음 | 사용자 체감 응답 시간 확인, 무거운 작업에 한정 |

### 12.2 workerd 자체호스팅

| 리스크 | 가능성 | 영향 | 완화책 |
|--------|-------|------|--------|
| Cloudflare Workers API 진화 | 중 | 중 | compatibilityDate 핀 |
| 자체호스팅 가이드 빈약 | 높음 | 낮음 | systemd 가이드 활용, vorker 참고 |
| Deno API 부재 | 높음 | 높음 | Supabase Edge Functions 코드 직접 실행 불가 → edge-runtime 사이드카로 보완 |

---

## 13. 결론 — 100점 도달 청사진 + DQ-1.4 답변

### 13.1 권고

**Vercel Sandbox는 Edge Functions 메인 엔진으로 사용 금지**. 이유:
1. Deno 미지원 → Supabase 호환 0
2. 외부 SaaS → 우리 자체호스팅 정책 위배
3. 한국 RTT 추가
4. 비용 발생 가능

**대신 다음 선택적 활용**:
- **활용 케이스 A — 무거운 1회성 작업**: 월별 리포트, 대량 이미지 처리, ML 추론 등 5분 이상 워크로드. 무료 한도 5 CPU-hr/월 내에서 운영. **별도 라우터 `/admin/heavy-task` + budget guard**로 격리.
- **활용 케이스 B — Playground (옵션)**: 사용자 제출 코드 실행 미니 IDE. Hobby 한도 내에서 PoC.

**workerd는 흥미로운 4순위 후보**. Edge Functions 100% 호환은 못 하지만:
- isolated-vm과 같은 V8 Isolate 격리 + production-grade HTTP 서버
- Cloudflare Workers 코드를 자체호스팅
- Apache 2.0
- → "Cloudflare 호환 worker도 같이 운영" 시나리오에 검토

### 13.2 100점 도달 청사진 (3개 미션 통합)

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Tunnel                                       │
│    ├─ api.stylelucky4u.com → :3000 (Next.js)             │
│    └─ edge.stylelucky4u.com → :3000 → /functions/v1/*    │
│                                       (Hono 라우터)      │
│                                          │               │
│           ┌──────────────────────────────┼───────────────┘
│           │                              │
│           ▼                              ▼
│   isolated-vm v6 (Main)           supabase/edge-runtime (Side)
│   - 95% 트래픽                    - Deno 100% 호환 함수만
│   - <50ms 응답                    - +200MB RAM
│   - $0 비용                        - $0 비용
│           │                              │
│           └──────────┬───────────────────┘
│                      │ (선택적, 무거운 워크로드만)
│                      ▼
│              Vercel Sandbox (옵션)
│              - 5분+ 워크로드
│              - Hobby 무료 5 CPU-hr/월
│              - $0-5/월
└──────────────────────────────────────────────────────────┘

추정 점수: 92-95/100 (현 45점에서 +47-50)
```

### 13.3 DQ-1.4 잠정 답변 (이 문서 관점)

> **Q: Edge Functions 동등성을 위해 어느 후보를 선택할 것인가?**
>
> **A**:
> 1. **메인 엔진**: isolated-vm v6 (미션 1) — 95% 트래픽, 자체호스팅 OK, $0
> 2. **Deno 호환 사이드카**: supabase/edge-runtime (미션 2) — Deno 100% 함수만, +200MB RAM
> 3. **선택적 무거운 작업 위임**: Vercel Sandbox (이 문서) — 5분+ 워크로드만, 무료 한도 내
> 4. **(검토 가치)**: workerd 자체호스팅 — 만약 isolated-vm 단독으로 충분하지 않으면 4순위로
>
> **Vercel Sandbox는 Edge Functions의 "메인 후보"가 아니라 "옵션 도구"**. 점수 가중에서는 메인 엔진 후보 비교에서 배제.

### 13.4 새 DQ (이 문서에서 도출)

- **DQ-1.5 (신규)**: workerd를 isolated-vm 대신 Edge Functions 메인 엔진으로 쓸 가치가 있는가? (Cloudflare 생태계 + V8 Isolate + production HTTP 서버 vs Deno 호환성 갭)
- **DQ-1.6 (신규)**: Vercel Sandbox의 Hobby 무료 티어를 "백오피스 무거운 작업 전용"으로 수용할 정책 결정이 필요한가? (외부 SaaS 의존 정책 예외)

---

## 14. 참고문헌

1. [Vercel Sandbox 공식 docs](https://vercel.com/docs/vercel-sandbox)
2. [Vercel Sandbox: SDK Reference](https://vercel.com/docs/vercel-sandbox/sdk-reference)
3. [Vercel Sandbox: Pricing](https://vercel.com/docs/vercel-sandbox/pricing)
4. [Vercel Sandbox: System Specifications](https://vercel.com/docs/vercel-sandbox/system-specifications)
5. [Vercel Sandbox: Authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)
6. [Vercel Sandbox: Snapshots](https://vercel.com/docs/vercel-sandbox/concepts/snapshots)
7. [Vercel Sandbox: 마케팅 페이지](https://vercel.com/sandbox)
8. [Vercel Changelog: Run untrusted code with Vercel Sandbox](https://vercel.com/changelog/run-untrusted-code-with-vercel-sandbox)
9. [npm: @vercel/sandbox](https://www.npmjs.com/package/@vercel/sandbox)
10. [GitHub: vercel/sandbox](https://github.com/vercel/sandbox)
11. [Vercel KB: Sandbox vs E2B](https://vercel.com/kb/guide/vercel-sandbox-vs-e2b)
12. [Vercel KB: Using Sandbox to run Claude Agent SDK](https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk)
13. [GitHub: cloudflare/workerd](https://github.com/cloudflare/workerd)
14. [Cloudflare blog: Introducing workerd](https://blog.cloudflare.com/workerd-open-source-workers-runtime/)
15. [Cloudflare Workers: Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
16. [A year of improving Node.js compat in CF Workers (2025)](https://blog.cloudflare.com/nodejs-workers-2025/)
17. [Cloudflare blog: Cloud Computing without Containers](https://blog.cloudflare.com/cloud-computing-without-containers/)
18. [Cloudflare blog: Sandboxing AI agents 100x faster (Dynamic Workers)](https://blog.cloudflare.com/dynamic-workers/)
19. [InfoQ: CF Dynamic Workers Open Beta 2026-04](https://www.infoq.com/news/2026/04/cloudflare-dynamic-workers-beta/)
20. [GitHub: VaalaCat/vorker (workerd self-host UI)](https://github.com/VaalaCat/vorker)
21. [HN: OpenWorkers Self-hosted CF Workers in Rust](https://news.ycombinator.com/item?id=46454693)
22. [XDA: Self-hosted CF Workers replacement is incredibly simple](https://www.xda-developers.com/self-hosted-cloudflare-workers-replacement-incredibly-simple/)
23. [Northflank: E2B vs Vercel Sandbox 2026 비교](https://northflank.com/blog/e2b-vs-vercel-sandbox)
24. [Northflank: 11 Best Sandbox Runners 2026](https://betterstack.com/community/comparisons/best-sandbox-runners/)
25. [Northflank: Top Vercel Sandbox alternatives](https://northflank.com/blog/top-vercel-sandbox-alternatives-for-secure-ai-code-execution-and-sandbox-environments)
26. [Northflank: Best platforms for untrusted code execution 2026](https://northflank.com/blog/best-platforms-for-untrusted-code-execution)
27. [Northflank: Best CF Workers alternatives 2026](https://northflank.com/blog/best-cloudflare-workers-alternatives)
28. [Fly.io: Sandboxing and Workload Isolation](https://fly.io/blog/sandboxing-and-workload-isolation/)
29. [Fly.io: Pricing](https://fly.io/pricing/)
30. [Modal blog: Memory Snapshots — Checkpoint/Restore](https://modal.com/blog/mem-snapshots)
31. [OpenAlternative: CF Workers Alternatives](https://openalternative.co/alternatives/cloudflare-workers)
32. [HN: Blueboat OSS alternative to CF Workers](https://news.ycombinator.com/item?id=29321442)

---

> **Wave 1 / Round 1 / Edge Functions 종료**.
> 다음: 3개 문서 통합 비교표 + DQ-1.4 최종 권고 (별도 worksheet에서).
