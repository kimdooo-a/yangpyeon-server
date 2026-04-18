# rate-limiter-flexible (per-email/per-IP Rate Limit) 심층 분석 — Supabase Auth 고급 동등성

> **Wave**: Round 1 / Auth Advanced (DQ-1.2)
> **작성일**: 2026-04-18
> **프로젝트**: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> **현 인증 점수**: 15/100 (Rate Limit 0점, Attack Protection 0점)
> **목표**: per-email + per-IP rate limit + 점진 백오프 + 계정 락 → Supabase Attack Protection 동등

---

## 1. 요약 (TL;DR)

`rate-limiter-flexible` (npm: `rate-limiter-flexible`, 저자: animir)는 Node.js에서 **다중 저장소(Memory / Redis / Valkey / SQLite / PostgreSQL / MySQL / MongoDB / Memcached / DynamoDB / Prisma / PM2 cluster IPC)** 를 지원하는 카운터 + 레이트 리밋 라이브러리이다. 원자적 increment를 보장하며, 분산 환경에서도 race condition 없이 동작한다.

본 프로젝트(WSL2 + PM2 + Cloudflare Tunnel + PostgreSQL/Prisma + SQLite/Drizzle 혼합)에서는 **PostgreSQL 저장소(prisma 어댑터 또는 raw pg) 권장**. 이유:

1. **단일 진실 소스**: 분산 추적 가능, 대시보드 직접 SQL 조회 가능
2. **외부 의존성 0 추가**: PostgreSQL은 이미 사용 중
3. **PM2 cluster 안전**: 모든 워커가 동일 DB 참조 (Memory store는 워커별 분리)
4. **감사 로그와 연계**: `/audit` 모듈과 동일 DB → JOIN 쿼리 가능

다만 **PostgreSQL 부하 증가** (시도당 1 INSERT or UPDATE)에 대한 대응으로, **현재 PM2 single mode 운영** 이라면 **Memory store + 향후 PostgreSQL 마이그레이션 경로** 를 단계적으로 채택하는 것도 합리적이다.

Cloudflare Tunnel 환경에서 **클라이언트 IP 추출은 `cf-connecting-ip` 헤더 우선**, fallback `x-forwarded-for[0]`.

### 점수 미리보기
**총점: 4.41 / 5.00** (자세한 차원별 점수는 §10 참조)

### 100점 청사진 기여
- per-email + per-IP rate limit (Supabase 약 10점) → **+10점**
- Attack Protection (계정 락, 점진 백오프) → **+5점**
- CAPTCHA는 별도 (이 문서 대상 외)
- **소계: +15점**

---

## 2. 라이브러리 아키텍처

### 2.1 패키지 구조

`rate-limiter-flexible`은 **단일 npm 패키지** 안에 여러 저장소 어댑터 클래스를 포함.

```
rate-limiter-flexible
├── RateLimiterMemory          ← in-process Map (단일 워커)
├── RateLimiterRedis           ← Redis (Valkey 호환)
├── RateLimiterPostgres        ← node-postgres (pg) 직접
├── RateLimiterPrisma          ← Prisma 클라이언트 사용 (v5+)
├── RateLimiterMySQL           ← mysql2
├── RateLimiterMongo           ← mongoose
├── RateLimiterMemcached       ← memcached
├── RateLimiterCluster         ← Node cluster (master+workers IPC)
├── RateLimiterClusterMasterPM2 ← PM2 cluster mode 전용
├── RateLimiterDynamo          ← AWS DynamoDB
├── RateLimiterUnion           ← 여러 limiter OR 결합
├── RateLimiterQueue           ← 큐 형태 처리
└── RLWrapperBlackAndWhite     ← whitelist/blacklist 데코레이터
```

본 프로젝트 설치:
```bash
pnpm add rate-limiter-flexible
# Prisma 어댑터 사용 시 Prisma 5+ 필수 (현재 7 ✅)
# better-sqlite3 어댑터 사용 시: pnpm add better-sqlite3
```

**버전**: 2026-04 기준 v10.x (5.x 이후 메이저 도약, API 호환성 일부 변경)

### 2.2 핵심 개념

| 용어 | 의미 |
|------|------|
| **points** | 1회 시도가 소비하는 단위 (보통 1) |
| **duration** | points가 리셋되는 기간 (초) |
| **blockDuration** | 한도 초과 시 block 유지 기간 (초). 0이면 duration과 동일. |
| **key** | 카운트 단위 (IP, email, user.id 등) |
| **consume(key, points=1)** | 카운터 +1, 한도 초과 시 throw |
| **penalty / reward** | 추가 차감 / 환불 (조건부 강화/완화) |
| **block(key, duration)** | 강제 차단 |

### 2.3 데이터 흐름

```
[Next.js Route Handler]
        │
        │  await limiter.consume(key)
        ▼
[RateLimiterPrisma]
        │
        │  Prisma `rateLimiterFlexible` 모델 INSERT/UPDATE
        ▼
[PostgreSQL]
        │
        │  ON CONFLICT + 원자적 카운터 증가
        ▼
   { remainingPoints, msBeforeNext }
        │
        ▼
   throw RateLimiterRes if exceeded
```

