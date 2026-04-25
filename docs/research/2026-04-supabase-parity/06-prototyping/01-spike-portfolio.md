# 01. 스파이크 포트폴리오 — 양평 부엌 서버 대시보드

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · P1 산출물 · 작성일: 2026-04-18
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [06-prototyping/](./) → **이 문서**
> 연관: [02-spike-priority-set.md](./02-spike-priority-set.md) · [03-spike-deferred-set.md](./03-spike-deferred-set.md) · [04-spike-execution-protocol.md](./04-spike-execution-protocol.md)
> 참조: [00-vision/07-dq-matrix.md](../00-vision/07-dq-matrix.md) · [02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md)

---

## 0. 문서 목적

이 문서는 양평 부엌 서버 대시보드 프로젝트의 **스파이크 전체 포트폴리오**를 관리하는 단일 진실 소스(Single Source of Truth)이다.

Wave 1~4에서 완료된 기존 스파이크 9건을 정리하고, Wave 5에서 신규 실행이 필요한 스파이크 22건(SP-010~SP-031)을 목록화하여 우선순위·의존성·실행 계획을 제시한다. Wave 5 DQ 16건은 모두 하나 이상의 스파이크에 매핑된다.

---

## 1. 스파이크 정의 & 원칙

### 1.1 스파이크란?

스파이크(Spike)는 **시간 제한 실험(time-boxed experiment)으로 기술적 불확실성을 해소**하는 연구·검증 활동이다. 기능 구현이 아닌, "이 기술이 우리 환경에서 실제로 작동하는가?"를 빠르게 판단하기 위한 투자다.

- 결과가 "Go" 또는 "No-Go" 중 하나여야 한다
- 생산 코드를 직접 변경하지 않는다 (별도 브랜치 또는 스크래치)
- 시간 상한이 명확하다 (`--max-hours N`)
- 실패도 지식이므로 결과를 문서로 보존한다

### 1.2 kdyspike 스킬 원칙

프로젝트는 `kdyspike` 스킬을 사용하여 스파이크를 실행한다:

```bash
# 마이크로 스파이크 (30분 내)
/kdyspike --micro "isolated-vm v6이 WSL2 Ubuntu 24.04에서 빌드되는가?"

# 풀 스파이크 (1~2일)
/kdyspike --full "SeaweedFS 50GB 부하 테스트" --max-hours 8
```

**실행 원칙**:
1. 질문 하나, 가설 하나, 측정 기준 하나 — 집중
2. `--max-hours` 초과 시 즉시 중단, 중간 결과를 보존
3. 동일 스파이크를 두 번 실행하지 않는다 (실패면 대안 경로로 전환)
4. Go/No-Go 판정은 사전 정의한 성공 기준으로만 결정
5. 결과는 `docs/research/spikes/spike-XXX-result.md`에 기록

### 1.3 스파이크 등록 기준

다음 조건 중 하나 이상 충족 시 스파이크 실행:
- ADR 재검토 트리거 중 "검증 필요" 항목
- Wave 5 DQ 중 `Wave 할당: Wave 5` 표기 항목
- Blueprint에서 ASM(Architecture Safety Metric) 검증이 필요한 항목
- 아키텍처 결정이 특정 기술의 동작 여부에 의존하는 항목

---

## 2. 기존 스파이크 9건 요약

Wave 1~4에서 완료된 스파이크 목록. 모두 Go 판정을 받아 현재 아키텍처의 기반이 됨.

