# 03. Advisors 매트릭스 — 5후보 × 10차원 + 3-Layer 통합 설계

> **Wave 2 / 10-advisors — 매트릭스 통합 비교 (400+ 데이터 포인트)**
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + SQLite/Postgres)
> 입력 문서: `01-splinter-full-port...`, `02-squawk-schemalint...`
> 비교 후보: **splinter 포팅**, **squawk**, **schemalint**, **Prisma Lint**, **pglint (참고)**

---

## 0. 매트릭스 요약 (3줄 결론)

1. **3-Layer Advisor**가 결론: **schemalint(4.42)** 컨벤션 + **squawk(4.00)** DDL 안전성 + **splinter(3.95)** 런타임 38룰. 세 도구는 **경쟁이 아니라 서로 다른 시점의 책임**.
2. **Prisma Lint(2.90)** 는 Prisma Schema AST 한정이라 SQL DDL·런타임 상태를 못 봄 → 부가재료. **pglint**는 유지 활성 ↓ → 참고 자료.
3. **CI/CD 차단 정책**이 100점 달성의 엔지니어링 레버리지. schemalint는 PR(shadow DB), squawk는 pre-commit + PR, splinter는 일일 cron — **시점 분리**가 핵심.

---

## 1. 평가 대상 프로파일 카드 (5후보 × 12속성)

| # | 속성 | splinter 포팅 | squawk | schemalint | Prisma Lint | pglint (참고) |
|---|------|---------------|--------|------------|-------------|---------------|
| 1 | **책임 시점** | 런타임 (살아있는 DB) | 빌드 타임 (DDL SQL) | 빌드 타임 + 주기 (DB state) | 빌드 타임 (schema.prisma AST) | 런타임 (PG) |
| 2 | **입력 형태** | 라이브 Postgres | `.sql` 파일 | 라이브 Postgres | `schema.prisma` 텍스트 | 라이브 PG |
| 3 | **언어** | PL/pgSQL → TS 포팅 | Rust | TypeScript | TypeScript | Python |
| 4 | **룰 수** | 38 (Supabase 커뮤니티) | 24 (DDL 안전) | 25+ (확장 가능) | 약 10 (사용자 정의 중심) | ~20 (작음) |
| 5 | **사용자 룰** | ○ (TS 플러그인) | ✗ (고정) | ○ (TS 플러그인) | ○ (AST visitor) | △ |
| 6 | **라이선스** | Apache 2.0 (원본) | GPL-3.0 | MIT | MIT | MIT |
| 7 | **실행 주기** | 일일 cron + 수동 | PR 마다 | PR + 주간 cron | 빌드 마다 | 수동 |
| 8 | **차단 강도** | 알림 (운영자 판단) | PR block (ERROR) | PR block (ERROR) | build fail 선택 | 수동 |
| 9 | **CI 통합** | GitHub Actions + Slack | GitHub Actions | GitHub Actions + shadow DB | Next build | 전용 없음 |
| 10 | **한국어화** | TS로 번역 가능 | ✗ (바이너리 메시지) | ○ (TS 번역) | ○ | ✗ |
| 11 | **설치 비용** | 룰 포팅 50h | 바이너리 + config | npm + config | 이미 Prisma 보유 | Python 환경 |
| 12 | **유지보수 활성도** | Supabase 지속 개발 | Snyk·Tinder 사용 | 소규모이나 활발 | Prisma 부속 | **낮음** |

---

## 2. 10차원 × 5후보 스코어링 매트릭스 (메인 테이블)

