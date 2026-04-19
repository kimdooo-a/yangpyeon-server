# 세션 48 인수인계서 — Phase 16a Vault 구현 완료 (envelope 암호화 + MFA 통합)

**날짜:** 2026-04-19 (KST, S47 직후 연속 세션)
**세션:** 48
**전임 세션:** 47 (사전 스파이크 SP-017/018/019 PASS → Clearance 확보)
**소요:** ~1h (executing-plans 스킬 순차 실행, 플랜 예상 8h 대비 **대폭 단축** — TDD 루프 안정 + Vault 설계 검증 완료 상태)
**코드 변경 범위:** +528 / -33 line, 12 파일 (vault 3 신규 + 2 테스트 + 2 helper + mfa 5 파일 통합 + migration 1)

---

## 목표 및 범위

**세션 46 플랜 `docs/superpowers/plans/2026-04-19-phase-16-plan.md` §"세션 48: 16a Vault 구현 (8h)"** 풀 디테일 실행.

Phase 16a 목적: 평문 `process.env.MFA_MASTER_KEY` 의존성 제거 → **AES-256-GCM envelope 암호화** (KEK=`/etc/luckystyle4u/secrets.env` MASTER_KEY, 시크릿 전용) 기반 `SecretItem` DB 저장소로 이전. Single-tenant Hybrid 경량 envelope (DEK 없이 KEK 직접 암호화 — SP-017 실측으로 보안·성능 검증 완료).

**executing-plans 스킬** 채택. `feedback_autonomy` 메모리 기반 분기 질문 없이 연속 실행. main 브랜치 직접 진행 (프로젝트 패턴 일관성 우선, 스킬 기본 worktree 권장보다 프로젝트 S33~S47 관례 채택 + 변경 표면화).

---

## 결과 매트릭스

| Task | 결과물 | TDD | 회귀 |
|------|--------|-----|------|
| 48-1 Prisma SecretItem | schema.prisma + migration.sql (`20260422000000_add_secret_item`) | N/A (스키마) | `prisma db execute` 적용 + `migrate resolve --applied` |
| 48-2 MasterKeyLoader | `src/lib/vault/MasterKeyLoader.{ts,test.ts}` | 4/4 Red→Green | vitest +4 |
| 48-3 VaultService | `src/lib/vault/VaultService.{ts,test.ts}` | 6/6 Red→Green | vitest +6 |
| 48-4 getVault 싱글톤 + migrate script | `src/lib/vault/index.ts` + `scripts/migrate-env-to-vault.ts` | (통합 테스트 S48 배포 후) | tsc 0 |
| 48-5 mfa/crypto.ts Vault 통합 | `src/lib/mfa/crypto.ts` 재작성 + 3 call site await 전환 + totp.test.ts mock 추가 | 기존 20/20 PASS 유지 | vitest 264/264 |
| 48-6 회귀 가드 스크립트 | `scripts/phase16-vault-verify.sh` (login + MFA status 2 step) | (prod 실행 S48 배포 후) | chmod +x |

**전체 검증 (세션 마감 gate)**:
- `npx tsc --noEmit` → **exit 0**, 0 errors
- `npx vitest run` → **264 PASS / 16 files / exit 0** (S47 기준 254 → +10: MasterKeyLoader 4 + VaultService 6)
- `npm run build` → **exit 0** (Turbopack 4 warnings = 사전 존재 `instrumentation.ts` Edge runtime `process.cwd()` — S48 무관, git blame 으로 세션 35 `a29ac1b` 확증)

---

## 핵심 발견 및 설계 반영

### 1. Prisma 7 DB 드리프트 — `_test_session` (SP-015 스파이크 잔재)

`prisma migrate dev --create-only` 가 `_test_session` 테이블 (SP-015 pg-bench 잔여, 마이그레이션 이력 없음) 을 감지 → `prisma migrate reset` 요구 → **데이터 파괴 회피** 위해 **수동 경로 채택**:
1. `prisma/migrations/20260422000000_add_secret_item/migration.sql` 수동 작성
2. `npx prisma db execute --file ...` 로 DB 직접 적용
3. `npx prisma migrate resolve --applied ...` 로 `_prisma_migrations` 등록

