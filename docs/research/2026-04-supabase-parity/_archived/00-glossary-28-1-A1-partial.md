# 00. 용어집 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> **Wave 5 · A1 (Tier 2) 산출물**
> 작성일: 2026-04-18 (세션 28, kdywave Wave 5 A1 Agent — sonnet)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [07-appendix/](./) → **이 문서**
> 연관:
> - [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) — ADR 18건 전수
> - [../00-vision/07-dq-matrix.md](../00-vision/07-dq-matrix.md) — DQ 64건 매트릭스
> - [../05-roadmap/03-risk-register.md](../05-roadmap/03-risk-register.md) — R-001~035
> - [../05-roadmap/02-tech-debt-strategy.md](../05-roadmap/02-tech-debt-strategy.md) — TD-001~022

---

## 개요

본 용어집은 Wave 1~5에서 등장한 프로젝트 컨벤션 용어, 기술 스택 용어, 도메인 용어, 운영/측정 용어를 **카테고리별로 분류하고 가나다 + 알파벳 정렬**하여 단일 참조 문서로 집약한다.

항목 형식:

```
| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
```

총 항목: **100+ 용어** (4 카테고리)

---

## 카테고리 1. 프로젝트 컨벤션 용어

### 1.1 아키텍처 원칙 (AP-1~5)

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| AP-1 | Architecture Principle 1: Simplicity First | 1인 운영 환경에서 구현 복잡도 최소화 원칙. 동등 기능이 있으면 단순한 쪽을 우선 채택. PG 확장보다 Node.js 자체구현 선호 근거. | `02-architecture/00-system-overview.md` | ADR-001, ADR-005 |
| AP-2 | Architecture Principle 2: Unidirectional Dependency | 9-레이어 구조에서 의존 방향은 위→아래(L1 표현→L9 인프라)로만 허용. 역방향 임포트 금지. 순환 의존성 구조적 차단. | `02-architecture/00-system-overview.md` | ADR-018 |
| AP-3 | Architecture Principle 3: Hybrid 9:5 Balance | 14 카테고리 중 단일 솔루션 9건, 복합 솔루션(하이브리드) 5건으로 균형. 하이브리드는 계층 분리가 명확히 정의된 경우에만 허용. | `README.md §Wave 1 Compound Knowledge` | ADR-009, ADR-010 |
| AP-4 | Architecture Principle 4: Pattern Borrowing over Library Adoption | 라이브러리 전체 의존 대신 핵심 패턴만 차용(포팅)하여 의존성 잠금 리스크 감소. Auth Core(Lucia/Auth.js 패턴 차용), Advisors(splinter 패턴 포팅). | `02-architecture/01-adr-log.md §ADR-006, ADR-011` | ADR-006, ADR-011 |
| AP-5 | Architecture Principle 5: PG Extension vs Self-implement Balance | PostgreSQL 확장(pg_cron, pg_logical 등)은 운영 복잡도를 추가하므로, 카테고리별 이득이 명확히 클 때만 채택. 기본값은 Node.js 자체구현. | `02-architecture/01-adr-log.md §ADR-005` | ADR-005, DQ-4.2 |

### 1.2 ADR (Architecture Decision Record) — 18건

