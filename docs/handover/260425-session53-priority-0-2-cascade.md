# 인수인계서 — 세션 53 (S51 이월 일괄 처리 + 우선순위 0-2 자율 실행)

> 작성일: 2026-04-25
> 이전 세션: [session52](./260425-session52-wsl-build-pipeline.md) (2026-04-25, 같은 날)
> 저널: [`docs/logs/journal-2026-04-25.md`](../logs/journal-2026-04-25.md) §세션 53

---

## 작업 요약

사용자 "순차적으로 모두 진행" 지시에 따라 우선순위 0-2 (S51 + S50 + S49 이월) 6 작업 자율 완료. 핵심 성과: (1) **ADR placeholder cascade 재할당** — ADR-019/020 슬롯 점유로 §5 예상 후보를 ADR-021~024로 한 칸씩 밀어 충돌 5건 정정, 다음 ADR 번호 §3.1 021→**025**. (2) **_CHECKPOINT_KDYWAVE.md §보완 신설** — Wave 5 종료 후 cross-cutting 변경(B-01~B-03)을 본문 "역방향 피드백 0건" 사실 무손상으로 부록 기록. (3) **S50 이월 — pm2-logrotate 영속 + postgresql 부팅 자동 기동 보장**. (4) **S49 이월 코드 처리 4건** — KEK 일치 퍼즐 사실상 해결 확인 / MASTER_KEY_PATH 단일 출처 헬퍼화 / rotateKek 단위 테스트 4건 / SecretItem @@index 중복 제거. (5) 268/268 테스트 PASS + TypeScript 클린.

## 대화 다이제스트

### 토픽 1: 우선순위 0-2 진입 + 36 잔여 파일 식별

> **사용자**: "순차적으로 모두 진행 해줘 ... 우선순위 0-2 (이번 주) 3. /kdywave --feedback 정식 모드 — 36 잔여 파일 일괄 ADR-020 cross-reference (S51에서 5 핵심만 처리, milestones·release-plan·risk-register·cost-tco 등이 ADR-015 단독 언급 상태) 4. _CHECKPOINT_KDYWAVE.md §보완 행 추가 5. S50 이월 — pm2 install pm2-logrotate + sudo systemctl enable postgresql ... 우선순위 2 (이월 누적, 환경/생체 의존)"

**컨텍스트 수집**: `current.md` + S51 인수인계 + `_CHECKPOINT_KDYWAVE.md` + ADR-020 본문 (`02-architecture/01-adr-log.md`).

**파일 식별 결과**:
- `ADR-015|Capistrano` 언급: 40 파일
- 그 중 `ADR-020` 보유: 11 파일 (S51 5 핵심 + 일부 placeholder 보유)
- Wave 1 deep-dive (`01-research/14-operations/*` 3 파일) + `_archived/` 1 파일 = 역사 보존 미수정
- 실제 처리 대상: 29 파일 + `_CHECKPOINT_KDYWAVE.md` = **30 파일**

**중요한 발견 — ADR-020 placeholder 충돌**: 02-architecture/16-ux-quality-blueprint.md `§1571`, 07-appendix/{02-final-summary, 02-dq-final-resolution, 01-kdygenesis-handoff}, 02-architecture/01-adr-log.md `§5` 예상 표 + DQ 매핑 표 등이 ADR-020을 *다른 의미*("PM2 cluster vs cron-worker 분리 후보", "AI Gateway 채택", "Prisma 8 업그레이드 타이밍", "마이그레이션 롤백 5초 패턴", "AI 챗 메시지 영구 저장")로 사용 중 → 실제 ADR-020(standalone+rsync+pm2 reload, 세션 50)과 cascading collision.

**결론**: 6 작업 TaskCreate 후 순차 실행 시작.

### 토픽 2: 29 파일 banner 일괄 + placeholder 재할당 cascade

