---
skill: kdywave
status: completed
last_completed_phase: 2
last_completed_wave: 5
wave_4_started: 2026-04-18T19:00:00+09:00
wave_4_completed: 2026-04-18T22:15:00+09:00
wave_5_started: 2026-04-18T23:00:00+09:00
wave_5_completed: 2026-04-18T24:00:00+09:00
started: 2026-04-18T08:38:00+09:00
wave_2_completed: 2026-04-18T17:30:00+09:00
wave_3_completed: 2026-04-18T15:41:00+09:00
scale: L
total_waves: 5
output_dir: docs/research/2026-04-supabase-parity/
wave_4_result:
  total_docs: 26
  total_lines: 32918
  agents_executed: 11
  backward_feedback: 0
wave_5_result:
  total_docs: 25
  total_lines: 20128
  roadmap_docs: 13
  roadmap_lines: 10629
  prototyping_docs: 9
  prototyping_lines: 6621
  appendix_docs: 3
  appendix_lines: 2878
  agents_executed: 11  # 세션 28-1 R1-A/R2/R3/S1/S2 (5) + 세션 28-2 R1/R2/R3/R4/P1/A1 (6)
  sessions: 2
  backward_feedback: 0
  dq_coverage: "64/64 + 폐기 4 = 100%"
  new_spikes: 22  # SP-010 ~ SP-031
  priority_spikes: 7
  deferred_spikes: 15
  kpi_count: 127
  risk_register: 35
  tech_debt_items: 22
  mvp_fr_count: 27
cumulative:
  total_docs: 123
  total_lines: 106588
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

### Wave 4: 아키텍처 청사진 ✅ 완료 (26 문서 / 32,918줄 / 11 에이전트 / 3 Tier)
  - **Tier 1 ✅ (A1 opus, 3 문서 3,713줄)**
    - 00-system-overview.md 1,298줄 — 9-레이어 아키텍처 + 14카 매핑 + 5 AP 원칙
    - 01-adr-log.md 848줄 — ADR-001~018 누적 + 재검토 트리거 45건
    - 02-data-model-erd.md 1,567줄 — PG 10→29 + SQLite 3→6 테이블
  - **Tier 2 ✅ (7 Agent sonnet 병렬, 14 문서 18,251줄)**
    - B1 보안 ✅ 3,466줄 — DQ-AA-8(revokedAt+tokenFamily) / DQ-AC-4(ua-parser-js)
    - B2 운영 ✅ 2,771줄 — DQ-1.18 KEK 90일 / DQ-1.19 JWKS 3분 grace / DQ-1.21
    - B3 compute ✅ 2,386줄 — SigV4-only / 3층 decideRuntime P0>P1 / 50GB spike-007
    - B4 editor ✅ 1,988줄 — DQ-2.4~2.6 SQL / DQ-1.10~1.12 + DQ-2.1~2.3 Table
    - B5 data delivery ✅ 2,665줄 — DQ-RT-1/2/4/5 / DQ-1.25~1.32 + DQ-11.1/11.3
    - B6 DB 관리 ✅ 3,389줄 — DQ-3.1~3.15(8) / DQ-4.5~4.23(8) / DQ-ADV-5/7
    - B7 UX ✅ 1,586줄 — DQ-UX-1~3 / DQ-AI-1~2 / DQ-1.15
  - **Tier 3 ✅ (3 Agent sonnet 병렬, 9 문서 10,954줄)**
    - U1 UI/UX 5 문서 5,841줄 — 디자인 시스템 hex + 3-pane 레이아웃 + WCAG 2.2 AA
    - I1 Integration 개요+PG확장 2 문서 2,526줄 — 내부 24쌍 + 외부 5종 + PG ext 3
    - I2 Integration 배포+외부 2 문서 2,587줄 — QUIC→HTTP/2 + Canary + $10 가드
  - **Wave 4 Compound Knowledge**:
    - 청사진 단계에서 계층 분리가 더 명확해짐 (Realtime 2계층 / Advisors 3-Layer / Edge Fn 3층)
    - UI/UX와 아키텍처 독립 병렬 가능 (Tier 2에서 컴포넌트 이름 계약 고정 덕분)
    - 역방향 피드백 0건 — Wave 1-3 채택안 전부 강화 재확인

