# Phase 16 설계 — Vault + Deploy Automation + Canary + Infrastructure UI

> 작성일: 2026-04-19 (세션 46)
> 근거: Wave 5 `05-roadmap/01-milestones-wbs.md §4` + `04-observability-blueprint.md §12` + `05-operations-blueprint.md §12`
> 선행: Phase 15 Auth Advanced A-D 완결 (세션 32~45)
> 후행: Phase 17 Auth Core + Storage (M3)

---

## 0. 요약 (TL;DR)

Phase 16은 **운영 견고성**을 완성하는 마일스톤이다. 4개 sub-phase (16a/b/c/d) + 회수 작업 1건 (16e) 으로 분해한다.

| Sub | 제목 | 공수 | Wave 근거 | 독립성 |
|-----|------|------|----------|--------|
| **16a** | Vault (node:crypto AES-256-GCM) | 8h | Wave 16-A | 완전 독립 |
| **16b** | Capistrano-style 배포 자동화 | 10h | Wave 16-C | 완전 독립 |
| **16c** | PM2 cluster:4 + Canary 배포 | 10h | Wave 16-D | 16b 의존 |
| **16d** | Infrastructure UI + deploy_events UI | 4h | Wave 16-B-4 + 16-C-5 | 16a/16b 의존 (UI 표시용) |
| **16e** | JWKS Vault 통합 (회수) | 3h | Wave 16-B-4 | 16a 의존 |
| **합계** | — | **35h** | — | — |

> **드리프트 방지 핵심**: 세션 40~44의 5세션 TIMESTAMPTZ 디버깅 재발 방지를 위해 각 sub-phase 시작 전에 **사전 스파이크(SP-xxx)** 를 강제한다. 미검증 가정 위에 구현을 쌓지 않는다.

---

## 1. 배경 & 동기

### 1.1 현재 갭

| 영역 | 현재 | 목표 | 갭 |
|------|------|------|-----|
| 시크릿 관리 | `.env` 평문 + `MFA_MASTER_KEY` 단독 | AES-256-GCM envelope encryption | Vault 부재 |
| 배포 | `/ypserver prod` 재귀 rsync + PM2 restart | atomic symlink swap + 5s rollback | 롤백 <30s 불가 |
| 고가용성 | PM2 fork 모드 단일 프로세스 | cluster:4 + graceful reload | 배포 중 다운타임 존재 |
| 카나리 | 없음 (full prod 직접) | 10% 트래픽 분산 + 자동 롤백 | 회귀 늦게 발견 |
| 가시성 | PM2 logs only | Infrastructure UI (JWKS KID / PM2 / PG / disk) | 실시간 대시보드 부재 |

### 1.2 Wave 평가 기준

- **Observability 65 → 85점** (16a + 16e + 16d 일부)
- **Operations 80 → 95점** (16b + 16c + 16d 일부)

### 1.3 세션 45 완결 상태 영향

- **HS256 legacy 제거 완료**: JWKS ES256 단일 signing path. 16-B 원안 12h 중 core 9h는 세션 33에 이미 구현됨 → **16e 3h 회수 작업만 남음** (Vault 암호화 + UI 카드).
- **Session.revokedReason + SESSION_EXPIRE audit 완결**: 16c Canary 자동 롤백 시 `CANARY_AUTO_ROLLBACK` audit 이벤트 패턴을 그대로 차용 가능.

---

## 2. 목표 & 비-목표

### 2.1 목표 (In-Scope)

1. `.env` 평문 시크릿 → Vault AES-256-GCM envelope 이전 (MFA_MASTER_KEY 포함)
2. 배포 롤백 <30s 보장 (symlink swap)
3. PM2 cluster:4 + graceful reload로 배포 중 0다운타임
4. Canary 서브도메인 + 10% 트래픽 + 자동 롤백 (에러율 2% / p95 2s 5분)
5. Infrastructure UI (`/settings/infrastructure`) + Deploy Events UI (`/settings/deployments`)
6. JWKS private key Vault 암호화 저장

### 2.2 비-목표 (Out-of-Scope)

- Phase 17 (Auth Core + Storage) 요소
- Multi-region 배포
- Kubernetes / Docker 이행 (Operations Wave에서 재고 트리거 0개 확인)
- Blue-green 배포 (Canary 로 충분)
- Vault 자동 회전 UI (초기는 CLI `scripts/rotate-kek.sh` 로 충분)

