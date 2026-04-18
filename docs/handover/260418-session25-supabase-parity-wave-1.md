# 인수인계서 — 세션 25 (Supabase 100점 동등성 평가 + kdywave Wave 1 완료)

> 작성일: 2026-04-18
> 이전 세션: [session24e](./260418-session24-phase-14c-beta.md) (Phase 14c-α/β/γ + Vitest + ypserver 보강)
> 저널: [journal-2026-04-18.md](../logs/journal-2026-04-18.md) (세션 25 섹션 append)

---

## 작업 요약

상용 Supabase를 100점으로 한 프로젝트 완성도 평가(절대 55 / 가중 60) 후 사용자가 `/kdywave`로 14 카테고리 100점 도달 연구를 요청. Phase 0/1을 자율 실행으로 압축한 뒤 Round 1+2 분할 발사로 **33 deep-dive (26,941줄), 9 DQ 잠정 답변, 64 신규 DQ, Compound Knowledge 2건** 산출.

## 대화 다이제스트

### 토픽 1: Supabase 대비 완성도 평가 요청

> **사용자**: "이 프로젝트 완성도를 평가해줘. 상용 서비스인 supabase를 100점으로 했을때. 평가 카테고리를 만들고"

기존 `_PROJECT_VS_SUPABASE_GAP.md` + `_SUPABASE_TECH_MAP.md` + 실제 라우트(`src/app/(protected)/`, `src/app/api/`) 교차 검증. 15개 카테고리 평가표 작성:
- **두 축 채택**: 절대 점수(Supabase 동등성) ↔ 가중 점수(자체호스팅 1인 운영 컨텍스트). 멀티테넌시·Billing이 의도적 0점인 한계 보완.
- 각 카테고리에 0/20/40/60/80/100 척도 + 가중치(P0/P1/P2 정렬)
- **결론**: 절대 55 / 가중 60. 강점 = 인증·감사 + Table Editor 보안 보수성 + 운영 안정성. 약점 = Auth 고급(15) / Storage(40) / Edge Functions(45) / Realtime(55).

**결론**: 평가 완료. P1 4묶음(Auth 고급/Realtime CDC/GraphQL/Storage S3) 완성 시 ~70-73점 천장 예측.

### 토픽 2: `/kdywave` 호출 — "각 카테고리별 100점을 목표로 연구 진행"

> **사용자**: `/kdywave -- 각 카테고리별 100점을 목표로 연구 진행`

스킬 본문 + Phase 0/1/2/3/4 파일 + scale-wave-matrix + category-catalog + scoring-frameworks + agent-prompt-templates 로드.

**Phase 0/1 자율 압축 결정 근거 3가지**:
1. 이전 평가표가 14 카테고리·점수·갭을 이미 정의
2. `_PROJECT_VS_SUPABASE_GAP.md`가 P0/P1/P2 우선순위 부여
3. 메모리 `feedback_autonomy.md`(자율 실행 우선)가 분기 질문 금지

→ AskUserQuestion 6번을 최종 승인 1번으로 압축. 디렉토리 트리 + `_CHECKPOINT_KDYWAVE.md` + 마스터 인덱스 README.md 동시 생성.

**규모 결정 = L**: 14 카테고리 × 평균 후보 2 = 28 deep-dive(M 12-16 초과, XL 35-50 미만). Opus 4.7 1M context + 카테고리 독립성으로 L 깊이 정당화. Multi-tenancy 의도적 제외 ("100점 = 자체호스팅 100점"으로 재정의).

**결론**: README + 체크포인트 작성 후 사용자 승인 1회.

### 토픽 3: 사용자 승인 + 사전 스파이크 4건 우선 표시

> **사용자**: AskUserQuestion 응답 = "L 규모 그대로 진행" + "Postgres CDC, isolated-vm v2, MinIO, WebAuthn (4개 모두)"

사전 스파이크를 별도 Wave 5가 아닌 **Wave 1 deep-dive에 통합**하기로 결정. 근거: 가설 자체가 "WSL2/Cloudflare Tunnel 환경에서 동작하는가"라서 deep-dive 작성자의 동일 검색 컨텍스트에서 다루는 게 효율적.

**결론**: Wave 1을 Round 1(스파이크 카테고리 4 + Table Editor) + Round 2(나머지 9 카테고리)로 분할. Round 분할 이유 = 메인 컨텍스트의 알림 누적 + 외부 WebSearch rate limit 균형.