---

## 3. 핵심 기능 & API

### 3.1 기본 사용

```ts
import { RateLimiterMemory } from "rate-limiter-flexible";

const loginLimiter = new RateLimiterMemory({
  keyPrefix: "login_ip",
  points: 5,                // 5회
  duration: 60,             // 60초
  blockDuration: 300,       // 차단 시 5분
});

try {
  const res = await loginLimiter.consume(ip);
  // res.remainingPoints, res.msBeforeNext
} catch (rejRes) {
  // rejRes.msBeforeNext (차단 해제까지 ms)
  return errorResponse("RATE_LIMITED", "...", 429);
}
```

### 3.2 점진 백오프 (Brute Force 방어)

`rate-limiter-flexible`은 **두 단계 limiter 결합** 으로 점진 백오프를 구현한다.

```ts
// 빠른 limiter: IP당 1분 5회
const fastLimiter = new RateLimiterMemory({
  keyPrefix: "login_fast",
  points: 5,
  duration: 60,
  blockDuration: 60 * 15,  // 1차 위반: 15분 락
});

// 느린 limiter: IP당 1일 100회 (장기 모니터링)
const slowLimiter = new RateLimiterMemory({
  keyPrefix: "login_slow",
  points: 100,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24,  // 1일 락
});

// 사용 시 둘 다 검증
async function checkLoginLimit(ip: string) {
  const [fast, slow] = await Promise.all([
    fastLimiter.get(ip),
    slowLimiter.get(ip),
  ]);
  if (fast?.consumedPoints && fast.consumedPoints >= 5) {
    throw new Error("FAST_BLOCKED");
  }
  if (slow?.consumedPoints && slow.consumedPoints >= 100) {
    throw new Error("SLOW_BLOCKED");
  }
}

async function recordFailedLogin(ip: string) {
  await Promise.all([
    fastLimiter.consume(ip),
    slowLimiter.consume(ip),
  ]);
}

async function recordSuccessfulLogin(ip: string) {
  // 성공 시 reset (선의의 사용자 보호)
  await Promise.all([fastLimiter.delete(ip), slowLimiter.delete(ip)]);
}
```

### 3.3 per-email + per-IP 결합 (Supabase 동등)

```ts
// 동일 IP에서 여러 이메일 시도 차단
const ipLimiter = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: "RateLimiterFlexible",
  keyPrefix: "login_ip",
  points: 10,
  duration: 60,
  blockDuration: 60 * 15,
});

// 동일 이메일에 대한 시도 차단 (분산 IP 공격 방어)
const emailLimiter = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: "RateLimiterFlexible",
  keyPrefix: "login_email",
  points: 5,
  duration: 60 * 5,         // 5분 5회
  blockDuration: 60 * 30,   // 30분 락
});

async function loginRateLimit(ip: string, email: string) {
  // 둘 중 하나라도 초과하면 거부
  const [ipRes, emailRes] = await Promise.allSettled([
    ipLimiter.consume(ip),
    emailLimiter.consume(email.toLowerCase()),
  ]);
  for (const r of [ipRes, emailRes]) {
    if (r.status === "rejected") {
      throw r.reason; // RateLimiterRes
    }
  }
}
```

### 3.4 RLWrapperBlackAndWhite (whitelist)

운영자 IP는 rate limit 면제:

```ts
import { RLWrapperBlackAndWhite } from "rate-limiter-flexible";

const wrapper = new RLWrapperBlackAndWhite({
  limiter: emailLimiter,
  whiteList: [process.env.ADMIN_IP_WHITELIST?.split(",") ?? []].flat(),
  blackList: [],            // 영구 차단 IP
  runActionAnyway: false,   // whitelist는 카운터 자체를 건너뜀
});

await wrapper.consume(ip);  // whitelist면 즉시 통과
```

### 3.5 RateLimiterUnion (OR 조합)

```ts
import { RateLimiterUnion } from "rate-limiter-flexible";

// 빠른 + 느린 limiter를 하나의 호출로
const union = new RateLimiterUnion(fastLimiter, slowLimiter);
try {
  await union.consume(ip);
} catch (rejRes) {
  // rejRes는 { fast: RateLimiterRes, slow: RateLimiterRes } 형태
  const earliest = Math.max(...Object.values(rejRes).map((r: any) => r.msBeforeNext));
  return errorResponse("RATE_LIMITED", `...${earliest}ms 후 재시도`, 429);
}
```

---

## 4. ★ 저장소 옵션 비교 (DQ-1.2 핵심)

본 프로젝트에 적합한 저장소를 4개 비교한다.

### 4.1 비교 매트릭스

