# 인수인계서 — 세션 21 (Phase 14b Table Editor CRUD 구현)

> 작성일: 2026-04-17
> 이전 세션: [session20](./260412-session20-phase-14b-design.md)
> 세션 저널: [journal-2026-04-17.md](../logs/journal-2026-04-17.md)
> 실행 계획: [phase-14b-table-editor-crud-plan.md](../research/plans/phase-14b-table-editor-crud-plan.md)
> 설계 결정: [ADR-003](../research/decisions/ADR-003-phase-14b-table-editor-crud.md)

---

## 작업 요약

세션 20에서 설계·계획 완료된 Phase 14b(Table Editor CRUD)를 계획서 1:1 매핑으로 구현 및 **프로덕션 배포·E2E 통과 완료**. `/kdyguide` → A 경로(`/kdyplanon` → plan 재개) 진입. 12 Task × 5 커밋(C1~C5) 전부 완료 + 배포 중 발견한 2건 버그 수정 + 3건 Compound Knowledge 축적. 총 **7 커밋 원격 푸시**.

## 커밋 요약 (세션 21 기여)

| 커밋 | 범위 | 주요 파일 |
|---|---|---|
| `108e92c` | C1: PG 롤 SQL | `scripts/sql/create-app-readwrite.sql` |
| `99585ce` | C2: 라이브러리 | `src/lib/db/identifier.ts`, `coerce.ts`, `table-policy.ts`, `src/lib/pg/pool.ts` |
| `d967746` | C3: API | `src/app/api/v1/tables/[table]/route.ts` (POST), `[table]/[pk]/route.ts` (신규, PATCH+DELETE), `schema/route.ts` (PK 필드) |
| `2cbf226` | C4: UI | `src/components/table-editor/row-form-modal.tsx` (신규), `table-data-grid.tsx` (액션 컬럼), `(protected)/tables/[table]/page.tsx` (CTA + 모달) |
| `0240d69` | C5-docs | tables-e2e-manual S8~S11, current.md, logs, journal, handover, _index, next-dev-prompt |
| `f288c88` | fix: PK 쿼리 pg_catalog | `schema/route.ts`, `[pk]/route.ts` — app_readonly 롤 호환 |
| `9f6d611` | docs: 세션 21 완료 반영 | current.md + journal 토픽 8~11 |

**배포**: WSL2 빌드(`bnfg804cy`) + PK fix 재빌드(`byyp94th8`) + Drizzle migrations(`npm run db:migrate`) + PM2 restart 모두 완료. 원격 main `98b4f0c..9f6d611` 푸시. 프로덕션 엔드포인트 정상(`https://stylelucky4u.com/login` 200, `/api/auth/me` 401, `/api/v1/tables/folders/schema` 200 w/ primaryKey).

## 주요 구현 결정 (실 구현 시 발견)

### 1. DB 이름 교정: `yangpyeong` → `luckystyle4u`

Plan 문서는 `yangpyeong` 데이터베이스를 가정했으나 실제 `.env` DATABASE_URL은 `luckystyle4u`. SQL 스크립트 헤더 주석 수정 후 적용. **향후 plan 작성 시 실DB introspection을 선행 검증 단계로 포함**.

### 2. WSL2 psql 적용 방식: peer auth + stdin 리디렉션

`wsl -d Ubuntu -u postgres -- psql -d luckystyle4u < scripts/sql/...`
- `-u postgres`로 peer auth(TCP 패스워드 불필요)
- stdin 리디렉션으로 Git Bash의 `/mnt/e/...` 경로 번역 버그 회피
- 재실행 대비 멱등성: `CREATE ROLE` 단독이라 재실행 시 "already exists" 오류 — 무시

### 3. `audit-log-db` import 수정

Plan: `import { writeAuditLog as writeAuditLogDb } from "@/lib/audit-log-db"` — 실제 export 이름과 불일치.
구현: `import { writeAuditLogDb } from "@/lib/audit-log-db"` 직접 import.

### 4. PATCH/DELETE route 단순화

