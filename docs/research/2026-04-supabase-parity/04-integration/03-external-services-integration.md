# 03. 외부 서비스 통합 계약 — Backblaze B2 + Anthropic + Slack/Discord + 가비아

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 4 · Tier 3 · I2 Integration 클러스터 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-I2)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [04-integration/](./) → **이 문서**
> 연관: [../02-architecture/07-storage-blueprint.md](../02-architecture/07-storage-blueprint.md) · [../02-architecture/16-ux-quality-blueprint.md](../02-architecture/16-ux-quality-blueprint.md) · [../02-architecture/13-db-ops-blueprint.md](../02-architecture/13-db-ops-blueprint.md) · [../02-architecture/04-observability-blueprint.md](../02-architecture/04-observability-blueprint.md)
> 관련 ADR: ADR-008 (SeaweedFS+B2) · ADR-013 (Vault/MASTER_KEY) · ADR-014 (AI SDK BYOK) · ADR-005 (DB Ops/node-cron)

---

## 0. 문서 구조

```
§1.  개요 — 외부 서비스 맵 및 월 $10 비용 한도 배분
§2.  Backblaze B2 통합 — Storage 오프로드 (ADR-008)
§3.  Anthropic API 통합 — UX Quality BYOK (ADR-014)
§4.  Slack/Discord Webhook 통합 — DB Ops 알림 (ADR-005)
§5.  가비아 DNS — 네임서버만 위임 → Cloudflare
§6.  GitHub — 소스 저장소 단독 사용 (직접 통합 없음)
§7.  BYOK 키 보안 — Vault envelope 적용 범위
§8.  키 회전 일정 — 서비스별 회전 주기
§9.  외부 서비스 장애 대응 — 서비스별 폴백
§10. 비용 모니터링 — 월 $10 한도 관리
§11. ADR 역참조 체계
부록 Z. 근거 인덱스 · 변경 이력
```

---

## 1. 개요 — 외부 서비스 맵 및 월 $10 비용 한도 배분

### 1.1 외부 서비스 전체 목록

양평 부엌 서버 대시보드가 의존하는 외부 서비스는 다음과 같이 분류된다.

| 서비스 | 역할 | 비용 | 연동 방식 | ADR |
|--------|------|------|---------|-----|
| **Backblaze B2** | Storage Cold Tier 오프로드 | $0~1/월 | S3 호환 SDK | ADR-008 |
| **Anthropic Claude** | AI Studio Assistant | ~$2.5~5/월 (BYOK) | HTTP API | ADR-014 |
| **Slack Webhook** | DB Ops / 인프라 알림 | $0 (Incoming Webhook) | HTTP POST | ADR-005 |
| **Discord Webhook** | 동일 (대체 채널) | $0 | HTTP POST | ADR-005 |
| **가비아** | 도메인 등록 | ~$15~20/년 | DNS 네임서버만 | — |
| **Cloudflare** | Tunnel + CDN + SSL | $0 (무료 플랜) | cloudflared | ADR-015 |
| **GitHub** | 소스 코드 저장소 | $0 (Public or 개인) | git push/pull | — |
| **wal-g → B2** | PostgreSQL PITR 백업 | B2 비용에 포함 | wal-g 바이너리 | ADR-005 |

### 1.2 AP-5 핵심가치: 월 $10 한도 배분 계획

AP-5 원칙: 외부 서비스 최소화 + 월 $10 운영 비용 상한.

```
월 $10 한도 배분:
├── Backblaze B2: $0.3~1.0/월
│   ├── Storage: $0.006/GB × 50GB = $0.30
│   └── Download: $0.01/GB × 10GB = $0.10
│
├── Anthropic Claude: $0~5/월 (BYOK — 사용자 키 사용 시 $0)
│   ├── 운영자 기본 사용: ~$1~2/월 (Haiku 위주)
│   └── 집중 사용 상한: $5/월 (비상 탈출 게이트)
│
├── Cloudflare: $0/월 (무료 플랜 유지)
├── Slack/Discord Webhook: $0/월
├── 가비아 도메인: ~$1.5/월 (연 $18 → 월 환산)
└── 여유분: $2~3/월 (예비)

──────────────────────────────────────
총계: ~$3~7/월 (여유 $3~7 존재)
```

---

## 2. Backblaze B2 통합 — Storage 오프로드 (ADR-008)

### 2.1 Backblaze B2 계정 및 버킷 구성

```
Backblaze B2 계정: smartkdy7@naver.com
│
├── 버킷: luckystyle4u-prod
│   ├── 용도: Hot SeaweedFS → Cold B2 자동 티어링
│   ├── 공개 여부: Private (Signed URL로만 접근)
│   ├── 라이프사이클 규칙: 없음 (wal-g 보관 직접 관리)
│   └── 리전: us-west-004 (S3 호환 엔드포인트)
│
├── 버킷: luckystyle4u-wal-archive
│   ├── 용도: PostgreSQL PITR WAL 아카이빙 (wal-g)
│   ├── 공개 여부: Private
│   └── 보관: 30일 라이프사이클 (WAL 30일 보관 후 자동 삭제)
│
└── 버킷: luckystyle4u-backups
    ├── 용도: pg_dump 주 1회 full backup
    ├── 공개 여부: Private
    └── 보관: 90일 라이프사이클

앱 키 구성:
├── 마스터 키: 계정 레벨 (관리용, 일상 사용 금지)
├── 앱 키 1 (wal-g): luckystyle4u-wal-archive 버킷 전용, read/write
└── 앱 키 2 (storage): luckystyle4u-prod 버킷 전용, read/write
```

### 2.2 S3 호환 엔드포인트 설정

Backblaze B2는 AWS S3 호환 API를 제공한다. SeaweedFS와 동일한 `@aws-sdk/client-s3` 를 사용하므로 SDK 전환 없이 엔드포인트만 변경하면 된다.

```typescript
// src/lib/storage/b2-client.ts
import { S3Client } from '@aws-sdk/client-s3'
import { env } from '@/lib/env'

export const b2Client = new S3Client({
  endpoint: env.B2_ENDPOINT,           // https://s3.us-west-004.backblazeb2.com
  region: env.B2_REGION,               // us-west-004
  credentials: {
    accessKeyId: env.B2_ACCOUNT_ID,    // Backblaze Account ID
    secretAccessKey: env.B2_APPLICATION_KEY,
  },
  // B2는 path-style addressing 필요
  forcePathStyle: true,
})

// SeaweedFS(Hot Tier) 클라이언트 (내부, 동일 SDK)
export const seaweedfsClient = new S3Client({
  endpoint: 'http://localhost:8888',    // SeaweedFS S3 endpoint
  region: 'us-east-1',                 // SeaweedFS는 region 무관
  credentials: {
    accessKeyId: 'seaweedfs-key',
    secretAccessKey: 'seaweedfs-secret',
  },
  forcePathStyle: true,
})
```

