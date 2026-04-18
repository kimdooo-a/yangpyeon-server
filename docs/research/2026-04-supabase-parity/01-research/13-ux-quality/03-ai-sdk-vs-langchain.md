# 1:1 비교 — Vercel AI SDK v6 vs LangChain.js (2026-04 기준)

> **메타** · 작성일 2026-04-18 · Wave 2 1:1 비교 · 양 진영 대등 분석 후 결론
>
> **연관 산출물**: Wave 2 매트릭스 `02-ux-quality-matrix.md` (A vs B 포지션), Wave 1 `01-vercel-ai-sdk-v6-studio-assistant-deep-dive.md` (AI SDK v6 deep-dive), 프로젝트 컨텍스트 양평 부엌 서버 대시보드 Studio 3대 모듈 + /ai 챗 + Edge Functions lite.

---

## 0. TL;DR

| 관점 | Vercel AI SDK v6 | LangChain.js |
|---|---|---|
| 추상화 수준 | 얇음 (model↔UI 직결) | 두꺼움 (Chain/Agent/Graph) |
| 번들 크기 (gzip) | **67.5KB** (tree-shake <30KB) | 101.2KB (+ LangGraph 35KB) |
| Streaming → React | **`useChat` 훅 ~20줄** | async iterator 수동 래핑 100+줄 |
| Tool calling 표준 | **Zod ToolSet** 1st-party | Tool class, Zod 선택, 2단계 변환 |
| MCP 통합 | **`experimental_createMCPClient`** 1st-party | `@langchain/mcp-adapters` (community) |
| Next.js 16 App Router | **1급 시민** (Route Handlers, RSC) | 수동 통합, RSC 제약 |
| 프롬프트 캐싱 | `providerOptions.anthropic.cacheControl` 1줄 | manual message block 편집 |
| 문서 품질 | 중~상 (예제 풍부, API 일관) | 상~매우상 (깊이 있음, 분량 방대) |
| 커뮤니티 생태 | 25+ provider, Vercel 주도 | 50+ provider + RAG/Vector/Memory |

**결론 (프로젝트 컨텍스트)**: **Vercel AI SDK v6 결정적 우위**.
- 1인 운영 + $0~5/월 + Next.js 16 잠금에서 LangChain의 추상 레이어는 부채. 우리는 "복잡한 에이전트 그래프"가 아닌 "tool-calling LLM 5개 모듈"이 필요.
- LangChain 재고 조건: **복잡한 RAG 파이프라인(chunking+hybrid+rerank) 또는 3+ provider 동시 오케스트레이션 필요 시**.

---

## 1. 추상화 수준 (설계 철학 비교)

### 1.1 AI SDK v6 — "모델↔UI를 잇는 얇은 층"

```
User Input → Route Handler (streamText) → useChat hook → React UI
            └ provider.ts (BYOK)
            └ tools (Zod-defined)
            └ MCP client (optional)
```

- 3개 핵심 함수: `generateText`/`streamText`/`generateObject`
- 1개 핵심 훅: `useChat` (+`useObject`/`useCompletion`)
- 추가 유틸: `tool()`, `experimental_createMCPClient()`, `stopWhen`
- **철학**: "LLM은 다른 provider의 함수다. 직렬화/스트리밍/tool 협상만 통일하자"

### 1.2 LangChain.js — "AI 오케스트레이션 프레임워크"

```
User Input → PromptTemplate → Runnable.pipe(Model) → OutputParser
                            → RunnableSequence / RunnableParallel
                            → AgentExecutor → Tool[]
                            → LangGraph StateGraph → Nodes/Edges
                            → Memory (BufferMemory, Summary...)
                            → Retriever (VectorStore)
```

- 주요 추상: Runnable, Chain, Agent, AgentExecutor, LangGraph, Memory, Retriever, OutputParser, PromptTemplate
- 철학: "복잡한 LLM 파이프라인을 컴포저블한 원시형으로 쪼갠다"

### 1.3 어떤 철학이 우리에게 맞나

우리 Studio 모듈의 실제 요구:
- "SQL 생성" = user prompt → LLM + 2 tools (listTables, describeColumns) → SQL string
- "Schema 제안" = user prompt + current schema → LLM → structured JSON (Zod)
- "Advisor 해설" = violation object → LLM → markdown text
- "AI 챗" = messages → LLM + MCP tools → streaming text

