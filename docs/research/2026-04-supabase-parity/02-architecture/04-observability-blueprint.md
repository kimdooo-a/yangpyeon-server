# 04. Observability Blueprint — 양평 부엌 서버 대시보드 (카테고리 12)

> ⚠️ **ADR-021 cross-cutting fail-soft 통지 (2026-04-25, 세션 56)**: 감사 로그(audit_logs) 쓰기 실패는 도메인 임계 경로 응답을 절대 깨뜨리지 않는다는 invariant 가 [ADR-021](./01-adr-log.md) 으로 정식화. 모든 도메인 라우트는 `safeAudit(entry, context?)` (`src/lib/audit-log-db.ts`) 만 사용. `writeAuditLogDb` 는 `@internal`. 본 Blueprint 의 LoggingService/MetricsService 설계도 동일 원칙 — observability 가 도메인을 인질로 잡지 않음. drizzle 마이그레이션 self-heal 은 instrumentation.ts 가 부팅 시 적용. 정식 본문: [`docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md`](../../decisions/ADR-021-audit-cross-cutting-fail-soft.md).

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](./01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 4 · Tier 2 · B2 에이전트 산출물
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md)
> 상위 ADR: ADR-013 (node:crypto envelope + MASTER_KEY 위치)

---

## 0. 문서 구조

```
§1.  요약 — 현황·목표·핵심 결정
§2.  Wave 1-2 채택안 인용 — pgsodium vs node:crypto / JWKS 결정 경과
§3.  컴포넌트 설계 — VaultService / JWKSService / LoggingService / MetricsService
§4.  API 설계 — /api/v1/vault/* · /.well-known/jwks.json · /api/v1/infrastructure/*
§5.  데이터 모델 — vault_secrets / jwks_keys / jwks_key_rotations / SQLite metrics_history
§6.  UI 설계 — Infrastructure 페이지 · JWKS 관리 UI · Vault Secrets CRUD
§7.  통합 — Auth Core / Auth Advanced / Edge Functions / DB Ops
§8.  NFR 매핑 — NFR-SEC.17 키 회전 · NFR-REL.3 암호화
§9.  보안 위협 모델 (STRIDE) — Information Disclosure / Elevation of Privilege
§10. 리스크 및 완화 — MASTER_KEY 유출 / KEK 회전 중단 / jose v5 호환
§11. Wave 4 할당 DQ 답변 — DQ-1.18 · DQ-1.19 · DQ-12.* 항목
§12. Phase 16 WBS — Observability 파트 (~20h)
부록 Z. 근거 인덱스 · 변경 이력
```

---

## 1. 요약

### 1.1 현황

| 항목 | 현재 상태 | 목표 상태 |
|------|----------|----------|
| 카테고리 | 12 (Observability) | 동일 |
| 점수 | 65점 | **85점** (Phase 16 MVP) |
| Vault | 미구현 (env 평문) | AES-256-GCM envelope |
| JWKS | 미구현 (HS256 단일 키) | ES256 JWKS + KID rotation |
| 인프라 모니터링 | 수동 확인 | SSE 실시간 대시보드 |
| 감사 로그 | 미구현 | append-only PG 테이블 |
| 구현 공수 | — | ~20h (Phase 16) |

### 1.2 핵심 결정 (ADR-013 요약)

Phase 16에서 Observability 카테고리를 65→85점으로 끌어올리는 핵심은 **Vault 시크릿 관리**와 **JWKS 키 회전**이다. 두 기능 모두 외부 KMS 의존 없이 Node.js 네이티브 `node:crypto` 모듈(AES-256-GCM envelope)과 `jose` 라이브러리(ES256 JWKS)로 구현한다. MASTER_KEY는 `/etc/luckystyle4u/secrets.env` (chmod 0640, root:ypb-runtime)에 저장하며, PM2 `env_file`로만 프로세스에 주입한다.

### 1.3 Phase 16 MVP 범위

Phase 16에서 구현하는 기능 목록:

1. VaultService — KEK/DEK envelope 암호화/복호화/회전
2. JWKSService — ES256 키쌍 생성, JWKS 엔드포인트, KID 기반 grace 회전
3. LoggingService — Pino 구조화 JSON 로깅
4. MetricsService — SQLite metrics_history 5초 수집
5. Infrastructure 페이지 (`/dashboard/settings/infrastructure`) — PM2 · PG · 디스크 · Cloudflare Tunnel 실시간 현황
6. JWKS 관리 UI — 키 목록 · 회전 버튼 · KID grace 상태
7. Vault Secrets CRUD — 시크릿 생성/조회/삭제 (수정은 재생성 방식)

---

## 2. Wave 1-2 채택안 인용

### 2.1 pgsodium 거부 경과 (Wave 1 Deep-Dive 12/01)

Wave 1 리서치에서 pgsodium과 node:crypto AES-256-GCM 두 후보를 비교했다. pgsodium은 Supabase가 사용하는 PG 확장으로, libsodium XChaCha20-Poly1305 + Server-Managed Key 패턴을 구현하지만, **다음 3가지 결격 사유**로 거부했다.

**결격 사유 1 — 설치 복잡도**: `apt install postgresql-16-pgsodium` 패키지가 Ubuntu 22.04 기본 저장소에 없어 소스 빌드 필요. `libsodium-dev`, `postgresql-server-dev-16`, `build-essential`이 의존성이며, 빌드 실패 시 PostgreSQL 재시작 필요 → 1인 운영 환경에서 장애 경로 +3.

**결격 사유 2 — SUPERUSER 강제**: pgsodium이 `shared_preload_libraries`에 등록되어야 하고, `CREATE EXTENSION pgsodium`에 SUPERUSER 권한 필요. Prisma 7은 `vault` 스키마를 인식하지 못해 DMMF 기반 Schema Visualizer(Phase 20)와 충돌.

**결격 사유 3 — 시크릿 규모 과잉**: 환경변수 40개 + API 키 15개 + 웹훅 시크릿 10개 = 약 200건 미만. pgsodium의 클러스터 키 관리는 1만 건+ 규모를 전제한 설계로, 현재 프로젝트에 과잉.

**node:crypto 채택 근거**: `node:crypto` AES-256-GCM + envelope encryption(KEK→DEK) 패턴은 코드 200줄 미만, Prisma 모델 1개(`VaultSecret`), `/settings/env` 페이지와 자연스러운 통합 가능. 외부 서비스 의존 0건. 향후 KMS 도입 시 MASTER_KEY 주입 경로만 교체하면 된다.

참고 문서: `01-research/12-observability/01-pgsodium-vs-node-crypto-vault-deep-dive.md` (530+ 줄, 권고도 0.86)

### 2.2 jose JWKS ES256 채택 경과 (Wave 1 Deep-Dive 12/02)

현재 인증 구조는 HS256 단일 JWT_SECRET 환경변수로 동작하며, 키 회전 시 모든 사용자가 즉시 로그아웃된다. Wave 1에서 RS256·ES256·EdDSA 세 비대칭 알고리즘을 비교했다.

**ES256 채택 근거**:
- 키 크기 P-256 ~64B(vs RS256 ~256B, RSA-2048 ~600B JWKS payload)
- 서명 속도 ~0.1ms (vs RS256 ~1ms)
- jose v5 네이티브 지원, Edge Runtime 호환
- 향후 Capacitor 모바일 앱 JWKS 검증에 친화적

**JWKS 회전 전략**: 90일 주기 정기 회전, KID 기반 grace 30일(구 키로 서명된 토큰을 grace 기간 동안 계속 검증). 긴급 회전 시 refresh_token 블랙리스트 또는 세션 버전 방식으로 강제 무효화(DQ-12.13).

**MASTER_KEY 위치 확정 (DQ-12.3)**: Wave 2 F 에이전트가 최종 확정. `/etc/luckystyle4u/secrets.env` (chmod 0640, owner root, group ypb-runtime), PM2 ecosystem의 `env_file` 옵션으로만 프로세스에 주입. 클라이언트 코드 및 git 저장소에 절대 기록 금지.

