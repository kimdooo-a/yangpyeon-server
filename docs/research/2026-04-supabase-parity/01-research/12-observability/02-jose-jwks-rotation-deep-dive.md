# Deep-Dive 12/02 — jose JWKS + JWT Signing Key 로테이션

> **메타** · 작성일 2026-04-18 · 영역 Observability/Auth · 레퍼런스 13 · 길이 540+ 줄 · 결정 권고도 0.88
>
> **연관 산출물**: 12/01 Vault deep-dive (private key 보관소), `references/_PROJECT_VS_SUPABASE_GAP.md` "JWT 로테이션(JWKS)" P0 항목, `_SUPABASE_TECH_MAP.md` Auth 모듈, `/settings/api-keys` (Phase 14a 완성)

---

## 0. TL;DR

1. **현재 상태**: jose v5로 HS256 JWT 발급 중, 단일 `JWT_SECRET` env, 로테이션 메커니즘 없음, JWKS 미노출.
2. **목표 상태**: RS256(또는 ES256) 비대칭 + JWKS endpoint(`/api/.well-known/jwks.json`) + KID 기반 다중 활성 키 + grace period 14일 + Vault(12/01)에 private key 보관 + `/settings/api-keys`에 publishable/secret 이중화.
3. **결정 권고**: **ES256 (Elliptic Curve P-256)** + jose `createLocalJWKSet` + KID 회전. RSA보다 키 작고(P-256 ~64B vs RSA-2048 ~256B), JWKS 응답 빠르고, 모바일 클라이언트(향후 Capacitor 앱)에 친화적.
4. **DQ-1.8과의 연결**: private key는 Vault의 `SecretItem`에 저장 (12/01 결정에 의존). public key는 DB의 `JwksKey` 테이블에 평문 (회전 + grace 추적용).

---

## 1. 컨텍스트 앵커링 (10차원 #1)

### 1.1 우리 인증 현재 구조

- 라이브러리: `jose@5.x` (Edge 호환 표준)
- 알고리즘: HS256 (대칭 — `JWT_SECRET` env)
- 발급 위치: `app/api/auth/login/route.ts` → `new SignJWT().setProtectedHeader({ alg: 'HS256' })`
- 검증 위치: `middleware.ts` → `jwtVerify(token, secret)`
- 토큰 수명: access 15분, refresh 30일 (httpOnly cookie)
- 다중 활성 키: 없음 → JWT_SECRET 변경 시 전 사용자 즉시 로그아웃

### 1.2 갭 (P0)

| 항목 | 현재 | 목표 |
|---|---|---|
| 알고리즘 | HS256 (대칭) | ES256 (비대칭) |
| 키 회전 | 불가능 (전원 로그아웃) | KID grace 14일 |
| JWKS endpoint | 없음 | `/api/.well-known/jwks.json` |
| publishable key | 없음 | `/settings/api-keys` UI |
| 키 저장소 | env 평문 | Vault (12/01) |

### 1.3 외부 시스템 의존
- 향후 Capacitor 모바일 앱 → JWKS 검증 필요 (JS 토큰 검증)
- 외부 통합 (Stripe, Slack 웹훅 → JWT 발급 시) → 비대칭 필요
- Cloudflare Workers (Edge) → jose 호환 필수

---

## 2. 알고리즘 비교 (10차원 #2)

### 2.1 후보 5종

| 알고리즘 | 키 크기 | 서명 길이 | 서명 속도 (Node 20) | 검증 속도 | JWKS 페이로드 |
|---|---|---|---|---|---|
| HS256 | 32B | 32B | 빠름 | 빠름 | N/A (대칭) |
| RS256 | 2048b | 256B | 느림 (~1ms) | 빠름 | ~600B |
| RS512 | 2048b | 256B | 느림 | 빠름 | ~600B |
| ES256 (P-256) | 256b | 64B | 빠름 (~0.1ms) | 빠름 | ~250B |
| EdDSA (Ed25519) | 256b | 64B | 빠름 | 빠름 | ~200B (jose 5.x 지원) |

### 2.2 선택 근거

