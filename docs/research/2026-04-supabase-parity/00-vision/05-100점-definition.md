# 05 — 100점 정의: 14 카테고리별 Supabase 동등성 기준

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> **Wave 3 · M1 산출물** | 작성일: 2026-04-18 | 상태: 확정  
> 상위: [README.md](../README.md) → [00-vision/](.) → **이 파일**

---

## 1. 도입: "동등성" 척도의 정의

### 1.1 왜 100점인가

양평 부엌 서버 대시보드는 Supabase Cloud를 **직접 대체**하는 것이 목표가 아니다. 목표는 1인 운영자(김도영)가 Supabase Cloud를 쓰지 않아도 **동등한 생산성**과 **더 나은 데이터 주권·비용 구조**를 누리는 것이다.

따라서 "100점"은 다음을 의미한다:

> **100점 = Supabase Cloud 기능 커버리지 95% + 양평 특화 기능 5%**

- **95% 커버리지**: Supabase Cloud 대시보드에서 1인 개발자가 일상적으로 사용하는 모든 기능을 자체 대시보드에서 동일하게(혹은 동등하게) 수행 가능
- **양평 특화 5%**: Supabase Cloud에는 없는 기능 — 1인 운영 최적화 UI, 한국어 인터페이스, WSL2/PM2/Cloudflare Tunnel 통합 관리, AI 비용 투명성 대시보드

### 1.2 Supabase Cloud 2025 기능 목록 (기준선)

Supabase 공식 문서(2025) 기준 주요 기능 카테고리:

| 영역 | 핵심 기능 |
|------|---------|
| Table Editor | 행 CRUD, 필터/정렬, 외래키 뷰, RLS 정책 UI, 실시간 새로고침 |
| SQL Editor | Monaco 편집기, AI 어시스턴트, 쿼리 히스토리, 즐겨찾기, Explain Plan |
| Schema | ERD 뷰어, 테이블/뷰/함수/트리거/타입 관리 |
| DB Ops | 예약 작업, 웹훅, 백업/복원, 마이그레이션 |
| Auth | 이메일/패스워드, OAuth Providers, MFA(TOTP/WebAuthn), 세션 관리, 감사 로그 |
| Storage | 파일 업로드/다운로드, 버킷 정책, 이미지 변환, CDN |
| Edge Functions | 서버리스 실행, 시크릿 관리, 로그, Deno 런타임 |
| Realtime | Postgres Changes, Presence, Broadcast, Channel 관리 |
| Advisors | 성능 조언, 보안 조언, 인덱스 제안 |
| Data API | REST(PostgREST), GraphQL, Realtime WebSocket |
| Observability | 로그 뷰어, 쿼리 성능, 인프라 메트릭 |
| UX | AI 통합, 다크 테마, 키보드 단축키, 알림 |
| Operations | 배포 파이프라인, 환경 변수, 인프라 상태 |

### 1.3 점수 척도 정의

| 점수 | 의미 |
|------|------|
| 0~40점 | 해당 기능군 부재 또는 수동 CLI 작업만 가능 |
| 41~60점 | 핵심 기능만 구현, UI 부족, 자주 쓰는 기능 누락 |
| 61~80점 | 일상 업무 가능, 고급 기능 미비 |
| 81~95점 | Supabase Cloud 95% 대체 가능, 엣지 케이스 미흡 |
| 96~100점 | Cloud 동등 + 양평 특화 기능 포함 |

### 1.4 Wave 1 Compound Knowledge 재확인

Wave 1·2 리서치에서 확립한 구조:

- **하이브리드 필수형 (9카테고리)**: Table Editor / SQL Editor / Schema Visualizer / Auth Core / Auth Advanced / Edge Functions / Realtime / Data API / Advisors
  - 단일 OSS 솔루션으로 100점 불가 — 복수 도구의 패턴을 결합하는 자체구현 필수
- **단일 솔루션형 (5카테고리)**: Storage / DB Ops / Observability / UX Quality / Operations
  - 핵심 도구 1개 + 보조 도구 1개로 90~100점 도달 가능

이 분류가 아래 각 카테고리 100점 정의의 구조적 축이다.

---

## 2. 14 카테고리별 100점 정의표

---