| 차원 | 가중치 | splinter 포팅 | squawk | schemalint | Prisma Lint | pglint |
|------|--------|--------------|--------|------------|-------------|--------|
| **FUNC** | 18% | 4.0 | 4.5 | **4.5** | 3.0 | 3.0 |
| **PERF** | 10% | 4.0 | **5.0** | 4.0 | **5.0** | 3.5 |
| **DX** | 14% | 3.5 | **5.0** | 4.0 | 4.0 | 2.5 |
| **ECO** | 12% | 4.5 | 4.0 | 3.5 | 3.5 | 2.5 |
| **LIC** | 8% | **5.0** | 4.5 | **5.0** | **5.0** | **5.0** |
| **MAINT** | 10% | 3.5 | 4.0 | **4.5** | **4.5** | 2.0 |
| **INTEG** | 10% | 4.0 | 4.5 | 4.5 | **5.0** | 2.5 |
| **SECURITY** | 10% | **4.5** | 4.0 | 3.0 | 2.5 | 3.0 |
| **SELF_HOST** | 5% | **5.0** | 4.5 | **5.0** | **5.0** | 3.5 |
| **COST** | 3% | **5.0** | **5.0** | **5.0** | **5.0** | **5.0** |
| **가중 합계** | 100% | **3.95** | **4.00** | **4.42** | **2.90** | **2.80** |

*Prisma Lint는 Prisma Schema에만 한정되어 PostgreSQL 런타임·SQL DDL 미검사 → FUNC·SECURITY 하락. pglint는 최근 1년 커밋 ↓, 문서 빈약.*

---

## 3. 책임 매트릭스 (시점 × 검사 대상)

3-Layer Advisor의 핵심 — **서로 겹치지 않게 책임을 배정**한다.

| 시점 ↓ \ 대상 → | Prisma Schema | Migration SQL | Runtime DB | 운영 메트릭 |
|------------------|----------------|----------------|------------|--------------|
| **Design (pre-commit)** | **Prisma Lint** (naming, deprecation) | **squawk** (위험 DDL) | — | — |
| **CI (PR)** | Prisma Lint | **squawk** | **schemalint** (shadow DB) | — |
| **Schedule (weekly)** | — | — | **schemalint** (prod) | — |
| **Schedule (daily)** | — | — | **splinter** (SECURITY 15 / PERF 13 / MAINT 10) | **splinter** |
| **Manual (ad-hoc)** | Prisma Lint | squawk | schemalint + splinter | splinter |

**해석:** 같은 "룰"이라도 시점이 다르면 도구도 다름. 예) "index on FK" 같은 개념은 schemalint(디자인)과 splinter(런타임)에 중복 수록되지만 **"언제 잡는가"**가 다른 가치. Prisma Lint는 schema.prisma 레벨의 초기 방어만 담당.

---

## 4. 룰 카탈로그 분포 매트릭스

### 4.1 카테고리별 룰 수

| 카테고리 | splinter | squawk | schemalint | Prisma Lint | 합계 (중복 제거 후) |
|----------|----------|--------|------------|-------------|----------------------|
| **Security** | 15 | 3 (DROP류) | 2 (RLS enforcement) | 1 (권한 네이밍) | ~18 (중복 3) |
| **Performance** | 13 | 5 (CONCURRENTLY류) | 3 (index, type) | 1 | ~18 (중복 4) |
| **Maintenance** | 10 | 8 (rename, drop) | 5 (convention) | 3 (unused) | ~22 (중복 4) |
| **Safety (DDL lock)** | 0 | 8 | 0 | 0 | 8 (squawk 독점) |
| **Convention (naming/casing)** | 0 | 0 | 10+ | 3 | ~13 (schemalint 주도) |
| **총계 (중복 포함)** | 38 | 24 | 25+ | ~10 | ~97 → 중복 제거 후 ~80 룰 |

### 4.2 중복·상보 맵 (대표 예시)

| 개념 | splinter | squawk | schemalint | 대표 결정 |
|------|----------|--------|------------|-----------|
| FK에 인덱스 없음 | 0006 unindexed_foreign_keys | — | index-foreign-keys | 둘 다 유지 (시점 다름) |
| 타임존 미지정 timestamp | — | prefer-timestamptz | prefer-timestamptz-to-timestamp | squawk+schemalint 둘 다 |
| Column rename 위험 | — | renaming-column | — | squawk 독점 (DDL 판단) |
| RLS 미활성 | 0001 rls_disabled_in_public | — | — | splinter 독점 (런타임 상태) |
| 테이블명 casing | — | — | name-casing | schemalint 독점 |
| 비밀번호 정책 | 0011 | — | — | splinter (설정 상태) |