**banner 일괄 시도**: H1 라인을 anchor로 `# Title\n` → `# Title\n\n> ⚠️ banner\n` 패턴으로 29 파일에 ADR-020 cross-reference banner 삽입. 02-architecture/는 `./01-adr-log.md` 상대경로, 그 외 카테고리는 `../02-architecture/01-adr-log.md`.

**결과 — 24 파일 idempotent no-op**: `git diff HEAD --stat` 확인 시 24 파일은 변경 없음. 원인 — commit `de9c962`(다른 세션 진행분, 11:16에 27 파일 +54 line 일괄 banner)가 동일 텍스트를 이미 적용. Edit tool이 동일 결과를 산출하여 사실상 no-op.

**진짜 신규 가치 = placeholder 충돌 정정 cascade**: ADR-020 슬롯 점유로 `§5 예상 후보` 한 칸씩 밀어서 재할당:
- ADR-019(예상) → 슬롯 점유(argon2id, 세션 30) — 기존 처리됨
- **ADR-020(예상)**: ~~Prisma 8 업그레이드~~ → **standalone+rsync+pm2 reload(세션 50, 활성)** + Prisma 8 후보는 ADR-022로 재할당
- ADR-021(예상): 마이그레이션 롤백 5초 패턴 (슬롯 유지 — 원래 위치)
- ADR-022(예상): Prisma 7 → Prisma 8 업그레이드 타이밍 *(2026-04-25 재할당, 원래 ADR-020 후보)*
- ADR-023(예상): Next.js 16 → 17 업그레이드 전략 *(원래 ADR-022 후보)*
- ADR-024(예상): Capacitor 모바일 클라이언트 *(원래 ADR-023 후보)*
- §3.1 다음 ADR 번호: 021 → **025**

**16-ux-quality-blueprint §1570-1571 정정**:
- ~~ADR-019 (예상)~~ → **ADR-021 (예상)**: AI 챗 메시지 영구 저장 *(원래 ADR-019 슬롯, argon2id 점유로 재할당)*
- ~~ADR-020 (예상)~~ → **ADR-022 (예상)**: AI Gateway(Vercel) 조건부 채택 *(원래 ADR-020 슬롯, standalone 점유로 재할당)*

**01-adr-log §Z DQ 매핑 표 정정**:
- DQ-1.10 ~ 1.11 (Realtime 백프레셔) → ADR-019 (예상) → **ADR-021 (예상)**
- DQ-14.x (Capacitor 모바일) → ADR-020~023 (예상) → **ADR-022~024 (예상)**

**07-appendix/02-final-summary.md + 03-genesis-handoff.md**: banner 추가(02-final-summary는 placeholder 충돌 경고 banner도 추가).

**결론**: 29 파일 banner 검증 PASS (`grep -c "ADR-015 부분 대체 통지" → 29`), placeholder 충돌 5건 정정. 진짜 신규 변경: 5 docs(placeholder + checkpoint §보완) + 5 code + 1 마이그레이션.

### 토픽 3: _CHECKPOINT_KDYWAVE.md §보완 신설

**의도**: `_CHECKPOINT_KDYWAVE.md`는 Wave 5 완료(2026-04-18) 시점의 frozen 스냅샷. 본문 "역방향 피드백 0건"은 그 시점 사실로 유효. 이후 발생한 cross-cutting 변경(ADR-020 신설 등)은 본문 직접 수정이 아닌 부록으로 분리해야 시간 일관성 보존.

**§보완 섹션 신설 — 3 변경 항목 + 누적 변경 요약**:
- B-01 (2026-04-19, 세션 50): standalone+rsync+pm2 reload 채택, Capistrano 부분 대체
- B-02 (2026-04-25, 세션 51): kdywave 이행도 평가 A-(85/100) + ADR-020 정식 등록 + 5 핵심 cross-reference + Git 태그 3건 소급 + 공수 재보정
- B-03 (2026-04-25, 세션 52~53): kdywave --feedback 정식 모드 — 24 파일 banner(commit de9c962) + 29 파일 검증 + placeholder cascade 5건 정정 (본 세션)
- 누적 변경 요약 표: 정식 ADR 18 → 20, ADR-015 단독 언급 40 → 5, ADR-020 cross-reference 0 → 35, 역방향 피드백 0 유지, 다음 ADR 번호 019 → 025