| ID | 제목 | 카테고리 | 판정 | 검증일 | 핵심 결론 | 영향 ADR |
|----|------|---------|------|--------|----------|---------|
| spike-001-design | 프론트엔드 디자인 리서치 | UI/UX | Go | 2026-04-06 | shadcn/ui 다크 테마 + Supabase 스타일 대시보드 확정 | ADR-018 |
| spike-001-sqlite | SQLite + Drizzle + Next.js | DB | Go | 2026-04-06 | `serverExternalPackages: ['better-sqlite3']` 필수, WAL 모드 + busy_timeout=5000, PM2 fork 모드 호환 | ADR-005 |
| spike-002-sse | SSE + Cloudflare Tunnel | Realtime | Go | 2026-04-06 | 3개 필수 헤더 + `force-dynamic` 필수, Tunnel 네이티브 SSE 지원 확인 | ADR-010 |
| spike-004-shadcn | shadcn/ui 다크 테마 호환 | UI | Go | 2026-04-06 | `.dark` CSS 변수 재매핑 필요, TW4 충돌 없음, `src/components/ui/`에서 공존 가능 | ADR-018 |
| spike-005-sql | SQL Editor Monaco PoC | SQL Editor | Go | 2026-04-18 | Monaco 에디터 Next.js 16 App Router 호환, supabase-studio 패턴 흡수 가능 | ADR-003 |
| spike-005-schema | Schema Visualizer @xyflow PoC | Schema Viz | Go | 2026-04-18 | @xyflow/react + elkjs 조합 동작 확인, 100노드 이하 레이아웃 1.2s 이내 | ADR-004 |
| spike-005-advisors | Advisors schemalint TS 포팅 | Advisors | Go | 2026-04-18 | schemalint 커스텀 룰 TS 포팅 가능, squawk CLI wrapper 통합 확인 | ADR-011 |
| spike-005-edge | Edge Functions isolated-vm v5 | Edge Fn | Go(조건부) | 2026-04-18 | isolated-vm v5 Node 20 LTS 호환, v6 Node 24 호환성 재검증 필요(SP-012) | ADR-009 |
| spike-005-data-api | Data API pgmq 통합 | Data API | Go | 2026-04-18 | pgmq Outbox 패턴 Prisma 7 어댑터 통합 가능, REST 80% 호환성 확인 | ADR-012 |

**기존 스파이크 9건 종합 평가**:
- 전원 Go 판정 (spike-005-edge는 v6 재검증 조건 포함)
- 현재 14개 카테고리의 핵심 기술 스택이 검증됨
- Phase 15~17 MVP 직전 추가 검증이 필요한 영역: PM2 cluster, argon2id, isolated-vm v6, JWKS 캐시, Session 인덱스, SeaweedFS 50GB

---

## 3. 신규 스파이크 목록 (SP-010 ~ SP-031)

Wave 5에서 실행할 신규 스파이크 22건. 번호는 SP-010부터 시작(SP-001~009는 기존 예약).

### 3.0 세션 30 (2026-04-19) 실행 결과 — 우선 세트 7건

| SP | 판정 | 소요 | 결과 문서 |
|----|------|------|-----------|
| SP-010 PM2 cluster | 조건부 Go (+39.9%, BUSY 0%) | 1.2h | [spike-010-pm2-cluster-result.md](../../spikes/spike-010-pm2-cluster-result.md) |
| SP-011 argon2id | Go (13× faster) — **ADR-019** | 0.6h | [spike-011-argon2-result.md](../../spikes/spike-011-argon2-result.md) |
| SP-012 isolated-vm v6 | Go (Node v24 cold 0.9ms) — ADR-009 트리거 1 해소 | 0.7h | [spike-012-isolated-vm-v6-result.md](../../spikes/spike-012-isolated-vm-v6-result.md) |
| SP-013 wal2json | Pending (축약, 물리 측정 별도 세션) | 축약 | [spike-013-wal2json-slot-result.md](../../spikes/spike-013-wal2json-slot-result.md) |
| SP-014 JWKS 캐시 | 조건부 Go (p95 0.189ms, hit 99%) | 1.2h | [spike-014-jwks-cache-result.md](../../spikes/spike-014-jwks-cache-result.md) |
| SP-015 Session 인덱스 | Go (p95 48μs, cleanup 대안) | 0.8h | [spike-015-session-index-result.md](../../spikes/spike-015-session-index-result.md) |
| SP-016 SeaweedFS 50GB | Pending (축약, 물리 측정 별도 세션) | 축약 | [spike-016-seaweedfs-50gb-result.md](../../spikes/spike-016-seaweedfs-50gb-result.md) |

Compound Knowledge 5건: `docs/solutions/2026-04-19-{pm2-delete-all-namespace-bug, pg-partial-index-now-incompatibility, napi-prebuilt-native-modules, isolated-vm-v6-node24-wsl2-verified, jwks-grace-endpoint-vs-client-cache}.md`