참고 문서: `01-research/12-observability/02-jose-jwks-rotation-deep-dive.md` (540+ 줄, 권고도 0.88)
참고 문서: `01-research/12-observability/03-observability-matrix.md` (권고도 0.87)

### 2.3 AWS KMS / HashiCorp Vault 거부

Wave 2 매트릭스(03-observability-matrix.md)에서 AWS KMS와 HashiCorp Vault도 검토했다.

**AWS KMS 거부**: AP-5(외부 서비스 최소화) 및 월 $1+ 비용 발생. 현재 $0 목표와 충돌. 네트워크 RTT가 암호화 경로에 추가되어 p99 지연 증가.

**HashiCorp Vault 거부**: 별도 프로세스 유지 부담(WSL2에서 vault 데몬 별도 관리), docker 사용 정책 미충족, 운영자 1인에게 과잉 복잡도.

**재검토 조건**: 이 두 방식으로 전환하는 조건은 ADR-013에 등록됨 — (1) 시크릿 1만 건 초과, (2) 팀 2명+ 확장, (3) MASTER_KEY 유출 의심(즉시 회전 + 90일 이내 KMS 전환 계획 수립).

---

## 3. 컴포넌트 설계

### 3.1 전체 컴포넌트 구조

```
src/lib/
├── vault/
│   ├── master.ts           ← MASTER_KEY 로드 · 검증 · 캐시
│   ├── encrypt.ts          ← KEK/DEK envelope 암호화/복호화
│   ├── rotate.ts           ← KEK 회전 · 일괄 재암호화
│   └── repository.ts       ← Prisma VaultSecret CRUD
│
├── jwks/
│   ├── keygen.ts           ← ES256 키쌍 생성 (jose generateKeyPair)
│   ├── service.ts          ← JWKSService (발급·검증·회전 오케스트레이션)
│   ├── cache.ts            ← 인메모리 JWKS 캐시 (TTL 300s)
│   └── rotation.ts         ← KID grace 관리 · 자동 회전 스케줄러
│
├── logging/
│   ├── logger.ts           ← Pino 구조화 JSON 로거 (레벨별 설정)
│   ├── audit.ts            ← AuditLogPg 기록 헬퍼
│   └── drain.ts            ← LogDrain 외부 전송 (HTTP/Loki)
│
└── metrics/
    ├── collector.ts        ← systeminformation + PM2 API 수집
    ├── sqlite.ts           ← Drizzle SQLite metrics_history 저장
    └── sse.ts              ← Server-Sent Events 스트리머
```

### 3.2 VaultService — 상세 설계

#### 3.2.1 envelope encryption 흐름

```
새 시크릿 저장:
  1. MASTER_KEY (KEK) 로드 ← /etc/luckystyle4u/secrets.env
  2. DEK = crypto.randomBytes(32)              ← per-secret 생성
  3. IV_payload = crypto.randomBytes(12)       ← AES-GCM nonce
  4. {ciphertext, authTag} = aes256gcm_encrypt(plaintext, DEK, IV_payload)
  5. IV_dek = crypto.randomBytes(12)
  6. {wrappedDek, authTag_dek} = aes256gcm_encrypt(DEK, KEK, IV_dek)
  7. VaultSecret row = {
       ciphertext, iv: IV_payload, authTag,
       wrappedDek, dekIv: IV_dek, dekAuthTag: authTag_dek,
       kekVersion: current_kek_version,
       namespace, keyName
     }

복호화:
  1. KEK 로드
  2. DEK = aes256gcm_decrypt(wrappedDek, KEK, dekIv, dekAuthTag)
  3. plaintext = aes256gcm_decrypt(ciphertext, DEK, iv, authTag)
  4. 5분 캐시 (Redis 미사용 → Node.js LRU Map, max 200 항목)
```

#### 3.2.2 TypeScript 구현 스켈레톤

```typescript
// src/lib/vault/encrypt.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12   // GCM 권장 nonce
const TAG_LENGTH = 16  // GCM auth tag

export interface EncryptResult {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export function aesGcmEncrypt(
  plaintext: Buffer,
  key: Buffer,  // 32 bytes
): EncryptResult {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { ciphertext, iv, authTag }
}

export function aesGcmDecrypt(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
): Buffer {
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function envelopeEncrypt(plaintext: string, masterKey: Buffer) {
  const dek = randomBytes(32)
  const payloadResult = aesGcmEncrypt(Buffer.from(plaintext, 'utf-8'), dek)
  const dekResult = aesGcmEncrypt(dek, masterKey)
  return {
    ciphertext: payloadResult.ciphertext,
    iv: payloadResult.iv,
    authTag: payloadResult.authTag,
    wrappedDek: dekResult.ciphertext,
    dekIv: dekResult.iv,
    dekAuthTag: dekResult.authTag,
  }
}

export function envelopeDecrypt(
  params: ReturnType<typeof envelopeEncrypt>,
  masterKey: Buffer,
): string {
  const dek = aesGcmDecrypt(params.wrappedDek, masterKey, params.dekIv, params.dekAuthTag)
  const plaintext = aesGcmDecrypt(params.ciphertext, masterKey, params.iv, params.authTag)
  return plaintext.toString('utf-8')
}
```

#### 3.2.3 KEK 회전 절차

KEK 회전은 **배치 재암호화(batch re-encryption)** 방식으로 수행한다. 서비스 다운 없이 진행 가능하다.

```typescript
// src/lib/vault/rotate.ts
import { db } from '@/lib/db/prisma'
import { loadMasterKey } from './master'
import { envelopeDecrypt, envelopeEncrypt } from './encrypt'

export async function rotateKek(newKekVersion: number): Promise<void> {
  const oldKey = await loadMasterKey()   // 구 버전 키
  const newKey = await loadMasterKey()   // 신 버전 키 (secrets.env 교체 후 PM2 reload 완료)

  // 구 버전으로 암호화된 시크릿 전체 조회
  const secrets = await db.vaultSecret.findMany({
    where: { kekVersion: { lt: newKekVersion } },
  })

  // 트랜잭션으로 일괄 재암호화 (배치 50건 단위)
  const BATCH = 50
  for (let i = 0; i < secrets.length; i += BATCH) {
    const batch = secrets.slice(i, i + BATCH)
    await db.$transaction(
      batch.map((s) => {
        const plaintext = envelopeDecrypt(
          {
            ciphertext: s.ciphertext,
            iv: s.iv,
            authTag: s.authTag,
            wrappedDek: s.wrappedDek,
            dekIv: Buffer.alloc(12), // stored separately in practice
            dekAuthTag: Buffer.alloc(16),
          },
          oldKey,
        )
        const reEncrypted = envelopeEncrypt(plaintext, newKey)
        return db.vaultSecret.update({
          where: { id: s.id },
          data: {
            ...reEncrypted,
            kekVersion: newKekVersion,
          },
        })
      }),
    )
  }
}
```

회전 중 서비스 중단은 없다. 구 키로 서명된 데이터도 `kekVersion` 필드로 추적하여 이전 버전 키로 복호화할 수 있다. **중요**: KEK 자체는 `/etc/luckystyle4u/secrets.env`에 버전별로 보관한다.

```bash
# /etc/luckystyle4u/secrets.env 예시 (chmod 0640, owner root:ypb-runtime)
MASTER_KEY=<base64-32bytes-v1>
MASTER_KEY_V2=<base64-32bytes-v2>
MASTER_KEY_CURRENT_VERSION=2
```

### 3.3 JWKSService — 상세 설계

#### 3.3.1 키쌍 생성 및 게시

