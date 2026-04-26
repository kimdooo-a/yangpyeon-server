# spike-006 — PG LISTEN/NOTIFY + SSE 정합성

> **유형**: 마이크로 스파이크 (조사 + 결정, 실험 코드 없음)
> **소요**: 30분
> **트리거**: ADR-030 (Messenger Domain & Phasing) 부속 결정 — Phase 2 진입 전 백본 한계 사전 측정
> **연관 ADR**: ADR-022 (tenant isolation), ADR-028 (worker pool), ADR-029 (RLS+observability)
> **세션**: 64 (2026-04-26)
> **판정**: ⚠️ Conditional Go (Phase 1은 in-memory bus 유지, Phase 2 진입 시 ADR-031 후속 작성 + 본격 측정 POC 필수)

---

## 1. 목표

`docs/research/messenger/milestones.md` M0.3 정의:

> Phase 2 백본 후보(PG LISTEN/NOTIFY)의 한계를 사전 측정하여, Phase 1(in-memory bus) 도중 백본 전환 비용 폭발을 회피한다.

3가지 질문을 조사 기반으로 답하고 Phase 2 진입 시 추가 검증이 필요한 항목을 명시한다.

---

## 2. 검증 항목 1 — NOTIFY payload 8KB 한계 + 메타 only 패턴 유효성

### 2.1 발견

