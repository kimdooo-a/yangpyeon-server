# Supabase 실시간 기능 활용 패턴

> Wave 3 | 작성일: 2026-04-06 | 참고: Supabase Realtime 공식 문서 (2025 기준)

---

## 목차

1. [Postgres Changes 패턴](#1-postgres-changes-패턴)
2. [Broadcast 패턴](#2-broadcast-패턴)
3. [Presence 패턴](#3-presence-패턴)
4. [복합 패턴](#4-복합-패턴)
5. [성능 & 안정성](#5-성능--안정성)

---

## 개요

Supabase Realtime은 Elixir + Phoenix Framework 기반으로 구축된 WebSocket 서버다. 세 가지 핵심 기능을 제공한다:

| 기능 | 설명 | 주요 사용 사례 |
|------|------|---------------|
| **Postgres Changes** | DB 변경 사항 실시간 구독 | 데이터 동기화, 알림 |
| **Broadcast** | 클라이언트 간 메시지 발송 | 채팅, 커서 공유 |
| **Presence** | 접속 상태 공유 | 온라인 표시, 협업 |

**아키텍처 핵심**: 채널(Channel)은 클라이언트가 통신하는 "방(Room)"이다. 각 채널은 토픽 이름으로 식별되며, 공개(public) 또는 비공개(private)로 구분된다.

```
클라이언트 ──WebSocket──▶ Supabase Realtime 서버
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Postgres DB      Broadcast         Presence
        (WAL 스트림)    (pub/sub 메시지)   (상태 레지스트리)
```

---

## 1. Postgres Changes 패턴

PostgreSQL의 **WAL(Write-Ahead Log)** 을 파싱해 JSON 페이로드로 WebSocket을 통해 클라이언트에 전달한다.

### 1.1 기본 구독 설정

```typescript
// lib/supabase-realtime.ts
import { createClient, RealtimeChannel } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 특정 테이블의 모든 변경 구독
const channel = supabase
  .channel('todos-all-changes')
  .on(
    'postgres_changes',
    {
      event: '*',        // INSERT | UPDATE | DELETE | *
      schema: 'public',
      table: 'todos',
    },
    (payload) => {
      console.log('변경 감지:', payload)
      console.log('이벤트 타입:', payload.eventType)
      console.log('새 데이터:', payload.new)
      console.log('이전 데이터:', payload.old)
    }
  )
  .subscribe((status) => {
    console.log('구독 상태:', status)
    // SUBSCRIBED | TIMED_OUT | CLOSED | CHANNEL_ERROR
  })

// 정리 (컴포넌트 언마운트 시)
const cleanup = () => {
  supabase.removeChannel(channel)
}
```

### 1.2 이벤트별 필터링

```typescript
// INSERT만 구독
const insertChannel = supabase
  .channel('todos-inserts')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'todos' },
    (payload) => {
      const newTodo = payload.new as Todo
      console.log('새 할 일 추가:', newTodo)
    }
  )
  .subscribe()

// UPDATE만 구독
const updateChannel = supabase
  .channel('todos-updates')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'todos' },
    (payload) => {
      const updated = payload.new as Todo
      const previous = payload.old as Partial<Todo>
      console.log('변경 전:', previous)
      console.log('변경 후:', updated)
    }
  )
  .subscribe()

// DELETE만 구독
// ⚠️ DELETE는 filter 옵션 사용 불가 (Postgres 아키텍처 제약)
const deleteChannel = supabase
  .channel('todos-deletes')
  .on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'todos' },
    (payload) => {
      // payload.old에 삭제된 레코드의 old_record_id가 포함
      const deletedId = payload.old.id
      console.log('삭제된 ID:', deletedId)
    }
  )
  .subscribe()
```

### 1.3 고급 필터링 (컬럼 기반)

```typescript
// 특정 행만 구독 - eq 필터
const userTodosChannel = supabase
  .channel('user-todos')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'todos',
      filter: `user_id=eq.${currentUserId}`,  // eq, neq, lt, lte, gt, gte, in
    },
    (payload) => {
      console.log('내 할 일 변경:', payload)
    }
  )
  .subscribe()

// in 필터 - 여러 값 (최대 100개)
const teamChannel = supabase
  .channel('team-todos')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'todos',
      filter: `project_id=in.(${projectIds.join(',')})`,
    },
    (payload) => {
      console.log('팀 프로젝트 새 할 일:', payload.new)
    }
  )
  .subscribe()
```

### 1.4 단일 채널에서 다중 구독

```typescript
// 하나의 채널에서 여러 테이블 구독 (효율적)
const dashboardChannel = supabase
  .channel('dashboard-changes')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'messages' },
    (payload) => handleMessageChange(payload)
  )
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications' },
    (payload) => handleNewNotification(payload)
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'users' },
    (payload) => handleUserUpdate(payload)
  )
  .subscribe()
```

### 1.5 React Hook으로 캡슐화

```typescript
// hooks/use-realtime-table.ts
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

interface UseRealtimeTableOptions<T> {
  table: string
  event?: EventType
  filter?: string
  onInsert?: (record: T) => void
  onUpdate?: (newRecord: T, oldRecord: Partial<T>) => void
  onDelete?: (oldRecord: Partial<T>) => void
}

export function useRealtimeTable<T extends Record<string, unknown>>({
  table,
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeTableOptions<T>) {
  const [isConnected, setIsConnected] = useState(false)
  const supabase = createClient()

  const handleChange = useCallback(
    (payload: RealtimePostgresChangesPayload<T>) => {
      switch (payload.eventType) {
        case 'INSERT':
          onInsert?.(payload.new as T)
          break
        case 'UPDATE':
          onUpdate?.(payload.new as T, payload.old as Partial<T>)
          break
        case 'DELETE':
          onDelete?.(payload.old as Partial<T>)
          break
      }
    },
    [onInsert, onUpdate, onDelete]
  )

  useEffect(() => {
    const channelName = `${table}-${event}-${filter ?? 'all'}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, filter },
        handleChange
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, event, filter, handleChange, supabase])

  return { isConnected }
}

// 사용 예시
function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([])

  useRealtimeTable<Todo>({
    table: 'todos',
    filter: `user_id=eq.${userId}`,
    onInsert: (todo) => setTodos((prev) => [...prev, todo]),
    onUpdate: (updated) =>
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t))),
    onDelete: (deleted) =>
      setTodos((prev) => prev.filter((t) => t.id !== deleted.id)),
  })

  return <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
}
```

### 1.6 조인된 데이터 실시간 동기화

Postgres Changes는 단일 테이블만 반환하므로, 조인 데이터가 필요한 경우 변경 감지 후 별도 쿼리로 전체 데이터를 다시 불러온다.

```typescript
// hooks/use-realtime-with-join.ts
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MessageWithUser {
  id: string
  content: string
  created_at: string
  user: {
    id: string
    name: string
    avatar_url: string
  }
}