```typescript
// src/lib/jwks/keygen.ts
import { generateKeyPair, exportJWK, importJWK } from 'jose'
import { db } from '@/lib/db/prisma'
import { vaultService } from '@/lib/vault/service'
import { randomUUID } from 'node:crypto'

export async function generateAndStoreES256KeyPair(): Promise<string> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', {
    extractable: true,
  })

  const kid = randomUUID()
  const publicKeyJwk = await exportJWK(publicKey)
  publicKeyJwk.kid = kid
  publicKeyJwk.use = 'sig'
  publicKeyJwk.alg = 'ES256'

  // private key는 Vault를 통해 암호화 저장
  const privateKeyJwk = await exportJWK(privateKey)
  const privateKeyJson = JSON.stringify(privateKeyJwk)
  await vaultService.store(`jwks.${kid}.private`, privateKeyJson)

  // public key는 DB에 평문 저장 (외부 노출 가능)
  await db.jwksKey.create({
    data: {
      kid,
      algorithm: 'ES256',
      publicKeyJwk,
      // encryptedPrivateKey는 Vault 참조 ID를 저장
      encryptedPrivateKey: Buffer.from(kid),  // vault key로 매핑
      status: 'UPCOMING',
    },
  })

  return kid
}
```

#### 3.3.2 JWKS 엔드포인트 캐시 전략

```typescript
// src/lib/jwks/cache.ts
// 인메모리 캐시 (PM2 cluster 환경에서 각 워커 독립)
// 공유 캐시가 필요하면 SQLite 또는 PG를 사용 (Redis 미도입)

const CACHE_TTL_MS = 300_000 // 5분

let cachedJwks: { keys: object[] } | null = null
let cacheUpdatedAt = 0

export async function getCachedJwks(): Promise<{ keys: object[] }> {
  const now = Date.now()
  if (cachedJwks && now - cacheUpdatedAt < CACHE_TTL_MS) {
    return cachedJwks
  }
  // DB에서 CURRENT + grace 기간 내 RETIRED 키만 포함
  const keys = await db.jwksKey.findMany({
    where: {
      status: { in: ['CURRENT', 'RETIRED'] },
      OR: [
        { status: 'CURRENT' },
        { retiredAt: { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
    select: { publicKeyJwk: true },
  })
  cachedJwks = { keys: keys.map((k) => k.publicKeyJwk) }
  cacheUpdatedAt = now
  return cachedJwks
}
```

#### 3.3.3 자동 회전 스케줄러

회전 스케줄러는 `node-cron` (cron-worker PM2 앱, fork 모드, ADR-005)에서 실행한다. cluster 모드 중복 방지를 위해 fork 모드 전용 앱으로 분리한다.

```typescript
// src/workers/jwks-rotation-worker.ts
import cron from 'node-cron'
import { jwksService } from '@/lib/jwks/service'
import { logger } from '@/lib/logging/logger'

// 90일마다 1회 실행 (매월 첫 날 02:00 KST)
// 실제 주기는 Phase 16에서 DQ-1.18 답변에 따라 조정
cron.schedule('0 2 1 */3 *', async () => {
  logger.info({ event: 'jwks_rotation_start' }, 'JWKS 정기 회전 시작')
  try {
    await jwksService.rotate({ reason: 'scheduled_90d' })
    logger.info({ event: 'jwks_rotation_complete' }, 'JWKS 정기 회전 완료')
  } catch (error) {
    logger.error({ event: 'jwks_rotation_error', error }, 'JWKS 정기 회전 실패')
    // Slack 알림
  }
})
```

### 3.4 LoggingService — 구조화 JSON

```typescript
// src/lib/logging/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'luckystyle4u',
    env: process.env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // 프로덕션에서는 JSON, 개발에서는 pretty
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

// 감사 로그 전용 헬퍼
export async function recordAuditLog(params: {
  userId?: string
  sessionId?: string
  action: string
  resourceType: string
  resourceId?: string
  oldValue?: object
  newValue?: object
  result: 'SUCCESS' | 'FAILURE' | 'PARTIAL'
  ip: string
  userAgent?: string
  traceId: string
}) {
  await db.auditLogPg.create({ data: params })
  logger.info({ audit: true, ...params }, `감사 로그: ${params.action}`)
}
```

### 3.5 MetricsService — SQLite metrics_history

```typescript
// src/lib/metrics/collector.ts
import si from 'systeminformation'
import pm2 from 'pm2'
import { db as sqliteDb } from '@/lib/db/drizzle'
import { metricsHistory } from '@/lib/db/schema'  // Drizzle SQLite 스키마

export interface MetricsSnapshot {
  cpuPercent: number
  memUsedMb: number
  diskUsedGb: number
  diskTotalGb: number
  pm2Instances: { name: string; pid: number; status: string; cpu: number; mem: number }[]
  pgConnectionCount: number
  tunnelStatus: 'connected' | 'disconnected'
  collectedAt: Date
}

export async function collectMetrics(): Promise<MetricsSnapshot> {
  const [cpu, mem, disk, pm2List, pgConn] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    getPm2ProcessList(),
    getPgConnectionCount(),
  ])

  const snapshot: MetricsSnapshot = {
    cpuPercent: Math.round(cpu.currentLoad),
    memUsedMb: Math.round((mem.used / 1024 / 1024) * 10) / 10,
    diskUsedGb: Math.round((disk[0]?.used ?? 0) / 1024 / 1024 / 1024 * 10) / 10,
    diskTotalGb: Math.round((disk[0]?.size ?? 0) / 1024 / 1024 / 1024 * 10) / 10,
    pm2Instances: pm2List,
    pgConnectionCount: pgConn,
    tunnelStatus: await checkTunnelStatus(),
    collectedAt: new Date(),
  }

  // SQLite에 5초 간격으로 적재
  await sqliteDb.insert(metricsHistory).values({
    cpuPercent: snapshot.cpuPercent,
    memUsedMb: snapshot.memUsedMb,
    diskUsedGb: snapshot.diskUsedGb,
    pm2Json: JSON.stringify(snapshot.pm2Instances),
    pgConnections: snapshot.pgConnectionCount,
    tunnelConnected: snapshot.tunnelStatus === 'connected' ? 1 : 0,
    collectedAt: snapshot.collectedAt,
  })

  return snapshot
}
```

---

## 4. API 설계

### 4.1 Vault API (`/api/v1/vault/*`)

모든 Vault API는 **관리자 인증(JWT + MFA 완료 세션)** 필수. Cloudflare Tunnel 경유이므로 인터넷 노출 상태.

#### 4.1.1 시크릿 목록 조회

```
GET /api/v1/vault/secrets
Authorization: Bearer <JWT>

응답 200:
{
  "secrets": [
    {
      "id": "uuid",
      "namespace": "auth.jwt",
      "keyName": "signing-key-current",
      "metadata": { "description": "JWT ES256 서명 키" },
      "createdAt": "2026-04-18T00:00:00.000Z",
      "expiresAt": null
    }
  ],
  "total": 12
}
// 중요: ciphertext, iv, authTag, wrappedDek는 절대 응답에 포함하지 않음
// plaintext도 응답에 포함하지 않음 (읽기는 복호화 API 별도)
```

#### 4.1.2 시크릿 복호화 조회 (감사 로그 필수)

```
GET /api/v1/vault/secrets/:id/reveal
Authorization: Bearer <JWT>
X-MFA-Token: <현재 세션 MFA 재확인>

응답 200:
{
  "id": "uuid",
  "namespace": "auth.jwt",
  "keyName": "signing-key-current",
  "plaintext": "<복호화된 값>",
  "revealedAt": "2026-04-18T10:00:00.000Z"
}
// 감사 로그 기록: action="vault.secret.revealed", resourceId=id
```

#### 4.1.3 시크릿 저장

```
POST /api/v1/vault/secrets
Authorization: Bearer <JWT>
Content-Type: application/json

요청:
{
  "namespace": "storage.b2",
  "keyName": "access-key",
  "plaintext": "<민감 데이터>",
  "metadata": { "description": "Backblaze B2 액세스 키" },
  "expiresAt": null
}

응답 201:
{
  "id": "uuid",
  "namespace": "storage.b2",
  "keyName": "access-key",
  "createdAt": "2026-04-18T10:00:00.000Z"
}
```

#### 4.1.4 KEK 회전 트리거

