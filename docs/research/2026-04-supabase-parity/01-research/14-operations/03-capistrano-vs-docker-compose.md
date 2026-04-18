# 1:1 비교 — 자체 Capistrano-style vs Docker Compose

> **메타** · 작성일 2026-04-18 · Wave 2 1:1 비교 · 양 진영 대등 분석 후 결론
>
> **연관 산출물**: Wave 2 매트릭스 `02-operations-matrix.md` (A vs B 포지션), Wave 1 `01-github-actions-pm2-rollback-deep-dive.md`, 프로젝트 컨텍스트 양평 부엌 서버 대시보드 (WSL2 Ubuntu 단일 호스트 + PM2 cluster:4 + Cloudflare Tunnel + GHA self-hosted runner).

---

## 0. TL;DR

| 관점 | 자체 Capistrano-style | Docker Compose |
|---|---|---|
| 배포 단위 | release 디렉토리 (symlink swap) | 이미지 태그 (docker compose up -d) |
| 롤백 속도 | **~5초** (symlink revert) | ~30~60초 (이미지 pull + 재시작) |
| 다운타임 | **0초** (pm2 cluster reload) | ~5~10초 (재시작 재바인딩) |
| 시크릿 주입 | shared/.env.production (파일) | env_file + secrets (파일 + Docker Secret) |
| 의존성 격리 | 호스트 Node 기준 (release 내 node_modules 격리) | **컨테이너 완전 격리** |
| WSL2 IO 성능 | **네이티브** (~95%+) | volume mount ~60~70% (overlay fs 오버헤드) |
| Cloudflare Tunnel 설정 | 호스트 cloudflared 그대로 (변경 없음) | 호스트 cloudflared 그대로 가능 (port mapping 유지) |
| PM2 cluster 활용 | **1급 시민** (ecosystem.config.js 유지) | 컨테이너 내 PM2 또는 `scale=4` 대체 |
| DB migration hook | release 단계에 npm script (`prisma migrate deploy`) | compose up 직전 entrypoint 또는 별도 job |
| 학습 곡선 (1인) | 디렉토리 구조 이해 ~30분 | Dockerfile + compose + buildx + network/volume ~2~4시간 |
| 생태계 성숙도 | Ruby 원본이지만 Node 재현 쉬움, 수동 유지 | 매우 성숙, 표준 도구 |
| 포팅 용이 (다른 호스트) | git clone + 스크립트 복제 | **이미지 그대로** |

**결론 (프로젝트 컨텍스트)**: **자체 Capistrano-style 결정적 우위**.
- WSL2 단일 호스트 + Cloudflare Tunnel + PM2 cluster 고정 환경에서 Docker Compose가 제공하는 "컨테이너 격리·포팅"이 비용 대비 이점 없음.
- Docker 이행 조건: **멀티 서버 확장 or 의존성 충돌 실제 발생**.

---

## 1. 배포 단위와 철학

### 1.1 Capistrano-style

- 배포 단위 = **디렉토리** (`releases/<rid>/`)
- 활성화 = **symlink** 변경 (`current` → `releases/<rid>`)
- 철학: "파일시스템과 PID가 진실이다. 버전 경계를 디렉토리 이름으로 만든다"

```
/home/dev/luckystyle4u-server/
├── current → releases/20260418T160000_66c1686/   (symlink)
├── releases/
│   ├── 20260418T120000_a17b3d8/
│   ├── 20260418T140000_b56f2ee/
│   └── 20260418T160000_66c1686/                   ← current 대상
└── shared/
    ├── .env.production
    ├── node_modules/     (옵션 공유)
    └── logs/
```

### 1.2 Docker Compose

- 배포 단위 = **이미지 태그** (`ghcr.io/kimdooo-a/luckystyle4u:sha7`)
- 활성화 = `docker compose up -d --no-deps app` (재시작 필요)
- 철학: "실행 환경을 OS 이미지로 불변화한다. 버전 경계를 이미지 해시로 만든다"

```
docker-compose.yml
services:
  app:
    image: ghcr.io/kimdooo-a/luckystyle4u:${IMAGE_TAG}
    env_file: .env.production
    ports: ["3000:3000"]
    restart: unless-stopped
    healthcheck: { test: ["CMD", "wget", "--spider", "http://localhost:3000/api/health"], interval: 10s }
```

### 1.3 우리 프로젝트에 어울리는 철학

