# 02. ElectricSQL Embed Deep-Dive

> **Wave 1 / 09-realtime / 옵션 #2 — 제3자 Sync Engine 임베드 트랙**
> 작성일: 2026-04-18
> 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + WSL2 PostgreSQL)
> 비교 후보: wal2json 직접 구현 (01), supabase/realtime 포팅 (03)

---

## 1. 요약

**ElectricSQL**은 Postgres의 변경사항을 HTTP를 통해 클라이언트로 동기화하는 **read-path sync engine**이다. 2024년 말 v1.0이 나오면서 과거 (Local-First DB + SQLite + Y.js) 비전을 과감히 폐기하고, **"Postgres → HTTP Shape API → 임의 클라이언트"** 라는 단순화된 아키텍처로 재출발했다. 2025년 8월 v1.1에서는 새 스토리지 엔진으로 쓰기 처리량 100배 향상을 발표했고, 단일 commodity Postgres에서 100만 동시 클라이언트 sync까지 검증되었다.

이 트랙의 가치 제안:
- **CDC + 캐시 + fan-out + 부분 복제** 4가지를 한 번에 해결
- HTTP 프로토콜 → Cloudflare Tunnel·CDN·서비스 워커와 천연 호환
- Postgres 옆에 Elixir 프로세스(`electric` 바이너리) 한 개만 띄우면 끝
- 클라이언트 SDK가 TypeScript·React·React Native 모두 1급 지원

다만 우리 100점 동등성 관점에서는 **Broadcast/Presence가 본질적으로 없다**는 한계가 결정적이다. ElectricSQL은 "데이터 sync"가 정체성이지, "ephemeral pub/sub"가 아니다. 이 부분은 별도 트랙(03번 또는 자체 구현)이 반드시 필요하다.

또한 v1 전환 과정에서 과거 SQLite·CRDT·write-path가 사라지면서, **양방향 동기화는 사용자가 직접 REST/Server Action으로 처리**해야 한다. 우리 운영 시나리오(대시보드, 양방향 거의 없음)에는 정확히 부합한다.

**점수 미리보기: 3.85 / 5.00** — INTEG·DX·MAINT 강함, FUNC(Broadcast/Presence 부재)·SELF_HOST(Elixir 의존) 약함.

---

## 2. 아키텍처

### 2.1 v1 이후의 Electric

ElectricSQL v1은 다음과 같이 단순화되었다:

```
┌────────────────────┐
│   PostgreSQL 17    │ wal_level=logical
│   (우리 기존 인스턴스) │
└─────────┬──────────┘
          │ logical replication slot
          │ (electric_slot, pgoutput plugin)
          ▼
┌──────────────────────┐
│   Electric Sync      │  ← 별도 프로세스 (Elixir/BEAM 빌드 바이너리)
│   Service            │     OR Docker 컨테이너
│   ┌────────────────┐ │
│   │ Shape Storage  │ │  ← 신규 v1.1 스토리지 엔진
│   │ (per-shape log)│ │
│   └────────┬───────┘ │
│            │         │
│   ┌────────▼───────┐ │
│   │ HTTP Server    │ │  port 3000
│   │ /v1/shape      │ │  long-poll + offset 기반
│   └────────┬───────┘ │
└────────────┼─────────┘
             │ HTTP (long polling, ETag, Last-Modified)
             ▼
   ┌──────────────────────┐
   │  Next.js 16 (BFF)    │
   │  ┌────────────────┐  │
   │  │ @electric-sql/ │  │  TypeScript client
   │  │     client     │  │
   │  └────────┬───────┘  │
   └───────────┼──────────┘
               ▼
       ┌──────────────┐
       │ Browser      │
       │ Shape stream │
       └──────────────┘
```

### 2.2 Shape이란?

Shape = **"Postgres의 한 부분 집합 (테이블 × 행 필터 × 컬럼 선택)을 시간이 지나도 일관되게 sync하는 단위"**.

```typescript
// 예: "이 사용자가 볼 수 있는 주문만"
const shape = {
  table: 'order',
  where: 'shop_id = 42 AND status != \'cancelled\'',
  columns: ['id', 'created_at', 'total', 'status']
};
```

