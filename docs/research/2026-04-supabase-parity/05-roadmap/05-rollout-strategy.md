# 05. 롤아웃 전략 — Capistrano-style + PM2 cluster:4 + Canary 서브도메인 통합

> Wave 5 · R3 에이전트 산출물
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관:
> - [02-architecture/05-operations-blueprint.md](../02-architecture/05-operations-blueprint.md) (ADR-015 Capistrano + PM2 cluster:4 + canary 원본)
> - [04-integration/02-cloudflare-deployment-integration.md](../04-integration/02-cloudflare-deployment-integration.md) (Tunnel 통합 계약)
> - [04-go-no-go-checklist.md](./04-go-no-go-checklist.md) (게이트 기준 연동)
> - [handover 25-B](../../../../docs/handover/260418-session25b-deploy-tunnel-tuning.md), [25-C](../../../../docs/handover/260418-session25c-tunnel-complete-playwright.md) (Tunnel 530 실전 교훈)
> - [solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md](../../../../docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md) (운영 가이드 원본)

---

## 0. 문서 구조

```
§1.  요약 — Capistrano-style + PM2 cluster:4 + canary 통합 전략
§2.  배포 전략 결정 매트릭스 — 위험도별 전략 선택
§3.  Capistrano-style 디렉토리 구조 — releases symlink 패턴
§4.  카나리 서브도메인 시간차 배포 — canary.stylelucky4u.com
§5.  PM2 cluster:4 운영 — graceful reload + 헬스체크
§6.  5초 롤백 절차 — symlink 스왑 + 자동 트리거 + post-mortem
§7.  피처 플래그 정책 — PG feature_flags 테이블
§8.  DB 마이그레이션 안전 절차 — Prisma + Drizzle
§9.  Cloudflare Tunnel 530 운영 가이드 — 실전 교훈 집약
§10. 모니터링 + 알림 체인 — Slack webhook + 임계값
부록 Z. 근거 인덱스 · 변경 이력
```

---

## 1. 요약 — 통합 배포 전략 개요

### 1.1 핵심 의사결정 (ADR-015 재확인)

양평 부엌 서버 대시보드의 롤아웃 전략은 **Capistrano-style symlink 배포 + PM2 cluster:4 graceful reload + canary.stylelucky4u.com 시간차 검증**의 3축 통합 체계다.

| 축 | 기술 | 목적 | 근거 |
|----|------|------|------|
| Capistrano-style | `releases/{timestamp}/ + current symlink` | 0초 다운타임 + 5초 롤백 | ADR-015, Operations Blueprint §2.1 |
| PM2 cluster:4 | `pm2 reload --wait-ready` | 4워커 순차 재시작으로 서비스 단절 없음 | NFR-REL.3, ecosystem.config.js |
| Canary 서브도메인 | `canary.stylelucky4u.com` (포트 3002) | 신 버전 사전 검증 후 단계적 승격 | NFR-REL.4, Operations Blueprint §5 |

### 1.2 Docker Compose 거부 원칙 (ADR-015 유지)

Docker 이행 조건 4개 중 현재 충족 조건 0개:
1. 월 트래픽 > 100만 요청 — 미충족
2. 팀 > 2명 — 미충족 (1인 운영)
3. 다중 환경 필요 (dev/stg/prod) — 미충족
4. 외부 고객 B2B SaaS 전환 — 미충족

조건 충족 시 ADR-015 재검토 (v1.0 Post-release 게이트 REL-V10-3에서 재평가).

### 1.3 WSL2 특성 반영

- 네이티브 IO 성능 ~95% (컨테이너 대비 +25~35%)
- Cloudflare Tunnel `cloudflared` PM2 관리로 통합
- KT 회선 특성: TCP keepalive 강화 + HTTP/2 + 16MB 버퍼 (세션 25-C: sysctl 적용 후 28/28 edge 관통)
- systemd 활성화 (`/etc/wsl.conf` `[boot] systemd=true`) → Windows 재시작 시 자동 복구

---

## 2. 배포 전략 결정 매트릭스

### 2.1 배포 위험도 분류

| 카테고리 | 위험도 | 판단 기준 |
|---------|--------|---------|
| **극저** | Low | 문서/설정 파일 단독 변경, 마이그레이션 없음 |
| **저** | Low-Med | 기능 추가 (기존 라우트 미변경), 마이그레이션 없음 |
| **중** | Medium | 기존 라우트 수정, 마이그레이션 있음 (forward-only) |
| **고** | High | Auth/Vault/JWKS 변경, DB 스키마 변경, 보안 패치 |
| **극고** | Critical | PM2 설정 변경, Cloudflare Tunnel 설정 변경, cron-worker 로직 변경 |

### 2.2 위험도별 배포 전략 선택

| 위험도 | 전략 | 절차 | 비고 |
|--------|------|------|------|
| **Low** | 직접 배포 (Direct) | `scripts/deploy.sh` → 헬스체크 → 완료 | 카나리 불필요 |
| **Low-Med** | 직접 배포 + 확장 모니터링 | Direct + 30분 메트릭 감시 | 에러율 0.5% 초과 시 즉시 롤백 |
| **Medium** | 카나리 배포 (Canary) | canary 먼저 → 30분 → production | §4 카나리 절차 참조 |
| **High** | 카나리 + 단계적 분산 | 1%→5%→25%→100% 시간차 | 각 단계 30분 관찰 |
| **Critical** | 블루-그린 + 수동 승격 | canary 완전 검증 후 수동 승격 버튼 | Deployment UI 2FA 재확인 |

### 2.3 배포 유형별 전략 적용 예