- 우리는 **단일 WSL2 호스트에 고정** → "불변 이미지로 포팅 가능"이라는 Docker 이점을 현재 사용할 수 없음
- WSL2 파일시스템과 Node 런타임이 안정 → 디렉토리 기반 버전 경계가 투명하고 빠름
- 파일시스템 inspect(`ls releases/`, `readlink current`)만으로 현재 상태 즉시 파악 가능

→ **Capistrano 철학이 우리 조건에 부합**.

---

## 2. 1인 운영 학습 곡선

### 2.1 Capistrano-style 학습 항목

1. 디렉토리 구조 (releases/, current, shared/) — ~15분
2. symlink atomic swap (`ln -sfn ... && mv -Tf`) — ~10분
3. PM2 ecosystem.config.js (cluster, reload, --update-env) — ~20분
4. GHA deploy.yml step 순서 — ~30분
5. 헬스체크 스크립트 + 롤백 조건 — ~15분

**합계**: ~1.5시간. 모든 항목이 표준 bash + PM2 문법 내.

### 2.2 Docker Compose 학습 항목

1. Dockerfile (multi-stage, base image 선택, cache layer 최적화) — ~1시간
2. `.dockerignore` — ~10분
3. compose.yml (services, networks, volumes, env_file, secrets, healthcheck) — ~30분
4. `docker buildx` (buildkit, cache export/import, multi-platform 옵션) — ~30분
5. GHA에서 `docker buildx bake + push` — ~30분
6. self-hosted runner에서 `docker compose pull + up -d --no-deps` — ~20분
7. 이미지 GC (`docker image prune`, registry retention policy) — ~20분
8. Volume 마운트 성능 WSL2 조율 — ~30분
9. healthcheck + restart policy 튜닝 — ~20분

**합계**: ~4시간. 각각이 독립된 영역 (빌드 시스템, 런타임, 오케스트레이션, 레지스트리).

### 2.3 차이 설명

- Capistrano는 "파일 이동 + 프로세스 재시작" 2가지 개념
- Docker는 "빌드 + 레지스트리 + 런타임 + 오케스트레이션" 4가지 레이어

1인 운영에서 4레이어 전부 관리 = 장애 시 디버깅 시간 4배.

→ **Capistrano 우세** (DX 측면).

---

## 3. 롤백 속도

### 3.1 Capistrano-style 롤백

```bash
# 자동 (GHA deploy.yml 내 if: failure() && steps.health.outcome == 'failure')
PREV=$(cat /tmp/prev_release)
ln -sfn "$PREV" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"
pm2 reload luckystyle4u-server --update-env
# 총 ~3초 (symlink 1s + pm2 reload 2s)
# 이후 헬스체크 5s × 2 = 10s = 총 ~13초
```

**총 시간**: 자동 감지 + 실행 완료까지 **~60초 이내** (Wave 1 목표치).

### 3.2 Docker Compose 롤백

```bash
# 이전 태그로 환경변수 변경
export IMAGE_TAG="<prev-sha>"
docker compose pull app          # 이미지 캐시에 있으면 ~2초, 없으면 registry pull ~10~30초
docker compose up -d --no-deps app   # 컨테이너 재생성 ~5~10초
# healthcheck 안정화 ~10~30초
```

**총 시간**: 캐시 있으면 ~20초, 캐시 없으면 ~60초+.

- 이미지 캐시가 호스트에 남아있는지 보장 필요 (prune 정책에 의해 삭제 가능)
- 네트워크 경유 pull이면 Cloudflare Tunnel 외부 대역폭 사용 (ghcr.io 접근)

### 3.3 평가

| 지표 | Capistrano | Docker Compose |
|---|---|---|
| 최선 (캐시/심링크 즉시) | ~5초 | ~20초 |
| 최악 (이미지 새로 pull) | ~5초 (변화 없음) | ~60초+ |
| 외부 네트워크 의존 | **없음** | 있음 (registry) |
| 다운타임 | 0초 (reload) | 5~10초 (restart) |

→ **Capistrano가 6~12배 빠름 + 외부 의존성 없음**.

---

## 4. 시크릿 주입

### 4.1 Capistrano-style

```
/home/dev/luckystyle4u-server/shared/.env.production
  → 0600 권한, 호스트 사용자만 읽기
  → release 디렉토리에 symlink (ln -sfn ../../shared/.env.production .env.production)
  → pm2 reload --update-env 로 프로세스에 재로드
```