export function useMessagesWithUsers(roomId: string) {
  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const supabase = createClient()

  // 초기 데이터 로드 (조인 포함)
  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        user:users(id, name, avatar_url)
      `)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (data) setMessages(data as MessageWithUser[])
  }

  useEffect(() => {
    fetchMessages()

    // 메시지 변경 감지 → 해당 메시지만 재조회
    const channel = supabase
      .channel(`room-${roomId}-messages`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // 새 메시지: 조인된 데이터로 단건 조회
            const { data } = await supabase
              .from('messages')
              .select(`
                id, content, created_at,
                user:users(id, name, avatar_url)
              `)
              .eq('id', payload.new.id)
              .single()

            if (data) {
              setMessages((prev) => [...prev, data as MessageWithUser])
            }
          } else if (payload.eventType === 'UPDATE') {
            const { data } = await supabase
              .from('messages')
              .select(`
                id, content, created_at,
                user:users(id, name, avatar_url)
              `)
              .eq('id', payload.new.id)
              .single()

            if (data) {
              setMessages((prev) =>
                prev.map((m) => (m.id === payload.new.id ? (data as MessageWithUser) : m))
              )
            }
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  return { messages }
}
```

### 1.7 낙관적 업데이트 + 실시간 검증

```typescript
// hooks/use-optimistic-todos.ts
import { useState, useOptimistic, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Todo {
  id: string
  title: string
  completed: boolean
  created_at: string
}

type OptimisticAction =
  | { type: 'add'; todo: Todo }
  | { type: 'toggle'; id: string }
  | { type: 'delete'; id: string }

export function useOptimisticTodos(initialTodos: Todo[]) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [optimisticTodos, dispatchOptimistic] = useOptimistic(
    initialTodos,
    (state: Todo[], action: OptimisticAction) => {
      switch (action.type) {
        case 'add':
          return [...state, action.todo]
        case 'toggle':
          return state.map((t) =>
            t.id === action.id ? { ...t, completed: !t.completed } : t
          )
        case 'delete':
          return state.filter((t) => t.id !== action.id)
        default:
          return state
      }
    }
  )

  // 낙관적 추가
  const addTodo = async (title: string) => {
    const tempId = `temp-${Date.now()}`
    const tempTodo: Todo = {
      id: tempId,
      title,
      completed: false,
      created_at: new Date().toISOString(),
    }

    startTransition(() => {
      dispatchOptimistic({ type: 'add', todo: tempTodo })
    })

    try {
      const { error } = await supabase.from('todos').insert({ title })
      if (error) {
        console.error('추가 실패 - 롤백됨:', error)
        // React 낙관적 업데이트는 실패 시 자동 롤백
      }
    } catch (err) {
      console.error('네트워크 오류:', err)
    }
  }

  // 낙관적 토글
  const toggleTodo = async (id: string, currentCompleted: boolean) => {
    startTransition(() => {
      dispatchOptimistic({ type: 'toggle', id })
    })

    const { error } = await supabase
      .from('todos')
      .update({ completed: !currentCompleted })
      .eq('id', id)

    if (error) {
      console.error('업데이트 실패:', error)
      // 실패 시 원래 상태로 복원
    }
  }

  // 낙관적 삭제
  const deleteTodo = async (id: string) => {
    startTransition(() => {
      dispatchOptimistic({ type: 'delete', id })
    })

    const { error } = await supabase.from('todos').delete().eq('id', id)

    if (error) {
      console.error('삭제 실패:', error)
    }
  }

  return { optimisticTodos, addTodo, toggleTodo, deleteTodo, isPending }
}
```

---

## 2. Broadcast 패턴

**Broadcast**는 클라이언트 간 저지연 ephemeral 메시지를 전달한다. DB에 저장되지 않으며, 실시간 pub/sub으로 동작한다.

### 2.1 채팅 애플리케이션 (타이핑 인디케이터 포함)

```typescript
// components/chat/use-chat.ts
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
}

interface TypingUser {
  userId: string
  userName: string
}

export function useChat(roomId: string, currentUser: { id: string; name: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(`chat-room-${roomId}`, {
      config: {
        broadcast: {
          self: true,   // 본인 메시지도 수신 (즉시 UI 반영)
          ack: false,   // 전달 확인 불필요 (채팅은 비동기 OK)
        },
      },
    })

    // 메시지 수신
    channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      const msg = payload as ChatMessage
      setMessages((prev) => {
        // 중복 방지
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp)
      })
    })

    // 타이핑 인디케이터 수신
    channel.on('broadcast', { event: 'typing-start' }, ({ payload }) => {
      const { userId, userName } = payload as TypingUser
      if (userId === currentUser.id) return  // 본인 제외

      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === userId)) return prev
        return [...prev, { userId, userName }]
      })
    })

    channel.on('broadcast', { event: 'typing-stop' }, ({ payload }) => {
      const { userId } = payload as TypingUser
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId))
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel
      }
    })

    return () => {
      supabase.removeChannel(channel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [roomId, currentUser.id, supabase])

  // 메시지 전송
  const sendMessage = useCallback(
    async (content: string) => {
      if (!channelRef.current) return

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        userName: currentUser.name,
        content,
        timestamp: Date.now(),
      }

      await channelRef.current.send({
        type: 'broadcast',
        event: 'message',
        payload: message,
      })

      // 메시지 전송 후 타이핑 중지
      stopTyping()
    },
    [currentUser]
  )

  // 타이핑 시작 신호 (debounce 적용)
  const startTyping = useCallback(() => {
    if (!channelRef.current) return

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing-start',
      payload: { userId: currentUser.id, userName: currentUser.name },
    })

    // 3초 후 자동 타이핑 중지
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(stopTyping, 3000)
  }, [currentUser])

  const stopTyping = useCallback(() => {
    if (!channelRef.current) return

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing-stop',
      payload: { userId: currentUser.id },
    })

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
  }, [currentUser.id])

  return { messages, typingUsers, sendMessage, startTyping, stopTyping }
}
```

```typescript
// components/chat/ChatRoom.tsx
'use client'

import { useState } from 'react'
import { useChat } from './use-chat'

interface ChatRoomProps {
  roomId: string
  currentUser: { id: string; name: string }
}

export function ChatRoom({ roomId, currentUser }: ChatRoomProps) {
  const [input, setInput] = useState('')
  const { messages, typingUsers, sendMessage, startTyping } = useChat(roomId, currentUser)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    await sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.userId === currentUser.id ? 'justify-end' : 'justify-start'}`}
          >
            <div className="max-w-xs rounded-lg px-4 py-2 bg-gray-700 text-white">
              <p className="text-xs text-gray-400">{msg.userName}</p>
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 타이핑 인디케이터 */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-sm text-gray-400">
          {typingUsers.map((u) => u.userName).join(', ')}
          {typingUsers.length === 1 ? ' 님이 입력 중...' : ' 님들이 입력 중...'}
        </div>
      )}

      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              startTyping()
            }}
            placeholder="메시지를 입력하세요..."
            className="flex-1 bg-gray-800 rounded px-3 py-2 text-white"
          />
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  )
}
```

### 2.2 실시간 알림 시스템

```typescript
// lib/realtime/notifications.ts
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface AppNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: number
  read: boolean
}

