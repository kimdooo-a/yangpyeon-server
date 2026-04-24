# 05. Operations Blueprint — 양평 부엌 서버 대시보드 (카테고리 14)

> Wave 4 · Tier 2 · B2 에이전트 산출물
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md)
> 상위 ADR: ADR-015 (Capistrano-style + PM2 cluster:4 + canary 서브도메인) — ⚠️ **2026-04-19 세션 50에서 ADR-020 신설로 *Capistrano-style symlink/releases 부분 대체(Superseded)*. 본 문서의 Capistrano 디렉토리/배포 파이프라인 §은 트리거 충족 시 재가동되는 유보 자산. 현 활성 배포 경로는 [01-adr-log.md ADR-020](./01-adr-log.md) (standalone + rsync + pm2 reload).** PM2 cluster:4 / canary 서브도메인 부분은 그대로 유효.

---

## 0. 문서 구조

```
§1.  요약 — 현황·목표·핵심 결정
§2.  Wave 1-2 채택안 인용 — Capistrano vs Docker Compose / Docker 이행 조건 0개
§3.  컴포넌트 설계 — DeployOrchestrator / CanaryRouter / HealthChecker / RollbackService / PM2Manager
§4.  배포 플로우 상세 — Windows build → rsync → migrate → PM2 reload → symlink → 검증 → 롤백
§5.  canary.stylelucky4u.com 라우팅 — Cloudflare Worker/Rule + 시간차 분산
§6.  데이터 모델 — deploy_events (신규) + backups 통합
§7.  UI 설계 — Deployment 페이지 · 롤백 버튼
§8.  /ypserver 스킬 정합성 — 5 갭 해소 인용
§9.  통합 — 전 카테고리 배포 안전망
§10. 리스크 및 완화 — symlink 레이스 / Canary 측정 지연 / PM2 WebSocket 끊김
§11. Wave 4 할당 DQ 답변 — DQ-1.21 · DQ-OPS-2 · DQ-14.* 항목
§12. Phase 16 WBS — Operations 파트 (~20h)
부록 Z. 근거 인덱스 · 변경 이력
```

---

## 1. 요약

### 1.1 현황

| 항목 | 현재 상태 | 목표 상태 |
|------|----------|----------|
| 카테고리 | 14 (Operations) | 동일 |
| 점수 | 80점 | **95점** (Phase 16 MVP) |
| 배포 방식 | 수동 SSH + git pull + pm2 restart (~15분, 다운타임 ~10초) | Capistrano-style 자동화 (0초 다운타임) |
| 롤백 | git revert + 재빌드 (~15분) | symlink swap (~5초) |
| Canary | 없음 | canary.stylelucky4u.com 시간차 배포 |
| 마이그레이션 롤백 | 없음 | up.sql + down.sql 쌍 + 트랜잭션 |
| 배포 이력 UI | 없음 | Deployment 페이지 + 롤백 버튼 |
| 구현 공수 | — | ~20h (Phase 16) |

### 1.2 핵심 결정 (ADR-015 요약)

Phase 16에서 Operations 카테고리를 80→95점으로 끌어올리는 핵심은 **Capistrano-style symlink 배포 자동화**와 **canary.stylelucky4u.com 시간차 배포**이다. Docker Compose 이행 조건 4개(월 트래픽 100만+, 팀 2명+, 3단계 환경 필요, B2B 전환)가 현재 모두 충족되지 않으므로 네이티브 PM2 cluster:4 + bash/Node 배포 스크립트를 유지한다.

### 1.3 Phase 16 MVP 범위

1. DeployOrchestrator — 전체 배포 파이프라인 오케스트레이션
2. CanaryRouter — Cloudflare Worker + PM2 canary 앱
3. HealthChecker — 배포 후 검증 (헬스 엔드포인트 5회 × 5초)
4. RollbackService — symlink 스왑 역방향 (~5초)
5. PM2Manager — 워커 상태 조회/재시작 API
6. Deployment 페이지 (`/dashboard/settings/deployments`) — 배포 이력 + 롤백 버튼
7. GitHub Actions self-hosted runner 설정 (WSL2 내부)
8. `deploy_events` 테이블 + 감사 로그 통합

---

## 2. Wave 1-2 채택안 인용

### 2.1 Capistrano-style 결정 경과 (Wave 1 Deep-Dive 14/01)

Wave 1에서 현재 수동 배포 체계의 갭을 분석했다.

**현재 갭**:
- 배포 시 다운타임 ~10초 (`pm2 restart` 방식, graceful reload 미사용)
- 롤백 시 git revert + 재빌드 = ~15분
- 카나리 없음 → 전체 트래픽에 즉시 배포
- 헬스체크 수동 (운영자가 curl 직접 실행)

**Capistrano-style 채택 결정 근거 3가지**:

1. **symlink 스왑 롤백 ~5초**: `ln -sfn releases/<prev>/ current && pm2 reload --update-env`. Docker 이미지 rollback ~30~60초보다 6배 빠름.
2. **PM2 cluster:4 + graceful reload = 다운타임 0초**: `pm2 reload` 명령은 각 워커를 순차 재시작(1개 죽이고 → 신규 프로세스 ready 후 → 다음 종료). cluster:4 환경에서 항상 3개 이상 워커가 서비스 중.
3. **WSL2 환경 최적**: 컨테이너 오버레이 파일시스템 IO (~60~70% 성능) 대비 네이티브 IO (~95%). Cloudflare Tunnel 설정 재구성 불필요.

참고 문서: `01-research/14-operations/01-github-actions-pm2-rollback-deep-dive.md` (540+ 줄, 권고도 0.87)

### 2.2 Docker Compose 거부 및 이행 조건 0개 충족 (Wave 2 비교 14/03)

Wave 2에서 자체 Capistrano-style(89.0점, 권고도 0.87)과 Docker Compose(75.2점, 권고도 0.62)를 10차원으로 비교했다.

**Docker Compose 거부 근거**:

| 차원 | 자체 Capistrano+PM2 | Docker Compose | 차이 |
|------|-------------------|----------------|------|
| 배포 속도/다운타임 | **10/10** | 7/10 | +3 |
| 학습 곡선 (1인) | **12/14** | 9/14 | +3 |
| Cloudflare Tunnel 통합 | **10/10** | 7/10 | +3 |
| 운영 부담 | **9/10** | 7/10 | +2 |

**Docker 이행 조건 4개** (ADR-015에 등록):
1. 월간 트래픽 > 100만 요청 (ASM-9 EWI)
2. 팀 > 2명 (CON-3 변경)
3. 다중 환경 필요 (dev/stg/prod 3단계)
4. 외부 고객에게 서비스 제공 (B2B SaaS 전환)

