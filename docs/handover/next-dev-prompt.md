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
# WSL2 배포 — /ypserver 스킬 한계 인지(prisma migrate deploy 미포함). 수동 절차:
#   wsl -e bash -c "rm -rf ~/dashboard/prisma && cp -r /mnt/e/<proj>/prisma ~/dashboard/"
#   wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && npx prisma migrate deploy"
#   /ypserver prod (Phase 1 실패 시 WSL Phase 2-2 수동 복사+빌드+pm2 restart로 대체)
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan (`/login` 페이지 사용, 백엔드는 `/api/v1/auth/login` Bearer) |

## 필수 참조 파일

```
CLAUDE.md
docs/status/current.md
docs/handover/260418-session24-phase-14c-alpha.md              ⭐ 최신 (세션 24 완료)
docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md
docs/superpowers/plans/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-plan.md
docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md
docs/handover/260417-session23-phase-14c-updated-at-fix.md
docs/solutions/2026-04-17-prisma-migration-windows-wsl-gap.md
docs/solutions/2026-04-17-curl-e2e-recipe-dashboard.md
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 24 종료 시점)

### 완료된 Phase
- Phase 1~13 전부 완료
- Phase 14-S (세션 15~16): Supabase 이식 Phase A+B
- Phase 14a (세션 18): Table Editor 읽기 전용
- Phase 14b (세션 21 구현, 세션 22 DOD curl E2E 통과): Table Editor CRUD
- Phase 14c 1순위 (세션 23): `@updatedAt` DB DEFAULT 근본 수정
- Phase 14c-α (세션 24): 인라인 셀 편집 + 낙관적 잠금 — ADR-004 + raw SQL auto-bump + E2E C1~C6 PASS
- **Phase 14c-β (세션 24 연장 완료)**: 복합 PK 지원 — 신규 `/composite` 엔드포인트 + 바디 `pk_values` map + UI 훅 분기. ADR-005. 세션 중 2 근본 수정 (Next.js private folder rename, TIMESTAMP(3) 정밀도). curl E2E B1~B9 전 PASS.

### 배포 상태 ✅
- **원격 main**: 세션 23 `a00beca` 이후 세션 24에서 11 커밋 추가
- **프로덕션(WSL2 PM2)**: `src` + `tsconfig.json` 복사 + `npm run build` + `pm2 restart dashboard` 완료. PID 308/1351 이후 안정.
- **스키마 변경 없음**: 세션 23 migration 활용
- **프로덕션 엔드포인트 정상**: `/login` 200, `/api/v1/tables/folders` PATCH(락 O/X 양쪽) 정상

### 세션 24 검증 결과 (curl E2E 전 PASS)
| 시나리오 | 결과 |
|----------|------|
| C1 정상 PATCH (락 일치) | ✅ 200 |
| C2 CONFLICT | ✅ 409 + current |
| C3 NOT_FOUND | ✅ 404 |
| C4 LEGACY (락 미제공) | ✅ 200 |
| C5 MALFORMED | ✅ 400 INVALID_EXPECTED_UPDATED_AT |
| C6 감사 로그 영속 | ✅ UPDATE=10, UPDATE_CONFLICT=1 |
| Playwright E1~E6 | ⚠ Playwright 미설치 — 다음 세션 과제 |

## 현재 DB 구조 (변경 없음)

### PostgreSQL (Prisma) — 10 테이블 + 롤 2종
- 10 테이블: User, Folder, File, SqlQuery, EdgeFunction, EdgeFunctionRun, Webhook, CronJob, ApiKey, LogDrain
- 롤: `app_readonly` (세션 16) + `app_readwrite` (세션 21)
- `updated_at` 컬럼: 9/10 테이블 (EdgeFunctionRun 제외) — 전부 `DEFAULT CURRENT_TIMESTAMP`
- **raw SQL UPDATE 시 auto-bump 적용됨** (세션 24 API 수정)

### SQLite (Drizzle) — data/dashboard.db
- audit_logs, metrics_history, ip_whitelist
- 신규 감사 로그 action: `TABLE_ROW_UPDATE_CONFLICT`

## 추천 다음 작업

### 우선순위 1: Phase 14c-γ — VIEWER 계정 + 권한 매트릭스 E2E ⭐
1. VIEWER role seed 스크립트
2. Playwright 설치 (`npm i -D @playwright/test` + `npx playwright install`)
3. MANAGER/ADMIN/VIEWER 3롤 × (SELECT/INSERT/UPDATE/DELETE) 매트릭스 자동 검증
4. 세션 24의 `phase-14c-alpha-ui.spec.ts` 실행 가동

### 우선순위 2: Compound Knowledge 추출 (세션 24에서 4건 누적)
- `docs/solutions/2026-04-18-raw-sql-updatedat-bump.md` — Prisma `@updatedAt` 클라이언트 한계 + raw SQL auto-bump
- `docs/solutions/2026-04-18-nextjs-private-folder-routing.md` ⭐ — `_` prefix = private folder
- `docs/solutions/2026-04-18-timestamp-precision-optimistic-locking.md` ⭐ — pg TIMESTAMP(3) 정밀도 + 낙관적 잠금
- `docs/solutions/2026-04-18-subagent-driven-pragmatism.md` — 완전 코드 플랜에서 reviewer dispatch 축약

### 우선순위 3: 본 세션 보류 방향 (사용자 "모두 순차적" 지시의 잔여)
- **방향 B** `/ypserver` 스킬 보강 (5 갭: Windows build 스킵 / prisma 복사 / migrate deploy / drizzle migrate / Compound Knowledge 내재화)
- **방향 C** Vitest 도입 (ADR-003 §5 재활성화, identifier/coerce/table-policy/runReadwrite 유닛 테스트)

### 진입점 예시
```
/kdyguide --start                          # 현 상태 브리핑 + 방향 추천
/kdyguide --route "복합 PK 지원 구현"        # β 빠른 라우팅
/kdyguide --route "Playwright 설치 후 E2E"  # γ 진입
```

## 알려진 이슈 및 주의사항

- **raw SQL UPDATE auto-bump** (세션 24 신규): `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH는 `updated_at` 컬럼이 있고 사용자가 명시 설정 안 한 경우 `SET ..., updated_at = NOW()`를 자동 주입. Phase 14c-β 복합 PK에도 동일 로직 유지 필요.
- **Playwright 미설치**: 세션 24가 `scripts/e2e/phase-14c-alpha-ui.spec.ts`를 작성했으나 실행 불가. 다음 세션에서 설치 + 실행.
- **tsconfig `scripts` exclude**: Playwright 미설치 상태 tsc 통과용. 설치 후에는 `"scripts"` 제외 제거 가능.
- **`/ypserver` 스킬 한계**: Phase 1 Windows build 항상 실패, prisma/Drizzle 마이그레이션 단계 부재. 수동 보완 절차 — Compound Knowledge `2026-04-17-prisma-migration-windows-wsl-gap.md` 참조
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`(예: login-v2)는 Referer/Origin 필수. Compound Knowledge `2026-04-17-curl-e2e-recipe-dashboard.md` 참조
- **WSL auto-shutdown + /tmp 휘발**: 여러 `wsl -e bash -c` 호출 사이에 인스턴스 종료 가능. E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리 필요
- **Cloudflare Tunnel 간헐 530**: PM2 재시작 직후 발생 가능. `pm2 restart cloudflared`로 복구. QUIC 버퍼 튜닝 권장. 세션 24에서도 배포 직후 재발 → 재기동 1회로 복구.
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용. 세션 시작 가이드대로 스킵
- **information_schema 롤 필터링**: `app_readonly`에서 `table_constraints`/`key_column_usage` 0행. introspection은 `pg_catalog` 사용
- **프로젝트 단위 테스트 러너 부재**: Vitest 미설치. 순수 함수가 API 통합 경로로만 검증됨
- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` optional bin 미설치. WSL2 빌드가 진실 소스
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임
- **Cloudflare Tunnel WSL2 재기동**: systemd 비활성 환경에서 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음 — `pm2 resurrect` 또는 WSL systemd 활성 검토

## 세션 24 Compound Knowledge 후보 (미작성 — 다음 세션 추출)

- `docs/solutions/2026-04-18-raw-sql-updatedat-bump.md` — Prisma `@updatedAt` 클라이언트 한계 + raw SQL 경로에서 낙관적 잠금 구현 시 서버측 auto-bump 필수
- `docs/solutions/2026-04-18-subagent-driven-pragmatism.md` — 플랜에 완전 코드 포함 시 subagent reviewer 2회 dispatch 대신 controller diff 검증이 효율적

## 사용자 기록 (메모리)

- [자율 실행 우선](../../../../Users/smart/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_autonomy.md) — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외). 세션 24 시작 시 사용자 명시 지시.

---
[← handover/_index.md](./_index.md)