| 배포 항목 | 위험도 | 적용 전략 |
|---------|--------|---------|
| UI 텍스트·스타일 변경 | Low | Direct |
| 새 API 라우트 추가 | Low-Med | Direct + 30분 |
| Auth TOTP 구현 (Phase 15) | High | Canary + 단계적 |
| JWKS 키 회전 (Phase 16) | Critical | 블루-그린 + 수동 승격 |
| Realtime wal2json 워커 (Phase 19) | High | Canary + 단계적 |
| SeaweedFS PM2 앱 추가 (Phase 17) | Critical | 블루-그린 + 수동 승격 |

---

## 3. Capistrano-style 디렉토리 구조

### 3.1 서버 디렉토리 레이아웃

```
/home/dev/luckystyle4u-server/
├── current/                    → symlink → releases/<latest>
│   └── (현재 서비스 중인 릴리스)
├── current-canary/             → symlink → releases/<canary>
│   └── (카나리 서비스 중인 릴리스, 미활성 시 없음)
│
├── releases/                   → 릴리스 이력 디렉토리
│   ├── 20260418T160000_66c1686/  ← 최신 (current 링크 대상)
│   │   ├── .next/              (Next.js 빌드 결과)
│   │   ├── src/
│   │   ├── prisma/
│   │   ├── scripts/
│   │   ├── package.json
│   │   └── .env.production     → symlink → shared/.env.production
│   ├── 20260418T140000_a3b2c1d/
│   ├── 20260418T120000_e4f5g6h/
│   ├── 20260417T200000_i7j8k9l/
│   └── 20260417T120000_m0n1o2p/  ← 가장 오래된 보관본
│       (최근 5개만 유지 — Operations Blueprint §3.2 keepReleases=5)
│
└── shared/                     → 릴리스 간 공유 자원
    ├── .env.production         (환경변수, 릴리스별 symlink 연결)
    ├── node_modules/           (빌드 캐시, 릴리스별 symlink 연결)
    ├── logs/                   (PM2 로그 아카이브)
    └── uploads/                (사용자 업로드 파일, Phase 17+)
```

### 3.2 releases symlink 패턴 상세

```bash
# RELEASE_ID 형식: YYYYMMDDTHHMMSS_7charSHA
# 예: 20260418T160000_66c1686

# 릴리스 디렉토리 생성
RELEASE_ID="20260418T160000_66c1686"
mkdir -p /home/dev/luckystyle4u-server/releases/${RELEASE_ID}

# rsync 배포 (빌드 제외 파일 복사)
rsync -a \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  ./ /home/dev/luckystyle4u-server/releases/${RELEASE_ID}/

# shared 디렉토리 symlink
ln -sfn /home/dev/luckystyle4u-server/shared/.env.production \
        /home/dev/luckystyle4u-server/releases/${RELEASE_ID}/.env.production
ln -sfn /home/dev/luckystyle4u-server/shared/node_modules \
        /home/dev/luckystyle4u-server/releases/${RELEASE_ID}/node_modules

# 빌드
cd /home/dev/luckystyle4u-server/releases/${RELEASE_ID}
npm run build

# 원자적 symlink 스왑 (POSIX 보장)
ln -sfn /home/dev/luckystyle4u-server/releases/${RELEASE_ID} \
        /home/dev/luckystyle4u-server/current
```

### 3.3 5 릴리스 보존 rotate

```bash
# 최근 5개 이후 삭제 (Operations Blueprint §3.2 pruneOldReleases)
KEEP=5
ls -t /home/dev/luckystyle4u-server/releases/ \
  | tail -n +$((KEEP+1)) \
  | while IFS= read -r rel; do
      rm -rf "/home/dev/luckystyle4u-server/releases/${rel}"
      echo "[PRUNE] 삭제: ${rel}"
    done
```

### 3.4 shared 관리 정책

| shared 항목 | 업데이트 시점 | 방법 |
|-----------|------------|------|
| `.env.production` | 환경변수 변경 시 | Vault에서 추출 후 수동 갱신 (운영자만) |
| `node_modules` | `package.json` 변경 배포 시 | 배포 스크립트 내 `npm ci` 후 shared 복사 |
| `logs/` | PM2 자동 관리 | `log_date_format: 'YYYY-MM-DD HH:mm:ss'` |
| `uploads/` | Phase 17 Storage 구현 후 | SeaweedFS 마운트 또는 로컬 FS |

---

## 4. 카나리 서브도메인 시간차 배포

### 4.1 카나리 토폴로지

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Edge                                         │
│                                                          │
│  stylelucky4u.com        → Tunnel(main)  → :3000        │
│  canary.stylelucky4u.com → Tunnel(canary) → :3002       │
└─────────────────────────────────────────────────────────┘
         ↕
┌─────────────────────────────────────────────────────────┐
│  WSL2 Ubuntu — PM2                                       │
│                                                          │
│  luckystyle4u-server  (cluster:4, port 3000)            │
│  luckystyle4u-canary  (fork:1,    port 3002)            │
│  cloudflared (메인 tunnel)                               │
│  cloudflared-canary   (canary tunnel, systemd unit)      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 카나리 메트릭 임계값 (자동 롤백 트리거)

| 메트릭 | 정상 기준 | 경고 임계 | 자동 롤백 트리거 |
|--------|---------|---------|--------------|
| 에러율 (5xx) | < 0.05% | 0.05~0.1% | **≥ 0.1%** |
| p95 응답 | < 300ms | 300~500ms | **≥ 500ms** |
| 530 에러 | 0건 | 1건/시 | **≥ 0.5% of requests** |
| 헬스체크 실패 | 0/5 | — | **≥ 3/5 연속** |

