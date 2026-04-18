# Deep-Dive 14/01 — GitHub Actions + PM2 reload + 자동 롤백

> **메타** · 작성일 2026-04-18 · 영역 Operations / CI/CD · 레퍼런스 12 · 길이 540+ 줄 · 결정 권고도 0.87
>
> **연관 산출물**: `references/_PROJECT_VS_SUPABASE_GAP.md` "GitHub Actions CI/CD" P0 · "헬스체크 자동화" P0 · "롤링 배포" P1 · "자동 롤백" P1, 본 R&D Wave 1 Operations 청사진

---

## 0. TL;DR

1. **현재 상태**: 수동 배포 (운영자가 git pull + `npm run build` + `pm2 restart`), 헬스체크 수동, 롤백은 git revert + 재빌드 (~15분 다운타임).
2. **목표**: GitHub Actions self-hosted runner(WSL2) → 빌드/테스트 → `pm2 reload`(zero-downtime) → 헬스체크 → 실패 시 자동 롤백 (이전 release로 symlink swap).
3. **카나리 배포**: PM2 cluster 모드 (instances:4) + `--update-env` + 단계적 롤아웃 (2-2 분리), Cloudflare Tunnel은 트래픽 분리 미지원이라 시간차 카나리(canary release window)로 우회.
4. **결정**: Capistrano-style "releases/ + current symlink" 디렉토리 구조 + GHA self-hosted runner + pm2 reload + curl 기반 헬스체크 스크립트 + 실패 시 symlink revert. 권고도 0.87.

---

## 1. 컨텍스트 앵커링 (10차원 #1)

### 1.1 현재 인프라

```
WSL2 Ubuntu 22.04 (호스트: 김도영 데스크톱)
├── /home/dev/260406_luckystyle4u_server/   ← git checkout
│   ├── .next/                                  ← build artifact
│   ├── node_modules/
│   └── ecosystem.config.js                     ← PM2 설정
│
├── PM2 (Node 20)
│   └── luckystyle4u-server (단일 인스턴스, fork mode)
│
└── cloudflared (Cloudflare Tunnel)
    └── public hostname: stylelucky4u.com → http://localhost:3000
```

### 1.2 현재 배포 절차 (수동, ~15분)

```bash
# 1. SSH (WSL2에 들어감)
# 2. cd /home/dev/260406_luckystyle4u_server
# 3. git pull
# 4. npm ci
# 5. npx prisma migrate deploy
# 6. npm run build
# 7. pm2 restart luckystyle4u-server   ← downtime ~10s
# 8. curl https://stylelucky4u.com/api/health → 수동 확인
```

### 1.3 갭

| 항목 | 현재 | 목표 |
|---|---|---|
| CI 트리거 | 수동 | GHA on push to main |
| 빌드/테스트 자동 | 없음 | unit + smoke + type check |
| 배포 자동 | 수동 SSH | GHA self-hosted runner |
| 다운타임 | ~10초 | 0초 (pm2 reload) |
| 헬스체크 | 수동 | 자동 (60초 대기 + 5회 시도) |
| 롤백 | git revert + 재빌드 (~15분) | symlink swap (~5초) |
| 카나리 | 없음 | 시간차 (10분 모니터링 후 전체) |

### 1.4 잠금 결정

- WSL2 + PM2 + Cloudflare Tunnel 구성 유지 (세션 14 결정)
- 외부 클라우드 (Vercel, Render) 미채택
- GitHub Actions self-hosted runner = WSL2 호스트에 직접 설치 (workflow는 외부 GitHub에 있지만 실행 환경은 우리 WSL)

---

## 2. self-hosted runner 분석 (10차원 #2)

### 2.1 왜 self-hosted인가

- WSL2 호스트가 외부에서 inbound 접근 불가 (Cloudflare Tunnel만 outbound)
- Ubuntu cloud runner에서 `ssh`로 우리 호스트에 들어가는 것은 NAT 우회 복잡
- → self-hosted가 자연스러움 (runner가 outbound로 GitHub에 polling)

### 2.2 설치 절차