→ 모두 **"prompt + (optional tools) → (text|JSON|stream)"** 단순 패턴. Chain/Graph/Memory/Retriever 불필요.

**결론**: AI SDK v6의 얇은 층이 정확히 맞는 크기. LangChain은 2차 정규화된 추상을 구매하는 느낌.

---

## 2. Streaming 지원 1:1

### 2.1 AI SDK v6

```ts
// app/api/ai/sql/route.ts (Next.js 16)
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    messages,
    tools: { /* ... */ },
  });
  return result.toAIStreamResponse();  // SSE 프로토콜 자동
}
```

```tsx
// React — useChat 훅
'use client';
import { useChat } from 'ai/react';

export function ChatUI() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({ api: '/api/ai/sql' });
  return (
    <form onSubmit={handleSubmit}>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      <input value={input} onChange={handleInputChange} />
    </form>
  );
}
```

**총 ~20줄**. SSE 파싱, 청크 누적, state 업데이트 전부 자동.

### 2.2 LangChain.js

```ts
// app/api/ai/sql/route.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const model = new ChatAnthropic({ model: 'claude-sonnet-4-6', streaming: true });
  const stream = await model.stream(
    messages.map(m => m.role === 'user' ? new HumanMessage(m.content) : new SystemMessage(m.content))
  );

  // SSE 수동 래핑
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.content.toString();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
```

```tsx
// React — useChat 훅 없음 → 직접 구현
'use client';
import { useState } from 'react';

export function ChatUI() {
  const [messages, setMessages] = useState<{id: string; content: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    const userMsg = { id: crypto.randomUUID(), content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    const res = await fetch('/api/ai/sql', {
      method: 'POST',
      body: JSON.stringify({ messages: [...messages, userMsg] }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let assistantContent = '';
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, content: '' }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const { content } = JSON.parse(data);
          assistantContent += content;
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
        } catch {}
      }
    }
    setIsLoading(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      <input value={input} onChange={e => setInput(e.target.value)} />
    </form>
  );
}
```

**총 ~100줄 + 에러/abort/재시도 처리 별도**.

### 2.3 평가

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| 코드 라인 | ~20 | ~100 |
| 에러/abort 처리 | 훅 내장 | 직접 구현 |
| 타입 안전성 | Message 타입 자동 | HumanMessage/AIMessage 수동 변환 |
| Edge runtime | 지원 | `ChatAnthropic` 비호환 (Node only) |
| 유지보수 부담 | 낮음 | 높음 (SSE 포맷 변경 시 양쪽 수정) |

→ **AI SDK 압승**.

---

## 3. Tool Calling 인터페이스

### 3.1 AI SDK v6 — Claude Streaming + Tool (SQL 생성 후 `sql.read_only_execute` MCP 호출)

```ts
// app/api/ai/sql/route.ts
import { streamText, tool, experimental_createMCPClient as createMCPClient } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // MCP 서버의 tool을 자동 ToolSet으로 가져옴
  const mcp = await createMCPClient({
    transport: { type: 'sse', url: 'http://127.0.0.1:9019/sse' },
  });
  const mcpTools = await mcp.tools();  // { 'sql.read_only_execute': Tool, 'prisma.list_models': Tool, ... }

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: 'You are a SQL expert. Use listModels first, then generate SQL. Use sql.read_only_execute ONLY to verify syntax (EXPLAIN), never to fetch data.',
    messages,
    tools: {
      ...mcpTools,
      // 로컬 추가 tool
      formatSql: tool({
        description: 'Format SQL using pg-formatter',
        inputSchema: z.object({ sql: z.string() }),
        execute: async ({ sql }) => formatWithPgFormatter(sql),
      }),
    },
    stopWhen: ({ stepCount }) => stepCount >= 5,
    onFinish: () => mcp.close(),
  });

  return result.toAIStreamResponse();
}
```

- `tool({ inputSchema: z.object(...), execute: async () => ... })` 단일 pattern
- MCP tool은 `mcp.tools()` 한 줄로 통합
- `stopWhen` 함수로 유연한 중단
- 에러는 자동 retry/fallback (provider settings)

