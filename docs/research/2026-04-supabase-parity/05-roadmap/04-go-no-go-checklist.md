# 04. Go / No-Go 체크리스트 — Phase 진입·완료 게이트 및 릴리스 게이트

> Wave 5 · R3 에이전트 산출물
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관:
> - [02-architecture/05-operations-blueprint.md](../02-architecture/05-operations-blueprint.md) (ADR-015 Capistrano + canary)
> - [02-architecture/04-observability-blueprint.md](../02-architecture/04-observability-blueprint.md) (Vault + JWKS + 메트릭)
> - [04-integration/02-cloudflare-deployment-integration.md](../04-integration/02-cloudflare-deployment-integration.md) (Tunnel 530 운영 교훈)
> - [00-vision/05-100점-definition.md](../00-vision/05-100점-definition.md) (14카 4단계)
> - [00-vision/03-non-functional-requirements.md](../00-vision/03-non-functional-requirements.md) (NFR 38건)
> - [handover 25-B](../../../../docs/handover/260418-session25b-deploy-tunnel-tuning.md), [25-C](../../../../docs/handover/260418-session25c-tunnel-complete-playwright.md) (실전 530 교훈)

---

## 0. 문서 구조

```
§1.  요약 — 게이트 체계 개요 + 총 카운트
§2.  게이트 분류 정의 — Entry / Exit / 공통 선행
§3.  공통 진입 게이트 (CG-0) — 모든 Phase 공통 선행 조건
§4.  Phase 15 게이트 — Auth Advanced (TOTP / WebAuthn / Rate Limit)
§5.  Phase 16 게이트 — Observability + Operations
§6.  Phase 17 게이트 — Storage (SeaweedFS + B2)
§7.  Phase 18 게이트 — Table Editor + Schema Visualizer 고도화
§8.  Phase 19 게이트 — Realtime (wal2json + supabase-realtime)
§9.  Phase 20 게이트 — Advisors + DB Ops 심화
§10. Phase 21 게이트 — Data API + UX Quality (AI Assistant)
§11. Phase 22 게이트 — Edge Functions + 통합 완성
§12. 릴리스 게이트 — MVP / Beta / v1.0 (각 3종 × 3 = 9 게이트)
§13. NFR ↔ 게이트 매트릭스 — 38 NFR 검증 게이트 매핑
§14. No-Go 처리 프로토콜 — 게이트 실패 시 4단계 절차
부록 Z. 근거 인덱스 · 변경 이력
```

---

## 1. 요약 — 게이트 체계 개요

### 1.1 총 게이트 수

| 구분 | 유형 | 게이트 수 |
|------|------|---------|
| Phase 15~22 Entry 게이트 | 진입 조건 (Entry) | 8 |
| Phase 15~22 Exit 게이트 | 완료 조건 (Exit) | 8 |
| 릴리스 게이트 (MVP/Beta/v1.0) | 릴리스 전/중/후 | 9 |
| **합계** | | **25** |

> 공통 선행 게이트(CG-0)는 모든 Phase에 적용되므로 개별 Phase 게이트 수에 포함되지 않음.

### 1.2 게이트 ID 명명 규칙

```
P{Phase번호}-{E/X}-{순번}

예)
  P15-E-1  → Phase 15 Entry 첫 번째 체크
  P15-X-3  → Phase 15 Exit 세 번째 체크
  REL-MVP-2 → MVP 릴리스 2번 게이트
```

### 1.3 핵심 원칙

1. **측정 가능한 기준만 사용**: 모든 체크 항목은 "Pass" 또는 "Fail"로 이분화 가능한 수치·명령어·증거 기반
2. **1인 운영자 대응**: 게이트 실패 처리는 반드시 단독 운영 가능한 절차
3. **실전 교훈 반영**: 세션 25-B/C의 Cloudflare Tunnel 530 운영 경험을 게이트에 직접 인용
4. **ADR-015 준수**: 모든 배포 게이트는 Capistrano-style + PM2 cluster:4 + canary 전략 기반

---

## 2. 게이트 분류 정의

### 2.1 Entry 게이트 (진입 게이트)

Phase **시작 전** 반드시 통과해야 하는 조건. 통과 실패 시 해당 Phase 시작 불가.

| 속성 | 정의 |
|------|------|
| 시점 | Phase 첫 번째 커밋 이전 |
| 권한 | 1인 운영자 자가 점검 |
| Fail 시 | 전 Phase 재검토 또는 선행 조건 충족 대기 |

### 2.2 Exit 게이트 (완료 게이트)

Phase **완료 선언 전** 반드시 통과해야 하는 조건. 통과 실패 시 완료 선언 불가 → 부채 등록 또는 수정 후 재시도.

| 속성 | 정의 |
|------|------|
| 시점 | Phase 마지막 PR merge 전 |
| 권한 | 1인 운영자 자가 검증 |
| Fail 시 | 수정 후 재검증 또는 부채로 등록 + 다음 Phase Entry에 해소 조건 추가 |

### 2.3 공통 진입 게이트 (CG-0)

모든 Phase Entry에 선행하는 4개 공통 조건. 아래 §3에서 상세 정의.

---

## 3. 공통 진입 게이트 (CG-0) — 모든 Phase 공통 선행 조건