```bash
# WSL2 호스트에서
mkdir -p /home/dev/actions-runner && cd /home/dev/actions-runner

# 최신 runner 다운로드 (2026-04 기준 v2.330+)
curl -O -L https://github.com/actions/runner/releases/download/v2.330.0/actions-runner-linux-x64-2.330.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.330.0.tar.gz

# Repo 토큰으로 등록 (GitHub repo > Settings > Actions > Runners > New)
./config.sh --url https://github.com/<owner>/luckystyle4u-server --token <TOKEN> \
  --name "wsl2-yangpyeong" \
  --labels "wsl2,prod,linux,x64,node20" \
  --work _work

# systemd 서비스 등록
sudo ./svc.sh install dev
sudo ./svc.sh start
sudo systemctl status actions.runner.luckystyle4u-server.wsl2-yangpyeong
```

### 2.3 보안 고려

- runner 자체가 워크플로 파일을 그대로 실행 → **fork PR이 self-hosted runner에 닿지 않게 하기 필수**
- `Settings > Actions > Fork pull request workflows from outside collaborators` → "Require approval for first-time contributors"
- 또는 워크플로에 `if: github.repository == github.event.pull_request.head.repo.full_name` 가드

### 2.4 runner 격리 옵션

- **A**: WSL2 호스트에 직접 설치 (단순, 격리 약함)
- **B**: Docker 컨테이너 안에 runner (격리 강함, PM2 접근 어려움)
- **C**: 별도 WSL2 distro에 runner (격리 + 접근 둘 다 가능)

→ 옵션 A 채택 (운영자 1인, 외부 fork PR 받지 않음). 향후 옵션 C로 전환 옵션 보유.

---

## 3. 디렉토리 구조 (Capistrano-style) (10차원 #3)

### 3.1 목표 구조

```
/home/dev/luckystyle4u-server/
├── current/                  ← symlink → releases/<latest>
├── releases/
│   ├── 20260418T120000_a17b3d8/    ← release 1
│   ├── 20260418T140000_b56f2ee/    ← release 2 (current)
│   └── 20260418T160000_66c1686/    ← release 3
├── shared/
│   ├── .env.production       ← 환경변수 (releases/ 외부에 격리)
│   ├── node_modules/         ← 옵션: 공유 (저장공간 절약)
│   └── logs/                  ← PM2 logs
└── ecosystem.config.js       ← PM2 설정 (cwd: /home/dev/luckystyle4u-server/current)
```

### 3.2 장점

- 롤백 = symlink만 바꾸면 됨 (`ln -sfn releases/<prev> current`)
- 새 release 빌드 중에도 current는 안 건드려서 무중단
- shared 폴더가 release 간 격리

### 3.3 PM2 ecosystem.config.js

```js
module.exports = {
  apps: [{
    name: 'luckystyle4u-server',
    cwd: '/home/dev/luckystyle4u-server/current',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    instances: 4,            // cluster 모드
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
    },
    // .env 파일은 dotenv-load 패키지로 로드 (Next.js 16 자동)
    out_file: '/home/dev/luckystyle4u-server/shared/logs/out.log',
    error_file: '/home/dev/luckystyle4u-server/shared/logs/err.log',
    merge_logs: true,
    listen_timeout: 30_000,   // SIGTERM 후 30초 grace
    kill_timeout: 10_000,
  }],
};
```

---

## 4. GitHub Actions 워크플로 (10차원 #4)

### 4.1 메인 워크플로

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: production
  cancel-in-progress: false   # 진행 중 배포는 끝까지

