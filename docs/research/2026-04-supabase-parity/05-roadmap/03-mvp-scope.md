# MVP 스코프 정의 — 양평 부엌 서버 대시보드

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · R2 에이전트 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W5-R2)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [00-vision/10-14-categories-priority.md](../00-vision/10-14-categories-priority.md) · [02-architecture/03-auth-advanced-blueprint.md](../02-architecture/03-auth-advanced-blueprint.md) · [02-architecture/04-observability-blueprint.md](../02-architecture/04-observability-blueprint.md) · [02-architecture/05-operations-blueprint.md](../02-architecture/05-operations-blueprint.md) · [02-architecture/06-auth-core-blueprint.md](../02-architecture/06-auth-core-blueprint.md) · [02-architecture/07-storage-blueprint.md](../02-architecture/07-storage-blueprint.md)

---

## 0. 문서 목적

이 문서는 양평 부엌 서버 대시보드의 **MVP(Minimum Viable Product)** 를 정밀하게 경계 짓는다. Wave 3에서 "Phase 15+16+17 = MVP"라는 큰 그림이 확정되었고(`10-14-categories-priority.md §7`), Wave 4에서 각 Phase의 WBS가 Blueprint 단위로 확정되었다. 본 문서는 두 결과물을 통합하여:

1. MVP에 **포함**되는 것과 **제외**되는 것을 명시적으로 경계 짓고
2. MVP에 해당하는 FR(기능 요구사항)을 목록화하며
3. Ship 판단 기준 체크리스트를 제시하고
4. MVP 이후 피드백·확장 방향을 정의한다

---

## 1. MVP 정의

### 1.1 핵심 정의문

> **MVP = "122h 안에 달성 가능한, 1인 운영자가 프로덕션에서 안전하게 운영할 수 있는 최소 상태"**

여기서 "안전하게 운영 가능"은 다음 3가지를 모두 충족해야 함을 의미한다:

- **보안 안전**: MFA(TOTP + WebAuthn) + Rate Limit + JWKS 기반 토큰 검증이 동작하여 인증 경로의 주요 공격 벡터가 차단된 상태
- **운영 안전**: Capistrano-style 배포(0초 다운타임) + symlink 롤백(5초) + PITR 백업(RPO 60초) 이 동작하여 배포/장애 시 복구 가능한 상태
- **기능 충분**: 현재 운영 중인 서비스의 핵심 흐름(로그인 → 데이터 조회/수정 → 파일 관리)이 중단 없이 동작하는 상태

### 1.2 MVP 범위 요약

| Phase | 카테고리 | 시작점 | 목표점 | 예상 공수 | 비고 |
|-------|---------|--------|--------|---------|------|
| **Phase 15** | Auth Advanced (TOTP + WebAuthn + Rate Limit) | 15점 | 60점 | 22h | 1순위: 갭 85점, 22h 최고 ROI |
| **Phase 16** | Observability (Vault + JWKS) + Operations (배포 자동화) | 65/80점 | 85/95점 | 40h | 2순위: Auth Adv 후 즉시 필요한 JWKS |
| **Phase 17** | Auth Core (세션 완성) + Storage (SeaweedFS) | 70/40점 | 90/90점 | 60h | 3순위: Auth Core 완성 + Storage 갭 해소 |
| **합계** | — | — | — | **122h** | — |

### 1.3 MVP가 아닌 것

MVP는 "모든 Supabase 기능 100%"가 아니다. 다음 기대를 명시적으로 배제한다:

- SQL Editor 고도화 (Plan Visualizer, AI 보조) → Phase 18
- Edge Functions (isolated-vm 3층) → Phase 19
- Realtime (wal2json CDC) → Phase 19
- Schema Visualizer 고급 기능 → Phase 20
- Data API (pgmq 잡 큐, GraphQL 조건부) → Phase 21
- UX Quality (AI SDK v6, MCP) → Phase 21

---

## 2. MVP 포함 / 미포함 매트릭스

14 카테고리 전체의 MVP 포함 여부를 체크박스로 정리한다.

### 2.1 MVP 포함 카테고리 (5개)

