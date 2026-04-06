# Supabase Realtime 완전 가이드

> 작성일: 2026-04-06  
> 대상: 개발자 / 아키텍트  
> 버전 기준: Supabase Realtime v2.x (2025 기준)

---

## 목차

1. [개요 및 아키텍처](#1-개요-및-아키텍처)
2. [핵심 기능: Postgres Changes](#2-핵심-기능-postgres-changes)
3. [핵심 기능: Broadcast](#3-핵심-기능-broadcast)
4. [핵심 기능: Presence](#4-핵심-기능-presence)
5. [Realtime Authorization (RLS 연동)](#5-realtime-authorization-rls-연동)
6. [내부 아키텍처 심층 분석](#6-내부-아키텍처-심층-분석)
7. [클러스터링 및 스케일링](#7-클러스터링-및-스케일링)
8. [사용 패턴 및 실전 예제](#8-사용-패턴-및-실전-예제)
9. [제한사항 및 쿼터](#9-제한사항-및-쿼터)
10. [성능 최적화](#10-성능-최적화)
11. [보안 고려사항](#11-보안-고려사항)
12. [트러블슈팅](#12-트러블슈팅)

---

## 1. 개요 및 아키텍처

### 1.1 Supabase Realtime이란

Supabase Realtime은 **Elixir/Phoenix 기반**으로 구축된 오픈소스 실시간 서버다. PostgreSQL 데이터베이스의 변경사항을 WebSocket을 통해 클라이언트에게 스트리밍하고, 클라이언트 간 메시지 브로드캐스트와 온라인 상태(Presence) 추적 기능을 제공한다.

공식 GitHub 저장소: [github.com/supabase/realtime](https://github.com/supabase/realtime)

### 1.2 왜 Elixir/Phoenix인가

PostgreSQL의 기본 `NOTIFY/LISTEN` 메커니즘은 8,000바이트 페이로드 제한이 있어 프로덕션급 실시간 기능에는 부적합하다. Supabase는 이 한계를 극복하기 위해 Elixir 기반 전용 서버를 구축했다.

**Elixir 선택 이유:**

| 특성 | 설명 |
|------|------|
| 경량 프로세스 | OS 스레드가 아닌 BEAM VM 프로세스 — 수백만 개 동시 실행 가능 |
| 저지연 메시징 | Erlang OTP의 Actor 모델 기반 메시지 패싱 |
| 결함 허용성 | Supervisor 트리로 프로세스 장애 자동 복구 |
| 수평 확장 | Erlang 분산 클러스터링 기본 내장 |
| Phoenix Channels | WebSocket 추상화 레이어 — PubSub 모델 제공 |

### 1.3 전체 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                    클라이언트 (브라우저/앱)               │
│         supabase-js / supabase-dart / realtime-js        │
└────────────────────┬────────────────────────────────────┘
                     │ WebSocket (wss://)
                     │
┌────────────────────▼────────────────────────────────────┐
│              Supabase Realtime Server                    │
│                  (Elixir/Phoenix)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Phoenix    │  │   Channel    │  │  Phoenix      │  │
│  │  Endpoint   │  │   Registry   │  │  PubSub       │  │
│  │  (WebSocket)│  │              │  │  (PG2 Adapter)│  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                   │          │
│  ┌──────▼────────────────▼───────────────────▼──────┐  │
│  │              Channel Extensions                   │  │
│  │  ┌─────────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │  Postgres   │ │Broadcast │ │   Presence    │  │  │
│  │  │  Changes    │ │          │ │               │  │  │
│  │  └──────┬──────┘ └──────────┘ └───────────────┘  │  │
│  └─────────┼─────────────────────────────────────────┘  │
└────────────┼────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│                   PostgreSQL Database                    │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │  WAL (Write-Ahead    │  │  walrus (WAL to JSON     │ │
│  │  Log) Logical        │  │  transformation +         │ │
│  │  Replication Slot    │  │  RLS application)         │ │
│  └──────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1.4 Realtime v2 아키텍처 변경사항 (2024)

2024년 Supabase는 v2 플랫폼 아키텍처로 마이그레이션을 완료했다. 핵심 변경점:

- **멀티테넌트 모델**: 단일 Realtime 인스턴스가 여러 프로젝트를 서비스
- **서비스 언번들링**: Storage, Realtime, 커넥션 풀러가 분리된 서비스로 독립
- **PostgreSQL 데이터베이스 리소스 확보**: Realtime 오버헤드를 DB에서 분리

---

## 2. 핵심 기능: Postgres Changes

### 2.1 개요

Postgres Changes는 PostgreSQL 데이터베이스의 INSERT, UPDATE, DELETE 이벤트를 실시간으로 클라이언트에 전달하는 CDC(Change Data Capture) 기능이다.

**작동 원리:**
1. Postgres가 WAL(Write-Ahead Log)에 변경사항 기록
2. Realtime 서버가 논리적 복제 슬롯(logical replication slot)을 통해 WAL 폴링
3. `walrus` 라이브러리가 WAL 항목을 JSON으로 변환 + RLS 필터 적용
4. 채널 구독 ID가 각 WAL 레코드에 추가됨
5. WebSocket을 통해 해당 클라이언트에 전달

### 2.2 Publication 설정

Postgres Changes를 사용하려면 Supabase 대시보드 또는 SQL로 publication을 활성화해야 한다.

```sql
-- 특정 테이블만 publication에 추가
ALTER PUBLICATION supabase_realtime ADD TABLE messages, notifications;

-- 모든 테이블 포함 (기본값이지만 성능 이슈 주의)
-- Supabase 대시보드 > Database > Replication에서 설정
```

### 2.3 기본 구독 패턴

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 단일 이벤트 구독
const channel = supabase
  .channel('db-changes')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',      // 'INSERT' | 'UPDATE' | 'DELETE' | '*'
      schema: 'public',
      table: 'messages',
    },
    (payload) => {
      console.log('새 메시지:', payload.new)
    }
  )
  .subscribe()

// 구독 해제
channel.unsubscribe()
```

### 2.4 필터링

```typescript
// 특정 행만 구독 (eq, neq, lt, lte, gt, gte, in 연산자 지원)
const channel = supabase
  .channel('filtered-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: 'room_id=eq.123',        // room_id가 123인 행만
    },
    (payload) => {
      console.log('변경사항:', payload)
    }
  )
  .subscribe()

// 복합 필터 (현재 AND 조건만 지원)
// filter: 'status=eq.active'
// filter: 'user_id=in.(1,2,3)'
```

**중요 주의사항:**
- `UPDATE` 이벤트 필터링 시, 기본적으로 Postgres는 WAL에 PK 컬럼만 포함
- PK가 아닌 컬럼으로 필터링하려면 `REPLICA IDENTITY FULL` 설정 필요:

```sql
-- PK 외 컬럼도 WAL에 포함 (성능 오버헤드 증가)
ALTER TABLE messages REPLICA IDENTITY FULL;
```

### 2.5 페이로드 구조

```typescript
// INSERT 페이로드
{
  schema: 'public',
  table: 'messages',
  commit_timestamp: '2025-01-15T10:30:00Z',
  eventType: 'INSERT',
  new: {
    id: 42,
    content: '안녕하세요',
    user_id: 'abc123',
    created_at: '2025-01-15T10:30:00Z'
  },
  old: {},
  errors: null
}

// UPDATE 페이로드
{
  schema: 'public',
  table: 'messages',
  commit_timestamp: '2025-01-15T10:31:00Z',
  eventType: 'UPDATE',
  new: { id: 42, content: '수정된 내용', ... },
  old: { id: 42 }  // REPLICA IDENTITY DEFAULT면 PK만 포함
}

// DELETE 페이로드
{
  schema: 'public',
  table: 'messages',
  commit_timestamp: '2025-01-15T10:32:00Z',
  eventType: 'DELETE',
  new: {},
  old: { id: 42 }  // 삭제된 행의 식별자
}
```

### 2.6 RLS와의 연동

Postgres Changes는 자동으로 RLS(Row Level Security)를 준수한다. 사용자는 자신이 SELECT 권한을 가진 행의 변경사항만 수신한다.

```sql
-- RLS 정책 예시: 자신의 메시지만 볼 수 있음
CREATE POLICY "users see own messages"
ON messages FOR SELECT
USING (user_id = auth.uid());

-- 이 정책이 있으면 Realtime도 동일하게 필터링됨
```

---

## 3. 핵심 기능: Broadcast

### 3.1 개요

Broadcast는 **데이터베이스를 거치지 않고** 클라이언트 간에 직접 메시지를 전달하는 기능이다. 임시(ephemeral) 메시지에 적합하며, DB에 저장할 필요 없는 빠른 이벤트 전달에 사용된다.

**특성:**
- 데이터베이스 부하 없음
- 최저 지연시간 (ms 단위)
- 클라이언트 → Realtime 서버 → 채널 내 모든 클라이언트
- 메시지 영속성 없음 (접속 중인 클라이언트만 수신)

### 3.2 기본 사용법

```typescript
// 채널 생성 및 Broadcast 구독
const channel = supabase.channel('game-room-1')

// 수신
channel.on(
  'broadcast',
  { event: 'player-move' },
  (payload) => {
    console.log('플레이어 이동:', payload.payload)
  }
)

// 채널 입장
await channel.subscribe()

// 발신 (구독 후에만 가능)
channel.send({
  type: 'broadcast',
  event: 'player-move',
  payload: {
    playerId: 'player-1',
    x: 100,
    y: 200,
    direction: 'right'
  }
})
```

### 3.3 Self-Broadcast 옵션

```typescript
// 자신이 보낸 메시지도 자신이 수신하도록 설정
const channel = supabase.channel('chat', {
  config: {
    broadcast: {
      self: true,   // 기본값: false
      ack: false,   // 서버 확인 응답 여부 (true이면 Promise 반환)
    }
  }
})
```

### 3.4 REST API를 통한 서버사이드 Broadcast

클라이언트 SDK 없이 서버에서 직접 메시지를 발송할 수 있다:

```typescript
// Next.js API Route 예시
const response = await fetch(
  `${SUPABASE_URL}/realtime/v1/api/broadcast`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: 'game-room-1',
          event: 'game-start',
          payload: { startTime: Date.now() }
        }
      ]
    })
  }
)
```

### 3.5 Broadcast Authorization

Authorization 기능(Public Beta)을 사용하면 `realtime.messages` 테이블의 RLS 정책으로 접근을 제어할 수 있다:

```sql
-- realtime.messages 테이블에 RLS 정책 추가
-- 특정 방의 멤버만 메시지를 보낼 수 있도록
CREATE POLICY "room members can broadcast"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = 'room:' || (
    SELECT id::text FROM rooms
    WHERE id = (payload->>'room_id')::uuid
    AND EXISTS (
      SELECT 1 FROM room_members
      WHERE room_id = rooms.id AND user_id = auth.uid()
    )
  )
);
```

---

## 4. 핵심 기능: Presence

### 4.1 개요

Presence는 여러 클라이언트의 **온라인 상태를 동기화**하는 기능이다. 누가 현재 온라인인지, 어디에 있는지, 무엇을 하고 있는지를 실시간으로 공유할 수 있다.

**내부 동작:**
- Phoenix Presence 라이브러리 기반
- CRDT(Conflict-free Replicated Data Type)를 사용하여 분산 상태 일관성 보장
- 각 클라이언트가 `presence_key`로 식별됨
- 연결 해제 시 자동으로 상태 제거 (TTL 기반)

### 4.2 기본 사용법

```typescript
const channel = supabase.channel('online-users')

// 상태 변경 이벤트 구독
channel
  .on('presence', { event: 'sync' }, () => {
    // 전체 상태 동기화 완료 시 호출
    const state = channel.presenceState()
    console.log('현재 온라인:', state)
  })
  .on('presence', { event: 'join' }, ({ key, newPresences }) => {
    // 새 사용자 입장
    console.log('입장:', key, newPresences)
  })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    // 사용자 퇴장
    console.log('퇴장:', key, leftPresences)
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      // 채널 입장 후 자신의 상태를 전송
      await channel.track({
        userId: 'user-123',
        username: '홍길동',
        status: 'online',
        cursor: { x: 0, y: 0 },
        joinedAt: new Date().toISOString()
      })
    }
  })

// 상태 업데이트
await channel.track({ cursor: { x: 150, y: 300 } })

// 상태 제거 (명시적 퇴장)
await channel.untrack()
```

### 4.3 Presence 상태 조회

```typescript
// 현재 채널의 모든 Presence 상태
const state = channel.presenceState()
// {
//   'user-123': [{ userId: 'user-123', username: '홍길동', ... }],
//   'user-456': [{ userId: 'user-456', username: '김철수', ... }],
// }

// 온라인 사용자 수
const count = Object.keys(state).length
```

### 4.4 협업 커서 구현 예시

```typescript
// 실시간 협업 커서 (Figma/Google Docs 스타일)
const collaborationChannel = supabase.channel('document-123')

collaborationChannel
  .on('presence', { event: 'sync' }, () => {
    const users = collaborationChannel.presenceState()
    renderCursors(users) // 모든 커서를 렌더링
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await collaborationChannel.track({
        userId: currentUser.id,
        name: currentUser.name,
        color: getRandomColor(),
        cursor: null
      })
    }
  })

// 마우스 이동 이벤트 throttle 처리 후 상태 업데이트
document.addEventListener('mousemove', throttle(async (e) => {
  await collaborationChannel.track({
    userId: currentUser.id,
    name: currentUser.name,
    color: userColor,
    cursor: { x: e.clientX, y: e.clientY }
  })
}, 50)) // 50ms throttle
```

---

## 5. Realtime Authorization (RLS 연동)

### 5.1 개요

Realtime Authorization은 **Public Beta** 상태의 기능으로, Broadcast와 Presence에 대한 접근을 RLS 정책으로 제어한다.

- **Postgres Changes**: 기존부터 테이블의 RLS 정책을 자동으로 준수
- **Broadcast/Presence**: `realtime.messages` 테이블의 RLS 정책으로 제어 (신규)

**요구사항:** supabase-js v2.44.0 이상

### 5.2 설정 방법

```typescript
// Authorization 활성화
const channel = supabase.channel('private-room', {
  config: {
    private: true  // Authorization 활성화
  }
})
```

```sql
-- realtime.messages 테이블에 RLS 활성화
-- (Supabase가 자동으로 설정하지만 정책은 직접 작성)

-- 읽기 정책: 인증된 사용자만 수신 가능
CREATE POLICY "authenticated users can receive"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE 'room:%');

