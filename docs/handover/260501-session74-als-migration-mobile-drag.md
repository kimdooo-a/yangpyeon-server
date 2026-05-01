# 인수인계서 — 세션 74 (메모 사고 후속: 모바일 드래그 PointerEvent + 28→31 라우트 ALS 마이그레이션)

> 작성일: 2026-05-01
> 이전 세션 (다른 터미널): [session73 (R2 UI 50MB 분기 + 다운로드 302)](./260501-session73-r2-ui-download.md)
> 이전 세션 (직전 일자): [session72 (R2 V1 적용)](./260501-session72-r2-v1-applied.md)
> 저널: [logs/journal-2026-05-01.md](../logs/journal-2026-05-01.md) §"## 세션 74"

---

## 작업 요약

세션 72(또는 직전 메모 fix 세션, commits 9621480/c4c7798/7978535)에서 권고된 **후속 2건** 직행 처리:

1. **모바일 드래그 지원** — `sticky-note-card.tsx` 의 `MouseEvent` 핸들러를 `PointerEvent` 로 통합 전환. 마우스/터치/펜 단일 처리 + `setPointerCapture` + `touchAction: "none"` (owner only).
2. **31 라우트 + 라이브러리 ALS 마이그레이션** — `prismaWithTenant + runWithTenant` 조합을 `tenantPrismaFor(ctx)` closure 캡처 패턴으로 전면 전환. 운영 콘솔 22 + 테넌트 5 + 메신저 라이브러리 4. 의도적 제외 3건 (filebox-db, tenant-router/membership, r2-presigned).

본 세션 코드 변경: 32 파일 + 메모리 1건 갱신. `tsc --noEmit` exit 0 검증 통과. 잔여 `prismaWithTenant.X` 호출 0건 (인프라 파일 2개의 단어 잔존만).

---

## 대화 다이제스트

### 토픽 1: 후속 2건 진행 요청

> **사용자**: "다음도 진행해줘 ..." (직전 메모 fix 요약 첨부 — 9621480/c4c7798/7978535 3 commit으로 메모 완전 복구)

세션 72(또는 직전 메모 fix 세션)에서 권고된 후속 2건:
- (별건) sticky-note-card.tsx 모바일 PointerEvent 전환 — 5분 작업
- (단계적) 다른 28 라우트 tenantPrismaFor 마이그레이션 — 같은 ALS 함정 잠재

**대상 식별**: `Grep prismaWithTenant|withTenantQuery|runWithTenant src/` → 36 파일.

분류:
| 카테고리 | 파일 수 | 패턴 |
|---|---|---|
| 운영 콘솔 (`/api/v1/*` 비-`/t/`) | 22 | `OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true }` |
| 테넌트 라우트 (`/api/v1/t/[tenant]/*`) | 5 | `tenantPrismaFor({ tenantId: tenant.id })` (가드 arg 활용) |
| 메신저 라이브러리 | 4 | `tenantPrismaFor(getCurrentTenant())` 캐시 |
| 의도적 제외 | 3 | filebox-db (T1.5), membership (pre-tenant), r2-presigned (T1.5) |
| 기타 (인프라 등) | 2 | prisma-tenant-client.ts (정의), api-guard-tenant.ts (re-export) |

**TaskCreate 5건** 등록 후 순차 진행.

**결론**: 31 파일 마이그레이션 + 1 파일 모바일 드래그 = 32 파일 변경.

### 토픽 2: Task 1 — 모바일 드래그 PointerEvent 전환

`MouseEvent` 가 터치 디바이스에서 발화하지 않거나 지연되는 문제 → `PointerEvent` 통합.

핵심 변경:
- `onMouseDown` → `onPointerDown` (React 합성 이벤트)
- `mousemove`/`mouseup` document 리스너 → `pointermove`/`pointerup`/`pointercancel` 을 `e.currentTarget` 부착
- `setPointerCapture(e.pointerId)` — 손가락이 노트 밖으로 나가도 동일 element 가 추적
- 헤더 div `style={{ touchAction: isOwner ? "none" : "auto" }}` — 모바일 헤더 터치를 브라우저 스크롤/줌이 가로채는 것 차단. read-only 사용자(공유 메모 보는 사람)는 `auto` 로 페이지 스크롤 정상
- `e.preventDefault()` — 텍스트 선택 방지

