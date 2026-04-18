# 02. 기술부채 전략 — Wave 1-4 통합 레지스트리

> Wave 5 · R2 산출물 — kdywave W5-R2  
> 작성일: 2026-04-18 (세션 28)  
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**  
> 연관: [01-adr-log.md](../02-architecture/01-adr-log.md) · [07-dq-matrix.md](../00-vision/07-dq-matrix.md) · [10-14-categories-priority.md](../00-vision/10-14-categories-priority.md) · [03-risk-register.md](./03-risk-register.md)

---

## 0. 요약

Wave 1-4에서 내린 의도적 trade-off 결정, 미해결 DQ(Design Question), ADR 재검토 트리거 45건, 그리고 각 카테고리 청사진에서 명시된 미이행 항목을 **단일 기술부채 레지스트리**로 통합한다.

- **총 등록 부채**: TD-001 ~ TD-020 (20건 이상)
- **부채 총합 예상 해소 공수**: 약 450-600h (Phase 17-22 분산)
- **즉시 해소 대상 (심각도 고)**: TD-001, TD-008, TD-009 등
- **ADR 재검토 트리거 연계**: 45건 중 부채성 22건이 이 레지스트리에 포함

이 레지스트리는 "지금 당장 구현하지 않기로 결정했지만, 언젠가 반드시 검토해야 할 것들"의 목록이다. 정기 리뷰는 Phase 종료 시점과 ADR 재검토 트리거 충족 시 즉시 수행한다.

---

## 1. 부채 분류 정의

### 1.1 유형 정의 (4 유형)

| 유형 코드 | 유형명 | 설명 | 예시 |
|----------|--------|------|------|
| **DES** | 설계 부채 | 아키텍처 또는 시스템 구조의 의도적 단순화 | Multi-tenancy 제외, pg_cron 대신 node-cron 채택 |
| **COD** | 코드 부채 | 구현 계층에서 더 나은 방식이 알려져 있으나 미이행 | bcryptjs → argon2 미전환, PM2 fork → cluster 미전환 |
| **TST** | 테스트 부채 | 테스트 커버리지 또는 검증 절차의 의도적 생략 | SeaweedFS 50GB+ 부하 테스트 미수행, DR 드릴 미실행 |
| **DOC** | 문서 부채 | 운영·유지보수에 필요한 문서 미작성 또는 부실 | 복구 절차서 미완성, ADR-022(argon2 전환) 미작성 |

### 1.2 심각도 정의 (3 단계)

| 심각도 | 정의 | 방치 시 결과 | 해소 타이밍 |
|--------|------|------------|------------|
| **고 (HIGH)** | 보안·가용성·데이터 무결성에 직접 영향 | 장애, 보안 침해, 데이터 손실 | 다음 릴리스 이전 우선 처리 |
| **중 (MED)** | 성능·유지보수성·확장성에 영향 | 기술적 부담 누적, 향후 변경 비용 증가 | 해당 Phase에서 계획적 처리 |
| **저 (LOW)** | UX 개선, 선택적 기능, 비즈니스 모델 의존 | 기능 갭, 운영 불편 | 트리거 충족 시 또는 v1.0 이후 |

### 1.3 심각도 임계치

- **고 심각도 부채 3건 이상 동시 미해소**: 다음 Phase 착수 전 반드시 감소 필요
- **고+중 합산 10건 이상**: 신규 기능 개발 중단 + 부채 해소 전담 Sprint 삽입
- **단일 부채 방치 기간 > 2 Phase**: 즉시 재분류 검토 (하향 또는 폐기)

---

## 2. TD 등록부

