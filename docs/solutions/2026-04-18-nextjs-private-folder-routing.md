---
title: Next.js App Router의 `_` prefix 폴더는 private folder — 라우트 트리에서 제외됨
date: 2026-04-18
session: 24-β
tags: [nextjs, app-router, routing, convention, gotcha, phase-14c]
category: bug
confidence: high
---

## 컨텍스트

세션 24-β에서 Phase 14c-β 복합 PK 지원을 위해 신규 엔드포인트 추가:
- `PATCH /api/v1/tables/[table]/_composite` — 복합 PK 행 부분 업데이트
- `DELETE /api/v1/tables/[table]/_composite` — 복합 PK 행 삭제

기존 `/api/v1/tables/[table]/[pk]` 단일 PK 경로와 분리하기 위해 폴더명에 underscore prefix(`_composite`)를 붙여 "내부용/특수 경로"임을 시각적으로 구분하려 했음. **이 명명이 함정의 시작.**

## 증상

E2E 1차 실행 시 **모든 `/composite` 요청이 의도한 엔드포인트가 아니라 `[pk]/route.ts`로 라우팅**됨:

```bash
curl -X PATCH "http://localhost:3000/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d '{"pk_values":{...},"values":{...}}'
# → HTTP 400
# → {"success":false,"error":{"code":"COMPOSITE_PK_UNSUPPORTED",
#     "message":"복합 PK 테이블은 Phase 14b에서 미지원"}}
```

`COMPOSITE_PK_UNSUPPORTED`는 `[pk]/route.ts` PATCH 핸들러가 복합 PK 테이블을 거부할 때 반환하는 에러. 즉 `_composite` 폴더의 `route.ts`가 **전혀 호출되지 않음** — Next.js는 `_composite`를 `[pk]` 동적 세그먼트의 값(`pk = "_composite"`)으로 해석해 `[pk]/route.ts`로 폴백.

폴더는 분명 존재(`ls src/app/api/v1/tables/[table]/_composite/route.ts` 확인)하지만 라우트 등록되지 않음.

## 진단

Next.js 빌드 산출물(`.next/server/app/...`)을 확인:
- `_composite/route.ts`에 해당하는 컴파일 결과물이 **존재하지 않음**
- `[pk]/route.ts`는 정상 컴파일

이 시점에서 폴더명 자체가 라우트 등록 제외 사유임을 의심.

## 근본 원인

Next.js App Router는 **`_`로 시작하는 폴더를 private folder로 처리**하여 라우트 트리에서 의도적으로 제외한다. 이는 라우트가 아닌 co-located 파일(컴포넌트, 유틸, 타입 등)을 페이지/API 폴더 옆에 두기 위한 공식 컨벤션.