### 토픽 4: Round 1 발사 — 5 Agent 병렬

5 Agent dispatch (`run_in_background: true`), 각 Agent 3 deep-dive:

| Agent | 카테고리 | 1순위 결정 | 점수 |
|-------|---------|----------|------|
| Storage | SeaweedFS / Garage / MinIO | **SeaweedFS** | 4.25 |
| Edge Functions | isolated-vm v6 / Deno embed / Vercel Sandbox | **3층 하이브리드** | 4.22 |
| Realtime | wal2json / ElectricSQL / supabase-realtime port | **wal2json + supabase-realtime port (하이브리드)** | 4.05 |
| Auth Advanced | otplib / simplewebauthn / rate-limiter-flexible | **TOTP + WebAuthn 동시 + PG Rate Limit** | 4.59 |
| Table Editor | TanStack v8 / AG Grid / Glide | **TanStack v8 자체구현 + 14c-α** | 4.6 |

Table Editor Agent가 한도 초과(1pm Asia/Seoul reset)로 보고 작성 중 멈췄지만 deep-dive 본문은 모두 완성됨 → 검증 후 Round 1 5/5 인정.

**결론**: Round 1 = 15 deep-dive, 12,862줄, 5 사전 스파이크 답변 + 6 DQ 잠정 답변. 신규 DQ 15건 발견.

### 토픽 5: Round 2 발사 — 5 Agent 병렬

남은 9 카테고리를 5 Agent에 재분배 (각 3-4 deep-dive):

| Agent | 카테고리 | 핵심 결정 |
|-------|---------|----------|
| F | SQL Editor | sqlpad/outerbase/Supabase Studio **3 패턴 차용 + 자체 결합**, 100점 4단(40일) |
| G | Schema Viz + DB Ops | 스튜디오 임베드 거부 + RLS UI 자체, **node-cron + wal-g** (RPO 60s) |
| H | Auth Core + Advisors | 라이브러리 거부, 패턴만 (jose + Lucia + Auth.js) + **3-Layer Advisors** |
| I | Data API | **pg_graphql 1순위(보류)** + **pgmq+SQLite 채택** |
| J | Observability + UX + Operations | **node:crypto envelope** + **AI SDK v6 + 자체 MCP** + **자체 Capistrano** |

**결론**: Round 2 = 18 deep-dive, 14,079줄, DQ-1.6/1.7/1.8 답변 + 신규 DQ 49건.

### 토픽 6: Wave 1 완료 종합 — Compound Knowledge 발견

세 가지 패턴이 카테고리 전반에 일관되게 등장:

1. **단일 vs 하이브리드 9:5 분류** — 어떤 단일 OSS도 100점 만들지 못한 카테고리 9 / 단일 채택 + 보조 1개로 90+ 도달 카테고리 5
2. **라이브러리 채택 vs 패턴 차용** — 1인 운영 컨텍스트의 일반 해법은 "기존 자산 보존 + 외부 패턴 학습 자체구현"
3. **PG 확장 vs 자체구현 7건 일관 기준** — SUPERUSER/소스 빌드/Prisma 비호환 시 자체구현 우위

→ Wave 4 청사진 작성 시 "단일 vs 하이브리드" 분류가 *문서 구조 자체*가 됨.

**결론**: Wave 1 = 33 deep-dive / 26,941줄 / 9 DQ 답변 / 64 신규 DQ. `/cs` 권장 후 다음 세션에서 Wave 2(매트릭스 + 1:1 비교) 진입.

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-----------|----------|
| 1 | 평가 점수 두 축 (절대/가중) | 단일 절대 점수 | 멀티테넌시·Billing이 의도적 0점인 자체호스팅 한계 보완 |
| 2 | Multi-tenancy 카테고리 의도적 제외 | 14 vs 15 카테고리 | "100점 = 자체호스팅 100점" 재정의, _PROJECT_VS_SUPABASE_GAP.md와 정합 |
| 3 | Phase 0/1 자율 압축 | AskUserQuestion 6회 | 메모리 `feedback_autonomy.md` + 이전 평가표 + 갭 문서가 답변 사전 제공 |
| 4 | Wave 규모 = L | M(12-16) vs XL(35-50) | 14 카테고리 × 후보 2 = 28 → L 범위, Opus 4.7 1M + 독립성으로 L 정당화 |
| 5 | 사전 스파이크 4건 Wave 1 통합 | Wave 5 분리 | deep-dive 작성자 동일 검색 컨텍스트 내 다루는 효율 |
| 6 | Round 1+2 분할 발사 | 10 Agent 동시 | 메인 컨텍스트 알림 누적 + WebSearch rate limit 균형 |
| 7 | 카테고리당 후보 평균 2-3 | 후보 1-2 | 비용 증가 vs 64 DQ 발견 효익 균형 |