- **하드 제약**: PostgreSQL NOTIFY payload는 **8000바이트 미만** (재구성 불가, 기본 설정 외 옵션 없음). PostgreSQL 18 문서 기준.
- **모든 production 시스템이 동일 패턴 채택**:
  - Rails ActionCable PostgreSQL adapter (PR #49634, 2024) — large payload 시 row_id로 fall back
  - Socket.IO PostgreSQL adapter — auxiliary table에 binary/oversized payload 저장 후 NOTIFY로 row_id 전송
  - Sequin (CDC tool) — 동일 권고

### 2.2 메신저 적용

메신저 메시지 메타 페이로드 추정:

```json
{ "convId": "ckwxyz...", "messageId": "ckwabc...", "kind": "TEXT", "tenantId": "default" }
```

- 평균 100~140 바이트 (UUID/cuid + enum 4종 + tenantId)
- 최악(첨부 5장 메시지의 메타라도) 200 바이트 미만
- **8000 바이트의 1.25~2.5%만 사용** → 2 orders of magnitude 여유

### 2.3 결정

✅ **메타-only NOTIFY 패턴 채택 확정**.

Phase 2 진입 시 트리거 SQL 패턴:

```sql
-- 메시지 INSERT 후 트리거에서 NOTIFY
CREATE OR REPLACE FUNCTION messenger_message_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'messenger:conv:' || NEW.conversation_id,
    json_build_object(
      'tenantId', NEW.tenant_id,
      'convId', NEW.conversation_id,
      'messageId', NEW.id,
      'kind', NEW.kind
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

수신자는 메타 받고 `prisma.message.findUnique({where: {id}})` 로 본문 조회. 이 패턴은 ADR-023 RLS와 호환 (수신자 세션이 자신의 tenant_id 컨텍스트 내에서 조회).

### 2.4 위험 및 보완

- **위험**: tenant 1개에서 분당 1000+ 메시지 시 fetch round-trip 부하 → mitigations:
  1. NOTIFY payload에 `senderId`, `createdAt` 포함 (총 200B 미만 가능) → UI는 메타만으로 envelope 표시 후 본문은 lazy fetch
  2. 채팅창 활성 사용자만 본문 fetch, 비활성 화면은 unread badge만 갱신
- **위험 측정 시점**: Phase 2 시작 시 부하 테스트 (M3 SSE 부하 테스트 시나리오 확장)

---

## 3. 검증 항목 2 — Cloudflare Tunnel SSE idle drop 빈도

### 3.1 발견

- **Cloudflare Free/Pro 100초 idle timeout** (확정 — 2024~2026 다수 보고):
  - 524 "A timeout occurred" 에러 발생 (≥120초 idle)
  - SSE GET 요청에서도 동일 적용
- **Cloudflare Quick Tunnel은 SSE buffering 이슈 별도** (cloudflared issue #1449, #199) — 하지만 named tunnel(우리 환경)은 영향 없음
- **이 프로젝트 환경에서 이미 검증됨** — `spike-002-sse-result.md` (2026-04-06, Go 판정) 에 SSE + Cloudflare Tunnel 통합 결과 존재

### 3.2 메신저 적용

`src/lib/realtime/bus.ts` 가 이미 SSE 전송 중. 메신저 추가 시 keepalive 정책만 보강:

```typescript
// 메신저 SSE keepalive 패턴 (M3에서 적용)
const KEEPALIVE_INTERVAL_MS = 30_000; // 30초 (Cloudflare 100초의 30%)

const keepaliveTimer = setInterval(() => {
  controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
}, KEEPALIVE_INTERVAL_MS);
```

클라이언트 측 자동 재연결 정책 (browser EventSource는 기본 3초 재연결):

```typescript
// useMessages 훅 내부
eventSource.onerror = () => {
  // 자동 재연결 시 last-event-id 헤더 활용 (M3에서 구현)
  // SQLite session_index에서 lastReadMessageId 기준으로 빈 메시지 catch-up
};
```

### 3.3 결정

✅ **기존 SSE 인프라 재사용 + 30초 keepalive 보강**.

Phase 1 추가 작업: **무**. M3 SSE 단계에서 keepalive 30초 + last-event-id 재연결 패턴 적용.

### 3.4 위험 및 보완

- **위험**: 1시간 idle 후 재연결 시 catch-up 메시지 폭발 (예: 1시간 동안 100개 메시지 유실) → mitigations:
  1. ConversationMember.lastReadMessageId 기반 cursor catch-up (M2 API 단계에서 구현, `/conversations/{id}/messages?after=<id>` 페이지네이션)
  2. SSE 재연결 시 5초 내 last-event-id 헤더로 미수신 이벤트 replay (옵션, Phase 2 검토)
- **위험**: Cloudflare Enterprise 플랜 미사용 → 100초 timeout 우회 불가. **현 환경에서 운영 가능 범위**: in-app 웹 채팅 (active 화면 = idle 안 됨), backgrounded 탭은 폴링 fallback 또는 push 통지로 보완.

---

## 4. 검증 항목 3 — 다중 채널 LISTEN connection pool 누수

### 4.1 발견 (가장 중요한 함정)

- **LISTEN은 connection-affixed**: 특정 connection에 등록되며, 그 connection이 살아있어야만 NOTIFY 수신. → **connection pool에서 임의 connection 사용 불가**.
- **PgBouncer transaction pooling 비호환** (PgBouncer issue #655, Odyssey #365 모두 미해결): NOTIFY/LISTEN은 **session pooling만 지원**. 우리는 현재 PgBouncer 미사용 (직접 PostgreSQL 16 연결) → 이슈 없음. 하지만 향후 PgBouncer 도입 시 session pool 분리 강제.
- **권장 패턴 (모든 production 사례 일치)**: **"단일 listener connection + 메모리 fan-out"**
  - Notifier 패턴 (brandur.org)
  - PgDog scaling 가이드
  - Socket.IO PG adapter
  - pg-listen npm 패키지 (Node.js)
- **메모리 누수 위험**: LISTEN connection이 long-running transaction 내에 들어가면 notification queue cleanup 불가 → queue 50% 도달 시 PostgreSQL 로그 경고. **대응**: listener connection은 항상 autocommit, transaction 진입 금지.

### 4.2 메신저 적용

ADR-028 (worker pool 옵션 D — hybrid)와 통합:

```
Node.js process (single listener)
  ├─ pg.Client (LISTEN 전용, autocommit, persistent)
  │   └─ LISTEN messenger:* (모든 채널 단일 connection)
  ├─ in-memory bus (현재 src/lib/realtime/bus.ts 그대로)
  │   ├─ tenant별 Map<channel, Set<SSE_writer>>
  │   └─ NOTIFY 수신 → tenant routing → fan-out
  └─ pg.Pool (CRUD/query 전용, 별도 풀)
```

### 4.3 채널 수 시나리오

milestones M0.3 시나리오:

| 채널 수 | 영향 | 평가 |
|--------|------|------|
| 10 | 활성 conv 10개 (소규모 운영) | ✅ 단일 connection 무리 없음 |
| 100 | 활성 conv 100개 (default tenant 성숙기) | ✅ 단일 connection 무리 없음, NOTIFY queue 정상 |
| 200 | 활성 conv 200개 (Phase 2 직전) | ⚠️ 측정 필요 — notification queue 처리 latency 증가 가능 |

**대안 패턴 (200+ 시나리오)**:
- 채널 그룹화: `messenger:tenant:<id>` 단일 채널 + payload에 convId 포함 → tenant당 1 채널 (1인 운영 N=20 → 20 채널)
- **추천 패턴** ✅ : tenant 단위 channel grouping이 1인 운영 BaaS 모델과 일치.

### 4.4 결정

✅ **단일 listener connection + tenant 단위 channel grouping**.

Phase 2 진입 시 ADR-031 작성 항목:

```
LISTEN messenger:tenant:default  -- tenant 1개당 1 채널
↓ NOTIFY payload: { convId, messageId, kind, senderId }
↓ Node.js 메모리 bus가 conversationId → SSE writer set 라우팅
↓ SSE writer가 권한 검증 후 클라이언트로 emit
```

### 4.5 위험 및 보완

- **위험 1**: listener connection drop (network blip) → notification 손실. **대응**: pg-listen 라이브러리의 reconnect + reconciliation 패턴 (재연결 후 `last_processed_message_id` 기반 catch-up).
- **위험 2**: notification queue 누적 (cleanup 실패) → PostgreSQL 디스크 사용량 증가. **대응**: listener autocommit 강제 + queue 모니터링 (`SELECT pg_notification_queue_usage()` 알람 80% 임계).
- **위험 3**: PM2 cluster:4 환경 (ADR-016c) → 4개 worker 각각 listener connection → connection 4배. **대응**: cluster:1 또는 Redis Pub/Sub 도입 결정 (Phase 2 ADR-031).

---

## 5. Phase 1 영향 (즉시 코딩 가능 여부)

| 항목 | Phase 1 적용 여부 | 비고 |
|------|------------------|------|
| 메타-only NOTIFY 패턴 | ❌ Phase 1 미사용 | Phase 1은 in-memory bus만 (단일 노드, ADR-030 옵션 C) |
| SSE keepalive 30초 | ✅ M3에서 적용 | 기존 인프라 재사용, 단순 보강 |
| last-event-id catch-up | ⚠️ 옵션 (M3 또는 Phase 2) | Phase 1은 ConversationMember.lastReadMessageId 기반 polling catch-up으로 충분 |
| 단일 listener connection 패턴 | ❌ Phase 2 진입 시 적용 | ADR-031에서 명문화 |

**결론**: Phase 1은 in-memory bus만으로 시작. 본 spike의 결과는 **Phase 2 진입 시 ADR-031 자료**로 보존.

---

## 6. Phase 2 진입 시 추가 측정 (POC 필수 항목)

마이크로 스파이크 한계 — 본 문서는 **조사 기반 예측**. 다음은 실측 POC 필수:

| # | 측정 항목 | 측정 방법 | Pass 기준 |
|---|----------|----------|----------|
| 1 | NOTIFY 처리 latency (분당 1000 msg) | pg_bench + Node 수신 시간 측정 | NOTIFY → SSE emit p95 < 50ms |
| 2 | listener connection 1시간 안정성 | systemd 또는 PM2 단일 프로세스 24h 운영 | reconnect 0회 또는 자동 재연결 5초 이내 |
| 3 | PM2 cluster 환경 동시 LISTEN | cluster:4 + 단일 LISTEN client 분리 | listener fork 1개 분리 시 정상 동작 |
| 4 | notification queue 80% 임계 | 부하 → `pg_notification_queue_usage()` 모니터링 | 80% 도달 후 자동 알람 + 수동 개입 가능 |
| 5 | PgBouncer 도입 시 session pool 분리 | session pool 1, transaction pool N | LISTEN connection이 session pool에 정확히 routing |

POC 위치: `spikes/sp-031-pg-notify-poc/` (Phase 2 시작 시 생성)

---

## 7. 결정 요약

| 질문 | 결정 | 시점 |
|------|------|------|
| 8KB 한계 회피? | 메타-only NOTIFY (~200B) | Phase 2 |
| Cloudflare 100초 idle? | 30초 keepalive (기존 SSE 패턴 유지) | M3 |
| 다중 채널 pool 누수? | 단일 listener + tenant 단위 channel grouping | Phase 2 |

**전체 판정**: ⚠️ **Conditional Go**
- Phase 1 영향: 무 (in-memory bus 그대로)
- Phase 2 진입 시: **POC 5건 (§6) 측정 필수** → ADR-031 작성 → 코드 전환

---

## 8. ADR-031 사전 골자 (Phase 2 진입 시 작성)

```markdown
# ADR-031 — Messenger Realtime Backbone: PG NOTIFY 전환

상태: PROPOSED (Phase 2 진입 시 ACCEPTED 또는 ALTERNATIVE)

## 결정
메신저 실시간 백본을 in-memory bus → PG LISTEN/NOTIFY로 전환한다.

## 근거 (spike-006-pg-notify-sse.md)
- 메타-only 패턴 검증됨
- Cloudflare 100초 timeout은 keepalive로 우회됨 (기존 spike-002와 동일)
- 단일 listener + tenant 단위 channel grouping이 1인 운영 N=20과 일치

## 대안
- Redis Pub/Sub: 추가 인프라 운영 부담 (1인 운영 모델과 충돌)
- in-memory bus 영구 유지: 다중 노드 확장 불가 (Phase 3 통화/E2E 작업 시 한계)
```

---

## 9. 산출물 등록

- `docs/research/_SPIKE_CLEARANCE.md`에 본 spike-006 엔트리 추가 (별도 작업)
- ADR 생성: 보류 (Phase 2 진입 시 ADR-031 작성, 본 spike가 자료로 인용됨)
- 다음 세션 인수인계서에서 본 spike 결과 인용

---

## 10. 출처

- [PostgreSQL: Documentation: 18: NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
- [PostgreSQL LISTEN/NOTIFY: The 8000-Byte Limit and the Meta-Only Pattern (Stacksync)](https://www.stacksync.com/blog/beyond-listen-notify-postgres-request-reply-real-time-sync)
- [Postgres adapter | Socket.IO](https://socket.io/docs/v4/postgres-adapter/)
- [ActionCable PostgreSQL adapter: support payloads larger than 8000 bytes (Rails PR #49634)](https://github.com/rails/rails/pull/49634)
- [Are SSE supported on Cloudflare? — Cloudflare Community](https://community.cloudflare.com/t/are-server-sent-events-sse-supported-or-will-they-trigger-http-524-timeouts/499621)
- [Server side events (SSE) is interrupted in approx 100s — Cloudflare Community](https://community.cloudflare.com/t/server-side-events-sse-is-interrupted-in-approx-100s/424548)
- [HTTP and Server-Sent Events · Cloudflare Agents docs](https://developers.cloudflare.com/agents/api-reference/http-sse/)
- [Scaling Postgres LISTEN/NOTIFY — PgDog](https://pgdog.dev/blog/scaling-postgres-listen-notify)
- [The Notifier Pattern for Applications That Use Postgres — brandur.org](https://brandur.org/notifier)
- [pg-listen — PostgreSQL LISTEN & NOTIFY for node.js (GitHub: andywer/pg-listen)](https://github.com/andywer/pg-listen)
- [Feature: Listen/Notify Support with Transaction Pooling (PgBouncer issue #655)](https://github.com/pgbouncer/pgbouncer/issues/655)
- [Using LISTEN and NOTIFY for Pub/Sub in PostgreSQL — Neon Guides](https://neon.com/guides/pub-sub-listen-notify)
- 기 프로젝트 spike: `docs/research/spikes/spike-002-sse-result.md` (SSE + Cloudflare Tunnel 검증, 2026-04-06)