| 용어 | 영문 전체 | 한글 정의 | 출처 문서 | 관련 DQ |
|------|----------|----------|----------|--------|
| ADR-001 | Multi-tenancy Intentional Exclusion | 양평 대시보드는 단일 워크스페이스·DB·도메인. Multi-tenancy 의도적 제외. B2B 전환 시 100-120h 재설계. | `02-architecture/01-adr-log.md` | — |
| ADR-002 | Table Editor TanStack v8 자체구현 | TanStack Table v8 + 자체 14c-α 구현. Phase 18 목표. 점수 75→100. | `02-architecture/01-adr-log.md` | DQ-1.9, DQ-1.10 |
| ADR-003 | SQL Editor supabase-studio 패턴 차용 + 3중 흡수 | Monaco + supabase-studio 패턴 + Outerbase + sqlpad 3중 흡수. Phase 18. 점수 70→100. | `02-architecture/01-adr-log.md` | DQ-2.1 |
| ADR-004 | Schema Visualizer schemalint + 자체 RLS UI | schemalint(컨벤션) + 자체 RLS Trigger 뷰 + xyflow 시각화. Phase 20. 점수 65→95. | `02-architecture/01-adr-log.md` | DQ-3.1 |
| ADR-005 | DB Ops node-cron + wal-g (pg_cron 거부) | 주기 작업 = node-cron(PM2 fork 별도 앱). 백업 = wal-g(S3 호환). pg_cron 거부. Phase 20. | `02-architecture/01-adr-log.md` | DQ-4.2, TD-002 |
| ADR-006 | Auth Core jose JWT + Lucia/Auth.js 패턴 차용 | jose JWT 서명/검증 + Lucia v3·Auth.js v5 세션 패턴 15개 차용(라이브러리 미채용). Phase 17. | `02-architecture/01-adr-log.md` | DQ-5.1 |
| ADR-007 | Auth Advanced TOTP+WebAuthn+Rate Limit 동시 채택 | otplib@12 + SimpleWebAuthn@10 + rate-limiter-flexible@5 동시 구현. Phase 15. 15→60점. | `02-architecture/01-adr-log.md` | DQ-1.1, DQ-1.2 |
| ADR-008 | Storage SeaweedFS 단독 + B2 오프로드 | SeaweedFS(주 저장소) + Backblaze B2(콜드 오프로드). MinIO 배제. Phase 17. 40→90점. | `02-architecture/01-adr-log.md` | DQ-1.3 |
| ADR-009 | Edge Functions 3층 하이브리드 | isolated-vm v6(L1 안전) + Deno embed 사이드카(L2 표준) + Vercel Sandbox 위임(L3 신뢰). Phase 19. 45→92점. | `02-architecture/01-adr-log.md` | DQ-1.4 |
| ADR-010 | Realtime wal2json + supabase-realtime 포팅 하이브리드 | wal2json(CDC 소스) + supabase-realtime JS 포팅(채널 관리). 계층 분리 명확. Phase 19. 55→100점. | `02-architecture/01-adr-log.md` | DQ-1.5 |
| ADR-011 | Advisors 3-Layer | schemalint(컨벤션) + squawk(DDL) + splinter 38룰(Node 포팅). 3-Layer 병렬. Phase 20. 65→95점. | `02-architecture/01-adr-log.md` | DQ-11.1 |
| ADR-012 | Data API REST 강화 + pgmq + pg_graphql 보류 | REST 강화(DMMF 자동생성) + pgmq 워커. pg_graphql은 수요 트리거 4 충족 시 도입. Phase 21. | `02-architecture/01-adr-log.md` | DQ-1.6, DQ-1.7 |
| ADR-013 | Observability node:crypto envelope + MASTER_KEY 위치 | AES-256-GCM envelope. MASTER_KEY = `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640). Phase 16. | `02-architecture/01-adr-log.md` | DQ-1.8, DQ-12.3 |
| ADR-014 | UX Quality Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP | AI SDK v6 + Anthropic BYOK + `mcp-luckystyle4u` 자체 MCP. 비용 상한 $5/월. Phase 21. | `02-architecture/01-adr-log.md` | — |
| ADR-015 | Operations Capistrano-style + PM2 cluster:4 + canary 서브도메인 | Capistrano symlink swap(5초 롤백) + PM2 cluster:4(포트 3000) + canary.stylelucky4u.com(포트 3002). Phase 16. | `02-architecture/01-adr-log.md` | TD-003 |
| ADR-016 | pg_graphql 수요 트리거 4 정량화 | pg_graphql 도입 조건: ①외부 앱 GraphQL 직접 소비 ②클라이언트 10개+ GraphQL 쿼리 ③REST 응답 3개+ 과다페칭 ④팀 확장. Phase 21+. | `02-architecture/01-adr-log.md` | DQ-1.6 |
| ADR-017 | OAuth Providers Phase 18+ 조건부 도입 | Naver/Kakao OAuth. Phase 18 착수 시 평가. PKCE 필수. Phase 18+. | `02-architecture/01-adr-log.md` | — |
| ADR-018 | System Overview 9-레이어 구조 및 의존 규칙 | L1(표현)~L9(인프라) 9계층. 단방향 의존. 레이어 간 임포트 규칙 명문화. Wave 4 전체 적용. | `02-architecture/00-system-overview.md` | — |
| ADR-020 | [후보] PM2 cluster:4 + cron-worker fork 앱 분리 | ADR-015(cluster:4) ↔ ADR-005(cron fork 필수) 충돌 해소. 메인 앱 cluster:4, cron-worker 별도 PM2 앱(fork). R2 역방향 피드백 제안. | `07-appendix/02-final-summary.md §4` | ADR-005, ADR-015 |

### 1.3 DQ (Design Question) 형식

| 용어 | 영문 | 한글 정의 | 출처 문서 | 비고 |
|------|------|----------|----------|------|
| DQ-N.M | Design Question N.M | Wave 리서치 중 도출된 미해결 설계 질문. N=카테고리, M=질문 순번. 총 64건 + 폐기 4건. Wave 3/4/5에서 해소 담당 분배. | `00-vision/07-dq-matrix.md` | 64건 전수 Wave 5 해소 완료 |
| DQ-1.1~1.9 | Wave 1 Provisional Answers | Wave 1에서 잠정 답변 완료된 9건. Auth Advanced 2건, Storage/Edge/Realtime/Data API/Table Editor 각 1~2건. | `00-vision/07-dq-matrix.md §1` | Wave 1 완료 |
| DQ-12.3 | MASTER_KEY Location | MASTER_KEY 저장 위치 결정. `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 env_file. | `00-vision/07-dq-matrix.md` | ADR-013 |

### 1.4 요구사항 식별자

| 용어 | 영문 | 한글 정의 | 출처 문서 | 비고 |
|------|------|----------|----------|------|
| FR-N.M | Functional Requirement N.M | 카테고리 N의 M번째 기능 요구사항. N은 카테고리 번호, M은 순번. 총 72+ FR (P0/P1/P2 우선순위별). | `00-vision/02-functional-requirements.md` | P0=MVP 필수, P1=Beta, P2=GA |
| NFR-N.M | Non-Functional Requirement N.M | 성능·보안·가용성 등 비기능 요구사항. 총 38건 (NFR-PERF/SEC/OPS/DX 등 카테고리별). | `00-vision/03-non-functional-requirements.md` | KPI 127개와 연계 |
| CON-N | Constraint N | 설계 제약 조건. CON-1(1인 운영), CON-9(비용 상한 $0/월), CON-13(WSL2 단일 서버) 등. | `00-vision/04-constraints-assumptions.md` | — |
| ASM-N | Assumption N | 설계 가정. ASM-1(PG 17 사용 중), ASM-4(Cloudflare Tunnel 영속), ASM-7(PM2 관리) 등. | `00-vision/04-constraints-assumptions.md` | — |