**원칙:** 중복은 시점이 다를 때만 허용. 동일 시점 중복은 룰 중 하나를 disable.

---

## 5. CI/CD 통합 매트릭스

### 5.1 파이프라인 단계별 책임

```
[Developer Laptop]
  ├─ IDE 저장 시 (vscode extension)
  │   └─ Prisma Lint: schema.prisma 문법·컨벤션 즉시 피드백
  │
  ├─ `prisma migrate dev` 실행 시
  │   └─ squawk (pre-commit hook): 신규 migration.sql 위험 DDL
  │
  └─ git commit
      └─ squawk pre-commit hook: ERROR 있으면 차단

[CI — Pull Request]
  ├─ GitHub Actions workflow `advisors.yml`
  │   ├─ Job: prisma-lint    → Prisma Lint
  │   ├─ Job: squawk         → 신규 SQL 파일 대상
  │   ├─ Job: schemalint     → shadow DB로 migrate deploy 후 state 검사
  │   └─ Job: splinter (opt) → preview DB 또는 스테이징
  │
  └─ PR Comment: 결과 집계 + 심각도별 배지

[CI — Post-merge]
  ├─ 배포 후 splinter --quick 실행
  └─ Slack #advisors 채널에 결과 post

[Schedule — Daily 03:00 KST]
  └─ cron 트리거 → splinter 전체 38룰 on 프로덕션 DB
      └─ 새로운 ERROR diff → Slack 알림

[Schedule — Weekly Sun 03:00 KST]
  └─ schemalint 프로덕션 DB
      └─ 컨벤션 위반 누적 리포트
```

### 5.2 차단 정책 매트릭스 (PR 병합 가능 여부)

| 검사 결과 | PR 병합 | Slack 알림 | 대응 |
|-----------|---------|-----------|------|
| squawk ERROR | **차단** | #advisors | DDL 수정 필수 |
| squawk WARN | 허용 (리뷰어 판단) | #advisors (요약) | 논의 or override |
| schemalint ERROR | **차단** | #advisors | 컨벤션 수정 |
| schemalint WARN | 허용 | — | 주간 다이제스트 반영 |
| splinter ERROR (런타임) | 허용 (이미 반영됨) | **즉시 #alerts** | 운영자 수동 대응 |
| splinter WARN/INFO | 허용 | 일일 다이제스트 | 스프린트 백로그 |
| Prisma Lint 위반 | 허용 (빌드만 경고) | — | 컨벤션 합의 후 ERROR 승격 |

---

## 6. 언어·런타임 비용 매트릭스

| 항목 | splinter 포팅 | squawk | schemalint | Prisma Lint | pglint |
|------|---------------|--------|------------|-------------|--------|
| 런타임 | Node (TS) | Rust binary | Node (TS) | Node (TS) | Python |
| 설치 | npm (프로젝트 내) | 바이너리 다운로드 | npm | 이미 존재 | pip |
| 이미지 추가 | 없음 | ~10MB | 없음 | 없음 | Python 런타임 |
| CI 설치 시간 | 0 (번들) | <5s | 0 | 0 | ~30s |
| 로컬 의존성 | Postgres 라이브 | 없음 | shadow DB | 없음 | Postgres |
| 크로스플랫폼 | ○ | Linux/macOS/Win | ○ | ○ | ○ |
| 유지보수 언어 경험 | TS 1급 (우리 스택) | Rust 학습 필요 | TS | TS | Python 학습 |

**결론:** Rust binary 1개만 추가로 감당 가능. splinter 포팅·schemalint·Prisma Lint는 모두 **TS 생태계 안** → 우리 1인 유지보수 부담 최소.

---

## 7. 보안 커버리지 매트릭스 (가중 2×)

SECURITY 차원은 Advisors 가치의 핵심. 세부 분해:

| 보안 위협 | splinter | squawk | schemalint | Prisma Lint | 우리 기본값 |
|-----------|----------|--------|------------|-------------|-------------|
| RLS 비활성 테이블 | ✓ (0001) | — | — | — | splinter |
| 정책은 있으나 RLS off | ✓ (0007) | — | — | — | splinter |
| SECURITY DEFINER view | ✓ (0008) | — | — | — | splinter |
| auth.users 노출 | ✓ (0003) | — | — | — | splinter |
| 비밀번호 정책 약함 | ✓ (0011) | — | — | — | splinter |
| MFA 옵션 부족 | ✓ (0014) | — | — | — | splinter |
| extension in public | ✓ (0010) | — | — | — | splinter |
| function search_path | ✓ (0009) | — | — | — | splinter |
| 위험 DDL 직접 실행 | — | ✓ (8룰) | — | — | squawk |
| Migration에 DROP TABLE | — | ✓ (ban-drop-*) | — | — | squawk |
| UNIQUE + nullable | — | — | ✓ | — | schemalint |
| FK 인덱스 누락 | ✓ (0006) | — | ✓ (index-fk) | — | schemalint + splinter |
| JSON 대신 JSONB | — | — | ✓ | — | schemalint |
| 컬럼 rename 호환성 깨짐 | — | ✓ | — | — | squawk |
| PITR 비활성 | ✓ (0015) | — | — | — | splinter |

**빈 슬롯:** 위 표의 "✗" 조합은 현재 무방어. 100점 달성 시 전부 채워야 함.

---

## 8. 3-Layer Advisor 통합 설계

### 8.1 구조

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1: Design-time (Pre-commit / IDE)                  │
│  ┌──────────────┐   ┌─────────────────────┐              │
│  │ Prisma Lint  │   │ squawk (hook)       │              │
│  │ schema.prisma│   │ migration.sql       │              │
│  └──────────────┘   └─────────────────────┘              │
│         ↓ 차단 강도: pre-commit ERROR → block             │
└───────────────────┬──────────────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────────────┐
│  Layer 2: CI-time (Pull Request)                         │
│  ┌──────────────┐   ┌──────────────────┐                 │
│  │ squawk PR    │   │ schemalint       │                 │
│  │ job          │   │ shadow DB job    │                 │
│  └──────────────┘   └──────────────────┘                 │
│         ↓ 차단 강도: GH Actions fail → merge block       │
└───────────────────┬──────────────────────────────────────┘
                    │ merge + deploy
                    ▼