| ID | 제목 | 카테고리 | 관련 DQ | 관련 ADR | 예상 공수(h) | 우선순위 | 의존 릴리스 | 세트 |
|----|------|---------|---------|---------|------------|---------|-----------|------|
| SP-010 | PM2 cluster:4 vs fork 벤치마크 | Operations | DQ-4.1 | ADR-015 | 4 | 고 | v0.1 | 우선 |
| SP-011 | argon2id 패스워드 마이그레이션 경로 | Auth Core | DQ-AC-1 | ADR-006 | 3 | 고 | v0.2 | 우선 |
| SP-012 | isolated-vm v6 WSL2 호환성 + ABI | Edge Fn | ADR-009 재검토 | ADR-009 | 4 | 고 | v0.3 | 우선 |
| SP-013 | wal2json 슬롯 수 한도 + recovery 테스트 | Realtime | DQ-RT-3, DQ-RT-5 | ADR-010 | 5 | 고 | v0.3 | 우선 |
| SP-014 | JWKS 캐시 3분 grace 실제 효과 측정 | Observability | DQ-12.4 | ADR-013 | 3 | 고 | v0.2 | 우선 |
| SP-015 | Session 인덱스 최적화 쿼리 플랜 분석 | Auth Core | DQ-AC-2 | ADR-006 | 2 | 고 | v0.2 | 우선 |
| SP-016 | SeaweedFS 50GB 부하 테스트 | Storage | ADR-008 ASM-4 | ADR-008 | 8 | 고 | v0.3 | 우선 |
| SP-017 | AG Grid vs TanStack v8 성능 비교 | Table Editor | DQ-1.13 | ADR-002 | 6 | 중 | v0.5 | 지연 |
| SP-018 | TanStack Enterprise 가치 분석 | Table Editor | DQ-1.14 | ADR-002 | 2 | 저 | v0.5 | 지연 |
| SP-019 | Schema Viz 외부 도구 임베드 vs 자체구현 | Schema Viz | DQ-3.3 | ADR-004 | 3 | 저 | v0.6 | 지연 |
| SP-020 | pg_cron vs node-cron 마이그레이션 비용 | DB Ops | DQ-4.2 | ADR-005 | 4 | 중 | v0.6 | 지연 |
| SP-021 | BullMQ vs pgmq 상세 벤치마크 | DB Ops / Data API | DQ-4.3 | ADR-005, ADR-012 | 5 | 중 | v0.6 | 지연 |
| SP-022 | wal-g 100GB 복원 속도 실측 | DB Ops | DQ-4.22 | ADR-005 | 6 | 중 | v0.6 | 지연 |
| SP-023 | FIDO Metadata Service 통합 경로 | Auth Advanced | DQ-AA-3 | ADR-007 | 4 | 중 | v0.4 | 지연 |
| SP-024 | WebAuthn Conditional UI 브라우저 호환성 | Auth Advanced | DQ-AA-9 | ADR-007 | 3 | 중 | v0.4 | 지연 |
| SP-025 | splinter 38룰 PG 버전 호환 포팅 | Advisors | DQ-ADV-1 | ADR-011 | 8 | 중 | v0.6 | 지연 |
| SP-026 | presence_diff 알고리즘 재구현 검증 | Realtime | DQ-RT-3 | ADR-010 | 5 | 중 | v0.5 | 지연 |
| SP-027 | PG 18 마이그레이션 영향 분석 | Realtime / DB | DQ-RT-6 | ADR-010, ADR-005 | 4 | 저 | v1.0 | 지연 |
| SP-028 | Capacitor iOS/Android 인증 토큰 저장 패턴 | Observability / Mobile | DQ-12.5 | ADR-013, ADR-017 | 5 | 저 | v0.8 | 지연 |
| SP-029 | Docker 전환 TCO 검토 | Operations | DQ-OPS-1 | ADR-015 | 3 | 저 | v1.0 | 지연 |
| SP-030 | Node 버전 업그레이드 정책 | Operations | DQ-OPS-3 | ADR-015, ADR-009 | 2 | 중 | v0.7 | 지연 |
| SP-031 | DR 호스트 스펙 + 동기화 방식 | Operations | DQ-OPS-4 | ADR-015 | 3 | 저 | v1.0 | 지연 |