### 2.3 티어링 규칙 — Hot SeaweedFS / Cold B2

ADR-008 결정: Hot Tier = SeaweedFS(로컬, 즉시 접근), Cold Tier = B2(원격, 24h 딜레이 + 운영자 승인 게이트).

```typescript
// src/lib/storage/tiering-service.ts
import { b2Client, seaweedfsClient } from './b2-client'
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/db'
import { slackNotifier } from '@/lib/notifications/slack-notifier'

/**
 * 파일 티어링 정책:
 * - 업로드 → SeaweedFS(Hot)에 즉시 저장
 * - 24시간 경과 후 → Cold 티어링 후보로 마킹
 * - 운영자 승인(대시보드) 또는 자동 승인(설정 on) → B2로 이전
 * - B2 이전 완료 → SeaweedFS에서 삭제
 */

interface TieringJob {
  fileId: string
  bucketName: string
  objectKey: string
  sizeBytes: bigint
  uploadedAt: Date
}

export class TieringService {
  private readonly COLD_THRESHOLD_HOURS = 24
  private readonly AUTO_APPROVE_THRESHOLD_BYTES = 1_000_000  // 1MB 미만 자동 승인

  /**
   * Cold 티어링 후보 조회 (cron-worker에서 1시간마다 실행)
   */
  async findColdCandidates(): Promise<TieringJob[]> {
    const threshold = new Date(Date.now() - this.COLD_THRESHOLD_HOURS * 3600 * 1000)
    const files = await prisma.storageFile.findMany({
      where: {
        tier: 'HOT',
        uploadedAt: { lt: threshold },
        tiering_status: null,
      },
      take: 100,  // 한 번에 최대 100건 처리
    })
    return files.map((f) => ({
      fileId: f.id,
      bucketName: f.bucketName,
      objectKey: f.objectKey,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.uploadedAt,
    }))
  }

  /**
   * Hot → Cold 이전 실행
   * 자동 승인 조건: 1MB 미만 파일
   * 수동 승인 필요: 1MB 이상 파일 (Slack 알림 발송)
   */
  async tierToCold(job: TieringJob, forceApprove = false): Promise<void> {
    const needsApproval =
      job.sizeBytes >= BigInt(this.AUTO_APPROVE_THRESHOLD_BYTES) && !forceApprove

    if (needsApproval) {
      // 운영자 승인 대기 상태로 변경
      await prisma.storageFile.update({
        where: { id: job.fileId },
        data: { tiering_status: 'PENDING_APPROVAL' },
      })
      // Slack 알림
      await slackNotifier.send({
        channel: '#storage-ops',
        text: `📦 Cold 티어링 승인 요청: \`${job.objectKey}\` (${(Number(job.sizeBytes) / 1024 / 1024).toFixed(2)} MB). 대시보드에서 승인 후 B2로 이전됩니다.`,
      })
      return
    }

    await this._executeTiering(job)
  }

  private async _executeTiering(job: TieringJob): Promise<void> {
    // 1. B2에 복사
    const copyCmd = new CopyObjectCommand({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: job.objectKey,
      CopySource: `${job.bucketName}/${job.objectKey}`,
    })
    // SeaweedFS에서 B2로 직접 복사 불가 → getObject + putObject 사용
    const getCmd = new GetObjectCommand({
      Bucket: job.bucketName,
      Key: job.objectKey,
    })
    const { Body } = await seaweedfsClient.send(getCmd)
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    await b2Client.send(
      new PutObjectCommand({
        Bucket: process.env.B2_BUCKET_NAME,
        Key: job.objectKey,
        Body,
      }),
    )

    // 2. DB 상태 업데이트 (tier: COLD)
    await prisma.storageFile.update({
      where: { id: job.fileId },
      data: {
        tier: 'COLD',
        tiering_status: 'COMPLETED',
        tieredAt: new Date(),
      },
    })

    // 3. SeaweedFS에서 삭제
    await seaweedfsClient.send(
      new DeleteObjectCommand({ Bucket: job.bucketName, Key: job.objectKey }),
    )
  }
}

export const tieringService = new TieringService()
```

### 2.4 비용 모델

```
Backblaze B2 비용 구조:
├── 저장: $0.005/GB/월 (공식 페이지 기준 2026년 4월)
├── 다운로드: $0.01/GB (첫 1GB/일 무료)
└── 트랜잭션: Class A(쓰기) $0.004/1000, Class B(읽기) 무료, Class C 무료

월별 예상 비용 (50GB 저장, 10GB 다운로드 기준):
  저장:    50GB × $0.005 = $0.25
  다운로드: 10GB × $0.01  = $0.10 (첫 1GB/일 = 30GB/월 무료 → 실질 0GB 유료)
  트랜잭션: 1000 쓰기 × $0.004/1000 = $0.004
  ──────────────────────────────
  월 합계: ~$0.25~0.35 (여유 충분)

wal-g WAL 아카이브 추가 비용:
  WAL 평균 크기: ~1~5MB/시간 × 720시간 = ~0.72~3.6GB/월
  B2 저장: 3.6GB × $0.005 = $0.018
  → 무시 가능 수준
```

### 2.5 앱 키 회전 정책 (90일)

```typescript
// src/lib/storage/key-rotation-checker.ts
// cron-worker에서 매일 실행하여 90일 임박 시 Slack 알림

export async function checkB2KeyExpiration(): Promise<void> {
  const KEY_ROTATION_DAYS = 90
  const WARN_BEFORE_DAYS = 14

  const lastRotated = await prisma.systemConfig.findUnique({
    where: { key: 'b2_key_last_rotated' },
  })

  if (!lastRotated) return

  const daysSince = Math.floor(
    (Date.now() - new Date(lastRotated.value).getTime()) / (1000 * 60 * 60 * 24),
  )

  if (daysSince >= KEY_ROTATION_DAYS - WARN_BEFORE_DAYS) {
    await slackNotifier.send({
      channel: '#infra-alerts',
      text: `🔑 B2 앱 키 회전 필요: 마지막 회전 ${daysSince}일 전 (90일 주기). 대시보드 → Settings → API Keys에서 회전하세요.`,
    })
  }
}
```

키 회전 절차:
1. Backblaze B2 대시보드에서 새 앱 키 생성 (동일 버킷 권한)
2. `/etc/luckystyle4u/secrets.env`에서 `B2_APPLICATION_KEY` 업데이트
3. PM2 reload로 새 키 반영: `pm2 reload yangpyeong-web --update-env`
4. `system_config` 테이블의 `b2_key_last_rotated` 값 갱신
5. 구 키 B2 대시보드에서 삭제

---

## 3. Anthropic API 통합 — UX Quality BYOK (ADR-014)

### 3.1 BYOK 패턴 — 사용자별 API 키 저장

ADR-014 결정: Anthropic Claude API는 BYOK(Bring Your Own Key) 패턴으로 사용자가 직접 Anthropic API 키를 제공한다. 키는 Vault envelope(AES-256-GCM, ADR-013)으로 암호화하여 저장한다.

```typescript
// src/lib/ai/byok-service.ts
import { vaultService } from '@/lib/vault/vault-service'
import { prisma } from '@/lib/db'