### 1. Table Editor — 현재 75점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 60점 (기반) | 기본 CRUD, 행 추가/삭제, 단순 필터 | TanStack Table v8 기본 설정 |
| 80점 (v1.0) | 컬럼 정렬/멀티필터, 페이지네이션, 인라인 편집, NULL 표시 | 14c-α 자체구현 완료 상태 |
| 85점 | 컬럼 너비 조정, 행 선택 복수, CSV 내보내기, 외래키 미리보기 | 14c-α 보완 |
| 93점 (v1.1) | RLS 정책 UI 생성기, 정책 시뮬레이터, 뷰 지원, JSON 셀 뷰어 | 14c-β (RLS UI) — Wave 4 Phase 15 |
| 99점 | 외래키 그래프 뷰 (xyflow 연계), 테이블 관계 시각화, 컬럼 통계 | 14d — Wave 4 Phase 16 |
| **100점** | 낙관적 업데이트, 실시간 변경 감지(Realtime 연계), 멀티 탭 동기화 | 14e (Realtime 연동) — Wave 5 |

**갭 분석**: 현재 75점 → 100점까지 필요 기능 **12개**  
**핵심 갭**: RLS UI(+18점), 외래키 그래프(+6점), 실시간 동기화(+1점)  
**분류**: 하이브리드 필수형 (TanStack + xyflow + Realtime 채널 결합)

---

### 2. SQL Editor — 현재 70점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 60점 (기반) | Monaco 에디터, 기본 SQL 실행, 결과 테이블 표시 | Monaco + pg 읽기전용 스파이크 완료 |
| 70점 | 구문 강조, 자동완성(스키마), 실행 히스토리, 에러 표시 | 현재 수준 |
| 80점 (v1.0) | 즐겨찾기 쿼리, 탭 관리, 실행 취소, 결과 CSV 다운로드 | Supabase Studio 패턴 흡수 |
| 88점 | AI 어시스턴트(Anthropic BYOK), 자연어 → SQL, Explain Plan 시각화 | AI SDK v6 + pgFormatter |
| 95점(v1.1) | 폴더/태그 관리, Persisted Query(SQLite 저장), 쿼리 공유 URL | 14d 구현 |
| **100점** | Plan Visualizer(그래픽), 팀 스니펫 공유, 파라미터 바인딩 UI | 14e~14f 보너스 기능 |

**갭 분석**: 현재 70점 → 100점까지 필요 기능 **14개**  
**핵심 갭**: AI 어시스턴트(+18점), Persisted Query(+7점), Plan Visualizer(+5점)  
**예상 공수**: 40일(≈320h) — Wave 1 산정치  
**분류**: 하이브리드 필수형 (Monaco + Supabase Studio 패턴 + AI SDK + sqlpad 히스토리 패턴)

---

### 3. Schema Visualizer — 현재 65점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 50점 (기반) | 테이블 목록, 컬럼 상세, 기본 ERD (xyflow 정적) | 현재 기초 수준 |
| 65점 | 뷰/함수/트리거 목록, 관계선 표시, 줌/패닝 | 현재 수준 |
| 80점 (v1.0) | schemalint 컨벤션 검사, 자동 레이아웃(elkjs), 필터/검색 | schemalint 4.42 통합 |
| 90점 | RLS 정책 UI (/database/policies 신설), 함수 편집기 UI | 자체 RLS Monaco 편집기 |
| 95점 (v1.1) | 트리거 관리 UI, 커스텀 타입 뷰어, DDL 미리보기 | /database/triggers 신설 |
| **100점** | 인터랙티브 관계 편집, 마이그레이션 diff 뷰, AI ERD 생성 | 14d-1~11 전체 완료 |

**갭 분析**: 현재 65점 → 100점까지 필요 기능 **11개**  
**핵심 갭**: RLS UI(+15점), 트리거/함수 관리(+10점), 인터랙티브 편집(+5점)  
**예상 공수**: 50h (Wave 1 산정)  
**분류**: 하이브리드 필수형 (schemalint + xyflow/elkjs + 자체 RLS Monaco 결합)

---