> 모든 Phase 15~22의 Entry 게이트는 아래 CG-0-1 ~ CG-0-4를 먼저 통과해야 한다.

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 |
|----|---------|---------|---------|------------|
| **CG-0-1** | 이전 Phase Exit 게이트 전원 통과 | 체크리스트 문서 | 이전 Phase 모든 Exit ✓ | 이전 Phase 미완료 항목 재수행 |
| **CG-0-2** | 인수인계서 작성 완료 | `docs/handover/` 최신 파일 | 이전 Phase 인수인계서 커밋됨 | 인수인계서 즉시 작성 후 커밋 |
| **CG-0-3** | 운영 환경 헬스 확인 | `bash scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 14 5` | 14/14 edge 관통 성공 (2xx~4xx) | `pm2 restart cloudflared` 후 30~40초 propagation 대기 → 재측정. 세션 25-C 교훈: "/login 기준으로 측정, 5xx/curl error만 실패로 처리" |
| **CG-0-4** | 배포 전 DB 백업 | `deploy.sh` 내 `trigger-backup.js` | `backups` 테이블에 `kind=MANUAL` 레코드 생성됨 | 수동으로 `pg_dump` 실행 후 재확인 |

---

## 4. Phase 15 게이트 — Auth Advanced (TOTP / WebAuthn / Rate Limit)

> 목표: Auth Advanced 0 → 60점, 테스트 커버리지 80%+, E2E MFA 등록·인증 PASS

### Phase 15 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P15-E-1** | Auth Core 점수 70점 유지 확인 | 14카 점수표 (`docs/status/current.md`) | Auth Core 점수 ≥ 70 | Auth Core 누락 기능 Phase 14 재수행 | 운영자 |
| **P15-E-2** | Observability JWKS 엔드포인트 준비 | `curl https://stylelucky4u.com/.well-known/jwks.json` | HTTP 200 + `keys[]` 배열 포함 | Phase 16 Observability 선행 구현 필요 (단, TOTP는 JWKS 없이도 구현 가능) | 운영자 |
| **P15-E-3** | TOTP secret Vault 경로 확정 | `docs/references/_SUPABASE_TECH_MAP.md` + ADR-007 | `vault_secrets` 테이블 스키마 + `mfa/totp/{userId}` 경로 명세 존재 | ADR-007 재검토 후 경로 정의 | 운영자 |
| **P15-E-4** | `rate_limit_bucket` 테이블 마이그레이션 준비 | `npx prisma migrate status` | 마이그레이션 파일 + `down.sql` 양방향 존재 | `down.sql` 작성 후 커밋 (DQ-1.21 준수) | 개발자 |

### Phase 15 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P15-X-1** | TOTP + WebAuthn + Rate Limit 점수 60점 | 14카 점수표 수동 갱신 | Auth Advanced 점수 ≥ 60 | 미달 기능 목록 부채 등록 후 Phase 22 통합 완성 때 해소 | 운영자 |
| **P15-X-2** | Vitest 커버리지 80% | `npx vitest run --coverage` | Auth 도메인 line coverage ≥ 80% | 테스트 추가 후 재검증 | 개발자 |
| **P15-X-3** | E2E MFA 등록·인증 PASS | Playwright `npm run e2e -- --grep MFA` | MFA 등록·인증 E2E 테스트 Pass (530 대응: `retries: 2` 적용, 세션 25-C 교훈) | `playwright.config.ts` `retries: 2` 적용 확인 후 재실행 | 개발자 |
| **P15-X-4** | 감사 로그 검증 | `psql -c "SELECT * FROM audit_log WHERE action ILIKE '%mfa%' LIMIT 5"` | MFA 등록/인증 이벤트 `audit_log`에 5건 이상 기록 | `audit_log` 트리거 수정 후 재검증 | 개발자 |
| **P15-X-5** | Rate Limit 작동 검증 | `k6 run scripts/rate-limit-test.js` | `/login` 10 req/min/IP 초과 시 429 응답 ≤ 10ms | `rate_limit_bucket` 테이블 TTL 로직 수정 | 개발자 |
| **P15-X-6** | NFR-SEC.3 MFA 강제 | `psql -c "SELECT COUNT(*) FROM audit_log WHERE role='admin' AND mfa_method IS NULL AND created_at > NOW() - INTERVAL '1 day'"` | 결과 = 0 (admin 로그인 중 MFA 미사용 0건) | admin 계정 MFA 활성화 강제 로직 수정 | 개발자 |

---

## 5. Phase 16 게이트 — Observability + Operations

> 목표: Observability 65→85점, Operations 80→95점 (ADR-013 + ADR-015)

### Phase 16 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P16-E-1** | Vault MASTER_KEY 권한 설정 확인 | `wsl -u root -- stat /etc/luckystyle4u/secrets.env` | `chmod 0640 + owner root:ypb-runtime` | 권한 재설정 + systemd-sysctl 재로드 | 운영자 |
| **P16-E-2** | Capistrano 배포 스크립트 dry-run 검증 | `DRY_RUN=1 bash scripts/deploy.sh 2>&1 | grep -E 'DEPLOY|ERROR'` | dry-run 오류 없이 완료, RELEASE_ID 생성됨 | 스크립트 경로 및 환경변수 점검 | 개발자 |
| **P16-E-3** | PM2 graceful reload 5초 롤백 검증 | `time bash scripts/rollback.sh && echo done` | 롤백 완료 소요 ≤ 5초 | `ln -sfn` + `pm2 reload` 순서 점검 (Operations Blueprint §3.3) | 운영자 |
| **P16-E-4** | canary.stylelucky4u.com DNS 설정 확인 | `nslookup canary.stylelucky4u.com` | CNAME → Cloudflare Tunnel 반환 | Cloudflare DNS 패널에서 canary 레코드 추가 | 운영자 |
| **P16-E-5** | `deploy_events` SQLite 테이블 마이그레이션 | `sqlite3 data/metrics.db ".tables"` | `deploy_events` 테이블 존재 | `npx drizzle-kit migrate` 실행 | 개발자 |