interface AnthropicKeyData {
  apiKey: string
  model: 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-7'
  dailyLimitUSD: number   // 일 한도 (기본 $0.17)
  monthlyLimitUSD: number // 월 한도 (기본 $5)
}

export class BYOKService {
  /**
   * Anthropic API 키 저장 (Vault envelope 암호화)
   * ADR-013: KEK(MASTER_KEY) → DEK(per-secret) → AES-256-GCM 암호화
   */
  async saveAnthropicKey(userId: string, data: AnthropicKeyData): Promise<void> {
    const encryptedKey = await vaultService.encrypt(data.apiKey)

    await prisma.anthropicApiKey.upsert({
      where: { userId },
      create: {
        userId,
        encryptedKey: encryptedKey.ciphertext,
        keyIv: encryptedKey.iv,
        keyTag: encryptedKey.tag,
        keyDek: encryptedKey.dek,
        preferredModel: data.model,
        dailyLimitUSD: data.dailyLimitUSD,
        monthlyLimitUSD: data.monthlyLimitUSD,
        isActive: true,
        createdAt: new Date(),
      },
      update: {
        encryptedKey: encryptedKey.ciphertext,
        keyIv: encryptedKey.iv,
        keyTag: encryptedKey.tag,
        keyDek: encryptedKey.dek,
        preferredModel: data.model,
        dailyLimitUSD: data.dailyLimitUSD,
        monthlyLimitUSD: data.monthlyLimitUSD,
        updatedAt: new Date(),
      },
    })
  }

  /**
   * 사용자의 Anthropic API 키 복호화 (호출 시에만 복호화)
   */
  async getDecryptedKey(userId: string): Promise<string | null> {
    const record = await prisma.anthropicApiKey.findUnique({
      where: { userId, isActive: true },
    })
    if (!record) return null

    return vaultService.decrypt({
      ciphertext: record.encryptedKey,
      iv: record.keyIv,
      tag: record.keyTag,
      dek: record.keyDek,
    })
  }
}

export const byokService = new BYOKService()
```

### 3.2 Sonnet 4.6 / Opus 4.7 모델 라우팅

```typescript
// src/lib/ai/model-router.ts
import { anthropic } from '@ai-sdk/anthropic'
import type { AIRequestContext } from './types'

export type AnthropicModel =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'

/**
 * 요청 복잡도와 비용 한도를 기반으로 모델 선택
 *
 * 라우팅 규칙:
 * - 기본: claude-haiku-4-5 (빠르고 저렴, ~$0.0025/1k tokens input)
 * - 코드 생성/분석 요청: claude-sonnet-4-6 (균형, ~$0.003/1k tokens)
 * - 복잡한 쿼리 최적화/아키텍처 조언: claude-opus-4-7 (고성능, ~$0.015/1k tokens)
 * - 월 한도 80% 초과 시: Haiku로 강제 다운그레이드
 */
export function selectModel(ctx: AIRequestContext): AnthropicModel {
  const { requestType, monthlyUsageRatio, userPreference } = ctx

  // 월 한도 80% 초과 시 Haiku 강제
  if (monthlyUsageRatio >= 0.8) {
    return 'claude-haiku-4-5'
  }

  // 사용자 명시 지정 (BYOK 설정에서)
  if (userPreference && ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'].includes(userPreference)) {
    return userPreference as AnthropicModel
  }

  // 요청 유형별 라우팅
  switch (requestType) {
    case 'sql_generation':
    case 'sql_explanation':
    case 'schema_suggestion':
      return 'claude-sonnet-4-6'

    case 'advisor_analysis':
    case 'query_optimization':
      return 'claude-sonnet-4-6'

    case 'simple_chat':
    case 'toast_message':
    case 'label_generation':
    default:
      return 'claude-haiku-4-5'
  }
}

export function getAnthropicModel(model: AnthropicModel) {
  return anthropic(model)
}
```

### 3.3 프롬프트 캐싱 활용 (5분 TTL) — 비용 절감 33%

Anthropic 프롬프트 캐싱(5분 TTL)을 활용하면 반복 시스템 프롬프트 비용을 33% 절감한다. DB 스키마, Advisor 규칙 등 자주 반복되는 컨텍스트에 캐시 마커를 추가한다.

```typescript
// src/lib/ai/prompt-cache.ts
import { streamText, generateObject } from 'ai'
import { getAnthropicModel, selectModel } from './model-router'
import type { CoreMessage } from 'ai'

/**
 * 캐시 가능한 시스템 프롬프트 구성
 *
 * Anthropic 캐시 마커: `cache_control: { type: 'ephemeral' }` (5분 TTL)
 * 캐시 대상: 시스템 프롬프트 (DB 스키마, 규칙 목록 등 변하지 않는 컨텍스트)
 * 캐시 미적용: 사용자 메시지 (매번 다름)
 *
 * 비용 절감 메커니즘:
 * - 캐시 히트: 입력 토큰 비용 10% (90% 절감)
 * - 캐시 미스: 일반 비용 (write 시 캐시 저장, 약 1.25x 비용)
 * - 평균 절감: ~33% (Anthropic 공식 문서 기준)
 */
export function buildCachedSystemPrompt(schemaContext: string): CoreMessage[] {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `당신은 양평 부엌 서버 대시보드의 AI 어시스턴트입니다. 아래는 현재 데이터베이스 스키마입니다:\n\n${schemaContext}`,
          // @ts-expect-error — Vercel AI SDK v6 캐시 마커 (experimental)
          experimental_providerMetadata: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
      ],
    },
  ]
}

/**
 * SQL 생성 스트림 (캐시 적용)
 */