### 4. DB Ops (Webhooks/Cron/Backups) — 현재 60점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 40점 (기반) | 수동 pg_dump 백업, 기본 스케줄 없음 | 초기 상태 |
| 60점 | node-cron 기반 예약 작업, 기본 wal-g 백업 | 현재 수준 |
| 75점 (v1.0) | UI 기반 Cron 관리 (생성/편집/실행 로그), 웹훅 UI, 백업 목록 | 14d-A~D 구현 |
| 88점 | RPO 60초 달성(WAL 아카이빙), RTO 30분(wal-g 복원), 자동 알림 | 14d-E~G 구현 |
| 95점 (v1.1) | B2 원격 백업, 복원 드릴 자동화(월 1회 스케줄), 마이그레이션 롤백 | 14d-H~J 구현 |
| **100점** | 백업 무결성 검증(자동 복원 테스트), 드리프트 감지, 감사 로그 연계 | 14e-1~10 완료 |

**갭 분析**: 현재 60점 → 100점까지 필요 기능 **16개**  
**핵심 갭**: WAL 아카이빙(+28점), B2 원격 백업(+7점), 감사 로그 연계(+5점)  
**예상 공수**: 68h (Wave 1 산정)  
**분류**: 단일 솔루션형 (node-cron + wal-g + B2 조합 — 각자 역할 명확)

---

### 5. Auth Core — 현재 70점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 50점 (기반) | 이메일/패스워드 로그인, bcrypt 해시, JWT 발급 | 기존 jose + bcrypt |
| 70점 | 세션 관리, Refresh Token, 역할 기반 접근(Admin/Viewer) | 현재 수준 |
| 80점 (v1.0) | 사용자 관리 UI, Anonymous 역할, 패스워드 정책 | Lucia 패턴 15개 흡수 |
| 90점 | Auth.js 패턴 흡수(세션 테이블, 인증 이벤트 훅), 이메일 인증 | Auth.js 패턴 차용 |
| 95점 (v1.1) | 로그인 감사 로그, 디바이스 목록, 세션 강제 종료 UI | 자체 sessions 테이블 확장 |
| **100점** | 이메일 템플릿 커스터마이징, Impersonation, 계정 삭제 플로우 | Phase 6 완료 |

**갭 분析**: 현재 70점 → 100점까지 필요 기능 **10개**  
**핵심 갭**: 사용자 관리 UI(+10점), 감사 로그(+5점), Impersonation(+5점)  
**예상 공수**: 30h (Wave 1 산정)  
**분류**: 하이브리드 필수형 (jose + Lucia 패턴 + Auth.js 패턴 결합 — 라이브러리 미채택, 패턴만 차용)

---

### 6. Auth Advanced (MFA/OAuth/Rate Limit) — 현재 15점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 15점 (현재) | 기능 없음 (단순 패스워드만) | 현재 상태 |
| 40점 | Rate Limit (DB 기반 또는 메모리), 로그인 실패 차단 | Phase 17 (Rate Limit) |
| 60점 | TOTP (otplib), WebAuthn (simplewebauthn) 동시 지원 | Phase 15+16 동시 — 22h |
| 80점 | OAuth Providers (GitHub, Google), PKCE 플로우 | Phase 18 (OAuth) |
| 90점 | CAPTCHA 통합 (Cloudflare Turnstile), 의심 IP 차단 | Phase 19 |
| **100점** | 세션 관리 대시보드, 디바이스 목록, MFA 정책 강제(per role) | Phase 20 완료 |

**갭 분析**: 현재 15점 → 100점까지 필요 기능 **18개**  
**핵심 갭**: TOTP+WebAuthn(+45점) — 가장 큰 단일 갭  
**예상 공수**: Phase 15~17 = 22h, 전체 100점 = ~60h  
**분류**: 하이브리드 필수형 (otplib + simplewebauthn + Cloudflare Turnstile 결합)

---

### 7. Storage — 현재 40점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 30점 (기반) | 로컬 파일시스템 저장, 기본 업로드 | 초기 상태 |
| 40점 | SeaweedFS 설치, 기본 PUT/GET API | 현재 수준 |
| 70점 (v1.0) | 버킷 관리 UI, 파일 브라우저, 다운로드/삭제, 용량 표시 | SeaweedFS 4.25 단독 |
| 85점 | 이미지 변환 파이프라인 (sharp + SeaweedFS), Presigned URL | Transform 파이프라인 구현 |
| 95점 (v1.1) | B2 원격 백업 연동, 멀티파트 업로드, 버킷 정책 UI | B2 + 버킷 ACL |
| **100점** | Resumable upload (tus 호환), CDN 캐시 통합, 스토리지 통계 대시보드 | tus 서버 구현 |

