# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 배포 — /ypserver prod (세션 24e에서 5 갭 보강 완료):
#   /ypserver prod                      # Phase 1~5 자동 (Windows 빌드 → 복사 → migrate → PM2)
#   /ypserver prod --skip-win-build     # Windows 빌드 항상 실패 환경에서 사용
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

## 필수 참조 파일 ⭐ 세션 32 종료 시점 — Phase 15 Step 1-2 완료

```
CLAUDE.md
docs/status/current.md
docs/handover/260419-session32-phase15-step1-2.md                ⭐ 최신 (세션 32 Prisma Session + argon2id)
docs/handover/260419-session31-cleanup-safeguard-adr-reflect.md  (세션 31 safeguard + ADR/DQ 반영)
docs/handover/260419-session30-spike-priority-set.md             (세션 30 스파이크 7건 완결)
docs/handover/260418-session29-supabase-parity-wave-5.md
docs/research/_SPIKE_CLEARANCE.md                      ⭐ 15 엔트리 (9 기존 + 7 세션30 신규)
docs/research/spikes/spike-010-pm2-cluster-result.md   ⭐ 조건부 Go
docs/research/spikes/spike-011-argon2-result.md        ⭐ Go (ADR-019 확정)
docs/research/spikes/spike-012-isolated-vm-v6-result.md ⭐ Go (ADR-009 트리거1 해소)
docs/research/spikes/spike-013-wal2json-slot-result.md ⭐ Pending (축약)
docs/research/spikes/spike-014-jwks-cache-result.md    ⭐ 조건부 Go
docs/research/spikes/spike-015-session-index-result.md ⭐ Go (cleanup 대안)
docs/research/spikes/spike-016-seaweedfs-50gb-result.md ⭐ Pending (축약)
docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md   ⭐ ADR-001~019 (ADR-019 argon2id 신규 확정)
docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md  ⭐ §7.2.1~7.2.3 (JWKS/세션/argon2 SP 반영)
docs/research/2026-04-supabase-parity/00-vision/07-dq-matrix.md       ⭐ DQ-AC-1/AC-2/4.1/12.4 Resolved
docs/solutions/2026-04-19-*.md (5건)                    ⭐ Compound Knowledge 5건 (세션 31)
docs/security/skill-audit-2026-04-19.md                 ⭐ /ypserver safeguard 감사 PASS
docs/research/2026-04-supabase-parity/README.md
docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md (status=completed)
docs/research/2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 32 종료 시점)

### 완료된 Phase
- Phase 1~14c-γ 전부 완료 (인수인계서 참조)
- **kdywave Wave 1-5 완주**: 123 문서 / 106,588줄
- **세션 30: 우선 스파이크 7건 완결** (5 실측 + 2 축약)
- **세션 31: safeguard + ADR/DQ 반영** — `/ypserver` §4 PM2 safeguard + `/kdyskillaudit` PASS + DQ 4건 Resolved + ADR 통계 6지점 동기화 + ADR-019 argon2id 확정 (타 터미널 협업) + CK 5건 (타 터미널)
- **세션 32: Phase 15 Auth Advanced Step 1-2** ⭐ — Prisma Session 모델 + 복합 인덱스 + cleanup 함수 / @node-rs/argon2 + 시그니처 보존 분기 + login route 자동 재해시(round-trip 0개 압축) / Vitest 131→139 PASS / 프로덕션 자동 재해시 실증($2b$→$argon2id$) / Sessions 인덱스 EXPLAIN Index Scan

### 우선 스파이크 결과 (세션 30, 2026-04-19)

| SP | 목표 | 실측 | 판정 | 핵심 발견 |
|----|------|------|------|-----------|
| SP-014 JWKS 캐시 | p95<5ms | p95 0.189ms hit 99% | 조건부 Go | grace는 endpoint 정책 |
| SP-015 Session 인덱스 | p95<2ms | PG 48μs | Go | partial+NOW() 불가 → cleanup job |
| SP-011 argon2id | <200ms | 19.8ms · 13× faster | Go | ADR-022 제안 |
| SP-010 PM2 cluster | +30% RPS | +39.9% BUSY 0% | 조건부 Go | **pm2 delete all bug 발견** |
| SP-012 isolated-vm v6 | cold<50ms | 0.909ms | Go | Node v24 ABI OK |
| SP-013 wal2json | — | 축약 | Pending | 물리 측정 별도 세션 |
| SP-016 SeaweedFS 50GB | — | 축약 | Pending | 물리 측정 별도 세션 |

## 추천 다음 작업

### 우선순위 1: Phase 15 Auth Advanced Step 3 — JWKS endpoint (4h) ⭐ 즉시 착수 가능
청사진: `02-architecture/03-auth-advanced-blueprint.md` §7.2.1 + SP-014 조건부 Go

구현 항목:
1. **`JwksKey` Prisma 모델** — kid / publicJwk(Json) / privateJwk(암호화 권장) / status (CURRENT/RETIRED) / retireAt
2. **`/api/.well-known/jwks.json` GET** — `status='CURRENT'` OR `retireAt > NOW()` 키 동시 서빙
3. **Cache-Control 헤더** — `public, max-age=180, stale-while-revalidate=600`
4. **ES256 키쌍 발급 헬퍼** — jose `generateKeyPair('ES256')` + `exportJWK`
5. **키 회전 절차** — 신 키 등록 + 구 키 retireAt = NOW() + max(token TTL, cacheMaxAge) + 60s
6. **cron 1시간 retireAt 만료 키 제거**
7. **jose `createRemoteJWKSet(url, { cacheMaxAge: 180_000 })` 사용 site** — instrumentation 또는 v1 토큰 검증

**DOD**: 키 회전 1회 실측 + 회전 직후 oldKey 토큰 검증 OK + cron 동작 + jose 캐시 hit rate ≥ 95%

### 우선순위 2: Phase 15 Step 4-6 (22h)

세션 32 Step 1-2 패턴 재사용 (Prisma 모델 → migration.sql 수동 → migrate deploy → API 통합 → Vitest → curl E2E → /ypserver):

- **Step 4 TOTP** (8h, FR-6.1) — `otplib@12.x` + QR 발급 + 백업 코드 + admin 강제 해제
- **Step 5 WebAuthn** (10h, FR-6.2) — `@simplewebauthn/server@10.x` + `@simplewebauthn/browser@10.x` Passkey 등록·인증
- **Step 6 Rate Limit** (4h, FR-6.3) — `rate-limiter-flexible@5.x` PG 어댑터

### 우선순위 3: SP-013/016 물리 측정 (13h, 환경 확보 시)
- **SP-013 wal2json** (5h): PG + wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- **SP-016 SeaweedFS 50GB** (8h): weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 4: Compound Knowledge 1건 추가 (30분, 세션 32 산출)

```
docs/solutions/2026-04-19-bcrypt-argon2-progressive-rehash-merged-update.md
```
세션 32 발견 — Blueprint §7.2.3 예시 코드는 검증 후 별도 prisma.user.update를 호출하지만, 이미 `lastLoginAt` update를 수행 중인 라우트라면 `{lastLoginAt, passwordHash?}` 머지로 round-trip 0개 압축 가능. 세션 32 login route 통합 사례 인용.

### 우선순위 5: 세션 30 Compound Knowledge 5건 작성 — **세션 31 67731da 커밋으로 완료** (변경 없음)
```
```
docs/solutions/2026-04-19-pg-partial-index-now-incompatibility.md
docs/solutions/2026-04-19-napi-prebuilt-native-modules.md
docs/solutions/2026-04-19-pm2-delete-all-namespace-bug.md
docs/solutions/2026-04-19-isolated-vm-v6-node24-wsl2-verified.md
docs/solutions/2026-04-19-jwks-grace-endpoint-vs-client-cache.md
```

