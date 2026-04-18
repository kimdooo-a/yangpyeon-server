# 02. 마일스톤 계획 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> **Wave 5 · R1 (Roadmap Lead) 산출물 3/3**
> 작성일: 2026-04-18 (세션 28, Wave 5 Tier 1)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [00-roadmap-overview.md](./00-roadmap-overview.md) (상위) · [01-release-plan.md](./01-release-plan.md) (병렬)

---

## 1. 마일스톤 목록 요약표 (M1~M16)

Phase 15~22 총 8개 Phase를 각 2개 마일스톤으로 세분화 = **16 마일스톤**. 각 마일스톤은 **2~4주 구간의 명확한 검증 기준**을 갖는다.

| M# | 이름 | 타겟 주차 | Phase | 산출물 | 검증 기준 | 연관 릴리스 |
|----|------|--------|-------|-------|---------|-----------|
| M1 | MFA Server | Week 2 | 15 | TOTP + WebAuthn 서버 로직 | 단위 테스트 100%, DB 마이그 통과 | v0.1.0-alpha.0 (internal) |
| M2 | MFA Complete | Week 4 | 15 | UI + Rate Limit + 감사 로그 | Playwright E2E MFA 전 플로우 | **v0.1.0-alpha.1** |
| M3 | Vault Live | Week 7 | 16 | VaultService + MASTER_KEY | 시크릿 평문 제로 검증 | v0.2.0-alpha.2-pre |
| M4 | Ops Ready | Week 10 | 16 | JWKS + Capistrano + 5초 롤백 | Canary 배포 통과, 롤백 드릴 성공 | **v0.2.0-alpha.2** |
| M5 | Auth Core Done | Week 14 | 17 | Session + JWT 회전 + Anonymous | 로그인 p95 <1s, E2E 통과 | v0.3.0-rc (MVP-pre) |
| M6 | Storage Live (MVP) | Week 18 | 17 | SeaweedFS + B2 오프로드 | 50GB 부하 테스트 통과 | **v0.3.0 (MVP/Alpha)** |
| M7 | SQL Editor Foundation | Week 24 | 18 | Monaco + BEGIN READ ONLY + 히스토리 | SQL p95 <500ms | v0.4.0-beta.1 |
| M8 | SQL+Table Editor Complete | Week 34 | 18 | AI 보조 + Plan Viz + CSV import | WCAG 2.2 AA 감사 통과 | **v0.4.3-beta.4** |
| M9 | Edge Functions L1 | Week 38 | 19 | isolated-vm Layer 1 안정 | decideRuntime P0 라우팅 통과 | v0.5.0-beta.2 |
| M10 | Edge+Realtime Complete | Week 42 | 19 | L2 Deno + CDC + Channel | Realtime 100 동시 구독 부하 | **v0.5.0 (Beta)** |
| M11 | Schema+DB Ops | Week 43 | 20 | @xyflow ERD + node-cron + wal-g | 복구 드릴 RTO <30분 | v0.6.0-rc.1-pre |
| M12 | Advisors 3-Layer | Week 44 | 20 | schemalint + squawk + splinter | P0 12룰 PR 차단 동작 | **v0.6.0-rc.1** |
| M13 | Data API | Week 45 | 21 | REST + pgmq + Outbox | 1000 TPS 처리 | v0.9.0-rc.2-pre |
| M14 | UX Quality | Week 46 | 21 | AI Studio + MCP + BYOK | 응답 <3s | **v0.9.0-rc.2** |
| M15 | Hardening | Week 48 | 22 | Prisma 마이그 19 + NFR 검증 | NFR 38 전수 충족 | v1.0.0-rc |
| M16 | GA | Week 50 | 22 | 전 기능 100점 | 가중평균 100점 달성 | **v1.0.0 (Centurion)** |

---

## 2. 마일스톤 상세

### 2.1 M1: MFA Server (Week 2)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-05-02 (Week 2 말) |
| **Phase** | 15 (Auth Advanced MVP) |
| **목적** | TOTP와 WebAuthn 서버 로직을 완성하여 MFA 백엔드 기반 확립 |
| **산출물** | `src/lib/auth/advanced/TOTPService.ts`, `src/lib/auth/advanced/WebAuthnService.ts`, Prisma 마이그 2개 (totp_secrets, webauthn_credentials) |
| **검증 기준** | 1) 단위 테스트 100% / 2) `prisma migrate dev` 성공 / 3) `@simplewebauthn/server` 7.x 기본 플로우 샘플 요청 성공 |
| **의존성** | 선행 없음 (Phase 15 시작점) |
| **리스크** | `@simplewebauthn/server` API 변경 — 완화: 버전 lock + Phase 22 재검토 |
| **연관 DQ** | DQ-AA-8(revokedAt+tokenFamily, Wave 4 확정), DQ-AC-2(Session 인덱스 — Phase 17로 이연) |
| **연관 ADR** | ADR-007 (구현 시작) |

#### 2.1.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T1-1 | Prisma 스키마 추가 (totp_secrets: id, userId, secretCipher, backupCodes, createdAt) | 1h | — |
| T1-2 | Prisma 스키마 추가 (webauthn_credentials: id, userId, credentialId, publicKey, counter, transports) | 1h | T1-1 |
| T1-3 | TOTPService.generateSecret(), .verifyCode() 구현 (otplib) | 2h | T1-1 |
| T1-4 | WebAuthnService.generateRegistrationOptions(), .verifyRegistrationResponse() (SimpleWebAuthn) | 3h | T1-2 |
| T1-5 | WebAuthnService.generateAuthenticationOptions(), .verifyAuthenticationResponse() | 3h | T1-4 |
| T1-6 | 단위 테스트 (vitest): TOTP drift tolerance, WebAuthn payload validation | 2h | T1-3, T1-5 |

**총 공수**: 12h (Phase 15 전체 22h 중 55%)

---

### 2.2 M2: MFA Complete (Week 4)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-05-16 (Week 4 말) |
| **Phase** | 15 |
| **목적** | MFA UI + Rate Limit + 감사 로그까지 완성하여 v0.1.0-alpha.1 릴리스 |
| **산출물** | `app/settings/security/page.tsx`, `app/auth/mfa-verify/page.tsx`, `src/lib/auth/rate-limit/RateLimitService.ts`, Prisma 마이그 2개 (rate_limits, backup_codes), `docs/handover/YYYY-MM-16-release-v0.1.0.md` |
| **검증 기준** | 1) Playwright E2E: 로그인→TOTP 등록→로그아웃→재로그인→TOTP 검증 / 2) Playwright E2E: WebAuthn 등록→Passkey 인증 / 3) Rate Limit 10회 시도 차단 확인 / 4) 감사 로그 4개 이벤트 기록 확인 |
| **의존성** | M1 완료 |
| **리스크** | Safari WebAuthn 호환 — 완화: Chrome/Firefox 우선 검증 + Safari는 Phase 22 재검증 |
| **연관 DQ** | DQ-AA-1, DQ-AA-2, DQ-AA-4(백업 코드 8개 확정), DQ-AA-5, DQ-AA-6, DQ-AA-7 |
| **연관 ADR** | ADR-007 (Accepted 유지) |

#### 2.2.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T2-1 | MFA 설정 페이지 (/settings/security) — TOTP QR 코드 + 백업 코드 8개 | 2h | M1 |
| T2-2 | MFA 검증 페이지 (/auth/mfa-verify) — TOTP 입력 + WebAuthn 버튼 | 2h | T2-1 |
| T2-3 | Prisma 스키마 추가 (rate_limits: bucketKey, count, resetAt) | 1h | — |
| T2-4 | RateLimitService.check(), .increment() — 슬라이딩 윈도우 15분 | 3h | T2-3 |
| T2-5 | Rate Limit 미들웨어 (Next.js middleware) 통합 | 2h | T2-4 |
| T2-6 | Prisma 스키마 추가 (backup_codes: hashedCode, used) + 생성/소비 로직 | 1h | — |
| T2-7 | 감사 로그 4이벤트 (mfa_enabled, mfa_disabled, mfa_bypass, rate_limit_triggered) | 2h | M1 |
| T2-8 | Playwright E2E 시나리오 3개 작성 및 통과 | 3h | T2-1~T2-7 |
| T2-9 | 릴리스 노트 v0.1.0-alpha.1 작성 + Git 태그 | 1h | T2-8 |

**총 공수**: 17h (Phase 15 누적 29h 중 22h 내 완료 = 버퍼 흡수)

---

### 2.3 M3: Vault Live (Week 7)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-06-06 (Week 7 말) |
| **Phase** | 16 (Observability) |
| **목적** | VaultService를 완성하여 시크릿 평문 제로를 달성 + MFA 시드 마이그레이션 |
| **산출물** | `src/lib/vault/VaultService.ts`, `src/lib/vault/envelope.ts`, `/etc/luckystyle4u/secrets.env` (배포 생성), Prisma 마이그 `vault_secrets`, `src/scripts/migrate-mfa-seeds-to-vault.ts` |
| **검증 기준** | 1) `node:crypto` AES-256-GCM envelope 단위 테스트 통과 / 2) MASTER_KEY 권한 0640 검증 / 3) MFA 시드 마이그레이션 성공 (N명 사용자 전수) / 4) **DQ-4.1 PM2 cluster 모드 확정** — spike-010 결과 반영 |
| **의존성** | M2 완료 |
| **리스크** | KEK 회전 중 일시적 서비스 중단 가능성 — 완화: 3분 grace 정책 (DQ-1.19, Wave 4 확정) |
| **연관 DQ** | DQ-12.3(MASTER_KEY 위치 = `/etc/luckystyle4u/secrets.env`, 확정), **DQ-4.1(cluster 결정 확정)**, DQ-12.4(JWKS 캐시), DQ-12.8(감사), DQ-12.14(alg 검증) |
| **연관 ADR** | ADR-013 (구현 시작), ADR-015 (cluster 모드) |

