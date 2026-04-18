---
skill: kdywave
status: in-progress
last_completed_phase: 1
last_completed_wave: 0
started: 2026-04-18T08:38:00+09:00
scale: L
total_waves: 5
output_dir: docs/research/2026-04-supabase-parity/
---

# kdywave 체크포인트 — Supabase 100점 동등성 연구

## 프로젝트 프로필

| 항목 | 값 |
|------|-----|
| 프로젝트명 | yangpyeong-dashboard-supabase-parity |
| 설명 | 양평 부엌 서버 대시보드를 Supabase 100점 동등성으로 끌어올리기 위한 카테고리별 연구 |
| 유형 | web-app (자체호스팅 관리 대시보드, Supabase OSS 클론) |
| 플랫폼 | linux/wsl2 + Cloudflare Tunnel |
| 규모 | L (카테고리 14, 미확정 영역 9, 1인 운영) |
| 확정 기술 | Next.js 16, TypeScript, PostgreSQL/Prisma 7, SQLite/Drizzle, Tailwind 4, shadcn/ui, jose, bcrypt, PM2, Cloudflare Tunnel, Monaco, xyflow/elkjs, Recharts, TanStack Table, Sonner |
| 미확정 영역 | MFA(otplib/WebAuthn), OAuth Providers, Rate Limit(Redis/DB), Postgres CDC(wal2json/ElectricSQL), S3 호환(MinIO/Garage/SeaweedFS), Edge runtime v2(isolated-vm/Deno), GraphQL(pg_graphql/PostGraphile), Queues(pgmq/BullMQ), Vault(pgsodium/custom) |
| 특수 요구 | 보안 강화, 1인 운영, Cloudflare Tunnel 환경, Multi-tenancy 의도적 제외 |
| 소스 | 이전 평가표(2026-04-18) + _PROJECT_VS_SUPABASE_GAP.md |

## 스코어링 프레임워크

기본: web-app 프리셋(FUNC18 / PERF12 / DX16 / ECO14 / LIC8 / MAINT12 / INTEG10) + 자체호스팅 보정(SEO/A11Y → SECURITY/SELF_HOST/COST 대체)

| 항목 | 가중치 | 정의 |
|------|--------|------|
| FUNC | 18% | Supabase 동등 기능 커버리지 |
| PERF | 10% | 응답속도/처리량/리소스 효율 |
| DX | 14% | API 직관성, 문서, 타입 지원 |
| ECO | 12% | 커뮤니티, 유지보수, 사례 |
| LIC | 8% | 상용 호환·재배포 |
| MAINT | 10% | 업그레이드 경로·breaking change |
| INTEG | 10% | Next.js 16 + Prisma 7 + WSL2 + Cloudflare Tunnel 호환 |
| SECURITY | 10% | OWASP, CVE 이력, 자체호스팅 보안 |
| SELF_HOST | 5% | 단일 서버에서 운영 가능 여부 |
| COST | 3% | $0/month 운영 가능성 |

총 100%, 5점 척도 × 14개 카테고리.

## Phase 0: 프로젝트 탐색 ✅
- 프로필 수집: 이전 평가표 + GAP 분석 + 메모리 인용
- 스코어링 결정: web-app 프리셋 + SECURITY/SELF_HOST/COST 추가
- 디렉토리 생성: docs/research/2026-04-supabase-parity/

## Phase 1: Wave 계획 수립 ✅
- 14 카테고리 확정
- DQ 1.x ~ 5.x 등록 (총 17개 + Wave 2~5 자동 등록)
- 마스터 인덱스 README.md 초안 완성
- 사용자 승인: L 규모 + 4개 사전 스파이크 우선 표시 (Postgres CDC, isolated-vm v2, MinIO, WebAuthn)

## Phase 2: Wave 실행 루프 🔄
### Wave 1: 기초 deep-dive 🔄 (~33 문서, Round 1+2 분할)
  - **Round 1 ✅ (5 Agent, 15 deep-dive, 12,862줄)** — 2026-04-18 09:09 완료
    - Storage: SeaweedFS 4.25 / Garage 3.72 / MinIO 3.09 → DQ-1.3 = SeaweedFS (40→90~95점)
    - Edge Functions: Deno embed 4.22 / isolated-vm v6 3.85 / Vercel Sandbox 3.55 → DQ-1.4 = 3층 하이브리드 (45→92~95)
    - Realtime: wal2json 4.05 / supabase-realtime port 3.95 / ElectricSQL 3.85 → DQ-1.5 = 01+03 하이브리드 (55→100)
    - Auth Advanced: WebAuthn 4.64 / TOTP 4.60 / Rate Limit 4.52 → DQ-1.1 = 동시 지원, DQ-1.2 = PostgreSQL/Prisma (15→60)
    - Table Editor: TanStack v8 + 14c-α 자체구현 (현 노선 유지) → DQ-1.9 답 (75→100, 14c-α/β/14d/14e 4단)
    - 사전 스파이크 4건 모두 "조건부 GO" 결론
    - 신규 DQ 15건 등록 (DQ-1.10~1.24, 글로벌 시퀀스)
  - **Round 2 🔄 (5 Agent, 18 deep-dive)** — 진행 중
    - F: SQL Editor (3) — sqlpad / outerbase / Supabase Studio 패턴
    - G: Schema Viz + DB Ops (4) — Prisma Studio + drizzle-kit / pg_cron + wal-g
    - H: Auth Core + Advisors (4) — Lucia + Auth.js v6 / splinter + squawk
    - I: Data API (3) — pg_graphql + PostGraphile + pgmq
    - J: Observability + UX + Operations (4) — pgsodium / Vercel AI SDK / GitHub Actions
### Wave 2: 비교 매트릭스 ⏳ (~28 문서)
### Wave 3: 비전·요구사항 ⏳ (~6 문서)
### Wave 4: 아키텍처 청사진 ⏳ (~14 문서)
### Wave 5: 로드맵·스파이크 ⏳ (~12 문서)

## Phase 3: Wave 검증 ⏳
## Phase 4: 완료 & 인계 ⏳
