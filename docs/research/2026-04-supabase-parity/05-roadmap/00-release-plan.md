# 00. 릴리스 계획 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> **Wave 5 · R1-A (분할 재발사) 산출물**
> 작성일: 2026-04-18 (세션 28, kdywave Wave 5 R1-A Agent — sonnet)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관:
> - [01-release-plan.md](./01-release-plan.md) — 기존 Wave 5 릴리스 계획 (선행 작성본)
> - [../00-vision/02-functional-requirements.md](../00-vision/02-functional-requirements.md) — 55 FR P0/P1/P2
> - [../00-vision/05-100점-definition.md](../00-vision/05-100점-definition.md) — 14 카테고리 4단계 60/80/95/100점
> - [../00-vision/10-14-categories-priority.md](../00-vision/10-14-categories-priority.md) — §7 MVP/Beta/v1.0 + Phase 15-22
> - [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) — ADR 18건
> - [../04-integration/02-cloudflare-deployment-integration.md](../04-integration/02-cloudflare-deployment-integration.md) — canary 서브도메인
> - [../../handover/260418-session25c-tunnel-complete-playwright.md](../../../../docs/handover/260418-session25c-tunnel-complete-playwright.md) — 530 운영 교훈

---

## 1. 요약 (Executive Summary)

양평 부엌 서버 대시보드의 Supabase 100점 동등성 달성을 위한 릴리스 계획은 **3단계(MVP → Beta → v1.0 GA)** 구조로 총 **870~880h / ~52주** 로드맵이다.

- **v0.1.0 MVP (코드명 "Foundation")**: Phase 15+16+17 = 122h / 18주. 보안 기반(TOTP+WebAuthn+Rate Limit), Vault/JWKS, Capistrano 5초 롤백, Auth Core 완성, SeaweedFS Storage 구축. 내부 검증 단계.
- **v0.2.0 Beta (코드명 "Editors")**: Phase 18+19 = 475h / +14주. SQL Editor·Table Editor 고도화, Edge Functions 3층, Realtime CDC+채널. Supabase 핵심 기능 동등 단계.
- **v1.0.0 GA (코드명 "Parity")**: Phase 20+21+22 = ~268h / +10주. Schema Viz·DB Ops·Advisors, Data API(REST+pgmq), UX Quality(AI SDK), 100점 보너스 채우기.

핵심 결정 5가지:
1. **Phase 15 1순위**: Auth Advanced(TOTP+WebAuthn+Rate Limit) — 시간당 갭 해소율 2.05점/h 최고, 22h로 15→60점 달성.
2. **canary 서브도메인 전략**: `canary.stylelucky4u.com` (localhost:3002) → 30분 검증 후 `stylelucky4u.com` (localhost:3000) 승격 (ADR-015).
3. **5초 롤백**: Capistrano-style symlink swap으로 다운타임 0, 롤백 5초 이내 (ADR-015).
4. **피처 플래그**: 자체 PostgreSQL `feature_flags` 테이블 기반 토글 — LaunchDarkly 등 SaaS 비채택(CON-9 비용 상한).
5. **Cloudflare Tunnel 530 운영**: sysctl keepalive 60/10/6 + 16MB 버퍼 영속화, `retries:2` + 지수 백오프, `scripts/tunnel-measure-v2.sh` 주간 회귀 (세션 25-C 교훈).

---

## 2. 릴리스 전략

### 2.1 Semantic Versioning 정책