### TD-001: Multi-tenancy 의도적 제외 → B2B 전환 시 100-120h 재설계

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 (현재 1인 운영) |
| **관련 ADR** | ADR-001 |
| **설명** | 양평 부엌 서버 대시보드는 Multi-tenancy를 명시적으로 제외(단일 워크스페이스·DB·도메인). Supabase Cloud의 `/v1/organizations`, `/v1/projects` API는 고정값 응답으로 대체. |
| **원인** | 1인 운영 + 단일 팀 + WSL2 단일 서버 전제. Multi-tenancy 도입 시 아키텍처 복잡도 30-40% 증가, Prisma 7 멀티 스키마 마이그레이션 미지원(prisma/prisma#1175). |
| **영향** | Supabase Cloud 호환 API 중 조직·프로젝트 계층이 고정값 응답. 향후 B2B SaaS 전환 시 모든 테이블에 `tenant_id` 컬럼 추가, RLS 정책 재작성, 마이그레이션 전체 롤아웃 필요. |
| **해결 방안** | Alt-1: Row-level tenant_id (RLS 격리), Alt-2: Schema per tenant (Prisma 지원 시), Alt-3: DB per tenant. 트리거 충족 시 ADR-001 재검토 후 설계 선택. |
| **예상 공수** | 100-120h (Wave 3 §4.1.3 기준) |
| **해결 목표 Phase** | Phase 22 이후 또는 ADR-001 트리거 충족 시 |
| **상태** | 감시 중 (트리거 미충족) |
| **ADR 재검토 트리거** | (1) 사용자 2명+ 6개월 지속, (2) B2B SaaS 전환 결정, (3) 독립 팀 관리 FR 추가, (4) GDPR/PIPA 법적 격리 요건 발생 |

---

### TD-002: pg_cron 거부 → SQL-only 잡 5개+ 누적 시 재고

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-005, DQ-4.2 |
| **설명** | 주기 작업 스케줄링에 pg_cron(PostgreSQL 확장) 대신 node-cron(Node.js 네이티브) 채택. PM2 fork 모드 필수(cron-worker 별도 PM2 앱으로 분리). |
| **원인** | 1인 환경에서 PG 확장 의존성 증가는 단순성 원칙(AP-1) 위반. Node 핸들러가 80% 이상이므로 pg_cron은 큐 역할만 수행하게 되어 비효율. |
| **영향** | 현재 PM2 cluster 모드 불가(cron 중복 방지). SQL-only 잡(pg_cron 자연스러운 영역)이 node-cron에서 실행되어 Node 프로세스 의존성 증가. |
| **해결 방안** | cron 작업 수가 50건+ 초과 시 또는 pg_cron이 PostgreSQL 17+에서 기본 탑재 시, ADR-005 재검토 후 pg_cron 부분 도입 또는 node-cron + pg_cron 혼용 방식 설계. |
| **예상 공수** | 20-40h (cron 아키텍처 재설계 + 마이그레이션) |
| **해결 목표 Phase** | Phase 20 또는 트리거 충족 시 |
| **상태** | 감시 중 (트리거 미충족) |
| **ADR 재검토 트리거** | (1) cron 작업 수 > 50개 + 정확도 문제, (2) wal-g major version 호환성 break, (3) Backblaze B2 가격 인상 > $1/월, (4) PostgreSQL 17+에서 pg_cron 기본 탑재 |

---

### TD-003: pg_graphql 보류 → 4개 수요 트리거 중 2개+ 충족 시 도입

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-012, ADR-016, DQ-1.6 |
| **설명** | Supabase Data API의 GraphQL 기능(pg_graphql)을 4개 수요 트리거 중 2개+ 충족 전까지 Phase 21+으로 보류. 현재 REST 강화(PostgREST 호환 80%) + pgmq만 즉시 채택. |
| **원인** | 수요 불명확 시 GraphQL 도입은 과잉 투자. 1인 + 이메일 로그인 단일 사용자 환경에서 GraphQL ROI 불확실. |
| **영향** | Supabase Cloud의 GraphQL endpoint(`/graphql/v1`) 호환 부재. 3-hop nested join이 프로덕션에 축적될 경우 REST API 복잡도 증가. |
| **해결 방안** | ADR-016의 4 수요 트리거 (팀 > 1명, 모바일 클라이언트 추가, 프론트엔드 팀 GraphQL 요청, 3-hop nested join 3건+) 중 2개 충족 시 Phase 21+에 pg_graphql 도입. PostGraphile은 대안 배제. |
| **예상 공수** | 30-50h (pg_graphql 통합 + 인트로스펙션 UI) |
| **해결 목표 Phase** | Phase 21 이후 (ADR-016 트리거 기반) |
| **상태** | 조건부 보류 (연 1회 4월 리뷰) |
| **ADR 재검토 트리거** | ADR-016의 4 조건 중 2개+ 충족 시 즉시 또는 연 1회 4월 정기 리뷰 |

---

### TD-004: rate-limiter PG UNLOGGED → QPS 임계 초과 시 Redis 이전

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 중 |
| **관련 ADR** | ADR-007, DQ-1.2 |
| **설명** | Rate Limit 저장소를 PostgreSQL `rate_limit_events` 테이블(UNLOGGED 테이블 권장)로 구현. Redis(Upstash) 대신 PG 기반 슬라이딩 윈도우 카운터 사용. |
| **원인** | Redis 도입 시 추가 장애 지점, 네트워크 RTT, Upstash 의존성 발생. NFR-SEC.4 기준 PG counter 테이블로 충분 판단 (Wave 2 C 확정). |
| **영향** | QPS 급증(> 1000 req/s) 시 PG write 병목으로 rate limit 응답 지연 가능. PG UNLOGGED 테이블은 crash 후 데이터 손실(rate limit 히스토리). |
| **해결 방안** | (1) 즉시: `rate_limit_events` UNLOGGED 확인 + TTL 기반 `DELETE WHERE expires_at < NOW()` 정기 실행, (2) 트리거 충족 시: Upstash Redis + rate-limiter-flexible 전환. |
| **예상 공수** | 10-20h (Redis 전환 + 테스트) |
| **해결 목표 Phase** | Phase 17 점검 → Phase 19 트리거 충족 시 |
| **상태** | 감시 중 |
| **ADR 재검토 트리거** | Rate Limit PG counter의 QPS > 1000 실측 시 (ADR-007 트리거 2) |

---

### TD-005: SeaweedFS 50GB+ 미검증 → spike-007 검증 후 B2 오프로드 트리거

| 필드 | 내용 |
|------|------|
| **유형** | TST (테스트 부채) |
| **심각도** | 고 |
| **관련 ADR** | ADR-008, DQ-RT-3 |
| **설명** | SeaweedFS의 50GB+ 대용량 운영 데이터 기반 부하 테스트 미수행. Wave 1에서 "권장 상한 50GB (ASM-4 검증 필요)"로 표기한 채 Phase 17 전 스파이크 예정. |
| **원인** | Wave 1/2 단계에서는 소규모 PoC만 수행. 50GB 부하 환경 재현이 Phase 17 전 스파이크(spike-007) 선행 과제. |
| **영향** | 50GB 초과 시 SeaweedFS OOM(Out-Of-Memory) 또는 GC 지연 → 파일 업로드/다운로드 응답 지연, 서비스 중단 가능. Garage 대안 검토도 미완료. |
| **해결 방안** | (1) Phase 17 착수 전 spike-007 실행: 50GB 더미 데이터 로드 + 동시 업로드 테스트 + 메모리 모니터링, (2) 실패 시 B2 오프로드 임계치 하향 (50GB → 20GB), (3) 최악 시 Garage 대안 평가. |
| **예상 공수** | 15-25h (spike-007 설계 + 실행 + 분석) |
| **해결 목표 Phase** | Phase 17 착수 전 (선행 조건) |
| **상태** | 미완료 — Phase 17 착수 전 필수 |
| **ADR 재검토 트리거** | ADR-008: (1) SeaweedFS restart failure > 1건/주, (2) 파일 손상 1건+, (3) 커뮤니티 이탈 |

---

### TD-006: Realtime wal2json PG 버전 의존 → spike-008 매트릭스 검증 + pg_logical 폴백

| 필드 | 내용 |
|------|------|
| **유형** | TST (설계+테스트 부채) |
| **심각도** | 고 |
| **관련 ADR** | ADR-010, DQ-RT-6 |
| **설명** | wal2json 확장이 PostgreSQL 버전에 의존. PG 14/15/16 호환 매트릭스 미검증. PostgreSQL 업그레이드 시 wal2json 비호환 발생 가능 (ADR-010 트리거 1). |
| **원인** | Wave 2 E에서 wal2json + supabase-realtime 포팅 하이브리드 결정 후, 버전별 호환 매트릭스 검증은 Phase 19 전 spike-008로 위임. |
| **영향** | PostgreSQL 업그레이드 시 CDC 이벤트 중단 → Realtime 전체 비작동. supabase-realtime 포팅의 Elixir→Node 부분도 PG 버전 의존 가능성. |
| **해결 방안** | (1) spike-008: PG 14/15/16/17 × wal2json 버전 호환 매트릭스 문서화, (2) pg_logical 대안 경로 사전 문서화, (3) PG 업그레이드 전 wal2json 호환 확인 체크리스트 구축, (4) 비작동 시 폴백: 5초 간격 REST API 폴링 mode. |
| **예상 공수** | 20-30h (spike-008 + 매트릭스 + 폴백 로직) |
| **해결 목표 Phase** | Phase 19 착수 전 |
| **상태** | 미완료 — Phase 19 전 선행 조건 |
| **ADR 재검토 트리거** | ADR-010: (1) PG 18+에서 wal2json 비호환, (2) pgoutput 네이티브가 wal2json 수준 JSON 출력 제공 시 |

---

### TD-007: Edge Functions 3층 미통합 → spike-005 단계적 롤아웃

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 고 |
| **관련 ADR** | ADR-009 |
| **설명** | Edge Functions 3층 하이브리드(L1: isolated-vm v6, L2: Deno 사이드카, L3: Vercel Sandbox)의 `decideRuntime()` 라우터 통합 미구현. Phase 19에서 80h 예상. |
| **원인** | 각 런타임의 강점 취합을 위해 3층 구조를 채택했으나, 라우팅 로직과 모니터링·디버깅 공수가 Phase 19 전체를 차지. spike-005에서 Layer 1부터 단계적 검증 필요. |
| **영향** | Edge Functions 전체 비작동 리스크. isolated-vm v6 Node 24 ABI 호환 문제 발생 시 L1 자체 위험. Vercel Sandbox 비용 정책 변경 시 L3 위험. |
| **해결 방안** | (1) spike-005 심화: L1(isolated-vm) 단독 배포 → 안정화, (2) L2(Deno 사이드카) 추가, (3) L3(Vercel Sandbox) 조건부 위임, (4) `decideRuntime()` 단위 테스트 100% 커버리지, (5) L1 단독 폴백 모드(isolated-vm only) 유지. |
| **예상 공수** | 80h (Phase 19) |
| **해결 목표 Phase** | Phase 19 |
| **상태** | 미착수 |
| **ADR 재검토 트리거** | ADR-009: (1) isolated-vm v6 Node 24 ABI 호환 깨짐, (2) Deno 2.x Next.js 통합 공식 지원, (3) Edge function invocation 월 > 10만 시 Vercel Sandbox 비용 재평가 |

---

### TD-008: bcryptjs → argon2 미전환

| 필드 | 내용 |
|------|------|
| **유형** | COD (코드 부채) |
| **심각도** | 중 |
| **관련 ADR** | ADR-006 (Wave 5 ADR-022 예상), DQ-AC-1 |
| **설명** | 현재 비밀번호 해시에 bcryptjs 사용 중. argon2id(더 강력한 메모리-하드 해시 함수)로의 전환이 CON-10 재평가 후 예정되었으나 미이행. |
| **원인** | Wave 1/2에서 기존 jose + bcrypt + Prisma `User` 자산 보존 결정. argon2 전환은 Node.js 네이티브 모듈 빌드 요구(Windows WSL2 환경 주의)로 추가 검증 필요. |
| **영향** | bcryptjs는 bcrypt 알고리즘이지만 JavaScript 순수 구현 → Node.js 네이티브 bcrypt 대비 3-5배 느림. argon2 대비 side-channel 취약성 상대적으로 높음. DQ-AC-1 미해결. |
| **해결 방안** | (1) argon2 패키지 WSL2 환경 빌드 검증, (2) `hashPassword()` 함수 argon2id 전환, (3) 기존 bcryptjs 해시 사용자 → 다음 로그인 시 자동 마이그레이션(Lazy migration), (4) ADR-022 작성 후 확정. |
| **예상 공수** | 8-15h (구현 + 마이그레이션 + 테스트) |
| **해결 목표 Phase** | Phase 17 (Auth Core 완성 단계) |
| **상태** | 계획됨 |
| **ADR 재검토 트리거** | ADR-006 Wave 5 ADR-022: CON-10 재평가 결과 |

---

### TD-009: PM2 fork → cluster 미전환

| 필드 | 내용 |
|------|------|
| **유형** | COD (코드 부채) |
| **심각도** | 중 |
| **관련 ADR** | ADR-005, ADR-015, DQ-4.1 |
| **설명** | 현재 PM2 fork 모드로 운영 중. ADR-015에서 PM2 cluster:4를 목표로 명시했으나, cron-worker 중복 방지를 위해 메인 앱은 fork 모드 유지. cron-worker는 별도 PM2 앱(fork)으로 분리 필요. |
| **원인** | ADR-005에서 node-cron 채택 시 PM2 cluster 모드에서 cron 중복 실행 방지 문제 발생. 해결책으로 cron-worker 별도 분리, 메인 앱 cluster 전환은 Phase 16 Operations에서 이행. |
| **영향** | 현재 단일 Node.js 프로세스로 다중 CPU 코어 미활용. 트래픽 증가 시 응답 지연 리스크. PM2 cluster:4 전환 후 Node.js worker_threads 고려 필요. |
| **해결 방안** | (1) cron-worker 별도 PM2 앱 분리 확인, (2) 메인 대시보드 앱 `cluster:4` 전환, (3) cluster 모드에서 socket.io / SeaweedFS 연결 공유 확인 (sticky session 등), (4) 부하 테스트로 cluster:4 vs fork 성능 비교. |
| **예상 공수** | 10-20h (cluster 전환 + 검증) |
| **해결 목표 Phase** | Phase 16 (Operations 강화) |
| **상태** | 계획됨 |
| **ADR 재검토 트리거** | ADR-015 Docker 이행 트리거: (1) 월간 트래픽 > 100만, (2) 팀 > 2명, (3) 다중 환경, (4) B2B SaaS |

---

### TD-010: Docker 미이행 (DQ-OPS-1) — 트리거 0개 충족

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-015, DQ-OPS-1 |
| **설명** | 배포 방식으로 네이티브 PM2 + Capistrano-style symlink 채택. Docker Compose(8-10 컨테이너) 거부. Docker 이행 4개 트리거 중 현재 0개 충족. |
| **원인** | 1인 운영, 단일 서버 환경에서 Docker 오버헤드 > 이점. setup 15분 이내 목표(NFR-MNT.1). Kubernetes는 수평 확장 불필요. |
| **영향** | 환경 재현성 부족(dev/stg/prod 간 차이 가능). 팀 확장 시 환경 표준화 어려움. 수평 확장 요구 시 재설계 100h+ 예상. |
| **해결 방안** | 트리거 충족 시: (1) Docker Compose 멀티 서비스 구성, (2) cron-worker / main / seaweedfs / postgres 컨테이너화, (3) PM2 프로세스 관리를 Docker restart policy로 대체. |
| **예상 공수** | 40-60h (Docker 전환 + CI/CD 통합) |
| **해결 목표 Phase** | Phase 22 이후 또는 ADR-015 트리거 충족 시 |
| **상태** | 감시 중 (트리거 미충족) |
| **ADR 재검토 트리거** | ADR-015: 월간 트래픽 > 100만 / 팀 > 2명 / 다중 환경 / B2B SaaS 전환 |

---

### TD-011: BullMQ Redis 미도입 (DQ-4.3)

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-005, DQ-4.3 |
| **설명** | 작업 큐로 pgmq(PostgreSQL 기반)를 채택, BullMQ(Redis 기반 고성능 큐)는 미도입. 현재 Outbox 패턴 + pgmq 조합으로 충분하다고 판단. |
| **원인** | Redis 추가 인프라 의존성 회피. pgmq는 PG 트랜잭션과 동일 경계 내에서 at-least-once 보장. BullMQ의 장점(고처리량, 우선순위 큐, 대시보드)이 현재 규모에서 과잉. |
| **영향** | 고처리량 비동기 잡(이메일 발송, 대용량 파일 처리, 알림 배치 등) 요구 시 pgmq의 처리 성능 한계 도달 가능. |
| **해결 방안** | pgmq 처리 지연 > 5초 지속 또는 큐 depth > 1만건 시 BullMQ 검토. Redis 도입 결정 시 rate-limiter(TD-004)와 함께 단일 Redis 인스턴스 공유 고려. |
| **예상 공수** | 20-30h (BullMQ 통합 + pgmq 마이그레이션) |
| **해결 목표 Phase** | Phase 21 이후 또는 트리거 충족 시 |
| **상태** | 감시 중 |
| **ADR 재검토 트리거** | pgmq 처리 지연 > 5초 또는 큐 depth > 10,000건 |

---

### TD-012: Capacitor 모바일 미지원 (DQ-12.5)

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | Wave 5 ADR-023 예상, DQ-12.5 |
| **설명** | 현재 Next.js 웹 대시보드만 지원. Capacitor/Expo 기반 모바일 앱 미지원. DQ-14.x에서 모바일 비전 미확정. |
| **원인** | 1인 운영, 단일 관리자(김도영) 환경에서 모바일 필요성 없음. Capacitor 통합은 pg_graphql 수요 트리거(ADR-016 트리거 2)와 연계. |
| **영향** | 모바일에서 서버 상태 확인 불가. 외부 팀원 추가 시 모바일 접근 요구 가능. |
| **해결 방안** | 모바일 클라이언트 수요 트리거 충족 시: Capacitor + Next.js 하이브리드 또는 React Native Expo 별도 앱. PWA 중간 단계 가능. |
| **예상 공수** | 60-100h (모바일 앱 초기 구축) |
| **해결 목표 Phase** | Phase 22 이후 또는 ADR-023 결정 시 |
| **상태** | 비전 미확정 |
| **ADR 재검토 트리거** | ADR-023 예상 (DQ-14.x 답변 + 모바일 클라이언트 수요 트리거) |

---

### TD-013: AG Grid Enterprise 미도입 (DQ-1.14, SaaS 매출 모델 아님)

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-002, DQ-1.14 |
| **설명** | Table Editor에 TanStack v8 헤드리스 자체구현 채택. AG Grid(상용, $999/개발자) 및 AG Grid Enterprise 라인 미도입. |
| **원인** | CON-7(라이선스: 오픈소스만) + CON-9(비용 상한) 위반. 양평 부엌은 SaaS 매출 모델이 아님. 100만 row 이하 TanStack으로 충분. |
| **영향** | 매우 복잡한 그리드 기능(피벗, 서버사이드 행 그룹, 엑셀 내보내기 고급)은 자체 구현 필요. Wave 2 A 매트릭스에서 AG Grid 평가 최하위. |
| **해결 방안** | TanStack v8 자산 100만 row+ 도달 전까지 유지. 100만 row+ + p95 > 1.2s 동시 충족 시 ADR-002 재검토(트리거 1). |
| **예상 공수** | 60-80h (AG Grid 전환, 비즈니스 모델 전환 후) |
| **해결 목표 Phase** | 비즈니스 모델 전환 또는 ADR-002 트리거 1 충족 시 |
| **상태** | 비도입 결정 |
| **ADR 재검토 트리거** | ADR-002: row 수 100만+ + p95 > 1.2s 또는 MIT/Apache-2.0 저명 그리드 OSS 등장 |

---

### TD-014: Anonymous role 미구현 (DQ-AC-3, Wave 3 답변)

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-006, DQ-AC-3 |
| **설명** | Supabase의 `anon` role(비인증 접근 허용)을 현재 미구현. 1인 관리자 대시보드로 모든 접근에 인증 필수. |
| **원인** | 1인 운영, 단일 관리자 환경. 외부 사용자 비인증 접근 시나리오 없음. Wave 3에서 "잠정 미이행" 결론. |
| **영향** | Supabase 호환 API(`/rest/v1` anon key 인증 패턴)의 Anonymous 접근 호환성 없음. |
| **해결 방안** | 외부 사용자 또는 Public API 요구 시 `anon_role` + RLS `for all using (true)` 패턴 구현. OAuth Phase 18 이후 연계 가능. |
| **예상 공수** | 15-25h |
| **해결 목표 Phase** | Phase 22 이후 또는 외부 사용자 요구 시 |
| **상태** | 비이행 결정 |
| **ADR 재검토 트리거** | 외부 사용자 접근 요구 또는 ADR-017 OAuth 도입 시 연계 검토 |

---

### TD-015: Cloudflare Tunnel 530 산발 (확률 매우 낮음, 25-C 결론)

| 필드 | 내용 |
|------|------|
| **유형** | COD (운영 부채) |
| **심각도** | 중 |
| **관련 ADR** | 없음 (운영 레벨) |
| **설명** | 세션 25-C에서 sysctl 튜닝 후 curl 28/28 성공(100% 관통)이지만 Playwright 실행 중 530 1건 재발. KT 회선 패킷 drop이 완전 소실된 게 아니라 **빈도 격감** 상태. |
| **원인** | WSL2 + Windows 11 + KT 회선의 TCP keepalive 특성. sysctl `net.ipv4.tcp_keepalive_time=60` + `rmem_max/wmem_max=16MB` 조정으로 대폭 개선했으나 100% 보증은 아님. |
| **영향** | Playwright E2E 테스트에서 산발 530으로 인한 false negative. 실 사용자에게는 빈도 매우 낮음(체감 불가 수준). |
| **해결 방안** | (1) `playwright.config.ts`에 `retries: 2` 추가 (530 흡수), (2) `login()` 헬퍼에 530 체크 + 지수 백오프 재시도, (3) 필요 시 cloudflared 다중 인스턴스 round-robin (세션 25-C 후속 #3), (4) 100-trial 정량 측정으로 안정성 % 확정. |
| **예상 공수** | 5-15h (Playwright 개선 + 다중 인스턴스 검토) |
| **해결 목표 Phase** | Phase 15 착수 전 (E2E 테스트 기반 확보) |
| **상태** | 부분 완화됨 (빈도 대폭 감소) |
| **ADR 재검토 트리거** | 530 빈도 > 1회/주 지속 시 다중 인스턴스 전환 검토 |

---

### TD-016: Vercel Sandbox 의존성 (Edge Fn Layer 3) — Vercel 정책 변경 리스크

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 중 |
| **관련 ADR** | ADR-009 |
| **설명** | Edge Functions 3층 구조의 L3(Vercel Sandbox)이 외부 SaaS 서비스에 의존. Vercel Sandbox의 가격·정책 변경 또는 서비스 중단 시 L3 기능 전체 손실. |
| **원인** | isolated-vm(L1)과 Deno(L2)만으로 일부 고비용 격리 환경을 대체하기 어려워 L3로 위임. AP-5(비용 제약)상 Vercel Sandbox는 "invocation당 과금"이므로 월 10만+ 시 재평가 필요. |
| **영향** | Vercel Sandbox 가격 인상 시 L3 기능 비용 급증. Vercel 정책 변경 시 아키텍처 재설계 필요. 단일 외부 의존성 리스크. |
| **해결 방안** | (1) L3 대안: Firecracker MicroVM 또는 gVisor 자체 호스팅 검토, (2) L3 사용 최소화: L1/L2로 처리 가능한 케이스 최대화, (3) ADR-009 트리거 3 모니터링(월 10만 invocation). |
| **예상 공수** | 30-60h (대안 런타임 검토 + 마이그레이션) |
| **해결 목표 Phase** | Phase 19 이후 또는 Vercel 정책 변경 시 |
| **상태** | 감시 중 |
| **ADR 재검토 트리거** | ADR-009: Edge function invocation 월 > 10만 또는 Vercel Sandbox 가격 2배 인상 |

---

### TD-017: WAL 14일 PITR 한계 (DQ-4.12) — 14일 초과 복구 불가

| 필드 | 내용 |
|------|------|
| **유형** | DES (설계 부채) |
| **심각도** | 중 |
| **관련 ADR** | ADR-005 |
| **설명** | wal-g + Backblaze B2 기반 PITR(Point-In-Time Recovery)의 WAL 보존 기간이 14일로 설정 예정. 14일 초과 시점의 데이터는 복구 불가. |
| **원인** | B2 스토리지 비용(월 $0.006/GB) + WAL 누적 크기를 고려한 현실적 보존 기간 선택. Supabase Cloud는 7일(Pro) 또는 무제한(Enterprise). |
| **영향** | 14일 이전 데이터 침해 또는 손상 발견 시 해당 시점 복구 불가. 규정(GDPR/PIPA)에서 특정 시점 복구 요구 시 불응. |
| **해결 방안** | (1) Full backup 월 1회 별도 장기 보관(B2 Lifecycle 90일), (2) 14일 이후 복구 필요 케이스 분석하여 보존 기간 재설정, (3) pgBackRest로 전환 시 더 유연한 보존 정책 가능(ADR-005 대안). |
| **예상 공수** | 10-20h (보존 정책 재설계 + 테스트) |
| **해결 목표 Phase** | Phase 20 (DB Ops 심화) |
| **상태** | 계획됨 |
| **ADR 재검토 트리거** | 법적 데이터 보존 요건 발생 또는 14일 초과 복구 케이스 실제 발생 |

---

### TD-018: supabase-studio upstream 변경 모니터링 미자동화

| 필드 | 내용 |
|------|------|
| **유형** | DOC (문서+운영 부채) |
| **심각도** | 중 |
| **관련 ADR** | ADR-003 |
| **설명** | SQL Editor 구현에서 supabase-studio(Apache-2.0) 패턴을 직접 포팅. upstream 변경 시 포팅된 패턴과 乖離가 생길 수 있으나 자동 모니터링 미구축. |
| **원인** | supabase-studio의 라이선스 변경(Apache-2.0 → AGPL/BSL)은 ADR-003 재검토 트리거 1. 단순 코드 변경은 수동 추적 중. |
| **영향** | supabase-studio 라이선스 변경 시 즉시 포팅 패턴 전면 재검토 필요. 기능 업데이트 놓침 시 호환성 갭 누적. |
| **해결 방안** | (1) GitHub Watch + Release alert 구독, (2) `CHANGELOG.md` 월간 확인 체크리스트에 추가, (3) Monaco Editor v0.50+ breaking change 테스트 자동화. |
| **예상 공수** | 3-5h (모니터링 설정 + 체크리스트) |
| **해결 목표 Phase** | Phase 18 착수 전 |
| **상태** | 수동 모니터링 중 |
| **ADR 재검토 트리거** | ADR-003: supabase-studio 라이선스 변경 또는 Monaco v0.50+ breaking change |

---

### TD-019: MASTER_KEY 단일 운영자 책임 (백업 절차 미자동화)

| 필드 | 내용 |
|------|------|
| **유형** | DOC (운영 부채) |
| **심각도** | 고 |
| **관련 ADR** | ADR-013 |
| **설명** | MASTER_KEY(`/etc/luckystyle4u/secrets.env`)의 백업이 "인쇄 또는 GPG 암호화 USB" 방식으로 운영자 개인 책임. 디스크 손상 + 백업 미수행 시 KEK 영구 손실 → 모든 Vault 데이터 복호화 불가. |
| **원인** | AWS KMS(월 $1+) 거부, HashiCorp Vault 별도 프로세스 부담 거부로 인한 단순화 결정. ADR-013에서 "MASTER_KEY 백업본(인쇄/GPG USB)" 대응으로 명시. |
| **영향** | WSL2 디스크 손상 + MASTER_KEY 백업 없음 → 모든 암호화 데이터(Vault 시크릿 전체) 영구 손실. 단일 장애점(Single Point of Failure) 중 가장 심각한 항목. |
| **해결 방안** | (1) MASTER_KEY 초기 설정 시 GPG 암호화 USB + 인쇄 백업 의무화 절차서 작성, (2) 연 1회 MASTER_KEY 백업 검증(복구 드릴), (3) DEK 회전 주기 365일 캘린더 알림 설정, (4) HashiCorp Vault OSS 단일 바이너리화 시 재고(ADR-013 트리거 3). |
| **예상 공수** | 5-10h (절차서 + 검증 드릴) |
| **해결 목표 Phase** | Phase 16 (Observability 완성 시점, 즉시) |
| **상태** | 긴급 — Phase 16 전 필수 |
| **ADR 재검토 트리거** | ADR-013: MASTER_KEY 유출 의심 시 즉시 회전 / DEK 회전 주기 365일 |

---

### TD-020: TanStack Table v8 → v9 major release 대비 없음

| 필드 | 내용 |
|------|------|
| **유형** | COD (코드 부채) |
| **심각도** | 저 |
| **관련 ADR** | ADR-002 |
| **설명** | Table Editor는 TanStack Table v8 헤드리스 기반. v9 major release 시 ABI 깨짐(breaking change) 가능성. 현재 v8 고정 의존성으로 대비 없음. |
| **원인** | TanStack Table v9 미출시 상태에서 불확실한 API 변경에 사전 대비 어려움. v8 현재 안정적. |
| **영향** | v9 major release 시 Table Editor 전체 재작성 가능성(ADR-002 트리거 2). 14c-α~14e 전체 영향. |
| **해결 방안** | (1) TanStack v9 출시 시 changelog 즉시 분석, (2) 핵심 API(`useReactTable`, `getCoreRowModel` 등) 추상화 레이어 래퍼 도입으로 이전 비용 감소, (3) v9 이전 공수 예상 후 ADR-002 재검토. |
| **예상 공수** | 20-40h (v9 이전 시) |
| **해결 목표 Phase** | TanStack v9 출시 후 즉시 또는 Phase 22 |
| **상태** | 감시 중 |
| **ADR 재검토 트리거** | ADR-002: TanStack Table v9 major release로 v8 ABI 깨짐 |

---

### TD-021: Prisma 7 → 8 업그레이드 타이밍 미확정 (ADR-019 예상)

| 필드 | 내용 |
|------|------|
| **유형** | COD (코드 부채) |
| **심각도** | 저 |
| **관련 ADR** | Wave 5 ADR-019 예상 |
| **설명** | Prisma 7 기반 운영 중. Prisma 8 출시 예상 시 마이그레이션 타이밍과 전략 미확정. ADR-019로 Wave 5에서 확정 예정. |
| **원인** | Prisma 8 미출시 상태에서 사전 결정 불가. Wave 5 스파이크(ASM-11) 결과 기반으로 결정 예정. |
| **영향** | Prisma 7 EOL 발생 시 보안 패치 미제공. Prisma 8의 새 기능(멀티 스키마 지원 강화 등) 미활용. |
| **해결 방안** | (1) Prisma 8 출시 시 ASM-11 검증 스파이크 실행, (2) ADR-019 작성 후 업그레이드 타이밍 확정, (3) Prisma 7→8 마이그레이션 가이드 사전 분석. |
| **예상 공수** | 15-30h (호환성 검증 + 마이그레이션) |
| **해결 목표 Phase** | Prisma 8 출시 후 Phase 22 이전 |
| **상태** | 대기 중 (Prisma 8 미출시) |
| **ADR 재검토 트리거** | Prisma 8 출시 또는 Prisma 7 EOL 공지 |

---

### TD-022: isolated-vm v6 CVE 추적 자동화 미구축

| 필드 | 내용 |
|------|------|
| **유형** | DOC (보안 부채) |
| **심각도** | 고 |
| **관련 ADR** | ADR-009 |
| **설명** | Edge Functions L1의 isolated-vm v6가 V8 취약점 기반 sandbox escape 위험 보유. CVE 추적 구독 + 즉시 패치 정책 명시되어 있으나 자동화 미구축. |
| **원인** | Phase 19 Edge Functions 구현 전 단계에서 CVE 추적 자동화 우선순위 낮게 설정. |
| **영향** | V8 취약점 발표 후 즉시 패치 미이행 시 sandbox escape → 호스트 Node.js 프로세스 장악 가능. 매우 높은 영향도(E2: Elevation of Privilege). |
| **해결 방안** | (1) GitHub Dependabot alert 설정(isolated-vm 저장소 Watch), (2) npm audit 주간 자동 실행 + PM2 cron 통합, (3) V8/Node.js CVE RSS 구독, (4) 패치 발표 후 24시간 내 배포 정책 문서화. |
| **예상 공수** | 3-5h (자동화 설정) |
| **해결 목표 Phase** | Phase 19 착수 전 (즉시 권장) |
| **상태** | 수동 추적 중 |
| **ADR 재검토 트리거** | ADR-009: isolated-vm v6 CVE 발표 즉시 |

---

## 3. 부채 관리 프로세스

### 3.1 등록 → 완료 6단계

```
1. 등록 (Registration)
   - 발견 즉시 이 파일에 TD-NNN 항목 추가
   - 9개 필드 전부 기재
   - ADR 인용 시 ADR-NNN 표기 필수

2. 분류 (Classification)
   - 유형(DES/COD/TST/DOC) 확정
   - 심각도(고/중/저) 판정
   - Phase 매핑 초안 작성

3. 우선순위 결정 (Prioritization)
   - 심각도 고 → 다음 Phase 1순위
   - 심각도 중 → 해당 Phase에 배치
   - 심각도 저 → 트리거 충족 또는 v1.0 이후

4. 할당 (Assignment)
   - 해결 목표 Phase 확정 (관련 ADR과 연계)
   - 예상 공수 확정
   - 선행 조건(spike/ADR) 명시

5. 검증 (Verification)
   - 구현 완료 후 테스트/스파이크 결과로 검증
   - ADR 재검토 트리거 업데이트

6. 완료 (Closure)
   - 상태를 "완료"로 변경
   - 관련 ADR 상태 업데이트 (Superseded 등)
   - 역사 삭제 금지 — 완료된 항목도 보존
```

### 3.2 부채 임계치 규칙

| 조건 | 행동 |
|------|------|
| 심각도 고 부채 3건+ 동시 미해소 | 다음 Phase 착수 전 반드시 고 부채 2건 이하로 감소 |
| 심각도 고+중 합산 10건+ | 신규 기능 개발 일시 중단 + 부채 해소 Sprint 삽입 |
| 단일 부채 방치 기간 > 2 Phase | 즉시 재분류 검토 (심각도 상향 또는 폐기) |
| ADR 재검토 트리거 충족 | Phase 관계없이 즉시 관련 TD 재검토 |

### 3.3 월간 리뷰 체크리스트

```
[ ] 고 심각도 부채 미해소 건 확인
[ ] ADR 재검토 트리거 근접 여부 체크 (각 ADR 트리거 조건 측정)
[ ] 신규 부채 발견 시 등록
[ ] 이번 Phase 완료 부채 상태 업데이트
[ ] 다음 Phase 부채 해소 계획 확인
```

---

## 4. 부채 ↔ Phase 매핑표

| TD | Phase 15 | Phase 16 | Phase 17 | Phase 18 | Phase 19 | Phase 20 | Phase 21 | Phase 22+ |
|----|----------|----------|----------|----------|----------|----------|----------|-----------|
| TD-001 Multi-tenancy | — | — | — | — | — | — | — | 트리거 시 |
| TD-002 pg_cron | — | — | — | — | — | 점검 | — | 트리거 시 |
| TD-003 pg_graphql | — | — | — | — | — | — | 점검 | 트리거 시 |
| TD-004 Rate Limit Redis | — | — | 점검 | — | 트리거 시 | — | — | — |
| TD-005 SeaweedFS 50GB | — | — | **착수 전 필수** | — | — | — | — | — |
| TD-006 wal2json PG 버전 | — | — | — | — | **착수 전 필수** | — | — | — |
| TD-007 Edge Fn 3층 | — | — | — | — | **착수** | — | — | — |
| TD-008 argon2 | — | — | **착수** | — | — | — | — | — |
| TD-009 PM2 cluster | — | **착수** | — | — | — | — | — | — |
| TD-010 Docker | — | — | — | — | — | — | — | 트리거 시 |
| TD-011 BullMQ | — | — | — | — | — | — | 점검 | 트리거 시 |
| TD-012 Capacitor | — | — | — | — | — | — | — | 트리거 시 |
| TD-013 AG Grid | — | — | — | — | — | — | — | 트리거 시 |
| TD-014 Anonymous | — | — | — | — | — | — | — | 트리거 시 |
| TD-015 530 산발 | **착수** | — | — | — | — | — | — | — |
| TD-016 Vercel Sandbox | — | — | — | — | 점검 | — | — | 트리거 시 |
| TD-017 WAL PITR | — | — | — | — | — | **착수** | — | — |
| TD-018 upstream 모니터링 | — | — | — | **착수 전** | — | — | — | — |
| TD-019 MASTER_KEY 백업 | — | **긴급** | — | — | — | — | — | — |
| TD-020 TanStack v9 | — | — | — | — | — | — | — | 트리거 시 |
| TD-021 Prisma 8 | — | — | — | — | — | — | — | 트리거 시 |
| TD-022 isolated-vm CVE | — | 착수 | — | — | **착수 전** | — | — | — |

---

## 5. 부채 ↔ ADR 재검토 트리거 매트릭스

ADR 18건 × 약 45개 트리거 중 부채와 직접 연계된 항목:

| ADR | 재검토 트리거 | 연계 TD |
|-----|-------------|---------|
| ADR-001 | 사용자 2명+ 6개월 지속 | TD-001 |
| ADR-001 | B2B SaaS 전환 결정 | TD-001, TD-010, TD-013 |
| ADR-001 | 독립 팀 관리 FR 추가 | TD-001, TD-014 |
| ADR-001 | GDPR/PIPA 법적 격리 요건 | TD-001, TD-017 |
| ADR-002 | row 100만+ + p95 > 1.2s | TD-013, TD-020 |
| ADR-002 | TanStack v9 ABI 깨짐 | TD-020 |
| ADR-003 | supabase-studio 라이선스 변경 | TD-018 |
| ADR-003 | Monaco v0.50+ breaking change | TD-018 |
| ADR-005 | cron 작업 > 50개 + 정확도 문제 | TD-002 |
| ADR-005 | Backblaze B2 가격 > $1/월 | TD-002, TD-017 |
| ADR-005 | PG 17+에서 pg_cron 기본 탑재 | TD-002 |
| ADR-007 | Rate Limit PG QPS > 1000 | TD-004 |
| ADR-008 | SeaweedFS restart > 1건/주 | TD-005 |
| ADR-008 | 파일 손상 1건+ | TD-005 |
| ADR-009 | isolated-vm v6 Node 24 ABI 깨짐 | TD-007, TD-022 |
| ADR-009 | Edge fn invocation 월 > 10만 | TD-016 |
| ADR-010 | PG 18+에서 wal2json 비호환 | TD-006 |
| ADR-012 | pg_graphql 트리거 2개+ 충족 | TD-003 |
| ADR-013 | MASTER_KEY 유출 의심 | TD-019 |
| ADR-013 | DEK 회전 주기 365일 | TD-019 |
| ADR-015 | 월간 트래픽 > 100만 | TD-009, TD-010 |
| ADR-015 | 팀 > 2명 | TD-010, TD-014 |

---

## 6. 부채 현황 요약표

| # | TD | 유형 | 심각도 | 해결 목표 Phase | 상태 |
|---|----|------|--------|----------------|------|
| 1 | TD-001 Multi-tenancy | DES | 저 | Phase 22+ | 감시 중 |
| 2 | TD-002 pg_cron | DES | 저 | Phase 20 / 트리거 시 | 감시 중 |
| 3 | TD-003 pg_graphql | DES | 저 | Phase 21+ | 조건부 보류 |
| 4 | TD-004 Rate Limit Redis | DES | 중 | Phase 19 / 트리거 시 | 감시 중 |
| 5 | TD-005 SeaweedFS 50GB | TST | **고** | Phase 17 전 필수 | 미완료 |
| 6 | TD-006 wal2json PG 버전 | TST | **고** | Phase 19 전 필수 | 미완료 |
| 7 | TD-007 Edge Fn 3층 | DES | **고** | Phase 19 | 미착수 |
| 8 | TD-008 argon2 | COD | 중 | Phase 17 | 계획됨 |
| 9 | TD-009 PM2 cluster | COD | 중 | Phase 16 | 계획됨 |
| 10 | TD-010 Docker | DES | 저 | Phase 22+ | 트리거 미충족 |
| 11 | TD-011 BullMQ | DES | 저 | Phase 21+ | 감시 중 |
| 12 | TD-012 Capacitor | DES | 저 | Phase 22+ | 비전 미확정 |
| 13 | TD-013 AG Grid Enterprise | DES | 저 | 비즈니스 전환 시 | 비도입 결정 |
| 14 | TD-014 Anonymous role | DES | 저 | Phase 22+ | 비이행 결정 |
| 15 | TD-015 530 산발 | COD | 중 | Phase 15 착수 전 | 부분 완화 |
| 16 | TD-016 Vercel Sandbox | DES | 중 | Phase 19+ | 감시 중 |
| 17 | TD-017 WAL PITR | DES | 중 | Phase 20 | 계획됨 |
| 18 | TD-018 upstream 모니터링 | DOC | 중 | Phase 18 전 | 수동 중 |
| 19 | TD-019 MASTER_KEY 백업 | DOC | **고** | Phase 16 (긴급) | 긴급 |
| 20 | TD-020 TanStack v9 | COD | 저 | 트리거 시 | 감시 중 |
| 21 | TD-021 Prisma 8 | COD | 저 | Prisma 8 출시 후 | 대기 중 |
| 22 | TD-022 isolated-vm CVE | DOC | **고** | Phase 19 전 (즉시) | 수동 추적 |

**고 심각도 부채**: TD-005, TD-006, TD-007, TD-019, TD-022 — **5건**  
현재 5건이므로 임계치(3건+) 초과. Phase 15~16 착수 전 최소 2건 해소 필요.

---

## 부록 Z. 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent W5-R2 (Sonnet 4.6) | Wave 5 R2 — TD-001~TD-022 22건, ADR 18건 재검토 트리거 22건 연계 |

> **기술부채 레지스트리 끝.** Wave 5 · R2 · 2026-04-18 · 양평 부엌 서버 대시보드 — 22 부채 × 6 유형/심각도 매트릭스 누적.