---

## 3. Sub-Phase 설계

### 3.1 16a Vault (node:crypto AES-256-GCM) — 8h

#### 데이터 모델

```prisma
model SecretItem {
  id             String   @id @default(cuid())
  name           String   @unique                         // e.g. "mfa.master_key", "jwks.current.private"
  encryptedValue Bytes                                    // AES-256-GCM ciphertext
  iv             Bytes                                    // 96-bit random IV
  tag            Bytes                                    // 128-bit GCM tag
  kekVersion     Int      @default(1)                     // 회전 추적
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  rotatedAt      DateTime? @db.Timestamptz(3)
  @@index([name])
}
```

#### 컴포넌트

| 파일 | 역할 | 의존 |
|------|------|------|
| `src/lib/vault/MasterKeyLoader.ts` | `/etc/luckystyle4u/secrets.env` 로딩, chmod 0640 검증, 미존재 시 서버 시작 거부 | node:fs, node:crypto |
| `src/lib/vault/VaultService.ts` | `encrypt(plain, namespace)` / `decrypt(secretName)` / `rotate()` — KEK/DEK 2계층 | MasterKeyLoader, Prisma |
| `prisma/schema.prisma` | `SecretItem` 모델 추가 | — |
| `scripts/migrate-env-to-vault.ts` | `.env` → Vault 일괄 이전 (멱등) | VaultService |

#### 인터페이스

```typescript
export class VaultService {
  async encrypt(plainValue: string, secretName: string): Promise<void>
  async decrypt(secretName: string): Promise<string>
  async rotateKek(): Promise<{ migratedCount: number }>
}
```

#### DOD

- `VaultService.encrypt` → DB `SecretItem` row 생성 확인
- `VaultService.decrypt("mfa.master_key")` === 기존 평문 `MFA_MASTER_KEY`
- `/etc/luckystyle4u/secrets.env` chmod 검증 실패 시 서버 시작 거부 (프로세스 exit code 1)
- `rotateKek()` dry-run: 기존 암호문 재암호화 후 decrypt 값 동일
- 단위 테스트 20+ (GCM tamper 검출 / IV 재사용 금지 / 미존재 secret throw)

#### 사전 스파이크 (필수)

**SP-017 node:crypto AES-256-GCM envelope 검증 (2h)**:
- IV 96-bit randomBytes 유일성 (1M 샘플 충돌 0건)
- tag 128-bit 검증 — ciphertext 1bit 변조 시 `authTag mismatch` throw
- KEK 회전 시 성능 — 100 SecretItem 재암호화 <500ms

### 3.2 16b Capistrano-style 배포 자동화 — 10h

#### 디렉토리 구조

```
~/dashboard/
├── current -> releases/20260419-143000/       (symlink, atomic swap 대상)
├── releases/
│   ├── 20260419-143000/                        (최신)
│   ├── 20260419-130000/
│   ├── 20260419-120000/
│   ├── 20260419-100000/
│   ├── 20260419-090000/                        (최대 5개 유지)
│   └── 20260418-230000/                        (cleanup 대상)
└── shared/
    ├── data/                                   (better-sqlite3 dashboard.db)
    ├── logs/
    ├── uploads/
    └── .env.production
```

#### 컴포넌트

| 파일 | 역할 |
|------|------|
| `scripts/deploy.sh` | 새 타임스탬프 디렉토리 생성 → rsync → symlink shared → `pm2 reload` (swap) |
| `scripts/rollback.sh` | 이전 release 로 `current` symlink 복원 → `pm2 reload` — 5s 목표 |
| `scripts/cleanup-releases.sh` | 최신 5개 제외 삭제 (배포 후 cron) |
| `/ypserver` 스킬 Phase 2 | 재귀 rsync → atomic swap 패턴으로 교체 |

#### 원자 swap 순서

```bash
# 1. 신규 release 준비
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p releases/$TS
rsync -a $SOURCE/ releases/$TS/
cd releases/$TS && npm install --production && npm run build

# 2. shared 리소스 symlink
ln -sfn ../../shared/data releases/$TS/data
ln -sfn ../../shared/.env.production releases/$TS/.env.production

# 3. atomic swap (5초 목표)
ln -sfn releases/$TS current
pm2 reload dashboard --update-env

# 4. health check
curl -f http://localhost:3000/api/health || scripts/rollback.sh

# 5. cleanup
scripts/cleanup-releases.sh
```

