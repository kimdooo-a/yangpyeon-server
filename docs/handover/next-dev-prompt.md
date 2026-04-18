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
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan |

## 필수 참조 파일 ⭐ 우선 스파이크 7건 완결 상태 (세션 30)

```
CLAUDE.md
docs/status/current.md
docs/handover/260419-session30-spike-priority-set.md   ⭐ 최신 (세션 30 스파이크 7건 완결)
docs/handover/260418-session29-supabase-parity-wave-5.md
docs/research/_SPIKE_CLEARANCE.md                      ⭐ 15 엔트리 (9 기존 + 7 세션30 신규)
docs/research/spikes/spike-010-pm2-cluster-result.md   ⭐ 조건부 Go
docs/research/spikes/spike-011-argon2-result.md        ⭐ Go (ADR-022 제안)
docs/research/spikes/spike-012-isolated-vm-v6-result.md ⭐ Go (ADR-009 트리거1 해소)
docs/research/spikes/spike-013-wal2json-slot-result.md ⭐ Pending (축약)
docs/research/spikes/spike-014-jwks-cache-result.md    ⭐ 조건부 Go
docs/research/spikes/spike-015-session-index-result.md ⭐ Go (cleanup 대안)
docs/research/spikes/spike-016-seaweedfs-50gb-result.md ⭐ Pending (축약)
docs/research/2026-04-supabase-parity/README.md
docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md (status=completed)
docs/research/2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 30 종료 시점)

### 완료된 Phase
- Phase 1~14c-γ 전부 완료 (인수인계서 참조)
- **kdywave Wave 1-5 완주**: 123 문서 / 106,588줄
- **세션 30: 우선 스파이크 7건 완결** (5 실측 + 2 축약) ⭐

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

### 우선순위 1: Phase 15 Auth Advanced MVP (22h) ⭐ 즉시 착수 가능
청사진: `02-architecture/03-auth-advanced-blueprint.md`

세션 30 결과를 반영한 구현 순서:
1. **Prisma Session 모델 추가** (1h)
   - SP-015 Go 기준: SHA-256 hex + 복합 인덱스 (userId, expiresAt) + cleanup job
2. **argon2id 도입** (3h)
   - SP-011 Go 기준: @node-rs/argon2 + `verifyPassword()` 점진 마이그레이션
3. **JWKS endpoint 구현** (4h)
   - SP-014 조건부 Go 기준: `/api/.well-known/jwks.json` + ES256 키쌍 + endpoint grace 운용
4. **TOTP 통합** (8h)
   - `otplib` + QR 발급 + 백업 코드 + 관리자 강제 해제
5. **WebAuthn** (10h)
   - `@simplewebauthn/server` + Passkey 등록·인증
6. **Rate Limit** (4h)
   - PostgreSQL 기반 (SP-021 BullMQ/pgmq 트리거 미충족)

**DOD**: MFA 활성 계정 + 백업 코드 + E2E PASS

### 우선순위 2: SP-013/016 물리 측정 (13h)
별도 환경 가능 시:
- **SP-013 wal2json** (5h): PG + wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- **SP-016 SeaweedFS 50GB** (8h): weed 설치 + 50GB 디스크 + B2 오프로드

상세 절차는 각 결과 문서 §5 체크리스트 참조.

### 우선순위 3: Compound Knowledge 5건 작성 (2h)
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

### 우선순위 6: `/ypserver` 스킬 safeguard
- `pm2 delete all` 명령 거부 가드
- 대안 명시: `pm2 delete <name>` 개별 지정

### 진입점 예시
```
# Phase 15 착수
/kdyspike --status   # 스파이크 완결 확인
# → Phase 15 Task 1 "Prisma Session 모델" 착수

# 또는 물리 측정
/kdyspike --resume wal2json  # SP-013
```

## 알려진 이슈 및 주의사항

### 세션 30 신규
- **⚠️ PM2 v6.0.14 `delete all --namespace X` 필터 무시 버그** — 프로덕션 삭제 위험. 개별 이름 지정 필수. 복구는 `pm2 resurrect`
- **argon2 사실관계 정정** — 프로젝트 현행은 **bcrypt@6.0.0** (N-API), bcryptjs 아님. ADR-006 수정 필요
- **JWKS grace** — jose 클라이언트 캐시만으로 불가, 엔드포인트가 구·신 키 동시 서빙해야 성립
- **PG partial index + NOW()** 불가능 → cleanup job 대안 채택
- **N-API prebuilt** — argon2/isolated-vm/better-sqlite3 모두 3~5초 설치 (node-gyp 우회)
- **SP-013/016 실측 대기** — `_SPIKE_CLEARANCE.md`에 Pending 엔트리

### 기존 (세션 29까지)
- **kdywave 완주**: Phase 0-4 전체 완료. 123 문서 / 106,588줄. 향후 `/kdywave --feedback` 재개 가능
- **Wave 5 이중 관점 문서화**: 05-roadmap/ 4 파일 쌍(28-1 + 28-2) 병합 금지
- **DQ-12.3 MASTER_KEY**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
- **Compound Knowledge 누적 7+5건** (외부 7 + 세션 30 신규 5건 대기)
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