-- 쓰기 정책: 특정 조건의 사용자만 발송 가능
CREATE POLICY "room members can send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM room_members
    WHERE room_id = (realtime.topic() SPLIT_PART ':', 2)::uuid
    AND user_id = auth.uid()
  )
);
```

### 5.3 Authorization 작동 방식

```
클라이언트가 채널 구독 요청
         │
         ▼
Realtime 서버가 DB에 RLS 확인 쿼리 실행
(realtime_connect 커넥션 사용)
         │
    ┌────▼────┐
    │ 허용?   │
    └────┬────┘
    허용  │  거부
         │
    ┌────▼────┐      ┌──────────────┐
    │채널 입장│      │오류 반환 후  │
    │정책 캐싱│      │연결 거부     │
    └────┬────┘      └──────────────┘
         │
    이후 메시지는 캐시된 정책으로 검증
    (매 메시지마다 DB 쿼리하지 않음)
```

**중요:** 연결 시점에 정책을 확인하고 캐싱하므로, 정책 변경은 기존 연결에 즉시 반영되지 않는다.

### 5.4 커넥션 수 설정

RLS 정책 확인 시 `realtime_connect` 앱 이름으로 DB에 연결한다. 기본값은 1개 커넥션이며, 채널 조인이 많을수록 더 많은 커넥션이 필요하다.

```
-- Supabase 지원팀에 문의하여 증가 가능
-- 설정은 postgres.conf 또는 환경변수로 관리
```

---

## 6. 내부 아키텍처 심층 분석

### 6.1 Phoenix Channels / WebSocket 프로토콜

**연결 흐름:**

```
1. 클라이언트: WebSocket 핸드셰이크
   GET /realtime/v1/websocket
   ?vsn=1.0.0&apikey=...&token=...

