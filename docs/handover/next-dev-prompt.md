# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
# 개발 서버
npm run dev

# WSL2 배포 — /ypserver 스킬 사용 권장
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan |

## 필수 참조 파일

```
docs/MASTER-DEV-PLAN.md                              — 세션별 개발 마스터 계획서 (단일 진실 소스)
CLAUDE.md                                            — 프로젝트 규칙 + 문서 트리
docs/status/current.md                               — 현재 상태 + 세션 요약표
docs/handover/260412-session17-monaco-xyflow.md      — 최신 인수인계서 (세션 17)
docs/handover/260412-session16-supabase-deploy.md    — 직전 인수인계서 (세션 16)
docs/handover/260412-session15-supabase-clone.md     — 세션 15
docs/handover/260412-session14-phase13d-complete.md  — 세션 14
docs/references/_SUPABASE_TECH_MAP.md                — Supabase 이식 기술 매핑
docs/references/_PROJECT_VS_SUPABASE_GAP.md          — 현 프로젝트 vs Supabase 갭
docs/research/decisions/ADR-002-supabase-adaptation-strategy.md — Supabase 이식 전략
docs/solutions/2026-04-12-*.md                       — 세션 17 Compound Knowledge (Monaco SSR, xyflow+ELK, Windows lightningcss)
```

## 최근 완료된 작업

- 세션 1~4: 프로젝트 초기화 + 대시보드 + 보안 + 디자인
- 세션 5: kdywave 종합 분석 + 마스터 계획서
- 세션 6: SPIKE 검증 + Zod
- 세션 7: 회원관리 + 파일박스 v2 (PostgreSQL)
- 세션 8~12: 토스트, 감사로그DB, IP화이트리스트, 메트릭차트, SSE실시간, 감사로그UI, 환경변수관리, DB인증통합, 역할접근제어, Cmd+K
- 세션 13: 회원관리 백엔드 + PostgreSQL 연결/마이그레이션 + 이메일+비밀번호 로그인 + Warm Ivory 라이트 테마 + Phase 13d 착수
- 세션 14: 중단 터미널 3개 복구 + Phase 13d 완료 → **Phase 13 전체 완료**
- 세션 15: Supabase 관리 체계 이식 — Phase A(리서치 문서 23건) + Phase B(Prisma +7 모델, 11 P0 모듈 스캐폴드 55 파일). `tsc` clean.
- 세션 16: 세션 15 프로덕션 배포 — Prisma 증분 마이그레이션 적용, `app_readonly` PG 롤 + SELECT 권한 + SET ROLE 검증, `.env`에 `ENABLE_DB_BACKUPS=true`, monaco/xyflow/elkjs 설치, 12개 P0 페이지 HTTP 307 smoke. 레거시 에러 2건 수정(커밋 `90c1c1e`). Cloudflare Tunnel PM2 등록.
- **세션 17 (최신)**: UI 고도화 — SQL Editor `textarea` → **Monaco(`@monaco-editor/react`, dynamic ssr:false)** + Ctrl/Cmd+Enter 단축키. Schema Visualizer 카드 그리드 → **xyflow v12 + elkjs layered(RIGHT)** 자동 레이아웃(`SchemaFlow.tsx` 분리). Playwright로 12 P0 페이지 E2E 전 **콘솔 에러 0건** 검증. 부수 버그: 기본 쿼리 `FROM "User"` → `FROM users`(Prisma `@@map`) 수정. Windows `next build`는 `lightningcss-win32-x64-msvc` 부재로 불가(WSL2가 진실 소스).

## 현재 DB 구조

### PostgreSQL (Prisma) — 10 테이블 전부 적용 완료 (세션 16)
- User (id, email, name, phone, passwordHash, role, isActive, lastLoginAt)
- Folder (id, name, parentId, ownerId) — 자기참조 트리
- File (id, name, storedName, mimeType, size, folderId, ownerId)
- **세션 15 추가 + 세션 16 적용**:
  - SqlQuery / EdgeFunction / EdgeFunctionRun / Webhook / CronJob / ApiKey / LogDrain
  - enum: QueryScope, FunctionRuntime, RunStatus, WebhookEvent, CronKind, ApiKeyType, DrainType
  - PG 롤: `app_readonly` NOLOGIN + SELECT ALL + DEFAULT PRIVILEGES (미래 테이블 자동 SELECT)
  - enums: QueryScope, FunctionRuntime, RunStatus, WebhookEvent, CronKind, ApiKeyType, DrainType
  - 마이그레이션: `prisma/migrations-draft/all_tables_from_empty.sql`(참고용 전체 DDL)
  - 적용 명령: `npx prisma migrate dev --create-only --name supabase_clone_session_14` 후 리뷰 → `migrate deploy`

### SQLite (Drizzle) — data/dashboard.db
- audit_logs (id, timestamp, action, ip, path, method, status_code, user_agent, detail)
- metrics_history (id, timestamp, cpu_usage, memory_used, memory_total)
- ip_whitelist (id, ip, description, created_at)

## 현재 Git 상태

```
브랜치: main
리모트: origin → https://github.com/kimdooo-a/yangpyeon-server.git
```

## 추천 다음 작업

**마스터 계획서(`docs/MASTER-DEV-PLAN.md`)의 세션 번호를 따라 진행합니다.**

