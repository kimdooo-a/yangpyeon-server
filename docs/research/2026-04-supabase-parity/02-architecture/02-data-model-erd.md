# 02. 데이터 모델 ERD — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](./01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 4 · Tier 1 (A1) 산출물 — kdywave W4-A1 (Agent Architecture-1)
> 작성일: 2026-04-18 (세션 27/28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · `../../../prisma/schema.prisma` · `../../../src/lib/db/schema.ts`

---

## 0. 문서 목적

### 0.1 이 문서의 역할

양평 부엌 서버 대시보드의 **전체 데이터 모델**을 PostgreSQL(Prisma 7) + SQLite(Drizzle) 양쪽에서 통합 표현. Wave 4 Tier 2의 14개 Blueprint가 "이 테이블이 이미 있는가, 아니면 새로 만들어야 하는가"를 판단하는 근거가 된다. Wave 5 로드맵의 Phase별 마이그레이션 파일 수/순서 계획의 입력이기도 하다.

### 0.2 문서 구조

```
§1. 데이터 저장소 분할 원칙 — 3-DB 전략 (PG/SQLite/SeaweedFS)
§2. PostgreSQL ERD — 현재 (10 테이블, prisma/schema.prisma 기반)
§3. PostgreSQL ERD — Wave 4 신규 (15+ 테이블)
§4. SQLite ERD — 현재 (3 테이블) + Wave 4 확장
§5. 크로스-DB 동기화 전략
§6. 마이그레이션 순서 (Phase 15-22)
부록 Z. 근거 인덱스
```

### 0.3 사용 규칙

1. **스키마 진실 소스**: `prisma/schema.prisma`(PG) + `src/lib/db/schema.ts`(SQLite)가 코드상 정의. 본 문서는 그것의 **참조 설명 + Wave 4 확장 제안**.
2. **테이블 이름 규칙**: PostgreSQL `snake_case`, Prisma 모델 `PascalCase`. SQLite도 `snake_case`.
3. **컬럼 매핑**: Prisma `@map("snake_case")` 직렬화 규칙 준수.
4. **Blueprint 의무**: Tier 2 Blueprint는 자신이 다룰 테이블을 이 문서에서 조회 → "이미 있으면 FR 매핑 / 없으면 §3에 추가 + 스키마 정의".

---

## 1. 데이터 저장소 분할 원칙

### 1.1 3-DB 전략 개요

```
┌──────────────────────────────────────────────────────────────────┐
│  PostgreSQL 17 (Prisma 7)                                        │
│  • 트랜잭션성 + 관계성 데이터                                     │
│  • RLS 정책 활성                                                  │
│  • 단일 진실 소스 (source of truth)                               │
│  → 현재 10 테이블, Wave 4 신규 15+ 테이블 추가                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SQLite (Drizzle, 로컬 파일 ./data/metrics.sqlite)              │
│  • 관측/메타데이터 + 고속 로컬 캐시                               │
│  • 재시작 시 일부 휘발 가능 (SQLite WAL 모드)                     │
│  • PG와 분리로 부하 분산                                          │
│  → 현재 3 테이블, Wave 4 확장 2~3 테이블                          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SeaweedFS (Filer + Volume, /opt/seaweedfs/vol)                 │
│  • 바이너리 객체 (파일/이미지/동영상)                             │
│  • 메타데이터는 PG File 엔티티에 저장                             │
│  • B2 오프로드 계층 (Hot 30일 → Cold B2)                          │
│  → 테이블 없음 (S3 호환 HTTP API)                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 왜 2-DB 분할인가 (PostgreSQL + SQLite)

| 이유 | 설명 |
|------|------|
| **1인 운영 + Latency 분리** | Audit log 폭주 시 PG 쓰기 부하가 비즈니스 쿼리 성능에 영향. SQLite 분리로 격리. |
| **재해 복구 분리** | PG는 wal-g PITR 백업. SQLite는 "재생성 가능한" 파일 (무결성 손상 시 재구축). 백업 비용 차이. |
| **관측 데이터 임시성** | `metrics_history`는 60일 후 폐기. PG 테이블 VACUUM FULL 비용 회피. |
| **개발 부담 분산** | Prisma 7 + Drizzle 두 ORM. 각자 장점 살림 (Prisma=복잡 관계, Drizzle=경량 고속). |
| **Supabase 구조와 일치** | Supabase도 pg_stat_statements + supabase_metrics_history 등을 내부 분리 설계. |

### 1.3 어떤 데이터가 어디에 가는가

| 데이터 유형 | PostgreSQL | SQLite | SeaweedFS |
|-----------|------------|--------|-----------|
| 사용자 계정 (`users`) | ✅ | | |
| 파일 메타데이터 (`files`) | ✅ | | |
| 파일 바이너리 | | | ✅ |
| MFA TOTP 시드 (암호화) | ✅ | | |
| 세션 (`user_sessions`) | ✅ | | |
| WebAuthn Challenge (TTL 60s) | | ✅ | |
| Rate Limit counter (5분 윈도) | ✅ | | |
| HTTP 요청 감사 로그 | | ✅ | |
| 관리자 비즈니스 감사 로그 | ✅ | | |
| 시스템 메트릭 (CPU/메모리 history) | | ✅ | |
| IP 화이트리스트 | | ✅ | |
| Vault 시크릿 (암호화) | ✅ | | |
| JWKS 키 메타 | ✅ | | |
| Cron 작업 + 실행 로그 | ✅ | | |
| Webhook 정의 + 전송 기록 | ✅ | | |
| pgmq 잡 큐 | ✅ | | |
| Advisors 발견 기록 | ✅ | | |
| ERD 레이아웃 사용자 preference | ✅ | | |
| Edge Function 코드/런타임 | ✅ | | |
| Edge Function 실행 캐시 | | ✅ | |
| Realtime 구독 | ✅ | | |

**원칙**:
- **비즈니스 엔티티 + 트랜잭션성** → PostgreSQL
- **관측·일시·로컬 캐시** → SQLite
- **바이너리 + 크기 큰 객체** → SeaweedFS

---

## 2. PostgreSQL ERD — 현재 (10 테이블)

### 2.1 ASCII ERD

현재 `prisma/schema.prisma` (232줄) 기준. Wave 3 세션 14에서 "Supabase 관리 체계 이식"으로 7개 테이블이 추가된 상태.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             현재 PostgreSQL ERD                              │
└─────────────────────────────────────────────────────────────────────────────┘

          ┌─────────────────┐
          │      User       │
          │ ─────────────── │
          │ id (PK, UUID)   │◄────────────────────────────────────┐
          │ email (UNIQUE)  │                                      │
          │ passwordHash    │                                      │
          │ name?           │                                      │
          │ phone?          │                                      │
          │ role (ENUM)     │  1    N                              │
          │ isActive        │─────────────┐                        │
          │ lastLoginAt?    │             │                        │
          │ createdAt       │             │                        │
          │ updatedAt       │             │                        │
          └─────────────────┘             │                        │
                │                          │                        │
                │ 1                        │                        │
                │                          ▼                        │
                │                  ┌──────────────────┐            │
                │                  │     Folder       │            │
                │                  │ ──────────────── │            │
                │                  │ id (PK, UUID)    │            │
                │                  │ name             │            │
                │                  │ parentId? ────┐  │            │
                │                  │ ownerId (FK)──┼──┼────────────┘
                │                  │ isRoot        │  │
                │                  │ createdAt     │  │
                │                  │ updatedAt     │  │
                │                  │ UNIQ(parentId,│  │
                │                  │      name,    │  │
                │                  │      ownerId) │  │
                │                  └──────────────────┘
                │                          ▲     │ self ref 1:N (FolderTree)
                │                          │     │
                │                          │     ▼
                │                          │  ┌──────────┐
                │                          │  │  Folder  │ (child)
                │                          │  └──────────┘
                │                          │
                │  N                       │ 1    N
                ├──────────────────────────┼─────────────┐
                │                          │             │
                │                          ▼             ▼
                │                  ┌──────────────────┐
                │                  │      File        │
                │                  │ ──────────────── │
                │                  │ id (PK, UUID)    │
                │                  │ originalName     │
                │                  │ storedName (UQ)  │
                │                  │ size (INT)       │
                │                  │ mimeType         │
                │                  │ folderId (FK)────┘ (cascade)
                │                  │ ownerId (FK)──────────────────→ User
                │                  │ createdAt        │
                │                  │ updatedAt        │
                │                  └──────────────────┘
                │
                │ N (UserSqlQueries)
                ▼
          ┌──────────────────┐
          │    SqlQuery      │
          │ ──────────────── │
          │ id (PK, UUID)    │
          │ name             │
          │ sql (TEXT)       │
          │ scope (ENUM)     │  PRIVATE | SHARED | FAVORITE
          │ ownerId (FK)     │
          │ lastRunAt?       │
          │ createdAt        │
          │ updatedAt        │
          │ IDX(ownerId,     │
          │     scope)       │
          └──────────────────┘

          ┌──────────────────┐                  ┌──────────────────┐
          │  EdgeFunction    │   1         N    │ EdgeFunctionRun  │
          │ ──────────────── │─────────────────▶│ ──────────────── │
          │ id (PK, UUID)    │                  │ id (PK, UUID)    │
          │ name (UNIQUE)    │                  │ functionId (FK)  │
          │ description?     │                  │ status (ENUM)    │
          │ code (TEXT)      │                  │ durationMs?      │
          │ runtime (ENUM)   │                  │ stdout?          │
          │ enabled          │                  │ stderr?          │
          │ ownerId (FK)─────┼───→ User         │ startedAt        │
          │ createdAt        │                  │ finishedAt?      │
          │ updatedAt        │                  │ IDX(functionId,  │
          └──────────────────┘                  │     startedAt)   │
                                                └──────────────────┘

          ┌──────────────────┐                  ┌──────────────────┐
          │     Webhook      │                  │     CronJob      │
          │ ──────────────── │                  │ ──────────────── │
          │ id (PK, UUID)    │                  │ id (PK, UUID)    │
          │ name             │                  │ name (UNIQUE)    │
          │ sourceTable      │                  │ schedule         │
          │ event (ENUM)     │                  │ kind (ENUM)      │
          │ url              │                  │ payload (JSON)   │
          │ headers (JSON)   │                  │ enabled          │
          │ secret?          │                  │ lastRunAt?       │
          │ enabled          │                  │ lastStatus?      │
          │ lastTriggeredAt? │                  │ createdAt        │
          │ failureCount     │                  │ updatedAt        │
          │ createdAt        │                  └──────────────────┘
          │ updatedAt        │
          └──────────────────┘

          ┌──────────────────┐                  ┌──────────────────┐
          │      ApiKey      │                  │     LogDrain     │
          │ ──────────────── │                  │ ──────────────── │
          │ id (PK, UUID)    │                  │ id (PK, UUID)    │
          │ name             │                  │ name             │
          │ prefix (UNIQUE)  │                  │ type (ENUM)      │
          │ keyHash (UNIQUE) │                  │ url              │
          │ type (ENUM)      │                  │ authHeader?      │
          │ scopes (String[])│                  │ filters (JSON)   │
          │ ownerId (FK)─────┼───→ User         │ enabled          │
          │ lastUsedAt?      │                  │ lastDeliveredAt? │
          │ revokedAt?       │                  │ failureCount     │
          │ createdAt        │                  │ createdAt        │
          │ updatedAt        │                  │ updatedAt        │
          └──────────────────┘                  └──────────────────┘
```

### 2.2 현재 10 테이블 상세

| # | 테이블 | Prisma 모델 | 용도 | 관련 Wave 1 카테고리 |
|---|-------|-------------|------|---------------------|
| 1 | `users` | `User` | 사용자 계정 | Auth Core (5) |
| 2 | `folders` | `Folder` | 파일박스 폴더 (자체 참조 트리) | Storage (7) |
| 3 | `files` | `File` | 파일박스 파일 메타데이터 | Storage (7) |
| 4 | `sql_queries` | `SqlQuery` | SQL Editor 저장 쿼리 | SQL Editor (2) |
| 5 | `edge_functions` | `EdgeFunction` | Edge Function 코드 | Edge Functions (8) |
| 6 | `edge_function_runs` | `EdgeFunctionRun` | Edge Function 실행 로그 | Edge Functions (8) |
| 7 | `webhooks` | `Webhook` | DB Webhook 정의 | DB Ops (4) |
| 8 | `cron_jobs` | `CronJob` | node-cron 스케줄 | DB Ops (4) |
| 9 | `api_keys` | `ApiKey` | API Key (publishable/secret) | Data API (11) |
| 10 | `log_drains` | `LogDrain` | 로그 외부 드레인 | Observability (12) |

### 2.3 현재 ENUM 타입

```prisma
enum Role            { ADMIN, MANAGER, USER }
enum QueryScope      { PRIVATE, SHARED, FAVORITE }
enum FunctionRuntime { NODE_VM, WORKER_THREAD }
enum RunStatus       { SUCCESS, FAILURE, TIMEOUT }
enum WebhookEvent    { INSERT, UPDATE, DELETE, ANY }
enum CronKind        { SQL, FUNCTION, WEBHOOK }
enum ApiKeyType      { PUBLISHABLE, SECRET }
enum DrainType       { HTTP, LOKI, WEBHOOK }
```

### 2.4 현재 ERD의 한계 (Wave 4에서 해결 필요)

1. **MFA 부재**: Auth Advanced(Phase 15) 위해 TOTP/WebAuthn/백업 코드 테이블 필요.
2. **세션 관리 부재**: Auth Core(Phase 17) 완성을 위해 `user_sessions` 필요.
3. **Rate Limit counter 부재**: Auth Advanced(Phase 15) 위해 PG counter 테이블 필요.
4. **Vault 부재**: Observability(Phase 16) 위해 암호화된 시크릿 저장소 필요.
5. **Realtime 구독 관리 부재**: Realtime(Phase 19) 포팅에 필요.
6. **Advisors 룰/발견/음소거 부재**: Advisors(Phase 20) 3-Layer 구현 필요.
7. **사용자 UI preference 부재**: Schema Viz(Phase 20) ERD 레이아웃 저장 DQ-3.4.
8. **백업 기록 부재**: DB Ops(Phase 20) wal-g 백업 메타 추적 필요.
9. **Edge Function 스케줄 부재**: Edge Functions(Phase 19) cron 지원 확장.
10. **JWKS 키 회전 이력 부재**: NFR-SEC.1 "24h rotate" 감사 추적.

§3에서 위 11개 영역에 대한 신규 테이블 15+개를 제안한다.

<출처: `prisma/schema.prisma` 현재 파일, Wave 3 `02-functional-requirements.md` 전 FR 매핑>

---

## 3. PostgreSQL ERD — Wave 4 신규 테이블 (15+ 개 예정)

이 §은 Wave 1~3 리서치 결과 도입될 신규 테이블을 표준 스키마 예시(Prisma + SQL)로 제시한다. Tier 2 Blueprint는 이 제안을 **기본으로 채용**하되, 각 카테고리 Blueprint §4에서 정밀 튜닝(추가 컬럼, 인덱스, RLS 정책) 한다.

### 3.1 MFA 관련 (Phase 15, ADR-007)

#### 3.1.1 `mfa_totp_secrets`

```prisma
/// TOTP MFA 시드 저장. 시드는 Vault를 통해 암호화 후 ciphertext로 저장.
model MfaTotpSecret {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @unique @map("user_id") @db.Uuid
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  encryptedSeed  Bytes    @map("encrypted_seed")      // AES-256-GCM
  dekId          String   @map("dek_id") @db.Uuid     // 참조 vault_secrets.id
  activatedAt    DateTime? @map("activated_at")
  lastUsedAt     DateTime? @map("last_used_at")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("mfa_totp_secrets")
}
```

#### 3.1.2 `mfa_webauthn_credentials`

```prisma
/// WebAuthn 등록된 authenticator credential. 1 user → N device.
model MfaWebauthnCredential {
  id                   String   @id @default(uuid()) @db.Uuid
  userId               String   @map("user_id") @db.Uuid
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  credentialId         Bytes    @unique @map("credential_id")    // raw bytes
  publicKey            Bytes    @map("public_key")                // COSE public key
  counter              BigInt   @default(0)
  deviceType           String?  @map("device_type")               // 'platform' | 'cross-platform'
  backupEligible       Boolean  @default(false) @map("backup_eligible")
  backupState          Boolean  @default(false) @map("backup_state")
  transports           String[] // ['internal', 'usb', 'nfc', 'ble']
  nickname             String?                                    // 사용자가 부여한 별명
  lastUsedAt           DateTime? @map("last_used_at")
  createdAt            DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("mfa_webauthn_credentials")
}
```

#### 3.1.3 `mfa_backup_codes`

```prisma
/// MFA 백업 코드 (8개 일회용 SHA-256 해시)
model MfaBackupCode {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  codeHash   String    @unique @map("code_hash")    // SHA-256 hex
  usedAt     DateTime? @map("used_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([userId, usedAt])
  @@map("mfa_backup_codes")
}
```

SQL 생성 예:
```sql
CREATE TABLE mfa_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,  -- SHA-256 hex
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mfa_backup_codes_user ON mfa_backup_codes(user_id, used_at);

-- RLS 정책
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_backup_codes_own ON mfa_backup_codes
  FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
```

### 3.2 세션 관리 (Phase 17, ADR-006)

#### 3.2.1 `user_sessions`

```prisma
/// 세션 추적 (Lucia 패턴 차용). 세션 ID는 SHA-256 해시로만 저장.
model UserSession {
  id             String    @id                             // SHA-256 hash of session token
  userId         String    @map("user_id") @db.Uuid
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  ipHash         String    @map("ip_hash")                 // SHA-256 of IP (privacy)
  userAgent      String?   @map("user_agent")              // truncated 256 chars
  deviceFingerprint String? @map("device_fingerprint")     // optional JS fingerprint
  mfaMethod      String?   @map("mfa_method")              // 'totp' | 'webauthn' | null
  createdAt      DateTime  @default(now()) @map("created_at")
  lastSeenAt     DateTime  @default(now()) @map("last_seen_at")
  expiresAt      DateTime  @map("expires_at")
  revokedAt      DateTime? @map("revoked_at")

  @@index([userId])
  @@index([expiresAt])
  @@map("user_sessions")
}
```

### 3.3 Rate Limit (Phase 15, ADR-007)

#### 3.3.1 `rate_limit_events`

```prisma
/// IP + 사용자 기반 rate limit counter. 5분 윈도우.
/// PG UNLOGGED TABLE 권장(성능) — 재시작 시 휘발 가능.
model RateLimitEvent {
  id           BigInt   @id @default(autoincrement())
  bucketKey    String   @map("bucket_key")               // "ip:1.2.3.4" | "user:uuid"
  endpoint     String                                     // "/api/login"
  occurredAt   DateTime @default(now()) @map("occurred_at")

  @@index([bucketKey, occurredAt])
  @@map("rate_limit_events")
}
```

SQL (UNLOGGED 명시):
```sql
CREATE UNLOGGED TABLE rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rate_limit_events_bucket
  ON rate_limit_events(bucket_key, occurred_at DESC);

-- 정기 정리 (Cron Job이 5분 이상 오래된 레코드 삭제)
CREATE INDEX idx_rate_limit_events_old
  ON rate_limit_events(occurred_at) WHERE occurred_at < NOW() - INTERVAL '10 minutes';
```

조회 쿼리:
```sql
-- IP당 5분 내 요청 수
SELECT COUNT(*) FROM rate_limit_events
  WHERE bucket_key = $1
    AND occurred_at > NOW() - INTERVAL '5 minutes';
```

### 3.4 Vault (Phase 16, ADR-013)

#### 3.4.1 `vault_secrets`

```prisma
/// Vault 시크릿 저장소. AES-256-GCM envelope (KEK→DEK).
/// ciphertext 자체는 DEK로 암호화, DEK는 MASTER_KEY(KEK)로 래핑.
model VaultSecret {
  id               String   @id @default(uuid()) @db.Uuid
  namespace        String                                    // "auth.jwt" | "storage.b2" | ...
  keyName          String   @map("key_name")                 // "master-key-next" | "totp-seed"
  ciphertext       Bytes                                     // 암호화된 payload
  iv               Bytes                                     // AES-GCM nonce 12 bytes
  authTag          Bytes    @map("auth_tag")                 // GCM auth tag 16 bytes
  wrappedDek       Bytes    @map("wrapped_dek")              // KEK로 래핑된 DEK
  ciphertextVersion Int     @default(1) @map("ciphertext_version")
  kekVersion       Int      @map("kek_version")              // 회전 추적
  metadata         Json     @default("{}")                    // 메타 (description, tags)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at")
  expiresAt        DateTime? @map("expires_at")              // null = 영구

  @@unique([namespace, keyName])
  @@index([namespace])
  @@map("vault_secrets")
}
```

#### 3.4.2 `jwks_keys`

```prisma
/// JWKS 키쌍 관리. ES256 (P-256 ECDSA). 24h rotate.
model JwksKey {
  id              String   @id @default(uuid()) @db.Uuid
  kid             String   @unique                           // JWK id
  algorithm       String   @default("ES256")                 // 알고리즘 고정
  publicKeyJwk    Json     @map("public_key_jwk")            // 공개 JWK (노출 가능)
  encryptedPrivateKey Bytes @map("encrypted_private_key")    // Vault 경유 암호화
  dekId           String   @map("dek_id") @db.Uuid
  status          JwksKeyStatus @default(UPCOMING)
  activatedAt     DateTime? @map("activated_at")
  retiredAt       DateTime? @map("retired_at")
  createdAt       DateTime @default(now()) @map("created_at")

  rotations       JwksKeyRotation[]

  @@index([status])
  @@map("jwks_keys")
}

enum JwksKeyStatus {
  UPCOMING    // 다음 회전 대기
  CURRENT     // 현재 서명키
  RETIRED     // 회전됨, grace 7일
  REVOKED     // 손상 의심, 즉시 폐기
}
```

#### 3.4.3 `jwks_key_rotations`

```prisma
/// JWKS 키 회전 감사 로그.
model JwksKeyRotation {
  id            BigInt   @id @default(autoincrement())
  fromKeyId     String?  @map("from_key_id") @db.Uuid
  toKeyId       String   @map("to_key_id") @db.Uuid
  toKey         JwksKey  @relation(fields: [toKeyId], references: [id])
  reason        String                                       // 'scheduled_24h' | 'manual' | 'compromised'
  performedBy   String?  @map("performed_by") @db.Uuid       // User.id
  rotatedAt     DateTime @default(now()) @map("rotated_at")

  @@index([rotatedAt])
  @@map("jwks_key_rotations")
}
```

### 3.5 Advisors (Phase 20, ADR-011)

#### 3.5.1 `advisor_rules`

```prisma
/// 3-Layer Advisor 룰 카탈로그. Layer = 'schemalint' | 'squawk' | 'splinter'.
model AdvisorRule {
  id           String   @id                                  // 'splinter_0001' | 'squawk_drop_table' ...
  layer        AdvisorLayer
  severity     AdvisorSeverity
  category     String                                        // 'performance' | 'security' | 'convention'
  name         String
  description  String
  enabled      Boolean  @default(true)
  metadata     Json     @default("{}")                        // 룰별 설정

  findings     AdvisorFinding[]
  mutes        AdvisorRuleMute[]

  @@index([layer, severity])
  @@map("advisor_rules")
}

enum AdvisorLayer    { SCHEMALINT, SQUAWK, SPLINTER }
enum AdvisorSeverity { CRITICAL, HIGH, MEDIUM, LOW, INFO }
```

#### 3.5.2 `advisor_findings`

```prisma
/// 룰 실행 결과 저장. 증분 업데이트.
model AdvisorFinding {
  id           BigInt   @id @default(autoincrement())
  ruleId       String   @map("rule_id")
  rule         AdvisorRule @relation(fields: [ruleId], references: [id])
  resourceType String   @map("resource_type")                // 'table' | 'function' | 'query'
  resourceIdentifier String @map("resource_identifier")      // schema.table or function OID
  details      Json                                           // 룰별 상세 (예: "missing index on user_id")
  firstSeenAt  DateTime @default(now()) @map("first_seen_at")
  lastSeenAt   DateTime @default(now()) @map("last_seen_at")
  resolvedAt   DateTime? @map("resolved_at")

  @@unique([ruleId, resourceType, resourceIdentifier])
  @@index([ruleId, resolvedAt])
  @@map("advisor_findings")
}
```

#### 3.5.3 `advisor_rule_mutes`

```prisma
/// 특정 룰/리소스에 대한 음소거 (DQ-10.6).
model AdvisorRuleMute {
  id           String   @id @default(uuid()) @db.Uuid
  ruleId       String   @map("rule_id")
  rule         AdvisorRule @relation(fields: [ruleId], references: [id])
  resourceType String   @map("resource_type")
  resourceIdentifier String @map("resource_identifier")
  reason       String                                        // 필수: 음소거 이유
  mutedBy      String   @map("muted_by") @db.Uuid            // User.id
  mutedAt      DateTime @default(now()) @map("muted_at")
  expiresAt    DateTime? @map("expires_at")                  // 임시 음소거 가능

  @@unique([ruleId, resourceType, resourceIdentifier])
  @@map("advisor_rule_mutes")
}
```

### 3.6 DB Ops 확장 (Phase 20, ADR-005)

#### 3.6.1 `cron_job_runs`

현재 `cron_jobs`는 정의만 있고 실행 로그가 없음. 추가:

```prisma
/// Cron Job 개별 실행 기록. lastRunAt/lastStatus는 요약이지만
/// 이 테이블은 전수 기록. 90일 후 아카이브.
model CronJobRun {
  id          BigInt   @id @default(autoincrement())
  jobId       String   @map("job_id") @db.Uuid
  job         CronJob  @relation(fields: [jobId], references: [id], onDelete: Cascade)
  status      RunStatus
  startedAt   DateTime @default(now()) @map("started_at")
  finishedAt  DateTime? @map("finished_at")
  durationMs  Int?     @map("duration_ms")
  output      String?                                         // truncated stdout
  errorMessage String? @map("error_message")
  triggeredBy String?  @map("triggered_by") @db.Uuid          // null = scheduled, UUID = manual

  @@index([jobId, startedAt])
  @@index([status])
  @@map("cron_job_runs")
}
```

CronJob 모델에 관계 추가 필요:
```prisma
model CronJob {
  // ... 기존 필드
  runs       CronJobRun[]
}
```

#### 3.6.2 `webhook_deliveries`

Webhook 전송 내역 추적:

```prisma
/// Webhook HTTP 전송 기록. 재시도 포함.
model WebhookDelivery {
  id              BigInt   @id @default(autoincrement())
  webhookId       String   @map("webhook_id") @db.Uuid
  webhook         Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  eventPayload    Json     @map("event_payload")               // full payload
  requestHeaders  Json     @map("request_headers")
  responseStatus  Int?     @map("response_status")
  responseBody    String?  @map("response_body")               // truncated 4KB
  attempt         Int      @default(1)
  succeeded       Boolean  @default(false)
  deliveredAt     DateTime @default(now()) @map("delivered_at")

  @@index([webhookId, deliveredAt])
  @@index([succeeded, deliveredAt])
  @@map("webhook_deliveries")
}
```

Webhook 모델에 관계 추가:
```prisma
model Webhook {
  // ... 기존 필드
  deliveries  WebhookDelivery[]
}
```

#### 3.6.3 `backups`

wal-g 백업 메타 (ADR-005):

```prisma
/// wal-g base backup + WAL 아카이브 인덱스.
model Backup {
  id              String   @id @default(uuid()) @db.Uuid
  kind            BackupKind
  startLsn        String?  @map("start_lsn")                   // PostgreSQL LSN
  endLsn          String?  @map("end_lsn")
  sizeBytes       BigInt?  @map("size_bytes")
  compressedBytes BigInt?  @map("compressed_bytes")
  storageLocation String   @map("storage_location")            // "b2://bucket/path"
  checksum        String?                                       // SHA-256 of backup file
  status          BackupStatus
  startedAt       DateTime @default(now()) @map("started_at")
  finishedAt      DateTime? @map("finished_at")
  errorMessage    String?  @map("error_message")

  restores        BackupRestore[]

  @@index([kind, startedAt])
  @@map("backups")
}

enum BackupKind   { BASE, WAL_SEGMENT, MANUAL }
enum BackupStatus { IN_PROGRESS, SUCCESS, FAILED, VERIFIED }
```

#### 3.6.4 `backup_restores`

```prisma
/// 백업 복원 감사 로그 (DQ-4.6 답변).
model BackupRestore {
  id              String   @id @default(uuid()) @db.Uuid
  backupId        String   @map("backup_id") @db.Uuid
  backup          Backup   @relation(fields: [backupId], references: [id])
  targetEnvironment String @map("target_environment")          // 'staging' | 'production'
  targetTimestamp DateTime? @map("target_timestamp")           // PITR 타깃
  restoreReason   String   @map("restore_reason")              // 필수: 복원 이유
  performedBy     String   @map("performed_by") @db.Uuid       // User.id
  status          BackupStatus
  startedAt       DateTime @default(now()) @map("started_at")
  finishedAt      DateTime? @map("finished_at")
  verificationPassed Boolean? @map("verification_passed")

  @@index([startedAt])
  @@map("backup_restores")
}
```

### 3.7 Edge Function 스케줄 (Phase 19, ADR-009)

#### 3.7.1 `edge_function_schedules`

```prisma
/// Edge Function을 cron으로 스케줄 실행. CronJob과 별도 (Edge Fn 특화).
model EdgeFunctionSchedule {
  id           String   @id @default(uuid()) @db.Uuid
  functionId   String   @map("function_id") @db.Uuid
  function     EdgeFunction @relation(fields: [functionId], references: [id], onDelete: Cascade)
  schedule     String                                         // cron expression
  enabled      Boolean  @default(true)
  args         Json     @default("{}")                        // 함수 호출 인자
  lastRunAt    DateTime? @map("last_run_at")
  lastStatus   RunStatus? @map("last_status")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([functionId])
  @@map("edge_function_schedules")
}
```

EdgeFunction 모델에 관계 추가:
```prisma
model EdgeFunction {
  // ... 기존 필드
  schedules  EdgeFunctionSchedule[]
}
```

### 3.8 Realtime 구독 (Phase 19, ADR-010)

#### 3.8.1 `realtime_subscriptions`

```prisma
/// supabase-realtime 포팅 채널 구독 관리.
model RealtimeSubscription {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String?  @map("user_id") @db.Uuid             // null=anonymous
  user           User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  channelName    String   @map("channel_name")                 // "room:123"
  filterClause   String?  @map("filter_clause")                // "user_id=eq.$uid"
  clientSessionId String  @map("client_session_id")            // WebSocket session
  createdAt      DateTime @default(now()) @map("created_at")
  lastActiveAt   DateTime @default(now()) @map("last_active_at")
  disconnectedAt DateTime? @map("disconnected_at")

  @@index([userId])
  @@index([channelName, disconnectedAt])
  @@map("realtime_subscriptions")
}
```

### 3.9 Data API 확장 (Phase 21, ADR-012)

#### 3.9.1 `api_keys_v2` (기존 `api_keys` 확장)

기존 `ApiKey` 확장:
```prisma
model ApiKey {
  // ... 기존 필드
  rateLimitTier   String?  @map("rate_limit_tier")             // 'default' | 'premium'
  ipWhitelist     String[] @map("ip_whitelist")                // CIDR 목록 (선택)
  scopeExpression String?  @map("scope_expression")            // advanced scope DSL
}
```

(마이그레이션: 기존 `api_keys`에 컬럼 추가만. 테이블 이동 없음)

#### 3.9.2 `pg_graphql_persisted_queries` (조건부, ADR-016 트리거 시)

```prisma
/// pg_graphql 도입 시에만 생성. 지속 쿼리 (Persisted Query) 저장.
model PgGraphqlPersistedQuery {
  id           String   @id @default(uuid()) @db.Uuid
  queryHash    String   @unique @map("query_hash")             // SHA-256
  queryText    String   @map("query_text")
  operationName String? @map("operation_name")
  variables    Json?
  createdBy    String?  @map("created_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  lastUsedAt   DateTime? @map("last_used_at")
  usageCount   Int      @default(0) @map("usage_count")

  @@map("pg_graphql_persisted_queries")
}
```

### 3.10 Schema Viz — 사용자 UI Preference (Phase 20, DQ-3.4)

#### 3.10.1 `user_preferences`

```prisma
/// 사용자별 UI preference. ERD 레이아웃, 테이블 컬럼 순서 등.
model UserPreference {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scope        String                                         // 'schema-viz' | 'table-editor' | 'sql-editor'
  resourceKey  String   @map("resource_key")                  // ERD = 'default' | table = 'users'
  data         Json                                           // scope별 payload (레이아웃 좌표 등)
  version      Int      @default(1)
  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at")

  @@unique([userId, scope, resourceKey])
  @@map("user_preferences")
}
```

예시 payload (ERD 레이아웃):
```json
{
  "scope": "schema-viz",
  "resourceKey": "default",
  "data": {
    "nodes": [
      {"id": "users", "position": {"x": 100, "y": 50}, "collapsed": false},
      {"id": "folders", "position": {"x": 400, "y": 50}, "collapsed": false}
    ],
    "zoom": 0.8,
    "viewport": {"x": 0, "y": 0}
  }
}
```

### 3.11 PostgreSQL 비즈니스 감사 로그 (NFR-SEC.10)

#### 3.11.1 `audit_logs_pg`

SQLite `audit_logs`가 HTTP 요청 단위, 이 테이블은 **비즈니스 엔티티 변경** (role 변경, policy 변경 등) 불변 기록:

```prisma
/// 비즈니스 엔티티 감사 로그. append-only (트리거로 UPDATE/DELETE 차단).
model AuditLogPg {
  id              BigInt   @id @default(autoincrement())
  userId          String?  @map("user_id") @db.Uuid
  sessionId       String?  @map("session_id")
  action          String                                       // 'user.role.changed' | 'policy.created'
  resourceType    String   @map("resource_type")               // 'user' | 'policy'
  resourceId      String?  @map("resource_id")
  oldValue        Json?    @map("old_value")
  newValue        Json?    @map("new_value")
  result          AuditResult
  errorCode       String?  @map("error_code")
  ip              String
  userAgent       String?  @map("user_agent")
  traceId         String   @map("trace_id")
  occurredAt      DateTime @default(now()) @map("occurred_at")

  @@index([userId, occurredAt])
  @@index([resourceType, resourceId])
  @@index([occurredAt])
  @@map("audit_logs_pg")
}

enum AuditResult { SUCCESS, FAILURE }
```

불변성 트리거 (§00-system-overview §4.4.3 정의):
```sql
CREATE TRIGGER audit_logs_pg_no_update
  BEFORE UPDATE OR DELETE ON audit_logs_pg
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

### 3.12 Wave 4 신규 PostgreSQL 테이블 요약 (총 18개 신규)

| # | 테이블 | Phase | 관련 ADR | 용도 |
|---|-------|-------|----------|------|
| 1 | `mfa_totp_secrets` | 15 | ADR-007 | TOTP 시드 (암호화) |
| 2 | `mfa_webauthn_credentials` | 15 | ADR-007 | WebAuthn 등록 credential |
| 3 | `mfa_backup_codes` | 15 | ADR-007 | MFA 백업 코드 |
| 4 | `user_sessions` | 17 | ADR-006 | 세션 관리 |
| 5 | `rate_limit_events` | 15 | ADR-007 | Rate Limit counter (UNLOGGED) |
| 6 | `vault_secrets` | 16 | ADR-013 | Vault 시크릿 (envelope) |
| 7 | `jwks_keys` | 16 | ADR-013 | JWKS 키쌍 |
| 8 | `jwks_key_rotations` | 16 | ADR-013 | JWKS 회전 감사 |
| 9 | `advisor_rules` | 20 | ADR-011 | 3-Layer 룰 카탈로그 |
| 10 | `advisor_findings` | 20 | ADR-011 | 룰 실행 결과 |
| 11 | `advisor_rule_mutes` | 20 | ADR-011 | 음소거 |
| 12 | `cron_job_runs` | 20 | ADR-005 | Cron 실행 전수 기록 |
| 13 | `webhook_deliveries` | 20 | ADR-005 | Webhook 전송 기록 |
| 14 | `backups` | 20 | ADR-005 | wal-g 백업 메타 |
| 15 | `backup_restores` | 20 | ADR-005 | 복원 감사 |
| 16 | `edge_function_schedules` | 19 | ADR-009 | Edge Fn cron |
| 17 | `realtime_subscriptions` | 19 | ADR-010 | Realtime 구독 |
| 18 | `user_preferences` | 20 | DQ-3.4 | UI preference |
| 19 | `audit_logs_pg` | 16 | NFR-SEC.10 | 비즈니스 감사 로그 |
| (+1 조건부) | `pg_graphql_persisted_queries` | 21+ | ADR-012/016 | 지속 GraphQL 쿼리 |

**총 19 신규 + 1 조건부 + 기존 10 = 29~30 테이블** 최종 상태.

### 3.13 PostgreSQL 통합 ERD (Wave 4 완성 예상)

```
 Auth 계층                          Storage 계층
┌─────────────┐                    ┌──────────────┐
│    User     │◄──1:N──────────────┤    Folder    │
│ (기존)       │                    │ (기존)        │
├─────────────┤                    ├──────────────┤
│             │◄──1:N──────────────┤     File     │
│             │                    │ (기존)        │
│             │◄──1:N──┐
│             │        │
└─────────────┘        │
   │                    │
   │ 1:N                │
   ▼                    │
┌─────────────────────┐│
│ user_sessions       ││
│ (Wave 4 신규)        ││
│ - ipHash             ││
│ - mfaMethod          ││
└─────────────────────┘│
   │                    │
   │ 1:N (MFA)          │
   ▼                    │
┌─────────────────────┐│
│ mfa_totp_secrets    ││
│ mfa_webauthn_cred   ││
│ mfa_backup_codes    ││
└─────────────────────┘│
                        │
┌───────────────────┐  │
│ user_preferences  │  │
│ (Wave 4 신규)      │  │
│ - scope            │  │
│ - data (JSON)      │──┘ 1:N
└───────────────────┘

 Rate Limit (UNLOGGED)       Vault                     JWKS
┌───────────────────────┐  ┌──────────────────┐   ┌──────────────┐
│ rate_limit_events     │  │ vault_secrets    │   │ jwks_keys     │
│ - bucketKey            │  │ - namespace      │◄──┤ - encrypted   │
│ - endpoint             │  │ - keyName         │   │   PrivateKey  │
│ - occurredAt           │  │ - ciphertext      │   │ - publicJwk    │
└───────────────────────┘  │ - wrappedDek      │   │ - status       │
                            │ - kekVersion      │   └──────┬───────┘
                            └──────────────────┘          │ 1:N
                                                           ▼
                                                  ┌───────────────────┐
                                                  │ jwks_key_rotations│
                                                  │ - reason           │
                                                  │ - performedBy      │
                                                  └───────────────────┘

 Audit Logs (PG — 비즈니스 엔티티)
┌──────────────────────────────────────────┐
│ audit_logs_pg (append-only trigger)      │
│ - userId, action, resourceType, result   │
│ - oldValue/newValue (JSON)               │
│ - traceId                                 │
└──────────────────────────────────────────┘

 SQL Editor + Edge Functions + DB Ops
┌──────────────┐                   ┌──────────────────┐
│ SqlQuery      │                   │ EdgeFunction     │
│ (기존)         │                   │ (기존)            │
└──────────────┘                   └──────┬───────────┘
                                           │ 1:N
                                           ▼
                                    ┌──────────────────┐
                                    │ EdgeFunctionRun  │
                                    │ (기존)            │
                                    └──────────────────┘
                                    ┌──────────────────────┐
                                    │ edge_function_schedules│
                                    │ (Wave 4 신규)          │
                                    └──────────────────────┘

┌──────────────┐  1:N   ┌──────────────────┐
│ Webhook       │────────▶│ webhook_deliveries│
│ (기존)         │         │ (Wave 4 신규)     │
└──────────────┘         └──────────────────┘

┌──────────────┐  1:N   ┌──────────────────┐
│ CronJob       │────────▶│ cron_job_runs    │
│ (기존)         │         │ (Wave 4 신규)     │
└──────────────┘         └──────────────────┘

 Backup
┌──────────────────┐  1:N   ┌─────────────────────┐
│ backups           │────────▶│ backup_restores    │
│ (Wave 4 신규)     │         │ (Wave 4 신규)      │
└──────────────────┘         └─────────────────────┘

 Advisors (3-Layer)
┌──────────────┐  1:N   ┌──────────────────┐
│ advisor_rules │────────▶│ advisor_findings │
│ (Wave 4 신규) │         │ (Wave 4 신규)     │
└──────┬───────┘         └──────────────────┘
       │ 1:N
       ▼
┌────────────────────┐
│ advisor_rule_mutes │
│ (Wave 4 신규)       │
└────────────────────┘

 Data API
┌──────────────┐                   ┌──────────────────┐
│ ApiKey        │                   │ LogDrain          │
│ (기존 + 확장) │                   │ (기존)            │
└──────────────┘                   └──────────────────┘

 Realtime
┌──────────────────────────────────────────┐
│ realtime_subscriptions (Wave 4 신규)      │
│ - channelName, filterClause               │
│ - clientSessionId                          │
└──────────────────────────────────────────┘

 [조건부] pg_graphql
┌───────────────────────────────────┐
│ pg_graphql_persisted_queries      │
│ (ADR-016 트리거 시에만 생성)        │
└───────────────────────────────────┘
```

---

## 4. SQLite ERD — 현재 + Wave 4 확장

### 4.1 현재 3 테이블 (`src/lib/db/schema.ts`)

```typescript
// 실제 코드 인용
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  action: text('action').notNull(),
  ip: text('ip').notNull(),
  path: text('path'),
  method: text('method'),
  statusCode: integer('status_code'),
  userAgent: text('user_agent'),
  detail: text('detail'),
});