> Private folders can be created by prefixing a folder with an underscore: `_folderName`
> This indicates the folder is a private implementation detail and should not be considered by the routing system.
>
> — [Next.js Project Structure / Private Folders](https://nextjs.org/docs/app/getting-started/project-structure#private-folders)

용도:
- UI 로직과 라우팅 로직 분리 (예: `app/dashboard/_components/Sidebar.tsx`)
- 파일을 카테고리별로 organize하면서도 라우트 충돌 회피
- `%5F` (URL-encoded `_`)로 시작해야 라우팅 가능 — 실질적으로 라우트 차단

이 규칙은 **모든 라우트 세그먼트(페이지/API/레이아웃)에 일관 적용**. API 라우트도 예외 없음.

## 해결

폴더명에서 underscore 제거:

```
src/app/api/v1/tables/[table]/_composite/route.ts   ← 라우트 미등록
src/app/api/v1/tables/[table]/composite/route.ts    ← 정상 라우트 ✓
```

세션 24-β에서 폴더 rename + 모든 URL 참조 일괄 치환:
- API: `composite/route.ts` 자체
- UI: `src/components/table-editor/use-inline-edit-mutation.ts` (`/composite` 분기)
- E2E: `scripts/e2e/phase-14c-beta-curl.sh` (B1~B9 모두 `/composite`)

이후 E2E 재실행 → `/composite`로 정상 라우팅 → B1~B9 매트릭스 진행 가능 (단 별도 정밀도 버그가 추가로 드러남 — `2026-04-18-timestamp-precision-optimistic-locking.md` 참조).

## 검증

```bash
curl -X PATCH "http://localhost:3000/api/v1/tables/_test_composite/composite" \
  -H 'Content-Type: application/json' \
  -d '{"pk_values":{...},"values":{...}}'
# → HTTP 200 (정상 PATCH) 또는 409 (CONFLICT)
# composite/route.ts 핸들러가 정상 호출됨
```

`/api/v1/tables/folders/composite`(단일 PK 테이블) 호출 → `NOT_COMPOSITE` 400 반환 — `composite/route.ts`가 정상 진입했음을 역설적으로 증명.

## 재발 방지

### API 라우트 폴더 명명 체크리스트

1. **`_` prefix 절대 금지** — 명시적으로 차단할 의도(공유 컴포넌트 폴더)가 아니면 underscore 사용 금지
2. **다른 함정 prefix도 인지**:
   - `(...)`: route group (URL 영향 없음, 라우팅은 작동) — 의도적 사용 OK
   - `[...]`: catch-all dynamic
   - `[[...]]`: optional catch-all
   - `@`: parallel route slot
3. **신규 API 폴더 추가 시 `route.ts`가 빌드 산출물에 포함되는지 확인**:
   ```bash
   ls .next/server/app/api/v1/tables/[table]/composite/
   # route.js가 보여야 정상
   ```

### ESLint/Lint-staged 후속 검토 (세션 24 미적용)

`eslint-plugin-import` 또는 커스텀 규칙으로 `app/**/_*/route.{ts,tsx,js}` 패턴 경고:

```js
// eslint.config.mjs (검토 후보)
{
  files: ["src/app/**/_*/route.{ts,tsx}"],
  rules: { "no-restricted-syntax": ["error", "..."] },
}
```

또는 `app/**/_*/route.*` 글롭이 매치되면 `precommit` hook에서 차단.

## 교훈

1. **프레임워크 컨벤션은 prefix/suffix 한 글자로 동작이 완전히 바뀐다**. Next.js의 `_`, `(`, `[`, `@` 모두 라우팅에 의미 부여 — 새 폴더명은 항상 공식 문서의 reserved characters 섹션 확인.
2. **빌드 산출물에 라우트가 없으면 dev에서 404가 아니라 dynamic segment로 fallback될 수 있다**. "라우트가 등록 안 됨"의 증상은 의외로 다른 라우트의 핸들러가 잘못된 파라미터로 호출되는 형태로 드러난다.
3. **명명에 의도(예: "내부용")를 시각적으로 표현하려 할 때 프레임워크 예약어와 충돌 가능성을 먼저 검토**. 의도는 폴더명이 아니라 README나 폴더 내부의 doc comment로 표현.

## 관련 파일

- `src/app/api/v1/tables/[table]/composite/route.ts` (rename 후 정상 작동)
- `src/components/table-editor/use-inline-edit-mutation.ts` (URL 참조 일괄 치환)
- `scripts/e2e/phase-14c-beta-curl.sh` (B1~B9, `/composite` 사용)
- `docs/handover/260418-session24-phase-14c-beta.md` (버그 1 상세)
- 공식 문서: https://nextjs.org/docs/app/getting-started/project-structure#private-folders

## 관련 솔루션

- [`2026-04-18-timestamp-precision-optimistic-locking.md`](./2026-04-18-timestamp-precision-optimistic-locking.md) — 본 버그 수정 직후 드러난 정밀도 버그 (β 검증의 두 번째 함정)
- [`2026-04-12-nextjs16-proxy-migration-cve.md`](./2026-04-12-nextjs16-proxy-migration-cve.md) — Next.js 컨벤션 변경 사례