#### 2.3.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T3-1 | Prisma 스키마 추가 (vault_secrets: id, name, dekCipher, kekVersion, createdAt, rotatedAt) | 1h | — |
| T3-2 | envelope.ts: encrypt(plaintext, kek) → {ciphertext, iv, tag, dek_wrapped} | 2h | T3-1 |
| T3-3 | VaultService.set(name, plaintext), .get(name) | 3h | T3-2 |
| T3-4 | VaultService.rotateKEK() — 90일 주기, 3분 grace | 2h | T3-3 |
| T3-5 | MASTER_KEY 로딩 (PM2 `env_file`) + 권한 0640 배포 스크립트 | 2h | T3-3 |
| T3-6 | MFA 시드 마이그레이션 스크립트 (totp_secrets.secretCipher 업데이트) | 2h | T3-5, M2 |
| T3-7 | Vault 감사 로그 (set/get/rotate 이벤트) | 1h | T3-3 |
| T3-8 | spike-010 pgmq 결과 반영 → DQ-4.1 PM2 cluster 확정 (cluster:4 유지 결정) | 1h | — |
| T3-9 | 단위 테스트 + 통합 테스트 | 2h | T3-3~T3-7 |

**총 공수**: 16h

---

### 2.4 M4: Ops Ready (Week 10)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-06-27 (Week 10 말) |
| **Phase** | 16 (Operations) |
| **목적** | JWKS 엔드포인트 + Capistrano-style 배포 + 5초 롤백 완성하여 v0.2.0-alpha.2 릴리스 |
| **산출물** | `app/.well-known/jwks.json/route.ts`, `ecosystem.config.js` (cluster:4), `scripts/capistrano-deploy.sh`, `scripts/rollback.sh`, `cloudflare-worker/traffic-split.ts` |
| **검증 기준** | 1) `/.well-known/jwks.json` 응답 ES256 키 / 2) canary 3일 10%→50% 전환 성공 / 3) 5초 롤백 드릴 성공 (실측 ≤5s) / 4) `/api/health` JSON 응답 |
| **의존성** | M3 완료 |
| **리스크** | Cloudflare Worker 트래픽 분할 오작동 — 완화: 로컬 WebSocket 테스트 후 프로덕션 배포 |
| **연관 DQ** | DQ-1.19(JWKS grace 3분), **DQ-OPS-3(Node 버전 고정 = .nvmrc + release 격리)**, DQ-OPS-4(DR 호스트 — Phase 22+) |
| **연관 ADR** | ADR-015 (구현 시작) |

#### 2.4.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T4-1 | `jose` JWKS ES256 키쌍 생성 + `vault_secrets`에 저장 | 2h | M3 |
| T4-2 | `/.well-known/jwks.json` 엔드포인트 구현 (3분 grace) | 2h | T4-1 |
| T4-3 | PM2 ecosystem.config.js cluster:4 + env_file | 1h | — |
| T4-4 | Capistrano release 디렉토리 구조 (current/previous/releases/YYYYMMDD_HHMMSS) | 3h | T4-3 |
| T4-5 | 배포 스크립트 (capistrano-deploy.sh): release 생성 + 심링크 업데이트 + PM2 reload | 3h | T4-4 |
| T4-6 | 5초 롤백 스크립트 + 드릴 검증 | 2h | T4-5 |
| T4-7 | Cloudflare Worker cf-ray 해시 분기 구현 + 배포 | 3h | — |
| T4-8 | `/api/health` 엔드포인트 + 자동 롤백 트리거 (p95/5xx/crash) | 2h | T4-6 |
| T4-9 | 릴리스 노트 v0.2.0-alpha.2 + Git 태그 | 1h | T4-8 |

**총 공수**: 19h

---

### 2.5 M5: Auth Core Done (Week 14)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-07-25 (Week 14 말) |
| **Phase** | 17 (Auth Core) |
| **목적** | Session/JWT 회전/Anonymous role 완성 |
| **산출물** | `src/lib/auth/core/SessionService.ts`, `src/lib/auth/core/JWTService.ts`, Prisma 마이그 (user_sessions, token_families), `app/middleware.ts` (RLS 컨텍스트) |
| **검증 기준** | 1) 로그인 p95 <1s (100 동시) / 2) Session 디바이스별 종료 가능 / 3) Anonymous role 특정 URL만 접근 / 4) JWT 회전 시 token_family 체인 검증 |
| **의존성** | M4 완료 (JWKS) |
| **리스크** | bcrypt cost 12 성능 — 완화: 100 동시 요청 벤치마크 > 2000ms 시 cost 10으로 완화 (DQ-AC-1 트리거) |
| **연관 DQ** | **DQ-AC-2(Session 인덱스 — SQLite 보조 채택 또는 PG 복합 인덱스 확정)**, DQ-AC-1(argon2 Phase 22 이연) |
| **연관 ADR** | ADR-006 (Accepted), ADR-017(OAuth Phase 18+ 조건부) |