2. 서버: 101 Switching Protocols

3. 클라이언트: Phoenix 프로토콜로 채널 조인
   {"topic":"realtime:public:messages","event":"phx_join","payload":{...},"ref":1}

4. 서버: 채널 조인 확인
   {"topic":"realtime:public:messages","event":"phx_reply","payload":{"status":"ok"},"ref":1}

5. 서버 → 클라이언트: 이벤트 스트리밍
   {"topic":"realtime:public:messages","event":"INSERT","payload":{...},"ref":null}
```

**Phoenix 프로토콜 메시지 구조:**
```json
{
  "topic": "realtime:*",
  "event": "phx_join|phx_leave|phx_reply|phx_error|phx_close|[custom_event]",
  "payload": {},
  "ref": "1",
  "join_ref": "1"
}
```

**하트비트(Heartbeat):**
```typescript
// Phoenix 채널은 주기적으로 하트비트를 전송
// 클라이언트가 응답하지 않으면 연결을 종료
// supabase-js는 자동으로 처리 (기본 30초 간격)

// 수동 설정 예시
const supabase = createClient(URL, KEY, {
  realtime: {
    heartbeatIntervalMs: 30000,  // 30초
    reconnectAfterMs: (tries) => [1000, 2000, 5000, 10000][tries - 1] || 10000
  }
})
```

### 6.2 PostgreSQL WAL 기반 CDC

**WAL (Write-Ahead Log)이란:**

PostgreSQL은 모든 데이터 변경을 실제 적용 전에 WAL 파일에 먼저 기록한다. 이를 통해 장애 복구와 복제가 가능하다.

**논리적 복제 (Logical Replication):**

```
물리적 복제: 디스크 블록 수준의 바이너리 복사
논리적 복제: SQL 수준의 변경사항 (INSERT/UPDATE/DELETE) 전송
```

Supabase Realtime은 논리적 복제를 사용하며, 출력 플러그인으로 `pgoutput` 또는 `wal2json`을 지원한다.

**walrus 라이브러리:**

Supabase는 `walrus` (WAL Realtime Unified Security)라는 오픈소스 라이브러리를 개발했다. 이 라이브러리는:
- WAL 엔트리를 JSON으로 변환
- RLS 정책을 WAL 스트리밍 단계에서 적용
- 구독자별 필터링 수행

```
GitHub: github.com/supabase/walrus
```

**복제 슬롯 관리:**

```sql
-- 현재 복제 슬롯 확인
SELECT * FROM pg_replication_slots;