[Semantic Versioning 2.0.0](https://semver.org/) 채택. 형식: `MAJOR.MINOR.PATCH[-PRE_RELEASE][+BUILD]`.

```
버전 단위 결정 기준:
  MAJOR  — 하위 호환 깨지는 API/DB 스키마 변경 (본 프로젝트 1.0 이전은 0.x)
  MINOR  — 릴리스 단위 (Phase 완료 = MINOR +1)
  PATCH  — 버그픽스, hotfix, 운영 설정 변경
  PRE    — alpha.N (진행 중) / beta.N (RC 전) / rc.N (릴리스 후보)

예시:
  v0.1.0-alpha.1  → Phase 15 착수 시
  v0.1.0-rc.1     → Phase 17 릴리스 기준 90% 충족
  v0.1.0          → Phase 17 완료 + 릴리스 기준 100% PASS
  v0.1.1          → MVP 이후 hotfix (Tunnel 530 대응 등)
  v0.2.0          → Phase 19 완료 (Beta)
  v1.0.0          → Phase 22 완료 (GA)
```

git 태그 규칙: `v{버전}` (예: `v0.1.0`). 태그 생성 시 한국어 릴리스 노트 자동 생성 (GitHub Releases 또는 별도 로컬 CHANGELOG.md).

### 2.2 배포 채널

3채널 배포 파이프라인 (ADR-015, `02-cloudflare-deployment-integration.md §8` 참조).

```
internal (개발자 로컬)
  → localhost:3002 (luckystyle4u-canary PM2 앱)
  → canary.stylelucky4u.com (Cloudflare Rule → localhost:3002)
  → [30분 검증 + 릴리스 기준 체크]
  → stylelucky4u.com (stable, Cloudflare Proxy → localhost:3000)
```

**채널별 PM2 앱 구성**:
- `yangpyeong-web`: cluster:4, port 3000 — 안정 채널 (production)
- `luckystyle4u-canary`: cluster:4, port 3002 — 카나리 채널 (활성화 시만 기동)
- `cron-worker`: fork:1 — 배포 채널과 독립 (node-cron + PG advisory lock)
- `cloudflared`: fork:1 — Tunnel 커넥터 (protocol=http2, icn06/icn01)

**Cloudflare 서브도메인 매핑**:
- `stylelucky4u.com` → CF Proxy → Tunnel → localhost:3000 (stable)
- `canary.stylelucky4u.com` → CF Rule → Tunnel → localhost:3002 (canary)
- `api.stylelucky4u.com` → CF Proxy → Tunnel → localhost:3000/api/* (미활성, 잠재 경로)

**카나리 시간차 정책**:
1. 카나리 배포 (`pm2 reload luckystyle4u-canary --update-env`)
2. **30분** 검증: `scripts/tunnel-measure-v2.sh` 기본 프로브 + 주요 API 응답 확인
3. 이상 없으면 stable 승격 (`capistrano-deploy.sh promote`)
4. 이상 있으면 즉시 롤백 (`capistrano-deploy.sh rollback` → 5초 symlink swap)

### 2.3 피처 플래그

자체 PostgreSQL `feature_flags` 테이블 기반 토글. LaunchDarkly/Unleash 등 외부 SaaS 미채택 (CON-9 비용 상한, Wave 4 Blueprint 청사진 참조).

```sql
-- 피처 플래그 테이블 스키마 (Wave 4 청사진 인용)
CREATE TABLE feature_flags (
  id         SERIAL PRIMARY KEY,
  key        TEXT UNIQUE NOT NULL,          -- 예: 'TOTP_MFA_ENABLED'
  enabled    BOOLEAN DEFAULT FALSE,
  rollout    SMALLINT DEFAULT 0,            -- 0~100 (% 트래픽 비율)
  phase      TEXT,                          -- 'phase15', 'phase16', ...
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Next.js 16에서 서버 컴포넌트 렌더 시 PG 쿼리로 플래그 조회 (Drizzle SQLite 캐시 60초 TTL 보조). 플래그 변경은 대시보드 `/admin/feature-flags` 페이지 또는 직접 SQL로 수행.

**주요 피처 플래그 예시**:
| 플래그 키 | Phase | 기본값 | 설명 |
|-----------|-------|--------|------|
| `TOTP_MFA_ENABLED` | 15 | false | TOTP MFA 등록/로그인 활성 |
| `WEBAUTHN_ENABLED` | 15 | false | WebAuthn 패스키 활성 |
| `RATE_LIMIT_ENABLED` | 15 | false | DB 기반 Rate Limit 활성 |
| `VAULT_ENABLED` | 16 | false | Vault KEK→DEK 암호화 활성 |
| `CANARY_ROLLOUT` | 전 Phase | 0 | 카나리 트래픽 비율 (0~100) |
| `SEAWEEDFS_ENABLED` | 17 | false | SeaweedFS 파일 API 활성 |
| `SQL_EDITOR_AI` | 18 | false | AI SQL 어시스턴트 활성 |
| `EDGE_FUNCTIONS_L1` | 19 | false | isolated-vm L1 실행 활성 |
| `REALTIME_CDC` | 19 | false | wal2json CDC 채널 활성 |

### 2.4 롤백 정책: Capistrano-style symlink 5초 swap

ADR-015 기반. 릴리스 디렉토리 구조:

```
/home/dev/luckystyle4u-server/
├── current/                → symlink → releases/<latest>
├── releases/
│   ├── 20260601-v010-abc1234/   ← 이전 버전 (보존)
│   └── 20260715-v020-def5678/   ← 최신 버전
└── shared/
    ├── .env                      ← 버전 독립 (심링크 외부)
    └── secrets.env               → /etc/luckystyle4u/secrets.env 심링크
```

롤백 절차 (`capistrano-deploy.sh rollback`):
```bash
1. PREVIOUS=$(ls -1t releases/ | sed -n '2p')    # 직전 릴리스 탐색
2. ln -sfn releases/${PREVIOUS} current           # symlink 교체 (~1초)
3. pm2 reload yangpyeong-web --update-env         # PM2 graceful reload (~4초)
   → 총 5초 이내, 다운타임 0 (Worker 순차 교체)
4. pm2 save                                       # 새 symlink 영속화
5. 측정: tunnel-measure-v2.sh 5회 → 5xx 없으면 완료
```

**자동 롤백 트리거** (Wave 5 Observability에서 Prometheus alertmanager 연동):
- 배포 후 5분 이내 HTTP 5xx 비율 > 5% → 자동 롤백 실행
- PM2 Worker crash 3회 이상/분 → 자동 롤백 실행
- Cloudflare Tunnel 530 비율 > 3% (10분 평균) → 알림 + 수동 롤백 확인

### 2.5 릴리스 주기: 기능 기반 (마일스톤 완료 후 promote)

고정 스프린트 사이클(2주) 아닌 **마일스톤 완료 기반** 릴리스. 각 Phase의 릴리스 기준(§3.4, §4.4, §5.4) 충족 시 즉시 promote. 1인 운영 구조에서 달력 기반 릴리스 강제는 오버헤드가 크므로 품질 게이트 통과를 단일 기준으로 삼는다.

---

## 3. 릴리스 v0.1.0 (MVP) — 코드명 "Foundation"

### 3.1 목표 및 범위

| 항목 | 값 |
|------|-----|
| 코드명 | Foundation |
| 버전 | v0.1.0 |
| 목표 | 보안 기반(MFA+Rate Limit) + 운영 안정성(Vault+Capistrano+sysctl) + Auth Core 완성 + Storage(SeaweedFS) |
| Phase 범위 | Phase 15 + Phase 16 + Phase 17 |
| 총 공수 | 22h + 40h + 60h = **122h** |
| 기간 | Phase 15: 4주 / Phase 16: 6주 / Phase 17: 8주 = **18주** |
| 타겟 시점 | 2026-Q3 착수 → 2026-Q4 완료 (구체 날짜는 착수일 기준 산정) |
| 대상 사용자 | 김도영(오너·ADMIN) + 박민수(매니저·MANAGER) — 내부 검증 |
| 배포 채널 | canary 30분 검증 → stable 승격 |
| 14 카테고리 목표 점수 | Auth Advanced 60점 / Observability 85점 / Operations 95점 / Auth Core 90점 / Storage 90점 |

MVP의 핵심 가치명제: "보안 없이는 어떤 기능도 안전하지 않다." Phase 15에서 TOTP+WebAuthn+Rate Limit를 먼저 구축함으로써 이후 Phase 16~17에서 추가되는 Storage, Vault, Auth Core가 항상 보안 계층 위에 올라서도록 의존성 순서를 보장한다.

### 3.2 FR 범위 — P0 MVP 기능 21건

MVP에서 구현하는 FR은 `02-functional-requirements.md`의 P0 27건 중 보안·운영·인증·스토리지 직결 21건.

#### Phase 15 FR (Auth Advanced — 22h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P0 | FR-6.1 | TOTP MFA 등록·검증 | 6h | `02-architecture/06-auth-advanced-blueprint.md §3.2` | `TOTPService` (otplib) |
| P0 | FR-6.2 | WebAuthn 패스키 등록·인증 | 6h | `06-auth-advanced-blueprint.md §3.3` | `WebAuthnService` (@simplewebauthn) |
| P0 | FR-6.3 | MFA 백업 코드 (8개 일회용) | 2h | `06-auth-advanced-blueprint.md §3.4` | `BackupCodeService` |
| P0 | FR-6.4 | DB 기반 Rate Limit (IP·사용자별) | 5h | `06-auth-advanced-blueprint.md §4` | `RateLimitMiddleware` (PG `rate_limit_events`) |
| P0 | FR-6.5 | MFA 강제 정책 (Admin 설정) | 3h | `06-auth-advanced-blueprint.md §5` | `MFAPolicyService` |

**Phase 15 핵심 산출물**:
- `src/services/auth/totp.service.ts` — otplib 기반 TOTP 시드 생성, QR URI 발급, 코드 검증 (30초 TOTP-SHA1)
- `src/services/auth/webauthn.service.ts` — @simplewebauthn/server 등록·인증 플로우, RP ID = `stylelucky4u.com`
- `src/services/auth/backup-code.service.ts` — bcrypt 해시 저장, 일회용 소비 트랜잭션
- `src/middleware/rate-limit.ts` — PG `rate_limit_events` INSERT + COUNT 슬라이딩 윈도우, 5분 창 10회 초과 시 429
- `src/app/(protected)/settings/security/` — MFA 설정 페이지 (TOTP QR / WebAuthn 디바이스 목록 / 백업 코드 보기)

#### Phase 16 FR (Observability + Operations — 40h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P0 | FR-12.1 | Vault KEK→DEK AES-256-GCM envelope | 8h | `02-architecture/12-observability-blueprint.md §3` | `VaultService` (node:crypto) |
| P0 | FR-12.2 | MASTER_KEY 관리 (`/etc/luckystyle4u/secrets.env`) | 2h | `ADR-013`, `12-observability-blueprint.md §3.1` | PM2 `env_file` 주입 |
| P0 | FR-12.3 | jose JWKS ES256 엔드포인트 (`/auth/.well-known/jwks.json`) | 4h | `12-observability-blueprint.md §4` | `JWKSService` (jose) |
| P0 | FR-14.1 | Capistrano symlink 배포 구조 | 6h | `02-architecture/05-operations-blueprint.md §3` | `capistrano-deploy.sh` |
| P0 | FR-14.2 | 5초 롤백 스크립트 + PM2 graceful reload | 4h | `05-operations-blueprint.md §4` | `capistrano-deploy.sh rollback` |
| P0 | FR-14.3 | canary.stylelucky4u.com Cloudflare Rule 설정 | 4h | `04-integration/02-cloudflare-deployment-integration.md §8` | Cloudflare Dashboard |
| P0 | FR-14.4 | WSL2 sysctl 영속화 (`/etc/sysctl.d/99-cloudflared.conf`) | 2h | 세션 25-C 교훈, `cloudflare-deployment-integration.md §3` | systemd-sysctl |
| P0 | FR-12.4 | Vault UI — 시크릿 생성·조회·삭제 페이지 | 10h | `12-observability-blueprint.md §5` | `/admin/vault` 라우트 |

**Phase 16 핵심 산출물**:
- `src/services/vault/vault.service.ts` — MASTER_KEY(KEK) 로드, DEK 생성(crypto.randomBytes 32), AES-256-GCM 암복호화, Prisma `vault_secrets` 테이블 CRUD
- `src/app/api/auth/.well-known/jwks.json/route.ts` — jose ES256 키쌍 자동 생성·갱신, 공개키 JWK 직렬화
- `scripts/capistrano-deploy.sh` — 5단계: fetch → symlink → env → pm2-reload → health-check
- `scripts/capistrano-deploy.sh rollback` — symlink swap + pm2-reload ≤ 5초
- `/etc/sysctl.d/99-cloudflared.conf` — keepalive 60/10/6 + 16MB rmem/wmem (세션 25-C 영속화 완료)

#### Phase 17 FR (Auth Core + Storage — 60h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P0 | FR-5.1 | 세션 테이블 + SHA-256 해시 저장 | 5h | `02-architecture/05-auth-core-blueprint.md §3.1` | `SessionService` (Lucia 패턴) |
| P0 | FR-5.2 | Refresh Token 회전 + Reuse Detection | 4h | `05-auth-core-blueprint.md §3.2` | `RefreshTokenService` |
| P0 | FR-5.3 | 패스워드 정책 (bcrypt + 복잡도 규칙) | 3h | `05-auth-core-blueprint.md §3.3` | `PasswordPolicyService` |
| P0 | FR-5.4 | Anonymous 역할 구현 | 4h | `05-auth-core-blueprint.md §4` | Prisma `Role` enum 확장 |
| P0 | FR-5.5 | 디바이스 목록 + 세션 강제 종료 UI | 6h | `05-auth-core-blueprint.md §5` | `/settings/sessions` 라우트 |
| P0 | FR-5.6 | CSRF double-submit cookie 보호 | 3h | `05-auth-core-blueprint.md §3.4` | `CSRFMiddleware` |
| P0 | FR-7.1 | SeaweedFS 단일 인스턴스 배포 + 헬스체크 | 8h | `02-architecture/07-storage-blueprint.md §3` | SeaweedFS filer+volume |
| P0 | FR-7.2 | 파일 업로드 API (10MB 제한, S3-like PUT) | 6h | `07-storage-blueprint.md §4` | `/api/storage/buckets/:id/objects` |
| P0 | FR-7.3 | 버킷 생성·삭제 UI | 5h | `07-storage-blueprint.md §5` | `/storage/buckets` 라우트 |
| P0 | FR-7.4 | 파일 브라우저 (목록·다운로드·삭제) | 8h | `07-storage-blueprint.md §5.2` | `/storage/buckets/:id` 라우트 |
| P0 | FR-7.5 | B2 오프로드 설정 (Hot 30일 → Cold B2) | 4h | `07-storage-blueprint.md §6` (ADR-008) | SeaweedFS S3 Gateway + B2 |
| P0 | FR-7.6 | 용량 표시 UI + 50GB 경보 | 4h | `07-storage-blueprint.md §5.3` | PM2 메트릭 + Prometheus alert (ASM-4 EWI) |

**Phase 17 핵심 산출물**:
- `src/services/auth/session.service.ts` — SHA-256 해시 토큰 저장, 만료·취소·디바이스 관리
- `src/services/auth/refresh-token.service.ts` — Reuse Detection (revokedAt NULL 체크)
- `SeaweedFS` — `/home/dev/seaweedfs/` filer+volume 1노드, PM2 `seaweedfs-filer` + `seaweedfs-volume`
- `src/app/api/storage/` — 버킷 CRUD, 객체 업로드/다운로드/삭제 API
- `src/app/(protected)/storage/` — 버킷 목록 + 파일 브라우저 UI (shadcn/ui FileUpload)

### 3.3 NFR 범위

| NFR ID | 요구사항 | 측정 방법 |
|--------|---------|---------|
| NFR-SEC.1 | TOTP 시드는 Vault AES-256-GCM 암호화 저장 | Prisma `vault_secrets` 직접 SELECT → 암호문 확인 |
| NFR-SEC.2 | WebAuthn RP ID = `stylelucky4u.com` (origin 검증) | Playwright E2E 잘못된 origin 테스트 |
| NFR-SEC.3 | Rate Limit: 5분 창 10회 초과 → 429, 반환값 `X-RateLimit-Reset` | Unit: 슬라이딩 윈도우 카운터 |
| NFR-SEC.4 | MASTER_KEY 파일 권한 root:ypb-runtime 0640 | `stat /etc/luckystyle4u/secrets.env` CI 체크 |
| NFR-SEC.5 | JWKS 키쌍 ES256, 키 길이 P-256 | jose 검증 단위 테스트 |
| NFR-SEC.6 | bcrypt cost factor ≥ 12 | Unit: hash 검증 |
| NFR-SEC.7 | CSRF 토큰 불일치 시 403 응답 | Integration: 위조 토큰 요청 테스트 |
| NFR-SEC.8 | MFA 백업 코드 일회용 사용 후 즉시 무효화 | Integration: 동일 코드 2회 사용 → 2회째 401 |
| NFR-SEC.9 | Refresh Token Reuse → 세션 전체 취소 | Integration: 회전 전 토큰 재사용 시도 |
| NFR-SEC.10 | SeaweedFS API는 WSL2 루프백만 수신 (0.0.0.0 바인딩 금지) | `ss -tlnp | grep 8888` — 127.0.0.1 확인 |
| NFR-REL.1 | 롤백 완료 ≤ 5초 (symlink + pm2 reload) | `capistrano-deploy.sh rollback` 타이밍 측정 |
| NFR-REL.2 | canary 배포 후 30분 이내 이상 없으면 stable 승격 | 운영 체크리스트 |
| NFR-REL.3 | PM2 cluster:4 중 1 Worker 죽어도 트래픽 계속 처리 | k6 부하 중 Worker 강제 종료 테스트 |
| NFR-REL.4 | Cloudflare Tunnel 530 비율 ≤ 1% (1주 평균) | `scripts/tunnel-measure-v2.sh` 주간 기록 |
| NFR-REL.5 | SeaweedFS 재시작 실패 ≤ 0건/주 (ASM-4 EWI 기준) | PM2 로그 + alert |
| NFR-OPS.1 | Vault 시크릿 UI에서 Create/Read/Delete 30초 이내 완료 | Manual QA 타이머 측정 |
| NFR-OPS.2 | JWKS 엔드포인트 응답 p95 < 200ms | k6 100 req/s |
| NFR-OPS.3 | 파일 업로드 10MB → SeaweedFS 저장 완료 ≤ 5초 | Integration: curl PUT 타이밍 |
| NFR-OPS.4 | pm2-smart.service systemd enabled → Windows 재시작 후 자동 복구 | 재시작 후 `pm2 status` 확인 |
| NFR-OPS.5 | Capistrano releases/ 디렉토리 최대 5개 보존 (오래된 것 자동 삭제) | `capistrano-deploy.sh cleanup` |

### 3.4 릴리스 기준 (Release Criteria) — v0.1.0

다음 모든 항목을 충족해야 v0.1.0 태그를 생성하고 stable 채널에 promote한다.

- [ ] **FR 완성**: Phase 15+16+17 FR 21건 전체 구현 완료, 기능별 단위 테스트 존재
- [ ] **커버리지**: Vitest 단위 테스트 80% 커버리지 (Auth/Vault/Capistrano 3개 모듈 필수)
- [ ] **E2E**: Playwright `retries:2` 기준으로 MFA 등록·로그인 E2E PASS (530 산발 흡수)
- [ ] **Tunnel**: `scripts/tunnel-measure-v2.sh` 50회 연속 → 5xx 0건 (≥ 99% edge 관통)
- [ ] **롤백 dry-run**: `capistrano-deploy.sh rollback` dry-run 실행 → 5초 이내 완료 + 500 없음
- [ ] **보안 감사**: `npm audit --audit-level=moderate` → 0건 (moderate 이상 취약점 없음)
- [ ] **MASTER_KEY**: `/etc/luckystyle4u/secrets.env` 권한 0640 확인 + 인쇄 백업본 존재
- [ ] **SeaweedFS**: 10MB 파일 업로드 + 다운로드 + 삭제 왕복 정상, restart 0건/72h
- [ ] **문서**: 세션 종료 4단계 (current.md + logs + handover + next-dev-prompt.md) 완료
- [ ] **피처 플래그**: `TOTP_MFA_ENABLED`, `WEBAUTHN_ENABLED`, `VAULT_ENABLED`, `SEAWEEDFS_ENABLED` 4개 플래그 production에서 `true`

---

## 4. 릴리스 v0.2.0 (Beta) — 코드명 "Editors"

### 4.1 목표 및 범위

| 항목 | 값 |
|------|-----|
| 코드명 | Editors |
| 버전 | v0.2.0 |
| 목표 | SQL Editor·Table Editor 고도화 + Edge Functions 3층 하이브리드 + Realtime CDC + OAuth 조건부 |
| Phase 범위 | Phase 18 + Phase 19 |
| 총 공수 | 400h + 75h = **475h** |
| 기간 | Phase 18: 약 16주(공수 400h 최대) / Phase 19: 6주 = **+14주 (MVP 완료 후)** |
| 타겟 시점 | v0.1.0 완료 + 14주 |
| 대상 사용자 | 김도영(오너) + 내부 베타 검증 |
| 배포 채널 | canary 30분 → stable (동일 정책) |
| 14 카테고리 목표 점수 | SQL Editor 95점 / Table Editor 95점 / Edge Functions 92점 / Realtime 100점 |

Beta의 핵심 가치명제: "Supabase Cloud 핵심 개발자 도구 동등." SQL Editor와 Table Editor를 95점까지 끌어올리고, Edge Functions 3층(isolated-vm L1 → Deno L2 → Vercel Sandbox L3)과 Realtime CDC(wal2json + supabase-realtime 포팅 2계층)를 안정화한다. Phase 18은 전체 14 카테고리 중 공수 최대(400h ≈ 40일)이므로 세부 태스크 분해가 필요하다.

### 4.2 FR 범위 — Beta 추가 기능 21건

#### Phase 18 FR (SQL Editor + Table Editor + OAuth — 약 400h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P0 | FR-2.1 | Monaco 기반 SQL 에디터 + 멀티탭 | 30h | `02-architecture/02-sql-editor-blueprint.md §3` | Monaco Editor, Drizzle SQLite 세션 |
| P0 | FR-2.2 | EXPLAIN Plan Visualizer (xyflow) | 20h | `02-sql-editor-blueprint.md §4` | `@xyflow/react` + elkjs |
| P0 | FR-2.3 | AI SQL 어시스턴트 (BYOK, Anthropic Haiku) | 30h | `02-sql-editor-blueprint.md §5` | AI SDK v6 + `mcp-luckystyle4u` |
| P0 | FR-2.4 | 쿼리 히스토리 + 즐겨찾기 (SQLite 영속) | 20h | `02-sql-editor-blueprint.md §6` | Drizzle `query_history` 테이블 |
| P0 | FR-2.5 | Persisted Query 저장 (폴더·태그 관리) | 20h | `02-sql-editor-blueprint.md §7` | Drizzle `saved_queries` 테이블 |
| P0 | FR-2.6 | 위험 쿼리 2단계 확인 (DROP/TRUNCATE 등) | 5h | `02-sql-editor-blueprint.md §3.3` | `DangerQueryGuard` |
| P0 | FR-2.7 | 쿼리 결과 CSV 다운로드 | 5h | `02-sql-editor-blueprint.md §3.4` | 스트리밍 Response |
| P0 | FR-2.8 | 쿼리 공유 URL (단기 토큰 SQLite 저장) | 15h | `02-sql-editor-blueprint.md §8` | `QueryShareService` |
| P1 | FR-1.4 | RLS 정책 UI 생성기 (14c-β) | 20h | `01-table-editor-blueprint.md §4` | `/database/policies` 라우트 |
| P1 | FR-1.5 | 외래키 그래프 뷰 (xyflow, 14d) | 15h | `01-table-editor-blueprint.md §5` | `@xyflow/react` 관계 그래프 |
| P1 | FR-1.6 | 컬럼 통계 + CSV 내보내기 | 10h | `01-table-editor-blueprint.md §5.2` | `ColumnStatsService` |
| P0 | FR-5.7 | OAuth Providers 조건부 도입 (ADR-017) | 40h | `05-auth-core-blueprint.md §6`, ADR-017 | GitHub+Google PKCE 플로우 |
| P1 | FR-5.8 | 로그인 감사 로그 UI | 15h | `05-auth-core-blueprint.md §5` | `/settings/audit-log` 라우트 |

*주의: Phase 18 공수 합산 약 245h(위 FR 기준). 전체 400h에는 리팩토링·테스트·문서·마이그레이션 공수 포함.*

SQL Editor 400h의 세부 공수 배분 (`02-sql-editor-blueprint.md` Phase 18 WBS 참조):
- supabase-studio 패턴 3중 흡수 + App Router 재구현: 60h
- Monaco 언어 서버 (PostgreSQL SQL 자동완성, introspection 연동): 40h
- Outerbase 탭 UX 패턴 흡수: 20h
- sqlpad 히스토리 UX 회귀 흡수: 20h
- AI SDK v6 통합 + BYOK 설정 UI: 30h
- Plan Visualizer (xyflow 기반): 20h
- Persisted Query + 폴더/태그: 20h
- 테스트(Vitest unit + Playwright E2E): 40h
- Apache-2.0 라이선스 헤더 보존 검증: 5h
- 마이그레이션 + 문서: 20h
- OAuth PKCE 플로우 (ADR-017): 40h
- Table Editor 14c-β·14d 완성: 65h 이상

#### Phase 19 FR (Edge Functions + Realtime — 75h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P0 | FR-8.1 | isolated-vm v6 L1 기본 실행 (JS 샌드박스) | 15h | `02-architecture/08-edge-functions-blueprint.md §3` | `isolated-vm` v6 |
| P0 | FR-8.2 | L1 UI 에디터 + 배포 UI + 시크릿 주입 | 20h | `08-edge-functions-blueprint.md §4` | `/edge-functions` 라우트 |
| P1 | FR-8.3 | Deno 사이드카 L2 (npm import 지원) | 10h | `08-edge-functions-blueprint.md §5` | Deno 사이드카 프로세스 |
| P1 | FR-8.4 | `decideRuntime()` 자동 라우팅 | 5h | `08-edge-functions-blueprint.md §6` | `RuntimeRouter` |
| P0 | FR-9.1 | wal2json CDC 채널 활성화 + 이벤트 버스 | 10h | `02-architecture/09-realtime-blueprint.md §3` | wal2json + EventBus |
| P0 | FR-9.2 | supabase-realtime 포팅 Channel API (subscribe/unsubscribe) | 10h | `09-realtime-blueprint.md §4` | `ChannelService` (Node 포팅) |
| P1 | FR-9.3 | Presence (온라인 사용자 추적) | 5h | `09-realtime-blueprint.md §5` | `PresenceService` |

### 4.3 NFR 범위 (Beta 추가)

| NFR ID | 요구사항 | 측정 방법 |
|--------|---------|---------|
| NFR-PERF.1 | SQL 실행 결과 렌더링 (1000 row) p95 < 800ms | k6 부하 측정 |
| NFR-PERF.2 | Monaco 에디터 첫 로드 p95 < 1.5s | Playwright performance.measure |
| NFR-PERF.3 | isolated-vm L1 cold start ≤ 50ms | Unit: `performance.now()` 측정 |
| NFR-PERF.4 | Realtime CDC 이벤트 전파 지연 p95 < 200ms | Integration: PG 변경 → 클라이언트 수신 타이밍 |
| NFR-SEC.11 | OAuth PKCE state 파라미터 검증 실패 시 401 | Integration: state 조작 시도 |
| NFR-SEC.12 | isolated-vm 함수 타임아웃 5초 강제 종료 | Unit: 무한루프 함수 실행 테스트 |
| NFR-SEC.13 | isolated-vm 메모리 128MB 제한 | Unit: 대형 객체 생성 → OOM 확인 |
| NFR-REL.6 | Realtime 연결 끊김 → 자동 재연결 ≤ 5초 | Integration: 네트워크 차단 후 복구 |
| NFR-REL.7 | Edge Functions L1 실패 → 에러 로그 + 클라이언트 500 | Integration: 에러 시나리오 |
| NFR-COST.1 | AI SDK BYOK 월 비용 ≤ $5 (ASM-10 기준) | Anthropic API 대시보드 모니터링 |
| NFR-COST.2 | Vercel Sandbox L3 월 invocation ≤ 10만 (ADR-009 재검토 트리거) | Vercel 대시보드 |

### 4.4 릴리스 기준 (Release Criteria) — v0.2.0

다음 모든 항목을 충족해야 v0.2.0 태그를 생성하고 stable 채널에 promote한다.

- [ ] **선행 조건**: v0.1.0 완료 후 **24h 안정성** 확인 (Tunnel 530 비율 < 1%, PM2 crash 0건)
- [ ] **Storage 스파이크**: `spikes/spike-007-seaweedfs-50gb.md` — 50GB 부하 테스트 PASS (메모리 ≤ 2GB, OOM 없음)
- [ ] **Edge Functions 스파이크**: `docs/research/spikes/spike-005-edge-functions.md` — isolated-vm L1 cold start ≤ 50ms PASS
- [ ] **FR 완성**: Phase 18+19 FR 21건 전체 구현 완료
- [ ] **커버리지**: Vitest 80% (SQL Editor + Edge Functions + Realtime 모듈)
- [ ] **E2E**: Playwright — SQL 실행·저장·히스토리 조회 PASS + MFA 로그인 → SQL 실행 통합 시나리오 PASS
- [ ] **Tunnel**: `tunnel-measure-v2.sh` 50회 → 5xx 0건
- [ ] **OAuth**: GitHub 로그인 PKCE 플로우 수동 QA PASS (Google은 선택)
- [ ] **AI 비용**: Anthropic 대시보드 확인 → 테스트 기간 $5 이내
- [ ] **문서**: 세션 종료 4단계 완료

---

## 5. 릴리스 v1.0.0 (GA) — 코드명 "Parity"

### 5.1 목표 및 범위

| 항목 | 값 |
|------|-----|
| 코드명 | Parity |
| 버전 | v1.0.0 |
| 목표 | 14 카테고리 전부 90점 이상 + 100점 보너스 채우기 → Supabase Self-Hosted 100점 동등 달성 |
| Phase 범위 | Phase 20 + Phase 21 + Phase 22 |
| 총 공수 | 198h + 40h + ~30h = **~268h** |
| 기간 | Phase 20: 약 8주 / Phase 21: 4주 / Phase 22: 2주+ = **+10~14주 (Beta 완료 후)** |
| 타겟 시점 | v0.2.0 완료 + 10주~ |
| 대상 사용자 | 김도영(오너) — 전 기능 검증 |
| 배포 채널 | canary 30분 → stable (동일 정책) |
| 14 카테고리 목표 점수 | 전 카테고리 90점 이상 / Auth Advanced·Realtime·Table Editor 100점 |

GA의 핵심 가치명제: "Supabase Self-Hosted 100점 동등 + 양평 특화 5%." Phase 20에서 Schema Visualizer·DB Ops·Advisors 3개를 병렬 구현하고, Phase 21에서 Data API(REST+pgmq)와 UX Quality(AI SDK v6)를 완성한다. Phase 22는 잔여 갭을 채우는 "보너스" Phase — pg_graphql 조건부, OAuth 확장, WebAuthn Conditional UI, Anonymous role 등.

### 5.2 FR 범위 — GA 추가 기능 30건+

#### Phase 20 FR (Schema Visualizer + DB Ops + Advisors — 198h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P1 | FR-3.1 | schemalint 컨벤션 검사 통합 + 자동 레이아웃(elkjs) | 20h | `02-architecture/03-schema-viz-blueprint.md §3` | `schemalint` TS 포팅 |
| P1 | FR-3.2 | RLS 정책 UI `/database/policies` 신설 | 15h | `03-schema-viz-blueprint.md §4` | Monaco + `pg_policies` |
| P1 | FR-3.3 | 함수 편집기 UI `/database/functions` | 10h | `03-schema-viz-blueprint.md §5` | Monaco 편집기 |
| P1 | FR-3.4 | 트리거 관리 UI `/database/triggers` | 10h | `03-schema-viz-blueprint.md §6` | Prisma `information_schema` |
| P1 | FR-3.5 | 인터랙티브 관계 편집 + 마이그레이션 diff 뷰 | 15h | `03-schema-viz-blueprint.md §7` | xyflow 인터랙션 |
| P1 | FR-4.1 | node-cron UI 기반 Cron 관리 (생성·편집·실행 로그) | 20h | `02-architecture/04-db-ops-blueprint.md §3` | `CronService` + `/database/cron` 라우트 |
| P1 | FR-4.2 | 웹훅 UI (생성·편집·실행 로그) | 15h | `04-db-ops-blueprint.md §4` | `WebhookService` + `/database/webhooks` 라우트 |
| P1 | FR-4.3 | wal-g + B2 백업 UI (목록·복원) | 15h | `04-db-ops-blueprint.md §5` | wal-g CLI 래퍼 |
| P1 | FR-4.4 | RPO 60초 달성 (WAL 아카이빙) | 20h | `04-db-ops-blueprint.md §5.2` | PostgreSQL `archive_command` + wal-g |
| P1 | FR-4.5 | RTO 30분 달성 (wal-g 복원 드릴 자동화) | 10h | `04-db-ops-blueprint.md §6` | 월간 복원 드릴 스케줄 |
| P1 | FR-4.6 | B2 원격 백업 무결성 검증 | 8h | `04-db-ops-blueprint.md §6.2` | Checksum 비교 자동화 |
| P1 | FR-10.1 | 3-Layer Advisor UI (schemalint+squawk+splinter 통합) | 20h | `02-architecture/10-advisors-blueprint.md §3` | `/advisors` 라우트 |
| P1 | FR-10.2 | squawk DDL 위험 검사 CI 연동 | 10h | `10-advisors-blueprint.md §4` | squawk CLI 통합 |
| P1 | FR-10.3 | splinter 38룰 Node TS 포팅 (점진 머지) | 20h | `10-advisors-blueprint.md §5` | `SplinterAdapter` |

#### Phase 21 FR (Data API + UX Quality — 40h)

| 우선순위 | FR ID | 기능명 | 공수 | 청사진 참조 | 담당 모듈 |
|---------|-------|--------|------|-----------|----------|
| P1 | FR-11.1 | REST API 강화 (OpenAPI 스펙 자동생성) | 10h | `02-architecture/11-data-api-blueprint.md §3` | `@anatine/zod-openapi` |
| P1 | FR-11.2 | pgmq 큐 관리 UI (생성·메시지 발행·아카이브) | 8h | `11-data-api-blueprint.md §4` | pgmq PG 확장 + `/data-api/queues` |
| P1 | FR-11.3 | PostgREST-호환 필터링 문법 (관계 조인, RLS 적용) | 10h | `11-data-api-blueprint.md §5` | `PostgRESTCompat` 미들웨어 |
| P1 | FR-13.1 | MCP 서버 `mcp-luckystyle4u` 자체 구현 | 8h | `02-architecture/13-ux-quality-blueprint.md §4` | `mcp-server.ts` (표준 MCP 프로토콜) |
| P1 | FR-13.2 | AI 비용 투명성 대시보드 (월간 토큰·비용 추적) | 4h | `13-ux-quality-blueprint.md §5` | Drizzle `ai_usage_log` + `/admin/ai-cost` |

#### Phase 22 FR — 100점 보너스 채우기 (약 30h)

Phase 22는 `10-14-categories-priority.md §7.1`에서 정의된 "잔여 갭 처리" Phase다. 모든 카테고리가 90점 이상 달성된 후 시작하며, 조건부 기능과 5% 양평 특화 기능을 추가한다.

| 우선순위 | FR ID | 기능명 | 공수 | 조건 | 담당 모듈 |
|---------|-------|--------|------|------|----------|
| P2 | FR-11.4 | pg_graphql 조건부 도입 | 15h | 4 트리거 중 2+ 충족 시 (ADR-016) | `pg_graphql` PG 확장 |
| P2 | FR-6.6 | OAuth Providers 확장 (Naver/Kakao) | 6h | DQ-AC-8/AC-9 답변 확정 시 | OAuth PKCE 추가 |
| P2 | FR-6.7 | WebAuthn Conditional UI (Chrome 121+ Passkey) | 4h | DQ-AA-9 답변 + 크롬 121+ 안정화 | `conditional mediation` API |
| P2 | FR-5.9 | Anonymous role 구현 완성 | 3h | DQ-AC-3 답변 확정 시 | Prisma `Role.ANONYMOUS` |
| P2 | FR-13.3 | `mcp-luckystyle4u` 고도화 (DB 쿼리·Vault 접근 도구) | 5h | Phase 21 MCP 서버 기반 위 | MCP Tool 확장 |

### 5.3 NFR 범위 (GA 추가)

| NFR ID | 요구사항 | 측정 방법 |
|--------|---------|---------|
| NFR-DATA.1 | RPO 60초: WAL 아카이빙 갭 측정 | PG `pg_current_wal_lsn()` + B2 최신 아카이브 비교 |
| NFR-DATA.2 | RTO 30분: wal-g 복원 드릴 실제 측정 | 월간 복원 드릴 타이밍 기록 |
| NFR-DATA.3 | B2 백업 무결성: SHA-256 체크섬 불일치 0건 | 자동 검증 스크립트 |
| NFR-PERF.5 | Schema Visualizer elkjs 레이아웃 p95 < 1.5s (100 테이블 기준) | `performance.measure` |
| NFR-PERF.6 | pgmq 큐 메시지 발행 p95 < 100ms | k6 |
| NFR-PERF.7 | REST API (OpenAPI 기반) p95 < 300ms | k6 100 req/s |
| NFR-OPS.6 | Cron 작업 실행 지연 ≤ 1분 (scheduling accuracy) | node-cron 실행 로그 타임스탬프 |
| NFR-OPS.7 | Advisor 보고서 생성 p95 < 5s (splinter 38룰 전체) | Integration 타이밍 |
| NFR-COST.3 | pg_graphql 도입 시 추가 공수 ≤ 15h (ADR-016 기준) | 구현 후 실측 |

### 5.4 릴리스 기준 (Release Criteria) — v1.0.0

다음 모든 항목을 충족해야 v1.0.0 태그를 생성하고 stable 채널에 promote한다.

- [ ] **선행 조건**: v0.2.0 완료 후 **1개월** 운영 인시던트 SEV1(서비스 불가) 0건
- [ ] **Realtime 스파이크**: `docs/research/spikes/spike-008-realtime-pg.md` — wal2json PG 15/16 호환 PASS
- [ ] **FR 완성**: Phase 20+21 FR 19건 전체 구현 완료, Phase 22 보너스 조건부 FR 처리 완료
- [ ] **14 카테고리 점수**: 전체 90점 이상 달성 (04-go-no-go-checklist.md 카테고리 점수 자체 평가)
- [ ] **E2E 전체**: Playwright — Auth·SQL·Storage·Realtime·Edge Functions 통합 시나리오 PASS
- [ ] **커버리지**: Vitest 80% 전 모듈 (Alpha 모듈 제외)
- [ ] **Tunnel**: `tunnel-measure-v2.sh` 100회 → 5xx 0건 (24h 모니터링 포함)
- [ ] **DB Ops**: 복원 드릴 타이밍 ≤ 30분 기록 + B2 체크섬 검증 PASS
- [ ] **보안 감사**: npm audit moderate 이상 0건 + JWKS 만료 키 교체 확인
- [ ] **Phase 22 보너스**: 조건 충족 FR 구현 완료 또는 "조건 미충족" 명시적 ADR 기록
- [ ] **문서**: 세션 종료 4단계 + CHANGELOG.md v1.0.0 항목 + 운영 가이드(`docs/guides/`) 갱신

---

## 6. 릴리스 간 의존성 다이어그램

아래 ASCII 다이어그램은 3개 릴리스(MVP → Beta → GA) 간 필수 의존성과 스파이크 게이트를 표현한다.

```
┌─────────────────────────────────────────────────────────────────┐
│ v0.1.0 "Foundation" (Phase 15 + 16 + 17)                       │
│                                                                 │
│  Phase 15 (22h)         Phase 16 (40h)        Phase 17 (60h)   │
│  ├─ FR-6.1 TOTP         ├─ FR-12.1 Vault       ├─ FR-5.1 세션  │
│  ├─ FR-6.2 WebAuthn     ├─ FR-12.3 JWKS        ├─ FR-5.2 RTR  │
│  ├─ FR-6.3 백업코드      ├─ FR-14.1 Capistrano  ├─ FR-7.1 SeaWF│
│  ├─ FR-6.4 RateLimit    ├─ FR-14.2 5초롤백     ├─ FR-7.2 Upload│
│  └─ FR-6.5 MFA정책      ├─ FR-14.3 canary DNS  └─ FR-7.3~6 UI │
│                         └─ FR-12.4 Vault UI                    │
│                                                                 │
│  필수 게이트:                                                    │
│  ✅ Auth Core(70점) 기 작동 → Phase 15 MFA 계층 추가            │
│  ✅ Phase 15 완료 → Phase 16 JWKS(MFA 토큰 검증 필요)           │
│  ✅ Phase 16 Capistrano 검증 → Phase 17 대규모 배포 안전망      │
│  ✅ Phase 16 Vault → Phase 17 시크릿 수 증가 전 완성            │
│  ✅ 스파이크: ASM-4 (SeaweedFS 50GB) 통과 후 Phase 17 착수      │
│                                                                 │
│  릴리스 기준: FR 21건 + Vitest 80% + E2E MFA PASS + 530 <1%   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
          필수: v0.1.0 24h 안정성 (530 <1%, PM2 crash 0건)
          필수: spike-007 SeaweedFS 50GB 부하 테스트 PASS
          필수: spike-005 Edge Functions L1 cold start ≤50ms PASS
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ v0.2.0 "Editors" (Phase 18 + 19)                               │
│                                                                 │
│  Phase 18 (400h)                     Phase 19 (75h)            │
│  ├─ FR-2.1~2.8 SQL Editor 완성       ├─ FR-8.1~8.4 Edge Fn 3층│
│  ├─ FR-1.4~1.6 Table Editor 14c-β·14d├─ FR-9.1~9.3 Realtime   │
│  └─ FR-5.7 OAuth GitHub+Google       └─ wal2json + 채널 포팅   │
│                                                                 │
│  내부 의존성:                                                    │
│  Phase 18 Table Editor 14c-β 완성 → Phase 20 Schema Viz 가능  │
│  Phase 18 SQL Editor 완성 → Phase 20 Advisors(splinter) 연동  │
│  Phase 17 Storage → Phase 19 Edge Functions 버킷 접근          │
│  Phase 19 Realtime → Phase 21 Data API 구독 통합               │
│                                                                 │
│  릴리스 기준: FR 21건 + SQL·Edge·Realtime E2E + AI 비용 ≤$5   │
└───────────────────────┬─────────────────────────────────────────┘
                        │
          필수: v0.2.0 1개월 인시던트 SEV1 0건
          필수: spike-008 Realtime wal2json PG 15/16 호환 PASS
          필수: Phase 22 보너스 조건 사전 평가 (ADR-016 체크)
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ v1.0.0 "Parity" (Phase 20 + 21 + 22)                          │
│                                                                 │
│  Phase 20 (198h)          Phase 21 (40h)     Phase 22 (~30h)   │
│  ├─ FR-3.1~3.5 Schema Viz ├─ FR-11.1~11.3   ├─ FR-11.4 GraphQL│
│  ├─ FR-4.1~4.6 DB Ops     │   Data API       ├─ FR-6.6 OAuth   │
│  └─ FR-10.1~10.3 Advisors └─ FR-13.1~13.2   │   Naver/Kakao   │
│     (Schema Viz,DB Ops,       UX Quality(AI) ├─ FR-6.7 WebAuthn│
│      Advisors 3개 병렬)                       │   Conditional UI│
│                                              └─ FR-5.9 Anon role│
│                                                                 │
│  100점 보너스 조건:                                              │
│  pg_graphql: ADR-016 4 트리거 중 2+ 충족 시 도입               │
│  OAuth 확장: DQ-AC-8/AC-9 확정 시 Naver/Kakao 추가            │
│  WebAuthn Conditional UI: Chrome 121+ 안정화 확인              │
│  Anonymous role: DQ-AC-3 답변 확정 시                          │
│                                                                 │
│  릴리스 기준: 14 카테고리 90점+ + DB 복원 드릴 RTO 30분 PASS   │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
          Supabase Self-Hosted 100점 동등 달성
          (100점 = 95% 커버리지 + 양평 특화 5%)
          총 누적: MVP 122h + Beta 475h + GA 268h = 865h
          + 마이그레이션·문서·운영 분산 15h = ~880h
```

---

## 7. 마일스톤 ↔ 릴리스 매핑표

| Phase | 마일스톤 ID | 마일스톤 명 | 시작 주차 | 완료 주차 | 릴리스 | 공수 |
|-------|-----------|-----------|---------|---------|-------|-----|
| Phase 15 | M1-Auth-Adv | Auth Advanced 기반 구축 | W1 | W4 | v0.1.0 (MVP) | 22h |
| Phase 16 | M2-Obs-Ops | Observability+Operations 보강 | W5 | W10 | v0.1.0 (MVP) | 40h |
| Phase 17 | M3-Core-Storage | Auth Core 완성 + SeaweedFS Storage | W11 | W18 | v0.1.0 (MVP) | 60h |
| — | M-MVP-RC | MVP 릴리스 후보 + 기준 검증 | W19 | W19 | v0.1.0-rc.1 → v0.1.0 | — |
| Phase 18 | M4-Editors | SQL Editor·Table Editor 고도화 | W20 | W35 | v0.2.0 (Beta) | 400h |
| Phase 19 | M5-Edge-Realtime | Edge Functions 3층 + Realtime CDC | W36 | W41 | v0.2.0 (Beta) | 75h |
| — | M-Beta-RC | Beta 릴리스 후보 + 기준 검증 | W42 | W42 | v0.2.0-rc.1 → v0.2.0 | — |
| Phase 20 | M6-DB-Mgmt | Schema Viz + DB Ops + Advisors (병렬) | W43 | W50 | v1.0.0 (GA) | 198h |
| Phase 21 | M7-API-UX | Data API 완성 + UX Quality | W51 | W54 | v1.0.0 (GA) | 40h |
| Phase 22 | M8-Bonus | 100점 보너스 채우기 | W55 | W56+ | v1.0.0 (GA) | ~30h |
| — | M-GA-RC | GA 릴리스 후보 + 전 기준 검증 | W57 | W57 | v1.0.0-rc.1 → v1.0.0 | — |

**총 공수 합계 검증**:
- Phase 15: 22h
- Phase 16: 40h
- Phase 17: 60h
- Phase 18: 400h (SQL Editor 최대 공수 포함)
- Phase 19: 75h
- Phase 20: 198h
- Phase 21: 40h
- Phase 22: ~30h
- **소계**: 865h
- 마이그레이션·문서·운영·RC 검증 분산: ~15h
- **총합**: **~880h** (Wave 3 `05-100점-definition.md §4.3` "실제 600~800h" 하한 + RC 검증 포함 상한)

**주차 기준**: W1 = 착수일 (2026-Q3 예정). 총 57주+는 1주 20h 작업 기준 2.5년 사이드 프로젝트 규모이나, 착수 후 집중 투입 시 12~18개월 달성 가능.

---

## 8. Cloudflare Tunnel + WSL2 환경 특수 고려

### 8.1 canary 서브도메인 시간차 정책 (ADR-015 + 세션 25-C 교훈)

canary 배포는 단순 "테스트 후 승격"이 아닌 **확률적 안정성 측정** 기반 시간차 정책을 따른다. 세션 25-C에서 확인된 교훈: "curl 28/28 성공 = 확률적으로 매우 높은 안정성이지만 100% 보증 아님." KT 회선 패킷 drop이 완전 소실된 게 아니라 빈도 격감된 상태이므로, 시간 기반 관찰이 필수다.

```
canary 배포 시퀀스:
  T+0:    luckystyle4u-canary PM2 앱 reload (port 3002)
  T+1m:   tunnel-measure-v2.sh 10회 → 5xx 0건 확인 (초기 점검)
  T+15m:  tunnel-measure-v2.sh 14회 → 5xx 0건 확인 (중간 점검)
  T+30m:  tunnel-measure-v2.sh 14회 → 5xx 0건 + PM2 crash 0건 확인
  T+30m+: "canary 30분 PASS" → capistrano-deploy.sh promote
  이상:   즉시 rollback (symlink + pm2-reload, ≤5초)
```

**Cloudflare 트래픽 분할 방식**: `cf-ray` 헤더 해시 기반 10% → 50% → 100% 단계적 롤아웃은 Wave 5 이후 Cloudflare Workers 스크립트 도입 시 구현. 현재는 canary 서브도메인 완전 분리(localhost:3002)로 충분.

### 8.2 QUIC→HTTP/2 폴백 강제 (ADR-015 + 세션 25-B/25-C)

Cloudflare Tunnel `config.yml`에서 `protocol: http2` 명시 강제 (QUIC UDP는 KT 가정용 회선에서 산발 drop 유발). `originRequest.keepAliveTimeout: 90s`로 connector 연결 유지 (세션 25-B `25-B 결정` 인용).

```yaml
# /home/dev/.cloudflared/config.yml (핵심 설정)
tunnel: 2e18470f-b351-46ab-bf07-ead0d1979fb9
credentials-file: /home/dev/.cloudflared/2e18470f-*.json
protocol: http2          # QUIC 폴백 금지, HTTP/2 고정
ingress:
  - hostname: stylelucky4u.com
    service: http://localhost:3000
    originRequest:
      keepAliveTimeout: 90s   # 세션 25-B 결정
      keepAliveConnections: 4  # connector 수와 일치
  - hostname: canary.stylelucky4u.com
    service: http://localhost:3002
    originRequest:
      keepAliveTimeout: 90s
  - service: http_status:404
```

### 8.3 530 산발 대응 절차 (세션 25-C 교훈 영속화)

530 에러는 Cloudflare Tunnel connector가 upstream(localhost)에 도달 실패 시 발생. 세션 25-A~C를 통해 확립한 대응 절차:

**즉시 조치 (1분 이내)**:
```bash
# 1. cloudflared 재기동 (connector 재등록)
pm2 restart cloudflared
# 2. 30~40초 propagation 대기 (icn06/icn01 재연결)
# 3. 측정 확인
bash scripts/tunnel-measure-v2.sh
```

**Playwright 대응 (세션 25-C #5 교훈)**:
- `playwright.config.ts`에 `retries: 2` 추가 → 산발 530 1건 흡수
- `login()` 헬퍼에 `response.status() === 530` 체크 + 지수 백오프 재시도 (1s → 2s → 4s)
- 530 연속 3회 → 테스트 실패 + `CLOUDFLARE_530` 태그

**주간 회귀 모니터링**:
```bash
# scripts/tunnel-measure-v2.sh 주간 실행 (매주 월요일 09:00)
# node-cron 또는 PM2 cron-worker 스케줄에 등록
# 대상: https://stylelucky4u.com/login (공개 라우트, 200 기준)
# 기준: 14 trial × 5s 간격, 5xx 0건 목표
# 결과: docs/logs/tunnel-weekly-YYYY-MM.md 기록
```

### 8.4 sysctl 영속화 — WSL2 재시작 내성 (세션 25-C 완료)

`/etc/sysctl.d/99-cloudflared.conf` 작성 완료 (세션 25-C). systemd-sysctl.service가 boot 시 자동 로드 → Windows 재시작 후에도 영속.

```ini
net.ipv4.tcp_keepalive_time = 60    # 기본 7200 → 60 (120배 단축)
net.ipv4.tcp_keepalive_intvl = 10   # 기본 75 → 10
net.ipv4.tcp_keepalive_probes = 6   # 기본 9 → 6
net.core.rmem_max = 16777216        # 기본 212992 → 16MB (79배 확대)
net.core.wmem_max = 16777216        # 기본 212992 → 16MB
```

적용 확인: `sysctl net.ipv4.tcp_keepalive_time` → `60` 출력 확인. 설정 변경 시 `pm2 restart cloudflared` 필수 (새 소켓에만 적용되는 커널 설정 특성).

### 8.5 다중 cloudflared 인스턴스 재고 (세션 25-C #3 승격)

세션 25-C Playwright 530 재발(S1 테스트)로 `다중 cloudflared 인스턴스 round-robin` 방안이 "재고 대상 승격"됨. Phase 16 Operations 강화 작업에서 평가:
- 방안: PM2에 `cloudflared-1`(fork:1) + `cloudflared-2`(fork:1) 2인스턴스 구성
- 기대효과: 한 connector가 packet drop 시 다른 connector가 흡수 → 530 산발 완화
- 검증: 2인스턴스 구성 후 Playwright 100회 실행 → 530 비율 측정
- 위험: Cloudflare 무료 플랜 다중 connector 정책 확인 필요

---

## 9. Phase 22 보너스 정의

Phase 22는 `10-14-categories-priority.md §7.1 v1.0 완료 기준`의 "100점 완성" 정의에서 언급된 "100점 보너스" Phase이다. Phase 20+21 완료 후 14 카테고리 전부 90점 이상 달성된 상태에서, 아래 조건부·선택적 기능을 추가해 진정한 100점(= 95% Supabase 커버리지 + 5% 양평 특화)을 완성한다.

### 9.1 pg_graphql 조건부 도입 (ADR-012·ADR-016)

**도입 조건**: 아래 4개 트리거 중 2개 이상 충족 시 Phase 22에서 도입. 충족 여부는 Phase 21 완료 시점에 평가.

| 트리거 # | 조건 | 충족 확인 방법 |
|----------|------|-------------|
| T1 | 팀 > 1명 (CON-3 변경) | 사용자 등록 기록 |
| T2 | 모바일 클라이언트 추가 (Capacitor/Expo) | 프로젝트 이슈 트래커 |
| T3 | 프론트엔드 팀이 GraphQL 명시적 요청 | 사용자 요청 기록 |
| T4 | 3-hop nested join이 프로덕션 코드에 3건+ 등장 | 코드베이스 grep 결과 |

**미충족 시**: ADR-012 상태를 "Accepted (보류 지속)"으로 유지, Phase 23+ 연간 리뷰(매년 4월) 재평가.

**충족 시**: `pg_graphql` PostgreSQL 확장 설치 → `/api/graphql` 엔드포인트 추가 → GraphQL Playground UI 신설 → Realtime WebSocket 구독 통합.

### 9.2 OAuth Providers 확장 — Naver/Kakao (ADR-017)

Phase 18에서 GitHub + Google PKCE 구현 완료 후, Phase 22에서 한국 사용자 친화적 OAuth Provider 추가를 검토한다.

- **DQ-AC-8 답변**: "Naver OAuth 도입 조건" — 한국 사용자 10명+ 가입 요청 또는 실명 인증 요구 시
- **DQ-AC-9 답변**: "Kakao OAuth 도입 조건" — 카카오 생태계 연동(예: 카카오 알림톡) 필요 시
- **구현 공수**: Naver OAuth 3h + Kakao OAuth 3h = 6h (PKCE 패턴 재사용)
- **JWT 클레임**: `provider_id` 필드 추가 (ADR-017 부정적 결과 - JWT 구조 재조정 필요)

### 9.3 WebAuthn Conditional UI — Chrome 121+ Passkey (ADR-007)

Chrome 121+의 `conditional mediation` API로 로그인 폼 자동완성에 패스키 옵션 노출. 비밀번호 입력 없이 생체인증만으로 로그인.

- **DQ-AA-9 답변**: "WebAuthn Conditional UI 도입 조건" — Chrome 121+ 안정화 + Safari iOS 18+ 지원 확인
- **구현 공수**: 4h (기존 WebAuthn 서비스 위에 `navigator.credentials.get({ mediation: 'conditional' })` 추가)
- **대상**: Admin/Manager 롤 사용자 (보안 강화 컨텍스트)

### 9.4 Anonymous Role 구현 완성 (ADR-006 보완)

Supabase의 `anon` 역할 동등. 인증 없는 공개 접근에 대한 최소 권한 역할.

- **DQ-AC-3 답변**: "Anonymous role 사용 시나리오" — 공개 REST API 또는 읽기 전용 Data API 노출 필요 시
- **구현 공수**: 3h (Prisma `Role.ANONYMOUS` 추가 + RLS 정책 `auth.role() = 'anon'` 패턴)
- **연계**: FR-11.3 PostgREST-호환 필터링에서 RLS `anon` 역할 적용

### 9.5 AI Assistant + MCP `mcp-luckystyle4u` 고도화

Phase 21에서 MCP 서버 기본 구현 후, Phase 22에서 고도화:

- **DB 쿼리 MCP Tool**: `queryDatabase(sql, params)` — 읽기 전용, RLS 적용
- **Vault 접근 MCP Tool**: `getSecret(key)` — MASTER_KEY 없이 DEK 복호화만
- **대시보드 탐색 MCP Tool**: `navigateTo(route)` — Cursor/Claude Code에서 직접 페이지 이동
- **공수**: 5h (기존 MCP 서버 Tool 확장)

---

## 10. 참조

### 10.1 ADR 풀뿌리 링크 (ADR-001~018)

| ADR | 파일 경로 | Phase |
|-----|----------|-------|
| ADR-001 | `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md#adr-001` | 전 Phase |
| ADR-002 | `01-adr-log.md#adr-002` | 18 |
| ADR-003 | `01-adr-log.md#adr-003` | 18 |
| ADR-004 | `01-adr-log.md#adr-004` | 20 |
| ADR-005 | `01-adr-log.md#adr-005` | 20 |
| ADR-006 | `01-adr-log.md#adr-006` | 17 |
| ADR-007 | `01-adr-log.md#adr-007` | 15 |
| ADR-008 | `01-adr-log.md#adr-008` | 17 |
| ADR-009 | `01-adr-log.md#adr-009` | 19 |
| ADR-010 | `01-adr-log.md#adr-010` | 19 |
| ADR-011 | `01-adr-log.md#adr-011` | 20 |
| ADR-012 | `01-adr-log.md#adr-012` | 21 |
| ADR-013 | `01-adr-log.md#adr-013` | 16 |
| ADR-014 | `01-adr-log.md#adr-014` | 21 |
| ADR-015 | `01-adr-log.md#adr-015` | 16 |
| ADR-016 | `01-adr-log.md#adr-016` | 21+ |
| ADR-017 | `01-adr-log.md#adr-017` | 18+ |
| ADR-018 | `01-adr-log.md#adr-018` | Wave 4 |

### 10.2 Wave 4 — 14 Blueprint 풀뿌리

| 청사진 | 파일 경로 |
|--------|---------|
| 01-table-editor-blueprint | `docs/research/2026-04-supabase-parity/02-architecture/01-table-editor-blueprint.md` |
| 02-sql-editor-blueprint | `02-architecture/02-sql-editor-blueprint.md` |
| 03-schema-viz-blueprint | `02-architecture/03-schema-viz-blueprint.md` |
| 04-db-ops-blueprint | `02-architecture/04-db-ops-blueprint.md` |
| 05-auth-core-blueprint | `02-architecture/05-auth-core-blueprint.md` |
| 05-operations-blueprint | `02-architecture/05-operations-blueprint.md` |
| 06-auth-advanced-blueprint | `02-architecture/06-auth-advanced-blueprint.md` |
| 07-storage-blueprint | `02-architecture/07-storage-blueprint.md` |
| 08-edge-functions-blueprint | `02-architecture/08-edge-functions-blueprint.md` |
| 09-realtime-blueprint | `02-architecture/09-realtime-blueprint.md` |
| 10-advisors-blueprint | `02-architecture/10-advisors-blueprint.md` |
| 11-data-api-blueprint | `02-architecture/11-data-api-blueprint.md` |
| 12-observability-blueprint | `02-architecture/12-observability-blueprint.md` |
| 13-ux-quality-blueprint | `02-architecture/13-ux-quality-blueprint.md` |

### 10.3 Wave 3 — 7개 Vision 문서

| 문서 | 파일 경로 |
|------|---------|
| 00-product-vision | `docs/research/2026-04-supabase-parity/00-vision/00-product-vision.md` |
| 01-user-stories | `00-vision/01-user-stories.md` |
| 02-functional-requirements | `00-vision/02-functional-requirements.md` (55 FR, P0/P1/P2) |
| 03-non-functional-requirements | `00-vision/03-non-functional-requirements.md` |
| 05-100점-definition | `00-vision/05-100점-definition.md` (14 카테고리 4단계) |
| 09-multi-tenancy-decision | `00-vision/09-multi-tenancy-decision.md` (ADR-001 근거) |
| 10-14-categories-priority | `00-vision/10-14-categories-priority.md` (§7 MVP/Beta/v1.0) |

### 10.4 운영 교훈 참조

| 세션 | 핵심 교훈 | 파일 경로 |
|------|---------|---------|
| 세션 25-A | QUIC → HTTP/2 폴백 필요성 | `docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` |
| 세션 25-B | originRequest keepAliveTimeout 90s 설정 | 동일 파일 "세션 25-B" 섹션 |
| 세션 25-C | sysctl 영속화 + 측정 프로토콜 교훈 (200 기준 vs edge 관통 기준) | 동일 파일 "세션 25-C" 섹션 |
| 세션 25-C | Playwright `retries:2` + login 헬퍼 530 재시도 | `docs/handover/260418-session25c-tunnel-complete-playwright.md` |
| 세션 28 | Capistrano symlink 배포 계약 + canary 정책 | `docs/research/2026-04-supabase-parity/04-integration/02-cloudflare-deployment-integration.md` |

---

> **문서 끝.**
> Wave 5 · R1-A Agent (Sonnet) 단독 작성 · 2026-04-18
> 양평 부엌 서버 대시보드 — Phase 15~22 / 3릴리스 / ~880h / ~52주
> TODO/TBD 금지 원칙 준수 — 모든 조건부 사항은 명시적 트리거와 ADR 참조로 대체
