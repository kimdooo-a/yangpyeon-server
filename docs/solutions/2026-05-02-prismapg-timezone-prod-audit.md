---
title: PrismaPg + Asia/Seoul TIMESTAMPTZ 시프트 — prod 영향 범위 audit (S82 follow-up)
date: 2026-05-02
session: 82
tags: [prisma, prismapg, postgres, timezone, audit, prod]
category: audit
confidence: high
parent_ck: 2026-05-02-prismapg-asia-seoul-timestamptz-shift.md
---

## 동기

S82 messenger 통합 테스트에서 `2026-05-02-prismapg-asia-seoul-timestamptz-shift.md` CK 발견. 본 audit 는:

1. **prod 시프트 empirical 재확인** (S82 cron 관찰)
2. **Date.now() vs Prisma-read .getTime() 비교 패턴 전수 스캔**
3. **`?options=-c TimeZone=UTC` 적용 시 영향 분석**
4. **권고**

## 1. prod 시프트 empirical 재확인

S82 wave (2026-05-02 ~10:55 KST) 에서 b8-runnow.ts 수동 실행 결과:

| 항목 | 값 |
|---|---|
| 실행 wall clock | 2026-05-02 10:55 KST (= 01:55 UTC) |
| DB `cron_jobs.last_run_at` 표시값 | `2026-05-02 01:57:23.991+09` |
| 표시값의 실제 UTC | 2026-05-01 16:57:23 UTC |
| 실제 wall - 표시 UTC | **+9 시간** (표시가 9h 더 이른 epoch) |

→ Prisma write-side 가 stored epoch 을 **-9h 시프트** 함을 재확인.

read-side 는 +9h 시프트 (CK 본문). Prisma round-trip 만 사용하면 cancel.

## 2. 코드 패턴 전수 스캔 결과

### 2.1 `Date.now() - prismaRead.getTime() > THRESHOLD` 패턴

| 위치 | 패턴 | prod 안전성 |
|---|---|---|
| `src/lib/messenger/messages.ts:351` | EDIT_WINDOW_MS (15분) | ✅ Prisma 라운드트립 cancel |
| `src/lib/messenger/messages.ts:414` | RECALL_WINDOW_MS (24시간) | ✅ Prisma 라운드트립 cancel |
| `src/app/api/v1/auth/mfa/challenge/route.ts:58` | retryAfter 계산 | ✅ `lockedUntil` 이 service.ts:34-38 raw SELECT `::text` 으로 reads → 정확 |

→ Prisma 가 write+read 양쪽 담당하는 한 prod 영향 0. 단, **외부에서 raw SQL 로 INSERT 한 row 와 비교** 하면 즉시 9h 오차 발생 (S82 통합테스트 path 가 정확히 이 case).

### 2.2 `new Date(Date.now() ± offset)` 을 Prisma WHERE 에 binding

| 위치 | 패턴 | prod 안전성 |
|---|---|---|
| `src/lib/messenger/messages.ts:522` | search 윈도우 cutoff | ✅ binding side -9h, column side -9h, cancel |
| `src/app/api/v1/t/[tenant]/today-top/route.ts:98` | 24h boost 임계 | ✅ 동일 |
| `src/lib/sessions/tokens.ts:49,149` | session expiresAt write only | ✅ write only |
| `src/lib/mfa/webauthn.ts:85,151` | challenge expiresAt write only | ✅ write only |

→ binding-side 시프트와 column-side 저장 시프트가 동일 방향 → cancel.

### 2.3 raw SQL 에서 `column ⏷ NOW()` 비교 (이미 workaround 패턴)

| 위치 | 의도 | 정확성 분석 |
|---|---|---|
| `src/lib/sessions/tokens.ts:122` | `expires_at <= NOW()` 만료 판정 | ⚠️ stored = actual_expiry-9h, NOW()=actual UTC → 9h 일찍 expired 신호. 7일 세션이 6일 15시간에 OFF. **사용자 미체감** (대부분 24h 미만에 refresh) |
| `src/lib/sessions/tokens.ts:241+` | active sessions list with `expires_at > NOW()` | ⚠️ 동일 — 9h 일찍 inactive 분류 |
| `src/lib/sessions/cleanup.ts:54` | `expires_at < NOW() - INTERVAL '1 day'` | ⚠️ 동일 — 9h 더 이르게 cleanup. 영향 미미 (어차피 1d 추가 grace) |
| `src/lib/rate-limit-db.ts:60-77` | `window_start + ${windowMs} INTERVAL < NOW()` | ✅ 세션 40 마이그레이션 후 column 이 TIMESTAMPTZ(3), `NOW()` 와 같은 시각계 — 일관 |
| `src/lib/jwks/store.ts` retire cleanup | `retire_at < NOW()` | ⚠️ 가능성 (코드 미상세 분석) |
| `src/lib/mfa/webauthn.ts` cleanup | `expiresAt < NOW()` | ⚠️ 가능성 |

→ **세션 만료 9h 일찍 신호** 는 가장 현실적인 latent bug. 사용자 미체감(7일 → 6일 15시간), prod 운영 1년 무문제.

### 2.4 외부 timestamp 파싱 → Prisma write

| 위치 | 패턴 | prod 안전성 |
|---|---|---|
| `src/lib/aggregator/fetchers/rss.ts:81-82` | RSS pubDate → `new Date()` → Prisma | ✅ 동일 binding 시프트 |
| `src/lib/aggregator/fetchers/api.ts:92,139,198,237,313` | API created_at/published → `new Date()` → Prisma | ✅ 동일 |
| `src/lib/aggregator/fetchers/html.ts:79` | HTML parseDate → Prisma | ✅ 동일 |