**파일 1**: `src/components/sticky-notes/sticky-note-card.tsx`.

### 토픽 3: Task 2 — 운영 콘솔 22 마이그레이션

패턴 변환:
```ts
// Before
const result = await runWithTenant(
  { tenantId: DEFAULT_TENANT_UUID, bypassRls: true },
  () => prismaWithTenant.X.Y(...),
);
// After
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true } as const;
const db = tenantPrismaFor(OPS_CTX);
const result = await db.X.Y(...);
```

**bypassRls 정책 보존**:
- `bypassRls: true` (15 파일): members(3) + sql/queries(2) + webhooks(3) + cron(2) + api-keys(2) + settings/users(1) + admin/users/sessions(1) + admin/users/mfa-reset(1)
- `bypassRls` 미설정 (7 파일): functions(4) + log-drains(3) — 기존 정책 유지 (변경 안 함)

다중 statement `runWithTenant` 블록은 `const db = tenantPrismaFor(OPS_CTX)` 한 번 캐시 후 sequence 호출로 분해 (원래도 atomic 아니었으므로 의미 변화 0).

### 토픽 4: Task 3 — 테넌트 라우트 5 마이그레이션

`withTenant(handler)` 가드의 `tenant` arg 를 직접 `tenantPrismaFor` 에 넘김:

```ts
// Before
import { withTenant, prismaWithTenant } from "@/lib/api-guard-tenant";
export const GET = withTenant(async (request, _user, _tenant) => {
  const items = await prismaWithTenant.contentItem.findMany(...);
});

// After
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
export const GET = withTenant(async (request, _user, tenant) => {
  const db = tenantPrismaFor({ tenantId: tenant.id });
  const items = await db.contentItem.findMany(...);
});
```

`_tenant` (underscore) 였던 인자 → `tenant` 로 unprefix.

**파일 5**: `t/[tenant]/{categories, sources, today-top, items/[slug], contents}/route.ts`.

`t/[tenant]/[...path]/route.ts` 는 `dispatchTenantRoute` 위임만 하고 직접 prisma 호출 없어 미수정.

### 토픽 5: Task 4 — 메신저 라이브러리 4 마이그레이션

`getCurrentTenant()` ALS read 자체는 함수 진입 시점에 정상 작동. Prisma 내부 worker 가 끊는 시점이 `$allOperations` 콜백 → 함수 입구에서 `db = tenantPrismaFor(ctx)` 미리 캐시하면 closure 보호.

```ts
// Before
const ctx = getCurrentTenant();
await prismaWithTenant.X.Y(...);  // ALS 손실 가능

// After
const ctx = getCurrentTenant();
const db = tenantPrismaFor(ctx);
await db.X.Y(...);  // closure 안전
```

`withTenantTx(ctx.tenantId, async (tx) => ...)` 호출은 그대로 유지 — `tx` 자체가 SET LOCAL 한 번이면 충분, ALS 비의존.

**파일 4**: `lib/messenger/{reports, messages, conversations, blocks}.ts`.

**검증 한계 명시**: 메신저 라이브러리는 현재 어떤 라우트에서도 import 안 됨 (Phase 1 미배선). 호출자 없음 → 회귀 검증 불가, 메신저 라우트 배선(M2)시 자연 발생.

### 토픽 6: Task 5 — 빌드 검증

- `npx tsc --noEmit` exit 0, 0 lines (표준 출력)
- 잔여 `prismaWithTenant.X` 호출 0건 — `Grep prismaWithTenant\. src/` 결과 No matches found
- 인프라 단어 잔존만 — `prisma-tenant-client.ts` (정의 자체 + Proxy + Extension), `api-guard-tenant.ts` (re-export 인프라)
- ESLint `@typescript-eslint/no-explicit-any` rule-not-found 6 errors → unmodified `prisma-tenant-client.ts` 에도 동일 → config 이슈, 마이그레이션 무관

### 토픽 7: 메모리 갱신