### 1.5 마일스톤 (M1~M8)

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 Phase |
|------|------|----------|----------|-----------|
| M1 | Milestone 1: Auth Advanced | Phase 15. Auth Advanced 15→60점. TOTP+WebAuthn+Rate Limit. 22h. 즉시 착수 가능. | `05-roadmap/01-milestones-wbs.md` | Phase 15 |
| M2 | Milestone 2: Observability + Operations | Phase 16. Vault+JWKS+Capistrano. 65→85점 + 80→95점. 40h. M1 완료 후. | `05-roadmap/01-milestones-wbs.md` | Phase 16 |
| M3 | Milestone 3: Auth Core + Storage | Phase 17. Session+디바이스+SeaweedFS+B2. 70→90점 + 40→90점. 60h. M2 완료 후. | `05-roadmap/01-milestones-wbs.md` | Phase 17 |
| M4 | Milestone 4: SQL + Table Editors | Phase 18. SQL Editor+Table Editor 100점 완성. 14c~14f 전체. 400h. M3 완료 후. | `05-roadmap/01-milestones-wbs.md` | Phase 18 |
| M5 | Milestone 5: Edge + Realtime | Phase 19. Edge Fn 3층 + Realtime CDC. 45→92점 + 55→100점. 75h. spike-005/008 통과 후. | `05-roadmap/01-milestones-wbs.md` | Phase 19 |
| M6 | Milestone 6: Schema + DB Ops + Advisors | Phase 20. 3 카테고리 95점. schemalint+squawk+splinter. 198h. M4 완료 후. | `05-roadmap/01-milestones-wbs.md` | Phase 20 |
| M7 | Milestone 7: Data API + UX Quality | Phase 21. REST+pgmq+AI SDK. 45→85점 + 75→95점. 40h. M5+M6 완료 후. | `05-roadmap/01-milestones-wbs.md` | Phase 21 |
| M8 | Milestone 8: 보너스 100점 완성 | Phase 22. pg_graphql 수요 트리거 시 활성화 + OAuth. ~30h. M7 완료 후. | `05-roadmap/01-milestones-wbs.md` | Phase 22 |

### 1.6 기술부채 식별자 (TD-001~022)

| 용어 | 영문 | 한글 정의 | 출처 문서 | 심각도 |
|------|------|----------|----------|--------|
| TD-001 | Multi-tenancy Deferred | Multi-tenancy 의도적 제외 → B2B 전환 시 100-120h. DES 유형. | `05-roadmap/02-tech-debt-strategy.md` | 저 |
| TD-002 | pg_cron Deferred | pg_cron 거부 → node-cron. SQL-only 잡 50건+ 시 재고. DES 유형. | `05-roadmap/02-tech-debt-strategy.md` | 저 |
| TD-003 | PM2 fork→cluster 미전환 | 메인 앱 현재 fork. Phase 16에서 cluster:4 전환 계획. ADR-015 이행. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-004 | bcrypt→argon2 미전환 | 현재 bcrypt 사용. argon2 WSL2 네이티브 빌드 검증 후 전환. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-005 | SeaweedFS 50GB+ 부하 테스트 미수행 | spike-007로 검증 계획. Phase 17 진입 전 필수. TST 유형. | `05-roadmap/02-tech-debt-strategy.md` | 고 |
| TD-006 | DR 드릴(재해복구 훈련) 미실행 | wal-g 복구 시나리오 실 드릴 미수행. TST 유형. Phase 17 이후. | `05-roadmap/02-tech-debt-strategy.md` | 고 |
| TD-007 | Edge Fn isolated-vm v6 버전 고정 미설정 | package.json에 exact version 미설정. CVE 자동 범프 위험. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 고 |
| TD-008 | argon2 WSL2 빌드 spike 미수행 | Phase 17 전에 Phase 16에서 검증 필요. spike-011 후보. COD/TST 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-009 | WebAuthn RP ID 도메인 잠금 위험 | stylelucky4u.com 도메인 변경 시 기존 크리덴셜 무효화. DOC 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-010 | Realtime 폴링 폴백 자동화 미설정 | wal2json CDC 실패 시 폴링 전환 자동화 미구현. Phase 19. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-011 | Monaco 에디터 SQL 자동완성 미구현 | Phase 18 초기 버전에서 기본 자동완성만. 고도화는 14d~14f. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 저 |
| TD-012 | xyflow 노드 레이아웃 수동 배치 | elkjs 자동 레이아웃 연동 미구현. Phase 20 목표. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 저 |
| TD-013 | pgmq 워커 장애 복구 미구현 | 워커 크래시 시 수동 재시작. Phase 21 이후 자동화. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-014 | AI SDK 비용 초과 가드 미구현 | $5/월 상한 코드 미구현. Phase 21에서 구현 계획. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-015 | Capistrano symlink 원자 교체 테스트 미작성 | 롤백 5초 테스트 자동화 미구현. TST 유형. Phase 16 이후. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-016 | splinter 38룰 Node 포팅 완성도 미검증 | 포팅 완성도 테스트 미수행. TST 유형. Phase 20 진입 전. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-017 | B2 오프로드 비용 트리거 자동화 미구현 | 50GB 초과 시 B2 자동 오프로드 미구현. Phase 17. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-018 | pg_graphql 수요 트리거 모니터링 미구현 | DQ-1.6 4가지 트리거 자동 감지 미구현. Phase 21+. DOC/COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 저 |
| TD-019 | MASTER_KEY 백업 절차서 미작성 | MASTER_KEY 손실 시 복구 절차 미문서화. DOC 유형. Phase 15 직전 우선 해소 대상. | `05-roadmap/02-tech-debt-strategy.md` | 고 |
| TD-020 | Cloudflare Tunnel keepalive 영속화 미완성 | sysctl 설정 재부팅 후 유실 위험. Phase 16. COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-021 | wal2json replication slot 정리 정책 미수립 | 미사용 슬롯 누적 → PG WAL 비대화. Phase 19. DOC/COD 유형. | `05-roadmap/02-tech-debt-strategy.md` | 중 |
| TD-022 | CVE 추적 자동화 미구현 | npm audit + GitHub Dependabot 미설정. Phase 15 직전 우선 해소 대상. DOC 유형. | `05-roadmap/02-tech-debt-strategy.md` | 고 |

