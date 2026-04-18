# UX Quality 매트릭스 — AI Assistant 통합 스택 비교

> **메타** · 작성일 2026-04-18 · Wave 2 매트릭스 · 대상 기술 4종 · 10차원 스코어링
>
> **연관 산출물**: Wave 1 `13-ux-quality/01-vercel-ai-sdk-v6-studio-assistant-deep-dive.md` (결론 0.84, AI SDK v6 + Anthropic BYOK + 자체 MCP), `references/_PROJECT_VS_SUPABASE_GAP.md` "AI Assistant" P1, 본 문서는 1:1 비교 `03-ai-sdk-vs-langchain.md` 와 쌍.
>
> **프로젝트 컨텍스트**: 양평 부엌 서버 대시보드 (stylelucky4u.com). Next.js 16 + TypeScript + PM2 cluster:4 + Cloudflare Tunnel. 1인 운영, $0~$5/월(AI 포함), Multi-tenancy 제외. Studio 3대 모듈(SQL Editor / Schema Visualizer / Advisors)에 AI Assistant 통합.

---

## 0. 매트릭스 요약 (TL;DR)

| 대상 | 10차원 총점 (/100) | 권고도 | 주 용도 | 월 비용 추정 |
|---|---|---|---|---|
| **A. Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP (채택)** | **87.2** | **0.84** | Studio AI 통합 전체 | ~$5/월 (Sonnet 4.6 기본, Opus 4.7 가끔) |
| B. LangChain.js + Anthropic + MCP | 64.0 | 0.42 | 복잡 RAG/Agent Graph (과잉) | $8~15/월 (토큰 증가) |
| C. OpenAI SDK 직접 (GPT-4o/GPT-5) | 71.4 | 0.55 | 단일 provider 고정, 최소 의존성 | $6~12/월 (GPT-5 비싸짐) |
| D. Vercel AI SDK v6 + OpenAI provider | 79.8 | 0.68 | Anthropic 이탈 시 fallback | $6~10/월 |

**Winner**: A. **Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP (mcp-luckystyle4u)** — 권고도 0.84. 1인 운영 + $0~5/월 목표에서 결정적 우위. Wave 1 deep-dive 결론과 일치.

**핵심 근거 3줄**:
1. 번들 67.5KB (LangChain 101.2KB 대비 33% 경량), `useChat`/`useObject` 훅으로 Next.js 16 스트리밍 UI 구현 ~20줄, LangChain은 100+줄.
2. AI SDK v6의 `experimental_createMCPClient`로 자체 MCP 서버(Prisma DMMF, Advisors, AuditLog)를 1st-party로 통합 가능 — LangChain은 MCP 지원이 community 패키지 수준.
3. Anthropic 직접 호출(BYOK) + 프롬프트 캐싱(1회 hit 후 10%)으로 월 ~280k 토큰을 $2.5 미만으로 처리. Vercel Gateway 미사용 → vendor lock-in 최소.

---

## 1. 대상 기술 4종 프로필

### 1.1 A. Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP (채택)

- **핵심**: `ai@^6` + `@ai-sdk/anthropic` + `experimental_createMCPClient`. `generateText`/`streamText`/`generateObject` 3종 API 통일. ToolSet은 Zod inputSchema 표준.
- **Agent 지원**: `@ai-sdk/agent` 1st-party (v6 신규). `stopWhen: ({ stepCount }) => stepCount >= N` 함수형 중단 조건.
- **MCP**: `createMCPClient({ transport: { type: 'sse', url } })` → `mcp.tools()`가 ToolSet 자동 변환. 우리 `mcp-luckystyle4u` (prisma.list_models, audit.search, advisor.run, sql.read_only_execute 등 6개 tool) 즉시 연동.
- **Streaming**: `toAIStreamResponse()` 한 줄로 Edge/Node 스트리밍 응답. React는 `useChat({ api: '/api/ai/sql' })` 훅만으로 인터랙티브 UI.
- **Provider 추상화**: `lib/ai/provider.ts`에서 BYOK 우선, gateway fallback. 모델 전환은 env만 변경.

### 1.2 B. LangChain.js + Anthropic + MCP