```
POST /api/v1/vault/rotate-kek
Authorization: Bearer <JWT>
X-MFA-Token: <현재 세션 MFA 재확인>
Content-Type: application/json

요청:
{
  "newKekVersion": 2,
  "dryRun": false
}

응답 202:
{
  "jobId": "uuid",
  "status": "QUEUED",
  "totalSecrets": 23,
  "estimatedDurationMs": 4600
}
// 백그라운드 작업으로 진행, SSE로 진행률 스트리밍 가능
```

#### 4.1.5 시크릿 삭제 (소프트 삭제)

```
DELETE /api/v1/vault/secrets/:id
Authorization: Bearer <JWT>

응답 200:
{
  "id": "uuid",
  "deletedAt": "2026-04-18T10:00:00.000Z"
}
// vault_secrets.expiresAt = now() (즉시 만료, 복호화 불가)
// 물리 삭제는 60일 후 자동 정리 CronJob이 처리
```

### 4.2 JWKS 엔드포인트 (`/.well-known/jwks.json`)

```
GET /.well-known/jwks.json
// 인증 불필요 (공개 엔드포인트)
// Cache-Control: public, max-age=300, stale-while-revalidate=600

응답 200:
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "<base64url>",
      "y": "<base64url>",
      "kid": "2026-04-18-v1",
      "use": "sig",
      "alg": "ES256"
    },
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "<base64url>",
      "y": "<base64url>",
      "kid": "2026-01-18-v0",    // grace 기간 내 이전 키
      "use": "sig",
      "alg": "ES256"
    }
  ]
}
```

JWKS 응답에 포함되는 키의 조건:
- `status = CURRENT`: 현재 서명 키 1개
- `status = RETIRED` + `retiredAt > now() - 30일`: grace 기간 내 이전 키들
- `status = REVOKED` 키는 절대 포함하지 않음

### 4.3 JWKS 관리 API

```
GET /api/v1/jwks/keys
응답: 키 목록 (상태, kid, 활성화 일시, 만료 일시 포함)

POST /api/v1/jwks/rotate
요청: { "reason": "manual" | "scheduled_90d" | "compromised" }
응답: { "newKid": "uuid", "oldKid": "uuid", "graceUntil": "ISO날짜" }

POST /api/v1/jwks/revoke/:kid
요청: { "reason": "compromised", "forceLogoutAll": true }
응답: { "revokedAt": "ISO날짜", "affectedTokens": 3 }
```

### 4.4 Infrastructure API (`/api/v1/infrastructure/*`)

```
GET /api/v1/infrastructure/status
응답:
{
  "pm2": {
    "processes": [
      { "name": "luckystyle4u-server", "instances": 4, "allOnline": true }
    ]
  },
  "postgresql": { "status": "up", "connections": 8, "maxConnections": 100 },
  "seaweedfs": { "status": "up", "volumeCount": 1, "diskUsedGb": 12.3 },
  "cloudflare": { "tunnelStatus": "connected", "latencyMs": 12 },
  "system": { "cpuPercent": 23, "memUsedMb": 1024, "diskUsedGb": 45.2 }
}

GET /api/v1/infrastructure/metrics/history?period=24h&resolution=5m
응답: [ { "ts": "ISO날짜", "cpu": 23, "mem": 1024, "disk": 45.2 }, ... ]

GET /api/v1/infrastructure/metrics/stream  (SSE)
event: metrics
data: { "cpu": 23, "mem": 1024, ... }
```

---

## 5. 데이터 모델

### 5.1 PostgreSQL — vault_secrets (Tier 1 ERD §3.4.1 기반)

Tier 1 ERD에서 정의한 `VaultSecret` Prisma 모델을 그대로 사용한다. Phase 16에서 추가하는 컬럼은 없으나, 인덱스를 확장한다.

```prisma
/// Vault 시크릿 저장소. AES-256-GCM envelope (KEK→DEK).
/// Phase 16 MVP에서 최초 생성. kekVersion 컬럼으로 회전 추적.
model VaultSecret {
  id               String   @id @default(uuid()) @db.Uuid
  namespace        String                              // "auth.jwt" | "storage.b2"
  keyName          String   @map("key_name")           // "signing-key-current"
  ciphertext       Bytes                               // DEK으로 암호화된 payload
  iv               Bytes                               // AES-GCM nonce 12 bytes
  authTag          Bytes    @map("auth_tag")            // GCM auth tag 16 bytes
  wrappedDek       Bytes    @map("wrapped_dek")         // KEK으로 래핑된 DEK (32 bytes)
  dekIv            Bytes    @map("dek_iv")              // DEK 래핑 nonce 12 bytes
  dekAuthTag       Bytes    @map("dek_auth_tag")        // DEK 래핑 auth tag 16 bytes
  ciphertextVersion Int     @default(1) @map("ciphertext_version")
  kekVersion       Int      @map("kek_version")         // KEK 회전 추적 (ADR-013)
  metadata         Json     @default("{}")              // description, tags 등
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at")
  expiresAt        DateTime? @map("expires_at")         // null = 영구, soft delete 시 now()

  @@unique([namespace, keyName])
  @@index([namespace])
  @@index([kekVersion])       // KEK 회전 대상 조회용
  @@index([expiresAt])        // 만료 정리 CronJob용
  @@map("vault_secrets")
}
```

SQL DDL (마이그레이션 파일):
```sql
-- Phase 16 마이그레이션: 20260418_01_create_vault_secrets.up.sql
CREATE TABLE vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace TEXT NOT NULL,
  key_name TEXT NOT NULL,
  ciphertext BYTEA NOT NULL,
  iv BYTEA NOT NULL CHECK (length(iv) = 12),
  auth_tag BYTEA NOT NULL CHECK (length(auth_tag) = 16),
  wrapped_dek BYTEA NOT NULL,
  dek_iv BYTEA NOT NULL CHECK (length(dek_iv) = 12),
  dek_auth_tag BYTEA NOT NULL CHECK (length(dek_auth_tag) = 16),
  ciphertext_version INTEGER NOT NULL DEFAULT 1,
  kek_version INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- 유일성 + 인덱스
ALTER TABLE vault_secrets ADD CONSTRAINT uq_vault_secrets_ns_key UNIQUE (namespace, key_name);
CREATE INDEX idx_vault_secrets_namespace ON vault_secrets(namespace);
CREATE INDEX idx_vault_secrets_kek_version ON vault_secrets(kek_version);
CREATE INDEX idx_vault_secrets_expires ON vault_secrets(expires_at) WHERE expires_at IS NOT NULL;

-- RLS (운영자만 접근)
ALTER TABLE vault_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY vault_secrets_admin_only ON vault_secrets
  FOR ALL
  USING (current_setting('app.current_user_role') = 'ADMIN');
```

롤백 SQL:
```sql
-- 20260418_01_create_vault_secrets.down.sql
DROP TABLE IF EXISTS vault_secrets;
```

### 5.2 PostgreSQL — jwks_keys (Tier 1 ERD §3.4.2 기반)

```prisma
model JwksKey {
  id                  String        @id @default(uuid()) @db.Uuid
  kid                 String        @unique                     // JWK id
  algorithm           String        @default("ES256")
  publicKeyJwk        Json          @map("public_key_jwk")      // 공개 JWK JSON
  // private key는 Vault vault_secrets에 namespace="jwks.<kid>" keyName="private"으로 저장
  // 이 컬럼은 Vault 내 참조를 저장 (vault secret id)
  vaultSecretId       String?       @map("vault_secret_id") @db.Uuid
  status              JwksKeyStatus @default(UPCOMING)
  activatedAt         DateTime?     @map("activated_at")
  retiredAt           DateTime?     @map("retired_at")          // grace 시작 시점
  createdAt           DateTime      @default(now()) @map("created_at")

  rotations           JwksKeyRotation[]

  @@index([status])
  @@index([retiredAt])   // grace 만료 조회용
  @@map("jwks_keys")
}

enum JwksKeyStatus {
  UPCOMING   // 다음 회전 대기 (아직 서명에 사용 안 함)
  CURRENT    // 현재 서명 키 (단 1개만 CURRENT 허용)
  RETIRED    // 회전됨, grace 30일간 검증만 허용
  REVOKED    // 긴급 폐기 (즉시 JWKS에서 제거)
}
```