**현재 충족 조건**: 0개. 따라서 Capistrano-style 유지.

참고 문서: `01-research/14-operations/03-capistrano-vs-docker-compose.md`
참고 문서: `01-research/14-operations/02-operations-matrix.md` (권고도 0.87)

---

## 3. 컴포넌트 설계

### 3.1 전체 컴포넌트 구조

```
src/lib/deploy/
├── orchestrator.ts      ← DeployOrchestrator — 전체 파이프라인 조율
├── canary-router.ts     ← CanaryRouter — Cloudflare API 호출 + 트래픽 조정
├── health-checker.ts    ← HealthChecker — 배포 후 헬스 검증
├── rollback.ts          ← RollbackService — symlink 역스왑 + PM2 reload
├── pm2-manager.ts       ← PM2Manager — 프로세스 상태 조회/관리
└── repository.ts        ← deploy_events CRUD

scripts/
├── deploy.sh            ← 메인 배포 쉘 스크립트 (GHA에서 호출)
├── rollback.sh          ← 긴급 수동 롤백 스크립트
├── health-check.sh      ← 독립 헬스체크 스크립트
└── canary-promote.sh    ← canary → production 승격 스크립트
```

### 3.2 DeployOrchestrator — 상세 설계

```typescript
// src/lib/deploy/orchestrator.ts
import { rollbackService } from './rollback'
import { healthChecker } from './health-checker'
import { pm2Manager } from './pm2-manager'
import { deployRepository } from './repository'
import { logger } from '@/lib/logging/logger'
import { execFileNoThrow } from '@/utils/execFileNoThrow'

export interface DeployConfig {
  releaseId: string          // "20260418T160000_66c1686" 형식
  gitSha: string             // 7자 short SHA
  branch: string             // 배포 브랜치
  triggeredBy: string        // GitHub Actions run_id 또는 사용자 ID
  isCanary: boolean          // true = canary 앱에만 배포
}

export interface DeployResult {
  success: boolean
  releaseId: string
  durationMs: number
  rolledBack: boolean
  healthCheckPassed: boolean
  errorMessage?: string
}

export class DeployOrchestrator {
  private readonly basePath = '/home/dev/luckystyle4u-server'
  private readonly keepReleases = 5   // 최근 5개 release 보관

  async deploy(config: DeployConfig): Promise<DeployResult> {
    const startTime = Date.now()
    const prevReleasePath = await this.getCurrentReleasePath()
    const newReleasePath = `${this.basePath}/releases/${config.releaseId}`

    const deployEventId = await deployRepository.create({
      releaseId: config.releaseId,
      gitSha: config.gitSha,
      branch: config.branch,
      triggeredBy: config.triggeredBy,
      isCanary: config.isCanary,
      status: 'IN_PROGRESS',
    })

    try {
      logger.info({ config, event: 'deploy_start' }, '배포 시작')

      await this.swapSymlink(newReleasePath, config.isCanary)

      const appName = config.isCanary ? 'luckystyle4u-canary' : 'luckystyle4u-server'
      await pm2Manager.reload(appName)

      const healthResult = await healthChecker.waitForHealthy({
        appName,
        maxAttempts: 5,
        intervalMs: 5000,
        isCanary: config.isCanary,
      })

      if (!healthResult.healthy) {
        throw new Error(`헬스체크 실패: ${healthResult.reason}`)
      }

      await this.pruneOldReleases()

      const duration = Date.now() - startTime
      await deployRepository.update(deployEventId, { status: 'SUCCESS', durationMs: duration })
      logger.info({ config, durationMs: duration, event: 'deploy_success' }, '배포 성공')

      return {
        success: true,
        releaseId: config.releaseId,
        durationMs: duration,
        rolledBack: false,
        healthCheckPassed: true,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error({ config, error: errorMessage, event: 'deploy_failed' }, '배포 실패 → 롤백 시작')

      if (prevReleasePath) {
        await rollbackService.rollback({
          targetReleasePath: prevReleasePath,
          isCanary: config.isCanary,
          reason: `자동 롤백: ${errorMessage}`,
        })
        await deployRepository.update(deployEventId, {
          status: 'ROLLED_BACK',
          durationMs: Date.now() - startTime,
          errorMessage,
        })
        return {
          success: false,
          releaseId: config.releaseId,
          durationMs: Date.now() - startTime,
          rolledBack: true,
          healthCheckPassed: false,
          errorMessage,
        }
      }

      await deployRepository.update(deployEventId, { status: 'FAILED', errorMessage })
      throw error
    }
  }

  // 주의: ln -sfn은 shell feature이므로 execFileNoThrow 사용 불가.
  // 이 맥락(배포 스크립트)에서 newReleasePath는 내부에서 생성된 신뢰 가능한 경로.
  // 사용자 입력이 경로에 포함되지 않도록 releaseId를 /^[0-9T_a-z]+$/ 패턴으로 검증한다.
  private async swapSymlink(newReleasePath: string, isCanary: boolean): Promise<void> {
    const symlinkPath = isCanary
      ? `${this.basePath}/current-canary`
      : `${this.basePath}/current`
    // execFileNoThrow 사용: src/utils/execFileNoThrow.ts 기반
    const result = await execFileNoThrow('ln', ['-sfn', newReleasePath, symlinkPath])
    if (result.status !== 0) {
      throw new Error(`symlink 교체 실패: ${result.stderr}`)
    }
  }

  private async getCurrentReleasePath(): Promise<string | null> {
    const result = await execFileNoThrow('readlink', ['-f', `${this.basePath}/current`])
    return result.status === 0 ? result.stdout.trim() : null
  }

  private async pruneOldReleases(): Promise<void> {
    // ls -t 는 execFileNoThrow + Node fs 조합으로 구현
    const { readdir, rm } = await import('node:fs/promises')
    const { stat } = await import('node:fs/promises')
    const releasesDir = `${this.basePath}/releases`
    const entries = await readdir(releasesDir)
    const withMtime = await Promise.all(
      entries.map(async (e) => {
        const s = await stat(`${releasesDir}/${e}`)
        return { name: e, mtime: s.mtimeMs }
      })
    )
    withMtime.sort((a, b) => b.mtime - a.mtime)
    const toDelete = withMtime.slice(this.keepReleases)
    for (const entry of toDelete) {
      await rm(`${releasesDir}/${entry.name}`, { recursive: true, force: true })
    }
  }
}

export const deployOrchestrator = new DeployOrchestrator()
```

### 3.3 RollbackService — 상세 설계