#### DOD

- 신규 배포 → `readlink current` === `releases/$TS`
- 롤백 스크립트 → 이전 symlink + `pm2 reload` <30s (측정)
- 5개 초과 release 자동 삭제
- 배포 실패 (npm build fail) 시 `current` symlink 변경 없음 (원자성 보장)

#### 사전 스파이크

**SP-018 symlink atomic swap 검증 (1h)**:
- `ln -sfn` 중 다른 프로세스의 read 실패율 측정 (1000 req 동안 rename)
- PM2 `reload` (hot) vs `restart` 다운타임 차이

### 3.3 16c PM2 cluster:4 + Canary — 10h

#### ecosystem.config.js

```javascript
module.exports = {
  apps: [
    {
      name: 'dashboard',
      script: 'server.js',
      exec_mode: 'cluster',
      instances: 4,
      max_memory_restart: '512M',
      env_file: '/etc/luckystyle4u/secrets.env',
      kill_timeout: 30000,                // graceful 30s
      listen_timeout: 10000,              // ready signal
      wait_ready: true,
    },
    {
      name: 'dashboard-canary',
      script: 'server.js',
      exec_mode: 'cluster',
      instances: 1,
      env: { PORT: 3001, IS_CANARY: 'true' },
      env_file: '/etc/luckystyle4u/secrets.env',
    },
    {
      name: 'cleanup-scheduler',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      env: { WORKER_MODE: 'scheduler' },
    },
  ],
};
```

#### Cloudflare Tunnel 라우팅

```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: canary.stylelucky4u.com
    service: http://localhost:3001
  - hostname: stylelucky4u.com
    service: http://localhost:3000
  - service: http_status:404
```

Cloudflare Rule: `stylelucky4u.com` 10% 트래픽 → `canary.stylelucky4u.com` (cf-ray hash 기반).

#### CanaryRouter 자동 롤백

```typescript
// src/lib/deploy/CanaryRouter.ts
export async function evaluateCanaryHealth(): Promise<'promote' | 'rollback' | 'continue'> {
  const metrics = await fetchLast5MinMetrics('dashboard-canary');
  if (metrics.errorRate > 0.02) return 'rollback';
  if (metrics.p95Latency > 2000) return 'rollback';
  if (metrics.elapsedMinutes >= 30 && metrics.errorRate < 0.005) return 'promote';
  return 'continue';
}
```

Cron: `*/1 * * * *` (매분 평가).

#### DOD

- PM2 `list` → dashboard × 4 cluster + dashboard-canary × 1 + cleanup-scheduler × 1 fork
- `pm2 reload dashboard` 중 `curl /api/health` — 1000회 측정 중 실패 ≤1건 (≥99.9%)
- canary 강제 에러 주입 (`/api/health?force=500`) → 5분 내 `CANARY_AUTO_ROLLBACK` audit + 트래픽 0% 복원
- graceful shutdown: SIGTERM → 진행 중 req 완료 → 종료 (taskkill 방지)

#### 사전 스파이크

**SP-019 PM2 cluster:4 + better-sqlite3 호환성 (3h)**:
- PM2 v6 `delete all --namespace` 버그 (세션 30 사고) 재현 및 safeguard 검증
- better-sqlite3 writer 경합 — cluster 4 동시 audit_log INSERT 시 SQLITE_BUSY 발생 여부
- `instrumentation.ts` cleanup-scheduler 중복 실행 방지 (`globalThis.__cleanupScheduler` 가 cluster 에서는 워커별) → **advisory_lock 또는 fork 전용 분리** 필수

### 3.4 16d Infrastructure UI + Deploy Events UI — 4h

#### 페이지

| 경로 | 카드 |
|------|------|
| `/settings/infrastructure` | PM2 프로세스 × N · PG connection · SQLite size · disk usage (WSL df) · JWKS KID 현황 (CURRENT + RETIRED) · Vault KEK 버전 |
| `/settings/deployments` | 최근 5 release 목록 · 현재 symlink 표시 · 각 row "롤백" 버튼 (admin only) · deploy_events 이력 (최근 20건) |