```sql
-- 20260418_02_create_jwks_keys.up.sql
CREATE TYPE jwks_key_status AS ENUM ('UPCOMING', 'CURRENT', 'RETIRED', 'REVOKED');

CREATE TABLE jwks_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid TEXT NOT NULL UNIQUE,
  algorithm TEXT NOT NULL DEFAULT 'ES256',
  public_key_jwk JSONB NOT NULL,
  vault_secret_id UUID,
  status jwks_key_status NOT NULL DEFAULT 'UPCOMING',
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CURRENT 키는 1개만 허용 (Partial Unique Index)
CREATE UNIQUE INDEX uq_jwks_keys_single_current
  ON jwks_keys(status)
  WHERE status = 'CURRENT';

CREATE INDEX idx_jwks_keys_status ON jwks_keys(status);
CREATE INDEX idx_jwks_keys_retired_at ON jwks_keys(retired_at) WHERE status = 'RETIRED';

ALTER TABLE jwks_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY jwks_keys_public_read ON jwks_keys
  FOR SELECT USING (status IN ('CURRENT', 'RETIRED'));  -- 공개 키는 모두 읽기 가능
CREATE POLICY jwks_keys_admin_write ON jwks_keys
  FOR ALL USING (current_setting('app.current_user_role') = 'ADMIN');
```

### 5.3 PostgreSQL — jwks_key_rotations (Tier 1 ERD §3.4.3 기반)

```prisma
model JwksKeyRotation {
  id           BigInt   @id @default(autoincrement())
  fromKeyId    String?  @map("from_key_id") @db.Uuid  // null = 최초 생성
  toKeyId      String   @map("to_key_id") @db.Uuid
  toKey        JwksKey  @relation(fields: [toKeyId], references: [id])
  reason       String   // 'scheduled_90d' | 'manual' | 'compromised'
  performedBy  String?  @map("performed_by") @db.Uuid // User.id (null = 자동)
  graceUntil   DateTime @map("grace_until")            // RETIRED 키 grace 만료 시점
  rotatedAt    DateTime @default(now()) @map("rotated_at")

  @@index([rotatedAt])
  @@map("jwks_key_rotations")
}
```

```sql
-- 20260418_03_create_jwks_key_rotations.up.sql
CREATE TABLE jwks_key_rotations (
  id BIGSERIAL PRIMARY KEY,
  from_key_id UUID REFERENCES jwks_keys(id),
  to_key_id UUID NOT NULL REFERENCES jwks_keys(id),
  reason TEXT NOT NULL,
  performed_by UUID REFERENCES users(id),
  grace_until TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_jwks_key_rotations_rotated_at ON jwks_key_rotations(rotated_at);
```

### 5.4 SQLite — metrics_history (Drizzle, Wave 4 신규)

```typescript
// src/lib/db/schema.ts (Drizzle SQLite 추가)
import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core'

export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  cpuPercent: real('cpu_percent').notNull(),
  memUsedMb: real('mem_used_mb').notNull(),
  diskUsedGb: real('disk_used_gb').notNull(),
  diskTotalGb: real('disk_total_gb').notNull(),
  pm2Json: text('pm2_json').notNull(),            // JSON 직렬화
  pgConnections: integer('pg_connections').notNull(),
  tunnelConnected: integer('tunnel_connected').notNull(),  // 0/1 boolean
  collectedAt: integer('collected_at', { mode: 'timestamp' }).notNull(),
})
// 60일 후 폐기 CronJob (DQ-12.8 답변에 따라 보관 기간 결정)
// INDEX: collectedAt 단일 인덱스
```

SQLite DDL:
```sql
-- data/metrics.sqlite 초기화 스크립트
CREATE TABLE IF NOT EXISTS metrics_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cpu_percent REAL NOT NULL,
  mem_used_mb REAL NOT NULL,
  disk_used_gb REAL NOT NULL,
  disk_total_gb REAL NOT NULL,
  pm2_json TEXT NOT NULL,
  pg_connections INTEGER NOT NULL,
  tunnel_connected INTEGER NOT NULL,  -- 0/1
  collected_at INTEGER NOT NULL       -- Unix timestamp
);
CREATE INDEX IF NOT EXISTS idx_metrics_history_collected_at
  ON metrics_history(collected_at DESC);
-- 60일 이상 오래된 레코드 정리 (CronJob 매일 03:00)
```

---

## 6. UI 설계

### 6.1 Infrastructure 페이지 (`/dashboard/settings/infrastructure`)

#### 6.1.1 라우트 구조

```
app/
└── dashboard/
    └── settings/
        └── infrastructure/
            ├── page.tsx          ← Infrastructure 메인 페이지 (Server Component)
            ├── MetricsGrid.tsx   ← 실시간 메트릭 카드 그리드 (Client Component)
            ├── ProcessList.tsx   ← PM2 프로세스 목록 테이블
            ├── MetricsChart.tsx  ← Recharts 24h 추이 그래프
            └── AlertRules.tsx    ← 임계값 설정 폼
```

#### 6.1.2 UI 레이아웃 (Supabase 대시보드 스타일)

```
┌─────────────────────────────────────────────────────────────────┐
│  Infrastructure                                 [새로고침] [설정]  │
│─────────────────────────────────────────────────────────────────│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  CPU     │ │  메모리  │ │  디스크  │ │  Tunnel          │   │
│  │  23%     │ │  1.2GB   │ │  45/100G │ │  ● 연결됨        │   │
│  │  ↑ 정상  │ │  ↑ 정상  │ │  ↑ 정상  │ │  latency 12ms    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                   │
│  PM2 프로세스                                                      │
│  ┌────────────────────────┬────────┬──────┬──────┬────────────┐  │
│  │ 이름                   │ 상태   │ CPU  │ 메모리│ 재시작 횟수│  │
│  ├────────────────────────┼────────┼──────┼──────┼────────────┤  │
│  │ luckystyle4u-0         │ ● 온라인│ 2%  │120MB │ 0          │  │
│  │ luckystyle4u-1         │ ● 온라인│ 1%  │118MB │ 0          │  │
│  │ luckystyle4u-2         │ ● 온라인│ 3%  │125MB │ 0          │  │
│  │ luckystyle4u-3         │ ● 온라인│ 2%  │121MB │ 0          │  │
│  │ cron-worker            │ ● 온라인│ 0%  │ 45MB │ 0          │  │
│  └────────────────────────┴────────┴──────┴──────┴────────────┘  │
│                                                                   │
│  시스템 추이 (최근 24시간)                                          │
│  [CPU ──] [메모리 ──] [디스크 ──] 기간: [1h ▼]                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Recharts LineChart (5분 해상도)                          │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.1.3 SSE 실시간 업데이트 구현

```typescript
// app/api/infrastructure/stream/route.ts
import { NextRequest } from 'next/server'
import { collectMetrics } from '@/lib/metrics/collector'

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const interval = setInterval(async () => {
        const metrics = await collectMetrics()
        send(metrics)
      }, 5000)

      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### 6.2 JWKS 관리 UI

```
app/
└── dashboard/
    └── settings/
        └── api/
            └── jwks/
                ├── page.tsx           ← JWKS 키 관리 메인
                ├── KeyCard.tsx        ← 키 상태 카드 (CURRENT/RETIRED/UPCOMING)
                ├── RotateDialog.tsx   ← 회전 확인 다이얼로그 (2FA 재확인)
                └── RevokeDialog.tsx   ← 긴급 폐기 다이얼로그
```