**결론**: Wave 5 산출물의 시간 일관성 보존, 후속 변경 추적 가능.

### 토픽 4: S50 이월 — pm2-logrotate + postgresql systemd

**pm2-logrotate 설치**:
- 첫 시도 `wsl bash -c 'pm2 install pm2-logrotate'` → `command not found` (nvm 미로딩)
- 두 번째 시도 `wsl bash -lic 'pm2 install pm2-logrotate'` (interactive login shell, nvm 자동 로딩) → **3.0.0 설치 OK**
- 설정: `compress=true`, `retain=30`, `max_size=10M`, `dateFormat=YYYY-MM-DD_HH-mm-ss`, `rotateInterval=0 0 * * *` (일일 자정), `pm2 save`로 영속

**postgresql systemd 점검**:
- `/etc/wsl.conf` → `systemd=true` (이미 활성)
- `systemctl is-enabled postgresql` → `enabled` (영속)
- `systemctl is-enabled postgresql@16-main` → `enabled-runtime` (active running, but symlink 미저장)
- `pg_isready -h localhost -p 5432` → `accepting connections`
- 결론: `postgresql.service`(상위 wrapper)가 부팅 시 `postgresql@16-main`을 자동 기동하므로 enabled-runtime → persistent 승격은 운영상 불필요. sudo 패스워드 미보유로 강제 승격 시도하지 않음.

**결론**: pm2-logrotate 영속, postgresql 부팅 자동 기동 보장.

### 토픽 5: 우선순위 2 분류 + S49 이월 코드 처리

**분류 결과**:
| 항목 | 분류 | 처리 |
|------|------|------|
| KEK 일치 퍼즐 | 코드/조사 가능 | psql + log 검사 → 이미 해결 확인 |
| MASTER_KEY_PATH 단일 출처 | 코드 가능 | 헬퍼화 리팩터 |
| rotateKek 단위 테스트 | 코드 가능 | 4 케이스 추가 |
| SecretItem @@index 중복 | 코드 가능 | schema + 신규 마이그레이션 |
| `_test_session` drop | DB 파괴적 | 사용자 승인 필요, 보류 |
| MFA biometric QA 8 시나리오 | 환경/생체 | 사용자 직접 테스트 필요 |
| SP-013 wal2json 물리 측정 | 환경 | PG superuser + 30분 DML 주입 |
| SP-016 SeaweedFS 50GB | 환경 | SeaweedFS + 50GB 디스크 |
| KST 03:00 cleanup tick 24h+ | 시간 | 04-19~04-25 6일 연속 정상 실행 → 충족 |

#### A. KEK 일치 퍼즐 — 사실상 해결 확인

```sql
SELECT id, name, kek_version, length(encrypted_value) AS ct_len,
       length(iv) AS iv_len, length(tag) AS tag_len, created_at, rotated_at
FROM secret_items;
```
→ 1 row: `mfa.master_key`, `kek_version=1`, `ct_len=64`, `iv_len=12`, `tag_len=16`, `rotated_at=NULL`. shape 정상.

`pm2 logs ypserver --lines 30 --nostream` → decrypt/tag/vault 에러 0건.

→ 이미 해결된 상태. S49 이월의 "퍼즐"은 실상 미확증 우려였음. 디버깅 첫 단계는 항상 "이미 작동하는지 확인".

#### B. MASTER_KEY_PATH 단일 출처