**S49 이관 과제**: `_test_session` 은 `/mnt/e/.../docs/research/spikes/spike-015-session-index/pg-bench.sh` 가 남긴 고아 테이블. 영향 없으나 drift 경고는 지속 → S49 또는 S52 cleanup 세션에서 `DROP TABLE _test_session` + 마이그레이션 기록 삭제 / baseline 재생성.

### 2. Prisma 7 `migrate diff` 옵션 renamed

Prisma 7 에서 `--to-schema-datamodel` → `--to-schema` 로 개명 (`--from-schema` 도 동일). 또한 `--from-migrations`는 **shadow DB URL 필수**. 수동 SQL 작성이 더 단순한 경로.

### 3. 플랜 원문 편차 — `@/lib/db` 오류 보정

플랜 Task 48-4 원문:
```ts
import { prisma } from '@/lib/db';  // ← 오류
```

프로젝트에서 `@/lib/db` 는 **better-sqlite3 + drizzle** 대시보드 메트릭 로컬 저장소 (Prisma 아님). 올바른 경로는 `@/lib/prisma` (세션 19 이후 Proxy + PrismaPg 어댑터 싱글톤). 보정 적용.

### 4. 플랜 원문 편차 — `SecretItem` @map 누락

플랜 원문에 @map 누락 → 생성될 컬럼명이 `"encryptedValue"` (camelCase + 따옴표 필수) 가 되어 기존 `secret_ciphertext` / `kek_version` 같은 snake_case 프로젝트 컨벤션 위배. 글로벌 CLAUDE.md "기존 패턴 우선" 원칙으로 @map 자체 보정:
- `encryptedValue` → `encrypted_value`
- `kekVersion` → `kek_version`
- `createdAt`/`rotatedAt` → `created_at`/`rotated_at`

### 5. 플랜 원문 편차 — `@unique` + `@@index([name])` 중복

`name String @unique` 자체가 unique index 를 생성하는데 `@@index([name])` 을 추가하면 `secret_items_name_key` + `secret_items_name_idx` **두 개 인덱스** 생성. 플랜 원문 존중 + 핸드오버 정리 후보로 기록. S49~S52 cleanup 세션에서 `@@index` 라인 제거 + 마이그레이션 하나 추가하면 됨.

### 6. Prisma 7 mock callback 타입 엄격성

Prisma 7 의 `Prisma__SecretItemClient<T>` 리턴 타입이 strict — `mockImplementation((args) => Promise<...>)` 가 `tsc --noEmit` 에서 fail. 런타임은 PrismaPromise 가 Promise 호환이라 정상. **해결**: 테스트 파일에서 `(... as unknown as Mock).mockImplementation(...)` 캐스팅 + `import type { Mock } from "vitest"` (이전의 `vi.Mock` 네임스페이스 접근은 Prisma 7 환경에서 resolve 실패).

### 7. mfa/crypto.ts sync → async 전환의 파급

`getMasterKey()` (sync) → `getMfaMasterKey()` (async Vault decrypt) 전환으로 `encryptSecret` / `decryptSecret` 시그니처가 `Promise<string>` 로 변화. 영향 받은 호출부 **4 파일 5 call site** 일괄 `await` 전환:
- `src/lib/mfa/service.ts:53` — `verifyMfaSecondFactor` 내부
- `src/app/api/v1/auth/mfa/enroll/route.ts:26`
- `src/app/api/v1/auth/mfa/confirm/route.ts:46`
- `src/lib/mfa/totp.test.ts` (3 test + vault mock)

테스트 격리: `vi.mock("@/lib/vault", () => ({ getVault: async () => ({ decrypt: async (name) => process.env.MFA_MASTER_KEY }) }))` + `__resetMfaKeyCache()` 헬퍼를 `beforeAll` 에서 호출.

**병렬 커밋 흡수 현상 재발**: Task 48-1 작업 중 `/cs` 백그라운드 프로세스가 schema.prisma + migration.sql + logs 를 `1637fe8` 로 흡수 커밋 ("S48 Task 48-1 pre-work" 라고 label). 실제로는 본 세션의 완전한 산출물이나 커밋 메시지는 "pre-work" 로 표기. 세션 47 핸드오버 이슈의 재현 — staging 현황 `git status` 선확인 패턴이 필요.

