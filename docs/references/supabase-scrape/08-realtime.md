---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: realtime
---

# 08. Realtime

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Realtime
Tools
Inspector
Configuration
Policies
Settings

Join a channel

Role
service role

Start listening

Filter messages
Create realtime experiences
Send your first realtime message from your database, application code or edge function

Set up realtime for me
1 Broadcast messages
Send messages to a channel from your client application or database via triggers.

Create a trigger
2 Write policies
Set up Row Level Security policies to control who can see messages within a channel

Write a policy
3 Subscribe to a channel
Receive realtime messages in your application by listening to a channel

Documentation
```

## 드러난 UI / 기능 목록

- **Tools**: Inspector — 채널을 직접 join해서 메시지 확인
- **Configuration**: Policies — RLS for realtime
- **Settings** — Realtime 활성화/비활성화
- Inspector: `Join a channel` + Role 선택(`service role`) + `Start listening` + `Filter messages`
- 온보딩 3단계: **Broadcast → Policies → Subscribe**
- DB 트리거로부터 broadcast 가능 — "from your database, application code or edge function"

## 추론되는 기술 스택

- **supabase/realtime** (Elixir/Phoenix) — WebSocket 허브
- **3가지 메시지 소스**:
  1. 클라이언트 broadcast (`supabase.channel('ch').send()`)
  2. DB 트리거 → `pg_net` → realtime 서버
  3. Edge Function → realtime server push
- **RLS for Realtime**: 채널 구독·수신 권한을 정책으로 제어
- **Inspector**: 디버깅용 웹 클라이언트 (role 선택 → 직접 채널 join)
- **이 프로젝트로의 이식**:
  - 이미 SSE 기반(`/api/sse/logs`, `/api/metrics/stream`) 스트리밍 구현 완료
  - "Realtime Channels" 페이지는 **관리용 UI**: 채널 목록, 활성 구독자 수, broadcast 테스트 전송, 메시지 로그 표시
  - 백엔드는 Redis Pub/Sub or in-memory EventEmitter + 기존 SSE 응답에 채널 필터 추가