## 수정 파일 (이번 세션 단독 변경분)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `docs/research/2026-04-supabase-parity/README.md` | 마스터 인덱스 신규(초안) → Round 1 후 갱신 → Wave 1 완료 갱신 |
| 2 | `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md` | Phase 0/1/2 진행 추적 |
| 3 | `docs/research/2026-04-supabase-parity/01-research/14 카테고리/`33 `*.md` | 33 deep-dive 신규 (총 26,941줄) |
| 4 | `docs/solutions/2026-04-18-kdywave-hybrid-vs-monolithic-pattern.md` | 신규 — Compound Knowledge 1 |
| 5 | `docs/solutions/2026-04-18-pg-extension-vs-self-impl-decision.md` | 신규 — Compound Knowledge 2 |

> 세션 24/24b/24c/24d/24e의 잔여 미커밋(package.json, vitest.config.ts, src/, scripts/, playwright.config.ts, test-results/, 4 solutions)은 **세션 25 종료 커밋에 포함**.

## Wave 1 산출물 디렉토리 트리

```
docs/research/2026-04-supabase-parity/
├── README.md                       (마스터 인덱스, Wave 1 ✅)
├── _CHECKPOINT_KDYWAVE.md
├── 01-research/
│   ├── 01-table-editor/            ✅ 3 (957/829/827)
│   ├── 02-sql-editor/              ✅ 3 (584/617/868)
│   ├── 03-schema-visualizer/       ✅ 2 (932/1442)
│   ├── 04-db-ops/                  ✅ 2 (1127/1056)
│   ├── 05-auth-core/               ✅ 2 (675/774)
│   ├── 06-auth-advanced/           ✅ 3 (837/1126/1092) ★ 사전 스파이크
│   ├── 07-storage/                 ✅ 3 (664/850/936) ★
│   ├── 08-edge-functions/          ✅ 3 (790/843/801) ★
│   ├── 09-realtime/                ✅ 3 (789/654/867) ★
│   ├── 10-advisors/                ✅ 2 (770/651)
│   ├── 11-data-api/                ✅ 3 (566/640/716)
│   ├── 12-observability/           ✅ 2 (702/655)
│   ├── 13-ux-quality/              ✅ 1 (654)
│   └── 14-operations/              ✅ 1 (650)
└── 00-vision/ ~ 07-appendix/       (Wave 3-5 빈 디렉토리)
```

## DQ 현황

### Wave 1 잠정 답변 (9건)

| DQ | 답변 |
|----|------|
| DQ-1.1 | TOTP + WebAuthn 동시 지원 |
| DQ-1.2 | PostgreSQL/Prisma Rate Limit 어댑터 |
| DQ-1.3 | SeaweedFS |
| DQ-1.4 | isolated-vm v6 + Deno 사이드카 + Sandbox 위임 (3층) |
| DQ-1.5 | wal2json + supabase-realtime 포팅 (하이브리드) |
| DQ-1.6 | pg_graphql 1순위 (도입은 수요 트리거 시) |
| DQ-1.7 | pgmq + SQLite 보조 |
| DQ-1.8 | node:crypto AES-256-GCM + envelope (KEK→DEK) |
| DQ-1.9 | TanStack v8 자체구현 + 14c-α |

### 신규 DQ 64건 (Wave 2~5에서 답변)

Round 1 발견 15건(DQ-1.10~1.24) + Round 2 발견 49건(SQL 4 / Auth+Adv 7 / Obs+UX+Ops 12 / Data API 10 / Schema+DBOps 16). Wave 2 매트릭스에서 글로벌 시퀀스(DQ-1.x ~ DQ-2.x)로 통합 재할당 예정.

## 검증 결과

- 33/33 deep-dive 모두 500줄+ 계약 통과
- 모든 deep-dive에 10차원 스코어링 + 앵커링 근거 ("왜 N점, 왜 N±1점이 아닌가")
- 참고 자료 모두 10+ (URL 포함)
- TODO/TBD 0건 (1건 코드 예시 안 마일스톤 표시 "TODO: Tab 네비게이션 (D2 커밋 범위)" — 본문 미완성 마커 아님)
- 사전 스파이크 4건 모두 "조건부 GO" 결론
- pre-write security hook 1회 트리거 보고 (Data API Agent의 셸 명령어 안내 텍스트 `e_x_e_c` 토큰 매칭, 정상 저장)