**갭 分析**: 현재 40점 → 100점까지 필요 기능 **15개**  
**핵심 갭**: 버킷 UI(+30점) — SeaweedFS 채택만으로 90~95점 달성 가능  
**특이사항**: MinIO는 2026-02-12 AGPL VC 아카이빙으로 명확 배제 확정  
**분류**: 단일 솔루션형 (SeaweedFS 단독 90~95점, tus로 100점)

---

### 8. Edge Functions — 현재 45점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 30점 (기반) | Next.js API Route만 존재, 격리 없음 | 현재 상태 |
| 45점 | isolated-vm v6 L1 기본 실행 (JS 샌드박스) | isolated-vm 기초 |
| 70점 (v1.0) | L1 완성(시크릿 주입, 타임아웃, 메모리 제한), UI 에디터, 배포 UI | isolated-vm v6 완성 |
| 85점 | Deno 사이드카 L2 (Node 호환 패키지, npm import) | Deno 사이드카 구현 |
| 92점 (v1.1) | Vercel Sandbox 위임 L3 (고비용/장시간 작업), 로그 스트리밍 | Sandbox 위임 구현 |
| **100점** | `decideRuntime()` 자동 라우팅, 함수 버전 관리, 지역 실행 통계 | 3층 라우팅 완성 |

**갭 분析**: 현재 45점 → 100점까지 필요 기능 **16개**  
**핵심 갭**: L1 UI 완성(+25점), Deno 사이드카(+15점), 자동 라우팅(+8점)  
**`decideRuntime()` 기준**: 실행시간 <5s → L1, npm 필요 → L2, 비용/시간 임계 초과 → L3  
**분류**: 하이브리드 필수형 (isolated-vm + Deno + Vercel Sandbox 3층)

---

### 9. Realtime — 현재 55점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 40점 (기반) | SSE 기반 기본 스트림, 단순 테이블 변경 알림 | 현재 SSE 스파이크 수준 |
| 55점 | wal2json CDC 기반 Postgres 변경 캡처 | wal2json 설치 완료 |
| 70점 (v1.0) | supabase-realtime 포팅 Channel API (subscribe/unsubscribe), 필터링 | Channel 구현 |
| 85점 | Presence (온라인 사용자 추적), Broadcast (임의 메시지), 클라이언트 SDK | Presence + Broadcast |
| 95점 (v1.1) | 채널 관리 UI, 연결 상태 모니터링, 재연결 자동화 | 채널 대시보드 |
| **100점** | Edge Function 트리거 (Realtime 이벤트 → Edge 함수 호출), 이벤트 재생 | 완전 연동 |

**갭 分析**: 현재 55점 → 100점까지 필요 기능 **15개**  
**핵심 갭**: Channel API(+30점), Presence+Broadcast(+15점), Edge 트리거(+5점)  
**Wave 1 결론**: wal2json(CDC 계층) + supabase-realtime 포팅(Channel 계층) = "경쟁이 아닌 역할 분담"  
**분류**: 하이브리드 필수형 (wal2json + supabase-realtime 포팅 2계층)

---

### 10. Advisors (성능/보안 조언) — 현재 65점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 45점 (기반) | 기본 슬로우 쿼리 표시, 수동 EXPLAIN | 초기 상태 |
| 65점 | schemalint 컨벤션 검사 통합, 기본 인덱스 제안 | 현재 수준 |
| 75점 (v1.0) | 3-Layer Advisor UI (schemalint + squawk + splinter TS 포팅) | 3계층 통합 UI |
| 85점 | squawk DDL 검사 CI 연동, 룰 음소거 UI, 심각도 분류 | squawk 통합 |
| 95점 (v1.1) | splinter 38 규칙 포팅(Node TS), 슬랙 다이제스트, PR 차단 훅 | splinter 포팅 완성 |
| **100점** | AI 기반 쿼리 최적화 제안, 커스텀 룰 작성 UI, 역사 트렌드 그래프 | AI 통합 |

**갭 分析**: 현재 65점 → 100점까지 필요 기능 **11개**  
**핵심 갭**: 3-Layer UI(+10점), squawk 통합(+10점), splinter 포팅(+10점)  
**예상 공수**: 80h (Wave 1 산정) — 점진 머지 방식  
**분류**: 하이브리드 필수형 (schemalint + squawk + splinter 3계층)