Plan은 함수 선언문으로 `withRole(...)(request, context_shape)` 이중 호출 패턴을 사용. Phase 14a `export const HANDLER = withRole(...)` 관습과 일치하도록 재작성 — context.params 비동기 해제는 내부에서 수행.

### 5. `/api/auth/me` 응답 구조 반영

Plan: `body.data.role` 가정.
실제: `{success: true, user: {sub, email, role}}`.
수정: `body.user?.role` 파싱.

### 6. TypeScript 추론 보강

`TableDataGrid` tanstackColumns useMemo에 `const base = columns.map(...)`를 도입하면서 내부 `getValue` 콜백의 `any` 추론이 발생 → `const base: ColumnDef<Record<string, unknown>>[]` 명시 어노테이션으로 해결.

### 7. dev 서버 curl 통합 테스트 위임

`/api/auth/login-v2`가 CSRF 토큰 선행 요구 → dev 경로에서 5개 curl 시나리오 실행이 환경 의존적. Task 12(C5) 프로덕션 E2E에서 통합 검증.

## 검증 결과

- **tsc**: C2/C3/C4/PK fix 각 단계 완료 시점 EXIT=0
- **SQL 적용**: WSL2 PG에 `app_readwrite` 롤 존재 + INSERT/SELECT/DELETE 권한 스모크 통과 (ROLLBACK)
- **Drizzle migrations**: `db:migrate`로 audit_logs/ip_whitelist/metrics_history 3개 테이블 프로덕션 적용
- **dev 서버 기동**: 1초 내 ready, `/api/auth/me` 401 응답으로 인증 가드 동작 확인
- **프로덕션 E2E (curl 경유 localhost + 브라우저 일부)**:
  | 시나리오 | 결과 |
  |---|---|
  | S8 POST folders | ✅ 200 + row 반환 |
  | S9 PATCH folders/[id] name 변경 | ✅ 200 + updated row |
  | S10 DELETE folders/[id] | ✅ 200 + deleted:true |
  | S11a POST users | ✅ 403 OPERATION_DENIED |
  | S11b POST 'folders;DROP' | ✅ 400 INVALID_TABLE |
- **감사 로그**: `TABLE_ROW_INSERT`/`UPDATE`/`DELETE` 각 1건 영속 기록, detail에 이메일 + diff JSON 포함 확인
- **테이블 클린업**: folders 원본 1행("내 파일") 유지, 테스트 행 전부 DELETE 정리

## 터치하지 않은 영역

- Vitest 도입 (계획서 YAGNI 결정 — ADR-003 §5 재활성화 조건부)
- 인라인 편집 + 낙관적 잠금 (Phase 14c)
- 복합 PK 지원 (Phase 14c 이후)
- 브라우저에서 완전한 S8-S10 플로우 (Cloudflare Tunnel 일시 530으로 curl 대체 검증) — 엔드투엔드 코드 경로는 동일하지만 UI 인터랙션 레이어의 시각적 확인은 사용자 재검증 권장

## Compound Knowledge 산출 (4.5단계)

| # | 파일 | 카테고리 | 요약 |
|---|------|----------|------|
| 1 | `docs/solutions/2026-04-17-information-schema-role-filtering-pk-regression.md` | bug-fix | `information_schema` 뷰가 제한 롤에서 privilege 필터링으로 0행 반환 — `pg_catalog` 전환. Phase 14a부터 존재한 숨은 회귀. |
| 2 | `docs/solutions/2026-04-17-drizzle-migrations-missing-on-wsl2-deploy.md` | tooling | 배포 스크립트가 `npm run db:migrate` 누락 — audit_logs 테이블 부재로 감사 로그 실패(반쪽 성공). ypserver 스킬 개선 필요. |
| 3 | `docs/solutions/2026-04-17-cloudflare-tunnel-intermittent-530.md` | workaround | PM2 재시작 후 cloudflared가 간헐 530 반환 — `pm2 restart cloudflared`로 복구. QUIC UDP 버퍼 튜닝 권장. |

