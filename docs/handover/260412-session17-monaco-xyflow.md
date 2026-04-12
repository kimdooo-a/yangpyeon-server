# 인수인계서 — 세션 17 (SQL Editor Monaco + Schema Visualizer xyflow 치환 + 12 P0 E2E)

> 작성일: 2026-04-12
> 이전 세션: [session16](./260412-session16-supabase-deploy.md)

---

## 작업 요약

세션 16의 추천 후속 1·2·3번(12개 P0 페이지 E2E / SQL Editor Monaco 치환 / Schema Visualizer xyflow 치환) 일괄 수행. 브라우저 E2E에서 기본 SQL의 `"User"` 테이블명 오류(실제는 Prisma `@@map("users")` 소문자)를 부수 버그로 발견·수정. WSL2 PM2 2회 재배포 후 전 P0 페이지 콘솔 에러 0건 검증 완료.

## 대화 다이제스트

### 토픽 1: 다음 세션 작업 확인
> **사용자**: "새로운 세션으로 이어서 해야할 작업은?"

`docs/handover/next-dev-prompt.md` + `docs/status/current.md`를 읽어 세션 16까지 완료된 범위와 "즉시 가능 (세션 16 후속 — 최우선)" 6·7·8번이 미완료임을 확인. E2E(#6) → Monaco(#7) → xyflow(#8) 순 플로우를 제시.

**결론**: 사용자 승인("모두 진행해... 직접.") → 3개 작업 일괄 실행.

### 토픽 2: Monaco 동적 import + Ctrl+Enter 단축키
> **사용자**: "모두 진행해... 직접."

`"use client"` + 이미 설치된 `@monaco-editor/react`(^4.7.0)라는 전제에서, `next/dynamic` `ssr:false` 로 래핑하여 SSR 시 `window` 참조 문제를 회피하고 초기 번들 부담을 줄임. 에디터 마운트 직후 `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, ...)` 로 실행 버튼 `#sql-execute-btn` 을 가상 클릭하는 단축키를 장착. `onChange` 시 `value ?? ""` 로 undefined 방어.

**결론**: `src/app/sql-editor/page.tsx` — `<textarea>` 제거, `MonacoEditor` 컴포넌트로 완전 치환, 실행 버튼에 id 부여.

### 토픽 3: xyflow + elkjs 비동기 레이아웃 패턴
> **사용자**: (동일 요청 연속)

xyflow v12의 `@xyflow/react/dist/style.css` import가 CSS 누락 시 "아무것도 안 보임" 증상을 유발하는 점을 미리 반영. elkjs는 Promise 기반이라 **초기 노드 position(0,0)으로 마운트 → `elk.layout()` 완료 후 `setNodes(positioned)` 로 주입**하는 패턴을 채택. 노드 높이를 컬럼 수에 비례해서 ELK에 넘겨야 FK 엣지가 겹치지 않음. `layered / direction:RIGHT` 로 PK→FK 흐름을 좌→우 자연스러운 DAG로 배치.

**결론**:
- `src/app/database/schema/page.tsx` — 카드 그리드 제거, `SchemaFlow` 동적 import 래퍼로 정리
- `src/app/database/schema/SchemaFlow.tsx` (신규) — xyflow/ReactFlow + ELK + 커스텀 `TableNode` + Background/Controls/MiniMap

### 토픽 4: Playwright 로그인 후 12 P0 페이지 E2E — 1차 실패
> **관찰**: `/sql-editor` 에서 Next.js 404. 사이드바에 `데이터베이스/개발 도구` 그룹 자체가 빠져 있음.

`sidebar.tsx` 코드에는 `SQL 에디터` 등 신규 그룹이 이미 등록되어 있음에도 렌더가 누락된 점 + localhost:3000 포트 소유자가 `wslrelay.exe`인 점으로부터 **localhost:3000은 `next dev` 가 아닌 WSL2 PM2의 `next start`** 라는 점을 역추적. 제 파일 변경은 빌드+배포 전까지 반영되지 않음을 확인.

**결론**: `/ypserver` 스킬의 Phase 1(Windows `next build`)은 `lightningcss-win32-x64-msvc` 네이티브 바이너리 부재로 환경 이슈가 발생함. `&&` 체인 덕에 빌드 실패 시 PM2 재시작이 안 나가는 안전성을 확인하고 Phase 2(WSL2 `npm install && npm run build && pm2 restart`) 로 우회.

### 토픽 5: 기본 SQL 테이블명 오류
> **관찰**: 재배포 후 `#sql-execute-btn` 클릭 → API 400 `relation "User" does not exist`.

`/api/v1/sql/execute` 로 직접 Prisma 메타 쿼리를 보내 `pg_tables` 를 읽어 실제 테이블이 `users`(소문자) 임을 확인. Monaco → state → API 파이프라인 자체는 정상(입력한 SQL이 그대로 서버까지 전달). **기존에도 잠재되어 있던 default seed 오류**로, UI 동작 검증을 위해 한 라인 수정 후 2차 재배포.

**결론**: `useState<string>("SELECT id, email, role FROM users LIMIT 20;")` — 따옴표 제거 + 소문자화.

### 토픽 6: 최종 E2E 순회
12개 P0 페이지 전부 Playwright 순회 + 스크린샷 + 콘솔 에러 조회:

| # | 경로 | 결과 |
|---|------|------|
| 1 | `/sql-editor` | Monaco 에디터 렌더 + `SELECT ... FROM users LIMIT 20;` → 실행 시 1행(`kimdooo@stylelucky4u.com`, `ADMIN`) 반환 |
| 2 | `/database/schema` | xyflow 자동 레이아웃, 11 테이블 노드 + FK 엣지, MiniMap/Controls 정상 |
| 3 | `/data-api` | User/Folder/File 3개 카드 |
| 4 | `/database/webhooks` | 빈 목록 |
| 5 | `/database/cron` | `Cron 목록` 섹션 렌더 |
| 6 | `/database/backups` | 백업 목록 (pg_dump 경로 경고 노란 바) |
| 7 | `/functions` | 함수 목록(빈 상태) |
| 8 | `/realtime` | Broadcast/Join 채널 UI |
| 9 | `/advisors/security` | 실제 테이블 대상 5+ 권고(`sql_queries`, `prisma_migrations`, `files`, `folders` 등) 렌더 |
| 10 | `/advisors/performance` | 실제 인덱스/쿼리 기반 권고 렌더 |
| 11 | `/settings/api-keys` | 빈 목록 |
| 12 | `/settings/log-drains` | 빈 목록 |

**결론**: 12개 전원 콘솔 에러 0건. Monaco/xyflow 교체 + 기본 쿼리 수정까지 UI 레벨 완전 검증.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | Monaco를 `next/dynamic(ssr:false)` 로 래핑 | 그대로 import / dynamic | SSR 시 `window`/DOM 전제 접근 + 초기 번들 분리 이득 |
| 2 | SchemaFlow를 별도 파일로 분리 | 한 파일에 전부 / 분리 | dynamic import 경계를 명확히 두고 page는 데이터 로딩만 담당 |
| 3 | elkjs를 `layered / RIGHT` | force / radial / layered | PK→FK DAG 구조에 가장 자연스러운 좌→우 흐름 |
| 4 | `ypserver` Phase 1 실패 시 Phase 2 강행 | 중단 / 강행 | Windows 바이너리 부재는 환경 이슈고, `&&` 체인 안전성으로 프로덕션 리스크 없음 |
| 5 | 기본 SQL `"User"` → `users` 즉시 수정 | 별 세션 미룸 / 이번 세션 | E2E 실행 경로에서 UI가 매번 400을 내는 블로커였음 |

## 수정 파일 (4개 + 신규 1)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/app/sql-editor/page.tsx` | Monaco 동적 import, Ctrl+Enter 커맨드, 기본 쿼리 `"User"` → `users` |
| 2 | `src/app/database/schema/page.tsx` | 카드 그리드 제거, SchemaFlow 동적 import 래퍼 + 헤더/카운트만 유지 |
| 3 | `src/app/database/schema/SchemaFlow.tsx` | **신규** — ReactFlow + ELK 비동기 레이아웃 + 커스텀 TableNode |
| 4 | `.gitignore` | `.playwright-mcp/`, `e2e-*.png` 무시 |

## 상세 변경 사항

### 1. SQL Editor — Monaco 치환
- `MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: … })`
- 컨테이너 `h-64` 고정, 내부 `height="100%"` (Monaco의 자체 레이아웃 전제)
- `options`: `minimap off`, `fontSize 13`, `wordWrap: "on"`, `automaticLayout: true`, `padding: { top: 8, bottom: 8 }`
- `onChange(v) => setSql(v ?? "")` — undefined 방어
- `onMount`에서 `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => document.getElementById("sql-execute-btn")?.click())`
- 실행 버튼에 `id="sql-execute-btn"` + `title="Ctrl/Cmd + Enter로 실행"` + 라벨 `실행 (⌘+⏎)`
- 기본 쿼리: `SELECT id, email, role FROM users LIMIT 20;`

### 2. Schema Visualizer — xyflow 치환
- 페이지는 fetch + SchemaFlow 래퍼로 축소. 컨테이너 `h-[640px]` 고정
- `import "@xyflow/react/dist/style.css"` — 누락 시 렌더 0 이슈 사전 방지

#### 신규 `SchemaFlow.tsx`
- `const elk = new ELK()` — 모듈 스코프 싱글턴
- `TableNode`: 기존 카드 레이아웃을 xyflow 커스텀 노드로 이식 (PK/FK 뱃지 유지)
- 노드 높이 = `44 + columns*22 + 8` → ELK에 정확히 전달해 FK 엣지 겹침 방지
- `layoutOptions = { algorithm: "layered", direction: "RIGHT", spacing.nodeNode: 40, layered.spacing.nodeNodeBetweenLayers: 80 }`
- 비동기 레이아웃: 초기 position(0,0) → `elk.layout()` Promise → `setNodes(positioned)` 주입. `cancelled` 플래그로 언마운트 레이스 방어
- 엣지 label: `sourceColumn → targetColumn`
- Background(dot gap 20) + Controls(우하) + MiniMap(좌하 panel/zoom 가능) + `hideAttribution`

### 3. ypserver 배포 실행
- Phase 1 Windows `next build` — `lightningcss-win32-x64-msvc` optional dep 부재로 실패 (환경 이슈, 제 코드 변경과 무관)
- Phase 2 WSL2 `cd ~/dashboard && rm -rf src .next && cp ... && npm install && npm run build && pm2 restart dashboard` → 성공
- 빌드 결과: 84 라우트 (12 P0 페이지 모두 `○ (Static)` prerender)
- PM2 `dashboard` 재시작 3→4→5 (E2E 도중 기본 쿼리 수정분 2차 재배포)

### 4. E2E 검증 아티팩트
- Playwright MCP(Chromium) 로 `http://localhost:3000` 로그인 → 12 페이지 순회
- 스크린샷 14장 (`e2e-01-sql-editor.png` … `e2e-14-sql-ui-executed.png`) — `.gitignore`로 커밋 제외
- 콘솔 에러: 전 페이지 0건 (warnings는 쿠키/deprecation 경미 사항 1건씩)

## 검증 결과

- WSL2 `npm run build` — 84 라우트 컴파일 성공, `npm audit` 11건(moderate 10, high 1) — 세션 16에서 인지된 기존 이슈
- Windows `npx tsc --noEmit` — 에러 0
- Windows `npx next build` — ❌ `lightningcss-win32-x64-msvc` 바이너리 부재 (환경 이슈)
- PM2 `dashboard` online, `cloudflared` online (tunnel active)
- 12 P0 페이지 콘솔 에러 0건
- `/api/v1/sql/execute` 로 `SELECT id,email,role FROM users` → 200, 1 row

## 터치하지 않은 영역

- Prisma 스키마/마이그레이션 (세션 15~16 상태 유지)
- 라이브러리 업그레이드(`npm audit` 취약점 11건은 그대로)
- Cron 부트스트랩 경로(`src/lib/cron/registry.ts`의 지연 `ensureStarted` 문제)
- Turbopack NFT 경고(`next.config.ts` → `pgdump.ts` 전체 트레이스)
- `/ypserver` 스킬 자체 (Phase 1 Windows 빌드 실패 회피는 본 세션에서만 임시 우회, 스킬 개선은 차기 세션)

## 알려진 이슈

- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` optional dep 미설치 상태. WSL2 빌드가 진실 소스이므로 영향 없음. 필요 시 `npm i -D lightningcss-win32-x64-msvc` 로 복구 가능.
- **ypserver Phase 1 블로킹**: 스킬 정의상 Windows 빌드 실패 시 "즉시 중단"이지만, 실제 deploy path는 WSL2라 우회해도 안전. 차후 스킬에 `--skip-local-build` 또는 WSL 빌드 옵션 추가 검토.

## 다음 작업 제안

- ~~세션 16 후속 6·7·8번~~ → 본 세션에서 완료
- **Phase 14a (마스터 계획)**: TanStack Table Editor (DB 행 브라우저) — Data API 완성에서 파생
- **Phase 14b**: CRUD 에디터 (행 추가/수정/삭제)
- **Cron 부트스트랩**: middleware 또는 별도 워커에 `ensureStarted()` 진입점 이식 (현재 `/api/v1/cron` 첫 히트까지 대기)
- **`npm audit` 11건 정리**: moderate 10 + high 1 — 업데이트 영향 분석 후 일괄 `npm audit fix`
- **ypserver 스킬 보강**: Windows 빌드 환경 감지 후 자동 WSL 빌드 전환 분기

## 참고 파일
- 세션 저널: `docs/logs/journal-2026-04-12.md` (본 세션 오후 분)
- 이전 세션: [session16 인수인계서](./260412-session16-supabase-deploy.md)
- 마스터 계획: [docs/MASTER-DEV-PLAN.md](../MASTER-DEV-PLAN.md)

---
[← handover/_index.md](./_index.md)