```typescript
// src/lib/deploy/rollback.ts
import { pm2Manager } from './pm2-manager'
import { logger } from '@/lib/logging/logger'
import { execFileNoThrow } from '@/utils/execFileNoThrow'

export interface RollbackOptions {
  targetReleasePath: string
  isCanary: boolean
  reason: string
  performedBy?: string
}

export class RollbackService {
  private readonly basePath = '/home/dev/luckystyle4u-server'

  async rollback(options: RollbackOptions): Promise<void> {
    const startTime = Date.now()
    const target = options.targetReleasePath ?? await this.getPrevRelease()
    if (!target) throw new Error('롤백 대상 release를 찾을 수 없음')

    const symlinkPath = options.isCanary
      ? `${this.basePath}/current-canary`
      : `${this.basePath}/current`

    // symlink 교체 (execFileNoThrow 사용 — 명령 인젝션 방지)
    const result = await execFileNoThrow('ln', ['-sfn', target, symlinkPath])
    if (result.status !== 0) {
      throw new Error(`롤백 symlink 실패: ${result.stderr}`)
    }

    const appName = options.isCanary ? 'luckystyle4u-canary' : 'luckystyle4u-server'
    await pm2Manager.reload(appName)

    const elapsed = Date.now() - startTime
    logger.warn(
      { target, reason: options.reason, durationMs: elapsed, event: 'rollback_complete' },
      `롤백 완료 (${elapsed}ms)`
    )
  }

  private async getPrevRelease(): Promise<string | null> {
    const { readdir, stat } = await import('node:fs/promises')
    const releasesDir = `${this.basePath}/releases`
    const entries = await readdir(releasesDir)
    const withMtime = await Promise.all(
      entries.map(async (e) => {
        const s = await stat(`${releasesDir}/${e}`)
        return { name: e, mtime: s.mtimeMs }
      })
    )
    withMtime.sort((a, b) => b.mtime - a.mtime)
    return withMtime[1] ? `${releasesDir}/${withMtime[1].name}` : null
  }
}

export const rollbackService = new RollbackService()
```

### 3.4 HealthChecker — 배포 후 검증

```typescript
// src/lib/deploy/health-checker.ts
import { logger } from '@/lib/logging/logger'

interface HealthCheckOptions {
  appName: string
  maxAttempts: number
  intervalMs: number
  isCanary: boolean
}

interface HealthCheckResult {
  healthy: boolean
  reason?: string
  attempts: number
  durationMs: number
}

export class HealthChecker {
  async waitForHealthy(options: HealthCheckOptions): Promise<HealthCheckResult> {
    const baseUrl = options.isCanary
      ? 'http://localhost:3002'
      : 'http://localhost:3000'
    const healthUrl = `${baseUrl}/api/health`
    const startTime = Date.now()

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        const response = await fetch(healthUrl, {
          signal: AbortSignal.timeout(3000),
        })
        if (response.ok) {
          const body = await response.json() as { status: string; version: string }
          if (body.status === 'ok') {
            logger.info({ attempt, url: healthUrl, event: 'health_ok' }, '헬스체크 통과')
            return { healthy: true, attempts: attempt, durationMs: Date.now() - startTime }
          }
        }
        logger.warn({ attempt, statusCode: response.status, event: 'health_not_ok' }, '헬스체크 비정상')
      } catch (err) {
        logger.warn({ attempt, error: String(err), event: 'health_error' }, '헬스체크 오류')
      }

      if (attempt < options.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, options.intervalMs))
      }
    }

    return {
      healthy: false,
      reason: `${options.maxAttempts}회 시도 후 헬스체크 실패`,
      attempts: options.maxAttempts,
      durationMs: Date.now() - startTime,
    }
  }
}

export const healthChecker = new HealthChecker()
```

### 3.5 PM2Manager — 프로세스 관리

```typescript
// src/lib/deploy/pm2-manager.ts
import pm2 from 'pm2'
import { promisify } from 'node:util'

const pm2Connect = promisify(pm2.connect.bind(pm2))
const pm2Disconnect = promisify(pm2.disconnect.bind(pm2))
const pm2Reload = promisify(pm2.reload.bind(pm2))
const pm2List = promisify(pm2.list.bind(pm2))

export class PM2Manager {
  async reload(appName: string): Promise<void> {
    await pm2Connect()
    try {
      await pm2Reload(appName)
    } finally {
      await pm2Disconnect()
    }
  }

  async getProcessList(): Promise<pm2.ProcessDescription[]> {
    await pm2Connect()
    try {
      return await pm2List()
    } finally {
      await pm2Disconnect()
    }
  }
}

export const pm2Manager = new PM2Manager()
```

---

## 4. 배포 플로우 상세

### 4.1 전체 배포 파이프라인 다이어그램

```
Windows 개발 환경                   WSL2 Ubuntu (서버)
─────────────────                   ───────────────────────────────────────────
git push → main                     GitHub Actions self-hosted runner (WSL2)
           │                                     │
           ▼                                     │
GitHub.com (Actions trigger)                     │
           │                                     │
           ▼                                     │
[GHA Cloud Job]                                  │
  - npm ci                                       │
  - npx tsc --noEmit                             │
  - npm run lint                                 │
  - npx vitest run                               │
  - 실패 시 중단                                  │
           │ 성공                                 │
           ▼                                     │
[GHA self-hosted runner (WSL2)]  ←──────────────┘
  1. RELEASE_ID 생성
     RELEASE_ID=$(date +%Y%m%dT%H%M%S)_$(git rev-parse --short HEAD)
     예: 20260418T160000_66c1686

  2. release 디렉토리 생성 + rsync
     mkdir -p /home/dev/luckystyle4u-server/releases/${RELEASE_ID}
     rsync -a --exclude='.git' --exclude='node_modules'
       ./ /home/dev/luckystyle4u-server/releases/${RELEASE_ID}/

  3. shared 디렉토리 심볼릭 링크 연결
     ln -sfn /home/dev/luckystyle4u-server/shared/.env.production
       /home/dev/luckystyle4u-server/releases/${RELEASE_ID}/.env.production

  4. Prisma migrate deploy (forward-only, 실패 시 중단)
     cd /home/dev/luckystyle4u-server/releases/${RELEASE_ID}
     npx prisma migrate deploy

  5. npm run build (.next 생성)

  6. symlink 스왑 (원자적 ln -sfn)
     ln -sfn /home/dev/luckystyle4u-server/releases/${RELEASE_ID}
       /home/dev/luckystyle4u-server/current

  7. PM2 graceful reload (cluster:4, 다운타임 0초)
     pm2 reload luckystyle4u-server --update-env

  8. 헬스체크 (5회 × 5초)
     curl http://localhost:3000/api/health → 200 & status:ok 확인
     5회 모두 실패 → 자동 롤백 실행

  9. 성공: deploy_events 업데이트 + Slack 성공 알림
     실패: RollbackService 호출 → symlink 역스왑 + PM2 reload

 10. 오래된 release 정리 (최근 5개 유지)
```