### 1.7 리스크 식별자 (R-001~035)

| 용어 | 영문 | 한글 정의 | 출처 문서 | 등급 |
|------|------|----------|----------|------|
| R-001 | Risk: 1인 운영 단일 장애점 | 운영자 부재 시 서비스 전체 중단. OPS 유형. 가능성 4×영향 5=20(위험). | `05-roadmap/03-risk-register.md` | 위험 |
| R-002 | Risk: Cloudflare Tunnel 530 재발 | Tunnel 원점 오류 재발. EXT 유형. 세션 25-C 교훈 반영. | `05-roadmap/03-risk-register.md` | 높음 |
| R-003 | Risk: Edge Fn isolated-vm v6 호환 파손 | isolated-vm 업데이트 시 V8 API 파손. TECH 유형. spike-005 선행 필수. | `05-roadmap/03-risk-register.md` | 높음 |
| R-004 | Risk: wal2json × PG 버전 불일치 | PG 14/15/16/17 대상 wal2json 디코더 출력 불일치. TECH 유형. spike-008 선행 필수. | `05-roadmap/03-risk-register.md` | 높음 |
| R-007 | Risk: SeaweedFS OOM | 단일 서버 SeaweedFS 메모리 과다 점유. TECH 유형. spike-007 선행 필수. | `05-roadmap/03-risk-register.md` | 높음 |
| R-035 | Risk: Phase 18 공수 과소 추정 | 400h 공수가 에디터 복잡도로 20-30% 초과 가능. SCHED 유형. | `05-roadmap/03-risk-register.md` | 높음 |

---

## 카테고리 2. 기술 스택 용어

### 2.1 Edge Functions 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| isolated-vm v6 | isolated-vm version 6 | V8 Isolate 기반 안전 샌드박스 실행 엔진. L1(신뢰 낮음) 함수 실행용. Node.js 프로세스 내에서 코드 격리. ADR-009 채택. | `06-prototyping/spike-005-edge-functions-deep.md` | ADR-009, DQ-1.4 |
| Deno embed | Deno Embedded Runtime | Deno 런타임을 sidecar 프로세스로 실행하는 방식. L2(표준 Deno API 지원) 함수용. IPC 통신으로 메인 앱과 연결. | `06-prototyping/spike-005-edge-functions-deep.md` | ADR-009 |
| Vercel Sandbox | Vercel Sandbox (외부 위임) | Vercel Edge 환경으로 함수 위임 실행. L3(신뢰 높음, 외부 의존). 비용 트리거($0 초과) 시 비채택 재고. | `06-prototyping/spike-005-edge-functions-deep.md` | ADR-009, CON-9 |
| Edge Fn 3층 | 3-Layer Edge Functions Architecture | isolated-vm(L1) + Deno 사이드카(L2) + Sandbox(L3) 신뢰 계층 분리 아키텍처. ADR-009의 핵심 결정. | `02-architecture/08-edge-functions-blueprint.md` | ADR-009 |

### 2.2 Realtime CDC 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| wal2json | WAL to JSON | PostgreSQL WAL(Write-Ahead Log)을 JSON 형식으로 디코딩하는 논리 복제 플러그인. CDC(Change Data Capture) 소스. ADR-010 채택. | `06-prototyping/spike-008-wal2json-pg-version-matrix.md` | ADR-010, DQ-1.5 |
| supabase-realtime | Supabase Realtime (Elixir → Node 포팅) | Supabase의 Elixir 기반 Realtime 서버를 Node.js로 포팅한 채널 관리 레이어. WebSocket 기반 클라이언트 연결 담당. | `02-architecture/09-realtime-blueprint.md` | ADR-010 |
| pg_logical | PostgreSQL Logical Replication | PostgreSQL 논리 복제 확장. wal2json의 기반 인프라. 복제 슬롯 관리. PG 14+에서 기본 포함. | `06-prototyping/spike-008-wal2json-pg-version-matrix.md` | ADR-010 |
| replication slot | PostgreSQL Replication Slot | WAL 보존을 위해 wal2json이 사용하는 논리 복제 슬롯. 미정리 시 WAL 비대화 리스크(TD-021). | `06-prototyping/spike-008-wal2json-pg-version-matrix.md` | TD-021 |
| CDC | Change Data Capture | 데이터베이스 변경사항(INSERT/UPDATE/DELETE)을 실시간으로 캡처하여 하위 시스템에 전파하는 패턴. Realtime 기능의 핵심 기반. | `02-architecture/09-realtime-blueprint.md` | ADR-010 |
| propagation lag | Realtime 전파 지연 | wal2json이 WAL을 디코딩하여 WebSocket 클라이언트에 전달하기까지의 지연 시간. 목표: p99 < 200ms. | `00-vision/03-non-functional-requirements.md` | NFR-PERF |

