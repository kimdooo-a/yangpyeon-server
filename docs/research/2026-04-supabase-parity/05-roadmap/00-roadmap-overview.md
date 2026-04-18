# 00. 로드맵 개요 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> **Wave 5 · R1 (Roadmap Lead) 산출물 1/3**
> 작성일: 2026-04-18 (세션 28, Wave 5 Tier 1)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [01-release-plan.md](./01-release-plan.md) · [02-milestones.md](./02-milestones.md) · [../00-vision/10-14-categories-priority.md](../00-vision/10-14-categories-priority.md) · [../02-architecture/00-system-overview.md](../02-architecture/00-system-overview.md) · [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md)

---

## 1. Executive Summary

### 1.1 한 줄 요약

**Phase 15(Alpha) → 22(GA) 까지 50주·870h에 걸쳐 14 카테고리 가중평균 60점 → 100점을 달성하고, 3년 TCO 기준 Supabase Cloud 대비 $950~2,150를 절감한다.**

### 1.2 핵심 수치

| 항목 | 값 | 근거 |
|------|-----|------|
| 총 기간 | **50주** (Wave 3 확정) | `00-vision/10-14-categories-priority.md §4.1` + 본 로드맵 §3 |
| 총 공수 | **~870h** (Wave 4 정밀 추정) | `_CHECKPOINT_KDYWAVE.md Wave 4 결과` (Wave 3 992h 대비 -10%) |
| 카테고리 | **14개** (하이브리드 9 + 단일 5) | `README.md Wave 1 Compound Knowledge` |
| Phase | **8단계** (Phase 15~22) | `00-vision/10-14-categories-priority.md §4.1` |
| 현재 가중평균 | **~60/100** | `00-vision/05-100점-definition.md` |
| 목표 가중평균 | **100/100** (Supabase Cloud 동등) | `00-vision/00-product-vision.md` |
| MVP 범위 | **Phase 15~17 (122h, 18주)** | `00-vision/10-14-categories-priority.md §7.1` |
| Beta 범위 | **Phase 18~19 (475h, +14주)** | 본 로드맵 §6 |
| GA 범위 | **Phase 20~22 (273h, +18주)** | 본 로드맵 §6 |
| 3년 TCO 절감 | **$950~2,150** | `00-vision/05-100점-definition.md §TCO 분석` |
| 운영 비용 | **$0~10/월** (Cloudflare 무료 + B2 $0.005/GB + AI ~$5/월) | `README.md` |
| DQ 완료율 | 48/64 (Wave 1~4), Wave 5에서 16건 해결 | `00-vision/07-dq-matrix.md §4` |

### 1.3 무엇이 새로운가 — Wave 4 대비 Wave 5 로드맵의 기여

Wave 1~4에서 카테고리별 기술 채택, 청사진, 공수가 확정됐다. Wave 5 로드맵은 이것을 **시간 축 위에 배치**하여 다음 4가지를 답한다.

1. **언제 무엇을 시작해야 하는가** — 50주 × Phase 15~22 캘린더 (본 문서 §3)
2. **릴리스를 어떻게 끊어 전달하는가** — Alpha/Beta/GA 3단계 + 세부 버전 (`01-release-plan.md`)
3. **마일스톤은 어디서 검증하는가** — 16 마일스톤 × 성공 기준 + 간트 차트 (`02-milestones.md`)
4. **Wave 5 잔여 DQ 16건을 언제 해결하는가** — Phase 연관 + 스파이크 연관 (본 문서 §9)

### 1.4 상위 문맥 연결

- **프로젝트 CLAUDE.md**: `E:\00_develop\260406_luckystyle4u_server\CLAUDE.md` — 양평 부엌 서버 대시보드 루트 문서
- **Supabase 100점 동등성 리서치 루트**: `docs/research/2026-04-supabase-parity/README.md`
- **체크포인트**: `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md`
- **다음 문서**: `docs/research/2026-04-supabase-parity/05-roadmap/01-release-plan.md` (R1 2/3 산출물)

---

## 2. 로드맵 메타

### 2.1 버전 규약 (Semantic Versioning)