**총계**: 신규 스파이크 22건 (SP-010~SP-031)
- 우선 세트 (Phase 15~17 MVP 사전): 7건 (SP-010~SP-016)
- 지연 세트 (Phase 18+ 사전): 15건 (SP-017~SP-031)

---

## 4. Wave 5 DQ 16건 ↔ 스파이크 매핑

Wave 5에서 처리해야 할 DQ 16건과 대응 스파이크를 전수 매핑한다. 모든 DQ가 최소 1개 스파이크에 매핑됨.

| DQ 번호 | DQ 질문 요약 | 대응 스파이크 | 비고 |
|---------|------------|-------------|------|
| DQ-1.13 | AG Grid 전환 합리성 | SP-017 | TanStack v8 성능이 한계 미달 시 발동 |
| DQ-1.14 | Enterprise 라인 도입 가능성 | SP-018 | SP-017과 연계 |
| DQ-3.3 | Schema Viz 스튜디오 임베드 검토 | SP-019 | 잠정 No. 재확인 용도 |
| DQ-4.1 | PM2 cluster 전환 | SP-010 | MVP 사전 필수 |
| DQ-4.2 | pg_cron 도입 | SP-020 | node-cron 잡 50개 이상 시 발동 조건 |
| DQ-4.3 | BullMQ 도입 | SP-021 | pgmq 한계 실측 후 판단 |
| DQ-4.22 | 복원 속도 50MB/s 가정 | SP-022 | RTO 30분 목표 검증 |
| DQ-AA-3 | FIDO MDS 통합 | SP-023 | Phase 15 완료 후 보너스 +2점 |
| DQ-AA-9 | Conditional UI 활성화 시점 | SP-024 | Phase 17+2주 안정화 후 |
| DQ-ADV-1 | PG 마이그 시점 + splinter 호환 | SP-025 | SQLite → PG 이전 시 splinter 포팅 |
| DQ-RT-3 | presence_diff 구조 검증 | SP-013, SP-026 | SP-013이 슬롯 검증, SP-026이 알고리즘 |
| DQ-RT-6 | PG 18 업그레이드 타이밍 | SP-027 | PG 18 출시 후 |
| DQ-12.4 | JWKS Cloudflare Workers 캐시 | SP-014 | Phase 16 사전 필수 |
| DQ-12.5 | Capacitor JWKS 방식 | SP-028 | 모바일 확장 시 |
| DQ-AC-1 | argon2 교체 시점 | SP-011 | Phase 15 인증 강화 시 |
| DQ-AC-2 | Session 인덱스 전략 | SP-015 | Phase 17 Auth Core 완성 전 |
| DQ-OPS-1 | Docker 전환 | SP-029 | Docker 이행 조건 4개 중 1개 이상 충족 시 |
| DQ-OPS-3 | Node 버전 격리 | SP-030 | Node 20 → 22 전환 전 |
| DQ-OPS-4 | DR 호스트 추가 시점 | SP-031 | 트래픽 10만+/월 초과 시 |

> Wave 5 DQ 16건 + 관련 ADR 재검토 트리거 3건 = 19개 항목이 22개 스파이크에 분산 매핑됨. 커버리지 100%.

---

## 5. 우선순위 결정 기준

모든 스파이크의 우선순위는 다음 4가지 기준의 가중합으로 결정한다.

### 5.1 판단 기준 (가중치 순)

**(a) MVP 블로킹 여부 (가중치 40%)**
Phase 15~17 MVP 달성에 스파이크 결과가 없으면 구현을 시작할 수 없는가?
- 블로킹: SP-010, SP-011, SP-012, SP-013, SP-014, SP-015, SP-016 → 고 우선순위

**(b) 아키텍처 재설계 위험도 (가중치 30%)**
스파이크 결과에 따라 이미 완성된 Blueprint나 ADR을 전면 재설계해야 하는가?
- 재설계 위험 높음: SP-012 (isolated-vm v6 Node 24 ABI) → 실패 시 ADR-009 전면 수정
- 재설계 위험 높음: SP-016 (SeaweedFS 50GB) → 실패 시 ADR-008 Garage 재평가