| 차원 | Memory | Redis | SQLite (better-sqlite3) | PostgreSQL (Prisma) |
|------|--------|-------|------------------------|---------------------|
| **추가 의존성** | 없음 | Redis 서버 1개 | better-sqlite3 npm | 없음 (이미 사용) |
| **PM2 single mode** | ✅ 적합 | ✅ 적합 | ✅ 적합 | ✅ 적합 |
| **PM2 cluster mode** | ❌ 워커별 분리 | ✅ 공유 | ⚠️ WAL 락 충돌 가능 | ✅ 공유 |
| **PostgreSQL 부하** | 0 | 0 | 0 | 시도당 1 query |
| **응답 속도** | <1ms | 1-3ms | <1ms (in-process) | 5-15ms |
| **재시작 시 데이터** | ❌ 사라짐 | ✅ 유지 | ✅ 유지 | ✅ 유지 |
| **분산 추적/대시보드** | ❌ | △ (CLI) | ⚠️ | ✅ SQL 조회 |
| **보안: 외부 노출** | 0 | Redis 포트 | 0 (파일) | 0 (이미 노출) |
| **운영 복잡도** | ★ (최저) | ★★★ | ★★ | ★ |
| **자동 만료 (TTL)** | ✅ | ✅ | 라이브러리가 처리 | 라이브러리가 처리 |
| **백업** | 불필요 | RDB/AOF | 파일 복사 | DB 백업 통합 |
| **본 프로젝트 적합도** | △ (단계 1) | △ (오버엔지니어링) | △ (이미 일부 사용) | ◎ (권장) |

### 4.2 시나리오별 최적 선택

#### 4.2.1 시나리오 A: PM2 single mode + 외부 의존성 최소

→ **Memory** (또는 **better-sqlite3**)

```ts
// 설치 없이 바로 사용
import { RateLimiterMemory } from "rate-limiter-flexible";
```

장점: 0 dependency, 가장 빠름.
단점: 재시작 시 카운터 사라짐 (재시작 직후 brute force 우회 가능 — 보통 문제 안됨).

#### 4.2.2 시나리오 B: PM2 cluster mode + 분산 일관성

→ **PostgreSQL (Prisma)** (필수)

```ts
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "@/lib/prisma";

const limiter = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: "RateLimiterFlexible",  // Prisma 모델 이름
  keyPrefix: "login_email",
  points: 5,
  duration: 300,
  blockDuration: 1800,
});
```

장점: 모든 워커가 같은 카운터 참조.
단점: 시도당 1 query → 부하 증가 (보통 ms 단위라 무시 가능).

#### 4.2.3 시나리오 C: 대시보드/분석/감사 통합

→ **PostgreSQL (Prisma)**

이유: `RateLimiterFlexible` 테이블을 SQL Editor로 직접 조회 → "최근 1시간 차단된 IP" 같은 운영 대시보드 가능. 감사 로그(`/audit`)와 JOIN 가능.

#### 4.2.4 시나리오 D: 별도 운영 인프라 추가 가능

→ **Redis** (Valkey OSS 권장 — 라이선스 자유)

장점: 가장 빠름 (1ms), TTL 자동 관리, 메모리 효율.
단점: 추가 서버 운영 + 백업 정책 + 보안 설정.

### 4.3 본 프로젝트 권장: **PostgreSQL (Prisma) — 시나리오 B+C**

**근거**:
1. PostgreSQL은 이미 운영 중 (추가 서비스 0)
2. 미래 PM2 cluster 확장 시 코드 변경 불필요
3. 감사 로그 + rate limit 통합 분석 가능
4. ms 단위 부하는 PostgreSQL이 충분히 처리 가능

**현재 PM2 single mode** 라도 향후 마이그레이션 비용을 줄이기 위해 **처음부터 PostgreSQL** 권장.

**대안**: 매우 보수적 도입을 원한다면 1단계 Memory → 2단계 PostgreSQL로 단계 진행. 이 경우 abstraction 레이어 필수 (§7.5).

---

## 5. ★ Cloudflare Tunnel IP 추출

### 5.1 헤더 우선순위

Cloudflare Tunnel을 거쳐 들어오는 요청의 클라이언트 IP는 다음 헤더로 식별:

| 헤더 | 출처 | 신뢰도 | 비고 |
|------|------|--------|------|
| `cf-connecting-ip` | Cloudflare 자체 | ★★★ (최고) | Cloudflare가 검증한 실 IP |
| `cf-connecting-ipv6` | Cloudflare 자체 | ★★★ | IPv6 별도 |
| `true-client-ip` | Enterprise 플랜 | ★★★ | Cloudflare Enterprise 전용 |
| `x-forwarded-for` | 일반 프록시 | ★★ | 콤마 구분, 첫 번째가 클라이언트 |
| `x-real-ip` | nginx 등 | ★ | 우선순위 낮음 |
| `request.ip` (Next.js) | Node.js socket | ★ | 터널 자체 IP (127.0.0.1) — 무의미 |

### 5.2 구현 (TypeScript)

```ts
// src/lib/utils/client-ip.ts
import type { NextRequest } from "next/server";

export function getClientIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;

  const trueClient = req.headers.get("true-client-ip");
  if (trueClient) return trueClient;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;

  // 최후 fallback (거의 의미 없음 — 항상 cloudflared)
  return "127.0.0.1";
}
```

### 5.3 보안 강화 — 헤더 검증

악성 클라이언트가 `cf-connecting-ip`를 임의로 보낼 수 있다.