---

## Phase 16 플랜 연동

**Plan 변경 없음** — Task 48-1~48-6 모두 플랜 §세션 48 그대로 진행 (위 편차 6건은 플랜 원문의 기술적 부정확성으로 프로젝트 컨벤션 맞춤 보정이지 설계 변경 아님).

**드리프트 방지 3원칙 상태**:
1. ✅ 사전 스파이크 없이 구현 금지 — S47 SP-017/018/019 PASS 근거로 진행
2. ✅ `@db.Timestamptz(3)` 강제 — `SecretItem.createdAt` / `.rotatedAt` 적용 완료 (Task 48-1)
3. ✅ 회귀 가드 curl 스크립트 — `scripts/phase16-vault-verify.sh` 작성 (Task 48-6), **실행은 프로덕션 배포 후**

**S49 즉시 진입 조건**:
- Phase 16a 코드 완결 (4-gate PASS) → 프로덕션 배포만 남음
- 배포 후 `phase16-vault-verify.sh` PASS = Phase 16a DOD 완전 충족
- 플랜 `§세션 49: 16b Capistrano 배포 자동화 (10h) — Outline` 상세화는 S49 진입 시점에 SP-018 실측 기반 풀 디테일로 확장

---

## 커밋 매트릭스

| SHA | Task | 범위 |
|-----|------|------|
| `1637fe8` | 48-1 (병합) | `/cs` 백그라운드 흡수 — SecretItem 스키마+migration+journal+logs+CK #34 |
| `9c0fbf8` | 48-2 | MasterKeyLoader + TDD 4 tests |
| `907df2e` | 48-3 | VaultService core encrypt/decrypt/rotateKek + TDD 6 tests |
| `5812f94` | 48-4 | getVault 싱글톤 + migrate-env-to-vault |
| `fb63a55` | 48-5 | mfa/crypto.ts Vault 통합 (async 전환) |
| `9942ca4` | 48-6 | phase16-vault-verify.sh 회귀 가드 |

**origin 푸시 상태**: 6 커밋 로컬 (1637fe8 + 9c0fbf8 + 907df2e + 5812f94 + fb63a55 + 9942ca4), S48 handover 커밋 후 일괄 푸시 예정.

---

## 프로덕션 배포 절차 (S49 착수 전 권장)

세션 48 코드는 dev DB 마이그레이션만 적용. 프로덕션 반영 순서:

```bash
# 1) /etc/luckystyle4u/secrets.env 준비 (WSL, 1회성)
sudo mkdir -p /etc/luckystyle4u
sudo nano /etc/luckystyle4u/secrets.env
# 파일 내용: MASTER_KEY=<64 hex>  (crypto.randomBytes(32).toString('hex'))
sudo chown root:smart /etc/luckystyle4u/secrets.env   # 또는 dashboard 실행 user
sudo chmod 0640 /etc/luckystyle4u/secrets.env

# 2) 배포 + 마이그레이션
wsl -e bash -c "source ~/.nvm/nvm.sh && /ypserver prod --skip-win-build"

# 3) migrate-env-to-vault.ts 1회 실행 (WSL)
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && MASTER_KEY_PATH=/etc/luckystyle4u/secrets.env npx tsx scripts/migrate-env-to-vault.ts"
# Expected: {"migrated":"mfa.master_key"}

# 4) PM2 restart 이미 /ypserver 내부에서 수행
# 5) 회귀 가드 실행
wsl -e bash -c "source ~/.nvm/nvm.sh && /mnt/e/00_develop/260406_luckystyle4u_server/scripts/phase16-vault-verify.sh"
# Expected: {"test":"login","pass":true} + {"test":"mfa_status","pass":true}
```

**주의**:
- `pm2 restart` 후에도 Vault decrypt 가 실패하면 (예: MASTER_KEY_PATH 미설정) → MFA 로그인 100% 차단. 배포 전 WSL 에서 `node -e "process.env.MASTER_KEY_PATH='/etc/luckystyle4u/secrets.env'; require('./src/lib/vault').getVault().then(v => v.decrypt('mfa.master_key')).then(console.log)"` 로 스모크.
- 현재 `.env` 의 `MFA_MASTER_KEY` 는 migrate-env-to-vault 가 읽기용으로 필요. 이관 성공 후 **Task 49 이후**에 제거 (세션 49 이후 `.env` 슬림 작업).