-- Supabase가 생성하는 슬롯 이름 패턴
-- supabase_realtime_replication_slot_{project_ref}
```

**복제 슬롯 주의사항:**
- 소비되지 않은 WAL이 계속 쌓이면 디스크 공간 부족 발생 가능
- Realtime 서버가 다운된 상태에서 DB 변경이 많으면 위험
- Supabase는 자동으로 슬롯 모니터링 및 관리

### 6.3 Phoenix PubSub 내부 동작

```
Phoenix.PubSub (PG2 adapter 기반)
    │
    ├─ 발행자(Publisher): WAL 변경사항 수신 후 토픽에 발행
    │  publish("realtime:public:messages", event_data)
    │
    └─ 구독자(Subscriber): 채널 프로세스들
       subscribe("realtime:public:messages")

Erlang process groups (pg2)를 통해 분산 노드 간 메시지 전달
```

**PG2 어댑터의 장점:**
- Erlang VM 내의 프로세스 그룹 활용
- 노드 간 자동 메시지 라우팅
- 메모리 내 브로드캐스트 (DB 부하 없음)

---

## 7. 클러스터링 및 스케일링

### 7.1 수평 확장 아키텍처

```
로드 밸런서 (Cloudflare / AWS ALB)
       │
       ├── Realtime Node 1 (Elixir)
       ├── Realtime Node 2 (Elixir)
       └── Realtime Node 3 (Elixir)
              │
              ├── Erlang 분산 클러스터 (libcluster)
              │   각 노드가 다른 노드의 PubSub에 구독
              │
              └── PostgreSQL (공유)
                  WAL 스트리밍은 단일 노드가 담당