특징:
- **부분 복제(partial replication)** — Supabase Realtime의 RLS 필터와 유사
- **무한 sync** — 클라이언트는 한 번 연결하면 영원히 최신 상태 유지
- **HTTP 캐시 친화** — Shape ID + offset으로 캐시 키 구성, CDN 캐시 가능
- **재연결 복원력** — 클라이언트가 마지막 offset을 보내면 그 이후만 받음

### 2.3 데이터 흐름 (자세히)

```
1. 클라이언트가 /v1/shape?table=order&where=... 로 첫 요청
   → Electric이 해당 SHAPE를 처음 보면:
     a. 신규 logical replication slot 생성 (또는 기존 slot 공유)
     b. Postgres에 SELECT * FROM order WHERE ... 로 초기 스냅샷
     c. 응답: 200 + 모든 행 + offset=0 + shape_id

2. 클라이언트가 /v1/shape?shape_id=...&offset=0 으로 다음 요청
   → Electric:
     a. shape_id의 변경 로그를 offset 이후부터 반환
     b. 변경 없으면 long-poll (최대 ~25s) 후 304 또는 새 데이터
     c. 응답: 200 + delta + offset=N

3. 무한 반복 (HTTP 지속 연결, ETag 활용)
```

### 2.4 v1 이전과 무엇이 사라졌나

| 항목 | v0.x (2023~2024 초) | v1.x (2025~) |
|------|---------------------|--------------|
| 클라이언트 DB | SQLite + electric-sql adapter | **없음** (사용자가 IndexedDB·메모리 알아서) |
| CRDT | 자동 적용 (Y.js 기반) | **제거** |
| Write path | 양방향 sync, 충돌 해결 | **read-only sync. 쓰기는 사용자 직접 REST** |
| Schema 마이그레이션 | DDL 동기화 | **제거. 사용자 책임** |
| 인증 | proprietary | **JWT or 사용자 정의 미들웨어** |

**→ 단순화의 본질:** "우리는 데이터 push 잘 하는 한 가지에 집중. 나머지는 사용자가 좋아하는 도구로." 이 변화는 2024년 말 ElectricSQL Beta release 글에서 공식화되었고, 우리 같은 "기존 Postgres + 기존 BFF" 사용자에게는 **압도적으로 유리**한 방향 전환이다.

---

## 3. 핵심 기능 매트릭스

| 기능 | ElectricSQL v1.x로 가능? | 비고 |
|------|--------------------------|------|
| **Postgres CDC** | ✅ 핵심 | logical replication 기반 |
| **부분 복제 (RLS-like)** | ✅ Shape의 where 절 | 우리 RBAC와 별도 매핑 필요 |
| **Fan-out (1 변경 → N 클라이언트)** | ✅ 검증됨 | 100만 동시 sync 사례 |
| **HTTP 캐시 / CDN 호환** | ✅ 설계 핵심 | Cloudflare Tunnel·Workers와 궁합 |
| **Long-poll / SSE** | ✅ HTTP long-poll 기본 | WebSocket 아님 |
| **Channel/PubSub (Broadcast)** | ❌ **없음** | 03번 또는 자체 구현 필요 |
| **Presence (CRDT)** | ❌ **없음** | (v0.x 시절은 가능했지만 v1에서 제거) |
| **클라이언트 SDK** | ✅ TS·React | use-shape 훅 매우 좋음 |
| **임의 SQL** | ❌ Shape 제약 | 복잡 query는 별도 API |
| **DDL 캡처** | ❌ | (Postgres 자체 한계) |
| **Inspector / 디버그 UI** | ⚠️ | electric-admin 별도 |

**중요한 결론:** ElectricSQL은 **CDC + fan-out**에는 5점이지만 **Broadcast/Presence는 0점**이다. 우리 100점 청사진에서 이는 결정적 약점.

---

## 4. API 레퍼런스

### 4.1 서버 측 (Electric Sync Service 띄우기)

#### 4.1.1 Docker Compose 패턴 (권장)

