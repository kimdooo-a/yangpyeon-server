# 인수인계서 — 세션 22 (Phase 14b E2E 재수행 + @updatedAt DB DEFAULT 부재 발견)

> 작성일: 2026-04-17
> 이전 세션: [session21](./260417-session21-phase-14b-implementation.md)
> 세션 저널: [journal-2026-04-17.md](../logs/journal-2026-04-17.md)
> 신규 솔루션: [phase-14b-updated-at-no-db-default](../solutions/2026-04-17-phase-14b-updated-at-no-db-default.md)

---

## 작업 요약

세션 21이 Phase 14b 구현·배포·PK회귀 수정까지 완료했으나 `docs/guides/tables-e2e-manual.md` **DOD 체크박스 S8~S11은 여전히 `[ ]` 미체크**였다. 세션 22는 `/kdyguide` → `/ypserver prod` 재실행(멱등) + **DOD 실 수행(curl 기반)** 을 진행하며 **세션 21 curl이 놓친 `updated_at` NOT NULL 버그를 재현·문서화**했다.

## 세션 흐름

1. **`/kdyguide`** (기본 모드) — 컨텍스트 스캔 중 HEAD=`2cbf226`로 오판 → 실제 HEAD=`a57cfb6`(세션 21 /cs 완료) 재확인. L0/L3는 이미 사용자가 대화 외부에서 처리.
2. **L1 `/ypserver prod`** — WSL2 빌드 + PM2 restart 재실행. 33 라우트(`/api/v1/tables/[table]/[pk]` 포함) 정상 빌드, dashboard pid 1876 online, cloudflared 4 연결 registered. 빌드/재시작은 멱등이라 무해.
3. **L2 E2E curl 자동화** — Cloudflare Tunnel이 일시 530 불안정 → WSL localhost(`http://localhost:3000`)로 전환(세션 21 솔루션 `2026-04-17-cloudflare-tunnel-intermittent-530.md`와 동일 패턴). 로그인 플로우 재구성: `/api/v1/auth/login` → accessToken → `/api/auth/login-v2`로 `dashboard_session` 쿠키 설정(Secure/HttpOnly/SameSite=lax).
4. **S8a INSERT 1차 시도 실패** — updated_at 생략 payload → 500 `null value in column "updated_at" ... violates not-null constraint`.
5. **근본 원인 특정** — `psql \d folders` 직접 조회:
   - `created_at | NOT NULL | DEFAULT CURRENT_TIMESTAMP` ← raw SQL OK
   - `updated_at | NOT NULL | (DEFAULT 없음)` ← raw SQL FAIL
   - Prisma `@default(now())`는 DB DEFAULT를 생성하지만 `@updatedAt`은 Prisma 클라이언트 전용(raw SQL은 못 씀).
6. **S8a 재시도** (updated_at 수동 주입) → 200. **S8b PATCH → 200. S8c DELETE → 200**.
7. **S9~S11 전 매트릭스 통과** — TABLE_ROW_INSERT/UPDATE/DELETE 3건 감사 로그 영속, users/api_keys/_prisma_migrations 403, edge_function_runs INSERT 403 "삭제만 가능" + DELETE 404(정책 통과).
8. **Vercel 훅 false positive 3회** — `nextjs`/`next-cache-components`/`vercel-functions` "MANDATORY" injection. 프로젝트 Vercel 미사용이므로 session21 handover §알려진 이슈 1 정책에 따라 전부 스킵.

## 핵심 발견 — `@updatedAt` DB DEFAULT 부재

**증상**: raw SQL INSERT(Phase 14b CRUD)에 `updated_at` 포함하지 않으면 500. 현재 RowFormModal 3상태 기본값이 "keep"이라 **UI "행 추가"가 실사용자에게 항상 500**. 세션 21 journal 토픽 10의 "S8 POST folders → 200"은 payload에 updated_at이 포함됐던 것으로 판단.

**영향 테이블**: `prisma/schema.prisma`에서 `@updatedAt` 선언된 모든 모델 — User / Folder / File / SqlQuery / EdgeFunction / Webhook / CronJob / ApiKey / LogDrain(최소 9개).

**권장 수정 (Phase 14c 1순위)**:
```prisma
updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamp(3)
//                  ^^^^^^^^^^^^^^^ 병기 — 마이그레이션이 SQL DEFAULT 생성
```
`npx prisma migrate dev -n "add_updated_at_default"` → `ALTER TABLE ... SET DEFAULT CURRENT_TIMESTAMP` 생성. ORM 갱신 동작은 유지.