| # | 카테고리 | MVP 포함 기능 | MVP 제외 기능 (Post-MVP) |
|---|---------|------------|----------------------|
| 6 | Auth Advanced | - [x] TOTP 등록/검증 (otplib, Phase 15-A 4h) | - [ ] OAuth 소셜 로그인 (Google/Kakao, Phase 18) |
|   |              | - [x] WebAuthn/Passkey 등록/검증 (SimpleWebAuthn, Phase 15-B 8h) | - [ ] CAPTCHA (Turnstile, Phase 22) |
|   |              | - [x] Rate Limit PG 기반 (IP + user_id, Phase 15-C 6h) | - [ ] SAML/SSO (Phase 23+, 수요 트리거) |
|   |              | - [x] 백업 코드 10개 (bcrypt 해시, Phase 15-D 4h) | |
|   |              | - [x] MFA 강제 정책 (admin 100%, editor 선택) | |
| 12 | Observability | - [x] Vault VaultService (AES-256-GCM envelope, Phase 16) | - [ ] Prometheus + Grafana 연동 (Phase 22+) |
|    |              | - [x] JWKS ES256 엔드포인트 (/auth/.well-known/jwks.json) | - [ ] 외부 KMS 통합 (조건부 — KMS 재고 트리거 시) |
|    |              | - [x] Pino 구조화 JSON 로깅 | - [ ] Distributed Tracing (OpenTelemetry, Phase 22+) |
|    |              | - [x] Infrastructure 페이지 (PM2 + PG + 디스크 실시간) | |
|    |              | - [x] KEK 90일 회전 + 긴급 회전 스크립트 | |
| 14 | Operations | - [x] Capistrano-style 자동 배포 스크립트 (Phase 16) | - [ ] Docker Compose 이행 (조건: 월 100만 트래픽+, 현재 미충족) |
|    |            | - [x] symlink 롤백 (~5초, Phase 16) | - [ ] Kubernetes/컨테이너 오케스트레이션 (CON-3 팀 2명+ 미충족) |
|    |            | - [x] canary.stylelucky4u.com 시간차 배포 | - [ ] Blue/Green 전체 인프라 (Phase 22+) |
|    |            | - [x] PM2 cluster:4 graceful reload (0초 다운타임) | |
|    |            | - [x] GitHub Actions self-hosted runner (WSL2) | |
|    |            | - [x] deploy_events 테이블 + 배포 이력 UI | |
| 5 | Auth Core | - [x] 세션 테이블 (user_sessions, SHA-256 해시, Phase 17-G1 8h) | - [ ] OAuth Provider 인터페이스 완성 (Phase 18 연계) |
|   |           | - [x] 디바이스 목록 UI + 단일/전체 로그아웃 (Phase 17-G2 4h) | - [ ] HIBP pwnedpasswords 온라인 체크 (P2) |
|   |           | - [x] Anonymous role = GUEST (Phase 17-G5 4h) | - [ ] Account Linking 완성 (Phase 18에서 OAuth와 함께) |
|   |           | - [x] 비밀번호 정책 강화 (12자 + 복잡도, Phase 17-G7 2h) | |
|   |           | - [x] 감사 로그 강화 (append-only, Phase 17-G8 3h) | |
|   |           | - [x] Custom Claims JWT Composer (Phase 17-G4 2h) | |
| 7 | Storage | - [x] SeaweedFS 단일 인스턴스 배포 (Phase 17) | - [ ] Resumable Upload (P2 — Phase 22) |
|   |         | - [x] S3 API 레이어 (업로드/다운로드/삭제) | - [ ] 멀티 노드 복제 (Post-MVP — ASM-11 기준) |
|   |         | - [x] 버킷 정책 (RLS + signed URL) | - [ ] MinIO 대안 (완전 배제 — ADR-008, MinIO AGPL 아카이빙) |
|   |         | - [x] B2 오프로드 자동 티어링 (Hot→B2 Cold) | - [ ] 외부 CDN 통합 (Phase 22+) |
|   |         | - [x] 이미지 변환 (sharp on-the-fly) | |
|   |         | - [x] 파일 업로드 UI (10MB 제한, 버킷 CRUD) | |

### 2.2 MVP 미포함 카테고리 (9개)

| # | 카테고리 | 현재 점수 | 예정 Phase | MVP 제외 이유 |
|---|---------|---------|----------|------------|
| 1 | Table Editor | 75 | 18 | 기존 75점으로 기본 운영 가능, 갭 25점은 보안 위급성 없음 |
| 2 | SQL Editor | 70 | 18 | 현재 70점으로 기본 SQL 실행 가능, 공수 최대(320h) — 보안 기반 후 착수 |
| 3 | Schema Visualizer | 65 | 20 | Table Editor 완성 후 컴포넌트 공유 필요, 선행 의존성 미충족 |
| 4 | DB Ops | 60 | 20 | 기본 백업(wal-g) P0 포함, 고급 기능은 시스템 안정 후 심화 |
| 8 | Edge Functions | 45 | 19 | Storage 의존(Phase 17 완성 후), 3층 아키텍처는 MVP 이후 |
| 9 | Realtime | 55 | 19 | wal2json CDC + supabase-realtime 포팅 복잡도, Data API 통합 선행 |
| 10 | Advisors | 65 | 20 | SQL Editor 연동 의존(Phase 18 완성 후) |
| 11 | Data API | 45 | 21 | Realtime 선행(Phase 19) + GraphQL은 수요 트리거 조건부 |
| 13 | UX Quality | 75 | 21 | 기능 완성 후 DX 개선 레이어, $5/월 AI 비용 효율 고려 |

---

## 3. MVP FR 매핑 테이블

55개 FR 중 MVP(Phase 15-17)에 포함되는 FR 목록이다. Wave 3 `02-functional-requirements.md`의 P0 우선순위 기준과 Phase 배정을 기반으로 선별했다.

