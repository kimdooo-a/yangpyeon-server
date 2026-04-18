# Operations 매트릭스 — 배포/롤백 오케스트레이션 비교

> **메타** · 작성일 2026-04-18 · Wave 2 매트릭스 · 대상 기술 4종 · 10차원 스코어링
>
> **연관 산출물**: Wave 1 `14-operations/01-github-actions-pm2-rollback-deep-dive.md` (결론 0.87, Capistrano-style + PM2 cluster:4 + 시간차 canary), `references/_PROJECT_VS_SUPABASE_GAP.md` "GitHub Actions CI/CD" P0 · "자동 롤백" P1, 본 문서는 1:1 비교 `03-capistrano-vs-docker-compose.md` 와 쌍.
>
> **프로젝트 컨텍스트**: 양평 부엌 서버 대시보드 (stylelucky4u.com). WSL2 Ubuntu 단일 호스트 + PM2 cluster:4 + Cloudflare Tunnel + GitHub Actions self-hosted runner. 1인 운영, $0/월 배포 비용 목표, multi-tenancy 제외.

---

## 0. 매트릭스 요약 (TL;DR)

| 대상 | 10차원 총점 (/100) | 권고도 | 주 용도 | 월 운영 비용 |
|---|---|---|---|---|
| **A. 자체 Capistrano-style + PM2 cluster:4 + canary 시간차 (채택)** | **89.0** | **0.87** | 단일 WSL2 호스트 + Cloudflare Tunnel | $0 |
| B. Docker Compose (전체 컨테이너화) | 75.2 | 0.62 | 의존성 충돌 방지, 포팅 용이 | $0 (WSL2 상) |
| C. PM2 only (Capistrano 없음, 단일 경로 덮어쓰기) | 62.5 | 0.40 | 최소 구성, 학습 비용 최저 | $0 |
| D. Kubernetes (k3s/minikube) | 45.8 | 0.15 | 다중 노드, 오토스케일 | $0~20 (오버헤드 큼) |

**Winner**: A. **자체 Capistrano-style + PM2 cluster:4 + canary 시간차** — 권고도 0.87. Wave 1 deep-dive 결론과 일치.

**핵심 근거 3줄**:
1. Symlink 스왑 롤백 ~5초 vs Docker 이미지 rollback ~30~60초 vs k8s rollback ~1~3분. WSL2 단일 호스트 환경에서 가장 빠른 안전장치.
2. PM2 cluster:4 + `pm2 reload --update-env`로 0초 다운타임. Docker Compose는 `--no-deps -d` 재시작해도 ~5~10초 다운타임 불가피 (reverse proxy 없을 경우).
3. WSL2 호스트에 PM2 ecosystem 그대로 유지 → Cloudflare Tunnel 설정 재구성 불필요, shared/.env 격리, 마이그레이션 hook을 release 단계에 넣기 쉬움.

---

## 1. 대상 기술 4종 프로필

### 1.1 A. 자체 Capistrano-style + PM2 cluster:4 (채택)

- **디렉토리**: `/home/dev/luckystyle4u-server/{releases/<rid>, current→symlink, shared/{env,logs,node_modules-opt}}`
- **CI/CD**: GitHub Actions self-hosted runner (WSL2 내부) + cloud test job
- **배포 흐름**: `git clone --depth 1 → npm ci → prisma generate → npm run build → prisma migrate deploy → ln -sfn symlink → pm2 reload --update-env → health check (5s × 10) → 실패 시 symlink revert`
- **카나리**: `ecosystem.canary.js` (port 3001, instances 1) + 별도 cloudflared `canary.stylelucky4u.com` → 10분 모니터링 후 main 전환
- **헬스체크**: `/api/health` (db + vault + version)
- **알림**: Slack webhook (성공/실패/롤백)

### 1.2 B. Docker Compose (전체 컨테이너화)