**(c) 예상 공수 (가중치 20%)**
동일 우선순위 그룹 내에서 공수 적은 것을 먼저 실행 (빠른 학습 우선).

**(d) 스파이크 간 의존성 (가중치 10%)**
선행 스파이크의 결과가 후행 스파이크의 실험 조건을 결정하는가?
- SP-010 (PM2 cluster) → SP-013 (wal2json, cluster 환경에서 슬롯 관리)
- SP-011 (argon2) → SP-015 (Session 인덱스, PG 이전 여부 결정에 의존)

### 5.2 우선순위 레이블 정의

| 레이블 | 설명 | 해당 스파이크 |
|--------|------|-------------|
| 고 | Phase 15~17 MVP 이전에 반드시 완료 | SP-010~SP-016 (7건) |
| 중 | Phase 18~21 직전에 완료해야 함 | SP-020~SP-026, SP-030 (8건) |
| 저 | Phase 22 또는 특정 트리거 충족 시만 실행 | SP-017~SP-019, SP-027~SP-029, SP-031 (7건) |

---

## 6. 스파이크 의존성 DAG

스파이크 간 선후 관계를 ASCII 다이어그램으로 표현한다.

```
[우선 세트 — Phase 15~17 MVP 사전]

SP-010 PM2 cluster 벤치마크
    │
    ├──→ SP-013 wal2json 슬롯 (cluster 환경에서 슬롯 증분 확인)
    │         │
    │         └──→ SP-026 presence_diff 재구현 (슬롯 안정성 전제)
    │
    └──→ SP-016 SeaweedFS 50GB (cluster vs fork 환경 선정 후 부하 테스트)

SP-011 argon2id 마이그레이션
    │
    └──→ SP-015 Session 인덱스 (SQLite vs PG 결정 후 인덱스 전략 수립)
              │
              └──→ SP-025 splinter PG 포팅 (PG 이전 여부 확정 후 포팅 범위 결정)

SP-012 isolated-vm v6 ABI
    │
    └──→ [ADR-009 재확인 후 Phase 19 Edge Fn 구현 착수]

SP-014 JWKS 캐시 grace 효과
    │
    └──→ SP-028 Capacitor JWKS (캐시 grace 전략 확정 후 모바일 적용)

[지연 세트 — Phase 18~22 직전]

SP-017 AG Grid vs TanStack 성능
    │
    ├──→ SP-018 TanStack Enterprise 가치 (SP-017 No-Go 시에만 발동)
    │
    └──→ [ADR-002 재검토 여부 결정]

SP-020 pg_cron 마이그 비용
    │
    └──→ SP-021 BullMQ vs pgmq (pg_cron 불채택 시 pgmq 강화 방향 결정)

SP-023 FIDO MDS 통합
    │
    └──→ SP-024 Conditional UI (FIDO 스펙 확인 후 브라우저 지원 범위 결정)

SP-027 PG 18 마이그레이션
    │
    └──→ SP-025 splinter PG 포팅 (PG 18 마이그 타이밍과 포팅 범위 연동)

SP-029 Docker 전환 TCO
    │
    └──→ SP-031 DR 호스트 (Docker 채택 여부에 따라 DR 아키텍처 달라짐)
```

---

## 7. Phase별 스파이크 실행 계획

### Phase 14 완료 ~ Phase 15 시작 전 (우선 세트 실행, 4주)

Phase 15(Auth Advanced MVP) 착수 전 반드시 완료해야 하는 스파이크 묶음.

| 실행 주 | 스파이크 | 공수 | 병렬 가능 여부 |
|--------|---------|------|-------------|
| 1주차 | SP-010 PM2 cluster 벤치마크 | 4h | 독립 |
| 1주차 | SP-014 JWKS 캐시 효과 | 3h | SP-010과 병렬 가능 |
| 2주차 | SP-011 argon2id 마이그레이션 | 3h | 독립 |
| 2주차 | SP-015 Session 인덱스 분석 | 2h | SP-011 결과 대기 |
| 3주차 | SP-012 isolated-vm v6 ABI | 4h | 독립 |
| 3주차 | SP-013 wal2json 슬롯 + recovery | 5h | SP-010 결과 대기 |
| 4주차 | SP-016 SeaweedFS 50GB | 8h | SP-010 결과 대기 |

