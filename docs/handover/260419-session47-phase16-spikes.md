# 세션 47 인수인계서 — Phase 16 사전 스파이크 3건 PASS (SP-017/018/019)

**날짜:** 2026-04-19 (KST)
**세션:** 47
**전임 세션:** 46 (Phase 16 설계 + 구현 플랜 완결 — spec 425줄 + plan 997줄)
**소요:** ~1.5h (자율 실행, S47 예상 6h 대비 단축 — tooling 병렬화 + 병렬 실행)
**코드 변경 범위:** 스파이크 아티팩트 9 파일 + Clearance Registry 3 행 (런타임 코드 0, 회귀 없음)

---

## 목표 및 범위

세션 46에서 수립한 Phase 16 플랜의 **S47: 병렬 스파이크 (6h)** 구간 실행.

Phase 16 구현 진입 전 **3가지 핵심 가정을 실측 검증**하여 드리프트 방지 3원칙 중 "사전 스파이크 없이 구현 금지" 조건 충족:
- **SP-017** — Vault envelope 암호화 (node:crypto AES-256-GCM) 보안·성능 전제
- **SP-018** — Capistrano 배포의 symlink atomic swap 가정
- **SP-019** — PM2 cluster:4 + better-sqlite3 + v6 delete 버그 3종 리스크 (**최고 위험**)

세션 46 plan `docs/superpowers/plans/2026-04-19-phase-16-plan.md` §"세션 47" 풀 디테일 그대로 inline 실행 (subagent-driven 미선택 — 3건 모두 빠르게 연속 실행 가능 판단).

---

## 결과 매트릭스

| 스파이크 | 소요 | 판정 | 핵심 결과 | 산출물 |
|----------|------|------|-----------|--------|
| SP-017 Vault crypto | ~15min | **GO** | IV 1M/충돌 0, tamper throw, 100 DEK rotation 1.18ms | `spikes/sp-017-vault-crypto/` (2 파일) |
| SP-018 symlink + PM2 reload | ~20min | GO (16b) / 16c 정당화 | symlink fails=0 (1000 reads × 100 swaps) / fork reload 600ms gap | `spikes/sp-018-symlink-swap/` (2 파일) |
| SP-019 PM2 cluster + SQLite | ~30min | **Conditional GO** | 19,465 writes busy=0 / 4 worker scheduler 독립 init / `pm2 delete <name>` 안전 | `spikes/sp-019-pm2-cluster/` (4 파일) |

**3건 전부 PASS** → **Phase 16a Vault 구현 (S48) 즉시 진입 가능**.

---

## 핵심 발견 및 설계 확정

### SP-017 — Vault envelope 완전 검증

- `randomBytes(12)` IV 1M 샘플 충돌 0건 → IV 관리 전략(매 encrypt 마다 랜덤 생성) 유지
- GCM `setAuthTag` → tampered ciphertext `Unsupported state or unable to authenticate data` 즉시 throw → storage tampering 방어 확증
- 100 DEK 재암호화 **1.18ms** (목표 500ms 대비 1/400 수준) → `VaultService.rotateKek` 를 **단일 트랜잭션 for-loop** 로 구현 확정 (async chunking 불필요)

### SP-018 — Symlink + PM2 fork 실측

- `ln -sfn` 교체 중 1000 연속 read 에서 `No such file` 실패 0건 → Capistrano `current → releases/<ts>` swap **OS 수준 원자성 확증**
- Version A 496 / Version B 504 분산 → swap 이 실제 발생했고 reader 가 양 버전 섞어 읽음 (테스트 검증력 확인)
- **현재 fork 모드 `pm2 reload dashboard`** 측정: 내부 239ms + 관측 다운타임 **~600ms (3 timeouts × 200ms)** → 단일 프로세스 shutdown→listen gap 불가피 → **Phase 16c cluster:4 전환 정량적 근거 강화**

### SP-019 — PM2 cluster 3 리스크 전부 해소