### 2.3 Storage 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| SeaweedFS | SeaweedFS Distributed File System | 대용량 파일 저장을 위한 분산 파일 시스템. S3 호환 API 제공. 50GB+ 단일 서버 운영 검증(spike-007). ADR-008 채택. | `06-prototyping/spike-007-seaweedfs-50gb.md` | ADR-008, DQ-1.3 |
| B2 | Backblaze B2 Cloud Storage | Backblaze의 S3 호환 오브젝트 스토리지 서비스. SeaweedFS 50GB 초과 시 콜드 파일 오프로드 대상. $6/TB/월. | `06-prototyping/spike-007-seaweedfs-50gb.md` | ADR-008 |
| SigV4 | AWS Signature Version 4 | S3 호환 스토리지 API 인증에 사용하는 서명 방식. SeaweedFS와 B2 모두 SigV4 지원. | `06-prototyping/spike-007-seaweedfs-50gb.md` | ADR-008 |

### 2.4 인증 고급 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| otplib | One-Time Password Library (v12) | Node.js TOTP 구현 라이브러리. RFC 6238 준수. base32 secret + window:1 허용(±30초 drift). ADR-007 채택. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007, DQ-1.1 |
| SimpleWebAuthn | @simplewebauthn/server + browser (v10) | FIDO2/WebAuthn 서버·브라우저 SDK. 패스키 등록·인증 흐름 구현. Conditional UI 지원. ADR-007 채택. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007 |
| FIDO MDS | FIDO Metadata Service | FIDO2 인증장치 메타데이터 서비스. WebAuthn 구현 시 인증기 검증에 활용. 오프라인 캐시 가능. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007 |
| Conditional UI | WebAuthn Conditional Mediation | 패스키 자동 완성(autocomplete="webauthn")을 통한 비밀번호 입력창 없는 인증 UX. SimpleWebAuthn v10 지원. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007 |
| TOTP | Time-Based One-Time Password | RFC 6238 기반 시간 기반 일회성 비밀번호. 30초 유효. otplib으로 구현. Phase 15-A. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007 |
| WebAuthn | Web Authentication API | FIDO2 기반 공개키 인증 표준. 패스키/하드웨어 키 지원. Phase 15-B. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007 |
| rate-limiter-flexible | rate-limiter-flexible (v5) | Redis/PostgreSQL/메모리 기반 Rate Limit 라이브러리. PostgreSQL+Prisma 어댑터 채택(DQ-1.2). Phase 15-C. | `06-prototyping/spike-009-totp-webauthn-mvp.md` | ADR-007, DQ-1.2 |

### 2.5 인증 코어 / Vault 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| jose | JSON Object Signing and Encryption | JWT 서명·검증·JWKS 엔드포인트 구현 라이브러리. ES256 알고리즘. ADR-006, ADR-013 채택. | `02-architecture/05-auth-core-blueprint.md` | ADR-006 |
| JWKS | JSON Web Key Set | 공개키 집합을 JSON으로 노출하는 엔드포인트(`/.well-known/jwks.json`). Phase 16에서 jose로 구현. | `02-architecture/05-auth-core-blueprint.md` | ADR-013 |
| ES256 | ECDSA with P-256 and SHA-256 | JWT 서명 알고리즘. RS256 대비 키 크기 절반, 성능 우수. jose 기본 채택 알고리즘. | `02-architecture/05-auth-core-blueprint.md` | ADR-006 |
| KEK | Key Encryption Key | Envelope 암호화에서 DEK를 암호화하는 상위 키. MASTER_KEY에서 파생. | `02-architecture/12-observability-blueprint.md` | ADR-013 |
| DEK | Data Encryption Key | Envelope 암호화에서 실제 데이터를 암호화하는 키. KEK로 암호화되어 저장. | `02-architecture/12-observability-blueprint.md` | ADR-013 |
| envelope encryption | Envelope Encryption | DEK로 데이터 암호화 → KEK로 DEK 암호화 → 암호화된 DEK 저장. 키 교체 시 DEK만 재암호화. ADR-013 방식. | `02-architecture/12-observability-blueprint.md` | ADR-013, DQ-1.8 |
| AES-256-GCM | Advanced Encryption Standard 256-bit in Galois/Counter Mode | node:crypto 내장 대칭 암호화. 인증 태그 포함. Vault 암호화 알고리즘. | `02-architecture/12-observability-blueprint.md` | ADR-013 |