---

### 11. Data API + Integrations — 현재 45점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 30점 (기반) | 기본 Next.js API Route만 존재 | 초기 상태 |
| 45점 | REST API 기초(Prisma 기반), 단순 CRUD 엔드포인트 | 현재 수준 |
| 75점 (v1.0) | REST 강화(OpenAPI 스펙 자동생성), pgmq 큐 관리 UI, SQLite 보조 | REST + pgmq 채택 |
| 85점 | PostgREST-호환 필터링 문법, 관계 조인, RLS 적용 REST | Supabase REST 패턴 흡수 |
| 92점 (v1.1) | pgmq Archive 관리 UI, 웹훅 Outbox 패턴, API 키 관리 | pgmq + Outbox |
| **100점** | GraphQL (pg_graphql — 수요 트리거 4개 중 2개+ 시 도입), Realtime 구독 | pg_graphql 조건부 도입 |

**갭 分析**: 현재 45점 → 100점까지 필요 기능 **14개**  
**핵심 갭**: REST 강화(+30점 즉시 달성), pgmq UI(+10점), GraphQL(+8점 — 조건부)  
**pg_graphql 도입 트리거**: ① 팀 > 1명, ② 모바일 클라이언트, ③ 쿼리 복잡도 증가, ④ 프론트엔드 팀 요청  
**분류**: 하이브리드 필수형 (REST + pgmq + pg_graphql 조건부)

---

### 12. Observability + Settings — 현재 65점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 40점 (기반) | PM2 로그 표시, 기본 에러 알림 | 초기 상태 |
| 65점 | Vault(node:crypto AES-256-GCM) 기초, JWKS 엔드포인트 | 현재 수준 |
| 78점 (v1.0) | Vault UI(시크릿 관리), JWKS 자동 갱신, 인프라 상태 페이지 | Vault + JWKS 완성 |
| 88점 | 로그 뷰어 UI(레벨/시간 필터), 쿼리 성능 그래프(Recharts), 알림 설정 | 로그 + 메트릭 UI |
| 95점 (v1.1) | MASTER_KEY 회전 UI, KEK→DEK envelope 시각화, 보안 이벤트 로그 | 키 관리 UI |
| **100점** | AI 기반 이상 탐지, 슬랙/이메일 통합 알림, SLA 대시보드 | 완전 Observability |

**갭 分析**: 현재 65점 → 100점까지 필요 기능 **13개**  
**핵심 갭**: Vault UI(+13점), 로그 뷰어(+10점), 쿼리 성능 그래프(+10점)  
**MASTER_KEY 위치**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640, DQ-12.3 확정)  
**분류**: 단일 솔루션형 (node:crypto + jose JWKS 조합)

---

### 13. UX Quality (AI 어시스턴트·접근성) — 현재 75점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 55점 (기반) | 기본 다크 테마, 한국어 UI | 현재 기반 |
| 75점 | Sonner 알림, shadcn/ui 컴포넌트, 키보드 단축키 | 현재 수준 |
| 82점 (v1.0) | AI SDK v6 + Anthropic BYOK 통합, 자연어 쿼리 생성 | AI SDK v6 채택 ($2.5/월) |
| 90점 | MCP 서버 `mcp-luckystyle4u` 자체 구현, Cursor/Claude Code 통합 | 자체 MCP 구현 |
| 95점 (v1.1) | AI 비용 투명성 대시보드, 대화 히스토리 SQLite 영구 저장 | AI 비용 추적 |
| **100점** | 모바일 반응형(Capacitor 검토), PWA, 접근성(WCAG 2.1 AA) | 완전 UX |

**갭 分析**: 현재 75점 → 100점까지 필요 기능 **9개**  
**핵심 갭**: AI 통합(+7점 즉시), MCP 서버(+8점), 비용 대시보드(+5점)  
**AI 비용 예산**: ~$5/월 (AI SDK v6 기준, LangChain 대비 33% 경량)  
**분류**: 단일 솔루션형 (AI SDK v6 단독 채택)

---

### 14. Operations (배포·CI·모니터링) — 현재 80점 → 100점

