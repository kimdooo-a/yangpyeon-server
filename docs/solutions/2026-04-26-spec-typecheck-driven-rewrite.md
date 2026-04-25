---
title: 외부 작성 스펙은 type-check 통과 검증 없이는 신뢰 불가 — scratch 적용 패턴
date: 2026-04-26
session: 57
tags: [spec-validation, typecheck, scratch-apply, prisma-client-provider, asChild-avoidance, cross-team-handoff]
category: pattern
confidence: high
---

## 문제

외부에서(혹은 별도 Claude 세션에서) 작성된 스펙 자산(`docs/assets/yangpyeon-aggregator-spec/`)을 본 코드에 적용하려는데, 첫 인상으로는 거의 다 맞아 보이는 v1.0이 실제로는 자체 스키마와 **자기 모순**을 다수 포함하고 있어 단순 복붙으로 빌드가 깨졌다.

표면적으로 본 첫 결함은 **1건** (`suggestedCategoryId` vs `suggestedCategorySlug`). 그러나 실제 스펙 적용 후 `tsc --noEmit` 실행 시 **81 컴파일 에러 / 21 파일 영향**. 빙산의 일각이었다.

결함의 진짜 분포:
- ~30 에러: 스펙 자체 스키마와 코드 간 불일치 (`nameKo` vs `name`, staging에 없는 필드 사용 등)
- ~5 에러: Prisma 클라이언트 import 경로 (`@prisma/client` vs `@/generated/prisma/client`)
- ~12 에러: yangpyeon 어댑터 가정 차이 (`session.userId` vs `session.sub`, `extractClientIp(req)` vs `extractClientIp(headers)`, `Button asChild` 미지원, `ApiKey.expiresAt` 미존재)
- ~24 에러: 환경 셋업 누락 (npm 3 패키지 + shadcn 9 컴포넌트, 스펙 Step 1에서 예고됨)

## 원인

**근본**: 스펙 작성자가 type-check 한 번도 안 거친 상태로 v1.0을 패키징.

세부:
1. **자기 모순 (~30 에러)**: 작성 도중 스키마 마이그레이션 → 코드 작성 → 코드 작성 중 추가 필드 가정(`qualityFlag`, `track` 직접 등) → 스키마 미반영 → 자기 모순. 단일 파일 단위 검증은 했어도 **전체 패키지를 통합 type-check** 안 함.
2. **컨트랙트 가정 차이 (~12 에러)**: yangpyeon의 실제 코드를 보지 않고 generic shadcn/Next.js 컨벤션으로 작성. 예: shadcn `Button`은 보통 Radix Slot으로 `asChild` 지원하지만, yangpyeon은 `@base-ui/react/button` 직접 래핑이라 미지원. `@prisma/client`는 표준이지만 yangpyeon은 `prisma-client` 새 provider + `@/generated/prisma/client` 출력.
3. **Step 1 의존성은 의식적으로 미설치 상태로 패키징** — 그래서 D 카테고리는 진짜 setup 갭이지 결함은 아님. 그러나 D가 24개로 가시성 높아 A·B·C 결함을 가릴 위험.

## 해결

### 1. 스펙 검증 워크플로우 표준화

**검증 패턴 — scratch 적용 → tsc → 백아웃**:

```bash
# 1. 임시 적용 (작업 트리 dirty)
git checkout -b spec/<name>-fixes
[수동 enum 추가가 있으면 직접 edit]
cat <spec>/prisma/schema-additions.prisma >> prisma/schema.prisma
cp -r <spec>/src/lib/<feature> src/lib/
cp -r <spec>/src/app/<routes>/. src/app/<routes>/
npx prisma generate

# 2. type-check
npx tsc --noEmit | grep "^src/" | wc -l

# 3. 셋업 외 에러 분류
npx tsc --noEmit | grep "^src/" | grep -v "Cannot find module" | wc -l
# = 0 이어야 spec 자체는 클린

# 4. 백아웃 (적용 검증과 spec 변경을 분리)
git checkout -- prisma/schema.prisma
rm -rf src/lib/<feature> src/app/<routes>
npx prisma generate
```

이 패턴의 장점:
- **재현 가능**: 다른 세션에서도 동일하게 적용/검증 가능
- **작업 트리 깨끗 유지**: 검증 결과만 남기고 spec 위치에서 수정
- **결함 분류**: 셋업 갭(예상됨) vs 실제 결함(고쳐야 함) 명확히 분리

### 2. yangpyeon 컨트랙트 인지 — spec 작성 가이드 (재발 방지)

새 스펙이 yangpyeon 환경에 적용될 거라면 README/02-applying-the-patch에 다음을 명시:

```markdown
### Prisma 클라이언트 (yangpyeon 컨벤션)

yangpyeon은 `prisma-client` provider를 사용하며 출력 경로는 `src/generated/prisma`다.
import 경로:
- `import { prisma } from "@/lib/prisma"` (instance, lazy proxy with PrismaPg adapter)
- `import type { Prisma, ContentItem } from "@/generated/prisma/client"` (types)
- `import { Role } from "@/generated/prisma/enums"` (enums)

전통적인 `@prisma/client`는 사용하지 않음.
```

```markdown
### Button asChild 미지원 회피

yangpyeon의 `<Button>`은 `@base-ui/react/button` 직접 래핑이라 `asChild` 미지원.
대안 패턴:
- `<Link>` 직접 스타일링: `<Link className={cn(buttonVariants({variant:'outline'}))}>`
- controlled `<Dialog>`: `open` + `setOpen` 상태로 일반 `<Button onClick={() => setOpen(true)}>`
```

```markdown
### 세션 페이로드 shape

`getSessionFromCookies()` returns `DashboardSessionPayload { sub, email, role, authenticated }`.
`session.sub`을 사용 (NOT `session.userId`).
```

```markdown
### Audit log shape

`AuditEntry { timestamp, method, path, ip, status?, action?, userAgent?, detail? }` — `actor`/`meta` 필드 없음.
사용자 정보는 `detail` JSON에 인코딩.
`extractClientIp(headers: Headers)` (NextRequest 미수용).
```

### 3. Spec 측 schema 보강 vs 코드 다이어트 결정 패턴

A 카테고리 (~30 에러) 처리 시 두 방향 중 선택:
- **A-방향 (보강)**: 스펙이 기능을 요구하면 스키마에 필드 추가 (예: 큐레이션 4필드 추가)
- **B-방향 (다이어트)**: 스펙이 미보장 기능을 가정하면 코드에서 제거

선택 기준:
- README/01-overview에 명시된 기능 → A-방향 (기능 보존)
- 스펙 코드의 가정만 있고 README 미언급 → B-방향 (작가의 실수)

본 세션에서는 큐레이션(`qualityFlag`/`reviewedById`/`reviewedAt`/`reviewNote`)이 README의 "관리자 큐레이션" 기능에 해당하므로 A-방향 선택.

### 4. seed 스크립트의 PrismaClient 인스턴스화

yangpyeon처럼 PrismaClient가 어댑터 강제하는 환경에서:

```typescript
// AVOID — 어댑터 인자 강제로 인한 TS2554
import { PrismaClient } from "@/generated/prisma/client";
const prisma = new PrismaClient();

// PREFER — lazy proxy 재사용
import { prisma } from "@/lib/prisma";
```

운영 코드와 seed가 동일 인스턴스 라이프사이클을 공유 → 환경변수/어댑터/마이그레이션 일관성.

## 교훈

1. **type-check를 거치지 않은 스펙은 "초안"이다** — 1차 review에서 표면 결함 1건 잡았다고 끝이 아님. 항상 scratch 적용 → tsc 패턴으로 전수 검증.
2. **셋업 갭과 진짜 결함을 분리해라** — 24개 missing module 에러가 있더라도 그건 npm install 1회로 해결되는 것. `tsc | grep -v "Cannot find module"` 으로 진짜 결함만 추출.
3. **외부 spec은 yangpyeon 컨트랙트를 모른다** — Prisma 경로, Button asChild, 세션 shape, AuditEntry shape, ApiKey 모델 5종이 매번 같은 패턴으로 어긋남. spec README에 yangpyeon 컨벤션 섹션을 강제하면 재발 방지.
4. **백아웃은 cleanup이 아니라 "검증과 변경을 분리"하는 도구** — scratch 적용 검증 후 백아웃하면 작업 트리에는 spec 변경(가치)만 남고, src/ 변경(검증 부산물)은 사라짐. 다음 세션이 02-applying-the-patch.md 따라 깨끗하게 다시 적용 가능.

## 관련 파일

- `docs/handover/260426-session57-aggregator-spec-rewrite.md` — 본 세션 인수인계서
- `docs/assets/yangpyeon-aggregator-spec/README.md` — v1.1 changelog (이 패턴이 적용된 결과)
- `docs/assets/yangpyeon-aggregator-spec/02-applying-the-patch.md` — Step 1-1/1-2/1-3 분할 (npm + shadcn + Prisma 경로)
- `src/lib/auth.ts:65` — `getSessionFromCookies` 시그니처
- `src/lib/audit-log.ts:4` — `AuditEntry` 인터페이스
- `src/components/ui/button.tsx` — yangpyeon Button (asChild 미지원)
- `src/lib/prisma.ts` — lazy proxy + PrismaPg 어댑터
- `prisma/schema.prisma:309` — ApiKey 모델 (expiresAt 없음)