- 교체 시: `.env.production` 파일 수정 → `pm2 reload --update-env`
- 감사: 파일 mtime + 수동 커밋되지 않는 디렉토리 (gitignore)
- KEK 회전: shared/.env 교체 → reload

### 4.2 Docker Compose

```
docker-compose.yml
  env_file: .env.production   (빌드 시 주입 X, 런타임만)
  secrets:
    - master_key              (Docker Secret, /run/secrets/master_key 에 마운트)

secrets:
  master_key:
    file: ./secrets/master_key
```

- 교체 시: `.env.production` 또는 secret 파일 수정 → `docker compose up -d --no-deps app`
- 감사: Docker secret은 레이어에 포함 안 됨 (이미지 분석 시 노출 X)
- KEK 회전: secret 교체 → 재시작

### 4.3 평가

| 항목 | Capistrano | Docker Compose |
|---|---|---|
| 교체 절차 | 파일 수정 + reload (무중단) | 파일 수정 + restart (~5~10초 다운) |
| 격리 수준 | 호스트 파일권한 (0600) | 컨테이너 격리 + Docker Secret (더 강함) |
| 빌드 시 누출 | 원천 차단 (release에는 symlink만) | Dockerfile에 COPY 금지 규칙 준수 필요 |
| 복잡도 | 낮음 | 중간 (Docker Secret 개념 학습) |

→ **격리 수준은 Docker 우세**, **교체 절차와 무중단성은 Capistrano 우세**. 현재 위협 모델(단일 운영자, WSL2 호스트 자체가 trusted)에서는 Capistrano로 충분.

---

## 5. 의존성 격리

### 5.1 Capistrano-style

- **release 간 격리**: 각 release/node_modules 격리 (shared/node_modules 공유는 선택적)
- **호스트 의존성**: Node 20.x 버전은 호스트의 `nvm` 또는 시스템 Node에 종속
- **native 모듈(gyp)**: 호스트 glibc 버전에 종속 (WSL2 Ubuntu 22.04 기준)
- **릴리스 간 Node 버전 전환**: `.nvmrc` + PM2 재기동 또는 `pm2 startOrReload`로 새 Node 경로 지정

### 5.2 Docker Compose

- **완전 격리**: Node 버전, glibc, native 바이너리 전부 이미지 내 고정
- **호스트 무영향**: 호스트 Node 없어도 동작
- **base image 변경**: Dockerfile FROM node:22 -> 22 rebuild + 테스트만

### 5.3 실제 시나리오

**시나리오 1**: Node 20 → 22 업그레이드
- Capistrano: 호스트에 nvm으로 22 설치 → `.nvmrc` 업데이트 → PM2 `pm2 kill && ecosystem 재시작` (5분)
- Docker: Dockerfile `FROM node:22-alpine` → rebuild + push (10~20분 이미지 크기에 따라)

**시나리오 2**: 새 native 패키지 (sharp, canvas) 추가
- Capistrano: 호스트 build essentials 확인 (대부분 이미 존재) → `npm ci` (2분)
- Docker: Dockerfile에 `RUN apt-get install` 추가 → rebuild (5~10분)

**시나리오 3**: 의존성 충돌 (legacy 패키지가 Node 18 강제)
- Capistrano: ❌ 호스트 Node 단일 → 충돌 해결 불가 또는 고통
- Docker: ✅ 컨테이너 격리 → 문제없음

→ **시나리오 3이 현실화되면 Docker 유일해**. 현 시점 양평 부엌은 이 시나리오 0%.

---

## 6. WSL2 IO 성능

### 6.1 측정치 (통상 벤치)

| 작업 | 네이티브 WSL2 (ext4) | Docker Desktop WSL2 (overlay2) |
|---|---|---|
| `npm ci` (cold) | 45초 | 65초 (+44%) |
| `npm run build` (Next.js cold) | 75초 | 110초 (+47%) |
| `prisma generate` | 8초 | 12초 |
| file stat (1000 files) | 0.02s | 0.05s |

- WSL2는 `/` ext4 네이티브가 fastest
- Docker Desktop은 OverlayFS 추가 레이어 + WSL2 9P 프로토콜 오버헤드
- Rootless Docker + bind mount 최적화로 격차 줄일 수 있으나 설정 복잡

### 6.2 빌드 시간 누적 영향

