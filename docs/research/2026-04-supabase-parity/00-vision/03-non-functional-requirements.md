# 비기능 요구사항 (NFR) — Supabase 100점 동등성

> Wave 3 (W3-R2) | 양평 부엌 서버 대시보드 — Supabase Parity
> 작성: 2026-04-18 (세션 26) | 근거: Wave 1+2 채택안 + `_CHECKPOINT_KDYWAVE.md` + `02-functional-requirements.md`
> 상위: [00-vision/](./) → [research/2026-04-supabase-parity/](../) → [CLAUDE.md](../../../../CLAUDE.md)

---

## 0. 개요

이 문서는 Supabase Cloud 동등 수준(100점)을 달성하기 위한 **비기능 요구사항(NFR)** 을 정의한다. vision-suite 템플릿 Part C2 구조를 따르며, 7개 카테고리(PERF/SEC/UX/REL/MNT/CMP/COST)에 걸쳐 총 **38개 NFR**을 포함한다.

각 NFR은 측정 가능한 **목표 수치**, **측정 방법**, **우선순위(P0/P1/P2)**, **관련 FR** 매핑을 필수 메타로 유지한다.

### 0.1 우선순위 정의

| 우선순위 | 정의 | 예 |
|---------|------|------|
| **P0** | 서비스 성립의 필수 조건, 미달 시 출시 불가 | 보안, RPO, 인증 |
| **P1** | 100점 평가에 직결, 출시 직후 달성 목표 | 성능 지연, UX 학습 곡선 |
| **P2** | 지속 개선 목표, 100점 유지에 필요 | 문서화 커버리지, 사용성 개선 |

### 0.2 측정 프레임워크

| 측정 수단 | 대상 NFR | 도구 |
|----------|---------|------|
| **벤치마크** | PERF | `k6`, `autocannon`, `pg_bench` |
| **로그/메트릭** | PERF, REL, COST | Pino + Prometheus + Grafana |
| **체크리스트** | SEC, CMP | OWASP ZAP, 수동 감사 |
| **정적 분석** | MNT | Vitest coverage, TypeDoc, lint |
| **수동 검증** | UX | 1인 오너(김도영) 학습 곡선 체험 기록 |

### 0.3 요약 테이블

| 카테고리 | 접두사 | 개수 | P0 | P1 | P2 |
|---------|-------|------|----|----|-----|
| 성능 | NFR-PERF | 8 | 3 | 4 | 1 |
| 보안 | NFR-SEC | 10 | 8 | 2 | 0 |
| 사용성 | NFR-UX | 5 | 1 | 3 | 1 |
| 신뢰성 | NFR-REL | 5 | 3 | 2 | 0 |
| 유지보수성 | NFR-MNT | 4 | 0 | 2 | 2 |
| 호환성 | NFR-CMP | 4 | 2 | 2 | 0 |
| 비용 | NFR-COST | 2 | 1 | 1 | 0 |
| **합계** | — | **38** | **18** | **16** | **4** |

---

## 1. NFR-PERF (성능)

#### NFR-PERF.1 Table Editor 100만 행 정렬 응답

| 항목 | 내용 |
|------|------|
| **설명** | TanStack Table v8 + PostgreSQL btree 인덱스 조합에서 100만 행 테이블의 단일 컬럼 정렬이 완료되어 첫 페이지 50행이 렌더될 때까지의 지연 |
| **목표 수치** | p95 ≤ 800ms (서버 측 query), p95 ≤ 1.2s (end-to-end 렌더) |
| **측정 방법** | Playwright E2E + 서버 타임스탬프 비교, 10회 run 평균 + p95 산출, `EXPLAIN (ANALYZE, BUFFERS)` 크로스 검증 |
| **우선순위** | P1 |
| **관련 FR** | FR-1 (Table Editor), FR-1.3 (정렬/필터), FR-1.7 (페이지네이션) |

#### NFR-PERF.2 SQL Editor EXPLAIN 실행 시간