| FR ID | 설명 | 우선순위 | Phase | 카테고리 | 공수(h) |
|-------|------|---------|-------|---------|--------|
| FR-1.1 | Row 페이지네이션 (서버 정렬) | P0 | 현재 운영 중 | Table Editor | 0 (기존) |
| FR-1.2 | Inline Edit 낙관적 업데이트 | P0 | 현재 운영 중 | Table Editor | 0 (기존) |
| FR-1.3 | 컬럼 필터 + 복합 조건 | P0 | 현재 운영 중 | Table Editor | 0 (기존) |
| FR-2.1 | Monaco 기반 SQL 에디터 + 멀티탭 | P0 | 현재 운영 중 | SQL Editor | 0 (기존) |
| FR-3.1 | 스키마 ERD 자동 생성 (DMMF + xyflow) | P0 | 현재 운영 중 | Schema Viz | 0 (기존) |
| FR-4.1 | node-cron 기반 스케줄 작업 | P0 | 현재 운영 중 | DB Ops | 0 (기존) |
| FR-4.2 | wal-g PITR 백업 (RPO 60초) | P0 | **Phase 17** | DB Ops | 8 |
| FR-5.1 | 이메일/비밀번호 로그인 (bcrypt + jose JWT) | P0 | 현재 운영 중 | Auth Core | 0 (기존) |
| FR-5.2 | 세션 테이블 기반 Refresh (Lucia 패턴) | P0 | **Phase 17** | Auth Core | 8 |
| FR-5.3 | 비밀번호 재설정 (15분 토큰) | P0 | **Phase 17** | Auth Core | 4 |
| FR-5.4 | 역할/권한 시스템 (RBAC 3-role) | P0 | 현재 운영 중 | Auth Core | 0 (기존) |
| FR-5.5 | 감사 로그 강화 (append-only PG) | P0 | **Phase 17** | Auth Core | 3 |
| FR-6.1 | TOTP 등록/검증 (otplib + QR) | P0 | **Phase 15** | Auth Advanced | 4 |
| FR-6.2 | WebAuthn 등록/검증 (SimpleWebAuthn) | P0 | **Phase 15** | Auth Advanced | 8 |
| FR-6.3 | Rate Limit PG 기반 (IP + user_id) | P0 | **Phase 15** | Auth Advanced | 6 |
| FR-6.6 | MFA 백업 코드 10개 (bcrypt 해시) | P0 | **Phase 15** | Auth Advanced | 4 |
| FR-7.1 | SeaweedFS S3 업로드/다운로드/삭제 | P0 | **Phase 17** | Storage | 12 |
| FR-7.2 | 버킷 정책 (RLS + signed URL) | P0 | **Phase 17** | Storage | 8 |
| FR-7.3 | 이미지 변환 (sharp on-the-fly) | P0 | **Phase 17** | Storage | 4 |
| FR-7.4 | B2 오프로드 자동 티어링 | P0 | **Phase 17** | Storage | 6 |
| FR-12.1 | Vault 시크릿 CRUD (AES-256-GCM) | P0 | **Phase 16** | Observability | 8 |
| FR-12.2 | JWKS ES256 엔드포인트 + KID 회전 | P0 | **Phase 16** | Observability | 8 |
| FR-12.3 | Infrastructure 페이지 (PM2/PG/디스크 실시간) | P0 | **Phase 16** | Observability | 4 |
| FR-14.1 | Capistrano-style 배포 자동화 | P0 | **Phase 16** | Operations | 8 |
| FR-14.2 | symlink 롤백 (~5초) | P0 | **Phase 16** | Operations | 4 |
| FR-14.3 | canary.stylelucky4u.com 시간차 배포 | P0 | **Phase 16** | Operations | 4 |
| FR-14.4 | 배포 이력 UI (deploy_events) | P0 | **Phase 16** | Operations | 4 |

**MVP FR 총 27건** (55건 중 49.1% — Wave 3 예측 27건과 정확히 일치)  
신규 구현 공수 합산: **107h** (기존 운영 중인 FR 제외, 여유 공수 15h는 버퍼)

---

## 4. Phase 15 — Auth Advanced MVP

Phase 15는 MVP 1순위이다. 근거: Wave 3 `10-14-categories-priority.md §5.1` — "시간당 갭 해소율 2.05점/h, 14 카테고리 최고값".

### 4.1 TOTP (Phase 15-A, 4h)

**MVP 범위 포함:**
- [x] `otplib@12.x` 기반 RFC 6238 TOTP 생성
- [x] 시크릿 base32 32자 생성 + AES-256-GCM envelope 암호화 (Phase 16 Vault에 위임)
- [x] QR 코드 (`qrcode` 라이브러리) + 수동 입력 키 제공
- [x] 검증 시 ±30초 윈도우 허용 (시계 어긋남 대응)
- [x] 등록 시 1회 성공 검증 후 "활성화" 상태 전환 (미검증 상태로 저장 방지)

**MVP 범위 제외:**
- [ ] Conditional UI (WebAuthn 지문 인식 선택 대화상자) — Phase 22 보너스
- [ ] Push 알림 기반 MFA (Supabase 미지원 영역) — 수요 트리거 조건부

### 4.2 WebAuthn / Passkey (Phase 15-B, 8h)

**MVP 범위 포함:**
- [x] `@simplewebauthn/server@10.x` + `@simplewebauthn/browser@10.x` 채택 (ADR-007)
- [x] Platform authenticator: Windows Hello, Touch ID (iOS/macOS)
- [x] Roaming key: YubiKey 5C NFC
- [x] 한 사용자 최대 5 credential 등록
- [x] challenge 서버 세션 10분 보관 (재사용 공격 차단)
- [x] credential 이름 지정 가능 ("MacBook Touch ID")

**MVP 범위 제외:**
- [ ] Conditional UI (자동 passkey 제안 대화상자) — Safari 17+ 전용, Phase 22
- [ ] FIDO2 Enterprise Attestation — 기업 환경 전용, 1인 운영 불필요

### 4.3 Rate Limit PG 기반 (Phase 15-C, 6h)

**MVP 범위 포함:**
- [x] `rate-limiter-flexible@5.x` PostgreSQL 어댑터 (`RateLimiterPostgres`)
- [x] 로그인 5회/분, API 전체 300회/분, AI 호출 30회/시간 (기본 정책)
- [x] `X-RateLimit-*` 헤더 응답
- [x] 429 + `Retry-After` 헤더
- [x] 관리자 IP whitelist/blacklist

**MVP 범위 제외:**
- [ ] Redis 기반 Rate Limit — ADR-007: PG QPS 한계 초과 시 이전 트리거 등록 완료, 현재 미충족
- [ ] 분산 Rate Limit (cluster 간 공유) — PM2 cluster:4에서 PG UNLOGGED 테이블로 동기화

### 4.4 백업 코드 (Phase 15-D, 4h)

**MVP 범위 포함:**
- [x] 10개 일회용 복구 코드 (bcrypt cost 10 해시 저장)
- [x] 소진 시 재발급 안내 (8개 남았을 때 경고)
- [x] 비활성화 시 비밀번호 재확인 + 감사 로그

**MVP 범위 제외:**
- [ ] 8개 vs 10개 결정 — Wave 3 `03-auth-advanced-blueprint.md §1.3`에서 10개 채택 확정. 8개 옵션은 기각.