```

### 7.2 Sticky Sessions

WebSocket은 상태가 있는(stateful) 연결이므로, 로드 밸런서에서 sticky sessions 설정이 필요하다. 클라이언트는 초기 연결된 노드와 세션을 유지해야 한다.

### 7.3 Realtime v2의 멀티테넌트 모델

```
기존 (v1): 프로젝트당 전용 Realtime 서버
새로운 (v2): 멀티테넌트 Realtime 클러스터

장점:
- 유휴 프로젝트의 리소스 절약
- 자동 스케일링 용이
- 운영 효율성 향상

주의:
- 노이지 네이버(Noisy Neighbor) 문제 가능성
- Supabase는 프로젝트별 쿼터로 제한
```

---

## 8. 사용 패턴 및 실전 예제

### 8.1 채팅 애플리케이션

```typescript
// 채팅방 컴포넌트 (Next.js + supabase-js)
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(URL, ANON_KEY)

export function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`)

    // 1. Postgres Changes: 새 메시지 실시간 수신
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message])
        }
      )
      // 2. Presence: 온라인 사용자 추적
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const users = Object.values(state).flat().map((p: any) => p.username)
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: currentUser.id,
            username: currentUser.username,
          })
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [roomId])

  const sendMessage = async (content: string) => {
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: currentUser.id,
      content
    })
    // Postgres Changes가 자동으로 다른 클라이언트에 전달
  }

  return (
    <div>
      <div>온라인: {onlineUsers.join(', ')}</div>
      <div>{messages.map(m => <div key={m.id}>{m.content}</div>)}</div>
      <input onKeyDown={e => {
        if (e.key === 'Enter') sendMessage((e.target as HTMLInputElement).value)
      }} />
    </div>
  )
}
```