### Phase 16 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P16-X-1** | Observability 점수 85점 | 14카 점수표 | Observability ≥ 85 | VaultService / JWKSService / MetricsService 미완료 항목 체크 | 운영자 |
| **P16-X-2** | Operations 점수 95점 | 14카 점수표 | Operations ≥ 95 | DeployOrchestrator / CanaryRouter / RollbackService 항목 점검 | 운영자 |
| **P16-X-3** | 연속 10회 무중단 배포 검증 | `for i in {1..10}; do bash scripts/deploy.sh && echo "OK $i"; done` | 10회 배포 모두 다운타임 0초 (PM2 cluster:4 graceful reload) | `pm2 reload --wait-ready` 옵션 확인 | 개발자 |
| **P16-X-4** | 배포 후 자동 롤백 시나리오 | 헬스체크 실패 유도 후 `deploy_events` STATUS 확인 | 헬스체크 5회 실패 → `ROLLED_BACK` 자동 기록 | HealthChecker `maxAttempts` + 자동 rollback 연동 확인 | 개발자 |
| **P16-X-5** | Cloudflare Tunnel 30초 propagation 검증 | `pm2 restart cloudflared && sleep 35 && bash scripts/tunnel-measure-v2.sh` | `pm2 restart cloudflared` 후 35초 대기 시 14/14 성공 (세션 25-B 교훈: "30~40초 propagation") | cloudflared `grace-period: 30s` 설정 확인 | 운영자 |
| **P16-X-6** | JWKS 키 회전 검증 | `curl https://stylelucky4u.com/.well-known/jwks.json | jq '.keys | length'` | ≥ 2 키(current + previous grace) | JWKSService `grace` 30일 설정 확인 (ADR-013) | 개발자 |
| **P16-X-7** | Deployment UI 접근 확인 | Playwright `npm run e2e -- --grep Deployment` | `/dashboard/settings/deployments` 배포 이력 표시 + 롤백 버튼 존재 | DeploymentList 컴포넌트 데이터 바인딩 수정 | 개발자 |

---

## 6. Phase 17 게이트 — Storage (SeaweedFS + B2)

> 목표: Storage 0 → 60점 (SeaweedFS 단독 + B2 비동기 복제, ADR-008)

### Phase 17 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P17-E-1** | SeaweedFS filer + volume 서버 기동 확인 | `curl http://localhost:8888/` | HTTP 200 응답 (SeaweedFS filer) | PM2 ecosystem에 `seaweedfs-filer` 앱 추가 후 기동 | 운영자 |
| **P17-E-2** | B2 API 키 Vault 경로 확정 | `psql -c "SELECT name FROM vault_secrets WHERE name ILIKE 'b2%'"` | `b2/application_key_id` + `b2/application_key` Vault 등록됨 | Vault CRUD UI에서 B2 시크릿 등록 | 운영자 |
| **P17-E-3** | 스토리지 버킷 정책 스키마 마이그레이션 | `npx prisma migrate status` | `storage_buckets` + `storage_objects` 마이그레이션 + `down.sql` 존재 | `down.sql` 작성 후 커밋 | 개발자 |
| **P17-E-4** | Phase 16 배포 파이프라인 정상 동작 | `deploy_events` 테이블에 최근 24시간 내 `SUCCESS` 레코드 존재 | `SELECT COUNT(*) > 0 FROM deploy_events WHERE status='SUCCESS' AND started_at > NOW() - INTERVAL '24h'` | Phase 16 Exit 게이트 재검토 | 운영자 |

### Phase 17 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P17-X-1** | Storage 점수 60점 | 14카 점수표 | Storage ≥ 60 | 파일 업로드/다운로드/버킷 CRUD 미완료 항목 점검 | 운영자 |
| **P17-X-2** | 업로드 처리량 검증 | `seaweedfs-benchmark` 100MB 파일 | Hot write ≥ 80 MB/s (NFR-PERF.6) | SeaweedFS volume 설정 최적화 | 개발자 |
| **P17-X-3** | B2 비동기 복제 지연 검증 | `rclone size b2:yangpyeong --max-age 10m` | 최근 10분 내 업로드 파일이 B2에 동기화됨 (지연 ≤ 10분) | B2 복제 워커 스케줄 확인 | 개발자 |
| **P17-X-4** | 파일 업로드 보안 검증 | Playwright 업로드 스크립트 + `/api/v1/storage/upload` | 파일 타입/크기 서버 사이드 검증 작동 (10MB 초과 거부, `.exe` 거부) | 서버 사이드 멀티파트 검증 미들웨어 수정 | 개발자 |
| **P17-X-5** | PM2 ecosystem `seaweedfs-filer` 앱 등록 | `pm2 list | grep seaweedfs` | `seaweedfs-filer` 프로세스 online | `ecosystem.config.js` 업데이트 후 `pm2 reload` | 운영자 |

---