### 즉시 가능 (세션 17 후속 — 최우선)
1. ~~Prisma 마이그레이션 적용~~ → 세션 16 완료
2. ~~PG 읽기전용 롤 발급~~ → 세션 16 완료
3. ~~Backups 활성~~ → 세션 16 완료
4. ~~UI 고도화 의존성 설치~~ → 세션 16 완료
5. ~~HTTP smoke test~~ → 세션 16 완료
6. ~~브라우저 E2E (12개 P0)~~ → 세션 17에서 Playwright로 완료, 콘솔 에러 0건
7. ~~SQL Editor Monaco 치환~~ → 세션 17 완료
8. ~~Schema Visualizer xyflow 치환~~ → 세션 17 완료
9. **Cron 부트스트랩 이식** — `src/lib/cron/registry.ts` `ensureStarted()`가 `/api/v1/cron` 첫 히트까지 대기. PM2 재시작 직후 Cron 대기 상태 → middleware/proxy 또는 별도 워커로 진입점 이식
10. **`npm audit` 11건 정리** — moderate 10, high 1 (세션 16~17 잔존). 업데이트 영향 분석 후 `npm audit fix` 선별 적용
11. **Turbopack NFT 경고 해소** — `next.config.ts` → `src/lib/backup/pgdump.ts` 전체 프로젝트 트레이스. `turbopackIgnore` 주석 또는 static scope 이동
12. **/ypserver 스킬 보강** — Phase 1 Windows `next build`가 `lightningcss-win32-x64-msvc` 부재로 항상 실패. `--skip-local-build` 플래그 또는 WSL 빌드 자동 전환 분기 추가

### UI 후속 (선택)
- SQL Editor Monaco 자동완성 확장 (PostgreSQL 전용 키워드 `returning/jsonb/ilike` 등)
- Schema Visualizer 노드 더블클릭 시 `/sql-editor`로 이동 + `SELECT * FROM {table} LIMIT 100` 프리로드
- xyflow `fitView` 재실행 버튼 (뷰포트 리셋)

### 완료된 범위 (참고)
- Phase 1~13 전부 완료
- Phase 13d 스켈레톤 UI는 9개 페이지 전부 적용
- **Phase 14-S (세션 15)**: Supabase 관리 체계 이식 Phase A+B 완료 — 문서 23 + 소스 55 + Prisma +7 모델 (migrate 대기)

### 세션 16+ (마스터 계획 세션 14~18)
- [ ] Phase 14a: TanStack Table Editor (DB 테이블 브라우저) — Data API 완성 후 파생
- [ ] Phase 14b: CRUD 에디터 (행 추가/수정/삭제)
- [ ] Phase 14c: SQL Editor Monaco 고도화 (현재 textarea)
- [ ] Phase 15a: 파일 매니저 강화
- [ ] Phase 15b: 알림 시스템 (Webhook 완성 — 세션 15에서 MVP 스캐폴드)
- [ ] Phase 15c: shadcn/ui 점진 전환
- [ ] **P1 후속 (선택)**: MFA/OAuth/GraphQL/Queues/Vault — ADR-002 참조

> 전체 로드맵: `docs/MASTER-DEV-PLAN.md` 참조

## 알려진 이슈 및 주의사항

- **middleware 경고**: Next.js 16에서 middleware → proxy 이름 변경 권장 (동작 문제 없음)
- **레거시 인증 30일 전환**: role 없는 구형 JWT → ADMIN 간주, DASHBOARD_PASSWORD fallback 유지
- ~~터널 수동 시작~~ → 세션 16에서 PM2 등록 완료 (`pm2 start cloudflared -- tunnel run`, `pm2 save`). 단 **WSL2 systemd 비활성 환경에서는 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음** — `pm2 resurrect` 자동화 또는 WSL systemd 활성 검토
- ~~세션 15 Prisma migrate 미적용~~ → 세션 16에서 `migrate deploy` 완료, `_prisma_migrations`에 기록됨
- **Cron 부트스트랩**: `src/lib/cron/registry.ts`의 `ensureStarted()`가 `/api/v1/cron` 첫 호출 시 작동. PM2 재시작 직후 Cron이 대기 상태 — 명시적 초기화 진입점을 후속에서 middleware 또는 별도 워커로 이식 권장.
- ~~SQL Editor 1차 방어 한정~~ → 세션 16에서 `app_readonly` 발급 완료, `BEGIN READ ONLY + SET LOCAL ROLE app_readonly` 이중 방어 검증
- ~~기본 SQL `"User"` 하드코딩으로 실행 시 400~~ → 세션 17에서 `users` 소문자로 수정
- **Turbopack NFT 경고**: `next.config.ts` → `src/lib/backup/pgdump.ts` 전체 트레이스. 런타임 영향 없으나 빌드 시 전체 프로젝트 트레이스로 패키지 크기 증가 가능 — `turbopackIgnore` 주석 또는 static scope 이동 필요
- **`npm audit` 취약점**: 11건 (moderate 10, high 1). 차기 세션 정리
- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` optional native bin 미설치. WSL2 Linux 바이너리로 실제 배포는 정상. `/ypserver` Phase 1이 항상 실패하므로 스킬 보강 또는 `npm i -D lightningcss-win32-x64-msvc` 로 복구 가능
- ~~다른 터미널 배색/테마 작업 충돌 주의~~ (세션 13~14에서 해결됨)

---
[← handover/_index.md](./_index.md)
