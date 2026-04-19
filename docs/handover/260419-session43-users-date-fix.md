# 인수인계서 — 세션 43 (세션 42 이월 3건 순차 처리 — P1 관찰 + P2 users 테이블 확산 + P3 기각)

> 작성일: 2026-04-19
> 이전 세션: [session42](./260419-session42-insert-audit.md)
> 저널: [logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md) (세션 43 섹션)

---

## 작업 요약

세션 42 의 이월 3건(P1 KST 03:00 자동 cleanup tick / P2 CK §2 기타 API route Date 직렬화 / P3 CK §3 Next.js Set-Cookie Expires) 을 순차 진행. **P1** 은 PM2 uptime 111분(↺=12 직후)로 자동 tick 미발동, 현 상태만 관찰 + 다음 세션(uptime 24h+)으로 이월. **P2** 는 `scripts/session43-parsing-repro.ts` 로 Prisma 7 adapter-pg parsing-side +9h 시프트를 users 테이블에서 실측 재현(diff=32,400,147ms 정확) → 데이터 있는 users 경로 4 API 파일 7 핸들러를 패턴 B/C 확장으로 수정(전체 raw SELECT + `::text` 캐스팅 또는 보조 raw SELECT + Map 병합). 도중 `::uuid` 캐스트 오남용으로 500 발생(users.id PG `text` 타입) → 5곳 수정 후 E2E 완벽 검증. **P3** 는 `node_modules/@edge-runtime/cookies/index.js` 소스 추적 + 실측으로 +9h 시프트 재현 불가 확정 → 가설 기각. tsc 0 / vitest 244 PASS (회귀 0, 2회) / `/ypserver prod` 2차 재배포 (PM2 ↺=13→14) / E2E 응답 `createdAt="2026-04-06T14:11:17.147Z"` === PG authoritative UTC 완벽 일치. CK 갱신 2건(누적 32 유지).

## 대화 다이제스트

### 토픽 1: 이월 과제 범위 재현실화
> **사용자**: "이월 사항 모두 순차적으로 진행."

next-dev-prompt 의 이월 7~8 건 중 본 세션 내 실질 진전 가능한 3 건 선별:
- **P1** (KST 03:00 자동 cleanup tick 관찰): PM2 uptime 24h+ 필요 → 현 상태 관찰만.
- **P2** (CK §2 기타 API route Date 직렬화): 수정 가능 — 핵심 범위.
- **P3** (CK §3 Next.js Set-Cookie Expires): 소스 추적 + 실측 가능.
- P4~P8 (MFA biometric / HS256 legacy / Phase 16 / SP-013·016 / genesis): 별도 긴 세션 or 사용자 참여 필요 → 후속 이월 유지.

**결론**: 3건 범위로 즉시 착수, 분기 질문 없음 (memory `feedback_autonomy.md`).

### 토픽 2: P1 현 상태 관찰
- 현재 KST 17:47, PM2 `dashboard` uptime 111분 · restarts 12 (세션 42 재배포 직후).
- `pm2 logs dashboard --lines 400 | grep -i cleanup` → entry 0건 (정상, 다음 발동 KST 03:00).

**결론**: 현 상태 기록만, 자동 tick 실측 다음 세션 이월.

### 토픽 3: P2 parsing-side 시프트 실측 재현
세션 41/42 CK 의 "parsing-side 시프트 잔존" 가설을 **확증** 하기 위해 `scripts/session43-parsing-repro.ts` 작성. tsx 로 `prisma.user.findMany({select:{createdAt:true}})` vs raw `EXTRACT(EPOCH FROM created_at)` 비교:

```
=== ORM findMany (parsing-side) ===
{"id":"c0c0b305","ormCreatedIso":"2026-04-06T23:11:17.147Z"}
=== raw ::text + EPOCH (authoritative) ===
{"id":"c0c0b305","epochIsoCreated":"2026-04-06T14:11:17.000Z"}
=== diff (ms) between ORM vs EPOCH ===
{"id":"c0c0b305","diffMs":32400147,"diffHours":9.00004}
```

**결론**: 가설 완벽 재현 (+9h, 정확히 32,400,000ms 근접). `r.createdAt.getTime()` 자체가 시프트되어 있어 caller 가 `.toISOString()` 뿐 아니라 만료 계산에도 쓰면 9h 판정 오차 발생 가능 — 데이터 손실성 리스크.

### 토픽 4: 수정 범위 결정 (스코프 타협)
DB 인벤토리 — webauthn/mfa/cron/webhooks/api-keys/log_drains/edge_functions 모두 **0 rows**. users 테이블만 데이터 존재 (admin 1명 + test 2명).