---

## 5. Phase 16 — Observability / Operations MVP

Phase 16은 Phase 15 완료 직후 착수한다. JWKS ES256 엔드포인트가 Phase 15에서 발급한 MFA 토큰 검증에 필요하기 때문이다 (`10-14-categories-priority.md §5.2`).

### 5.1 Observability 파트 (~20h)

**MASTER_KEY 위치 확정 (DQ-12.3 최종 답변):**
```
/etc/luckystyle4u/secrets.env
chmod 0640, owner: root, group: ypb-runtime
PM2 ecosystem.config.js의 env_file 옵션으로만 주입
```

**MVP 범위 포함:**
- [x] VaultService: KEK/DEK envelope 암호화/복호화
- [x] KEK 90일 주기 회전 + 긴급 회전 스크립트 (DQ-1.18 답변: `01-adr-log.md §ADR-013`)
- [x] JWKSService: ES256 키쌍 생성, `/.well-known/jwks.json` 엔드포인트
- [x] KID 기반 grace 30일 회전 (DQ-1.19 답변: 구 키 토큰 grace 기간 검증 지속)
- [x] Pino 구조화 JSON 로깅 (`{ timestamp, level, service, trace_id, ... }`)
- [x] SQLite metrics_history 5초 수집 (PM2 워커 메트릭, PG 커넥션 수)
- [x] Infrastructure 페이지 (`/dashboard/settings/infrastructure`) — SSE 실시간 현황
- [x] Vault Secrets CRUD UI (생성/조회/삭제, 수정은 재생성 방식)
- [x] JWKS 관리 UI (키 목록, 회전 버튼, KID grace 상태)

**MVP 범위 제외:**
- [ ] Prometheus exporter + Grafana 대시보드 — Phase 22+ (현재 SQLite 메트릭으로 충분)
- [ ] AWS KMS / HashiCorp Vault 연동 — ADR-013 재검토 트리거 미충족 (현재 $0 목표 유지)
- [ ] OpenTelemetry Distributed Tracing — 1인 운영 단일 서버에서 과잉

### 5.2 Operations 파트 (~20h)

**MVP 범위 포함:**
- [x] DeployOrchestrator: 배포 파이프라인 오케스트레이션 (rsync → migrate → PM2 reload → symlink)
- [x] symlink 스왑 롤백 (`ln -sfn releases/<prev>/ current && pm2 reload`) — 목표 ~5초
- [x] CanaryRouter: canary.stylelucky4u.com + Cloudflare Worker 시간차 분산
- [x] HealthChecker: 배포 후 헬스 엔드포인트 5회 × 5초 폴링
- [x] RollbackService: 자동 롤백 트리거 (헬스체크 실패 3회 연속)
- [x] GitHub Actions self-hosted runner (WSL2 내부)
- [x] deploy_events 테이블 + Deployment 페이지 (`/dashboard/settings/deployments`)
- [x] 배포 이력 + 롤백 버튼 UI

**MVP 범위 제외:**
- [ ] Docker Compose 이행 — ADR-015 이행 조건 4개 중 0개 충족 (현재 미충족)
- [ ] Kubernetes — CON-3(1인 팀) + CON-6(단일 서버) 제약으로 현재 불필요
- [ ] 다중 환경 (dev/stg/prod 3단계 완전 분리) — canary 서브도메인으로 대체

---

## 6. Phase 17 — Auth Core / Storage MVP

Phase 17은 Phase 15+16 완료 후 착수한다. Auth Core와 Storage는 상호 의존 없어 **병렬 진행 가능** (`10-14-categories-priority.md §5.3`).

### 6.1 Auth Core 파트 (30h)

**MVP 범위 포함 (Gap G1~G8 중 MVP 선별):**
- [x] G1: user_sessions 테이블 생성 + Session SHA-256 해시 저장 (Lucia 패턴 차용, 8h)
- [x] G2: 디바이스 목록 UI + 단일/전체 로그아웃 버튼 (4h)
- [x] G3: 이벤트 Hook 표준화 (`onSignIn`, `onSignOut`, `onLinkAccount`) (3h)
- [x] G4: Custom Claims JWT Composer (JWT 클레임 enrichment) (2h)
- [x] G5: Anonymous role (GUEST enum + `is_anonymous=true`, 7일 만료) (4h)
- [x] G7: 비밀번호 정책 강화 (최소 12자, 대소문자/숫자/특수 3종 이상) (2h)
- [x] G8: 감사 로그 강화 (로그인/로그아웃/role 변경 append-only PG 테이블) (3h)
- [x] 세션 Refresh Token rotation (DQ-AA-8: revokedAt + tokenFamily 하이브리드, `01-adr-log.md §B1 결과`)
- [x] wal-g PITR 백업 연계 (FR-4.2 — RPO 60초, RTO 30분)

**MVP 범위 제외:**
- [ ] G6: Account Linking 완성 — Phase 18 OAuth와 함께 구현
- [ ] HIBP pwnedpasswords 온라인 API 체크 — P2 (오프라인 HIBP DB는 Phase 17에서 고려)
- [ ] argon2 마이그레이션 (DQ-AC-1) — bcrypt cost 12 현재 충분, Phase 22 부채 처리

### 6.2 Storage 파트 (30h)

**SeaweedFS 단일 노드 MVP 범위 (ADR-008 기반):**
- [x] SeaweedFS weed server 단일 인스턴스 배포 (WSL2 내부, RAM 350-600MB 허용)
- [x] StorageService 컴포넌트 + S3 API 레이어 (업로드/다운로드/삭제/목록)
- [x] 파일 업로드 10MB 제한 (서버사이드 Content-Length 검증)
- [x] 버킷 생성/삭제/목록 UI
- [x] 버킷 정책 (RLS 기반 ACL) + signed URL 발급 (15분 유효)
- [x] sharp on-the-fly 이미지 리사이즈 (width, height, format 지원)
- [x] B2 오프로드: Hot > 7일 경과 + 파일 크기 > 50MB → B2 Cold 이동 (자동 Tier 정책)