| 항목 | 내용 |
|------|------|
| **설명** | SQL Editor에서 사용자가 EXPLAIN 실행 버튼을 클릭한 후 Plan Visualizer에 트리가 표시되기까지의 시간. 모나코 로드는 계산에서 제외. |
| **목표 수치** | p95 ≤ 500ms (EXPLAIN 단독), p95 ≤ 2s (EXPLAIN ANALYZE 포함) |
| **측정 방법** | 클라이언트 console.time + 서버 처리 타임스탬프, Pino 로그 기반 p95 집계 |
| **우선순위** | P1 |
| **관련 FR** | FR-2 (SQL Editor), FR-2.5 (Plan Visualizer) |

#### NFR-PERF.3 Realtime wal2json 지연

| 항목 | 내용 |
|------|------|
| **설명** | PostgreSQL 테이블 행 변경 시점부터 구독 중인 웹 클라이언트에 WebSocket 메시지가 도달하기까지의 종단 지연 |
| **목표 수치** | p50 ≤ 80ms, **p95 ≤ 200ms**, p99 ≤ 400ms (로컬 네트워크 기준) |
| **측정 방법** | Canary 테이블 `rt_probe`에 1초마다 INSERT → 클라이언트 수신 시각 ΔT 측정, 24시간 이동 평균 |
| **우선순위** | P1 |
| **관련 FR** | FR-9 (Realtime), FR-9.2 (Channel Broadcast) |

#### NFR-PERF.4 Edge Function cold start (isolated-vm)

| 항목 | 내용 |
|------|------|
| **설명** | Edge Functions 3층 하이브리드에서 isolated-vm v6 레이어의 cold start (신규 Isolate 생성 + 초기 스크립트 컴파일 완료까지) |
| **목표 수치** | p95 ≤ **50ms**, warm invocation p95 ≤ 5ms |
| **측정 방법** | 10분 idle 후 첫 invocation에 대한 타임스탬프 계측, 1000회 run 평균 |
| **우선순위** | P1 |
| **관련 FR** | FR-8 (Edge Functions), FR-8.2 (isolated-vm 런타임) |

#### NFR-PERF.5 API p95 응답 및 잡 큐 SLA

| 항목 | 내용 |
|------|------|
| **설명** | Data API (REST) p95 응답 + pgmq 잡 큐 워커 실행 SLA |
| **목표 수치** | API p95 ≤ **300ms** (단순 select/insert), pgmq 잡 enqueue → 실행 개시 ≤ **30초** |
| **측정 방법** | Prometheus `http_request_duration_seconds{quantile="0.95"}`, pgmq 메트릭 `queue_lag_seconds` |
| **우선순위** | P0 |
| **관련 FR** | FR-11 (Data API), FR-4.4 (pgmq Job Queue) |

#### NFR-PERF.6 Storage 업로드 처리량

| 항목 | 내용 |
|------|------|
| **설명** | SeaweedFS + B2 Cold 백업 계층에서 대용량 파일 업로드 처리량. 100MB 파일 기준. |
| **목표 수치** | Hot write ≥ **80 MB/s** (SeaweedFS volume direct), B2 async replication ≤ 10분 지연 |
| **측정 방법** | `seaweedfs-benchmark`, `rclone size --max-age` B2 측정, 주간 리포트 |
| **우선순위** | P1 |
| **관련 FR** | FR-7 (Storage), FR-7.3 (대용량 멀티파트) |

#### NFR-PERF.7 Schema Visualizer 렌더링

| 항목 | 내용 |
|------|------|
| **설명** | xyflow 기반 ERD 뷰에서 테이블 50개 / 관계 100개 시 초기 레이아웃 계산 및 첫 페인트 시간 (ELK 알고리즘) |
| **목표 수치** | p95 ≤ 1.5s (레이아웃 + 첫 페인트), 이후 상호작용 60fps 유지 |
| **측정 방법** | Chrome DevTools Performance tab 측정, 5회 run 중앙값 |
| **우선순위** | P2 |
| **관련 FR** | FR-3 (Schema Visualizer) |

#### NFR-PERF.8 대시보드 초기 로드 (Next.js)

| 항목 | 내용 |
|------|------|
| **설명** | `/` 루트 대시보드 진입 후 Largest Contentful Paint (LCP) 도달까지. 로컬호스트 기준. |
| **목표 수치** | LCP p95 ≤ **1.8s**, TTI p95 ≤ 2.5s, 번들 크기 초기 청크 ≤ 250KB (gzip) |
| **측정 방법** | Chrome DevTools Lighthouse, `next build --profile` 번들 분석, 주간 회귀 감시 |
| **우선순위** | P0 |
| **관련 FR** | FR-13 (UX Quality), 전 페이지 공통 |