---

## 산출물 전수

### 신규 파일 (7)
- `prisma/migrations/20260422000000_add_secret_item/migration.sql`
- `src/lib/vault/MasterKeyLoader.ts` (48 라인)
- `src/lib/vault/MasterKeyLoader.test.ts` (50 라인, 4 tests)
- `src/lib/vault/VaultService.ts` (106 라인)
- `src/lib/vault/VaultService.test.ts` (105 라인, 6 tests)
- `src/lib/vault/index.ts` (33 라인)
- `scripts/migrate-env-to-vault.ts` (65 라인)
- `scripts/phase16-vault-verify.sh` (47 라인)

### 수정 파일 (5)
- `prisma/schema.prisma` (+21 — SecretItem 모델)
- `src/lib/mfa/crypto.ts` (sync → async, Vault 기반 로딩)
- `src/lib/mfa/service.ts` (:53 await)
- `src/app/api/v1/auth/mfa/enroll/route.ts` (:26 await)
- `src/app/api/v1/auth/mfa/confirm/route.ts` (:46 await)
- `src/lib/mfa/totp.test.ts` (vault mock + 3 async tests)

---

## 알려진 이슈 / 주의사항

### 세션 48 신규

- **rotateKek 단위 테스트 부재** — 플랜 §Task 48-3 Step 1 의 6 케이스에 포함되지 않음 (encrypt/decrypt/tamper/not-found/IV/32-byte). SP-017 에서 100 건 실측으로 1.18ms 확인은 있으나 유닛 테스트 0. 다음 세션 KEK rotation 실행 전 `rotateKek` 테스트 추가 권장 (구 KEK → 신 KEK 전수 변환 + kekVersion bump + rotatedAt 기록 3 assertion).
- **SecretItem 중복 인덱스** — `name @unique` + `@@index([name])` 로 `secret_items_name_key` + `secret_items_name_idx` 두 인덱스 생성. 플랜 원문 준수로 유지했으나 S49~S52 cleanup 세션에서 `@@index` 제거 + 마이그레이션 하나 더 적용이 깔끔.
- **병렬 `/cs` 커밋 흡수 재발** — S47 핸드오버에서 이미 보고된 현상 (`959c487` 케이스) 이 S48 `1637fe8` 에서 재현. Task 48-1 산출물이 `/cs` 세션 마감 자료와 함께 단일 커밋에 묶임. 본질적 손실은 없으나 git log 가독성 저하. **대응**: 세션 실행 중 `/cs` 또는 `/loop` 백그라운드 프로세스가 돌고 있다면 **`git status` 선확인 + 필요시 `git add <특정 파일만>` 으로 staging 격리**.
- **DB 드리프트 `_test_session`** — SP-015 잔재, S48 에서 우회만 함. S49 또는 cleanup 세션에서 `DROP TABLE _test_session`.
- **Turbopack 사전 경고 4건** — `instrumentation.ts:16` `process.cwd()` Edge runtime 비호환 경고. S35 `a29ac1b` 부터 존재, Phase 16 무관. Phase 16d (UI) 이후 Next.js 16 Edge vs Node runtime 명시적 분리 재검토 권장.

### 세션 47 이전 유지 (S48 에서 해결 안 됨)

- **MFA biometric 브라우저 QA** — WebAuthn `navigator.credentials.*` 사용자 인터랙션 필수, AI 단독 불가. `docs/guides/mfa-browser-manual-qa.md` 8 시나리오 SOP 대기.
- **SP-013 wal2json 슬롯** / **SP-016 SeaweedFS 50GB** — 환경 미확보, Pending 유지.
- **KST 03:00 자동 cleanup tick** — PM2 restart 누적 ↺=16+, 24h+ uptime 확보 시점 관찰 재개.

---

## 이월 항목 (S49+ 대상)

### 즉시 진입 가능 (S49 Phase 16b Capistrano 배포 자동화, 10h)