### 우선순위 4: ADR/Blueprint/DQ matrix 반영 배치 (2h)
세션 30 handover §4 표 전량 업데이트:
- ADR-022 신규 (argon2id)
- ADR-009 §재검토 트리거 1 해소
- ADR-006/008/010/013/015 §결과 보완
- Auth Advanced Blueprint 3절 보강 (JWKS/세션/패스워드)
- DQ-AC-1/AC-2/4.1/12.4 Resolved

### 우선순위 5: `/kdygenesis --from-wave` 연계
입력: `07-appendix/03-genesis-handoff.md` _PROJECT_GENESIS.md 초안 (85+ 태스크)
산출: 주간 실행 플로우

### ~~우선순위 6: `/ypserver` 스킬 safeguard~~ — **세션 31 완료**
- ✅ `pm2 delete all` / `pm2 delete all --namespace X` / `pm2 stop all` / `pm2 kill` 4종 금지 (§4-1)
- ✅ 허용 대안: 개별 이름 나열 (§4-3)
- ✅ 실행 전 4단계 체크 (§4-4)
- ✅ 장애 복구 3순위 절차 (§4-5)
- `/kdyskillaudit` PASS 확인 (`docs/security/skill-audit-2026-04-19.md`)

### 진입점 예시
```
# Phase 15 Step 3 착수 (JWKS endpoint, 4h)
# 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md §7.2.1
#       docs/research/spikes/spike-014-jwks-cache-result.md
#       docs/handover/260419-session32-phase15-step1-2.md §7.1

# 1. Prisma JwksKey 모델 추가 (세션 32 Session 모델과 동일 패턴)
# 2. /api/.well-known/jwks.json GET 라우트
# 3. ES256 키쌍 발급 헬퍼 + 회전 절차
# 4. jose createRemoteJWKSet 통합 + cron 정리
# 5. 키 회전 1회 실측 + curl E2E + /ypserver prod --skip-win-build

# 또는 물리 측정
/kdyspike --resume wal2json  # SP-013
```