## 7. Phase 18 게이트 — Table Editor + Schema Visualizer 고도화

> 목표: Table Editor 75→93점 (RLS UI), Schema Visualizer 65→90점

### Phase 18 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P18-E-1** | TanStack Table v8 기반 기존 80점 기능 회귀 없음 | Playwright `npm run e2e -- --grep TableEditor` | 기존 E2E 전 PASS (CRUD, 정렬, 필터, 페이지네이션) | 회귀 항목 수정 후 재실행 | 개발자 |
| **P18-E-2** | xyflow + elkjs 버전 고정 확인 | `cat package.json | jq '.dependencies["@xyflow/react"]'` | 버전 locked (caret 없는 고정 버전) | `package.json` 버전 고정 후 `pnpm install` | 개발자 |
| **P18-E-3** | OAuth Providers 조건 평가 (ADR-017) | ADR-017 재검토 트리거 조건 확인 | 조건 미충족 → Phase 18+ 연기 유지 | 충족 시 ADR-017 상태 Accepted로 갱신 | 운영자 |

### Phase 18 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P18-X-1** | Table Editor 점수 93점 | 14카 점수표 | Table Editor ≥ 93 | RLS UI + 뷰 지원 미완료 항목 부채 등록 | 운영자 |
| **P18-X-2** | Schema Visualizer 점수 90점 | 14카 점수표 | Schema Visualizer ≥ 90 | RLS Policy UI + 함수 편집기 점검 | 운영자 |
| **P18-X-3** | 100만 행 테이블 정렬 p95 검증 | Playwright E2E 10회 run | p95 ≤ 800ms (NFR-PERF.1) | PostgreSQL btree 인덱스 + 서버 사이드 정렬 확인 | 개발자 |
| **P18-X-4** | ERD 렌더링 50테이블 p95 | Chrome DevTools Performance | p95 ≤ 1.5s (NFR-PERF.7) | elkjs 레이아웃 알고리즘 파라미터 조정 | 개발자 |

---

## 8. Phase 19 게이트 — Realtime (wal2json + supabase-realtime)

> 목표: Realtime 0 → 70점 (ADR-010 wal2json + supabase-realtime 포팅)

### Phase 19 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P19-E-1** | PostgreSQL `wal2json` 익스텐션 설치 확인 | `psql -c "SELECT * FROM pg_extension WHERE extname='wal2json'"` | wal2json 설치됨 | `CREATE EXTENSION wal2json` 실행 (DBA) | 운영자 |
| **P19-E-2** | `wal_level=logical` 설정 확인 | `psql -c "SHOW wal_level"` | `logical` | `postgresql.conf` 수정 + PostgreSQL 재시작 | 운영자 |
| **P19-E-3** | `realtime-worker` PM2 앱 설계 완료 | `docs/research/2026-04-supabase-parity/02-architecture/` 내 Realtime Blueprint 존재 | Realtime Blueprint 문서 커밋됨 | Realtime 아키텍처 blueprint 먼저 작성 | 개발자 |
| **P19-E-4** | WebSocket + PM2 graceful reload 호환성 검증 계획 | Operations Blueprint §10.3 참조 | `kill_timeout: 3000` PM2 설정 + 클라이언트 자동재연결 로직 설계 존재 | 설계 문서 작성 후 진입 | 개발자 |

### Phase 19 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P19-X-1** | Realtime 점수 70점 | 14카 점수표 | Realtime ≥ 70 | Postgres Changes + Broadcast 기본 기능 점검 | 운영자 |
| **P19-X-2** | wal2json 지연 p95 검증 | Canary 테이블 rt_probe INSERT → WebSocket 수신 ΔT 24시간 | p50 ≤ 80ms, p95 ≤ 200ms (NFR-PERF.3) | wal2json replication slot 설정 최적화 | 개발자 |
| **P19-X-3** | PM2 reload 중 WebSocket 재연결 검증 | `pm2 reload luckystyle4u-server` 중 클라이언트 재연결 시간 측정 | 재연결 ≤ 5초 (exponential backoff 적용) | 클라이언트 재연결 로직 + `kill_timeout: 3000` 재확인 | 개발자 |
| **P19-X-4** | `realtime-worker` PM2 앱 등록 | `pm2 list | grep realtime` | `realtime-worker` 프로세스 online | `ecosystem.config.js` 업데이트 | 운영자 |
| **P19-X-5** | 헬스체크 Realtime 상태 포함 | `curl https://stylelucky4u.com/api/health | jq '.realtime'` | `{"status": "ok"}` 포함 | `/api/health` 라우트 Realtime 상태 체크 추가 | 개발자 |

---

## 9. Phase 20 게이트 — Advisors + DB Ops 심화

> 목표: Advisors 0→70점 (ADR-011), DB Ops 60→88점 (WAL 아카이빙, ADR-005)

### Phase 20 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P20-E-1** | schemalint 4.42 설치 확인 | `npx schemalint --version` | `4.42.x` | `pnpm add -D schemalint@4.42.x` | 개발자 |
| **P20-E-2** | wal-g 설치 + B2 연동 확인 | `wal-g --version && wal-g backup-list` | wal-g 설치 + B2 버킷 목록 반환 | wal-g B2 환경변수 Vault에서 주입 확인 | 운영자 |
| **P20-E-3** | `archive_timeout=60` PostgreSQL 설정 | `psql -c "SHOW archive_timeout"` | `60s` (NFR-REL.1 RPO ≤ 60초) | `postgresql.conf` + `pg_reload_conf()` | 운영자 |