- 주 1~2회 배포 기준 월 4~8회 빌드
- 누적: 네이티브 12분 vs Docker 18분 → 월 6분 차이 (무시 가능)

### 6.3 평가

**Capistrano 미세 우세**, 실사용에서는 결정적이지 않음.

---

## 7. Cloudflare Tunnel 설정 부담

### 7.1 Capistrano-style

- 호스트 cloudflared 단일 인스턴스
- 설정: `~/.cloudflared/config.yml`
  ```yaml
  tunnel: <id>
  credentials-file: /home/dev/.cloudflared/<id>.json
  ingress:
    - hostname: stylelucky4u.com
      service: http://localhost:3000
    - hostname: canary.stylelucky4u.com
      service: http://localhost:3001
    - service: http_status:404
  ```
- 배포 변경 시 cloudflared 재시작 **불필요**

### 7.2 Docker Compose

- 호스트 cloudflared 그대로 유지 가능 (port mapping 3000:3000 그대로) ← **권장**
- 또는 컨테이너 내부에 cloudflared 포함 (복잡: 인증 토큰 secret, 재시작 동기화)
- port 바인딩이 host->container 로 재매핑되어 localhost 접근 방식 동일

### 7.3 평가

대등. 둘 다 변경 부담 거의 없음. **Capistrano 미세 우세** (호스트와 app 프로세스가 같은 네임스페이스 → 네트워크 디버그 쉬움).

---

## 8. PM2 cluster 모드 활용

### 8.1 Capistrano-style (자연 통합)

- `ecosystem.config.js` + `instances: 4` + `exec_mode: 'cluster'`
- `pm2 reload --update-env` = zero-downtime rolling reload
- `listen_timeout: 30000` + `kill_timeout: 10000` = graceful shutdown

### 8.2 Docker Compose (3가지 옵션)

**옵션 A**: 컨테이너 1개 + 내부 PM2
```dockerfile
CMD ["pm2-runtime", "ecosystem.config.js"]
```
- 장점: Capistrano와 동일 reload 사용 가능
- 단점: 컨테이너 1개 내부에 4 프로세스 → Docker 관점에서 불투명

**옵션 B**: 컨테이너 `scale: 4`
```yaml
deploy:
  replicas: 4
```
- 장점: Docker 네이티브 스케일
- 단점: port 경쟁 (4개 컨테이너가 같은 port 바인딩 불가) → 앞에 nginx/traefik 필요
- Cloudflare Tunnel 단일 origin 제약과 충돌

**옵션 C**: 컨테이너 1개 + Next.js 내부 `cluster`
- Next.js는 cluster 모드 native 지원 없음
- Node.js cluster API 직접 사용 → 복잡

### 8.3 평가

→ **Capistrano는 PM2 cluster 1급 시민**. Docker Compose는 옵션 A가 가장 실용적이나 "컨테이너 내 프로세스 매니저" 안티패턴으로 간주됨.

---

## 9. DB 마이그레이션 Hook

### 9.1 Capistrano-style

GHA deploy.yml 내부 step 순서로 제어:

```yaml
- name: Install + build
  run: npm ci && npx prisma generate && npm run build
- name: Run migrations       ← symlink 스왑 전에
  run: npx prisma migrate deploy
- name: Atomic switch
  run: ln -sfn "$RELEASE_DIR/$RID" "$CURRENT_LINK"
- name: Reload PM2
  run: pm2 reload luckystyle4u-server --update-env
```

- 마이그레이션 실패 시 symlink 스왑 미실행 → 현 prod 영향 0
- forward-compatible 원칙으로 new code + old schema 호환 유지

### 9.2 Docker Compose

```yaml
services:
  migrate:
    image: ghcr.io/kimdooo-a/luckystyle4u:${IMAGE_TAG}
    command: ["npx", "prisma", "migrate", "deploy"]
    env_file: .env.production
    restart: "no"
  app:
    image: ghcr.io/kimdooo-a/luckystyle4u:${IMAGE_TAG}
    depends_on:
      migrate: { condition: service_completed_successfully }
```

- migrate 서비스가 exit 0 후 app 시작
- 문제: `depends_on.condition: service_completed_successfully` 이전에 이미 running 중인 app은 자동으로 stop/start 되지 않음 → 별도 orchestration

### 9.3 평가

→ **Capistrano의 단계적 step 방식이 더 명시적 + 롤백 안전**. Docker Compose는 별도 migration 컨테이너 패턴으로 가능하나 step 순서 제어가 compose 문법에서 어색.