// 서버에서 특정 사용자에게 알림 전송 (Server Action)
export async function sendNotificationToUser(
  userId: string,
  notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
) {
  const supabase = createClient()
  const channel = supabase.channel(`user-notifications-${userId}`)

  const result = await channel.send({
    type: 'broadcast',
    event: 'notification',
    payload: {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      read: false,
    } as AppNotification,
  })

  // 채널 정리 (일회성 전송)
  await supabase.removeChannel(channel)
  return result
}

// React Hook: 알림 수신
export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`user-notifications-${userId}`, {
        config: {
          broadcast: { ack: true }, // 전달 확인 활성화
        },
      })
      .on('broadcast', { event: 'notification' }, ({ payload }) => {
        const notification = payload as AppNotification

        setNotifications((prev) => [notification, ...prev].slice(0, 50)) // 최대 50개 유지
        setUnreadCount((prev) => prev + 1)

        // 브라우저 알림 (권한 있는 경우)
        if (Notification.permission === 'granted') {
          new Notification(notification.title, {
            body: notification.message,
            icon: '/favicon.ico',
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  return { notifications, unreadCount, markAsRead, markAllAsRead }
}
```

### 2.3 다중 사용자 에디터 (커서 위치 공유)

```typescript
// hooks/use-collaborative-editor.ts
import { useEffect, useRef, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { throttle } from '@/lib/utils'

interface RemoteCursor {
  userId: string
  userName: string
  color: string
  position: { line: number; column: number }
  selection?: { start: number; end: number }
}

interface TextOperation {
  userId: string
  type: 'insert' | 'delete'
  position: number
  content?: string
  length?: number
  timestamp: number
  version: number
}

export function useCollaborativeEditor(
  documentId: string,
  currentUser: { id: string; name: string; color: string }
) {
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map())
  const [remoteOperations, setRemoteOperations] = useState<TextOperation[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(`document-${documentId}`, {
      config: {
        broadcast: { self: false }, // 본인 커서는 로컬에서 직접 렌더링
      },
    })

    // 원격 커서 위치 수신
    channel.on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
      const cursor = payload as RemoteCursor
      setRemoteCursors((prev) => {
        const next = new Map(prev)
        next.set(cursor.userId, cursor)
        return next
      })
    })

    // 원격 텍스트 변경 수신
    channel.on('broadcast', { event: 'text-operation' }, ({ payload }) => {
      const operation = payload as TextOperation
      if (operation.userId !== currentUser.id) {
        setRemoteOperations((prev) => [...prev, operation])
      }
    })

    // 사용자 이탈 시 커서 제거
    channel.on('broadcast', { event: 'user-leave' }, ({ payload }) => {
      const { userId } = payload as { userId: string }
      setRemoteCursors((prev) => {
        const next = new Map(prev)
        next.delete(userId)
        return next
      })
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel
      }
    })

    return () => {
      // 이탈 신호 전송
      channelRef.current?.send({
        type: 'broadcast',
        event: 'user-leave',
        payload: { userId: currentUser.id },
      })
      supabase.removeChannel(channel)
    }
  }, [documentId, currentUser.id, supabase])

  // 커서 이동 전송 (throttle: 초당 최대 10회)
  const sendCursorMove = useCallback(
    throttle((position: { line: number; column: number }) => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cursor-move',
        payload: {
          userId: currentUser.id,
          userName: currentUser.name,
          color: currentUser.color,
          position,
        } as RemoteCursor,
      })
    }, 100),
    [currentUser]
  )

  // 텍스트 변경 전송
  const sendTextOperation = useCallback(
    (operation: Omit<TextOperation, 'userId' | 'timestamp'>) => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'text-operation',
        payload: {
          ...operation,
          userId: currentUser.id,
          timestamp: Date.now(),
        } as TextOperation,
      })
    },
    [currentUser.id]
  )

  return {
    remoteCursors: Array.from(remoteCursors.values()),
    remoteOperations,
    sendCursorMove,
    sendTextOperation,
  }
}
```

---

## 3. Presence 패턴

**Presence**는 채널 내 클라이언트들의 실시간 상태를 공유하고 동기화한다. 클라이언트가 연결을 끊으면 자동으로 상태가 제거된다.

### 3.1 온라인/오프라인 상태 추적

```typescript
// hooks/use-online-status.ts
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserPresence {
  userId: string
  userName: string
  avatarUrl?: string
  status: 'online' | 'away' | 'busy'
  lastSeen: string
}