```
┌─────────────────────────────────────────────────────────────────┐
│  API Keys / JWKS 설정                         [키 회전 ▼]        │
│─────────────────────────────────────────────────────────────────│
│  JWKS 공개 URL: https://stylelucky4u.com/.well-known/jwks.json  │
│                                                [복사] [새 탭에서 열기]│
│                                                                   │
│  JWT 서명 키 목록                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ [● CURRENT]  kid: 2026-04-18-v3                         │     │
│  │  알고리즘: ES256 | 생성: 2026-04-18 | 만료: 2026-07-17  │     │
│  │  [긴급 폐기]                                             │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │ [○ RETIRED]  kid: 2026-01-18-v2  (grace: 17일 남음)     │     │
│  │  알고리즘: ES256 | 생성: 2026-01-18 | 퇴역: 2026-04-18 │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │ [□ UPCOMING] kid: 2026-07-17-v4  (다음 회전 대기)       │     │
│  │  알고리즘: ES256 | 생성: 2026-04-18                      │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  최근 회전 이력                                                    │
│  2026-04-18 02:00  scheduled_90d  v2 → v3  (성공)                │
│  2026-01-18 02:00  scheduled_90d  v1 → v2  (성공)                │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Vault Secrets CRUD UI

```
app/
└── dashboard/
    └── settings/
        └── vault/
            ├── page.tsx            ← Vault 시크릿 목록
            ├── SecretRow.tsx       ← 시크릿 행 (namespace/keyName/reveal 버튼)
            ├── CreateSecretDialog.tsx ← 시크릿 저장 폼
            ├── RevealDialog.tsx    ← 2FA 재확인 후 복호화 표시
            └── KekRotationPanel.tsx ← KEK 회전 진행 패널
```

```
┌─────────────────────────────────────────────────────────────────┐
│  Vault — 시크릿 관리                           [+ 새 시크릿 추가]  │
│  ────────────────────────────────────────────────────────────── │
│  KEK 버전: v2  |  다음 회전 예정: 2026-07-17  [KEK 회전]         │
│                                                                   │
│  검색: [___________________]  네임스페이스: [전체 ▼]              │
│                                                                   │
│  ┌──────────────────┬────────────────────┬──────────┬────────┐  │
│  │ 네임스페이스      │ 키 이름            │ 생성일   │ 액션   │  │
│  ├──────────────────┼────────────────────┼──────────┼────────┤  │
│  │ auth.jwt         │ signing-key-current│ 04-18    │[보기][삭제]│
│  │ storage.b2       │ access-key         │ 04-18    │[보기][삭제]│
│  │ storage.b2       │ secret-key         │ 04-18    │[보기][삭제]│
│  │ webhook.slack    │ signing-secret     │ 04-10    │[보기][삭제]│
│  └──────────────────┴────────────────────┴──────────┴────────┘  │
│                                          전체 12건 / 2KB 추정     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 통합

### 7.1 Auth Core와의 통합 (JWT 서명)

Auth Core(Phase 17)의 JWT 발급 경로는 Phase 16 완료 후 **JWKSService를 경유**하도록 변경한다.

```typescript
// Phase 16 이전 (HS256)
import { SignJWT } from 'jose'
const token = await new SignJWT(payload)
  .setProtectedHeader({ alg: 'HS256' })
  .sign(Buffer.from(process.env.JWT_SECRET!, 'base64'))

// Phase 16 이후 (ES256 + JWKS)
import { jwksService } from '@/lib/jwks/service'
const { privateKey, kid } = await jwksService.getCurrentSigningKey()
const token = await new SignJWT(payload)
  .setProtectedHeader({ alg: 'ES256', kid })
  .sign(privateKey)
```

JWT 검증 경로도 JWKS 캐시를 사용한다:

```typescript
// middleware.ts (JWT 검증)
import { createRemoteJWKSet, jwtVerify } from 'jose'
// 로컬 캐시 (외부 HTTP 호출 없음)
const JWKS = getCachedJwksSet()
const { payload } = await jwtVerify(token, JWKS, { algorithms: ['ES256'] })
```

### 7.2 Auth Advanced와의 통합 (TOTP 시드 저장)

TOTP 시드는 Vault를 통해 envelope 암호화 후 저장한다. `mfa_totp_secrets.encryptedSeed`는 Vault 내부 데이터를 가리키는 참조가 아닌, 직접 암호화된 바이트를 저장한다.

```typescript
// TOTP 등록 시
const encryptedSeed = await vaultService.encrypt(totpSeed, {
  namespace: `mfa.totp.${userId}`,
  keyName: 'seed',
})
await db.mfaTotpSecret.create({
  data: {
    userId,
    encryptedSeed: encryptedSeed.ciphertext,
    dekId: encryptedSeed.vaultSecretId,
  },
})
```

### 7.3 Edge Functions와의 통합 (시크릿 주입)

Edge Functions(Phase 19)에서 환경변수 형태로 시크릿이 필요할 때, VaultService가 복호화 후 격리 환경에 주입한다. 시크릿이 Edge Function 코드에 평문으로 노출되지 않도록 한다.

```typescript
// Edge Function 실행 시 시크릿 주입
const secrets = await vaultService.getSecretsForFunction(functionId)
// isolated-vm 또는 Deno 환경에 주입 (L1/L2 런타임)
const context = new ivm.Context()
context.global.set('ENV', JSON.stringify(secrets))
```

### 7.4 DB Ops Backup 검증과의 통합

백업 파일의 무결성 검증 단계에서 Vault에 저장된 B2 credentials를 사용한다. 백업 스크립트(`src/workers/backup-worker.ts`)는 직접 환경변수를 읽지 않고 VaultService API를 호출한다.

```bash
# wal-g 백업 스크립트에서 Vault 경유 credentials 획득
WALG_S3_ACCESS_KEY=$(node -e "require('./src/lib/vault/cli').get('storage.b2', 'access-key')")
WALG_S3_SECRET_KEY=$(node -e "require('./src/lib/vault/cli').get('storage.b2', 'secret-key')")
wal-g backup-push /var/lib/postgresql/data
```

---

## 8. NFR 매핑

### 8.1 NFR-SEC.1 — JWKS 키 회전

| 항목 | 내용 |
|------|------|
| **NFR ID** | NFR-SEC.1 |
| **설명** | JWKS 키쌍은 90일마다 정기 회전. 긴급 시 즉시 폐기 가능. |
| **목표 수치** | 회전 완료 ≤ 3분, grace 30일 (ADR-013 결정) |
| **충족 방법** | JWKSService.rotate() + node-cron 자동화 + JWKS 캐시 무효화 |
| **측정 방법** | jwks_key_rotations 테이블 감사 로그, 회전 후 /.well-known/jwks.json 업데이트 확인 |

### 8.2 NFR-REL.3 — PM2 cluster 암호화 영향

| 항목 | 내용 |
|------|------|
| **NFR ID** | NFR-REL.3 |
| **설명** | Vault 암호화/복호화는 PM2 cluster:4 모든 워커에서 독립적으로 동작. 단일 워커 크래시가 전체 암호화 기능에 영향 없음. |
| **목표 수치** | 단일 워커 크래시 후 Vault 복호화 캐시 복구 ≤ 5분 |
| **충족 방법** | 인메모리 LRU 캐시는 워커별 독립. 캐시 miss 시 DB에서 재조회. |

### 8.3 NFR-SEC.17 — KEK 회전

| 항목 | 내용 |
|------|------|
| **NFR ID** | NFR-SEC.17 (DQ-1.18 답변 연계) |
| **설명** | MASTER_KEY(KEK)는 90일 주기 회전. 회전 중 서비스 중단 0초. |
| **목표 수치** | 재암호화 배치 처리 속도 200건/분 이상 |
| **충족 방법** | rotateKek() 배치 50건 트랜잭션 + kekVersion 추적 |

### 8.4 NFR-SEC.10 — 감사 로그 불변성

| 항목 | 내용 |
|------|------|
| **NFR ID** | NFR-SEC.10 |
| **설명** | Vault read/write, JWKS 회전, 인증 이벤트 모두 audit_logs_pg에 기록. |
| **목표 수치** | audit_logs_pg에 UPDATE/DELETE 시도 시 PostgreSQL RAISE EXCEPTION |
| **충족 방법** | 테이블에 트리거 부여: `log_audit_immutable_trigger` |