| 수준 | 기능 목록 | 양평 구현 방식 |
|------|---------|---------------|
| 60점 (기반) | PM2 기본, 수동 배포 | 초기 상태 |
| 80점 | PM2 cluster:4, Cloudflare Tunnel, Capistrano-style 배포 스크립트 | 현재 수준 |
| 88점 (v1.0) | Canary 배포 (canary.stylelucky4u.com 시간차), 자동 symlink 롤백 | 카나리 + 롤백 |
| 94점 | GitHub Actions CI, 테스트 게이트, 자동 배포 트리거 | CI/CD 파이프라인 |
| 97점 (v1.1) | 배포 히스토리 UI, 롤백 버튼, 환경변수 관리 UI | 배포 대시보드 |
| **100점** | Zero-downtime 배포 (롤백 5초, 다운타임 0), 인프라 상태 자동 복구 | 완전 자동화 |

**갭 分析**: 현재 80점 → 100점까지 필요 기능 **8개**  
**핵심 갭**: Canary 배포(+8점), CI/CD 파이프라인(+6점), 배포 대시보드(+3점)  
**Docker 이행 조건**: 0개 충족 (현재 WSL2 네이티브가 최적)  
**분류**: 단일 솔루션형 (자체 Capistrano + PM2 cluster + Cloudflare Tunnel)

---

## 3. 카테고리별 현재→100점 갭 요약

| # | 카테고리 | 현재 | 100점 | 갭(점) | 필요 기능수 | 분류 |
|---|---------|------|-------|--------|------------|------|
| 1 | Table Editor | 75 | 100 | +25 | 12개 | 하이브리드 |
| 2 | SQL Editor | 70 | 100 | +30 | 14개 | 하이브리드 |
| 3 | Schema Visualizer | 65 | 100 | +35 | 11개 | 하이브리드 |
| 4 | DB Ops | 60 | 100 | +40 | 16개 | 단일 |
| 5 | Auth Core | 70 | 100 | +30 | 10개 | 하이브리드 |
| 6 | Auth Advanced | 15 | 100 | +85 | 18개 | 하이브리드 |
| 7 | Storage | 40 | 100 | +60 | 15개 | 단일 |
| 8 | Edge Functions | 45 | 100 | +55 | 16개 | 하이브리드 |
| 9 | Realtime | 55 | 100 | +45 | 15개 | 하이브리드 |
| 10 | Advisors | 65 | 100 | +35 | 11개 | 하이브리드 |
| 11 | Data API | 45 | 100 | +55 | 14개 | 하이브리드 |
| 12 | Observability | 65 | 100 | +35 | 13개 | 단일 |
| 13 | UX Quality | 75 | 100 | +25 | 9개 | 단일 |
| 14 | Operations | 80 | 100 | +20 | 8개 | 단일 |
| **합계** | | **825** | **1400** | **+575** | **182개** | 9 하이브리드 : 5 단일 |
| **평균** | | **58.9** | **100** | **+41.1** | **13개/카테고리** | |

**가장 큰 갭**: Auth Advanced (+85점) — 사실상 zero-to-full 구현 필요  
**가장 작은 갭**: Operations (+20점) — 현재 가장 성숙한 카테고리  
**즉시 효과 큰 카테고리**: Storage(SeaweedFS UI만으로 +30), Auth Advanced(TOTP+WebAuthn으로 +45)

---

## 4. 100점 도달 총 공수 추정

### 4.1 Wave 1 기존 산정 (5 카테고리)

| 카테고리 | Wave 1 산정 |
|---------|------------|
| SQL Editor | 320h (40일) |
| Schema Visualizer | 50h |
| DB Ops | 68h |
| Auth Core | 30h |
| Advisors | 80h |
| **소계** | **548h** |

### 4.2 나머지 9 카테고리 추정 (Wave 3 초기 산정)

| 카테고리 | 추정 공수 | 근거 |
|---------|---------|------|
| Table Editor (α→e) | 60h | 14c-α 완성 기준, RLS UI + Realtime 연동 |
| Auth Advanced (15→100) | 60h | Phase 15~20, TOTP 8h + WebAuthn 8h + OAuth 16h + Rate 6h |
| Storage (40→100) | 40h | SeaweedFS UI 20h + Transform 10h + tus 10h |
| Edge Functions (45→100) | 80h | isolated-vm 완성 30h + Deno 사이드카 30h + Sandbox 20h |
| Realtime (55→100) | 70h | Channel API 30h + Presence 20h + Edge 트리거 20h |
| Data API (45→100) | 50h | REST 강화 20h + pgmq UI 15h + pg_graphql 조건부 15h |
| Observability (65→100) | 45h | Vault UI 15h + 로그 뷰어 20h + AI 탐지 10h |
| UX Quality (75→100) | 30h | AI SDK 통합 10h + MCP 구현 15h + 비용 대시보드 5h |
| Operations (80→100) | 25h | Canary 배포 10h + CI/CD 10h + 대시보드 5h |
| **소계** | **460h** | |

