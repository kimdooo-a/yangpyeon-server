# 실시간 이벤트·로그 스트리밍 강화 방안

> Wave 2+3 리서치 문서 · 작성일: 2026-04-06
> 상위: [platform-evolution-wave README](../README.md)

---

## 목차

1. [현재 상태 분석](#1-현재-상태-분석)
2. [실시간 기술 비교](#2-실시간-기술-비교)
3. [로그 스트리밍 강화](#3-로그-스트리밍-강화)
4. [이벤트 시스템 설계](#4-이벤트-시스템-설계)
5. [SSE 구현 상세](#5-sse-구현-상세)
6. [Activity Feed UI](#6-activity-feed-ui)
7. [구현 로드맵](#7-구현-로드맵)
8. [성능 및 안정성 고려사항](#8-성능-및-안정성-고려사항)

---

## 1. 현재 상태 분석

### 1-1. 현재 폴링 구조

현재 대시보드의 모든 "실시간" 기능은 `setInterval + fetch` 폴링으로 구현돼 있다.

```typescript
// src/app/page.tsx — 시스템 메트릭 폴링
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 3000); // 3초마다
  return () => clearInterval(interval);
}, [fetchData]);

// src/app/logs/page.tsx — 로그 폴링
useEffect(() => {
  fetchLogs();
  const interval = setInterval(fetchLogs, 3000); // 3초마다
  return () => clearInterval(interval);
}, [fetchLogs]);

// src/app/processes/page.tsx — PM2 프로세스 폴링 (추정)
useEffect(() => {
  fetchProcesses();
  const interval = setInterval(fetchProcesses, 3000);
  return () => clearInterval(interval);
}, [fetchProcesses]);
```

**페이지별 폴링 현황:**
| 페이지 | 폴링 대상 | 주기 | 요청 크기(추정) |
|--------|----------|------|----------------|
| 대시보드 | /api/system | 3초 | ~1 KB |
| 대시보드 | /api/pm2 | 3초 | ~2 KB |
| 로그 뷰어 | /api/pm2/logs?lines=200 | 3초 | ~50 KB |
| 프로세스 | /api/pm2 | 3초 | ~2 KB |
| 네트워크 | /api/network (추정) | 3초 | ~1 KB |

**1분 기준 트래픽 계산:**
```
(1 KB + 2 KB + 50 KB + 2 KB + 1 KB) × 20 요청/분 ≈ 1.12 MB/분
= 약 67 MB/시간
= 약 1.6 GB/일 (내부 트래픽)
```

로그 페이지 상시 열람 시 트래픽이 상당하다. 주요 문제점은 다음과 같다.

### 1-2. 폴링 방식의 문제점

```
문제 1: 불필요한 중복 요청
  - 변경이 없어도 매 3초 전체 데이터를 다시 받음
  - 로그 200줄을 3초마다 전송 → 이미 본 줄을 반복 전송

문제 2: 지연 누적
  - 최대 3초 지연 (폴링 주기 = 최대 지연)
  - CPU 스파이크 등 즉각 반응이 필요한 이벤트에 부적합

문제 3: 서버 부하
  - 브라우저 탭이 여러 개 열려 있으면 요청 배가
  - 모든 탭이 독립적으로 폴링

문제 4: 연결 관리
  - 각 폴링은 독립 HTTP 연결 (HTTP/2 멀티플렉싱으로 일부 완화)
  - 연결 수립 오버헤드 반복 발생

문제 5: 로그 페이지 특수 문제
  - 200줄을 매번 전송하지만 보통 마지막 몇 줄만 새로움
  - "자동 스크롤" 기능이 있어도 전체 로그를 교체
  - 검색 필터가 있어도 서버에서 항상 전체 전송
```

### 1-3. 현재 UI의 "실시간" 표시 분석

로그 페이지 하단에 녹색 점 + "실시간" 텍스트가 있지만, 실제로는 3초 폴링이다. 이는 사용자에게 잘못된 인상을 줄 수 있다.

---

## 2. 실시간 기술 비교

### 2-1. 네 가지 주요 기술

#### 기술 A — Server-Sent Events (SSE)

```
동작 방식:
  클라이언트 → HTTP GET 연결 수립 (한 번)
  서버 → 텍스트 이벤트를 지속적으로 push
  클라이언트 → EventSource API로 수신

프로토콜:
  Content-Type: text/event-stream
  Transfer-Encoding: chunked
  
  데이터 형식:
  data: {"type":"metric","cpu":45.2}\n\n
  event: pm2-status\ndata: {...}\n\n
  id: 1234\ndata: {"line":"log..."}\n\n

장점:
  - HTTP 기반 → 프록시, CDN, 방화벽 통과 우수
  - 자동 재연결 (브라우저 기본 동작)
  - 단방향이지만 서버 모니터링에 충분
  - Next.js Route Handler에서 바로 구현 가능
  - 구현 복잡도 낮음

단점:
  - 단방향 (서버 → 클라이언트만)
  - HTTP/1.1: 브라우저당 도메인 6개 연결 제한
    → 탭 여러 개 열면 연결 한도에 도달 가능
  - HTTP/2: 멀티플렉싱으로 이 문제 해결 (Cloudflare Tunnel = HTTP/2)

서버 모니터링 적합도: ★★★★★
```

#### 기술 B — WebSocket

```
동작 방식:
  HTTP Upgrade 핸드셰이크 → TCP 양방향 연결
  서버/클라이언트 모두 언제든 메시지 전송 가능

장점:
  - 양방향: 클라이언트에서 서버로도 메시지 전송
  - 낮은 오버헤드 (헤더 없는 프레임)
  - 게임, 채팅, 실시간 협업에 최적

단점:
  - Next.js App Router에서 네이티브 지원 없음
    → 별도 WebSocket 서버(ws, socket.io) 필요
    → PM2로 별도 프로세스 관리 필요
  - Cloudflare Tunnel: WebSocket 지원하지만 추가 설정 필요
  - 프록시 통과 이슈 (일부 환경)
  - 구현/유지보수 복잡도 높음

서버 모니터링 적합도: ★★★☆☆ (양방향이 필요 없어 과도함)
```

#### 기술 C — Long Polling

```
동작 방식:
  클라이언트 → HTTP 요청
  서버 → 새 데이터가 생길 때까지 응답 보류 (최대 N초)
  데이터 있으면 응답 → 클라이언트 즉시 재요청

장점:
  - 일반 HTTP만 사용 → 어떤 환경에서도 동작
  - 폴링보다 지연 짧음 (데이터 생성 즉시 응답)

단점:
  - 서버에서 연결을 잡고 있는 동안 리소스 점유
  - 구현이 SSE보다 복잡
  - SSE와 비교 시 장점이 없음

서버 모니터링 적합도: ★★☆☆☆
```

#### 기술 D — 현재 폴링 개선 (Incremental Polling)

```
개선 방법:
  - 마지막 로그 타임스탬프를 쿼리 파라미터로 전송
  - 서버: 해당 시간 이후 새 줄만 응답
  - ETag / Last-Modified + If-None-Match 활용

예시:
  GET /api/pm2/logs?since=2026-04-06T15:30:00Z
  응답: {"newLines": ["새 로그 줄..."], "lastTimestamp": "..."}

장점:
  - 기존 코드 최소 변경으로 효율화
  - SSE 도입 전 즉시 적용 가능

단점:
  - 여전히 주기적 연결 수립
  - 3초 지연 동일
  - 결국 SSE로 가야 하므로 임시방편

서버 모니터링 적합도: ★★★☆☆ (과도기용)
```

### 2-2. Next.js Route Handler에서의 SSE 구현 가능성

```typescript
// Next.js 15+ App Router에서 SSE 지원 확인
// /app/api/stream/route.ts

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 초기 데이터 전송
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      const interval = setInterval(() => {
        const data = JSON.stringify({ type: 'ping', time: Date.now() });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }, 1000);

      // 연결 종료 시 정리
      return () => clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // Nginx 버퍼링 비활성화 (중요!)
    },
  });
}
```

**Next.js 16 (현재 프로젝트)에서의 주의사항:**
- `export const dynamic = 'force-dynamic'` 선언 필요 (Next.js 정적 최적화 방지)
- `Edge Runtime`은 SSE에 더 적합하지만 Node.js API 사용 불가 → Node.js Runtime 유지

### 2-3. Cloudflare Tunnel + SSE 호환성

```
Cloudflare Tunnel 구성: 
  브라우저 → Cloudflare 엣지 → Cloudflare Tunnel → WSL2 서버

SSE 호환성:
  - HTTP/2 지원 → 도메인당 연결 수 제한 해소
  - 버퍼링: cloudflared는 기본적으로 SSE를 통과시킴
  - 타임아웃: Cloudflare 기본 100초 타임아웃 → SSE는 주기적 ping으로 해결
  
  ping 구현 (타임아웃 방지):
  // 30초마다 빈 comment 전송
  setInterval(() => {
    controller.enqueue(encoder.encode(': keep-alive\n\n'));
  }, 30000);
```

### 2-4. 최종 기술 선택: SSE

**선택 근거 요약:**

1. **단방향으로 충분**: 서버 모니터링은 서버 → 클라이언트 데이터 흐름이 전부
2. **Next.js 통합**: 별도 서버 불필요, Route Handler에서 바로 구현
3. **Cloudflare Tunnel 호환**: HTTP 기반으로 별도 설정 불필요
4. **낮은 복잡도**: WebSocket 대비 구현/유지보수 훨씬 단순
5. **자동 재연결**: EventSource API 기본 동작
6. **PM2 단순성**: 추가 프로세스 없음

---

## 3. 로그 스트리밍 강화

### 3-1. 현재 로그 조회 vs 목표

```
현재:
  3초마다 /api/pm2/logs?lines=200 폴링
  → 200줄을 항상 전체 전송 (보통 한두 줄만 새로움)
  → 검색/필터는 클라이언트 사이드에서 이미 받은 데이터에 적용

목표 (Railway/Render 스타일):
  SSE로 새 줄만 실시간 수신
  → 초기 접속 시: 마지막 N줄 스냅샷 전송
  → 이후: 새 줄 생성될 때마다 즉시 push
  → 서버 로그 파일 tail 방식 (tail -f 명령과 동일)
```

### 3-2. PM2 로그 파일 tail 구현

```typescript
// src/app/api/stream/logs/route.ts

import { createReadStream } from 'fs';
import { stat, open } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const PM2_LOG_DIR = process.env.PM2_LOG_DIR || `${process.env.HOME}/.pm2/logs`;

async function getLogFilePath(processName: string): Promise<string | null> {
  // PM2 로그 파일 경로 패턴: ~/.pm2/logs/{name}-out.log, {name}-error.log
  const patterns = [
    `${processName}-out.log`,
    `${processName}-error.log`,
  ];

  for (const pattern of patterns) {
    const fullPath = path.join(PM2_LOG_DIR, pattern);
    try {
      await stat(fullPath);
      return fullPath;
    } catch {
      // 파일 없음, 다음 패턴 시도
    }
  }
  return null;
}

async function readLastLines(filePath: string, n: number): Promise<string[]> {
  // 파일 끝에서 N줄을 효율적으로 읽기
  const CHUNK_SIZE = 4096;
  const fileHandle = await open(filePath, 'r');
  const fileStat = await stat(filePath);
  
  let position = fileStat.size;
  let lines: string[] = [];
  let buffer = '';

  while (position > 0 && lines.length < n) {
    const readSize = Math.min(CHUNK_SIZE, position);
    position -= readSize;

    const chunk = Buffer.alloc(readSize);
    await fileHandle.read(chunk, 0, readSize, position);
    buffer = chunk.toString('utf8') + buffer;

    const splitLines = buffer.split('\n');
    // 마지막 부분 조각은 다음 청크와 합쳐야 하므로 보존
    buffer = splitLines[0];
    lines = splitLines.slice(1).concat(lines);
  }

  await fileHandle.close();
  return lines.slice(-n);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const processName = url.searchParams.get('process') || 'dashboard';
  const initialLines = parseInt(url.searchParams.get('lines') || '100');

  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // 클라이언트 연결 끊김
          isClosed = true;
        }
      };

      // 1. 초기 스냅샷 전송
      const logPath = await getLogFilePath(processName);
      if (!logPath) {
        send('error', { message: `${processName} 로그 파일을 찾을 수 없습니다` });
        controller.close();
        return;
      }

      const initialLogs = await readLastLines(logPath, initialLines);
      send('snapshot', { lines: initialLogs, processName });

      // 2. 파일 변경 감지 (tail -f 방식)
      let lastSize = (await stat(logPath)).size;

      const watchInterval = setInterval(async () => {
        if (isClosed) {
          clearInterval(watchInterval);
          return;
        }

        try {
          const currentStat = await stat(logPath);
          const currentSize = currentStat.size;

          if (currentSize > lastSize) {
            // 새로 추가된 부분만 읽기
            const fd = await open(logPath, 'r');
            const delta = currentSize - lastSize;
            const chunk = Buffer.alloc(delta);
            await fd.read(chunk, 0, delta, lastSize);
            await fd.close();

            const newContent = chunk.toString('utf8');
            const newLines = newContent.split('\n').filter(l => l.trim());

            if (newLines.length > 0) {
              send('lines', { lines: newLines, processName });
            }
            lastSize = currentSize;
          } else if (currentSize < lastSize) {
            // 로그 로테이션 감지
            send('rotation', { message: '로그 파일이 교체됐습니다', processName });
            lastSize = currentSize;
          }
        } catch {
          // 파일 읽기 오류 → 다음 tick에서 재시도
        }
      }, 200); // 200ms 간격으로 파일 변경 감지

      // 3. keep-alive ping (Cloudflare 타임아웃 방지)
      const pingInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(pingInterval);
          return;
        }
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 30000);

      // 4. 연결 종료 처리
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(watchInterval);
        clearInterval(pingInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

### 3-3. 클라이언트 SSE 로그 컴포넌트

```typescript
// src/app/logs/page.tsx — SSE 기반으로 전환

'use client';

import { useEffect, useRef, useState } from 'react';

interface LogLine {
  content: string;
  timestamp: number;
  isNew?: boolean;  // 애니메이션용
}

export default function LogsPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [process, setProcess] = useState('dashboard');
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const MAX_LINES = 1000; // 클라이언트 최대 보유 줄 수

  useEffect(() => {
    // 이전 연결 정리
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/stream/logs?process=${process}&lines=200`);
    eventSourceRef.current = es;

    es.addEventListener('snapshot', (e) => {
      const data = JSON.parse(e.data) as { lines: string[] };
      const newLines = data.lines.map(content => ({
        content,
        timestamp: Date.now(),
        isNew: false,
      }));
      setLines(newLines);
      setConnected(true);
    });

    es.addEventListener('lines', (e) => {
      const data = JSON.parse(e.data) as { lines: string[] };
      setLines(prev => {
        const incoming = data.lines.map(content => ({
          content,
          timestamp: Date.now(),
          isNew: true,
        }));
        const combined = [...prev, ...incoming];
        // 최대 줄 수 유지 (오래된 줄 제거)
        return combined.slice(-MAX_LINES);
      });
    });

    es.addEventListener('rotation', () => {
      setLines([]);
    });

    es.addEventListener('error', () => {
      setConnected(false);
    });

    es.onopen = () => setConnected(true);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [process]);

  // 자동 스크롤
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      {/* ... 기존 UI ... */}
      {/* 연결 상태 표시 개선 */}
      <span className="flex items-center gap-1.5 text-xs">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        {connected ? '실시간 스트리밍' : '연결 중...'}
      </span>
    </div>
  );
}
```

### 3-4. 로그 고급 기능

#### 로그 레벨 필터 (서버 사이드)

```typescript
// SSE 스트림에서 레벨 필터 적용
// 클라이언트가 원하는 레벨만 전송

const levelFilter = url.searchParams.get('level') || 'all'; // all | error | warn | info

function matchesLevel(line: string, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'error') return /error/i.test(line);
  if (filter === 'warn') return /warn|error/i.test(line);
  if (filter === 'info') return /info|warn|error/i.test(line);
  return true;
}
```

#### 타임스탬프 파싱 및 표시

```typescript
// PM2 로그 타임스탬프 파싱
// 형식: "2026-04-06T15:32:00.000Z 0|dashboard  [내용]"

const PM2_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+/;

interface ParsedLogLine {
  timestamp: Date | null;
  processId: string | null;
  content: string;
  level: 'error' | 'warn' | 'info' | null;
}

function parseLogLine(raw: string): ParsedLogLine {
  const tsMatch = raw.match(PM2_TIMESTAMP_RE);
  const timestamp = tsMatch ? new Date(tsMatch[1]) : null;
  const withoutTs = tsMatch ? raw.slice(tsMatch[0].length) : raw;

  const pidMatch = withoutTs.match(/^(\d+\|\w+)\s+/);
  const processId = pidMatch ? pidMatch[1] : null;
  const content = pidMatch ? withoutTs.slice(pidMatch[0].length) : withoutTs;

  const level = /error/i.test(content) ? 'error'
    : /warn/i.test(content) ? 'warn'
    : /info/i.test(content) ? 'info'
    : null;

  return { timestamp, processId, content, level };
}
```

#### 전체화면 로그 뷰

```typescript
// 전체화면 버튼 추가
function LogViewerToolbar({ onFullscreen }: { onFullscreen: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {/* ...기존 컨트롤... */}
      <button
        onClick={onFullscreen}
        className="ml-auto p-1.5 rounded text-gray-400 hover:text-gray-200"
        title="전체화면"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
```

---

## 4. 이벤트 시스템 설계

### 4-1. 이벤트 타입 정의

```typescript
// src/lib/events.ts

type EventType =
  // 시스템 메트릭
  | 'METRIC_CPU_HIGH'       // CPU > 80%
  | 'METRIC_MEM_HIGH'       // 메모리 > 90%
  | 'METRIC_DISK_HIGH'      // 디스크 > 85%

  // PM2 프로세스
  | 'PROCESS_DOWN'          // 프로세스 중지됨
  | 'PROCESS_RESTART'       // 프로세스 재시작됨
  | 'PROCESS_HIGH_RESTART'  // 재시작 횟수 과다 (> 10)
  | 'PROCESS_CPU_HIGH'      // 프로세스 CPU 과다

  // 로그 이벤트
  | 'LOG_ERROR'             // 에러 로그 발생
  | 'LOG_WARN'              // 경고 로그 발생

  // Auth 이벤트
  | 'AUTH_LOGIN'            // 로그인 성공
  | 'AUTH_LOGOUT'           // 로그아웃
  | 'AUTH_FAIL'             // 로그인 실패
  | 'AUTH_BLOCKED'          // IP 차단

  // 파일 이벤트
  | 'FILE_UPLOAD'           // 파일 업로드
  | 'FILE_DELETE'           // 파일 삭제

  // 시스템 이벤트
  | 'SYSTEM_ONLINE'         // 대시보드 첫 연결
  | 'TUNNEL_STATUS';        // Cloudflare 터널 상태

interface DashboardEvent {
  id: string;              // nanoid
  type: EventType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;       // ISO 8601
  acknowledged: boolean;
}
```

### 4-2. 이벤트 저장소

#### 옵션 A — 링버퍼 (메모리)

```typescript
// src/lib/event-store.ts

class EventStore {
  private buffer: DashboardEvent[] = [];
  private readonly MAX_SIZE = 500;
  private subscribers: Set<(event: DashboardEvent) => void> = new Set();

  publish(event: DashboardEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.MAX_SIZE) {
      this.buffer.shift(); // 오래된 것 제거
    }

    // 구독자에게 브로드캐스트
    this.subscribers.forEach(sub => sub(event));
  }

  subscribe(callback: (event: DashboardEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback); // unsubscribe 함수 반환
  }

  getRecent(limit = 50): DashboardEvent[] {
    return this.buffer.slice(-limit).reverse();
  }

  getUnacknowledged(): DashboardEvent[] {
    return this.buffer.filter(e => !e.acknowledged);
  }
}

// 싱글톤 (Next.js 서버 인스턴스당 하나)
export const eventStore = new EventStore();
```

**특징:**
- PM2 재시작 시 초기화 (현재 감사 로그와 동일한 한계)
- 구현 단순
- Level 1~2에 적합

#### 옵션 B — SQLite 영속화 (Level 2+)

```typescript
// events 테이블 스키마
CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK(severity IN ('info','warning','error','critical')),
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  data         TEXT,  -- JSON
  timestamp    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_at DATETIME,
  acknowledged_by TEXT  -- userId
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_ack ON events(acknowledged);
```

### 4-3. 이벤트 발생 위치

```
이벤트 발생 지점:

/api/system (시스템 메트릭 조회)
  → CPU > 80% 시 METRIC_CPU_HIGH 발행
  → 메모리 > 90% 시 METRIC_MEM_HIGH 발행

/api/pm2 (PM2 프로세스 조회)
  → 상태 변화 감지 시 PROCESS_DOWN / PROCESS_RESTART 발행
  → 재시작 횟수 급증 시 PROCESS_HIGH_RESTART 발행

/api/stream/logs (로그 스트리밍)
  → error 레벨 로그 감지 시 LOG_ERROR 발행

middleware.ts (인증)
  → 로그인 성공/실패 시 AUTH_LOGIN / AUTH_FAIL 발행

/api/storage (파일 작업)
  → 업로드/삭제 시 FILE_UPLOAD / FILE_DELETE 발행
```

### 4-4. SSE 이벤트 스트림 구조

```typescript
// /api/stream/events/route.ts
// 메트릭 + PM2 상태 + 이벤트를 하나의 SSE 스트림으로

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch { isClosed = true; }
      };

      // 초기 데이터 전송
      send('snapshot', {
        metrics: getCurrentMetrics(),
        events: eventStore.getRecent(20),
      });

      // 이벤트 구독
      const unsubscribe = eventStore.subscribe((event) => {
        send('event', event);
      });

      // 메트릭 정기 전송 (3초 → 5초로 줄이기 가능)
      const metricsInterval = setInterval(async () => {
        if (isClosed) return;
        const metrics = await fetchSystemMetrics();
        send('metrics', metrics);
      }, 3000);

      // PM2 상태 정기 전송
      const pm2Interval = setInterval(async () => {
        if (isClosed) return;
        const processes = await fetchPm2Status();
        send('pm2', processes);
      }, 5000);

      // keep-alive
      const pingInterval = setInterval(() => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        }
      }, 30000);

      // 정리
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        unsubscribe();
        clearInterval(metricsInterval);
        clearInterval(pm2Interval);
        clearInterval(pingInterval);
        try { controller.close(); } catch { /* 이미 닫힘 */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

### 4-5. 이벤트 심각도 및 알림 정책

```typescript
const SEVERITY_CONFIG = {
  critical: {
    color: 'red',
    icon: '🚨',
    browserNotification: true,
    sound: true,
  },
  error: {
    color: 'red',
    icon: '❌',
    browserNotification: true,
    sound: false,
  },
  warning: {
    color: 'yellow',
    icon: '⚠️',
    browserNotification: false,
    sound: false,
  },
  info: {
    color: 'blue',
    icon: 'ℹ️',
    browserNotification: false,
    sound: false,
  },
};

// 브라우저 알림 (Notification API)
async function sendBrowserNotification(event: DashboardEvent) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
  }

  new Notification(`[${event.severity.toUpperCase()}] ${event.title}`, {
    body: event.message,
    icon: '/favicon.ico',
    tag: event.type,  // 같은 타입 알림은 교체
  });
}
```

---

## 5. SSE 구현 상세

### 5-1. useEventStream 커스텀 훅

```typescript
// src/hooks/use-event-stream.ts

import { useEffect, useRef, useState } from 'react';

interface UseEventStreamOptions {
  url: string;
  onEvent?: (event: MessageEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

interface UseEventStreamReturn {
  connected: boolean;
  lastEventTime: Date | null;
}

export function useEventStream({
  url,
  onEvent,
  onConnect,
  onDisconnect,
  enabled = true,
}: UseEventStreamOptions): UseEventStreamReturn {
  const [connected, setConnected] = useState(false);
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let retryCount = 0;
    const MAX_RETRIES = 10;
    const BASE_DELAY = 1000;

    function connect() {
      if (esRef.current) {
        esRef.current.close();
      }

      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        retryCount = 0;
        onConnect?.();
      };

      es.onmessage = (e) => {
        setLastEventTime(new Date());
        onEvent?.(e);
      };

      es.onerror = () => {
        setConnected(false);
        onDisconnect?.();
        es.close();

        // 지수 백오프 재연결
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), 30000);
          retryCount++;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      // 이벤트 타입별 핸들러 등록은 호출부에서 처리하도록 ref 노출도 고려
    }

    connect();

    return () => {
      esRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setConnected(false);
    };
  }, [url, enabled]);

  return { connected, lastEventTime };
}
```

### 5-2. 연결 상태 UI 컴포넌트

```typescript
// src/components/ui/stream-status.tsx

interface StreamStatusProps {
  connected: boolean;
  lastEventTime: Date | null;
}

export function StreamStatus({ connected, lastEventTime }: StreamStatusProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
        {connected ? '실시간 연결됨' : '연결 끊김 (재시도 중...)'}
      </span>
      {lastEventTime && (
        <span className="text-gray-500">
          · 마지막 수신: {lastEventTime.toLocaleTimeString('ko-KR')}
        </span>
      )}
    </div>
  );
}
```

### 5-3. 대시보드 SSE 통합

기존 `page.tsx`의 폴링을 SSE로 교체:

```typescript
// 기존:
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 3000);
  return () => clearInterval(interval);
}, [fetchData]);

// 교체 후:
useEffect(() => {
  const es = new EventSource('/api/stream/events');

  es.addEventListener('metrics', (e) => {
    const metrics = JSON.parse(e.data) as SystemData;
    setData(metrics);
    setLastUpdated(Date.now());
    // 히스토리 업데이트
    cpuHistory.current = [...cpuHistory.current, metrics.cpu.usage].slice(-MAX_HISTORY);
  });

  es.addEventListener('pm2', (e) => {
    const processes = JSON.parse(e.data) as Pm2Process[];
    setProcesses(processes);
  });

  es.addEventListener('event', (e) => {
    const event = JSON.parse(e.data) as DashboardEvent;
    // 이벤트 알림 처리
    if (event.severity === 'critical' || event.severity === 'error') {
      sendBrowserNotification(event);
    }
  });

  return () => es.close();
}, []);
```

---

## 6. Activity Feed UI

### 6-1. 이벤트 피드 컴포넌트

Firebase Console의 Activity 로그와 유사한 스타일:

```
┌──────────────────────────────────────────────────────┐
│  최근 이벤트                  [모두 확인]  [필터 ▼]  │
├──────────────────────────────────────────────────────┤
│  🔴 방금 전  [CRITICAL]  프로세스 중지됨             │
│  dashboard 프로세스가 예기치 않게 종료됐습니다       │
├──────────────────────────────────────────────────────┤
│  🟡 2분 전   [WARNING]   메모리 사용률 높음          │
│  메모리 사용률이 91%에 도달했습니다 (14.6 / 16 GB)  │
├──────────────────────────────────────────────────────┤
│  🔵 5분 전   [INFO]      로그인 성공                 │
│  192.168.1.100 에서 로그인했습니다                   │
├──────────────────────────────────────────────────────┤
│  🔴 1시간 전 [ERROR]     에러 로그 감지              │
│  "Cannot read properties of undefined" 발생          │
├──────────────────────────────────────────────────────┤
│                    더 보기 (총 47건)                  │
└──────────────────────────────────────────────────────┘
```

### 6-2. 알림 페이지 (`/alerts`)

```typescript
// src/app/alerts/page.tsx

export default function AlertsPage() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread' | 'error' | 'warning'>('all');

  // SSE로 실시간 이벤트 수신
  const { connected } = useEventStream({
    url: '/api/stream/events',
    onEvent: (e) => {
      // event 타입 이벤트만 처리
    },
  });

  const filteredEvents = events.filter(event => {
    if (filter === 'unread') return !event.acknowledged;
    if (filter === 'error') return event.severity === 'error' || event.severity === 'critical';
    if (filter === 'warning') return event.severity === 'warning';
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="알림" description="시스템 이벤트 및 경고">
        <StreamStatus connected={connected} lastEventTime={null} />
      </PageHeader>
      {/* 이벤트 목록 */}
    </div>
  );
}
```

### 6-3. 대시보드 알림 배지

```typescript
// src/components/layout/sidebar.tsx 수정
// 미확인 이벤트 수를 사이드바 알림 메뉴에 배지로 표시

interface SidebarItemProps {
  href: string;
  label: string;
  badgeCount?: number;
}

function SidebarItem({ href, label, badgeCount }: SidebarItemProps) {
  return (
    <Link href={href} className="...">
      <span>{label}</span>
      {badgeCount && badgeCount > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  );
}
```

---

## 7. 구현 로드맵

### Phase 1 — SSE 기본 인프라 (2~3시간)

```
목표: 폴링 → SSE 전환의 기반 마련

1. /api/stream/events SSE 엔드포인트 작성
   - 메트릭 데이터 3초 주기 push
   - PM2 상태 5초 주기 push
   - keep-alive ping 30초 주기

2. useEventStream 훅 작성
   - 자동 재연결 (지수 백오프)
   - 연결 상태 추적

3. 대시보드 페이지 SSE 전환
   - 기존 setInterval 제거
   - SSE 메트릭 이벤트 구독

4. StreamStatus 컴포넌트
   - 연결 상태 표시 (녹색/빨간 점)
```

### Phase 2 — 로그 tail 스트리밍 (2~3시간)

```
목표: 로그 페이지를 진짜 실시간으로 전환

1. /api/stream/logs SSE 엔드포인트
   - 초기 스냅샷 전송 (마지막 200줄)
   - 파일 변경 감지 (200ms 폴링)
   - 새 줄만 push (증분 전송)
   - 로그 로테이션 감지

2. 로그 페이지 SSE 전환
   - EventSource 사용
   - 새 줄 클라이언트 append
   - 최대 줄 수 유지 (1000줄)

3. 로그 파싱 강화
   - 타임스탬프 추출
   - 프로세스 ID 파싱
   - 레벨 감지

4. 전체화면 모드
```

### Phase 3 — 이벤트 시스템 (3~4시간)

```
목표: 대시보드 이벤트 발행/구독 체계 구축

1. EventStore 링버퍼 구현
2. 이벤트 발행 지점 추가
   - 시스템 메트릭 임계치 이벤트
   - PM2 프로세스 상태 변경 이벤트
   - 에러 로그 감지 이벤트

3. SSE 스트림에 이벤트 통합
4. 알림 페이지 (/alerts)
5. 사이드바 배지
```

### Phase 4 — 알림 고급화 (2~3시간)

```
목표: 브라우저 알림 + 이벤트 관리

1. 브라우저 알림 권한 요청 UI
2. Notification API 연동
3. 이벤트 확인(acknowledge) 기능
4. 이벤트 필터 (심각도, 타입, 날짜)
5. SQLite 영속화 (선택)
```

---

## 8. 성능 및 안정성 고려사항

### 8-1. 동시 SSE 연결 수 제한

```typescript
// 연결 수 추적 및 제한
let activeConnections = 0;
const MAX_CONNECTIONS = 10; // 단일 서버 대시보드에 충분

export async function GET(request: Request) {
  if (activeConnections >= MAX_CONNECTIONS) {
    return new Response('연결 한도 초과', { status: 429 });
  }

  activeConnections++;
  request.signal.addEventListener('abort', () => {
    activeConnections--;
  });

  // ... SSE 스트림 ...
}
```

### 8-2. 메모리 누수 방지

```typescript
// 공통 실수: 구독자 정리 누락
const eventStore = new EventStore();

// 잘못된 방법 (누수)
eventStore.subscribe(handler); // 정리 안 함

// 올바른 방법
const unsubscribe = eventStore.subscribe(handler);
request.signal.addEventListener('abort', unsubscribe);
```

### 8-3. 로그 파일 감시 최적화

현재 구현은 `setInterval`로 파일 크기를 200ms마다 확인하는 방식이다.
Node.js `fs.watch`로 교체 시 더 효율적이지만 WSL2에서 안정성 문제가 있다.

```typescript
// WSL2에서 fs.watch 이슈:
// - inotify가 때때로 이벤트를 놓침
// - 심볼릭 링크 추적 불안정
// → 현재 폴링 방식(200ms)이 WSL2 환경에서 더 안전
// → 향후 네이티브 Linux에서는 fs.watch 사용 고려

// 폴링 간격 조정 가이드:
// 200ms: 적극적 (CPU ~0.1% 추가 부하)
// 500ms: 균형적 (최대 500ms 지연)
// 1000ms: 보수적 (최대 1초 지연)
```

### 8-4. Next.js SSR/RSC와의 공존

```
주의: SSE 엔드포인트는 반드시 동적으로 실행돼야 함

// route.ts 상단에 필수 추가
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Edge Runtime은 긴 연결에 제한 있음

// 빌드 시 정적 생성을 방지
// Next.js 15+에서 기본 동작이 변경됐으므로 명시적 선언 필요
```

### 8-5. 폴링 → SSE 마이그레이션 시 점진적 전환

```
전환 전략: 폴링과 SSE를 Feature Flag로 공존

const USE_SSE = process.env.NEXT_PUBLIC_USE_SSE === 'true';

// 컴포넌트에서:
if (USE_SSE) {
  // SSE 방식
} else {
  // 기존 폴링 방식
}

단계별 전환:
  1단계: SSE 인프라 구축 + Feature Flag OFF
  2단계: 개발 환경에서 SSE 테스트 (FLAG ON)
  3단계: 대시보드 메트릭 SSE 전환 (Flag 제거)
  4단계: 로그 페이지 SSE 전환
  5단계: 나머지 폴링 제거
```

### 8-6. 브라우저 탭 여러 개 열린 경우

```
문제: 같은 도메인에서 여러 탭이 각각 SSE 연결을 유지함
      → 서버에서 동일 데이터를 N번 전송

해결 방법: SharedWorker 활용
  - 모든 탭이 하나의 SharedWorker를 공유
  - Worker가 SSE를 하나만 유지
  - 이벤트를 모든 탭에 브로드캐스트

단, 구현 복잡도 상당 → 1인 프로젝트에선 현재는 각 탭 독립 연결 허용
최대 연결 수 제한(10개)으로 남용 방지로 충분
```

### 8-7. 폴링과 SSE의 실제 성능 비교

```
폴링 (현재):
  요청당 HTTP 핸드셰이크 + 헤더 + 전체 데이터
  200줄 로그 = ~50 KB × 20회/분 = ~1 MB/분

SSE (목표):
  연결 1회 수립
  증분 데이터만 전송
  새 로그 10줄 = ~1 KB × 5회/분(실제 발생 시) = ~5 KB/분

절감 효과: 약 95% 트래픽 감소 (로그 스트리밍 기준)
CPU 절감: setInterval 제거 + fetch 오버헤드 제거
```

> 참고:
> MDN — Using server-sent events
> https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
>
> Next.js Streaming Documentation
> https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming
>
> Cloudflare Workers & SSE
> https://developers.cloudflare.com/workers/runtime-apis/streams/

---

*작성: kdywave 리서치 에이전트 · 2026-04-06*
*이전 문서: [04-storage-file-manager.md](./04-storage-file-manager.md)*