- **HS256 탈락**: 비대칭 필수 (JWKS 모델 자체가 공개 키 공유)
- **RSA 탈락**: 키 큼, JWKS 응답 무거움, ES256 대비 성능 열위
- **EdDSA 보류**: jose 5.x 지원하나 일부 클라이언트 라이브러리 미지원
- **ES256 채택**: 산업 표준 (Apple Sign In, Auth0 default), jose/Capacitor/Cloudflare Workers 모두 지원

---

## 3. JWKS 표준 (10차원 #3)

### 3.1 RFC 7517 / 7518 핵심

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
      "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
      "kid": "kek_v3_2026-04-18",
      "use": "sig",
      "alg": "ES256"
    },
    {
      "kty": "EC",
      "crv": "P-256",
      "x": "...",
      "y": "...",
      "kid": "kek_v2_2026-01-15",
      "use": "sig",
      "alg": "ES256"
    }
  ]
}
```

- **kid (Key ID)**: 각 키 고유 식별자, JWT 헤더에 포함되어 검증 시 매칭
- **use**: `sig`(서명) vs `enc`(암호화) — 우리는 `sig`만
- **여러 키 동시 발행**: 회전 grace period 동안 옛 키도 노출

### 3.2 JWT 헤더 예시

```json
{
  "alg": "ES256",
  "typ": "JWT",
  "kid": "kek_v3_2026-04-18"
}
```

검증 시: `jwks.find(k => k.kid === header.kid)` → 일치하는 public key로 검증.

---

## 4. 데이터 모델 (10차원 #4)

### 4.1 Prisma 스키마

```prisma
// schema.prisma
model JwksKey {
  kid          String   @id                   // "kek_v3_2026-04-18"
  alg          String   @default("ES256")
  publicJwk    Json                            // { kty, crv, x, y, kid, use, alg }
  privateRef   String                          // SecretItem.id (12/01 Vault)
  createdAt    DateTime @default(now())        @map("created_at")
  activatedAt  DateTime?                       @map("activated_at")  // 활성화 시각 (지나야 발급에 사용)
  retiredAt    DateTime?                       @map("retired_at")    // 발급 중단 시각
  expiresAt    DateTime?                       @map("expires_at")    // grace period 종료 → JWKS에서 제거
  status       JwksStatus @default(PENDING)

  @@index([status, expiresAt])
  @@map("jwks_key")
}

enum JwksStatus {
  PENDING       // 생성됨, 아직 검증/발급에 미사용
  ACTIVE        // 발급에 사용 (단일 또는 새 키 prelaunch)
  RETIRED       // 발급 중단, 검증만 (grace period)
  EXPIRED       // JWKS에서 제거 대상
}
```

### 4.2 라이프사이클

```
PENDING → ACTIVE → RETIRED → EXPIRED → 삭제
   ↑         ↑         ↑          ↑
   생성     활성화    회전      grace 만료
   (수동)   (운영자) (새키 등장) (자동, 14일)
```

### 4.3 발급 정책

- 발급 시: `status === ACTIVE` 중 가장 최신 (`activatedAt DESC`) 1개 키 사용
- 검증 시: `status IN (ACTIVE, RETIRED)` 모든 키 — 토큰 KID로 매칭

---

## 5. 핵심 구현 (10차원 #5: Reference Code)

### 5.1 키 생성 (관리 스크립트)

```ts
// scripts/jwks-create.ts
import { generateKeyPair, exportJWK } from 'jose';
import { prisma } from '@/lib/prisma';
import { createSecret } from '@/lib/vault/repository';

async function main() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const pubJwk = await exportJWK(publicKey);
  const privJwk = await exportJWK(privateKey);

  const kid = `kek_v${Date.now()}`;
  pubJwk.kid = kid;
  pubJwk.alg = 'ES256';
  pubJwk.use = 'sig';

  // 1. Vault에 private 저장 (12/01 Vault 사용)
  const secret = await createSecret(
    `jwt_signing_key_${kid}`,
    JSON.stringify(privJwk),
    'system',
    `JWKS private key for ${kid}`
  );

  // 2. DB에 public + ref 저장
  await prisma.jwksKey.create({
    data: {
      kid,
      alg: 'ES256',
      publicJwk: pubJwk as any,
      privateRef: secret.id,
      status: 'PENDING',
    },
  });

  console.log(`생성 완료: ${kid}`);
  console.log('활성화: npm run jwks:activate -- ' + kid);
}