우선 세트 총 공수: **29h** (4주 내 완수 목표)

### Phase 17 완료 ~ Phase 18 시작 전

| 스파이크 | 공수 | 트리거 조건 |
|---------|------|-----------|
| SP-023 FIDO MDS | 4h | Phase 15 WebAuthn 안정화 후 |
| SP-024 Conditional UI | 3h | SP-023 완료 후 |
| SP-017 AG Grid vs TanStack | 6h | TanStack v8 p95 > 1.2s 발생 시 |
| SP-018 TanStack Enterprise | 2h | SP-017 No-Go 시에만 |

### Phase 19 완료 ~ Phase 20 시작 전

| 스파이크 | 공수 | 트리거 조건 |
|---------|------|-----------|
| SP-019 Schema Viz 임베드 | 3h | Phase 20 직전 최종 확인 |
| SP-020 pg_cron 마이그 비용 | 4h | node-cron 잡 50개 초과 시 |
| SP-021 BullMQ vs pgmq | 5h | pgmq 한계 실측 후 |
| SP-022 wal-g 100GB 복원 | 6h | Phase 20 DB Ops 사전 |
| SP-025 splinter PG 포팅 | 8h | SP-015 SQLite→PG 확정 후 |
| SP-026 presence_diff | 5h | SP-013 완료 후 |
| SP-030 Node 버전 정책 | 2h | Node 20 EOL 전 |

### Phase 21 완료 ~ Phase 22 사전

| 스파이크 | 공수 | 트리거 조건 |
|---------|------|-----------|
| SP-027 PG 18 마이그 | 4h | PG 18 RC 출시 후 |
| SP-028 Capacitor JWKS | 5h | 모바일 확장 결정 시 |
| SP-029 Docker TCO | 3h | 이행 조건 1개+ 충족 시 |
| SP-031 DR 호스트 | 3h | 트래픽 10만+/월 초과 시 |

---

## 8. Go/No-Go 판정 기준 공통 프로토콜

모든 스파이크는 실험 착수 전에 성공/실패 기준을 사전 명시하고, 결과를 해당 기준으로만 판정한다.

### 8.1 판정 기준 형식

```
성공 기준 (Go):
  - [정량 조건 1]: X ≤ N ms / Y% 이상 / Z개 이하
  - [정량 조건 2]: ...

실패 기준 (No-Go):
  - 성공 기준 중 하나라도 미달 시
  - OR 실험 환경 구성 자체 실패 시
```

### 8.2 판정 단계

1. **Pre-Spike**: 성공 기준 문서화 (스파이크 실행 전)
2. **실험 실행**: `--max-hours` 내 완수
3. **측정 결과 기록**: 원시 측정값 모두 보존
4. **기준 대조**: 측정값 vs 성공 기준 체크리스트
5. **Go/No-Go 선언**: 판정 근거 1문장으로 명시
6. **의사결정 반영**: 해당 ADR 재검토 트리거 업데이트

### 8.3 회색 지대 처리

판정이 모호할 때(예: 조건 3개 중 2개 충족):
- "부분 Go + 조건부": 추가 스파이크 또는 구현 단계에서 보완 조건 명시
- 단, 부분 Go는 최대 1회. 동일 스파이크 재실행은 금지 (접근 방식 변경 후 새 스파이크 등록)

---

## 9. 실패 시 대안 기술 매트릭스

스파이크 실패 시 각 카테고리의 대안 경로를 사전 정의한다.

