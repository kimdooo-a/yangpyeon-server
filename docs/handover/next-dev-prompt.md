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
# WSL2 배포 — /ypserver 스킬 사용 권장 (Windows 빌드 불가, WSL2가 진실 소스)
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> (`/login` 페이지 사용, 백엔드는 `/api/v1/auth/login` Bearer) |

## 필수 참조 파일

```
docs/MASTER-DEV-PLAN.md
CLAUDE.md
docs/status/current.md
docs/handover/260417-session21-phase-14b-implementation.md   ⭐ 최신 (세션 21 완료)
docs/research/decisions/ADR-003-phase-14b-table-editor-crud.md
docs/research/plans/phase-14b-table-editor-crud-plan.md      (완료 기록)
docs/solutions/2026-04-17-*.md                               ⭐ Compound Knowledge 3건 (PK/migrations/tunnel)
docs/handover/260412-session20-phase-14b-design.md
docs/handover/260412-session19-ops-security-hardening.md
docs/handover/260412-session18-auth-refactor.md
```

## 현재 상태 (세션 22 종료 시점)

### 완료된 Phase
- Phase 1~13 전부 완료
- Phase 14-S (세션 15~16): Supabase 이식 Phase A+B
- Phase 14a (세션 18): Table Editor 읽기 전용
- **Phase 14b (세션 21 구현, 세션 22 DOD 완료)**: Table Editor CRUD curl E2E S8~S11 전 매트릭스 통과 ✅ — 단 **`@updatedAt` DB DEFAULT 부재로 UI "keep" 경로는 500** (Phase 14c 1순위 수정 대상)
- Phase 14c (세션 17): SQL Editor Monaco (인라인 편집은 Phase 14c에서 재정의 예정)

### 배포 상태 ✅
- **원격 main**: `a57cfb6` (세션 21 /cs) — 세션 22는 docs 추가 커밋 예정
- **로컬 HEAD**: `a57cfb6` → 세션 22 커밋 대기
- **프로덕션(WSL2 PM2)**: 세션 21 이후 `/ypserver prod` 재배포 멱등 수행 (세션 22, 코드 변경 없음)
- 프로덕션 엔드포인트 정상: `/login` 200, `/api/auth/me` 401, `/api/v1/tables/folders/schema` 200, `POST /api/v1/tables/folders` 200(updated_at 수동 조건부)

### 세션 21 검증 결과 (E2E S8~S11)
| 시나리오 | 결과 |
|---|---|
| S8 POST folders | ✅ 200 + row 반환 |
| S9 PATCH folders/[id] | ✅ 200 + name 업데이트 |
| S10 DELETE folders/[id] | ✅ 200 + deleted:true |
| S11a users POST | ✅ 403 OPERATION_DENIED |
| S11b `folders;DROP` 인젝션 | ✅ 400 INVALID_TABLE |
| 감사 로그 | ✅ TABLE_ROW_INSERT/UPDATE/DELETE 3건 영속 |

## 현재 DB 구조

### PostgreSQL (Prisma) — 10 테이블 + 롤 2종
- 10 테이블: User, Folder, File, SqlQuery, EdgeFunction, EdgeFunctionRun, Webhook, CronJob, ApiKey, LogDrain
- 롤: `app_readonly` (세션 16) + `app_readwrite` (세션 21)

### SQLite (Drizzle) — data/dashboard.db
- audit_logs, metrics_history, ip_whitelist

## 추천 다음 작업

### Phase 14c 1순위 — `@updatedAt` DB DEFAULT 병기 마이그레이션 ⭐

**배경**: 세션 22 E2E에서 raw SQL INSERT(Phase 14b CRUD)가 `updated_at` 생략 시 500 확인. Prisma `@updatedAt`은 DB DEFAULT를 만들지 않아 ORM 외부 경로가 NULL 제약을 위반. RowFormModal 3상태 "keep" 기본값으로 **현재 프로덕션 UI "행 추가"가 실사용자에게 장애**.

**수정 방법 (Option A 권장)**:
```prisma
// prisma/schema.prisma — @updatedAt 선언된 9개 모델(User/Folder/File/SqlQuery/
//   EdgeFunction/Webhook/CronJob/ApiKey/LogDrain) 전부 병기
updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamp(3)
//                  ^^^^^^^^^^^^^^^ 추가
```
`npx prisma migrate dev -n "add_updated_at_default"` → `ALTER TABLE ... SET DEFAULT CURRENT_TIMESTAMP`. `/ypserver prod` 재배포 후 S8 UI keep 경로 재검증.