`memory/project_workspace_singleton_globalthis.md` 함정 2 섹션에 후속 마이그레이션 완료 사실 추가:
- 31 파일 모두 `tenantPrismaFor` 패턴 전환 (운영 콘솔 22 + 테넌트 5 + 메신저 4)
- 의도적 제외 3건 정당화
- bypassRls 정책 차이(operator console 일부=true, tenant routes=false, functions/log-drains=false) 명시

### 토픽 8: 남은 작업 회고

> **사용자**: "남은 작업 있어?"

코드 작업 완료, 빌드 통과. 남은 것은 배포·검증 단계와 향후 마이그레이션:
- **즉시 처리 권장**: 미커밋 변경사항 commit + WSL 배포 + 폰에서 모바일 드래그 실측
- **마이그레이션 후속 검증 (확률적)**: 사용 빈도 높은 라우트는 곧 자연 검증, 잘 안 쓰는 라우트(`log-drains/test`, `webhooks/[id]/trigger`)는 회귀 발현 시점 늦을 수 있음. 메신저 4 헬퍼는 호출자 없어 검증 불가.
- **의도적 미처리 (향후)**: filebox-db (T1.5), membership (정당), r2-presigned (T1.5)

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 모바일 드래그: native event listener vs React onPointer* | `e.currentTarget.addEventListener('pointermove', ...)` | document 레벨 추적 회피 + `setPointerCapture` 자연스러운 사용. element 자체에 부착하면 포커스 변경/body 스크롤 conflict 회피. |
| 2 | `touchAction` 정책 | `none` 일괄 vs owner-only | owner-only — read-only 사용자(공유 메모 보는 사람)의 페이지 스크롤 정상 작동 보장. 헤더 드래그 element 만 `none`. |
| 3 | 운영 콘솔 patterns: 단일 OPS_CTX 상수 vs 인라인 객체 | 단일 `const OPS_CTX` | 의미 명시(`bypassRls: true` 의도) + 재사용 + import 와 함께 모듈 헤더에 정책 표면화. |
| 4 | functions/log-drains bypassRls 변경 여부 | 추가 (정합성) / 그대로 | 그대로 — 마이그레이션 범위 = ALS 함정 회피만. RLS 정책 변경은 별건 (s30 ADR 검토 영역). |
| 5 | 다중 statement `runWithTenant` 블록 처리 | `withTenantTx` 변환 / sequence 분해 | sequence 분해 — 원래 패턴이 atomic 아니었음(`prismaWithTenant.X` 각자 자체 transaction). withTenantTx 변환은 의미 강화이며 마이그레이션 범위 초과. 진정한 atomicity 가 필요한 메신저(sendMessage 등)는 이미 `withTenantTx` 사용 중 — 그대로 유지. |
| 6 | 메신저 헬퍼: 함수 진입 시점 캐시 vs 매 호출 | 함수 진입 캐시 | `tenantPrismaFor` 자체는 µs 비용 무시 가능. 함수 진입 시 1회 캐시가 가독성 + 의도 명확. |
| 7 | 의도적 제외 3건 | 마이그레이션 / 제외 | 제외 — filebox-db 는 ADR-024 부속결정으로 packages/tenant-almanac/ plugin 마이그레이션 시점에 같이 전환 (T1.5). membership 은 tenant 결정 *전* 단계라 ALS 비의존이 정당. r2-presigned 는 TODO T1.5 + eslint-disable 명시. |
| 8 | 모바일 PointerEvent 호환성 트라이/캐치 | `try/catch` 감싸기 / 그대로 | `setPointerCapture`/`releasePointerCapture` 만 try/catch — 구형 환경(`hasPointerCapture` 미지원) 우아한 fallback. 다른 부분은 IE11 미지원 인정. |

---

## 수정 파일 (32 파일 + 메모리 1)

### 모바일 드래그 (1)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/components/sticky-notes/sticky-note-card.tsx` | `onMouseDown`/`mousemove`/`mouseup` → `onPointerDown`/`pointermove`/`pointerup`/`pointercancel`. `setPointerCapture` + `touchAction: 'none' (owner only)` + `e.preventDefault()`. |

### 운영 콘솔 22