| 리스크 | 결과 | 결정 |
|--------|------|------|
| SQLite writer 경합 (4-way concurrent) | 19,465 insert, busy=0, error=0 (WAL + busy_timeout 5000ms) | 로컬 SQLite 동시 쓰기 **안전**, dashboard cluster:4 도입 시 쿼리 패턴 변경 불필요 |
| Instrumentation 중복 실행 | 4 worker 가 각자 scheduler init (globalThis 독립) | **scheduler 류는 반드시 fork × 1 분리** — 세션 50 Task 50-1 의 `cleanup-scheduler` / `canary-router` 분리 필수 확정 |
| PM2 v6.0.14 delete 버그 | `pm2 delete spike019-app` (이름 기반) 은 spike019 namespace 만 제거, `default` (dashboard, cloudflared) 완벽 보호 | **방어 원칙**: 운영 스크립트에서 `pm2 delete <정확한 이름>` 만 허용, `delete all` / `--namespace` wildcard 금지 (/ypserver safeguard 에 기 내재) |

---

## Phase 16 플랜 연동

**Plan 변경 없음** — 스파이크 3건 전부 기존 plan 가정을 확인 (세션 46 설계 그대로 진행).

**S48 즉시 진입 조건 충족**:
- SP-017 GO → `VaultService.rotateKek` 단일 트랜잭션 구현 확정
- SP-018 GO → 16b atomic swap 설계 확정, 16c cluster 전환 명분 강화
- SP-019 Conditional GO → `cleanup-scheduler` / `canary-router` fork 분리 확정, SQLite 경합 우려 해소

**드리프트 방지 3원칙 상태**:
1. ✅ 사전 스파이크 없이 구현 금지 — SP-017/018/019 PASS 로 S48 진입 Clearance 확보
2. ⏳ `@db.Timestamptz(3)` 강제 — S48 Task 48-1 `SecretItem` 모델 신설 시 첫 검증 포인트
3. ⏳ 회귀 가드 curl 스크립트 필수 — S48 Task 48-6 `phase16-vault-verify.sh` 에서 첫 도입

---

## 커밋 매트릭스

| SHA | 세션 | 범위 |
|-----|------|------|
| `408c782` | 47 | SP-017 node:crypto AES-256-GCM envelope 검증 PASS |
| `3e2d225` | 47 | SP-018 symlink atomic swap PASS + PM2 fork reload 600ms gap 측정 |
| `959c487` | 46→47 | 세션 46 마감 자료 (handover/current/logs/next-dev-prompt) + SP-019 아티팩트 병합 커밋 (병렬 프로세스 흡수, 내용 정상) |

**origin 푸시 상태**: 3 커밋 로컬, S47 handover 추가 후 일괄 푸시 예정.

---

## 산출물 전수

### `spikes/sp-017-vault-crypto/`
- `experiment.ts` — 3 테스트 (IV 유일성 1M / tamper / 회전 성능)
- `README.md` — 결과 + 구현 확정 사항 + 회피 non-goals

### `spikes/sp-018-symlink-swap/`
- `experiment.sh` — symlink swap 1000 reads × 100 swaps (WSL 실행)
- `README.md` — 결과 + PM2 reload 600ms gap 측정 + WSL nvm PATH gotcha

### `spikes/sp-019-pm2-cluster/`
- `ecosystem-spike.config.js` — cluster:4 namespace=spike019 격리 ecosystem
- `write-contention-test.js` — JS 버전 (cluster interpreter 안정성)
- `write-contention-test.ts` — TS 초안 (reference)
- `README.md` — 3 리스크 결과 + scheduler 분리 원칙 + `pm2 delete` 제한 원칙

### `docs/research/_SPIKE_CLEARANCE.md`
- 17 → **20 엔트리** (SP-017 GO, SP-018 GO/16c 정당화, SP-019 Conditional GO)

---

## 알려진 이슈 / 주의사항

### 세션 47 신규