#### 2.5.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T5-1 | Prisma 스키마 (user_sessions, token_families) 추가 | 2h | — |
| T5-2 | SessionService.create(), .validate(), .revoke(), .revokeAll() | 4h | T5-1 |
| T5-3 | JWTService.sign() (ES256) + .verify() + tokenFamily 체인 | 4h | T5-1, M4 |
| T5-4 | Refresh token 회전 (revokedAt + new family) | 3h | T5-3 |
| T5-5 | RLS 컨텍스트 미들웨어 (`ypb_user_id` 세션 변수) | 3h | T5-2 |
| T5-6 | Anonymous role — 특정 URL 패턴 매칭 (/public/*) | 3h | T5-5 |
| T5-7 | 비밀번호 재설정 + 이메일 인증 토큰 | 3h | T5-2 |
| T5-8 | E2E: 로그인→디바이스별 세션 종료→재로그인 | 2h | T5-4, T5-6 |

**총 공수**: 24h (Phase 17 Auth Core 파트 30h 중 80%)

---

### 2.6 M6: Storage Live / MVP 완성 (Week 18)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-08-22 (Week 18 말) |
| **Phase** | 17 (Storage) + **MVP 완성** |
| **목적** | SeaweedFS + B2 오프로드 완성 → Alpha/MVP 선언 |
| **산출물** | `src/lib/storage/StorageService.ts`, `src/lib/storage/B2Offloader.ts`, `app/storage/page.tsx` (버킷 관리 UI), `docker-compose.seaweedfs.yml`, **MVP 선언 커밋** |
| **검증 기준** | 1) 50GB 부하 테스트 통과 (spike-007 결과 검증) / 2) 파일 업로드 10MB <3s / 3) B2 Hot→Cold 자동 이동 (7일 TTL) / 4) **MVP 체크리스트 12건 달성** (`01-release-plan.md §5.1`) |
| **의존성** | M5 완료 (Session 권한) |
| **리스크** | SeaweedFS 50GB 메모리 사용 — 완화: spike-007 사전 검증 후 Phase 17 착수 |
| **연관 DQ** | DQ-1.15(50GB 부하), DQ-1.16(B2 오프로드), DQ-1.17(tus resumable — Phase 22 이연) |
| **연관 ADR** | ADR-008 (Accepted) |

#### 2.6.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T6-1 | SeaweedFS 단일 인스턴스 docker-compose 구성 + WSL2 배포 | 3h | — |
| T6-2 | StorageService.upload(), .download(), .delete() (S3 호환 API) | 6h | T6-1 |
| T6-3 | SignedURL 생성 (HMAC-SHA256, TTL 15분) | 2h | T6-2 |
| T6-4 | 버킷 관리 UI (/storage) — Admin 전용 | 4h | T6-2 |
| T6-5 | B2Offloader (Backblaze B2 SDK) — Hot 7일 경과 자동 마이그 | 6h | T6-2 |
| T6-6 | spike-007 결과 반영: 50GB 부하 테스트 실행 + 메모리 < 1GB 검증 | 3h | T6-1 |
| T6-7 | 사용량 대시보드 (per 버킷 GB + API 호출 수) | 3h | T6-4 |
| T6-8 | MVP 선언 커밋 + CLAUDE.md 업데이트 + 릴리스 노트 v0.3.0 | 3h | T6-7 |

**총 공수**: 30h

---

### 2.7 M7: SQL Editor Foundation (Week 24)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-10-03 (Week 24 말) |
| **Phase** | 18 (SQL Editor 14c-γ) |
| **목적** | Monaco + BEGIN READ ONLY + 쿼리 히스토리 완성 |
| **산출물** | `src/components/editor/MonacoEditor.tsx`, `src/lib/sql/readonly-wrapper.ts`, `app/sql-editor/page.tsx`, Prisma 마이그 (sql_snippets, sql_history) |
| **검증 기준** | 1) SQL p95 <500ms (10만행 EXPLAIN) / 2) 읽기 전용 래퍼 `BEGIN READ ONLY` 자동 적용 확인 / 3) 히스토리 최근 100개 쿼리 저장 |
| **의존성** | M6 완료 (Auth Core Session) |
| **리스크** | Monaco 번들 크기 (1MB+) — 완화: dynamic import + 초기 청크 분리 |
| **연관 DQ** | DQ-2.4(SQL editor AI 비용 가드 — Phase 14e), DQ-2.5(Plan Visualizer — 14f), DQ-2.6(스키마 토큰) |
| **연관 ADR** | ADR-003 (구현) |

#### 2.7.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T7-1 | Monaco Editor 통합 + dynamic import | 8h | M6 |
| T7-2 | BEGIN READ ONLY wrapper + app_readonly role | 4h | T7-1 |
| T7-3 | SQL 실행 API (타임아웃 30s + 결과 10만행 제한) | 16h | T7-2 |
| T7-4 | Prisma 스키마 추가 (sql_snippets: id, folderPath, name, sql) | 2h | — |
| T7-5 | 스니펫 관리 UI — 폴더 트리 + 저장/편집/삭제 | 24h | T7-4 |
| T7-6 | Prisma 스키마 추가 (sql_history) + 최근 100개 저장 | 2h | — |
| T7-7 | 실행 버튼 + 결과 테이블 렌더링 (TanStack Table) | 12h | T7-3 |
| T7-8 | 편집 락 (다중 탭) — DQ-SQL 답변 | 4h | T7-5 |
| T7-9 | 읽기 전용 모드 토글 (ADMIN만) | 4h | T7-3 |
| T7-10 | E2E: SQL 작성→실행→결과 CSV 다운로드 | 4h | T7-7 |
| T7-11 | Playwright 테스트 + 성능 벤치마크 | 4h | T7-10 |

**총 공수**: 84h (SQL Editor 320h 중 26%)

> SQL Editor는 14c-γ에서 14f까지 4단계로 나뉘므로 M7은 14c-γ 완료 지점. 나머지는 M8에서 포괄.

---

### 2.8 M8: SQL + Table Editor Complete (Week 34)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2026-12-12 (Week 34 말) |
| **Phase** | 18 완성 |
| **목적** | SQL(14d/14e/14f) + Table Editor(14c-β/14d) 완성 |
| **산출물** | `src/components/editor/AiAssist.tsx`, `src/components/editor/PlanVisualizer.tsx`, `src/components/table/TableEditor.tsx`, `src/lib/sql/csv-export.ts`, `src/components/form/FkSelector.tsx` (cmdk) |
| **검증 기준** | 1) AI 보조 응답 <3s (Haiku) + BYOK 비용 가드 $1/월 / 2) Plan Visualizer d3 렌더 <500ms / 3) Table 1만행 렌더 <500ms / 4) CSV 10MB import <3s / 5) WCAG 2.2 AA 감사 통과 |
| **의존성** | M7 완료 |
| **리스크** | AI SDK v6 비용 초과 — 완화: 비용 가드 (sonner 토스트 + 차단) |
| **연관 DQ** | DQ-1.10(가상 스크롤 — 14e), DQ-1.11(Papa Parse — 확정), DQ-1.12(cmdk FK — 확정), DQ-2.1~2.3(Table), DQ-2.4(AI 비용 가드) |
| **연관 ADR** | ADR-002, ADR-003 |

#### 2.8.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T8-1 | SQL sql-formatter 통합 (14d) | 16h | M7 |
| T8-2 | Auto-complete 스키마 토큰 인덱서 (14d) | 40h | T8-1 |
| T8-3 | AI 보조 + Anthropic Haiku BYOK (14e) | 80h | T8-2 |
| T8-4 | Plan Visualizer 자체 d3 (14f) | 40h | T8-3 |
| T8-5 | Table Editor TanStack v8 베이스 (14c-β) | 8h | M7 |
| T8-6 | RLS 정책 UI + CRUD 모달 + Zod | 32h | T8-5 |
| T8-7 | Papa Parse CSV import (14d) + 100행 dry-run | 16h | T8-6 |
| T8-8 | cmdk FK Selector (14d) | 8h | T8-6 |
| T8-9 | WCAG 2.2 AA 감사 + 수정 | 16h | T8-4, T8-8 |
| T8-10 | 릴리스 노트 v0.4.3-beta.4 + Git 태그 | 4h | T8-9 |

**총 공수**: 260h (Phase 18 잔여 400h - 84h M7 - 56h M7 포함 = 260h)

> 실제 Phase 18 = SQL 320h + Table 80h = 400h. M7(~84h) + M8(~260h) + 버퍼 ~56h.

---

### 2.9 M9: Edge Functions L1 (Week 38)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-01-09 (Week 38 말) |
| **Phase** | 19 (Edge Functions) |
| **목적** | isolated-vm Layer 1 단독 배포 + decideRuntime() P0 라우팅 |
| **산출물** | `src/lib/edge/isolated-vm/runtime.ts`, `src/lib/edge/decideRuntime.ts`, `app/edge-functions/page.tsx`, Prisma 마이그 (edge_functions, edge_invocations) |
| **검증 기준** | 1) decideRuntime() P0 조건 (CPU <100ms, 메모리 <32MB) 라우팅 테스트 100% / 2) Layer 1 Edge Fn 100개 배포 + 실행 성공 / 3) 자동 폴백 (Layer 1 실패 시 `503`) |
| **의존성** | M8 완료 (SQL Editor로 Edge Fn 관리 UI 연결) + spike-005 완료 |
| **리스크** | isolated-vm v6 API 변경 — 완화: 버전 lock + Phase 22 재검토 |
| **연관 DQ** | DQ-1.12~14(보안 한계, Deno 포트, Sandbox 비용 가드) |
| **연관 ADR** | ADR-009 (구현 시작) |

#### 2.9.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T9-1 | Prisma 스키마 (edge_functions: id, name, code, layer, config) | 2h | — |
| T9-2 | Prisma 스키마 (edge_invocations: functionId, requestId, durationMs, cpuMs, outcome) | 2h | — |
| T9-3 | decideRuntime(req) — P0 조건 평가 (CPU/메모리 예측 통계 기반) | 6h | — |
| T9-4 | isolated-vm v6 Runtime 구현 (최대 100ms, 32MB 격리) | 8h | T9-1 |
| T9-5 | Edge Fn 관리 UI (/edge-functions) — 목록/생성/삭제/로그 | 4h | T9-4 |
| T9-6 | 자동 폴백 (Layer 1 실패 → 503 + Sentry 이벤트) | 2h | T9-4 |
| T9-7 | 단위 테스트 + 부하 테스트 (100 Edge Fn 배포) | 3h | T9-4 |

**총 공수**: 27h (Phase 19 Edge 40h 중 67%)

---

### 2.10 M10: Edge + Realtime Complete (Week 42)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-02-06 (Week 42 말) |
| **Phase** | 19 완성 / **Beta 선언** |
| **목적** | L2 Deno + Realtime CDC/Channel + presence 완성 |
| **산출물** | `src/lib/edge/deno-sidecar/runtime.ts`, `src/lib/realtime/cdc/wal2jsonConsumer.ts`, `src/lib/realtime/channel/ChannelService.ts`, `app/realtime/page.tsx`, Prisma 마이그 (realtime_channels, realtime_subscriptions) |
| **검증 기준** | 1) L2 Deno 라우팅 동작 + npm: 패키지 로딩 검증 / 2) CDC latency <200ms / 3) Channel 100 동시 구독 부하 통과 / 4) presence_diff 이벤트 작동 |
| **의존성** | M9 완료 + spike-008 완료 |
| **리스크** | wal2json PostgreSQL 버전 호환 — 완화: spike-008 PG 14/15/16 매트릭스 검증 |
| **연관 DQ** | **DQ-RT-3(presence_diff 이벤트 확정)**, DQ-RT-4, DQ-RT-6(PG 18 업그레이드 — Phase 22) |
| **연관 ADR** | ADR-009, ADR-010 |

#### 2.10.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T10-1 | Deno 사이드카 runtime (WebSocket IPC) | 5h | M9 |
| T10-2 | decideRuntime() P1 조건 추가 (npm: 패키지 필요 시 L2) | 3h | T10-1 |
| T10-3 | PG 2개 replication slot 구성 (logical_repl + audit_repl) | 3h | — |
| T10-4 | wal2json consumer — event bus 큐 발행 | 6h | T10-3 |
| T10-5 | Prisma 스키마 (realtime_channels, realtime_subscriptions) | 2h | — |
| T10-6 | ChannelService.subscribe(), .unsubscribe(), .broadcast() | 8h | T10-5 |
| T10-7 | presence_diff 이벤트 구현 (DQ-RT-3 답변) | 4h | T10-6 |
| T10-8 | Realtime UI (/realtime) — 채널 관리 + 구독 모니터링 | 4h | T10-6 |
| T10-9 | 백프레셔: 큐 사이즈 > 1000 시 1초 지연 | 2h | T10-7 |
| T10-10 | Playwright E2E: 채널 생성→구독→이벤트 수신→해지 | 3h | T10-7 |
| T10-11 | 릴리스 노트 v0.5.0 Beta + Git 태그 | 2h | T10-10 |

**총 공수**: 42h (Phase 19 잔여 48h 중 42h = 내림)

> Phase 19 = 40h Edge + 35h Realtime = 75h. M9(27h) + M10(42h) = 69h. 잔여 6h는 버퍼로 흡수.

---

### 2.11 M11: Schema + DB Ops (Week 43)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-02-13 (Week 43 말) |
| **Phase** | 20 (전반) |
| **목적** | Schema Viz ERD + DB Ops (Cron, Webhook, Backup) 완성 |
| **산출물** | `src/components/schema/ErdViewer.tsx` (@xyflow), `app/database/policies/page.tsx`, `app/database/functions/page.tsx`, `app/database/triggers/page.tsx`, `src/lib/cron/scheduler.ts` (node-cron), `src/lib/backup/wal-g.ts` |
| **검증 기준** | 1) 100+ 테이블 렌더 <3s / 2) Cron 매 15분 실행 7일 연속 / 3) wal-g 복원 드릴 RTO <30분 / 4) RPO 60s 검증 (archive_timeout=60s) |
| **의존성** | M10 완료 (Realtime CDC 이벤트가 Advisors에 공급) + M8 (Table Editor RLS UI 재사용) |
| **리스크** | wal-g 복원 속도 미실측 — 완화: DQ-4.22 첫 복원 후 보정 |
| **연관 DQ** | **DQ-4.1(cluster 확정)**, DQ-4.2(pg_cron 재검토 — 미채택 유지), DQ-4.3(BullMQ — 미채택 유지), **DQ-4.22(복원 속도 실측)** |
| **연관 ADR** | ADR-004, ADR-005 |

#### 2.11.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T11-1 | @xyflow + elkjs ERD 뷰어 (100+ 테이블 lazy loading) | 16h | M8 |
| T11-2 | /database/policies UI (RLS 정책 목록 + Table Editor 재사용) | 12h | T11-1 |
| T11-3 | /database/triggers + /database/functions 페이지 | 18h | T11-1 |
| T11-4 | 레이아웃 저장 (per-user `ERDLayout` 테이블) — DQ-3.4 | 4h | T11-1 |
| T11-5 | node-cron Scheduler + DB-backed jobs | 16h | — |
| T11-6 | Webhook 등록 + retry (exponential backoff) | 10h | T11-5 |
| T11-7 | wal-g 백업 자동화 (일 1회 풀 + 연속 WAL) | 16h | — |
| T11-8 | PITR 복원 UI + 드릴 문서 | 9h | T11-7 |
| T11-9 | archive_timeout=60s 설정 + RPO/RTO 대시보드 | 4h | T11-7 |
| T11-10 | Advisory lock + 실패 잡 90일 보관 | 9h | T11-5 |

**총 공수**: 114h (Schema 50h + DB Ops 68h = 118h에서 최적화 4h)

---

### 2.12 M12: Advisors 3-Layer (Week 44)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-02-20 (Week 44 말) |
| **Phase** | 20 완성 |
| **목적** | 3-Layer Advisors (schemalint + squawk + splinter 포팅) 완성 |
| **산출물** | `src/lib/advisors/schemalint/runner.ts`, `src/lib/advisors/squawk/runner.ts`, `src/lib/advisors/splinter/rules/*.ts` (38개), `app/advisors/page.tsx` |
| **검증 기준** | 1) P0 12룰 PR 차단 동작 / 2) P1 17룰 경고 표시 / 3) splinter 38룰 전수 포팅 (PL/pgSQL → TS) / 4) Advisor 결과 UI 렌더 |
| **의존성** | M11 완료 |
| **리스크** | splinter 38룰 포팅 완성도 — 완화: P0 12룰 Phase 20 완료, P1/P2는 Phase 22로 이연 가능 |
| **연관 DQ** | **DQ-ADV-1(PG 마이그 — Phase 22 이연)**, DQ-ADV-5, DQ-ADV-7 |
| **연관 ADR** | ADR-011 |

#### 2.12.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T12-1 | Core 인프라: AdvisorRunner + RuleRegistry | 20h | — |
| T12-2 | Layer 1 schemalint 통합 (CLI 래퍼) | 8h | T12-1 |
| T12-3 | Layer 2 squawk 통합 (CLI 래퍼) | 8h | T12-1 |
| T12-4 | Layer 3 splinter 38룰 TS 포팅 — P0 12룰 우선 | 20h | T12-1 |
| T12-5 | splinter P1 17룰 + P2 9룰 (Phase 22 이연 가능) | 10h | T12-4 |
| T12-6 | Advisor UI (/advisors) + PR 차단 훅 (GitHub Actions) | 14h | T12-4 |
| T12-7 | 릴리스 노트 v0.6.0-rc.1 + Git 태그 | 2h | T12-6 |

**총 공수**: 82h (Advisors 80h에서 +2h 버퍼 내 흡수)

---

### 2.13 M13: Data API (Week 45)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-02-27 (Week 45 말) |
| **Phase** | 21 (전반) |
| **목적** | REST + pgmq + Outbox 패턴 완성 |
| **산출물** | `src/lib/api/rest/openapi.ts`, `src/lib/queue/pgmq.ts`, `src/lib/queue/outbox.ts`, `src/lib/queue/sqlite-buffer.ts`, `app/api/docs/page.tsx` |
| **검증 기준** | 1) OpenAPI 3.1 자동 생성 / 2) pgmq 1000 TPS 처리 / 3) Outbox 트랜잭션 일관성 E2E / 4) 오프라인 SQLite 보조 큐 대체 동작 |
| **의존성** | M10 완료 (Realtime CDC → Data API 구독), M12 (Advisors 스키마 검증) |
| **리스크** | pg_graphql 수요 트리거 미충족 — 완화: ADR-016 조건 충족 시 Phase 22 이연 |
| **연관 DQ** | DQ-1.25~1.34 (GraphQL 조건부) |
| **연관 ADR** | ADR-012, ADR-016 (재평가) |

#### 2.13.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T13-1 | OpenAPI 3.1 스펙 자동 생성 (Prisma DMMF 기반) | 8h | — |
| T13-2 | pgmq 확장 설치 + `q_publish`/`q_read` 래퍼 | 8h | — |
| T13-3 | Outbox 패턴 (트랜잭션 내 메시지 발행) | 5h | T13-2 |
| T13-4 | SQLite 보조 큐 (WSL2 오프라인 대비) | 4h | T13-2 |
| T13-5 | ADR-016 수요 트리거 재평가 (4개 조건 체크) | 2h | — |
| T13-6 | pg_graphql 조건부 도입 (수요 2+ 시만) | +20h (조건부) | T13-5 |

**총 공수**: 25h (조건부 pg_graphql 제외)

---

### 2.14 M14: UX Quality (Week 46)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-03-06 (Week 46 말) |
| **Phase** | 21 완성 |
| **목적** | AI Studio Assistant + MCP 도구 + BYOK 완성 |
| **산출물** | `app/dashboard/assistant/page.tsx`, `src/lib/ai/mcp-luckystyle4u/server.ts`, `src/lib/ai/anthropic-byok.ts` |
| **검증 기준** | 1) AI 응답 <3s (Haiku) / 2) MCP 도구 호출 작동 / 3) BYOK 키 비용 가드 $1/월 초과 시 차단 |
| **의존성** | M13 완료 |
| **리스크** | Anthropic SDK 변경 — 완화: v6.x lock |
| **연관 DQ** | DQ-UX-1~3, **DQ-AI-1(BYOK 저장 = Vault), DQ-AI-2(MCP 도구 범위)** |
| **연관 ADR** | ADR-014 |

#### 2.14.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T14-1 | Vercel AI SDK v6 통합 + `/dashboard/assistant` | 4h | M13 |
| T14-2 | Anthropic BYOK 키 관리 (Vault 저장) | 2h | T14-1 |
| T14-3 | 자체 MCP `mcp-luckystyle4u` 서버 구현 (3개 도구: query-schema, list-tables, run-readonly) | 3h | T14-2 |
| T14-4 | 페이지별 AI 임베드 (sql-editor, table-editor) | 2h | T14-1 |
| T14-5 | 대화 히스토리 (sqlite `ai_chats` 테이블) | 2h | — |
| T14-6 | BYOK 비용 가드 ($1/월, 토스트 + 차단) | 2h | T14-2 |
| T14-7 | 릴리스 노트 v0.9.0-rc.2 + Git 태그 | 2h | T14-6 |

**총 공수**: 17h (UX 15h + 릴리스 작업 2h)

---

### 2.15 M15: Hardening (Week 48)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-03-20 (Week 48 말) |
| **Phase** | 22 (전반) |
| **목적** | Prisma 마이그 19개 통합 + STRIDE 재검증 + NFR 38 전수 검증 |
| **산출물** | `prisma/migrations/` 19개 down 스크립트 완비, `docs/reports/stride-revalidation.md`, `docs/reports/nfr-coverage.md` |
| **검증 기준** | 1) 19개 마이그 전수 up+down 성공 / 2) STRIDE 34 위협 TOP 10 완화 재검증 / 3) NFR 38 전수 충족 자동 테스트 |
| **의존성** | M14 완료 |
| **리스크** | 마이그 down 스크립트 일부 파괴적 — 완화: 프로덕션 데이터 스냅샷 + 검토 |
| **연관 DQ** | **DQ-AA-3(FIDO MDS), DQ-AA-9(Conditional UI), DQ-1.13(AG Grid), DQ-1.14(Enterprise)** 재검토 |
| **연관 ADR** | ADR-018 최종 Accepted |

#### 2.15.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T15-1 | 19개 마이그 검토 + down 스크립트 보정 | 12h | M14 |
| T15-2 | STRIDE 34 재검증 (TOP 10 완화 확인) | 4h | — |
| T15-3 | NFR 38 자동 테스트 작성 + 수동 검증 | 4h | — |
| T15-4 | FIDO MDS 통합 (DQ-AA-3 답변) | +10h (선택) | — |
| T15-5 | WebAuthn Conditional UI (DQ-AA-9) | +5h (선택) | T15-4 |
| T15-6 | 외부 운영자 리뷰 수렴 | 3h | — |

**총 공수**: 23h (선택 기능 포함 시 38h)

---

### 2.16 M16: GA (Week 50)

| 항목 | 값 |
|------|-----|
| **타겟 일자** | 2027-04-03 (Week 50 말) |
| **Phase** | 22 / **GA 선언** |
| **목적** | v1.0.0 GA 릴리스 |
| **산출물** | Git 태그 `v1.0.0`, `docs/handover/YYYY-MM-DD-ga-v1.0.0.md`, CLAUDE.md 업데이트, CHANGELOG.md 최종, `_CHECKPOINT_KDYWAVE.md wave_5_completed + ga_declared` |
| **검증 기준** | 1) 14 카테고리 전부 90점 이상 / 2) 가중평균 100점 / 3) 3년 TCO 절감 $950~2,150 실측 검증 / 4) canary 14일 0 crash / 5) 모든 ADR Accepted 최종화 |
| **의존성** | M15 완료 + canary 14일 관측 |
| **리스크** | 관측 중 크리티컬 버그 발견 — 완화: 핫픽스 v1.0.1로 우회 |
| **연관 DQ** | 모든 Wave 5 16건 해결 확인 |

#### 2.16.1 세부 태스크

| 태스크 ID | 내용 | 공수 | 선행 |
|---------|-----|-----|-----|
| T16-1 | canary 14일 관측 지표 분석 | 2h | M15 |
| T16-2 | 14 카테고리 점수 재측정 (100점 매트릭스) | 4h | M15 |
| T16-3 | 3년 TCO 실측 검증 (운영비 $0~10/월 확인) | 2h | — |
| T16-4 | production 100% 전환 | 1h | T16-1 |
| T16-5 | v1.0.0 Git 태그 + 릴리스 노트 "50주 회고" | 2h | T16-4 |
| T16-6 | CLAUDE.md + CHANGELOG.md + _CHECKPOINT 최종 | 2h | T16-5 |
| T16-7 | 인수인계서 `ga-v1.0.0.md` 작성 | 1h | T16-6 |

**총 공수**: 14h

---

## 3. 크리티컬 패스 분석

### 3.1 크리티컬 패스 정의

프로젝트 전체 50주 중 **가장 긴 의존 체인**. 이 경로의 어떤 마일스톤도 지연되면 GA 일정 전체가 지연된다.

### 3.2 크리티컬 패스 다이어그램

```
[프로젝트 시작 Week 0]
         │
         ▼
      M1 (Week 2, 12h)
   MFA Server
         │ Playwright E2E 필요
         ▼
      M2 (Week 4, 17h)
   MFA Complete                         ◄── Critical: Phase 15 종료 = Phase 16 시작
         │ MFA 시드 → Vault 마이그
         ▼
      M3 (Week 7, 16h)
   Vault Live
         │ JWKS ES256 → Auth Core JWT
         ▼
      M4 (Week 10, 19h)
   Ops Ready                            ◄── Critical: Phase 16 종료 = Phase 17 시작
         │ Session 권한 체계 전제
         ▼
      M5 (Week 14, 24h)
   Auth Core Done
         │ (Storage는 독립적이지만 MVP 체크리스트 포함)
         ▼
      M6 (Week 18, 30h)
   Storage Live (MVP)                   ◄── Critical: MVP 선언 (122h 누적)
         │ SQL Editor 인증 컨텍스트
         ▼
      M7 (Week 24, 84h)
   SQL Editor Foundation
         │ (14c-γ → 14d/14e/14f 내부)
         ▼
      M8 (Week 34, 260h)
   SQL+Table Editor Complete            ◄── Critical: 400h 최대 단일 Phase
         │ SQL 쿼리 컨텍스트 → Edge Fn 호출
         │ Table RLS UI → Schema Viz 재사용
         ▼
      M9 (Week 38, 27h)
   Edge Functions L1
         │ Edge Fn Layer 1 → L2 Deno
         ▼
      M10 (Week 42, 42h)
   Edge+Realtime Complete               ◄── Critical: Beta 선언
         │ Realtime CDC → Advisors 런타임 룰
         │ Table Editor RLS UI → Schema Viz
         ▼
      M11 (Week 43, 114h)
   Schema+DB Ops
         │ Advisors 인프라 준비
         ▼
      M12 (Week 44, 82h)
   Advisors 3-Layer
         │ Advisors 스키마 검증 → Data API
         ▼
      M13 (Week 45, 25h)
   Data API
         │
         ▼
      M14 (Week 46, 17h)
   UX Quality
         │ 기능 완성 → 하드닝 진입
         ▼
      M15 (Week 48, 23h)
   Hardening
         │ canary 14일 관측
         ▼
      M16 (Week 50, 14h)
   GA                                   ◄── Critical: v1.0.0 선언
```

### 3.3 크리티컬 패스 거리

```
M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11 → M12 → M13 → M14 → M15 → M16
12h + 17h + 16h + 19h + 24h + 30h + 84h + 260h + 27h + 42h + 114h + 82h + 25h + 17h + 23h + 14h
= 806h (크리티컬 패스 순수 공수)

+ 1인 운영 버퍼 20% ≈ 967h
- 병렬 실행 중첩 (~97h 절감) ≈ 870h 실측
```

### 3.4 비크리티컬 (슬랙) 경로

다음 작업은 크리티컬 패스와 병렬 진행 가능 — 지연 여유 (slack) 있음:

| 비크리티컬 작업 | 최대 지연 허용 | 이유 |
|-------------|-----------|------|
| Storage B2 오프로드 (M6) | +1주 | Phase 18 SQL은 B2 불필요 |
| Schema Viz 레이아웃 저장 (M11) | +2주 | ERD 핵심 기능은 유지 |
| splinter P1/P2 룰 (M12) | +4주 (Phase 22 이연) | P0 12룰만 MVP 필수 |
| UX Quality 페이지별 임베드 (M14) | +4주 (Phase 22 이연) | /dashboard/assistant 단일 페이지로 충분 |

---

## 4. 텍스트 간트 차트 (50주 마일스톤 표시)

### 4.1 4주 단위 간트

```
주차     1  2  3  4   5  6  7  8   9 10 11 12  13 14 15 16  17 18 19 20  21 22 23 24  25 26 27 28
         ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃
         Phase 15      Phase 16                 Phase 17                    Phase 18...
M1  ★──M2                                                                                        
         ★             M3 ──── M4 ★
                       ★                        M5 ─── M6 ★ (MVP 선언 Week 18)
                                                                            M7 ★ (Week 24)
주차                                                                                              

주차    29 30 31 32  33 34 35 36  37 38 39 40  41 42 43 44  45 46 47 48  49 50
         ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━━━━━━┃  ┃━━━━
         Phase 18...     Phase 19       Phase 20    Phase 21    Phase 22
                        M8 ★ (Week 34 Beta-pre)
                                          M9 ★ (Week 38)
                                                     M10 ★ (Week 42 Beta)
                                                        M11 ─ M12 ★ (Week 44)
                                                                       M13 ── M14 ★ (Week 46)
                                                                                    M15 ─ M16 ★ (Week 50 GA)
```

### 4.2 Phase별 간트 (정밀 텍스트)

```
Phase 15: Auth Advanced (Week 1~4, 22h)
├─M1 MFA Server (Week 1~2, 12h) ████░░░░░░░░░░░░░░░░░░░░░░░░░░
├─M2 MFA Complete (Week 3~4, 17h) ░░░░████░░░░░░░░░░░░░░░░░░░░░░
└─Release: v0.1.0-alpha.1 at Week 4

Phase 16: Obs+Ops (Week 5~10, 40h)
├─M3 Vault Live (Week 5~7, 16h) ░░░░░░░░███░░░░░░░░░░░░░░░░░░░
├─M4 Ops Ready (Week 8~10, 19h) ░░░░░░░░░░░███░░░░░░░░░░░░░░░░
└─Release: v0.2.0-alpha.2 at Week 10

Phase 17: Auth Core + Storage (Week 11~18, 60h)
├─M5 Auth Core (Week 11~14, 24h) ░░░░░░░░░░░░░░████░░░░░░░░░░░░
├─M6 Storage/MVP (Week 15~18, 30h) ░░░░░░░░░░░░░░░░░░████░░░░░░░░
└─Release: v0.3.0 MVP at Week 18

Phase 18: SQL+Table Editor (Week 19~34, 400h) [최대 Phase]
├─M7 SQL Foundation (Week 19~24, 84h) ░░░░░░░░░░░░░░░░░░░░██████░░
├─M8 SQL+Table Complete (Week 25~34, 260h) ░░░░░░░░░░░░░░░░░░░░░░░░░░██████████
└─Release: v0.4.3-beta.4 at Week 34

Phase 19: Edge+Realtime (Week 35~42, 75h)
├─M9 Edge L1 (Week 35~38, 27h) ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██░░
├─M10 Edge+Realtime Complete (Week 39~42, 42h) ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██
└─Release: v0.5.0 Beta at Week 42

Phase 20: Schema+DB Ops+Advisors (Week 38~44 중첩, 198h)
├─M11 Schema+DB Ops (Week 38~43, 114h) [P18 후반 중첩]
├─M12 Advisors (Week 41~44, 82h)
└─Release: v0.6.0-rc.1 at Week 44

Phase 21: Data API + UX (Week 45~46, 40h)
├─M13 Data API (Week 45, 25h)
├─M14 UX Quality (Week 46, 17h)
└─Release: v0.9.0-rc.2 at Week 46

Phase 22: Hardening + GA (Week 47~50, 35h)
├─M15 Hardening (Week 47~48, 23h)
├─M16 GA (Week 49~50, 14h)
└─Release: v1.0.0 Centurion at Week 50
```

### 4.3 12주 확대 간트 (Phase 18 집중 구간 — Week 19~34)

Phase 18은 단일 Phase로 16주에 걸쳐 400h 공수 → 세부 주 단위 진행.

```
Week│ 19 20 21 22 23 24 │ 25 26 27 28 29 30 │ 31 32 33 34
    ├──────────────────┼──────────────────┼──────────────
14c-γ│ ██████████████     │                    │ (SQL Monaco + 히스토리, 120h)
14d  │                    │ ██████████         │ (SQL formatter + auto-complete, 80h)
14e  │                    │           ████████│ (SQL AI 보조, 80h)
14f  │                    │                    │ ████  (Plan Viz, 40h)
14c-β│                    │              ████ │         (Table RLS UI, 40h)
14d/e│                    │                   │   ████  (Table CSV + cmdk, 40h)
─────┴──────────────────┴──────────────────┴──────────────
M7 ★(Week 24)            M8 Release ★(Week 34)
```

---

## 5. 주요 체크포인트 (누적 점수 예상)

### 5.1 체크포인트 표

| 주차 | 체크포인트 | 누적 카테고리 점수 | 가중평균 | Phase 상태 |
|------|---------|---------------|---------|----------|
| 0 (시작) | Wave 4 완료 시점 | 825/1400 = 58.9 | 58.9 | Phase 15 착수 직전 |
| 4 | M2 완료 (Auth Advanced 15→60) | 825 + 45 = 870 | 62.1 | Phase 15 완료 |
| 8 | M3 중간 (Vault 진행) | 870 + 10 부분 | 62.9 | Phase 16 전반 |
| 10 | M4 완료 (Obs 65→85 + Ops 80→95) | 870 + 35 = 905 | 64.6 | Phase 16 완료 |
| 14 | M5 완료 (Auth Core 70→90) | 905 + 20 = 925 | 66.1 | Phase 17 전반 |
| 18 | **M6 MVP** (Storage 40→90) | 925 + 50 = 975 | **69.6** | **Phase 17/MVP 완료** |
| 24 | M7 중간 (SQL 14c-γ) | 975 + 10 부분 | 70.4 | Phase 18 전반 |
| 30 | SQL 14e 완료 | 975 + 20 부분 | 71.1 | Phase 18 진행 |
| 34 | **M8 Beta-pre** (SQL 70→100 + Table 75→100) | 975 + 55 = 1030 | **73.5** | **Phase 18 완료** |
| 38 | M9 Edge L1 | 1030 + 20 부분 | 75.0 | Phase 19 전반 |
| 42 | **M10 Beta** (Edge 45→92 + Realtime 55→100) | 1030 + 92 = 1122 | **80.1** | **Phase 19/Beta 완료** |
| 43 | M11 Schema+DB Ops 부분 | 1122 + 50 부분 | 83.7 | Phase 20 전반 |
| 44 | **M12 RC-pre** (Schema 65→95 + DB Ops 60→95 + Advisors 65→95) | 1122 + 95 = 1217 | **86.9** | **Phase 20 완료** |
| 45 | M13 Data API | 1217 + 40 = 1257 | 89.8 | Phase 21 전반 |
| 46 | **M14 RC** (Data API 45→85 + UX 75→95) | 1217 + 60 = 1277 | **91.2** | **Phase 21 완료** |
| 48 | M15 Hardening | 1277 + 20 부분 | 92.6 | Phase 22 전반 |
| 50 | **M16 GA** (전부 100) | 1400 | **100.0** | **Phase 22/GA 완료** |

### 5.2 주요 체크포인트 세부 해석

**Week 4 (62.1점)**: MFA 3종 완성. **페르소나 1 보안 니즈 1차 충족**. 자신의 계정만 보호 가능.

**Week 10 (64.6점)**: Vault + JWKS + Capistrano 완성. **운영 기반 확립**. 롤백·시크릿·서명 체계 완성.

**Week 18 (69.6점)**: MVP. **1인 운영자가 실제 프로덕션 데이터를 저장 가능한 수준**. Auth Core + Storage 포함. 외부에 공개는 아직 권장 안 함 (Beta 이전).

**Week 34 (73.5점)**: Beta-pre. **SQL Editor + Table Editor가 Supabase 수준 도달**. Monaco + AI 보조 + Papa Parse + cmdk. 외부 운영자 2~3명 접근 가능.

**Week 42 (80.1점)**: Beta. **Edge Functions + Realtime 완성**. Supabase Cloud의 핵심 기능 대부분 대체 가능.

**Week 44 (86.9점)**: RC-pre. Schema Viz + DB Ops + Advisors. **Supabase Studio 기능 거의 동등**.

**Week 46 (91.2점)**: RC. Data API + UX. **사용자 관점에서 GA와 거의 동일**.

**Week 48 (92.6점)**: Hardening. Prisma 마이그 정리 + STRIDE 재검증 + NFR 충족 검증.

**Week 50 (100.0점)**: **GA (v1.0.0 Centurion)**. Supabase Self-Hosted 100점 동등. 3년 TCO 절감 $950~2,150 검증.

### 5.3 체크포인트별 의사결정 시점

각 체크포인트는 **ADR 재검토 기회**이다:

| 주차 | 체크포인트 이름 | 재검토 대상 | 트리거 조건 |
|------|-------------|----------|----------|
| 4 | Phase 15 종료 | ADR-007 (Auth Adv) | WebAuthn Safari 비호환 시 조정 |
| 10 | Phase 16 종료 | ADR-013/015 | 5초 롤백 SLA 미달 시 ADR 개정 |
| 18 | **MVP 선언** | ADR-001 재검토 | 사용자 2명+ 6개월 근접 시 |
| 34 | Beta-pre | ADR-002/003 | AG Grid 대체 욕구 발생 시 DQ-1.13 재활성 |
| 42 | **Beta 선언** | ADR-009/010 | Edge L2 Deno 불안정 시 L1 단독 유지 |
| 46 | RC | ADR-012/016 | pg_graphql 수요 트리거 4중 2+ 충족 시 도입 |
| 50 | **GA** | 전 ADR 최종화 | 모든 재검토 트리거 해결 또는 재설정 |

---

## 6. 버퍼 정책 및 일정 보정

### 6.1 1인 운영 20% 버퍼 근거

순수 코딩 공수(870h) 외 1인 운영자의 부수 활동:

| 부수 활동 | 주당 시간 | 50주 누적 |
|---------|--------|---------|
| 레퍼런스 문서 리뷰 | 2h | 100h |
| 인수인계서 작성 | 1h | 50h |
| CLAUDE.md / docs 유지보수 | 1h | 50h |
| PM2 / 로그 / 모니터링 | 1h | 50h |
| 고객 대응 / 기타 업무 | 3h | 150h |
| **합계** | **8h/주** | **400h** |

실제 주당 코딩 가능 시간 = 20h. 순수 공수 870h ÷ 20h/주 = **43.5주** (이론 최소).

### 6.2 Phase별 버퍼 적용

| Phase | 순수 공수 | +20% 버퍼 | 병렬 중첩 절감 | 최종 주수 |
|-------|--------|--------|-------------|--------|
| 15 | 22h | 26.4h | 0 | 4.0주 → 4주 |
| 16 | 40h | 48h | -8h (병렬) | 2.0주 순수 → 6주 (버퍼 포함) |
| 17 | 60h | 72h | -12h | 3.0주 순수 → 8주 |
| 18 | 400h | 480h | -40h | 22주 순수 → 16주 (병렬 극대화) |
| 19 | 75h | 90h | -10h | 4주 순수 → 8주 |
| 20 | 198h | 237.6h | -40h (P18 중첩) | 9.9주 → 6주 (중첩) |
| 21 | 40h | 48h | 0 | 2.4주 → 4주 |
| 22 | 35h | 42h | 0 | 2.1주 → 4주 |
| **합계** | **870h** | **1044h** | **-110h** | **50주** |

### 6.3 리스크 5% 추가 버퍼 (Contingency)

`10-14-categories-priority.md §6.2 TOP 3 리스크` 실현 시 예상 추가 공수:

- Edge Functions 3층 실패 (리스크 1): +20h → Phase 22에서 흡수
- Realtime wal2json 비호환 (리스크 2): +10h → Phase 22 또는 polling 폴백
- Storage 50GB 부족 (리스크 3): +15h → B2 오프로드 조기 도입

총 +45h 추가 버퍼 반영 = 실제 여유분 **≈ 155h** (20% + 5% = 25%).

### 6.4 주당 속도 측정 및 조정

Phase 15 착수 후 **4주마다 속도 재측정**:

```
실제 속도 = 실제 완료 공수 / 경과 주수
계획 속도 = 20h/주

편차 = (실제 - 계획) / 계획

편차 > +25% → 가속, Phase 22 기능 추가 고려
편차 < -25% → 지연, Phase 축소 또는 GA 연기
편차 ±25% → 계획 유지
```

### 6.5 외부 이벤트 대응

| 외부 이벤트 | 대응 방안 |
|----------|---------|
| Next.js 17 출시 (마이너) | 호환성 확인 + 소규모 조정 (≤5h) |
| Next.js 18 출시 (메이저) | Phase 22에서 업그레이드 + 추가 ~20h |
| PostgreSQL 18 출시 | wal2json 호환 확인 (DQ-RT-6) + 필요 시 +15h |
| Cloudflare Tunnel 정책 변경 | 즉시 대응 (최대 24h 재배포) |
| Node.js 신규 LTS | `.nvmrc` 업데이트 + 테스트 ≤4h |
| 보안 패치 (CVE) | 핫픽스 처리 (Emergency) |

---

## 7. 마일스톤 검증 프로토콜

### 7.1 마일스톤 완료 조건 (3단계)

```
[1단계: 기술 검증]
  □ 단위 테스트 100%
  □ 통합 테스트 (해당 시)
  □ Playwright E2E 시나리오 통과
  □ 성능 벤치마크 (해당 시)

[2단계: 품질 검증]
  □ 코드 리뷰 (1인 운영이지만 self-review 체크리스트)
  □ Lighthouse 80+ (UI 포함 시)
  □ Sentry 0 신규 에러
  □ Type 체크 통과

[3단계: 프로세스 검증]
  □ 릴리스 노트 작성 (필요 시)
  □ CLAUDE.md / docs 업데이트
  □ Git 태그 (릴리스 연관 시)
  □ _CHECKPOINT_KDYWAVE.md 업데이트
  □ DQ 답변 기록 (07-dq-matrix.md)
```

### 7.2 마일스톤별 검증 책임자

- **기술 검증**: 1인 운영자 (자가)
- **품질 검증**: 1인 운영자 + 자동화 (lighthouse, sentry)
- **프로세스 검증**: 1인 운영자 + kdywave 체크포인트

### 7.3 마일스톤 실패 시 프로토콜

```
[마일스톤 검증 실패 감지]
         │
         ▼
[원인 분석 (1일 이내)]
  ├── 기술적 원인: 단위 테스트 실패, 성능 미달
  ├── 일정적 원인: 공수 초과 (20%+)
  └── 요구사항 원인: FR 해석 변경
         │
         ▼
[복구 계획 작성]
  ├── 최대 1주일 내 재시도 계획
  └── 계획 실패 시 Phase 축소 고려
         │
         ▼
[_CHECKPOINT 업데이트 + 다음 마일스톤 조정]
```

### 7.4 마일스톤 통과 후 자동 동작

```bash
# scripts/milestone-pass.sh
MILESTONE=$1     # 예: M6
PHASE=$2         # 예: 17

# 1. Git 커밋 태그 (optional)
git tag "milestone-${MILESTONE}" -m "${MILESTONE} 완료 - Phase ${PHASE}"

# 2. kdywave 체크포인트 업데이트
yq eval ".milestones.${MILESTONE}.status = \"completed\"" -i \
  docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md

# 3. current.md 세션 요약표 1행 추가 (수동)
echo "  (docs/status/current.md 업데이트 필요)"

# 4. 다음 마일스톤 브랜치 생성
NEXT=$(next_milestone "${MILESTONE}")
git checkout -b "milestone/${NEXT}"
```

---

## 8. DQ Wave 5 16건 × 마일스톤 재확인 매핑

Wave 5 DQ 16건이 어느 마일스톤에서 최종 해결되는지 재확인:

| DQ# | 주제 | 해결 마일스톤 | 해결 방법 |
|-----|-----|----------|---------|
| DQ-1.13 | AG Grid 전환 | M15 재검토 | Phase 22 하드닝에서 최종 확정 (비채택 유지 예상) |
| DQ-1.14 | Enterprise 도입 | M15 재검토 | 비채택 유지 |
| DQ-3.3 | Supabase Studio 임베드 | M11 재확인 | 이미 Wave 2 거부 확정 |
| **DQ-4.1** | **PM2 cluster 모드** | **M3 확정** | **cluster:4 유지 (spike-010 결과)** |
| DQ-4.2 | pg_cron 재검토 | M11 | 미채택 유지 (SQL-only 잡 5개+ 조건 미달) |
| DQ-4.3 | BullMQ 재검토 | M11 | 미채택 유지 (advisory lock 충분) |
| **DQ-4.22** | **wal-g 복원 속도** | **M11 실측** | **첫 복원 드릴 후 수치 보정** |
| **DQ-AA-3** | **FIDO MDS 통합** | **M15 (선택)** | **Phase 22 보너스로 +10h** |
| **DQ-AA-9** | **WebAuthn Conditional UI** | **M15 (선택)** | **Phase 22 보너스로 +5h** |
| DQ-ADV-1 | Advisors PG 마이그 | M12 | P0 12룰 Phase 20 완료, P1/P2는 Phase 22 이연 |
| **DQ-RT-3** | **presence_diff 이벤트** | **M10 확정** | **Channel 구현 시 답변** |
| DQ-RT-6 | PG 18 업그레이드 | M15 | 업그레이드 결정 시 (Phase 22+) |
| DQ-12.4 | JWKS 캐시 정책 | M4 | 3분 grace 확정 |
| DQ-12.5 | Capacitor 모바일 | Phase 22+ 백로그 | GA 이후 재검토 |
| DQ-AC-1 | argon2 마이그 | Phase 22+ | bcrypt 성능 한계 시 |
| **DQ-AC-2** | **Session 인덱스** | **M5 확정** | **SQLite 보조 + PG 복합 인덱스** |
| **DQ-OPS-1** | **Docker 이행 조건** | **M15 (선택)** | **Phase 22에서 조건만 문서화** |
| **DQ-OPS-3** | **Node 버전 고정** | **M4 확정** | **.nvmrc + release 격리** |
| **DQ-OPS-4** | **DR 호스트** | **Phase 22+** | **Cloudflare Tunnel replica 확장 시** |

**굵게 표시된 10건**이 Wave 5에서 명시적으로 해결되는 DQ. 나머지 6건은 재확인·이연.

---

## 9. 마일스톤 거버넌스

### 9.1 마일스톤 추가·변경 프로토콜

마일스톤을 M1~M16 외에 추가해야 할 경우:

```
[트리거 발생]
  ├── Phase 공수 +30% 초과
  ├── 외부 이벤트 (PG 18, Next.js 18)
  ├── 신규 FR 추가
  └── ADR 재검토 트리거 발동 (45건 중)
         │
         ▼
[마일스톤 추가 제안 문서 작성]
  ├── 위치: 05-roadmap/02-milestones.md (이 문서)
  ├── 추가 마일스톤 번호: M16-a, M16-b (원본 번호 유지)
  └── 새 검증 기준 명시
         │
         ▼
[_CHECKPOINT_KDYWAVE.md 업데이트]
  └── `milestones_added` 필드에 기록
```

### 9.2 마일스톤 우선순위 조정

외부 이벤트나 사용자 피드백에 따라 마일스톤 순서 조정 가능:

```
[조정 필요 판단 (Beta 후 가장 흔함)]
  │
  ▼
[우선순위 변경 제안]
  예: M13 Data API ↔ M14 UX Quality 순서 교체
  │
  ▼
[영향 분석]
  - 크리티컬 패스 변경?
  - 의존성 깨짐?
  - 일정 영향?
  │
  ▼
[결정 기록]
  └── 이 문서 §1 요약표 + 해당 마일스톤 §2.N 업데이트
  └── _CHECKPOINT_KDYWAVE.md `milestones_reordered` 필드
```

### 9.3 마일스톤 검증 자동화

각 마일스톤 검증을 자동화하기 위한 향후 작업:

- Phase 16 구현 후 `scripts/verify-milestone.sh M{N}.sh` 작성
- GitHub Actions 워크플로우 연동 (각 PR이 해당 마일스톤 통과 기준 검증)
- 자동화는 Phase 22 후 구현 고려 (별도 마일스톤 M17+로 확장 가능)

---

## 10. 마일스톤 확정 사항

본 문서에서 명시적으로 확정하는 마일스톤 결정:

### 결정 1: 16 마일스톤 명칭과 타겟 주차

- 근거: Phase 15~22 × 2 마일스톤
- 재검토 트리거: Phase 공수 ±30% 이탈 시 마일스톤 재배치

### 결정 2: MVP 선언 시점 = M6 (Week 18)

- 근거: Auth Core 90점 + Storage 90점 완성 시
- 재검토 트리거: MVP 체크리스트 12건 중 11+ 달성 시 선언

### 결정 3: Beta 선언 시점 = M10 (Week 42)

- 근거: SQL/Table Editor + Edge/Realtime 완성
- 재검토 트리거: Beta 체크리스트 달성 시

### 결정 4: GA 선언 시점 = M16 (Week 50)

- 근거: 14 카테고리 100점 + NFR 38 충족
- 재검토 트리거: GA 체크리스트 달성 시

### 결정 5: 크리티컬 패스 16 마일스톤 경로

- 근거: M1 → M2 → ... → M16 순차
- 재검토 트리거: 마일스톤 우선순위 조정 발생 시

---

## 11. 마일스톤 간 연결 지도

### 11.1 마일스톤 이름과 카테고리 매트릭스

```
마일스톤      │ 카테고리      │ 레이어 │ 공수   │ Phase
M1 MFA Server │ 6 Auth Adv    │ L3     │ 12h    │ 15
M2 MFA Comp   │ 6 Auth Adv    │ L3     │ 17h    │ 15
M3 Vault      │ 12 Obs        │ L1     │ 16h    │ 16
M4 Ops        │ 14 Ops+12 Obs │ L0+L1  │ 19h    │ 16
M5 Auth Core  │ 5 Auth Core   │ L2     │ 24h    │ 17
M6 Storage    │ 7 Storage     │ L4     │ 30h    │ 17
M7 SQL Found  │ 2 SQL         │ L6     │ 84h    │ 18
M8 SQL+Table  │ 2 SQL+1 Table │ L6     │ 260h   │ 18
M9 Edge L1    │ 8 Edge        │ L5     │ 27h    │ 19
M10 Edge+RT   │ 8+9 Edge+RT   │ L5     │ 42h    │ 19
M11 Schema+DB │ 3+4 Schema+DB │ L6+L4  │ 114h   │ 20
M12 Advisors  │ 10 Advisors   │ L6     │ 82h    │ 20
M13 Data API  │ 11 Data API   │ L7     │ 25h    │ 21
M14 UX Qual   │ 13 UX         │ L8     │ 17h    │ 21
M15 Hard      │ 전체 재검증    │ 전체    │ 23h    │ 22
M16 GA        │ 전체 최종       │ 전체    │ 14h    │ 22
─────────────┴────────────────┴────────┴────────┴─────
합계                           806h (Critical Path)
```

### 11.2 마일스톤 의존성 매트릭스

```
M#  │M1│M2│M3│M4│M5│M6│M7│M8│M9│M10│M11│M12│M13│M14│M15│M16│
M1  │──│                                                   │
M2  │█ │──│                                                │ ← 직접 의존
M3  │  │█ │──│                                             │
M4  │  │  │█ │──│                                          │
M5  │  │  │  │█ │──│                                       │
M6  │  │  │  │  │█ │──│                                    │
M7  │  │  │  │  │  │█ │──│                                 │
M8  │  │  │  │  │  │  │█ │──│                              │
M9  │  │  │  │  │  │  │  │█ │──│                           │
M10 │  │  │  │  │  │  │  │  │█ │──│                        │
M11 │  │  │  │  │  │  │  │█ │  │█ │──│                     │ ← 두 개 선행
M12 │  │  │  │  │  │  │  │  │  │  │█ │──│                  │
M13 │  │  │  │  │  │  │  │  │  │█ │  │█ │──│               │
M14 │  │  │  │  │  │  │  │  │  │  │  │  │█ │──│            │
M15 │  │  │  │  │  │  │  │  │  │  │  │  │  │█ │──│         │
M16 │  │  │  │  │  │  │  │  │  │  │  │  │  │  │█ │──│      │
```

### 11.3 병렬 윈도우 (Slack 있는 마일스톤 조합)

다음 마일스톤 쌍은 병렬 진행 가능 (크리티컬 패스와 별도):

- M11 Schema+DB ∥ M12 Advisors (Phase 20 내부)
- M13 Data API ∥ M14 UX Quality (Phase 21 내부)
- M15 Hardening 내부에서 DQ 답변 작업 병렬

---

## 12. 기간 회고 (Wave 5 완료 시점 예측)

### 12.1 예상 최종 수치

Wave 5 R1(본 에이전트)이 예측하는 50주 완료 시점(2027-04-03) 상태:

| 항목 | 예측값 | 근거 |
|------|------|-----|
| 총 공수 | 870h (±5%) | Wave 4 Blueprint 정밀 |
| 총 기간 | 50주 (±2주) | 버퍼 20% + 리스크 5% |
| 카테고리 100점 도달 | 14/14 | GA 기준 |
| DQ 해결 | 64/64 | Wave 1-5 누적 |
| ADR 수 | 18+ (Phase별 추가) | Wave 4에서 18건 시작 |
| 3년 TCO 절감 | $950~2,150 | Supabase Cloud vs 양평 $250 |
| 월 운영 비용 | $0~10 | Cloudflare 무료 + B2 + AI |
| 릴리스 수 | 9개 (v0.1.0~v1.0.0) + 핫픽스 | 본 로드맵 §3 |

### 12.2 예상 위험 이벤트

| 위험 이벤트 | 확률 | 영향 | 대응 |
|----------|-----|-----|-----|
| Phase 18 공수 초과 (+50h) | 60% | 2주 지연 | Phase 22 축소 |
| Edge L2 Deno 불안정 | 40% | Phase 22 L1 유지 | 점수 92→90 허용 |
| PostgreSQL 18 출시 조기 | 30% | Phase 22 +15h | wal2json 호환 검증 |
| 외부 사용자 2명+ 6개월 | 20% | ADR-001 재평가 | Wave 6 시작 |
| AI SDK v6 API 변경 | 50% | 소규모 마이그 | 버전 lock |
| 보안 CVE 발생 | 70% | 1~2회 핫픽스 | Emergency 대응 |

### 12.3 성공 판정 기준 (50주 후)

GA(v1.0.0) 선언 시 **다음 10개 성공 기준**을 자가 평가:

1. ✅ 14 카테고리 가중평균 100점
2. ✅ 3년 TCO 절감 $950 이상 실측
3. ✅ 월 운영 비용 $10 이하
4. ✅ RPO 60초 / RTO 30분 실측
5. ✅ 보안 무사고 (Critical CVE 실현 0건)
6. ✅ 페르소나 1 (김도영) 실제 운영 환경 사용 중
7. ✅ 페르소나 2 (박민수) 또는 페르소나 3 (이수진) 1인+ 실제 사용
8. ✅ Supabase Cloud로부터 독립된 완전한 기능 세트
9. ✅ Wave 1-5 누적 문서 100+ 건 영구 보존
10. ✅ Phase 22 이후 Wave 6 트리거 발동 준비 완료

---

## 13. 다음 단계 (본 로드맵 실행 단계)

### 13.1 Wave 5 나머지 에이전트 연동

- R2 (Risk Register 작성자): `03-tech-debt-strategy.md` + `04-risk-register.md`에서 본 문서 §6.3(리스크 5% 버퍼) 참조
- R3 (Go/No-Go 체크리스트): `05-go-no-go-checklist.md`에서 본 문서 §7(검증 프로토콜) 참조
- S1/S2 (스파이크): 각 스파이크 문서에서 본 문서 §8(DQ 매핑) 참조

### 13.2 Phase 15 즉시 착수 가능

본 로드맵 3문서 완료 시점부터 다음 작업 가능:

```bash
# 브랜치 생성
git checkout -b milestone/M1-mfa-server

# Prisma 스키마 확장 시작 (M1 태스크 T1-1~T1-2)
# ... 구현 작업
```

### 13.3 kdywave Wave 5 완료 체크포인트

본 문서(02-milestones.md) 완료 후 Wave 5 R1 종료. 남은 Wave 5:

- R2 (2 문서) : 기술 부채 + 리스크 레지스터
- R3 (2 문서) : Go/No-Go + 롤아웃 전략
- S1 (2 문서) : Edge 심화 + Storage 50GB 스파이크
- S2 (3 문서) : wal2json + MFA + pgmq 스파이크
- A1 (3 문서) : 용어집 + kdygenesis 인계 + 최종 요약

Wave 5 전체 완료 시: 13 문서 + Wave 4 26 문서 + Wave 1-3 72 문서 = **111 문서** (체크포인트 예측 부합).

---

> **작성**: Wave 5 R1 (Roadmap Lead) · 2026-04-18
> **총 줄 수 목표**: ~700줄 이상
> **근거 문서**: `00-roadmap-overview.md` + `01-release-plan.md` + Wave 1-4 전체
> **본 문서로 Wave 5 R1 역할 3/3 완료**: 로드맵 개요 + 릴리스 계획 + 마일스톤 완비