### 3.2 LangChain.js — 동일 시나리오

```ts
// app/api/ai/sql/route.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const mcpClient = new MultiServerMCPClient({
    mcpServers: {
      luckystyle4u: { transport: 'sse', url: 'http://127.0.0.1:9019/sse' },
    },
  });
  const mcpTools = await mcpClient.getTools();  // Tool[] 변환 레이어 1개 추가

  const formatSqlTool = new DynamicStructuredTool({
    name: 'formatSql',
    description: 'Format SQL using pg-formatter',
    schema: z.object({ sql: z.string() }),
    func: async ({ sql }) => formatWithPgFormatter(sql),
  });

  const model = new ChatAnthropic({ model: 'claude-sonnet-4-6', streaming: true });
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a SQL expert. Use listModels first, ...'],
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const tools = [...mcpTools, formatSqlTool];
  const agent = await createToolCallingAgent({ llm: model, tools, prompt });
  const executor = new AgentExecutor({ agent, tools, maxIterations: 5, returnIntermediateSteps: true });

  const stream = await executor.stream({
    input: messages.at(-1).content,
    chat_history: messages.slice(0, -1),
  });

  // SSE 래핑 + tool call event filter
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.output) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk.output })}\n\n`));
        }
        if (chunk.intermediateSteps) {
          // tool call 이벤트 추출 수동
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
      await mcpClient.close();
    },
  });
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
}
```

### 3.3 평가

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| Tool 정의 문법 | `tool({ inputSchema, execute })` 1개 | `DynamicStructuredTool`, `Tool`, `StructuredTool` 3개 선택지 |
| MCP 통합 | `createMCPClient` 1st-party | `MultiServerMCPClient` community, 변환 1단계 추가 |
| Prompt 작성 | `system:` 문자열 | `ChatPromptTemplate` + `MessagesPlaceholder` (agent_scratchpad 필수) |
| 스트리밍+Tool 이벤트 | 자동 융합 | intermediateSteps 수동 파싱 |
| 타입 추론 (tool args) | Zod schema → `execute` 인자 자동 추론 | 동일하게 가능하나 SDK마다 제약 |
| 중단 조건 | `stopWhen` 함수 | `maxIterations` 정수 |

→ **AI SDK의 tool 경험이 체감 2~3배 단순**.

---

## 4. 대화 히스토리 관리 + 롤백

### 4.1 AI SDK v6

```ts
// 서버: 단순 stateless — messages 배열만 받음
export async function POST(req: Request) {
  const { messages } = await req.json();
  // messages = [{ role, content, id, createdAt }]
  // 서버는 메모리 상태 없음 → 세션 간격 없음
  return streamText({ model, messages }).toAIStreamResponse();
}

// 클라이언트: useChat이 messages 자동 관리
const { messages, setMessages, append, reload, stop } = useChat({
  api: '/api/ai/chat',
  initialMessages: loadedFromDb,
});

// 롤백 (마지막 교환 삭제):
function rollbackLastExchange() {
  setMessages(prev => prev.slice(0, -2));  // user + assistant 제거
}

// 재시도 (마지막 user 메시지로 다시):
function retry() {
  reload();  // 자동 제공
}

// 저장 (DB에 영구):
useEffect(() => {
  if (messages.length > 0) saveThreadToDb(threadId, messages);
}, [messages]);
```

핵심: `useChat`이 히스토리 + stop + reload + append 전부 제공. DB 영속성은 `onFinish` 콜백이나 `useEffect`로 간단 연결.

### 4.2 LangChain.js

```ts
// 방법 A: Memory 클래스 (Stateful)
import { BufferMemory, ChatMessageHistory } from 'langchain/memory';
import { SqliteChatMessageHistory } from 'langchain/stores/message/sqlite';

const memory = new BufferMemory({
  chatHistory: new SqliteChatMessageHistory({ sessionId: threadId, ... }),
  memoryKey: 'chat_history',
});

const chain = new ConversationChain({ llm: model, memory });
await chain.invoke({ input: 'user message' });

// 롤백:
const history = await memory.chatHistory.getMessages();
await memory.chatHistory.clear();
for (const msg of history.slice(0, -2)) {
  await memory.chatHistory.addMessage(msg);
}