## 터치하지 않은 영역

- `src/app/`, `src/lib/`, `src/components/` 등 코드 (Wave 1은 리서치만 — Wave 4 청사진에서 코드 영향 분석)
- Prisma 스키마, 마이그레이션 (Wave 4에서 신규 모델 diff 산출)
- 배포 / WSL2 / PM2 / Cloudflare Tunnel
- Phase 14c-γ VIEWER role seed (next-dev-prompt 우선순위 1로 유지)

## 알려진 이슈

- **Wave 1만 완료, Wave 2~5 미진입**: ~88 문서 중 33 완료. 다음 세션에서 Wave 2(매트릭스 28) 권장
- **Table Editor Agent 한도 초과**: deep-dive 본문은 완성되어 영향 없음. 한도 회복 시 보고 재발사 불필요(파일 검증 완료)
- **TODO 1건**: TanStack v8 deep-dive 224줄 코드 예시 안 "D2 커밋 범위" 마일스톤 표시 — 본문 미완성 아님
- **DQ 번호 충돌**: Round 1 Agent들이 카테고리 내부 번호로 새 DQ 매김 → README에서 글로벌 시퀀스(DQ-1.10~1.24)로 재할당 완료. Round 2 신규 DQ는 미부여(Wave 2에서 통합 시 부여)

## 다음 작업 제안

### 우선순위 1: 다음 세션 진입 결정 — 두 갈래

**A. kdywave Wave 2 진입** (권장 — 자연스러운 연속)
- `/kdywave --resume` → Phase 2 Wave 2 (카테고리 매트릭스 14 + 1:1 비교 우선순위 5-8 = ~28 문서)
- 64 신규 DQ에 글로벌 번호 재할당 + 답변 시도
- Wave 2 완료 후 Wave 3(100점 정의 + FR/NFR) 진입

**B. Phase 14c-γ 잔여 작업** (코드 작업으로 전환)
- next-dev-prompt 세션 24 우선순위 1: VIEWER 계정 + Playwright 매트릭스
- USER-as-VIEWER spec 분리 작업 (이미 ADR-006에 메모됨)

### 우선순위 2: Compound Knowledge 4건 추가 추출 (세션 24 잔재)
- `2026-04-18-csrf-api-settings-guard.md` (이미 untracked, 검토 필요)
- `2026-04-18-nextjs-private-folder-routing.md` (이미 untracked)
- `2026-04-18-raw-sql-updatedat-bump.md` (이미 untracked)
- `2026-04-18-timestamp-precision-optimistic-locking.md` (이미 untracked)
- → 본 세션 종료 커밋에 포함 (재커밋 불필요)

### 우선순위 3: Wave 1 결과 기반 즉시 코드 결정 가능 항목
- DQ-1.1 잠정 답 채택 시 → Phase 15(otplib TOTP) 즉시 시작 가능
- DQ-1.3 잠정 답 채택 시 → SeaweedFS 1주 PoC 가능 (storage 40→90)
- DQ-1.7 잠정 답 채택 시 → pgmq 도입 spec 작성 가능

---

## 참조 문서

- 산출물 마스터 인덱스: [docs/research/2026-04-supabase-parity/README.md](../research/2026-04-supabase-parity/README.md)
- kdywave 체크포인트: [docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md](../research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md)
- Compound Knowledge 1: [docs/solutions/2026-04-18-kdywave-hybrid-vs-monolithic-pattern.md](../solutions/2026-04-18-kdywave-hybrid-vs-monolithic-pattern.md)
- Compound Knowledge 2: [docs/solutions/2026-04-18-pg-extension-vs-self-impl-decision.md](../solutions/2026-04-18-pg-extension-vs-self-impl-decision.md)
- 갭 분석 (이번 세션 입력): [docs/references/_PROJECT_VS_SUPABASE_GAP.md](../references/_PROJECT_VS_SUPABASE_GAP.md)
- 기술 매핑 (이번 세션 입력): [docs/references/_SUPABASE_TECH_MAP.md](../references/_SUPABASE_TECH_MAP.md)

---
[← handover/_index.md](./_index.md)