**상세**: `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` (Option A/B/C 비교 포함)

### Phase 14c 본 작업
1. **브라우저 UI 최종 재검증** — `@updatedAt` fix 배포 후 사용자 직접:
   - `/tables/folders` "행 추가" → 모달 → 저장(keep 기본값) → 그리드 반영
   - 편집/삭제 + confirm 다이얼로그
   - `/audit` 페이지에서 TABLE_ROW_* 기록 확인
   - `/tables/users` 편집 불가 메시지

2. **인라인 편집 + 낙관적 잠금** — `updated_at` 비교 기반 conflict detection. Option A 적용 후 자연스러움.
3. **복합 PK 지원** — `[pk]` 동적 라우트 → `[...pk]` 또는 쿼리스트링 다중 매칭.
4. **VIEWER 테스트 계정 생성** — S2 + Phase 14b 권한 매트릭스(MANAGER/ADMIN/VIEWER) 검증.

### 진입점
`/kdyguide --start` → brainstorming(Option A vs B vs C 선택) → writing-plans (Phase 14c 실행 계획) → executing-plans / subagent-driven-development

3. **배포 스크립트 개선 (`/ypserver` 스킬)** — 세션 21 발견:
   - `drizzle.config.ts` + `prisma/schema.prisma` WSL 복사 단계 추가
   - `npm run db:migrate` + `npx prisma migrate deploy` 자동 포함
   - 상세: `docs/solutions/2026-04-17-drizzle-migrations-missing-on-wsl2-deploy.md`

4. **Vercel plugin 훅 억제** — 세션 21에서 false positive 10회 이상. `.claude/settings.json` 규칙으로 pattern-match 범위 조정. 특히:
   - Next.js 16 async params 린터 (Phase 14a 관습 오판)
   - Vercel 관련 스킬 injection (프로젝트 Vercel 미사용)

### 후속

5. **Vitest 도입** — `identifier` / `coerce` / `table-policy` 순수 함수 유닛 테스트 (ADR-003 §5 재활성화)

6. **VIEWER 테스트 계정 생성** — S2 + 권한 매트릭스 완전 검증용

7. **QUIC UDP 버퍼 튜닝** — Cloudflare Tunnel 안정화
   - `net.core.rmem_max=7500000` + `net.core.rmem_default=2500000`
   - 상세: `docs/solutions/2026-04-17-cloudflare-tunnel-intermittent-530.md`

8. **identifier regex 길이 제한** — `^[a-zA-Z_][a-zA-Z0-9_]{0,62}$` (PG 최대 63자)

9. **행 수 `-1` 표기 수정** — `information_schema.reltuples` 또는 `COUNT(*)` 전환 (cosmetic)

## 알려진 이슈 및 주의사항

- **Cloudflare Tunnel 간헐 530**: PM2 재시작 직후 발생 가능. `pm2 restart cloudflared`로 복구. QUIC 버퍼 튜닝 권장 (solutions/2026-04-17-cloudflare-tunnel-intermittent-530.md)
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용. 세션 시작 가이드대로 스킵. 특히 Next.js 16 async params 린터가 Phase 14a 관습(`await context.params` 선처리 후 로컬 변수 접근)을 반복 오판
- **information_schema 롤 필터링**: `app_readonly`에서 `table_constraints`/`key_column_usage` 0행 반환. introspection은 `pg_catalog` 사용 (solutions/2026-04-17-information-schema-role-filtering-pk-regression.md)
- **배포 시 `db:migrate` 필수**: `npm run build` + `pm2 restart`만으로는 SQLite/Prisma 스키마 변경 미반영. 새 마이그레이션 추가 시 반드시 적용 (solutions/2026-04-17-drizzle-migrations-missing-on-wsl2-deploy.md)
- **프로젝트 단위 테스트 러너 부재**: Vitest 미설치. 순수 함수가 API 통합 경로로만 검증됨 — Phase 14c 진입 전 도입 권장
- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` optional bin 미설치. WSL2 빌드가 진실 소스
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임 — route segment config 선언 시 빌드 오류
- **Cloudflare Tunnel WSL2 재기동**: systemd 비활성 환경에서 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음 — `pm2 resurrect` 자동화 또는 WSL systemd 활성 검토

---
[← handover/_index.md](./_index.md)
