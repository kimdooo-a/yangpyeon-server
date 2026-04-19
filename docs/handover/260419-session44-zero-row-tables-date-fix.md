# 인수인계서 — 세션 44 (0-row 테이블 17 파일 Date 직렬화 선제 일괄 수정 + 공용 헬퍼 도입)

> 작성일: 2026-04-19
> 이전 세션: [session43](./260419-session43-users-date-fix.md)
> 저널: [logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md) (세션 44 섹션)

---

## 작업 요약

세션 43 이월 8건을 우선순위 분류 후 본 세션 가능 범위 3건 처리 — **P3** (잔존 `::uuid` grep) 0건 즉시 종결, **P2** (0-row 테이블 17 파일 Date 직렬화 선제 일괄 수정) 공용 헬퍼 `fetchDateFieldsText` 도입 + 12 파일 수정 (수정 불필요 5 파일은 Date 응답 없음 판별 후 제외) + 단위 테스트 10건 + E2E 검증 스크립트 신규, **P1** baseline 스냅샷 수집(자동 tick 0 entries, uptime 67분 < 24h 정상)으로 익일 이월. tsc 0 / vitest 244 → **254 PASS** / `/ypserver prod --skip-win-build` (PM2 ↺=15) / E2E 5건 diff_ms=0 ×5 (webhook POST/GET-single/GET-list, cron POST, log-drain POST) — 응답 createdAt === PG authoritative UTC 완벽 수렴. CK 갱신 1건 (orm-date-filter-audit-sweep.md 잔존 과제 §2 해소).

## 대화 다이제스트

### 토픽 1: 이월 8건 우선순위 분류
> **사용자**: "이월 사항 모두 순차적으로 진행"

세션 43 이월 8건 중 본 세션 실질 진전 가능 범위 분류:
- **P3** (잔존 `::uuid` grep, 10분) → 가능 ✅
- **P2** (0-row 테이블 17 파일 선제 일괄 수정, 1-2h) → 가능 ✅
- **P1** (KST 03:00 자동 cleanup tick) → PM2 uptime 67분 (재배포 ↺=14 직후), 24h+ 미달 → baseline 스냅샷만, 익일 이월
- P4 (MFA biometric QA) → 사용자 직접 브라우저 인터랙션 필요, 자동화 불가 → 후속 이월
- P5 (HS256 legacy 제거) → 단독 세션 권장 (쿠키 무효화 리스크) → 후속 이월
- P6·P7·P8 → 24h+ 규모 또는 환경 제약 → 후속 이월

**결론**: 자율 정책(memory `feedback_autonomy.md`) — 분기 질문 없이 P3 → P2 → P1 baseline 순 즉시 착수.

### 토픽 2: P3 잔존 `::uuid` grep — 0건 즉시 완료

`grep -rn "::uuid" src/` → 0 matches. 세션 43 5곳 제거 후 추가 도입 없음. 즉시 완료.

**결론**: P3 종결. 다음 세션 이월 목록에서 제거.

### 토픽 3: DB 스키마 인벤토리 (P2 사전 분석)

`information_schema.columns` 전수 조회로 8 대상 테이블 검증:
- 모든 id 컬럼 = `text` (Prisma `String @id` 기본 매핑) → `::uuid` 캐스트 절대 금지, `::text[]` 강제
- 모든 Date 컬럼 = `timestamp with time zone` (세션 40 마이그레이션 적용 일관)

테이블별 Date 컬럼 매핑:
- cron_jobs: created_at, last_run_at, updated_at
- webhooks: created_at, last_triggered_at, updated_at
- api_keys: created_at, last_used_at, revoked_at, updated_at
- log_drains: created_at, last_delivered_at, updated_at
- edge_functions: created_at, updated_at
- edge_function_runs: started_at, finished_at
- mfa_enrollments: confirmed_at, created_at, locked_until, updated_at
- webauthn_authenticators: created_at, last_used_at

DB 인벤토리 전수 행수 = 0 rows. **선제적 수정 = 가시 영향 0 + 데이터 유입 시점 회귀 영구 차단**.

### 토픽 4: 헬퍼 도입 결정 (인라인 vs 헬퍼)

세션 43 인라인 패턴 B/C 를 12 파일에 반복 vs 헬퍼 도입 트레이드오프:

| 옵션 | LOC | 단일 점검점 | 보안 | 향후 비용 |
|------|-----|------------|------|----------|
| 인라인 | 90~180 (12 파일) | ❌ | 파일별 분산 | 새 endpoint 마다 반복 |
| **헬퍼** | 80(헬퍼) + 50(call) = 130 | ✅ | 두 겹 화이트리스트 단일점 | import + 3 라인 |