플랜 `§세션 49: 16b Capistrano 배포 자동화 (10h) — Outline` 는 작업 목록 + 인터페이스만 명시 (SP-018 결과 기반 풀 디테일 확장은 S49 진입 시점).

**S49 핵심 과제** (outline 기반):
1. `releases/` 디렉토리 구조 초기화 (2h)
2. `current` symlink atomic swap 로직 (SP-018 검증 완료)
3. `/ypserver` 스킬 Capistrano 패턴 교체 (10회 배포 → 5 release 유지)
4. 롤백 <30s 실측 시나리오

### 세션 48 직후 권장 (배포 + 회귀 검증)

세션 49 진입 **전** 프로덕션 배포 1회 권장:
1. `/etc/luckystyle4u/secrets.env` 파일 생성 (MASTER_KEY=<64 hex>, mode 0640)
2. `/ypserver prod --skip-win-build`
3. `migrate-env-to-vault.ts` 1회 실행
4. `phase16-vault-verify.sh` PASS 확인

배포 확인 완료 = **Phase 16a DOD 완전 충족**. 시점은 사용자 판단 (급하지 않으면 S49 시작 시점에 함께 수행).

### Compound Knowledge 후보 (세션 48 발생)

- **Prisma 7 migrate diff shadow DB 요구사항 + 수동 SQL 우회 패턴** — `migrate dev` 가 drift 감지 시 reset 강제 / `migrate diff --from-migrations` 는 shadow DB URL 필수 → **drift 가 있는 dev DB 에서는 migration.sql 수동 작성 + `db execute` + `migrate resolve --applied` 3단계 우회** 패턴. CK 등록 가치 있음 (pattern/medium).
- **sync → async 전환 시 테스트 모킹 전략** — mfa/crypto 가 Vault 로 이관될 때 `vi.mock("@/lib/vault")` 로 환경변수 의존성 유지하며 async 경로 검증. 시크릿 저장소 전환 패턴으로 generalize 가능 (pattern/medium).

---

## 다음 세션 진입점

```
# S49 진입 (권장 - 배포 후 진행)
1. /etc/luckystyle4u/secrets.env 생성
2. /ypserver prod --skip-win-build
3. migrate-env-to-vault.ts 실행 + phase16-vault-verify.sh PASS
4. docs/superpowers/plans/2026-04-19-phase-16-plan.md §"세션 49: 16b Capistrano 배포 자동화" outline 을 SP-018 결과 기반 풀 디테일로 확장
5. executing-plans 또는 subagent-driven-development 스킬로 실행

# 또는 S49 전 배포 생략 (dev-only continuation)
Phase 16b 구현만 dev 에서 선행 (배포는 S52 최종 배포에서 일괄) — Phase 16c PM2 cluster 와 Capistrano 통합 후 단일 배포가 더 안전
```

---

## 참조

- **Phase 16 spec**: `docs/superpowers/specs/2026-04-19-phase-16-design.md` (ADR-020 초안, 425줄)
- **Phase 16 plan**: `docs/superpowers/plans/2026-04-19-phase-16-plan.md` (997줄, §세션 48 완결 표시)
- **세션 47 handover**: `docs/handover/260419-session47-phase16-spikes.md` (SP-017/018/019 PASS)
- **SP-017 결과**: `spikes/sp-017-vault-crypto/README.md` (IV 1M / tamper / 1.18ms)
- **Vault 구현**: `src/lib/vault/{MasterKeyLoader,VaultService,index}.ts`
- **migration**: `prisma/migrations/20260422000000_add_secret_item/migration.sql`
- **migrate script**: `scripts/migrate-env-to-vault.ts`
- **verify script**: `scripts/phase16-vault-verify.sh`

## 부록 — 프로덕션 배포 완료 (세션 내 연속 수행)

사용자 요청("S49 진입 전 필수 선행 (~20min) ... 이것 마무리해줘") 으로 세션 48 내에서 배포까지 전구간 완결. S48 DOD 최종 충족.

### 배포 절차 실 수행 결과