#### Prisma 모델

```prisma
model DeployEvent {
  id           String   @id @default(cuid())
  releaseId    String                                     // YYYYMMDD-HHMMSS
  action       String                                     // DEPLOY_START / DEPLOY_SUCCESS / DEPLOY_FAIL / ROLLBACK / CANARY_PROMOTE / CANARY_AUTO_ROLLBACK
  actorId      String?                                    // NULL if system
  duration     Int?                                       // ms
  detail       Json?
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  @@index([createdAt(sort: Desc)])
  @@index([action, createdAt(sort: Desc)])
}
```

#### API

- `GET /api/admin/infrastructure` — SSE 또는 5초 폴링 (Wave 규정 SSE)
- `GET /api/admin/deployments` — DeployEvent 최근 20 + current release
- `POST /api/admin/deployments/rollback` — actorId 포함 audit 기록 후 `rollback.sh` 실행

#### DOD

- `/settings/infrastructure` 진입 → PM2 4 cluster + JWKS CURRENT KID 표시
- 임의 배포 → `DeployEvent` 2건 (START + SUCCESS) 기록, UI 에 나타남
- 롤백 버튼 클릭 → confirm 다이얼로그 → 30s 내 이전 release 복원 + 감사 로그

### 3.5 16e JWKS Vault 통합 (회수 작업) — 3h

세션 33 구현된 JWKS 의 private key 가 DB `JwksKey.privateJwk` 에 **평문 JSON** 저장 상태. 16a Vault 완료 후 다음을 회수:

1. `privateJwk` 컬럼을 `privateJwkSecretName` (Vault 참조) 로 리네임
2. 기존 키쌍 마이그레이션 스크립트 (`scripts/migrate-jwks-to-vault.ts`)
3. `getSigningKey()` → `VaultService.decrypt("jwks.${kid}.private")` 로 변경
4. Infrastructure UI 에 Vault KEK 버전 카드 (16d 와 병행)

#### DOD

- `SELECT private_jwk FROM jwks_keys` → NULL (마이그레이션 완료)
- 로그인 → JWT 서명 → JWKS verify 통과 (회귀 0)
- Vault KEK 회전 → JWKS 자동 재암호화

---

## 4. 의존성 DAG

```
SP-017 (Vault 스파이크) ──→ 16a Vault ──┬─→ 16e JWKS Vault 통합 ──┐
                                         │                          ├─→ 16d Infrastructure UI
SP-018 (symlink 스파이크) ─→ 16b 배포 ──┼──────────────────────────┤
                                         │                          │
SP-019 (cluster 스파이크) ─→ 16c cluster+canary ──────────────────┘
                              ↑
                              └── 16b (releases/ 구조 선행 필요)
```

**병렬 실행 가능**:
- SP-017 + SP-018 + SP-019 (3 스파이크 동시)
- 16a + 16b (상호 독립)
- 16c 는 16b 후
- 16d 는 16a + 16b + 16e 후 (마지막 통합)

**직렬 경로 (Critical Path)**: SP-018 (1h) → 16b (10h) → 16c (10h) → 16d (4h) = **25h**

---

## 5. 위험 & 롤백 전략

| 위험 | 영향 | 완화 | 롤백 |
|------|------|------|------|
| Vault MASTER_KEY 유실 | 전체 시크릿 복호화 불가 | 서버 시작 거부 + `/etc/luckystyle4u/secrets.env` 백업 (root 홈 + USB) | 백업 key 복원 |
| symlink swap 중 동시 요청 실패 | 일부 요청 502 | SP-018 에서 실패율 측정 후 수용 가능 기준 설정 (<0.1%) | `current.old` symlink 유지 |
| cluster:4 SQLite writer 경합 | audit_log INSERT 실패 | SP-019 검증, 필요 시 fork 모드 유지 (single writer) | ecosystem.config.js 원복 |
| canary 자동 롤백 오탐 | 정상 배포인데 롤백 | 5분 이상 관찰 + errorRate 2% + p95 2s **모두** 초과 시만 | audit 로그 + 수동 promote |
| instrumentation.ts cluster 중복 | cleanup 매일 4회 실행 | fork 전용 scheduler 프로세스 분리 | 별도 PM2 앱 |
| PG connection 고갈 | cluster:4 × 풀 크기 초과 | `DATABASE_URL?connection_limit=5` 명시 | PG `max_connections` 증가 |