**결론**: 헬퍼 채택. next-dev-prompt 자체에서 권장 (`fetchDateFieldsText(table, ids, fields[])`).

### 토픽 5: 헬퍼 보안 함정

`Prisma.raw(table)` / `Prisma.raw(selectClause)` 는 동적 식별자 보간 → SQL injection 벡터. **두 겹 방어 강제**:
- `ALLOWED_TABLES = new Set<string>([...11 테이블...])` — 임의 테이블 차단
- `COLUMN_RE = /^[a-z][a-z0-9_]*$/` — 컬럼명 SQL injection 차단 (`created_at; DROP TABLE` → throw)

ids 는 `${idArray}::text[]` 로 안전 바인딩 (Prisma 가 파라미터화 처리).

단위 테스트 10건으로 boundary 검증:
1. 빈 ids → 빈 Map (DB 호출 없음)
2. 빈 fields → 빈 Map (DB 호출 없음)
3. 화이트리스트 외 테이블 → throw
4. SQL injection 컬럼명 → throw
5. 대문자 컬럼명 → throw (PG snake_case 강제)
6. 정상 호출 → Map 반환
7. 누락 _text 컬럼 → null 처리
8. toIsoOrNull null
9. toIsoOrNull undefined/빈 문자열
10. PG timestamptz 텍스트 → ISO 변환

### 토픽 6: 12 파일 일괄 수정

세션 43 패턴 B (전체 raw) / C (보조 + Map 병합) 를 헬퍼 호출 형태로 통일:

```ts
// 목록 패턴 (file-local 헬퍼 함수)
const X_DATE_FIELDS = ["created_at", "updated_at", "last_run_at"] as const;
async function attachXDates<T extends { id: string }>(rows: T[]) {
  const dateMap = await fetchDateFieldsText("table_name", rows.map(r => r.id), X_DATE_FIELDS);
  return rows.map(r => {
    const d = dateMap.get(r.id);
    return {
      ...r,
      createdAt: toIsoOrNull(d?.created_at),
      updatedAt: toIsoOrNull(d?.updated_at),
      lastRunAt: toIsoOrNull(d?.last_run_at),
    };
  });
}

// 단건 패턴
async function withXDates<T extends { id: string }>(row: T) { ... }
```

각 파일 헬퍼 1~2개 + 핸들러 1줄 호출.

### 토픽 7: 수정 불필요 5 파일 판별

Prisma write-only 후 응답에 Date 미포함하면 parsing-side 시프트 영향 없음:
- `cron/[id]/run/route.ts` — runNow 결과만
- `webhooks/[id]/trigger/route.ts` — deliver 결과만
- `log-drains/[id]/test/route.ts` — deliver 결과만
- `functions/[id]/run/route.ts` — 실행 결과만
- `mfa/webauthn/authenticators/[id]/route.ts` — DELETE 만 (success boolean)

5 파일 작업 제거로 효율적 스코프.

### 토픽 8: functions/route.ts nested runs 처리

`include: { runs: { take: 1 } }` 의 nested Date `runs[0].startedAt` 처리 위해:
- runs select 에 `id: true` 추가 (헬퍼 호출 위해)
- 두 헬퍼 호출: `fnDateMap` (edge_functions.updated_at) + `runDateMap` (edge_function_runs.started_at)
- mapping 시 두 Map 모두 lookup

### 토픽 9: mfa/status enrollment id 추가

`mfaEnrollment.findUnique({where:{userId}})` 가 id 미선택 → 헬퍼 호출 위해 select 에 `id: true` 추가. 응답 shape 영향 없음 (id 는 응답에 포함 안 됨).

### 토픽 10: E2E 검증 스크립트

`scripts/session44-verify.sh` 신규 — 지속 자산:
- 로그인 → POST 3종 (webhook/cron/log-drain) → GET 1종 (webhook 단건/목록)
- 각 응답 createdAt vs PG `to_char(... AT TIME ZONE 'UTC' ...)` diff_ms 계산
- diff_ms 가 ±2 초과 시 fail (ms 정밀도 허용)
- DELETE 정리

**결과**: 5건 diff_ms=0 ×5 ✓. 9h → 0 정확 수렴.

### 토픽 11: P1 baseline

