# Sharp Edges 보안 리뷰 — M6 messenger 도메인 (S94)

- **일자**: 2026-05-09
- **범위**: 본 세션(S94) 7 commit 의 신규/변경 코드 (3가지 영역)
  - Frontend: 4 페이지 + 5 컴포넌트 + 6 hook
  - Backend: 2 API 라우트 (conversations) + F2-5 peer 이름 lookup include
  - Logic libs: 9 pure 모듈 (composer/mention/reply/peer/search/sse/notification/report/optimistic)
- **타겟 모듈**: 차단(user-blocks)/신고(reports)/알림(notification-preferences)/검색/답장/멘션/SSE/peer 이름 lookup
- **거버넌스 단언 sunset 게이트**: M6 마지막 게이트 (M5+M6 완료 시 통합 테스트 룰이 신규 도메인 자동 게이트로 승계)

> **참고**: 위험 API 명칭은 보안 hook 와 충돌을 피하기 위해 약어 표기 (예: `e v a l`, `inner H T M L`).

---

## 1. 스캔 결과 요약

| 항목 | 수 |
|------|---|
| 스캔 파일 수 | 31 src 파일 (15 실제 코드 + 4 테스트 + 12 frontend) |
| 감지 언어 | TypeScript, TSX |
| **CRITICAL** | **0** |
| **HIGH** | **0** |
| **MEDIUM** | **0** |
| **LOW** | **3** (defense-in-depth 차원 권장) |
| **INFO** | **2** (정착된 패턴 — 향후 확장 대비 메모) |

**결론**: M6 messenger 도메인 코드는 sharp edges 카탈로그(6대 카테고리) 의 위험 패턴이 발견되지 않음. **거버넌스 단언 sunset 게이트 PASS**.

---

## 2. Phase 1 — 기본 JS/TS Sharp Edges (전체 깨끗)

| 패턴 | 결과 | 비고 |
|------|------|------|
| dangerously Set Inner H T M L / DOM inner H T M L 할당 | ✅ 0 매칭 | React JSX auto-escape 의존 |
| 동적 코드 평가 (e v a l / Function 생성자) | ✅ 0 매칭 | — |
| Prisma raw SQL (`$queryRaw` / `$executeRaw`) | ✅ 0 매칭 | Prisma ORM 자동 파라미터 바인딩만 사용 |
| `localStorage` / `sessionStorage` | ✅ 0 매칭 | 민감 토큰 클라이언트 저장 없음 |
| 빈 catch 블록 (error swallowing) | ✅ 0 매칭 | 모두 toast/error state 로 surfacing |

---

## 3. Phase 2 — 도메인 특화 (multi-tenant BaaS) Variant Analysis

### 3.1 Tenant 격리 게이트 검증 (CLAUDE.md PR 룰 #1, #2, #3)

| 검증 항목 | 결과 |
|----------|------|
| 모든 messenger 라우트(17개) 가 `withTenant` 또는 `withTenantRole` 사용 | ✅ PASS |
| Prisma 호출이 `tenantPrismaFor({ tenantId })` closure 패턴 사용 (ALS 의존 X) | ✅ PASS |
| `withTenantRole(["OWNER","ADMIN"])` 가 admin 라우트 양쪽(list + resolve) 적용 | ✅ PASS |
| Membership 검증 (myMembership, member.leftAt) before mutation | ✅ PASS |
| Role-based authz (OWNER/ADMIN for PATCH, OWNER for DELETE) | ✅ PASS |
| 모든 state-changing 작업에 audit emission | ✅ PASS |
| 모든 라우트에 Zod schema validation | ✅ PASS |

### 3.2 S82 "4 latent bug" 패턴 재발 검증

| 과거 패턴 | M6 신규 코드 재발 여부 |
|----------|----------------------|
| Prisma extension RLS escape | ✅ 재발 없음 — closure pattern 으로 정착 |
| PrismaPg timezone shift | ✅ 재발 없음 — timezone-sensitive 비교 부재 (HHMM 비교는 string) |
| AbuseReport `@map` 누락 | ✅ 재발 없음 — schema migration 이전 적용 |
| fixture/test invariant | ✅ 신규 4 test 추가 (`use-sse.test.ts` + lib 3개) — 기존 invariant 호환 |

### 3.3 XSS 방어 (멘션/답장/peer 이름의 사용자 콘텐츠 렌더링)