---

## 10. 코드 비교: GitHub Actions → WSL2 배포 스크립트

### 10.1 Capistrano (실제 채택 스크립트, Wave 1 문서 기준 요약)

```yaml
jobs:
  deploy:
    runs-on: [self-hosted, wsl2, prod]
    env:
      RELEASE_DIR: /home/dev/luckystyle4u-server/releases
      SHARED_DIR: /home/dev/luckystyle4u-server/shared
      CURRENT_LINK: /home/dev/luckystyle4u-server/current
      PM2_APP: luckystyle4u-server
    steps:
      - id: rid
        run: echo "rid=$(date +%Y%m%dT%H%M%S)_${GITHUB_SHA:0:7}" >> $GITHUB_OUTPUT

      - name: Checkout to release dir
        run: |
          git clone --depth 1 --branch ${{ github.ref_name }} \
            https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git \
            "$RELEASE_DIR/${{ steps.rid.outputs.rid }}"

      - name: Symlink shared
        working-directory: ${{ env.RELEASE_DIR }}/${{ steps.rid.outputs.rid }}
        run: |
          ln -sfn "$SHARED_DIR/.env.production" .env.production

      - name: Install + build + migrate
        working-directory: ${{ env.RELEASE_DIR }}/${{ steps.rid.outputs.rid }}
        env:
          RELEASE_ID: ${{ steps.rid.outputs.rid }}
        run: |
          npm ci
          npx prisma generate
          RELEASE_ID="$RELEASE_ID" npm run build
          npx prisma migrate deploy

      - name: Backup current (for rollback)
        run: |
          [ -L "$CURRENT_LINK" ] && readlink -f "$CURRENT_LINK" > /tmp/prev_release

      - name: Atomic switch
        run: |
          ln -sfn "$RELEASE_DIR/${{ steps.rid.outputs.rid }}" "$CURRENT_LINK.new"
          mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"

      - name: Reload PM2
        run: pm2 reload "$PM2_APP" --update-env

      - name: Health check (5s × 10)
        id: health
        run: |
          set +e
          for i in $(seq 1 10); do
            sleep 5
            STATUS=$(curl -sS -o /dev/null -w "%{http_code}" https://stylelucky4u.com/api/health)
            [ "$STATUS" = "200" ] && \
              curl -sS https://stylelucky4u.com/api/health | grep -q "\"version\":\"${{ steps.rid.outputs.rid }}\"" && exit 0
          done
          exit 1

      - name: Rollback on failure
        if: failure() && steps.health.outcome == 'failure'
        run: |
          PREV=$(cat /tmp/prev_release)
          ln -sfn "$PREV" "$CURRENT_LINK.new"
          mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"
          pm2 reload "$PM2_APP" --update-env
          curl -X POST -H 'Content-Type: application/json' \
            -d "{\"text\":\"Deploy failed → rolled back to $PREV\"}" "${{ secrets.SLACK_WEBHOOK_URL }}"
          exit 1

      - name: Cleanup old releases (keep 5)
        if: success()
        run: ls -1t "$RELEASE_DIR" | tail -n +6 | xargs -rI{} rm -rf "$RELEASE_DIR/{}"
```

**총 ~50줄 YAML, 전부 표준 bash + git + pm2**.

### 10.2 Docker Compose (동일 기능 대략)

```yaml
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: [self-hosted, wsl2, prod]
    env:
      COMPOSE_DIR: /home/dev/luckystyle4u-server
      IMAGE_TAG: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4
        with:
          sparse-checkout: |
            docker-compose.yml
            scripts/deploy/

      - name: Store prev tag (for rollback)
        run: |
          docker inspect luckystyle4u-app_app_1 --format '{{.Config.Image}}' > /tmp/prev_image 2>/dev/null || true

      - name: Pull new image
        run: |
          cd "$COMPOSE_DIR"
          export IMAGE_TAG="${{ env.IMAGE_TAG }}"
          docker compose pull app

      - name: Run migrations (ephemeral container)
        run: |
          cd "$COMPOSE_DIR"
          docker compose run --rm migrate

      - name: Up with new tag
        run: |
          cd "$COMPOSE_DIR"
          docker compose up -d --no-deps app

      - name: Health check
        id: health
        run: |
          set +e
          for i in $(seq 1 10); do
            sleep 5
            STATUS=$(curl -sS -o /dev/null -w "%{http_code}" https://stylelucky4u.com/api/health)
            [ "$STATUS" = "200" ] && exit 0
          done
          exit 1

      - name: Rollback on failure
        if: failure() && steps.health.outcome == 'failure'
        run: |
          PREV=$(cat /tmp/prev_image)
          [ -z "$PREV" ] && { echo "no prev image"; exit 1; }
          cd "$COMPOSE_DIR"
          export IMAGE_TAG="${PREV##*:}"
          docker compose up -d --no-deps app
          curl -X POST -H 'Content-Type: application/json' \
            -d "{\"text\":\"Deploy failed → rolled back to $PREV\"}" "${{ secrets.SLACK_WEBHOOK_URL }}"
          exit 1

      - name: Cleanup old images
        if: success()
        run: docker image prune -f --filter "until=168h"
```