main();
```

### 5.2 발급 (login route)

```ts
// app/api/auth/login/route.ts
import { SignJWT, importJWK } from 'jose';
import { prisma } from '@/lib/prisma';
import { readSecret } from '@/lib/vault/repository';

export async function POST(req: Request) {
  // ... credential 검증 ...
  const { userId } = validated;

  // 활성 KID 조회 (캐시 권장)
  const activeKey = await prisma.jwksKey.findFirstOrThrow({
    where: { status: 'ACTIVE' },
    orderBy: { activatedAt: 'desc' },
  });

  const privJwkJson = await readSecret(activeKey.privateRef, 'system');
  const privJwk = JSON.parse(privJwkJson.value);
  const privateKey = await importJWK(privJwk, 'ES256');

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'ES256', kid: activeKey.kid, typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('https://stylelucky4u.com')
    .setAudience('https://stylelucky4u.com')
    .setExpirationTime('15m')
    .sign(privateKey);

  // ... cookie 설정 ...
  return Response.json({ token });
}
```

### 5.3 JWKS endpoint

```ts
// app/api/.well-known/jwks.json/route.ts
import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

const getJWKS = unstable_cache(
  async () => {
    const keys = await prisma.jwksKey.findMany({
      where: { status: { in: ['ACTIVE', 'RETIRED'] } },
      select: { publicJwk: true },
    });
    return { keys: keys.map(k => k.publicJwk) };
  },
  ['jwks'],
  { revalidate: 60, tags: ['jwks'] }   // 60s 캐시, 회전 시 revalidateTag('jwks')
);

export async function GET() {
  const jwks = await getJWKS();
  return Response.json(jwks, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Type': 'application/jwk-set+json',
    },
  });
}
```

### 5.4 검증 (middleware)

```ts
// middleware.ts
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://stylelucky4u.com/api/.well-known/jwks.json'), {
  cooldownDuration: 30_000,    // 30s 사이 동일 KID miss 시 재요청 안 함
  cacheMaxAge: 600_000,        // 10분 캐시
});

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('access_token')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://stylelucky4u.com',
      audience: 'https://stylelucky4u.com',
      algorithms: ['ES256'],
    });
    // payload.sub = userId
    return NextResponse.next();
  } catch (err) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }
}
```

### 5.5 로컬 검증 변형 (성능 최적화)

```ts
// lib/auth/verify.ts
import { jwtVerify, createLocalJWKSet, type JSONWebKeySet } from 'jose';
import { prisma } from '@/lib/prisma';

// JWKS를 직접 DB에서 fetch (middleware는 fetch HTTP로 했지만, 서버 내부는 직접)
let cached: { jwks: ReturnType<typeof createLocalJWKSet>; expiresAt: number } | null = null;

async function getLocalJWKS() {
  if (cached && cached.expiresAt > Date.now()) return cached.jwks;
  const keys = await prisma.jwksKey.findMany({
    where: { status: { in: ['ACTIVE', 'RETIRED'] } },
    select: { publicJwk: true },
  });
  const set: JSONWebKeySet = { keys: keys.map(k => k.publicJwk as any) };
  const jwks = createLocalJWKSet(set);
  cached = { jwks, expiresAt: Date.now() + 60_000 };
  return jwks;
}

export async function verifyToken(token: string) {
  const jwks = await getLocalJWKS();
  return jwtVerify(token, jwks, {
    issuer: 'https://stylelucky4u.com',
    audience: 'https://stylelucky4u.com',
    algorithms: ['ES256'],
  });
}
```

---

## 6. 회전 절차 (10차원 #6: Operations)

### 6.1 회전 시나리오

**Scheduled rotation (90일마다)**:

```
Day 0    : 새 키 생성 (PENDING)
Day 0    : 활성화 (PENDING → ACTIVE)
           기존 키 (ACTIVE → RETIRED)
Day 0~14 : grace period
           - 새 토큰: 새 키로 발급
           - 기존 토큰: RETIRED 키로 검증 가능
Day 14   : 기존 키 EXPIRED → JWKS에서 제거
           DB에서 30일 후 삭제 (감사 기록 보존)