| 스파이크 | No-Go 시 대안 | 대안 ADR 영향 |
|---------|-------------|------------|
| SP-010 (PM2 cluster) | fork 모드 유지 + node-cron 중복 방지 advisory lock 강화 | ADR-015 현상 유지 |
| SP-011 (argon2id) | bcrypt 유지, cost factor 상향 (14→16) | ADR-006 재검토 불필요 |
| SP-012 (isolated-vm v6) | isolated-vm v5 고정 + Node 22 LTS 유지 / 또는 workerd 재검토 | ADR-009 §재검토 발동 |
| SP-013 (wal2json 슬롯) | pgoutput 네이티브 전환 검토 / 슬롯 2개 분리 | ADR-010 재검토 |
| SP-014 (JWKS 캐시) | next-headers 캐시 60s + CDN 캐시 재전략 | ADR-013 § 재검토 |
| SP-015 (Session 인덱스) | SQLite 유지 + covering index 최적화 | ADR-006 현상 유지 |
| SP-016 (SeaweedFS 50GB) | **Garage (Rust, BSD)** 재평가 → ADR-008 Garage 3조건 발동 | ADR-008 재검토 필수 |
| SP-017 (AG Grid 성능) | AG Grid Community(MIT) 조건부 도입 검토 | ADR-002 재검토 |
| SP-018 (TanStack Enterprise) | TanStack v8 Community 유지 (현상 유지) | ADR-002 현상 유지 |
| SP-019 (Schema Viz 임베드) | 자체 구현 유지 (ADR-004 현상 유지) | ADR-004 현상 유지 |
| SP-020 (pg_cron) | node-cron 유지 | ADR-005 현상 유지 |
| SP-021 (BullMQ) | pgmq 유지 + advisory lock 보강 | ADR-012 현상 유지 |
| SP-022 (wal-g 복원) | pgBackRest 재검토 / RTO 목표 60m으로 완화 | ADR-005 재검토 |
| SP-023 (FIDO MDS) | FIDO MDS 미통합 (WebAuthn 기본 검증만) | ADR-007 보너스 미달 허용 |
| SP-024 (Conditional UI) | Conditional UI 미도입 (클릭 기반 Passkey만) | ADR-007 현상 유지 |
| SP-025 (splinter 포팅) | PG 전용 룰만 SQLite 단계에서 건너뜀 | ADR-011 현상 유지 |
| SP-026 (presence_diff) | supabase-realtime 포팅 대신 폴링 5초 폴백 | ADR-010 재검토 |
| SP-027 (PG 18) | PG 17 유지 + 자체 cron으로 idle 슬롯 관리 | ADR-010 현상 유지 |
| SP-028 (Capacitor JWKS) | Capacitor 미지원 (웹 전용 유지) | ADR-017 범위 제한 |
| SP-029 (Docker TCO) | PM2 native 유지 | ADR-015 현상 유지 |
| SP-030 (Node 버전) | .nvmrc 고정 + 6개월 점검 루틴 | ADR-015 재검토 불필요 |
| SP-031 (DR 호스트) | 단일 호스트 유지 + B2 백업 강화 | ADR-015 현상 유지 |

---

## 10. 스파이크 포트폴리오 통계

| 구분 | 건수 | 총 예상 공수 |
|------|------|------------|
| 기존 완료 스파이크 (spike-001~005) | 9건 | — (완료) |
| 신규 우선 세트 (SP-010~SP-016) | 7건 | ~29h |
| 신규 지연 세트 (SP-017~SP-031) | 15건 | ~72h |
| **신규 스파이크 합계** | **22건** | **~101h** |
| Wave 5 DQ 16건 커버리지 | 16/16 | 100% |

**Phase별 스파이크 집중도**:
- Phase 14→15 전환기: 7건 (고 우선순위 집중)
- Phase 17→18 전환기: 4건
- Phase 19→20 전환기: 7건
- Phase 21→22 전환기: 4건

---

## 부록 A. 스파이크 번호 예약 현황

| 번호 범위 | 상태 | 설명 |
|---------|------|------|
| spike-001~004 | 완료 | 기존 spikes/ 디렉토리 |
| spike-005-* (5건) | 완료 | docs/research/spikes/ |
| spike-006 | 미사용 | Wave 5 신규 미매핑 (향후 Auth Advanced PoC 예약) |
| spike-007 | SP-016으로 재명명 | SeaweedFS 50GB (기존 예약 → SP-016 통합) |
| spike-008~009 | 미사용 | 향후 Wave 5+ 추가 스파이크용 예약 |
| SP-010~SP-031 | 신규 계획 | 본 문서 수록 |

---

## 부록 B. ADR별 스파이크 역추적 인덱스

각 ADR이 어떤 스파이크에 의해 검증되거나 재검토 트리거가 발동되는지를 역방향으로 추적한다.