### 8.2 실시간 대시보드

```typescript
// 서버 모니터링 대시보드
export function ServerDashboard() {
  const [metrics, setMetrics] = useState({
    cpu: 0,
    memory: 0,
    activeProcesses: 0
  })

  useEffect(() => {
    // Postgres Changes로 메트릭 테이블 구독
    const channel = supabase
      .channel('server-metrics')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'server_metrics',
          filter: 'server_id=eq.main-server'
        },
        (payload) => {
          setMetrics({
            cpu: payload.new.cpu_usage,
            memory: payload.new.memory_usage,
            activeProcesses: payload.new.process_count
          })
        }
      )
      .subscribe()

    return () => channel.unsubscribe()
  }, [])

  return <MetricsDisplay metrics={metrics} />
}
```

### 8.3 멀티플레이어 게임

```typescript
// 게임 상태 동기화 (Broadcast 사용 - DB 저장 불필요)
const gameChannel = supabase.channel('game-room-42', {
  config: { broadcast: { ack: false, self: false } }
})

gameChannel
  .on('broadcast', { event: 'player-action' }, ({ payload }) => {
    // 다른 플레이어의 액션 처리
    applyPlayerAction(payload)
  })
  .on('broadcast', { event: 'game-state' }, ({ payload }) => {
    // 호스트가 전송하는 권위적 게임 상태
    syncGameState(payload)
  })
  .subscribe()

// 플레이어 액션 전송 (매 프레임은 무리 — 이벤트 기반으로)
function onPlayerJump() {
  gameChannel.send({
    type: 'broadcast',
    event: 'player-action',
    payload: {
      action: 'jump',
      playerId: currentPlayerId,
      timestamp: Date.now()
    }
  })
}
```

### 8.4 협업 에디터

```typescript
// 실시간 협업 문서 편집기 (간소화 버전)
const docChannel = supabase.channel(`doc:${docId}`, {
  config: { broadcast: { self: true } }
})

// 커서 및 선택 영역 공유
docChannel
  .on('presence', { event: 'sync' }, () => {
    renderRemoteCursors(docChannel.presenceState())
  })
  .on('broadcast', { event: 'text-delta' }, ({ payload }) => {
    // Operational Transformation 또는 CRDT로 변경사항 적용
    applyDelta(payload.delta, payload.authorId)
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await docChannel.track({
        userId: currentUser.id,
        color: assignedColor,
        cursor: { line: 0, ch: 0 },
        selection: null
      })
    }
  })

// 텍스트 변경 시 Broadcast
editor.on('change', debounce((delta) => {
  docChannel.send({
    type: 'broadcast',
    event: 'text-delta',
    payload: { delta, authorId: currentUser.id }
  })
}, 16)) // ~60fps
```

### 8.5 알림 시스템

```typescript
// 사용자별 알림 스트림
const notificationChannel = supabase
  .channel(`notifications:${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      showNotification(payload.new)
      // 알림 뱃지 업데이트
      updateBadgeCount()
    }
  )
  .subscribe()
```

---

## 9. 제한사항 및 쿼터

### 9.1 플랜별 쿼터

| 항목 | Free | Pro | Enterprise |
|------|------|-----|------------|
| 동시 접속 (Peak Connections) | 200 | 500 | 커스텀 |
| 월간 메시지 수 | 2백만 | 5백만 | 커스텀 |
| 채널 수 | 100 | 1,000 | 커스텀 |
| 초당 채널 조인 | 100 | 500 | 커스텀 |

**초과 과금:**
- Peak Connections: 1,000개당 $10
- 메시지: 100만 건당 $2.50

### 9.2 기술적 제한사항

**메시지 크기:**
```
최대 페이로드 크기: 1MB (WebSocket 메시지 기준)
Postgres Changes 페이로드: WAL 레코드 크기에 의존
권장 최대 행 크기: 수 KB 이하
```

**연결 제한:**
```
초당 채널 조인: 플랜에 따라 제한
동시 채널 수 (단일 클라이언트): 제한 없음 (실용적으로 ~100개 권장)
WebSocket 연결 타임아웃: 없음 (하트비트 유지 시)
```

**지연시간:**
```
Broadcast: ~50ms (동일 리전)
Presence: ~100ms (동기화 포함)
Postgres Changes: ~200ms~1000ms (WAL 폴링 + 처리 시간)
```

**Postgres Changes 한계:**
```
- 논리적 복제는 DDL 변경(ALTER TABLE 등)을 구독할 수 없음
- 대량 BULK INSERT/UPDATE는 지연 발생 가능
- 필터는 단순 조건만 지원 (복잡한 JOIN 등 불가)
- TRUNCATE 이벤트 미지원 (DELETE 이벤트로 개별 행 삭제로 처리)
```

### 9.3 알려진 한계

```
1. 정렬 보장 없음
   - 메시지 순서는 보장되지 않음
   - 클라이언트에서 타임스탬프 기반으로 정렬 필요