UI 영향 경로 확인: `src/app/(protected)/members/[id]/page.tsx` + `src/app/(protected)/members/page.tsx` 가 응답 받은 `lastLoginAt`/`createdAt`/`updatedAt` 을 그대로 `new Date(...).toLocaleString("ko-KR")` 로 표시 → admin 이 **지금 UI 에서 9h 시프트된 시각을 보고 있음** (재현 확증).

**결정**: users 테이블 4 API 파일 (7 핸들러) 즉시 수정. 0-row 17 파일은 데이터 유입 시 후속 이월 (세션 42 "선제적 방어 최소 비용 원칙" + 세션 41 "전수 감사 신호" 균형).

### 토픽 5: 패턴 B 적용 4 파일
- `src/app/api/v1/members/[id]/route.ts` — GET + PUT: 전체 raw SELECT with `::text`.
- `src/app/api/v1/members/route.ts` — GET: 보조 raw SELECT + Map 병합 (패턴 C 확장, orderBy 순서 ORM 결과 유지).
- `src/app/api/v1/auth/me/route.ts` — GET + PUT: 전체 raw SELECT with `::text`.
- `src/app/api/settings/users/route.ts` — GET + POST + PATCH: 전체 raw SELECT + create 후 createdAt 재조회.

### 토픽 6: 파생 버그 — `::uuid` 캐스트 오남용 500
1차 tsc 0 / vitest 244 PASS 통과, 재배포 후 E2E curl → **HTTP 500**. PM2 logs:
```
operator does not exist: text = uuid
Raw query failed. Code: `42883`.
```

**원인**: `WHERE id = ${id}::uuid` 작성했으나 `information_schema.columns` 조회 결과 users.id 컬럼 타입은 **PG `text`** (Prisma `String @id` 기본 매핑). `$1::uuid` 캐스팅이 type mismatch 초래.

**수정**: 5 곳 `::uuid` 제거 → `WHERE id = ${id}` (text = text). `ANY(${ids}::uuid[])` → `ANY(${ids}::text[])`.

**교훈**: tsc 는 raw SQL 문자열 파라미터 타입을 검증 못 함. 신규 raw SQL 도입 시 체크리스트 (1) `information_schema.columns` 로 실제 컬럼 타입 확인 + (2) 배포 후 실 API 1회 curl E2E = 필수.

### 토픽 7: E2E 검증
`scripts/session43-verify.sh` 실행:
- 서버 응답 `Date: Sun, 19 Apr 2026 09:06:59 GMT`
- `/api/v1/auth/me` 응답 `createdAt: "2026-04-06T14:11:17.147Z"`
- PG `to_char(... AT TIME ZONE 'UTC' ...)` = `2026-04-06T14:11:17.147Z`
- **완벽 일치** (이전 ORM 경로 `"...T23:11:17Z"` +9h 시프트 제거).

### 토픽 8: P3 Next.js Set-Cookie Expires 근본 조사
- `node_modules/next/dist/compiled/@edge-runtime/cookies/index.js`:
  - line 324-325: `cookie.expires = new Date(Date.now() + cookie.maxAge * 1e3)` (maxAge → expires 자동 파생)
  - line 36: `Expires=${cookie.expires.toUTCString()}` (직렬화)
- `Date.now()` UTC ms 표준 + `toUTCString()` UTC 포맷 → 이론상 시프트 없어야 함.
- 실측: Set-Cookie `Expires=Sun, 26 Apr 2026 09:06:59 GMT` (서버 Date + 정확히 +7d UTC, 시프트 **0h**).

**결론**: §3 가설 **재현 불가 → 기각**. 세션 42 관측값(+9h)은 원인 불명 일시 현상이거나 관측 오해. 기술부채 영구 제거.

### 토픽 9: CK 갱신 + /cs 자동 마감
- `orm-date-filter-audit-sweep.md` — "세션 43 추가" 섹션: 재현 스크립트 결과 + 수정 범위 + 파생 교훈(::uuid) + 후속 이월(0-row 테이블).
- `prisma-orm-tz-naive-filter-gotcha.md` — "잔존 과제 업데이트" 섹션에서 §3 기각 표기 (실측 근거 + Next.js 소스 추적 근거).