### Phase 20 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P20-X-1** | Advisors 점수 70점 | 14카 점수표 | Advisors ≥ 70 | schemalint + squawk 기본 룰셋 구현 확인 | 운영자 |
| **P20-X-2** | DB Ops 점수 88점 | 14카 점수표 | DB Ops ≥ 88 | WAL 아카이빙 + UI Cron 관리 확인 | 운영자 |
| **P20-X-3** | RPO ≤ 60초 검증 | `psql -c "SELECT now() - last_archived_time FROM pg_stat_archiver"` | 결과 ≤ 60초 | `archive_timeout` + WAL 아카이빙 워커 확인 | 운영자 |
| **P20-X-4** | RTO ≤ 30분 검증 | 분기 DR 리허설 + 복구 소요 시간 기록 | 복구 ≤ 30분 (NFR-REL.2) | 자동 복구 스크립트 벤치마크 최적화 | 운영자 |
| **P20-X-5** | ESLint `no-raw-sql` 룰 0 위반 | `npm run lint` | raw SQL 위반 0건 (NFR-SEC.6) | 위반 패턴 수정 후 재실행 | 개발자 |

---

## 10. Phase 21 게이트 — Data API + UX Quality (AI Assistant)

> 목표: Data API 0→80점 (ADR-012), UX Quality 50→85점 (ADR-014 AI SDK v6)

### Phase 21 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P21-E-1** | pgmq 익스텐션 설치 확인 | `psql -c "SELECT * FROM pg_extension WHERE extname='pgmq'"` | pgmq 설치됨 | `CREATE EXTENSION pgmq` 실행 | 운영자 |
| **P21-E-2** | Anthropic API 키 Vault 등록 | `psql -c "SELECT name FROM vault_secrets WHERE name ILIKE 'anthropic%'"` | `anthropic/api_key` Vault 등록됨 | Vault CRUD UI에서 등록 | 운영자 |
| **P21-E-3** | pg_graphql 도입 조건 평가 (ADR-016) | ADR-016 재검토 트리거 4개 조건 확인 | 조건 미충족 → pg_graphql 보류 유지 | 충족 시 ADR-016 업데이트 | 운영자 |

### Phase 21 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P21-X-1** | Data API 점수 80점 | 14카 점수표 | Data API ≥ 80 | REST auto-gen + pgmq Job Queue 구현 확인 | 운영자 |
| **P21-X-2** | UX Quality 점수 85점 | 14카 점수표 | UX Quality ≥ 85 | AI Assistant BYOK + 커맨드 팔레트 확인 | 운영자 |
| **P21-X-3** | API p95 응답 검증 | `k6 run scripts/api-perf-test.js` | p95 ≤ 300ms (NFR-PERF.5) | PostgreSQL 쿼리 최적화 + PG 연결 풀 확인 | 개발자 |
| **P21-X-4** | pgmq 잡 큐 SLA 검증 | pgmq 메트릭 `queue_lag_seconds` | enqueue→실행 ≤ 30초 (NFR-PERF.5) | `cron-worker` 폴링 간격 조정 | 개발자 |
| **P21-X-5** | AI 비용 월 $5 이하 검증 | Claude Console billing 대시보드 | 월 AI 비용 ≤ $5 (NFR-COST.2) | Haiku 라우팅 비율 증가 + Sonnet 사용 조건 강화 | 운영자 |

---

## 11. Phase 22 게이트 — Edge Functions + 통합 완성

> 목표: Edge Functions 0→75점 (ADR-009), 전 카테고리 100점 달성

### Phase 22 Entry 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P22-E-1** | isolated-vm v6 Node 24 호환 확인 | `node -e "require('isolated-vm')"` | 임포트 오류 없음 | isolated-vm 버전 업그레이드 또는 Wave 1 스파이크 재검증 | 개발자 |
| **P22-E-2** | Phase 15~21 부채 목록 점검 | `docs/handover/` 최신 파일 내 "부채" 섹션 | 부채 0건 또는 P2 부채만 잔존 | P0/P1 부채 해소 후 진입 | 운영자 |
| **P22-E-3** | 전 카테고리 현재 점수 확인 | 14카 점수표 | 14개 카테고리 중 70점 미만 카테고리 0개 | 미달 카테고리 보강 후 재평가 | 운영자 |

### Phase 22 Exit 게이트

| ID | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|---------|---------|---------|------------|------|
| **P22-X-1** | Edge Functions 점수 75점 | 14카 점수표 | Edge Functions ≥ 75 | isolated-vm 3층 하이브리드 구현 확인 | 운영자 |
| **P22-X-2** | isolated-vm cold start p95 검증 | 1000회 cold start 타임스탬프 측정 | p95 ≤ 50ms (NFR-PERF.4) | Isolate warm pool 사전 생성 전략 적용 | 개발자 |
| **P22-X-3** | 14카 전체 점수 확인 | 14카 점수표 최종 갱신 | 최저 카테고리 점수 ≥ 75 + 평균 ≥ 90 | 미달 카테고리 추가 구현 또는 부채 등록 | 운영자 |
| **P22-X-4** | OWASP ZAP baseline scan | `zap-baseline.py -t https://stylelucky4u.com` | HIGH 0건, MEDIUM ≤ 3건 (NFR-SEC.8) | HIGH 취약점 즉시 수정, MEDIUM은 부채 등록 | 개발자 |
| **P22-X-5** | 대시보드 LCP p95 검증 | Lighthouse 10회 측정 | LCP p95 ≤ 1.8s (NFR-PERF.8) | Next.js 번들 분석 + `next/dynamic` 코드 스플리팅 | 개발자 |
| **P22-X-6** | Supabase API 호환성 매트릭스 | 호환성 테스트 스크립트 실행 | PostgREST 패턴 지원률 ≥ 80% (NFR-CMP.1) | Data API 엔드포인트 보강 | 개발자 |

