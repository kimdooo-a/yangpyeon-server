# ADR-025: 인스턴스 배포 모델 — N=10~20 tenant 의 토폴로지 결정

- **상태**: **ACCEPTED (2026-04-26, 옵션 A)**
- **날짜**: 2026-04-26 (BaaS Foundation Wave, Sub-agent #4 산출)
- **결정자**: 프로젝트 오너 (2026-04-26 세션 58)
- **Related**: ADR-020 (standalone + rsync + pm2 reload), ADR-024 (plugin 코드 격리), ADR-028 (cron worker pool / per-tenant isolation)
- **Supersedes**: 없음 — ADR-001 §1.3 단일 인스턴스 결정의 **재검토**이지 무효화 아님
- **Spike 의존**: SP-010 (PM2 cluster:4 vs fork, 조건부 Go)

---

## 1. 컨텍스트

### 1.1 사실 (재정의 금지)

`00-context/01-existing-decisions-audit.md` §1.3 에 따라:

- **ADR-001 §L0 인프라**: WSL2 Ubuntu + PM2 + 단일 Node 프로세스 + 단일 PostgreSQL + 단일 SQLite + 단일 SeaweedFS — **현재 운영**
- **ADR-020 (세션 50)**: standalone 패키지 + rsync + pm2 reload 배포 모델 — **현재 운영**
- **세션 56 운영 진화**: `wsl-build-deploy.sh` 8단계 파이프라인 + ADR-021 빌드 게이트 — **현재 운영**
- **SP-010 (세션 29, 2026-04-19)**: PM2 cluster:4 vs fork = +39.9% RPS, advisory lock 0건 충돌. **판정 = 조건부 Go**. 즉시 전환 아님 — Phase 16 진입 임계값(p95 200ms / CPU 70% / 503 0.1%) 도달 시 전환.

### 1.2 새 제약 (재검토 트리거)

`00-context/01-existing-decisions-audit.md` §1.1 에 따라 멀티테넌시 미지원 결정의 4가지 재검토 트리거 중 2개가 충족됨:

1. ✅ 사용자 2명+ 6개월 이상 지속 (10~20개 프로젝트 영구 운영)
3. ✅ "독립 팀/조직 관리" FR 신규 추가

**결과**: 단일 tenant 가정 위에 만들어진 ADR-001 §L0 인스턴스 모델을 N=10~20 tenant 시나리오로 재검토해야 한다. 본 ADR 가 그 결정 문서.

### 1.3 본 ADR 의 정확한 스코프

본 ADR 은 **"지금 만들 인프라"가 아니라 "코드 추상화의 격리 경계"**를 결정한다. 즉:

- 옵션 A 로 가더라도 ADR-024 의 plugin 시스템과 ADR-028 의 worker pool 격리 추상화는 **미래의 옵션 분리(B/C/D)를 가능케 하도록** 설계해야 한다.
- 즉 본 ADR 의 결정은 (a) 1차 배포 토폴로지, (b) 코드 레이어 격리 경계의 **하한**, 두 가지를 동시에 정한다.
- 1차 배포 토폴로지를 옵션 A 로 정해도 코드 추상화는 옵션 D 진화를 가로막지 않아야 한다.

---

## 2. 검토 대상 옵션 (4안)

### 2.1 옵션 A — 단일 인스턴스, 모든 tenant 공유 (현재 인프라 유지)

**구성**:
- WSL2 Ubuntu + PM2 (현재 fork 1개, Phase 16 진입 시 cluster:4)
- 단일 PostgreSQL 인스턴스 (RLS 또는 schema-per-tenant 로 데이터 격리는 ADR-023 결정)
- 단일 SQLite (audit_logs)
- 단일 Cloudflare Tunnel (`stylelucky4u.com`)
- 모든 tenant 가 같은 Node 프로세스, 같은 DB connection pool, 같은 SeaweedFS 버킷 공유

**Phase 16 (PM2 cluster:4) 진입 조건** (SP-010 §8 확정):
- p95 응답 지연 > 200ms
- CPU 사용률 > 70% 지속 5분 이상
- 503 에러율 > 0.1%

**장점**:
- 운영 단순 — 현재 인프라 그대로. 1인 운영 부담 0 추가.
- 비용 최저 — VM 1개, Tunnel 1개, DB 1개.
- ADR-020 standalone + rsync + pm2 reload 가 그대로 작동.
- 디버깅 단순 — 단일 프로세스, 단일 로그 스트림.

**단점**:
- 단일 장애점 (SPOF) — Node 프로세스 crash 시 N=20 모두 down.
- noisy neighbor — 한 tenant 의 SQL 쿼리가 pool 점유, 한 tenant 의 cron 이 CPU 점유 → 다른 tenant 영향.
- scaling 한계 — vertical 만 가능 (WSL2 단일 머신 RAM/CPU 한도).
- 컨슈머별 독립 업데이트 불가 — 모든 tenant 가 동일 코드 버전.

**현재 적합도**: ✅ Phase 1~3 (N=1~5) 동안 충분.

---

### 2.2 옵션 B — Tier 분리 (free / vip 인스턴스 2개)

**구성**:
- 동일 머신(WSL2 Ubuntu) 내 PM2 프로세스 2개 — 다른 포트 (`:3000` free, `:3001` vip), 다른 PM2 name
- 또는 docker-compose 로 격리 (현재는 PM2, 추후 docker 마이그레이션 옵션)
- Cloudflare Tunnel ingress 라우팅:
  - `*.free.stylelucky4u.com` → `:3000`
  - `*.vip.stylelucky4u.com` → `:3001`
  - 또는 `stylelucky4u.com` 단일 hostname + path 라우팅
- DB 옵션:
  - **B-1**: 단일 PostgreSQL + 인스턴스별 schema 분리
  - **B-2**: PostgreSQL 인스턴스 2개 (free/vip 격리 강화)
- "free tier": 본인 사이드 프로젝트 10개 공유
- "vip tier": 트래픽 큰 1~2개 프로젝트 전용

**장점**:
- 중요 컨슈머(VIP) 격리 — VIP tenant 의 응답이 free tier 의 noisy neighbor 영향에서 분리.
- 점진적 scaling 옵션 — VIP 만 cluster:4, free 는 fork 유지 가능.
- ADR-020 호환 — 동일 standalone 패키지를 두 PM2 인스턴스에 동시 배포 가능.

**단점**:
- 운영 부담 약 1.5~2배 — PM2 프로세스 2개, ecosystem.config.cjs 2개, 헬스체크 2벌.
- 정책 결정 필요 — 어떤 컨슈머가 어디로 가는가? 승급/강등 기준은? Manifest(ADR-026) 와 강결합.
- Cloudflare Tunnel hostname 추가 관리 — 현재 단일 hostname 운영 단순성 일부 상실.
- DB B-2 옵션 채택 시 backup/PITR/migration 운영이 2배.

**현재 적합도**: △ Phase 4+ (N=10 도달 + VIP tenant 분리 요구 발생 시).

---

### 2.3 옵션 C — 컨슈머별 인스턴스 (yangpyeon = OSS 패키지)

**구성**:
- yangpyeon 코드를 npm package + Docker image 화 (현재 standalone 패키지를 OSS 형태로 정형화)
- 각 컨슈머 = 별도 PM2 인스턴스 + 별도 PostgreSQL DB + 별도 Tunnel hostname
- 컨슈머별 독립 deploy 라이프사이클

**장점**:
- 격리 최강 — 프로세스/DB/네트워크 모두 컨슈머별 분리. noisy neighbor 0.
- 컨슈머별 독립 업데이트 — 한 컨슈머가 v1.5, 다른 컨슈머가 v2.0 운영 가능.
- 컨슈머별 백업/복구 정책 자율.
- multi-region 확장 가능 (한국 / 미국 등).

**단점**:
- 운영 부담 N배 — N=20 시 PM2 프로세스 20개, DB 20개, Tunnel hostname 20개, .env 20벌.
- **1인 한계 초과** — 세션 56 audit fail-soft 같은 단일 운영 진화도 N=20 인스턴스 일괄 적용 비용 폭증.
- 비용 중간~고 — VM/네트워크/DB 인스턴스 비용이 컨슈머 수에 비례.
- Phase 1 호환 ❌ — 현재 인프라(WSL2 단일) 와 호환 안 됨, 별도 IaC/k8s 필요.

**현재 적합도**: ❌ — 특정 VIP 컨슈머가 명시적으로 분리 요구할 때만 그 컨슈머에 한해 적용.

---

### 2.4 옵션 D — 단일 인스턴스 + 동적 worker pool

**구성**:
- 옵션 A 의 진화: PM2 fork 1개 + 내부 `worker_threads` pool 로 tenant 격리
- HTTP 핸들러는 main thread 에서, **cron / EdgeFunction / 무거운 SQL 은 worker thread 에서 실행**
- tenant별 cap (ms/req, CPU%, RSS) 강제
- ADR-028 (cron worker pool / per-tenant isolation) 와 강결합 — 본 옵션은 ADR-028 을 인스턴스 수준에서 흡수한 형태

**장점**:
- 격리 (중-강) + 운영 단순 (옵션 A 와 동일한 PM2 1개)
- noisy neighbor 완화 — main thread 가 핸들러를, worker pool 이 무거운 작업을 처리하므로 한 tenant 의 cron 이 다른 tenant 의 HTTP 응답을 막지 않음.
- ADR-020 호환 — 단일 standalone 패키지에 worker pool 코드 포함, 동일한 rsync + pm2 reload.
- N=20 까지 vertical scaling 가능 — worker pool 크기 조절로.

**단점**:
- **구현 복잡** — worker_threads 통신, 결과 직렬화, worker 재시작/재기동 로직 필요.
- ADR-028 과 강결합 — ADR-028 결정 전에는 옵션 D 채택 어려움.
- DB connection pool 격리는 별도 — worker thread 간 pool 공유 또는 thread별 client 결정 필요.
- 디버깅 복잡 — worker 내부 stack trace 추적 도구 필요.

**현재 적합도**: ✅ Phase 4+ 진화 옵션. ADR-028 결정 후 채택 가능.

---

## 3. 비교 매트릭스

| 차원 | A 단일 | B Tier | C per-consumer | D worker pool |
|------|-------|--------|----------------|---------------|
| 운영 부담 | 저 (1×) | 중 (1.5~2×) | 고 (N×) | 중 (1.2×) |
| 격리 강도 | 약 | 중 | 강 | 중-강 |
| N=20 적합도 | △ | ✅ | ✅ | ✅ |
| 비용 | 최저 | 저 | 중~고 | 저 |
| Phase 1 호환 (현재 인프라) | ✅ | △ (변경) | ❌ | ✅ |
| ADR-020 호환 | ✅ | ✅ | △ (재패키징) | ✅ |
| SPOF | 1 | 2 | N | 1 (worker별 분리) |
| 컨슈머별 독립 업데이트 | ❌ | △ (Tier별만) | ✅ | ❌ |
| 디버깅 복잡도 | 저 | 중 | 고 | 중-고 |
| Phase 16 SP-010 정합성 | ✅ (cluster:4 적용) | ✅ (Tier별) | △ (Tier 개념 약화) | ✅ (worker pool 별도) |

---

## 4. 핵심 분석 (필수 항목)

### 4.1 PM2 fork vs cluster vs worker_threads 차이

| 모드 | 동작 | 장점 | 단점 | Cloudflare Tunnel 호환성 |
|------|------|------|------|---------------------------|
| **PM2 fork** | 단일 Node 프로세스. 단일 포트 점유. | 디버깅 단순, 메모리 70MB. 현재 운영. | 단일 코어만 사용. CPU 바운드 시 병목. | ✅ Tunnel 1 hostname → 1 origin. 무관. |
| **PM2 cluster** | 내부 `cluster` 모듈로 N worker fork. 동일 포트를 master 가 round-robin 분배. | RPS +39.9% (SP-010), 4 코어 활용. | SQLite WAL 락 우려 (SP-010 §3 측정 결과 0.000% — 우려 해소). PM2 v6 `delete all --namespace` 버그 (SP-010 §7). | ✅ Tunnel 변경 0 — origin port 동일. |
| **worker_threads** | 동일 프로세스 내 별도 V8 isolate. 메모리 부분 격리. | tenant별 cap 가능. cron / EdgeFunction 격리에 적합. | 직접 통신 비용. main thread 와 데이터 전달 직렬화. | ✅ Tunnel 무관 (HTTP 핸들러는 main thread). |

**Cloudflare Tunnel 핵심**: 모든 모드가 origin port 1개로 충분. Tunnel 은 process model 무관.

**옵션별 매핑**:
- A 1차: PM2 fork (현재). 진화 시 PM2 cluster:4.
- B: PM2 fork 또는 cluster × 2 인스턴스 (free/vip).
- C: PM2 fork × N 인스턴스 (각 컨슈머).
- D: PM2 fork 1개 + 내부 worker_threads pool.

### 4.2 단일 PostgreSQL 의 한계점

| 차원 | 단일 DB 위험 (옵션 A 가정) | 완화책 |
|------|----------------------------|---------|
| **connection pool tier** | 모든 tenant 가 동일 pool 공유 → 한 tenant 의 long-running query 가 pool 고갈. | tenant별 max_connections cap (앱 레이어), pgbouncer transaction pool 도입. |
| **statement_timeout** | 전역 설정 → tenant별 차등 불가. SQL Editor 의 ADMIN 쿼리는 10s, EdgeFunction 의 자동 쿼리는 5s 차등 필요. | `SET LOCAL statement_timeout` per request. |
| **autovacuum** | 한 tenant 의 대량 INSERT/UPDATE 가 vacuum lag 유발 → 다른 tenant 의 SELECT 성능 저하. | autovacuum_naptime 단축, table별 autovacuum 옵션. |
| **work_mem** | 글로벌 설정. 한 tenant 의 큰 sort 가 메모리 점유. | `SET LOCAL work_mem` per request. |
| **WAL bloat** | Realtime CDC slot (wal2json, SP-013) 가 lag 시 WAL 디스크 폭주 — 모든 tenant 영향. | slot lag 모니터링 + 임계 초과 시 slot drop. |

**판정**: 옵션 A 가 N=10 까지 단일 PostgreSQL 충분. N=15~20 도달 시 connection pool / statement_timeout / autovacuum 재검토 필요. 옵션 B-2 (DB 인스턴스 2개) 또는 옵션 D (worker pool + 격리된 client) 로 진화 옵션.

### 4.3 Phase 16 (PM2 cluster:4) 전환과 ADR-025 의 관계

**핵심 질문**: cluster:4 전환이 옵션 A 의 자동 답인가, 아니면 더 큰 변화가 필요한가?

**답**:
- cluster:4 는 옵션 A 의 **수직 확장 1단계**이지 옵션 변경이 아니다.
- SP-010 임계값(p95 200ms / CPU 70% / 503 0.1%) 도달 시 cluster:4 전환은 옵션 A 안에서 일어난다.
- cluster:4 로도 부족할 때(예: WSL2 단일 머신 RAM 한도 도달, tenant간 격리 요구 발생) 비로소 옵션 B 또는 D 진화 트리거.

**즉**: ADR-025 옵션 A 채택 = "cluster:4 까지는 옵션 A 안에서 진화"의 의미. cluster:4 가 불충분할 때 본 ADR 재검토.

### 4.4 ADR-020 (standalone + rsync + pm2 reload) 와의 호환성

| 옵션 | ADR-020 호환 방식 |
|------|--------------------|
| A | 그대로 호환 — 단일 standalone 패키지 → rsync 1개 → pm2 reload 1회. **현재 그대로**. |
| B | 호환 — 동일 standalone 패키지를 2개 PM2 인스턴스(free/vip)에 동시 적용. ecosystem.config.cjs 가 2개 app 정의. rsync 는 1회로 충분. |
| C | 부분 호환 — standalone 패키지를 컨슈머별로 배포해야 함. rsync 가 N회. ADR-020 은 단일 호스트 가정 — 다중 호스트 배포는 별도 ADR 필요. |
| D | 그대로 호환 — 옵션 A 와 동일 (단일 standalone, 단일 PM2). worker_threads 코드는 standalone 번들 안에 포함. |

**금지 사항 준수**: ADR-020 의 standalone + rsync + pm2 reload 결정은 본 ADR 의 어떤 옵션에서도 무효화하지 않는다. 옵션 C 만 다중 호스트 배포 ADR 신설이 추가로 필요.

### 4.5 Cloudflare Tunnel 단일성

현재 단일 Tunnel hostname `stylelucky4u.com`. 옵션별 영향:

| 옵션 | hostname 관리 |
|------|---------------|
| A | 변경 없음 — `stylelucky4u.com` 단일. |
| B | 옵션 1 (path 기반): `stylelucky4u.com/t/<tenant>/...` — Tunnel hostname 1개 유지, ingress route 추가. <br> 옵션 2 (subdomain 기반): `<tenant>.stylelucky4u.com` — wildcard cert + Tunnel ingress 다중. ADR-027 (router 패턴) 결정에 종속. |
| C | hostname N개 — 컨슈머별 별도 cert/Tunnel ingress 또는 wildcard. 운영 부담 커짐. |
| D | A 와 동일 — 단일 hostname. |

**판정**: 옵션 A/D 는 Tunnel 단일성 유지. 옵션 B/C 는 ADR-027 router 결정에 따라 wildcard cert + Tunnel ingress 다중 설정 필요.

---

## 5. 결정 — **ACCEPTED (2026-04-26, 옵션 A)**

### 결정 (2026-04-26 세션 58)

**채택**: 옵션 A (단일 인스턴스, 모든 tenant 공유) — Phase 1~3 1차 배포 토폴로지

**부속 결정**:
- Phase 4 (N=10 도달 또는 리소스 한계 시) 데이터 보고 옵션 D (worker pool) 또는 옵션 B (Tier) 진화
- 옵션 C (per-consumer 인스턴스)는 VIP 컨슈머 분리 필요 시만
- §5.2 코드 추상화 격리 경계 5종 즉시 도입: tenant context / plugin 인터페이스 / cron worker pool 추상화 / getPool(tenantId) / observability tenantId 차원

**결정 의미**: 옵션 A 채택은 "단일 인스턴스 영구 락인"이 아니라 **"코드 추상화 격리 경계의 하한"**. ADR-024 plugin 시스템 + ADR-028 worker pool 격리가 미래 옵션 분리(D, B, C)를 무비용으로 가능케 함.

### 5.1 권고 (sub-agent 의견)

**Phase 1~3 (N=1~5): 옵션 A 채택**

- 현재 운영 토폴로지(WSL2 + PM2 fork + 단일 PostgreSQL + 단일 Tunnel) 그대로 유지.
- ADR-020 standalone + rsync + pm2 reload 그대로 작동.
- ADR-021 빌드 게이트 + audit fail-soft 그대로 작동.
- N=5 까지 multi-tenant 격리는 ADR-023 (데이터 격리, RLS 또는 schema-per-tenant) + ADR-024 (plugin 격리) + ADR-028 (cron 격리) 의 **소프트웨어 레이어 격리**로 충족.

**Phase 4 (N=10 도달 시): 데이터 보고 옵션 B 또는 D 로 진화**

진화 트리거:
1. SP-010 임계값 도달 → 우선 옵션 A 안에서 PM2 cluster:4 전환.
2. cluster:4 로도 부족(p95 200ms 지속) → 옵션 D (worker pool + tenant cap) 우선 검토.
3. VIP tenant 가 명시적 격리 요구(SLA, 보안, 데이터 주권) → 옵션 B 채택. 해당 VIP tenant 만 vip 인스턴스로 이전.
4. 옵션 C 는 1인 운영 한계로 **유보**. 특정 VIP 컨슈머가 컨슈머별 독립 운영을 명시적으로 요청하고 운영 부담을 떠넘길 수 있는 (예: 그 컨슈머가 별도 IaC 운영) 경우에만.

### 5.2 코드 추상화의 격리 경계 (본 ADR 의 두 번째 결정)

옵션 A 를 채택해도 다음 코드 레이어 격리는 **즉시** 도입 (ADR-024/028 과 정합):

1. **tenant context propagation** — 모든 핸들러/서비스/repo 가 `tenantId` 를 명시적으로 받는 시그니처. 글로벌 state 금지.
2. **plugin 시스템 (ADR-024)** — EdgeFunction/SQL Editor/Cron 등 도메인 코드가 plugin 인터페이스로 격리. 미래 옵션 B/D 에서 plugin 별로 다른 instance/worker 에 배치 가능.
3. **cron worker pool 추상화 (ADR-028)** — 현재 옵션 A 안에서는 단일 main thread cron 으로 동작해도 무방하나, 인터페이스는 worker pool 수용 가능하게 설계 (옵션 D 진화 가능).
4. **DB connection pool 추상화** — 현재 단일 pool 이지만 `getPool(tenantId)` 인터페이스로 호출. 옵션 B-2 (DB 분리) 진화 시 구현체만 교체.
5. **observability tenant 차원 (ADR-029)** — audit_logs / metrics 에 tenantId 필드 즉시 도입. 현재 단일 인스턴스에서도 per-tenant 분석 가능.

### 5.3 보류 사항 (별도 ADR 신설)

- **데이터 격리 모델 (RLS / schema-per-tenant / DB-per-tenant)** → ADR-023
- **plugin 코드 격리 (EdgeFunction/Cron 등)** → ADR-024
- **Tenant Manifest/Registry 설계** → ADR-026
- **Multi-tenant Router 패턴 (subdomain vs path vs JWT)** → ADR-027
- **Cron Worker Pool / Per-tenant Isolation** → ADR-028 (옵션 D 채택 여부 결정 핵심)
- **Per-tenant Observability** → ADR-029

본 ADR 은 인스턴스 토폴로지만 결정하고, 격리 strategy 는 위 ADR 들이 합의 구성한다.

---

## 6. 고려한 대안 (4안 외)

| Alt | 내용 | 거부 사유 |
|-----|------|----------|
| E1 | Kubernetes Pod-per-tenant | 1인 운영 + WSL2 단일 호스트 환경에서 k8s 도입은 over-engineering. ADR-001 §L0 에서 이미 거부. 옵션 C 의 변종이지만 운영 부담은 더 큼. |
| E2 | Serverless (Vercel/Cloudflare Workers) per tenant | Wave 1 이미 거부 — Cloudflare Workers Edge 제약(Node API 부재, isolated-vm 미지원), 비용 polling 어려움. ADR-002 Yangpyeon 정체성과 충돌. |
| E3 | 옵션 A 영구 채택 (cluster:4 도 안 함) | SP-010 결과 무시. p95 200ms 도달 시 사용자 불만. SP-010 §6 조건부 Go 결정과 충돌. |
| E4 | Phase 1 부터 옵션 D 즉시 채택 | ADR-028 결정 전, worker_threads 통신 design 미정 상태에서 채택 시 1차 구현 부담만 가중. Phase 4 진화로 보류. |

---

## 7. 결과 (옵션 A + 코드 격리 도입 시)

### 긍정
- 현재 인프라 변경 0 — Phase 1~3 동안 운영 진화 부담 없이 멀티테넌트 도메인 로직 추가.
- ADR-020 (standalone) / ADR-021 (audit) 모두 무효화 없이 공존.
- SP-010 결정 그대로 — Phase 16 진입 시 cluster:4 전환은 옵션 A 안의 1단계 진화.
- 코드 추상화(§5.2) 가 미래 옵션 B/D 진화를 가로막지 않음 — interface 만 갖춰두고 구현은 단일.

### 부정 / 트레이드오프
- 단일 SPOF 잔존 — Phase 1~3 동안 N=5 tenant 가 단일 Node 프로세스 의존. 완화책: PM2 자동 재시작 + audit-failure 카운터(ADR-021 amendment-1) 모니터링.
- noisy neighbor 잔존 — Phase 4 진화 전까지 한 tenant 의 무거운 쿼리/cron 이 다른 tenant 영향. 완화책: SP-005 SQL Editor timeout 정책, ADR-028 (cron 격리) 우선 도입.
- 옵션 D 진화 시 worker_threads 학습 곡선 + 직렬화 오버헤드 신규 부담.

---

## 8. 재검토 트리거

본 ADR 재검토 (옵션 변경) 트리거:

1. **SP-010 임계값 + cluster:4 도 부족** — p95 200ms 가 cluster:4 적용 후에도 1주 이상 지속 → 옵션 D 검토.
2. **VIP tenant 명시적 분리 요구** — 특정 컨슈머가 SLA / 데이터 주권 / 보안 격리를 계약 수준으로 요구 → 해당 컨슈머만 옵션 B (vip 인스턴스) 또는 옵션 C (per-consumer).
3. **N > 20 도달** — 단일 호스트 RAM/CPU 한도 초과 → 옵션 B 또는 horizontal scaling 검토.
4. **데이터 격리 사고** — RLS / schema 격리 위반 사고 발생 → 옵션 B-2 (DB 인스턴스 분리) 또는 옵션 C 강제.
5. **단일 호스트 장애로 N=20 동시 down** — 1회 발생 후 SLA 합의 필요 시 옵션 B (active-passive) 또는 옵션 C (multi-host) 검토.
6. **ADR-028 결정**: ADR-028 가 worker pool 채택 시 옵션 A → 옵션 D 자동 진화 (인스턴스 모델 변경 없이 격리 강도만 상승).

---

## 9. 근거

### 인용 문서
- `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` §1.3 (인스턴스 모델 기존 결정), §2 (SP-010 검증), §6 (ADR-025 체크리스트 — Capistrano 역사 제거 금지)
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` §4 (cron 전역 registry — 옵션 D 진화 시 영향 영역), §7 (~30개 파일 영향)
- `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` (cross-cutting fail-soft 패턴 — 본 ADR 의 코드 격리 §5.2 와 정합)
- `docs/research/spikes/spike-010-pm2-cluster-result.md` §6 (조건부 Go), §8 (DQ-4.1 답변), §7 (PM2 v6 namespace bug)
- `standalone/README.md` §🧭 (시나리오 A/B/C), §🚀 (단계 1~7), §⚠️ (제약 1~6)
- `docs/research/2026-04-supabase-parity/05-roadmap/00-roadmap-overview.md` (Phase 16 포지션)

### 직접 증거
- 현재 PM2 운영: `pm2 status` 3 프로세스 (pm2-logrotate / cloudflared / ypserver fork mode)
- SP-010 측정값: cluster:4 = 76,489 RPS (fork 54,692 RPS × 1.40)
- ADR-020 배포 파이프라인 8단계 정상 동작 (세션 56 audit fail-soft 적용 후)
- 현재 단일 hostname `stylelucky4u.com` Cloudflare Tunnel 운영

### 금지 사항 준수 확인
- ✅ ADR-020 standalone + rsync + pm2 reload 무효화 없음 — §4.4 에 모든 옵션의 호환 방식 명시.
- ✅ SP-010 결정(현재 fork 유지, Phase 16 cluster:4) 무효화 없음 — §4.3 에 옵션 A 안의 진화로 흡수.
- ✅ Capistrano 역사(ADR-020 §대안 검토) 제거 없음 — 본 ADR 은 ADR-020 위에 layered.
- ✅ 결정 칸 ACCEPTED (2026-04-26, 옵션 A) — §5 첫 줄.

---

## 10. 후속 작업

본 ADR 이 ACCEPTED 시 진행할 작업 (옵션 A 채택 가정):

- [ ] ADR-024 plugin 시스템 인터페이스 설계 — 미래 옵션 B/D 진화 가능한 추상화
- [ ] ADR-028 cron worker pool 인터페이스 설계 — 옵션 A 안에서 단일 thread 구현, 옵션 D 진화 가능
- [ ] tenant context propagation 1차 도입 — `getTenantContext()` 인터페이스 + 모든 핸들러 시그니처 변경 (~30 파일, 02-current-code-audit §7 참조)
- [ ] `getPool(tenantId)` 추상화 — 현재 단일 pool, 옵션 B-2 진화 가능한 인터페이스
- [ ] audit_logs / metrics_history 에 tenantId 필드 마이그레이션 (ADR-029 대기)
- [ ] PM2 cluster:4 전환 체크리스트 (SP-010 §8) 운영 매뉴얼화 — Phase 16 진입 시 사용
- [ ] N=10 도달 시 본 ADR 재검토 게이트 — 옵션 B/D 진화 데이터 수집 (p95, CPU%, 503 rate, tenant간 응답 분산)

---

## 11. 변경 파일 (본 ADR 수용 시)

본 ADR 이 ACCEPTED 되어도 **인프라 파일 변경은 0**. 코드 격리 도입은 ADR-023~029 가 각각 실행.

본 ADR 자체로 추가/수정되는 파일:
- 신규: `docs/research/baas-foundation/01-adrs/ADR-025-instance-deployment-model.md` (본 파일)
- 수정 (수용 시): `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` — ADR-025 entry 추가
- 수정 (수용 시): `CLAUDE.md` 의 풀뿌리 트리에 baas-foundation/01-adrs/ 노드 추가

---

> ADR-025 결정: ACCEPTED 2026-04-26 (세션 58) · 옵션 A (Phase 1~3) · §5.2 추상화 경계 즉시 도입 · 권고대로 확정