본 프로젝트는 [Semantic Versioning 2.0.0](https://semver.org/) 을 채택한다. 형식은 `MAJOR.MINOR.PATCH[-PRE]`.

| 요소 | 의미 | 예 |
|------|------|----|
| MAJOR | 비호환 API 변경, 데이터 모델 파괴적 변경 | 1.0.0 (GA 진입) |
| MINOR | 하위 호환 기능 추가 (FR 단위) | 0.2.0 (Phase 16 완료) |
| PATCH | 하위 호환 버그 수정 | 0.1.1 (Phase 15 핫픽스) |
| PRE | `alpha.N` / `beta.N` / `rc.N` | 0.3.0-beta.1 |

### 2.2 릴리스 채널 (Capistrano-style)

ADR-015(Operations)에서 확정된 3-채널 배포 (`02-architecture/01-adr-log.md ADR-015`):

| 채널 | 도메인 | PM2 인스턴스 | 롤백 시간 |
|------|--------|-------------|----------|
| internal | `localhost:3000` (WSL2) | cluster:2 (개발) | 즉시 (fork) |
| canary | `canary.stylelucky4u.com` | cluster:2 | 5초 (symlink swap) |
| production | `stylelucky4u.com` | cluster:4 | 5초 (symlink swap) |

**롤오프 정책**: `internal 1일 → canary 3일(10% 트래픽) → canary 50% → production 100%`. 시간차 롤아웃은 Cloudflare Worker의 `cf-ray` 해시 기반 분기로 수행 (`04-integration/02-cloudflare-deployment-integration.md §Canary`).

### 2.3 피처 플래그 정책

LaunchDarkly 등 SaaS 플래그 서비스는 CON-9(비용 상한)로 비채택. **환경변수 토글 + Unleash 패턴 차용**이 Wave 2 D 매트릭스에서 확정됐다.

```bash
# /etc/luckystyle4u/secrets.env (root:ypb-runtime 0640)
FEATURE_MFA_WEBAUTHN=1        # Phase 15-B 활성화
FEATURE_SQL_AI_ASSIST=0       # Phase 18-γ 이후
FEATURE_REALTIME_PRESENCE=1   # Phase 19 활성화
FEATURE_PG_GRAPHQL=0          # ADR-016 수요 트리거 2+ 충족 시
```

플래그 카디널리티 정책: **Phase별 최대 5개**. 세션별 캐시 TTL 60초. Admin UI에서 토글 감사 로그 필수(`audit_logs`).

### 2.4 한국어 커밋 정책

프로젝트 루트 `CLAUDE.md`에 명시된 "주석/커밋 메시지 한국어" 규칙을 로드맵 기간 전체 유지. 커밋 메시지 포맷:

```
<타입>(<카테고리>): <Phase-세부> 요약

상세 변경 내역 (한국어)
- 무엇을 변경했는지
- 왜 변경했는지 (FR-X.Y / DQ-번호 / ADR-번호 인용)
```

타입: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `release`. 카테고리는 14 카테고리 중 하나 (auth-advanced, sql-editor 등).

### 2.5 릴리스 태그와 체크포인트

Phase 완료 시 Git 태그 생성:

```bash
git tag -a v0.1.0-alpha.1 -m "Phase 15 완료 - Auth Advanced MVP"
git tag -a v0.2.0-beta.1 -m "Phase 18 진입 - SQL Editor γ"
git tag -a v1.0.0 -m "Phase 22 완료 - 14 카테고리 100점 동등"
```

모든 태그는 `kdywave` 체크포인트 파일(`_CHECKPOINT_KDYWAVE.md`)의 `wave_N_completed` 필드 업데이트와 함께 생성.

---

## 3. 전체 타임라인 지도 (50주 텍스트 간트)

각 Phase는 `00-vision/10-14-categories-priority.md §4.1` 기간을 Wave 4 Blueprint 공수와 교차 검증 후 확정.

### 3.1 주 단위 텍스트 간트 차트

```
주차  0    4    8    12   16   20   24   28   32   36   40   44   48   50
     ┣━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━━━╋━━
P15  ████                                                                      Auth Advanced (22h, 4주) → 15→60
P16       ██████                                                               Obs + Ops (40h, 6주) → 65/80→85/95
P17             ████████                                                       Auth Core + Storage (60h, 8주) → 70/40→90/90
──── Alpha (MVP v0.3.0) ──────┤ 주차 18
P18                     ████████████████                                       SQL Ed + Table Ed (400h, 16주) → 70/75→100/100
P19                                     ████████                               Edge Fn + Realtime (75h, 8주) → 45/55→92/100
──── Beta (v0.5.0) ───────────────────────────────┤ 주차 42
P20                                             ████████                       Schema Viz + DB Ops + Advisors (198h, 6주) → 65/60/65→95/95/95
                                                      ↑ 겹침: P18 마무리 + P20 시작 (Week 38~42)
P21                                                     ████                   Data API + UX Quality (40h, 4주) → 45/75→85/95
P22                                                         ████               GA 마감 + 잔여 갭 (35h, 4주) → 전부 100
──── GA (v1.0.0) ──────────────────────────────────────────────────────┤ 주차 50
```

### 3.2 Phase 개요 (카테고리·공수·목표점수 요약)

| Phase | 기간(주) | 카테고리 | Wave 4 공수 | 현재→목표 | 릴리스 | 출처 |
|-------|--------|--------|-----------|---------|-------|------|
| **15** | 1~4 | Auth Advanced (6) | 22h | 15→60 | v0.1.0-alpha.1 | `03-auth-advanced-blueprint.md §12` |
| **16** | 5~10 | Observability (12) + Operations (14) | 40h (20+20) | 65/80→85/95 | v0.2.0-alpha.2 | `04-observability-blueprint.md §12` / `05-operations-blueprint.md §12` |
| **17** | 11~18 | Auth Core (5) + Storage (7) | 60h (30+30) | 70/40→90/90 | **v0.3.0 (Alpha/MVP)** | `06-auth-core-blueprint.md §11` / `07-storage-blueprint.md §13` |
| **18** | 19~34 | SQL Editor (2) + Table Editor (1) | 400h (320+80) | 70/75→100/100 | v0.4.0-beta.1 | `08-sql-editor-blueprint.md §13` / `09-table-editor-blueprint.md §11` |
| **19** | 35~42 | Edge Functions (8) + Realtime (9) | 75h (40+35) | 45/55→92/100 | **v0.5.0 (Beta)** | `10-edge-functions-blueprint.md §13` / `11-realtime-blueprint.md §12` |
| **20** | 38~44 (P18 후반 중첩) | Schema Viz (3) + DB Ops (4) + Advisors (10) | 198h (50+68+80) | 65/60/65→95/95/95 | v0.6.0-rc.1 | `12-schema-visualizer-blueprint.md §11` / `13-db-ops-blueprint.md §11` / `14-advisors-blueprint.md §10` |
| **21** | 45~46 | Data API (11) + UX Quality (13) | 40h (25+15) | 45/75→85/95 | v0.9.0-rc.2 | `15-data-api-blueprint.md §11` / `16-ux-quality-blueprint.md §12` |
| **22** | 47~50 | 잔여 갭 + 마이그레이션 + 하드닝 | ~35h | 전부 100 | **v1.0.0 (GA)** | `02-data-model-erd.md §마이그레이션` (35~39h) |

**합계**: 22 + 40 + 60 + 400 + 75 + 198 + 40 + 35 = **870h**

### 3.3 병렬 실행 윈도우

Wave 4 청사진에서 다음 3개 구간은 Phase 간 중첩 가능으로 확인됨 (의존성 없음):

| 중첩 구간 | 주차 | 이유 |
|---------|------|------|
| P16 Obs ∥ P16 Ops | 5~10 | 두 Blueprint가 L1 레이어 공유하지만 컴포넌트 독립 (`04-observability-blueprint.md §4` + `05-operations-blueprint.md §4`) |
| P17 Auth Core ∥ P17 Storage | 11~18 | L2 vs L4 레이어 (`00-system-overview.md §3.2`), 상호 의존 없음 |
| P18 후반 ∥ P20 시작 | 38~42 | Table Editor 완료(주차 34) 후 Schema Viz/Advisors가 즉시 착수 가능 (컴포넌트 재사용) |

1인 운영이므로 실제 병렬은 Context Switch 비용이 크다. **동일 주에 서로 다른 카테고리를 섞지 말고, 주 단위로 집중 전환**하는 것을 권장 (`05-operations-blueprint.md §1인 운영 원칙`).

---

## 4. 카테고리 → Phase 매핑 테이블

### 4.1 14 카테고리 전수표

근거: `00-vision/10-14-categories-priority.md §8` + `02-architecture/00-system-overview.md §3.1`

| # | 카테고리 | 현재점수 | 목표점수 | Phase | 카테고리 공수 | 채택 기술 (Wave 1 확정) | 근거 Blueprint |
|---|---------|--------|--------|-------|------------|---------------------|---------------|
| 6 | **Auth Advanced** ★ | 15 | 100 | 15 (→60) + 22 (→100) | 22h + (보너스 ~10h) | TOTP + WebAuthn + Rate Limit 동시 (ADR-007) | `03-auth-advanced-blueprint.md` |
| 12 | **Observability** | 65 | 85 | 16 | 20h | node:crypto envelope + jose JWKS ES256 (ADR-013) | `04-observability-blueprint.md` |
| 14 | **Operations** | 80 | 95 | 16 | 20h | Capistrano-style + PM2 cluster:4 (ADR-015) | `05-operations-blueprint.md` |
| 5 | **Auth Core** | 70 | 90 | 17 | 30h | jose JWT + Lucia/Auth.js 패턴 15개 차용 (ADR-006) | `06-auth-core-blueprint.md` |
| 7 | **Storage** ★ | 40 | 90 | 17 | 30h | SeaweedFS 단독 + B2 오프로드 (ADR-008) | `07-storage-blueprint.md` |
| 2 | **SQL Editor** | 70 | 100 | 18 | 320h (40일) | supabase-studio 패턴 + Outerbase + sqlpad 3중 흡수 (ADR-003) | `08-sql-editor-blueprint.md` |
| 1 | **Table Editor** | 75 | 100 | 18 | 80h | TanStack v8 + 14c-α 자체구현 (ADR-002) | `09-table-editor-blueprint.md` |
| 8 | **Edge Functions** ★ | 45 | 92 | 19 | 40h | isolated-vm v6 + Deno 사이드카 + Sandbox 3층 (ADR-009) | `10-edge-functions-blueprint.md` |
| 9 | **Realtime** ★ | 55 | 100 | 19 | 35h | wal2json + supabase-realtime 포팅 하이브리드 (ADR-010) | `11-realtime-blueprint.md` |
| 3 | **Schema Visualizer** | 65 | 95 | 20 | 50h | schemalint + 자체 RLS UI + Trigger (ADR-004) | `12-schema-visualizer-blueprint.md` |
| 4 | **DB Ops** | 60 | 95 | 20 | 68h | node-cron 자체 + wal-g (ADR-005) | `13-db-ops-blueprint.md` |
| 10 | **Advisors** | 65 | 95 | 20 | 80h | 3-Layer (schemalint + squawk + splinter 포팅) (ADR-011) | `14-advisors-blueprint.md` |
| 11 | **Data API** | 45 | 85 | 21 | 25h | REST 강화 + pgmq + pg_graphql 조건부 (ADR-012) | `15-data-api-blueprint.md` |
| 13 | **UX Quality** | 75 | 95 | 21 | 15h | AI SDK v6 + Anthropic BYOK + 자체 MCP (ADR-014) | `16-ux-quality-blueprint.md` |

★ = 사전 스파이크 검증 완료 카테고리 (Wave 1에서 "조건부 GO" 확정, 추가 스파이크는 Phase 착수 전 실행 — `06-prototyping/spike-005~010`).

### 4.2 공수 합산 검증

```
Phase 15: 22h
Phase 16: 20h + 20h = 40h
Phase 17: 30h + 30h = 60h
Phase 18: 320h + 80h = 400h
Phase 19: 40h + 35h = 75h
Phase 20: 50h + 68h + 80h = 198h
Phase 21: 25h + 15h = 40h
Phase 22: ~35h (Prisma 마이그 18~19파일 35~39h + 잔여 Auth Advanced 보너스)
─────────────────────────────
Wave 4 총합: 870h
```

> Wave 3 Preview(992h)에서 -12% 감소한 이유: Wave 4 Blueprint 작성 단계에서 (1) Observability와 Operations의 L1 레이어 공유로 중복 로깅 코드 제거 (-10h), (2) Advisors 3-Layer의 schemalint/squawk 기존 CLI 활용(포팅 불필요) (-30h), (3) Schema Viz의 @xyflow + elkjs 기본 기능 재활용으로 WBS 최적화 (-15h), (4) Table Editor 14c-α 기존 자산 활용분 명확화 (-22h), (5) 기타 최적화 ~45h = **총 -122h 감소**. 근거: `_CHECKPOINT_KDYWAVE.md Wave 4 결과 / Phase 15-22 총 공수 재산정`.

### 4.3 점수 가중평균 계산 (Phase 완료별 예상)

가중치는 14 카테고리 균등 가중(1/14) 적용 — `00-vision/05-100점-definition.md §가중평균 방식`.

| 체크포인트 | 카테고리별 현재점수 합 | 가중평균 | 증가분 | Phase |
|----------|------------------|---------|-------|-------|
| 시작 (Wave 4 완료) | 15+65+80+70+40+70+75+45+55+65+60+65+45+75 = **825** | 58.9 | — | — |
| Phase 15 완료 | 15→60 (+45) | 62.1 | +3.2 | 15 |
| Phase 16 완료 | 65→85 (+20) + 80→95 (+15) = +35 | 64.6 | +2.5 | 16 |
| Phase 17 완료 | 70→90 (+20) + 40→90 (+50) = +70 | 69.6 | +5.0 | 17 |
| Phase 18 완료 | 70→100 (+30) + 75→100 (+25) = +55 | 73.5 | +3.9 | 18 |
| Phase 19 완료 | 45→92 (+47) + 55→100 (+45) = +92 | 80.1 | +6.6 | 19 |
| Phase 20 완료 | 65→95 (+30) + 60→95 (+35) + 65→95 (+30) = +95 | 86.9 | +6.8 | 20 |
| Phase 21 완료 | 45→85 (+40) + 75→95 (+20) = +60 | 91.2 | +4.3 | 21 |
| Phase 22 완료 | 전부 +잔여 | 100.0 | +8.8 | 22 |

**MVP(Phase 17) = 69.6점 달성 시점** — "운영 가능한 보안 기반" 카테고리 5개(MFA·Vault·Ops·Auth Core·Storage)가 완성된 상태. Beta(Phase 19) = 80.1점, GA(Phase 22) = 100점.

---

## 5. 의존성 DAG (Phase 15 → 22)

### 5.1 Phase 간 의존성 다이어그램

근거: `00-vision/10-14-categories-priority.md §2.2` (카테고리 의존성) + `02-architecture/00-system-overview.md §3.2` (9-레이어 의존) + `02-architecture/01-adr-log.md ADR-018` (레이어 규칙).

```
                          ┌──────────────────────┐
                          │  Phase 15            │
                          │  Auth Advanced (15→60)│
                          │  [L3: MFA 계층]        │
                          │  22h · 4주             │
                          └──────────┬────────────┘
                                     │ JWT/Session 공유, MFA 강제 정책
                                     ▼
                          ┌──────────────────────┐
                          │  Phase 16            │
                          │  Observability +     │
                          │  Operations           │
                          │  [L1 Vault + JWKS]    │
                          │  40h · 6주             │
                          └──────────┬────────────┘
                                     │ MASTER_KEY/JWKS 기반 시크릿 관리 확립
                                     ▼
                          ┌──────────────────────┐
                          │  Phase 17 (MVP)      │
                          │  Auth Core + Storage │
                          │  [L2 Auth + L4 파일]   │
                          │  60h · 8주             │
                          └──────┬────────────────┘
                                 │
              ┌──────────────────┤
              ▼                  ▼
    ┌──────────────┐   ┌──────────────────────┐
    │ Phase 18     │   │ Phase 19             │
    │ SQL + Table  │   │ Edge Fn + Realtime   │
    │ [L6 Editor]  │   │ [L5 Compute/CDC]     │
    │ 400h · 16주   │   │ 75h · 8주              │
    └──────┬───────┘   └──────┬───────────────┘
           │                  │ Realtime CDC 채널 → Data API
           ▼                  ▼
    ┌─────────────────────────────────────────┐
    │ Phase 20 (RC)                           │
    │ Schema Viz + DB Ops + Advisors          │
    │ [L6 Meta + L4 Ops]                       │
    │ 198h · 6주                                │
    └────────────────┬────────────────────────┘
                     │ Advisors 38룰 → Data API 스키마 검증
                     ▼
              ┌──────────────────────┐
              │  Phase 21             │
              │  Data API + UX        │
              │  [L7 API + L8 UX]     │
              │  40h · 4주             │
              └──────────┬────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Phase 22 (GA)       │
              │  잔여 갭 + 하드닝       │
              │  35h · 4주             │
              └──────────────────────┘
```

### 5.2 블로킹 의존성 목록

| 후행 Phase | 선행 Phase | 차단 인터페이스 | 근거 |
|----------|----------|-------------|------|
| P16 Vault | P15 MFA | MFA 시드는 Vault에 저장되어야 하지만 Vault 미구현 시 평문 임시 저장 → P15 완료 후 P16에서 시드 마이그레이션 | `03-auth-advanced-blueprint.md §12.2 T1` FK는 `Phase 16 Vault 완성 후 추가` |
| P17 Auth Core | P16 JWKS | JWT 서명이 JWKS ES256 사용해야 함 | `04-observability-blueprint.md §11` + `06-auth-core-blueprint.md §5.2` |
| P18 SQL Editor | P17 Auth Core | SQL Editor 쿼리 실행 컨텍스트가 Auth Core Session 기반 | `08-sql-editor-blueprint.md §4 인증 컨텍스트` |
| P19 Edge Functions | P17 Storage | Edge Function 내부 Storage 버킷 접근 | `10-edge-functions-blueprint.md §4 Storage 통합` |
| P19 Realtime | P17 Auth Core | Realtime Channel은 세션 기반 권한 검증 | `11-realtime-blueprint.md §4` |
| P20 Schema Viz | P18 Table Editor | RLS 정책 UI가 Table Editor 컴포넌트 공유 | `12-schema-visualizer-blueprint.md §5 재사용` |
| P20 Advisors | P18 SQL Editor | Advisors 38룰은 SQL 쿼리 컨텍스트 활용 | `14-advisors-blueprint.md §7 SQL Editor 통합` |
| P21 Data API 구독 | P19 Realtime | Realtime CDC 채널을 Data API가 사용 | `15-data-api-blueprint.md §4 Realtime 통합` |

### 5.3 병렬 실행 가능 조합

| 병렬 조합 | 동시 실행 가능 이유 | 권장 전략 (1인 기준) |
|---------|------------------|------------------|
| P16 Obs ∥ Ops | 공유 L1이지만 컴포넌트 독립 | 주 1~3 Obs, 주 4~6 Ops (순차 권장) |
| P17 Auth Core ∥ Storage | 서로 다른 레이어 (L2/L4) | 주 11~14 Auth Core, 주 15~18 Storage (순차 권장) |
| P18 SQL ∥ Table | 동일 L6이지만 컴포넌트 독립 | 주 19~30 SQL (집중), 주 31~34 Table |
| P19 Edge ∥ Realtime | 서로 다른 레이어 (L5 Compute/CDC) | 주 35~38 Edge (복잡), 주 39~42 Realtime |
| P20 Schema ∥ DB Ops ∥ Advisors | 전부 독립 | 주 38~40 Schema (P18 잔여 재사용), 주 41~42 DB Ops, 주 43~44 Advisors |

---

## 6. MVP 경계선 (Alpha / Beta / GA)

### 6.1 3단계 릴리스 개요

| 릴리스 | Phase | 누적 공수 | 누적 기간 | 누적 점수 | 릴리스 버전 | 성격 |
|-------|-------|---------|---------|---------|------------|------|
| **Alpha (MVP)** | 15~17 | 122h | 18주 | 69.6/100 | v0.3.0 | "운영 가능한 보안 기반" |
| **Beta** | 18~19 | +475h = 597h | +24주 = 42주 | 80.1/100 | v0.5.0 | "Supabase 핵심 기능 동등" |
| **GA (v1.0)** | 20~22 | +273h = 870h | +8주 = 50주 | 100/100 | v1.0.0 | "Supabase Self-Hosted 100점 동등" |

### 6.2 Alpha (MVP) 기준선

**범위**: Phase 15 Auth Advanced + Phase 16 Observability/Operations + Phase 17 Auth Core/Storage.

**성공 정의** (`00-vision/10-14-categories-priority.md §7.1 MVP 체크리스트` 기반):

- ✅ MFA (TOTP + WebAuthn) 작동 가능
- ✅ JWKS + Vault 기반 시크릿 관리 (평문 제로)
- ✅ Capistrano-style 5초 롤백 (ADR-015)
- ✅ Auth Core 90점 달성 (Session 관리 + bcrypt + Anonymous role)
- ✅ SeaweedFS 기반 파일 관리 90점 (10MB 업로드 + B2 오프로드)
- ✅ 전체 E2E 테스트: 로그인 → MFA 등록 → 파일 업로드 → 세션 종료

**시스템 신뢰도**: "1인 운영자가 프로덕션에 민감 데이터를 저장하고 안심할 수 있는 수준."

**왜 MVP인가**: `00-vision/06-operational-persona.md`의 페르소나 1(김도영, 1인 운영자)가 양평 부엌 실무 데이터(고객 정보, 주문 이력, 회계)를 저장하기 위한 **최소 보안 기준**.

### 6.3 Beta 기준선

**범위**: MVP + Phase 18 SQL/Table Editor + Phase 19 Edge Functions/Realtime.

**성공 정의** (`10-14-categories-priority.md §7.1 Beta`):

- ✅ SQL Editor 100점 (Monaco + BEGIN READ ONLY + AI 보조 + Plan Visualizer)
- ✅ Table Editor 100점 (TanStack v8 + 14c-α~e 4단계 + Papa Parse CSV + cmdk FK)
- ✅ Edge Functions 92점 (3층 하이브리드 + decideRuntime P0>P1)
- ✅ Realtime 100점 (wal2json CDC + supabase-realtime Channel 포팅 + presence)
- ✅ 대시보드 사용자 5명+ 6개월 연속 사용 가능 (ADR-001 재검토 트리거 아님)

**시스템 신뢰도**: "Supabase Cloud Studio에서 할 수 있는 거의 모든 작업을 양평 대시보드에서 수행 가능."

### 6.4 GA (v1.0) 기준선

**범위**: Beta + Phase 20 Schema/DB Ops/Advisors + Phase 21 Data API/UX + Phase 22 하드닝.

**성공 정의** (본 로드맵 + `00-vision/05-100점-definition.md`):

- ✅ 14 카테고리 전부 90점 이상 (가중평균 100점)
- ✅ 3년 TCO 절감 $950~2,150 검증 (실제 운영비 $0~10/월 확인)
- ✅ RPO 60초 / RTO 30분 달성 (wal-g + 복구 드릴)
- ✅ Advisors 38룰 전수 작동 (P0 12 + P1 17 + P2 9)
- ✅ NFR 38건 전수 충족 검증 (PERF/SEC/UX/REL/MNT/CMP/COST)

**시스템 신뢰도**: "Supabase Self-Hosted와 기능적 동등. 차이는 '멀티테넌시 없음'(ADR-001)과 'Cloudflare Tunnel 기반 배포(ADR-015)' 2건뿐."

---

## 7. Wave 4 Compound Knowledge 반영 — 하이브리드 9 vs 단일 5 분류가 로드맵 순서에 어떻게 반영되는가

### 7.1 Wave 1~4 공통 발견 재확인

Wave 1/2/4 세 번의 검증에서 모두 유효했던 핵심 분류 (`README.md Wave 1 Compound Knowledge` / `_CHECKPOINT_KDYWAVE.md Wave 4 Compound Knowledge`):

| 분류 | 카테고리 | 공수 특성 | 로드맵 배치 전략 |
|------|--------|---------|--------------|
| **하이브리드 필수 (9)** | Table Editor / SQL Editor / Schema Viz / Auth Core / Auth Advanced / Edge Functions / Realtime / Data API / Advisors | 여러 도구 패턴 조합 → 공수 편차 큼 (22h ~ 320h) | **큰 Phase에 집중 배치** (P18 SQL 320h, P18 Table 80h, P20 Advisors 80h). Phase 간 경계에 두지 않음 |
| **단일 솔루션 (5)** | Storage / DB Ops / Observability / UX Quality / Operations | 단일 도구 채택 → 공수 균등 (15h ~ 68h) | **MVP에 모아두거나 (Obs/Ops/Storage), 짧은 Phase에 몰아 배치 (UX 15h + Data API 25h → P21 4주)** |

### 7.2 Phase 배치 원칙 3가지

**원칙 1: 하이브리드는 Phase를 혼자 차지한다 (또는 카테고리 2개만).**

- P15 = Auth Advanced 단독 (하이브리드이지만 22h라 짧음 = 예외)
- P18 = SQL(320h) + Table(80h) — 둘 다 하이브리드이지만 L6 레이어 공유, 컴포넌트 재사용 가능
- P19 = Edge(40h) + Realtime(35h) — 둘 다 하이브리드, 컴포넌트 독립이지만 Phase 시간 맞춤

**원칙 2: 단일 솔루션은 Phase 내부에서 병렬 또는 묶음 배치.**

- P16 = Obs(20h) + Ops(20h) — 단일×단일, 둘 다 L1 → 병렬 가능
- P17 = Auth Core(하이브리드) + Storage(단일) — Storage가 독립적이라 합류 가능
- P21 = Data API(하이브리드 25h) + UX(단일 15h) — 짧은 공수로 4주 Phase 충족

**원칙 3: 큰 공수는 뒤로 (SQL 320h를 MVP에 두면 Alpha가 18주가 아닌 54주)**.

- P17 완료 시점 = 18주 (MVP)
- P18 SQL Editor = 16주 (MVP 후 집중 기간)
- 만약 SQL을 P16에 넣었다면 MVP = 34주 → "운영 가능 보안 기반"이 너무 늦음 = 페르소나 1 니즈 위반

### 7.3 Wave 4 청사진에서 발견된 **계층 분리** 패턴과 로드맵의 대응

Wave 1~4에서 반복 확인된 "경쟁이 아니라 역할 분담":

| 카테고리 | 계층 분리 | 로드맵 영향 |
|---------|---------|-----------|
| Realtime | CDC(wal2json) + Channel(supabase-realtime 포팅) 2계층 | Phase 19 내부에서 Step 1 = CDC, Step 2 = Channel 순차 |
| Advisors | schemalint(컨벤션) + squawk(DDL) + splinter(런타임) 3-Layer | Phase 20 내부 공수 20h(Core) + 8h+8h+30h(Layer) + 14h(UI) = 80h 분할 |
| Edge Functions | isolated-vm(P0) + Deno(P1) + Sandbox(P2) 3층 | Phase 19 Step 1만 MVP (40h 중 25h), Step 2/3은 Phase 22 하드닝 |

이 계층 분리는 **롤아웃 내부 전략**으로 로드맵에 반영되어, 각 Phase가 "한 카테고리 완성"이 아니라 **"한 카테고리의 P0 완성 + P1/P2 Phase 22 이연"**이 될 수 있음을 보장한다.

---

## 8. 버퍼 및 리스크 반영

### 8.1 1인 운영 버퍼 정책 (20%)

Wave 4 공수는 **순수 개발 시간(design + code + test)**이다. 1인 운영자의 다음 활동은 별도 시간으로 간주:

- 레퍼런스 문서 리뷰 (세션 시작/종료 시 15분)
- 인수인계서 작성 (세션 종료 시 30~60분)
- CLAUDE.md/docs 유지보수
- PM2 운영/로그 모니터링
- Cloudflare Tunnel/DNS 설정 변경
- 고객 대응/기타 업무

이를 반영한 실제 주당 코딩 가능 시간 = **20시간/주** (40시간 근무 × 50%).

```
순수 공수 870h ÷ 20h/주 = 43.5주 (이론적 최소)
실제 버퍼 포함 = 870h × 1.20 / 20h/주 = 52.2주
→ 50주 스케줄 유효 (버퍼 15%)
```

**리스크 5% 추가 버퍼**: `10-14-categories-priority.md §6.2 TOP 3 리스크` 중 실현 시 Phase 19(Edge Fn) / Phase 17(Storage) / Phase 19(Realtime)에서 +10~20h 발생 가능 → Phase 22에서 흡수.

### 8.2 Phase별 예비 일수

| Phase | 계획 주수 | 버퍼 일수 | 실제 총 주수 |
|-------|---------|---------|------------|
| 15 | 4주 | +5일 | 4.7주 |
| 16 | 6주 | +7일 | 7주 |
| 17 | 8주 | +10일 | 9.4주 |
| 18 | 16주 | +20일 | 18.9주 |
| 19 | 8주 | +10일 | 9.4주 |
| 20 | 6주 | +7일 | 7주 |
| 21 | 4주 | +5일 | 4.7주 |
| 22 | 4주 | +5일 | 4.7주 |
| **합계** | **56주** (+20% 분산) | — | — |

단, 병렬 가능 구간(§3.3)에서 2.5주 중첩 → 실제 52~53주. **50주 계획 + 2~3주 안전 마진**으로 합의.

---

## 9. Wave 5 DQ 16건의 Phase 연관

Wave 5에서 해결할 16개 DQ를 Phase에 매핑 (`00-vision/07-dq-matrix.md §Wave 5 주요 DQ`):

### 9.1 DQ → Phase 매핑

| DQ 번호 | 주제 | 담당 Phase | 해결 시점 |
|--------|-----|----------|---------|
| DQ-1.13 | AG Grid 전환 합리성 | Phase 22 재검토 | P22 GA 전 |
| DQ-1.14 | AG Grid Enterprise 도입 | Phase 22 재검토 | P22 GA 전 |
| DQ-3.3 | Supabase Studio 임베드 | Phase 20 (Schema Viz) | P20 착수 전 재확인 |
| DQ-4.1 | PM2 cluster 모드 결정 | **Phase 16 M3** (본 로드맵 `02-milestones.md`) | P16 마일스톤에서 확정 |
| DQ-4.2 | pg_cron 도입 재검토 | Phase 20 (DB Ops) | SQL-only 잡 5개+ 누적 시 |
| DQ-4.3 | BullMQ 도입 재검토 | Phase 20 (DB Ops) | advisory lock 실패 시 |
| DQ-4.22 | wal-g 복원 속도 실측 | Phase 20 (DB Ops) + 스파이크 | 첫 복원 드릴 직후 |
| DQ-AA-3 | FIDO MDS 통합 | Phase 22 보너스 | P22 WebAuthn 강화 시 |
| DQ-AA-9 | WebAuthn Conditional UI | Phase 22 | P17 완료 + 2주 안정화 후 |
| DQ-ADV-1 | Advisors PG 마이그 | Phase 20 | P20 Layer 3 포팅 단계 |
| DQ-RT-3 | presence_diff 이벤트 | Phase 19 | P19 Realtime Channel 구현 |
| DQ-RT-6 | PG 18 업그레이드 시 wal2json 호환 | Phase 22 | 업그레이드 결정 시 |
| DQ-12.4 | JWKS 캐시 정책 | Phase 16 | P16 JWKS 구현 시 |
| DQ-12.5 | Capacitor 모바일 | Phase 22+ (P2 백로그) | GA 이후 검토 |
| DQ-AC-1 | argon2 마이그레이션 타이밍 | Phase 22 | bcrypt 성능 한계 도달 시 |
| DQ-AC-2 | Session 인덱스 (SQLite) | Phase 17 | P17 Auth Core Session 설계 시 |
| DQ-OPS-1 | Docker 이행 조건 | Phase 22+ | WSL 다중 distro 필요 시 |
| DQ-OPS-3 | Node 버전 고정 | Phase 16 | P16 release 격리 구현 시 |
| DQ-OPS-4 | DR 호스트 | Phase 22+ | Cloudflare Tunnel replica 확장 시 |

합계 19건 매핑 (07-dq-matrix.md에서 Wave 5 = 16건 명시, 나머지 3건은 재검토 트리거 형태로 중복 매핑).

### 9.2 스파이크 연관 DQ

Wave 5 스파이크 5종(`06-prototyping/spike-005~010`)에 연결되는 DQ:

| 스파이크 | 관련 DQ | Phase 착수 전제 |
|---------|-------|-------------|
| spike-005-edge-deep | DQ-1.12~14 (isolated-vm 보안 한계) | P19 Edge Fn 착수 전 |
| spike-007-seaweedfs-50gb | DQ-1.15~17 (Storage 50GB 부하) | P17 Storage 착수 전 |
| spike-008-wal2json | DQ-RT-3, DQ-RT-6 | P19 Realtime 착수 전 |
| spike-009-totp-webauthn | DQ-AA-3, DQ-AA-9 | P15 Auth Adv 착수 전 (이미 부분 검증) |
| spike-010-pgmq | DQ-4.1 cluster 트랜잭션 | P16 M3 마일스톤 전 |

---

## 10. 릴리스 및 배포 프로토콜 요약

### 10.1 Canary 배포 프로토콜

`04-integration/02-cloudflare-deployment-integration.md §Canary` 확정 내용:

```
[코드 푸시] → [internal 빌드 (WSL2 PM2 fork)]
              ↓ 검증: npm test + e2e smoke + lighthouse 80+
[Cloudflare Tunnel → canary.stylelucky4u.com]
              ↓ Cloudflare Worker cf-ray 해시 기반 10% 트래픽
[3일 관측: Sentry 0 crash, p95 <500ms]
              ↓ canary 50% 24h 추가 관측
[production 100% 전환]
              ↓ Capistrano symlink swap (5초)
[롤백 가능 시점: +24h 후에도 "previous" release 보관]
```

### 10.2 롤백 프로토콜

```bash
# 5초 롤백
cd /var/www/luckystyle4u/releases
ln -sf /var/www/luckystyle4u/releases/previous /var/www/luckystyle4u/current
pm2 reload luckystyle4u-dashboard --update-env
```

`05-operations-blueprint.md §Capistrano 롤백`에서 상세 절차.

### 10.3 릴리스 노트 표준 요약

각 릴리스마다 다음 섹션을 포함 (`01-release-plan.md §릴리스 노트 템플릿`):

1. 릴리스 메타 (버전, 코드명, 날짜)
2. 주요 기능 (FR 단위)
3. ADR 변경사항
4. DQ 해결 목록
5. 성능 벤치마크 (이전 릴리스 대비)
6. 알려진 이슈
7. 마이그레이션 가이드
8. 감사 (Acknowledgements)

---

## 11. 연계 문서 링크 (Wave 5 내부)

본 개요 문서의 하위/병렬 문서:

| 문서 | 목적 | 작성자 |
|------|-----|--------|
| `05-roadmap/01-release-plan.md` | 릴리스 전략 + v0.1.0~v1.0.0 상세 | Wave 5 R1 (본 에이전트 2/3) |
| `05-roadmap/02-milestones.md` | M1~M16 마일스톤 × 크리티컬 패스 × 간트 | Wave 5 R1 (본 에이전트 3/3) |
| `05-roadmap/03-tech-debt-strategy.md` | 기술 부채 + 로드맵 내 상환 스케줄 | Wave 5 R2 |
| `05-roadmap/04-risk-register.md` | 리스크 레지스터 × Phase 매핑 | Wave 5 R2 |
| `05-roadmap/05-go-no-go-checklist.md` | Phase 전환 승인 체크리스트 | Wave 5 R3 |
| `05-roadmap/06-rollout-strategy.md` | 롤아웃 상세(Canary/피처 플래그) | Wave 5 R3 |
| `06-prototyping/spike-005-edge-deep.md` | Edge Functions 심화 스파이크 | Wave 5 S1 |
| `06-prototyping/spike-007-seaweedfs-50gb.md` | Storage 50GB 부하 테스트 | Wave 5 S1 |
| `06-prototyping/spike-008-wal2json.md` | wal2json + PG 버전 매트릭스 | Wave 5 S2 |
| `06-prototyping/spike-009-totp-webauthn.md` | MFA 단대단 검증 | Wave 5 S2 |
| `06-prototyping/spike-010-pgmq.md` | pgmq 트랜잭션 일관성 | Wave 5 S2 |
| `07-appendix/00-glossary.md` | 용어집 | Wave 5 A1 |
| `07-appendix/01-kdygenesis-handoff.md` | kdygenesis 인계 양식 | Wave 5 A1 |
| `07-appendix/02-final-summary.md` | 최종 요약 | Wave 5 A1 |

### 11.1 상위 문서 연결 재확인

- `CLAUDE.md` 루트: 프로젝트 정보 + 문서 체계
- `docs/research/2026-04-supabase-parity/README.md`: 마스터 인덱스
- `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md`: kdywave 체크포인트
- `00-vision/10-14-categories-priority.md`: Phase 15-22 preview (본 문서의 기반)
- `02-architecture/00-system-overview.md`: 9-레이어 아키텍처 (본 문서 의존성 DAG의 근거)
- `02-architecture/01-adr-log.md`: ADR-001~018 (본 문서 채택 기술의 근거)

---

## 12. 본 로드맵 확정 사항 5종

본 문서가 명시적으로 확정하는 로드맵 결정(향후 변경 시 재검토 필요):

### 결정 1: 50주 × 870h 총 일정

- **근거**: Wave 4 청사진 14 카테고리 공수 합산 + 1인 운영 버퍼 20%
- **재검토 트리거**: Phase 15 착수 후 4주 내 실제 속도가 계획 대비 ±25% 이탈 시

### 결정 2: Alpha(MVP) = Phase 15~17, 18주

- **근거**: "운영 가능한 보안 기반" 페르소나 1 니즈 충족 기준 `00-vision/06-operational-persona.md` + `10-14-categories-priority.md §7`
- **재검토 트리거**: Phase 17 종료 시 가중평균 <65점 (현재 계산: 69.6점)

### 결정 3: Beta = Phase 18~19, 추가 14주

- **근거**: SQL/Table Editor + Edge/Realtime으로 "Supabase 핵심 기능 동등" 달성
- **재검토 트리거**: Phase 19 종료 시 대시보드 일일 사용 <30분 (사용자 수용성 부족)

### 결정 4: GA (v1.0) = Phase 22, 50주차

- **근거**: 14 카테고리 전부 90점+ 달성 + NFR 38 전수 충족
- **재검토 트리거**: Phase 22 시점에 잔여 갭 +30h 초과 (일정 보정 필요)

### 결정 5: Phase 간 의존성 DAG

- **근거**: `02-architecture/00-system-overview.md §3 레이어 의존` + `01-adr-log.md ADR-018`
- **재검토 트리거**: Blueprint 수정 시 의존 변경 발생 (ADR-XXX 신규 등록 필수)

---

## 13. 로드맵 위험 신호 (경보 지표)

다음 신호가 감지되면 본 로드맵을 재평가한다:

| 신호 | 임계값 | 대응 Phase | 대응 조치 |
|------|-------|---------|---------|
| Phase 공수 초과 | 계획 대비 +30% | 해당 Phase 진행 중 | 다음 Phase 축소 또는 GA 연기 |
| DQ 신규 발생 | 기존 64 + 10건 이상 | 어느 시점이든 | Wave 6(재정비) 검토 |
| ADR 재검토 트리거 발동 | 동시 3건 이상 | 어느 시점이든 | 1주 일정 동결 + 아키텍처 재검토 |
| 1인 운영 지속 불가 | 주당 코딩 <10h 4주 연속 | 어느 시점이든 | 로드맵 2배 기간 재산정 |
| 외부 의존성 변경 | PG / Next.js 메이저 업그레이드 | 어느 시점이든 | 버전 lock + 추후 마이그 Phase 추가 |
| 비용 초과 | 월 $10 초과 | 어느 시점이든 | B2 / AI SDK 비용 가드 강화 |
| 보안 사고 | STRIDE 29 TOP 10 중 1건 실현 | 어느 시점이든 | 즉시 hotfix + PIR(Post-Incident Review) |

---

## 14. 다음 단계 (로드맵 실행)

### 14.1 Phase 15 진입 직전 체크리스트 (Week 0)

```
□ 본 로드맵 3문서(00~02) 리뷰 완료
□ _CHECKPOINT_KDYWAVE.md Wave 5 완료 플래그
□ Phase 15 Blueprint(03-auth-advanced-blueprint.md) 최종 확인
□ Prisma 마이그레이션 3개 드라이런 (Phase 15 테이블)
□ PM2 ecosystem.config.js Phase 15 브랜치 구성
□ Git 태그 v0.1.0-alpha.0 생성 (Phase 15 착수 지점)
□ kdygenesis 인계 자료 준비 (07-appendix/01-kdygenesis-handoff.md)
```

### 14.2 Phase 15 주차 액션 (Week 1~4)

- **Week 1**: T1 DB 마이그레이션 + T2 TOTP 서버 로직 (총 5h)
- **Week 2**: T3 TOTP UI + T4 WebAuthn 서버 (총 6h)
- **Week 3**: T5 WebAuthn UI + T6 Rate Limit 서버 (총 6h)
- **Week 4**: T7~T12 마무리 + 감사 로그 + E2E 테스트 (총 5h)
- **Week 4 종료 시**: v0.1.0-alpha.1 Canary 배포

### 14.3 장기 계획 거버넌스

- 매 Phase 완료 시 `_CHECKPOINT_KDYWAVE.md` 업데이트
- 매 Phase 종료 시 `01-release-plan.md` 릴리스 노트 작성
- 매 마일스톤(16개) 도달 시 `02-milestones.md` 검증 기준 확인
- 매 2주 회고: 속도 측정 + DQ 확인 + ADR 재검토 트리거 확인

---

> **작성**: Wave 5 R1 (Roadmap Lead) · 2026-04-18
> **총 줄 수 목표**: ~600줄 이상
> **근거 문서**: Wave 1-4 86,460줄 전수 반영
> **다음 문서**: [01-release-plan.md](./01-release-plan.md) — 릴리스 전략 + v0.1.0~v1.0.0 상세
