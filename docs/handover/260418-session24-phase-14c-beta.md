# 인수인계서 — 세션 24 연장 (Phase 14c-β 복합 PK 지원)

> 작성일: 2026-04-18
> 이전 세션: [session24-alpha](./260418-session24-phase-14c-alpha.md)
> 세션 저널: [journal-2026-04-18.md](../logs/journal-2026-04-18.md)
> 관련 spec: [phase-14c-beta-design](../superpowers/specs/2026-04-18-phase-14c-beta-composite-pk-design.md)
> 관련 plan: [phase-14c-beta-plan](../superpowers/plans/2026-04-18-phase-14c-beta-composite-pk-plan.md)
> 결정 기록: [ADR-005](../research/decisions/ADR-005-phase-14c-beta-composite-pk-routing.md)

---

## 작업 요약

세션 24 α(인라인 편집 + 낙관적 잠금) 완료 직후 사용자 "바로 이어서 진행" 지시로 β 실행. α의 `expected_updated_at` / `updated_at = NOW()` auto-bump / 409 CONFLICT 패턴을 복합 PK 경로에 일반화한 신규 `/composite` 엔드포인트(PATCH, DELETE)를 구현. 프로덕션에 복합 PK 테이블이 없어 임시 `_test_composite` 테이블로 E2E 매트릭스 B1~B9 전 PASS. α 단일 PK 경로는 100% 불변.

## 핵심 산출물

### API 신규 (1)
- `src/app/api/v1/tables/[table]/composite/route.ts` (410줄) — PATCH (ADMIN/MANAGER), DELETE (ADMIN). 바디 `pk_values` map + `pg_index.indkey` 순서 WHERE 빌더 + α auto-bump/409/감사 로그 3종 (`TABLE_ROW_UPDATE` + `TABLE_ROW_UPDATE_CONFLICT` + `TABLE_ROW_DELETE`) 승계. 단일 PK 테이블에 호출 시 `NOT_COMPOSITE` 400.

### API 수정 (1)
- `src/app/api/v1/tables/[table]/schema/route.ts` — `compositePkColumns: string[]` 필드 추가 (`pg_index.indkey` 순). 단일 PK는 빈 배열.

### UI 수정 (3)
- `src/components/table-editor/use-inline-edit-mutation.ts` — 훅 시그니처에 `compositePkColumns?: string[]` 추가. `isComposite` 플래그로 URL(`/composite`) + body(`pk_values`) 분기. 409 재시도 로직 동일 패턴 유지.
- `src/components/table-editor/table-data-grid.tsx` — `primaryKeyName` 옆에 `compositePkColumns` state, `fetchSchema`에서 저장, 훅에 prop 전달. cell readonly 매트릭스를 `isPkCol` 일반화로 확장(단일/복합 통합). `pkValuesMap` 추출 로직 추가. `useMemo` 의존성 `compositePkColumns` 확장.
- `src/app/(protected)/tables/[table]/page.tsx` — `hasPk = primaryKey !== null || compositePk`로 변경. "복합 PK 테이블 — Phase 14b 미지원" 경고 메시지 제거.

### 문서 (2)
- `docs/superpowers/specs/2026-04-18-phase-14c-beta-composite-pk-design.md` (211줄)
- `docs/superpowers/plans/2026-04-18-phase-14c-beta-composite-pk-plan.md` (1202줄)
- `docs/research/decisions/ADR-005-phase-14c-beta-composite-pk-routing.md` (35줄)

### 테스트 (1)
- `scripts/e2e/phase-14c-beta-curl.sh` — B1~B9 매트릭스. 외부에서 `wsl -d Ubuntu -u postgres` 로 `_test_composite` 테이블 setup(`TIMESTAMP(3)` 중요) → 스크립트 내부는 API E2E만 수행 → 외부에서 teardown. sudo 비대화형 제약 회피.

## 배포 상태

- **원격 main**: 세션 24 α 이후 β 관련 7 커밋 추가 (미푸시)
- **프로덕션(WSL2 PM2)**: `composite/` 라우트 + schema 확장 + UI 훅 분기 배포 완료
- **스키마 변경 없음**: 실제 DB 스키마에는 복합 PK 테이블이 여전히 없음(0/10). 검증용 `_test_composite`는 setup/teardown 사이클.
- **Cloudflare Tunnel**: 배포 간섭 없음

