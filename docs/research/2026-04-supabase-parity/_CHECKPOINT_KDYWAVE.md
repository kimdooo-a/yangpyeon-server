---
skill: kdywave
status: in-progress
last_completed_phase: 2
last_completed_wave: 3
started: 2026-04-18T08:38:00+09:00
wave_2_completed: 2026-04-18T17:30:00+09:00
wave_3_completed: 2026-04-18T15:41:00+09:00
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
### Wave 1: 기초 deep-dive ✅ (33 문서, ~26,941줄, 14 카테고리 전부)
  - **Round 1 ✅ (5 Agent, 15 deep-dive, 12,862줄)** — 2026-04-18 09:09 완료
    - Storage: SeaweedFS 4.25 / Garage 3.72 / MinIO 3.09 → DQ-1.3 = SeaweedFS (40→90~95점)
    - Edge Functions: Deno embed 4.22 / isolated-vm v6 3.85 / Vercel Sandbox 3.55 → DQ-1.4 = 3층 하이브리드 (45→92~95)
    - Realtime: wal2json 4.05 / supabase-realtime port 3.95 / ElectricSQL 3.85 → DQ-1.5 = 01+03 하이브리드 (55→100)
    - Auth Advanced: WebAuthn 4.64 / TOTP 4.60 / Rate Limit 4.52 → DQ-1.1 = 동시 지원, DQ-1.2 = PostgreSQL/Prisma (15→60)
    - Table Editor: TanStack v8 + 14c-α 자체구현 (현 노선 유지) → DQ-1.9 답 (75→100, 14c-α/β/14d/14e 4단)
    - 사전 스파이크 4건 모두 "조건부 GO" 결론
    - 신규 DQ 15건 등록 (DQ-1.10~1.24, 글로벌 시퀀스)
  - **Round 2 ✅ (5 Agent, 18 deep-dive, ~14,079줄)** — 2026-04-18 14:46 완료
    - F: SQL Editor — supabase-studio 4.70 / outerbase 4.06 / sqlpad 3.45 → 100점 4단(14c~14f, 40일)
    - G: Schema Viz + DB Ops — schemalint 4.42 / wal-g 4.41 / Trigger·Function 4.31 / node-cron 4.32 / 자체 RLS 4.18 → /database/{policies,functions,triggers} 신설, RPO 60초
    - H: Auth Core + Advisors — splinter port 4.00 / squawk+schemalint 3.88 / Lucia 패턴 3.50 / Auth.js 패턴 3.45 → 3-Layer Advisor + 자체 Session 테이블
    - I: Data API — pgmq 4.34 / PostGraphile 4.31 / pg_graphql 4.21 → pg_graphql 1순위(보류) + pgmq+SQLite 채택, 45→80~85
    - J: Observability + UX + Ops — node:crypto envelope 0.86 / JWKS 0.88 / AI SDK v6 0.84 / Capistrano 0.87 → 모두 단일 솔루션 채택
  - **Wave 1 종합 결론**:
    - DQ-1.1~1.9 모두 잠정 답변 확정
    - 신규 DQ 64건 등록 (Wave 2~5에서 답변)
    - **Compound Knowledge**: 카테고리는 "하이브리드 필수형(9)" vs "단일 솔루션형(5)" 두 그룹 — Wave 4 청사진의 분류 축