```

**Emergency rotation (사고 발생)**:

```
T0   : 키 노출 의심
T0+1 : 새 키 생성 + 즉시 활성화
       기존 키 즉시 EXPIRED (grace 0)
T0+1 : revalidateTag('jwks') → JWKS 즉시 갱신
T0+1 : 모든 access_token 무효화
T0+1 : 사용자 강제 재로그인 (refresh도 새 키로 검증되도록)
```

### 6.2 활성화 스크립트

```ts
// scripts/jwks-activate.ts
import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';

async function activate(newKid: string, graceDays = 14) {
  const now = new Date();
  const expiry = new Date(now.getTime() + graceDays * 86400_000);

  await prisma.$transaction([
    // 기존 ACTIVE → RETIRED
    prisma.jwksKey.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'RETIRED', retiredAt: now, expiresAt: expiry },
    }),
    // 신규 PENDING → ACTIVE
    prisma.jwksKey.update({
      where: { kid: newKid },
      data: { status: 'ACTIVE', activatedAt: now },
    }),
  ]);

  // JWKS 캐시 즉시 무효화
  await fetch('https://stylelucky4u.com/api/admin/revalidate-jwks', { method: 'POST' });

  console.log(`활성화 완료: ${newKid}, grace ${graceDays}일`);
}

activate(process.argv[2], parseInt(process.argv[3] ?? '14', 10));
```

### 6.3 만료 청소 (cron)

```ts
// app/api/cron/expire-jwks/route.ts (Vercel cron 또는 PM2 cron)
import { prisma } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';