---

## 12. 릴리스 게이트 — MVP / Beta / v1.0

> MVP = Phase 16 완료 기준, Beta = Phase 19 완료 기준, v1.0 = Phase 22 완료 기준

### 12.1 MVP 릴리스 게이트 (Phase 16 완료 후)

**MVP 범위**: Auth Core 80점 + Observability 85점 + Operations 95점 + DB Ops 75점 + Table Editor 80점

| ID | 유형 | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|------|---------|---------|---------|------------|------|
| **REL-MVP-1** | Pre-release | 코드 동결 + 회귀 매트릭스 통과 | `npx vitest run` + `npm run e2e` | vitest 전 PASS + E2E retries:2 허용 후 PASS (세션 25-C 교훈) | Playwright 실패 항목 수정 | 개발자 |
| **REL-MVP-2** | Release-day | 카나리 배포 + 1시간 모니터링 | `bash scripts/deploy.sh --canary` + 60분 메트릭 감시 | 카나리 에러율 < 0.1%, p95 < 500ms, 530 발생 0건 | canary 즉시 중단 + `CANARY_WEIGHT=0` + PM2 stop | 운영자 |
| **REL-MVP-3** | Post-release | 24h 안정성 + 인시던트 0 | `scripts/tunnel-measure-v2.sh` 자동 1시간 스케줄 실행 결과 집계 | 24시간 내 530 인시던트 0건 (5xx ≤ 0.1%) | 인시던트 post-mortem 작성 후 수정 | 운영자 |

### 12.2 Beta 릴리스 게이트 (Phase 19 완료 후)

**Beta 범위**: MVP 범위 + Realtime 70점 + Storage 60점 + Table Editor 93점 + Schema Visualizer 90점

| ID | 유형 | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|------|---------|---------|---------|------------|------|
| **REL-BETA-1** | Pre-release | 보안 감사 + OWASP ZAP baseline | `zap-baseline.py -t https://stylelucky4u.com` + `npm run lint` | ZAP HIGH 0건, ESLint 0 오류, NFR-SEC 체크리스트 ≥ 90% | HIGH 즉시 수정, 체크리스트 미달 항목 등록 | 개발자 |
| **REL-BETA-2** | Release-day | 단계적 카나리 배포 (1%→5%→25%→100%) | `CanaryRouter.setCanaryWeight()` API 순차 호출 | 각 단계 30분 관찰 후 에러율 < 1%, p95 < 2x 유지 | 에러율 초과 시 `CANARY_WEIGHT=0` 즉시 복원 | 운영자 |
| **REL-BETA-3** | Post-release | 사용자 피드백 수집 + 24h 안정성 | 1인 오너 시나리오 테스트 기록 + Slack 알림 0건 | 치명적 버그 0건, UX 태스크 완료 시간 ≤ 2시간 (NFR-UX.1) | 피드백 기반 버그 수정 + 다음 Phase 계획 조정 | 운영자 |

### 12.3 v1.0 릴리스 게이트 (Phase 22 완료 후)

**v1.0 범위**: 14카 전체 100점 목표 + 양평 특화 5% 포함

| ID | 유형 | 체크 항목 | 측정 도구 | Pass 기준 | Fail 시 대응 | 책임자 |
|----|------|---------|---------|---------|------------|------|
| **REL-V10-1** | Pre-release | 14카 100점 정의 달성 확인 + 전 NFR 검증 | 14카 점수표 최종 + NFR 38건 게이트 매트릭스 (§13) | 14카 평균 ≥ 90점 + P0 NFR 전 PASS | 미달 카테고리/NFR 부채 해소 후 재평가 | 운영자 |
| **REL-V10-2** | Release-day | 전체 E2E 통과 + 롤백 5분 연습 | `npm run e2e` 전 통과 + `time bash scripts/rollback.sh` | E2E 전 PASS + 롤백 소요 ≤ 5초 | E2E 실패 항목 수정, 롤백 스크립트 최적화 | 개발자 |
| **REL-V10-3** | Post-release | 48h 안정성 + Docker 이행 조건 재평가 | 48시간 5xx ≤ 0.1% + ADR-015 Docker 이행 조건 4개 재확인 | 안정성 달성 + 이행 조건 미충족 시 Capistrano 유지 확인 | 이행 조건 충족 시 ADR-015 갱신 | 운영자 |

---

## 13. NFR ↔ 게이트 매트릭스 — 38 NFR 검증 게이트 매핑