`pm2 logs dashboard --lines 400 | grep -iE 'cleanup|CLEANUP'` → 0 entries. PM2 uptime 67분(↺=14 직후) → 자동 tick 미발동(정상, 다음 KST 03:00 발동 예정). 다음 세션이 24h+ 후 관찰.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|-----------|
| 1 | 이월 8건 중 P3·P2·P1 baseline 만 | 모두 / 3건 / 1건 | 환경/스코프 제약 + 사용자 참여 불필요 + 시간 균형 |
| 2 | 17 파일 → 12 수정 + 5 미수정 | 17 일괄 / 12 / users 만 (43과 동일) | Date 응답 없는 5 파일은 시프트 영향 없음 판별. 과대 작업 회피 |
| 3 | 헬퍼 도입 vs 인라인 | 인라인 90~180 LOC / 헬퍼 130 LOC | 단일 점검점 + 보안 일관성 + 향후 endpoint 즉시 적용. next-dev-prompt 권장 |
| 4 | 보안 두 겹 화이트리스트 | 정규식만 / Set만 / 둘 다 | 테이블명/컬럼명 SQL injection 두 벡터 분리 차단 |
| 5 | E2E 스크립트 인라인 vs 파일 | wsl bash 인라인 / scripts/ 파일 | 세션 43 패턴 (지속 자산). 향후 회귀 가드 |
| 6 | functions runs nested 처리 | runs select 변경 / 별도 fetch / Map 병합 | runs.id 추가 + 두 헬퍼 호출 (가장 명시적) |

## 수정 파일 (16개 = 12 수정 + 3 신규 + 1 갱신)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `src/lib/date-fields.ts` (신규) | 공용 헬퍼 + ALLOWED_TABLES + COLUMN_RE + fetchDateFieldsText + toIsoOrNull |
| 2 | `src/lib/date-fields.test.ts` (신규) | 10 단위 테스트 (boundary + injection + 정상) |
| 3 | `src/app/api/v1/cron/route.ts` | GET + POST attachCronDates 헬퍼 |
| 4 | `src/app/api/v1/cron/[id]/route.ts` | GET + PATCH withCronDates 단건 |
| 5 | `src/app/api/v1/webhooks/route.ts` | GET + POST attachWebhookDates |
| 6 | `src/app/api/v1/webhooks/[id]/route.ts` | GET + PATCH withWebhookDates |
| 7 | `src/app/api/v1/api-keys/route.ts` | GET + POST(issueApiKey 결과 attach) attachApiKeyDates |
| 8 | `src/app/api/v1/api-keys/[id]/route.ts` | DELETE (revokedAt) 인라인 |
| 9 | `src/app/api/v1/log-drains/route.ts` | GET + POST attachLogDrainDates |
| 10 | `src/app/api/v1/log-drains/[id]/route.ts` | GET + PATCH withLogDrainDates |
| 11 | `src/app/api/v1/functions/route.ts` | GET (nested runs) fnDateMap + runDateMap 병행 |
| 12 | `src/app/api/v1/functions/[id]/route.ts` | GET + PATCH withFunctionDates |
| 13 | `src/app/api/v1/functions/[id]/runs/route.ts` | GET runs.map + dateMap |
| 14 | `src/app/api/v1/auth/mfa/status/route.ts` | enrollment + passkeys 2 헬퍼 호출 + enrollment.id select 추가 |
| 15 | `scripts/session44-verify.sh` (신규) | E2E 5건 diff_ms 검증 (지속 자산) |
| 16 | `docs/solutions/2026-04-19-orm-date-filter-audit-sweep.md` (갱신) | "세션 44 추가" 섹션 append (잔존 과제 §2 해소) |

## 상세 변경 사항

### 1. `src/lib/date-fields.ts` — 공용 헬퍼

- `ALLOWED_TABLES` Set: 11 테이블 명시 (users + cron_jobs + webhooks + api_keys + log_drains + edge_functions + edge_function_runs + mfa_enrollments + mfa_recovery_codes + webauthn_authenticators + sessions)
- `COLUMN_RE` 정규식: `/^[a-z][a-z0-9_]*$/` (소문자 snake_case 강제)
- `fetchDateFieldsText<F>(table, ids, fields[])`:
  - 빈 ids/fields → 빈 Map (DB 호출 없음)
  - 화이트리스트 외 테이블 → throw `테이블 화이트리스트 위반`
  - 컬럼명 정규식 위반 → throw `컬럼명 형식 위반`
  - `Prisma.sql\`SELECT id, ${Prisma.raw(selectClause)} FROM ${Prisma.raw(table)} WHERE id = ANY(${idArray}::text[])\``
  - rows → Map<id, Record<F, string|null>>
- `toIsoOrNull(text)`: null/undefined/빈 문자열 → null, 그 외 `new Date(text).toISOString()`