상세: `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md`.

## DOD 체크박스 업데이트 (S8~S11)

`docs/guides/tables-e2e-manual.md` L149~153:

| DOD | 세션 22 결과 |
|---|---|
| S8 정상 INSERT (ADMIN + folders) | ✅ curl 통과 (updated_at 주입 조건부) |
| S9 정상 UPDATE (동일 행) | ✅ curl 통과 |
| S10 DELETE + 감사 로그 3건 누적 확인 | ✅ `{deleted:true}` + audit_logs 영속 |
| S11 UI/API 차단 매트릭스 | ✅ users/api_keys/_prisma_migrations 403, edge_function_runs DELETE-only |
| PM2 로그 `SET LOCAL ROLE app_readwrite` 흔적 | ⚠ 세션 22에서 직접 확인 생략(감사 로그 영속으로 경로 입증) |

브라우저 UI 수동 E2E는 **updated_at 버그 때문에 keep 기본값으로 "행 추가" 시도 시 500**. 사용자가 직접 UI로 시도 권하지 않음 (Phase 14c fix 후 재수행).

## 터치하지 않은 영역

- Prisma 스키마 수정 / 마이그레이션 (Phase 14c 범위)
- RowFormModal / API POST 레이어 자동 주입 패치 (Option B/C — Phase 14c 설계 단계에서 선택)
- Cloudflare Tunnel 530 근본 수정 (세션 21 솔루션에 원인 미확정 기재, `net.core.rmem_max` 조정 후속 검토)
- Vitest 도입 (세션 20 ADR-003 §5 조건부)

## 알려진 이슈

### 1. `@updatedAt` raw SQL INSERT 500 (Phase 14c 1순위)
상세 위 §핵심 발견 및 솔루션 문서.

### 2. Cloudflare Tunnel 일시 530
세션 22에서도 `pm2 restart cloudflared` 후 복원됐으나 재발. WSL localhost 경유로 E2E 수행. 근본 원인 미확정(세션 21 솔루션과 동일).

### 3. Vercel 훅 false positive 여전
프로젝트 Vercel 미사용인데 `nextjs`/`next-cache-components`/`vercel-functions` "MANDATORY" 지시 반복. `.claude/settings.json`에서 `matchedSkills` 억제 또는 사용자 선호 기록 필요.

### 4. `docs/guides/tables-e2e-manual.md` S8 매뉴얼의 payload 누락
세션 21 매뉴얼은 "name/owner_id/is_root" 3필드만 명시 — updated_at 미언급. Phase 14c DB DEFAULT 추가로 해결되면 매뉴얼도 업데이트 불필요(현 상태 유지 가능). Option B/C로 가면 매뉴얼 업데이트 필요.

## 다음 세션 (세션 23) 제안

### 즉시 가능 (Phase 14c 1순위)
1. **`@updatedAt` 필드 DB DEFAULT 추가 마이그레이션** — Option A 적용. `grep @updatedAt prisma/schema.prisma`로 대상 식별 → 일괄 `@default(now())` 병기 → `npx prisma migrate dev` → WSL2 배포. Phase 14b E2E 재수행으로 UI keep 경로 통과 확인.

### Phase 14c 본 작업
2. **인라인 편집 + 낙관적 잠금** — `updated_at` 비교 기반 conflict detection. Option A 적용 시 자연스러움.
3. **복합 PK 지원** — `[pk]` 동적 라우트를 `[...pk]` 전환 또는 쿼리스트링 기반 다중 컬럼 매칭. 현재 PK 추출 쿼리(`pg_index.indkey`)는 이미 배열 반환 구조.
4. **VIEWER 테스트 계정 생성** — S2 권한 매트릭스 + Phase 14b MANAGER/ADMIN/VIEWER 차등 확인.

### 기술부채 / cosmetic
5. **Vitest 도입 + `identifier`/`coerce`/`table-policy`/`runReadwrite` 유닛 테스트** (ADR-003 §5 재활성화).
6. **Vercel 훅 억제** — `.claude/settings.json` `matchedSkills` 룰 추가.
7. **Cloudflare Tunnel 530 재발 조사** — `sysctl -w net.core.rmem_max=7340032` 실험, WSL2 NIC 버퍼 튜닝.
8. **identifier regex 길이 제한** (`{0,62}` 적용, PG 63자).

---
[← handover/_index.md](./_index.md)