| NFR ID | 설명 요약 | 검증 게이트 | 우선순위 |
|--------|---------|-----------|---------|
| NFR-PERF.1 | Table Editor 100만 행 p95 ≤ 800ms | P18-X-3 | P1 |
| NFR-PERF.2 | SQL Editor EXPLAIN p95 ≤ 500ms | P21-X-3 보조 | P1 |
| NFR-PERF.3 | Realtime wal2json p95 ≤ 200ms | P19-X-2 | P1 |
| NFR-PERF.4 | Edge Function cold start p95 ≤ 50ms | P22-X-2 | P1 |
| NFR-PERF.5 | API p95 ≤ 300ms + pgmq ≤ 30초 | P21-X-3, P21-X-4 | P0 |
| NFR-PERF.6 | Storage 업로드 ≥ 80 MB/s | P17-X-2 | P1 |
| NFR-PERF.7 | Schema ERD 50테이블 p95 ≤ 1.5s | P18-X-4 | P2 |
| NFR-PERF.8 | 대시보드 LCP p95 ≤ 1.8s | P22-X-5 | P0 |
| NFR-SEC.1 | JWKS ES256 + 24h 회전 | P16-X-6 | P0 |
| NFR-SEC.2 | MASTER_KEY AES-256-GCM envelope | P16-E-1, P16-X-6 | P0 |
| NFR-SEC.3 | admin MFA 100% 강제 | P15-X-6 | P0 |
| NFR-SEC.4 | Rate Limit 10 req/min/IP 인증 엔드포인트 | P15-X-5 | P0 |
| NFR-SEC.5 | Tunnel + localhost 127.0.0.1 바인딩 | CG-0-3 (배포 시 매번) | P0 |
| NFR-SEC.6 | Prepared Statement 강제 (no-raw-sql) | P20-X-5 | P0 |
| NFR-SEC.7 | RLS 기본 활성화 ≥ 95% | P18-X-1 보조 | P0 |
| NFR-SEC.8 | OWASP Top 10 ZAP HIGH 0건 | P22-X-4, REL-BETA-1 | P0 |
| NFR-SEC.9 | CSRF + CORS SameSite=Lax | REL-MVP-1 (E2E 포함) | P1 |
| NFR-SEC.10 | 감사 로그 불변성 365일 | P15-X-4 | P1 |
| NFR-UX.1 | UX 5태스크 ≤ 2시간 | REL-BETA-3 | P1 |
| NFR-UX.2 | 한국어 UI 100% 커버 | REL-V10-1 보조 | P1 |
| NFR-UX.3 | 다크 테마 WCAG AA 4.5:1 | P22-X-5 보조 | P2 |
| NFR-UX.4 | 글로벌 단축키 ≥ 10개 | P21-X-2 보조 | P1 |
| NFR-UX.5 | 에러 메시지 3요소 ≥ 95% | REL-V10-1 보조 | P1 |
| NFR-REL.1 | RPO ≤ 60초 | P20-X-3 | P0 |
| NFR-REL.2 | RTO ≤ 30분 | P20-X-4 | P0 |
| NFR-REL.3 | PM2 cluster 워커 크래시 복구 ≤ 3초 | P16-X-3 (배포 중 감시) | P0 |
| NFR-REL.4 | 카나리 롤백 ≤ 60초 개시 | REL-MVP-2, REL-BETA-2 | P1 |
| NFR-REL.5 | SPOF 컴포넌트 4개 자동 복구 | P16-X-5 (cloudflared), P19-X-4 (realtime) | P1 |
| NFR-MNT.1 | 신규 setup ≤ 15분 | REL-V10-1 보조 | P1 |
| NFR-MNT.2 | Prisma 자동 마이그레이션 | CG-0-4 + P16-X-4 | P1 |
| NFR-MNT.3 | 테스트 line coverage ≥ 90% (pure 함수) | P15-X-2, P22-X-1 보조 | P2 |
| NFR-MNT.4 | 문서화 커버리지 dead link 0건 | REL-V10-1 보조 | P2 |
| NFR-CMP.1 | PostgREST 패턴 지원률 ≥ 80% | P22-X-6 | P1 |
| NFR-CMP.2 | PostgreSQL 15/16/17 지원 | P15-E-1 (마이그레이션 검증) | P0 |
| NFR-CMP.3 | Node.js 24 LTS | P22-E-1 보조 | P0 |
| NFR-CMP.4 | Linux x86_64 + WSL2 | CG-0-3 (매 Phase) | P1 |
| NFR-COST.1 | 월 운영비 ≤ $10 | REL-V10-3 보조 | P0 |
| NFR-COST.2 | 월 AI 비용 ≤ $5 | P21-X-5 | P1 |

---

## 14. No-Go 처리 프로토콜 — 게이트 실패 시 4단계 절차

### 14.1 즉시 대응 (0~5분)

게이트 실패 확인 즉시 다음 조치:

1. **작업 중단**: 진행 중인 Phase 작업 즉시 중단 (진행 중 코드 커밋 금지)
2. **현재 상태 스냅샷**: `git stash` + `pm2 status` + `psql -c "SELECT version()"` 출력 기록
3. **실패 게이트 ID 기록**: `docs/status/current.md`에 실패 게이트 ID + 시각 + 에러 메시지 기입

### 14.2 원인 분류 (5~15분)

| 원인 유형 | 판단 기준 | 대응 경로 |
|---------|---------|---------|
| **일시적 인프라 오류** | Cloudflare Tunnel 530, PM2 재시작 필요 등 | 즉시 복구 후 게이트 재시도 (세션 25-B 교훈: `pm2 restart cloudflared` + 30~40초 대기) |
| **코드 결함** | 테스트 실패, 기능 미구현, 점수 미달 | 수정 후 해당 게이트만 재시도 |
| **환경 설정 오류** | 권한, 포트, 환경변수 누락 | 환경 설정 수정 후 재시도 |
| **설계 결함** | 아키텍처 전제 위반, ADR 충돌 | Phase 일시 중단 → 설계 재검토 → ADR 갱신 후 재진입 |