### Wave 2: 비교 매트릭스 + 1:1 비교 ✅ (28 문서, 18,251줄) — 2026-04-18 17:30 완료
  - **7 Agent 병렬 발사 (A~G, 각 4 문서)** — Round 단일, 평균 문서 651줄
    - A: Table + SQL Editor (3,133줄) — 14c-α 자체구현 4.54/5 유지, supabase-studio Apache-2.0 직접 인용 + outerbase 공개자료만 참조 "듀얼 참조"
    - B: Schema Viz + DB Ops (2,510줄) — schemalint+자체 4.30/5, Prisma Studio INTEG/SEC 각 -2.5 치명갭; node-cron+wal-g 4.36/5, pg_cron Node 핸들러 80% 비중으로 거부
    - C: Auth Core + Advanced (2,850줄) — Hybrid-Self 4.08/5, Lucia vs Auth.js 0.30 차이(양쪽 모두 라이브러리 거부, 패턴 15개 차용); TOTP/WebAuthn/RL 0.12 격차 동시채택, Phase 15~18 22h
    - D: Storage + Edge (3,393줄) — SeaweedFS+B2 90~95점, MinIO 2026-02-12 아카이빙+SigV4+AGPL VC로 명확 배제; 3층 하이브리드 `decideRuntime()` 라우팅 코드 제공
    - E: Realtime + Advisors (1,869줄) — wal2json(CDC) vs supabase-realtime 포팅(Channel) 계층이 다름; 3-Layer Advisor 시점(DDL/런타임) 자연 분리
    - F: Data API + Observability (2,625줄) — REST+pgmq 86.84점 80~85 즉시, pg_graphql 4개 수요트리거 중 2개+ 조건부; node:crypto+jose 92.54/94.20 KMS 대비 14~16점 우위, DQ-12.3 확정 (MASTER_KEY=/etc/luckystyle4u/secrets.env)
    - G: UX + Ops (1,871줄) — AI SDK v6 87.2점 LangChain 대비 33% 경량 월$2.5, Capistrano 89.0점 롤백 5초 다운타임 0초 Docker 이행 조건 0개 충족
  - **Wave 2 종합 결론**:
    - **Wave 1 채택안 100% 강화 확인** — 7개 카테고리 모두 민감도 분석상 1위 유지, 역방향 피드백 발생 없음
    - **DQ 답변 추가 확정**: DQ-12.3 (MASTER_KEY 위치) 확정. pg_graphql 도입 수요 트리거 4개 정량화
    - **"1:1 비교는 계층 분리를 드러낸다"** — wal2json vs supabase-realtime, isolated-vm vs Deno, splinter vs squawk 모두 "경쟁이 아니라 역할 분담" 결론, Wave 4 청사진의 계층 설계에 직접 반영
    - **Compound Knowledge 재검증**: Wave 1의 "하이브리드 9 : 단일 5" 분류가 Wave 2 매트릭스 점수 분포에서도 그대로 유지 — Wave 4 청사진 구조 축 확정

### Wave 3: 비전·요구사항 ✅ 완료 (11 문서, 8,350줄, 7 Agent 병렬) — 2026-04-18 15:41 완료
  - **V1 (opus, 620줄)**: 00-product-vision.md — A1~A7 전체, 페르소나 3인(김도영/박민수/이수진), 핵심 가치 5종
  - **V2 (opus, 830줄)**: 01-user-stories.md — 7 Epic × 36 스토리 (Must 69%, Gherkin 완비), Won't 10건 명시
  - **R1 (opus, 1,477줄)**: 02-functional-requirements.md — 14 FR 카테고리 × 55 FR (P0 49.1%, P1 40%, P2 10.9%)
  - **R2 (opus, 920줄)**: 03-NFR(500줄, 38 NFR) + 04-CON+ASM(420줄, CON 12 / ASM 12)
  - **M1 (sonnet, 884줄)**: 05-100점-definition(435줄, 14카 × 4단계 60/80/95/100) + 06-operational-persona(449줄, 페르소나 3 + 비페르소나 4)
  - **M2 (sonnet, 2,430줄)**: 07-dq-matrix(1,648줄, 64 DQ 전수 + 폐기 4건, Wave 3=20 / 4=28 / 5=16) + 08-security-threat-model(782줄, STRIDE 29 위협 + 자체호스팅 특화 5)
  - **M3 (sonnet, 1,189줄)**: 09-multi-tenancy-decision(621줄, ADR-001 + 재검토 트리거 4) + 10-14-categories-priority(568줄, Phase 15-22 매핑 preview)
- **Wave 3 종합 결론**:
  - 100점 도달 총 공수 추정: Wave 1 확정 548h + Wave 3 추정 460h = **1,008h (~50주)**
  - 3년 TCO 절감: Supabase Cloud $1,200~2,400 vs 양평 $250 = **$950~2,150 절감**
  - MVP 범위: Phase 15~17 (Auth Advanced + Observability/Ops + Auth Core/Storage)
  - DQ 재분배 완료: Wave 3에서 20건 답변 (FR/NFR에 반영), Wave 4 28건, Wave 5 16건
  - ADR-001 확정: Multi-tenancy 의도적 제외 + 재검토 트리거 4개 정량화
  - 누적: Wave 1+2+3 = **72 문서 / 53,542줄**

### Wave 4: 아키텍처 청사진 ⏳ (~20-30 문서) — 다음 세션 권장
### Wave 5: 로드맵·스파이크 ⏳ (~10-15 문서)

## Phase 3: Wave 검증 ⏳
## Phase 4: 완료 & 인계 ⏳