### 2.6 Queue 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| pgmq | PostgreSQL Message Queue | PostgreSQL 기반 메시지 큐 확장. Supabase와 동일한 기술. advisory lock으로 중복 소비 방지. ADR-012 채택. | `06-prototyping/spike-010-pgmq-vs-bullmq.md` | ADR-012, DQ-1.7 |
| BullMQ | Bull Message Queue (Redis 기반) | Redis 기반 고성능 메시지 큐. pgmq 대비 처리량 높음. Redis 의존성으로 미채택(CON-9). | `06-prototyping/spike-010-pgmq-vs-bullmq.md` | DQ-1.7 |
| advisory lock | PostgreSQL Advisory Lock | PostgreSQL 세션 레벨 잠금. pgmq 워커의 중복 소비 방지에 활용. `pg_try_advisory_lock(queue_id)`. | `06-prototyping/spike-010-pgmq-vs-bullmq.md` | ADR-012 |

### 2.7 배포/운영 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| Capistrano | Capistrano-style Atomic Deployment | Ruby 배포 도구 Capistrano의 symlink 원자 교체 방식을 Node.js 스크립트로 구현. 5초 롤백 목표. ADR-015 채택. | `05-roadmap/05-rollout-strategy.md` | ADR-015 |
| symlink atomic swap | Symbolic Link Atomic Swap | 새 릴리스 디렉토리 준비 완료 후 `current` symlink를 원자적으로 교체하여 다운타임 0 달성. | `05-roadmap/05-rollout-strategy.md` | ADR-015 |
| blue-green | Blue-Green Deployment | 두 환경(Blue=현재, Green=신버전)을 동시 운영하다 트래픽 전환. 본 프로젝트는 canary 방식으로 단순화. | `05-roadmap/05-rollout-strategy.md` | ADR-015 |
| canary | Canary Deployment | 일부 트래픽(canary.stylelucky4u.com → localhost:3002)에만 신버전 배포 후 검증. 30분 검증 후 승격. ADR-015. | `05-roadmap/05-rollout-strategy.md` | ADR-015 |
| PM2 cluster:4 | PM2 Cluster Mode with 4 Workers | PM2가 Node.js 클러스터 모듈로 4개 워커 생성. CPU 멀티코어 활용. 메인 앱(포트 3000) 전용. | `05-roadmap/05-rollout-strategy.md` | ADR-015, TD-003 |
| fork 모드 | PM2 Fork Mode | PM2 단일 프로세스 실행 모드. cron-worker 별도 PM2 앱에서 사용. cluster와 달리 단일 인스턴스 보장. | `05-roadmap/02-tech-debt-strategy.md` | ADR-005, TD-002 |

### 2.8 Advisors 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| schemalint | Schema Lint | PostgreSQL 스키마 컨벤션 자동 검사 도구. PK/FK/인덱스 명명 규칙, NOT NULL 검사. ADR-011 L1. | `02-architecture/10-advisors-blueprint.md` | ADR-011 |
| squawk | Squawk DDL Linter | PostgreSQL DDL 마이그레이션 안전성 검사. Lock 위험, breaking change, 데이터 손실 가능성 경고. ADR-011 L2. | `02-architecture/10-advisors-blueprint.md` | ADR-011 |
| splinter | Splinter PostgreSQL Rules (38 Rules) | PostgreSQL 38가지 권장 규칙 검사 도구(Rust). Node.js 포팅으로 자체구현 예정. ADR-011 L3. | `02-architecture/10-advisors-blueprint.md` | ADR-011 |
| 38룰 | Splinter 38 Rules | PostgreSQL 성능·보안·정합성 관련 38가지 체크리스트. splinter 도구의 핵심 규칙셋. | `02-architecture/10-advisors-blueprint.md` | ADR-011 |

### 2.9 Data API 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| pg_graphql | PostgreSQL GraphQL Extension | PostgreSQL 스키마에서 GraphQL API를 자동 생성하는 PG 확장. 수요 트리거 4 충족 시 도입(ADR-016). | `02-architecture/11-data-api-blueprint.md` | ADR-012, ADR-016, DQ-1.6 |
| PostGraphile | PostGraphile GraphQL Middleware | PostgreSQL에서 GraphQL API 자동 생성 Node.js 미들웨어. pg_graphql의 대안. 수요 트리거 충족 시 재평가. | `01-research/11-data-api-graphql-comparison.md` | DQ-1.6 |
| DMMF | Prisma Data Model Meta Format | Prisma가 schema.prisma를 파싱하여 생성하는 메타데이터 포맷. REST API 자동생성에 활용. | `02-architecture/11-data-api-blueprint.md` | ADR-012 |

### 2.10 UI/UX 라이브러리 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| Monaco | Monaco Editor (VS Code 기반) | VS Code 편집기 엔진. SQL Editor와 Edge Functions 코드 편집기 구현에 사용. | `02-architecture/02-sql-editor-blueprint.md` | ADR-003 |
| xyflow | XY Flow (React Flow v12) | 노드-엣지 다이어그램 라이브러리. Schema Visualizer에서 테이블 관계도 구현. | `03-ui-ux/02-schema-visualizer-ui.md` | ADR-004 |
| elkjs | Eclipse Layout Kernel JS | 그래프 자동 레이아웃 알고리즘. xyflow와 연동하여 Schema Visualizer 노드 자동 배치. | `03-ui-ux/02-schema-visualizer-ui.md` | ADR-004 |
| TanStack v8 | TanStack Table v8 | 헤드리스 테이블 라이브러리. Table Editor 핵심 엔진. 가상 스크롤(TanStack Virtual) 확장 가능. | `02-architecture/01-table-editor-blueprint.md` | ADR-002 |
| TanStack Virtual | TanStack Virtual | 대용량 리스트/테이블 가상 스크롤 라이브러리. 14d 단계에서 TanStack v8와 통합 예정. | `02-architecture/01-table-editor-blueprint.md` | ADR-002, DQ-1.10 |
| TanStack Query | TanStack Query (React Query) | 서버 상태 관리 라이브러리. 캐싱·동기화·낙관적 업데이트. 대시보드 전체 데이터 패칭 표준. | `03-ui-ux/01-table-editor-ui.md` | — |