## E2E 결과 (프로덕션 B1~B9 전 PASS)

| # | 시나리오 | 결과 | 비고 |
|---|----------|------|------|
| B1 | 정상 PATCH (락 일치) | ✅ 200 | `TIMESTAMP(3)` 정렬로 WHERE 매칭 성공 |
| B2 | CONFLICT (구 timestamp) | ✅ 409 + `current` | |
| B3 | NOT_FOUND (없는 pk_values) | ✅ 404 | |
| B4 | PK_VALUES_INCOMPLETE | ✅ 400 | 일부 컬럼 누락 |
| B5 | UNKNOWN_PK_COLUMN | ✅ 400 | 존재하지 않는 PK 컬럼 |
| B6 | NOT_COMPOSITE | ✅ 400 | folders(단일 PK)에 /composite 호출 |
| B7 | LEGACY GUARD | ✅ 400 `COMPOSITE_PK_UNSUPPORTED` | `_test_composite`에 `/[pk]` 호출 |
| B8 | DELETE | ✅ 200 `deleted:true` | |
| B9 | 감사 로그 영속 | ✅ UPDATE=1, CONFLICT=3, DELETE=2 | 3종 전부 확인 |

## 세션 중 발견·수정한 2개 근본 버그

### 버그 1: Next.js 16 private folder convention
**증상**: E2E 1차 실행 시 모든 `/composite` 요청이 `[pk]/route.ts`로 라우팅되어 `COMPOSITE_PK_UNSUPPORTED` 400 반환.

**원인**: 최초 폴더명 `_composite` → Next.js가 언더스코어 prefix를 **private directory**로 인식해 라우트 등록에서 제외. 결과적으로 `/api/v1/tables/<table>/_composite` URL이 존재하지 않음 → dynamic `[pk]` 라우트가 `pk = "_composite"`로 폴백.

**해결**: 폴더명을 `composite`(언더스코어 제거)로 rename. 모든 API/UI/스크립트의 URL 참조 일괄 치환.

**Compound Knowledge 후보**: `docs/solutions/2026-04-18-nextjs-private-folder-routing.md` — `_` prefix folder convention + 우회 패턴.

### 버그 2: TIMESTAMP 정밀도 불일치 (µs vs ms)
**증상**: 폴더명 수정 후 E2E 2차에서 B1(정상 PATCH 락 일치)이 여전히 409 CONFLICT 반환. expected_updated_at이 서버의 현재 updated_at과 "동일"한데도 WHERE 매칭 실패.

**원인**: 초기 테스트 테이블이 `TIMESTAMP`(µs, 기본) — Prisma 실제 테이블은 `TIMESTAMP(3)`(ms). pg 드라이버가 ISO 직렬화 시 ms 자리까지만 반환하지만 DB에는 µs가 저장 → SELECT로 가져온 값을 다시 WHERE에 넣으면 µs 부분 절단으로 원본과 불일치.

**해결**: 테스트 테이블을 `TIMESTAMP(3) DEFAULT NOW()`로 재생성. 스크립트 주석에 "TIMESTAMP(3)가 중요" 명시.

**Compound Knowledge 후보**: `docs/solutions/2026-04-18-timestamp-precision-optimistic-locking.md` — pg 드라이버 TIMESTAMP 직렬화 정밀도 + 낙관적 잠금 불일치 함정.

## 대화 다이제스트

### 토픽 1: α 직후 β 진입
α `025ce66` 커밋 직후 사용자 "다음 세션에 전달한 내용을 이 대화창에 알려줘. 바로 이어서 하게" → next-dev-prompt.md의 β 우선순위를 대화에 surface 후 즉시 brainstorming skill 호출.

### 토픽 2: β spec 자율 설계
핵심 트레이드오프 — PK 전달 방식. URL catch-all(특수문자/순서 의존) vs 바디 맵(RESTful 순수성 약간 포기) 비교 후 **바디 `pk_values` map** 채택. 단일 PK 경로 회귀 위험 제거가 최우선. spec `4ea7844` 커밋.

### 토픽 3: writing-plans 6 Task + subagent 실행
- T1 schema 확장 (haiku `9c02091`)
- T2 `_composite` 엔드포인트 (sonnet `174b489`, 410줄)
- T3 UI 분기 3파일 (sonnet `d4621b3`, +58/-31)
- T4 ADR-005 + T5 E2E 스크립트 (haiku `4c9bee9`, `b68393c`) — 독립 파일 생성이라 한 subagent에서 배치 처리