| ADR | 검증 스파이크 | 재검토 트리거 스파이크 |
|-----|------------|------------------|
| ADR-002 (TanStack v8) | spike-001-sqlite | SP-017, SP-018 |
| ADR-003 (SQL Editor) | spike-005-sql | — |
| ADR-004 (Schema Viz) | spike-005-schema | SP-019 |
| ADR-005 (node-cron + wal-g) | spike-001-sqlite | SP-020, SP-021, SP-022 |
| ADR-006 (Auth Core) | — | SP-011, SP-015 |
| ADR-007 (Auth Advanced) | — | SP-023, SP-024 |
| ADR-008 (SeaweedFS) | spike-001-sqlite (간접) | SP-016 |
| ADR-009 (Edge Fn 3층) | spike-005-edge | SP-012 |
| ADR-010 (Realtime) | spike-002-sse | SP-013, SP-026, SP-027 |
| ADR-011 (Advisors) | spike-005-advisors | SP-025 |
| ADR-012 (Data API) | spike-005-data-api | SP-021 |
| ADR-013 (Vault/JWKS) | — | SP-014, SP-028 |
| ADR-014 (UX Quality) | — | — |
| ADR-015 (Operations) | — | SP-010, SP-029, SP-030, SP-031 |
| ADR-016 (pg_graphql) | — | — |
| ADR-017 (OAuth) | — | SP-028 |
| ADR-018 (레이어 구조) | spike-001-design, spike-004-shadcn | — |

---

## 부록 C. 스파이크 실행 캘린더 (2026년 예상)

| 기간 | 스파이크 | Phase 연계 |
|------|---------|----------|
| 2026-04 (현재) | 우선 세트 기획 완료 | Phase 14 완료 직후 |
| 2026-05 (Week 1~2) | SP-014, SP-010, SP-011 | Phase 15 착수 전 |
| 2026-05 (Week 3~4) | SP-015, SP-012, SP-013 | Phase 15 착수 전 |
| 2026-06 (Week 1~2) | SP-016 SeaweedFS 50GB | Phase 15 진행 중 |
| 2026-06 (Week 3~4) | 우선 세트 결과 통합 + ADR 갱신 | Phase 15~16 전환기 |
| 2026-07 | SP-023, SP-024 FIDO/Conditional UI | Phase 17 착수 전 |
| 2026-08 (조건부) | SP-017, SP-018 AG Grid 비교 | Phase 18 착수 전 |
| 2026-09 | SP-026 presence_diff | Phase 19 착수 전 |
| 2026-10 | SP-019, SP-022, SP-025, SP-030 | Phase 20 착수 전 |
| 2026-10 (조건부) | SP-020, SP-021 pg_cron/BullMQ | Phase 20 착수 전 (트리거 시) |
| 2026-11~12 (조건부) | SP-027~SP-031 | Phase 22 착수 전 |

**캘린더 전제**: Phase 15는 2026-05 착수 기준. 실제 일정은 Phase 14 완료 시점에 따라 조정.

---

## 부록 D. 스파이크 용어 정의

| 용어 | 정의 |
|------|------|
| Go | 성공 기준 전체 충족. 아키텍처 결정 채택 확정. |
| No-Go | 성공 기준 하나 이상 미달. 대안 경로로 전환. |
| 부분 Go | 핵심 기준 충족 + 보조 기준 일부 미달 + 보완 조건 명시. 제한적 채택. |
| 우선 세트 | Phase 15~17 MVP 블로킹 스파이크 7건 (SP-010~SP-016). |
| 지연 세트 | Phase 18~22 직전 실행 스파이크 15건 (SP-017~SP-031). |
| 조건부 스파이크 | 특정 비즈니스/기술 트리거가 발동된 경우에만 실행. |
| ASM | Architecture Safety Metric — ADR의 재검토 트리거를 정량화한 지표. |
| DQ | Design Question — Wave 3~5에서 미답변 상태의 설계 질문. |
| ADR | Architecture Decision Record — 아키텍처 결정 기록. |
| EWI | Early Warning Indicator — ASM의 경보 수준. |

---

> **스파이크 포트폴리오 끝.** Wave 5 · P1 · 2026-04-18
> 기존 9건 완료 + 신규 22건 계획 = 총 31건 · DQ-16 커버리지 100%