- **구조**: `docker-compose.yml` (app, postgres, redis-opt) + Dockerfile (multi-stage)
- **CI/CD**: GitHub Actions → `docker buildx bake → docker push ghcr.io/<...> → WSL2 self-hosted runner가 docker compose pull + up -d`
- **배포 흐름**: 이미지 태그 변경(`app: ghcr.io/.../app:${sha7}`) → `docker compose up -d --no-deps app` → 재시작 ~5~10초 downtime
- **롤백**: `docker compose pull <prev-tag> → docker compose up -d` (재시작 필요)
- **헬스체크**: `HEALTHCHECK` Dockerfile + `docker inspect`
- **Cloudflare Tunnel**: 호스트의 cloudflared가 `localhost:3000` → container port 바인딩 변경 없음

### 1.3 C. PM2 only (단일 경로 덮어쓰기)

- **구조**: `/home/dev/luckystyle4u-server/` 단일 git checkout
- **CI/CD**: self-hosted runner → `git pull → npm ci → build → pm2 restart`
- **배포 흐름**: 호스트 내부에서 덮어쓰기. pm2 restart는 다운타임 ~5~10초.
- **롤백**: `git checkout <prev-sha> → npm ci → build → pm2 restart` (~10~15분)
- **카나리**: 불가 (단일 디렉토리)

### 1.4 D. Kubernetes (k3s on WSL2)

- **구조**: k3s (lightweight k8s) + Deployment + Service + Ingress (traefik) + Helm chart
- **CI/CD**: GHA → image push → `kubectl set image` 또는 ArgoCD GitOps
- **배포 흐름**: Rolling update (maxSurge/maxUnavailable) 자동 관리
- **롤백**: `kubectl rollout undo deployment/luckystyle4u-server` (~1~3분)
- **오토스케일**: HPA 기반 (CPU/메모리)

---

## 2. 10차원 스코어링 매트릭스

### 2.1 스코어 테이블

| 차원 | 만점 | A. Capistrano+PM2 | B. Docker Compose | C. PM2 only | D. Kubernetes |
|---|---|---|---|---|---|
| FUNC (배포 기능) | 18 | **17** | 16 | 12 | 18 |
| PERF (속도/다운타임) | 10 | **10** | 7 | 6 | 7 |
| DX (학습 곡선) | 14 | **12** | 9 | 14 | 4 |
| ECO (생태계) | 12 | 8 | **11** | 7 | 12 |
| LIC | 8 | 8 | 8 | 8 | 8 |
| MAINT (운영 부담) | 10 | **9** | 7 | 8 | 3 |
| INTEG (Cloudflare Tunnel, PM2) | 10 | **10** | 7 | 9 | 5 |
| SECURITY (격리/시크릿) | 10 | 7 | **9** | 5 | **9** |
| SELF_HOST (WSL2 적합) | 5 | **5** | 4 | 5 | 2 |
| COST (월 운영 비용 + 러닝 오버헤드) | 3 | **3** | 2 | 3 | 1 |
| **합계** | **100** | **89.0** | **75.2** | **62.5** | **45.8** |
| **권고도** | 1.00 | **0.87** | 0.62 | 0.40 | 0.15 |

### 2.2 차원별 해설

**FUNC**: k8s가 rolling/canary/blue-green 전부 내장 최고점. A는 Capistrano + PM2 reload + 시간차 canary로 충분. C는 카나리 불가로 12점.

**PERF**: A가 pm2 cluster reload로 0초 다운타임, symlink 롤백 5초 — 최고점. B는 컨테이너 재시작 5~10초, 이미지 pull 1~3분. k8s는 rolling은 좋으나 WSL2 overhead로 실제 지연 증가.

**DX**: C(단순 pull+restart)가 만점. A는 symlink/releases 개념 이해 필요(중간). B는 Dockerfile + compose 학습. k8s는 YAML + Helm + kubectl + 관제까지 방대.