## 알려진 이슈

### 1. Vercel plugin 훅 false positive 다수

PreToolUse / PostToolUse 훅이 `vercel-functions` / `next-cache-components` / `nextjs` / `react-best-practices` / `verification` 스킬 사용을 "MANDATORY"로 injection. 프로젝트가 Vercel 미사용(WSL2 PM2 + Cloudflare Tunnel)이라 세션 시작 가이드("Vercel 가이드는 리포와 직접 관련될 때만")에 따라 스킵. 특히 Next.js 16 async params 린터가 Phase 14a 관습(`await context.params` 선처리 후 로컬 변수 접근)을 반복 오판.

**후속 조치**: 훅 규칙을 프로젝트 특성(Vercel 미사용 + Phase 14a 관습)에 맞춰 억제하거나, settings.json에서 `matchedSkills` 억제 옵션 검토.

### 2. 프로덕션 배포 대기 중

- 원격 main: `98b4f0c` (세션 20 종료)
- 로컬 HEAD: `2cbf226` (C4 완료) — 원격 대비 4 커밋 앞섬
- 프로덕션(WSL2 PM2): `0e59be0` (세션 18) — 세션 19+20 문서 + Phase 14b 구현 전부 미반영
- 다음 배포 시 누적 반영: auth-guard 감사 로그 + instrumentation data/ mkdir + 세션 20 문서 + Phase 14b CRUD

### 3. dev 서버 CSRF 플로우

`/api/auth/login-v2`(DB 기반 email/password)는 CSRF 토큰 선행 필수. curl 기반 dev 통합 테스트가 환경 의존적이라 C5 프로덕션 경로 위임. 대안으로 `X-CSRF-Token` 헤더 + fetch `credentials: include`를 사용하는 별도 통합 테스트 스크립트 작성 가능.

### 4. 레거시 `/api/auth/login`은 env 비밀번호만 사용

`/api/auth/login`은 `DASHBOARD_PASSWORD` env 기반 레거시 엔드포인트(ADMIN 세션 발급) — DB 기반 로그인은 `/api/auth/login-v2`. 세션 18 주의사항에 기재된 대로 레거시 30일 전환 기간 중.

## 다음 작업 제안

### 즉시 가능 (C5 완료)

1. **C5 docs 커밋** — tables-e2e-manual S8~S11 + current.md + logs + journal + 본 handover + _index + next-dev-prompt
2. **WSL2 빌드** — `/ypserver` 스킬 또는 직접 `wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/.../src . && cp /mnt/e/.../{next.config.ts,tsconfig.json,tailwind.config.ts,postcss.config.mjs,package.json} . && npm install && npm run build && pm2 restart dashboard"`
3. **프로덕션 curl smoke** — 로그인 + `/api/v1/tables/folders/schema` → primaryKey 필드 확인
4. **브라우저 E2E S8~S11** — `/tables/folders` INSERT/UPDATE/DELETE + `/audit` 로그 확인 + `/tables/users` 차단 메시지 확인
5. **`git push origin main`** — 5 커밋 일괄 푸시 (C1~C5)

### 후속 세션

6. **Phase 14c** — 인라인 편집 + 낙관적 잠금(`updated_at` 비교) + 복합 PK 지원
7. **Vitest 도입** — `identifier` / `coerce` / `table-policy` 순수 함수 + 경계/인젝션 유닛 테스트
8. **dev 서버 통합 테스트 스크립트** — CSRF 흐름 포함 로컬 E2E 자동화
9. **Vercel 훅 규칙 억제** — 프로젝트 `.claude/settings.json`에서 false positive 축소

### 기술부채

10. **identifier regex 길이 제한** — `^[a-zA-Z_][a-zA-Z0-9_]{0,62}$` (PG 최대 63자)
11. **VIEWER 테스트 계정** — S2 + 권한 매트릭스 검증
12. **행 수 `-1` 표기 수정** — `information_schema.reltuples` 또는 `COUNT(*)` 전환

---
[← handover/_index.md](./_index.md)