| # | 파일 | bypassRls | 비고 |
|---|------|-----------|------|
| 2 | `src/app/api/v1/members/route.ts` | true | 다중 statement `runWithTenant` 블록 → sequence 분해 |
| 3 | `src/app/api/v1/members/[id]/route.ts` | true | UpdatedRow 타입 별도 추출 (typeof 순환 회피) |
| 4 | `src/app/api/v1/members/[id]/role/route.ts` | true | |
| 5 | `src/app/api/v1/sql/queries/route.ts` | true | |
| 6 | `src/app/api/v1/sql/queries/[id]/route.ts` | true | DELETE 핸들러 결과 코드 분기 → 직접 errorResponse 분기로 단순화 |
| 7 | `src/app/api/v1/webhooks/route.ts` | true | |
| 8 | `src/app/api/v1/webhooks/[id]/route.ts` | true | |
| 9 | `src/app/api/v1/webhooks/[id]/trigger/route.ts` | true | |
| 10 | `src/app/api/v1/cron/route.ts` | true | |
| 11 | `src/app/api/v1/cron/[id]/route.ts` | true | |
| 12 | `src/app/api/v1/functions/route.ts` | (없음) | 기존 정책 유지 |
| 13 | `src/app/api/v1/functions/[id]/route.ts` | (없음) | |
| 14 | `src/app/api/v1/functions/[id]/run/route.ts` | (없음) | |
| 15 | `src/app/api/v1/functions/[id]/runs/route.ts` | (없음) | |
| 16 | `src/app/api/v1/log-drains/route.ts` | (없음) | |
| 17 | `src/app/api/v1/log-drains/[id]/route.ts` | (없음) | |
| 18 | `src/app/api/v1/log-drains/[id]/test/route.ts` | (없음) | |
| 19 | `src/app/api/v1/api-keys/route.ts` | true | |
| 20 | `src/app/api/v1/api-keys/[id]/route.ts` | true | |
| 21 | `src/app/api/settings/users/route.ts` | true | |
| 22 | `src/app/api/admin/users/[id]/sessions/route.ts` | true | |
| 23 | `src/app/api/admin/users/[id]/mfa/reset/route.ts` | true | |

### 테넌트 라우트 5

| # | 파일 | 비고 |
|---|------|------|
| 24 | `src/app/api/v1/t/[tenant]/categories/route.ts` | `withTenant, prismaWithTenant` import 분리. `_tenant` → `tenant`. |
| 25 | `src/app/api/v1/t/[tenant]/sources/route.ts` | 동일 |
| 26 | `src/app/api/v1/t/[tenant]/today-top/route.ts` | 동일 |
| 27 | `src/app/api/v1/t/[tenant]/items/[slug]/route.ts` | 동일 |
| 28 | `src/app/api/v1/t/[tenant]/contents/route.ts` | 동일 |

### 메신저 라이브러리 4

| # | 파일 | 비고 |
|---|------|------|
| 29 | `src/lib/messenger/reports.ts` | `getCurrentTenant + ctx 캐시` 패턴 |
| 30 | `src/lib/messenger/messages.ts` | `withTenantTx(ctx.tenantId, ...)` 호출은 그대로 유지 |
| 31 | `src/lib/messenger/conversations.ts` | 동일 |
| 32 | `src/lib/messenger/blocks.ts` | `getCurrentTenant` import 추가 |

### 메모리 갱신 1

| # | 파일 | 변경 내용 |
|---|------|-----------|
| M1 | `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/project_workspace_singleton_globalthis.md` | 함정 2 섹션에 마이그레이션 완료 사실 추가 (31 파일 + 의도적 제외 3건 + bypassRls 정책 차이) |

---

## 검증 결과

- **`npx tsc --noEmit`** exit 0, 0 lines 출력 (PASS)
- **잔여 `prismaWithTenant.X`** 0건 (`Grep prismaWithTenant\. src/` → No matches found)
- **인프라 파일 단어 잔존**: `prisma-tenant-client.ts` (정의), `api-guard-tenant.ts` (re-export) — 정상
- **회귀 위험 분석**:
  - 운영 콘솔 22: 사용 빈도 높은 라우트(members 목록, webhooks 관리)는 곧 자연 검증. log-drains/test, webhooks/[id]/trigger 같이 잘 안 쓰는 라우트는 회귀 발현 시점 늦을 수 있음.
  - 테넌트 라우트 5: Almanac aggregator UI 가 호출 시 자연 검증.
  - 메신저 4 헬퍼: 호출자 없음 (Phase 1 미배선) → 회귀 검증은 메신저 라우트 배선(M2)시 자연 발생.