### 4.2 배포 쉘 스크립트 (`scripts/deploy.sh`)

```bash
#!/bin/bash
# scripts/deploy.sh — Capistrano-style 배포 스크립트
# 사용: ./scripts/deploy.sh [--canary]
# 환경변수: RELEASE_ID (GHA에서 주입)

set -euo pipefail

BASE_DIR="/home/dev/luckystyle4u-server"
SHARED_DIR="${BASE_DIR}/shared"
RELEASES_DIR="${BASE_DIR}/releases"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%dT%H%M%S)_manual}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
KEEP_RELEASES=5
IS_CANARY="${1:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

notify_slack() {
  local message="$1"
  local color="$2"
  if [ -n "$SLACK_WEBHOOK" ]; then
    # curl은 인수 배열로 안전하게 전달
    curl -s -X POST "$SLACK_WEBHOOK" \
      -H 'Content-type: application/json' \
      --data "{\"attachments\":[{\"color\":\"${color}\",\"text\":\"${message}\"}]}"
  fi
  echo "[SLACK] ${message}"
}

rollback() {
  # ls -t + sed로 직전 release 탐색 (사용자 입력 없음, 안전)
  local prev_release
  prev_release=$(ls -t "${RELEASES_DIR}" 2>/dev/null | sed -n '2p')
  if [ -z "$prev_release" ]; then
    notify_slack "배포 실패 + 롤백 불가: ${RELEASE_ID}" "danger"
    exit 1
  fi
  echo "[ROLLBACK] ${prev_release}으로 롤백 시작"
  if [ -n "$IS_CANARY" ]; then
    # ln -sfn: 배포 스크립트 내부 경로만 사용, 사용자 입력 없음
    ln -sfn "${RELEASES_DIR}/${prev_release}" "${BASE_DIR}/current-canary"
    pm2 reload luckystyle4u-canary --update-env
  else
    ln -sfn "${RELEASES_DIR}/${prev_release}" "${BASE_DIR}/current"
    pm2 reload luckystyle4u-server --update-env
  fi
  notify_slack "롤백 완료: ${prev_release} (실패: ${RELEASE_ID})" "warning"
  exit 1
}

trap rollback ERR

echo "[DEPLOY] 시작: ${RELEASE_ID}"

# 1. RELEASE_ID 안전성 검증 (영숫자 + T _ 만 허용)
if ! echo "${RELEASE_ID}" | grep -qE '^[0-9T_a-z]+$'; then
  echo "[ERROR] 잘못된 RELEASE_ID: ${RELEASE_ID}"
  exit 1
fi

# 2. release 디렉토리 생성
mkdir -p "${RELEASE_DIR}"

# 3. rsync
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  ./ "${RELEASE_DIR}/"

# 4. shared 링크
ln -sfn "${SHARED_DIR}/.env.production" "${RELEASE_DIR}/.env.production"
ln -sfn "${SHARED_DIR}/node_modules" "${RELEASE_DIR}/node_modules"

# 5. 마이그레이션
echo "[DEPLOY] Prisma 마이그레이션"
cd "${RELEASE_DIR}"
npx prisma migrate deploy

# 6. 빌드
echo "[DEPLOY] Next.js 빌드"
npm run build

# 7. symlink 스왑
echo "[DEPLOY] symlink 스왑"
if [ -n "$IS_CANARY" ]; then
  ln -sfn "${RELEASE_DIR}" "${BASE_DIR}/current-canary"
  PM2_APP="luckystyle4u-canary"
else
  ln -sfn "${RELEASE_DIR}" "${BASE_DIR}/current"
  PM2_APP="luckystyle4u-server"
fi

# 8. PM2 graceful reload
pm2 reload "$PM2_APP" --update-env

# 9. 헬스체크
HEALTH_PORT=3000
[ -n "$IS_CANARY" ] && HEALTH_PORT=3002
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
[ $ATTEMPT -ge $MAX_ATTEMPTS ] && rollback

# 10. 정리 (최근 KEEP_RELEASES 개 유지)
ls -t "${RELEASES_DIR}" | tail -n +$((KEEP_RELEASES+1)) | \
  while IFS= read -r rel; do rm -rf "${RELEASES_DIR}/${rel}"; done

notify_slack "배포 성공: ${RELEASE_ID}" "good"
echo "[DEPLOY] 완료: ${RELEASE_ID}"
```

### 4.3 PM2 ecosystem.config.js 예시

```javascript
// ecosystem.config.js — PM2 설정 (실제 키 없음, env_file 경유)
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
        HOSTNAME: '127.0.0.1',  // localhost만 바인딩 (NFR-SEC.5)
      },
      max_memory_restart: '1G',
      restart_delay: 1000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      log_file: '/var/log/pm2/luckystyle4u-combined.log',
      out_file: '/var/log/pm2/luckystyle4u-out.log',
      error_file: '/var/log/pm2/luckystyle4u-error.log',
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
      autorestart: false,
    },
    {
      name: 'cron-worker',
      script: '/home/dev/luckystyle4u-server/current/dist/workers/cron-worker.js',
      cwd: '/home/dev/luckystyle4u-server/current',
      instances: 1,
      exec_mode: 'fork',  // cron 중복 방지 (ADR-005)
      env_file: '/etc/luckystyle4u/secrets.env',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '256M',
    },
  ],
}
```

---

## 5. canary.stylelucky4u.com 라우팅

### 5.1 전체 canary 배포 전략

canary 배포는 단계적 트래픽 분산 방식을 사용한다. Cloudflare Tunnel은 기본적으로 단일 origin을 지원하지만, **복수 cloudflared 프로세스 + Cloudflare Workers 기반 라우팅**으로 우회한다.

```
┌──────────────────────────────────────────────────────────────┐
│  사용자 요청                                                   │
│    ↓                                                          │
│  Cloudflare Edge (DNS)                                       │
│    │                                                          │
│    ├── stylelucky4u.com       → Tunnel 1 → localhost:3000   │
│    │   (Production, PM2 cluster:4)                            │
│    │                                                          │
│    └── canary.stylelucky4u.com → Tunnel 2 → localhost:3002  │
│        (Canary, PM2 fork:1)                                   │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Cloudflare Tunnel 복수 설정

```yaml
# /etc/cloudflared/config.yml (메인)
tunnel: <TUNNEL_ID_MAIN>
credentials-file: /etc/cloudflared/main.json
ingress:
  - hostname: stylelucky4u.com
    service: http://localhost:3000
  - service: http_status:404

# /etc/cloudflared/canary-config.yml
tunnel: <TUNNEL_ID_CANARY>
credentials-file: /etc/cloudflared/canary.json
ingress:
  - hostname: canary.stylelucky4u.com
    service: http://localhost:3002
  - service: http_status:404