export function useOnlineStatus(
  userId: string,
  userInfo: Omit<UserPresence, 'userId' | 'lastSeen'>
) {
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([])
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel('global-presence', {
      config: {
        presence: {
          key: userId,  // 사용자 고유 키로 중복 추적 방지
        },
      },
    })

    // sync: 전체 상태 재동기화 (초기 및 변경 시)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<UserPresence>()

      const users = Object.entries(state).flatMap(([key, presences]) =>
        presences.map((p) => ({ ...p, userId: key }))
      )

      setOnlineUsers(users)
    })

    // join: 새 사용자 입장
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log(`${key} 입장:`, newPresences)
    })

    // leave: 사용자 이탈
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log(`${key} 이탈:`, leftPresences)
    })

    // 구독 후 내 상태 등록
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return

      await channel.track({
        ...userInfo,
        userId,
        lastSeen: new Date().toISOString(),
      } as UserPresence)
    })

    // 페이지 비가시화 시 상태 변경
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        await channel.track({
          ...userInfo,
          userId,
          status: 'away',
          lastSeen: new Date().toISOString(),
        })
      } else {
        await channel.track({
          ...userInfo,
          userId,
          status: userInfo.status,
          lastSeen: new Date().toISOString(),
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      channel.untrack().then(() => supabase.removeChannel(channel))
    }
  }, [userId, supabase])

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
    isUserOnline: (targetUserId: string) =>
      onlineUsers.some((u) => u.userId === targetUserId),
  }
}
```

### 3.2 실시간 사용자 목록 컴포넌트

```typescript
// components/presence/OnlineUserList.tsx
'use client'

