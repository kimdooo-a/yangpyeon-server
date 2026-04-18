# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 배포 — /ypserver prod (세션 24e에서 5 갭 보강 완료):
#   /ypserver prod                      # Phase 1~5 자동 (Windows 빌드 → 복사 → migrate → PM2)
#   /ypserver prod --skip-win-build     # Windows 빌드 항상 실패 환경에서 사용
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan (`/login` 페이지 사용, 백엔드는 `/api/v1/auth/login` Bearer) |

## 필수 참조 파일 ⭐ kdywave 완주 상태

```
CLAUDE.md
docs/status/current.md
docs/handover/260418-session29-supabase-parity-wave-5.md   ⭐ 최신 (세션 29 kdywave 완주)
docs/handover/260418-session28-supabase-parity-wave-4.md
docs/handover/260418-session25c-tunnel-complete-playwright.md
docs/handover/260418-session27-supabase-parity-wave-3.md
docs/handover/260418-session26-supabase-parity-wave-2.md
docs/handover/260418-session25-supabase-parity-wave-1.md
docs/research/2026-04-supabase-parity/README.md            ⭐ Wave 1+2+3+4+5 마스터 인덱스
docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md  ⭐ status=completed
docs/research/2026-04-supabase-parity/00-vision/           ⭐ Wave 3 산출물 11 문서
docs/research/2026-04-supabase-parity/02-architecture/     ⭐ Wave 4 Tier 1+2 산출물 17 문서
docs/research/2026-04-supabase-parity/03-ui-ux/            ⭐ Wave 4 Tier 3 UI/UX 5 문서
docs/research/2026-04-supabase-parity/04-integration/      ⭐ Wave 4 Tier 3 통합 4 문서
docs/research/2026-04-supabase-parity/05-roadmap/          ⭐ Wave 5 로드맵 13 문서
docs/research/2026-04-supabase-parity/06-prototyping/      ⭐ Wave 5 스파이크 9 문서 (22건 신규)
docs/research/2026-04-supabase-parity/07-appendix/         ⭐ Wave 5 부록 3 문서 (glossary·DQ·genesis)
docs/solutions/2026-04-18-kdywave-hybrid-vs-monolithic-pattern.md   ⭐ Compound Knowledge 1
docs/solutions/2026-04-18-pg-extension-vs-self-impl-decision.md     ⭐ Compound Knowledge 2
docs/handover/260418-session24-phase-14c-alpha.md
docs/handover/260418-session24-phase-14c-beta.md
docs/handover/260417-session23-phase-14c-updated-at-fix.md
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 29 종료 시점)

### 완료된 Phase
- Phase 1~13 전부 완료
- Phase 14-S (세션 15~16): Supabase 이식 Phase A+B
- Phase 14a (세션 18): Table Editor 읽기 전용
- Phase 14b (세션 21~22): Table Editor CRUD + curl E2E DOD
- Phase 14c 1순위 (세션 23): `@updatedAt` DB DEFAULT 근본 수정
- Phase 14c-α (세션 24): 인라인 셀 편집 + 낙관적 잠금 (ADR-004)
- Phase 14c-β (세션 24b): 복합 PK 지원 + Next.js private folder fix + TIMESTAMP(3) 정렬 (ADR-005)
- Phase 14c-γ (세션 24c): 권한 매트릭스 E2E 13 시나리오 PASS (ADR-006)
- 방향 C Vitest (세션 24d): 89개 유닛 테스트 PASS, ADR-003 §5 재활성화
- 방향 B `/ypserver` 보강 (세션 24e): 5 갭 해소
- 세션 25: Supabase 100점 평가 + kdywave Wave 1 완료 (33/26,941)
- 세션 26: kdywave Wave 2 완료 (28/18,251)
- 세션 27: kdywave Wave 3 완료 (11/8,350)
- 세션 25-A/B/C: VIEWER 확장 + Tunnel 안정화
- 세션 28: kdywave Wave 4 완료 (26/32,918)
- **세션 29: kdywave Wave 5 완료 (25/20,128) — Phase 0-4 전체 완주** ⭐

### kdywave 최종 결과 (2026-04-18 완주)

| Wave | 문서 | 줄 수 | 특징 |
|------|------|-------|------|
| 1 | 33 | 26,941 | 14 카테고리 기초 deep-dive, 1순위 결정 |
| 2 | 28 | 18,251 | 비교 매트릭스 + 1:1 비교, 역방향 피드백 0 |
| 3 | 11 | 8,350 | 비전·FR/NFR·DQ 재분배, MVP=Phase 15-17 |
| 4 | 26 | 32,918 | 아키텍처 청사진 3 Tier |
| 5 | 25 | 20,128 | 로드맵·스파이크·부록, Phase 0-4 완주 |
| **합계** | **123** | **106,588** | 계획 ~105 대비 **+17%** |

### Wave 5 핵심 산출물 상세

**05-roadmap/ (13 문서 / 10,629줄)**
- 9 릴리스 코드명: Nocturne → Cerulean → Obsidian → Crimson → Verdant → Amber → Ivory → Azure → Centurion
- M1~M16 마일스톤 (50주 텍스트 간트)
- MVP: Phase 15-17, 122h, MVP FR 27건 매핑
- 리스크: R-001~035 전수, Top 10 Critical
- TD: 22건, 20% 할당 원칙
- KPI: 127개 (14카×4단계, 38 NFR 전수)
- 3년 TCO: Supabase $1,200~2,400 vs 양평 $250 = **$950~2,150 절감**

**06-prototyping/ (9 문서 / 6,621줄)**
- 22 신규 스파이크 (SP-010~031) + 기존 9건 = **31 스파이크 전체 인덱싱**
- 우선 세트 SP-010~016 (29h, 4주)
- 지연 세트 SP-017~031 (63h, 조건부 트리거)
- 5단계 실행 프로토콜 + kdyspike 연계

**07-appendix/ (3 문서 / 2,878줄)**
- 용어집 230+ 항목 (용어 182 + 약어 50)
- DQ 64건 전수 최종 Resolution (100%) + 재검토 트리거 45건 인덱스
- kdygenesis 인수인계: `_PROJECT_GENESIS.md` 초안 + 85+ 태스크

### 배포 상태 ✅
- **원격 main**: 세션 29에서 Wave 5 25 문서 + README + CHECKPOINT + 메타 일괄 단일 커밋
- **프로덕션(WSL2 PM2)**: 세션 29는 코드 변경 없음 — 재배포 불필요
- **Cloudflare Tunnel**: 세션 25-C sysctl 적용 후 curl 28/28 성공, Playwright 산발 1건 재발 기록. "확률적 매우 높음" 결론

## 현재 DB 구조 (변경 없음)

### PostgreSQL (Prisma) — 10 테이블 + 롤 2종
- 10 테이블: User, Folder, File, SqlQuery, EdgeFunction, EdgeFunctionRun, Webhook, CronJob, ApiKey, LogDrain
- 롤: `app_readonly` + `app_readwrite`
- `updated_at` 컬럼: 9/10 테이블 (EdgeFunctionRun 제외) — 전부 `DEFAULT CURRENT_TIMESTAMP`
- raw SQL UPDATE 시 auto-bump 적용

### SQLite (Drizzle) — data/dashboard.db
- audit_logs, metrics_history, ip_whitelist
- 감사 로그 action: TABLE_ROW_INSERT/UPDATE/DELETE/UPDATE_CONFLICT/PERMISSION_DENIED 등

## 추천 다음 작업

### 우선순위 1: 우선 스파이크 7건 순차 실행 (4주, 29h) ⭐
```
/kdyspike --full "pgmq vs BullMQ PoC"    # SP-010 (4h)
/kdyspike --full "PM2 cluster:4 benchmark"   # SP-011 (4h)
/kdyspike --full "node:crypto envelope perf"  # SP-012 (4h)
/kdyspike --full "jose JWKS grace period"    # SP-013 (3h)
/kdyspike --full "AI SDK v6 cost telemetry"  # SP-014 (4h)
/kdyspike --full "canary 5% traffic 실측"    # SP-015 (5h)
/kdyspike --full "wal-g RPO 60초 검증"       # SP-016 (5h)
```
- 입력: `06-prototyping/02-spike-priority-set.md` (SP-010~016 상세 스펙)
- 산출: 각 스파이크별 PoC 결과 + 의사결정 + 다음 단계
- Phase 15 착수 전 필수 (특히 SP-009 TOTP+WebAuthn MVP는 Phase 15 직전 위치)

### 우선순위 2: Phase 15 Auth Advanced MVP (22h) ⭐
- SP-009(TOTP+WebAuthn MVP) 결과 반영 후 착수
- 청사진: `02-architecture/03-auth-advanced-blueprint.md`
- 구성:
  1. `otplib` 통합 + TOTP QR 발급 (8h)
  2. `@simplewebauthn/server` + WebAuthn 등록·인증 (10h)
  3. Rate Limit (PostgreSQL 기반, Redis 트리거 조건 미충족 유지) (4h)
- DOD: MFA 활성 계정 생성 + 백업 코드 + 관리자 강제 해제 + E2E PASS

### 우선순위 3: `/kdygenesis` 연계로 태스크 자동화
- 입력: `07-appendix/03-genesis-handoff.md`의 `_PROJECT_GENESIS.md` 초안
- 85+ 태스크를 oxidation하여 주간 단위 실행 플로우 자동 생성
- `/kdygenesis --from-wave` 명령어로 진입

### 우선순위 4: Phase 14c-γ USER-as-VIEWER UI 픽스 (남은 소과제)
- 세션 25-C 발견: `src/components/layout/sidebar.tsx` line 96 `MANAGER_PLUS_PATHS`에 `/tables` 포함 → USER 롤 사이드바에 테이블 메뉴 미노출
- Wave 4 `09-table-editor-blueprint.md` 참조
- 수정 옵션:
  - (A) `/tables`만 `VIEWER_READONLY_PATHS` 신설로 이관
  - (B) 사이드바 라벨 동적 (USER는 "읽기 전용" 배지)
  - (C) 현 상태 유지 + ADR-007 "Navigation disclosure 최소화" 정당화

### 우선순위 5: Playwright 안정성 보강 (세션 25-C 후속)
- `playwright.config.ts`에 `retries: 2` 추가 → 산발 530 흡수
- `login()` 헬퍼에 `response.status() === 530` 체크 + 지수 백오프 재시도
- 100 trial 대규모 측정으로 Tunnel 안정성 정량 % 확정
- 재실행 후 전 PASS 확인 시 β/γ 스펙 확장

### 우선순위 6: 추가 선택 작업
- Cloudflare Tunnel 다중 인스턴스 (세션 25-C에서 재고 승격)
- Phase 14c-γ UI 픽스
- `/kdywave --feedback` (향후 신규 기술 등장 시 재개 가능)

### 진입점 예시
```
/kdyspike --full "SP-010 pgmq PoC"      # 우선 스파이크 시작
/kdygenesis --from-wave                   # 태스크 자동화 연계
/kdyguide --start                         # 현 상태 브리핑 + 방향 추천
```

## 알려진 이슈 및 주의사항

- **kdywave 완주**: Phase 0-4 전체 완료. 123 문서 / 106,588줄. `_CHECKPOINT_KDYWAVE.md status=completed`. 향후 신규 기술 등장 시 `/kdywave --feedback` 재개 가능
- **Wave 5 이중 관점 문서화**: 05-roadmap/의 4 파일 쌍(00/02/03/04/05)은 세션 28-1(상세 레지스트리) + 28-2(전략·관리) 서로 다른 운영 목적. 병합 금지
- **MVP 착수 조건 충족**: 우선 스파이크 7건 (4주, 29h) + Phase 15 (22h) = 총 51h, 4-6주 내 MVP 가능
- **22 신규 스파이크 × 19 DQ 100% 매핑** (`06-prototyping/01-spike-portfolio.md`)
- **DQ-12.3 MASTER_KEY**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
- **Compound Knowledge 누적 7건 + Wave 5 내부 5건**: (외부) csrf-api-settings-guard / nextjs-private-folder-routing / raw-sql-updatedat-bump / timestamp-precision-optimistic-locking / kdywave-hybrid-vs-monolithic-pattern / pg-extension-vs-self-impl-decision / cloudflare-tunnel-quic-tuning-partial-fix. (Wave 5 내부) 이중 관점 문서화 / 22 스파이크 × 19 DQ 매핑 / MVP 착수 조건 / 역방향 피드백 0건 정당성 / +148% 의미
- **raw SQL UPDATE auto-bump**: `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH
- **`/ypserver` 5 갭 해소 (세션 24e)**
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`는 Referer/Origin 필수
- **WSL auto-shutdown + /tmp 휘발**: E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리 필요
- **Cloudflare Tunnel 간헐 530**: 세션 25-B/C 완화, "100% 보증 아님, 확률적 매우 높음". 회귀 감시 `bash scripts/tunnel-measure-v2.sh` (edge 관통 기준)
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용 → 세션 시작 가이드대로 스킵
- **information_schema 롤 필터링**: `app_readonly`에서 `table_constraints`/`key_column_usage` 0행 → introspection은 `pg_catalog` 사용
- **Windows `next build` 불가**: WSL2 빌드가 진실 소스 (`/ypserver --skip-win-build` 옵션 사용)
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임
- ~~**Cloudflare Tunnel WSL2 재기동**~~ — 세션 25-C 진단에서 기 완료 확인

## 사용자 기록 (메모리)

- [자율 실행 우선](../../../../Users/smart/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_autonomy.md) — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외)

---
[← handover/_index.md](./_index.md)