```

canary cloudflared 서비스:

```ini
# /etc/systemd/system/cloudflared-canary.service
[Unit]
Description=Cloudflare Tunnel (canary)
After=network.target

[Service]
ExecStart=/usr/local/bin/cloudflared tunnel --config /etc/cloudflared/canary-config.yml run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 5.3 Cloudflare Workers 기반 트래픽 비율 라우팅

```javascript
// cloudflare-workers/canary-router.js
// Cloudflare Dashboard → Workers → 배포
// Phase 16 선택 구현 (고급 단계적 분산)

const CANARY_ORIGIN = 'https://canary.stylelucky4u.com'
const PROD_ORIGIN = 'https://stylelucky4u.com'

export default {
  async fetch(request, env) {
    const canaryWeight = parseFloat(env.CANARY_WEIGHT ?? '0')

    // 운영자 쿠키 = 항상 canary
    const cookie = request.headers.get('Cookie') || ''
    if (cookie.includes('x-canary=1')) {
      const url = new URL(request.url)
      return fetch(new Request(CANARY_ORIGIN + url.pathname + url.search, request))
    }

    // 확률적 라우팅
    if (canaryWeight > 0 && Math.random() < canaryWeight) {
      const url = new URL(request.url)
      const response = await fetch(
        new Request(CANARY_ORIGIN + url.pathname + url.search, request)
      )
      const newResponse = new Response(response.body, response)
      newResponse.headers.append(
        'Set-Cookie',
        'x-canary=1; Max-Age=3600; SameSite=Lax; Secure'
      )
      return newResponse
    }

    const url = new URL(request.url)
    return fetch(new Request(PROD_ORIGIN + url.pathname + url.search, request))
  },
}
```

Cloudflare Workers API를 사용한 동적 비율 조정:

```typescript
// src/lib/deploy/canary-router.ts
export class CanaryRouter {
  private readonly cfApiBase = 'https://api.cloudflare.com/client/v4'

  async setCanaryWeight(weight: number): Promise<void> {
    // weight: 0.0 ~ 1.0
    const response = await fetch(
      `${this.cfApiBase}/accounts/${process.env.CF_ACCOUNT_ID}/workers/scripts/canary-router/bindings`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bindings: [
            { name: 'CANARY_WEIGHT', type: 'plain_text', text: String(weight) },
          ],
        }),
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Cloudflare API 오류 ${response.status}: ${text}`)
    }
  }

  async getCurrentWeight(): Promise<number> {
    // Workers KV 또는 ENV 조회로 현재 비율 확인
    const response = await fetch(
      `${this.cfApiBase}/accounts/${process.env.CF_ACCOUNT_ID}/workers/scripts/canary-router`,
      { headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}` } }
    )
    if (!response.ok) return 0
    const data = await response.json() as { bindings?: Array<{ name: string; text: string }> }
    const binding = data.bindings?.find((b) => b.name === 'CANARY_WEIGHT')
    return binding ? parseFloat(binding.text) : 0
  }
}

export const canaryRouter = new CanaryRouter()
```

### 5.4 단계적 트래픽 분산 절차

```
배포 단계:

Step 0: canary.stylelucky4u.com에 신 버전 배포
  - scripts/deploy.sh --canary 실행
  - 운영자가 canary URL에서 수동 검증 (최소 10분)
  - 이상 없으면 Step 1 진행

Step 1: 1% → canary (CANARY_WEIGHT=0.01)
  - POST /api/v1/deployments/canary-weight { weight: 0.01 }
  - 에러율 모니터링 목표: < 1%
  - 10분 관찰 후 Step 2

Step 2: 5% → canary (CANARY_WEIGHT=0.05)
  - 20분 관찰 후 Step 3

Step 3: 25% → canary (CANARY_WEIGHT=0.25)
  - 30분 관찰 후 Step 4

Step 4: 100% 승격 (symlink 스왑 + CANARY_WEIGHT=0)
  - scripts/deploy.sh 로 production 교체
  - pm2 stop luckystyle4u-canary

각 단계에서 에러율 > 1% 또는 p95 > 2x 초과 시:
  → CANARY_WEIGHT=0 즉시 복원
  → pm2 stop luckystyle4u-canary
  → 롤백 알림 발송
```

---

## 6. 데이터 모델

### 6.1 SQLite — deploy_events (신규, Drizzle)

배포 이벤트는 **SQLite**에 저장한다. 이유: 배포 이력은 관측 데이터이며 재생성 가능, PG 부하 분리, 60일 이후 아카이브 용이.

```typescript
// src/lib/db/schema.ts (Drizzle SQLite 추가)
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const deployEvents = sqliteTable('deploy_events', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  releaseId: text('release_id').notNull(),
  gitSha: text('git_sha').notNull(),
  gitBranch: text('git_branch').notNull(),
  triggeredBy: text('triggered_by').notNull(),
  isCanary: integer('is_canary').notNull(),
  // 상태: 'PENDING'|'IN_PROGRESS'|'SUCCESS'|'FAILED'|'ROLLED_BACK'|'MANUAL_ROLLBACK'
  status: text('status').notNull(),
  durationMs: integer('duration_ms'),
  healthCheckPassed: integer('health_check_passed'),
  rolledBackToRelease: text('rolled_back_to_release'),
  errorMessage: text('error_message'),
  slackNotified: integer('slack_notified').notNull().default(0),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
})
```

SQLite DDL:
```sql
CREATE TABLE IF NOT EXISTS deploy_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id TEXT NOT NULL,
  git_sha TEXT NOT NULL,
  git_branch TEXT NOT NULL DEFAULT 'main',
  triggered_by TEXT NOT NULL,
  is_canary INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  health_check_passed INTEGER,
  rolled_back_to_release TEXT,
  error_message TEXT,
  slack_notified INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_deploy_events_started_at
  ON deploy_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_events_status
  ON deploy_events(status);
```

### 6.2 PostgreSQL Backup 통합 (기존 `backups` 테이블 활용)

배포 직전 PITR 백업 트리거 연계. `FR-14.4 §2`의 "PITR backup 직전 자동 수행" 요건:

```bash
# deploy.sh에서 배포 전 백업 체크포인트
if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  echo "[DEPLOY] 배포 전 백업 트리거"
  # node script는 execFileNoThrow 내부에서 인수 분리 전달
  node "${RELEASE_DIR}/dist/scripts/trigger-backup.js" "pre-deploy-${RELEASE_ID}"
fi
```

`backups` 테이블(Tier 1 ERD §3.6.3)에 `kind: MANUAL`, `storageLocation` = `"pre-deploy-{RELEASE_ID}"` 형태로 기록.

### 6.3 마이그레이션 롤백 파일 구조

```
prisma/migrations/
├── 20260418_01_create_vault_secrets/
│   ├── migration.sql        ← Prisma 자동 생성 (up)
│   └── down.sql             ← 수동 작성 필수 (DQ-1.21 확정)
├── 20260418_02_create_jwks_keys/
│   ├── migration.sql
│   └── down.sql
└── 20260418_03_create_deploy_events/
    ├── migration.sql
    └── down.sql
```

down.sql 예시:
```sql
-- 20260418_01_create_vault_secrets/down.sql
-- 주의: 프로덕션 실행 전 백업 필수. 수동 실행만 허용 (DQ-OPS-2).
DROP TABLE IF EXISTS vault_secrets;
```

---

## 7. UI 설계

### 7.1 Deployment 페이지 (`/dashboard/settings/deployments`)

```
app/
└── dashboard/
    └── settings/
        └── deployments/
            ├── page.tsx              ← Server Component
            ├── DeploymentList.tsx    ← Client Component (배포 이력 테이블)
            ├── DeployCard.tsx        ← 개별 배포 상태 카드
            ├── RollbackDialog.tsx    ← 롤백 확인 다이얼로그 + 2FA 재확인
            ├── CanaryPanel.tsx       ← canary 배포 제어 패널
            └── MigrationStatus.tsx  ← 마이그레이션 상태 표시
```

#### 7.1.1 UI 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  Deployments                           [GHA 배포 트리거]         │
│─────────────────────────────────────────────────────────────────│
│  현재 배포                                                         │
│  release: 20260418T160000_66c1686  |  브랜치: main  |  상태: 성공 │
│  배포 시각: 2026-04-18 16:00:01   |  소요: 42초                   │
│                                                                   │
│  Canary 상태                                                       │
│  ● 비활성  [canary 배포 시작]  [트래픽 비율: 0%]                   │
│                                                                   │
│  배포 이력                                                         │
│  ┌──────────────────┬─────────┬──────┬────────┬────────────┐    │
│  │ Release ID        │ 상태    │ 브랜치│ 소요   │ 액션       │    │
│  ├──────────────────┼─────────┼──────┼────────┼────────────┤    │
│  │ 20260418T160000  │ ● 성공  │ main │ 42초   │ —          │    │
│  │ 20260418T140000  │ ● 성공  │ main │ 38초   │ [롤백]     │    │
│  │ 20260418T120000  │ ⚠ 롤백  │ feat │ 28초   │ [롤백]     │    │
│  │ 20260417T200000  │ ● 성공  │ main │ 40초   │ [롤백]     │    │
│  │ 20260417T120000  │ ● 성공  │ main │ 41초   │ [롤백]     │    │
│  └──────────────────┴─────────┴──────┴────────┴────────────┘    │
│                                                                   │
│  마이그레이션 상태                                                   │
│  마지막: 20260418_03_create_deploy_events (성공)                   │
│  DB 버전: schema v18                                              │
└─────────────────────────────────────────────────────────────────┘
```

#### 7.1.2 롤백 버튼 구현

```typescript
// app/dashboard/settings/deployments/RollbackDialog.tsx
'use client'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface RollbackDialogProps {
  targetRelease: string
  onConfirm: () => Promise<void>
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function RollbackDialog({ targetRelease, onConfirm, open, onOpenChange }: RollbackDialogProps) {
  const [mfaCode, setMfaCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRollback = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/deployments/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRelease, mfaCode }),
      })
      if (!res.ok) {
        const body = await res.json() as { message: string }
        throw new Error(body.message)
      }
      toast.success(`롤백 완료: ${targetRelease}`)
      onOpenChange(false)
      await onConfirm()
    } catch (err) {
      toast.error(`롤백 실패: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>롤백 확인</DialogTitle>
        </DialogHeader>
        <p>
          <strong>{targetRelease}</strong>으로 롤백합니다. 현재 버전이 해당 release로
          전환됩니다.
        </p>
        <Input
          placeholder="MFA 코드 입력 (6자리)"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          maxLength={6}
        />
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleRollback}
            disabled={loading || mfaCode.length !== 6}
          >
            {loading ? '롤백 중...' : '롤백 실행'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 8. /ypserver 스킬과의 정합성

### 8.1 /ypserver 스킬 갭 5가지 해소 (세션 24e 기준)

`/ypserver` 스킬은 양평 부엌 서버의 현재 운영 상태를 조회하는 스킬이다. 세션 24e에서 식별된 5가지 갭을 Phase 16에서 해소한다.

| 갭 번호 | 갭 설명 | Phase 16 해소 방법 |
|--------|---------|------------------|
| 갭-1 | 배포 이력 없음 | `deploy_events` SQLite 테이블 + Deployment UI |
| 갭-2 | 자동 롤백 없음 | RollbackService + 헬스체크 실패 트리거 |
| 갭-3 | 마이그레이션 감사 없음 | `down.sql` 필수화 + 배포 파이프라인 단계 기록 |
| 갭-4 | PM2 상태 UI 없음 | Infrastructure 페이지 PM2 프로세스 테이블 (Observability) |
| 갭-5 | canary 없음 | canary.stylelucky4u.com + PM2 canary 앱 + Cloudflare Workers |

### 8.2 Wave 4 신규 기능 (갭 해소 이후)

1. **Cloudflare Workers 기반 트래픽 비율 조정**: Phase 16 선택 구현 → Phase 22 정식화.
2. **마이그레이션 Shadow DB 검증**: `FR-14.4 §4` Shadow DB 사전 검증, Phase 16 선택 구현.
3. **배포 알림 채널 확장**: Phase 22에서 이메일, 웹훅 추가.
4. **다중 브랜치 동시 canary**: Phase 22+.

---

## 9. 통합

### 9.1 모든 카테고리 배포의 안전망

Operations는 14 카테고리 중 **유일한 "전 카테고리 공통 안전망"**이다. `10-14-categories-priority.md §2.3`에서 "Operations → 모든 카테고리 (배포 안전망)"으로 정의.

Phase 15~22를 통해 새 카테고리 추가 시 배포 파이프라인에서 점검할 3가지:

| 점검 항목 | Phase 15 (Auth Advanced) | Phase 17 (Storage) | Phase 19 (Realtime) |
|----------|----------|---------|---------|
| 마이그레이션 up/down SQL | mfa_* 테이블 down | seaweedfs_config down | realtime_subscriptions down |
| PM2 앱 추가 | 없음 | seaweedfs-daemon | realtime-worker |
| 헬스체크 확장 | /api/health + mfa | + storage 상태 | + realtime 상태 |

### 9.2 Vault와의 통합 (Observability 선행)

배포 스크립트에서 모든 배포 시크릿(Slack 웹훅 등)은 Vault에 저장하고 동적으로 주입한다.

```bash
# deploy.sh에서 Vault 경유 시크릿 획득
# execFileNoThrow 방식으로 node 호출 (인수 배열 분리)
SLACK_WEBHOOK=$(node "${RELEASE_DIR}/dist/scripts/get-secret.js" \
  "webhook.slack" "deploy-notify")
```

### 9.3 DB Ops(Backup)와의 통합

배포 파이프라인에서 `prisma migrate deploy` 실행 전 백업 체크포인트를 자동 생성한다.

### 9.4 GitHub Actions 설정

```yaml
# .github/workflows/deploy.yml
name: 자동 배포

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false  # 진행 중인 배포 취소 금지

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npx vitest run

  deploy:
    needs: test
    runs-on: self-hosted
    if: github.ref == 'refs/heads/main'
    env:
      RELEASE_ID: ${{ github.run_number }}_${{ github.sha }}
      GIT_SHA: ${{ github.sha }}
      SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
    steps:
      - uses: actions/checkout@v4
      - name: 배포 실행
        run: |
          chmod +x ./scripts/deploy.sh
          ./scripts/deploy.sh
```

---

## 10. 리스크 및 완화

### 10.1 리스크 1 — symlink 레이스 컨디션

**위협**: 두 배포 프로세스가 동시에 실행되어 `current` symlink가 일관성 없는 상태가 되는 시나리오.

**확률**: 낮음 (1인 운영, 자동 배포 직렬화)
**영향**: 중간 (일부 워커 구 버전, 일부 신 버전 실행)

**완화 전략**:
1. **배포 잠금 파일**:
   ```bash
   LOCK_FILE=/tmp/luckystyle4u-deploy.lock
   # set -C = noclobber, 원자적 파일 생성
   (set -C; echo $$ > "$LOCK_FILE") || {
     echo "[ERROR] 이미 배포 중 (PID: $(cat $LOCK_FILE))"
     exit 1
   }
   trap "rm -f $LOCK_FILE" EXIT
   ```
2. **GitHub Actions `concurrency`**: `cancel-in-progress: false`로 동시 workflow 방지.
3. `ln -sfn`은 POSIX 표준 원자적 연산 → symlink 교체 자체는 안전.

### 10.2 리스크 2 — Canary 트래픽 측정 지연

**위협**: canary 배포 후 에러율 측정이 지연되어 문제 버전이 프로덕션에 승격되는 시나리오.

**확률**: 중간 (저트래픽 환경에서 통계 부족)
**영향**: 높음 (버그 버전 전체 트래픽 노출)

**완화 전략**:
1. 최소 관찰 시간 설정: 각 단계에서 최소 10~30분 대기.
2. canary 승격은 **수동 승인 필수** (Deployment UI 승격 버튼 + 2FA 재확인).
3. 에러율 기준: `FR-14.3 §1`의 "에러율 > 1%면 승격 차단" 적용.
4. 저트래픽 보완: 운영자가 canary URL을 수동으로 2~3회 기능 테스트.

### 10.3 리스크 3 — PM2 graceful reload 중 WebSocket 끊김

**위협**: `pm2 reload` 시 해당 워커에 연결된 WebSocket(Realtime 구독자) 연결 끊김.

**확률**: 중간 (Realtime Phase 19 이후)
**영향**: 낮음 (자동 재연결로 복구)

**완화 전략**:
1. PM2 `kill_timeout: 3000`(3초) — 워커가 기존 연결 gracefully 종료.
2. 클라이언트 자동 재연결 로직 구현 필수 (exponential backoff).
3. Realtime 구독 상태를 `realtime_subscriptions` DB에 저장 → 재연결 시 자동 복구.
4. PM2 cluster:4 환경에서 한 번에 1개 워커만 reload → 나머지 3개가 서비스 유지.

---

## 11. Wave 4 할당 DQ 답변

### 11.1 DQ-1.21 — 마이그레이션 롤백 전략

**질문**: Prisma migrate 실패 시 롤백 전략은 무엇인가?

**Wave 4 확정 답변**: **양방향 SQL 파일(up.sql + down.sql) + 트랜잭션 단위 실행 + 수동 실행 원칙**.

세부 정책:

1. **모든 마이그레이션 파일에 `down.sql` 필수**: `FR-14.4 §1` 요건 반영. Prisma는 자동으로 `migration.sql`(up)만 생성하므로, 개발자가 `down.sql`을 수동으로 작성한다.

2. **트랜잭션 정책**:
   - DDL(`CREATE TABLE`, `ADD COLUMN`)은 PostgreSQL에서 트랜잭션 내 실행 가능.
   - `CREATE INDEX CONCURRENTLY`는 트랜잭션 불가 → 별도 마이그레이션 파일로 분리.
   - `prisma migrate deploy`는 자동으로 각 마이그레이션을 트랜잭션으로 래핑.

3. **롤백 절차** (수동, DQ-OPS-2 연계):
   ```bash
   # 1. 실패 마이그레이션 확인
   npx prisma migrate status

   # 2. down.sql 수동 실행
   psql "${DATABASE_URL}" \
     -f prisma/migrations/20260418_01_create_vault_secrets/down.sql

   # 3. Prisma 마이그레이션 이력에서 제거
   psql "${DATABASE_URL}" -c \
     "DELETE FROM _prisma_migrations WHERE migration_name = '20260418_01_create_vault_secrets'"

   # 4. 이전 release symlink 롤백
   ./scripts/rollback.sh
   ```

4. **자동 롤백 금지 원칙**: `prisma migrate deploy` 실패 시 배포 스크립트 자동 중단. symlink 스왑·PM2 reload를 실행하지 않는다. 이전 release가 계속 서비스 중. down.sql 자동 실행은 예상치 못한 데이터 손실 위험이 있으므로 금지.

5. **Shadow DB 사전 검증** (Phase 16 선택 구현):
   ```bash
   # 배포 전 shadow DB에서 마이그레이션 검증
   SHADOW_DATABASE_URL="${DATABASE_SHADOW_URL}" \
     npx prisma migrate deploy
   ```

### 11.2 DQ-OPS-2 — 마이그레이션 실패 시 중단 정책

**Wave 4 확정 답변**: **마이그레이션 실패 = 배포 즉시 중단 + Slack fatal 알림 + 수동 개입**.

자동 down.sql 실행 금지. 이유: 마이그레이션 실패 원인 파악 없이 down.sql 실행이 더 큰 데이터 손실을 초래할 수 있음. 운영자가 실패 원인 확인 후 수동 복구 방법 결정.

알림 필수 포함 항목: 실패 마이그레이션명, 에러 메시지, `prisma migrate status` 출력, 수동 롤백 절차 링크(`docs/guides/deploy-rollback.md`).

### 11.3 DQ-OPS-3 — Node 버전 전환 격리 (Wave 5 사전 고려)

Phase 16에서 `.nvmrc` 파일에 `20` 고정. 신규 release 디렉토리에 포함 → release별 독립 Node 버전 지정 가능. Phase 16에서는 Node 20 LTS 유지. Node 22 전환은 Wave 5 스파이크에서 검증 후 결정.

### 11.4 DQ-14.x — deploy_events status enum 확정

배포 이벤트 상태 값:
- `PENDING`: GHA 트리거됨, WSL2 runner 미시작
- `IN_PROGRESS`: 배포 실행 중
- `SUCCESS`: 헬스체크 통과
- `FAILED`: 오류 발생 (헬스체크 통과 전)
- `ROLLED_BACK`: 자동 롤백 완료
- `MANUAL_ROLLBACK`: 운영자 수동 롤백 완료

---

## 12. Phase 16 WBS — Operations 파트

### 12.1 WBS 개요

**총 공수**: ~20h
**Phase**: Phase 16 (6주 중 후 3주 할당)
**선행 조건**: Observability 파트 완료 (Vault 시크릿 주입 필요) + GHA self-hosted runner WSL2 설치

### 12.2 작업 항목별 공수 분해

| # | 작업 항목 | 공수 | 선행 | 담당 |
|---|----------|------|------|------|
| P-01 | `deploy_events` SQLite 테이블 + Drizzle 스키마 | 0.5h | — | 개발자 |
| P-02 | `scripts/deploy.sh` 작성 (전체 배포 플로우) | 2.5h | P-01 | 개발자 |
| P-03 | `scripts/rollback.sh` 작성 | 1h | P-02 | 개발자 |
| P-04 | `ecosystem.config.js` canary 앱 + cron-worker 분리 | 1h | — | 운영자 |
| P-05 | PM2Manager.ts 구현 | 0.5h | P-04 | 개발자 |
| P-06 | HealthChecker.ts 구현 | 0.5h | — | 개발자 |
| P-07 | RollbackService.ts 구현 (execFileNoThrow 기반) | 1h | P-05, P-06 | 개발자 |
| P-08 | DeployOrchestrator.ts 구현 | 1.5h | P-07 | 개발자 |
| P-09 | Deploy API 라우트 (이력 조회 + 롤백 트리거) | 1h | P-08 | 개발자 |
| P-10 | Canary cloudflared 설정 + Cloudflare Tunnel 추가 | 1h | P-04 | 운영자 |
| P-11 | CanaryRouter.ts (Cloudflare Workers API 연동) | 1.5h | P-10 | 개발자 |
| P-12 | GitHub Actions workflow 파일 작성 | 1h | P-02 | 개발자 |
| P-13 | GHA self-hosted runner WSL2 설치 + 설정 | 0.5h | — | 운영자 |
| P-14 | Deployment 페이지 UI (DeploymentList + CanaryPanel) | 2h | P-09 | 개발자 |
| P-15 | RollbackDialog UI + 2FA 재확인 통합 | 1h | P-14 | 개발자 |
| P-16 | `down.sql` 파일 작성 (Phase 16 마이그레이션 3개) | 0.5h | — | 개발자 |
| P-17 | 통합 테스트 (배포 성공/실패/자동롤백 시나리오) | 1h | P-08~P-15 | 개발자 |
| P-18 | Manual QA (연속 10회 배포 다운타임 0 검증) | 1h | P-17 | 운영자 |
| **합계** | | **~19.5h ≈ 20h** | | |

### 12.3 마일스톤

| 마일스톤 | 목표 일정 | 내용 |
|---------|----------|------|
| M-P-1 | Phase 16 4주 차 | 배포 스크립트 + PM2 설정 완성 (P-01~P-06) |
| M-P-2 | Phase 16 5주 차 | Orchestrator + API + Canary 완성 (P-07~P-13) |
| M-P-3 | Phase 16 6주 차 | UI + 테스트 + QA 완성 (P-14~P-18) |

### 12.4 Observability 파트와 공수 정합성

| 파트 | 공수 | Phase 16 주차 |
|------|------|-------------|
| Observability (04-observability-blueprint.md §12) | ~20h | 1~3주 차 |
| Operations (본 문서 §12.2) | ~20h | 4~6주 차 |
| **Phase 16 합계** | **~40h** | 6주 전체 |

두 파트는 **순차 실행** 권장. 이유: Operations 배포 파이프라인이 Vault 시크릿 주입을 사용하므로 Observability 완료가 선행되어야 한다. 단, P-01·P-04·P-13은 Observability 병렬 실행 가능.

---

## 부록 Z. 근거 인덱스

### Z.1 Wave 문서 인용 목록

| 문서 경로 | 인용 내용 |
|---------|---------|
| `01-research/14-operations/01-github-actions-pm2-rollback-deep-dive.md` | Capistrano 배포 플로우, symlink 롤백 ~5초, canary 전략 |
| `01-research/14-operations/02-operations-matrix.md` | 4종 비교(89.0/75.2/62.5/45.8), 권고도 0.87 |
| `01-research/14-operations/03-capistrano-vs-docker-compose.md` | Docker 거부 근거, WSL2 IO 성능 비교 |
| `02-architecture/01-adr-log.md` ADR-015 | Capistrano + PM2 cluster:4 + canary 공식 결정 |
| `02-architecture/02-data-model-erd.md` §3.6.3~3.6.4 | backups · backup_restores 테이블 |
| `00-vision/02-functional-requirements.md` FR-14 | 배포/PM2/canary/마이그레이션 FR 4건 |
| `00-vision/03-non-functional-requirements.md` NFR-REL | PM2 cluster 자동 재시작, canary 롤백 NFR |
| `00-vision/07-dq-matrix.md` DQ-OPS-* | Operations DQ 4건 |
| `00-vision/10-14-categories-priority.md` | Phase 16 2위 배치, "Operations → 전 카테고리 안전망" |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent B2 (Wave 4 Tier 2) | 최초 작성 — ~760줄 |

### Z.3 후속 산출물 연결

- → `04-observability-blueprint.md`: Phase 16 Observability 파트 (선행 완료 조건)
- → Wave 4 Tier 3 (구현 사양): deploy.sh 테스트 사양, GHA workflow 검증
- → Wave 5 로드맵: Phase 17 Storage(SeaweedFS) 배포 파이프라인 연동 체크포인트

---

> **Operations Blueprint 끝.** Wave 4 · B2 · 2026-04-18 · 카테고리 14 · 80점 → 95점 · Phase 16 MVP · ~20h