### Wave 5: 로드맵·스파이크·부록 ✅ 완료 (25 문서 / 20,128줄 / 11 Agent / 2 세션)

#### 세션 28-1 (5 Agent / 10 문서 / 8,129줄)
- **R1-A (sonnet)**: 05-roadmap/00-release-plan.md (807줄)
- **R2 (sonnet)**: 05-roadmap/02-tech-debt-strategy.md (602줄) + 03-risk-register.md (1,056줄) = 1,658줄
- **R3 (sonnet)**: 05-roadmap/04-go-no-go-checklist.md (494줄) + 05-rollout-strategy.md (1,056줄) = 1,550줄
- **S1 (sonnet)**: 06-prototyping/spike-005-edge-functions-deep.md (1,151줄) + spike-007-seaweedfs-50gb.md (1,391줄) = 2,542줄
- **S2 (sonnet)**: 06-prototyping/spike-008-wal2json-pg-matrix.md (532줄) + spike-009-totp-webauthn-mvp.md (598줄) + spike-010-pgmq-vs-bullmq.md (570줄) = 1,700줄

#### 세션 28-2 (6 Agent / 15 문서 / 11,871줄) — `--resume wave 5`
- **R1 (opus, 3 문서, 3,058줄)**: 00-roadmap-overview.md 665 / 01-release-plan.md 1,200 / 02-milestones.md 1,193 — 50주×870h, 9 코드명, M1~M16
- **R2 (sonnet, 2 문서, 1,088줄)**: 03-mvp-scope.md 548 (MVP FR 27건, 122h) / 04-tech-debt-strategy.md 540 (TD 22건, 20% 할당)
- **R3 (sonnet, 2 문서, 1,440줄)**: 05-risk-mitigation.md 853 (R-01~R-30, Top 10) / 06-cost-tco-analysis.md 587 ($950~2,150 절감, ROI 280~760%)
- **R4 (sonnet, 1 문서, 1,028줄)**: 07-success-metrics-kpi.md — 127 KPI, 38 NFR 전수, Supabase 24 기능 대조
- **P1 (sonnet, 4 문서, 2,379줄)**: 06-prototyping/01-spike-portfolio.md 444 (22건 신규, 100% DQ 매핑) / 02-priority-set.md 621 (SP-010~016) / 03-deferred-set.md 703 (SP-017~031) / 04-execution-protocol.md 611
- **A1 (opus, 3 문서, 2,878줄)**: 07-appendix/01-glossary.md 1,149 (용어 230+) / 02-dq-final-resolution.md 757 (DQ 64건 100%) / 03-genesis-handoff.md 972 (태스크 85+)

#### Wave 5 Compound Knowledge
1. **이중 관점 문서화 정당성**: 동일 주제(릴리스/부채/리스크)에 "상세 레지스트리(28-1)" + "전략·관리(28-2)" 두 관점 병존 — 서로 다른 목적(실행 중 참조 vs 의사결정용)
2. **22 스파이크 × 19 DQ 매핑 커버**: Wave 5 16건 DQ + 관련 ADR 재검토 트리거 3건 = 100%
3. **MVP 착수 조건 충족**: SP-010~016 우선 스파이크 7건 (4주, 29h) → Phase 15 (Auth Advanced 22h) 병행 착수 가능

## Phase 3: Wave 검증 ✅
- 산출물 완전성: 25/25 문서 모두 생성 확인, 최소 줄 수 초과 달성 (목표 ~8,100줄 → 실측 20,128줄 = +148%)
- 스코어링/DQ/일관성: Wave 1-4 채택안 100% 강화 확인 — **역방향 피드백 0건**
- DQ 전수: 64/64 = 100% 해결 + 폐기 4건 재확인

## Phase 4: 완료 & 인계 ✅
- 마스터 인덱스 README.md 전면 갱신 (25 문서 인덱싱)
- kdygenesis 연계 준비: `07-appendix/03-genesis-handoff.md`의 `_PROJECT_GENESIS.md` 초안 활용
- 다음 권장 액션: (1) `/kdyspike --full` 우선 스파이크 7건 (4주) → (2) Phase 15 Auth Advanced 착수
- 역방향 피드백 모드: 향후 `/kdywave --feedback` 필요 시 재개 가능