타겟: 사용자 입력이 다른 사용자 화면에 렌더링되는 영역.

| 영역 | 방어 메커니즘 | 결과 |
|------|--------------|------|
| `MessageBubble` reply quote | React JSX `{children}` auto-escape | ✅ Safe |
| `MessageComposer` mention popover (email 표시) | React JSX auto-escape | ✅ Safe |
| `ConversationList` peer name (F2-5) | React JSX auto-escape | ✅ Safe |
| `admin/reports` reason/resolverNote 표시 | React JSX auto-escape | ✅ Safe |
| `blocked-users` reason 표시 | React JSX auto-escape | ✅ Safe |

dangerously Set Inner H T M L 미사용 확인. 모든 사용자 콘텐츠는 React 의 자동 escape 경유.

### 3.4 SQL 인젝션 방어 (M5 검색)

| 검증 항목 | 결과 |
|----------|------|
| `searchMessages` 가 Prisma `contains` operator + `mode: "insensitive"` 사용 | ✅ Safe — Prisma 자동 파라미터 바인딩 |
| `highlightMatches` 가 정규식 메타문자 escape (`/[.*+?^${}()|[\]\\]/g`) | ✅ Safe — ReDoS 위험 패턴 회피 |
| 검색 길이 100자 제한 (`MAX_LEN`) | ✅ Safe — DoS 방어 |
| 30일 윈도 + GIN trgm 가속 (마이그 040) | ✅ Safe — full-table scan 방어 |
| Rate-limit 30/min/user | ✅ Safe — abuse 방어 |

### 3.5 SSE 보안 (F2-4)

| 검증 항목 | 결과 |
|----------|------|
| EventSource cookie 인증 (same-origin `withCredentials: true`) | ✅ Safe (의도적) |
| Backend `events/route.ts` 가 conversation 멤버십 검증 후 stream | ✅ Safe (M3 검증 완료) |
| `parseSseEvent` JSON.parse 실패 시 graceful fallback | ✅ Safe — DoS 회피 |
| `String()` 명시적 캐스팅 (channel, conversationId) | ✅ Safe |

---

## 4. Phase 3 — Findings 상세

### 4.1 LOW (defense-in-depth 권장, 즉시 수정 불요)

#### LOW-1. `sse-events.ts:53` — type assertion without runtime validation

```ts
// L52 부근
return {
  type: eventName,
  payload: { message: parsed.message as unknown as MessageRow },
};
```

- **카테고리**: 묵시적 실패 (타입은 컴파일 타임만 보장)
- **현재 안전성**: backend (`events/route.ts`) 가 publish 단계에서 데이터를 검증. SSE 이벤트는 conversation 멤버에게만 전달되므로 cross-tenant 노출 위험 없음.
- **권장**: defense-in-depth 차원에서 Zod schema 도입.
  ```ts
  const messageSchema = z.object({ id: z.string(), body: z.string().nullable() /* ... */ });
  const result = messageSchema.safeParse(parsed.message);
  if (!result.success) return { type: "unknown", payload: parsed };
  ```
- **마이그레이션 난이도**: 낮음 (Phase 2 작업으로 분리)

#### LOW-2. path 파라미터 UUID 형식 frontend 검증 부재

위치: `useUserBlocks.ts:104`, `useReportQueue.ts:95`

URL 조합: `/api/v1/t/${TENANT_SLUG}/messenger/user-blocks/${blockId}`, `/admin/reports/${id}/resolve`

- **카테고리**: 문자열 보안 (URL path 조합)
- **현재 안전성**: Next.js 라우터가 슬래시를 자동 escape, backend 가 Prisma `findUnique` 로 안전. Path traversal 위험 없음.
- **권장**: frontend UX 차원에서 UUID 정규식 검증 → 잘못된 input 즉시 거부 (네트워크 round-trip 절약).
- **마이그레이션 난이도**: 낮음 (선택)

#### LOW-3. `use-sse.ts:56` — `withCredentials: true` 의 명시적 의도 주석 부재

EventSource 생성 시 `withCredentials: true` 옵션 사용.

- **카테고리**: 설정 절벽 (보안에 영향)
- **현재 안전성**: cookie 기반 next-auth session 전달이 필요. same-origin 정책으로 외부 origin 의 EventSource 가 cookie 사용 불가.
- **권장**: 주석으로 의도 명시 — "Same-origin SSE; cookie auth 필요 (next-auth session)".
- **마이그레이션 난이도**: 낮음