---

## 터치하지 않은 영역

### 의도적 제외 3건 (마이그레이션 안 함)

| 파일 | 사유 |
|------|------|
| `src/lib/filebox-db.ts` | raw prisma + `eslint-disable tenant/no-raw-prisma-without-tenant` 명시. ADR-024 부속결정 — packages/tenant-almanac/ 마이그레이션 시점에 같이 전환 (T1.5). |
| `src/lib/tenant-router/membership.ts` | tenant 결정 *전* 단계 (어느 tenant 의 멤버인지 판정 중) — RLS 가 app.tenant_id 를 요구하면 self-defeating. base prisma 정당. |
| `src/app/api/v1/filebox/files/r2-presigned/route.ts` | TODO T1.5 표기 + eslint-disable 명시. 단일 운영자 컨텍스트 — Almanac plugin 마이그레이션 시 같이 전환. |

### 다른 무관한 미커밋 영역 (다른 세션 산출물)

- 세션 72 R2 V1 미커밋: `src/lib/r2.ts`, `src/app/api/v1/filebox/files/r2-{presigned,confirm}/route.ts`, `prisma/migrations/20260501100000_add_file_storage_type/`, `src/lib/filebox-db.ts` (filebox 보강), `src/components/filebox/file-upload-zone.tsx`, `src/app/api/v1/filebox/files/[id]/route.ts`
- 다른 세션: `scripts/wsl-build-deploy.sh`, `docs/handover/_index.md` (사전 modified), `docs/research/spikes/spike-013, 016`, `docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md`, `prisma/schema.prisma`, `package.json` + `package-lock.json`
- untracked: `.claude/scheduled_tasks.lock`, `.claude/settings.local.json`, `.claude/worktrees/`, `.kdyswarm/*`, `docs/research/baas-foundation/05-aggregator-migration/`, `docs/research/decisions/ADR-032-...`, `docs/research/spikes/spike-032-*`, `docs/handover/260501-session72-r2-v1-applied.md`, `docs/solutions/2026-05-01-wsl-build-deploy-env-not-protected.md`

본 세션 commit 영역과 분리. 사용자/다른 터미널 권한 영역.

### 운영자 단계 (Claude 권한 외)

- WSL 배포 (`/ypserver` 스킬) — 본 세션 commit 후 사용자 트리거
- 폰에서 모바일 드래그 실측 — 배포 후 사용자 검증

---

## 알려진 이슈

1. **메신저 4 헬퍼 회귀 검증 불가** — 호출자 없음 (Phase 1 미배선). 마이그레이션 자체는 정확하나 실 검증은 메신저 라우트 배선(M2)시 자연 발생. 그 전까지 silent.
2. **잘 안 쓰는 운영 콘솔 라우트** — `log-drains/test`, `webhooks/[id]/trigger`, `cron/[id]` PATCH/DELETE, `admin/users/[id]/{sessions,mfa/reset}` 등은 사용 빈도 낮아 회귀 발현 시점 늦을 수 있음. 사전 ping smoke 테스트 권고.
3. **모바일 드래그 실측 미수행** — `tsc` 통과만 확인. 폰에서 실제 헤더 드래그 + 텍스트 영역 편집 동작 확인 필요. 배포 후 사용자 검증 필수.
4. **ESLint config 이슈 (사전 존재)** — `@typescript-eslint/no-explicit-any` rule-not-found 오류. 마이그레이션 무관 (unmodified `prisma-tenant-client.ts` 에도 동일). 별도 fix 후보.

---

## Compound Knowledge