- **WSL nvm PATH gotcha** — `wsl -e bash -c` 서브셸에서 `pm2` / `tsx` 등 nvm 설치 도구를 사용하려면 `PATH=/home/smart/.nvm/versions/node/v<version>/bin:$PATH` prefix 필수. `source ~/.nvm/nvm.sh` 은 interactive shell 전용. 세션 49 `scripts/deploy.sh` 작성 시 **첫 줄에 PATH export 고정**.
- **PM2 cluster + interpreter 조합 취약** — `interpreter: 'tsx'` 는 cluster 모드에서 fork fallback / ESM 혼용 오류. 프로덕션 cluster 는 **컴파일된 JS 만** (Next.js `.next/standalone` 표준). 세션 50 ecosystem.config.js 에서 interpreter 미지정.
- **better-sqlite3 네이티브 바이너리 WSL/Windows 별개** — Windows 호스트의 `node_modules` 를 WSL PM2 에서 공유 불가. `/mnt/e/...` 경로에 있는 모듈로 직접 실행 불가. 기 `/ypserver` 스킬이 WSL rsync 시 node_modules 재설치로 이미 해결.
- **PM2 `delete all` 금지 원칙** — 세션 30 사고의 정확한 재현 명령어는 불명이나, v6.0.14 에서 **이름 기반 delete 는 버그 없음** 실측 확인. 운영 스크립트에서 반드시 `pm2 delete <정확한 이름>` 패턴 준수.
- **병렬 commit 흡수 현상** — SP-019 커밋을 위해 `git add spikes/... _SPIKE_CLEARANCE.md` 호출 시점에 병렬 프로세스(세션 46 자율 마감 작업)가 handover/current/logs 를 함께 스테이징해 `959c487` 단일 커밋으로 생성됨. 산출물 정상, 추적성 다소 뭉개짐. 향후 세션에서는 staging 현황 `git status` 선 확인 권장.

---

## 이월 항목 (S48+ 대상)

### 즉시 진입 가능 (S48 Phase 16a Vault, 8h TDD)

플랜 풀 디테일 준비 완료 → `docs/superpowers/plans/2026-04-19-phase-16-plan.md §"세션 48"`:
1. Task 48-1 — Prisma `SecretItem` 모델 + migration (`@db.Timestamptz(3)` 적용)
2. Task 48-2 — `MasterKeyLoader` TDD 4 tests
3. Task 48-3 — `VaultService` TDD 6 tests (encrypt/decrypt/rotateKek)
4. Task 48-4 — `migrate-env-to-vault.ts` + `getVault` 싱글톤
5. Task 48-5 — `mfa/crypto.ts` VaultService 통합
6. Task 48-6 — `phase16-vault-verify.sh` 회귀 가드

### 사용자/환경 대기

- **MFA biometric 브라우저 QA** — WebAuthn `navigator.credentials.*` 은 사용자 인터랙션 필수, AI 단독 불가. `docs/guides/mfa-browser-manual-qa.md` 8 시나리오 SOP 준비 완료.
- **SP-013 wal2json 슬롯** — PG 플러그인 설치 + 30분 DML 환경 미확보. Pending 유지.
- **SP-016 SeaweedFS 50GB** — 50GB 디스크 + weed 서버 환경 미확보. Pending 유지.
- **KST 03:00 자동 cleanup tick** — PM2 restart 누적 ↺=16, 24h+ uptime 확보 시점 관찰 재개.

---

## 다음 세션 진입점

```
# S48 진입 (권장)
docs/superpowers/plans/2026-04-19-phase-16-plan.md 의 "세션 48: 16a Vault 구현 (8h)" 섹션부터 실행.
예상 소요 8h (TDD 20+ tests PASS + MFA 로그인 회귀 0).

# 또는 S48 전에 배포 1회 (cleanup tick 관찰 재개 대비)
현재 배포 상태 유지 (PM2 uptime 축적) + S48 작업은 dev 환경에서 병행 진행.
```

---

## 참조

- **Phase 16 spec**: `docs/superpowers/specs/2026-04-19-phase-16-design.md` (ADR-020 초안, 425줄)
- **Phase 16 plan**: `docs/superpowers/plans/2026-04-19-phase-16-plan.md` (997줄)
- **세션 46 handover**: `docs/handover/260419-session46-phase-16-design-plan.md`
- **SP-017 결과**: `spikes/sp-017-vault-crypto/README.md`
- **SP-018 결과**: `spikes/sp-018-symlink-swap/README.md`
- **SP-019 결과**: `spikes/sp-019-pm2-cluster/README.md`
- **Clearance Registry**: `docs/research/_SPIKE_CLEARANCE.md` (20 엔트리)

[← handover/_index.md](./_index.md)
