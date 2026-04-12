---
title: 스테일 JWT 세션으로 인한 FK 위반 (P2003) 방어 패턴
date: 2026-04-12
session: 16
tags: [prisma, jwt, session, foreign-key, error-handling, p2003]
category: pattern
confidence: high
---

## 문제
런타임 로그에 반복 출력:

```
PrismaClientKnownRequestError:
Invalid `prisma.folder.create()` invocation:
Foreign key constraint violated on the constraint: `folders_owner_id_fkey`
{
  code: 'P2003',
  meta: { modelName: 'Folder', driverAdapterError: ForeignKeyConstraintViolation }
}
```

원인: 유효한 JWT 세션 쿠키의 `user.sub`가 DB에 없는 user ID를 참조. `prisma.folder.create({ data: { ownerId: userId, ... } })`가 FK 검사 실패.

## 원인
- **DB 리셋/재마이그레이션 후 세션 쿠키 유효성이 남음**: JWT는 만료 전까진 유효. DB가 초기화돼도 쿠키는 살아있음
- **사용자 계정 삭제 후에도 토큰 미폐기**: 토큰 블랙리스트/세션 DB 미구현 환경에서 흔함
- **미들웨어에서 JWT 서명만 검증, 사용자 존재 여부는 미검사**: 서명 유효성 ≠ 유저 현존

## 해결
**진입 지점에서 user 존재 검증 + 전용 에러로 401 매핑**:

### 1. 도메인 레이어에서 방어 (filebox-db.ts)
```ts
export class StaleSessionError extends Error {
  constructor(userId: string) {
    super(`세션 유저(${userId})가 DB에 존재하지 않습니다. 재로그인이 필요합니다.`);
    this.name = "StaleSessionError";
  }
}

export async function getOrCreateRootFolder(userId: string) {
  const existing = await prisma.folder.findFirst({
    where: { ownerId: userId, isRoot: true },
  });
  if (existing) return existing;

  // 신규 생성 전에 유저 존재 확인 — FK 오류 선제 차단
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },  // 최소 페이로드
  });
  if (!userExists) throw new StaleSessionError(userId);

  return prisma.folder.create({ data: { ownerId: userId, /* ... */ } });
}
```

### 2. API 가드 레이어에서 매핑 (api-guard.ts)
```ts
async function runHandler(handler, request, user, context): Promise<Response> {
  try {
    return await handler(request, user, context);
  } catch (err) {
    if (err instanceof Error && err.name === "StaleSessionError") {
      return errorResponse("STALE_SESSION", err.message, 401);
    }
    throw err;  // 그 외는 Next.js 기본 500 핸들링
  }
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (request, context) => {
    // ... JWT 검증 ...
    return runHandler(handler, request, payload, context);
  };
}
```

### 3. 클라이언트는 `401 STALE_SESSION` 받으면 재로그인 플로우 진입
(기존 401 핸들러가 이미 있으면 별도 작업 없음)

## 교훈
- **FK 위반을 catch해서 변환하지 말고, 선제 검증으로 차단**. P2003 catch는 타이밍 의존적이고 race-prone
- **세션 토큰의 서명 유효성 ≠ 참조 엔티티 현존성**. JWT stateless 특성상 revocation이 어렵다면 "hot path의 진입 검증"으로 보완
- **에러 매핑은 이름 기반으로**: `err instanceof CustomError`는 번들러/SSR 직렬화 경계에서 깨질 수 있음. `err.name === "..."` 문자열 체크가 더 안전
- `select: { id: true }`로 **최소 컬럼만 조회** — 존재 여부만 필요할 때의 표준 패턴
- **공용 에러 모듈은 필요해질 때까지 만들지 말 것**. 한 곳에서 쓰는 에러는 그 모듈에 두고 `err.name`으로 식별 — 의존성 방향 복잡화 방지

## 관련 파일
- `src/lib/filebox-db.ts` — StaleSessionError + getOrCreateRootFolder
- `src/lib/api-guard.ts` — runHandler 래퍼 + 401 매핑
- 커밋: `90c1c1e`