### 2. `src/lib/date-fields.test.ts` — 10 단위 테스트

vitest mock으로 `prisma.$queryRaw` 모킹. boundary + injection + 정상 케이스 커버. **vitest 244 → 254 PASS** (+10).

### 3~14. 12 API 라우트 파일

각 파일 패턴:
- import: `import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";`
- file-local 헬퍼: `attachXDates` (목록) / `withXDates` (단건)
- 핸들러 1줄 변경: `return successResponse(await attachXDates(rows));`

### 15. `scripts/session44-verify.sh` — E2E 검증 (지속 자산)

- assert_iso_eq_pg(label, table, id, resp_iso): node로 ms 변환 후 diff 계산, ±2ms 초과 시 fail
- 9 단계: 로그인 → POST webhook → GET single → GET list → DELETE → POST cron → DELETE → POST log-drain → DELETE
- 5건 diff_ms=0 검증

### 16. CK `orm-date-filter-audit-sweep.md`

"잔존 과제" §2 해소 표기 + "세션 44 추가" 섹션:
- 헬퍼 설계 (보안 두 겹 + API)
- 12 파일 수정 표
- 수정 불필요 5 파일 판별 근거
- E2E 결과 (5건 diff_ms=0)
- 교훈 3건 (선제 vs 데이터 유입 균형 / 헬퍼 vs 인라인 분기점 / 회귀 가드 자산 누적)

## 검증 결과

- `npx tsc --noEmit` — 0 에러
- `npx vitest run` — 14 files / **254 tests PASS** (회귀 0, 헬퍼 +10)
- `/ypserver prod --skip-win-build`:
  - Phase 1 스킵
  - Prisma migrate deploy: pending 없음
  - WSL 빌드 성공
  - Drizzle: applied
  - PM2 restart ↺=15
  - Cloudflared 9h online
  - 헬스체크 HTTP 307
- E2E (`session44-verify.sh`):
  - webhook POST: diff_ms=0 ✓
  - webhook GET single: diff_ms=0 ✓
  - webhook GET list: diff_ms=0 ✓
  - cron POST: diff_ms=0 ✓
  - log-drain POST: diff_ms=0 ✓
  - DELETE 정리 3건 OK
- P1 baseline: cleanup 0 entries (uptime 67분, 정상)

## 터치하지 않은 영역

- **5 파일 (Date 응답 없음)** — cron/[id]/run / webhooks/[id]/trigger / log-drains/[id]/test / functions/[id]/run / mfa/webauthn/authenticators/[id]
- **HS256 legacy 제거** — 단독 세션 권장 (쿠키 무효화 리스크)
- **MFA biometric 브라우저 QA** — 사용자 직접 인터랙션 필수
- **Phase 16 / SP-013·016 / /kdygenesis** — 긴 스코프

## 알려진 이슈

- **Prisma 7 adapter-pg parsing-side +9h 시프트는 여전히 구조적 문제** — 본 세션은 헬퍼로 회피. 근본 해결은 Prisma upstream 또는 어댑터 교체.
- **헬퍼는 ALLOWED_TABLES 갱신 필수** — 새 테이블 추가 시 Set 갱신. 누락 시 `테이블 화이트리스트 위반` throw 로 즉시 발견.
- **functions/route.ts nested runs select 에 id 추가** — 향후 select 변경 시 id 유지 주의.

## 다음 작업 제안

세션 45 권장 우선순위:

1. **KST 03:00 자동 cleanup tick 실측** (즉시 가능, 익일 KST 03:00 이후, PM2 uptime 24h+ 확보 시)
   ```bash
   wsl -e bash -c "source ~/.nvm/nvm.sh && pm2 logs dashboard --lines 400 --nostream --raw | grep -iE 'cleanup|CLEANUP'"
   psql <db> -c "SELECT action, timestamp FROM audit_logs WHERE action LIKE 'CLEANUP%' ORDER BY id DESC LIMIT 10"
   ```
2. **MFA biometric 브라우저 QA** (1-2h, 사용자 직접) — `docs/guides/mfa-browser-manual-qa.md` 8 시나리오.
3. **HS256 legacy 제거** (단독 세션 권장).
4. **Phase 16 진입** (24h) — Vault VaultService AES-256-GCM / Capistrano 배포 자동화 / Canary 시간차 배포 / Infrastructure 페이지.
5. **SP-013/016 물리 측정** (13h, 환경 확보 시).
6. **/kdygenesis --from-wave** — 85+ 태스크 주간 플로우 변환.

---
[← handover/_index.md](./_index.md)