┌───────────────────▼──────────────────────────────────────┐
│  Layer 3: Runtime (Post-deploy + Schedule)               │
│  ┌──────────────────────────────────────────┐            │
│  │ splinter (daily 03:00 KST cron)          │            │
│  │  - SECURITY 15, PERF 13, MAINT 10         │            │
│  │  - Diff since last run → Slack alert     │            │
│  │ schemalint (weekly, prod DB)             │            │
│  │  - 컨벤션 drift 모니터                      │            │
│  └──────────────────────────────────────────┘            │
└───────────────────────────────────────────────────────────┘
```

### 8.2 점수 기여 맵 (65 → 100)

| Layer | 담당 도구 | 현재 | Phase A | Phase B | Phase C | 최종 |
|-------|-----------|------|---------|---------|---------|------|
| 1 Design | Prisma Lint + squawk hook | 15 | 20 | 20 | 20 | 20 |
| 2 CI | squawk + schemalint (shadow) | 10 | 20 | 30 | 30 | 30 |
| 3 Runtime | splinter (기존 8룰) | 40 | 40 | 40 | 50 | 50 |
| **합계** | | **65** | **80** | **90** | **100** | **100** |

Phase A (2주): squawk pre-commit + schemalint CI 도입 (+15)
Phase B (2주): schemalint shadow DB + 사내 룰 5개 (+10)
Phase C (4주): splinter P0 보안 5룰 + P1 성능 5룰 포팅 (+10) → 총 80h

---

## 9. 사내 룰 추가 후보 (양평 부엌 도메인)

### 9.1 schemalint 측 (컨벤션)

| ID | 룰 | 의도 |
|----|-----|------|
| yp-money-bigint | price/amount/total은 bigint | 금액 overflow 방지 |
| yp-soft-delete-pair | deleted_at 있으면 deleted_by 필수 | 감사 추적 |
| yp-tenant-id-required | 테넌트 구분 컬럼 강제 | 권한 누수 방지 |
| yp-audit-immutable | audit_log 트리거 존재 | 변조 방어 |
| yp-enum-uppercase | Prisma enum 대문자 | 컨벤션 |

### 9.2 splinter 측 (런타임 도메인)

| ID | 룰 | 의도 |
|----|-----|------|
| yp-001 menu_price_zero | 메뉴 가격 0 이하 | 데이터 이상 |
| yp-002 order_orphan | kitchenId 끊긴 주문 | 참조 무결성 |
| yp-003 staff_no_role | role NULL 직원 | 권한 버그 |
| yp-004 session_old | 90일+ 미접속 active | 세션 정리 |
| yp-005 webhook_inactive | 30일+ 미사용 webhook | 청소 |

---

## 10. 도구 선정 근거 요약

### 10.1 왜 3-Layer 모두 필요한가

| 시나리오 | Layer 1만 | Layer 1+2 | Layer 1+2+3 (3-Layer) |
|----------|-----------|-----------|------------------------|
| 신규 컬럼 NOT NULL 실수 추가 | IDE에서 즉시 경고 | CI에서 차단 | 차단 |
| 프로덕션 RLS 비활성 테이블 | **못 잡음** | **못 잡음** | 일일 cron으로 감지 |
| extension 버전 노후화 | **못 잡음** | **못 잡음** | MAINT 0040 감지 |
| n+1 쿼리 패턴 | 못 잡음 | 못 잡음 | pg_stat_statements + splinter |
| 컬럼명 userId → user_id | schemalint rule | schemalint CI | 지속 모니터 |

→ **런타임 상태 검사는 Layer 3만의 고유 역할**. Layer 1·2가 아무리 강해도 놓치는 영역 존재.

### 10.2 왜 Prisma Lint는 보조재인가

- 장점: Prisma schema만 보면 되니 빠르고 0 비용
- 한계:
  - SQL DDL은 검사 못함 (migration.sql은 Prisma 밖에서 생성 후 편집 가능)
  - 런타임 DB 상태(PG dictionary) 접근 불가
  - RLS·정책·인덱스 존재 여부 미확인
- **역할:** schema.prisma의 초기 문법·네이밍 방어. **SECURITY·PERFORMANCE 룰은 다른 도구에 위임.**

### 10.3 왜 pglint는 제외인가

- 최근 1년 release 적음 (활성도 ↓)
- Python 런타임 추가 부담
- splinter(Supabase 커뮤니티 후광) 대비 룰 수·품질 낮음
- 우리 스택(Node/TS)과 이질적 → 유지보수 부담 ↑

→ **reference 용도로만 문서에 기록, 실운영 도입 안 함.**

---

## 11. 모니터링 & 알림 매트릭스

| 도구 | 알림 채널 | 심각도 처리 | dedupe 정책 |
|------|-----------|------------|-------------|
| splinter | #advisors (일일) + #alerts (신규 ERROR 즉시) | ERROR 즉시 / WARN 일일 / INFO 주간 | cacheKey 동일 시 mute 가능 |
| squawk | PR comment + GH check | ERROR block / WARN 허용 | PR 단위 자연 dedupe |
| schemalint | PR comment + 주간 #advisors | ERROR block / WARN 다이제스트 | 동일 |
| Prisma Lint | IDE + 빌드 로그 | 설정 (default: warning) | 빌드 단위 |

### 11.1 알림 다이제스트 예시

```
[양평 부엌 Advisors] 2026-04-19 일일 리포트