### 4.3 카나리 배포 절차

```
Step 0: 카나리 서버에 신 버전 배포
──────────────────────────────────────────
RELEASE_ID=$(date +%Y%m%dT%H%M%S)_$(git rev-parse --short HEAD)
bash scripts/deploy.sh --canary

→ luckystyle4u-canary (port 3002) 재시작
→ /api/health (port 3002) 5회 × 5초 헬스체크
→ 실패 시 카나리 자동 롤백 (symlink 역스왑)

Step 1: 운영자 수동 검증 (최소 10분)
──────────────────────────────────────────
브라우저에서 https://canary.stylelucky4u.com 직접 접근
핵심 기능 수동 테스트: 로그인 → 테이블 조회 → SQL 실행
이상 없으면 Step 2 진행

Step 2: 1% 트래픽 카나리 분기 (CANARY_WEIGHT=0.01)
──────────────────────────────────────────
POST /api/v1/deployments/canary-weight { "weight": 0.01 }
→ Cloudflare Workers CANARY_WEIGHT env 변경 (CanaryRouter.setCanaryWeight())
10분 관찰: 에러율 < 0.1%, p95 < 500ms

Step 3: 5% 트래픽 (CANARY_WEIGHT=0.05)
──────────────────────────────────────────
20분 관찰

Step 4: 25% 트래픽 (CANARY_WEIGHT=0.25)
──────────────────────────────────────────
30분 관찰 → 이상 없으면 Step 5

Step 5: 100% 승격 (Production 전환)
──────────────────────────────────────────
# Deployment UI 승격 버튼 클릭 (MFA 재확인 필요)
# 또는 수동:
bash scripts/canary-promote.sh
→ production symlink 스왑: ln -sfn <canary_release> current
→ pm2 reload luckystyle4u-server --update-env
→ CANARY_WEIGHT=0 복원
→ pm2 stop luckystyle4u-canary
```

### 4.4 자동 프로모션 / 자동 롤백 규칙

```typescript
// src/lib/deploy/canary-router.ts — CanaryRouter 자동화 규칙
// (Operations Blueprint §5.3 Cloudflare Workers API 연동 확장)

interface CanaryMetrics {
  errorRate: number       // 0.0 ~ 1.0
  p95ResponseMs: number   // 밀리초
  error530Rate: number    // 0.0 ~ 1.0
  healthCheckPassed: number  // 0 ~ 5
}

// 자동 롤백 트리거 조건
function shouldRollback(metrics: CanaryMetrics): boolean {
  return (
    metrics.errorRate >= 0.001       // 0.1% 이상
    || metrics.p95ResponseMs >= 500  // 500ms 이상
    || metrics.error530Rate >= 0.005 // 0.5% 이상
    || metrics.healthCheckPassed < 3 // 3회 미만 연속 성공
  )
}

// 자동 승격 조건 (30분 관찰 후)
function shouldPromote(metrics: CanaryMetrics, observedMinutes: number): boolean {
  return (
    observedMinutes >= 30
    && metrics.errorRate < 0.0005    // 0.05% 미만
    && metrics.p95ResponseMs < 300   // 300ms 미만
    && metrics.error530Rate === 0    // 530 0건
    && metrics.healthCheckPassed >= 5 // 모두 통과
  )
}
```

### 4.5 카나리 운영자 쿠키 패턴

```javascript
// cloudflare-workers/canary-router.js (Operations Blueprint §5.3)
// 운영자 쿠키 = 항상 canary 라우팅 (개발·검증 목적)
const cookie = request.headers.get('Cookie') || ''
if (cookie.includes('x-canary=1')) {
  // 운영자 항상 canary 서버로
  return fetch(new Request(CANARY_ORIGIN + url.pathname + url.search, request))
}
```

---

## 5. PM2 cluster:4 운영

### 5.1 PM2 ecosystem 핵심 설정

```javascript
// ecosystem.config.js (Operations Blueprint §4.3 전체 재인용)
module.exports = {
  apps: [
    {
      name: 'luckystyle4u-server',
      script: '/home/dev/luckystyle4u-server/current/.next/standalone/server.js',
      cwd: '/home/dev/luckystyle4u-server/current',
      instances: 4,
      exec_mode: 'cluster',
      env_file: '/etc/luckystyle4u/secrets.env',  // MASTER_KEY 주입 (ADR-013)
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',   // localhost만 바인딩 (NFR-SEC.5)
      },
      max_memory_restart: '1G',
      restart_delay: 1000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      kill_timeout: 3000,         // 3초: WebSocket graceful close (Operations Blueprint §10.3)
      wait_ready: true,           // ready 이벤트 대기 후 다음 워커 reload
      listen_timeout: 10000,      // 10초 내 listen 실패 시 크래시 처리
      log_file: '/var/log/pm2/luckystyle4u-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      name: 'luckystyle4u-canary',
      script: '/home/dev/luckystyle4u-server/current-canary/.next/standalone/server.js',
      cwd: '/home/dev/luckystyle4u-server/current-canary',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/etc/luckystyle4u/secrets.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOSTNAME: '127.0.0.1',
        IS_CANARY: 'true',
      },
      autorestart: false,         // 카나리는 수동 관리
    },
    {
      name: 'cron-worker',
      script: '/home/dev/luckystyle4u-server/current/dist/workers/cron-worker.js',
      instances: 1,
      exec_mode: 'fork',          // 중복 cron 방지 (ADR-005)
      env_file: '/etc/luckystyle4u/secrets.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '256M',
    },
  ],
}
```

### 5.2 graceful reload 절차

