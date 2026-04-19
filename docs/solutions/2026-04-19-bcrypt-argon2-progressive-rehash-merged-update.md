---
title: "bcrypt → argon2id 점진 마이그레이션 — prefix 분기 + lastLoginAt UPDATE 에 재해시 머지"
date: 2026-04-19
session: 32
tags: [auth, password, argon2, bcrypt, migration, performance, pattern]
category: pattern
confidence: high
---

## 문제

프로덕션 DB 에 bcrypt($2b$12$...) 해시가 이미 누적된 상태에서 argon2id 로 전환해야 한다. 다음 조건이 겹친다:

- **일괄 마이그레이션 불가** — 해시는 one-way. 저장된 bcrypt hash 에서 plain password 를 역추출할 수 없다. "SQL 한 번으로 전 사용자 argon2 hash 로 교체" 같은 옵션 존재하지 않음
- **호출자 다수** — `hashPassword` 는 register / password 변경 / admin 계정 생성 / login 재해시 네 경로에서 호출. 시그니처 변경하면 일제 수정 필요
- **성능 목표** — SP-011 실측 argon2id 19.8ms vs bcrypt(12) 172.2ms = 13× 빠름. 그런데 재해시를 위해 `UPDATE` 를 추가로 호출하면 DB round-trip 이 증가해 이득이 상쇄될 위험
- **영구 잔존 리스크** — 한 번도 재로그인하지 않는 dormant 계정의 bcrypt hash 는 영원히 남는다. "전원 argon2" 시점을 선언할 수 없음

즉, **스키마 변경 0 / 호출자 영향 최소 / round-trip 증가 0 / 영구 잔존 허용** 을 동시에 만족해야 한다.

## 원인

전통적 해시 마이그레이션의 함정:

1. **새 필드 추가 (`passwordHashV2`, `hashAlgo`)** — 스키마 dual-write, 마이그레이션 스크립트, 읽기 분기 모두 필요. 잔여 bcrypt hash 추적을 위한 컬럼도 필요
2. **단일 `hashPassword` 바디 안에서 bcrypt/argon2 모두 시도** — 코드 복잡도 폭증, 잘못된 저장 포맷 발생 가능
3. **별도 `UPDATE` 로 재해시 커밋** — Blueprint §7.2.3 예시 코드는 `verify + prisma.user.update({passwordHash})` 2회 호출. 본 프로젝트는 login 마다 이미 `lastLoginAt` UPDATE 가 있어 머지 가능하다는 점을 간과

근본 통찰: **bcrypt 와 argon2id 해시는 prefix 로 자가 식별된다** (`$2...` vs `$argon2id$...`). 별도 메타데이터 불필요. `verifyPasswordHash` 내부에서 분기만 하면 스키마 변경 0 으로 해결.

## 해결

### 1. Prefix 기반 분기 (`src/lib/password.ts`)

```typescript
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcrypt";

const ARGON2ID_ALGORITHM = 2; // @node-rs/argon2 const enum 회피 (isolatedModules)

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, { algorithm: ARGON2ID_ALGORITHM });
}

export async function verifyPasswordHash(plain: string, hash: string): Promise<boolean> {
  if (hash.startsWith("$2")) {
    return bcrypt.compare(plain, hash);  // legacy 역호환
  }
  return argonVerify(hash, plain);        // 신규 경로
}

/** bcrypt 해시면 argon2id로 재해시가 필요 (점진 마이그레이션). */
export function needsRehash(hash: string): boolean {
  return hash.startsWith("$2");
}
```

핵심:
- `hashPassword` 시그니처 **불변** — 신규 등록 / 비밀번호 변경 / admin 생성 호출부 수정 0
- `verifyPasswordHash` 시그니처 **불변** — 이미 두 파라미터(plain, hash)
- `needsRehash` 만 신규 export — 재해시 책임은 호출자(login route) 에게 위임

### 2. lastLoginAt UPDATE 에 재해시 머지 (`src/app/api/v1/auth/login/route.ts`)

```typescript
const valid = await verifyPasswordHash(password, user.passwordHash);
if (!valid) {
  return errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다", 401);
}

// lastLoginAt 업데이트 + (bcrypt → argon2id 점진 마이그레이션) Phase 17 / SP-011 / ADR-019
const updateData: { lastLoginAt: Date; passwordHash?: string } = {
  lastLoginAt: new Date(),
};
if (needsRehash(user.passwordHash)) {
  updateData.passwordHash = await hashPassword(password);
}
await prisma.user.update({
  where: { id: user.id },
  data: updateData,
});
```

핵심:
- login 은 이미 **매번** `lastLoginAt` UPDATE 를 수행 — Blueprint §7.2.3 예시처럼 별도 update 를 호출하면 round-trip 1회 추가
- `updateData` 객체에 `passwordHash?` 를 **조건부 머지** → 재해시가 필요한 bcrypt 사용자도 DB 왕복 1회로 끝
- argon2 사용자는 `needsRehash` false → `passwordHash` 필드 없음 → 기존 동작과 동일

### 3. 호출자 영향 분석 (세션 32 handover §2.2)

| 라우트 | 영향 |
|--------|------|
| `/api/v1/auth/login` | 자동 재해시 추가 (본 파일 1곳) |
| `/api/v1/auth/register` | 변경 0 (`hashPassword` 시그니처 동일 → 신규 = argon2id 자동) |
| `/api/v1/auth/password` (변경) | 변경 0 (동일) |
| `/api/settings/users` (admin 생성) | 변경 0 (동일) |
| `/api/auth/login` (레거시 env 평문) | 변경 0 (bcrypt/argon2 무관) |