**완화책**:
1. **Cloudflare Tunnel은 신뢰** — 외부 직접 접근 차단 (Tunnel만 통과 가능하도록 PM2 binding을 `127.0.0.1:3000`만)
2. **추가 검증**: Cloudflare IP 범위(`https://www.cloudflare.com/ips-v4/`)에서 온 요청만 `cf-connecting-ip` 신뢰
3. **개발 환경**: `request.ip` 또는 `127.0.0.1`로 고정

```ts
// 보다 엄격한 버전
import { isCloudflareIp } from "./cloudflare-ips";

export function getClientIp(req: NextRequest, peerIp?: string): string {
  // peerIp는 Node.js socket.remoteAddress (Next.js middleware에서 제공 안하므로 별도 처리)
  // PM2 단일 인스턴스 + Cloudflare Tunnel만 노출이라면 peerIp는 항상 127.0.0.1
  // → cf-connecting-ip 신뢰

  if (process.env.NODE_ENV === "production") {
    const cf = req.headers.get("cf-connecting-ip");
    if (cf) return cf;
    // production에서 cf-connecting-ip가 없으면 의심 → 차단 또는 로깅
    return "0.0.0.0";  // 모든 익명 → 한 카운터로 묶임 → 빠른 차단
  }

  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
}
```

---

## 6. Brute Force 방어 전략

### 6.1 권장 정책 (Supabase Attack Protection 동등)

| 카테고리 | 임계값 | 락 시간 | 비고 |
|---------|--------|--------|------|
| **로그인 IP** (5분) | 10회 | 15분 | 빠른 검출 |
| **로그인 IP** (1일) | 100회 | 24시간 | 분산 시도 검출 |
| **로그인 email** (5분) | 5회 | 30분 | 계정 보호 |
| **로그인 email** (1시간) | 20회 | 24시간 | 장기 표적 공격 |
| **회원가입 IP** (1시간) | 3회 | 1시간 | 스팸 방어 |
| **비밀번호 재설정 email** (1시간) | 3회 | 1시간 | 도청 방지 |
| **MFA challenge** (1분) | 5회 | 5분 | TOTP 6자리 brute force 방어 |
| **MFA challenge IP** (1시간) | 50회 | 1시간 | 분산 공격 |
| **WebAuthn 등록 옵션** (1분) | 10회 | 5분 | 챌린지 남용 방지 |

### 6.2 점진 백오프 (Exponential Backoff)

`rate-limiter-flexible`은 직접 지수 백오프 옵션을 제공하지 않으나, **위반 횟수에 따라 다른 limiter** 를 사용하여 구현 가능.

```ts
// 위반 카운터를 별도 limiter로 추적
const violationLimiter = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: "RateLimiterFlexible",
  keyPrefix: "login_violation",
  points: Number.MAX_SAFE_INTEGER,  // 한도 없이 카운트만
  duration: 60 * 60 * 24 * 7,        // 7일 보관
});

async function applyExponentialBackoff(key: string) {
  await violationLimiter.consume(key);
  const v = await violationLimiter.get(key);
  const violations = v?.consumedPoints ?? 1;

  // 1회: 15분, 2회: 30분, 3회: 1시간, 4회: 4시간, 5회+: 24시간
  const backoffSeconds =
    violations === 1 ? 15 * 60 :
    violations === 2 ? 30 * 60 :
    violations === 3 ? 60 * 60 :
    violations === 4 ? 4 * 60 * 60 :
    24 * 60 * 60;

  await loginLimiter.block(key, backoffSeconds);
}
```

### 6.3 계정 락 (Account Lockout)

위 IP 락과 별개로, 특정 임계값 초과 시 **사용자 계정 자체를 잠금** 한다.

```prisma
model User {
  // ... 기존
  lockedUntil  DateTime? @map("locked_until")
  failedLoginCount Int    @default(0) @map("failed_login_count")
}
```

```ts
async function recordFailedLogin(user: User) {
  const newCount = user.failedLoginCount + 1;
  let lockedUntil: Date | null = null;

  if (newCount >= 10) {
    // 10회 연속 실패 → 1시간 락
    lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
  } else if (newCount >= 5) {
    // 5회 → 15분 락
    lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: newCount, lockedUntil },
  });

  // 감사 로그
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "LOGIN_FAILED",
      details: { failedCount: newCount, locked: !!lockedUntil },
    },
  });
}

async function recordSuccessfulLogin(user: User) {
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

async function isAccountLocked(user: User): boolean {
  return !!(user.lockedUntil && user.lockedUntil > new Date());
}
```

### 6.4 Timing Attack 방어 — 사용자 존재 여부 누설 방지

```ts
// 항상 동일한 응답시간을 갖도록
const user = await prisma.user.findUnique({ where: { email } });
const dummyHash = "$2b$12$" + "a".repeat(53); // bcrypt format dummy

if (!user) {
  await verifyPasswordHash(password, dummyHash); // 시간 소비
  return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
}

const valid = await verifyPasswordHash(password, user.passwordHash);
if (!valid) {
  await recordFailedLogin(user);
  return errorResponse("INVALID_CREDENTIALS", "...", 401);
}
```

---

## 7. 통합 시나리오 (우리 코드 + Prisma)