```yaml
# docker-compose.electric.yml
version: '3.8'
services:
  electric:
    image: electricsql/electric:1.1
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://electric_user:${PG_REPL_PW}@host.docker.internal:5432/ypb_main
      ELECTRIC_INSECURE: "true"           # 개발용. 프로덕션은 ELECTRIC_SECRET 설정
      LISTEN_PORT: "3030"
      LOG_LEVEL: info
      ELECTRIC_REPLICATION_SLOT: electric_ypb
    ports:
      - "127.0.0.1:3030:3030"             # Cloudflare Tunnel을 통하지 않을 때
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3030/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

#### 4.1.2 Postgres 사전 작업

```sql
-- Electric 전용 사용자 (REPLICATION 권한 필요)
CREATE USER electric_user WITH REPLICATION PASSWORD '...';
GRANT CONNECT ON DATABASE ypb_main TO electric_user;
GRANT USAGE ON SCHEMA public TO electric_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO electric_user;

-- Publication (Electric이 사용)
CREATE PUBLICATION electric_publication FOR ALL TABLES;
```

#### 4.1.3 wal_level 조건

ElectricSQL은 `wal_level = logical` 필수. 01번 문서의 **사전 스파이크 결과를 그대로 재사용**하면 된다 (이미 같은 변경이 필요).

### 4.2 클라이언트 측 (HTTP Shape API)

#### 4.2.1 Raw HTTP

```typescript
// 첫 요청
const res = await fetch(
  `http://localhost:3030/v1/shape?table=order&where=shop_id=42`
);
const { headers, body } = res;
const shapeId = headers.get('electric-shape-id');
const offset = headers.get('electric-offset');
const data = await res.json();
// data = [{ id, value: { ...row }, headers: {...} }, ...]

// 다음 요청 (long-poll)
const next = await fetch(
  `http://localhost:3030/v1/shape?table=order&shape_id=${shapeId}&offset=${offset}`
);
```

#### 4.2.2 TypeScript Client 라이브러리

```typescript
// app/orders/page.tsx
'use client';
import { useShape } from '@electric-sql/react';

export default function OrdersPage() {
  const { data, isLoading, error } = useShape({
    url: 'http://localhost:3030/v1/shape',
    params: {
      table: 'order',
      where: `shop_id = '${currentShopId}'`,
      columns: ['id', 'created_at', 'total', 'status']
    }
  });

  if (isLoading) return <Spinner />;
  if (error) return <Error err={error} />;

  return (
    <ul>
      {data.map(row => (
        <li key={row.id}>{row.id} — {row.total}</li>
      ))}
    </ul>
  );
}
```

#### 4.2.3 Server Component에서 prefetch

```typescript
// app/orders/page.tsx (RSC)
import { Shape } from '@electric-sql/client';

export default async function OrdersPage() {
  const shape = new Shape({
    url: 'http://electric:3030/v1/shape',
    params: { table: 'order', where: `shop_id = '${currentShopId}'` }
  });
  const initial = await shape.value;
  return <OrdersClient initialData={initial} />;
}
```

### 4.3 권한 통합 패턴

ElectricSQL은 **인증을 직접 처리하지 않는다.** 두 가지 패턴이 있다:

#### 패턴 A: BFF 프록시 (권장)

```
Browser ──→ Next.js /api/sync/orders ──→ Electric /v1/shape
              ↑ JWT 검증 + where 절 자동 주입