export async function streamSQLGeneration(
  userPrompt: string,
  schemaContext: string,
  apiKey: string,
) {
  const cachedMessages = buildCachedSystemPrompt(schemaContext)

  return streamText({
    model: getAnthropicModel('claude-sonnet-4-6'),
    messages: [
      ...cachedMessages,
      { role: 'user', content: userPrompt },
    ],
    // BYOK: 런타임 API 키 주입
    // Vercel AI SDK v6에서 커스텀 provider 인스턴스 생성 필요
  })
}
```

**캐시 TTL 고려사항**:
- 5분 TTL 내에 동일 시스템 프롬프트(스키마)로 여러 요청이 있을 때만 캐시 효과 발생
- DB 스키마 변경 후 첫 요청 시 캐시 miss (새 스키마로 캐시 업데이트)
- 공식 메모리(global CLAUDE.md): "5분 캐시 TTL 인지 (sleep은 270초 미만 또는 1200초 이상으로)"

### 3.4 비용 가드 — 일 $0.17 / 월 $5 상한

```typescript
// src/lib/ai/cost-guard.ts
import { prisma } from '@/lib/db'

export const COST_LIMITS = {
  DAILY_USD: 0.17,           // 일 한도 $0.17 (최대 월 $5.10)
  MONTHLY_USD: 5.00,         // 월 한도 $5 (NFR-COST.2)
  WARN_AT_MONTHLY_RATIO: 0.8, // 80% 도달 시 경고
  BLOCK_AT_MONTHLY_RATIO: 1.0, // 100% 도달 시 차단
} as const

// 토큰 비용 표 (2026-04-18 Anthropic 공식 가격 기준)
const TOKEN_COSTS_USD_PER_1K = {
  'claude-haiku-4-5': { input: 0.00025, output: 0.00125, cacheRead: 0.000025, cacheWrite: 0.0003 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015, cacheRead: 0.0003, cacheWrite: 0.00375 },
  'claude-opus-4-7': { input: 0.015, output: 0.075, cacheRead: 0.0015, cacheWrite: 0.01875 },
} as const

export class CostGuard {
  async checkLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.aiUsageEvent.aggregate({
        where: { userId, createdAt: { gte: dayStart } },
        _sum: { costUSD: true },
      }),
      prisma.aiUsageEvent.aggregate({
        where: { userId, createdAt: { gte: monthStart } },
        _sum: { costUSD: true },
      }),
    ])

    const dailyCost = Number(dailyUsage._sum.costUSD ?? 0)
    const monthlyCost = Number(monthlyUsage._sum.costUSD ?? 0)

    if (dailyCost >= COST_LIMITS.DAILY_USD) {
      return { allowed: false, reason: `일 한도 초과 ($${dailyCost.toFixed(4)} / $${COST_LIMITS.DAILY_USD})` }
    }
    if (monthlyCost >= COST_LIMITS.MONTHLY_USD) {
      return { allowed: false, reason: `월 한도 초과 ($${monthlyCost.toFixed(2)} / $${COST_LIMITS.MONTHLY_USD})` }
    }
    return { allowed: true }
  }

  async recordUsage(params: {
    userId: string
    model: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    requestType: string
  }): Promise<void> {
    const costs = TOKEN_COSTS_USD_PER_1K[params.model as keyof typeof TOKEN_COSTS_USD_PER_1K]
    if (!costs) return

    const costUSD =
      (params.inputTokens / 1000) * costs.input +
      (params.outputTokens / 1000) * costs.output +
      ((params.cacheReadTokens ?? 0) / 1000) * costs.cacheRead +
      ((params.cacheWriteTokens ?? 0) / 1000) * costs.cacheWrite

    await prisma.aiUsageEvent.create({
      data: {
        userId: params.userId,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        cacheReadTokens: params.cacheReadTokens ?? 0,
        cacheWriteTokens: params.cacheWriteTokens ?? 0,
        costUSD,
        requestType: params.requestType,
        createdAt: new Date(),
      },
    })
  }
}

export const costGuard = new CostGuard()
```

### 3.5 Rate Limit 대응 — 429 retry with backoff

```typescript
// src/lib/ai/retry-handler.ts

/**
 * Anthropic 429 (Rate Limit) 대응 지수 백오프 재시도
 * Anthropic Rate Limit:
 *   - Tier 1: claude-haiku-4-5 → 60 req/min, 60,000 tokens/min
 *   - Tier 1: claude-sonnet-4-6 → 60 req/min, 60,000 tokens/min
 * 1인 운영자 기준 실제 한도 초과 가능성 낮음.
 * 비상 시(집중 사용) 대비 재시도 로직.
 */
export async function withAnthropicRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof Error) {
        // 429 Too Many Requests
        if (error.message.includes('429') || error.message.includes('rate_limit')) {
          lastError = error
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000) // 최대 30초
          const jitterMs = Math.random() * 1000  // 0~1초 지터
          console.warn(`[Anthropic] Rate limit hit, retry ${attempt + 1}/${maxRetries} in ${backoffMs + jitterMs}ms`)
          await new Promise((r) => setTimeout(r, backoffMs + jitterMs))
          continue
        }
        // 429 외 에러는 즉시 throw
        throw error
      }
      throw error
    }
  }
  throw lastError ?? new Error('Anthropic 재시도 한도 초과')
}
```

---

## 4. Slack/Discord Webhook 통합 — DB Ops 알림 (ADR-005)

### 4.1 Incoming Webhook 구성

```
Slack 설정:
├── 앱: "양평 대시보드 알림" (Slack App 생성)
├── Incoming Webhook URL: https://hooks.slack.com/services/T.../B.../...
├── 채널 목록:
│   ├── #infra-alerts — Cloudflare Tunnel, PM2, sysctl 이상
│   ├── #db-ops — cron 실패, backup 실패, migrate 이상
│   ├── #security — MFA 이상 로그인, rate limit 돌파
│   └── #storage-ops — B2 티어링 승인 요청, 용량 경고

Discord 설정 (대체 채널):
├── 서버: 양평 대시보드 (개인 서버)
├── Webhook URL: https://discord.com/api/webhooks/.../...
└── 채널: #alerts (단일 채널, Slack 장애 시 대체)
```

**주의**: Webhook URL은 `/etc/luckystyle4u/secrets.env`에 저장. git 커밋 금지.

### 4.2 Slack Block Kit 메시지 포맷

```typescript
// src/lib/notifications/slack-notifier.ts
import { env } from '@/lib/env'

interface SlackBlock {
  type: string
  text?: { type: string; text: string }
  fields?: Array<{ type: string; text: string }>
}

interface SlackMessage {
  channel: string
  text: string              // 알림 축약 (푸시 알림 미리보기용)
  blocks?: SlackBlock[]     // Block Kit (상세 포맷)
  attachments?: unknown[]
}

export class SlackNotifier {
  private readonly webhookUrl = env.SLACK_WEBHOOK_URL