---

## 2. NFR-SEC (보안)

#### NFR-SEC.1 JWT ES256 + JWKS 회전

| 항목 | 내용 |
|------|------|
| **설명** | Auth Core의 JWT 서명은 ES256(P-256 ECDSA)로 고정. JWKS 공개키는 최소 2개 키 병렬 노출(current + next) 및 **24시간 이내 rotate refresh** 강제. |
| **목표 수치** | key rotation interval ≤ **24h**, JWKS cache `max-age` ≤ 600s, 기존 토큰 grace period 7일 |
| **측정 방법** | `/.well-known/jwks.json` 자동 감시 스크립트, `kid` 변경 타임스탬프 로깅, Playwright로 회전 후 기존 토큰 검증 |
| **우선순위** | P0 |
| **관련 FR** | FR-5 (Auth Core), FR-12.2 (JWKS Endpoint) |

#### NFR-SEC.2 MASTER_KEY envelope 암호화

| 항목 | 내용 |
|------|------|
| **설명** | Vault(Observability) 시크릿 저장 시 AES-256-GCM envelope 암호화(KEK→DEK). MASTER_KEY는 `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640)에 보관, PM2 `env_file`로만 주입. |
| **목표 수치** | AES-256-GCM 강제, DEK per-secret unique, KEK 회전 주기 ≤ 365일, 기존 DEK re-encrypt 시 downtime 0 |
| **측정 방법** | `ciphertext_version` 컬럼 감시, KEK 회전 스크립트 unit test, `node:crypto` audit |
| **우선순위** | P0 |
| **관련 FR** | FR-12 (Observability), FR-12.1 (Vault) |

#### NFR-SEC.3 TOTP + WebAuthn 관리자 강제

| 항목 | 내용 |
|------|------|
| **설명** | `role = admin` 계정은 **TOTP 또는 WebAuthn** 중 최소 1개 MFA 활성화 필수. 모두 비활성 상태에서는 로그인 차단(403). |
| **목표 수치** | admin 로그인 중 MFA 적용률 100%, WebAuthn attestation 검증 성공률 ≥ 99%, TOTP 시계 드리프트 허용 ±30s |
| **측정 방법** | `audit_log` 쿼리 `WHERE role=admin AND mfa_method IS NULL`, weekly cron 알림, E2E (14c-γ) 권한 매트릭스로 검증 |
| **우선순위** | P0 |
| **관련 FR** | FR-6 (Auth Advanced), FR-6.1 (TOTP), FR-6.2 (WebAuthn) |

#### NFR-SEC.4 Rate Limit

| 항목 | 내용 |
|------|------|
| **설명** | 인증 엔드포인트(`/login`, `/signup`, `/reset-password`) 및 Data API에 IP 기반 + 계정 기반 Rate Limit 적용. PG counter table (Redis 미도입). |
| **목표 수치** | 기본 **100 req/min/IP**, 인증 엔드포인트는 **10 req/min/IP**, 초과 시 `429 Too Many Requests` 응답 ≤ 10ms |
| **측정 방법** | `rate_limit_bucket` 테이블 조회 로그, k6 부하 테스트로 차단 검증 |
| **우선순위** | P0 |
| **관련 FR** | FR-6.3 (Rate Limit), FR-11 (Data API) |

#### NFR-SEC.5 Cloudflare Tunnel + localhost 바인딩

| 항목 | 내용 |
|------|------|
| **설명** | Next.js 서버는 `0.0.0.0`이 아닌 **`127.0.0.1:3000`** 로만 바인딩. 외부 접근은 Cloudflare Tunnel (`cloudflared`)만 허용. UFW로 3000/tcp inbound 차단. |
| **목표 수치** | 공용 IP 포트 스캔 결과 `3000/tcp = filtered`, `ss -ltn` 결과에 외부 IP 리스닝 0건 |
| **측정 방법** | 주간 `nmap` 외부 스캔, `ufw status`, PM2 config 감사 |
| **우선순위** | P0 |
| **관련 FR** | FR-14 (Operations), FR-14.2 (배포 인프라) |

#### NFR-SEC.6 Prepared Statement 강제

| 항목 | 내용 |
|------|------|
| **설명** | 모든 PostgreSQL 쿼리는 Prisma 7 ORM 또는 `pg` 라이브러리의 parameterized query를 통해서만 실행. **문자열 연결 SQL 금지**. SQL Editor는 사용자 입력이지만 역할 권한으로 분리. |
| **목표 수치** | 코드베이스 `pg.query('... + userInput + ...')` 패턴 0건 (ESLint 규칙 `no-raw-sql`), SAST 감사 통과 |
| **측정 방법** | ESLint 커스텀 룰, grep `"\$\{[a-z]+\}"` 패턴 스캔, Advisors splinter가 런타임 감시 |
| **우선순위** | P0 |
| **관련 FR** | FR-10 (Advisors), FR-11 (Data API) |

#### NFR-SEC.7 RLS 기본 활성화 (opt-out 명시)

| 항목 | 내용 |
|------|------|
| **설명** | 신규 테이블 생성 시 `ENABLE ROW LEVEL SECURITY`를 기본값으로 적용하고, opt-out은 마이그레이션 파일에 명시 주석 필수. Advisors가 opt-out 테이블을 주간 리포트. |
| **목표 수치** | 사용자 테이블 중 RLS 활성화 비율 ≥ **95%**, opt-out 테이블은 `policies` 명시 이유 기록 |
| **측정 방법** | `pg_class.relrowsecurity` 통계 쿼리, splinter 룰 `rls_disabled` 주간 스캔 |
| **우선순위** | P0 |
| **관련 FR** | FR-3.2 (RLS Policy UI), FR-10 (Advisors) |

#### NFR-SEC.8 OWASP Top 10 대응 체크리스트

| 항목 | 내용 |
|------|------|
| **설명** | OWASP Top 10 2021 전 항목(A01~A10)에 대응하는 완화책을 구현하고 체크리스트 문서로 관리. `docs/security/owasp-checklist.md`에 매핑. |
| **목표 수치** | A01~A10 각 항목 ≥ 1개 완화책 매핑, ZAP baseline scan HIGH 0건, MEDIUM ≤ 3건 |
| **측정 방법** | OWASP ZAP CI integration, 분기별 수동 감사, 매핑 문서 리뷰 |
| **우선순위** | P0 |
| **관련 FR** | 전 카테고리 (특히 Auth, Data API, Storage) |

#### NFR-SEC.9 CSRF + CORS 정책

| 항목 | 내용 |
|------|------|
| **설명** | 상태 변경 요청(POST/PUT/PATCH/DELETE)에 `SameSite=Lax` 쿠키 + CSRF double-submit token 강제. CORS는 `stylelucky4u.com` 서브도메인만 허용. |
| **목표 수치** | CSRF 토큰 검증 실패 시 403 즉시 응답, CORS `Access-Control-Allow-Origin: *` 금지 |
| **측정 방법** | E2E 테스트 (악의 origin 시나리오), 미들웨어 로그 |
| **우선순위** | P1 |
| **관련 FR** | FR-5 (Auth Core), FR-11 (Data API) |

#### NFR-SEC.10 감사 로그 (Audit Log) 불변성

| 항목 | 내용 |
|------|------|
| **설명** | 관리자 행동(role 변경, policy 변경, user delete 등)은 `audit_log` 테이블에 append-only 기록. UPDATE/DELETE 금지 트리거 부여. |
| **목표 수치** | audit_log에 대한 UPDATE/DELETE 시도 시 RAISE EXCEPTION, 최소 보관 기간 **365일** |
| **측정 방법** | PostgreSQL 트리거 `log_audit_trigger` unit test, 월간 레코드 무결성 체크 |
| **우선순위** | P1 |
| **관련 FR** | FR-5.6 (Admin Audit), FR-12 (Observability) |

---

## 3. NFR-UX (사용성)

#### NFR-UX.1 Supabase Studio 대비 학습 곡선

| 항목 | 내용 |
|------|------|
| **설명** | Supabase Cloud Studio 사용 경험이 있는 개발자가 양평 부엌 대시보드에서 5가지 핵심 태스크(테이블 생성, 데이터 입력, SQL 실행, RLS 작성, 로그 확인)를 **1일 이내**에 완료 가능할 것. |
| **목표 수치** | 1인 오너 + 외부 테스터 2명 기준, 5태스크 평균 완료 시간 ≤ **2시간** |
| **측정 방법** | 수동 시나리오 테스트, 태스크별 화면 녹화 + 시간 측정, 막힘 구간 로깅 |
| **우선순위** | P1 |
| **관련 FR** | FR-13 (UX Quality), 전 카테고리 UI |

#### NFR-UX.2 한국어 UI (i18n)

| 항목 | 내용 |
|------|------|
| **설명** | 모든 UI 텍스트, 에러 메시지, 툴팁, 문서 링크를 한국어로 제공. 에러 코드(예: `ERR_AUTH_401`)는 영문 유지 + 한국어 설명 병기. |
| **목표 수치** | UI 문자열 번역 커버리지 **100%**, 영문 하드코딩 ≤ 10건(코드/에러 코드 제외) |
| **측정 방법** | `kdyi18n` 스킬 스캔, ESLint 룰 `no-hardcoded-strings`, 주간 리포트 |
| **우선순위** | P1 |
| **관련 FR** | 전 카테고리 |

#### NFR-UX.3 다크 테마 기본

| 항목 | 내용 |
|------|------|
| **설명** | 첫 방문 시 기본 테마는 다크(Supabase 스타일). 사용자 선호에 따라 라이트 전환 가능 (localStorage persist). shadcn/ui + Tailwind 4 CSS 변수 기반. |
| **목표 수치** | 대비비 WCAG AA ≥ **4.5:1**, 다크/라이트 전환 시 레이아웃 shift 없음 (CLS = 0) |
| **측정 방법** | Lighthouse accessibility 감사, Chrome DevTools Contrast 체커, 수동 확인 |
| **우선순위** | P2 |
| **관련 FR** | FR-13 (UX Quality), 전 페이지 공통 |

#### NFR-UX.4 키보드 단축키

| 항목 | 내용 |
|------|------|
| **설명** | Monaco 에디터 내장 단축키(Ctrl+Enter 실행, Ctrl+/ 주석) + 대시보드 글로벌 단축키(G+T 테이블, G+S SQL, Cmd+K 커맨드 팔레트) 제공. `?` 키로 단축키 도움말. |
| **목표 수치** | 글로벌 단축키 ≥ 10개, 단축키 충돌 0건, 시각 장애 사용자 스크린리더 호환 |
| **측정 방법** | 수동 체크리스트, Playwright 키보드 네비게이션 E2E |
| **우선순위** | P1 |
| **관련 FR** | FR-2 (SQL Editor), FR-13 (UX Quality) |

#### NFR-UX.5 에러 메시지 실행 가능성

| 항목 | 내용 |
|------|------|
| **설명** | 사용자에게 노출되는 모든 에러 메시지는 "무엇이 왜 실패했고 다음에 무엇을 하면 되는지"를 포함. 3 요소(원인/결과/다음 단계)를 템플릿화. |
| **목표 수치** | 사용자 노출 에러 중 3요소 포함률 ≥ **95%**, "Unknown error" 류 ≤ 1% |
| **측정 방법** | 에러 메시지 레지스트리(`lib/errors/messages.ts`) 리뷰, 수동 샘플링 |
| **우선순위** | P1 |
| **관련 FR** | 전 카테고리 |

---

## 4. NFR-REL (신뢰성)

#### NFR-REL.1 RPO (Recovery Point Objective)

| 항목 | 내용 |
|------|------|
| **설명** | 장애 발생 시 복구 시 잃을 수 있는 최대 데이터 시간. wal-g 압축 + `archive_timeout=60` 설정으로 WAL 세그먼트를 1분 단위로 B2에 업로드. |
| **목표 수치** | **RPO ≤ 60초** |
| **측정 방법** | `pg_stat_archiver.last_archived_time` 감시, 주간 복구 리허설 |
| **우선순위** | P0 |
| **관련 FR** | FR-4 (DB Ops), FR-4.2 (Backup/Restore) |

#### NFR-REL.2 RTO (Recovery Time Objective)

| 항목 | 내용 |
|------|------|
| **설명** | 장애 인지 시점부터 서비스 재개까지 시간. wal-g base backup + WAL replay + PM2 ecosystem restart 자동화 스크립트. |
| **목표 수치** | **RTO ≤ 30분** (데이터 10GB 기준) |
| **측정 방법** | 분기별 DR 리허설, 자동 복구 스크립트 벤치마크, 시간 기록 |
| **우선순위** | P0 |
| **관련 FR** | FR-4.2 (Backup/Restore), FR-14 (Operations) |

#### NFR-REL.3 PM2 cluster 자동 재시작

| 항목 | 내용 |
|------|------|
| **설명** | PM2 `cluster:4` 모드 + `max_memory_restart: 500M` + `autorestart: true` + exponential backoff. 워커 중 1개 크래시 시 서비스 가용 유지. |
| **목표 수치** | 단일 워커 크래시 복구 ≤ 3초, 연속 재시작 10회 초과 시 admin 알림 |
| **측정 방법** | PM2 `pm2 logs --err` 모니터링, Prometheus `pm2_restart_count` 알림 규칙 |
| **우선순위** | P0 |
| **관련 FR** | FR-14 (Operations), FR-14.1 (PM2 Cluster) |

#### NFR-REL.4 Canary 배포 시간차 롤백

| 항목 | 내용 |
|------|------|
| **설명** | `canary.stylelucky4u.com` 서브도메인에 신 버전을 먼저 배포하고 30분간 헬스체크 유지. 에러율 > 1% 또는 응답 지연 p95 > 2x 시 자동 롤백. |
| **목표 수치** | 롤백 개시 ≤ 60초, 롤백 다운타임 0초 (symlink swap) |
| **측정 방법** | `kdycanary` 스킬 연계, 실 배포 이벤트 로그, 월간 리포트 |
| **우선순위** | P1 |
| **관련 FR** | FR-14.3 (Canary Deployment) |

#### NFR-REL.5 단일 장애점 (SPOF) 최소화

| 항목 | 내용 |
|------|------|
| **설명** | 1인 운영 · 단일 서버 제약상 완전한 SPOF 제거는 불가하나, 다음 4개 컴포넌트는 **핫스탠바이 또는 자동 복구 스크립트** 보유: PostgreSQL, Next.js, cloudflared, SeaweedFS. |
| **목표 수치** | 각 컴포넌트별 자동 복구 스크립트 존재 ≥ 4, 수동 개입 평균 빈도 ≤ 1회/월 |
| **측정 방법** | 런북(`docs/runbooks/`) 점검, 실제 장애 시 개입 로그 집계 |
| **우선순위** | P1 |
| **관련 FR** | FR-14 (Operations) |

---

## 5. NFR-MNT (유지보수성)

#### NFR-MNT.1 단일 저장소 모노레포

| 항목 | 내용 |
|------|------|
| **설명** | Next.js 16 app + Prisma schema + 보조 스크립트를 단일 git 저장소에서 관리. 모노레포 도구(Turborepo/Nx)는 미도입(복잡도 회피), 단일 `package.json` + workspace 단순 구조. |
| **목표 수치** | `git clone + pnpm install + pnpm dev`까지 신규 개발자 setup ≤ **15분**, README quickstart 단계 ≤ 5 |
| **측정 방법** | 신규 환경(WSL2 clean install)에서 setup timer, README 수동 follow-through |
| **우선순위** | P1 |
| **관련 FR** | FR-14 (Operations) |

#### NFR-MNT.2 Prisma schema 자동 migration

| 항목 | 내용 |
|------|------|
| **설명** | DB 변경은 `prisma migrate dev`로 마이그레이션 파일을 생성하고, 배포 시 `prisma migrate deploy`로 자동 적용. 수동 `psql < file.sql` 금지. |
| **목표 수치** | 마이그레이션 실패 시 자동 롤백 스크립트 존재, 수동 SQL 실행 0건 (`audit_log` 기록) |
| **측정 방법** | `_prisma_migrations` 테이블 감시, 배포 파이프라인 step 검증 |
| **우선순위** | P1 |
| **관련 FR** | FR-4 (DB Ops), FR-3 (Schema Visualizer) |

#### NFR-MNT.3 테스트 커버리지

| 항목 | 내용 |
|------|------|
| **설명** | pure 함수 및 공개 API 라우트에 대한 Vitest 커버리지. TypeScript strict 모드 + 핵심 도메인 로직에 unit test 강제. |
| **목표 수치** | pure 함수 **line coverage ≥ 90%**, API 라우트 happy-path ≥ 80%, mutation testing score ≥ 60% (향후) |
| **측정 방법** | `vitest run --coverage`, 주간 리포트 자동 publish, PR 차단 조건 |
| **우선순위** | P2 |
| **관련 FR** | 전 카테고리 |

#### NFR-MNT.4 문서화 커버리지

| 항목 | 내용 |
|------|------|
| **설명** | 공개 API / 스키마 / 운영 런북에 대한 문서 유지. TypeDoc + MDX 기반. CLAUDE.md 풀뿌리 트리에서 모든 문서 도달 가능. |
| **목표 수치** | 공개 API 엔드포인트 docstring 커버리지 100%, 운영 런북 ≥ 10개, dead link 0건 |
| **측정 방법** | TypeDoc 리포트, `lychee` link checker 주간 실행 |
| **우선순위** | P2 |
| **관련 FR** | FR-13 (UX Quality), FR-14 (Operations) |

---

## 6. NFR-CMP (호환성)

#### NFR-CMP.1 Supabase Cloud API 호환성

| 항목 | 내용 |
|------|------|
| **설명** | Data API는 PostgREST 방언과 호환되는 URL 패턴(`/rest/v1/{table}?select=...&order=...&limit=...`)을 제공. `supabase-js` v2 클라이언트 + `@supabase/supabase-js` 코드의 **읽기 경로** 이식성 확보. |
| **목표 수치** | Supabase 문서 기본 쿼리 패턴 지원률 ≥ **80%** (select/insert/update/delete/RPC), 쓰기/Realtime은 점진 확장 |
| **측정 방법** | 호환성 매트릭스 문서(`docs/compatibility/postgrest.md`), E2E 포팅 테스트 |
| **우선순위** | P1 |
| **관련 FR** | FR-11 (Data API), FR-9 (Realtime) |

#### NFR-CMP.2 PostgreSQL 15+ 지원

| 항목 | 내용 |
|------|------|
| **설명** | PostgreSQL **15, 16, 17** 지원 (Prisma 7 matrix 기준). `wal2json`, `pgmq` 확장은 각 버전별 검증. |
| **목표 수치** | CI matrix에 3개 버전 포함, breaking change 감지 시 release note 필수 |
| **측정 방법** | GitHub Actions matrix build, `pg_extension` 로딩 테스트 |
| **우선순위** | P0 |
| **관련 FR** | 전 카테고리 (데이터 계층) |

#### NFR-CMP.3 Node.js 24 LTS

| 항목 | 내용 |
|------|------|
| **설명** | Node.js **24 LTS**를 기본 런타임으로 고정. `package.json engines.node` 강제. isolated-vm v6 Node 24 호환 확인(Wave 1 스파이크). |
| **목표 수치** | Node 24.x 미만 버전 install 시 실패, 배포 환경 Node 버전 pin |
| **측정 방법** | `package.json engines`, CI `node --version` 체크, PM2 ecosystem 설정 |
| **우선순위** | P0 |
| **관련 FR** | FR-8 (Edge Functions), FR-14 (Operations) |

#### NFR-CMP.4 Linux x86_64 + WSL2

| 항목 | 내용 |
|------|------|
| **설명** | 프로덕션은 WSL2 Ubuntu 22.04 LTS (x86_64). 개발 환경은 Windows 11 + WSL2 또는 macOS. ARM64는 미지원(추후 확장). |
| **목표 수치** | 아키텍처 `linux/amd64` 고정, WSL2 filesystem 성능 요구 충족 (NFR-PERF 조건) |
| **측정 방법** | `uname -m` 검증, WSL2 I/O 벤치마크 (ASM-3 연계) |
| **우선순위** | P1 |
| **관련 FR** | FR-14 (Operations) |

---

## 7. NFR-COST (비용)

#### NFR-COST.1 월 운영비

| 항목 | 내용 |
|------|------|
| **설명** | Cloudflare Tunnel 무료 플랜 + B2(Backblaze) 오브젝트 스토리지 + 자가 WSL2 서버(전기료 제외). 타 SaaS 의존성 최소화. |
| **목표 수치** | **월 운영비 ≤ $10**, B2 스토리지 100GB 기준 $0.50, transfer $0 (Cloudflare via), 도메인 연간 $15 |
| **측정 방법** | Cloudflare + Backblaze billing 대시보드, 분기별 비용 리뷰 |
| **우선순위** | P0 |
| **관련 FR** | FR-7 (Storage), FR-14 (Operations) |

#### NFR-COST.2 AI 비용 (Claude API)

| 항목 | 내용 |
|------|------|
| **설명** | UX Quality의 AI Assistant는 Claude Haiku 4.7을 기본 라우팅. Sonnet 4.7 승격은 복잡도 ≥ 4 또는 긴 컨텍스트 조건 하드 가드. BYOK(Bring Your Own Key) 옵션. |
| **목표 수치** | **월 AI 비용 ≤ $5** (일반 사용량 기준), Sonnet 사용률 ≤ 20% of total requests |
| **측정 방법** | AI SDK v6 `usage` 로그 집계, 월간 비용 리포트, 임계값 초과 시 downgrade 자동 전환 |
| **우선순위** | P1 |
| **관련 FR** | FR-13 (UX Quality), FR-13.1 (AI Assistant) |

---

## 8. 부록

### 8.1 NFR → FR 매핑 매트릭스 (요약)

| NFR | 주 관련 FR |
|-----|-----------|
| NFR-PERF.1~2 | FR-1, FR-2 |
| NFR-PERF.3 | FR-9 |
| NFR-PERF.4 | FR-8 |
| NFR-PERF.5 | FR-11, FR-4 |
| NFR-PERF.6 | FR-7 |
| NFR-SEC.1~10 | FR-5, FR-6, FR-12 (+ 전 카테고리) |
| NFR-UX.1~5 | FR-13 (+ 전 카테고리 UI) |
| NFR-REL.1~5 | FR-4, FR-14 |
| NFR-MNT.1~4 | FR-14, 전 카테고리 |
| NFR-CMP.1~4 | 전 카테고리 (데이터/런타임) |
| NFR-COST.1~2 | FR-7, FR-13, FR-14 |

### 8.2 측정 케이던스

| 주기 | 측정 대상 |
|------|----------|
| 실시간 | NFR-PERF.5, NFR-REL.3 (Prometheus alert) |
| 일간 | NFR-SEC.1 (JWKS 회전), NFR-REL.1 (RPO) |
| 주간 | NFR-PERF.1~4, NFR-SEC.7 (RLS 커버리지), NFR-MNT.3 (테스트 커버리지) |
| 월간 | NFR-COST.1~2, NFR-SEC.8 (OWASP), NFR-REL.4 (canary) |
| 분기 | NFR-REL.2 (DR 리허설), NFR-MNT.4 (문서화), NFR-UX.1 (학습 곡선) |

### 8.3 관련 문서

- [02-functional-requirements.md](./02-functional-requirements.md) — 기능 요구사항 (FR)
- [04-constraints-assumptions.md](./04-constraints-assumptions.md) — 제약 + 가정
- [05-100점-definition.md](./05-100점-definition.md) — 100점 정의 (Wave 3 M1 산출)
- [08-security-threat-model.md](./08-security-threat-model.md) — 보안 위협 모델 (Wave 3 M2 산출)
- [../_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md) — kdywave 진행 체크포인트

### 8.4 변경 이력

| 버전 | 일자 | 작성자 | 변경 |
|-----|------|-------|------|
| 1.0 | 2026-04-18 | W3-R2 Agent | 초안 작성 (NFR 38개, 7 카테고리) |

---

> 다음 단계: Wave 4 청사진 작성 시 각 NFR에 대해 **설계 결정 추적** 링크를 추가하고, Wave 5 로드맵에서 NFR 달성 시점을 Phase에 매핑한다.