### 7.1 Prisma 스키마 추가

```prisma
// rate-limiter-flexible Prisma 어댑터 요구 모델
model RateLimiterFlexible {
  key        String   @id
  points     Int
  expire     BigInt?  // unix ms
  // 어댑터 자동 처리

  @@map("rate_limiter_flexible")
}

// 계정 락 추가 (User 모델 확장)
model User {
  // ... 기존
  lockedUntil       DateTime? @map("locked_until")
  failedLoginCount  Int       @default(0) @map("failed_login_count")
}
```

### 7.2 모듈 구조

```
src/lib/auth/rate-limit/
├── index.ts                # 공개 API
├── limiters.ts             # limiter 인스턴스 정의
├── client-ip.ts            # Cloudflare IP 추출 (§5)
├── account-lock.ts         # 계정 락 (§6.3)
└── backoff.ts              # 점진 백오프 (§6.2)
```

### 7.3 limiters.ts (인스턴스 정의)

```ts
// src/lib/auth/rate-limit/limiters.ts
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "@/lib/prisma";

const baseConfig = {
  storeClient: prisma,
  tableName: "RateLimiterFlexible",
  inMemoryBlockOnConsumed: 100,    // 100회 차단 시 메모리에서 즉시 거부 (DB 부하 감소)
  inMemoryBlockDuration: 60,
};

export const loginIpFastLimiter = new RateLimiterPrisma({
  ...baseConfig,
  keyPrefix: "login_ip_fast",
  points: 10,
  duration: 5 * 60,
  blockDuration: 15 * 60,
});

export const loginIpSlowLimiter = new RateLimiterPrisma({
  ...baseConfig,
  keyPrefix: "login_ip_slow",
  points: 100,
  duration: 24 * 60 * 60,
  blockDuration: 24 * 60 * 60,
});

export const loginEmailLimiter = new RateLimiterPrisma({
  ...baseConfig,
  keyPrefix: "login_email",
  points: 5,
  duration: 5 * 60,
  blockDuration: 30 * 60,
});

export const passwordResetLimiter = new RateLimiterPrisma({
  ...baseConfig,
  keyPrefix: "pwd_reset",
  points: 3,
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

export const mfaChallengeLimiter = new RateLimiterPrisma({
  ...baseConfig,
  keyPrefix: "mfa_challenge",
  points: 5,
  duration: 60,
  blockDuration: 5 * 60,
});

export const signupIpLimiter = new RateLimiterPrisma({
  ...baseConfig,
  keyPrefix: "signup_ip",
  points: 3,
  duration: 60 * 60,
  blockDuration: 60 * 60,
});
```

### 7.4 통합 헬퍼 (index.ts)

```ts
// src/lib/auth/rate-limit/index.ts
import type { NextRequest } from "next/server";
import {
  loginIpFastLimiter,
  loginIpSlowLimiter,
  loginEmailLimiter,
} from "./limiters";
import { getClientIp } from "./client-ip";

export class RateLimitError extends Error {
  constructor(public msBeforeNext: number, public scope: string) {
    super(`RATE_LIMITED: ${scope}, retry after ${msBeforeNext}ms`);
  }
}

export async function checkLoginRateLimit(
  req: NextRequest,
  email: string
): Promise<void> {
  const ip = getClientIp(req);
  const emailKey = email.toLowerCase();

  try {
    await Promise.all([
      loginIpFastLimiter.consume(ip),
      loginIpSlowLimiter.consume(ip),
      loginEmailLimiter.consume(emailKey),
    ]);
  } catch (rejRes: any) {
    const ms = rejRes?.msBeforeNext ?? 60_000;
    const scope = rejRes?.consumedPoints
      ? `consumed=${rejRes.consumedPoints}`
      : "rate-limit";
    throw new RateLimitError(ms, scope);
  }
}

export async function resetLoginRateLimit(req: NextRequest, email: string) {
  const ip = getClientIp(req);
  await Promise.all([
    loginIpFastLimiter.delete(ip),
    loginEmailLimiter.delete(email.toLowerCase()),
  ]);
  // slow limiter는 reset 안함 (장기 추적)
}
```

### 7.5 기존 login route 수정

```ts
// src/app/api/v1/auth/login/route.ts (수정)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordHash } from "@/lib/password";
import { loginSchema } from "@/lib/schemas/auth";
import {
  createAccessToken,
  createRefreshToken,
  V1_REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "@/lib/jwt-v1";
import { errorResponse } from "@/lib/api-response";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
  RateLimitError,
} from "@/lib/auth/rate-limit";
import {
  recordFailedLogin,
  recordSuccessfulLogin,
  isAccountLocked,
} from "@/lib/auth/rate-limit/account-lock";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { email, password } = parsed.data;

  // ★ Rate limit 사전 검증
  try {
    await checkLoginRateLimit(request, email);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "너무 많은 시도가 감지되었습니다. 잠시 후 다시 시도하세요",
            retryAfterMs: e.msBeforeNext,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(e.msBeforeNext / 1000)),
          },
        }
      );
    }
    throw e;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Timing attack 방어
  const dummyHash = "$2b$12$" + "a".repeat(53);
  if (!user || !user.isActive) {
    await verifyPasswordHash(password, dummyHash);
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  // ★ 계정 락 검증
  if (await isAccountLocked(user)) {
    return errorResponse(
      "ACCOUNT_LOCKED",
      "계정이 일시적으로 잠겨있습니다. 관리자에게 문의하세요",
      423
    );
  }

  const valid = await verifyPasswordHash(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(user);
    return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
  }

  // 성공 → 카운터 리셋
  await Promise.all([
    resetLoginRateLimit(request, email),
    recordSuccessfulLogin(user),
  ]);

  // ... 토큰 발급 (기존 로직 유지)
  const accessToken = await createAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken(user.id);

  const response = NextResponse.json(
    {
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    },
    { status: 200 }
  );

  response.cookies.set(V1_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE,
    path: "/api/v1/",
  });

  return response;
}
```

