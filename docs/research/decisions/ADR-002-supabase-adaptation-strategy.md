---
id: ADR-002
title: Supabase 프로젝트 관리 체계 이식 전략
status: Accepted
date: 2026-04-12
session: 14
deciders: [김도영, Claude Code]
supersedes: []
related:
  - ADR-001-frontend-design.md
  - ../../references/_SUPABASE_TECH_MAP.md
  - ../../references/_PROJECT_VS_SUPABASE_GAP.md
---

# ADR-002 — Supabase 프로젝트 관리 체계 이식 전략

상위: [../\_SPIKE\_CLEARANCE.md](../_SPIKE_CLEARANCE.md) → **여기**

## Status

**Accepted** (세션 14, 2026-04-12)

## Context

사용자가 Supabase 대시보드 13개 페이지를 드래그 스크랩으로 제공하며, 이 관리 체계를 "양평 부엌 서버 대시보드"(Next.js 16 + Prisma 7 + PostgreSQL + WSL2/PM2, Cloudflare Tunnel로 공개)로 이식을 요청함.

현 프로젝트는 자체 호스팅 단일 서버이며, 이미 Auth/Storage(파일박스)/Observability(metrics/logs)/Audit/Settings 상당 부분을 Supabase와 다른 방식으로 직접 구현 완료. Supabase의 **OSS 스택 전체**(PostgREST/GoTrue/storage-api/realtime/pg_graphql/Logflare 등)를 그대로 재현할 필요는 없고, UI 패턴과 관리 기능을 선별 이식해야 함.

## Options Considered

### Option A — Supabase 전체 스택을 self-host
`supabase/supabase` 공식 Docker Compose를 WSL2에 띄우고 애플리케이션을 붙이는 방식.
- ✅ 100% 호환
- ❌ Kong/PostgREST/GoTrue/Storage/Realtime/Studio 6개 컨테이너 추가 운영비(RAM 2GB↑, 복잡한 장애 지점)
- ❌ 현 프로젝트의 자체 구현(Prisma, 파일박스, 세션 기반 로그인)과 중복·충돌
- ❌ Cloudflare Tunnel 한 엔드포인트 뒤에서 멀티 서비스 라우팅 추가 작업

### Option B — Supabase UI를 **코드 학습**, 백엔드는 **Next.js 네이티브 재구현**
monaco/xyflow/splinter 등 핵심 오픈소스만 가져오고, DB 연결·RLS·Advisor 규칙은 Prisma+pg로 재작성.
- ✅ 현 스택(단일 Next.js 앱) 유지
- ✅ 번들·운영 비용 최소
- ✅ 필요한 기능만 선별(P0 11개)
- ❌ Supabase 공식 업데이트를 못 따라감 (의도된 trade-off)

### Option C — PostgREST만 사이드카로 추가, 나머지는 자체 구현
Data API 부분만 PostgREST 프로세스를 띄우고 나머지는 Option B.
- ✅ PostgREST의 filter DSL(`?col=eq.value`) 공식 호환
- ❌ Haskell 바이너리 추가 운영, 3개 모델(User/Folder/File)에 과도함
- ❌ RLS를 제대로 쓰려면 PG 롤 재설계 필요

## Decision

**Option B — Supabase UI를 학습, 백엔드는 Next.js 네이티브 재구현.**