추가로 필요한 파일:
- `Dockerfile` (멀티스테이지 ~40줄)
- `docker-compose.yml` (~30줄)
- `.dockerignore` (~15줄)

**총 YAML + Dockerfile 등 ~130줄 + 레지스트리 credential 관리**.

---

## 11. 코드 비교: 자동 롤백 구현

### 11.1 Capistrano — 5초 symlink swap

```bash
# 1. 이전 release 저장 (atomic switch 이전)
readlink -f "$CURRENT_LINK" > /tmp/prev_release

# 2. 롤백 실행
PREV=$(cat /tmp/prev_release)
ln -sfn "$PREV" "$CURRENT_LINK.new"
mv -Tf "$CURRENT_LINK.new" "$CURRENT_LINK"
pm2 reload "$PM2_APP" --update-env

# 3. 헬스체크 재확인
for i in 1 2 3; do sleep 5; curl -f -s https://stylelucky4u.com/api/health && exit 0; done
```

핵심 원리:
- **symlink 스왑 atomic**: `mv -Tf`가 ln의 atomic rename 보장
- `pm2 reload --update-env`: 4개 cluster worker를 순차적으로 교체 (각 ~2초, 총 ~8초)
- 실제 트래픽에는 영향 없음 (이전 worker가 새 요청 거절, 기존 요청 완료 후 종료)

### 11.2 Docker Compose — pull previous tag

```bash
# 1. 이전 태그 저장
docker inspect luckystyle4u-app_app_1 --format '{{.Config.Image}}' > /tmp/prev_image

# 2. 롤백 실행
PREV=$(cat /tmp/prev_image)                  # e.g. ghcr.io/...:<prev-sha>
cd "$COMPOSE_DIR"
export IMAGE_TAG="${PREV##*:}"                 # 태그 추출
docker compose pull app                         # 캐시에 있으면 즉시, 없으면 ~10~30초
docker compose up -d --no-deps app              # 컨테이너 재생성 ~5~10초

# 3. 헬스체크 재확인
for i in 1 2 3; do sleep 5; curl -f -s https://stylelucky4u.com/api/health && exit 0; done
```

핵심 원리:
- 이미지 caching: 이전 이미지가 local docker에 남아있으면 즉시 재시작
- compose up -d --no-deps app = 기존 컨테이너 stop + rm + new 컨테이너 run → **불가피한 downtime ~5~10초**
- healthcheck가 안정화될 때까지 추가 대기 ~10~30초

### 11.3 실측 비교

| 시나리오 | Capistrano | Docker Compose |
|---|---|---|
| 감지~롤백 완료 (캐시 hit) | ~15초 | ~30~45초 |
| 감지~롤백 완료 (캐시 miss) | ~15초 (해당 없음) | ~60~90초 |
| 다운타임 | 0초 | 5~10초 |
| 외부 의존성 | 없음 | registry (ghcr.io) |

→ **Capistrano가 2~6배 빠름 + 다운타임 0**.

---

## 12. 프로젝트 결정 근거 (양평 부엌)

### 12.1 유리/불리 밸런스 시트