  async send(message: SlackMessage): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('[SlackNotifier] SLACK_WEBHOOK_URL 미설정 — 알림 스킵')
      return
    }

    const payload = {
      channel: message.channel,
      text: message.text,
      blocks: message.blocks,
    }

    await this._sendWithRetry(payload)
  }

  /**
   * DB Ops cron 실패 알림
   */
  async notifyCronFailure(params: {
    jobName: string
    errorMessage: string
    attempt: number
    nextRetryAt?: Date
  }): Promise<void> {
    await this.send({
      channel: '#db-ops',
      text: `❌ Cron 잡 실패: ${params.jobName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `❌ Cron 잡 실패: ${params.jobName}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*에러*\n\`${params.errorMessage.slice(0, 200)}\`` },
            { type: 'mrkdwn', text: `*시도 횟수*\n${params.attempt}회` },
            ...(params.nextRetryAt
              ? [{ type: 'mrkdwn', text: `*다음 재시도*\n${params.nextRetryAt.toISOString()}` }]
              : [{ type: 'mrkdwn', text: '*상태*\nDLQ 이동 (재시도 한도 소진)' }]),
          ],
        },
      ],
    })
  }

  /**
   * 백업 실패 알림
   */
  async notifyBackupFailure(params: {
    backupType: 'full' | 'incremental' | 'wal'
    errorMessage: string
    lastSuccessAt?: Date
  }): Promise<void> {
    await this.send({
      channel: '#db-ops',
      text: `🚨 DB 백업 실패: ${params.backupType}`,
      blocks: [
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*백업 유형*\n${params.backupType}` },
            { type: 'mrkdwn', text: `*에러*\n\`${params.errorMessage.slice(0, 300)}\`` },
            ...(params.lastSuccessAt
              ? [{ type: 'mrkdwn', text: `*마지막 성공*\n${params.lastSuccessAt.toISOString()}` }]
              : [{ type: 'mrkdwn', text: '*마지막 성공*\n기록 없음' }]),
          ],
        },
      ],
    })
  }

  /**
   * MFA 이상 로그인 알림
   */
  async notifyMFAAbnormalLogin(params: {
    userId: string
    ipAddress: string
    location?: string
    reason: string
  }): Promise<void> {
    await this.send({
      channel: '#security',
      text: `🔐 MFA 이상 로그인 감지: ${params.userId}`,
      blocks: [
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*사용자*\n${params.userId}` },
            { type: 'mrkdwn', text: `*IP*\n${params.ipAddress}` },
            { type: 'mrkdwn', text: `*위치*\n${params.location ?? '알 수 없음'}` },
            { type: 'mrkdwn', text: `*사유*\n${params.reason}` },
          ],
        },
      ],
    })
  }

  /**
   * Rate Limit 돌파 알림 (DB 기반 카운터)
   */
  async notifyRateLimitBreached(params: {
    ipAddress: string
    endpoint: string
    requestCount: number
    windowMinutes: number
  }): Promise<void> {
    await this.send({
      channel: '#security',
      text: `⚠️ Rate Limit 돌파: ${params.ipAddress}`,
      blocks: [
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*IP*\n${params.ipAddress}` },
            { type: 'mrkdwn', text: `*엔드포인트*\n${params.endpoint}` },
            { type: 'mrkdwn', text: `*요청 수*\n${params.requestCount}건 / ${params.windowMinutes}분` },
          ],
        },
      ],
    })
  }

  private async _sendWithRetry(payload: unknown, maxRetries = 3): Promise<void> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          throw new Error(`Slack Webhook HTTP ${response.status}: ${await response.text()}`)
        }
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000)
        await new Promise((r) => setTimeout(r, backoffMs))
      }
    }
    // 재시도 실패 시 로컬 로그만 (Slack 자체 장애 시 무한 루프 방지)
    console.error('[SlackNotifier] 재시도 한도 소진:', lastError?.message)
  }
}

export const slackNotifier = new SlackNotifier()
```

### 4.3 Discord Embed 포맷

```typescript
// src/lib/notifications/discord-notifier.ts
import { env } from '@/lib/env'

interface DiscordEmbed {
  title: string
  description?: string
  color: number  // 10진수 색상값
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  timestamp?: string
  footer?: { text: string }
}

export class DiscordNotifier {
  private readonly webhookUrl = env.DISCORD_WEBHOOK_URL

  private readonly COLORS = {
    success: 0x00b04f,   // 초록
    warning: 0xffa500,   // 주황
    error: 0xff0000,     // 빨강
    info: 0x007bff,      // 파랑
  } as const

  async send(params: {
    content?: string
    embeds: DiscordEmbed[]
  }): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('[DiscordNotifier] DISCORD_WEBHOOK_URL 미설정 — 스킵')
      return
    }

    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: params.content,
        embeds: params.embeds.map((e) => ({
          ...e,
          timestamp: e.timestamp ?? new Date().toISOString(),
        })),
      }),
    })
  }

  /**
   * Slack 실패 시 Discord로 폴백
   */
  async notifyGenericAlert(title: string, message: string, severity: keyof typeof this.COLORS): Promise<void> {
    await this.send({
      embeds: [
        {
          title,
          description: message,
          color: this.COLORS[severity],
          footer: { text: '양평 부엌 대시보드' },
        },
      ],
    })
  }
}

export const discordNotifier = new DiscordNotifier()
```

### 4.4 알림 이벤트 목록

| 이벤트 | 채널 | 심각도 | 재시도 정책 |
|--------|------|-------|-----------|
| Cron 잡 실패 (DLQ 이동) | #db-ops | 에러 | 3회 지수 백오프 |
| pg_dump 백업 실패 | #db-ops | 에러 | 3회 지수 백오프 |
| WAL 아카이브 실패 | #db-ops | 에러 | 3회 지수 백오프 |
| B2 티어링 승인 요청 | #storage-ops | 정보 | 1회 (알림성) |
| B2 용량 90% 도달 | #infra-alerts | 경고 | 1회/일 |
| MFA 이상 로그인 | #security | 에러 | 3회 지수 백오프 |
| Rate Limit 돌파 | #security | 경고 | 3회 지수 백오프 |
| Cloudflare Tunnel 안정성 < 95% | #infra-alerts | 경고 | 1회/일 |
| AI 비용 월 한도 80% 도달 | #infra-alerts | 경고 | 1회/주 |
| MASTER_KEY 환경변수 미감지 | #infra-alerts | 에러 | PM2 시작 시 즉시 |
| 배포 실패 + 자동 롤백 | #db-ops | 에러 | 3회 |
| B2 키 90일 회전 임박 | #infra-alerts | 경고 | 1회/일 (회전 14일 전~) |

### 4.5 재시도 정책 (지수 백오프 3회)

```typescript
// 공통 재시도 유틸리티 (Slack, Discord, 외부 서비스 공통)
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries - 1) {
        const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), 30000)
        const jitterMs = Math.random() * 500
        await new Promise((r) => setTimeout(r, delayMs + jitterMs))
      }
    }
  }
  throw lastError ?? new Error('재시도 한도 소진')
}
```

---

## 5. 가비아 DNS — 네임서버만 위임 → Cloudflare

### 5.1 역할 분리 원칙

가비아는 도메인 등록기관(Registrar)으로만 사용하며, DNS 레코드 관리는 전혀 하지 않는다. **가비아 컨트롤 패널에서 할 수 있는 유일한 설정**: 네임서버 변경.

```
가비아 역할:
  ✅ 도메인 등록 (stylelucky4u.com)
  ✅ 네임서버 변경 → Cloudflare NS 등록
  ❌ A레코드, CNAME, MX 레코드 설정 (Cloudflare에서 관리)