---

## 6. 세션 40~44 드리프트 재발 방지

| 드리프트 교훈 | Phase 16 적용 |
|--------------|--------------|
| 미검증 가정 위에 5세션 디버깅 | SP-017/018/019 **필수 선행** — 스파이크 없으면 구현 금지 |
| Prisma adapter-pg TZ 함정 | Vault `createdAt` / `rotatedAt` 부터 `@db.Timestamptz(3)` 강제 |
| raw SQL 과 ORM 혼재 | Vault 는 ORM-only, Canary metric 은 raw SQL only — 경계 명확히 |
| CK 32건 축적의 역설 (문서 vs 실행) | 16a 코드 주석에 **해당 CK 파일명** 링크 (예: `// See: 2026-04-19-orm-date-filter-audit-sweep.md`) |
| 3회 연속 fix = whack-a-mole | 각 sub-phase DOD 테스트에 **회귀 가드 curl 스크립트** 포함 필수 (`scripts/phase16-<sub>-verify.sh`) |

---

## 7. DOD 매트릭스

| Sub | 자동화 DOD | 수동 DOD | 프로덕션 배포 |
|-----|-----------|---------|-------------|
| 16a | vitest 20+ (encrypt/decrypt/rotate) | `scripts/phase16-vault-verify.sh` | migrate-env-to-vault 실행 + MFA 로그인 회귀 0 |
| 16b | `scripts/phase16-deploy-verify.sh` (10회 배포 → 5 release 유지) | 수동 롤백 <30s 시간 측정 | `/ypserver prod` 내부 구현 교체 |
| 16c | SP-019 통과 + curl 99.9% | canary 강제 에러 주입 → 자동 롤백 5분 | `dashboard-canary` PM2 가동 + cloudflared reload |
| 16d | Playwright UI 렌더링 | Infrastructure 카드 5종 / Deploy 이력 5건 수동 확인 | (UI) |
| 16e | vitest JWKS verify 회귀 0 | `SELECT private_jwk FROM jwks_keys` → NULL | JWKS grace 3분 내 키 회전 테스트 |

---

## 8. ADR-020 초안 요약

> **결정**: Phase 16 를 node:crypto + jose + Capistrano-style + PM2 cluster:4 + Cloudflare Rule canary 로 구현한다. 40h Wave 계획 대비 **35h** 로 축소 (JWKS core 5h 세션 33 회수).

**거부된 대안**:
- HashiCorp Vault (Docker) — Docker 미도입 결정 (ADR-010) 위반
- Blue-Green 배포 — canary 로 충분 + 스토리지 2배 필요
- Kubernetes HPA — 1인 운영 과투자

**재검토 트리거**:
1. 배포 빈도 주 3회 초과 → Blue-Green 재고
2. 동시 사용자 100+ → PM2 cluster:4 → 8 확장
3. 시크릿 50+ 증가 → HashiCorp Vault 재고

---

## 9. 실행 계획 세션 매핑

| 세션 | 범위 | 예상 시간 |
|------|------|----------|
| 46 (현재) | 설계 + ADR-020 + writing-plans | 3h |
| 47 | SP-017/018/019 병렬 스파이크 | 6h |
| 48 | 16a Vault 구현 + migrate-env-to-vault | 8h |
| 49 | 16b 배포 자동화 + `/ypserver` 교체 | 10h |
| 50 | 16c PM2 cluster + Canary | 10h |
| 51 | 16d Infrastructure UI + Deploy Events UI + 16e JWKS 회수 | 7h |
| 52 | 통합 E2E + 프로덕션 배포 | 3h |

**총 7 세션** / **47h 누적** (설계 3 + 스파이크 6 + 구현 35 + E2E 3).

---

## 10. 참고

- Wave 5 `05-roadmap/01-milestones-wbs.md §4` (Phase 16 WBS 원본)
- Wave 4 `02-architecture/04-observability-blueprint.md §12`
- Wave 4 `02-architecture/05-operations-blueprint.md §12`
- 세션 33 JWKS 구현: `src/lib/jwks/`
- 세션 45 HS256 제거: commit `dac8c34`
- CK 누적 32건 중 드리프트 방지 관련: `2026-04-19-orm-date-filter-audit-sweep.md`