`/cs` 스킬로 current/logs/handover/next-dev-prompt/journal 일괄 갱신 + 커밋 + 푸시.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|-----------|
| 1 | 이월 7건 중 3건만 본 세션 범위 | 모두 시도 / 3건 선별 / 1건만 | 실질 진전 가능성 + 사용자 참여 불필요 + 세션 시간 고려 |
| 2 | users 4 파일만 수정, 나머지 17 파일 이월 | 20 파일 전수 일괄 / users만 / 안 함 | DB 인벤토리 0-row 확인 → 가시 영향 0 + 과대 리팩토링 회피 |
| 3 | 패턴 B (전체 raw) vs 패턴 C (보조 쿼리) 혼용 | 일관 B / 일관 C / 혼용 | members 목록은 WHERE/pagination 복잡 → 보조 쿼리 C 확장 (Map 병합) 경제적 |
| 4 | `::uuid` 제거 vs users.id 타입 uuid 로 변경 | 컬럼 타입 변경 / 캐스트 제거 | 컬럼 타입 변경은 마이그레이션 + cascade 영향 큼. 캐스트 제거 최소 비용 |
| 5 | §3 재현 불가 시 기각 vs 추가 조사 | 기각 / 세션 44 재시도 / upstream 리포트 | 20분 조사로 소스 추적 + 실측 완료 → 기각이 기술부채 영구 제거, 재현 못 하는 가설에 시간 안 씀 |

## 수정 파일 (4개) + 신규 (2개) + 갱신 (2개)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `src/app/api/v1/members/[id]/route.ts` | GET + PUT: 전체 raw SELECT with `::text` (패턴 B) |
| 2 | `src/app/api/v1/members/route.ts` | GET: 보조 raw SELECT + Map 병합 (패턴 C 확장) |
| 3 | `src/app/api/v1/auth/me/route.ts` | GET + PUT: 전체 raw SELECT with `::text` |
| 4 | `src/app/api/settings/users/route.ts` | GET + POST + PATCH: 전체 raw SELECT, POST create 후 createdAt 재조회 |
| 5 (신규) | `scripts/session43-parsing-repro.ts` | tsx 실행 parsing-side +9h 시프트 재현 (지속 가치) |
| 6 (신규) | `scripts/session43-verify.sh` | 로그인 + API 3종 + psql UTC 비교 E2E (지속 가치) |
| 7 (갱신) | `docs/solutions/2026-04-19-orm-date-filter-audit-sweep.md` | 세션 43 추가 섹션 — 재현/수정/교훈/이월 |
| 8 (갱신) | `docs/solutions/2026-04-19-prisma-orm-tz-naive-filter-gotcha.md` | 잔존 과제 §3 기각 표기 |

## 상세 변경 사항

### 1. `src/app/api/v1/members/[id]/route.ts` — GET + PUT 패턴 B

- GET: `prisma.user.findUnique({select:{...Date...}})` → `prisma.$queryRaw` (id/email/name/phone/role/is_active + `(last_login_at::text)` + `(created_at::text)` + `(updated_at::text)`) → `new Date(text).toISOString()` 로 응답 Date ISO 화.
- PUT: `prisma.user.update` 는 유지 (update 로직), 직후 `$queryRaw` 로 `(updated_at::text)` 만 재조회 → 응답에 정확한 ISO.

### 2. `src/app/api/v1/members/route.ts` — GET 패턴 C 확장

- `prisma.user.findMany` 는 유지(복잡한 where/pagination/orderBy), select 에서 Date 필드만 제거.
- 반환된 user id 목록으로 `$queryRaw`: `SELECT id, (last_login_at::text), (created_at::text) FROM users WHERE id = ANY(${ids}::text[])` → Map 생성.
- ORM 결과 순서대로 map, Date 필드만 Map 에서 덮어씀. orderBy 순서 보장.

### 3. `src/app/api/v1/auth/me/route.ts` — GET + PUT 패턴 B
동일 구조. GET 전체 raw, PUT update 유지 + updatedAt 재조회.

### 4. `src/app/api/settings/users/route.ts` — 3 핸들러
- GET: `ORDER BY created_at DESC` 를 raw 로 서버측 수행 (ORM orderBy 대체).
- POST: create 후 `$queryRaw` 로 createdAt `::text` 재조회.
- PATCH: update 후 `$queryRaw` 로 Date 필드 재조회 (lastLoginAt/createdAt).

### 5. `scripts/session43-parsing-repro.ts` — 재현 스크립트
ORM `findMany` vs raw `::text` + `EXTRACT(EPOCH ...)` 비교. 지속 가치 — 다른 테이블 재검증 시 단 30초 실행으로 시프트 상태 확인 가능.

실행: `wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && set -a && source .env && set +a && npx tsx /mnt/e/.../scripts/session43-parsing-repro.ts"`

### 6. `scripts/session43-verify.sh` — E2E 검증
로그인 → /me → /members → /members/[id] → dashboard login → /settings/users → psql `AT TIME ZONE 'UTC'` 비교. 지속 가치 — 다음 세션 회귀 가드.

### 7. CK 갱신 — orm-date-filter-audit-sweep.md