Cloudflare 역할:
  ✅ 모든 DNS 레코드 관리
  ✅ SSL/TLS 인증서
  ✅ Tunnel ingress 규칙
  ✅ WAF / Rate Limiting (무료 플랜)
```

### 5.2 가비아 네임서버 설정

```
도메인: stylelucky4u.com
등록 계정: smartkdy7@naver.com
네임서버 설정 (변경 완료):
  1차 NS: kelly.ns.cloudflare.com
  2차 NS: paul.ns.cloudflare.com
```

### 5.3 도메인 갱신 관리

- **갱신 주기**: 연 1회
- **만료 전 알림**: 가비아 이메일 알림 (smartkdy7@naver.com) + 30일 전 SMS
- **자동 갱신**: 가비아 자동 갱신 설정 권장 (수동 갱신 누락 방지)
- **도메인 만료 시 영향**: stylelucky4u.com 접속 불가 + Cloudflare Tunnel 무효화

---

## 6. GitHub — 소스 저장소 단독 사용 (직접 통합 없음)

### 6.1 현재 사용 방식

GitHub은 Git 원격 저장소로만 사용한다. Webhooks, GitHub Actions, Packages, Container Registry 등 고급 기능은 현재 미사용.

```
저장소: github.com/kimdooo-a/luckystyle4u-server (또는 private)
사용 목적:
  ✅ git push/pull — 코드 버전 관리
  ✅ 커밋 이력 — 세션별 배포 추적
  ❌ GitHub Actions — 현재 미사용 (향후 Phase 16에서 self-hosted runner 도입 검토)
  ❌ GitHub Packages — 미사용
  ❌ GitHub Webhooks → 양평 대시보드 — 미사용
```

### 6.2 Phase 16 이후 GitHub Actions 도입 검토

`05-operations-blueprint.md §3.1`에 GitHub Actions self-hosted runner(WSL2 내부) 설정이 포함된다. 도입 시 이 문서의 §6을 업데이트한다.

```yaml
# .github/workflows/deploy.yml (Phase 16 도입 예정)
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: self-hosted  # WSL2 내부 runner
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        run: bash scripts/deploy.sh
        env:
          SKIP_WIN_BUILD: 'false'
```

---

## 7. BYOK 키 보안 — 모든 외부 API 키의 Vault envelope 적용 범위

### 7.1 Vault envelope 적용 대상

ADR-013 결정: 외부 서비스 API 키는 모두 Vault AES-256-GCM envelope으로 암호화하여 DB에 저장한다.

| 시크릿 | 저장 위치 | Vault 암호화 여부 | 비고 |
|--------|---------|----------------|------|
| Anthropic API Key (사용자 BYOK) | `anthropic_api_keys.encrypted_key` | ✅ | DEK per-secret |
| B2 Application Key | `/etc/luckystyle4u/secrets.env` | ❌ (파일시스템 보호) | root:ypb-runtime 0640 |
| Slack Webhook URL | `/etc/luckystyle4u/secrets.env` | ❌ (파일시스템 보호) | 유출 시 즉시 재생성 가능 |
| MASTER_KEY (KEK) | `/etc/luckystyle4u/secrets.env` | N/A (최상위 키) | 별도 GPG USB 백업 필수 |
| Cloudflare API Token | `/etc/luckystyle4u/secrets.env` | ❌ (파일시스템 보호) | Zone:Edit 권한 최소화 |
| JWT 서명 키 (ES256) | `jwks_keys.private_key` (PEM) | ✅ | JWKSService 관리 |

**왜 일부는 파일시스템 보호만?**: `secrets.env`는 `chmod 0640, root:ypb-runtime` 권한으로 OS 수준에서 보호된다. 이 파일을 읽으려면 root 또는 ypb-runtime 그룹 멤버십이 필요하며, 대시보드 앱(ypb-runtime 유저)만 접근 가능하다.

### 7.2 Vault Envelope 구조 (ADR-013)

```
MASTER_KEY (KEK, 256bit)
    ↓ AES-256-GCM 암호화
DEK (Data Encryption Key, per-secret, 256bit)
    ↓ AES-256-GCM 암호화
실제 시크릿 값 (plaintext)
```

복호화 경로:
1. `MASTER_KEY` → DEK 복호화
2. DEK → 시크릿 평문 복호화
3. 평문은 메모리에서만 사용, 절대 로그/DB에 기록 금지

```typescript
// MASTER_KEY 손실 시 영향 범위:
// - Vault에 저장된 모든 사용자 Anthropic API 키 복호화 불가
// - JWT 서명 키 복호화 불가 → 모든 사용자 세션 무효화
// - 대응: MASTER_KEY GPG 암호화 USB 백업본에서 복구
```

---

## 8. 키 회전 일정 — 서비스별 회전 주기

### 8.1 키 회전 일정표

| 서비스/키 | 회전 주기 | 방식 | 책임자 |
|----------|---------|------|-------|
| B2 Application Key | 90일 | 수동 (대시보드 안내) | 운영자 |
| MASTER_KEY (KEK) | 365일 | 수동 (KEK 회전 절차) | 운영자 |
| JWT 서명 키 (ES256 JWKS) | 90일 + grace 30일 | 반자동 (대시보드 버튼) | 운영자 |
| Anthropic API Key (사용자) | 사용자 주도 | 수동 (사용자 대시보드) | 사용자 |
| Slack Webhook URL | 180일 | 수동 (Slack 앱 재생성) | 운영자 |
| Discord Webhook URL | 180일 | 수동 (Discord 재생성) | 운영자 |
| Cloudflare API Token | 180일 | 수동 (CF 대시보드) | 운영자 |

### 8.2 KEK(MASTER_KEY) 회전 절차

MASTER_KEY 회전은 가장 복잡한 작업으로, 모든 DEK를 재암호화해야 한다.

```typescript
// src/lib/vault/key-rotation.ts