### 2.11 네트워크/인프라 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| Cloudflare Tunnel | Cloudflare Zero Trust Tunnel (cloudflared) | 방화벽 우회 없이 로컬 서버를 인터넷에 공개하는 Zero Trust 터널 서비스. QUIC 우선, HTTP/2 폴백. | `04-integration/02-cloudflare-deployment-integration.md` | ASM-4 |
| QUIC | Quick UDP Internet Connections | UDP 기반 차세대 전송 프로토콜. Cloudflare Tunnel의 기본 전송. 패킷 손실 회복 빠름. | `04-integration/02-cloudflare-deployment-integration.md` | — |
| 530 에러 | Cloudflare Error 530 | Cloudflare가 원점(origin) 서버에 연결 실패 시 반환하는 오류. Tunnel keepalive 설정으로 완화(세션 25-C 교훈). | `04-integration/02-cloudflare-deployment-integration.md` | R-002 |
| originRequest keepAlive | Cloudflare Tunnel originRequest.keepAliveConnections | Tunnel 설정에서 원점 연결 유지 수 설정. `scripts/tunnel-measure-v2.sh` 주간 회귀로 모니터링. | `04-integration/02-cloudflare-deployment-integration.md` | R-002 |

### 2.12 PostgreSQL 확장 관련

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 ADR/DQ |
|------|------|----------|----------|------------|
| pg_cron | PostgreSQL Cron Extension | PostgreSQL 내에서 SQL 잡을 주기적으로 실행하는 확장. 양평 프로젝트에서 AP-1 원칙으로 거부(ADR-005). | `02-architecture/04-db-ops-blueprint.md` | ADR-005, TD-002 |
| wal-g | WAL-G Backup Tool | PostgreSQL WAL + 베이스 백업을 S3 호환 스토리지에 전송하는 백업 도구. RPO 60s 목표. ADR-005 채택. | `02-architecture/04-db-ops-blueprint.md` | ADR-005 |

---

## 카테고리 3. 도메인 용어

| 용어 | 영문 | 한글 정의 | 출처 문서 | 비고 |
|------|------|----------|----------|------|
| 양평 부엌 | Yangpyeong Kitchen (Project Code Name) | 프로젝트 코드명. WSL2 Ubuntu 서버가 양평 거주 환경에서 운영됨에서 유래. 공식 서비스명 아님. | `CLAUDE.md` | — |
| stylelucky4u.com | Domain (Primary) | 양평 부엌 서버 대시보드의 프로덕션 도메인. Cloudflare DNS + Tunnel 경유. 가비아 등록. | `CLAUDE.md` | — |
| canary.stylelucky4u.com | Domain (Canary) | 카나리 배포 전용 서브도메인. localhost:3002 매핑. 30분 검증 후 메인 도메인으로 승격. | `04-integration/02-cloudflare-deployment-integration.md` | ADR-015 |
| KT 회선 | KT Internet Line | 양평 서버의 인터넷 연결. 가정용 KT 광랜. 업로드 대역폭 제한이 Storage 성능에 영향. | `_CHECKPOINT_KDYWAVE.md` | R-002 |
| 1인 운영 | Single-Operator Environment | 운영자 1인(프로젝트 오너)이 개발·배포·모니터링 전담. Multi-tenancy 제외의 핵심 전제. CON-1. | `00-vision/01-vision-statement.md` | CON-1, ADR-001 |
| WSL2 | Windows Subsystem for Linux 2 | 양평 서버 런타임 환경. Ubuntu on Windows. 네이티브 빌드(argon2 등) 호환성 이슈 발생 가능. | `CLAUDE.md` | TD-004, TD-008 |
| 비-페르소나(미적용 사용자 유형) | Non-Persona (Excluded User Types) | 양평 대시보드가 지원하지 않는 사용자 유형 4건: ①외부 고객(End User), ②다중 팀, ③B2B SaaS 관리자, ④Supabase CLI 사용자. | `00-vision/01-vision-statement.md` | ADR-001 |

---

## 카테고리 4. 운영/측정 용어