```ts
// src/lib/vault/MasterKeyLoader.ts (신규 export)
export const DEFAULT_MASTER_KEY_PATH = "/etc/luckystyle4u/secrets.env";
export function resolveMasterKeyPath(): string {
  return process.env.MASTER_KEY_PATH ?? DEFAULT_MASTER_KEY_PATH;
}

// src/lib/vault/index.ts + scripts/migrate-env-to-vault.ts (양쪽)
const masterKey = loadMasterKey(resolveMasterKeyPath());
```

기존 인라인 default 2곳(`vault/index.ts:18-19`, `migrate-env-to-vault.ts:30-31`) 제거. 향후 경로 변경 시 단일 모듈만 수정.

#### C. rotateKek 단위 테스트 4건

```
1. 32 bytes 미만 newMasterKey 시 throw
2. 모든 row 가 신 KEK 로 재암호화 + kekVersion 증가 + rotatedAt 갱신
3. 회전 후 신 KEK 로 round-trip decrypt 성공 (구 KEK 로는 실패)
4. row 0건일 때 migratedCount=0 (no-op)
```
→ 14/14 PASS (기존 6 + 신규 4).

#### D. SecretItem @@index 중복 제거

`prisma/schema.prisma`:
```diff
   rotatedAt      DateTime? @map("rotated_at") @db.Timestamptz(3)

-  @@index([name])
   @@map("secret_items")
 }
```

신규 마이그레이션 `prisma/migrations/20260425000000_drop_redundant_secret_items_name_idx/migration.sql`:
```sql
DROP INDEX IF EXISTS "secret_items_name_idx";
```

DB 적용은 다음 `prisma migrate deploy` 시점.

**부가 발견**: 매일 03:00 KST cleanup 후 `[cleanup-scheduler] audit log write failed` 일일 경고는 better-sqlite3 ELF mismatch 잔재. commit `9a37dfb`(WSL 빌드 파이프라인)에서 이미 근본 수정. WSL 재배포 시 해소 예상. cleanup tick 자체는 6일 연속 정상.

**결론**: 268/268 vitest PASS + TypeScript 클린.

### 토픽 6: /cs 세션 종료

> **사용자**: "/cs"

**산출**: 저널 §세션 53 + 본 인수인계서 + current.md 행 추가 + logs/2026-04.md 상세 + next-dev-prompt 우선순위 재정렬 + 최종 커밋.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 24 파일 banner Edit 결과가 idempotent no-op로 판명 → 본 세션 가치는 placeholder cascade 정정 + 코드 + 마이그레이션 | A) 다시 작업 / B) 현 상태 수용 후 추가 가치(placeholder + 코드)에 집중 | B. commit `de9c962`가 동일 banner를 이미 적용했으므로 중복 작업 회피. 진짜 신규 가치는 충돌 5건 정정 + 4 코드 리팩터 + 1 마이그레이션. |
| 2 | placeholder cascade — ADR-020 점유로 후보 ADR-021~024 한 칸씩 밀기 | A) ADR-020을 그대로 두고 충돌 명시만 / B) cascade 재할당 | B. 한 표 안에서 동일 번호가 다른 의미로 두 번 등장하면 미래 ADR 등록 시 회귀 가능. cascade로 단일 의미 보장. |
| 3 | postgresql@16-main `enabled-runtime → persistent` 승격 보류 | A) sudo 패스워드 요청 / B) 현 상태 수용 | B. 상위 `postgresql.service`가 부팅 시 cluster 자동 기동하므로 운영상 동등. 사용자 패스워드 인터럽트 회피. |
| 4 | `_test_session` drop 보류 | A) 즉시 drop / B) 사용자 승인 후 처리 | B. DB 파괴적 작업 + 명시적 승인 부재. 시스템 프롬프트 "Hard-to-reverse operations" 카테고리 적용. |
| 5 | KEK 일치 퍼즐 — 이미 해결 상태로 판명 → 추가 작업 없음 | A) 가설적 해결 코드 작성 / B) 운영 상태 검사 후 OK 보고 | B. 디버깅 첫 단계는 "이미 작동하는지 확인". 운영 ypserver는 decrypt 에러 0건이므로 실제 문제 부재. S49 이월 항목이 가정형이었음을 명시. |
| 6 | SecretItem 중복 인덱스 — 마이그레이션 추가 + DB 적용은 사용자 보류 | A) 즉시 prisma migrate deploy / B) 마이그레이션만 추가하고 DB 적용은 다음 배포 | B. DB 적용은 운영 영향(미미하지만 0은 아님). 마이그레이션 파일은 idempotent (DROP INDEX IF EXISTS), 다음 배포에서 자동 적용. |