```bash
# 표준 graceful reload (다운타임 0초)
# wait_ready=true → PM2가 process.send('ready') 신호를 기다린 후 다음 워커 교체
pm2 reload luckystyle4u-server --update-env

# 확인: 워커 4개 모두 재시작 후 온라인
pm2 list | grep luckystyle4u-server

# reload 진행 로그 감시
pm2 logs luckystyle4u-server --lines 50
```

### 5.3 인스턴스 헬스체크 — /api/health 엔드포인트

```typescript
// src/app/api/health/route.ts
// 배포 후 HealthChecker.waitForHealthy() 가 5회 × 5초 폴링하는 대상
export async function GET() {
  const checks = {
    status: 'ok' as const,
    version: process.env.npm_package_version ?? 'unknown',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: await checkDatabase(),         // PostgreSQL ping
    realtime: await checkRealtime(),   // Phase 19 이후 활성
    storage: await checkStorage(),     // Phase 17 이후 활성
  }

  const allOk = checks.db === 'ok'
  return Response.json(checks, { status: allOk ? 200 : 503 })
}

async function checkDatabase(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'ok'
  } catch {
    return 'error'
  }
}

async function checkRealtime(): Promise<'ok' | 'disabled'> {
  // Phase 19 완료 전: 'disabled' 반환 (배포 게이트 차단 안 함)
  if (!process.env.REALTIME_ENABLED) return 'disabled'
  // Phase 19 이후: replication slot 상태 확인
  return 'ok'
}

async function checkStorage(): Promise<'ok' | 'disabled'> {
  if (!process.env.SEAWEEDFS_FILER_URL) return 'disabled'
  try {
    const res = await fetch(`${process.env.SEAWEEDFS_FILER_URL}/`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
```

### 5.4 Cloudflare Tunnel과 PM2 상호작용 (실전 교훈)

세션 25-B/C 운영 교훈 직접 인용:

> "pm2 restart cloudflared 후 30~40초간 Cloudflare edge propagation lag로 530 가능 — 이는 정상이며 대기 필요"
> — `docs/handover/260418-session25b-deploy-tunnel-tuning.md` 토픽 7

```bash
# cloudflared 재시작 시 표준 절차
pm2 restart cloudflared

# 반드시 30~40초 propagation 대기 후 안정성 검증
sleep 35

# edge 관통 기준 측정 (세션 25-C: 5xx/curl error만 실패로 처리)
bash scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 14 5
# Pass: 14/14 성공 (HTTP 2xx~4xx 모두 성공, 5xx만 실패)
```

**주의**: `pm2 restart dashboard` 는 cloudflared에 영향 없음. `pm2 reload luckystyle4u-server` 만으로 Next.js 워커 교체 완료. cloudflared 별도 재시작은 Tunnel 설정 변경 시에만 필요.

---

## 6. 5초 롤백 절차

### 6.1 symlink 스왑 명령어 (수동 롤백)

```bash
#!/bin/bash
# scripts/rollback.sh — 긴급 수동 롤백 스크립트
# 사용: bash scripts/rollback.sh [release_id]
# release_id 미지정 시 직전 릴리스로 자동 선택

set -euo pipefail

BASE_DIR="/home/dev/luckystyle4u-server"
RELEASES_DIR="${BASE_DIR}/releases"
TARGET_RELEASE="${1:-}"

# 직전 릴리스 자동 탐색
if [ -z "$TARGET_RELEASE" ]; then
  TARGET_RELEASE=$(ls -t "${RELEASES_DIR}" 2>/dev/null | sed -n '2p')
  if [ -z "$TARGET_RELEASE" ]; then
    echo "[ERROR] 롤백 대상 릴리스 없음"
    exit 1
  fi
fi

echo "[ROLLBACK] 대상: ${TARGET_RELEASE}"

# RELEASE_ID 안전성 검증
if ! echo "${TARGET_RELEASE}" | grep -qE '^[0-9T_a-z]+$'; then
  echo "[ERROR] 잘못된 release ID: ${TARGET_RELEASE}"
  exit 1
fi

TARGET_PATH="${RELEASES_DIR}/${TARGET_RELEASE}"
if [ ! -d "${TARGET_PATH}" ]; then
  echo "[ERROR] 릴리스 디렉토리 없음: ${TARGET_PATH}"
  exit 1
fi

START_TIME=$(date +%s%N)

# symlink 원자적 교체 (POSIX 보장)
ln -sfn "${TARGET_PATH}" "${BASE_DIR}/current"

# PM2 graceful reload
pm2 reload luckystyle4u-server --update-env

ELAPSED=$(( ($(date +%s%N) - START_TIME) / 1000000 ))
echo "[ROLLBACK] 완료 — ${ELAPSED}ms (대상: ${TARGET_RELEASE})"

# 헬스체크 (3회 × 5초)
for i in 1 2 3; do
  sleep 5
  STATUS=$(curl -sf "http://localhost:3000/api/health" \
    -o /dev/null -w "%{http_code}" || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "[ROLLBACK] 헬스체크 통과 (시도 ${i})"
    exit 0
  fi
  echo "[ROLLBACK] 헬스체크 대기 ${i}/3 (status: ${STATUS})"
done

echo "[ERROR] 롤백 후 헬스체크 실패 — 수동 점검 필요"
exit 1
```

### 6.2 롤백 트리거 자동화