export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  cpuUsage: integer('cpu_usage'),
  memoryUsed: integer('memory_used'),
  memoryTotal: integer('memory_total'),
});

export const ipWhitelist = sqliteTable('ip_whitelist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

### 4.2 ASCII ERD (현재)

```
┌──────────────────────┐
│    audit_logs         │
│ ──────────────────── │
│ id (PK)               │
│ timestamp             │
│ action                │
│ ip                    │
│ path?                 │
│ method?               │
│ statusCode?           │
│ userAgent?            │
│ detail?               │
└──────────────────────┘

┌──────────────────────┐
│  metrics_history      │
│ ──────────────────── │
│ id (PK)               │
│ timestamp             │
│ cpuUsage?             │
│ memoryUsed?           │
│ memoryTotal?          │
└──────────────────────┘

┌──────────────────────┐
│   ip_whitelist        │
│ ──────────────────── │
│ id (PK)               │
│ ip (UNIQUE)           │
│ description?          │
│ createdAt             │
└──────────────────────┘
```

### 4.3 Wave 4 확장 제안

#### 4.3.1 `cache_runtime_events` (Edge Functions Phase 19)

```typescript
export const cacheRuntimeEvents = sqliteTable('cache_runtime_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  functionId: text('function_id').notNull(),            // PG edge_functions.id (no FK)
  invocationId: text('invocation_id').notNull(),        // UUID
  runtimeLayer: text('runtime_layer').notNull(),        // 'L1_isolated' | 'L2_deno' | 'L3_sandbox'
  durationMs: integer('duration_ms'),
  memoryKb: integer('memory_kb'),
  cacheHit: integer('cache_hit', { mode: 'boolean' }),
  startedAt: integer('started_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  functionIdx: index('idx_cache_runtime_function').on(t.functionId, t.startedAt),
}));
```

**용도**: Edge Function 실행 통계 고속 집계. PG `EdgeFunctionRun`은 상세 기록(stdout/stderr)이지만, 이 SQLite 테이블은 집계(p50/p95 계산)에 최적.

#### 4.3.2 `mfa_challenge_cache` (Auth Advanced Phase 15, DQ-AA-2)

```typescript
export const mfaChallengeCache = sqliteTable('mfa_challenge_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  challenge: text('challenge').notNull(),               // base64 challenge
  challengeType: text('challenge_type').notNull(),      // 'webauthn_register' | 'webauthn_auth'
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
}, (t) => ({
  userIdx: index('idx_mfa_challenge_user').on(t.userId),
  expiresIdx: index('idx_mfa_challenge_expires').on(t.expiresAt),
}));
```

**용도**: WebAuthn challenge 임시 저장 (TTL 60초). SQLite가 자동 정리 크론(`node-cron`)으로 60초 이상 오래된 레코드 삭제. PG 저장 시 `vacuum full` 비용 회피.

#### 4.3.3 `sql_query_runs` (SQL Editor Phase 18, 선택적)

SQL Editor 실행 기록 고속 저장 (대량 트래픽):

```typescript
export const sqlQueryRuns = sqliteTable('sql_query_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  queryId: text('query_id'),                            // PG sql_queries.id or null for ad-hoc
  userId: text('user_id').notNull(),
  sqlHash: text('sql_hash').notNull(),                  // SHA-256
  sqlText: text('sql_text').notNull(),
  durationMs: integer('duration_ms').notNull(),
  rowCount: integer('row_count'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorCode: text('error_code'),
  ranAt: integer('ran_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (t) => ({
  userIdx: index('idx_sql_runs_user').on(t.userId, t.ranAt),
  hashIdx: index('idx_sql_runs_hash').on(t.sqlHash),
}));
```

### 4.4 SQLite 확장 ERD (Wave 4 완성)

```
┌──────────────────────┐      ┌──────────────────────┐
│    audit_logs         │      │  metrics_history      │
│    (기존)              │      │   (기존)               │
└──────────────────────┘      └──────────────────────┘

┌──────────────────────┐      ┌──────────────────────────┐
│   ip_whitelist        │      │  cache_runtime_events    │
│    (기존)              │      │  (Wave 4 신규)            │
└──────────────────────┘      └──────────────────────────┘

┌──────────────────────────┐  ┌──────────────────────────┐
│  mfa_challenge_cache      │  │  sql_query_runs           │
│  (Wave 4 신규)             │  │  (Wave 4 선택적)           │
└──────────────────────────┘  └──────────────────────────┘
```

**SQLite 총 테이블 수**: 현재 3 → Wave 4 최대 6개.

### 4.5 SQLite 운영 규칙

- **WAL 모드**: 모든 SQLite DB는 WAL 모드 사용 (`PRAGMA journal_mode=WAL`). 동시 읽기 허용.
- **재시작 내성**: SQLite 파일은 WSL2 로컬 디스크(`./data/metrics.sqlite`). 재시작 시 보존.
- **무결성 손상 시**: SQLite 손상은 재생성 가능(로그는 잃어도 비즈니스 치명적 아님). PG와 달리 백업 우선순위 낮음.
- **정리 크론**: `rate_limit_events`(PG UNLOGGED)와 `mfa_challenge_cache`(SQLite)는 `node-cron`이 10분마다 오래된 레코드 삭제.

---

## 5. 크로스-DB 동기화 전략

### 5.1 감사 로그 이중 저장 정책

#### 5.1.1 SQLite `audit_logs` — HTTP 요청 단위

**저장 대상**: 모든 HTTP 요청 (정상 + 에러). 미들웨어에서 자동 삽입.

```typescript
// middleware.ts
export async function middleware(req: NextRequest) {
  const traceId = crypto.randomUUID();
  // ... 처리
  const res = NextResponse.next();
  res.headers.set('X-Trace-Id', traceId);
  // SQLite audit_logs INSERT (비동기, 실패 허용)
  void sqliteDb.insert(auditLogs).values({
    action: 'http.request',
    ip: req.headers.get('CF-Connecting-IP') ?? 'unknown',
    path: req.nextUrl.pathname,
    method: req.method,
    statusCode: res.status,
    userAgent: req.headers.get('user-agent'),
    detail: traceId,
  });
  return res;
}
```

**특징**: 고속, 파손 허용, 365일 보관 후 삭제.

> ⚠️ **ADR-021 통지 (2026-04-25, 세션 56)**: 본 §의 "비동기, 실패 허용" 원칙은 [ADR-021](./01-adr-log.md) 으로 정식화 — 도메인 라우트는 `safeAudit(entry, context?)` (`src/lib/audit-log-db.ts`) 만 호출. `writeAuditLogDb` 는 `@internal`. SQLite 빈 DB / 마이그레이션 미적용 시나리오는 `wsl-build-deploy.sh [6/8] migrate / [7/8] verify` 빌드 게이트 + `instrumentation.ts` 부팅 self-heal 2단계로 차단. 정식 본문: [`docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md`](../../decisions/ADR-021-audit-cross-cutting-fail-soft.md).

#### 5.1.2 PostgreSQL `audit_logs_pg` — 비즈니스 엔티티 변경

**저장 대상**: role 변경, policy CRUD, user delete 등 "되돌릴 수 없거나 감사 필요" 이벤트.

```typescript
// Server Action 내부
await prisma.$transaction(async (tx) => {
  await tx.user.update({
    where: { id: userId },
    data: { role: 'ADMIN' },
  });
  await tx.auditLogPg.create({
    data: {
      userId: requesterId,
      sessionId,
      action: 'user.role.changed',
      resourceType: 'user',
      resourceId: userId,
      oldValue: { role: 'USER' },
      newValue: { role: 'ADMIN' },
      result: 'SUCCESS',
      ip, userAgent, traceId,
    },
  });
});
```

**특징**: PG 트랜잭션 원자성 보장. append-only 트리거로 불변. 365일+ 보관 (규제 대응).

### 5.2 PG → SQLite 동기화 금지

양 DB는 **독립**. PG → SQLite 복제 아키텍처 도입하지 않는다. SQLite는 이미 PG와 다른 목적(관측/캐시)이므로 복제 불필요.

예외: 대량 집계 리포트 시 Next.js Server Component에서 두 DB 각각 쿼리 후 JavaScript로 join. 이는 요청 단위로만 발생.

### 5.3 SQLite 재시작 전략

WSL2 재시작 → PM2 재시작 → SQLite 파일 그대로 유지 (파일시스템 persistent). 단, 인메모리 캐시(node-cache 등)는 재빌드.

`rate_limit_events` (PG UNLOGGED) 는 재시작 시 **의도적으로 휘발**. 5분 윈도 rate limit이라 재시작 직후 clean slate는 허용.

### 5.4 분산 트랜잭션 없음

본 프로젝트는 단일 노드이므로 2PC, Saga 등 분산 트랜잭션 패턴 **미사용**. 두 DB에 걸친 트랜잭션은:

1. PG 트랜잭션이 **권위 있는 커밋** (authoritative commit)
2. SQLite 삽입은 "best-effort" 비동기 (실패해도 사용자 경험 영향 없음)

예: 사용자 role 변경 → PG 트랜잭션 성공 → SQLite `audit_logs` 삽입 실패 → PG는 커밋된 상태 유지. 이런 경우 SQLite 무결성은 보장 안 됨. 중요 감사는 PG `audit_logs_pg` 우선.

### 5.5 crash recovery 플로우

```
PostgreSQL crash
  → wal-g WAL replay (RPO 60s)
  → PG 재시작
  → SQLite는 WAL로 자동 복구 (별도 작업 없음)

WSL2 전체 crash
  → Windows 재부팅
  → WSL2 재기동
  → systemd: postgresql, seaweedfs, cloudflared 자동 시작
  → PM2 resurrect: next-app, cron-worker, realtime-consumer, job-worker
  → Healthcheck /api/health 통과 확인
```

---

## 6. 마이그레이션 순서 (Phase 15-22)

### 6.1 Phase 15 — Auth Advanced (3 테이블 추가)

```
prisma/migrations/20260501000000_phase15_mfa/
  migration.sql
  - CREATE TABLE mfa_totp_secrets
  - CREATE TABLE mfa_webauthn_credentials
  - CREATE TABLE mfa_backup_codes
  - rate_limit_events UNLOGGED TABLE (raw SQL)
  - RLS 정책 3개 활성화

drizzle/migrations/20260501000000_mfa_challenge/
  migration.sql
  - CREATE TABLE mfa_challenge_cache
```

**예상 파일 수**: Prisma 1 + Drizzle 1 = 2 migration files.
**공수**: 2h (스키마 작성) + 4h (RLS 정책 + 트리거)

### 6.2 Phase 16 — Observability + Operations (4 테이블 추가)

```
prisma/migrations/20260601000000_phase16_vault_jwks/
  migration.sql
  - CREATE TABLE vault_secrets
  - CREATE TABLE jwks_keys
  - CREATE TABLE jwks_key_rotations
  - CREATE TABLE audit_logs_pg (+ append-only trigger)
  - RLS 비활성 (system tables, service role 전용)

# Operations은 Capistrano 구조이므로 DB 마이그레이션 없음
# secrets.env 파일 + /srv/luckystyle4u/ 구조만 생성
```

**예상 파일 수**: Prisma 1 migration.
**공수**: 4h

### 6.3 Phase 17 — Auth Core + Storage (1 테이블 + Folder/File 기존)

```
prisma/migrations/20260701000000_phase17_sessions/
  migration.sql
  - CREATE TABLE user_sessions
  - RLS 정책 (own sessions)

# Storage는 이미 Folder/File 모델 존재, 컬럼 추가만
prisma/migrations/20260701010000_phase17_file_extensions/
  migration.sql
  - ALTER TABLE files ADD COLUMN storage_tier TEXT DEFAULT 'hot'   -- hot | cold (B2)
  - ALTER TABLE files ADD COLUMN b2_object_key TEXT                -- B2 오프로드 시
  - ALTER TABLE files ADD COLUMN checksum_sha256 TEXT
```

**예상 파일 수**: Prisma 2 migrations.
**공수**: 3h

### 6.4 Phase 18 — SQL + Table Editor (선택적 1 테이블)

```
# SQL Editor + Table Editor는 기존 SqlQuery 모델 + UI만으로 80% 커버
# 선택적 (성능 필요 시):

drizzle/migrations/20260801000000_sql_runs_cache/
  migration.sql
  - CREATE TABLE sql_query_runs (SQLite)

# SqlQuery 확장 (폴더 지원):
prisma/migrations/20260801010000_phase18_sql_folders/
  migration.sql
  - ALTER TABLE sql_queries ADD COLUMN folder_path TEXT
  - ALTER TABLE sql_queries ADD COLUMN tags TEXT[]
```

**예상 파일 수**: Prisma 1 + Drizzle 1 = 2.
**공수**: 2h

### 6.5 Phase 19 — Edge Functions + Realtime (2 테이블)

```
prisma/migrations/20260901000000_phase19_edge_schedules/
  migration.sql
  - CREATE TABLE edge_function_schedules

prisma/migrations/20260901010000_phase19_realtime_subs/
  migration.sql
  - CREATE TABLE realtime_subscriptions
  - RLS (user's own subscriptions)

drizzle/migrations/20260901020000_cache_runtime/
  migration.sql
  - CREATE TABLE cache_runtime_events (SQLite)

# wal2json 확장 설치
prisma/migrations/20260901030000_enable_wal2json/
  migration.sql
  - CREATE EXTENSION IF NOT EXISTS wal2json
  - ALTER SYSTEM SET wal_level = 'logical'
  - (재시작 필요)
```

**예상 파일 수**: Prisma 3 + Drizzle 1 = 4.
**공수**: 6h (wal2json 설치/재시작 포함)

### 6.6 Phase 20 — Schema Viz + DB Ops + Advisors (9 테이블 추가, 가장 큰 migration)

```
prisma/migrations/20261001000000_phase20_advisors/
  migration.sql
  - CREATE TABLE advisor_rules
  - CREATE TABLE advisor_findings
  - CREATE TABLE advisor_rule_mutes
  - INSERT INTO advisor_rules (기본 38+ splinter 룰 + 20 squawk + 10 schemalint)

prisma/migrations/20261001010000_phase20_db_ops_runs/
  migration.sql
  - CREATE TABLE cron_job_runs
  - CREATE TABLE webhook_deliveries
  - CREATE TABLE backups
  - CREATE TABLE backup_restores
  - pgmq 확장 설치
    CREATE EXTENSION IF NOT EXISTS pgmq

prisma/migrations/20261001020000_phase20_preferences/
  migration.sql
  - CREATE TABLE user_preferences
  - RLS 활성 (own preferences)
```

**예상 파일 수**: Prisma 3 migrations.
**공수**: 8h (advisor_rules 기본 룰 삽입 + RLS 정책 다수)

### 6.7 Phase 21 — Data API + UX Quality (0~1 테이블)

```
# Data API 강화는 기존 ApiKey 컬럼 확장:
prisma/migrations/20261101000000_phase21_api_keys_v2/
  migration.sql
  - ALTER TABLE api_keys ADD COLUMN rate_limit_tier TEXT
  - ALTER TABLE api_keys ADD COLUMN ip_whitelist TEXT[]
  - ALTER TABLE api_keys ADD COLUMN scope_expression TEXT

# [조건부] pg_graphql 도입 시 (ADR-016 트리거 충족):
prisma/migrations/20261101010000_phase21_pg_graphql_optional/
  migration.sql
  - CREATE EXTENSION IF NOT EXISTS pg_graphql
  - CREATE TABLE pg_graphql_persisted_queries

# UX Quality는 DB 마이그레이션 없음 (AI SDK + MCP 코드)
```

**예상 파일 수**: Prisma 1 (+1 조건부).
**공수**: 2h (+4h 조건부)

### 6.8 Phase 22 — 통합 마감 (미검증 사항 정리)

```
prisma/migrations/20261201000000_phase22_indexes_optimization/
  migration.sql
  - 각 테이블 누락 인덱스 추가 (Advisors 룰 실행 결과 기반)
  - VACUUM FULL (대형 테이블)
  - CHECK 제약 추가 (데이터 품질 강화)
```

**예상 파일 수**: Prisma 1.
**공수**: 4h

### 6.9 Phase별 마이그레이션 요약

| Phase | Prisma migrations | Drizzle migrations | 신규 테이블 | 공수 |
|-------|-------------------|---------------------|-------------|------|
| 15 | 1 | 1 | 3 + 1 UNLOGGED | 6h |
| 16 | 1 | 0 | 4 | 4h |
| 17 | 2 | 0 | 1 + File 확장 | 3h |
| 18 | 1 | 1 | 0 + SqlQuery 확장, SQLite 1 | 2h |
| 19 | 3 | 1 | 2 + SQLite 1 + wal2json | 6h |
| 20 | 3 | 0 | 8 | 8h |
| 21 | 1 (+1 조건부) | 0 | 0~1 | 2h (+4h) |
| 22 | 1 | 0 | 0 (인덱스만) | 4h |
| **합계** | **13~14** | **3** | **18~19 + 확장** | **35~39h** |

### 6.10 롤백 전략

#### 6.10.1 Prisma 롤백 원칙

Prisma 공식 `migrate` 는 자동 롤백을 지원하지 않음. 각 마이그레이션 파일에 **수동 DOWN 스크립트** 포함:

```sql
-- 20260501000000_phase15_mfa/migration.sql
-- UP
CREATE TABLE mfa_totp_secrets (...);

-- DOWN (주석 처리 — 수동 실행 대비)
-- DROP TABLE mfa_totp_secrets;
```

마이그레이션 실패 시 `prisma migrate resolve --rolled-back <id>` + 수동 DOWN 실행.

#### 6.10.2 Wave 2 Operations 5초 롤백과 연계

ADR-015 Capistrano-style 심링크 롤백은 **코드 롤백**만 커버. DB 마이그레이션이 적용된 후 코드를 되돌려도 스키마는 그대로. 따라서:

1. **Forward-compatible 마이그레이션 원칙**: 새 Phase의 마이그레이션은 "이전 코드가 새 스키마와 공존 가능"하도록 설계 (예: 새 컬럼은 NULLABLE 또는 DEFAULT 값).
2. **Breaking 마이그레이션 금지**: 컬럼 삭제/이름 변경은 2-step (먼저 옵셔널 추가 → 코드 전환 → 이전 컬럼 삭제).

#### 6.10.3 재해 복구 (NFR-REL.1 RPO 60s)

wal-g PITR로 시점 복구. 마이그레이션 적용 직전의 PG 상태로 되돌릴 수 있음:

```bash
# 예: 2026-05-01 00:00:00 적용 직전으로 복구
wal-g backup-fetch $PGDATA LATEST_FULL_BEFORE_20260501
wal-g wal-fetch $PGDATA --until '2026-05-01 00:00:00'
systemctl start postgresql
```

### 6.11 마이그레이션 검증 체크리스트

각 Phase 마이그레이션 실행 시:

- [ ] Prisma `migrate status` — 미적용 목록 확인
- [ ] 스테이징 환경에서 먼저 실행 (`canary.stylelucky4u.com` 공유 DB는 주의)
- [ ] 마이그레이션 실행 시간 측정 (대형 테이블 `ALTER` 는 분 단위 지연 가능)
- [ ] 롤백 시나리오 사전 문서화
- [ ] RLS 정책 활성화 확인 (NFR-SEC.7 95% 커버)
- [ ] Advisors splinter 38룰 실행 → 신규 스키마에 경고 없음 확인
- [ ] `prisma generate` — 클라이언트 재생성
- [ ] TypeScript strict 컴파일 통과
- [ ] Vitest 테스트 통과

---

## 부록 Z. 근거 인덱스

### Z.1 현재 스키마 파일 경로

| 파일 | 용도 |
|------|------|
| `prisma/schema.prisma` | PostgreSQL 10 테이블 + enum 8종 |
| `src/lib/db/schema.ts` | SQLite 3 테이블 (Drizzle) |

### Z.2 Wave 1/2/3 근거 매핑

| 본문 §/테이블 | 근거 문서 |
|-------------|----------|
| §1 3-DB 전략 | Wave 1 Round 2 결론, Wave 2 B/E 매트릭스 |
| §3.1 MFA 테이블들 | `01-research/06-auth-advanced/*.md`, ADR-007 |
| §3.2 user_sessions | `01-research/05-auth-core/01-deep-lucia.md`, ADR-006 |
| §3.3 rate_limit_events | `01-research/06-auth-advanced/03-deep-rate-limit.md`, NFR-SEC.4 |
| §3.4 vault_secrets / jwks_keys | `01-research/12-observability/01-deep-node-crypto.md`, ADR-013, DQ-12.3 |
| §3.5 advisor_* | `01-research/10-advisors/*.md`, ADR-011 |
| §3.6 cron_job_runs / webhook_deliveries / backups | `01-research/04-db-ops/*.md`, ADR-005, DQ-4.4, DQ-4.6 |
| §3.7 edge_function_schedules | `01-research/08-edge-functions/*.md`, ADR-009 |
| §3.8 realtime_subscriptions | `01-research/09-realtime/*.md`, ADR-010 |
| §3.9 api_keys_v2 / pg_graphql | `01-research/11-data-api/*.md`, ADR-012, ADR-016 |
| §3.10 user_preferences | DQ-3.4 (Schema Viz Wave 3) |
| §3.11 audit_logs_pg | NFR-SEC.10, `08-security-threat-model.md` R1~R2 |
| §4.3 SQLite 확장 | 각 Phase Blueprint에서 정밀화 |
| §6 마이그레이션 순서 | `00-vision/10-14-categories-priority.md §4.1` |

### Z.3 Prisma/Drizzle 공식 문서

- Prisma 7 마이그레이션: https://www.prisma.io/docs/concepts/components/prisma-migrate
- Drizzle SQLite: https://orm.drizzle.team/docs/get-started-sqlite
- PostgreSQL UNLOGGED TABLE: https://www.postgresql.org/docs/current/sql-createtable.html (storage_parameter)
- pgmq: https://github.com/tembo-io/pgmq
- wal2json: https://github.com/eulerto/wal2json
- pg_graphql: https://supabase.github.io/pg_graphql/

### Z.4 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent A1 (Opus 4.7 1M) | Wave 4 Tier 1 초안 — PG 10+18 신규, SQLite 3+3 신규 |

### Z.5 후속 Wave 4/5 산출물 연결

- → Wave 4 Tier 2 Blueprint 14개: 각 Blueprint §4에서 이 문서의 관련 테이블 정의 인용
- → Wave 5 로드맵: §6 마이그레이션 순서를 Phase별 정밀 계획에 흡수
- → 프로젝트 구현 세션 (Phase 15~22): 실제 `prisma/migrations/` 파일 생성 시 이 문서의 스키마 제안을 기본으로 시작

---

> **데이터 모델 ERD 끝.** Wave 4 · A1 · 2026-04-18 · 양평 부엌 서버 대시보드 — PostgreSQL 29+ 테이블 + SQLite 6 테이블 + SeaweedFS + B2.