| 단계 | 조치 | 결과 |
|------|------|------|
| 1 | MASTER_KEY 생성 + 저장 경로 | `/home/smart/.luckystyle4u/secrets.env` (0640, user=smart, 64 hex) — sudo 없는 user-home 대안 |
| 2 | .env 업데이트 | `~/dashboard/.env` 에 `MASTER_KEY_PATH=/home/smart/.luckystyle4u/secrets.env` 추가 |
| 3 | ypserver prod --skip-win-build | Phase 2-2~2-6 전부 PASS (BUILD_ID `G4O5gQVpDaIxRXBIWyUql` / migrate "No pending" / PM2 ↺=17→18 / cloudflared 무중단 / TUNNEL_OK) |
| 4 | migrate-env-to-vault.ts | **초기 실패**: tsx 자동 dotenv 미로드 → `.env` 의 MASTER_KEY_PATH 미적용 → 기본 경로 /etc/... ENOENT. **수정**: `set -a; source .env; set +a; npx tsx ...` 패턴으로 env export 후 재실행 → `{"migrated":"mfa.master_key"}` |
| 5 | 헬스체크 | local=307(로그인 리다이렉트) / ext(stylelucky4u.com/login)=200 |
| 6 | Vault decrypt 직접 스모크 | `{"test":"vault_decrypt","pass":true,"decrypted_len":64,"env_len":64}` — Vault 복호값 === process.env.MFA_MASTER_KEY (E2E 실증) |
| 7 | phase16-vault-verify.sh 실행 | **초기 FAIL** — mfa_status UNAUTHORIZED. 원인: 스크립트가 쿠키 기반 인증 사용, 그러나 /api/v1/auth/* 는 `Authorization: Bearer <accessToken>` 요구. **픽스 커밋 `effaf52`**: node 파싱으로 accessToken 추출 + Bearer 헤더 부착 + 성공 조건을 실제 응답 shape(j.success && j.data.totp) 로 강화. 재실행 PASS (accessToken_len=260 / mfa_status PASS / === PASS ===) |

### 추가 발견 / CK 후보 2건

- **tsx 자동 dotenv 미로드** → `docs/solutions/2026-04-19-tsx-dotenv-autoload-missing.md` (pattern, medium)
- **v1 API Bearer 전용 / 쿠키 인증 불가** → `docs/solutions/2026-04-19-v1-api-bearer-vs-cookie-auth.md` (bug-fix, high) — 회귀 가드 스크립트가 이 사실 몰라서 실배포 전까지 드러나지 않은 교훈

### 커밋 추가분

| SHA | 설명 |
|-----|------|
| `effaf52` | phase16-vault-verify.sh 쿠키 → Bearer 방식 픽스 |

### S48 소요 총 정리

| 구간 | 예상 | 실제 |
|------|------|------|
| Task 48-1~48-6 코드 | 8h | ~1h |
| S48 마감 (검증 + handover + push) | 미명시 | ~10min |
| 프로덕션 배포 (사용자 요청 직후 연속) | ~20min | ~15min |
| 회귀 가드 버그 발견·픽스 | 미예상 | ~10min |
| **총** | **~8h** | **~1.5h** |

### Phase 16a DOD 100% 충족 증거

- **드리프트 방지 3원칙 ① 사전 스파이크** — S47 SP-017/018/019 PASS
- **② `@db.Timestamptz(3)` 강제** — SecretItem.createdAt/rotatedAt 프로덕션 적용 확인 (migration.sql `TIMESTAMPTZ(3)`)
- **③ 회귀 가드 curl** — `scripts/phase16-vault-verify.sh` 프로덕션 PASS + 인라인 vault decrypt PASS 병행 도입
- **MFA 로그인 회귀 0** — vitest 264/264 + 프로덕션 login API 200 + /api/v1/auth/me 200

### S49 진입 조건 충족

- Phase 16a 코드 + 배포 + 실전 검증 전구간 완료
- `docs/superpowers/plans/2026-04-19-phase-16-plan.md §"세션 49: 16b Capistrano 배포 자동화 (10h) — Outline"` 이 진입점. S49 시작 시 SP-018 실측 기반 풀 디테일로 확장.

---
[← handover/_index.md](./_index.md)

**저널**: [docs/logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md) §"세션 48" (원본 대화 흐름 11개 토픽)