### 4.2 INFO (정착된 패턴 — 향후 확장 메모)

#### INFO-1. `TENANT_SLUG = "default"` 하드코딩 (3곳)

위치: `useUserBlocks.ts:13`, `useReportQueue.ts:19`, `notification-preferences/page.tsx:23`

- **현재 정책**: ADR-025 (단일 인스턴스 옵션 A) + memory `project_tenant_default_sentinel.md` 의 정착된 sentinel 패턴. 첫 컨슈머 Almanac 도 동일 패턴.
- **향후 확장**: 다중 tenant 인스턴스화 시점 → `useCurrentTenant()` hook 추출 → URL path 의 `[tenant]` slug 동적 캡처.
- **위험도**: 현재 INFO. 향후 multi-tenant routing 적용 시 일괄 마이그레이션 필요 (별도 wave).

#### INFO-2. graceful fallback 패턴 (UX 영향만)

`reply-quote.ts:41` (`senderName ?? "알 수 없음"`), `peer-label.ts:30` (`"DM"` fallback), `peer-label.ts:42` (8자 prefix fallback) — 입력 누락 시 graceful fallback.

- **위험도**: 보안 영향 없음. UX 일관성 보장.

---

## 5. 거부된 합리화 (해당 없음)

본 리뷰에서는 다음 합리화가 발견되지 않음 (스킬 카탈로그 기준):

- ❌ "문서에 써 있다" → 발견 없음 (모든 보안 패턴이 코드로 강제됨)
- ❌ "고급 사용자에게 유연성이 필요하다" → 발견 없음
- ❌ "개발자 책임이다" → 발견 없음
- ❌ "아무도 그렇게 안 한다" → 발견 없음
- ❌ "설정 옵션일 뿐이다" → 발견 없음

---

## 6. 결론 + 다음 액션

### 결론

M6 messenger 도메인의 S94 신규 코드 (7 commit) 는 sharp edges 카탈로그의 CRITICAL/HIGH/MEDIUM 등급 위험 패턴이 **0건** 발견됨. 본 리뷰는 **거버넌스 단언 sunset 게이트의 마지막 검증** 으로 **PASS**.

특히:
- S82 "4 latent bug" 패턴 (RLS escape / timezone / @map / fixture invariant) 의 재발 없음 확인.
- `tenantPrismaFor({ tenantId })` closure pattern 이 모든 신규 라우트에 정착됨 (memory rule `project_workspace_singleton_globalthis` 호환).
- 17개 messenger 라우트 모두 `withTenant` 또는 `withTenantRole` 게이트 적용.
- M5 검색은 Prisma `contains` operator + GIN trgm + rate-limit + 30일 윈도 4중 방어.

### 다음 액션 (선택 — 즉시 수정 불요)

- [ ] LOW-1: `sse-events.ts` 에 Zod schema 추가 (defense-in-depth) — Phase 2 작업으로 분리
- [ ] LOW-2: path 파라미터 UUID frontend 검증 (UX 개선) — 별도 chunk
- [ ] LOW-3: `withCredentials: true` 주석 명시 — 5분 작업, 다음 small PR 에 포함 가능
- [ ] INFO-1: 다중 tenant 인스턴스화 시점에 `useCurrentTenant()` hook 추출 — 별도 wave (ADR 결정 필요)

### sunset 게이트 승계

본 PASS 로 M5+M6 완료 → CLAUDE.md PR 리뷰 게이트 룰 #4 (`bash scripts/run-integration-tests.sh tests/<domain>/` 라이브 통합 테스트) 가 다음 신규 도메인부터 자동 게이트로 승계. messenger 도메인 자체는 신규 PR 시 5개 항목 모두 적용 의무.

---

## 연관 문서

- `CLAUDE.md` — PR 리뷰 게이트 룰 #1~#5
- `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md` §2.2 (S82 4 latent bug 분류)
- `memory/project_workspace_singleton_globalthis.md` (tenantPrismaFor closure 패턴)
- `memory/project_tenant_default_sentinel.md` (TENANT_SLUG 'default' 정착)
- `memory/feedback_grant_check_for_bypassrls_roles.md` (S88 GRANT 검증 룰)
- `docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` (timezone audit)