```bash
# 배포 스크립트 내 자동 롤백 트리거 (scripts/deploy.sh §rollback 함수)
# 헬스체크 5회 × 5초 연속 실패 시 자동 발동

HEALTH_PORT=3000
MAX_ATTEMPTS=5
ATTEMPT=0

until [ $ATTEMPT -ge $MAX_ATTEMPTS ]; do
  STATUS=$(curl -sf "http://localhost:${HEALTH_PORT}/api/health" \
    -o /dev/null -w "%{http_code}" || echo "000")
  [ "$STATUS" = "200" ] && break
  ATTEMPT=$((ATTEMPT+1))
  echo "[DEPLOY] 헬스체크 실패 ${ATTEMPT}/${MAX_ATTEMPTS}"
  [ $ATTEMPT -lt $MAX_ATTEMPTS ] && sleep 5
done

if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
  # 자동 롤백 실행
  bash scripts/rollback.sh
  notify_slack "자동 롤백 완료: ${RELEASE_ID}" "warning"
  exit 1
fi
```

**에러율 임계 자동 롤백** (카나리 모니터링 데몬에서 실행):

```typescript
// src/lib/deploy/canary-monitor.ts — 카나리 자동 롤백
setInterval(async () => {
  const metrics = await getCanaryMetrics()  // Pino 로그 집계
  if (shouldRollback(metrics)) {
    await canaryRouter.setCanaryWeight(0)   // 트래픽 즉시 차단
    await pm2Manager.stop('luckystyle4u-canary')
    await sendSlackAlert({
      message: `카나리 자동 롤백: 에러율 ${(metrics.errorRate * 100).toFixed(2)}%`,
      color: 'danger',
    })
  }
}, 60_000)  // 1분 주기 감시
```

### 6.3 롤백 후 post-mortem 템플릿

롤백 발생 시 24시간 이내 `docs/solutions/YYYY-MM-DD-{사건명}.md` 작성:

```markdown
# 롤백 post-mortem: {사건명}

## 발생 정보
- **날짜**: YYYY-MM-DD HH:mm
- **릴리스 ID**: {롤백된 릴리스}
- **롤백 대상**: {복원된 릴리스}
- **소요 시간**: {롤백 완료까지 초}초
- **영향 범위**: {기능명 / 에러 메시지}

## 타임라인
| 시각 | 이벤트 |
|------|--------|
| HH:mm:ss | 배포 시작 |
| HH:mm:ss | 이상 징후 감지 (에러율 X%) |
| HH:mm:ss | 롤백 결정 |
| HH:mm:ss | symlink 스왑 완료 |
| HH:mm:ss | PM2 reload 완료 |
| HH:mm:ss | 헬스체크 PASS |

## 근본 원인
{분석 결과}

## 재발 방지 조치
1. {코드 수정 항목}
2. {게이트 추가 항목}
3. {모니터링 임계 조정}
```

---

## 7. 피처 플래그 정책

### 7.1 PG feature_flags 테이블 (Wave 4 Blueprint 인용)

```sql
-- Prisma 마이그레이션으로 생성
-- down.sql 필수 (DQ-1.21)
CREATE TABLE IF NOT EXISTS feature_flags (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  target_env  TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'canary' | 'production'
  owner       TEXT NOT NULL,                 -- 담당자 (1인 운영 → 'admin')
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,                   -- 90일 룰 (§7.3)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 초기 플래그 데이터 (Phase별 기능)
INSERT INTO feature_flags (name, enabled, description, owner, expires_at) VALUES
  ('mfa_totp',          false, 'TOTP MFA 활성화 (Phase 15)', 'admin', NOW() + INTERVAL '90 days'),
  ('mfa_webauthn',      false, 'WebAuthn MFA 활성화 (Phase 15)', 'admin', NOW() + INTERVAL '90 days'),
  ('realtime_changes',  false, 'Realtime Postgres Changes (Phase 19)', 'admin', NOW() + INTERVAL '90 days'),
  ('ai_assistant',      false, 'AI SQL 어시스턴트 (Phase 21)', 'admin', NOW() + INTERVAL '90 days'),
  ('edge_functions',    false, 'Edge Functions 실행 (Phase 22)', 'admin', NOW() + INTERVAL '90 days');
```

### 7.2 사용 시나리오

```typescript
// src/lib/feature-flags/index.ts
import { prisma } from '@/lib/db/prisma'

export async function isFeatureEnabled(flagName: string): Promise<boolean> {
  const flag = await prisma.featureFlags.findUnique({
    where: { name: flagName },
    select: { enabled: true, expiresAt: true },
  })
  if (!flag) return false
  if (flag.expiresAt && flag.expiresAt < new Date()) return false  // 만료 체크
  return flag.enabled
}

// 사용 예: Phase 15 MFA 활성화
// app/api/auth/mfa/route.ts
if (!await isFeatureEnabled('mfa_totp')) {
  return Response.json({ error: 'MFA 기능 준비 중' }, { status: 503 })
}
```

**배포 위험도별 플래그 적용 패턴**:

| 시나리오 | 플래그 | 전략 |
|---------|--------|------|
| MFA 활성화 (P0 기능) | `mfa_totp`, `mfa_webauthn` | 카나리 먼저 `target_env='canary'` → 검증 후 `'all'` |
| AI Assistant (P1) | `ai_assistant` | 직접 배포, `enabled=true` 토글로 점진 오픈 |
| Edge Functions (실험) | `edge_functions` | `target_env='canary'` 전용, 안정화 후 확장 |

### 7.3 플래그 cleanup 정책 (90일 룰)

```sql
-- 매월 1일 cron-worker에서 실행
-- 90일 이상 경과 + enabled=true 플래그 → 코드에서 제거 대상
SELECT name, created_at, expires_at, enabled
FROM feature_flags
WHERE expires_at < NOW()
   OR created_at < NOW() - INTERVAL '90 days';
```