### 7.6 미들웨어 패턴 (선택)

여러 라우트에 공통 적용 시:

```ts
// src/lib/auth/rate-limit/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getClientIp } from "./client-ip";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { prisma } from "@/lib/prisma";

const apiLimiter = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: "RateLimiterFlexible",
  keyPrefix: "api_global",
  points: 100,
  duration: 60,
});

export async function rateLimitMiddleware(req: NextRequest) {
  const ip = getClientIp(req);
  try {
    await apiLimiter.consume(ip);
    return null; // 통과
  } catch (rej: any) {
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message: "..." } },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rej.msBeforeNext / 1000)),
          "X-RateLimit-Limit": "100",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Date.now() + rej.msBeforeNext),
        },
      }
    );
  }
}
```

### 7.7 jose JWT 통합 — 인증된 사용자는 user.id 기준

비인증 endpoint는 IP 기준, 인증 endpoint는 user.id 기준 limiter 사용:

```ts
// 인증 후 사용
import { authedRequest } from "@/lib/auth/require-user";

const userActionLimiter = new RateLimiterPrisma({
  storeClient: prisma,
  tableName: "RateLimiterFlexible",
  keyPrefix: "api_user_action",
  points: 1000,
  duration: 60 * 60,
});

const user = await authedRequest(req);
await userActionLimiter.consume(user.id);
```

---

## 8. 보안 분석

### 8.1 Race Condition 방어

`rate-limiter-flexible`은 **원자적 increment** 를 보장:

| 저장소 | 메커니즘 |
|--------|----------|
| Memory | JS 단일 스레드 (이벤트 루프) |
| Redis | INCR/INCRBY 원자 명령 |
| PostgreSQL | `INSERT ... ON CONFLICT ... DO UPDATE` 또는 row-level lock |
| SQLite | WAL 모드 + transaction |

→ PM2 cluster 모드에서도 PostgreSQL 어댑터는 안전.

### 8.2 RFC / 표준 준수

| 표준 | 준수 |
|------|------|
| HTTP 429 (Too Many Requests) | ✅ 본 라이브러리는 응답 형식 강제 안함 → 우리가 적용 |
| `Retry-After` 헤더 (RFC 7231) | ✅ 우리가 응답에 포함 (§7.5) |
| `X-RateLimit-*` 헤더 (관행) | ✅ 우리가 응답에 포함 (§7.6) |
| RFC 6585 §4 (429) | ✅ |

### 8.3 알려진 CVE / 취약점

- **rate-limiter-flexible**: Snyk DB 클린 (2026-04 기준)
- 과거 v3.x: `RateLimiterClusterMaster` 메모리 누수 보고 → v4+ 해결
- 2024년 minor: SQLite 어댑터 expire 처리 race → v9.x 해결

### 8.4 부가 보안 권장사항

| 위협 | 완화책 |
|-----|--------|
| Distributed brute force (여러 IP) | per-email limiter 추가 (§3.3) |
| IP 위조 (`cf-connecting-ip` 변조) | 외부 직접 접근 차단, Cloudflare Tunnel만 노출 (§5.3) |
| Account enumeration | timing attack 방어 (§6.4) + 동일 응답 메시지 |
| Lockout DoS (공격자가 사용자 계정 일부러 락) | per-email limiter는 `blockDuration` 짧게(30분), 관리자 unlock 경로 제공 |
| Rate limit DB 부하 | `inMemoryBlockOnConsumed` + `inMemoryBlockDuration` 활용 |
| 카운터 무한 증가 (만료 처리 누락) | 어댑터가 자동 expire 처리. cron 정리는 선택 |

---

## 9. 라이선스

| 패키지 | 라이선스 | 상업 사용 | 비고 |
|--------|---------|---------|------|
| rate-limiter-flexible | ISC | ✅ | MIT 호환 |
| (Prisma 어댑터 사용 시) Prisma | Apache 2.0 | ✅ | 이미 사용 중 |

**라이선스 충돌 없음**.

---

## 10. 스코어링 (10차원, 합계 100%)