**MVP 범위 제외:**
- [ ] SeaweedFS 멀티 노드 복제 (Volume Replication) — Post-MVP, 단일 노드로 90점 달성
- [ ] Resumable Upload (tus 프로토콜) — P2 (Phase 22)
- [ ] 50GB 부하 테스트 — Phase 17 착수 전 spike-007 실행 필수 (`_CHECKPOINT_KDYWAVE.md §wave_5_plan`)

---

## 7. MVP 릴리스 기준 (Ship 가능 판단 체크리스트)

아래 28개 항목을 모두 충족해야 MVP를 "ship 가능" 상태로 판단한다.

### 7.1 기능 체크리스트 (11개)

- [ ] TOTP 등록/검증 플로우 완전 동작 (Google Authenticator 앱 실제 테스트)
- [ ] WebAuthn 등록/검증 플로우 완전 동작 (Touch ID 또는 YubiKey 실제 테스트)
- [ ] 백업 코드 10개 발급 + 소비 + 재발급 플로우 동작
- [ ] Rate Limit: 로그인 6회째 429 응답 + Retry-After 헤더 확인
- [ ] Vault: 시크릿 생성/조회/삭제 CRUD UI 동작
- [ ] JWKS: GET /.well-known/jwks.json 응답 확인 (ES256 키셋 JSON)
- [ ] 배포 스크립트: 0초 다운타임 배포 완료 (curl --max-time 1 연속 폴링 중 연결 끊김 없음)
- [ ] 롤백: 5초 이내 이전 릴리스로 복귀 확인 (stopwatch 측정)
- [ ] SeaweedFS: 파일 업로드/다운로드/삭제 완전 동작
- [ ] 버킷 정책 RLS: 다른 user_id의 파일에 signed URL 없이 접근 불가 확인
- [ ] 세션 테이블: 전체 로그아웃 시 모든 세션 무효화 확인 (2개 브라우저 테스트)

### 7.2 성능 체크리스트 (5개)

- [ ] NFR-PERF.5: API p95 ≤ 300ms (단순 select/insert — k6 50 VU × 1분)
- [ ] NFR-PERF.6: Storage 업로드 p95: 10MB 파일 기준 ≤ 3초
- [ ] Rate Limit UPSERT p95 ≤ 20ms (NFR 기준, PG UNLOGGED 테이블)
- [ ] JWKS 엔드포인트 응답 p95 ≤ 50ms (캐시 TTL 3분 적용 기준)
- [ ] 배포 스크립트 전체 실행 ≤ 3분 (rsync + migrate + PM2 reload 합산)

### 7.3 보안 체크리스트 (7개)

- [ ] NFR-SEC.1: MASTER_KEY가 git 저장소에 포함되지 않음 (`git log -p | grep MASTER_KEY` 결과 없음)
- [ ] NFR-SEC.2: TOTP 시드가 평문으로 DB에 저장되지 않음 (Vault AES-256-GCM 암호화 확인)
- [ ] NFR-SEC.3: WebAuthn challenge 재사용 공격 차단 확인 (동일 challenge 재사용 시 400)
- [ ] NFR-SEC.4: Refresh Token 재사용 탐지 — 동일 토큰 2회 요청 시 전체 세션 무효화
- [ ] NFR-SEC.5: Rate Limit 우회 불가 — X-Forwarded-For 조작 시 실제 IP 사용
- [ ] NFR-SEC.6: 버킷 정책 — 인증 없이 비공개 파일 접근 불가 (403/404 확인)
- [ ] NFR-SEC.7: OWASP Top 10 A01(Broken Access Control), A07(Auth Failures) 수동 점검 완료

### 7.4 운영 체크리스트 (5개)

- [ ] wal-g 백업 1회 완료 확인 (`wal-g backup-list` 조회)
- [ ] deploy_events 테이블에 배포 이력 기록 확인
- [ ] Infrastructure 페이지에서 PM2 워커 상태 실시간 표시 확인
- [ ] canary.stylelucky4u.com 접근 시 canary 빌드 서빙 확인
- [ ] 감사 로그: 로그인/로그아웃/role 변경 전부 기록 확인

---

## 8. 사용자 피드백 수집 계획

MVP는 "1인 운영자(김도영)"의 단일 사용자 대시보드이므로 외부 사용자 설문은 없다. 대신 다음 내부 지표를 수집한다.

### 8.1 운영 지표 (자동 수집)

| 지표 | 수집 방법 | 평가 주기 | 목표 |
|------|---------|---------|------|
| MFA 인증 성공률 | Infrastructure 페이지 감사 로그 집계 | 주 1회 | ≥ 95% |
| Vault 시크릿 접근 빈도 | `vault_access_log` 테이블 | 월 1회 | 이상 접근 패턴 없음 |
| 배포 성공률 | `deploy_events` 테이블 | 배포마다 | ≥ 99% |
| 롤백 빈도 | `deploy_events.type = 'rollback'` | 월 1회 | ≤ 1회/월 목표 |
| Storage 사용량 | SeaweedFS API + B2 대시보드 | 월 1회 | < 50GB (spike-007 한계) |
| Rate Limit 발동 빈도 | `rate_limit_counter` 테이블 | 일 1회 | 이상 급증 시 알림 |
| JWKS 회전 이력 | `jwks_key_rotations` 테이블 | 90일마다 | KEK 회전 미이행 0건 |

### 8.2 주관적 피드백 (오너 자기 기록)