"잔존 과제" 섹션 뒤에 "세션 43 추가" 섹션 append:
- 재현 실측 결과 (diff 32,400,147ms)
- 수정 범위 (users 4 파일 7 핸들러 표)
- 파생 교훈 (`::uuid` 오남용 → `information_schema` + 실 E2E 필수)
- E2E 검증 결과 (응답 === PG UTC)
- 후속 이월 (0-row 테이블 17 파일)

### 8. CK 갱신 — prisma-orm-tz-naive-filter-gotcha.md

"잔존 과제 업데이트" 섹션 수정:
- §1: 세션 42 해소 (기존)
- §2: 세션 43 진전 표기 (users 커버)
- §3 (기존 신규): **세션 43 기각** — 재현 불가 확정 + Next.js 소스 추적 근거.

## 검증 결과

- `npx tsc --noEmit` — 0 에러 (2회 실행, uuid 수정 전후)
- `npx vitest run` — 13 files / **244 tests PASS** (세션 42 대비 회귀 0, 2회 실행)
- WSL 재배포 2회 (PM2 restart ↺=13 → 14)
- E2E curl 검증:
  - `/api/v1/auth/me` 응답 `createdAt: "2026-04-06T14:11:17.147Z"` === PG UTC `2026-04-06T14:11:17.147Z` ✓
  - `/api/v1/members` pagination 3건 모두 UTC 정확 ✓
  - `/api/v1/members/<id>` 개별 조회 UTC 정확 ✓
  - Set-Cookie Expires = 서버 Date + 정확히 7d UTC (P3 시프트 없음) ✓

## 터치하지 않은 영역

- **0-row 테이블 17 파일 Date 직렬화** — cron/webhooks/api-keys/log-drains/functions/functions/runs/mfa/webauthn 등. 해당 테이블 유입 시점 or 선제적 일괄 수정 (다음 세션 선택).
- **KST 03:00 자동 cleanup tick 관찰** — PM2 uptime 24h+ 미달, 익일 실측 이월.
- **MFA biometric 브라우저 QA** — 사용자 인터랙션 필수.
- **HS256 legacy 쿠키 제거** — 단독 세션 권장.
- **Phase 16 / SP-013·016 / /kdygenesis** — 긴 스코프.

## 알려진 이슈

- **Prisma 7 adapter-pg parsing-side +9h 시프트는 여전히 구조적 문제** — 본 세션은 "데이터 있는 경로만 우회" 전략. 근본 해결은 어댑터 교체 또는 Prisma upstream 수정 대기.
- **0-row 테이블 경로는 잠재적 위험** — 해당 테이블에 데이터 유입 시 즉시 9h 시프트 발생. 가능한 한 **선제적 일괄 수정 권장** (다음 세션 우선순위).
- **`::uuid` 캐스트 오남용은 재발 가능** — raw SQL 전수 검토 필요? 현재 수정된 5곳 외에 잔존 유무 미확인. (다음 세션 grep 1회로 확인 가능)

## 다음 작업 제안

세션 44 권장 우선순위:

1. **KST 03:00 자동 cleanup tick 실측** (즉시 가능, 익일 KST 03:00 이후)
   ```bash
   wsl -e bash -c "source ~/.nvm/nvm.sh && pm2 logs dashboard --lines 400 --nostream --raw | grep -iE 'cleanup|CLEANUP'"
   psql <db> -c "SELECT action, timestamp FROM audit_logs WHERE action LIKE 'CLEANUP%' ORDER BY id DESC LIMIT 10"
   ```
2. **0-row 테이블 Date 직렬화 선제적 일괄 수정** (~1-2h) — users 4 파일 패턴을 17 파일 확산.
   - 확산 순서 추천: api-keys → cron → webhooks → log-drains → functions → functions/[id] → functions/runs → mfa/status → mfa/webauthn/authenticators/[id]
   - 공용 헬퍼 `fetchDateFieldsText(table, ids, fields[])` 도입 검토 (제네릭 비용 vs 반복 코드 감축 저울).
3. **잔존 `::uuid` 캐스트 grep** (10분) — `grep -rn "::uuid" src/` 1회, 필요 시 전수 수정.
4. **MFA biometric 브라우저 QA** (1-2h, 사용자 직접) — `docs/guides/mfa-browser-manual-qa.md` 8 시나리오.
5. **HS256 legacy 제거** (단독 세션 권장).
6. **Phase 16 진입** (24h) — Vault VaultService / Capistrano / Canary / Infrastructure UI.
7. **SP-013/016 물리 측정** (13h, 환경 확보 시).
8. **/kdygenesis --from-wave** — 85+ 태스크 주간 플로우 변환.

---
[← handover/_index.md](./_index.md)