## §보완 — Wave 5 종료 후 변경 이력 (kdywave --feedback 추적)

> Wave 5 완료(2026-04-18) 이후 발생한 cross-cutting 변경을 본 체크포인트의 시간 일관성 유지를 위해 부록으로 기록한다. 본문 §"역방향 피드백 0건" 사실은 Wave 5 종료 시점 기준으로 유효하며, 이하 변경은 모두 **종료 후 보강**.

### B-01 (2026-04-19, 세션 50): standalone+rsync+pm2 reload 채택
- **동기**: Phase 16b 진입 시 Capistrano-style symlink/releases가 1인 운영 환경(WSL2 단일 머신)에서 과잉 복잡도. 트래픽 100만+/팀 2명+/3환경/B2B 트리거 미충족.
- **결과물**: `scripts/wsl-build-deploy.sh`, `standalone/install-native-linux.sh`, `scripts/pack-standalone.sh`
- **연계**: ADR-020 신설 (2026-04-25 세션 51 등록), ADR-015 *Capistrano-style symlink/releases* 부분 부분 대체

### B-02 (2026-04-25, 세션 51): kdywave 이행도 평가 + ADR-020 정식 등록
- **평가**: 누적 185+ 문서 진행 vs 실 구현 → A-(85/100), R1 ADR-015 vs 실구현 불일치 식별
- **시정 조치**: 5개 핵심 산출물에 cross-reference (01-adr-log §0.4/§2/§3.1/§5, README.md row 14, 05-rollout-strategy.md, 05-operations-blueprint.md, 02-cloudflare-deployment-integration.md, 00-roadmap-overview.md §1.2/§8.1.1/§13/§14.3)
- **거버넌스**: Git 태그 v0.1.0-alpha.0 / v0.1.0-alpha.1 / v0.2.0-alpha.2 소급 부여 + 원격 push
- **공수 재보정**: §8.1 버퍼 20→25%, §8.1.1 시나리오 A(53~54주) / B(25주) 병기

### B-03 (2026-04-25, 세션 52): kdywave --feedback 정식 모드 — 36 잔여 파일 일괄 처리
- **범위**: S51 5 핵심 외 **29개 파일**에 ADR-020 cross-reference banner 일괄 삽입 — `00-vision/` 5건, `02-architecture/` 3건, `04-integration/` 2건, `05-roadmap/` 11건, `06-prototyping/` 3건, `07-appendix/` 5건
- **placeholder 충돌 정정**: ADR-020 placeholder를 다른 후보(Prisma 8 업그레이드, AI Gateway, AI 챗 메시지 영구 저장 등)로 사용한 4개 파일(`01-adr-log.md`, `16-ux-quality-blueprint.md`, `01-kdygenesis-handoff.md`, `02-dq-final-resolution.md`, `02-final-summary.md`)에서 placeholder를 ADR-021~024로 재할당. 다음 ADR 번호: **025부터**
- **보존 원칙**: `01-research/14-operations/*` (Wave 1 deep-dive 73문서) 및 `_archived/`는 역사 보존 — 미수정
- **검증**: 29개 파일 모두 ADR-020 banner 정상 삽입 확인 (`grep "ADR-015 부분 대체 통지" → 29 hits`)

### 누적 변경 요약 (2026-04-19 ~ 2026-04-25)
| 항목 | Wave 5 종료 (2026-04-18) | 현재 (2026-04-25) | 변동 |
|------|----------------------|-----------------|------|
| 정식 ADR 수 | 18 (ADR-001~018) | 20 (ADR-019, ADR-020 추가) | +2 |
| ADR-015/Capistrano 단독 언급 파일 | 40 | 5 (Wave 1 deep-dive 3 + _archived 1 + _CHECKPOINT 1) | -35 |
| ADR-020 cross-reference 파일 | 0 | 35 (S51 6건 + S52 29건) | +35 |
| 역방향 피드백 (Wave 1-5 채택안 변경) | 0 | 0 (Capistrano는 부분 대체일뿐 채택안 자체는 유보 자산) | 변동 없음 |
| 다음 ADR 번호 | 019 | 025 (021~024는 §5 예상 후보로 reserved) | +6 |