export class VaultKeyRotationService {
  /**
   * MASTER_KEY 회전 절차:
   * 1. 새 MASTER_KEY 생성
   * 2. 모든 Vault secret의 DEK를 새 MASTER_KEY로 재암호화
   * 3. /etc/luckystyle4u/secrets.env 업데이트
   * 4. PM2 reload
   *
   * ⚠️ 주의: 중단 없이 완료해야 함 (중간 실패 시 구 키 유지)
   */
  async rotateMASTERKEY(): Promise<void> {
    const { randomBytes } = await import('node:crypto')
    const newMasterKey = randomBytes(32).toString('hex')

    // 트랜잭션 내에서 모든 DEK 재암호화
    await prisma.$transaction(async (tx) => {
      const secrets = await tx.vaultSecret.findMany()
      for (const secret of secrets) {
        const decryptedDek = await vaultService.decryptDEK(secret.encryptedDek)
        const reEncryptedDek = await vaultService.encryptDEK(decryptedDek, newMasterKey)
        await tx.vaultSecret.update({
          where: { id: secret.id },
          data: { encryptedDek: reEncryptedDek },
        })
      }
    })

    // DB 업데이트 성공 후 파일 업데이트 (파일 업데이트 실패 시 DB는 이미 변경됨 → 주의)
    // 운영자가 수동으로 /etc/luckystyle4u/secrets.env를 업데이트해야 함
    console.warn('[VaultKeyRotation] DB DEK 재암호화 완료. /etc/luckystyle4u/secrets.env 수동 업데이트 필요:', newMasterKey.slice(0, 8) + '...')
  }
}
```

---

## 9. 외부 서비스 장애 대응 — 서비스별 폴백

### 9.1 Backblaze B2 장애

| 장애 유형 | 영향 범위 | 폴백 동작 |
|---------|---------|---------|
| B2 API 일시 불가 | Hot→Cold 티어링 중단 | SeaweedFS에서 계속 서빙. 티어링 잡은 다음 실행 주기에 재시도. |
| B2 PUT 실패 | wal-g WAL 아카이브 실패 | Slack 알림 발송. WAL 파일은 로컬 보관 (archive_command 실패 시 PG가 자동 재시도). |
| B2 GET 실패 | Cold 파일 다운로드 불가 | 404 응답 + "서비스 일시 중단" 메시지. 운영자 수동 대응. |

**B2 상태 확인**: `https://www.backblazestatus.com`

### 9.2 Anthropic API 장애

| 장애 유형 | 영향 범위 | 폴백 동작 |
|---------|---------|---------|
| Anthropic API 완전 불가 | AI Assistant 전체 | AI 기능 비활성화 UI 표시. 나머지 대시보드 기능은 정상. |
| 429 Rate Limit | 일시적 응답 지연 | 지수 백오프 3회 재시도 (§3.5). 재시도 실패 시 "잠시 후 다시 시도" 안내. |
| 모델 deprecated | AI 응답 오류 | 모델 ID 업데이트 필요. ADR-014 재검토 트리거 #2 (AI SDK v7 breaking change). |

**Anthropic 상태 확인**: `https://status.anthropic.com`

### 9.3 Slack/Discord Webhook 장애

| 장애 유형 | 영향 범위 | 폴백 동작 |
|---------|---------|---------|
| Slack Webhook 불가 | 알림 미전달 | Discord Webhook으로 자동 폴백 (3회 재시도 후 Discord 시도). |
| Discord Webhook 불가 | 알림 미전달 | 로컬 로그(`/var/log/pm2/yangpyeong-web-err.log`)에만 기록. |
| 양쪽 모두 불가 | 알림 없음 | 운영자가 직접 PM2 로그 확인. DB `notification_failures` 테이블에 실패 기록. |

```typescript
// 폴백 순서: Slack → Discord → 로컬 로그
export async function sendNotification(params: {
  title: string
  message: string
  severity: 'info' | 'warning' | 'error'
}): Promise<void> {
  try {
    await slackNotifier.send({
      channel: '#infra-alerts',
      text: `${params.severity === 'error' ? '❌' : '⚠️'} ${params.title}: ${params.message}`,
    })
    return
  } catch (slackError) {
    console.warn('[Notification] Slack 실패, Discord로 폴백:', slackError)
  }

  try {
    await discordNotifier.notifyGenericAlert(params.title, params.message, params.severity)
    return
  } catch (discordError) {
    console.error('[Notification] Discord도 실패. 로컬 로그만:', discordError)
  }

  // DB에 실패 기록 (다음 세션에 운영자가 확인)
  await prisma.notificationFailure.create({
    data: {
      title: params.title,
      message: params.message,
      severity: params.severity,
      failedAt: new Date(),
    },
  })
}
```

### 9.4 가비아 DNS 장애

가비아 NS 서버 장애 시 Cloudflare DNS 쿼리도 영향받을 수 있다. 단, Cloudflare가 NS 권한을 가지므로 가비아 자체 장애보다 Cloudflare NS 이중화가 보호막이 된다.

- **TTL 캐시 효과**: 기존 DNS 클라이언트는 캐시된 IP(Cloudflare) 사용 → 단시간 가비아 장애는 영향 없음
- **장기 장애 시**: 가비아 고객센터 연락 또는 다른 registrar로 도메인 이전

---

## 10. 비용 모니터링 — 월 $10 한도 관리

### 10.1 비용 추적 아키텍처

```
외부 서비스 비용 발생 이벤트
├── Anthropic API 호출 → ai_usage_events 테이블 (tokens + cost)
├── B2 API 호출 → storage_events 테이블 (bytes + operation)
└── 기타 (Cloudflare, Slack) → $0 (무료)

cron-worker: 매일 자정 비용 집계
├── 당월 Anthropic 비용 집계 → ai_monthly_cost
├── 당월 B2 비용 집계 → b2_monthly_cost (B2 API 기반)
└── 총계 > $8 (80% of $10) → Slack #infra-alerts 경고
    총계 > $10 → AI 기능 자동 비활성 + Slack 긴급 알림
```

### 10.2 비용 모니터링 대시보드 (/dashboard/settings/billing)

Phase 21에서 `/dashboard/settings/billing` 페이지에 다음 항목을 표시한다:

| 항목 | 데이터 소스 | 업데이트 주기 |
|------|----------|-----------|
| Anthropic 당월 사용량 ($) | `ai_usage_events` 집계 | 실시간 (요청마다 +) |
| B2 저장 용량 (GB) | B2 API `/b2_get_bucket_info` | 1시간 |
| B2 당월 트랜잭션 비용 ($) | B2 API 응답 | 1시간 |
| 총 당월 비용 ($) | 위 합산 | 1시간 |
| 월 한도 도달률 (%) | 총계 / $10 | 실시간 |

### 10.3 비용 초과 시 자동 대응

```typescript
// src/lib/billing/cost-monitor.ts

export const MONTHLY_HARD_LIMIT_USD = 10.00
export const MONTHLY_WARN_LIMIT_USD = 8.00

export async function checkMonthlyCost(): Promise<void> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  // Anthropic 비용
  const aiCost = await prisma.aiUsageEvent.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { costUSD: true },
  })
  const anthropicTotal = Number(aiCost._sum.costUSD ?? 0)

  // B2 비용 (B2 API 또는 로컬 추정)
  const b2Total = await estimateB2Cost()

  const totalCost = anthropicTotal + b2Total

  if (totalCost >= MONTHLY_HARD_LIMIT_USD) {
    // AI 기능 강제 비활성
    await prisma.systemConfig.upsert({
      where: { key: 'ai_features_enabled' },
      create: { key: 'ai_features_enabled', value: 'false' },
      update: { value: 'false' },
    })
    await sendNotification({
      title: '월 비용 한도 초과',
      message: `$${totalCost.toFixed(2)} / $${MONTHLY_HARD_LIMIT_USD} — AI 기능 자동 비활성화`,
      severity: 'error',
    })
  } else if (totalCost >= MONTHLY_WARN_LIMIT_USD) {
    await sendNotification({
      title: '월 비용 경고 (80%)',
      message: `$${totalCost.toFixed(2)} / $${MONTHLY_HARD_LIMIT_USD} (${(totalCost / MONTHLY_HARD_LIMIT_USD * 100).toFixed(0)}%)`,
      severity: 'warning',
    })
  }
}

async function estimateB2Cost(): Promise<number> {
  // B2 추정 비용 (로컬 DB 기반 추정)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const events = await prisma.storageEvent.findMany({
    where: { createdAt: { gte: monthStart } },
  })
  let cost = 0
  for (const event of events) {
    if (event.operation === 'UPLOAD') {
      cost += (Number(event.sizeBytes) / 1e9) * 0.005  // $0.005/GB
    } else if (event.operation === 'DOWNLOAD') {
      cost += (Number(event.sizeBytes) / 1e9) * 0.01   // $0.01/GB
    }
  }
  return cost
}
```

---

## 11. ADR 역참조 체계

이 문서의 모든 주요 결정은 ADR과 연결된다.

| 섹션 | 연관 ADR | 결정 요약 |
|------|---------|---------|
| §2 Backblaze B2 | **ADR-008** | SeaweedFS 단독 + B2 오프로드. MinIO AGPL 거부. Garage 조건부 재평가. |
| §3 Anthropic | **ADR-014** | Vercel AI SDK v6 + Anthropic BYOK. LangChain 거부. 월 $5 상한. |
| §4 Slack/Discord | **ADR-005** | node-cron + wal-g. webhook 알림 목록 포함. |
| §7 Vault | **ADR-013** | node:crypto AES-256-GCM envelope. MASTER_KEY=/etc/luckystyle4u/secrets.env. |
| §5 가비아 DNS | **ADR-015** | Cloudflare Tunnel + canary. 가비아는 NS 위임만. |
| §8 키 회전 | **ADR-013** | DEK 365일 회전. JWKS KID grace 30일. |
| §10 비용 모니터링 | **AP-5** (핵심가치) | 월 $10 상한. AI 기능 자동 비활성 게이트. |

---

## 부록 Z. 근거 인덱스 · 변경 이력

### Z.1 외부 서비스 계정/키 관리 체크리스트

```
[초기 설정 체크리스트]
□ Backblaze B2 계정 생성 (smartkdy7@naver.com)
□ B2 버킷 3개 생성 (prod, wal-archive, backups)
□ B2 앱 키 2개 생성 (wal-g 전용, storage 전용)
□ /etc/luckystyle4u/secrets.env에 B2_* 변수 등록
□ Slack 앱 생성 + Incoming Webhook URL 취득
□ Discord 서버 + Webhook URL 취득
□ SLACK_WEBHOOK_URL, DISCORD_WEBHOOK_URL 등록
□ Cloudflare Zone ID, API Token 취득
□ system_config 테이블에 b2_key_last_rotated 초기값 설정

[월별 체크리스트]
□ ai_usage_events 당월 비용 확인 (< $5 유지)
□ B2 저장 용량 확인 (< 50GB 유지)
□ B2 앱 키 90일 경과 확인
□ Webhook URL 180일 경과 확인
□ MASTER_KEY 365일 경과 확인

[분기별 체크리스트]
□ B2 앱 키 회전 실행
□ Cloudflare API Token 재발급
□ AI 비용 추세 분석 (ADR-014 재검토 트리거 확인)
□ B2 가격 인상 확인 (ADR-005 재검토 트리거 #3)
```

### Z.2 이 문서가 인용하는 문서

| 문서 경로 | 인용 목적 |
|----------|---------|
| `../02-architecture/07-storage-blueprint.md` | SeaweedFS + B2 티어링 구조 |
| `../02-architecture/16-ux-quality-blueprint.md` | Anthropic BYOK + 비용 가드 |
| `../02-architecture/13-db-ops-blueprint.md` | node-cron + Slack webhook |
| `../02-architecture/04-observability-blueprint.md` | Vault envelope + MASTER_KEY |
| `../02-architecture/01-adr-log.md` | ADR-005, 008, 013, 014, 015 |

### Z.3 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent I2 (Sonnet 4.6) | Wave 4 Tier 3 초안 — B2 + Anthropic + Slack/Discord + 가비아 전체 |

### Z.4 후속 Wave 4/5 연결

- → Phase 16 구현: Vault CRUD UI (`/dashboard/settings/env`) + JWKS 관리 페이지
- → Phase 17 구현: SeaweedFS→B2 티어링 서비스 실제 구현
- → Phase 21 구현: Anthropic BYOK 설정 UI (`/dashboard/settings/ai`) + 비용 대시보드
- → Wave 5 로드맵: ADR-014 재검토 트리거 (AI SDK v7, Anthropic 가격 인상 시)

---

> **문서 끝.** Wave 4 · I2 · 2026-04-18 · 양평 부엌 서버 대시보드 — 외부 서비스 통합 계약 (총 600줄+).
