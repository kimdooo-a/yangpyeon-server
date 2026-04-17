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
docs/handover/260417-session23-phase-14c-updated-at-fix.md     ⭐ 최신 (세션 23 완료)
docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md
docs/superpowers/plans/2026-04-17-phase-14c-updated-at-default-plan.md
docs/solutions/2026-04-17-prisma-migration-windows-wsl-gap.md   ⭐ 신규 Compound Knowledge
docs/solutions/2026-04-17-curl-e2e-recipe-dashboard.md          ⭐ 신규 Compound Knowledge
docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md (해결됨 — 세션 23)
docs/research/decisions/ADR-003-phase-14b-table-editor-crud.md
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 23 종료 시점)

### 완료된 Phase
- Phase 1~13 전부 완료
- Phase 14-S (세션 15~16): Supabase 이식 Phase A+B
- Phase 14a (세션 18): Table Editor 읽기 전용
- Phase 14b (세션 21 구현, 세션 22 DOD curl E2E 통과): Table Editor CRUD
- **Phase 14c 1순위 (세션 23 완료)**: `@updatedAt` DB DEFAULT 근본 수정 — 5 모델 병기 + 4 모델(File/Webhook/ApiKey/LogDrain) 신규 필드 + B2 백필 마이그레이션(`20260417140000_add_updated_at_default`). 프로덕션 E2E 전 매트릭스 PASS. RowFormModal "keep" 기본값 실사용자 경로 완전 복구.

### 배포 상태 ✅
- **원격 main**: 세션 22 종료 시점 `beaa2fb` 이후 세션 23에서 추가 6 커밋 예정(spec→plan→schema→migration→solutions→cs)
- **프로덕션(WSL2 PM2)**: `prisma migrate deploy` 적용 완료 — 9 테이블 `updated_at DEFAULT CURRENT_TIMESTAMP` 활성
- 프로덕션 엔드포인트 정상: `/login` 200, `/api/auth/me` 401(쿠키 없을 때), `POST /api/v1/tables/folders` 200 (updated_at 생략 payload로도 통과 확인)

### 세션 23 검증 결과 (E2E 전 매트릭스)
| 시나리오 | 결과 | 비고 |
|---|---|---|
| S8a folders INSERT (**updated_at 생략**) | ✅ 200 | ⭐ 세션 22 500 버그 수정 증명 |
| S8b PATCH folders | ✅ 200 | |
| S8c DELETE folders | ✅ 200 | `{deleted:true}` |
| S9 audit TABLE_ROW_* 3건 | ✅ 영속 | SQLite `audit_logs` |
| S10 users POST | ✅ 403 | OPERATION_DENIED |
| S11a `folders;DROP TABLE x` | ✅ 400 | INVALID_TABLE |
| S11b edge_function_runs POST | ✅ 403 | "삭제만 가능" |
| S8d webhooks INSERT (updated_at 생략) | ✅ 200 | 신규 컬럼 DB DEFAULT |
| S8e log_drains INSERT (updated_at 생략) | ✅ 200 | 신규 컬럼 DB DEFAULT |

## 현재 DB 구조

### PostgreSQL (Prisma) — 10 테이블 + 롤 2종
- 10 테이블: User, Folder, File, SqlQuery, EdgeFunction, EdgeFunctionRun, Webhook, CronJob, ApiKey, LogDrain
- 롤: `app_readonly` (세션 16) + `app_readwrite` (세션 21)
- `updated_at` 컬럼: 9/10 테이블 (EdgeFunctionRun 제외) — 전부 `DEFAULT CURRENT_TIMESTAMP`

### SQLite (Drizzle) — data/dashboard.db
- audit_logs, metrics_history, ip_whitelist

## 추천 다음 작업