## 알려진 이슈 및 주의사항

### 세션 32 신규
- **Sessions 테이블 미사용 상태** — Phase 15 Step 1에서 모델·인덱스·cleanup만 추가. 첫 INSERT는 Phase 15-D Refresh Rotation 도입 시점. 외부 모니터링이 빈 테이블 경고하지 않도록 주의
- **`cleanupExpiredSessions()` 미스케줄** — 정의만 됨. node-cron 등록은 후속(Sessions INSERT 시작 시점에 함께)
- **`@node-rs/argon2` const enum 회피** — `Algorithm.Argon2id` 직접 import는 isolatedModules:true에서 경고 가능. 본 프로젝트는 `const ARGON2ID_ALGORITHM = 2` 상수 캡슐화
- **자동 재해시 후 첫 검증 1회만 약간 느림** — 1차 로그인은 bcrypt 검증(168ms p95) + argon2 hash(20ms) 동시 수행 → ~190ms. 2차부터 argon2 verify(14ms p95)만
- **자동 재해시 round-trip 0개 패턴** — Blueprint §7.2.3 예시는 별도 prisma.user.update이지만, lastLoginAt update에 머지하면 단일 트랜잭션으로 압축 가능. CK 후보로 다음 세션 작성 권장

### 세션 31 신규
- **글로벌 스킬 git 미추적**: `~/.claude/skills/ypserver/SKILL.md` 수정은 저장소에 없음. 머신 간 동기화는 `kdysync` 필요. 세션 31 §4 safeguard 재적용 시 본 인수인계서 §1 참조
- **병렬 터미널 분담 원칙**: 같은 파일 동시 편집 시 "File has been modified" 오류. 큰 리팩토링 시 사전 영역 분할 필수
- **`.playwright-mcp/` 기 tracked 파일 제거 완료**: `.gitignore` 등록 이전 커밋에 포함되어 있던 7건. `cadb8ad`로 저장소에서도 제거됨

### 세션 30 신규
- ~~**⚠️ PM2 v6.0.14 `delete all --namespace X` 필터 무시 버그**~~ — **세션 31 `/ypserver` §4 safeguard로 내재화 완료**. `pm2 delete all` 계열 명령 전면 금지, 개별 이름 지정 강제, `pm2 resurrect` 복구 절차 문서화
- ~~**argon2 사실관계 정정**~~ — **세션 31 ADR-019 신규 확정 + ADR-006 보완 완료**. 프로젝트 현행 `bcrypt@6.0.0` N-API, Phase 17에서 `@node-rs/argon2` 점진 마이그레이션
- ~~**JWKS grace**~~ — **세션 31 Auth Advanced Blueprint §7.2.1 반영 완료**. jose `cacheMaxAge` 는 클라이언트 캐시만 제어, 엔드포인트가 구·신 키 동시 서빙
- ~~**PG partial index + NOW()**~~ — **세션 31 DQ-AC-2 Resolved + Blueprint §7.2.2 반영 완료**. 일반 복합 인덱스 `(userId, expiresAt)` + cleanup job (일 1회)
- **N-API prebuilt** — argon2/isolated-vm/better-sqlite3 모두 3~5초 설치 (node-gyp 우회). CK `2026-04-19-napi-prebuilt-native-modules.md` 참조
- **SP-013/016 실측 대기** — `_SPIKE_CLEARANCE.md`에 Pending 엔트리 (별도 환경 필요)

### 기존 (세션 29까지)
- **kdywave 완주**: Phase 0-4 전체 완료. 123 문서 / 106,588줄. 향후 `/kdywave --feedback` 재개 가능
- **Wave 5 이중 관점 문서화**: 05-roadmap/ 4 파일 쌍(28-1 + 28-2) 병합 금지
- **DQ-12.3 MASTER_KEY**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
- **Compound Knowledge 누적 12건** (외부 7 + 세션 30→31 신규 5건 작성 완료: `docs/solutions/2026-04-19-*.md`)
- **raw SQL UPDATE auto-bump**: `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`는 Referer/Origin 필수
- **WSL auto-shutdown + /tmp 휘발**: E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리 필요
- **Cloudflare Tunnel 간헐 530**: 세션 25-B/C 완화. "100% 보증 아님, 확률적 매우 높음"
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용
- **information_schema 롤 필터링**: introspection은 `pg_catalog` 사용
- **Windows `next build` 불가**: WSL2 빌드가 진실 소스 (`/ypserver --skip-win-build` 옵션)
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임

## 사용자 기록 (메모리)

- [자율 실행 우선](../../../../Users/smart/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_autonomy.md) — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외)

---
[← handover/_index.md](./_index.md)