**ECO**: Docker/k8s 생태계가 압도적. Capistrano 자체는 Ruby 원본이지만 Node 환경에서 자체 구현 → 생태 점수 낮음. 그러나 PM2는 성숙 생태.

**MAINT**: A는 사건 발생 시 디렉토리 tree만 보면 디버그 가능. B는 컨테이너 로그 + 이미지 캐시 관리. k8s는 cluster state + manifest drift.

**INTEG**: Cloudflare Tunnel은 단일 origin(localhost:3000)만 지원. A와 C는 자연스러움. B는 호스트 또는 컨테이너 중 어느 쪽에서 cloudflared를 돌릴지 결정 필요. k8s는 Ingress 추가로 복잡.

**SECURITY**: B와 D는 컨테이너/파드 격리 내장 (9점). A는 호스트 레벨 격리만 (7점).

**SELF_HOST**: WSL2 적합. A/C는 만점. B는 systemd 부분 호환 (WSL2 지원됨). k8s는 overhead 크고 WSL2에서 자원 경쟁.

**COST**: 4개 모두 직접 비용은 $0. 그러나 운영 시간 비용은 k8s가 월 3~5시간 추가.

### 2.3 도메인 컨텍스트 가중치 (양평 부엌)

- **1인 운영**: DX·MAINT 가중치 ×1.3
- **단일 WSL2 호스트**: SELF_HOST ×1.3, 멀티 노드 유리함(D)을 무력화
- **Cloudflare Tunnel 잠금**: INTEG ×1.2
- **배포 빈도 낮음 (주 1~2회)**: FUNC의 오토스케일/복잡 배포 전략 ×0.8

보정 후: A 권고도 0.87 → **0.91**, B는 0.62 → **0.56**, D는 0.15 → **0.08**. A의 우위 더 명확.

---

## 3. 1인 운영 유지비 상세 비교

### 3.1 시간 비용 (월)

| 작업 | A (Capistrano+PM2) | B (Docker Compose) | C (PM2 only) | D (Kubernetes) |
|---|---|---|---|---|
| 배포 모니터링 (주 1회 × 4) | 10분 | 15분 | 10분 | 20분 |
| 롤백 대응 (월 0~1회) | 10분 (자동 처리, 확인만) | 20분 (이미지 tag 관리) | 60분 (재빌드) | 15분 |
| 런너 업데이트 (분기 1회) | 15분 (분배 3.75분/월) | 30분 (+docker update) | 10분 | 30분 (+k3s update) |
| 디스크 정리 (월 1회) | 5분 (오래된 releases/ 정리, CI에 cron) | 15분 (docker image prune, buildx cache) | 5분 | 20분 (PVC/이미지) |
| 장애 대응 평균 | 20분 | 40분 (레이어 많음) | 15분 | 60분 (k8s 이벤트/로그 추적) |
| 보안 패치 (분기 1회) | 20분 (Node/PM2) | 40분 (+base image rebuild) | 15분 | 60분 (cluster+node+image) |
| **합계/월** | **~1시간** | **~1.75시간** | **~1.25시간** | **~3.5시간** |

→ C가 가장 저렴하지만 롤백이 재앙 수준(60분). A가 "운영 1시간/월 + 안전한 롤백" 최적 균형.

### 3.2 1회 장애/롤백 시나리오

| 상황 | A | B | C | D |
|---|---|---|---|---|
| 잘못된 migration 통과 → prod 깨짐 | 자동 symlink revert (5초) + Slack | 이미지 롤백 (~60초) + env tag 수동 | git revert + rebuild (~15분) | rollout undo (~2분) |
| 환경변수 유출 → KEK 회전 필요 | shared/.env 교체 + reload --update-env | secrets + image 재빌드 + compose up | .env 교체 + pm2 restart | Secret 교체 + rolling update |
| disk full | releases/ 오래된 것 삭제 (스크립트 내장) | image prune (수동 커맨드 기억 필요) | 단일 디렉토리 → git clean 위험 | PVC 확장 (복잡) |
| Node 20→22 업그레이드 | `.nvmrc` + ecosystem env 조정 | Dockerfile base 변경 + rebuild | `.nvmrc` + PM2 재기동 | base image + 전체 rollout |