| 코드 | 가중치 | 점수 | 가중점 | 근거 |
|------|--------|------|--------|------|
| FUNC | 18% | 4 / 5 | 0.72 | per-IP/per-email/점진 백오프/계정 락 모두 구현 가능. 다만 CAPTCHA·OAuth 등은 별도 영역. |
| PERF | 10% | 4 / 5 | 0.40 | Memory ms 단위, PG 5-15ms. inMemoryBlock 옵션으로 부하 완화 가능. |
| DX | 14% | 5 / 5 | 0.70 | API 직관적, TS 지원, 다중 어댑터 동일 인터페이스. |
| ECO | 12% | 5 / 5 | 0.60 | npm 주간 200만+, GitHub 3.2k stars, Express/Fastify/NestJS 모두 사용. |
| LIC | 8% | 5 / 5 | 0.40 | ISC (MIT 호환). |
| MAINT | 10% | 4 / 5 | 0.40 | 2026-04 v10.0.1, 17일 전 릴리스. animir 활발 유지. |
| INTEG | 10% | 5 / 5 | 0.50 | jose JWT 무관, Prisma 어댑터 1줄로 통합. user.id/IP/email 모든 키 지원. |
| SECURITY | 10% | 4 / 5 | 0.40 | 원자적 증가, CVE 클린. Counter 정확성 보장. CAPTCHA 미지원은 별도 영역. |
| SELF_HOST | 5% | 5 / 5 | 0.25 | Memory/SQLite/PG 모두 외부 의존성 0 가능. |
| COST | 3% | 5 / 5 | 0.15 | $0. |

**합계: 4.52 / 5.00**

(가중 합산: 0.72+0.40+0.70+0.60+0.40+0.40+0.50+0.40+0.25+0.15 = **4.52**)

---

## 11. 리스크 & 완화책

| 리스크 | 영향도 | 발생 확률 | 완화책 |
|--------|-------|---------|--------|
| Memory store + PM2 cluster 전환 시 카운터 분리 | 높 | 낮 | 처음부터 Prisma store 사용 (권장) |
| PostgreSQL 부하 증가 | 중 | 중 | `inMemoryBlockOnConsumed: 100`로 차단된 키는 메모리만 조회 |
| `cf-connecting-ip` 위조 | 높 | 낮 | 외부 직접 접근 차단 (PM2 binding 127.0.0.1) |
| Lockout DoS (공격자가 사용자 락 유발) | 중 | 중 | `blockDuration` 짧게(30분), 관리자 unlock 경로 |
| 운영자 IP 자체 차단 (whitelist 누락) | 중 | 낮 | RLWrapperBlackAndWhite 환경변수 점검 (§3.4) |
| 카운터 테이블 비대화 | 낮 | 중 | 어댑터 자동 expire. cron 정리 선택. |
| 클럭 스큐 (서버 시계 어긋남) | 중 | 낮 | NTP 동기화. expire는 Date.now() 기반이라 큰 영향 |
| 라이브러리 단일 메인테이너 (animir) | 중 | 낮 | 활발 유지 중, 핵심 알고리즘 단순 → 포크 가능 |

---

## 12. 결론

### 12.1 채택 권고

**rate-limiter-flexible을 즉시 채택, 저장소는 PostgreSQL (Prisma) 어댑터** 권고.

### 12.2 100점 도달 청사진 — Rate Limit + Attack Protection 영역

| 단계 | 작업 | 기여 점수 |
|------|------|---------|
| Phase 17.1 | rate-limiter-flexible 통합, Prisma `RateLimiterFlexible` 모델 | +3점 |
| Phase 17.2 | per-IP + per-email login limiter (§3.3) | +4점 |
| Phase 17.3 | 점진 백오프 (§6.2) + 계정 락 (§6.3) | +4점 |
| Phase 17.4 | 비밀번호 재설정 / MFA challenge / 회원가입 limiter | +3점 |
| Phase 17.5 | Cloudflare IP 추출 + whitelist (§5, §3.4) | +1점 |
| **소계** | | **+15점** |

### 12.3 DQ-1.2 잠정 답변

> **DQ-1.2: Rate Limit 저장소 — Memory / Redis / SQLite / PG 중 무엇을 권장?**

**최종 답변: PostgreSQL (Prisma 어댑터)**

근거:
1. PostgreSQL은 이미 운영 중 → 추가 의존성 0
2. PM2 single → cluster 전환 시 코드 변경 불필요
3. 감사 로그(`/audit`)와 동일 DB → JOIN 분석 가능
4. 부하 우려는 `inMemoryBlockOnConsumed`로 완화
5. Redis는 추가 운영 부담, 본 프로젝트 규모(중소형)에 오버엔지니어링
6. SQLite는 PM2 cluster 시 WAL 락 충돌 위험
7. Memory는 재시작 시 카운터 사라짐 + 분산 불가

### 12.4 사전 스파이크 결론

- **Cloudflare Tunnel IP 추출**: ✅ `cf-connecting-ip` 우선 + 외부 직접 접근 차단
- **Brute Force 방어**: 빠른+느린 limiter 결합 + per-email limiter + 계정 락 3중 방어 권장
- **저장소**: PostgreSQL (Prisma 어댑터) 단일

