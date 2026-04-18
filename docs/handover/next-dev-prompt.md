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
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> (`/login` 페이지 사용, 백엔드는 `/api/v1/auth/login` Bearer) |

## 필수 참조 파일

```
CLAUDE.md
docs/status/current.md
docs/handover/260418-session27-supabase-parity-wave-3.md   ⭐ 최신 (세션 27 완료)
docs/handover/260418-session26-supabase-parity-wave-2.md
docs/handover/260418-session25-supabase-parity-wave-1.md
docs/research/2026-04-supabase-parity/README.md            ⭐ Wave 1+2+3 마스터 인덱스
docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md
docs/research/2026-04-supabase-parity/00-vision/           ⭐ Wave 3 산출물 11 문서
docs/solutions/2026-04-18-kdywave-hybrid-vs-monolithic-pattern.md   ⭐ Compound Knowledge 1
docs/solutions/2026-04-18-pg-extension-vs-self-impl-decision.md     ⭐ Compound Knowledge 2
docs/handover/260418-session24-phase-14c-alpha.md
docs/handover/260418-session24-phase-14c-beta.md
docs/handover/260417-session23-phase-14c-updated-at-fix.md
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 27 종료 시점)

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
- 방향 B `/ypserver` 보강 (세션 24e): 5 갭 해소(Windows skip / prisma migrate / drizzle / Compound Knowledge 링크)
- **세션 25**: Supabase 100점 평가(절대 55/가중 60) + **kdywave Wave 1 완료(33 deep-dive, 26,941줄)**
- **세션 26**: **kdywave Wave 2 완료(28 매트릭스+1:1, 18,251줄)** — 7 Agent 병렬, 역방향 피드백 0건, 누적 61 문서 / 45,192줄
- **세션 27**: **kdywave Wave 3 완료(비전+FR/NFR+DQ 재분배, 11 문서 / 8,350줄)** — 7 Agent 병렬(V/R opus, M sonnet). 100점 총 공수 **1,008h(~50주)**, 3년 TCO **$950~2,150 절감**, MVP=Phase 15~17. ADR-001 Multi-tenancy 의도적 제외(재검토 트리거 4). 누적 **72 문서 / 53,542줄**
- **세션 25-A** (2026-04-18, 세션 25와 동시 진행): 세션 24 권장 4건 병렬 — Compound Knowledge 4건 + Playwright 인프라 + runReadwrite 33 케이스(vitest 89→131) + **VIEWER 확장 구현**(table-policy SELECT 분기 + GET 핸들러 USER 포함 + 9 테스트). 5525bd2에 통합 commit
- **세션 25-B**: 25-A 후속 3단계 — git push, `/ypserver prod` 배포 + viewer-curl **V1~V9 라이브 매트릭스 전 PASS**, Cloudflare Tunnel QUIC→HTTP/2 폴백 부분 수정(~30%→~50%, 100% 미달, KT 회선 패킷 drop 진단 완료). solution doc `2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md`

### Wave 1 결과 — 14 카테고리 1순위 + 100점 청사진
| # | 카테고리 | 1순위 결정 | 100점 단계 |
|---|---------|----------|-----------|
| 1 | Table Editor | TanStack v8 + 14c-α 자체구현 | 14c-α/β/14d/14e |
| 2 | SQL Editor | sqlpad + Outerbase + Supabase Studio 3중 흡수 | 14c~14f, 40일 |
| 3 | Schema Viz | schemalint + 자체 RLS + Trigger 편집기 | /database/{policies,functions,triggers} 신설, 50h |
| 4 | DB Ops | node-cron 자체 + wal-g | RPO 60s, RTO 30분, 68h |
| 5 | Auth Core | jose + Lucia 패턴 + Auth.js Provider/Hook | 6 Phase, 30h |
| 6 | Auth Advanced ★ | TOTP + WebAuthn + PG Rate Limit (전부 동시) | Phase 15-17 = 60점 |
| 7 | Storage ★ | SeaweedFS 단독 | 40→90~95 |
| 8 | Edge Functions ★ | 3층 하이브리드 (isolated-vm v6 + Deno + Sandbox) | 45→92~95 |
| 9 | Realtime ★ | wal2json + supabase-realtime 포팅 | 55→100 |
| 10 | Advisors | 3-Layer (schemalint + squawk + splinter 38룰) | 80h |
| 11 | Data API | REST 강화 + pgmq + SQLite 보조 (GraphQL 보류) | 45→80~85 |
| 12 | Observability | node:crypto envelope + jose JWKS ES256 | Vault + JWKS + Infrastructure |
| 13 | UX Quality | AI SDK v6 + Anthropic BYOK + 자체 MCP | ~$5/월 |
| 14 | Operations | Capistrano-style + PM2 cluster + canary | 자체 + 자동 symlink 롤백 |

★ = 사전 스파이크 4건 모두 "조건부 GO"

### Wave 1 DQ 현황
- **잠정 답변 9건**: DQ-1.1~1.9 (각 카테고리 1순위 결정)
- **신규 DQ 64건**: Wave 2 매트릭스에서 글로벌 시퀀스로 통합 재할당 예정

### 배포 상태 ✅
- **원격 main**: 세션 27에서 Wave 3 11 문서 + 메타 + `.gitignore` 보강 단일 커밋
- **프로덕션(WSL2 PM2)**: 세션 27은 코드 변경 없음 — 재배포 불필요
- **세션 24/24b/24c/24d/24e의 미커밋 잔재**는 세션 25 종료 커밋에 통합됨 (세션 27 기준 `.gitignore`에 `test-results/` + `playwright-report/` 추가로 이후 재발 방지)

### 검증 결과 (세션 25)
| 항목 | 결과 |
|------|------|
| 33/33 deep-dive 500줄+ 계약 | ✅ |
| 10차원 스코어링 + 앵커링 ("왜 N점, 왜 N±1점이 아닌가") | ✅ |
| 참고 자료 10+ (URL) | ✅ |
| TODO/TBD 0건 | ✅ (1건 코드 예시 안 마일스톤 표시는 본문 미완성 아님) |
| 사전 스파이크 4건 | ✅ 모두 "조건부 GO" |

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

### 우선순위 1: kdywave Wave 4 진입 (권장 — 자연스러운 연속) ⭐
```
/kdywave --resume
```
- Phase 2 Wave 4 — 카테고리별 아키텍처 청사진 **20~30 문서**
- 입력: Wave 3의 55 FR + 38 NFR + CON/ASM 12씩 + ADR-001 + DQ 매트릭스 + Phase 15-22 매핑
- 중심축: Wave 1+2 Compound Knowledge 2건(하이브리드 9:5 / 1:1 계층 분리) + Wave 3 `14-categories-priority.md`
- Wave 4 완료 후 Wave 5(로드맵 + 스파이크 10~15)

### 우선순위 2: MVP 즉시 착수 가능 영역 (Wave 4 대기 없이도 가능)
- **DQ-1.3 SeaweedFS 1주 PoC**: Storage 40→90 (단일 솔루션형, 빠른 ROI)
- **DQ-1.1 Phase 15 otplib TOTP**: Auth Advanced 15→27 (30h 단일 Phase)
- **DQ-1.7 pgmq 도입 spec 작성**: Data API Queue 0→90 (확장 1줄)

### 우선순위 3: Cloudflare Tunnel 후속 5건 (세션 25-B 위임)
1. WSL2 `sysctl` `tcp_keepalive` + `rmem`/`wmem`
2. WSL systemd 활성화 (idle shutdown 방지)
3. `cloudflared` 다중 인스턴스
4. Cloudflare WARP
5. auto-restart cron

### 우선순위 4: Phase 14c-γ USER-as-VIEWER 분리 spec
- 세션 24c에서 권한 매트릭스 13 시나리오 PASS, USER role SELECT 허용 정책은 별도 spec 이관 (ADR-006)
- 세션 25-A에서 VIEWER 확장 구현 + 25-B 라이브 매트릭스 전 PASS 확인됨 → spec 문서화만 남음

### 진입점 예시
```
/kdywave --resume                       # Wave 4 진입 (권장)
/kdyguide --start                        # 현 상태 브리핑 + 방향 추천
/kdyguide --route "SeaweedFS PoC"        # Wave 1 결과 즉시 코드화
/kdyguide --route "TOTP Phase 15"        # Auth Advanced MVP 착수
```

## 알려진 이슈 및 주의사항

- **Wave 1+2+3 완료, Wave 4~5 미진입**: ~91 문서 중 **72 완료** (53,542줄, 79%). 다음 세션에서 Wave 4(청사진) 권장
- **Wave 2에서 역방향 피드백 0건**: Wave 1 채택안 14/14 모두 민감도 분석 1위 유지 — Wave 4 기반 견고
- **Wave 3 입력 집약**: ADR-001(Multi-tenancy 제외) + 55 FR + 38 NFR + 64 DQ 재분배 완료 — Wave 4에서 청사진 설계에 직접 투입 가능
- **DQ-12.3 추가 확정**: MASTER_KEY=`/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
- **정량화된 재고 조건 명시됨**: Garage(3조건) / pg_graphql(4 수요 트리거 중 2+) / Docker(0조건 충족) / AWS KMS(2 트리거 중 1) — 환경 변화 시 트리거만 점검하면 됨
- **Wave 1+2 누적 줄 수 45,192줄 컨텍스트 부담**: Wave 3 진입 시 README 마스터 + 필요 매트릭스만 selective read 권장. 에이전트별 L3 프롬프트에 읽을 파일 경로 명시 필수
- **Compound Knowledge 7건 누적**: 세션 24의 4건(csrf-api-settings-guard / nextjs-private-folder-routing / raw-sql-updatedat-bump / timestamp-precision-optimistic-locking) + 세션 25의 2건(kdywave-hybrid-vs-monolithic-pattern / pg-extension-vs-self-impl-decision) + **세션 25-B 1건(cloudflare-tunnel-quic-tuning-partial-fix — HTTP/2 폴백으로 ~30%→~50% 부분 수정 + 결정적 진단)**
- **세션 24/24b/24c/24d/24e의 잔여 미커밋**(코드 + scripts + playwright + test-results)은 세션 25 종료 커밋에 포함됨 (재커밋 불필요)
- **raw SQL UPDATE auto-bump**: `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH는 `updated_at` 컬럼이 있고 사용자가 명시 설정 안 한 경우 `SET ..., updated_at = NOW()` 자동 주입
- **`/ypserver` 5 갭 해소 (세션 24e)**: Windows build skip / prisma migrate / drizzle migrate / Compound Knowledge 링크 추가됨
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`는 Referer/Origin 필수
- **WSL auto-shutdown + /tmp 휘발**: E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리 필요
- **Cloudflare Tunnel 간헐 530**: 세션 25-B에서 HTTP/2 폴백 + retries/keepAlive 튜닝 적용(`~/.cloudflared/config.yml`) → 안정성 ~30%→~50% **부분 개선**. 100% 미달은 KT 회선 edge↔connector 패킷 drop. 1차 조치 `pm2 restart cloudflared` (cloudflared restart 직후 30~40초 edge propagation lag 530 정상)
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용 → 세션 시작 가이드대로 스킵
- **information_schema 롤 필터링**: `app_readonly`에서 `table_constraints`/`key_column_usage` 0행 → introspection은 `pg_catalog` 사용
- **Windows `next build` 불가**: WSL2 빌드가 진실 소스 (`/ypserver --skip-win-build` 옵션 사용)
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임
- **Cloudflare Tunnel WSL2 재기동**: systemd 비활성 환경에서 Windows 재시작 시 `pm2 resurrect` 또는 systemd 활성 검토

## 사용자 기록 (메모리)

- [자율 실행 우선](../../../../Users/smart/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_autonomy.md) — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외). 세션 24/25에서 활발히 적용

---
[← handover/_index.md](./_index.md)