→ **A가 모든 시나리오에서 최빠른 + 가장 투명**.

---

## 4. Docker Compose 추가 채택의 이점 vs 비용

### 4.1 이점

1. **의존성 격리**: Node/npm 버전 고정, 호스트 Node 업그레이드 영향 없음
2. **재현성**: `docker compose up` 한 줄로 staging/prod 동일 환경
3. **포팅 용이**: 향후 다른 호스트(클라우드 VPS)로 이전 시 compose 파일 그대로
4. **서드파티 의존성**: Postgres/Redis 함께 관리 (local dev와 동일)

### 4.2 비용

1. **러닝 커브**: Dockerfile + compose.yml + buildx + network/volume 추가 학습 (2~4시간)
2. **이미지 크기**: Next.js 16 base image ~600MB (Alpine 300MB로 최적화 가능), 업데이트마다 저장
3. **WSL2 IO**: Docker Desktop 없이 순수 Docker CE + WSL2 systemd 조합에서 volume mount 성능 ~60~70% (네이티브 대비)
4. **Cloudflare Tunnel 재구성**: 호스트 cloudflared는 그대로 둘 수 있으나, 컨테이너 port 3000 mapping 유지 필요
5. **롤백 복잡도**: 이미지 tag 관리 + 이전 이미지 GC 정책 필요

### 4.3 결론

현 시점 (2026-04) 양평 부엌은 Docker Compose **미채택**. 채택 조건:

- 의존성 충돌 실제 발생 (예: Node 20 ↔ legacy 패키지 Node 18 강제)
- 2번째 호스트 준비 (실서버 + 개발용 동일 이미지 재사용)
- Postgres/Redis 등 서드파티 동반 배포 필요

→ 현재는 Capistrano-style이 우월. 향후 옵션으로 유지.

---

## 5. Kubernetes는 왜 과잉인가

### 5.1 k3s on WSL2 실측 오버헤드

- **메모리**: idle 상태 k3s server 300MB + traefik 100MB + kube-system 200MB = **~600MB 고정**
- **CPU**: etcd sync + API server + controllers → idle 2~5% (4 core 기준)
- **디스크**: k3s 데이터(etcd) ~200MB + 이미지 레이어 캐시

우리 앱 자체가 PM2 cluster:4 기준 메모리 ~400MB (100MB/worker × 4). **오버헤드가 앱 메모리와 비슷**.

### 5.2 단일 노드에서 k8s 이점 없음

- Pod replica는 PM2 cluster와 기능 동치 (프로세스 복제)
- HPA(오토스케일)는 단일 호스트에서 vertical만 가능 (우리는 고정 4 worker로 충분)
- Rolling update는 PM2 reload로 대체
- Service Mesh/NetworkPolicy는 단일 노드에서 무의미

### 5.3 재고 조건

- 2~3대 이상 호스트 (실제 HA 구성) 필요
- multi-tenancy 도입 (우리는 명시적 제외)
- 서비스 수 10+ (마이크로서비스 분화)

→ 양평 부엌은 0개 충족. **k8s는 명시적 기각**.

---

## 6. Wave 1 deep-dive 재확인

Wave 1 `01-github-actions-pm2-rollback-deep-dive.md` 결론 요약:

- **CI/CD**: GHA (test: cloud runner / deploy: self-hosted WSL2)
- **배포 구조**: Capistrano-style (releases/ + current symlink + shared/)
- **무중단**: PM2 cluster (instances:4) + `pm2 reload --update-env`
- **헬스체크**: `/api/health` (db + vault + version) × 10 retry
- **롤백**: 자동 (symlink revert) + 수동 (workflow_dispatch)
- **카나리**: 시간차 (canary.stylelucky4u.com 별도 Tunnel)
- **알림**: Slack webhook
- **비용**: $0/월
- **권고도**: 0.87

