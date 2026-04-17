# 인수인계서 — 세션 24 (Phase 14c-α — 인라인 편집 + 낙관적 잠금)

> 작성일: 2026-04-18
> 이전 세션: [session23](./260417-session23-phase-14c-updated-at-fix.md)
> 세션 저널: [journal-2026-04-18.md](../logs/journal-2026-04-18.md)
> 관련 spec: [phase-14c-alpha-design](../superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md)
> 관련 plan: [phase-14c-alpha-plan](../superpowers/plans/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-plan.md)
> 결정 기록: [ADR-004](../research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md)

---

## 작업 요약

세션 23 `@default(now()) @updatedAt` 자산 위에 **셀 인라인 편집 + 낙관적 잠금**을 구현. `/kdyguide` 기본 모드로 4차원 스코어링 → 방향 A/B/C 제시 → 사용자가 "모두 순차적으로, 권장대로, 묻지 말고" 지시 → 자율 실행 모드 전환. 방향 A를 α(인라인+잠금) / β(복합 PK) / γ(VIEWER+권한 매트릭스) 3 spec으로 분해 후 α만 본 세션에서 단독 진행.

## 핵심 산출물

### 신규 컴포넌트 (3)
- `src/components/table-editor/editable-cell-inputs.tsx` — `TypedInputControl` + `typeToInput` 공용 유틸 (RowFormModal·EditableCell 공유)
- `src/components/table-editor/editable-cell.tsx` — 셀 인라인 편집 컴포넌트 (click→focus, Enter/Esc/Tab, amber dirty ring)
- `src/components/table-editor/use-inline-edit-mutation.ts` — PATCH + 409 Sonner 토스트 3액션(덮어쓰기/유지/취소) + 재시도