| 항목 | 기록 방법 | 시점 |
|------|---------|------|
| MFA 등록/로그인 UX 불편 사항 | `docs/logs/` 세션 기록에 메모 | MVP 첫 2주 |
| 배포 자동화 실패 시 원인 분석 | deploy_events 실패 로그 인용 후 `docs/logs/` 기록 | 실패 발생 시 |
| Storage 업로드 응답 체감 속도 | "빠름/느림/보통" 3단계 주관 평가 | 2주간 매일 |
| Rate Limit 오탐 (정상 요청 차단) | `rate_limit_counter` 에러 로그 | 실시간 |

### 8.3 Post-MVP 진입 판단 지표

MVP 사용 4주 후 아래 기준으로 Phase 18(Beta) 착수를 결정한다:

| 기준 | 충족 조건 | 우선순위 |
|------|---------|---------|
| MVP 안정성 | 배포 성공률 ≥ 99% + MFA 오류 0건 2주 연속 | 필수 |
| 보안 기반 검증 | OWASP 수동 점검 재확인 완료 | 필수 |
| 부채 처리 현황 | 고 심각도 부채 0건 (04-tech-debt-strategy.md 기준) | 권장 |
| 사용자 만족 | 오너 자기 평가 5점 만점 4점 이상 | 참고 |

---

## 9. Post-MVP 우선순위 큐

MVP(Phase 15-17) 완료 후 Phase 18부터의 확장 순서이다.

### 9.1 Beta (Phase 18-19): 핵심 개발자 도구 완성

| 순위 | Phase | 카테고리 | 이유 | 예상 공수 |
|------|-------|---------|------|---------|
| 1 | 18 | SQL Editor 고도화 | 공수 최대(320h)이므로 MVP 안정화 직후 즉시 착수 필요 | 320h |
| 2 | 18 | Table Editor 완성 (14c-β → 14d) | SQL Editor와 병렬 가능, TanStack 14c-β RLS UI | 80h |
| 3 | 18 | OAuth 소셜 로그인 | Auth Core Account Linking(G6) 완성 연계 | 20h |
| 4 | 19 | Edge Functions (3층 하이브리드) | Storage(Phase 17) 완성 후 진입 가능 | 40h |
| 5 | 19 | Realtime (wal2json CDC + 채널) | Edge Functions와 병렬, Data API(Phase 21) 선행 | 35h |

### 9.2 v1.0 (Phase 20-22): 완성도 극대화

| 순위 | Phase | 카테고리 | 이유 | 예상 공수 |
|------|-------|---------|------|---------|
| 1 | 20 | Schema Visualizer 고급 | Table Editor(Phase 18) 완성 후 컴포넌트 공유 가능 | 50h |
| 2 | 20 | DB Ops 심화 (Cron + Webhook + 리허설) | node-cron + wal-g 기반 이미 있음, 심화 확장 | 68h |
| 3 | 20 | Advisors (3-Layer) | SQL Editor(Phase 18) 쿼리 컨텍스트 연동 | 80h |
| 4 | 21 | Data API (REST + pgmq + GraphQL 조건부) | Realtime(Phase 19) 구독 통합 후 완성 | 25h |
| 5 | 21 | UX Quality (AI SDK v6 + MCP) | 전체 기능 안정화 후 DX 향상 레이어 | 15h |
| 6 | 22 | 100점 보너스 기능 (잔여 갭 처리) | Auth Advanced 100점, Realtime 100점 등 마무리 | 30h |

### 9.3 Post-v1.0 (Phase 23+, 수요 트리거 조건부)

| 항목 | 트리거 조건 | 예상 공수 |
|------|----------|---------|
| Multi-tenancy 도입 (ADR-001 재검토) | 사용자 2명+ 6개월 지속 | 120h |
| GraphQL (pg_graphql) 도입 | 수요 트리거 4개 중 2개+ 충족 | 20h |
| Docker 이행 (ADR-015 재검토) | 월 100만 트래픽 + 팀 2명+ | 40h |
| argon2 마이그레이션 (TD-7) | bcrypt 보안 취약점 CVE 발생 | 8h |
| Redis Rate Limit 이행 (ADR-007) | PG QPS 한계 초과 알림 발동 | 12h |

---

## 10. MVP 리스크 & 완화

MVP가 "설계 의도대로 작동하지 않을" 5가지 시나리오와 완화책이다.

### 시나리오 1: WebAuthn Safari 호환성 문제

**상황**: iOS/macOS Safari 16 이전 버전에서 WebAuthn Conditional UI 미지원, 일부 WebAuthn API 비표준 동작  
**영향**: WebAuthn 등록 실패 → MFA 방어선 약화  
**완화**:
- [x] TOTP + WebAuthn 동시 지원으로 WebAuthn 실패 시 TOTP 대체 경로 보장 (ADR-007 §1.3)
- [x] SimpleWebAuthn 라이브러리 Safari 18+ 타겟 문서화 (지원 브라우저 명시)
- [x] 백업 코드 10개가 최후 안전망
- [ ] 모니터링: MFA 방법별 인증 성공률 추적, WebAuthn 성공률 < 80% 시 TOTP 기본 전환

### 시나리오 2: SeaweedFS 메모리 부족 (OOM)

**상황**: 50GB+ 데이터 시 SeaweedFS weed server OOM 킬 발생  
**영향**: 파일 업로드/다운로드 전체 불가, PM2 재시작 루프  
**완화**:
- [x] Phase 17 착수 전 spike-007-seaweedfs-50gb 실행 필수 (`_CHECKPOINT_KDYWAVE.md` wave_5_plan)
- [x] B2 오프로드 자동 Tier 정책 (Hot > 7일 + 50MB+ → Cold) 으로 로컬 보관량 최소화
- [x] PM2 메모리 알림 (`max_memory_restart = 700M`) 설정
- [x] 문서화: "권장 최대 50GB" 한계 명시

