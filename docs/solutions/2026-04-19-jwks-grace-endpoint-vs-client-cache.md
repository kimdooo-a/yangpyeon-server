---
title: JWKS 키 회전 grace는 엔드포인트 정책 — 클라이언트 캐시만으로 불성립
date: 2026-04-19
session: 30 (SP-014)
tags: [jwks, jose, key-rotation, grace-period, authentication, adr-013]
category: pattern
confidence: high
---

## 문제

ADR-013 "jose ES256 키쌍 + JWKS 엔드포인트" 설계 문서는 다음 문구를 포함한다:

> JWKS 엔드포인트에 Next.js 캐시 3분 grace를 적용한다.

흔한 오해: "3분 grace = jose의 `cacheMaxAge: 180_000` 옵션만 설정하면 키 회전 시 구 토큰이 3분간 유효."

SP-014 실험으로 이 오해가 **틀렸음** 을 확인:

```js
// JWKS 서버가 oldKey만 서빙
const jwks = createRemoteJWKSet(url, { cacheMaxAge: 180_000 });
await jwtVerify(oldToken, jwks);  // ✅ OK

// JWKS 서버가 newKey로 교체 (oldKey 제거)
// → jose가 캐시 miss 시 다시 fetch → newKey만 받음
await jwtVerify(oldToken, jwks);  // ❌ ERR_JWKS_NO_MATCHING_KEY
```

**즉, jose 클라이언트의 `cacheMaxAge`는 "3분 동안 fetch 안 함"만 제공**하며, JWKS 서버가 구 키를 제거하면 다음 캐시 miss 시점부터 구 토큰 검증이 실패한다.

## 원인

`createRemoteJWKSet`의 grace는 **원격 상태 캐싱**이 본질:
- cacheMaxAge: fetch 빈도 제한
- cooldownDuration: 실패 후 재시도 쿨다운

"구 토큰 계속 유효" 시맨틱은 라이브러리 수준이 아니라 **JWKS 엔드포인트의 응답 정책**에서 결정된다:
- JWKS 응답에 구·신 키를 동시에 포함하면 → jose가 두 키 모두 후보로 시도 → 구 토큰도 검증 성공
- JWKS 응답에서 구 키 제거 → jose 캐시 만료 시점부터 검증 실패

## 해결

### 올바른 "3분 grace" 구현 (Phase 17 대상)

#### 1. 데이터 모델
```prisma
model SigningKey {
  id        String    @id  // kid
  publicJwk Json      // { kty, alg, use, kid, ... }
  privateJwk Json     @db.JsonB  // 서명용, 외부 노출 금지
  isActive  Boolean   @default(true)   // 현재 서명용 (1개만 true)
  retireAt  DateTime?                   // 이 시각 후 JWKS에서 제거
  createdAt DateTime  @default(now())
}
```

#### 2. JWKS 엔드포인트 응답 정책
```typescript
// src/app/api/.well-known/jwks.json/route.ts
export async function GET() {
  const keys = await prisma.signingKey.findMany({
    where: {
      OR: [
        { isActive: true },
        { retireAt: { gt: new Date() } }  // grace 기간 내
      ]
    }
  });
  return Response.json(
    { keys: keys.map(k => k.publicJwk) },
    {
      headers: {
        "Cache-Control": "public, max-age=180, stale-while-revalidate=60",
      }
    }
  );
}
```

**핵심**: 응답에 **활성 키 + retire 대기 키 모두** 포함. 클라이언트는 jose `createRemoteJWKSet`으로 자연스럽게 두 키 후보를 시도.

#### 3. 키 회전 절차
```typescript
async function rotateSigningKey() {
  const oldKey = await prisma.signingKey.findFirst({ where: { isActive: true } });
  const { publicJwk, privateJwk } = await generateEs256KeyPair();

  // 신 키 등록 + 구 키 retire 예약
  await prisma.$transaction([
    prisma.signingKey.update({
      where: { id: oldKey.id },
      data: {
        isActive: false,
        // grace = max(token TTL, cacheMaxAge) + 안전 margin
        retireAt: new Date(Date.now() + (15 * 60 + 3 * 60 + 60) * 1000),
      },
    }),
    prisma.signingKey.create({
      data: {
        id: newKid(),
        publicJwk,
        privateJwk,
        isActive: true,
      },
    }),
  ]);

  // JWKS 캐시는 CDN/브라우저에 max-age=180으로 자동 만료 — 별도 flush 불필요
}
```

#### 4. retire 정리 cron
```typescript
cron.schedule("0 * * * *", async () => {
  await prisma.signingKey.deleteMany({
    where: {
      isActive: false,
      retireAt: { lt: new Date() },
    },
  });
});
```

### 클라이언트 측 (jose)
```typescript
const jwks = createRemoteJWKSet(
  new URL("/api/.well-known/jwks.json", process.env.PUBLIC_URL),
  {
    cacheMaxAge: 180_000,      // 3분 — JWKS fetch 빈도 제한
    cooldownDuration: 30_000,  // 실패 후 30s 재시도 억제
  }
);
```

역할 분담 명확:
- **jose의 cacheMaxAge**: 성능 (fetch 빈도 절감)
- **엔드포인트의 retireAt 정책**: 기능 (grace 보장)

## SP-014 실측 (2026-04-19)

### 캐시 성능
| 지표 | cacheMaxAge=0 | cacheMaxAge=180_000 |
|------|---------------|---------------------|
| p95 verify | 1.340ms | **0.189ms** |
| fetch 빈도 | 100/100 | **1/100 (hit 99%)** |

### Cloudflare Tunnel RTT (stylelucky4u.com)
| 지표 | 값 |
|------|----|
| p50 | 141ms |
| p95 | 149ms |
| p99 | 457ms (outlier 1건) |

**실효 지연** = 0.99 × 0.189ms (hit) + 0.01 × 149ms (miss) ≈ **1.67ms**.

NFR-PERF.9 목표 `p95 < 50ms` 대비 30배 여유 → Cloudflare Workers 앞단 캐시 도입 **불필요**.

## 교훈

1. **"X분 grace"라는 표현이 양의적**: 라이브러리 수준(캐시 만료 시간) vs 엔드포인트 정책(키 유지 기간). 설계 문서는 항상 "누가 무엇을 책임지는지" 명시.
2. **옵션 이름과 시맨틱 일치 확인**: `cacheMaxAge`는 이름 그대로 "캐시 최대 연령"일 뿐. "grace period"를 원하면 추가 구현 필요.
3. **실험이 문서 용어를 정정**: SP-014가 없었다면 Phase 17 구현 시 "cacheMaxAge만 설정"으로 끝내고 회전 시 장애 발생 가능했음.
4. **ADR 본문 수정 필수**: "3분 grace"를 "엔드포인트에 구 키 유지 3분 + jose 3분 캐시"로 분해 기술.

## DQ-12.4 답변

> JWKS endpoint를 Cloudflare Workers 앞단 캐시로 둘지?

**답변**: 현 시점 **불필요**. 재검토 트리거 2건:
1. Cloudflare Tunnel 530 재발률 > 1%/일 → hit rate 95% 하회
2. JWT 검증량 > 1000 RPS → miss 절대 빈도 10/s 초과

## 관련 파일

- `docs/research/spikes/spike-014-jwks-cache-result.md` 전체
- `02-architecture/01-adr-log.md` § ADR-013 (수정 대상)
- `02-architecture/03-auth-advanced-blueprint.md` § JWKS (§운용 정책 절 추가 대상)
- `00-vision/07-dq-matrix.md` — DQ-12.4 Resolved