### 4.3 전체 합산

| 구분 | 시간 |
|-----|------|
| Wave 1 확정 (5 카테고리) | 548h |
| Wave 3 추정 (9 카테고리) | 460h |
| **총 추정 공수** | **1,008h** |
| 1인 주 20h 작업 기준 | **~50주 (~1년)** |
| Phase 15-20 매핑 | Phase 15: Auth Advanced, Phase 16: Storage+Edge, Phase 17: Realtime+Data API, Phase 18: SQL Editor 완성, Phase 19: UX+Ops, Phase 20: 전체 통합 |

> **참고**: 1,008h는 상한 추정치. 병렬 구현(예: DB Ops + Storage) 및 기존 자산(jose, TanStack, Monaco) 활용으로 실제 공수는 600~800h 예상.

---

## 5. "왜 내 프로젝트가 100점을 목표로 해야 하나" — 정당화

### 5.1 Supabase Cloud vs 자체호스팅 3년 TCO 비교

| 항목 | Supabase Cloud Pro | 양평 자체호스팅 |
|------|-------------------|----------------|
| 기본 요금 | $25/월 × 36 = $900 | $0 (WSL2 기존 서버) |
| 컴퓨팅 초과 | $0.009/컴퓨팅h × 무제한 | $0 |
| 스토리지 | $0.021/GB · 월 | SeaweedFS — $0 |
| 대역폭 | $0.09/GB | Cloudflare Tunnel — $0 |
| 백업 | Pro 포함, 추가 보관 유료 | wal-g + B2 ~$2/월 |
| AI 기능 | Supabase AI = 별도 청구 | Anthropic BYOK ~$5/월 |
| **3년 총비용** | **~$1,200~2,400+** | **~$250 (전력+B2+AI)** |
| **절감액** | | **$950~2,150 (3년)** |

> 단순 비용만으로도 3년 내 ROI 달성. 1,008h 작업 공수는 1인 개발자가 1년에 걸쳐 진행하는 사이드 프로젝트 규모.

### 5.2 데이터 주권 가치 (비화폐적)

- **GDPR / 한국 개인정보보호법**: 사용자 데이터가 Supabase 미국 서버를 경유하지 않음
- **벤더 종속 탈피**: Supabase가 정책을 변경해도 영향 없음 (2023년 pricing 변경 사례)
- **커스터마이징 자유도**: Supabase Cloud에서 불가능한 기능(자체 MCP 서버, 커스텀 룰, 양평 특화 UI) 구현 가능
- **학습 자산**: 구현 과정 자체가 Supabase 내부 구조에 대한 깊은 이해 → 향후 프로젝트에 전이

### 5.3 "단계별 달성"의 현실적 경로

100점이 목표이지만 **각 단계가 독립적으로 가치 있음**:

- 80점 달성 시: 일상 개발 업무의 95% 처리 가능 (예상 시점: ~6개월)
- 90점 달성 시: Supabase Cloud 완전 대체 (예상 시점: ~9개월)
- 100점 달성 시: Cloud 초과 + 양평 특화 기능 완성 (예상 시점: ~12개월)

---

## 부록: Wave 3 입력 정보 출처

| 정보 | 출처 |
|------|------|
| 현재 점수 | docs/references/_PROJECT_VS_SUPABASE_GAP.md |
| Wave 1 채택안 | docs/research/2026-04-supabase-parity/README.md |
| Wave 2 매트릭스 점수 | docs/research/2026-04-supabase-parity/01-research/{01~14}/ |
| 공수 산정 | Wave 1 Round 2 deep-dive 합산 |
| TCO 계산 | Supabase 공식 Pricing 페이지 + AWS/B2 요금 |

---

> 최종 수정: 2026-04-18 (Wave 3 · M1)  
> 다음 단계: 06-operational-persona.md → 07-dq-matrix.md → Wave 4 청사진