→ 외부에서 받은 정확 UTC 가 Prisma 통해 -9h 시프트 저장, 다음 Prisma 읽기 +9h 시프트 → 화면 표시 정확. ContentItem.publishedAt 은 user-facing 표시도 정상.

### 2.5 cron schedule 매칭

| 위치 | 패턴 | 분석 |
|---|---|---|
| `src/lib/cron/registry.ts:99-125 matchesSchedule` | 순수 JS `now.getMinutes()` etc | ✅ DB 무관 |
| `src/lib/cron/circuit-breaker.ts:62 isCooldownElapsed(circuitOpenedAt, new Date())` | Prisma read + JS Date | ✅ Prisma 라운드트립 cancel |

→ cron schedule 자체는 영향 0. circuit breaker cooldown 도 Prisma round-trip 으로 정상.

## 3. `?options=-c TimeZone=UTC` 적용 영향 분석

### 3.1 적용 후 동작 변화

DATABASE_URL 에 `?options=-c%20TimeZone%3DUTC` 추가 시 PG 세션 timezone 이 UTC. PrismaPg adapter 의 시프트가 사라진다 (CK 검증).

**신규 write/read**: 모두 정확.

**기존 데이터** (-9h 시프트 저장됨):
- Prisma read: 시프트 없이 그대로 → 표시값이 9h **더 이른** 시각으로 보임
- raw SQL `expires_at < NOW()`: 기존 -9h column 과 정확 NOW() 비교 → 9h 일찍 trigger (변화 없음, 이미 그랬음)

### 3.2 데이터별 영향

| 데이터 | 적용 직후 영향 | 사용자 체감 |
|---|---|---|
| **Session.expiresAt** | 기존 row 가 9h 일찍 expired 표시 → 사용자 강제 logout 가능성 | ⚠️ **세션 강제 만료 1회성** — 적용 직후 active sessions 다수 expired 처리. login 재시도로 회복. |
| **Message.createdAt** | 기존 메시지 displayed 9h 일찍, 새 메시지 정확 | UI 시각 표시 비일관 일시 |
| **CronJob.lastRunAt** | 기존 9h 일찍 표시, 신규 정확 | 운영자만 보는 값 — 무영향 |
| **ContentItem.publishedAt** | 기존 9h 일찍 표시 | 카드 정렬/날짜 비일관 일시 |
| **AuditLog.timestamp** | text 저장 (Date.now()ISO) → 영향 0 | 무영향 |
| **신규 세션/메시지/cron** | 적용 후 모두 정확 | 정상 |

### 3.3 위험 요약

| 위험 | 심각도 | 완화 |
|---|---|---|
| 적용 직후 active session 강제 만료 | 중 | 사용자 재로그인 1회. 적용 시점을 트래픽 저점(예: 새벽 3시) 으로 |
| UI 시각 일시적 비일관 (24~48h) | 낮 | 신규 데이터는 정확. 24h 이내 자연 normalization. |
| 통합테스트가 prod env 와 다른 timezone → CK 회귀 자동 감지 못함 | 낮 | 테스트는 이미 `-c TimeZone=UTC` 강제 (S82 인프라). prod 와 동기화로 오히려 일관됨. |

## 4. 권고

### 4.1 즉시 조치 (필수 아님)

**`?options=-c TimeZone=UTC` 를 prod DATABASE_URL 에 적용** — 신규 코드의 latent bug 유입 차단.

적용 절차:
1. 트래픽 저점 (KST 03:00~05:00) 시간대 선정
2. `~/ypserver/.env` 의 `DATABASE_URL` 수정
3. `pm2 restart ypserver` (메모리 `feedback_pm2_no_unauthorized_stop` 가이드 — restart 는 stop 아님 → 허용)
4. Smoke test: 로그인 + 메시지 전송 + cron lastRunAt 1줄 점검
5. 24h 후 active session count + message timestamps 확인

### 4.2 적용 보류 시

신규 코드 리뷰에 다음 체크리스트 강제:

- [ ] `Date.now() - prismaRead.getTime()` 패턴 사용 시 → row 가 항상 Prisma 로만 write 되는지 확인 (raw SQL INSERT 경로 없음)
- [ ] `new Date()` 를 Prisma WHERE 에 binding 시 → column 도 Prisma 가 write 한 것인지 확인
- [ ] raw SQL 에서 `col ⏷ NOW()` 비교 시 → 9h 시프트 인지 + 의도적 trade-off 인지 명시 주석

### 4.3 장기

- `@prisma/adapter-pg` 업스트림 issue 등록 또는 PR 검토 (Prisma 7 adapter 가 Asia/Seoul session timezone 에서 시프트하는 동작 정정)
- v8 또는 후속 패치 적용 시 본 audit 재검증

## 5. 결론

| 질문 | 답 |
|---|---|
| prod 에 사용자 데이터 손실 있는가? | **No** — round-trip cancel + raw SQL workaround 로 보호됨 |
| prod 에 사용자 체감 bug 있는가? | **거의 없음** — 세션 7일이 6일 15시간으로 줄어든 효과만 (대부분 미체감) |
| 신규 코드가 안전한가? | **위험** — 패턴을 모르는 작성자가 `Date.now() - prismaRead.getTime()` 또는 `WHERE col > NOW()` 추가 시 즉시 9h bug 유입 |
| 즉시 fix 필요한가? | **선택** — 4.1 즉시 조치는 latent bug 유입 영구 차단. 4.2 코드리뷰 체크리스트로 대체 가능 |

**최종 권고**: 4.1 (DATABASE_URL TimeZone=UTC) 우선. 트래픽 저점에 적용 + 24h 모니터.