---

## 9. 보안 위협 모델 (STRIDE)

### 9.1 위협 1 — Information Disclosure: MASTER_KEY 유출

**위협 설명**: `/etc/luckystyle4u/secrets.env` 파일이 권한 설정 오류로 일반 사용자에게 노출되거나, PM2 ecosystem.config.js가 git에 커밋되어 MASTER_KEY가 노출되는 시나리오.

**완화책**:
1. 파일 권한 강제: `chmod 0640 /etc/luckystyle4u/secrets.env && chown root:ypb-runtime /etc/luckystyle4u/secrets.env`
2. PM2 ecosystem.config.js에 MASTER_KEY 직접 기재 금지. `env_file: '/etc/luckystyle4u/secrets.env'` 방식만 허용.
3. `.gitignore`에 `ecosystem.config.*.js` 추가 (단, `ecosystem.config.js` 템플릿은 포함, 실제 키 없음).
4. CI에서 git log 내 secrets 패턴 스캔 (gitleaks).
5. 연간 key rotation으로 유출 시 피해 반감기 최소화.

**탐지**: `/etc/luckystyle4u/secrets.env` 파일 접근 감사 (`inotifywait` 또는 auditd rule), PM2 로그에서 env 변수 출력 금지 설정.

### 9.2 위협 2 — Elevation of Privilege: Vault API를 통한 권한 상승

**위협 설명**: 인증된 낮은 권한 사용자가 Vault `/reveal` API를 호출하여 다른 사용자의 시크릿이나 JWKS private key를 획득하려는 시도.

**완화책**:
1. 모든 Vault API는 ADMIN role + 유효 세션 필수.
2. `/reveal` API는 추가 MFA 재확인(OTP 또는 WebAuthn) 강제.
3. 시크릿 조회마다 `audit_logs_pg`에 기록 → 이상 패턴 감지.
4. Rate Limit: 동일 사용자가 `/reveal`을 1분에 5회 이상 호출 시 차단.
5. namespace별 ACL 추후 확장 가능 (현재는 ADMIN = 전체 접근).

**탐지**: 1분 내 `/reveal` 5회 이상 호출 알림, 비정상 시간대(새벽 0~6시) 접근 알림.

### 9.3 위협 3 — Tampering: JWKS 응답 변조

**위협 설명**: Cloudflare Tunnel 경유 중 MITM 공격으로 `/.well-known/jwks.json` 응답의 public key를 공격자 키로 교체하는 시나리오.

**완화책**:
1. Cloudflare Tunnel이 TLS 종단점 역할 → 이미 종단간 암호화.
2. JWKS 응답에 `Cache-Control: public, max-age=300` → 중간 캐시 오염 최소화.
3. 클라이언트는 JWKS fetching 후 `alg: ES256` 강제 검증 (jose `algorithms` 옵션).
4. `/.well-known/jwks.json` 응답에 ETag 추가 → 무결성 변경 감지.

### 9.4 위협 4 — Denial of Service: JWKS 엔드포인트 과부하

**위협 설명**: 외부 서비스나 공격자가 `/.well-known/jwks.json`을 과다 호출하여 DB 부하를 유발하는 시나리오.

**완화책**:
1. 인메모리 캐시 TTL 300s → DB 호출은 최대 5분에 1회.
2. Cloudflare Tunnel의 DDoS 보호 레이어가 1차 방어.
3. 응답 헤더에 `Cache-Control: public, max-age=300, stale-while-revalidate=600` → CDN/브라우저 캐시 활용.

---

## 10. 리스크 및 완화

### 10.1 리스크 1 — MASTER_KEY 유출

**확률**: 낮음 (운영자 1인 + 파일 권한 관리)
**영향**: 매우 높음 (모든 vault 시크릿 평문 노출)

**완화 전략**:
1. **예방**: 파일 권한 0640 + root 소유자 강제, git 커밋 방지, 주기적 권한 감사.
2. **탐지**: auditd 규칙으로 파일 읽기 이벤트 모니터링.
3. **대응 절차**:
   - 즉시: `MASTER_KEY_V{n+1}` 생성 + `/etc/luckystyle4u/secrets.env` 업데이트
   - PM2 reload (`pm2 reload all`)로 새 키 적용
   - rotateKek() 실행으로 모든 시크릿 재암호화
   - 구 버전 키 완전 삭제
   - JWKS 키도 즉시 회전 (서명키 가 같은 서버에 있으므로)
4. **백업**: MASTER_KEY 백업본 2개 — 인쇄본(금고 보관) + GPG 암호화 USB (오프사이트).

### 10.2 리스크 2 — KEK 회전 중 서비스 중단

**확률**: 낮음 (배치 방식으로 중단 설계)
**영향**: 중간 (회전 중 새 시크릿 저장 불가 약 1~5분)

**완화 전략**:
1. `kekVersion` 필드로 구 KEK 버전 데이터를 계속 복호화 가능.
2. 회전 중 새 시크릿 저장 요청은 큐에 적재 (5분 이내 처리).
3. 회전 배치 크기 50건 → 약 200건 기준 총 소요 ~4초.
4. 회전 전 `DRY_RUN` 모드로 예행연습 가능.
5. 회전 작업은 새벽 02:00 KST 저트래픽 시간에 스케줄.

### 10.3 리스크 3 — jose v5 호환성

**확률**: 낮음 (jose 프로젝트 활발, Breaking Change 주의)
**영향**: 중간 (JWKS 발급/검증 전면 재작성 필요)

**완화 전략**:
1. `jose` 버전을 `package.json`에 `"jose": "^5.x"` 범위로 고정.
2. Dependabot PRs에서 major 버전 업그레이드는 수동 검토.
3. ADR-006 재검토 트리거에 "Node 24 LTS에서 jose breaking change" 등록.
4. 검증 경로(`middleware.ts`)에 통합 테스트 2개 필수: ES256 서명/검증 왕복, KID grace 검증.

---

## 11. Wave 4 할당 DQ 답변

### 11.1 DQ-1.18 — KEK 회전 주기

**질문**: KEK(MASTER_KEY)의 권장 회전 주기는?

**Wave 4 확정 답변**: **90일 (분기 1회)**.

근거:
- NIST SP 800-57 권고: 대칭 암호화 키(AES-256) 사용 기간 ≤ 1년. 더 짧은 주기가 보안상 이점이 있으나 운영 부담 증가.
- 1인 운영 환경에서 월 1회(30일) 회전은 실수 위험 증가 → 분기 1회(90일)가 균형점.
- AWS KMS 기본 자동 회전 주기: 365일. Supabase Cloud는 90일.
- `FR-12.1 §2`: "KEK 회전 주기: 90일"로 이미 명시.

구현 방법:
- `cron-worker`에서 매년 1월·4월·7월·10월 첫 날 02:00 KST 자동 실행.
- 90일 기준 DUE_DATE 알림은 60일 시점부터 Infrastructure 페이지에 배너 표시.
- 자동 실행 실패 시 Slack 알림 + 수동 실행 지시.

**ADR-013 재검토 트리거에 추가**: "조직 내 보안 감사에서 90일 주기가 부족하다는 지적 시 30일로 단축".

### 11.2 DQ-1.19 — refresh_token과 JWKS 동기화 grace window

**질문**: JWKS 키 회전 후 기존 refresh_token의 유효성을 얼마나 유지할 것인가? (외부 refresh JWKS 동기화 시 동시성 문제)

**Wave 4 확정 답변**: **3분 grace window** (신규 키로 JWKS 업데이트 후 3분간 구 키 검증 병행).

세부 전략:
1. **정기 회전 시**: JWKS 캐시(max-age=300s)가 전파되는 데 최대 5분 소요. 따라서 grace window는 캐시 TTL의 60% = 3분.
   - 0초: 신규 kid CURRENT 전환, 구 kid RETIRED 전환, JWKS 업데이트
   - 0~3분: 구 kid와 신규 kid 모두 검증 허용 (JWKS에 두 키 포함)
   - 3분+: 구 kid는 JWKS에서 제거하지 않음. 단, 신규 토큰 발급은 신규 kid로만.
   - 30일: 구 kid RETIRED 상태 → REVOKED 전환 (grace 완전 종료)

