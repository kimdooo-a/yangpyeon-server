# Spikes — 기술 검증 기록

> 상위: [CLAUDE.md](../CLAUDE.md) → [MASTER-DEV-PLAN.md](../docs/MASTER-DEV-PLAN.md) → **여기**

## SPIKE 검증 결과 요약

| SPIKE | 주제 | 결과 | 검증일 | 상세 |
|-------|------|------|--------|------|
| 01 | SQLite + Drizzle + Next.js | ✅ Go | 2026-04-06 | [결과](./spike-001-sqlite-drizzle-result.md) |
| 02 | SSE + Cloudflare Tunnel | ✅ Go | 2026-04-06 | [결과](./spike-002-sse-result.md) |
| 04 | shadcn/ui 다크 테마 호환 | ✅ Go | 2026-04-06 | [결과](./spike-004-shadcn-result.md) |

## 디자인 스파이크

| # | 주제 | 결과 | 상세 |
|---|------|------|------|
| 001 | 프론트엔드 디자인 리서치 | ✅ Go | [findings](./spike-001-frontend-design/findings.md), [ADR-001](../docs/research/decisions/ADR-001-frontend-design.md) |

## 핵심 발견 사항 (Quick Reference)

### SPIKE-01: SQLite + Drizzle
- `serverExternalPackages: ['better-sqlite3']` 필수
- WAL 모드 + `busy_timeout=5000` 설정
- PM2 단일 인스턴스 모드 호환, 클러스터 모드는 읽기만 안전

### SPIKE-02: SSE
- 필수 헤더: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`
- `export const dynamic = 'force-dynamic'` 필수
- Cloudflare Tunnel 네이티브 SSE 지원 확인
- 인증: 쿠키 기반 권장 (EventSource가 쿠키 자동 전송)

### SPIKE-04: shadcn/ui
- `.dark` CSS 변수를 기존 surface/brand 색상으로 재매핑 필요
- `tailwind.config.ts` 충돌 없음 (TW4는 `@theme inline` 사용)
- 커스텀 컴포넌트와 `src/components/ui/`에서 공존 가능