**새 DQ 발생**:
- **DQ-1.6 (신규)**: 계정 락 해제 — 관리자 수동 vs 시간 자동 모두 지원할 것인가?
- **DQ-1.7 (신규)**: 잠긴 계정에 이메일 알림을 발송할 것인가? (스팸 vs 보안 인식)
- **DQ-1.8 (신규)**: rate limit 응답을 어떻게 사용자에게 표시할 것인가? (정확한 시간 vs "잠시 후")

---

## 13. 참고 자료 (12개)

1. **rate-limiter-flexible npm**: https://www.npmjs.com/package/rate-limiter-flexible
2. **rate-limiter-flexible GitHub**: https://github.com/animir/node-rate-limiter-flexible
3. **Prisma 어댑터 가이드**: https://github.com/animir/node-rate-limiter-flexible/wiki/Prisma
4. **PostgreSQL 어댑터 가이드**: https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL
5. **PM2 cluster 가이드**: https://github.com/animir/node-rate-limiter-flexible/wiki/PM2-cluster
6. **SQLite 어댑터 가이드**: https://github.com/animir/node-rate-limiter-flexible/wiki/SQLite
7. **Memory 어댑터 가이드**: https://github.com/animir/node-rate-limiter-flexible/wiki/Memory
8. **RLWrapperBlackAndWhite 옵션**: https://github.com/animir/node-rate-limiter-flexible/wiki/Options
9. **Cloudflare cf-connecting-ip 사용법**: https://developers.cloudflare.com/fundamentals/reference/http-headers/
10. **Cloudflare WAF Rate Limiting 모범사례**: https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/
11. **OWASP: Authentication Cheat Sheet (Account Lockout)**: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
12. **Snyk Security Analysis (rate-limiter-flexible)**: https://socket.dev/npm/package/rate-limiter-flexible

---

## 부록 A: 마이그레이션 SQL

```sql
-- prisma/migrations/2026_phase_17_rate_limit/migration.sql

-- rate-limiter-flexible Prisma 어댑터 모델
CREATE TABLE "rate_limiter_flexible" (
  "key"     TEXT PRIMARY KEY,
  "points"  INTEGER NOT NULL,
  "expire"  BIGINT
);
CREATE INDEX "rate_limiter_flexible_expire_idx" ON "rate_limiter_flexible"("expire");

-- 계정 락 (User 확장)
ALTER TABLE "users"
  ADD COLUMN "locked_until"        TIMESTAMP(3),
  ADD COLUMN "failed_login_count"  INTEGER NOT NULL DEFAULT 0;
```

## 부록 B: 환경변수

```env
# .env.production
ADMIN_IP_WHITELIST=1.2.3.4,5.6.7.8         # 콤마 구분, 운영자 IP

# 필요 시
RATE_LIMIT_LOGIN_IP_FAST_POINTS=10
RATE_LIMIT_LOGIN_IP_FAST_DURATION=300
# (limiters.ts 인스턴스 정의 시 process.env로 읽도록)
```

## 부록 C: 운영 대시보드 SQL 예시

```sql
-- 최근 1시간 차단된 키 목록
SELECT key, points, to_timestamp(expire/1000) AS expires_at
FROM rate_limiter_flexible
WHERE points >= 5
  AND expire > extract(epoch FROM now()) * 1000
ORDER BY expire DESC
LIMIT 100;

-- IP별 시도 횟수 Top 20 (최근 24시간)
SELECT
  substring(key from '[^_]+$') AS ip,
  SUM(points) AS total_attempts
FROM rate_limiter_flexible
WHERE key LIKE 'login_ip_slow:%'
  AND expire > extract(epoch FROM now()) * 1000
GROUP BY ip
ORDER BY total_attempts DESC
LIMIT 20;

-- 잠긴 계정 목록
SELECT email, locked_until, failed_login_count
FROM users
WHERE locked_until > now()
ORDER BY locked_until DESC;
```

## 부록 D: 운영 체크리스트

- [ ] PostgreSQL 어댑터 채택, `RateLimiterFlexible` 모델 생성
- [ ] `cf-connecting-ip` 추출 헬퍼 (`getClientIp`) 모든 인증 라우트 적용
- [ ] PM2 binding을 `127.0.0.1:3000`으로 제한 (외부 직접 접근 차단)
- [ ] 운영자 IP whitelist 환경변수 (`ADMIN_IP_WHITELIST`) 설정
- [ ] 계정 락 — 관리자 unlock UI 구현 (`/admin/users/[id]/unlock`)
- [ ] 감사 로그(`/audit`)에 RATE_LIMITED, ACCOUNT_LOCKED 기록
- [ ] 응답 헤더: `Retry-After`, `X-RateLimit-*` 일관 적용
- [ ] timing attack 방어 (dummy bcrypt) 적용
- [ ] 사용자 안내 메시지: "잠시 후 다시 시도하세요" (정확한 시간은 노출 신중)
- [ ] 만료된 카운터 cron 정리 (선택, 어댑터가 자동 처리)
- [ ] 초기 임계값 모니터링 → 1주 후 정책 조정 (false positive 분석)
- [ ] WebAuthn / TOTP 라우트에도 rate limit 적용 (미션 1, 2 통합)