2. **긴급 회전 시 (compromised)**: grace window 0. 즉시 구 kid REVOKED 전환 + 모든 활성 세션의 refresh_token 무효화.
   - `user_sessions` 테이블의 `revokedAt = NOW()` 일괄 업데이트.
   - 다음 토큰 갱신 시도에서 "세션 만료" 응답 → 재로그인 강제.

3. **DQ-12.13 답변 통합**: 긴급 회전 시 refresh_token 무효화는 `user_sessions.revokedAt` 방식(블랙리스트보다 가벼움). 이유: 1인 운영 환경에서 동시 세션 수 < 10개로 예상.

### 11.3 DQ-12.1 — MASTER_KEY 오프라인 복사본 수

**Wave 4 확정 답변**: **복사본 2개** (인쇄본 1개 + GPG 암호화 USB 1개).

근거: 1개 복사본 = 분실 위험 100%. 3개 이상 = 노출 위험 증가. 2개가 균형점. 두 복사본은 물리적으로 분리된 장소에 보관(자택 금고 + 다른 안전한 장소).

### 11.4 DQ-12.2 — SecretItem 값 길이 제한

**Wave 4 확정 답변**: **4KB 제한** (plaintext 기준).

근거: API 키, OAuth secret, 웹훅 시크릿의 일반적 길이는 32~256 bytes. 4KB는 SSH private key(RSA-4096 ~3.6KB)도 수용. DoS 방어를 위해 상한 설정. 더 큰 데이터는 파일로 SeaweedFS에 저장하고 Vault에는 참조 경로만 저장.

구현: API 계층에서 Zod 검증: `z.string().max(4096)`.

### 11.5 DQ-12.7 — KEK 회전 자동화 수준

**Wave 4 확정 답변**: **자동 알림 + 수동 실행** (자동 실행 옵션 UI 제공).

기본값은 "자동 알림 + 수동 실행"이지만, Infrastructure 페이지 설정에서 "자동 실행"으로 전환 가능. 자동 실행 시 실패하면 Slack 알림 + 수동 개입 요청.

### 11.6 DQ-12.8 — Vault 감사 로그 보관 기간

**Wave 4 확정 답변**: **365일** (1년).

근거: `FR-12.4 §1`에 이미 "보관 기간 1년"이 명시. 이후 cold archive (SeaweedFS 또는 B2). 비용: 연간 1만 건 기준 PostgreSQL ~2MB.

### 11.7 DQ-12.13 — 긴급 JWKS 회전 시 refresh_token 무효화

DQ-1.19 답변 §2에서 통합 답변함. **세션 버전 방식** (`user_sessions.revokedAt` 일괄 업데이트). 블랙리스트 테이블을 별도로 두지 않는다.

---

## 12. Phase 16 WBS — Observability 파트

### 12.1 WBS 개요

**총 공수**: ~20h
**Phase**: Phase 16 (6주 중 3주 할당)
**선행 조건**: PM2 + Prisma 설정 완료, `/etc/luckystyle4u/secrets.env` 파일 생성

### 12.2 작업 항목별 공수 분해

| # | 작업 항목 | 공수 | 선행 | 담당 |
|---|----------|------|------|------|
| O-01 | MASTER_KEY 파일 생성 + 권한 설정 스크립트 | 0.5h | — | 운영자 |
| O-02 | VaultService 구현 (encrypt.ts + master.ts) | 2h | O-01 | 개발자 |
| O-03 | VaultService repository.ts + Prisma 마이그레이션 | 1.5h | O-02 | 개발자 |
| O-04 | VaultService rotate.ts (KEK 배치 회전) | 1.5h | O-03 | 개발자 |
| O-05 | Vault API 라우트 5종 구현 | 2h | O-03 | 개발자 |
| O-06 | JWKSService keygen.ts + service.ts | 1.5h | O-02 | 개발자 |
| O-07 | JWKSService rotation.ts + 스케줄러 | 1h | O-06 | 개발자 |
| O-08 | JWKS API 라우트 (/.well-known/jwks.json + 관리 API) | 1h | O-07 | 개발자 |
| O-09 | LoggingService (Pino 설정 + audit 헬퍼) | 1h | O-03 | 개발자 |
| O-10 | MetricsService (collector + SQLite + SSE) | 1.5h | O-09 | 개발자 |
| O-11 | Infrastructure 페이지 UI (MetricsGrid + chart) | 2h | O-10 | 개발자 |
| O-12 | Vault Secrets CRUD UI | 1.5h | O-05 | 개발자 |
| O-13 | JWKS 관리 UI (KeyCard + RotateDialog) | 1h | O-08 | 개발자 |
| O-14 | 단위 테스트 (envelope 왕복 + JWKS 회전 시나리오) | 1h | O-04, O-07 | 개발자 |
| O-15 | 통합 테스트 + Manual QA | 1h | O-11~O-13 | 개발자 |
| **합계** | | **~20h** | | |

### 12.3 마일스톤

| 마일스톤 | 목표 일정 | 내용 |
|---------|----------|------|
| M-O-1 | Phase 16 시작 1주 차 | Vault 백엔드 완성 (O-01~O-04) |
| M-O-2 | Phase 16 2주 차 | JWKS + API 완성 (O-05~O-08) |
| M-O-3 | Phase 16 3주 차 | UI + 테스트 완성 (O-09~O-15) |

### 12.4 Operations 파트와 공수 정합성

- **Observability**: ~20h (본 문서 §12.2)
- **Operations**: ~20h (`05-operations-blueprint.md §12.2`)
- **Phase 16 합계**: ~40h (6주 중 첫 3주 Observability, 후 3주 Operations — 병렬 가능)

---

## 부록 Z. 근거 인덱스

### Z.1 Wave 문서 인용 목록

| 문서 경로 | 인용 내용 |
|---------|---------|
| `01-research/12-observability/01-pgsodium-vs-node-crypto-vault-deep-dive.md` | pgsodium 거부 사유 3종, node:crypto AES-256-GCM envelope 구조 |
| `01-research/12-observability/02-jose-jwks-rotation-deep-dive.md` | ES256 채택 근거, KID grace 전략, JWKS 응답 포맷 |
| `01-research/12-observability/03-observability-matrix.md` | 5후보 × 10차원 비교, MASTER_KEY 위치 DQ-12.3 확정 |
| `01-research/12-observability/04-jose-jwks-vs-external-jwks.md` | 자체 JWKS vs 외부 KMS 비교 |
| `02-architecture/01-adr-log.md` ADR-013 | Vault + MASTER_KEY 공식 결정 |
| `02-architecture/02-data-model-erd.md` §3.4 | vault_secrets · jwks_keys · jwks_key_rotations Prisma 스키마 |
| `00-vision/02-functional-requirements.md` FR-12 | Vault/JWKS/Infrastructure FR 4건 |
| `00-vision/03-non-functional-requirements.md` NFR-SEC, NFR-REL | 키 회전·감사 로그·PM2 cluster NFR |
| `00-vision/07-dq-matrix.md` DQ-12.* | 14건 Observability DQ 전수 |
| `00-vision/10-14-categories-priority.md` | Phase 16 1위·2위 배치 근거 |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent B2 (Wave 4 Tier 2) | 최초 작성 — ~730줄 |

### Z.3 후속 산출물 연결

- → `05-operations-blueprint.md`: Phase 16 Operations 파트 (Capistrano + PM2)
- → Wave 4 Tier 3 (구현 사양): VaultService 단위 테스트 사양
- → Wave 5 로드맵: Phase 17 Auth Core에서 JWKS 통합 체크포인트

---

> **Observability Blueprint 끝.** Wave 4 · B2 · 2026-04-18 · 카테고리 12 · 65점 → 85점 · Phase 16 MVP · ~20h