운영 규칙:
- **90일 이내**: 실험적 기능 플래그 유지
- **90일 초과**: 코드베이스에서 `isFeatureEnabled()` 호출 제거 + 플래그 삭제 또는 영구 활성화
- **P0 기능 (MFA 등)**: 90일 후 하드코딩 전환 (플래그 의존 제거)

---

## 8. DB 마이그레이션 안전 절차

### 8.1 Prisma migrate deploy 사전 dry-run

```bash
# Phase 1: dry-run (WSL2 shadow DB에서 사전 검증)
# Shadow DB URL은 Vault에서 주입
SHADOW_DATABASE_URL="${SHADOW_DB_URL}" npx prisma migrate deploy --preview-feature

# 출력 예:
# 2 migrations found in prisma/migrations
# The following migration(s) are applied:
#   20260418_01_create_vault_secrets - already applied
#   20260418_02_create_jwks_keys     - to be applied

# Phase 2: 실제 적용 (배포 스크립트 내)
npx prisma migrate deploy

# Phase 3: 검증
npx prisma migrate status
# → All migrations applied
```

### 8.2 down.sql 필수화 규칙 (DQ-1.21 확정)

모든 마이그레이션에 `down.sql` 수동 작성 필수:

```
prisma/migrations/
├── 20260418_01_create_vault_secrets/
│   ├── migration.sql   ← Prisma 자동 생성 (up)
│   └── down.sql        ← 수동 작성 필수
├── 20260418_02_create_jwks_keys/
│   ├── migration.sql
│   └── down.sql
└── 20260418_03_create_deploy_events/
    ├── migration.sql
    └── down.sql
```

`down.sql` 작성 규칙:
- `DROP TABLE IF EXISTS` 형식 (안전한 멱등성)
- 외래키 의존 역순으로 삭제
- 프로덕션 수동 실행 전 백업 필수 주석 포함

```sql
-- 20260418_01_create_vault_secrets/down.sql
-- ⚠ 프로덕션 실행 전 pg_dump 백업 필수. 수동 실행만 허용 (DQ-OPS-2).
DROP TABLE IF EXISTS vault_secret_rotations;
DROP TABLE IF EXISTS vault_secrets;
```

### 8.3 마이그레이션 3단계 롤백 절차

마이그레이션 실패 시 자동 down.sql 실행 금지 (DQ-OPS-2 확정 — 데이터 손실 위험):

```bash
# 1단계: 실패 마이그레이션 확인
npx prisma migrate status

# 2단계: down.sql 수동 실행 (운영자 결정 후)
psql "${DATABASE_URL}" \
  -f prisma/migrations/20260418_01_create_vault_secrets/down.sql

# 3단계: Prisma 마이그레이션 이력 수동 제거
psql "${DATABASE_URL}" -c \
  "DELETE FROM _prisma_migrations
   WHERE migration_name = '20260418_01_create_vault_secrets'"

# 4단계: 코드 롤백 (symlink 스왑)
bash scripts/rollback.sh

# 5단계: Slack 알림 발송
# 포함 항목: 실패 마이그레이션명, 에러 메시지, 상태 및 수동 복구 절차 링크
```

### 8.4 Drizzle migrations (SQLite)

SQLite(metrics, deploy_events, metrics_history)는 Drizzle로 관리:

```bash
# 스키마 변경 후 마이그레이션 생성
npx drizzle-kit generate

# 적용
npx drizzle-kit migrate

# 검증
sqlite3 data/metrics.db ".tables"
```

Drizzle 롤백: SQLite는 단순 구조이므로 DB 파일 백업 복사 방식 사용:

```bash
# 배포 전 SQLite 백업 (deploy.sh 내 자동)
cp data/metrics.db data/metrics.db.backup.${RELEASE_ID}

# 롤백 시 복원
cp data/metrics.db.backup.${RELEASE_ID} data/metrics.db
```

### 8.5 /ypserver prod 사용 규칙

프로덕션 DB 마이그레이션은 반드시 `/ypserver prod` 스킬 경유:

```
# 안전한 프로덕션 적용 순서
1. /ypserver status          → 현재 마이그레이션 상태 확인
2. /ypserver prod --dry-run  → shadow DB 사전 검증
3. /ypserver prod            → 실제 적용 (헬스체크 포함)
```

---

## 9. Cloudflare Tunnel 530 운영 가이드

### 9.1 530 에러 증상 분류 및 1차 조치

세션 25-B/C 실전 교훈을 운영 SOP로 통합:

| 증상 | 원인 | 1차 조치 | 소요 시간 |
|------|------|---------|---------|
| 외부 530 + WSL2 내부 200 | Cloudflare edge ↔ connector 연결 단절 | `pm2 restart cloudflared` + 35초 대기 | 35~60초 |
| 외부 530 + WSL2 내부 503 | PM2 워커 크래시 또는 DB 연결 실패 | `pm2 restart luckystyle4u-server` 또는 DB 점검 | 10~30초 |
| 외부 530 지속 (pm2 restart 후 35초 이상) | cloudflared 데몬 오류 | `pm2 delete cloudflared && pm2 start ecosystem.config.js --only cloudflared` | 60~120초 |
| sysctl drift (tcp_keepalive_time ≠ 60) | WSL2 재기동 시 sysctl 미적용 | `sudo sysctl -p /etc/sysctl.d/99-cloudflared.conf` + `pm2 restart cloudflared` | 40~60초 |

### 9.2 회귀 감시 — tunnel-measure-v2.sh 기준

세션 25-C 교훈: "200 비율≠edge 관통 비율. 5xx/curl error만 실패로 처리"