→ **login route 1곳만 수정**. 나머지는 자연 전환.

### 4. 성능 특성 (SP-011 실측)

| 경로 | 1차 로그인 (bcrypt 사용자) | 2차 이후 (argon2 전환 후) |
|------|---|---|
| verify | bcrypt.compare 172ms | argon2Verify 14ms |
| 재해시 | argonHash 20ms | — |
| DB UPDATE | 1회 (lastLoginAt + passwordHash 머지) | 1회 (lastLoginAt) |
| 체감 | ~190ms (1회) | ~14ms (영구) |

→ 1차만 살짝 느림, 이후 **13배 빠름**. 사용자 인지 불가한 체감 변화.

### 5. 테스트 (`src/lib/password.test.ts` — 8 PASS)

```typescript
it("기존 bcrypt 해시도 검증한다 (역호환, $2 prefix 분기)", async () => {
  const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 4);
  expect(bcryptHash.startsWith("$2")).toBe(true);
  expect(await verifyPasswordHash(TEST_PASSWORD, bcryptHash)).toBe(true);
});

it("bcrypt 해시 ($2) 는 재해시가 필요하다", async () => {
  const bcryptHash = await bcrypt.hash(TEST_PASSWORD, 4);
  expect(needsRehash(bcryptHash)).toBe(true);
});

it("argon2id 해시는 재해시가 불필요하다", async () => {
  const argonHash = await hashPassword(TEST_PASSWORD);
  expect(needsRehash(argonHash)).toBe(false);
});
```

### 6. 프로덕션 E2E (세션 32 §3.3)

```
배포 직후 prefix:   $2b$12$wiApl   (bcrypt cost=12)
1차 로그인:         HTTP 200 + JWT 발급
1차 후 prefix:      $argon2id$v=   ⭐ 자동 마이그레이션 성공
2차 로그인:         HTTP 200       ⭐ argon2 분기 검증 PASS
```

kimdooo 계정(Phase 14 등록, bcrypt cost=12) 1회 로그인 만에 전환 완료. 재로그인 시 argon2 경로 검증 PASS.

## 재발 방지

1. **신규 해시 알고리즘 도입 시 동일 패턴 재활용** — 미래 argon2id → (예: scrypt, balloon) 이관도 prefix 분기 + `needsRehash` 규칙만 확장하면 됨. 같은 `password.ts` 파일에 분기 한 줄 추가
2. **Dormant 계정의 bcrypt 잔존 용인** — 90일+ 미로그인 계정은 argon2 전환되지 않을 수 있음. SP-011 권고: 로그인 tracking 으로 잔여 bcrypt hash 0 확인 후 `bcrypt` 의존성 제거. **즉각 0 를 요구하지 말 것**
3. **Admin reset password 도 자동 argon2** — 관리자가 비밀번호 재설정 시에도 `hashPassword` 경유 → 자동 argon2. 별도 경로 도입 금지
4. **재해시를 별도 UPDATE 로 분리하지 말 것** — login route 의 `lastLoginAt` UPDATE 에 머지. 분리 시 round-trip 증가 + 트랜잭션 일관성 위험 (password 저장은 성공했는데 lastLoginAt 실패 같은 반쪽 상태)
5. **`hashPassword` 기본값을 신규 알고리즘으로** — legacy 유지 플래그(`useArgon2: true`) 같은 옵션 도입 금지. 기본이 신규여야 신규 등록이 자동 마이그레이션됨
6. **`needsRehash` 는 저렴한 prefix 검사** — 정규식/파싱 말고 `startsWith("$2")` 한 줄. login 매 호출마다 실행되므로 비용 0
7. **`isolatedModules: true` 환경에서 const enum 회피** — `@node-rs/argon2` 의 `Algorithm` 은 `export declare const enum`. `import { Algorithm } from "@node-rs/argon2"` 직접 사용 시 컴파일 경고. `const ARGON2ID_ALGORITHM = 2` 상수 캡슐화로 해결

## 관련 구조

### 파일
- `src/lib/password.ts` — `hashPassword` / `verifyPasswordHash` / `needsRehash`
- `src/lib/password.test.ts` — 8 PASS (argon2 format / verify 정·오답 / bcrypt 역호환 / needsRehash 분기)
- `src/app/api/v1/auth/login/route.ts` — `needsRehash` 체크 + `updateData.passwordHash?` 머지

### 참조
- SP-011 결과 (`docs/research/spikes/spike-011-argon2-result.md`) — 13× 성능 측정 + 점진 마이그레이션 1000 사용자 오류율 0%
- Auth Advanced Blueprint §7.2.3 — argon2id 전환 설계 (본 구현이 예시보다 round-trip 1회 적음)
- ADR-019 (`docs/research/decisions/ADR-019-argon2id.md`) — argon2id Accepted
- 세션 32 handover (`docs/handover/260419-session32-phase15-step1-2.md`) §2.2·§3.3·§4
- 관련 CK: `2026-04-19-napi-prebuilt-native-modules.md` (@node-rs/argon2 N-API prebuilt 설치 3.3초)

### 일반화

Prefix 자가 식별 + 호출 시점 재계산 머지 패턴은 다음에도 적용:
- **암호화 key rotation** — ciphertext 에 keyId prefix → decrypt 시점에 신 key 로 재암호화하여 다음 write 에 머지
- **signing algorithm 전환** — HS256 → ES256 전환 시 JWT 헤더 `alg` 로 분기 (본 프로젝트 JWKS 경로가 이미 채택 — auth.ts `verifySession` kid 유무 분기)
- **JSON schema migration** — `schemaVersion` 필드 분기 + 다음 write 에 upgrade 머지