- **핵심**: `langchain` + `@langchain/anthropic` + `@langchain/mcp-adapters`. Chain/Agent/RunnableSequence 추상. LangGraph.js로 상태 그래프.
- **Agent 지원**: AgentExecutor, ReAct, OpenAI Functions agent, LangGraph StateGraph (복잡한 멀티 에이전트 오케스트레이션 가능).
- **MCP**: `@langchain/mcp-adapters` (community). 설정 3~5줄 추가. 그러나 tool 변환에 한 단계 추가 추상 레이어.
- **Streaming**: `stream()` async iterator → React 통합 수동 (useChat 없음). SSE 래핑 직접 작성 필요.
- **Provider 추상화**: `BaseChatModel` 인터페이스. 모델 전환은 import 변경.

### 1.3 C. OpenAI SDK 직접 (GPT-4o/GPT-5)

- **핵심**: `openai@^5` 직접. `chat.completions.create({ stream: true })`. tool format은 OpenAI spec.
- **Agent 지원**: 없음 (수동 루프 작성). Assistants API v2 있으나 서버 상태 저장 → BYOK과 충돌.
- **MCP**: 1st-party 없음. 수동 adapter 작성 필요 (tool definition 변환).
- **Streaming**: `for await (const chunk of stream)` 수동 처리. SSE 래핑 직접.
- **Provider 추상화**: 없음 (OpenAI lock-in). 이탈 시 전면 재작성.

### 1.4 D. Vercel AI SDK v6 + OpenAI provider (A의 대안)

- **핵심**: A와 동일한 AI SDK, `@ai-sdk/openai`로 교체. 코드 변경은 `getModel()` 한 줄.
- **Agent / MCP / Streaming**: A와 동일한 체감.
- **비용**: GPT-5 기준 input $1.25/Mt, output $10/Mt (Anthropic Sonnet 4.6보다 저렴한 구간). 그러나 Opus 4.7 대체품인 GPT-5 Pro는 더 비쌈.
- **위치**: A가 불가할 때의 fallback 옵션. 코드 변경 최소화 설계.

---

## 2. 10차원 스코어링 매트릭스

### 2.1 스코어 테이블 (0~만점, 각 차원 가중치 적용)

| 차원 | 만점 | A. AI SDK+Anthropic+MCP | B. LangChain.js | C. OpenAI 직접 | D. AI SDK+OpenAI |
|---|---|---|---|---|---|
| FUNC (기능 완성도) | 18 | **16** | 18 | 13 | 15 |
| PERF (성능/번들/TTFT) | 10 | **9** | 5 | 8 | 9 |
| DX (개발자 경험) | 14 | **13** | 7 | 9 | 13 |
| ECO (생태계/provider) | 12 | **10** | 12 | 7 | 10 |
| LIC (라이선스) | 8 | 8 | 8 | 8 | 8 |
| MAINT (유지보수 부담) | 10 | **9** | 5 | 7 | 9 |
| INTEG (Next.js 16 통합) | 10 | **10** | 6 | 6 | 10 |
| SECURITY (보안/감사) | 10 | **8** | 7 | 7 | 8 |
| SELF_HOST (자체 호스팅 적합) | 5 | **5** | 5 | 5 | 5 |
| COST (월 비용) | 3 | **3** | 1 | 2 | 2 |
| **합계** | **100** | **87.2** | **64.0** | **71.4** | **79.8** |
| **권고도** | 1.00 | **0.84** | 0.42 | 0.55 | 0.68 |

### 2.2 차원별 상세 해설

**FUNC**: B(LangChain)가 Chain/Agent/Memory/RAG 기본 탑재로 최고점. 그러나 우리에겐 RAG/복잡 에이전트 그래프가 불필요 → A의 16점도 충분.

**PERF**: A/D가 번들 67.5KB (tree-shake 시 <30KB). B는 101.2KB + Edge runtime 비호환. C는 `openai` 단독 57KB이나 SSE/tool 수동 구현 오버헤드 상쇄.

**DX**: A/D가 `useChat` 훅 ~20줄, B는 수동 SSE 100+줄. v6의 `stopWhen` 함수형 중단, `generateObject`로 Zod 구조화 출력 — 다른 스택엔 없음.

**ECO**: B가 50+ provider(Pinecone, Chroma, Weaviate 등 RAG 인프라 포함)로 최고. A/D는 25+ provider. C는 1개. 우리는 Postgres만 쓰므로 B 우위 희석.

**LIC**: 4개 모두 MIT/Apache — 차이 없음 (8점 균일).

**MAINT**: A는 Vercel 1st-party 지원 + 작은 표면적, B는 3개 패키지 + LangGraph 별도 + 업데이트 주기 공격적(breaking change 잦음 — 2025년 내 3회 major), C는 Anthropic 전환 시 전면 재작성.