## 수정 파일 (10개 + 1개 신규 마이그레이션)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md` | §보완 섹션 신설 (B-01~B-03 + 누적 변경 요약 표, +30 lines) |
| 2 | `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` | §3.1 다음 번호 021→025 / §5 placeholder cascade 재할당(ADR-021~024) / §Z DQ 매핑 정정 (DQ-1.10/11→021, DQ-14.x→022~024) |
| 3 | `docs/research/2026-04-supabase-parity/02-architecture/16-ux-quality-blueprint.md` | §1570-1571 ADR-019/020 (예상) → ADR-021/022 (예상), 점유 사유 명시 |
| 4 | `docs/research/2026-04-supabase-parity/07-appendix/02-final-summary.md` | banner 추가 + placeholder 충돌 경고(PM2 cluster vs cron-worker 분리 → ADR-021) |
| 5 | `docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md` | banner 추가 |
| 6 | `prisma/schema.prisma` | `model SecretItem`의 `@@index([name])` 제거 |
| 7 | `prisma/migrations/20260425000000_drop_redundant_secret_items_name_idx/migration.sql` (신규) | `DROP INDEX IF EXISTS "secret_items_name_idx"` |
| 8 | `src/lib/vault/MasterKeyLoader.ts` | `DEFAULT_MASTER_KEY_PATH` 상수 + `resolveMasterKeyPath()` 헬퍼 export |
| 9 | `src/lib/vault/index.ts` | `resolveMasterKeyPath()` 사용 + DEFAULT_MASTER_KEY_PATH re-export |
| 10 | `scripts/migrate-env-to-vault.ts` | 동일 헬퍼 사용 (인라인 default 제거) |
| 11 | `src/lib/vault/VaultService.test.ts` | rotateKek 단위 테스트 4건 추가 (총 6→10) |

**WSL 운영 변경** (코드 외):
- pm2-logrotate@3.0.0 설치 (`compress=true`, `retain=30`, `max_size=10M`, 일일 rotation, `pm2 save` 영속)
- postgresql 점검: 이미 enabled, 부팅 자동 기동 보장 확인

## 검증 결과

- `npx tsc --noEmit` → **0 errors**
- `npm test` → **268/268 PASS** (16 test files, 1.90s)
- `npm test -- src/lib/vault/VaultService.test.ts` → **10/10 PASS** (기존 6 + 신규 rotateKek 4)
- `wsl pm2 list` → cloudflared(6D, online) + ypserver(3h, ↺=2, online) + pm2-logrotate(3.0.0, online)
- `wsl psql -c "SELECT ... FROM secret_items"` → 1 row 정상 shape
- `wsl systemctl is-enabled postgresql` → `enabled` (영속)
- `git diff HEAD --stat` → 10 files / 1 new migration / +161/-21
- `grep -c "ADR-015 부분 대체 통지" docs/research/2026-04-supabase-parity` → 29 파일 모두 banner 보유
- `grep -n "ADR-020" docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` → §0.4 / §1 본문 / §2 의존 그래프 / §3.1 다음 번호 / §5 cascade / §Z DQ 매핑 모두 ADR-020 활성 + ADR-021~024 후보 정합