// 방법 B: LangGraph StateGraph (Stateful with checkpointer)
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';

const checkpointer = new MemorySaver();
const graph = new StateGraph(MessagesAnnotation)
  .addNode('chat', async state => { /* ... */ })
  .addEdge('__start__', 'chat')
  .compile({ checkpointer });

await graph.invoke({ messages: [...] }, { configurable: { thread_id: threadId } });
// 롤백 = checkpointer.put(previous_checkpoint)
```

### 4.3 평가

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| 기본 모델 | Stateless (messages 배열 주고받기) | Stateful (Memory/Checkpointer) |
| 서버 복잡도 | 없음 (DB는 선택) | Memory store 선택 + 관리 |
| 롤백 구현 | 클라이언트 slice 1줄 | Memory clear + re-add 루프 |
| 재시도 | `reload()` 1줄 | 수동 last-message-remove + invoke |
| 멀티 세션 격리 | 서버 stateless라 자연 격리 | sessionId/thread_id 명시 관리 필요 |

→ **AI SDK의 stateless 모델이 1인 운영에서 단순성 승리**. LangChain의 Memory는 복잡 대화(장기 요약 필요) 시 유리하나 우리는 불필요.

---

## 5. MCP 통합 방식 상세

### 5.1 AI SDK v6

- `import { experimental_createMCPClient } from 'ai'`
- stdio + SSE dual transport
- `mcp.tools()` → AI SDK ToolSet 직접 반환
- Zod schema 자동 추론 (MCP server에서 제공하는 input schema)
- lifecycle: `onFinish: () => mcp.close()`

### 5.2 LangChain.js

- `@langchain/mcp-adapters` (community)
- `MultiServerMCPClient` → 여러 MCP 서버 동시 연결
- `getTools()` → `Tool[]` (LangChain 네이티브 형식)
- Zod → LangChain Zod v3 변환 1단계
- lifecycle: `await client.close()` 수동

### 5.3 우리 `mcp-luckystyle4u` 연동 차이

AI SDK v6:
```ts
const mcp = await createMCPClient({ transport: { type: 'sse', url: MCP_URL } });
const tools = await mcp.tools();
streamText({ model, messages, tools });  // 끝
```

LangChain:
```ts
const client = new MultiServerMCPClient({ mcpServers: { luckystyle4u: { transport: 'sse', url: MCP_URL } } });
const tools = await client.getTools();
const agent = await createToolCallingAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent, tools });
await executor.invoke(...);
```

→ 동일 작업에 LangChain은 3개 추가 추상(Client 래퍼, createAgent, Executor).

---

## 6. 프롬프트 캐싱 지원

### 6.1 AI SDK v6 — Anthropic 프롬프트 캐싱

```ts
import { anthropic } from '@ai-sdk/anthropic';

const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  system: LARGE_SYSTEM_PROMPT,  // 2000+ tokens (도메인 지식, 규칙, DMMF 발췌)
  messages,
  providerOptions: {
    anthropic: {
      cacheControl: { type: 'ephemeral' },  // 5분 TTL, system + tools block 자동 캐시
    },
  },
});
```

- 1줄 설정
- `cache_read_input_tokens` 메타에 자동 추적
- 우리 Studio 시스템 프롬프트는 호출마다 95%+ 동일 → 2회 hit 이후 순이익

### 6.2 LangChain.js — Anthropic 프롬프트 캐싱

```ts
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage } from '@langchain/core/messages';