jobs:
  test:
    runs-on: ubuntu-latest    # 일반 cloud runner (저렴)
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test

  deploy:
    needs: test
    runs-on: [self-hosted, wsl2, prod]
    timeout-minutes: 15
    env:
      RELEASE_DIR: /home/dev/luckystyle4u-server/releases
      SHARED_DIR: /home/dev/luckystyle4u-server/shared
      CURRENT_LINK: /home/dev/luckystyle4u-server/current
      PM2_APP: luckystyle4u-server
    steps:
      - name: Compute release id
        id: rid
        run: |
          RID="$(date +%Y%m%dT%H%M%S)_${GITHUB_SHA:0:7}"
          echo "rid=$RID" >> $GITHUB_OUTPUT
          echo "Release: $RID"

      - name: Checkout to release dir
        run: |
          mkdir -p "$RELEASE_DIR/${{ steps.rid.outputs.rid }}"
          git clone --depth 1 --branch ${{ github.ref_name }} \
            "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git" \
            "$RELEASE_DIR/${{ steps.rid.outputs.rid }}"

      - name: Symlink shared
        working-directory: ${{ env.RELEASE_DIR }}/${{ steps.rid.outputs.rid }}
        run: |
          ln -sfn "$SHARED_DIR/.env.production" .env.production
          ln -sfn "$SHARED_DIR/node_modules" node_modules || true

      - name: Install + build
        working-directory: ${{ env.RELEASE_DIR }}/${{ steps.rid.outputs.rid }}
        run: |
          npm ci --omit=dev=false   # 개발 의존성도 빌드에 필요
          npx prisma generate
          npm run build

      - name: Run migrations
        working-directory: ${{ env.RELEASE_DIR }}/${{ steps.rid.outputs.rid }}
        run: |
          npx prisma migrate deploy

      - name: Backup current symlink (롤백 대비)
        run: |
          if [ -L "$CURRENT_LINK" ]; then
            readlink -f "$CURRENT_LINK" > /tmp/prev_release
          fi

      - name: Atomic switch
        run: |
          ln -sfn "$RELEASE_DIR/${{ steps.rid.outputs.rid }}" "$CURRENT_LINK.new"
          mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

      - name: Reload PM2 (zero-downtime)
        run: |
          pm2 reload "$PM2_APP" --update-env

      - name: Health check
        id: health
        run: |
          set +e
          for i in 1 2 3 4 5 6 7 8 9 10; do
            sleep 5
            STATUS=$(curl -sS -o /dev/null -w "%{http_code}" https://stylelucky4u.com/api/health)
            echo "Try $i: $STATUS"
            if [ "$STATUS" = "200" ]; then
              BODY=$(curl -sS https://stylelucky4u.com/api/health)
              echo "Body: $BODY"
              echo "$BODY" | grep -q '"db":"ok"' && \
              echo "$BODY" | grep -q '"version":"${{ steps.rid.outputs.rid }}"' && \
              exit 0
            fi
          done
          exit 1

      - name: Rollback on failure
        if: failure() && steps.health.outcome == 'failure'
        run: |
          if [ -s /tmp/prev_release ]; then
            PREV=$(cat /tmp/prev_release)
            echo "Rolling back to $PREV"
            ln -sfn "$PREV" "$CURRENT_LINK.new"
            mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"
            pm2 reload "$PM2_APP" --update-env
            # 알림
            curl -X POST -H 'Content-Type: application/json' \
              -d '{"text":"⚠️ Deploy failed → rolled back to '"$PREV"'"}' \
              "${{ secrets.SLACK_WEBHOOK_URL }}" || true
            exit 1
          else
            echo "No previous release to rollback to"
            exit 1
          fi

      - name: Cleanup old releases (keep last 5)
        if: success()
        run: |
          cd "$RELEASE_DIR"
          ls -1t | tail -n +6 | xargs -r rm -rf
```

### 4.2 헬스체크 엔드포인트

```ts
// app/api/health/route.ts
import { prisma } from '@/lib/prisma';

const VERSION = process.env.RELEASE_ID ?? 'unknown';   // build 시 주입

export async function GET() {
  const checks: Record<string, string> = { status: 'ok', version: VERSION };

  // DB 핑
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (e) {
    checks.db = 'fail';
    checks.status = 'degraded';
  }

  // (옵션) Vault 핑
  try {
    if (!process.env.MASTER_KEY) throw new Error('no master key');
    checks.vault = 'ok';
  } catch (e) {
    checks.vault = 'fail';
    checks.status = 'degraded';
  }

  return Response.json(checks, { status: checks.status === 'ok' ? 200 : 503 });
}
```

### 4.3 RELEASE_ID 주입

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    RELEASE_ID: process.env.RELEASE_ID ?? '',
  },
};

export default nextConfig;
```

빌드 단계에서 `RELEASE_ID=${{ steps.rid.outputs.rid }} npm run build`로 주입.

---

## 5. PM2 reload 메커니즘 (10차원 #5)

### 5.1 reload vs restart

| 명령 | 동작 | 다운타임 |
|---|---|---|
| `pm2 restart` | 모든 인스턴스 동시 종료 + 재시작 | ~5~10초 |
| `pm2 reload` | 인스턴스 1개씩 종료 + 재시작 (rolling) | ~0초 (cluster 4개 기준) |
| `pm2 gracefulReload` | reload + SIGINT 후 grace | ~0초 + grace |

cluster mode (instances ≥ 2) 필수 — fork mode에서는 reload = restart.

### 5.2 graceful shutdown

```ts
// instrumentation.ts (Next.js 16)
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  process.on('SIGINT', async () => {
    console.log('SIGINT received, draining...');
    // 1. 새 요청 거부 (Next.js는 SIGINT 받으면 자동으로 keepalive 끊음)
    // 2. 진행 중 요청 완료 대기 (PM2 listen_timeout 30초까지)
    // 3. DB 연결 종료
    const { prisma } = await import('@/lib/prisma');
    await prisma.$disconnect();
    process.exit(0);
  });
}
```

### 5.3 --update-env

```bash
pm2 reload luckystyle4u-server --update-env
```

`shared/.env.production` 변경분을 새 인스턴스에 반영. 마이그레이션 + KEK 회전 후 필수.

---

## 6. 롤백 시나리오 (10차원 #6)

### 6.1 자동 롤백 트리거

- 헬스체크 5분 내 실패 (HTTP != 200 또는 DB/Vault degraded)
- 에러율 급증 (옵션, /metrics에서 SSE)

### 6.2 자동 롤백 절차

```
1. /tmp/prev_release에서 이전 release 경로 읽기
2. ln -sfn $PREV current
3. pm2 reload --update-env
4. 헬스체크 다시
5. Slack 알림
6. exit 1 (워크플로 fail로 표시)
```

### 6.3 수동 롤백 (긴급)

```bash
# 운영자가 WSL2에 SSH 후
cd /home/dev/luckystyle4u-server
ls -lt releases/ | head -5
ln -sfn releases/<원하는버전> current
pm2 reload luckystyle4u-server --update-env
curl https://stylelucky4u.com/api/health
```

또는 GHA workflow_dispatch로 `rollback.yml` 실행.

### 6.4 DB 마이그레이션 롤백

- Prisma `migrate deploy`는 `down` 자동 미지원
- 마이그레이션 작성 시 **forward-compatible** 원칙: 기존 코드가 새 스키마에서도 작동하도록 (예: 새 컬럼은 NULL 허용 + default)
- 파괴적 변경(컬럼 drop)은 별도 PR로 분리 + 24시간 grace

```
Phase 1 PR: 새 컬럼 추가 (nullable)
Phase 2 PR: 코드 신규 컬럼 사용
Phase 3 PR (24h+ 후): 옛 컬럼 drop
```

→ 이 패턴이면 Phase 2 PR이 롤백되어도 DB와 호환됨.

---

## 7. 카나리 배포 (10차원 #7)

### 7.1 Cloudflare Tunnel의 한계

- Cloudflare Tunnel은 단일 origin만 지원 (port 3000 단일)
- traffic splitting (10% → 새 버전) 불가
- → **Blue/Green 카나리 시간차 패턴**으로 우회

### 7.2 시간차 카나리 패턴

```
T0     : 새 release를 별도 PM2 앱(luckystyle4u-canary, port 3001)으로 시작
         (instances: 1)
T0     : 운영자가 https://canary.stylelucky4u.com (별도 Tunnel) 으로 검증
T0+10m : 운영자가 OK 판단 → main 앱 reload (port 3000) → 카나리 종료
```

### 7.3 자동 카나리 (선택, P1)

```yaml
# 별도 워크플로 deploy-canary.yml
on:
  workflow_dispatch:
  pull_request:
    types: [labeled]

jobs:
  canary:
    if: github.event.label.name == 'deploy-canary'
    runs-on: [self-hosted, wsl2]
    steps:
      - name: Build to canary release
        run: ./scripts/build-release.sh canary
      - name: Start canary PM2
        run: pm2 startOrReload ecosystem.canary.js
      - name: Smoke test
        run: ./scripts/smoke-canary.sh
      - name: Notify operator
        run: |
          curl -X POST "$SLACK" -d '{"text":"Canary live → https://canary.stylelucky4u.com"}'
```

`ecosystem.canary.js`:

```js
module.exports = {
  apps: [{
    name: 'luckystyle4u-canary',
    cwd: '/home/dev/luckystyle4u-server/canary',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3001',
    instances: 1,
    exec_mode: 'fork',
  }],
};
```

→ 별도 cloudflared 설정으로 `canary.stylelucky4u.com → port 3001`.

---

## 8. 모니터링 + 관측 (10차원 #8)

### 8.1 배포 추적 대시보드

`/admin/deploys` 페이지 (P1):

```
┌────────────────────────────────────────────────┐
│ 배포 이력                                      │
├────────────────────────────────────────────────┤
│ 2026-04-18 16:00  v66c1686  ✅ success  (45s) │
│ 2026-04-18 14:00  vb56f2ee  ✅ success  (52s) │
│ 2026-04-18 12:00  va17b3d8  ⚠ rollback (88s) │
└────────────────────────────────────────────────┘
```

데이터 소스: `Deployment` Prisma 모델 + GHA webhook으로 기록.

### 8.2 Slack/Discord 알림

```yaml
- name: Notify success
  if: success()
  run: |
    curl -X POST "$SLACK" -d "$(cat <<JSON
    {
      "text": "✅ 배포 성공: ${{ steps.rid.outputs.rid }}",
      "blocks": [
        {"type":"section","text":{"type":"mrkdwn","text":"*배포 완료*\n• Release: \`${{ steps.rid.outputs.rid }}\`\n• Commit: ${{ github.event.head_commit.message }}\n• 소요: ${{ steps.health.outputs.duration }}"}}
      ]
    }
    JSON
    )"
```

### 8.3 에러율 모니터

`/metrics` 페이지 (이미 SSE+Recharts 완성)에서 실시간 5분 에러율 추적 → 임계 초과 시 운영자 알림.

---

## 9. 비용 + 운영 부담 (10차원 #9)

### 9.1 비용

| 항목 | 비용 |
|---|---|
| GitHub Actions (public repo) | 무료 |
| GitHub Actions (private, ubuntu-latest) | 2000분/월 무료 |
| self-hosted runner | 0원 (우리 WSL2) |
| Slack webhook | 무료 |
| **합계** | **0원/월** |

### 9.2 운영 부담

| 항목 | 시간/월 |
|---|---|
| runner 업데이트 (분기 1회) | 15분 |
| 워크플로 디버깅 (가끔) | 30분 |
| 롤백 수동 개입 (월 0~1회) | 10분 |
| **합계** | **~1시간/월** |

→ 수동 배포 (~30분 × 4회 = 2시간/월) 대비 절감 + 신뢰성 향상.

---

## 10. 결론 + 청사진 (10차원 #10)

### 10.1 결정

> **CI/CD**: GitHub Actions (test job: cloud runner / deploy job: self-hosted WSL2 runner)
> **배포 구조**: Capistrano-style (`releases/` + `current` symlink + `shared/`)
> **무중단**: PM2 cluster (instances:4) + `pm2 reload --update-env`
> **헬스체크**: `/api/health` (db + vault + version 확인) — 5초×10회
> **롤백**: 자동 (헬스체크 실패 시 symlink swap), 수동 (workflow_dispatch)
> **카나리**: 시간차 (canary.stylelucky4u.com 별도 Tunnel)
> **알림**: Slack webhook (성공/실패/롤백)
> **권고도**: 0.87

### 10.2 청사진

```
┌─────────────────────────────────────────────────────────┐
│  GitHub                                                  │
│   push to main → GHA test job (cloud)                   │
│                  └─→ deploy job (self-hosted WSL2)      │
└──────────────────────────────┬──────────────────────────┘
                               │ (runner polling)
                               ▼
┌─────────────────────────────────────────────────────────┐
│  WSL2 호스트                                             │
│                                                          │
│   /home/dev/luckystyle4u-server/                        │
│     ├── releases/<rid>/   ← 새 release 빌드             │
│     ├── current → releases/<latest>                     │
│     ├── shared/.env.production                          │
│     └── shared/logs/                                    │
│                                                          │
│   ┌─ PM2 cluster (instances: 4) ──────────────────┐    │
│   │  app: luckystyle4u-server (port 3000)         │    │
│   │  pm2 reload → 1개씩 rolling restart           │    │
│   └────────────────────────────────────────────────┘    │
│                                                          │
│   curl http://localhost:3000/api/health                 │
│   → 5×10 retry → fail 시 symlink revert + reload        │
│                                                          │
└──────────────────────────────┬──────────────────────────┘
                               │ outbound
                               ▼
                  ┌─────────────────────────┐
                  │ Cloudflare Tunnel       │
                  │ stylelucky4u.com        │
                  └─────────────────────────┘
```

### 10.3 마이그레이션 단계

1. **Phase A (0.5세션)**: Capistrano 디렉토리 구조 마이그레이션 (`/home/dev/luckystyle4u-server/{releases,shared,current}`)
2. **Phase B (1세션)**: PM2 ecosystem 재작성 (cluster, listen_timeout, --update-env)
3. **Phase C (0.5세션)**: `/api/health` 엔드포인트 + RELEASE_ID 주입
4. **Phase D (1세션)**: GHA self-hosted runner 설치 + `.github/workflows/deploy.yml`
5. **Phase E (0.5세션)**: Slack/Discord 알림
6. **Phase F (P1)**: 카나리 워크플로 + canary.stylelucky4u.com Tunnel
7. **Phase G (P1)**: `/admin/deploys` 대시보드

### 10.4 후속 의사결정

- **DQ-4.1 (신규)**: 빌드를 cloud runner에서 하고 artifact만 self-hosted로 옮길 것인가? → No (의존성 캐시 + node_modules 크기 100MB+ 전송 비효율, self-hosted에서 ci+build 권고)
- **DQ-4.2 (신규)**: shared/node_modules 공유할 것인가, release별 격리할 것인가? → 격리 (release 간 의존성 격차 안전), 단 npm cache 공유 (`.npm/`)
- **DQ-4.3 (신규)**: 마이그레이션 실패 시 롤백 정책? → Forward-compatible 강제 + 별도 ADR 작성

---

## 11. 참고문헌 (12개)

1. **GitHub Actions self-hosted runner**: https://docs.github.com/actions/hosting-your-own-runners — 설치/보안 모범 사례
2. **PM2 reload (zero-downtime)**: https://pm2.keymetrics.io/docs/usage/cluster-mode/#reload — cluster + reload 메커니즘
3. **Capistrano deployment pattern**: https://capistranorb.com/documentation/getting-started/structure/ — releases/ + current 구조
4. **Next.js 16 instrumentation**: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation — graceful shutdown
5. **Prisma migrate deploy**: https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-troubleshooting — 마이그레이션 안전 패턴
6. **Cloudflare Tunnel ingress rules**: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/ingress/ — 다중 hostname 설정
7. **GitHub Actions concurrency**: https://docs.github.com/actions/using-jobs/using-concurrency — 동시 배포 방지
8. **PM2 ecosystem reference**: https://pm2.keymetrics.io/docs/usage/application-declaration/ — listen_timeout, kill_timeout
9. **WSL2 systemd 활성화**: https://learn.microsoft.com/windows/wsl/systemd — runner 서비스 등록 전제
10. **Forward-compatible DB migrations**: https://martinfowler.com/articles/evodb.html — Fowler 패턴
11. **GitHub Actions OIDC + secrets**: https://docs.github.com/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect — 비밀 안전
12. **Slack incoming webhook**: https://api.slack.com/messaging/webhooks — 알림 표준

---

**작성**: kdywave Wave 1 Round 2 · 2026-04-18 · 권고도 0.87
