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
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan (`/login-v2` 사용) |

## 필수 참조 파일

```
docs/MASTER-DEV-PLAN.md
CLAUDE.md
docs/status/current.md
docs/handover/260417-session21-phase-14b-implementation.md   ⭐ 최신 (세션 21)
docs/research/decisions/ADR-003-phase-14b-table-editor-crud.md
docs/research/plans/phase-14b-table-editor-crud-plan.md      ⭐ C5 남음
docs/handover/260412-session20-phase-14b-design.md
docs/handover/260412-session19-ops-security-hardening.md
docs/handover/260412-session18-auth-refactor.md
docs/solutions/2026-04-12-*.md
```

## 현재 상태 (세션 21 종료 시점)

### 완료된 Phase
- Phase 1~13 전부 완료
- Phase 14-S (세션 15~16): Supabase 이식 Phase A+B
- Phase 14a (세션 18): Table Editor 읽기 전용
- Phase 14c (세션 17): SQL Editor Monaco (인라인 편집은 Phase 14c에서 재정의 예정)
- **Phase 14b (세션 21, 구현 완료 — 배포 대기)**: Table Editor CRUD

### 배포 상태 ⚠️
- **원격 main**: `98b4f0c` (세션 20 종료)
- **로컬 HEAD**: `2cbf226` (C4 완료) — 원격 대비 **4 커밋 앞섬**
- **프로덕션(WSL2 PM2)**: `0e59be0` (세션 18 종료) — 세션 19+20 문서 + Phase 14b 구현 전부 미반영

### Phase 14b 잔여 작업 (C5 — 다음 세션 즉시 착수)

1. **C5 docs 커밋** — `tables-e2e-manual.md` S8~S11, `current.md`, `logs/2026-04.md`, `journal-2026-04-17.md`, session 21 handover, `_index.md`, 본 `next-dev-prompt.md` (모두 로컬 수정 완료, 커밋만 남음)

2. **WSL2 빌드 + PM2 재시작**:
   ```bash
   wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && npm install && npm run build && pm2 restart dashboard"
   ```

3. **프로덕션 curl smoke**:
   ```bash
   # 쿠키 획득(login-v2 — CSRF 토큰 선행) 또는 브라우저 세션 활용
   curl -s -b <cookie> https://stylelucky4u.com/api/v1/tables/folders/schema | head -c 300
   # → primaryKey, compositePk 필드 포함 JSON 기대
   ```

4. **브라우저 E2E S8~S11**:
   - `/tables/folders` — 행 추가(ADMIN) / 편집 / 삭제 / 감사 로그 3건 누적 확인
   - `/tables/users` — "편집 불가" 메시지 + API 직접 호출 시 403
   - `/tables/edge_function_runs` — 삭제 버튼만 노출(ADMIN)

5. **`git push origin main`** — C1~C5 5 커밋 일괄 푸시

## 현재 DB 구조 (변경 없음)

### PostgreSQL (Prisma) — 10 테이블 + 롤 2종
- 10 테이블: User, Folder, File, SqlQuery, EdgeFunction, EdgeFunctionRun, Webhook, CronJob, ApiKey, LogDrain
- 롤: `app_readonly` (세션 16) + **`app_readwrite`** (세션 21 추가)

### SQLite (Drizzle) — data/dashboard.db
- audit_logs, metrics_history, ip_whitelist

## Phase 14c 로드맵 (Phase 14b C5 완료 후)

Phase 14c 목표: Table Editor 인라인 편집 + 낙관적 잠금.

- **복합 PK 지원** — 현 Phase 14b는 단일 PK 한정. 복합 WHERE 절 + 폼 복합 입력 UI
- **낙관적 잠금** — `updated_at` 비교 기반. 동시 수정 충돌 시 409 Conflict + UI 재조회 유도
- **인라인 셀 편집** — TanStack Table cell 더블클릭 → 타입별 에디터(체크박스/date/JSON textarea) → Enter 저장 / Esc 취소 / 탭 네비게이션

## 알려진 이슈 및 주의사항

- **Vercel plugin 훅 false positive**: 프로젝트가 Vercel 미사용이라 세션 시작 가이드대로 스킵. 특히 Next.js 16 async params 린터가 Phase 14a 관습(`await context.params` 선처리 후 로컬 변수 접근)을 반복 오판. 후속 세션에서 `.claude/settings.json` 억제 규칙 검토
- **프로젝트 단위 테스트 러너 부재**: Vitest 미설치. `identifier`/`coerce`/`table-policy` 순수 함수가 API 통합 경로로만 검증됨 — Phase 14c 진입 전 Vitest 도입 권장 (ADR-003 §5 재활성화)
- **dev 서버 CSRF 플로우**: `/api/auth/login-v2`는 CSRF 토큰 선행 필수. 로컬 curl 통합 테스트가 환경 의존적 — 별도 E2E 스크립트(토큰 획득 → 쿠키 유지) 작성 가능
- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` optional bin 미설치. WSL2 빌드가 진실 소스
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임 — route segment config 선언 시 빌드 오류
- **Cloudflare Tunnel WSL2 재기동**: systemd 비활성 환경에서 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음 — `pm2 resurrect` 자동화 또는 WSL systemd 활성 검토

---
[← handover/_index.md](./_index.md)
