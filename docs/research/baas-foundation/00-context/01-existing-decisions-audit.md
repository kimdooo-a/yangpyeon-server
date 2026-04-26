# 01 — 기존 결정 + Wave + Spike 통합 감사

> 작성: 2026-04-26 (Explore sub-agent #1 산출물)
> 목적: ADR-022~029 작성자가 "이미 결정된 것"을 다시 결정하지 않도록 지시하는 컨텍스트.

---

## 1. 이미 결정된 사항 (재결정 금지)

### 1.1 데이터 격리 모델: 단일 테넌트 **의도적 제외** (재검토 트리거 발동됨)
- **출처**: `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md` (ADR-001, 세션 26 확정)
- **결정**: Multi-tenancy 미지원. **명시적 설계 결정**.
- **재검토 트리거** (4가지 중 하나 충족 시):
  1. 사용자 2명+ **6개월 이상 지속** ✅ **현재 충족** (10~20개 프로젝트 영구 운영)
  2. B2B SaaS 전환 명시적 결정
  3. "독립 팀/조직 관리" FR 신규 추가 ✅ **현재 충족**
  4. GDPR/개인정보보호법 등 법적 격리 요건
- **전환 비용 (당시 추정)**: 100~120h (스키마 + Auth + API + UI + 테스트)
- **2026-04-26 갱신**: 사용자 요구로 트리거 발동. ADR-022로 supersede.

### 1.2 Plugin/도메인 코드 격리: 단일 Next.js 인스턴스
- **출처**: ADR-001, `02-architecture/00-system-overview.md`
- **결정**: 서브도메인 기반 테넌트 라우팅 미구현. `stylelucky4u.com` 단일 진입점.
- **현재**: 모든 기능이 단일 코드베이스(`src/`) 내 구현. 테넌트별 코드 분리 없음.

### 1.3 인스턴스 모델: 단일 물리 서버
- **출처**: ADR-001, 08-system-overview.md (L0 인프라)
- **결정**: WSL2 Ubuntu + PM2 + 단일 Node 프로세스 + 단일 PostgreSQL + 단일 SQLite + 단일 SeaweedFS
- **대안 검토 및 기각** (당시):
  - Schema-per-tenant: Prisma 미지원, 마이그레이션 복잡도 ❌
  - DB-per-tenant: 인프라 비용 폭증 ❌
  - 경량 워크스페이스: 실질적 격리 없음 ❌
- **2026-04-26 갱신**: ADR-023/024/025에서 재검토. 특히 schema-per-tenant는 Prisma multiSchema 지원이 향상되어 다시 검토 가치 있음.

### 1.4 Tenant Manifest/Registry: 고정 메타데이터
- **결정**: 단일 워크스페이스 개념. UI에서 Organization/Project 선택 드롭다운 없음.
- **API 응답**: `organization.id = "yangpyeong"`, `project.id = "default"` 고정값.

### 1.5 Multi-tenant Router 패턴: 미구현
- **결정**: 라우팅 계층 없음. 모든 쿼리가 동일 DB(`public` 스키마) 공유.
- **tenant_id 컬럼**: 전체 테이블에서 제외.

### 1.6 Cron Worker Pool / Per-tenant Isolation: Node-cron + advisory lock
- **출처**: ADR-005 (Phase 14c-α) + spike-010 (PM2 cluster, 세션 29)
- **결정**: node-cron + PostgreSQL `pg_try_advisory_lock()` 기반 중복 방지
  - PM2 cluster:4 모드 지원 검증 완료 (SP-010: **조건부 Go**)
  - 동일 job이 여러 worker에서 스케줄되지만 lock 1개만 보유
- **단일 테넌트 전제**: 단일 lock key로 충분.
- **Phase 16 진입 조건** (cluster:4 전환 시): CPU 70%, p95 200ms, 503 0.1% 도달 시.

### 1.7 Per-tenant Observability: 단일 감사 로그
- **출처**: ADR-021 (감사 로그 cross-cutting fail-soft, 세션 56)
- **결정**: SQLite `audit_logs` 테이블 (Drizzle). 11개 콜사이트에 fail-soft.
- **단일 테넌트 전제**: 테넌트별 감시 정책 분리 불필요.

### 1.8 Yangpyeong 정체성/스코프: Supabase OSS 스택 **선별 재현**
- **출처**: ADR-002 (세션 14)
- **결정**: UI 패턴 + 핵심 OSS만 도입. 전체 스택 자체 호스팅 거부.
  - SQL Editor: Studio 패턴 + monaco
  - Schema Viz: schemalint TS 포팅 + 자체 RLS UI
  - Edge Functions: isolated-vm v6 + Deno 사이드카 하이브리드 (3층 L1/L2/L3)
  - Realtime: wal2json CDC + supabase-realtime 포팅
  - Data API: Prisma DMMF + Next.js 동적 라우트
  - Auth: jose JWT + 자체 세션
  - Storage: SeaweedFS + B2 오프로드
- **결과**: Next.js 단일 앱 + 의존성 4~5개 추가만.

---

## 2. Wave/Spike 검증 완료 항목 (재검증 불필요)

| Spike | 주제 | 결론 | 권고 |
|-------|------|------|------|
| **SP-010** | PM2 cluster:4 vs fork | **조건부 Go** | +39.9% throughput, advisory lock 안전. 현재 fork 유지, Phase 16 임계값 도달 시 전환 |
| **SP-011** | argon2id vs bcrypt | **Go** | argon2id 13배 빠름, 점진 마이그레이션 가능 |
| **SP-012** | isolated-vm v6 Node v24 | **Go** | cold start p95 0.9ms, 메모리 격리 안정 |
| **SP-014** | JWKS 캐시 3분 grace | **조건부 Go** | hit 99%, p95 0.189ms. grace는 JWKS 엔드포인트의 구·신 키 동시 서빙으로 |
| **SP-015** | Session 인덱스 (SQLite vs PG) | **Go** | 복합 인덱스 양쪽 동등. PG p95 0.048ms |
| **SP-013** | wal2json 슬롯 | **Pending** | 물리 측정 대기 |
| **SP-016** | SeaweedFS 50GB | **Pending** | 물리 측정 대기 |

### 멀티테넌트 전환 시 영향 (단일 테넌트 가정 위에서 검증된 것들)

| 검증 항목 | 단일 테넌트 | 다중 테넌트 |
|---------|----------|----------|
| Advisory lock key | 고정(`"cleanup-sessions"`) | **테넌트별 분리 필요** |
| JWKS cache | 조직 단일 키셋 | **테넌트별 키셋 또는 공유 결정 필요** |
| Session 인덱스 | `(userId, expiresAt)` | **`(tenantId, userId, expiresAt)` 재설계 필요** |
| SeaweedFS | 버킷 단일 | **버킷 또는 스토리지 경로 테넌트 분리 필요** |

---

## 3. 멀티테넌트 전환과 충돌하는 기존 ADR

| 기존 ADR | 충돌 내용 | 처리 |
|---------|---------|-----|
| **ADR-001** | Multi-tenancy 의도적 제외 | **ADR-022로 supersede** |
| **ADR-003~006** | Phase 14 Table Editor CRUD, 권한 정책 — 단일 테넌트 가정 | **테넌트 필터 추가 (ADR 갱신 또는 amendment)** |
| **ADR-015** (PM2 cluster) | advisory lock key 단일 | **테넌트별 lock key 분리 (ADR-028 amendment)** |
| **ADR-021** (audit fail-soft) | tenant 차원 없음 | **audit_logs에 tenant_id 추가 (ADR-029 amendment)** |

---

## 4. 미결/공백 영역 (= 새 ADR 필요)

| # | 주제 | 새 ADR | 예상 공수 |
|---|------|--------|---------|
| (a) | 데이터 격리 모델 (schema-per-tenant / RLS / DB-per-tenant) | **ADR-023** | 8~10h |
| (b) | Plugin/도메인 코드 격리 (테넌트별 Edge Functions, Cron 등) | **ADR-024** | 6~8h |
| (c) | 인스턴스 모델 (단일 vs Tier vs per-consumer) | **ADR-025** | 4~6h |
| (d) | Tenant Manifest/Registry 설계 | **ADR-026** | 6~8h |
| (e) | Multi-tenant Router 패턴 (subdomain vs JWT vs path) | **ADR-027** | 4~6h |
| (f) | Cron Worker Pool / Per-tenant Isolation | **ADR-028** | 6~8h |
| (g) | Per-tenant Observability (metrics/logs/traces 격리) | **ADR-029** | 8~10h |
| (h) | Yangpyeong 정체성 재정의 (1인-N프로젝트 BaaS) | **ADR-022** | 4~6h |

---

## 5. Supabase-Parity Wave 현재 단계

### Wave 1~5 완료 현황 (2026-04-18 完)
- Wave 1: 14 카테고리 1순위 채택 + 9개 spike GO (33 문서, 26,941줄)
- Wave 2: 매트릭스 비교 (28 문서, 18,251줄)
- Wave 3: Vision + FR/NFR + 100점 정의 + ADR-001 (11 문서, 8,350줄)
- Wave 4: 아키텍처 청사진 14개 + 9-레이어 + ADR-018 (26 문서, 32,918줄)
- Wave 5: 로드맵(13) + 스파이크(9) + 부록(3) — 127 KPI, 35 리스크 (25 문서, 20,128줄)
- **합계**: 123 문서, 106,588줄, Phase 15-22 (870h, 50주) 로드맵

### 2026-04-25 세션 56 기준 현재 위치
```
[Wave 1-5] ← 완료 (2026-04-18)
    ↓
[세션 50-56 검증 + ADR 신설]
    ├ ADR-020: standalone + rsync + pm2 reload
    ├ ADR-021: 감사 fail-soft + migration self-heal
    └ 다음: ADR-022~029 (멀티테넌트 BaaS 재검토) ← 본 작업
```

### 멀티테넌트 BaaS 추가 시 공수 재산정
- 기존: Phase 15-22 = 870h
- 멀티테넌트 추가: +380~480h
- **총합: ~1,250~1,350h (70주)**

---

## 6. ADR 작성자(Sub-agent 8개)에게 전달할 체크리스트

| 새 ADR | 참조 필수 파일 | 금지 사항 |
|--------|----------------|----------|
| **ADR-022** (정체성 재정의) | ADR-001, README.md Wave 1 점수표 | 14 카테고리 점수 무효화 금지 (가중치만 변경) |
| **ADR-023** (데이터 격리) | ADR-001, 02-erd.md | Wave 1 Storage 결정(SeaweedFS) 변경 금지 |
| **ADR-024** (Plugin 코드 격리) | ADR-002, 10-edge-fn-blueprint.md | isolated-vm v6 기술 선택 변경 금지 |
| **ADR-025** (인스턴스 모델) | ADR-020, 05-rollout-strategy.md | Capistrano 역사 제거 금지 (ADR-020 공존 명시) |
| **ADR-026** (Manifest) | ADR-001 §3.2.4, 09-multi-tenancy-decision.md | 조직 3단계(Org/Project/Tenant) 추가 금지 |
| **ADR-027** (Router) | 09-product-vision.md, 04-cloudflare-deployment | Cloudflare Workers 라우팅 불가 (Edge 제약) |
| **ADR-028** (Cron Pool) | spike-010, 13-db-ops-blueprint | advisory lock 대신 다른 기법 비교 가능 |
| **ADR-029** (Observability) | ADR-021, 04-observability-blueprint | SQLite 감사 로그 구조 변경 금지 |

---

**문서 신뢰도**: 95% (Wave/Spike 결과는 직접 인용, 멀티테넌트 영향은 귀납 90%)