## 터치하지 않은 영역

- `docs/research/2026-04-supabase-parity/01-research/14-operations/*` (3 파일, Wave 1 deep-dive 73문서) — **역사 보존 원칙**으로 미수정
- `docs/research/2026-04-supabase-parity/_archived/*` — 역사 보존
- 코드 영역 100% (`src/`, `prisma/`(스키마+신규 마이그레이션 외), `scripts/`(migrate-env-to-vault.ts 외), `standalone/`) — 본 세션은 vault refactor + 마이그레이션 한정
- 다른 2개 wave (`docs/supabase-wave/`, `docs/platform-evolution-wave/`) — 본 작업 대상 외
- WSL 운영 측: ypserver 재시작 / 배포 / 마이그레이션 적용 — 모두 다음 배포 시점에 자연스럽게 흡수됨

## 알려진 이슈

### 1. 24 banner 파일 Edit 결과 idempotent no-op (이상 동작은 아님)
commit `de9c962`에서 동일 banner가 이미 적용되어 본 세션 Edit이 사실상 변경 없음. 확증: `grep -c` 1, `git diff HEAD` 변경 없음. 실제 가치는 placeholder cascade + 코드 + 마이그레이션.

### 2. SecretItem 중복 인덱스 DB 적용 미반영
마이그레이션 파일은 추가했으나 DB에는 다음 `prisma migrate deploy` 또는 `/ypserver prod` 실행 시 적용. 영향: 미미한 write/disk 오버헤드 잔존 (lookup 성능은 동일).

### 3. 매일 03:00 "audit log write failed" 경고 잔존
원인은 better-sqlite3 ELF mismatch — commit `9a37dfb`에서 근본 수정됨. 다음 WSL 재배포(`wsl-build-deploy.sh`) 시 해소 예상. cleanup 자체는 정상 동작 (6일 연속).

### 4. postgresql@16-main `enabled-runtime` 상태
운영상 영향 없음 (상위 postgresql.service가 부팅 시 cluster 자동 기동). sudo 패스워드 보유 시 향후 `sudo systemctl enable postgresql@16-main`으로 persistent 승격 가능.

## 다음 작업 제안

### 우선순위 0 (즉시)
1. **WSL 재배포 → audit log write 회복 + better-sqlite3 ELF 재발 모니터링** (`scripts/wsl-build-deploy.sh` 실행)
2. **다음 prisma migrate deploy로 `secret_items_name_idx` DROP 반영** (자동 흡수, 별도 작업 불필요)

### 우선순위 1 (이번 주)
3. **`_test_session` 테이블 drop 사용자 승인 + 실행** (S49 이월)
4. **브라우저 E2E CSRF 풀 플로우 검증** (S52 이월)
5. **DATABASE_URL 패스워드 rotation** (S52 이월)

### 우선순위 2 (이월 — 환경/생체 의존 잔존)
6. MFA biometric QA 8 시나리오 (`docs/guides/mfa-browser-manual-qa.md`)
7. SP-013 wal2json 물리 측정 (PG superuser + 30분 DML 주입)
8. SP-016 SeaweedFS 50GB 검증 (SeaweedFS + 50GB 디스크)
9. Windows 재부팅 자동 복구 실증 (S50 이슈 #2)

### Compound Knowledge 후보 (본 세션)
- **ADR placeholder cascade 재할당 패턴**: ADR-020 슬롯 점유로 §5 예상 후보가 한 칸씩 밀린 사례. 신규 ADR 등록 시 §0.4 / §3.1 / §5 / §Z DQ 매핑 / 산하 Blueprint 예상 표 등 **5+ 위치 동시 검색 + cascade 갱신**이 필수임을 보강. S51의 "ADR 번호 충돌 + 부분 대체" 패턴(이미 등록)에 cascade 항목을 보강하는 것이 깔끔.

---

[← handover/_index.md](./_index.md)