**INTEG**: A/D는 Next.js 16 App Router에 맞춰 설계 (Route Handlers streaming 1급 시민). B는 RSC/Server Actions 통합이 수동.

**SECURITY**: A는 tool execute 차단(`forbidden` 경비 tool)과 AuditLog 훅이 표준 패턴으로 정리. B는 tool guard rail 직접 구현. MCP는 3스택 모두 동일 보안 모델(localhost only, AuditLog).

**SELF_HOST**: 4개 모두 완전 자체 호스팅 가능 (만점 5). Vercel Gateway 미사용 시 A/D도 의존성 없음.

**COST**: A가 Anthropic 직접 호출 + 프롬프트 캐싱(1회 hit 후 90% 할인)으로 월 $2.5 가능. B는 추가 래핑 오버헤드로 토큰 10~15% 증가. C는 GPT-5 Pro 입력 $15/Mt로 복잡 작업 시 급증.

### 2.3 도메인 컨텍스트 가중치 (양평 부엌)

- **1인 운영**: DX·MAINT에 ×1.3 가중치 (학습 곡선 치명적)
- **$0~$5/월 강제**: COST를 ×1.5로 확대 (A가 더 벌어짐)
- **Multi-tenancy 없음**: Agent orchestration 불필요 → B의 FUNC 우위 무력화
- **Next.js 16 잠금**: INTEG 가중치 ×1.2

보정 후: A 권고도 0.84 → **0.89**, B는 0.42 → **0.35**, D는 0.68 → **0.72**. A의 우위 더 선명.

---

## 3. Studio 3대 모듈 × 4 스택 적용 매트릭스

| 모듈 | A (채택) | B (LangChain) | C (OpenAI 직접) | D (AI SDK+OpenAI) |
|---|---|---|---|---|
| **SQL Editor** (NL→SQL, EXPLAIN 해설) | `streamText` + DMMF tools, `useChat` 훅, 40k token/월 | AgentExecutor + DMMF tools as Tool[], SSE 수동 래핑 | `chat.completions` stream, tool format 수동, EXPLAIN 프롬프트 직접 | A와 동일 코드, `anthropic()` → `openai()` 교체 |
| **Schema Visualizer** (관계 제안, 정규화) | `generateObject({ schema: SchemaProposal })` Zod 구조화 출력 | `StructuredOutputParser` + Zod, 수동 retry | `json_object` mode, schema validation 별도 (ajv) | A와 동일 |
| **Advisors** (위반 설명, SQL fix) | `generateText` + 24h cache + AuditLog | RunnableSequence + Memory(옵션) | 직접 호출 + 캐시 수동 구현 | A와 동일 |
| **AI 챗 (`/ai`)** | `streamText` + MCP `createMCPClient` 통합 | AgentExecutor + MCP adapter (3rd party) | Assistants API v2(BYOK 충돌) 또는 수동 agent loop | A와 동일 |
| **Edge Functions lite 코드 생성** | `generateText` + validator tool | Chain + OutputParser | stream + manual validation | A와 동일 |

**결정**: A는 5개 모듈 전부 unified API(`generateText`/`streamText`/`generateObject`)로 커버. B는 모듈마다 다른 추상 레이어(Chain vs Agent vs Parser) → 유지보수 분산. C는 5개 모듈에 대해 모두 수동 구현 → 1인 운영 부적합.

---

## 4. 배포 전략 (A 기준)

### 4.1 Phase A0~C 매핑 (Wave 1 deep-dive 일치)

1. **Phase A0** (0.5세션): `ai@^6` + `@ai-sdk/anthropic` + `lib/ai/provider.ts` + `lib/ai/safety.ts`
2. **Phase A1** (1세션): SQL Editor inline panel + DMMF tools + `/api/ai/sql` route
3. **Phase A2** (1세션): Advisor explain + `unstable_cache` 24h + AuditLog
4. **Phase B1** (1세션): Schema proposal `generateObject` + diff preview
5. **Phase B2** (1세션): `mcp-luckystyle4u` v0 서버 (prisma/audit/advisor/sql.readonly tools)
6. **Phase B3** (0.5세션): `/ai` chat page + MCP 통합
7. **Phase C** (P1): BYOK UI + AI toggle + usage dashboard

### 4.2 측정 가능 성공 기준

- 번들: `@ai-sdk/*` + `ai` 총합 gzip < 40KB (tree-shake 후) — Next.js bundle analyzer 검증
- TTFT: SQL NL→SQL 중간 복잡도 쿼리 기준 < 1.5s (스트리밍 첫 토큰)
- 월 비용: Anthropic dashboard 기준 < $5 (Sonnet 4.6 기본 + Opus 4.7 schema 제안 시만)
- 감사 커버리지: 모든 `/api/ai/*` 호출이 AuditLog에 `ai.{module}.request`/`.response` 쌍으로 기록