### 토픽 4: E2E 1차 실패 — 라우팅 오류
`sudo -u postgres` 비대화형 제약으로 스크립트가 먼저 멈춤 → 외부에서 `wsl -d Ubuntu -u postgres` 패턴으로 `_test_composite` 생성 후 스크립트에서 setup/teardown 제거. 그러나 스크립트 실행 결과 모든 요청이 `COMPOSITE_PK_UNSUPPORTED` 반환 → `_composite` 폴더가 Next.js에서 private 취급됨을 인식하고 `composite`로 rename. 커밋 `00d4e79` 이후 `(renamed commit)`.

### 토픽 5: E2E 2차 — TIMESTAMP 정밀도 버그
B1 여전히 CONFLICT. `2026-04-18T05:22:22.739Z`가 seed과 current 모두 동일하게 반환되는데도 WHERE 매칭 실패. 가설: µs 절단. `TIMESTAMP(3)` 재생성 후 E2E 3차 → B1~B9 전 PASS.

### 토픽 6: 문서화 + 세션 종료
controller에서 current.md/2026-04.md/journal/handover/_index/next-dev-prompt 동시 갱신. push 는 별도 지시 필요(CLAUDE.md 규칙).

## 커밋 체인 (세션 24 연장, 7개 예상)

```
4ea7844 docs(14c-β): 복합 PK 지원 설계 spec
c16d9d3 docs(14c-β): 복합 PK 지원 구현 계획
9c02091 feat(api): schema 응답에 compositePkColumns 필드 추가 (T1)
174b489 feat(api): POST /_composite 엔드포인트 — 복합 PK PATCH/DELETE (T2)
d4621b3 feat(ui): TableDataGrid·useInlineEditMutation 복합 PK 분기 (T3)
4c9bee9 docs(adr): ADR-005 Phase 14c-β 복합 PK 라우팅 결정 (T4)
b68393c test(14c-β): curl B1~B9 E2E 스크립트 + _test_composite setup/teardown (T5)
<next>  fix(api): _composite → composite 폴더명 변경 (Next.js 언더스코어 private) (버그 1)
<next>  docs(14c-β): 세션 24 연장 /cs — 복합 PK 지원 완료 + TIMESTAMP(3) 주석 (버그 2 + 종료)
```

## 다음 세션 권장

### 우선순위 1: Phase 14c-γ — VIEWER 계정 + 권한 매트릭스 E2E
- VIEWER role seed 스크립트
- `npm i -D @playwright/test` + `npx playwright install` (브라우저 에이전트 세팅)
- MANAGER/ADMIN/VIEWER 3롤 × (SELECT/INSERT/UPDATE/DELETE) 매트릭스
- α의 미실행 Playwright 스펙 (`phase-14c-alpha-ui.spec.ts`)도 함께 실행 가능해짐

### 우선순위 2: Compound Knowledge 추출 (세션 24에서 발견된 4건)
1. `docs/solutions/2026-04-18-raw-sql-updatedat-bump.md` — Prisma `@updatedAt` 한계 + raw SQL auto-bump 필수
2. `docs/solutions/2026-04-18-subagent-driven-pragmatism.md` — 완전 코드 플랜 시 reviewer dispatch 축약
3. `docs/solutions/2026-04-18-nextjs-private-folder-routing.md` ⭐ — `_` prefix folder convention 함정
4. `docs/solutions/2026-04-18-timestamp-precision-optimistic-locking.md` ⭐ — pg ms/µs 정밀도 + 낙관적 잠금

### 우선순위 3: 본 세션 보류 방향
- 방향 B `/ypserver` 스킬 보강 (5 갭)
- 방향 C Vitest 도입 (ADR-003 §5 재활성화)
- α/β의 공통 로직 추출 리팩토링 (coerce + introspect + 감사 로그 조립 — 현재 중복)

### 주의 사항
- `composite` 폴더명 변경은 Next.js 16 private folder 규칙 때문 — 다른 신규 API 경로 설계 시 `_` prefix 피할 것
- 복합 PK 테이블 추가 시 `TIMESTAMP(3)` 사용 권장 (Prisma와 일관)
- ADR-004(α) + ADR-005(β) 둘 다 현 아키텍처에 유효. γ는 이 위에 올라감

---

[← handover/_index.md](./_index.md)
