---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: edge-functions
---

# 07. Edge Functions

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Edge Functions
Manage
Functions
Secrets
Edge Functions
Run server-side logic close to your users
Docs
Examples

Deploy a new function
Deploy your first edge function
Via Editor
Create and edit functions directly in the browser. Download to local at any time.

Open Editor
AI Assistant
Let our AI assistant help you create functions. Perfect for kickstarting a function.

Open Assistant
Via CLI
Create and deploy functions using the Supabase CLI. Ideal for local development and version control.

View CLI Instructions
Start with a template
Simple Hello World
Supabase Database Access
Supabase Storage Upload
Node Built-in API Example
Express Server
Stream text with AI SDK
Generate recipes with AI SDK
Stripe Webhook Example
Send Emails
Image Transformation
WebSocket Server Example
```

## 드러난 UI / 기능 목록

- **Manage**:
  - Functions — 함수 목록/로그/메트릭
  - Secrets — 함수에 주입되는 환경변수
- 3가지 생성 경로: **Via Editor / AI Assistant / CLI**
- **템플릿 카탈로그(11종)**: Hello World, DB Access, Storage Upload, Node built-in API, Express Server, AI SDK Stream, AI SDK Recipes, Stripe Webhook, Send Emails(Resend), Image Transformation(ImageMagick WASM), WebSocket Server

## 추론되는 기술 스택

- **Supabase Edge Runtime** — Deno 기반 격리 실행(`supabase/edge-runtime`)
- **배포 경로**:
  - Editor: 브라우저에서 작성 → 번들 → Deno Deploy-like 업로드
  - AI Assistant: Claude/GPT로 초안 생성
  - CLI: 로컬 개발 + `supabase functions deploy`
- **Secrets**: env 주입 — `Deno.env.get("KEY")` 접근
- **템플릿**: 공식 AI SDK(`ai-sdk.dev`), Stripe, Resend 등 주요 서비스와의 통합 예시 제공 → 초심자 친화
- **이 프로젝트로의 이식**: 
  - Deno 없이 **Node.js `worker_threads` + `node:vm` + resourceLimits**로 lite 버전
  - 화이트리스트 API(safeFetch 등) 주입
  - 상세는 [spike-005-edge-functions.md](../../research/spikes/spike-005-edge-functions.md) 참조