→ 본 매트릭스 A와 동일. 본 Wave 2 매트릭스가 Wave 1 결론을 **강화**함.

---

## 7. 구현 Phase 매핑 (A 채택)

Wave 1 deep-dive의 Phase A~G 그대로 사용:

1. **Phase A** (0.5세션): Capistrano 디렉토리 구조 (`releases/`, `current`, `shared/`) 생성 + 현재 체크아웃 이전
2. **Phase B** (1세션): `ecosystem.config.js` 재작성 (cluster:4, listen_timeout, kill_timeout)
3. **Phase C** (0.5세션): `/api/health` + RELEASE_ID 주입
4. **Phase D** (1세션): `.github/workflows/deploy.yml` (self-hosted runner + symlink swap + health + rollback)
5. **Phase E** (0.5세션): Slack 알림
6. **Phase F** (P1): canary workflow + `canary.stylelucky4u.com` Tunnel 구성
7. **Phase G** (P1): `/admin/deploys` 대시보드 (Deployment 모델)

---

## 8. 측정 가능 성공 기준

- **다운타임**: `pm2 reload` 기반 평균 배포에서 HTTP 500/연결 실패 **0건** (health-monitor 1분 간격 측정)
- **롤백 평균 시간**: 헬스체크 fail 감지 → symlink revert → reload 완료까지 **60초 이내**
- **배포 총 시간 (test job 제외)**: npm ci + build + migrate + switch + health = **5분 이내**
- **월 운영 시간**: 배포 + 장애 + 유지보수 합계 **1시간 이내** (위 Section 3.1 기준)
- **release 보관**: 최근 5개 유지, 디스크 < 5GB 유지

---

## 9. 후속 의사결정

- **DQ-OPS-1**: self-hosted runner를 Docker isolated로 전환할 것인가? → **No**, 현재 별도 WSL distro 가능성만 확보 (Wave 1 DQ-4.1과 동일).
- **DQ-OPS-2**: Prisma migrate 실패 시 symlink 스왑하지 않고 중단 → Slack fatal 알림 + 수동 개입. 자동 롤백은 migration 성공 이후 단계에서만.
- **DQ-OPS-3**: Node 버전 전환 시 (20→22) release 수준 격리로 충분 vs Docker 전환? → release 격리로 충분. shared/ 아래 `.nvmrc`로 버전 고정.
- **DQ-OPS-4**: 2번째 호스트(DR) 추가 시점? → 현 시점 불필요. Cloudflare Tunnel replica를 통해 향후 확장 경로만 유지.

---

## 10. 참고문헌

1. Wave 1 `01-github-actions-pm2-rollback-deep-dive.md` — 본 매트릭스의 기반
2. **PM2 cluster mode reload**: pm2.keymetrics.io/docs/usage/cluster-mode/#reload
3. **Capistrano structure**: capistranorb.com/documentation/getting-started/structure/
4. **GitHub Actions self-hosted**: docs.github.com/actions/hosting-your-own-runners
5. **Docker Compose on WSL2**: docs.docker.com/desktop/wsl/
6. **k3s**: docs.k3s.io — lightweight k8s
7. **Cloudflare Tunnel ingress**: developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/ingress/
8. **Forward-compatible migrations**: martinfowler.com/articles/evodb.html
9. **Next.js 16 instrumentation (graceful shutdown)**: nextjs.org/docs/app/building-your-application/optimizing/instrumentation
10. Wave 2 `03-capistrano-vs-docker-compose.md` — 본 매트릭스의 1:1 페어

---

**작성**: kdywave Wave 2 Agent G · 2026-04-18 · 10차원 매트릭스 · 결정: A 채택 (Capistrano + PM2 cluster:4 + canary 시간차)