| 용어 | 영문 | 한글 정의 | 출처 문서 | 관련 NFR/ADR |
|------|------|----------|----------|-------------|
| p50 | 50th Percentile Latency | 전체 요청 중 50%가 이 값 이하의 응답시간을 보이는 백분위수. 중앙값과 동일. 목표: API p50 < 50ms. | `00-vision/03-non-functional-requirements.md` | NFR-PERF |
| p95 | 95th Percentile Latency | 전체 요청 중 95%가 이 값 이하의 응답시간. 이상치 영향 제어 지표. 목표: API p95 < 200ms. | `00-vision/03-non-functional-requirements.md` | NFR-PERF |
| p99 | 99th Percentile Latency | 전체 요청 중 99%가 이 값 이하의 응답시간. 극단적 이상치 감지. 목표: API p99 < 1,000ms. | `00-vision/03-non-functional-requirements.md` | NFR-PERF |
| RPO | Recovery Point Objective | 장애 발생 시 허용 가능한 최대 데이터 손실 시간. DB Ops 목표: 60초(wal-g 연속 WAL 전송). | `02-architecture/04-db-ops-blueprint.md` | ADR-005, NFR-OPS |
| RTO | Recovery Time Objective | 장애 발생 후 서비스 복구 목표 시간. 목표: 30분(wal-g restore + PM2 restart). | `02-architecture/04-db-ops-blueprint.md` | ADR-005, NFR-OPS |
| SLI | Service Level Indicator | 서비스 품질을 측정하는 실제 지표. 가용성(uptime%), 지연(p95), 에러율 등. | `00-vision/03-non-functional-requirements.md` | NFR-OPS |
| SLO | Service Level Objective | SLI의 목표값. 예: 가용성 99.5%, API p95 < 200ms, 에러율 < 0.1%. | `00-vision/03-non-functional-requirements.md` | NFR-OPS |
| edge 관통 | Edge Penetration (Tunnel Throughput) | Cloudflare Tunnel을 경유한 실제 처리량. keepalive 최적화로 530 오류 없이 유지되는 상태. | `04-integration/02-cloudflare-deployment-integration.md` | R-002 |
| DOD | Definition of Done | 기능 완성 기준. 각 Phase·Task별 "완료"를 판단하는 체크리스트. Entry/Exit Gate와 연계. | `05-roadmap/04-go-no-go-checklist.md` | — |
| Entry Gate | Phase Entry Gate | Phase 착수 전 충족해야 할 조건 체크리스트. 사전 스파이크 통과, 의존 Phase 완료 등. | `05-roadmap/04-go-no-go-checklist.md` | — |
| Exit Gate | Phase Exit Gate | Phase 완료 기준 체크리스트. 기능 E2E 통과, 성능 SLO 충족, 문서 갱신 등. | `05-roadmap/04-go-no-go-checklist.md` | — |
| No-Go | No-Go Decision | Phase/릴리스 게이트에서 기준 미충족 시 진행 중단 결정. 62 게이트 체크리스트 기반. | `05-roadmap/04-go-no-go-checklist.md` | — |
| KPI | Key Performance Indicator | 14 카테고리 × 4단계(60/80/95/100점)에 대한 127개 성과 지표. Supabase 24개 기능 대조 포함. | `05-roadmap/07-success-metrics-kpi.md` | — |
| TCO | Total Cost of Ownership | 3년 총소유비용. Supabase $1,200~2,400 vs 양평 자체호스팅 $250. 절감 $950~2,150. | `05-roadmap/06-cost-tco-analysis.md` | CON-9 |
| STRIDE | Spoofing / Tampering / Repudiation / Info Disclosure / DoS / EoP | 보안 위협 모델링 프레임워크. Wave 3 보안 위협 모델 29건 식별에 사용. | `00-vision/08-security-threat-model.md` | NFR-SEC |
| 스파이크 | Spike (Technical Investigation) | 불확실한 기술 요소를 검증하는 시간제한 실험. 본 프로젝트 총 31개 스파이크(기존 9 + 신규 22). | `06-prototyping/01-spike-portfolio.md` | — |
| spike-NNN | Spike NNN (numbered) | 개별 스파이크 식별자. spike-005(Edge Fn) ~ spike-010(pgmq vs BullMQ)가 Wave 5 주요 5건. | `06-prototyping/` | — |
| Wave | Research Wave | kdywave 스킬의 연구 단계. Wave 1(기초) → Wave 2(비교) → Wave 3(요구사항) → Wave 4(설계) → Wave 5(로드맵). | `README.md` | — |
| Blueprint | Category Blueprint | 각 카테고리의 아키텍처 청사진 문서. Wave 4 Tier 1이 14건 작성. 9-레이어 구조로 통일. | `02-architecture/` | ADR-018 |
| 9-레이어 | 9-Layer Architecture | L1(표현)~L9(인프라) 9계층 아키텍처. ADR-018 확정. 단방향 의존. AP-2 원칙 구현체. | `02-architecture/00-system-overview.md` | ADR-018 |
| kdywave | KDY Wave Research Methodology | 1인 개발 환경에서 대규모 기술 리서치를 Wave 단위로 분할·병렬 실행하는 kdy 방법론. | `_CHECKPOINT_KDYWAVE.md` | — |
| kdygenesis | KDY Genesis (Project Bootstrap) | kdywave 결과물을 입력으로 받아 새 프로젝트/Phase worktree를 스캐폴딩하는 kdy 스킬. | `07-appendix/01-kdygenesis-handoff.md` | — |
| kdyswarm | KDY Swarm (Multi-Agent Parallel) | N개 에이전트를 DAG 병렬로 오케스트레이션하는 kdy 스킬. Wave 4/5에서 11개 에이전트 운용. | `README.md` | — |

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v1.0 | 2026-04-18 | Wave 5 A1 sonnet | 초판 작성. 4 카테고리 100+ 항목. Wave 1-5 전수 반영. |

---

*상위 인덱스: [07-appendix 인덱스](./) · [Wave 5 README](../README.md) · [ADR 로그](../02-architecture/01-adr-log.md)*