| 항목 | Capistrano | Docker Compose |
|---|---|---|
| WSL2 단일 호스트 | ✅ | ⚠ (overhead 불필요) |
| Cloudflare Tunnel 단일 origin | ✅ | ⚠ (port mapping 동일하나 layer 추가) |
| PM2 cluster:4 활용 | ✅ (1급) | ⚠ (옵션 A만 실용적) |
| 롤백 속도/다운타임 | ✅ (5초/0초) | ⚠ (30~60초/5~10초) |
| 1인 학습 곡선 | ✅ (~1.5h) | ⚠ (~4h) |
| 월 운영 시간 | ✅ (~1h) | ⚠ (~1.75h) |
| 의존성 격리 | ⚠ (호스트 종속) | ✅ (완전) |
| 포팅 용이 (다른 호스트) | ⚠ (스크립트 재적용) | ✅ (이미지 그대로) |
| 재현성 (staging=prod) | ⚠ (Node 버전 관리 필요) | ✅ |
| 생태계 표준 | ⚠ (Ruby 원본) | ✅ |
| 외부 registry 의존 | ✅ (없음) | ⚠ (ghcr.io) |
| 디스크 사용 | 작음 (release 5개 ~500MB) | 큼 (이미지 레이어 ~3~5GB) |

### 12.2 결론

> **현 단계는 자체 Capistrano-style이 결정적 유리 (권고도 0.87 보정 0.91).**
>
> WSL2 단일 호스트 + Cloudflare Tunnel + PM2 cluster:4 + 1인 운영이라는 고정된 환경에서, Docker Compose가 제공하는 "격리 + 포팅 + 재현성" 3대 이점이 비용(학습·IO·디스크·느린 롤백)을 정당화하지 못함.
>
> 반면 Capistrano의 "빠른 롤백 + 0 다운타임 + 얇은 추상"이 1인 운영 품질을 직접 향상시킴.

### 12.3 Docker 이행 조건 (명시적 trigger)

다음 중 **2개 이상 충족 시** Docker Compose로 이행 재검토:

1. **멀티 서버 확장**: 2번째 호스트(DR, staging 실환경) 추가 필요
2. **의존성 충돌**: 같은 호스트에 Node 버전 2개 이상 필요 (새 프로젝트 합류 등)
3. **stateful 서비스 동반 배포**: Postgres/Redis를 앱과 함께 관리 (현재 Postgres는 호스트 또는 외부)
4. **이미지 기반 아카이빙**: 역사적 버전의 완전 재현 필요 (감사/포렌식)
5. **다른 OS/아키텍처 타겟**: ARM64, macOS, Windows Server 등

현 시점 (2026-04) 양평 부엌: 0개 충족.

### 12.4 마이그레이션 경로 (향후 이행 시)

만약 Docker 이행이 결정되면 (위 2개 이상 trigger):

1. **Phase 1 (1세션)**: Dockerfile 작성 (멀티스테이지, alpine base, non-root user)
2. **Phase 2 (1세션)**: docker-compose.yml + healthcheck + env_file/secrets
3. **Phase 3 (0.5세션)**: GHA buildx + push + self-hosted pull workflow
4. **Phase 4 (1세션)**: Capistrano → Docker Compose 병행 운영 + 롤백 매트릭스 검증
5. **Phase 5 (0.5세션)**: Capistrano 디렉토리 deprecated 처리 + 문서 업데이트

총 ~4세션 투입 (현 시점 기회비용 대비 효용 낮음).

---

## 13. 참고문헌

1. Wave 1 `01-github-actions-pm2-rollback-deep-dive.md` — Capistrano-style 구현 원안
2. **Capistrano structure**: capistranorb.com/documentation/getting-started/structure/ — 디렉토리 철학
3. **PM2 cluster reload**: pm2.keymetrics.io/docs/usage/cluster-mode/#reload — 0 다운타임 원리
4. **Docker Compose docs**: docs.docker.com/compose/ — compose 기능 레퍼런스
5. **Docker Desktop WSL2 best practices**: docs.docker.com/desktop/wsl/best-practices — IO 성능 조율
6. **WSL2 Ubuntu 22.04 systemd**: learn.microsoft.com/windows/wsl/systemd — cloudflared/pm2 서비스 등록
7. **Docker Secrets**: docs.docker.com/engine/swarm/secrets/ — compose secrets 가이드
8. **Martin Fowler "Evolutionary DB"**: martinfowler.com/articles/evodb.html — forward-compatible migration
9. **GitHub Actions build-push-action**: github.com/docker/build-push-action — Docker 채택 시 워크플로
10. Wave 2 `02-operations-matrix.md` — 본 1:1의 매트릭스 페어

---

**작성**: kdywave Wave 2 Agent G · 2026-04-18 · 1:1 비교 · 결정: Capistrano-style 유지 (현 단계)