### 시나리오 3: MASTER_KEY 유출

**상황**: `/etc/luckystyle4u/secrets.env` 권한 오설정(예: 0644) 또는 git 커밋 실수  
**영향**: 모든 Vault 시크릿 복호화 가능 → 인프라 전체 키 유출  
**완화**:
- [x] chmod 0640, owner root, group ypb-runtime 강제 설정 스크립트 (배포 체크리스트 포함)
- [x] `.gitignore`에 `/etc/luckystyle4u/secrets.env` 경로 패턴 추가
- [x] Ship 체크리스트에 `git log -p | grep MASTER_KEY` 확인 항목 포함 (§7.3 NFR-SEC.1)
- [x] 긴급 KEK 회전 스크립트 사전 준비 + 실행 드릴 1회

### 시나리오 4: Capistrano 배포 중 symlink 레이스 컨디션

**상황**: `ln -sfn` 실행 중 PM2 reload가 동시 발생하면 새 symlink 대신 구 경로 참조  
**영향**: 배포 후 구 버전 코드 서빙 → 사용자 혼란, 롤백 필요  
**완화**:
- [x] DeployOrchestrator에서 "symlink 완료 → PM2 reload" 순서 atomic 보장 (`ln -sfn; pm2 reload` 순차)
- [x] 배포 후 HealthChecker 5회 × 5초 폴링 (새 버전 응답 헤더 `X-Build-Hash` 검증)
- [x] 실패 시 자동 롤백 트리거 (RollbackService 연동)
- [x] 배포 로그 전체 보관 (deploy_events 테이블, 파일 레벨)

### 시나리오 5: Phase 15-16-17 간 의존성 시퀀싱 오류

**상황**: Phase 17 Auth Core의 세션 테이블이 Phase 15 MFA에서 참조되는데 스키마 마이그레이션 순서가 뒤집힘  
**영향**: Prisma 마이그레이션 실패 → 배포 중단  
**완화**:
- [x] Prisma 마이그레이션 파일 번호를 Phase 순서로 직렬화 (예: `0016_phase15_mfa.sql` → `0017_phase16_vault.sql`)
- [x] 마이그레이션 롤백 스크립트 (down.sql) Phase별 사전 작성 (ADR-015 Operations Blueprint §배포 플로우)
- [x] 로컬 환경에서 마이그레이션 전체 dry-run 후 프로덕션 적용
- [x] 스테이징 서버(canary.stylelucky4u.com) 먼저 마이그레이션 → 검증 → 프로덕션 적용

---

## 11. MVP 구현 WBS 요약

Phase 15-17 전체를 세부 태스크 단위로 분해한다. Blueprint 문서의 WBS를 통합하여 단일 실행 목록으로 제시한다.

### 11.1 Phase 15 — Auth Advanced (총 22h)

| 태스크 ID | 설명 | 공수 | 선행 조건 | 산출물 |
|---------|------|------|---------|------|
| P15-A1 | `user_mfa_totp` 테이블 마이그레이션 생성 | 0.5h | — | Prisma 마이그레이션 파일 |
| P15-A2 | TOTPService 구현 (otplib, 생성/검증/비활성화) | 1.5h | P15-A1 | `src/lib/auth/advanced/TOTPService.ts` |
| P15-A3 | QR 코드 API 라우트 (`/api/auth/mfa/totp/setup`) | 0.5h | P15-A2 | API 라우트 |
| P15-A4 | TOTP 검증 API + 세션 업그레이드 | 1.5h | P15-A2 | `MFAController.verifyMFA('totp')` |
| P15-B1 | `user_credentials` 테이블 마이그레이션 생성 | 0.5h | — | Prisma 마이그레이션 |
| P15-B2 | WebAuthnService 구현 (SimpleWebAuthn, 등록/검증) | 3h | P15-B1 | `src/lib/auth/advanced/WebAuthnService.ts` |
| P15-B3 | WebAuthn 등록/검증 API 라우트 | 2h | P15-B2 | `/api/auth/mfa/webauthn/*` |
| P15-B4 | MFA 설정 페이지 UI (`/settings/security`) | 2.5h | P15-A3, P15-B3 | React 컴포넌트 |
| P15-C1 | `rate_limit_counter` 테이블 + UNLOGGED 옵션 | 0.5h | — | Prisma 마이그레이션 |
| P15-C2 | RateLimitGuard 미들웨어 구현 | 2h | P15-C1 | `src/lib/auth/advanced/RateLimitGuard.ts` |
| P15-C3 | 로그인 엔드포인트 Rate Limit 통합 | 1h | P15-C2 | 기존 로그인 API 수정 |
| P15-C4 | 관리자 whitelist/blacklist API | 2.5h | P15-C2 | `/api/admin/rate-limit/*` |
| P15-D1 | MFABackupCodeService (생성/소비/재발급) | 1.5h | P15-A2 | `src/lib/auth/advanced/MFABackupCodeService.ts` |
| P15-D2 | 백업 코드 소진 알림 (TD-15 동시 해소) | 0.5h | P15-D1 | 소진 시 Sonner 토스트 |
| P15-D3 | MFAEnforcementPolicy (admin 100%, editor 선택) | 1.5h | P15-A4 | `src/lib/auth/advanced/MFAEnforcementPolicy.ts` |
| **합계** | — | **22h** | — | — |

### 11.2 Phase 16 — Observability + Operations (총 40h)

