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
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

## 필수 참조 파일

```
docs/MASTER-DEV-PLAN.md                              — 세션별 개발 마스터 계획서 (단일 진실 소스)
CLAUDE.md                                            — 프로젝트 규칙 + 문서 트리
docs/status/current.md                               — 현재 상태 + 세션 요약표
docs/handover/260412-session15-supabase-clone.md     — 최신 인수인계서 (세션 15)
docs/handover/260412-session14-phase13d-complete.md  — 직전 인수인계서 (세션 14)
docs/references/_SUPABASE_TECH_MAP.md                — Supabase 이식 기술 매핑
docs/references/_PROJECT_VS_SUPABASE_GAP.md          — 현 프로젝트 vs Supabase 갭
docs/research/decisions/ADR-002-supabase-adaptation-strategy.md — Supabase 이식 전략
```

## 최근 완료된 작업

- 세션 1~4: 프로젝트 초기화 + 대시보드 + 보안 + 디자인
- 세션 5: kdywave 종합 분석 + 마스터 계획서
- 세션 6: SPIKE 검증 + Zod
- 세션 7: 회원관리 + 파일박스 v2 (PostgreSQL)
- 세션 8~12: 토스트, 감사로그DB, IP화이트리스트, 메트릭차트, SSE실시간, 감사로그UI, 환경변수관리, DB인증통합, 역할접근제어, Cmd+K
- 세션 13: 회원관리 백엔드 + PostgreSQL 연결/마이그레이션 + 이메일+비밀번호 로그인 + Warm Ivory 라이트 테마 + Phase 13d 착수
- 세션 14: 중단 터미널 3개 복구 + Phase 13d 완료 → **Phase 13 전체 완료**
- **세션 15 (최신)**: Supabase 관리 체계 이식 — Phase A(리서치 문서 23건) + Phase B(Prisma +7 모델, 11 P0 모듈 스캐폴드 55 파일). `tsc` clean. **Prisma migrate 및 `app_readonly` 롤 발급은 수동 대기 중**.

## 현재 DB 구조

### PostgreSQL (Prisma) — 3 기존 + 7 대기(세션 15 추가, migrate 미적용)
- User (id, email, name, phone, passwordHash, role, isActive, lastLoginAt)
- Folder (id, name, parentId, ownerId) — 자기참조 트리
- File (id, name, storedName, mimeType, size, folderId, ownerId)
- **대기 (schema.prisma에만 존재, DB 미생성)**:
  - SqlQuery / EdgeFunction / EdgeFunctionRun / Webhook / CronJob / ApiKey / LogDrain
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

### 즉시 가능 (세션 15 후속 — 최우선)
1. **Prisma 마이그레이션 적용**: 증분 SQL이 이미 `prisma/migrations/20260412120000_supabase_clone_session_14/migration.sql`에 준비됨(수동 작성, 164줄 18 DDL). 적용 옵션:
   - (권장) `npx prisma migrate deploy` — 자동 적용
   - 또는 PG에 직접 실행 후 `npx prisma migrate resolve --applied 20260412120000_supabase_clone_session_14`로 기록만
2. **PG 읽기전용 롤 발급** (SQL Editor 보안 강화):
   ```sql
   CREATE ROLE app_readonly;
   GRANT USAGE ON SCHEMA public TO app_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
   ```
3. **UI 고도화 의존성** 이미 설치됨(세션 15): `@monaco-editor/react@^4.7.0`, `@xyflow/react@^12.10.2`, `elkjs@^0.11.1`. SQL Editor(현 textarea)와 Schema Visualizer(현 카드 그리드)를 monaco/xyflow로 교체만 하면 됨.
4. **Backups 활성** (선택): `.env`에 `ENABLE_DB_BACKUPS=true`
5. **`next build` + dev server smoke test**: 11 신규 페이지(`/sql-editor`, `/database/{schema,webhooks,cron,backups}`, `/data-api`, `/functions`, `/realtime`, `/advisors/{security,performance}`, `/settings/{api-keys,log-drains}`) 도달성

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
- **터널 수동 시작**: WSL 재시작 시 `cloudflared tunnel run yangpyeong` 수동 실행 필요
- **세션 15 Prisma migrate 미적용**: 11 신규 페이지 런타임 진입 시 Prisma 타입은 이미 `prisma generate`로 반영되었으나, 실제 테이블이 없어 API 호출 시 `relation "sql_queries" does not exist` 등 에러 발생. migrate 먼저 수행할 것.
- **Cron 부트스트랩**: `src/lib/cron/registry.ts`의 `ensureStarted()`가 `/api/v1/cron` 첫 호출 시 작동. PM2 재시작 직후 Cron이 대기 상태 — 명시적 초기화 진입점을 후속에서 middleware 또는 별도 워커로 이식 권장.
- **SQL Editor 1차 방어 한정**: `app_readonly` 롤 미발급 시 `BEGIN READ ONLY` + `statement_timeout`만 작동. 롤 발급 강력 권장.
- ~~다른 터미널 배색/테마 작업 충돌 주의~~ (세션 13~14에서 해결됨)

---
[← handover/_index.md](./_index.md)