```bash
#!/bin/bash
# scripts/tunnel-measure-v2.sh — edge 관통 기준 안정성 측정
# 사용: bash scripts/tunnel-measure-v2.sh [URL] [trials] [interval_s]
# 예: bash scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 14 5

URL="${1:-https://stylelucky4u.com/login}"
TRIALS="${2:-14}"
INTERVAL="${3:-5}"

ok=0; fail=0

for i in $(seq 1 "${TRIALS}"); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 --connect-timeout 5 "${URL}")
  
  # 성공: 2xx, 3xx, 4xx (edge→connector 도달 = Tunnel 정상)
  # 실패: 5xx, curl error (000 = connection failed)
  if echo "${HTTP_CODE}" | grep -qE '^[234]'; then
    ok=$((ok+1))
    echo "[${i}/${TRIALS}] OK (${HTTP_CODE})"
  else
    fail=$((fail+1))
    echo "[${i}/${TRIALS}] FAIL (${HTTP_CODE})"
  fi
  
  [ $i -lt "${TRIALS}" ] && sleep "${INTERVAL}"
done

RATIO=$(echo "scale=1; ${ok} * 100 / ${TRIALS}" | bc)
echo "─────────────────────────────"
echo "결과: ${ok}/${TRIALS} 성공 (${RATIO}%)"
echo "─────────────────────────────"

# Pass 기준: 14/14 이상
[ "$ok" -eq "$TRIALS" ] && exit 0 || exit 1
```

### 9.3 산발 530 cascading 대응 — Playwright + login 헬퍼

세션 25-C 교훈 직접 인용:

> "playwright.config.ts에 retries: 2 추가 → 1회 산발 530 흡수"
> "login() 헬퍼에 response.status() === 530 체크 + 백오프 재시도"

```typescript
// playwright.config.ts
export default defineConfig({
  retries: 2,          // 산발 530 흡수 (세션 25-C 교훈)
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'https://stylelucky4u.com',
  },
})

// tests/helpers/login.ts — 530 재시도 헬퍼
export async function loginWithRetry(
  page: Page,
  email: string,
  password: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await page.goto('/login')
    if (response?.status() === 530) {
      if (attempt < maxRetries) {
        console.warn(`[login] 530 발생 (시도 ${attempt}/${maxRetries}), ${attempt * 2}초 후 재시도`)
        await page.waitForTimeout(attempt * 2000)  // 지수 백오프
        continue
      }
      throw new Error('로그인 페이지 530 — Cloudflare Tunnel 불안정')
    }
    break
  }

  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('[type=submit]')
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 })
}
```

### 9.4 다중 인스턴스 cloudflared (재고 대상)

세션 25-C 교훈: "cloudflared 다중 인스턴스 — Playwright 530 발생 고려 시 재고 대상으로 승격"

현재 구성: 단일 cloudflared 인스턴스 (PM2 fork:1, 4 connector 등록)

재고 방향 (Phase 22 이후):

```yaml
# /etc/cloudflared/config-2.yml (2번째 cloudflared 인스턴스)
tunnel: <TUNNEL_ID_MAIN_2>     # 동일 tunnel ID의 2번째 credential
credentials-file: /etc/cloudflared/main-2.json
protocol: http2
ingress:
  - hostname: stylelucky4u.com
    service: http://localhost:3000
  - service: http_status:404
```

이점: 2개 cloudflared 인스턴스 round-robin → 단일 인스턴스 연결 drop 시 나머지가 흡수.
비용: PM2 추가 앱 (`cloudflared-2`) 메모리 ~50MB 추가.

---

## 10. 모니터링 + 알림 체인

### 10.1 알림 채널 구성

**PagerDuty 미도입** (1인 운영 + 비용 절감, NFR-COST.1 월 $10 목표).
**Slack webhook** 단일 채널 사용 (DB Ops Webhook 모델 재사용, Operations Blueprint §9.2):

```typescript
// src/lib/notifications/slack.ts
interface SlackAlert {
  message: string
  color: 'good' | 'warning' | 'danger'
  fields?: Array<{ title: string; value: string; short: boolean }>
}

export async function sendSlackAlert(alert: SlackAlert): Promise<void> {
  const webhookUrl = await getSecret('webhook.slack', 'deploy-notify')
  if (!webhookUrl) {
    console.warn('[Slack] 웹훅 URL 미설정 — 알림 스킵')
    return
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [{
        color: alert.color,
        text: alert.message,
        fields: alert.fields ?? [],
        footer: 'stylelucky4u.com | PM2 cluster:4',
        ts: Math.floor(Date.now() / 1000),
      }],
    }),
  })
}
```

### 10.2 알림 임계 정의

| 메트릭 | 임계값 | 알림 레벨 | 자동 대응 |
|--------|--------|---------|---------|
| CPU 사용률 | > **80%** 5분 지속 | Warning | Slack 경고 (자동 대응 없음) |
| 메모리 사용률 | > **80%** | Warning | Slack 경고 |
| 에러율 (5xx) | > **0.5%** 1분 | Critical | Slack + 자동 롤백 검토 |
| 530 비율 | > **1%** | Critical | Slack + `pm2 restart cloudflared` 권고 |
| PM2 재시작 횟수 | > 10회/앱 | Critical | Slack (NFR-REL.3: admin 알림 필수) |
| RPO 초과 | `pg_stat_archiver` 지연 > 60초 | Warning | Slack (NFR-REL.1) |
| Disk 사용률 | > 85% | Warning | Slack |

### 10.3 메트릭 수집 파이프라인