2. 정확히 한 번 전달 (Exactly-once) 미보장
   - 네트워크 재연결 시 중복 수신 가능
   - 애플리케이션 레벨에서 멱등성 처리 필요

3. Presence 상태 한계
   - Presence는 연결된 클라이언트에만 동기화
   - 서버가 재시작되면 Presence 상태 초기화
```

---

## 10. 성능 최적화

### 10.1 채널 설계 원칙

```typescript
// ❌ 나쁜 패턴: 너무 광범위한 구독
const channel = supabase.channel('all-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, handler)

// ✓ 좋은 패턴: 필요한 범위로 좁힌 구독
const channel = supabase.channel(`room:${roomId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',  // 필요한 이벤트만
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${roomId}`  // 필요한 데이터만
    },
    handler
  )
```

### 10.2 구독 관리

```typescript
// React에서의 올바른 구독/해제 패턴
useEffect(() => {
  const channel = supabase.channel('my-channel')
    .on('postgres_changes', config, handler)
    .subscribe()

  // cleanup 함수에서 반드시 해제
  return () => {
    supabase.removeChannel(channel)
  }
}, [dependency])

// 여러 채널 일괄 관리
useEffect(() => {
  const channels = [
    supabase.channel('channel-1').on(...).subscribe(),
    supabase.channel('channel-2').on(...).subscribe(),
  ]

  return () => {
    channels.forEach(ch => supabase.removeChannel(ch))
  }
}, [])
```

### 10.3 Broadcast 최적화

```typescript
// ❌ 나쁜 패턴: 이벤트마다 전송 (마우스 움직임)
document.addEventListener('mousemove', (e) => {
  channel.send({ type: 'broadcast', event: 'cursor', payload: e })
})

// ✓ 좋은 패턴: throttle/debounce 적용
import { throttle } from 'lodash'

const sendCursor = throttle((e: MouseEvent) => {
  channel.send({
    type: 'broadcast',
    event: 'cursor',
    payload: { x: e.clientX, y: e.clientY }
  })
}, 50) // 초당 최대 20회

document.addEventListener('mousemove', sendCursor)
```

### 10.4 Postgres Changes 최적화

```typescript
// 1. 필요한 열만 선택 (현재 미지원 — 전체 행이 전달됨)
// 대신 DB 트리거로 경량 페이로드 생성하는 방법:

-- 변경 요약 테이블에 경량 이벤트 기록
CREATE OR REPLACE FUNCTION notify_message_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO realtime_events (table_name, event_type, record_id, changed_at)
  VALUES (TG_TABLE_NAME, TG_OP, NEW.id, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_realtime
AFTER INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION notify_message_change();

-- 클라이언트는 경량 이벤트만 구독 후, 필요 시 추가 조회
```

### 10.5 재연결 전략

```typescript
// supabase-js는 자동 재연결을 지원하지만 커스터마이징 가능
const supabase = createClient(URL, KEY, {
  realtime: {
    // 지수 백오프 재연결 전략
    reconnectAfterMs: (tries: number) => {
      return Math.min(1000 * Math.pow(2, tries), 30000)
    },
    // 타임아웃 설정
    timeout: 20000,
    // 로거
    logger: (kind, msg, data) => {
      if (kind === 'error') console.error('Realtime error:', msg, data)
    }
  }
})
```

### 10.6 DB 부하 모니터링

```sql
-- 복제 슬롯 지연 모니터링
SELECT
  slot_name,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS replication_lag_size,
  active
FROM pg_replication_slots
WHERE slot_type = 'logical';

-- 초과 지연 알림 (pg_cron으로 주기적 체크)
SELECT cron.schedule(
  'check-replication-lag',
  '*/5 * * * *',
  $$
  SELECT
    CASE WHEN pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) > 1073741824
    THEN pg_notify('alerts', 'Replication lag exceeds 1GB!')
    END
  FROM pg_replication_slots WHERE slot_name = 'supabase_realtime_slot';
  $$
);
```

---

## 11. 보안 고려사항

### 11.1 인증 토큰

```typescript
// JWT 토큰은 채널 연결 시 검증됨
// supabase-js가 자동으로 처리하지만, 수동 갱신도 가능