━━━ Layer 3 Runtime (splinter) ━━━
🔴 ERROR (1 신규)
  • rls_disabled_in_public: Table `public.menu_price_history` — RLS not enabled.
    [해결 →] docs/guides/rls-enable.md

🟡 WARN (3건, 1 신규)
  ▸ NEW multiple_permissive_policies on `public.orders`
  ▸ vacuum_overdue on `public.audit_log` (8일)
  ▸ slow_query: ORDER BY created_at DESC (1240ms avg)

━━━ Layer 2 CI (주간 schemalint) ━━━
📘 컨벤션 drift 2건
  • public.menu_v2.userId (should be user_id)
  • public.session.userAgent (should be user_agent)

━━━ Layer 1 Design (pre-commit) ━━━
(지난 7일 squawk pre-commit에서 12건 차단됨 — 사용자가 수정 후 재커밋)
```

---

## 12. 운영 시나리오별 추천

| 시나리오 | 권장 구성 | 이유 |
|---------|-----------|------|
| MVP (현재) | splinter 8룰 유지 + squawk + Prisma Lint | 최소 CI 비용, 위험 DDL 즉시 차단 |
| Phase A | + schemalint (shadow DB) | 컨벤션 drift 방지 |
| Phase B | + splinter P0 보안 5룰 | RLS·security_definer 런타임 커버 |
| Phase C | + splinter P1 성능 5룰 + 사내 룰 10개 | 100점 경로 |
| 장기 | 3-Layer 전체 + custom rule 확장 | 유지보수 |

---

## 13. Wave 2 DQ (다음 라운드)

1. **DQ-AD-1:** SQLite → Postgres 마이그레이션 전에 splinter P0 룰 중 SQLite 적용 가능한 것 먼저 포팅할지?
2. **DQ-AD-2:** squawk WARN에 대한 합의 — ERROR 승격 정책 (매 6개월 팀 리뷰?)
3. **DQ-AD-3:** schemalint 사용자 룰의 unit test fixture — pgsql-ast-parser vs 실제 shadow DB?
4. **DQ-AD-4:** splinter cron이 프로덕션 DB에 부담 주는지 측정 방법 (pg_stat_statements 분석)
5. **DQ-AD-5:** 3-Layer 통합 UI를 `/advisors` 단일 페이지에서 제공 vs 탭 분리?
6. **DQ-AD-6:** PR 자동 코멘트 포맷 — 사람 친화 vs 기계 파싱?
7. **DQ-AD-7:** Prisma Lint 커스텀 룰 작성 실익 — 학습 비용 vs 동일 룰을 schemalint로 작성?

---

## 14. 최종 판정 요약

| 순위 | 도구 | 가중점수 | 역할 | Phase |
|------|------|---------|------|-------|
| 1 | **schemalint** | 4.42 | Layer 2 컨벤션 (CI shadow DB + 주간 cron) | Phase A |
| 2 | **squawk** | 4.00 | Layer 1·2 DDL 안전 (pre-commit + PR) | Phase A |
| 3 | **splinter (포팅)** | 3.95 | Layer 3 런타임 38룰 (일일 cron + 알림) | Phase B·C |
| 4 | Prisma Lint | 2.90 | 보조 — schema.prisma 초기 방어만 | 기존 유지 |
| 5 | pglint | 2.80 | 참고 — 운영 도입 없음 | (제외) |

**3-Layer 통합:** 65/100(현재) → **100/100(Phase C 완료)** · 총 공수 80h (Wave 1 결론 승계)

**핵심 원칙 재확인:**
- 같은 개념이라도 **시점이 다르면 도구가 다름**
- 중복 허용은 "시점 다른 경우만" (예: FK 인덱스 → schemalint + splinter)
- PR 차단은 ERROR만, WARN은 다이제스트
- 런타임 상태는 오직 splinter만 가능 — 대체 불가

---

**문서 끝.** (매트릭스 결론: 3-Layer · 시점 분리 · schemalint>squawk>splinter>Prisma Lint>pglint 순 가치.)