### API 변경 (1)
- `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH:
  - `expected_updated_at?: string` 바디 필드 (선택) — ISO 타임스탬프 검증 + `updated_at` 컬럼 존재 확인
  - WHERE 절 확장: `AND updated_at = $M` (잠금 활성 시)
  - `rowCount=0` → SELECT 재확인 → 409 `{current}` / 404
  - 감사 로그 2종: `TABLE_ROW_UPDATE` (locked:bool metadata) + `TABLE_ROW_UPDATE_CONFLICT` (신규 action, expected/actual)
  - **2차 근본 수정**: raw SQL UPDATE가 `updated_at`를 auto-bump하지 않아 잠금 무력화되던 문제 → `SET ..., updated_at = NOW()` 자동 주입 로직 추가

### Grid 통합 (1)
- `src/components/table-editor/table-data-grid.tsx` — `cell` 렌더러를 `EditableCell`로 치환, `systemColumns` prop (기본 `["created_at", "updated_at"]`) + `onRowPatched` 콜백

### 리팩토링 (1)
- `src/components/table-editor/row-form-modal.tsx` — 로컬 `typeToInput` + 3개 input 분기 → `TypedInputControl` 단일 컴포넌트로 치환 (동작 불변)

### 테스트 (2)
- `scripts/e2e/phase-14c-alpha-curl.sh` — C1~C6 매트릭스 (정상 PATCH / CONFLICT / NOT_FOUND / LEGACY / MALFORMED / 감사 로그)
- `scripts/e2e/phase-14c-alpha-ui.spec.ts` — Playwright E1/E3/E5/E6 (실행은 Playwright 설치 후 — 본 세션 미설치)

### 문서 (3)
- `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md`
- `docs/superpowers/plans/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-plan.md`
- `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`

### 설정 (1)
- `tsconfig.json` — `"scripts"` 디렉토리 exclude 추가 (Playwright 미설치 상태에서 tsc 통과)

## 배포 상태

- **원격 main**: 세션 23 `a00beca` 이후 세션 24에서 11 커밋 추가 (미푸시 상태 — 필요 시 `git push origin main`)
- **프로덕션(WSL2 PM2)**: `rm -rf src .next && cp -r` + `npm run build` + `pm2 restart dashboard` — 완료 ✓
- **스키마 변경 없음**: 세션 23 migration 그대로 활용
- **Cloudflare Tunnel**: 배포 중 일시 530 → `pm2 restart cloudflared`로 복구 (알려진 이슈)

## E2E 결과 (프로덕션)

| 시나리오 | 결과 | 비고 |
|----------|------|------|
| C1 정상 PATCH (락 일치) | ✅ 200 | updated_at bump 확인 |
| C2 CONFLICT | ✅ 409 | `error.code=CONFLICT` + `current` 포함 |
| C3 NOT_FOUND | ✅ 404 | 존재하지 않는 PK |
| C4 LEGACY (락 미제공) | ✅ 200 | 후방 호환 검증 |
| C5 MALFORMED expected_updated_at | ✅ 400 | `INVALID_EXPECTED_UPDATED_AT` |
| C6 감사 로그 영속 | ✅ | UPDATE=10 / UPDATE_CONFLICT=1 |
| E1~E4 Playwright | ⚠ 미실행 | Playwright 미설치 — 수동 DOD 위임 |
| 브라우저 smoke | ⚠ 미실행 | Cloudflare Tunnel 530 재발로 MCP Playwright 차단 |

## 세션 중 발견·수정된 버그 (2차)

1. **E2E 스크립트 seed 추출 실패** — `GET /api/v1/tables/folders?where=…`의 `where` 쿼리 파라미터는 API에서 지원하지 않음. INSERT 응답이 `RETURNING *`로 `updated_at`를 동봉하므로, seed 후 그 응답에서 직접 추출하도록 스크립트 수정.
2. **raw SQL UPDATE가 `updated_at` auto-bump하지 않음** — Prisma `@updatedAt`는 클라이언트 레벨 마커라 raw SQL에 미적용. `DEFAULT now()`는 INSERT에만 발동. 결과적으로 연속 UPDATE가 동일 `updated_at`를 유지해 낙관적 잠금이 항상 성공 → 의미 없음. API에서 `hasUpdatedAtCol && !userSetUpdatedAt` 조건으로 `SET ..., updated_at = NOW()` 자동 주입 로직을 추가해 해결.

## 대화 다이제스트

### 토픽 1: "마지막 작업" 검증
세션 23 종료 후 사용자가 "세션기록없이 멈췄다"고 주장. `git status` + reflog + stash + worktree + 문서 5종 산출물을 전부 확인해 **세션 23이 완전 종료**되었음을 증명. 이후 작업 흔적은 `.gitignore` 파일만 존재.

### 토픽 2: `/kdyguide` → 방향 A/B/C 제시
컨텍스트 스캔(git + current.md + handover + 87 skill 카탈로그 + feedback 이력) → 4차원 스코어링 → 상위 6개 스킬(brainstorming 70, writing-plans 65, subagent-driven 55, executing-plans 55, kdynext 38, kdyspike 30) + DAG 구성. 3방향 제시 후 사용자 선택.

### 토픽 3: "모두 순차적으로 + 권장대로 + 묻지 말고"
자율 실행 모드로 전환. **피드백 메모리 영구 저장** (`feedback_autonomy.md` + MEMORY.md 인덱스 등록) — 분기 질문 금지, 권장안 즉시 채택, 파괴적 행동만 예외.

### 토픽 4: α spec 작성 (옵션 1 분해)
방향 A 4 서브항목 중 α(인라인+잠금) / β(복합 PK) / γ(VIEWER) 분해. 스코프 플래그 발동 — 데이터 계층(충돌 감지) / 라우팅 계층(식별자 모델) / 권한 테스트 계층은 독립적. α spec 작성 → 자가 검토(§2.3 대상 테이블·§6.3 DOD 구체화) → commit `66bbc79`.

### 토픽 5: α plan 작성 (7 Task × ~50 Step)
writing-plans 진입. File Structure 매핑 → 7 Task 분해 (T1 API / T2 추출 / T3 EditableCell / T4 훅 / T5 Grid / T6 E2E / T7 ADR+배포+DOD+handover). 각 Step에 완전한 코드·명령·기대 출력 포함 → Self-review → commit `39c744c`.

### 토픽 6: subagent-driven 실행 (T1~T6)
- T1 API 변경 (haiku) → `912539e` (sqlParams 리네임 — context.params 충돌 회피)
- T2 공용 입력 컨트롤 추출 (haiku) → `b82e3fe`
- T3 EditableCell (haiku) → `91dccce`
- T4 useInlineEditMutation (haiku) → `a8f1d76`
- T5 Grid 통합 (sonnet — 멀티파일) → `6532015`
- T6 E2E 스크립트 (haiku) → `b77afe0`
각 Task 후 controller가 직접 커밋 diff 검증 (subagent reviewer 2회 dispatch는 생략 — 플랜에 완전 코드 포함이라 검증 비용이 dispatch 비용보다 낮음).

### 토픽 7: T7 = ADR + 배포 + E2E + docs (혼성)
- T7a (ADR-004): 백그라운드 subagent → `e732cd3`
- T7b (배포): controller wsl 명령 — `rm -rf src .next && cp -r ...` → build → pm2 restart. 성공.
- T7c (E2E 1차): FAIL — seed updated_at 빈 문자열 문제 + C2 CONFLICT 안 됨.
- 근본 원인 분석: seed는 `?where` 쿼리 미지원, C2는 raw UPDATE auto-bump 부재.
- T7d (수정 + 재배포 + 재실행): curl 스크립트 수정 + API auto-bump 추가 + tsconfig scripts 제외 → `00d4e79`. 재배포 → E2E C1~C6 전 PASS.
- T7e (문서): current.md/2026-04.md/journal/handover/_index/next-dev-prompt 갱신.

## 커밋 체인 (세션 24, 11개)

```
66bbc79 docs(14c-α): 인라인 편집 + 낙관적 잠금 설계 spec
39c744c docs(14c-α): 인라인 편집 + 낙관적 잠금 구현 계획
912539e feat(api): PATCH expected_updated_at 낙관적 잠금 + 409 CONFLICT (T1)
b82e3fe refactor(ui): RowFormModal 입력 컨트롤을 editable-cell-inputs로 추출 (T2)
91dccce feat(ui): EditableCell 컴포넌트 — 셀 인라인 편집 기본기 (T3)
a8f1d76 feat(ui): useInlineEditMutation — PATCH + 409 토스트 + 재시도 (T4)
6532015 feat(ui): TableDataGrid 인라인 편집 통합 + readonly 매트릭스 (T5)
b77afe0 test(14c-α): curl C1~C6 + Playwright E1/E3/E5/E6 E2E 스크립트 (T6)
e732cd3 docs(adr): ADR-004 Phase 14c-α 낙관적 잠금 결정 기록 (T7a)
00d4e79 fix(api): raw SQL UPDATE 시 updated_at 자동 bump (T7c 근본 수정)
<이 handover 커밋> docs(14c-α): 세션 24 /cs — 인라인 편집 + 낙관적 잠금 완료
```

## 다음 세션 권장

### 우선순위 1: Phase 14c-β — 복합 PK 지원
- `[pk]` → `[...pk]` 동적 라우트 또는 쿼리스트링 다중 컬럼 매칭
- PK 추출 쿼리(`pg_index.indkey`)는 이미 배열 반환 구조 → WHERE 빌더만 확장
- α의 `expected_updated_at` 패턴 재사용 (compositePk → 여러 $N)

### 우선순위 2: Phase 14c-γ — VIEWER 계정 + 권한 매트릭스 E2E
- `docs/superpowers/specs/2026-04-18-phase-14c-gamma-...md` 신규 spec
- S2 권한 매트릭스 자동 검증 (MANAGER/ADMIN/VIEWER 3롤)
- seed 스크립트로 테스트 계정 생성

### 우선순위 3: 본 세션 보류 방향
- **방향 B** `/ypserver` 스킬 보강 (5 갭: Windows build 스킵 / prisma 복사 / migrate deploy / drizzle migrate / Compound Knowledge 내재화)
- **방향 C** Vitest 도입 (ADR-003 §5 재활성화, identifier/coerce/table-policy/runReadwrite 유닛 테스트)
- **Playwright 설치**로 본 세션 E2E 스펙 자동화 가동

### 주의 사항
- 낙관적 잠금은 **raw SQL 경로 전체**에 적용됨 (API가 자동 bump). Prisma client 경로는 영향 없음.
- `TABLE_ROW_UPDATE_CONFLICT` 감사 로그는 `/api/audit`로 조회 가능(`/api/v1/*`와 envelope 다름 — Compound Knowledge `2026-04-17-curl-e2e-recipe-dashboard.md` 참조).
- Cloudflare Tunnel은 PM2 재기동 직후 간헐 530 → `pm2 restart cloudflared`로 복구.

---

[← handover/_index.md](./_index.md)