- **신규 솔루션**: 0건 (본 세션은 기존 메모리 룰 `project_workspace_singleton_globalthis.md` 의 후속 적용 사례 — 단일성 솔루션이 아니라 28→31 라우트 일괄 적용)
- **메모리 룰 갱신**: `project_workspace_singleton_globalthis.md` 함정 2 섹션 — 마이그레이션 완료 사실 + 의도적 제외 3건 + bypassRls 정책 차이 추가

---

## 다음 작업 제안 (S75+)

### S75-A. 본 세션 commit + WSL 배포 + 폰에서 모바일 드래그 실측 (P0, ~30분)

1. `git add` 본 세션 영역만 (32 파일):
   ```bash
   git add src/components/sticky-notes/sticky-note-card.tsx \
     src/app/api/v1/{members,sql,webhooks,cron,functions,log-drains,api-keys,t}/{,**/}*.ts \
     src/app/api/{settings,admin}/users/{,**/}*.ts \
     src/lib/messenger/*.ts
   ```
   (구체 파일 목록은 `git status` 와 본 인수인계서 §"수정 파일" 표 대조)
2. commit message 예: `fix(als): sticky-notes ALS 함정 회피 — 31 라우트 + 모바일 드래그 PointerEvent 전환`
3. `/ypserver` 스킬 — 빌드+배포+PM2 재시작
4. 폰에서 stylelucky4u.com → /memo → 헤더 드래그 + 텍스트 편집 실측

### S75-B. 자주 안 쓰는 라우트 사전 ping smoke (P1, ~10분)

`log-drains/test`, `webhooks/[id]/trigger`, `cron/[id]` PATCH/DELETE, `admin/users/[id]/{sessions,mfa/reset}` 한 번씩 호출 → 회귀 사전 검증.

### S75-C. 세션 72 미커밋 R2 V1 영역 정리 (P1, ~30분)

세션 72 handover 가 commit `275464c` 주장하나 실제 git log 에 부재 (혹은 reverted). git status 미커밋 영역 확인 → handover 와 정합성 맞춰 commit. 영역:
- `src/lib/r2.ts`, `src/app/api/v1/filebox/files/r2-{presigned,confirm}/`, `prisma/migrations/20260501100000_add_file_storage_type/`, `prisma/schema.prisma`, `package.json` + `package-lock.json`, `scripts/r2-poc.mjs`
- `docs/research/decisions/ADR-032-...`, `docs/research/spikes/spike-032-*`, `docs/research/_SPIKE_CLEARANCE.md`

본 세션 commit 과 영역 분리하여 별개 commit.

### S75-D. (이월) S73-A R2 V1 후속 (다운로드 라우트 + UI 50MB 분기) — P0 ~6h

세션 72 권고 그대로 이월. R2 backend 절반만 살아있음 (presigned PUT 만, 다운로드 없음).

### S75-E. (이월) S73-B `wsl-build-deploy.sh` `.env` 보호 패치 — P1 ~10분

[1/8] rsync에 `--exclude '/.env'` 추가. 메모리 룰(`feedback_env_propagation.md`) 보강.

### S75-F. (이월) 메신저 M2 진입

m2-detailed-plan §3 시그니처 그대로 도메인 헬퍼 4개 + 19 라우트 배선. 본 세션 마이그레이션이 헬퍼 4개 까지는 ALS 안전성 보장 — 라우트 배선만 추가하면 메신저 Phase 1 M2 완성.

---

## 참고

- 이전 세션: [세션 72 (R2 V1 적용)](./260501-session72-r2-v1-applied.md), [세션 71 (R2 ADR-032 ACCEPTED)](./260501-session71-r2-spike-adr-032.md)
- 직전 메모 fix 세션 commits (별도 handover 없음): `9621480` (Turbopack chunk 복제 회피 globalThis), `c4c7798` (모바일 + 새 메모 버튼 hit-test 충돌), `7978535` (Prisma extension ALS propagation 깨짐 — sticky-notes 4 endpoints + tenantPrismaFor 신설)
- 메모리 룰: `memory/project_workspace_singleton_globalthis.md` (본 세션 갱신)
- 관련 ADR: ADR-022 (BaaS 정체성), ADR-023 (RLS), ADR-024 (Plugin 격리), ADR-027 (Multi-tenant Router)

---
[← handover/_index.md](./_index.md)