| 태스크 ID | 설명 | 공수 | 산출물 |
|---------|------|------|------|
| P16-OBS1 | VaultService 구현 (AES-256-GCM envelope) | 3h | `src/lib/vault/VaultService.ts` |
| P16-OBS2 | MASTER_KEY 설정 스크립트 (/etc/luckystyle4u/secrets.env) | 1h | bash 설정 스크립트 |
| P16-OBS3 | vault_secrets + jwks_keys PG 테이블 마이그레이션 | 1h | Prisma 마이그레이션 |
| P16-OBS4 | JWKSService 구현 (ES256, KID 회전) | 3h | `src/lib/jwks/JWKSService.ts` |
| P16-OBS5 | JWKS 엔드포인트 (/.well-known/jwks.json) | 1h | Next.js API 라우트 |
| P16-OBS6 | HS256 → ES256 전환 (TD-3 해소) | 2h | JWTService 수정 |
| P16-OBS7 | Infrastructure 페이지 (SSE 실시간 현황) | 4h | `/dashboard/settings/infrastructure` |
| P16-OBS8 | Vault Secrets CRUD UI | 4h | `/dashboard/settings/vault` |
| P16-OPS1 | .nvmrc + package.json engines (TD-11 해소) | 0.5h | `.nvmrc`, `package.json` |
| P16-OPS2 | PM2 cluster:4 설정 (TD-2 해소) | 1.5h | `ecosystem.config.js` |
| P16-OPS3 | DeployOrchestrator 스크립트 | 3h | `scripts/deploy.sh` |
| P16-OPS4 | symlink 롤백 스크립트 (TD-8 Race condition 해소) | 1.5h | `scripts/rollback.sh` |
| P16-OPS5 | CanaryRouter (Cloudflare Worker + PM2 canary) | 3h | canary 설정 |
| P16-OPS6 | HealthChecker (5회 × 5초 폴링) | 1.5h | `scripts/healthcheck.sh` |
| P16-OPS7 | GitHub Actions self-hosted runner 설정 | 2h | `.github/workflows/deploy.yml` |
| P16-OPS8 | deploy_events 테이블 + Deployment 페이지 UI | 3h | `/dashboard/settings/deployments` |
| P16-OPS9 | Canary 측정 보조 (TD-22 부분 완화) | 2h | 직접 메트릭 수집 보조 스크립트 |
| **합계** | — | **37h** | — |

> 여유 공수 3h: 부채 처리 버퍼 (TD-15 소진 알림 Phase 15에서 처리, 이 Phase 여유 확보)

### 11.3 Phase 17 — Auth Core + Storage (총 60h)

| 태스크 ID | 설명 | 공수 | 산출물 |
|---------|------|------|------|
| P17-AC1 | user_sessions 테이블 + token_families 마이그레이션 (TD-6, TD-7) | 1.5h | Prisma 마이그레이션 |
| P17-AC2 | SessionService (Lucia 패턴, SHA-256 해시) | 3h | `src/lib/auth/core/SessionService.ts` |
| P17-AC3 | Refresh Token rotation + tokenFamily (TD-7 해소) | 2h | SessionService 확장 |
| P17-AC4 | 디바이스 목록 UI + 단일/전체 로그아웃 (G2) | 4h | `/settings/sessions` |
| P17-AC5 | Hook 표준화 (onSignIn, onSignOut, G3) | 2h | `src/lib/auth/core/AuthHooks.ts` |
| P17-AC6 | Custom Claims JWT Composer (G4) | 2h | `src/lib/auth/core/ClaimsComposer.ts` |
| P17-AC7 | Anonymous role = GUEST + is_anonymous (G5) | 3h | Prisma 모델 + API |
| P17-AC8 | 비밀번호 정책 강화 (G7: 12자+복잡도) | 2h | PasswordPolicyService |
| P17-AC9 | 감사 로그 강화 (G8: append-only PG) | 3h | AuditLogService |
| P17-AC10 | wal-g 백업 연동 (FR-4.2, RPO 60초) | 3h | `scripts/backup.sh` + cron |
| P17-ST1 | SeaweedFS 단일 인스턴스 WSL2 설치 + spike-007 결과 반영 | 3h | SeaweedFS 프로세스 |
| P17-ST2 | StorageService (업로드/다운로드/삭제 + S3 API 레이어) | 5h | `src/lib/storage/StorageService.ts` |
| P17-ST3 | 버킷 정책 (RLS + signed URL 발급) | 4h | BucketPolicyService |
| P17-ST4 | 이미지 변환 (sharp on-the-fly) | 3h | ImageTransformService |
| P17-ST5 | B2 오프로드 자동 티어링 | 3h | TieringService |
| P17-ST6 | 파일 업로드 UI + 버킷 CRUD UI | 5h | `/storage/*` 페이지 |
| P17-DR | DR 호스트 결정 + 설정 (TD-12 해소) | 3h | PM2 DR 앱 + Cloudflare 분기 |
| P17-DRILL | wal-g 복구 드릴 자동화 (TD-10 해소) | 3h | `scripts/restore-drill.sh` |
| **합계** | — | **54h** | — |

> 여유 공수 6h: spike-007 결과에 따른 SeaweedFS 추가 튜닝 버퍼

---

> 작성: Wave 5 R2 에이전트  
> 근거: [10-14-categories-priority.md](../00-vision/10-14-categories-priority.md) § 전체 · [03-auth-advanced-blueprint.md](../02-architecture/03-auth-advanced-blueprint.md) § WBS · [04-observability-blueprint.md](../02-architecture/04-observability-blueprint.md) § Phase 16 · [05-operations-blueprint.md](../02-architecture/05-operations-blueprint.md) § Phase 16 · [06-auth-core-blueprint.md](../02-architecture/06-auth-core-blueprint.md) § Phase 17 · [07-storage-blueprint.md](../02-architecture/07-storage-blueprint.md) § Phase 17  
> 다음: [04-tech-debt-strategy.md](./04-tech-debt-strategy.md)