// 토큰 갱신 후 채널 재인증
supabase.realtime.setAuth(newToken)

// 또는 세션 변경 이벤트 감지
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') {
    supabase.realtime.setAuth(session?.access_token ?? null)
  }
})
```

### 11.2 RLS 강제 적용

```sql
-- Postgres Changes는 RLS를 자동 적용
-- 다음 설정이 필요:

-- 1. 테이블에 RLS 활성화
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 2. 적절한 SELECT 정책 생성
CREATE POLICY "users can see their messages"
ON messages FOR SELECT
USING (
  user_id = auth.uid() OR
  room_id IN (
    SELECT room_id FROM room_members WHERE user_id = auth.uid()
  )
);

-- 3. realtime publication에 테이블 추가
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### 11.3 민감 데이터 처리

```sql
-- 민감 컬럼 제외하는 방법: 뷰(View) 사용
CREATE VIEW messages_public AS
SELECT id, room_id, user_id, content, created_at
-- 내부 필드(ip_address, device_info 등)는 제외
FROM messages;

-- Realtime은 뷰가 아닌 테이블을 구독하므로,
-- DB 트리거로 별도 이벤트 테이블에 안전한 데이터만 기록하는 방법 사용
```

### 11.4 API 키 보안

```typescript
// anon key는 클라이언트에 노출 가능 (RLS로 제어됨)
// service_role key는 절대 클라이언트에 노출 금지

// ✓ 클라이언트 SDK
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // 노출 가능
)

// ✓ 서버사이드 Broadcast API 호출
// process.env.SUPABASE_SERVICE_ROLE_KEY  // 서버에서만 사용
```

---

## 12. 트러블슈팅

### 12.1 연결 문제

```typescript
// 채널 상태 모니터링
channel.subscribe((status, err) => {
  console.log('채널 상태:', status)
  // 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
  if (err) console.error('채널 오류:', err)
})

// 연결 상태 확인
const { data, error } = supabase.realtime.connect()
```

### 12.2 Postgres Changes 미수신

```
체크리스트:
☐ publication에 테이블이 추가되어 있는가?
  → Database > Replication 확인 또는:
  SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

☐ RLS 정책이 너무 제한적이지 않은가?
  → 해당 사용자가 SELECT 가능한가 확인

☐ 필터 컬럼이 WAL에 포함되어 있는가?
  → UPDATE 필터 시 REPLICA IDENTITY FULL 설정 여부

☐ 올바른 이벤트 타입을 구독하고 있는가?
  → 'INSERT'/'UPDATE'/'DELETE'/'*' 중 하나

☐ 복제 슬롯이 활성화되어 있는가?
  → SELECT * FROM pg_replication_slots;
```

### 12.3 성능 저하

```sql
-- 복제 지연 확인
SELECT
  slot_name,
  confirmed_flush_lsn,
  pg_current_wal_lsn(),
  pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
FROM pg_replication_slots;

-- 대용량 테이블에서 성능 개선
-- REPLICA IDENTITY FULL 사용을 최소화
-- 필터를 명확하게 설정
-- 이벤트 타입을 필요한 것만 구독
```

### 12.4 연결 수 초과

```
오류: "Too many concurrent connections"
해결:
1. 불필요한 채널 해제 확인 (cleanup 함수)
2. 컴포넌트 언마운트 시 unsubscribe 확인
3. React StrictMode에서 Effect 두 번 실행 이슈 확인
4. Supabase 대시보드에서 Peak Connections 모니터링
5. 필요 시 플랜 업그레이드 또는 지원팀 문의
```

---

## 참고 자료

- [Supabase Realtime 공식 문서](https://supabase.com/docs/guides/realtime)
- [Realtime 아키텍처](https://supabase.com/docs/guides/realtime/architecture)
- [Realtime GitHub](https://github.com/supabase/realtime)
- [Postgres Changes 문서](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Broadcast 문서](https://supabase.com/docs/guides/realtime/broadcast)
- [Realtime Authorization 블로그](https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization)
- [WALRUS GitHub](https://github.com/supabase/walrus)
- [Realtime 제한사항](https://supabase.com/docs/guides/realtime/limits)
- [Realtime 요금](https://supabase.com/docs/guides/realtime/pricing)