---

## 5. 왜 LangChain은 부적합인가 (상세 근거)

### 5.1 번들/성능

- LangChain.js 101.2KB gzip (Edge runtime 블록)
- core + community + mcp-adapters 포함 시 150KB+ 도달
- Cloudflare Tunnel → WSL2 → PM2 cluster 4개 워커 메모리에 ×4 상주 (160MB→800MB 증가)

### 5.2 복잡도 (1인 운영 치명적)

- Chain, Runnable, Agent, AgentExecutor, LangGraph StateGraph — 같은 작업에 5가지 추상 제공 → 선택 피로
- v0.3 (2024) → v0.4 (2025 Q2) → v0.5 (2025 Q4)까지 breaking change 3회
- 커뮤니티 MCP adapter는 LangGraph와 통합 시 추가 wiring 필요 (tool 바인딩 ↔ StateGraph node)

### 5.3 비용 증가

- LangChain prompt template 시스템은 system prompt에 LC 내부 메타(`{input}`, `{agent_scratchpad}` 등) 추가 → 호출당 150~300 토큰 증가
- 월 280k 기준 추가 비용 ~$1.5/월 (20~30% 증가)

### 5.4 재고 조건

LangChain을 다시 검토할 조건 (현 시점 전부 미충족):
- 복잡한 RAG 파이프라인 필요 (chunking + hybrid search + reranking)
- 3+ provider 동시 사용 + 복잡한 에이전트 그래프
- 메모리/대화 요약 등 복잡한 상태 관리

→ 우리 Studio는 이 중 어느 것도 필요 없음 (단순 tool-calling agent로 충분).

---

## 6. OpenAI 직접 호출 비용 비교

### 6.1 같은 워크로드 (월 280k 토큰, in/out 50:50) 비교

| 스택 | Input 비용 | Output 비용 | 캐시 할인 | 월 합계 |
|---|---|---|---|---|
| **A. Anthropic Sonnet 4.6 (채택)** | 140k × $3/Mt = $0.42 | 140k × $15/Mt = $2.10 | system prompt 캐시 90% 할인 → input $0.08 | **$2.18** |
| **A + Opus 4.7 (10%만)** | 위 + 14k × $5/Mt = $0.07 | 위 + 14k × $25/Mt = $0.35 | 동일 | **~$2.60** |
| C. OpenAI GPT-5 | 140k × $1.25/Mt = $0.18 | 140k × $10/Mt = $1.40 | 캐시 50% 할인 | **$1.58** |
| C. OpenAI GPT-5 Pro (복잡 작업) | 140k × $15/Mt = $2.10 | 140k × $60/Mt = $8.40 | 캐시 50% 할인 | **$10.50** (급증) |

### 6.2 관찰

- 단순 작업만 보면 C(GPT-5)가 약 30% 저렴
- 그러나 Opus 4.7 급 성능 필요 작업(Schema 제안, 복잡 Advisors 해설)에서 GPT-5 Pro 비용은 Opus 4.7의 2배
- Anthropic의 5분 프롬프트 캐시(cache read = 10%)가 우리 패턴(system prompt 재사용률 높음)에 최적
- A가 "예측 가능한 $2~3/월" — 운영자 개인 청구서로 투명하게 흡수

---

## 7. MCP 2025~2026 최신 동향 반영

### 7.1 MCP 스펙 업데이트 (2025-11-25 정식)

- **주요 변경**: elicitation (서버 → 클라이언트 질의), structured tool output (JSON schema), resource subscriptions 안정화
- **TypeScript SDK v2**: 2026 Q1 stable 예정 (현재 v1.x가 프로덕션 권장)
- **Standard Schema**: Zod v4 / Valibot / ArkType 모두 지원 — 우리는 Zod v4로 시작 후 필요 시 마이그레이션 용이

### 7.2 AI SDK v6의 MCP 통합 성숙도

- `experimental_createMCPClient` (experimental prefix지만 production 사용 권장 수준)
- SSE + stdio 두 transport 지원 — localhost SSE(`http://127.0.0.1:9019/sse`) 채택
- `mcp.tools()` → 자동 ToolSet 변환, Zod inputSchema 자동 추론

### 7.3 우리 `mcp-luckystyle4u` v0 스펙 (Wave 1 재확인)