```
PM2 logs → Pino JSON → MetricsService (SQLite 5초 수집)
                     → metrics_history 테이블
                     → /dashboard/settings/infrastructure SSE 스트림
                     → Prometheus 호환 /api/metrics 엔드포인트
                     → Grafana (Phase 16 Observability MVP 이후)
```

### 10.4 Observability 대시보드 주요 패널

Phase 16 `Infrastructure 페이지 (/dashboard/settings/infrastructure)` 구성:

```
┌──────────────────────────────────────────────────────────────┐
│  Infrastructure 현황                    SSE 실시간 갱신         │
│──────────────────────────────────────────────────────────────│
│  PM2 프로세스                                                   │
│  luckystyle4u-server  cluster:4  ● online  CPU 12%  MEM 320MB │
│  cron-worker          fork:1     ● online  CPU 0%   MEM 48MB  │
│  cloudflared          fork:1     ● online  CPU 1%   MEM 92MB  │
│  luckystyle4u-canary  fork:1     ○ stopped                    │
│──────────────────────────────────────────────────────────────│
│  PostgreSQL                                                    │
│  연결 수: 8/100   pg_stat_archiver: 45초 전   버전: 17.2       │
│──────────────────────────────────────────────────────────────│
│  Cloudflare Tunnel                                             │
│  connector: 4/4 online  protocol: http2  위치: icn06/icn01    │
│  최근 측정: 14/14 성공 (09:45)   sysctl: keepalive=60✓        │
│──────────────────────────────────────────────────────────────│
│  디스크                                                         │
│  /home: 42% (84GB/200GB)   releases: 5개 (최근 보관)          │
└──────────────────────────────────────────────────────────────┘
```

### 10.5 알림 통합 흐름 (배포 생명주기)

```
배포 시작
  │
  ├─ Slack: "배포 시작: {RELEASE_ID} (branch: main)"
  │
  ├─ [성공 경로]
  │   ├─ Slack: "배포 성공: {RELEASE_ID} (소요: 42초)"
  │   └─ deploy_events STATUS='SUCCESS'
  │
  ├─ [헬스체크 실패 → 자동 롤백]
  │   ├─ Slack: "배포 실패 → 자동 롤백: {RELEASE_ID} (에러: ...)"
  │   └─ deploy_events STATUS='ROLLED_BACK'
  │
  └─ [마이그레이션 실패 → 배포 중단]
      ├─ Slack: "⚠ 마이그레이션 실패: {migration_name} — 수동 개입 필요"
      │        포함: 에러 메시지, prisma migrate status 출력
      │        포함: 수동 롤백 절차 링크 (DQ-OPS-2)
      └─ deploy_events STATUS='FAILED'
```

---

## 부록 Z. 근거 인덱스 · 변경 이력

### Z.1 인용 문서

| 문서 경로 | 인용 내용 |
|---------|---------|
| `02-architecture/05-operations-blueprint.md` | Capistrano 전략 §2, DeployOrchestrator §3.2, RollbackService §3.3, 배포 플로우 §4, canary 절차 §5.4, PM2 ecosystem §4.3, 데이터 모델 §6 |
| `04-integration/02-cloudflare-deployment-integration.md` | 배포 토폴로지 §1, Tunnel 설정 §2, 530 대응 §11, 배포 파이프라인 §6, canary §8 |
| `00-vision/03-non-functional-requirements.md` | NFR-REL.1/2/3/4/5, NFR-SEC.5, NFR-PERF.5, NFR-COST.1 |
| `02-architecture/01-adr-log.md` | ADR-005(cron-worker), ADR-013(Vault), ADR-015(Capistrano+PM2+canary) |
| `docs/handover/260418-session25b-deploy-tunnel-tuning.md` | 530 진단: QUIC→HTTP/2 30%→50%, cloudflared 재시작 30~40초 propagation |
| `docs/handover/260418-session25c-tunnel-complete-playwright.md` | sysctl 100% 달성, "200≠edge 관통", Playwright retries:2, 다중 인스턴스 재고 |
| `docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` | 운영 SOP: pm2 restart + v2 스크립트 + sysctl 영속화 |

### Z.2 실전 교훈 요약 (세션 25-B/C → 운영 가이드 반영)

| 교훈 | 출처 | 반영 섹션 |
|------|------|---------|
| `pm2 restart cloudflared` 후 35초 대기 필수 | 25-B 토픽 7 | §5.4, §9.1 |
| "200 비율"≠"edge 관통" — 5xx/curl error만 실패 | 25-C 토픽 4 | §9.2 |
| `/login` 공개 라우트가 측정에 적합 | 25-C 토픽 4 | §9.2 |
| Playwright retries:2 + login 헬퍼 530 재시도 | 25-C 토픽 5 | §9.3 |
| 다중 cloudflared 인스턴스 재고 대상 승격 | 25-C 토픽 5 후속 | §9.4 |
| sysctl keepalive=60 + 16MB 버퍼 영속 적용 | 25-C 토픽 3 | §5.4 배경 |
| KT 회선 drop: TCP keepalive 강화로 흡수, 완전 소실 아님 | 25-C §근본 원인 | §9.1, §9.2 |

### Z.3 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent R3 (Wave 5) | 최초 작성 — 배포 전략 매트릭스 + Capistrano 구조 + canary 절차 + PM2 운영 + 롤백 + 피처 플래그 + DB 마이그레이션 + Tunnel 530 가이드 + 모니터링 |

---

> **롤아웃 전략 끝.** Wave 5 · R3 · 2026-04-18 · Capistrano-style + PM2 cluster:4 + canary.stylelucky4u.com 통합 전략 · 세션 25-B/C 실전 교훈 7건 반영 · Cloudflare Tunnel 530 SOP 포함