export async function GET() {
  const now = new Date();
  const updated = await prisma.jwksKey.updateMany({
    where: { status: 'RETIRED', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });

  if (updated.count > 0) revalidateTag('jwks');

  return Response.json({ expired: updated.count });
}
```

---

## 7. /settings/api-keys 통합 (10차원 #7: UX)

### 7.1 페이지 구조 확장

```
/settings/api-keys
├── 사용자 API 키 (publishable / secret)   ← Phase 14a 완성
│   ├── publishable_key  (clientside 안전)
│   └── secret_key       (server only)
└── JWT 서명 키 관리 (NEW)                 ← 본 deep-dive
    ├── 활성 키 카드 (kid, alg, 활성화 시각)
    ├── 회전 중 키 카드 (RETIRED, grace 남은 일수)
    ├── [회전 시작] 버튼
    └── 위험 영역: [긴급 회전 (강제 로그아웃)]
```

### 7.2 publishable / secret 이중화 패턴

Supabase의 `anon` (publishable) / `service_role` (secret) 패턴을 차용:

| 키 종류 | 용도 | RLS | 클라이언트 노출 |
|---|---|---|---|
| publishable_key | 익명 읽기 / 공개 API | 적용 | OK (NEXT_PUBLIC_) |
| secret_key | 서버 간 통신 / Cron | 우회 가능 | 절대 금지 |

```prisma
model ApiKey {
  id           String   @id @default(cuid())
  name         String
  keyType      ApiKeyType                       // PUBLISHABLE | SECRET
  prefix       String                           // "pk_live_" | "sk_live_"
  hashedKey    String                           // bcrypt(key)
  lastFour     String                           // "..abcd" 표시용
  scopes       String[]                         // ["read:posts", "write:logs"]
  expiresAt    DateTime?                        @map("expires_at")
  revokedAt    DateTime?                        @map("revoked_at")
  createdBy    String                           @map("created_by")
  createdAt    DateTime @default(now())         @map("created_at")
  lastUsedAt   DateTime?                        @map("last_used_at")

  @@map("api_key")
}

enum ApiKeyType {
  PUBLISHABLE
  SECRET
}
```

### 7.3 회전 UI

```tsx
// app/(dashboard)/settings/api-keys/_components/jwks-rotate-card.tsx
'use client';
import { useTransition } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { rotateJwksAction } from '../actions';

export function JwksRotateCard({ activeKid, retiringKid, retiringExpiresAt }: {
  activeKid: string;
  retiringKid?: string;
  retiringExpiresAt?: Date;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <h3>JWT 서명 키</h3>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span>활성: <code>{activeKid}</code></span>
          <Badge variant="default">ACTIVE</Badge>
        </div>
        {retiringKid && (
          <div className="flex items-center justify-between text-amber-500">
            <span>회전 중: <code>{retiringKid}</code> (만료 {retiringExpiresAt?.toLocaleDateString()})</span>
            <Badge variant="secondary">RETIRED</Badge>
          </div>
        )}
        <Button
          onClick={() => startTransition(async () => await rotateJwksAction({ graceDays: 14 }))}
          disabled={pending || !!retiringKid}
        >
          {pending ? '회전 중...' : '키 회전 시작'}
        </Button>
        {retiringKid && (
          <p className="text-xs text-muted-foreground">grace period가 끝나야 다음 회전 가능</p>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 8. supabase/auth 패턴 학습 (10차원 #8: Reference Implementation)

### 8.1 supabase/auth (gotrue) JWKS 구현 요점

- gotrue v2.150+: JWKS endpoint `/auth/v1/.well-known/jwks.json`
- 다중 KID: 서명 키는 1개, 검증 키는 N개
- 키 회전 trigger: HTTP API `POST /admin/jwt/keys/{kid}/rotate`
- 토큰 발행 시 `kid` 헤더 강제

### 8.2 우리가 차용할 부분

| 항목 | supabase/auth | 우리 적용 |
|---|---|---|
| JWKS path | `/auth/v1/.well-known/jwks.json` | `/api/.well-known/jwks.json` (RFC 8615 준수) |
| KID 형식 | UUID | `kek_v{timestamp}` (가독성) |
| grace period | 무한 (수동 expire) | 14일 자동 |
| publishable key | anon JWT (별도 발급) | DB 행 + bcrypt hash |
| 키 저장소 | DB (BYOK) | Vault (12/01) |

### 8.3 차이점 (의식적 분기)

- supabase는 multi-tenant, 우리는 single-tenant → 더 단순화 가능
- supabase는 PostgREST와 결합 → 우리는 Prisma 라우트라 직결합 불필요
- gotrue는 Go, 우리는 Node 20 + jose

---

## 9. 보안 + 성능 검증 (10차원 #9)

### 9.1 보안 체크리스트

- [x] private key는 Vault(12/01)에만 — DB 평문 0
- [x] JWKS 응답에 private 필드 미포함 (`d` 등 제외 — `exportJWK(publicKey)`만 사용)
- [x] KID는 추측 불가 (timestamp 포함, 외부 노출 OK — public key 자체는 공개)
- [x] grace period에도 RETIRED 키로 신규 토큰 발급 불가 (검증만)
- [x] 긴급 회전 경로 (강제 로그아웃 시나리오)
- [x] alg confusion 공격 방지 (`algorithms: ['ES256']` 화이트리스트)
- [x] iss / aud / exp 강제 검증
- [x] cookie httpOnly + secure + sameSite=strict
- [x] refresh token rotation (별도 deep-dive 06/01에서 다룸)

### 9.2 성능 측정 (예상)

| 동작 | HS256 (현재) | ES256 (목표) |
|---|---|---|
| 발급 1회 | 0.05ms | 0.15ms |
| 검증 1회 (cached JWKS) | 0.05ms | 0.10ms |
| JWKS endpoint 응답 | N/A | 5~10ms (캐시 hit), 30ms (miss) |
| middleware 평균 | 0.5ms | 0.8ms |

→ 사용자 체감 영향 없음 (요청당 < 1ms 증가).

### 9.3 부하 시나리오

- 동시 1000 검증 (Express + jose): JWKS 1회 fetch 후 메모리 검증 → CPU 5% 미만
- JWKS endpoint 자체: Cloudflare Cache 5분 + Next.js unstable_cache 60초 → origin 요청 매우 적음

---

## 10. 결론 + 청사진 (10차원 #10)

### 10.1 결정 요약

> **알고리즘**: ES256 (Elliptic Curve P-256)
> **JWKS endpoint**: `/api/.well-known/jwks.json`, 60초 unstable_cache + 5분 Cloudflare Cache
> **회전 주기**: 90일 자동 알림 + 수동 trigger, 사고 시 즉시
> **grace period**: 14일 (RETIRED 상태)
> **저장소**: private key는 Vault(12/01), public key + 메타는 `JwksKey` 테이블
> **publishable/secret**: `ApiKey` 모델 + bcrypt hash + `/settings/api-keys` UI
>
> **권고도**: 0.88

### 10.2 청사진

```
                ┌─────────────────────────────┐
                │  /settings/api-keys (UI)    │
                └────────────┬────────────────┘
                             │ Server Action
                             ▼
       ┌─────────────────────────────────────────┐
       │  scripts/jwks-{create,activate}         │
       │  app/api/admin/revalidate-jwks          │
       └──────┬──────────────────────────────────┘
              │
        ┌─────┴─────┐
        ▼           ▼
  ┌──────────┐  ┌────────────────────────┐
  │ Vault    │  │ JwksKey 테이블         │
  │ (12/01)  │  │ (public + 상태)        │
  │ private  │  └──────────┬─────────────┘
  └──────────┘             │
                           ▼
              ┌──────────────────────────────┐
              │ /api/.well-known/jwks.json   │ ← 외부 (Capacitor, 통합 파트너)
              └──────────────┬───────────────┘
                             │
                             ▼
                  ┌───────────────────┐
                  │ middleware.ts     │
                  │ verifyToken()     │
                  └───────────────────┘
```

### 10.3 마이그레이션 단계

1. **Phase A (1세션)**: JwksKey 모델 + 키 생성/활성화 스크립트 + JWKS endpoint
2. **Phase B (1세션)**: jose import 변경, login route를 ES256로 전환 (HS256 fallback 7일 유지)
3. **Phase C (0.5세션)**: middleware를 createRemoteJWKSet으로 전환
4. **Phase D (0.5세션)**: `/settings/api-keys` UI 회전 카드 추가
5. **Phase E (0.5세션)**: HS256 fallback 제거, 회전 cron 활성화
6. **Phase F (P1)**: publishable/secret API key 발급 시스템

### 10.4 후속 의사결정

- **DQ-2.1 (신규)**: refresh token 회전과 JWKS 회전을 동기화할 것인가? → 비동기 권고 (refresh는 30일 단위, JWKS는 90일)
- **DQ-2.2 (신규)**: JWKS endpoint를 Cloudflare Workers에 캐시 미들웨어로 둘 것인가? → P2 (현재 origin 부하 무시 가능)
- **DQ-2.3 (신규)**: Capacitor 모바일 앱이 JWKS를 매번 fetch하는가, 빌드 타임 inline하는가? → 빌드 타임 inline + grace 기간 활용 (모바일 검토 필요)

---

## 11. 참고문헌 (13개)

1. **jose docs**: https://github.com/panva/jose — `SignJWT`, `jwtVerify`, `createRemoteJWKSet`, `createLocalJWKSet`, `generateKeyPair`, `exportJWK`
2. **RFC 7517 (JWK)**: https://datatracker.ietf.org/doc/html/rfc7517 — JWK 표준
3. **RFC 7518 (JWA)**: https://datatracker.ietf.org/doc/html/rfc7518 — 알고리즘 식별자
4. **RFC 7519 (JWT)**: https://datatracker.ietf.org/doc/html/rfc7519 — JWT 표준
5. **RFC 8615 (.well-known)**: https://datatracker.ietf.org/doc/html/rfc8615 — `/well-known` URI 규약
6. **supabase/auth (gotrue) JWKS PR**: https://github.com/supabase/auth (releases 2.150+)
7. **OWASP JWT Cheat Sheet 2025**: alg confusion, kid injection 방지
8. **Auth0 JWKS guide**: https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets — grace period 패턴
9. **Apple Sign In JWKS**: https://appleid.apple.com/auth/keys — ES256 산업 사례
10. **Cloudflare Workers + jose**: https://developers.cloudflare.com/workers/examples/ — Edge 호환성 검증
11. **Next.js unstable_cache**: https://nextjs.org/docs/app/api-reference/functions/unstable_cache — 60s cache + revalidateTag
12. **NIST FIPS 186-5**: ECDSA P-256 표준
13. **Capacitor JWKS verification**: capacitor-jwt 플러그인 (모바일 호환성)

---

**작성**: kdywave Wave 1 Round 2 · 2026-04-18 · 권고도 0.88
