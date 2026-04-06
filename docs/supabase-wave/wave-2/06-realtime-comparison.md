# Realtime 플랫폼 비교: Supabase Realtime vs Pusher vs Ably

> 작성일: 2026-04-06  
> 대상 독자: 실시간 기능 도입을 검토 중인 개발자/아키텍트  
> 출처: 공식 문서, 벤치마크, 2025-2026 기술 리뷰 종합

---

## 목차

1. [개요](#1-개요)
2. [아키텍처](#2-아키텍처)
3. [핵심 기능 비교](#3-핵심-기능-비교)
4. [DB 연동: Postgres Changes (Supabase 고유 기능)](#4-db-연동-postgres-changes)
5. [가격 비교](#5-가격-비교)
6. [성능](#6-성능)
7. [글로벌 인프라](#7-글로벌-인프라)
8. [의사결정 가이드](#8-의사결정-가이드)
9. [7항목 스코어링](#9-7항목-스코어링)
10. [결론](#10-결론)

---

## 1. 개요

실시간 기능은 현대 웹/모바일 앱의 핵심 요소입니다. 채팅, 알림, 협업 편집, 라이브 대시보드 등 다양한 사용 사례에서 WebSocket 기반 실시간 통신이 필요합니다. 이 문서는 가장 많이 비교되는 세 가지 플랫폼을 심층 분석합니다.

| 항목 | Supabase Realtime | Pusher Channels | Ably |
|------|-------------------|-----------------|------|
| 출시 연도 | 2020 | 2010 | 2013 |
| 핵심 포지셔닝 | BaaS 통합 실시간 | 빠른 WebSocket PubSub | 엔터프라이즈급 메시징 |
| 오픈소스 여부 | 서버 코드 공개 (MIT) | 클로즈드 소스 | 클로즈드 소스 |
| 주요 강점 | Postgres 변경 감지, Auth 통합 | 빠른 통합, 광범위한 SDK | 메시지 보장, 글로벌 엣지 |
| 주요 약점 | 단일 리전 제약, 고급 메시지 보장 미흡 | 메시지 순서 미보장, 이력 제한 | 가격 복잡성, 학습 곡선 |

---

## 2. 아키텍처

### 2.1 Supabase Realtime: Phoenix Channels + Elixir

Supabase Realtime은 **Elixir** 언어와 **Phoenix Framework** 위에 구축된 서버입니다. Elixir의 BEAM 가상 머신(Erlang VM)을 기반으로 하여, 경량 프로세스(Lightweight Processes)를 통해 수십만 개의 동시 연결을 효율적으로 처리합니다.

#### 핵심 구성 요소

```
클라이언트 (WebSocket)
       ↓
Phoenix Channel (RealtimeWeb.RealtimeChannel)
       ↓
┌──────────────────────────────────┐
│  세 가지 기능 공유 인프라          │
│  ┌──────────┐ ┌───────────────┐  │
│  │Broadcast │ │  Presence     │  │
│  └──────────┘ └───────────────┘  │
│  ┌──────────────────────────┐    │
│  │  Postgres Changes        │    │
│  │  (WAL → Replication Slot)│    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘
       ↓
PostgreSQL (논리 복제)
```

**Broadcast**: 클라이언트 → 서버 → 구독 클라이언트로 일대다 메시지 전달. 낮은 지연시간을 목표로 하며, 저장하지 않는 에페메럴(ephemeral) 메시지입니다.

**Presence**: 연결된 클라이언트의 상태를 추적하고 동기화합니다. Elixir의 Phoenix Presence 모듈을 사용하여 분산 노드 간 상태 공유를 처리합니다.

**Postgres Changes**: WAL(Write-Ahead Log) 기반 논리 복제를 사용하여 데이터베이스 변경사항(INSERT/UPDATE/DELETE)을 실시간으로 스트리밍합니다. RLS(Row Level Security) 정책을 통해 접근 제어가 적용됩니다.

#### 클러스터 구성

Supabase는 2~6개 노드 구성의 클러스터를 AWS 위에 배포합니다. 클러스터 내 모든 노드가 동일 리전에 위치하는 **단일 리전 모델**을 기본으로 합니다. 2025년 4월부터 데이터 API 요청에 대한 지역 기반 라우팅이 추가되었으나, Realtime 자체는 아직 Read Replica 또는 멀티 리전 라우팅을 완전히 지원하지 않습니다.

---

### 2.2 Pusher Channels: Pub/Sub 모델

Pusher는 전통적인 **Pub/Sub(발행-구독) 아키텍처**를 WebSocket 위에 구현한 서비스입니다. 2010년에 출시되어 실시간 WebSocket 서비스의 초기 선구자 중 하나입니다.

#### 핵심 개념

```
Publisher (API 호출)
       ↓
Pusher 서버 클러스터
  ├── 채널(Channel) 라우팅
  ├── 권한 검증 (Auth Server 콜백)
  └── 메시지 팬아웃
       ↓
구독자들 (WebSocket 연결)
```

**채널 유형**:
- **Public Channel**: 인증 없이 구독 가능
- **Private Channel**: 서버 사이드 권한 검증 필요
- **Presence Channel**: 연결된 사용자 목록 추적 가능

**아키텍처 특성**:
- 메시지는 RAM에만 존재하며 기본적으로 지속성(persistence) 없음
- 클라이언트 측에서 이벤트를 직접 트리거하는 Client Events 지원
- 메시지 순서는 같은 채널에서 보장되지 않음 (FIFO 미보장)
- AWS 기반 인프라, 주로 미국/유럽 리전 집중

#### 제한 사항

- 메시지 이력: 채널당 최근 100개 메시지만 캐시 (재연결 시 복구)
- 메시지 크기: 최대 10KB
- 채널당 최대 구독자: 100,000명
- 네트워크 단절 시 놓친 메시지 복구 메커니즘 없음

---

### 2.3 Ably: 분산 메시징 패브릭

Ably는 **엔터프라이즈급 분산 메시징**을 목표로 설계된 플랫폼입니다. 단순한 WebSocket PubSub을 넘어서, 금융, 게임, 협업 소프트웨어 등 메시지 손실이 용납되지 않는 환경을 위한 강력한 보장을 제공합니다.

#### 핵심 아키텍처

```
클라이언트 (WebSocket / SSE / Long Polling)
       ↓
AWS CloudFront (엣지, DDoS 보호)
       ↓
AWS EC2 NLB (리전별 로드 밸런서)
       ↓
Ably 리얼타임 패브릭
  ├── 주 코디네이터 (데이터센터 A)
  ├── 보조 코디네이터 (데이터센터 B)
  └── 지역 백업 (별도 리전)
       ↓
3중 복제 메시지 스토어
(최소 2개 데이터센터, 2개 리전)
```

**핵심 보장 메커니즘**:
- **메시지 지속성**: 게시자는 메시지가 2곳에 저장된 후에만 ACK를 받음
- **메시지 순서**: FIFO 순서로 채널 내 메시지 순서 보장
- **연결 복구**: 클라이언트 재연결 시 놓친 메시지 자동 복구 (최대 2분)
- **정확히 한 번 전달(Exactly-once)**: 구독자가 같은 메시지를 중복 수신하지 않음

**폴백 전송 지원**: WebSocket → SSE(Server-Sent Events) → XHR Streaming → Long Polling 순으로 자동 폴백하여 방화벽/프록시 환경에서도 연결 유지.

---

## 3. 핵심 기능 비교

### 3.1 채널(Channels)

| 기능 | Supabase Realtime | Pusher | Ably |
|------|-------------------|--------|------|
| 채널 유형 | 단일 (Topic 기반) | Public/Private/Presence | Public/Private/Presence |
| 채널당 구독자 수 | 제한 없음 (실질적 제한) | 100,000 | 제한 없음 |
| 채널 생성 방식 | 자동 (구독 시) | 자동 | 자동 |
| 채널 메타데이터 | 제한적 | 제한적 | 지원 (Channel Metadata API) |
| 점유(Occupancy) 정보 | 없음 | Presence 채널 한정 | 모든 채널 |
| 와일드카드 구독 | 없음 | 없음 | 지원 |

### 3.2 프레즌스(Presence)

| 기능 | Supabase Realtime | Pusher | Ably |
|------|-------------------|--------|------|
| 온라인 상태 추적 | 지원 | 지원 (Presence 채널) | 지원 |
| 커스텀 상태 데이터 | 지원 | 지원 | 지원 |
| 입장/퇴장 이벤트 | 지원 | 지원 | 지원 |
| 프레즌스 히스토리 | 없음 | 없음 | 없음 |
| 최대 Presence 구독자 | 200/채널 | 1,000/채널 | 설정 가능 |
| 분산 Presence | 클러스터 내부 | 클러스터 내부 | 글로벌 분산 |

### 3.3 메시지 히스토리(History)

| 기능 | Supabase Realtime | Pusher | Ably |
|------|-------------------|--------|------|
| 메시지 이력 지원 | 없음 | 있음 (최근 100개) | 있음 (최대 72시간) |
| 이력 보존 기간 | N/A | 캐시만 (지속성 없음) | 최대 72시간 (유료) |
| 재연결 시 복구 | 없음 | 없음 | 자동 복구 (최대 2분) |
| 이력 API | N/A | 있음 | 있음 |

### 3.4 메시지 보장(Message Delivery Guarantees)

| 기능 | Supabase Realtime | Pusher | Ably |
|------|-------------------|--------|------|
| 최소 한 번 전달(At-least-once) | 최선 노력 | 최선 노력 | 보장 |
| 정확히 한 번 전달(Exactly-once) | 없음 | 없음 | 지원 |
| ACK 메커니즘 | 없음 | 없음 | 있음 (2단계 확인) |
| 오프라인 클라이언트 메시지 큐 | 없음 | 없음 | 있음 |
| 메시지 손실 가능성 | 있음 | 있음 (재연결 시) | 거의 없음 |

### 3.5 메시지 순서 보장(Message Ordering)

| 기능 | Supabase Realtime | Pusher | Ably |
|------|-------------------|--------|------|
| 채널 내 순서 보장 | 부분적 | 보장 안 됨 | FIFO 보장 |
| 글로벌 순서 보장 | 없음 | 없음 | 채널 내 보장 |
| 타임스탬프 포함 | 없음 | 없음 | 있음 (서버 타임스탬프) |

---

## 4. DB 연동: Postgres Changes

### 4.1 Supabase Postgres Changes - 타 서비스에 없는 고유 기능

Supabase Realtime의 가장 차별화된 기능은 **PostgreSQL 데이터베이스 변경사항을 실시간으로 클라이언트에 스트리밍**하는 능력입니다. Pusher와 Ably는 이 기능을 기본 제공하지 않습니다.

#### 기술 구현 방식

```
PostgreSQL WAL (Write-Ahead Log)
       ↓
논리 복제 슬롯 (Logical Replication Slot)
       ↓
Supabase Realtime 서버 (Elixir)
  - WAL 레코드 폴링
  - 각 레코드에 구독 채널 ID 추가
  - RLS 정책 검사 (구독자별 접근 권한 확인)
       ↓
WebSocket → 해당 구독 클라이언트
```

#### 구독 예시 (JavaScript)

```javascript
const channel = supabase
  .channel('db-changes')
  .on(
    'postgres_changes',
    {
      event: '*',           // INSERT, UPDATE, DELETE, *
      schema: 'public',
      table: 'messages',
      filter: 'room_id=eq.1'
    },
    (payload) => {
      console.log('변경 감지:', payload)
    }
  )
  .subscribe()
```

#### RLS 통합

Postgres Changes는 Row Level Security(RLS) 정책과 완전히 통합됩니다. 각 변경 이벤트는 구독자마다 개별적으로 권한 검사를 수행합니다.

- **100명이 구독** 중인 테이블에 1건 INSERT → 100번의 RLS 검사 실행
- 접근 권한이 없는 구독자에게는 이벤트가 전달되지 않음
- **성능 주의**: 구독자 수가 많을수록 DB 부하가 선형적으로 증가

#### 지원 이벤트

| 이벤트 | 설명 |
|--------|------|
| `INSERT` | 새 행 삽입 시 |
| `UPDATE` | 행 업데이트 시 |
| `DELETE` | 행 삭제 시 |
| `*` | 모든 이벤트 |

#### Postgres Changes의 한계

1. **단일 스레드 처리**: 변경 순서 보장을 위해 단일 스레드로 처리 → 컴퓨트 업그레이드의 효과 제한
2. **RLS 성능**: 구독자 수 × DB 읽기 발생 → 대규모에서 병목
3. **복제 슬롯**: 슬롯 1개만 사용 → WAL 처리 병렬화 불가
4. **필터 제한**: 서버 사이드 필터는 `column=eq.value` 형태만 지원

#### Pusher/Ably에서 DB 변경 감지를 구현하려면

Pusher나 Ably를 사용할 경우 별도의 구현이 필요합니다:

```
방법 1: 애플리케이션 레이어 트리거
  API 서버 → (DB 쓰기) → Pusher/Ably API 호출
  단점: 코드 중복, 원자성 미보장

방법 2: DB 트리거 + 미들웨어
  PostgreSQL 트리거 → pg_notify → 미들웨어 서버 → Pusher/Ably
  단점: 추가 인프라 필요

방법 3: Change Data Capture (Debezium)
  PostgreSQL WAL → Debezium → Kafka → Pusher/Ably
  단점: 복잡성 및 운영 비용 급증
```

Supabase Realtime은 이 복잡한 파이프라인을 자동으로 처리해줍니다.

---

## 5. 가격 비교

### 5.1 Supabase Realtime 가격

Supabase Realtime은 Supabase 플랫폼 요금제 안에 포함됩니다.

| 요금제 | 월 비용 | 동시 연결 | 메시지 |
|--------|---------|-----------|--------|
| Free | $0 | 200개 | 200만 건/월 포함 |
| Pro | $25 | 500개 기본 | 500만 건/월 포함 |
| Team | $599 | 커스텀 | 커스텀 |
| Enterprise | 협의 | 무제한 | 무제한 |

**초과 요금 (Pro 이상)**:
- 동시 접속: 1,000 피크 연결당 **$10**
- 메시지: 100만 건당 **$2.50**
- 측정 방식: 청구 주기 내 최대(피크) 동시 연결 수 기준

**비용 장점**: Supabase의 DB, Auth, Storage, Realtime을 함께 사용하는 경우 별도 서비스 대비 비용 효율적입니다.

---

### 5.2 Pusher Channels 가격

| 요금제 | 월 비용 | 동시 연결 | 일일 메시지 |
|--------|---------|-----------|------------|
| Sandbox (무료) | $0 | 100개 | 20만 건/일 |
| Startup | $49 | 500개 | 1,000만 건/월 |
| Business | $499 | 2,000개 | 1억 건/월 |
| Enterprise | 협의 | 커스텀 | 커스텀 |

**메시지 카운팅 방식**: 1개 메시지를 50명 구독자에게 전송 시 = 51개 메시지로 카운팅 (publish 1 + deliver 50)

**비용 주의점**:
- 동시 접속 100명 초과 즉시 유료 전환 필요
- 일일 20만 건은 활성 앱에서 빠르게 소진
- 메시지 수 기반 카운팅으로 팬아웃이 많을수록 비용 급증

---

### 5.3 Ably 가격

Ably는 **분당 청구(per-minute)** 또는 **MAU(월간 활성 사용자)** 기반으로 청구합니다.

| 요금제 | 월 비용 | 동시 연결 | 월간 메시지 |
|--------|---------|-----------|------------|
| Free | $0 | 200개 | 600만 건 |
| Pay-as-you-go | 사용량 기반 | 초과 시 추가 | 초과 시 추가 |
| Pro | $29 | 커스텀 | 커스텀 |
| Enterprise | 협의 | 무제한 | 무제한 |

**초과 요금 (Pay-as-you-go)**:
- 메시지: 100만 건당 **$2.50**
- 동시 채널: 1,000개당 **$15.00**
- 동시 연결: 1,000개당 **$15.00**

**비용 특성**:
- 연결과 채널 수 모두 별도 과금 → 복잡한 사용 사례에서 비용 예측 어려움
- 엔터프라이즈 기능(99.999% SLA, 전용 지원)에 높은 프리미엄
- 메시지 히스토리, 복구 기능은 유료 플랜에서만 완전 지원

---

### 5.4 가격 비교 요약 (월 1만 동시 접속, 1억 메시지 기준)

| 서비스 | 예상 월 비용 |
|--------|-------------|
| Supabase Pro (초과 포함) | ~$120 ($25 + 연결 $90 + 메시지 초과분) |
| Pusher Business (초과 포함) | ~$999+ (Business 플랜 상한 초과) |
| Ably Pay-as-you-go | ~$250-400 (연결 + 채널 + 메시지) |

> 소규모(100 동시 접속, 월 500만 메시지): Supabase Free > Pusher Sandbox ≒ Ably Free

---

## 6. 성능

### 6.1 메시지 지연시간

| 지표 | Supabase Realtime | Pusher | Ably |
|------|-------------------|--------|------|
| 일반 메시지 지연 | < 100ms | < 100ms | < 50ms (글로벌) |
| Postgres Changes 지연 | 100-500ms (WAL 처리 포함) | N/A | N/A |
| P99 지연시간 | 공개 데이터 없음 | 공개 데이터 없음 | < 65ms (글로벌 측정치) |
| 네트워크 단절 복구 | 즉시 재연결 필요 | 즉시 재연결 필요 | 자동 (2분 내 재개) |

### 6.2 동시 접속 한도

| 서비스 | 무료 한도 | 유료 최대 | 기술적 한계 |
|--------|-----------|-----------|------------|
| Supabase Realtime | 200 | 수만 (컴퓨트 의존) | DB 부하에 비례 |
| Pusher | 100 | 수백만 (Enterprise) | 플랫폼 측 제한 없음 |
| Ably | 200 | 무제한 (확장) | 4M+ msg/sec 처리 검증 |

### 6.3 메시지 처리량

Ably는 공식적으로 피크 **초당 400만 메시지(4M msg/sec)** 처리 능력을 발표한 바 있습니다.

Supabase 공식 벤치마크는 k6 부하 테스트 기반으로:
- 2~6 노드 클러스터에서 **10,000+ WebSocket 동시 연결** 안정 처리
- 단일 클러스터 내 메시지 처리는 네트워크 및 Postgres 성능에 종속

Pusher는 구체적인 처리량 수치를 공개하지 않으나, 수십만 동시 연결을 지원하는 사례가 존재합니다.

### 6.4 Postgres Changes 성능 특수성

Supabase Postgres Changes는 일반 Broadcast와 다른 성능 특성을 가집니다:

- 변경 처리가 **단일 스레드**로 수행됨 → 컴퓨트 업그레이드 효과 제한적
- 100명 구독자 × 1 INSERT = DB에서 100번의 권한 검사(SELECT) 발생
- WAL 처리 지연이 추가되므로 순수 Broadcast보다 **100~400ms 추가 지연** 예상
- 고빈도 업데이트(초당 수십 건) + 많은 구독자 환경에서는 병목 발생 가능

---

## 7. 글로벌 인프라

### 7.1 Supabase Realtime

Supabase는 AWS 위에 구축되며, 프로젝트 생성 시 리전을 선택합니다.

**지원 리전 (2025 기준)**:
- 미국 동부 (N. Virginia), 서부 (Oregon)
- 유럽 (Frankfurt, London)
- 아시아 (Singapore, Tokyo, Sydney)
- 남미 (São Paulo)

**Realtime 제약사항**:
- Auth, Storage, Realtime은 Read Replica나 멀티 리전 라우팅 미지원
- 단일 프로젝트는 단일 리전에 종속
- 2025년 4월부터 Data API(PostgREST)에 지역 기반 라우팅 추가, 그러나 Realtime은 별도

**한국 사용자 권장**: `ap-northeast-1` (Tokyo) 또는 `ap-southeast-1` (Singapore) 선택.

---

### 7.2 Pusher

Pusher는 AWS 인프라를 기반으로 하며, 주요 리전에 클러스터를 운영합니다.

**지원 클러스터**:
- `mt1`: US East (N. Virginia)
- `us2`: US East (Ohio)
- `us3`: US West (Oregon)
- `eu`: Europe (Ireland)
- `ap1`: Asia Pacific (Singapore)
- `ap2`: Asia Pacific (Mumbai)
- `ap3`: Asia Pacific (Tokyo)
- `ap4`: Australia (Sydney)
- `sa1`: South America (São Paulo)

**엣지 네트워크**: Pusher는 독자적인 글로벌 엣지 네트워크보다는 AWS 리전 클러스터 모델 사용. 클라이언트는 가장 가까운 클러스터에 직접 연결.

**SLA**: 99.999% 가용성 (Enterprise), 기본 플랜은 99.9%.

---

### 7.3 Ably

Ably는 세 서비스 중 가장 광범위한 글로벌 인프라를 보유합니다.

**인프라 규모**:
- **7개 격리된 데이터센터** (미국, 유럽, 아시아태평양)
- **635개 엣지 가속 PoP(Points of Presence)**
- AWS CloudFront를 최외각 계층으로 활용하여 DDoS 보호 및 글로벌 엣지 배포

**데이터 복제 구조**:
```
메시지 발행
    ↓
주 코디네이터 (리전 내 DC-A) ←→ 보조 코디네이터 (리전 내 DC-B)
    ↓
원격 리전 백업 (별도 리전)
= 최소 3개 복사본, 최소 2개 DC, 최소 2개 리전
```

**라우팅 메커니즘**:
- DNS 기반 지연시간 라우팅 (Latency-based DNS routing)
- 헬스 체크를 통한 자동 장애 우회
- 클라이언트는 자동으로 가장 가까운 데이터센터로 연결

**성능 목표**:
- 글로벌 P50 지연시간: < 50ms
- 글로벌 P99 지연시간: < 65ms
- 최대 처리량: 4,000,000 msg/sec (피크 검증치)

---

## 8. 의사결정 가이드

### 8.1 Supabase Realtime을 선택해야 할 때

**강력 추천 조건**:
- 이미 Supabase를 DB/Auth로 사용 중인 경우
- PostgreSQL 변경 감지(INSERT/UPDATE/DELETE)를 실시간으로 클라이언트에 전달해야 하는 경우
- 별도의 실시간 인프라 운영 없이 BaaS 단일 플랫폼을 원하는 경우
- 비용 최소화가 최우선인 스타트업/개인 프로젝트
- 한국 또는 아시아 단일 사용자 기반 (단일 리전 제약 수용 가능)

**적합하지 않은 경우**:
- 메시지 손실이 절대 용납되지 않는 금융/의료 시스템
- 전 세계 분산 사용자 기반에서 50ms 미만 지연시간 요구
- 초당 수십만 건 이상의 고빈도 메시지 처리
- Postgres 미사용 환경에서 실시간만 필요한 경우

---

### 8.2 Pusher를 선택해야 할 때

**강력 추천 조건**:
- 빠른 MVP 개발이 필요하고 학습 곡선을 최소화하고 싶은 경우
- 메시지 손실이 허용 가능한 비크리티컬 피처 (예: 라이브 좋아요 카운트, 비중요 알림)
- 넓은 SDK 생태계(iOS, Android, 다양한 백엔드 언어) 활용이 중요한 경우
- 팀에 기존 Pusher 경험이 있는 경우
- 동시 접속 수가 500 이하인 중소 규모 앱

**적합하지 않은 경우**:
- 메시지 순서가 중요한 채팅/협업 도구
- 재연결 시 메시지 복구가 필요한 경우
- 글로벌 엣지 네트워크와 낮은 P99 지연시간이 필요한 경우
- 월 메시지 수가 1억 건을 초과하는 대규모 앱 (비용 급등)

---

### 8.3 Ably를 선택해야 할 때

**강력 추천 조건**:
- 메시지 손실이 비즈니스 크리티컬한 환경 (금융 거래, 의료 알림, 실시간 경매)
- 전 세계 분산 사용자 기반에서 최저 지연시간 요구
- 채팅, 협업 편집, 멀티플레이어 게임 등 메시지 순서가 중요한 앱
- 99.999% 가용성 SLA가 계약에 필요한 엔터프라이즈 환경
- 네트워크 품질이 불안정한 모바일 앱 (자동 폴백 및 재연결 복구)

**적합하지 않은 경우**:
- 소규모 프로젝트에서 복잡한 가격 구조 수용이 어려운 경우
- Supabase 생태계 내에서 DB 연동 실시간이 주요 요구사항인 경우
- 팀 규모가 작아 Ably의 풍부한 기능이 오히려 복잡성으로 작용하는 경우

---

### 8.4 규모별 의사결정 트리

```
[실시간 기능 필요]
      ↓
이미 Supabase 사용 중?
  ├─ YES → DB 변경 감지 필요?
  │          ├─ YES → [Supabase Realtime] (Postgres Changes 고유 기능)
  │          └─ NO  → 메시지 신뢰성 < 99.999%?
  │                    ├─ YES → [Supabase Realtime] (비용 효율)
  │                    └─ NO  → [Ably] (Supabase + Ably 혼용)
  │
  └─ NO → 동시 접속 예상 규모?
           ├─ < 500 → 빠른 MVP 필요?
           │            ├─ YES → [Pusher Sandbox/Startup]
           │            └─ NO  → [Supabase Realtime Free]
           ├─ 500-10K → 메시지 순서/손실 중요?
           │              ├─ YES → [Ably]
           │              └─ NO  → [Pusher Business 또는 Supabase Pro]
           └─ > 10K → 글로벌 분산 + 엔터프라이즈?
                         ├─ YES → [Ably Enterprise]
                         └─ NO  → [Supabase Pro + 최적화]
```

---

## 9. 7항목 스코어링

스코어: 1(최하) ~ 5(최상)

### 9.1 스코어 테이블

| 평가 항목 | Supabase Realtime | Pusher | Ably | 설명 |
|-----------|:-----------------:|:------:|:----:|------|
| **1. 개발자 경험 (DX)** | ★★★★★ (5) | ★★★★☆ (4) | ★★★☆☆ (3) | Supabase: 통합 BaaS로 별도 설정 최소. Pusher: SDK 성숙도 높음. Ably: 강력하지만 학습 곡선 |
| **2. 메시지 신뢰성** | ★★★☆☆ (3) | ★★★☆☆ (3) | ★★★★★ (5) | Ably만 정확히 한 번 전달 + 재연결 복구 보장 |
| **3. 성능 / 지연시간** | ★★★☆☆ (3) | ★★★★☆ (4) | ★★★★★ (5) | Ably: 글로벌 P50 < 50ms. Pusher: 단순 아키텍처로 빠름. Supabase: WAL 지연 포함 |
| **4. DB 연동 / 생태계** | ★★★★★ (5) | ★★☆☆☆ (2) | ★★☆☆☆ (2) | Supabase만 Postgres Changes 기본 지원 |
| **5. 가격 효율성** | ★★★★★ (5) | ★★★☆☆ (3) | ★★★☆☆ (3) | Supabase: BaaS 번들로 최고 효율. Pusher: 팬아웃 비용 급증. Ably: 복잡한 과금 |
| **6. 글로벌 인프라** | ★★☆☆☆ (2) | ★★★☆☆ (3) | ★★★★★ (5) | Ably: 635 PoP + 7 DC. Supabase: 단일 리전. Pusher: 9개 리전 클러스터 |
| **7. 확장성 / 엔터프라이즈** | ★★★☆☆ (3) | ★★★★☆ (4) | ★★★★★ (5) | Ably: 4M msg/sec 검증, 99.999% SLA. Pusher: 엔터프라이즈 트랙 레코드 있음 |

### 9.2 합산 및 사용 사례별 추천

| 합산 점수 | Supabase Realtime | Pusher | Ably |
|-----------|:-----------------:|:------:|:----:|
| 총점 (35점 만점) | **26** | **23** | **28** |
| BaaS 통합 프로젝트 | ★★★★★ 최적 | ★★☆☆☆ 비적합 | ★★★☆☆ 혼용 가능 |
| 빠른 MVP | ★★★★☆ 좋음 | ★★★★★ 최적 | ★★★☆☆ 복잡 |
| 엔터프라이즈 크리티컬 | ★★☆☆☆ 부족 | ★★★☆☆ 보통 | ★★★★★ 최적 |
| 글로벌 실시간 앱 | ★★☆☆☆ 부족 | ★★★☆☆ 보통 | ★★★★★ 최적 |

---

## 10. 결론

세 서비스는 각기 다른 사용 사례에 최적화되어 있습니다:

**Supabase Realtime**은 Supabase 생태계 내에서 개발하는 팀에게 압도적인 선택입니다. PostgreSQL 변경 감지라는 고유한 기능은 타 서비스로 대체하기 어렵고, 비용 효율도 뛰어납니다. 단, 글로벌 분산 성능과 고급 메시지 보장이 필요하다면 Ably를 병용하거나 대체하는 것을 고려해야 합니다.

**Pusher**는 빠른 프로토타이핑과 개발 속도가 중요한 팀에 적합합니다. 성숙한 SDK와 간단한 API로 가장 빠르게 실시간 기능을 추가할 수 있습니다. 다만, 메시지 순서 미보장과 재연결 시 메시지 손실 위험을 감수해야 합니다.

**Ably**는 메시지 신뢰성, 글로벌 성능, 엔터프라이즈 SLA가 필요한 프로젝트에 최적입니다. 세 서비스 중 기술적으로 가장 완성도 높은 플랫폼이지만, 복잡한 가격 구조와 높은 비용이 소규모 프로젝트에서는 장벽이 됩니다.

---

## 참고 자료

- [Ably: Pusher vs Supabase Realtime 비교 (2026)](https://ably.com/compare/pusher-vs-supabase)
- [Ably: Ably vs Supabase Realtime 비교 (2026)](https://ably.com/compare/ably-vs-supabase)
- [Supabase Realtime 공식 아키텍처 문서](https://supabase.com/docs/guides/realtime/architecture)
- [Supabase Realtime 공식 벤치마크](https://supabase.com/docs/guides/realtime/benchmarks)
- [Supabase Realtime 가격](https://supabase.com/docs/guides/realtime/pricing)
- [Pusher Channels 가격](https://pusher.com/channels/pricing/)
- [Ably 가격](https://ably.com/pricing)
- [Ably 글로벌 엣지 네트워크](https://ably.com/network)
- [Ably 메시지 순서 보장](https://ably.com/docs/platform/architecture/message-ordering)
- [Ably vs Pusher 기술 비교 (StackShare)](https://stackshare.io/stackups/ably-0-vs-pusher)
- [Supabase GitHub: Realtime](https://github.com/supabase/realtime)