import { useOnlineStatus } from '@/hooks/use-online-status'

interface OnlineUserListProps {
  currentUserId: string
  currentUserName: string
  avatarUrl?: string
}

export function OnlineUserList({
  currentUserId,
  currentUserName,
  avatarUrl,
}: OnlineUserListProps) {
  const { onlineUsers, onlineCount } = useOnlineStatus(currentUserId, {
    userName: currentUserName,
    avatarUrl,
    status: 'online',
  })

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-sm font-medium text-gray-400 mb-3">
        온라인 ({onlineCount}명)
      </h3>
      <ul className="space-y-2">
        {onlineUsers.map((user) => (
          <li key={user.userId} className="flex items-center gap-2">
            {/* 아바타 */}
            <div className="relative">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.userName}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs">
                  {user.userName.charAt(0).toUpperCase()}
                </div>
              )}
              {/* 상태 표시 점 */}
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-800 ${
                  user.status === 'online'
                    ? 'bg-green-500'
                    : user.status === 'away'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
              />
            </div>

            <div>
              <p className="text-sm text-white">
                {user.userName}
                {user.userId === currentUserId && (
                  <span className="text-gray-500 ml-1">(나)</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                {user.status === 'online'
                  ? '온라인'
                  : user.status === 'away'
                  ? '자리 비움'
                  : '방해 금지'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### 3.3 방(Room) 기반 상태 관리

```typescript
// hooks/use-room-presence.ts
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface RoomParticipant {
  userId: string
  userName: string
  role: 'host' | 'participant' | 'viewer'
  joinedAt: string
  metadata?: Record<string, unknown>
}

export function useRoomPresence(roomId: string, currentUser: RoomParticipant) {
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [myPresenceKey, setMyPresenceKey] = useState<string>('')
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(`room-${roomId}`, {
      config: {
        presence: {
          key: currentUser.userId,
        },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<RoomParticipant>()
        const allParticipants = Object.entries(state).flatMap(([key, presences]) =>
          presences.map((p) => ({ ...p, userId: key }))
        )
        setParticipants(allParticipants)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const trackStatus = await channel.track(currentUser)
          setMyPresenceKey(trackStatus)
        }
      })

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [roomId, currentUser.userId, supabase])

  // 역할 변경
  const updateRole = useCallback(
    async (newRole: RoomParticipant['role']) => {
      const channel = supabase.channel(`room-${roomId}`)
      await channel.track({ ...currentUser, role: newRole })
    },
    [roomId, currentUser, supabase]
  )

  // 참가자 수 계산
  const hostCount = participants.filter((p) => p.role === 'host').length
  const participantCount = participants.filter((p) => p.role === 'participant').length
  const viewerCount = participants.filter((p) => p.role === 'viewer').length

  return {
    participants,
    totalCount: participants.length,
    hostCount,
    participantCount,
    viewerCount,
    isHost: participants.find((p) => p.userId === currentUser.userId)?.role === 'host',
    updateRole,
  }
}
```

---

## 4. 복합 패턴

### 4.1 Broadcast + Presence + Postgres Changes 조합

라이브 협업 에디터처럼 세 가지 기능을 함께 사용하는 패턴이다.

```typescript
// hooks/use-collaborative-room.ts
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface RoomState {
  // Presence: 접속자 목록
  participants: Array<{ userId: string; userName: string; cursor: number }>
  // Broadcast: 실시간 편집 중인 내용 (미저장)
  liveContent: string
  // Postgres Changes: 저장된 최신 내용
  savedContent: string
  lastSavedAt: string | null
}

export function useCollaborativeRoom(documentId: string, userId: string, userName: string) {
  const [state, setState] = useState<RoomState>({
    participants: [],
    liveContent: '',
    savedContent: '',
    lastSavedAt: null,
  })
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    const channel = supabase.channel(`collab-${documentId}`, {
      config: {
        presence: { key: userId },
        broadcast: { self: true },
      },
    })

    // 1) Presence: 참가자 추적
    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState<{
        userId: string
        userName: string
        cursor: number
      }>()
      const participants = Object.values(presenceState).flat()
      setState((prev) => ({ ...prev, participants }))
    })

    // 2) Broadcast: 실시간 타이핑 동기화
    channel.on('broadcast', { event: 'content-update' }, ({ payload }) => {
      const { content, senderId } = payload as { content: string; senderId: string }
      if (senderId !== userId) {
        setState((prev) => ({ ...prev, liveContent: content }))
      }
    })

    // 3) Postgres Changes: 저장 완료 이벤트
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'documents',
        filter: `id=eq.${documentId}`,
      },
      (payload) => {
        const doc = payload.new as { content: string; updated_at: string }
        setState((prev) => ({
          ...prev,
          savedContent: doc.content,
          lastSavedAt: doc.updated_at,
        }))
      }
    )

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = channel
        // 참가자로 등록
        await channel.track({ userId, userName, cursor: 0 })
      }
    })

    return () => {
      channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [documentId, userId, userName, supabase])

  // 내용 변경 시 Broadcast 전송
  const updateLiveContent = async (content: string) => {
    setState((prev) => ({ ...prev, liveContent: content }))

    await channelRef.current?.send({
      type: 'broadcast',
      event: 'content-update',
      payload: { content, senderId: userId },
    })
  }

  // DB에 저장 (Postgres Changes로 다른 참가자에게 전파)
  const saveContent = async (content: string) => {
    await supabase
      .from('documents')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', documentId)
  }

  return { state, updateLiveContent, saveContent }
}
```

### 4.2 이벤트 소싱 패턴

```typescript
// 이벤트 소싱: 모든 변경을 이벤트로 기록하고 재생 가능하게 구성
// lib/event-store.ts

interface DomainEvent {
  id: string
  aggregateId: string
  aggregateType: string
  eventType: string
  payload: Record<string, unknown>
  version: number
  occurredAt: string
  userId: string
}

export class EventStore {
  private supabase = createClient()

  // 이벤트 발행 (쓰기)
  async publishEvent(event: Omit<DomainEvent, 'id' | 'occurredAt'>): Promise<DomainEvent> {
    const { data, error } = await this.supabase
      .from('domain_events')
      .insert({
        ...event,
        id: crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // 이벤트 스트림 구독 (실시간)
  subscribeToAggregate(
    aggregateId: string,
    aggregateType: string,
    onEvent: (event: DomainEvent) => void
  ) {
    const channel = this.supabase
      .channel(`events-${aggregateType}-${aggregateId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'domain_events',
          filter: `aggregate_id=eq.${aggregateId}`,
        },
        (payload) => {
          onEvent(payload.new as DomainEvent)
        }
      )
      .subscribe()

    return () => this.supabase.removeChannel(channel)
  }

  // 집계 재구성 (이벤트 재생)
  async rehydrateAggregate<T>(
    aggregateId: string,
    reducer: (state: T, event: DomainEvent) => T,
    initialState: T
  ): Promise<T> {
    const { data: events } = await this.supabase
      .from('domain_events')
      .select('*')
      .eq('aggregate_id', aggregateId)
      .order('version', { ascending: true })

    return (events ?? []).reduce(reducer, initialState)
  }
}

// 사용 예시: 장바구니 이벤트 소싱
interface CartState {
  items: Array<{ productId: string; quantity: number; price: number }>
  total: number
}

const cartReducer = (state: CartState, event: DomainEvent): CartState => {
  switch (event.eventType) {
    case 'ITEM_ADDED':
      return {
        ...state,
        items: [...state.items, event.payload as CartState['items'][0]],
        total: state.total + (event.payload.price as number) * (event.payload.quantity as number),
      }
    case 'ITEM_REMOVED':
      const item = state.items.find((i) => i.productId === event.payload.productId)
      return {
        ...state,
        items: state.items.filter((i) => i.productId !== event.payload.productId),
        total: state.total - (item?.price ?? 0) * (item?.quantity ?? 0),
      }
    default:
      return state
  }
}
```

### 4.3 CQRS 패턴

```typescript
// CQRS: 쓰기(Command)와 읽기(Query)를 분리
// lib/cqrs/

// ─── Command Side (쓰기) ───
export class OrderCommandHandler {
  private supabase = createClient()

  async placeOrder(command: {
    userId: string
    items: Array<{ productId: string; quantity: number }>
  }) {
    // 트랜잭션으로 주문 생성 + 재고 감소
    const { data, error } = await this.supabase.rpc('place_order', {
      p_user_id: command.userId,
      p_items: command.items,
    })

    if (error) throw error
    return data
  }
}

// ─── Query Side (읽기) - 실시간 구독 포함 ───
export function useOrderQuery(userId: string) {
  const [orders, setOrders] = useState<Order[]>([])
  const supabase = createClient()

  useEffect(() => {
    // 초기 로드 (읽기 최적화된 뷰 사용)
    supabase
      .from('order_summary_view')  // 미리 조인된 뷰
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setOrders(data)
      })

    // 실시간 업데이트
    const channel = supabase
      .channel(`orders-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          // 읽기 뷰에서 최신 데이터 재조회
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const { data } = await supabase
              .from('order_summary_view')
              .select('*')
              .eq('id', payload.new.id)
              .single()

            if (data) {
              setOrders((prev) => {
                const exists = prev.some((o) => o.id === data.id)
                return exists
                  ? prev.map((o) => (o.id === data.id ? data : o))
                  : [data, ...prev]
              })
            }
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId, supabase])

  return { orders }
}
```

---

## 5. 성능 & 안정성

### 5.1 구독 관리 (cleanup & reconnect)

```typescript
// lib/realtime/channel-manager.ts
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * 채널 매니저: 중복 구독 방지 + 자동 재연결 관리
 */
export class ChannelManager {
  private channels = new Map<string, RealtimeChannel>()
  private supabase = createClient()

  subscribe(
    channelName: string,
    setup: (channel: RealtimeChannel) => RealtimeChannel,
    onStatusChange?: (status: string) => void
  ): () => void {
    // 이미 구독 중인 채널 재사용
    if (this.channels.has(channelName)) {
      console.warn(`채널 "${channelName}"이 이미 구독 중입니다.`)
      return () => this.unsubscribe(channelName)
    }

    const channel = this.supabase.channel(channelName)
    const configuredChannel = setup(channel)

    configuredChannel.subscribe((status, error) => {
      onStatusChange?.(status)

      if (status === 'CHANNEL_ERROR') {
        console.error(`채널 오류 [${channelName}]:`, error)
      }
    })

    this.channels.set(channelName, configuredChannel)

    return () => this.unsubscribe(channelName)
  }

  unsubscribe(channelName: string) {
    const channel = this.channels.get(channelName)
    if (channel) {
      this.supabase.removeChannel(channel)
      this.channels.delete(channelName)
    }
  }

  unsubscribeAll() {
    this.channels.forEach((_, name) => this.unsubscribe(name))
  }
}

// React Context로 전역 사용
// providers/realtime-provider.tsx
import { createContext, useContext, useRef } from 'react'

const RealtimeContext = createContext<ChannelManager | null>(null)

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef(new ChannelManager())

  return (
    <RealtimeContext.Provider value={managerRef.current}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useChannelManager() {
  const manager = useContext(RealtimeContext)
  if (!manager) throw new Error('RealtimeProvider 내부에서 사용해야 합니다')
  return manager
}
```

### 5.2 브라우저 백그라운드 처리 (Web Worker 하트비트)

```typescript
// Supabase Realtime 클라이언트 초기화 시 worker 옵션 설정
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        // Web Worker로 하트비트를 분리 → 브라우저 탭 백그라운드에서도 연결 유지
        worker: true,

        // 하트비트 콜백 (연결 상태 모니터링)
        heartbeatIntervalMs: 30000,
        reconnectAfterMs: (tries: number) => {
          // 지수 백오프: 1s, 2s, 4s, 8s, 최대 30s
          return Math.min(1000 * Math.pow(2, tries - 1), 30000)
        },
      },
    }
  )
}
```

### 5.3 메시지 손실 방지 전략

```typescript
// lib/realtime/reliable-broadcast.ts
/**
 * 메시지 확인 응답(ACK) 기반 신뢰성 있는 전송
 */
export async function sendReliableMessage(
  channel: RealtimeChannel,
  event: string,
  payload: Record<string, unknown>,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await channel.send({
        type: 'broadcast',
        event,
        payload: {
          ...payload,
          _messageId: crypto.randomUUID(),
          _attempt: attempt,
        },
      })

      if (response === 'ok') return true

      console.warn(`전송 실패 (시도 ${attempt}/${maxRetries}):`, response)
    } catch (err) {
      console.error(`전송 오류 (시도 ${attempt}/${maxRetries}):`, err)
    }

    // 재시도 전 대기 (지수 백오프)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }

  return false
}

/**
 * 메시지 큐: 오프라인 시 메시지 큐잉 후 재연결 시 일괄 전송
 */
export class MessageQueue {
  private queue: Array<{ event: string; payload: Record<string, unknown> }> = []
  private isOnline = navigator.onLine

  constructor(private channel: RealtimeChannel) {
    window.addEventListener('online', this.flush.bind(this))
    window.addEventListener('offline', () => { this.isOnline = false })
  }

  async enqueue(event: string, payload: Record<string, unknown>) {
    if (this.isOnline) {
      await sendReliableMessage(this.channel, event, payload)
    } else {
      this.queue.push({ event, payload })
      console.log(`오프라인 - 메시지 큐에 추가 (${this.queue.length}개 대기 중)`)
    }
  }

  private async flush() {
    this.isOnline = true
    console.log(`온라인 복구 - ${this.queue.length}개 메시지 전송 중...`)

    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      await sendReliableMessage(this.channel, item.event, item.payload)
    }
  }

  destroy() {
    window.removeEventListener('online', this.flush.bind(this))
  }
}
```

### 5.4 Throttle/Debounce 패턴

```typescript
// lib/utils/throttle-debounce.ts

/**
 * Throttle: 최대 N밀리초에 1번만 실행 (커서 이동, 스크롤)
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0

  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCallTime >= limitMs) {
      lastCallTime = now
      fn(...args)
    }
  }
}

/**
 * Debounce: 마지막 호출로부터 N밀리초 후에 실행 (타이핑, 검색)
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, delayMs)
  }
}

// 사용 예시: Realtime에서의 throttle/debounce
const throttledCursorMove = throttle(
  (channel: RealtimeChannel, position: { x: number; y: number }) => {
    channel.send({
      type: 'broadcast',
      event: 'cursor-move',
      payload: position,
    })
  },
  50  // 초당 최대 20번 (50ms 간격)
)

const debouncedSearch = debounce(
  async (channel: RealtimeChannel, query: string) => {
    channel.send({
      type: 'broadcast',
      event: 'search-query',
      payload: { query },
    })
  },
  300  // 300ms 입력 없으면 전송
)
```

### 5.5 대규모 채널 처리 전략

```typescript
/**
 * 대규모 Realtime 최적화 가이드
 *
 * 1. Postgres Changes 대신 Broadcast 사용 권장
 *    - Postgres Changes: WAL 파싱 → 모든 구독자에게 권한 확인 필요 → 확장성 낮음
 *    - Broadcast: 단순 메시지 릴레이 → 확장성 높음
 *
 * 2. 채널 수 최소화
 *    - Bad:  각 채팅방마다 별도 채널 (방 수 × 사용자 수 = 채널 폭발)
 *    - Good: 사용자당 하나의 채널 + 토픽으로 구분
 */

// 사용자당 단일 채널 패턴
export function useUserChannel(userId: string) {
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`user-${userId}`)  // 사용자당 1개 채널
      .on('broadcast', { event: 'notification' }, handleNotification)
      .on('broadcast', { event: 'message' }, handleMessage)
      .on('broadcast', { event: 'system' }, handleSystem)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId, supabase])
}

/**
 * 연결 수 최적화
 * - Nano/Micro 티어: 동시 채널 수 제한 주의
 * - 비활성 채널은 즉시 제거 (removeChannel)
 * - Presence는 인원 수 비례 부하 → 대규모 방에선 주의
 */
const CONNECTION_LIMITS: Record<string, number> = {
  nano: 200,
  micro: 500,
  small: 1000,
  medium: 3000,
  large: 5000,
}
```

### 5.6 연결 상태 모니터링 컴포넌트

```typescript
// components/realtime/ConnectionStatus.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export function ConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('health-check')
      .subscribe((realtimeStatus) => {
        switch (realtimeStatus) {
          case 'SUBSCRIBED':
            setStatus('connected')
            break
          case 'TIMED_OUT':
          case 'CLOSED':
            setStatus('disconnected')
            break
          case 'CHANNEL_ERROR':
            setStatus('error')
            break
          default:
            setStatus('connecting')
        }
      })

    return () => supabase.removeChannel(channel)
  }, [supabase])

  const statusConfig = {
    connecting: { color: 'bg-yellow-500', label: '연결 중...' },
    connected: { color: 'bg-green-500', label: '실시간 연결됨' },
    disconnected: { color: 'bg-gray-500', label: '연결 끊김' },
    error: { color: 'bg-red-500', label: '연결 오류' },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className={`w-2 h-2 rounded-full ${config.color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      {config.label}
    </div>
  )
}
```

---

## 요약 및 선택 가이드

| 사용 사례 | 권장 기능 | 이유 |
|-----------|-----------|------|
| DB 변경 반영 (소규모) | Postgres Changes | 설정 간단, 자동 인증 |
| 채팅/알림 (대규모) | Broadcast | 확장성 우수 |
| 협업 도구 커서 | Broadcast + Throttle | 고빈도 이벤트 최적화 |
| 온라인 사용자 표시 | Presence | 자동 해제/재연결 관리 |
| 라이브 협업 에디터 | Broadcast + Presence + Postgres Changes | 완전한 실시간 동기화 |
| 감사 로그/이벤트 기록 | 이벤트 소싱 + Postgres Changes | 히스토리 재생 가능 |

---

*참고 문서*:
- [Supabase Realtime 공식 문서](https://supabase.com/docs/guides/realtime)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Presence](https://supabase.com/docs/guides/realtime/presence)
- [Realtime 개념 및 한계](https://supabase.com/docs/guides/realtime/concepts)