### 방향 1: Phase 14c 본 작업 ⭐
1. **인라인 편집 + 낙관적 잠금** — `updated_at` 비교 기반 conflict detection. 이제 DB DEFAULT가 있어 자연스러움. Phase 14b RowFormModal을 인라인 셀 편집으로 확장.
2. **복합 PK 지원** — `[pk]` 동적 라우트 → `[...pk]` 또는 쿼리스트링 다중 컬럼 매칭. PK 추출 쿼리(`pg_index.indkey`)는 이미 배열 반환 구조.
3. **VIEWER 테스트 계정 생성** — S2 권한 매트릭스 + Phase 14b MANAGER/ADMIN/VIEWER 차등 검증용.

### 방향 2: `/ypserver` 스킬 보강 (인프라 정합성)
세션 23에서 발견된 한계:
- Phase 1 Windows `next build` 항상 실패 → 조기 abort(CLAUDE.md 문서화됨)
- `prisma/` 디렉토리 WSL 복사 단계 없음
- `prisma migrate deploy` 자동 실행 없음
- `npm run db:migrate` (Drizzle) 자동 실행 없음

권장 스킬 수정안:
1. Phase 1 Windows build를 선택적으로(환경변수 또는 파라미터로 스킵)
2. Phase 2-2에 `cp -r /mnt/e/<proj>/prisma ~/dashboard/` 추가
3. Phase 2-2 빌드 전에 `npx prisma migrate deploy` 추가
4. Phase 2-2 빌드 후 `npm run db:migrate` 추가
5. Compound Knowledge 2026-04-17-prisma-migration-windows-wsl-gap.md 내재화

### 방향 3: 기술부채 소진
- **Vitest 도입** — `identifier` / `coerce` / `table-policy` / `runReadwrite` 순수 함수 유닛 테스트 (ADR-003 §5 재활성화)
- **Vercel plugin 훅 억제** — `.claude/settings.json` `matchedSkills` 규칙 (세션 21-23 반복 false positive)
- **Cloudflare Tunnel 530 재발 조사** — `sysctl -w net.core.rmem_max=7340032` 실험
- **identifier regex 길이 제한** — `^[a-zA-Z_][a-zA-Z0-9_]{0,62}$` (PG 최대 63자)
- **행 수 `-1` 표기 수정** — `information_schema.reltuples` 또는 `COUNT(*)` 전환 (cosmetic)

### 진입점 예시
```
/kdyguide --start   # 현 상태 브리핑 + 방향 추천
/kdyguide --route "인라인 편집 및 낙관적 잠금 구현"   # 빠른 라우팅
```

## 알려진 이슈 및 주의사항

- ~~**@updatedAt DB DEFAULT 부재로 UI keep 500**~~ — **세션 23 해결** (`20260417140000_add_updated_at_default` 적용)
- **`/ypserver` 스킬 한계**: Phase 1 Windows build 항상 실패, prisma/Drizzle 마이그레이션 단계 부재. 수동 보완 절차 — Compound Knowledge `2026-04-17-prisma-migration-windows-wsl-gap.md` 참조
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`(예: login-v2)는 Referer/Origin 필수. `src/proxy.ts` L78-117 및 Compound Knowledge `2026-04-17-curl-e2e-recipe-dashboard.md` 참조
- **WSL auto-shutdown + /tmp 휘발**: 여러 `wsl -e bash -c` 호출 사이에 인스턴스 종료 가능. E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리 필요
- **Cloudflare Tunnel 간헐 530**: PM2 재시작 직후 발생 가능. `pm2 restart cloudflared`로 복구. QUIC 버퍼 튜닝 권장
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용. 세션 시작 가이드대로 스킵
- **information_schema 롤 필터링**: `app_readonly`에서 `table_constraints`/`key_column_usage` 0행. introspection은 `pg_catalog` 사용
- **프로젝트 단위 테스트 러너 부재**: Vitest 미설치. 순수 함수가 API 통합 경로로만 검증됨
- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` optional bin 미설치. WSL2 빌드가 진실 소스
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임
- **Cloudflare Tunnel WSL2 재기동**: systemd 비활성 환경에서 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음 — `pm2 resurrect` 또는 WSL systemd 활성 검토

---
[← handover/_index.md](./_index.md)