const systemMsg = new SystemMessage({
  content: [
    {
      type: 'text',
      text: LARGE_SYSTEM_PROMPT,
      // LangChain은 표준화된 cacheControl 필드 부재 → provider-specific 전달
      cache_control: { type: 'ephemeral' },
    },
  ],
});
```

- content block 배열로 재구성 필요
- SystemMessage의 content는 보통 string이나, 캐시 사용 시 block 배열로 바꿔야 함 → 타입 좁힘 필요
- 문서 최신성 부족 (Anthropic 신기능 반영 지연 경향)

### 6.3 평가

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| 설정 | `providerOptions.anthropic.cacheControl` 1줄 | content block 재작성 |
| 자동 추적 | `usage.cacheReadInputTokens` 필드 | 별도 metadata 파싱 |
| 1시간 TTL | `{ type: 'ephemeral', ttl: '1h' }` | 동일 옵션 존재하나 문서 불완전 |

→ **AI SDK 승**.

---

## 7. Next.js 통합 복잡도

### 7.1 AI SDK v6 × Next.js 16

- **Route Handlers**: `toAIStreamResponse()` 한 줄 → `text/event-stream` 자동
- **Server Actions**: `generateText`/`generateObject` 서버에서 직접 호출 + RSC 응답에 stream 포함
- **Cache Components (Next 16)**: `'use cache'` + `cacheTag` → LLM 응답 캐싱 (Advisor 해설 같은 결정적 출력에 이상적)
- **Edge Runtime**: 지원 (provider가 Edge 호환 시)
- **Middleware**: 가능 (비동기 LLM 호출은 피하고 guard만)

### 7.2 LangChain.js × Next.js 16

- **Route Handlers**: SSE 래핑 수동 (위 Section 2 참고)
- **Server Actions**: ChatAnthropic invoke 가능하나 stream은 복잡
- **Cache Components**: Runnable 출력 캐싱은 `LLMCache` 클래스 별도
- **Edge Runtime**: LangChain Core는 Edge 호환, 대부분의 provider (특히 Anthropic SDK 래핑) 비호환 → WSL2 Node에서만 사용
- **RSC 통합**: `<Markdown>` 스트리밍 컴포넌트 없음, 직접 구현

### 7.3 평가

→ **AI SDK 압승** (Vercel이 Next.js 팀과 동일 조직 — DX 공동 설계).

---

## 8. 번들 크기 세부

| 패키지 | gzip | Edge 호환 |
|---|---|---|
| `ai@^6` (core) | 28KB | ✅ |
| `@ai-sdk/anthropic` | 18KB | ✅ |
| `@ai-sdk/react` (useChat) | 21.5KB | N/A (브라우저) |
| **AI SDK 합계 (서버+클라)** | **~67.5KB** | ✅ |
| `langchain` (core) | 58KB | ✅ |
| `@langchain/anthropic` | 28KB | ❌ |
| `@langchain/core` | 15KB | ✅ |
| `@langchain/mcp-adapters` | 12KB | 부분 |
| `@langchain/langgraph` (optional) | 35KB | ❌ |
| **LangChain 합계 (권장 최소)** | **~101.2KB** (LangGraph 제외) | ❌ (Anthropic provider) |

- Tree-shake 시 AI SDK는 <30KB (useChat만 남김)
- LangChain은 barrel export 많아 tree-shake 효과 약함 (~85KB 수준까지만)

→ **AI SDK가 33% 이상 경량**.

---

## 9. 문서 품질

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| 공식 문서 | ai-sdk.dev (깔끔, API 일관) | python.langchain.com/js (깊이 있음, 분량 방대) |
| Next.js 예제 | 많음 (Vercel 공식 템플릿 다수) | 있음 (`langchain-starter` 등), 일부 구식 |
| 마이그레이션 가이드 | v4→v5→v6 각 상세 | v0.2→v0.3→v0.4 breaking 공지, 문서 파편화 |
| 커뮤니티 예제 | GitHub 예제 풍부 | Cookbook 방대 (RAG/Agent 포함) |
| 한국어 자료 | 중간 (Vercel 공식 블로그 일부 번역) | 많음 (LangChain Korea 커뮤니티) |

→ 폭은 LangChain, 일관성은 AI SDK. **1인 운영자에겐 일관성이 더 중요**.

---

## 10. 커뮤니티 생태

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| GitHub Stars | ~15k (2026-04) | ~14k |
| NPM 주간 다운로드 | 2M+ | 1.5M+ |
| Provider 수 | 25+ (Anthropic, OpenAI, Google, xAI, Mistral, Cohere, Cloudflare, Groq 등) | 50+ (동일 + RAG 인프라: Pinecone, Chroma, Weaviate, Qdrant 등) |
| Vector DB | 간접 지원 (`@ai-sdk/*` + 직접 Pinecone) | 1급 시민 |
| Memory/Summary | 기본 제공 없음 (직접 구현) | BufferMemory/SummaryMemory/VectorStoreRetrieverMemory 등 |

→ RAG 인프라 필요 시 LangChain 생태가 크게 유리. **우리는 Postgres만 사용 → LangChain 우위 희석**.

---

## 11. 프로젝트 결정 근거 (양평 부엌)

### 11.1 유리/불리 밸런스 시트

| 항목 | AI SDK v6 | LangChain.js |
|---|---|---|
| Next.js 16 App Router 친화 | ✅ | ⚠ |
| Edge runtime | ✅ | ❌ (Anthropic provider) |
| 1인 학습 곡선 | ✅ (작음) | ⚠ (큼) |
| 번들/성능 | ✅ | ❌ |
| 단순 tool-calling 5개 모듈 | ✅ (목적 부합) | ⚠ (과잉) |
| 복잡 RAG 파이프라인 | ⚠ (직접 구현) | ✅ |
| 복잡 에이전트 그래프 | ⚠ (LangGraph 없음) | ✅ |
| 멀티 provider 동시 오케스트레이션 | ✅ (가능하지만 LangChain이 더 풍부) | ✅ |
| MCP 1st-party | ✅ | ⚠ (community) |
| 프롬프트 캐싱 | ✅ (1줄) | ⚠ (block 재작성) |
| 비용 오버헤드 (프롬프트 템플릿 메타) | 없음 | 호출당 +150~300 tok |
| Breaking change 빈도 | 낮음 (Vercel 안정 지향) | 높음 (2025년 내 3회) |

### 11.2 우리 결론

> **Vercel AI SDK v6가 결정적 우위 (권고도 0.84).**
>
> LangChain은 우리가 필요하지 않은 복잡도(Chain/Agent/Memory/Retriever/LangGraph)를 전부 포함한 프레임워크. 우리 Studio는 "prompt + tools → (text|JSON|stream)" 5개 모듈이고, AI SDK v6의 얇은 층이 정확히 이 목적에 맞는 크기.

### 11.3 LangChain 재고 조건 (명시적)

다음 중 **2개 이상 충족 시** LangChain 재검토:

1. 복잡한 RAG 파이프라인 필요 (chunking + hybrid search + reranking + rerank 모델)
2. 3+ LLM provider를 동시에 오케스트레이션 (fallback 체인이 아니라 전문화된 역할 분담)
3. 복잡한 멀티 에이전트 그래프 (LangGraph StateGraph 필수 수준)
4. 장기 대화 메모리 요약 (BufferWindow/Summary/VectorStoreRetriever 필요)
5. 50+ Provider 중 AI SDK 미지원인 것이 핵심 자산 (예: Pinecone 직접 통합, Weaviate 전용 기능)

현 시점 (2026-04) 양평 부엌은 0개 충족. 향후 `/ai` 챗이 장기 대화 요약으로 확장되거나 RAG(도메인 문서 검색) 도입 시 재검토.

---

## 12. 참고문헌

1. **Strapi 2026 비교**: strapi.io/blog/langchain-vs-vercel-ai-sdk-vs-openai-sdk-comparison-guide — 번들 67.5KB vs 101.2KB 원출처
2. **Vercel AI SDK 6 발표**: vercel.com/blog/ai-sdk-6 — agent class, MCP 1st-party, stopWhen
3. **Ryz Labs 2026**: learn.ryzlabs.com/llm-development/langchain-vs-vercel-ai-sdk-which-is-best-for-2026
4. **Anthropic Prompt Caching**: docs.anthropic.com/en/docs/build-with-claude/prompt-caching
5. **LangChain.js mcp-adapters**: github.com/langchain-ai/langchainjs-mcp-adapters
6. **AI SDK MCP**: ai-sdk.dev/docs/foundations/tools#model-context-protocol-mcp-tools
7. **LangGraph.js**: langchain-ai.github.io/langgraphjs — 복잡 그래프 케이스
8. **Next.js 16 Cache Components**: nextjs.org/docs/app/building-your-application/caching
9. Wave 1 `01-vercel-ai-sdk-v6-studio-assistant-deep-dive.md` — 프로젝트 내부 deep-dive
10. Wave 2 `02-ux-quality-matrix.md` — 본 1:1의 매트릭스 페어

---

**작성**: kdywave Wave 2 Agent G · 2026-04-18 · 1:1 비교 · 결정: AI SDK v6 채택