구체 지침:
1. **UI**: `@monaco-editor/react`, `@xyflow/react`, `elkjs`, shadcn/ui 기존 세트만 추가 도입. Supabase Studio 코드는 **패턴 학습 용도**(AGPL 라이선스 고려, 코드 복붙 금지).
2. **DB 린트**: `supabase/splinter`의 PL/pgSQL 규칙 로직을 TS로 포팅하여 `src/lib/advisors/rules/*.ts`에 배치. 원본은 참조만, 실제 실행은 Node+Prisma.
3. **SQL Editor**: Prisma `$queryRawUnsafe` 사용 금지. 별도 `pg` 풀에 **`app_readonly` PostgreSQL 롤**로 연결하여 실행. `BEGIN READ ONLY` 트랜잭션 + `statement_timeout` + Zod 스키마 검증.
4. **Edge Functions**: Deno 도입 금지. `node:worker_threads` + `node:vm` + `resourceLimits`로 lite 모드 구현. 외부 네트워크는 `safeFetch` 화이트리스트. ADMIN 전용 UI.
5. **Data API**: PostgREST 사이드카 미도입. Prisma DMMF + Next.js `[table]` 동적 라우트로 자체 구현. 테이블 allowlist + 컬럼 프로젝션(`passwordHash` 영구 제외) + operator parser 9개.
6. **Realtime**: 기존 SSE 인프라(`/api/sse/logs`, `/api/metrics/stream`) 재사용. Channels 추상화는 in-memory EventEmitter + 채널 필터.
7. **Log Drains**: `vector`/`fluentbit` 대신 자체 batch 워커(`setInterval` + fetch to HTTP endpoint / Loki).
8. **Vault / Wrappers / GraphQL / Queues / MFA / Custom Reports**: P1/P2로 보류.

## Consequences

### Positive
- 단일 Next.js 프로세스 유지 → WSL2 리소스 안정
- 기존 RBAC·audit 로깅·SSE 인프라 그대로 재사용
- 신규 의존성 4~5개만 추가(`@monaco-editor/react`, `@xyflow/react`, `elkjs`, `isolated-vm`(선택), `node-cron`)
- Cloudflare Tunnel 엔드포인트 변경 없음
- 기능별로 Prisma 모델(SqlQuery/EdgeFunction/Webhook/CronJob/ApiKey/LogDrain) 추가만 하면 되므로 마이그레이션 충돌 리스크 낮음

### Negative / Risks
- Supabase 호환성 부재 — 사용자가 추후 Supabase로 옮긴다면 이식 작업 필요
- splinter 규칙 포팅은 수동 작업 — 규칙 누락 가능성. P0에서는 TOP 5만 포팅.
- Schema Visualizer는 Prisma 3개 + Drizzle 3개만 가시화 (자동 갱신은 수동 Refresh 버튼)
- Edge Functions lite는 **내부 전용**. 외부에 노출하면 SSRF/자원 고갈 리스크 — UI에서 ADMIN 외 접근 차단 필수.

### Mitigations
- PG 롤 `app_readonly`는 사용자가 수동 `CREATE ROLE`로 먼저 발급(L0 지침 문서화)
- `prisma migrate deploy`는 **사용자 승인 후** 실행(계획에 명시)
- vm2 대신 `node:vm`, 장기적으로 `isolated-vm` 업그레이드 경로 문서화
- 프로덕션 데이터베이스 백업 UI는 dev DB 한정, 프로덕션 타겟 시 경고 배너

## References

- 스크랩 원본: [../../references/supabase-scrape/\_index.md](../../references/supabase-scrape/_index.md)
- 기술 매핑: [../../references/\_SUPABASE\_TECH\_MAP.md](../../references/_SUPABASE_TECH_MAP.md)
- 갭 분석: [../../references/\_PROJECT\_VS\_SUPABASE\_GAP.md](../../references/_PROJECT_VS_SUPABASE_GAP.md)
- 스파이크 결과:
  - [spike-005-sql-editor.md](../spikes/spike-005-sql-editor.md)
  - [spike-005-schema-visualizer.md](../spikes/spike-005-schema-visualizer.md)
  - [spike-005-advisors.md](../spikes/spike-005-advisors.md)
  - [spike-005-edge-functions.md](../spikes/spike-005-edge-functions.md)
  - [spike-005-data-api.md](../spikes/spike-005-data-api.md)
- 구현 계획: `C:\Users\smart\.claude\plans\indexed-knitting-reef.md`