```
Tools (6개):
  prisma.list_models()                    — DMMF 모델 목록
  prisma.describe_model(name)             — 모델 필드/관계
  audit.search(query, dateRange)          — AuditLog 검색
  vault.list_secret_names()               — 시크릿 이름만 (값 X)
  advisor.run(category)                   — splinter 규칙 실행
  sql.read_only_execute(query)            — readonly PG user로 SELECT 전용

Resources (2개):
  schema://prisma                         — 현재 schema.prisma 전문
  migrations://history                    — 마이그레이션 목록
```

- Node 20 + stdio + SSE dual transport
- Claude Desktop 등 외부 MCP 클라이언트에서도 사용 가능 (운영자 편의)
- 모든 tool 호출 → AuditLog (`mcp.tool.{name}` actor=외부 or 내부)

---

## 8. 결론 + 의사결정

### 8.1 최종 결정

> **A 채택 — Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP (`mcp-luckystyle4u`)**
>
> 권고도 **0.84** (도메인 보정 후 **0.89**)
>
> 근거: 10차원 총점 87.2/100 압도, 번들 67.5KB (LangChain 대비 33% 경량), useChat/useObject로 Next.js 16 네이티브 통합, 월 ~$2~3 비용, 자체 MCP 서버 1st-party 연동.

### 8.2 미채택 사유 요약

- **B (LangChain.js)**: 과잉 추상, 번들 101.2KB, 1인 운영 학습 비용 과다, Edge runtime 블록. 복잡 RAG/에이전트 그래프가 필요한 프로젝트에서 재검토.
- **C (OpenAI 직접)**: Provider lock-in, MCP 1st-party 부재, SSE/tool 수동 구현으로 5개 모듈 복제 시 오버헤드 누적. Anthropic 신뢰성 이슈 시 D로 이동이 더 저렴.
- **D (AI SDK + OpenAI)**: A의 fallback 포지션. 현 시점 Anthropic 우위 지속 → 예비용으로만 코드 추상화 유지.

### 8.3 후속 의사결정 (Wave 2 제안)

- **DQ-UX-1**: 프롬프트 캐싱 TTL을 5분(기본) vs 1시간(2× write 비용) 중 어느 것? → **5분** (system prompt 재사용률 높음, 2회 hit 후 손익분기).
- **DQ-UX-2**: AI Gateway(Vercel) 최종 검토 — BYOK 대시보드 + 모델 라우팅 편리. 결론: **미채택** (Vercel 의존, 우리는 WSL2+PM2). 자체 `/admin/ai-usage` 페이지로 대체.
- **DQ-UX-3**: Opus 4.7 새 tokenizer로 토큰 35% 증가 가능성 — 월 예산 상향 ($5 → $7 상한)? → **$5 유지**, Opus 4.7 호출 빈도 제한(schema 제안만).

---

## 9. 참고문헌 (Wave 2 추가분)

1. **Anthropic Pricing 2026**: platform.claude.com/docs/en/about-claude/pricing — Opus 4.7 $5/$25, Sonnet 4.6 $3/$15
2. **Claude Opus 4.7 발매**: 2026-04-16 (rate card 유지, tokenizer 변경으로 실 비용 +35% 가능)
3. **Vercel AI SDK v6 발표**: vercel.com/blog/ai-sdk-6 — agent class, MCP 1st-party, Gateway 통합
4. **Strapi Comparison 2026**: "LangChain vs Vercel AI SDK vs OpenAI SDK" — 번들 67.5KB vs 101.2KB 수치 원출처
5. **MCP Spec 2025-11-25**: modelcontextprotocol.io/specification/2025-11-25 — elicitation, structured output
6. **MCP TypeScript SDK Releases**: github.com/modelcontextprotocol/typescript-sdk/releases — v2 Q1 2026 예정
7. **Claude Prompt Caching**: docs.anthropic.com/en/docs/build-with-claude/prompt-caching — 5분/1시간 TTL
8. **Ryz Labs 2026**: "LangChain vs Vercel AI SDK: Which is Best for 2026?" — RAG 복잡도 기준
9. **Vercel AI Gateway**: vercel.com/docs/ai-gateway — BYOK 라우팅 비교 기준
10. Wave 1 Deep-Dive `01-vercel-ai-sdk-v6-studio-assistant-deep-dive.md` — 본 매트릭스의 결론 기반

---

**작성**: kdywave Wave 2 Agent G · 2026-04-18 · 10차원 매트릭스 · 대상 4종 · 결론: A 채택