### 14.3 Phase 일시 중단 절차 (설계 결함 시)

```
1. 현재 브랜치 상태 커밋 (WIP 커밋): 
   git add -p && git commit -m "wip: Phase XX 게이트 실패 — 중단"

2. 이슈 부채 등록:
   docs/status/current.md 부채 테이블에 추가
   항목: [Phase] [게이트 ID] [실패 내용] [예상 해소 Phase]

3. ADR 재검토:
   해당 Phase와 관련된 ADR 번호 확인
   → ADR 상태를 "Under Review"로 임시 갱신

4. 다음 Phase에 선행 조건 추가:
   중단된 Phase Exit 게이트를 다음 Phase Entry에 P15-E-* 형식으로 추가
```

### 14.4 롤백 절차 (프로덕션 배포 실패 시)

세션 25-C 운영 교훈 반영:

```bash
# 1. symlink 역스왑 (5초 이내)
ls -t /home/dev/luckystyle4u-server/releases/ | sed -n '2p'
# → 직전 릴리스 디렉토리명 확인
ln -sfn /home/dev/luckystyle4u-server/releases/<직전_릴리스> \
        /home/dev/luckystyle4u-server/current

# 2. PM2 graceful reload
pm2 reload luckystyle4u-server --update-env

# 3. Tunnel 안정성 검증 (30~40초 propagation 대기 후)
sleep 35 && bash scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 14 5
# Pass: 14/14 성공 (2xx~4xx 기준, 세션 25-C 교훈: 5xx/curl error만 실패)

# 4. deploy_events 롤백 기록
# status='MANUAL_ROLLBACK' 업데이트는 Deployment UI 또는 직접 SQL
```

### 14.5 부채 등록 후 재시도 규칙

- **P0 부채**: 다음 Phase 진입 불가. 반드시 현 Phase 내 해소.
- **P1 부채**: 다음 Phase Entry 게이트에 해소 조건으로 추가. 2개 Phase 연속 이월 금지.
- **P2 부채**: 릴리스 게이트 Pre-release 단계에서 일괄 점검.

---

## 부록 Z. 근거 인덱스 · 변경 이력

### Z.1 인용 문서

| 문서 경로 | 인용 내용 |
|---------|---------|
| `02-architecture/05-operations-blueprint.md` | ADR-015 Capistrano-style, RollbackService §3.3, canary 절차 §5.4, PM2 ecosystem §4.3 |
| `02-architecture/04-observability-blueprint.md` | ADR-013 MASTER_KEY, JWKS ES256 §2.2, Phase 16 Observability 범위 §1.3 |
| `04-integration/02-cloudflare-deployment-integration.md` | Tunnel 토폴로지 §1.1, 530 대응 §11, 배포 파이프라인 §6 |
| `00-vision/05-100점-definition.md` | 14카 4단계 점수 정의 전체 |
| `00-vision/03-non-functional-requirements.md` | NFR 38건 (PERF/SEC/REL/UX/MNT/CMP/COST) |
| `docs/handover/260418-session25b-deploy-tunnel-tuning.md` | 530 진단: QUIC→HTTP/2 개선 30%→50%, cloudflared propagation 30~40초 |
| `docs/handover/260418-session25c-tunnel-complete-playwright.md` | sysctl 적용 100% 달성, "200 비율≠edge 관통", Playwright 530 재확인, retries:2 권고 |
| `docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` | 운영 가이드: `pm2 restart cloudflared` 1차 조치, v2 스크립트 기준 |
| `02-architecture/01-adr-log.md` | ADR-001~018 전체, 특히 ADR-007(Auth Advanced), ADR-013(Observability), ADR-015(Operations) |

### Z.2 실전 교훈 인용 (세션 25-B/C)

| 교훈 번호 | 출처 세션 | 내용 | 반영 게이트 |
|---------|---------|------|-----------|
| L-1 | 25-B | `pm2 restart cloudflared` 후 30~40초 Cloudflare edge propagation 대기 필수 | CG-0-3, P16-X-5 |
| L-2 | 25-C | "200 비율"≠"edge 관통 비율". `/login`(공개 라우트) 기준 측정, 5xx만 실패 | CG-0-3 |
| L-3 | 25-C | Playwright E2E에 `retries: 2` 적용 → 산발 530 흡수 | P15-X-3, REL-MVP-1 |
| L-4 | 25-C | KT 회선 drop은 완전 소실 아님 → sysctl+HTTP/2로 흡수하나 주기적 v2 스크립트 검증 필요 | P16-X-5 |
| L-5 | 25-B | QUIC → HTTP/2 전환 (30%→50%), sysctl 조합으로 100% 달성 | CG-0-3 배경 |

### Z.3 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent R3 (Wave 5) | 최초 작성 — Phase 15~22 게이트 16개 + 릴리스 9개 + NFR 매트릭스 + No-Go 프로토콜 |

---

> **Go / No-Go 체크리스트 끝.** Wave 5 · R3 · 2026-04-18 · Phase 15~22 Entry/Exit 16 게이트 + 릴리스 9 게이트 + NFR 38건 매트릭스 + No-Go 4단계 프로토콜