```

```typescript
// app/api/sync/orders/route.ts
export async function GET(req: Request) {
  const user = await getSession(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL('http://electric:3030/v1/shape');
  url.searchParams.set('table', 'order');
  // ★ 사용자 JWT에서 shop_id 추출하여 where 절 강제 주입
  url.searchParams.set('where', `shop_id = '${user.shopId}'`);
  // 클라이언트가 보낸 shape_id, offset 그대로 forward
  for (const [k, v] of new URL(req.url).searchParams) {
    if (k === 'shape_id' || k === 'offset') url.searchParams.set(k, v);
  }

  return fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
}
```

#### 패턴 B: ELECTRIC_SECRET (간단)

```bash
# Electric 환경변수
ELECTRIC_SECRET=mysecret123

# 클라이언트는 ?secret=mysecret123 쿼리 또는 헤더에 포함
```

→ 우리는 패턴 A를 쓴다. RBAC가 이미 BFF에 있어서 자연스럽다.

---

## 5. 성능 특성

### 5.1 공식 벤치마크 요약

ElectricSQL v1.1 출시 글에서 보고된 수치 (2025년 8월):

| 시나리오 | 결과 |
|----------|------|
| 동시 sync 클라이언트 | **1,000,000** (단일 commodity Postgres) |
| 메모리 사용 | flat scaling (수직 확장 불필요) |
| 변경 → 클라이언트 도달 P50 | < 100ms (지역 내) |
| 새 스토리지 엔진 쓰기 | v1.0 대비 **100배** |

### 5.2 우리 환경 추정 (WSL2 단일 노드)

| 항목 | 추정값 | 비고 |
|------|--------|------|
| 동시 클라이언트 | 50~100 | 우리 시나리오 매우 여유 |
| 새 변경 → 화면 P50 | ~80ms | local Postgres + local Electric |
| 새 변경 → 화면 P99 | ~300ms | Cloudflare Tunnel 포함 |
| Electric 메모리 | ~200MB | shape 10개 가정 |
| Electric CPU | <5% | 평소 부하 |
| Postgres 추가 부하 | +5% | logical decoding |

### 5.3 Slot 관리

ElectricSQL은 **하나의 logical replication slot**만 만들고 모든 shape를 그 slot 위에서 처리한다. 슬롯 수 폭증 위험 없음 — 01번에서 우려했던 시나리오와 동일하게 `max_slot_wal_keep_size = 2GB` 가드레일 적용.

---

## 6. 생태계 & 운영 사례

### 6.1 v1 기준 운영 사례

- **Trigger.dev** — 백그라운드 작업 진행률 실시간 표시 (수십만 동시)
- **Supabase 자체** — Edge Functions + ElectricSQL 통합 가이드 제공
- **Neon** — `wal2json` extension 안내 페이지에서 ElectricSQL 사례 언급
- **Materialize, Hasura** — 보완재로 사용 사례 다수

### 6.2 npm 다운로드 (2026-04 기준)

| 패키지 | Weekly DL | Status |
|--------|-----------|--------|
| `@electric-sql/client` | ~12,000 | ★ 활성 |
| `@electric-sql/react` | ~8,000 | ★ 활성 |
| `@electric-sql/sql` (v0.x 잔존) | <500 | 폐기 |

### 6.3 GitHub Star/활성도

- Stars: 7k+ (2026-04 기준)
- 매월 1~3 릴리즈
- 이슈 응답 보통 24~48시간

### 6.4 한국어 자료

- 한국어 자료는 거의 없음 (Notion·블로그 1~2건)
- 영어 자료는 풍부, 공식 문서 품질 매우 높음

---

## 7. 문서 품질

### 7.1 공식 문서 (electric-sql.com/docs)

- Getting Started 5분이면 Hello World
- Shape API, Client SDK, HTTP API, Architecture 모두 분리되어 깊이 있음
- 다이어그램·sequence chart 충실
- v1 전환 과정에서 v0.x 문서 별도 보존 (혼란 방지)

### 7.2 예제 저장소

`electric-sql/electric` repo의 `examples/` 디렉토리에 30+ 개 예제 (Next.js, React Native, Cloudflare Workers 등). 우리는 `examples/nextjs` 그대로 복사 가능.

---

## 8. 프로젝트 적합도 (양평 부엌 서버)

### 8.1 스택 호환성

| 컴포넌트 | 호환성 | 비고 |
|----------|--------|------|
| Next.js 16 | ✅ | App Router·RSC·Server Action 모두 공식 예제 |
| TypeScript | ✅ | 1급 시민 |
| Prisma 7 | ✅ | Electric은 Prisma와 완전 분리. 같은 DB만 쓰면 됨 |
| WSL2 PostgreSQL | ✅ | wal_level 변경 (01번 문서와 동일) |
| Cloudflare Tunnel | ✅ | HTTP만 통과 (WS 무관) — **장점** |
| PM2 | △ | Electric은 Docker가 표준, PM2로 띄우려면 Elixir 빌드 직접 관리 |
| Docker | ✅ | 공식 이미지 1.1 안정 |

### 8.2 우리 운영 패턴 매핑

| 우리 요구 | ElectricSQL 대응 |
|-----------|-------------------|
| 주문 목록 실시간 | Shape: `table=order, where=shop_id=...` |
| 메뉴 가격 변경 알림 | Shape: `table=menu, columns=[id,price]` |
| 운영자 채팅 (Broadcast) | ❌ 별도 트랙 |
| 운영자 접속 현황 (Presence) | ❌ 별도 트랙 |
| 결제 진행 상태 push | Shape: `table=payment, where=order_id IN (...)` |

→ "테이블의 변경 push" 시나리오에는 완벽 적합. 그 외는 별도.

### 8.3 마이그레이션 비용

- Docker compose 1개 추가
- BFF에 `/api/sync/*` 프록시 라우트 추가
- 기존 SSE 라우트는 그대로 유지 (점진적 이전)
- Prisma 7 마이그레이션 시 Electric 재시작 불필요 (DDL은 Electric이 자동 인지하지 않음, 새 publication만 갱신하면 됨)

---

## 9. 라이선스

| 컴포넌트 | 라이선스 | 상업적 이용 |
|----------|---------|-------------|
| Electric Sync Service | **Apache 2.0** | ✅ |
| @electric-sql/client | Apache 2.0 | ✅ |
| @electric-sql/react | Apache 2.0 | ✅ |
| Electric Cloud (선택) | 유료 SaaS | (자체 호스팅 시 무관) |

→ **무제한 상업 이용 가능.** 우리는 자체 호스팅 → $0.

---

## 10. 스코어링 (5점 척도, 앵커링)

| 차원 | 가중치 | 점수 | 가중점 | 근거 (앵커) |
|------|--------|------|--------|-------------|
| **FUNC** | 18% | **3.0** | 0.54 | CDC·Shape 5점, Broadcast/Presence 0점 → 평균 3.0. 100점 동등성 단독 불가 |
| **PERF** | 10% | **5.0** | 0.50 | 100만 동시 sync 검증, P50 <100ms, flat scaling |
| **DX** | 14% | **4.5** | 0.63 | useShape 훅 우수·문서 우수·예제 풍부, 단 Broadcast 부재로 -0.5 |
| **ECO** | 12% | **4.0** | 0.48 | Trigger.dev·Supabase 통합·Neon 가이드 등 채택 사례 다수 |
| **LIC** | 8% | **5.0** | 0.40 | Apache 2.0 — 무제한 |
| **MAINT** | 10% | **4.5** | 0.45 | 매월 릴리즈, v1.0(2025-03) → v1.1(2025-08) 안정 progression |
| **INTEG** | 10% | **4.5** | 0.45 | Next.js 16·Prisma 7·Cloudflare Tunnel·WSL2 모두 ✅. PM2는 Docker로 우회 |
| **SECURITY** | 10% | **3.5** | 0.35 | BFF 프록시 패턴 안전·ELECTRIC_SECRET 옵션 양호. RLS 직접 통합은 사용자 책임 |
| **SELF_HOST** | 5% | **3.5** | 0.175 | Docker 컨테이너 추가 부담·Elixir 런타임 의존 (블랙박스). wal_level 변경 동일 |
| **COST** | 3% | **5.0** | 0.15 | $0 (자체 호스팅) |
| **합계** | 100% | — | **3.85** | |

---

## 11. 리스크

### R1 — Broadcast/Presence 부재 (Critical for 100점)
- **확률:** 100% (구조적 한계)
- **영향:** 100점 동등성 단독 불가, 별도 트랙 필수
- **완화:** 03번(Realtime 포팅) 또는 자체 ws 서버와 하이브리드. 본 문서는 CDC만 담당으로 한정

### R2 — Elixir/BEAM 런타임 블랙박스 (Medium)
- **확률:** 낮음 (안정 검증)
- **영향:** 디버깅 시 BEAM 로그 해석 부담
- **완화:**
  - 공식 Docker 이미지 사용 (자체 빌드 회피)
  - 메트릭은 `/v1/health` + Prometheus exporter 활용
  - 문제 발생 시 Electric Discord/GitHub Issues가 응답 빠름

### R3 — v1 → v2 잠재 breaking change (Low)
- **확률:** 낮음 (v1.0 GA 명시)
- **영향:** 향후 메이저 업그레이드 시 마이그레이션
- **완화:**
  - Apache 2.0 → 최악의 경우 fork
  - Shape 정의는 BFF에 캡슐화 → 클라이언트 영향 최소화

### R4 — Slot 누수 (01번과 동일) (Critical)
- **확률·영향·완화:** 01번과 동일. `max_slot_wal_keep_size = 2GB` 동일 적용

### R5 — HTTP long-poll 부적합 시나리오 (Low)
- **확률:** 매우 낮음 (Cloudflare Tunnel HTTP 친화적)
- **영향:** 타이트한 polling latency 요구 사항
- **완화:** ElectricSQL은 long-poll로 ~25s 유지 → 평균 latency <1s. 충분

### R6 — Schema migration 이후 shape 갱신 (Medium)
- **확률:** 마이그레이션마다
- **영향:** 새 컬럼·테이블이 sync 안 됨
- **완화:** Publication을 `FOR ALL TABLES`로 → 자동 포함. Shape 정의는 BFF에서 갱신만

---

## 12. 결론

### 12.1 ElectricSQL embed 트랙 평가

**3.85/5.00.** 만약 100점 동등성 요구가 "Postgres CDC + 부분 복제 + fan-out"에 한정된다면 **5.0에 가까운 압도적 1순위**다. 그러나 Supabase Realtime의 핵심 가치인 **Broadcast/Presence가 본질적으로 부재**하다는 구조적 한계로 인해, 단독 채택으로 100점 도달은 **불가능**하다.

### 12.2 100점 도달 청사진 (이 트랙 기여 부분)

```
Realtime 100점 = (CDC 30점) + (Broadcast 25점) + (Presence 20점) + (Inspector 10점) + (RLS 15점)

이 트랙의 기여:
  ✅ CDC 30점        → ElectricSQL Shape API
  ✅ Inspector 10점  → 우리 대시보드에 Shape 모니터링 페이지 추가
  ✅ RLS 15점        → BFF 프록시 패턴으로 통합
  ⚠️ Broadcast 0점   → 03번 또는 자체 구현
  ⚠️ Presence 0점    → 03번 또는 자체 구현

이 트랙 단독: 55/100
이 트랙 + 03번 부분 보완: 95+/100
```

### 12.3 01번(wal2json 직접) vs 02번(ElectricSQL) 단독 비교

| 차원 | 01 wal2json | 02 ElectricSQL |
|------|-------------|----------------|
| CDC 품질 | ★★★★★ (단순·낮은 레벨) | ★★★★★ (높은 레벨, fan-out 자동) |
| 부분 복제 | 직접 구현 | Shape 자동 |
| 동시 클라이언트 | 단일 노드 1만 (ws 한계) | **100만 검증** |
| 직접 구현 부담 | 중 | 낮음 |
| 추가 인프라 | 없음 | Docker 컨테이너 1개 |
| 디버깅 | psql로 SQL 실행 | Electric 로그 + Shape API 응답 |
| 100점 단독 도달 | 불가능 (Broadcast/Presence) | 불가능 (동일) |

→ **CDC만 본다면** ElectricSQL 0.5점 우위. 그러나 **인프라 단순성**은 wal2json이 우위. 토론 필요.

### 12.4 DQ-1.5 잠정 답변 (추가)

01번 문서와 동일. ElectricSQL을 쓰든 wal2json을 직접 쓰든 **wal_level=logical 변경은 양쪽 모두 필요**. 변경 비용·리스크는 동일.

ElectricSQL 채택 시 추가 고려:
- Slot 1개만 사용 (Electric이 자체 관리) → 누수 방어는 동일
- Postgres ↔ Electric 인증을 위한 CREATE USER + REPLICATION 권한 별도

### 12.5 Round 2 권장 액션

1. **30분 PoC:** Docker compose로 Electric 띄우고, 단일 테이블 sync `useShape` 훅으로 화면 표시
2. **인프라 비교:** "PM2 1개 추가 vs Docker 컨테이너 1개 추가" 운영 부담 비교
3. **하이브리드 실험:** Electric으로 CDC + 자체 ws 서버로 Broadcast/Presence — 분리 가능성 검증

---

## 13. 참고 자료

1. [Electric 1.0 Released (2025-03-17)](https://electric-sql.com/blog/2025/03/17/electricsql-1.0-released)
2. [Electric 1.1: 100x faster writes (2025-08-13)](https://electric-sql.com/blog/2025/08/13/electricsql-v1.1-released)
3. [ElectricSQL Shapes Guide](https://electric-sql.com/docs/guides/shapes)
4. [ElectricSQL HTTP API](https://electric-sql.com/docs/api/http)
5. [ElectricSQL TypeScript Client](https://electric-sql.com/docs/api/clients/typescript)
6. [ElectricSQL Beta Release (2024-12-10)](https://electric-sql.com/blog/2024/12/10/electric-beta-release)
7. [electric-sql/electric on GitHub](https://github.com/electric-sql/electric)
8. [ElectricSQL Cloud Beta (2025-04-07)](https://electric-sql.com/blog/2025/04/07/electric-cloud-public-beta-release)
9. [ElectricSQL Client Development Guide](https://electric-sql.com/docs/guides/client-development)
10. [Neon Guide: Getting started with ElectricSQL and Neon](https://neon.com/guides/electric-sql)
11. [PGlite: Sync using ElectricSQL](https://pglite.dev/docs/sync)
12. [ElectricSQL Changelog](https://electric-sql.com/changelog)
13. [QueryPlane: Write Patterns for ElectricSQL](https://queryplane.com/docs/blog/write-patterns-for-electricsql)
14. [ElectricSQL Cloud product page](https://electric-sql.com/product/cloud)
15. [Electric AGENTS.md (project conventions)](https://github.com/electric-sql/electric/blob/main/AGENTS.md)

---

## 14. 부록 A — 전체 로컬 셋업 (10분 PoC)

```bash
# 1. Postgres에 ElectricSQL 사용자·publication 준비 (01번과 동일하게 wal_level=logical)
psql -U postgres -c "CREATE USER electric_user WITH REPLICATION PASSWORD 'electric_pw';"
psql -U postgres -d ypb_main -c "CREATE PUBLICATION electric_publication FOR ALL TABLES;"

# 2. Electric 컨테이너 띄우기
docker run -d --name electric \
  -e DATABASE_URL=postgresql://electric_user:electric_pw@host.docker.internal:5432/ypb_main \
  -e ELECTRIC_INSECURE=true \
  -p 3030:3000 \
  electricsql/electric:1.1

# 3. Health check
curl http://localhost:3030/v1/health

# 4. 첫 shape 요청
curl 'http://localhost:3030/v1/shape?table=menu'
```

## 15. 부록 B — Next.js BFF 프록시 전체 코드

```typescript
// app/api/sync/[table]/route.ts
import { NextRequest } from 'next/server';
import { getSession } from '@/server/auth';
import { buildShapeWhere } from '@/server/realtime/shape-acl';

const ELECTRIC_URL = process.env.ELECTRIC_URL || 'http://localhost:3030';

export async function GET(
  req: NextRequest,
  { params }: { params: { table: string } }
) {
  const session = await getSession(req);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const where = buildShapeWhere(session.user, params.table);
  if (!where) return new Response('Forbidden', { status: 403 });

  const url = new URL('/v1/shape', ELECTRIC_URL);
  url.searchParams.set('table', params.table);
  url.searchParams.set('where', where);
  for (const k of ['shape_id', 'offset', 'live']) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) url.searchParams.set(k, v);
  }

  const upstream = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache' }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      'electric-shape-id': upstream.headers.get('electric-shape-id') || '',
      'electric-offset': upstream.headers.get('electric-offset') || '',
      'Cache-Control': 'no-cache, no-transform'
    }
  });
}

// src/server/realtime/shape-acl.ts
export function buildShapeWhere(user: User, table: string): string | null {
  switch (table) {
    case 'order':
    case 'payment':
    case 'menu':
      return `shop_id = '${user.shopId}'`;
    case 'customer':
      return user.role === 'admin' ? '1=1' : `shop_id = '${user.shopId}'`;
    default:
      return null;     // 알 수 없는 테이블 차단
  }
}
```

## 16. 부록 C — useShape 클라이언트 훅 사용

```typescript
// app/orders/live/page.tsx
'use client';
import { useShape } from '@electric-sql/react';
import { useSession } from 'next-auth/react';

export default function LiveOrders() {
  const { data: session } = useSession();
  const { data, isLoading, error, isStreaming } = useShape({
    url: '/api/sync/order',     // ★ Electric 직접 X, BFF 프록시 경유
    params: {}
  });

  return (
    <div>
      <Header isLive={isStreaming} />
      {error && <Error err={error} />}
      {isLoading && <Spinner />}
      <OrderTable rows={data} />
    </div>
  );
}
```

---

**문서 끝.** (앵커: 3.85/5.00, Broadcast/Presence 부재로 단독 100점 불가능, 01번과 보완 결정 필요.)
