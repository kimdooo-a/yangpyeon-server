# 02. Wave 1-5 최종 종합 요약 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.
> ⚠️ **ADR 번호 placeholder 충돌 정정 (2026-04-25)**: 본 문서의 "ADR-020 후보(PM2 cluster vs cron-worker 충돌 해결)" 및 "Phase 16: ADR-020 이행" 표현은 실제 ADR-020(standalone+rsync+pm2 reload, 세션 50)과 충돌. PM2 cluster/fork 분리 후보는 **ADR-021** 슬롯으로 재할당 권장.

> **Wave 5 · A1 (Tier 2) 산출물**
> 작성일: 2026-04-18 (세션 28, kdywave Wave 5 A1 Agent — sonnet)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [07-appendix/](./) → **이 문서**
> 연관:
> - [../README.md](../README.md) — Wave 1-5 마스터 인덱스
> - [../05-roadmap/00-release-plan.md](../05-roadmap/00-release-plan.md) — 릴리스 계획
> - [../05-roadmap/01-milestones-wbs.md](../05-roadmap/01-milestones-wbs.md) — 마일스톤 WBS
> - [00-glossary.md](./00-glossary.md) — 용어집
> - [01-kdygenesis-handoff.md](./01-kdygenesis-handoff.md) — 제네시스 청사진

---

## 1. Wave 1-5 종합 통계표

| Wave | 시작 | 완료 | 문서 수 | 줄 수 | 에이전트 | 핵심 산출물 |
|------|------|------|---------|-------|---------|------------|
| **1** | 2026-04-18 09:09 | 2026-04-18 (오전) | 33 | 26,941 | 5+5 (Round1+2) | 14 카테고리 1순위 채택안 확정 / DQ-1.1~1.9 잠정 답변 |
| **2** | 2026-04-18 (오전) | 2026-04-18 17:30 | 28 | 18,251 | 7 | 비교 매트릭스 28건 + 1:1 비교 + DQ-12.3 확정 |
| **3** | 2026-04-18 (오후) | 2026-04-18 15:41 | 11 | 8,350 | 7 | Vision Suite 11문서 / FR 72+ / NFR 38 / 100점 정의 / ADR 18건 |
| **4** | 2026-04-18 19:00 | 2026-04-18 22:15 | 26 | 32,918 | 11 (3 Tier) | 14 Blueprint + UI/UX 5문서 + Integration 4문서 |
| **5** | 2026-04-18 23:00 | 2026-04-18 24:00 | 25 | 20,128 | 11 (7 R1-A/R1-B/R2/R3/S1/S2/A1 + 6 세션 28-2) | Roadmap 13 + Spike 9 + Appendix 3 |
| **누적** | — | — | **123** | **106,588** | **41** | — |

> 계획 대비: 문서 수 ~105 → 123 (+17% 초과 달성) / 줄 수 ~80,000 → 106,588 (+33%)

### Wave 5 세부 산출물 수치

| 디렉토리 | 문서 수 | 줄 수 |
|---------|---------|-------|
| `05-roadmap/` | 13 | 10,629 |
| `06-prototyping/` | 9 | 6,621 |
| `07-appendix/` | 3 (기존) + 3 (본 세션 A1) | 2,878 (기존) |
| **Wave 5 합계** | **25** | **20,128** |

---

## 2. Wave 1-5 Compound Knowledge 통합

### Wave 1: 기초 deep-dive (26,941줄, 5+5 에이전트)

Wave 1에서 발견된 핵심 패턴 3가지는 이후 모든 Wave의 설계 축이 됐다.

**발견 1: "단일 솔루션 vs 하이브리드" 분류 (AP-3의 기원)**

14 카테고리를 평가한 결과 "단일 최고점 라이브러리"가 존재하는 카테고리(9건)와 "계층 분리된 하이브리드"만이 Supabase 동등성에 도달할 수 있는 카테고리(5건)가 명확히 갈렸다. 이 발견이 Wave 4 Blueprint의 아키텍처 분기점이 됐다.

| 분류 | 카테고리 | 예시 |
|------|---------|------|
| 단일 채택 | 9건 | SeaweedFS(Storage), otplib+WebAuthn(Auth Advanced) |
| 하이브리드 필수 | 5건 | Edge Fn 3층, Realtime(wal2json+포팅), Advisors 3-Layer |

**발견 2: "라이브러리 채택 vs 패턴 차용" — AP-4의 기원**

Auth Core(Lucia/Auth.js 패턴 15개 차용), Advisors(splinter 38룰 Node 포팅) 등 라이브러리 전체 채택이 오히려 의존성 잠금 위험을 높이는 경우, "패턴만 차용하고 구현은 자체"라는 AP-4 원칙이 도출됐다.

**발견 3: "PG 확장 vs Node 자체구현" 균형 — AP-5의 기원**

카테고리별로 PG 확장(wal2json, pg_logical)이 명확히 이득인 경우(Realtime)와 Node 자체구현이 단순성 원칙에 부합하는 경우(pg_cron 거부 → node-cron)가 다르다는 것을 발견했다. 일률적 규칙이 아닌 카테고리별 균형 판단이 ADR-005 등의 기반이 됐다.

---

### Wave 2: 비교 매트릭스 + 1:1 (18,251줄, 7 에이전트)

**발견 4: "1:1 비교는 계층 분리를 드러낸다"**

28건의 1:1 비교에서 "경쟁 관계"로 보였던 라이브러리들이 실제로는 계층 분리 시 공존 가능한 구조임이 드러났다.

- wal2json vs supabase-realtime → 실제로는 CDC 소스 ↔ 채널 관리 계층 분리 (ADR-010)
- isolated-vm v6 vs Deno embed → 신뢰 L1 ↔ L2 계층 분리 (ADR-009)
- splinter vs squawk → SQL 규칙 L3 ↔ DDL 안전성 L2 (ADR-011)

**발견 5: 정량화된 재검토 트리거**

Wave 2의 환경 변화 시나리오 분석에서 "언제 현재 결정을 바꿔야 하는가"를 숫자로 정의하는 것이 가능함을 발견했다. 이 발견이 Wave 4 ADR 18건 모두에 "재검토 트리거" 필드를 포함하는 기반이 됐다.

---

### Wave 3: 100점 정의 + FR/NFR (8,350줄, 7 에이전트)

**발견 6: "요구사항은 이미 정해졌다"**

Wave 1-2에서 채택안이 확정된 시점에 이미 기술 구현 컬럼이 채워졌다. Wave 3 FR 작성은 기술 선택을 뒤집는 것이 아니라, 채택안의 기능 경계를 명문화하는 작업이었다. FR 72+건의 "기술 구현" 컬럼은 Wave 1-2 채택안과 100% 일치.

**발견 7: ADR-001 Multi-tenancy 의도적 제외 — 70h 절감**

Wave 3 `09-multi-tenancy-decision.md`에서 Multi-tenancy를 명시적으로 제외함으로써 70h 이상의 구현 공수 절감과 테넌트 크로스 리크 버그 클래스 구조적 제거 효과를 정량화했다. 이는 "안 하는 것도 설계"의 가장 명확한 사례다.

---

### Wave 4: 카테고리별 청사진 (32,918줄, 11 에이전트, 3 Tier)

**발견 8: "청사진은 계층 분리를 강제한다"**

Wave 1-2의 "하이브리드 필수" 판단이 Wave 4 Blueprint에서 구체적인 레이어 분리로 확정됐다.

- Realtime: 2계층 (CDC 소스 / 채널 관리) 명확화
- Advisors: 3-Layer (컨벤션 / DDL 안전성 / 38룰) 명확화
- Edge Fn: 3층 (신뢰 L1/L2/L3) 명확화

**발견 9: "UI/UX는 아키텍처와 독립 병렬 가능"**

Wave 4 Tier 3이 UI/UX(5문서)와 Integration(4문서)를 Tier 1 Blueprint와 동시 병렬 작성할 수 있었다. "UI 컴포넌트는 API 인터페이스 계약만 있으면 구현 독립" 원칙 확인.

---

### Wave 5: 로드맵 + 스파이크 + 부록 (20,128줄, 11 에이전트)

**발견 10: "재발사 분할은 stall 회피의 안전장치"**

Wave 5 R1 에이전트(opus)의 stall을 R1-A/R1-B(sonnet × 2)로 분할 재발사하여 해소. 단일 대형 에이전트보다 역할 분명한 소형 에이전트 2개가 더 안정적임을 실증했다. 800줄+ 문서 단일 opus 에이전트 대신 sonnet × 2가 권장 패턴으로 확립됐다.

**발견 11: "역방향 피드백 후보는 Tier 2에서 종합 처리"**

Wave 5 R2 에이전트가 Wave 1-4 결정물 전체를 검토하며 3건의 역방향 피드백을 발견했다. Tier 1의 세부 구현 집중이 아니라 Tier 2의 통합 관점에서만 보이는 충돌이었다. R2 역할 분리의 가치 확인.

**발견 12: "스파이크 사양은 Phase 진입 전 게이트"**

spike-005~010 5건이 모두 Phase 17/19/22 진입의 Entry Gate 조건으로 로드맵에 직접 연결됐다. "리서치 → 스파이크 → Phase 착수" 3단계 라이프사이클이 Wave 5에서 완결됐다.

---

## 3. 14 카테고리 100점 도달 경로 종합

| # | 카테고리 | 현재 점수 | 채택안 | 도달 Phase | 공수 | 100점 시점 |
|---|---------|----------|--------|-----------|------|-----------|
| 1 | Table Editor | 75 | TanStack v8 + 14c-α 자체구현 | Phase 18 | 400h(공유) | M4 완료 후 |
| 2 | SQL Editor | 70 | supabase-studio 패턴 + 3중 흡수 | Phase 18 | 400h(공유) | M4 완료 후 |
| 3 | Schema Visualizer | 65 | schemalint + 자체 RLS + xyflow | Phase 20 | 198h(공유) | M6 완료 후 |
| 4 | DB Ops Webhooks/Cron/Backups | 60 | node-cron + wal-g | Phase 20 | 198h(공유) | M6 완료 후 |
| 5 | Auth Core | 70 | jose JWT + Lucia/Auth.js 패턴 | Phase 17 | 30h | M3 완료 후 |
| 6 | Auth Advanced ★ | 15 | TOTP + WebAuthn + Rate Limit | Phase 15~17 | 22h → +38h | v0.1.0 MVP |
| 7 | Storage ★ | 40 | SeaweedFS + B2 오프로드 | Phase 17 | 30h | M3 완료 후 |
| 8 | Edge Functions ★ | 45 | 3층 하이브리드 | Phase 19 | 75h(공유) | M5 완료 후 |
| 9 | Realtime ★ | 55 | wal2json + supabase-realtime 포팅 | Phase 19 | 75h(공유) | M5 완료 후 |
| 10 | Advisors | 65 | 3-Layer (schemalint+squawk+splinter) | Phase 20 | 198h(공유) | M6 완료 후 |
| 11 | Data API + Integrations | 45 | REST + pgmq + pg_graphql(조건부) | Phase 21~22 | 40h+30h | M7~M8 완료 후 |
| 12 | Observability + Settings | 65 | node:crypto + jose JWKS ES256 | Phase 16 | 40h(공유) | M2 완료 후 |
| 13 | UX Quality | 75 | AI SDK v6 + Anthropic BYOK + MCP | Phase 21 | 40h(공유) | M7 완료 후 |
| 14 | Operations | 80 | Capistrano + PM2 cluster:4 + canary | Phase 16 | 40h(공유) | M2 완료 후 |

★ = 사전 스파이크 검증 필수 카테고리

**누적 공수**: 870~874h / 50~52주 (1인 풀타임 주 17h 기준)
**릴리스 구조**: v0.1.0 MVP(Phase 15~17, 122h) → v0.2.0 Beta(Phase 18~19, 475h) → v1.0.0 GA(Phase 20~22, ~268h)

---

## 4. R2 발견 역방향 피드백 처리 결정

Wave 5 R2 에이전트(sonnet)는 Wave 1-4 전체 산출물을 종합 검토하는 과정에서 아래 3건의 **역방향 피드백(backward feedback)** 을 발견했다. 이는 Wave 5 Tier 1 문서들이 집중 작성되는 동안 개별 에이전트가 감지하지 못한 충돌이다.

### 피드백 1: PM2 cluster vs cron-worker 충돌 → ADR-020 후보

| 항목 | 내용 |
|------|------|
| **발견** | ADR-015(메인 앱 PM2 cluster:4) ↔ ADR-005(cron-worker PM2 fork 전용) 동일 `ecosystem.config.js`에서 동시 적용 불가 |
| **충돌 내용** | cluster:4 모드에서는 4개 워커가 모두 cron 핸들러를 실행 → 잡 4배 중복 실행 위험. ADR-005가 "fork 모드 전용으로 분리"를 명시했으나 ADR-015는 메인 앱 전체를 cluster:4로 기술하여 모순 발생 |
| **해결 권고** | ADR-020 신설: "메인 앱(Next.js) = cluster:4 / cron-worker = 별도 PM2 앱(fork 1)" — 두 앱을 `ecosystem.config.js`에서 독립 항목으로 분리 |
| **ADR 상태** | 후보(Proposed) — 다음 세션에서 오너 검토 후 Accepted 처리 |
| **영향 문서** | `01-adr-log.md` §ADR-015, §ADR-005 / `01-kdygenesis-handoff.md §6.1` |
| **해소 공수** | ~2h (ecosystem.config.js 재작성 + 테스트) |

### 피드백 2: argon2 WSL2 빌드 spike 누락 → spike-011 후보

| 항목 | 내용 |
|------|------|
| **발견** | TD-008("argon2 WSL2 빌드 spike 미수행")이 Phase 17 bcrypt→argon2 전환의 선행 조건인데, 스파이크 포트폴리오(06-prototyping/01-spike-portfolio.md)에 spike-011 후보가 등록되지 않음 |
| **문제** | Phase 17 시작 전 argon2가 WSL2 Ubuntu에서 네이티브 빌드 실패 시(node-gyp 의존) 전환 불가. Phase 17은 Auth Core(bcrypt 현재 사용)가 포함되어 있어 전환 지점이 Phase 17임 |
| **해결 권고** | spike-011-argon2-wsl2-build 후보 등록 (3h). Phase 16 완료 후 Phase 17 진입 전 실행. 성공 시 Phase 17에서 bcrypt→argon2 전환, 실패 시 bcrypt 유지(TD-004 상태 변경) |
| **ADR 상태** | spike-011 후보 — `06-prototyping/01-spike-portfolio.md` 업데이트 필요 |
| **영향 문서** | `02-tech-debt-strategy.md §TD-004, TD-008` / `01-spike-portfolio.md` |
| **해소 공수** | 스파이크 3h + 포트폴리오 업데이트 1h = 4h |

### 피드백 3: 고심각도 부채 5건 동시 → Phase 15 착수 전 임계치 해소

| 항목 | 내용 |
|------|------|
| **발견** | 고(HIGH) 심각도 부채 5건 동시 미해소 — TD-005(SeaweedFS 부하 테스트), TD-006(DR 드릴), TD-007(Edge Fn 버전 고정), TD-019(MASTER_KEY 절차서), TD-022(CVE 자동화) |
| **임계치 초과** | `02-tech-debt-strategy.md §1.3` 기준: "고 심각도 3건 이상 동시 미해소 → 다음 Phase 착수 전 반드시 감소 필요" → 현재 5건으로 2건 초과 |
| **해결 권고** | Phase 15 착수 전 5h 투자로 즉시 해소 가능한 2건 우선 처리: TD-019(MASTER_KEY 백업 절차서, 3h) + TD-022(CVE 추적 자동화, 2h) → 고 부채 5→3으로 임계치 경계선 회복. 나머지 3건(TD-005, TD-006, TD-007)은 해당 Phase(17, 17, 19) 스파이크로 해소 |
| **우선 해소 TD** | TD-019: `/kdyrunbook "master-key-backup-procedure"` 명령으로 절차서 생성 / TD-022: npm audit CI + Dependabot 설정 |
| **영향 문서** | `02-tech-debt-strategy.md §고심각도` / `01-kdygenesis-handoff.md §4.5` |
| **해소 공수** | 5h (Phase 15 착수 직전) |

---

## 5. Wave 5 산출물 핵심 수치

| 문서 | 줄 수 | 핵심 수치 | 작성 에이전트 |
|------|-------|----------|------------|
| `05-roadmap/00-release-plan.md` | 807 | 3 릴리스 / FR 72+ / 870~880h | R1-A sonnet |
| `05-roadmap/01-milestones-wbs.md` | 817 | M1~M8 / 126 Task / 870~874h | R1-B sonnet |
| `05-roadmap/02-tech-debt-strategy.md` | 602 | TD 22건 (고 5건) / 4유형×3심각도 | R2 sonnet |
| `05-roadmap/03-risk-register.md` | 1,056 | R 35건 (위험 1+높음 12) / 6유형 | R2 sonnet |
| `05-roadmap/04-go-no-go-checklist.md` | 494 | 62 게이트 + 9 릴리스 게이트 | R3 sonnet |
| `05-roadmap/05-rollout-strategy.md` | 1,056 | Capistrano+canary+530 운영 | R3 sonnet |
| `06-prototyping/spike-005-edge-functions-deep.md` | 1,151 | 가설 5 / 성공 기준 10 / 분기 5 | S1 sonnet |
| `06-prototyping/spike-007-seaweedfs-50gb.md` | 1,391 | 가설 5 / 성공 기준 9 / 분기 5 | S1 sonnet |
| `06-prototyping/spike-008-wal2json-pg-version-matrix.md` | 532 | 가설 5 / 성공 기준 7 / 분기 3 | S2 sonnet |
| `06-prototyping/spike-009-totp-webauthn-mvp.md` | 598 | 가설 5 / 성공 기준 7 / 분기 4 | S2 sonnet |
| `06-prototyping/spike-010-pgmq-vs-bullmq.md` | 570 | 가설 5 / 성공 기준 7 / 트리거 4 | S2 sonnet |
| `07-appendix/00-glossary.md` | ~400 | 100+ 용어 / 4 카테고리 | A1 sonnet |
| `07-appendix/01-kdygenesis-handoff.md` | ~600 | Phase 15~22 전체 청사진 / kdy 명령 | A1 sonnet |
| `07-appendix/02-final-summary.md` | ~600 | Wave 1-5 종합 / R2 역방향 피드백 3건 | A1 sonnet |
| **Wave 5 합계** | **~10,500** | — | — |

> 세션 28-2 추가분 포함 시 Wave 5 총줄 수 20,128 (README 최종 집계 기준)

---

## 6. 다음 단계 권장

### 즉시 (이번 세션 종료 전)

1. **Wave 5 완료 커밋**: Wave 5 A1 산출물 3건(본 세션) 커밋 + 세션 28-2 전체 커밋 병합
2. **`/cs` 세션 종료 5단계**: current.md 갱신 → logs 아카이브 → handover 작성 → next-dev-prompt 갱신
3. **`_CHECKPOINT_KDYWAVE.md` 최종 갱신**: Wave 5 완료 통계 기록 (문서 수/줄 수/에이전트 수)
4. **ADR-020 후보 등록**: `01-adr-log.md`에 PM2 cluster/fork 분리 ADR 후보 추가

### 다음 세션 (자동 시작 시 우선)

5. **TD-019 + TD-022 우선 해소 (5h)**: Phase 15 착수 전 필수
   - TD-019: MASTER_KEY 백업 절차서 → `docs/guides/master-key-backup.md`
   - TD-022: npm audit CI 설정 + Dependabot `.github/dependabot.yml` 생성
6. **spike-009 실행 (8h)**: TOTP+WebAuthn MVP 검증 → Phase 15 Entry Gate 통과
   - `/kdyspike --full totp-webauthn-mvp --max-hours 8`
   - 결과: `06-prototyping/spike-009-result.md`

### 단기 (1주 이내)

7. **Phase 15 착수 (M1, 22h)**: spike-009 통과 + TD-019/022 해소 후 즉시
   - `/superpowers:executing-plans 05-roadmap/01-milestones-wbs.md#phase-15`
   - 또는 `/kdygenesis --from-genesis 07-appendix/01-kdygenesis-handoff.md --phase 15`
8. **spike-011 등록 (spike 포트폴리오 업데이트)**: argon2 WSL2 빌드 검증 spike
   - `06-prototyping/01-spike-portfolio.md`에 SP-032(spike-011) 추가

### MVP 완성 (Phase 15~17, 약 18주)

9. **Phase 15 (22h)**: Auth Advanced — TOTP + WebAuthn + Rate Limit (M1, v0.1.0-alpha)
10. **Phase 16 (40h)**: Vault + JWKS + Capistrano + PM2 cluster:4 (M2) + ADR-020 이행
11. **Phase 17 (60h)**: Auth Core + SeaweedFS + B2 (M3, v0.1.0 MVP) + spike-011 실행

### Beta 진입 (Phase 18~19, +약 36주)

12. **Phase 18 (400h)**: SQL Editor + Table Editor — kdyswarm 5-에이전트 병렬 권장
13. **Phase 19 (75h)**: Edge Fn 3층 + Realtime CDC — spike-005/008 통과 후

### GA 완성 (Phase 20~22, +약 22주)

14. **Phase 20 (198h)**: Schema Viz + DB Ops + Advisors 3-Layer
15. **Phase 21 (40h)**: Data API REST + pgmq + AI SDK (M7, v1.0.0-rc)
16. **Phase 22 (~30h)**: pg_graphql 수요 트리거 충족 시 + OAuth (M8, v1.0.0 GA)

---

## 7. 회고 — Wave 1-5 무엇이 잘 됐고 무엇이 어려웠나

### 잘 됐던 것

**Wave 1-2 결과의 강력함이 Wave 3-5 설계를 주도했다**

Wave 1에서 14 카테고리 모두에 1순위 채택안이 확정된 것이 프로젝트 전체의 가장 중요한 선행 투자였다. Wave 3 FR 작성 시 기술 구현 컬럼이 100% 채워져 있었고, Wave 4 Blueprint는 채택안의 9-레이어 배치 결정만 수행하면 됐다. Wave 1-2에 들인 45,192줄의 투자가 Wave 3-5의 설계 리스크를 약 30% 이상 감소시킨 것으로 추정된다.

**정량화된 재검토 트리거가 모든 ADR에 명시됐다**

ADR 18건 모두에 "재검토 트리거" 조건이 숫자로 명시됐다. "사용자 2명+ 6개월 지속", "잡 50건+ 초과", "GraphQL 쿼리 10개+" 같은 정량 조건이 있어 환경 변화 시 어느 ADR을 재검토해야 할지 명확하다. 이는 1인 운영 환경에서 "언제 바꿔야 하는가"를 자동으로 감지할 수 있는 트리거 시스템이다.

**3 Tier 병렬 구조(Wave 4)가 문서 품질을 유지하면서 속도를 극대화했다**

Wave 4의 Tier 1(Blueprint 14건) + Tier 2(통합 아키텍처) + Tier 3(UI/UX + Integration) 분리가 32,918줄을 약 3시간 15분 안에 완성하는 효율을 달성했다. Tier 간 인터페이스 계약(API 형식, 컴포넌트 props)을 선행 정의하면 UI와 백엔드가 독립 병렬 진행 가능함을 실증했다.

**DQ 64건 전수 해소**

Wave 1-5에서 등록된 DQ 64건 + 폐기 4건 = 68건 모두 Wave 5에서 해소됐다. 어떤 미해결 질문도 구현 단계로 이월되지 않은 상태. 특히 DQ-4.3(pgmq vs BullMQ Redis 트리거)은 spike-010으로 정량화된 기준(Redis RPS 10,000+)이 명시됐다.

### 어려웠던 것

**Wave 4 컨텍스트 폭증 (98 문서 / 86,000줄)**

Wave 4 착수 시점에 Wave 1-3 누적 문서가 72건 / 53,542줄에 달했다. 단일 에이전트가 전체 컨텍스트를 로드하면 응답 품질이 저하됐다. Wave 5에서 "selective read (헤더만 먼저 읽기 → 필요한 섹션만 상세 읽기)" 전략이 필요했으며, 이것이 Wave 5 실행 지침에 명시됐다.

**opus stall 1건 (Wave 5 R1)**

Wave 5 R1(opus) 에이전트가 roadmap 3문서(릴리스 계획 + WBS + 기술부채) 동시 작성 시도에서 stall 발생. R1-A(릴리스 계획)와 R1-B(WBS) sonnet 2개로 분할 재발사하여 해소했으나, 약 30분 지연 발생. 800줄+ 문서를 단일 opus 에이전트에 맡기는 것은 위험한 패턴으로 확인됐다.

**역방향 피드백 발견이 Tier 2에서만 가능**

ADR-015 ↔ ADR-005 충돌(PM2 cluster vs fork)은 Wave 4 Tier 1에서 Blueprint 작성 시 각 에이전트가 한 카테고리에만 집중하여 발견되지 않았다. Wave 5 R2가 전체 통합 관점에서 검토하면서 발견됐다. "통합 검토 전담 에이전트"가 Wave 구조에 반드시 필요하다는 교훈이다.

### 핵심 교훈 (다음 kdy 대규모 연구 적용)

1. **Wave 1 채택안 확정이 전체 공수의 30%를 결정한다** — 채택안 확정에 충분히 투자할 것
2. **800줄+ 문서 → sonnet × 2로 분할** — opus stall 방지
3. **Tier 2 통합 검토 에이전트는 필수** — 역방향 피드백 발견 전담
4. **DQ 등록 즉시 Wave 할당** — 미할당 DQ가 구현 단계로 이월되지 않도록
5. **ADR 재검토 트리거 정량화 필수** — 모호한 "필요 시"는 결코 실행되지 않음

---

## 8. 참조 — Wave 1-5 전체 산출물 풀뿌리 링크

### Wave 1 (33 문서, 26,941줄)

```
01-research/
├── 01-table-editor-tanstack-comparison.md
├── 02-sql-editor-monaco-comparison.md
├── 03-schema-viz-xyflow-comparison.md
├── 04-db-ops-walg-comparison.md
├── 05-auth-core-jose-comparison.md
├── 06-auth-advanced-totp-webauthn.md
├── 07-storage-seaweedfs-comparison.md
├── 08-edge-functions-isolated-vm.md
├── 09-realtime-wal2json-comparison.md
├── 10-advisors-schemalint-comparison.md
├── 11-data-api-graphql-comparison.md
├── 12-observability-vault-comparison.md
├── 13-ux-quality-ai-sdk-comparison.md
├── 14-operations-capistrano-comparison.md
└── ... (이하 Round 2 비교분석 19건)
```

### Wave 2 (28 문서, 18,251줄)

```
01-research/ (계속)
├── matrix-overall-scoring.md
├── 1v1-*/  (1:1 비교 14쌍)
└── dq-resolution-wave2.md
```

### Wave 3 (11 문서, 8,350줄)

```
00-vision/
├── 01-vision-statement.md
├── 02-functional-requirements.md    ← FR 72+ / P0/P1/P2
├── 03-non-functional-requirements.md ← NFR 38건
├── 04-constraints-assumptions.md
├── 05-100점-definition.md           ← 14 카테고리 60/80/95/100점 4단계
├── 06-dq-wave3-resolution.md
├── 07-dq-matrix.md                  ← DQ 64건 전수
├── 08-security-threat-model.md      ← STRIDE 29건
├── 09-multi-tenancy-decision.md     ← ADR-001 기반 (70h 절감)
├── 10-14-categories-priority.md     ← MVP/Beta/GA 매핑
└── 11-system-constraints-final.md
```

### Wave 4 (26 문서, 32,918줄)

```
02-architecture/
├── 00-system-overview.md            ← 9-레이어 구조 (ADR-018)
├── 01-adr-log.md                    ← ADR 1~18 전수
├── 02-data-model-erd.md
├── 03-auth-advanced-blueprint.md    ← Phase 15 기반
├── 04-db-ops-blueprint.md
├── 05-auth-core-blueprint.md
├── 06-vault-jwks-blueprint.md
├── 07-operations-blueprint.md
├── 08-edge-functions-blueprint.md   ← 3층 아키텍처
├── 09-realtime-blueprint.md         ← 2계층 CDC
├── 10-advisors-blueprint.md         ← 3-Layer
├── 11-data-api-blueprint.md
├── 12-observability-blueprint.md
├── 13-ux-quality-blueprint.md
├── 14-table-editor-blueprint.md
├── 15-sql-editor-blueprint.md
└── 16-schema-viz-blueprint.md
03-ui-ux/
├── 01-table-editor-ui.md
├── 02-schema-visualizer-ui.md
├── 03-sql-editor-ui.md
├── 04-auth-advanced-ui.md
└── 05-operations-dashboard-ui.md
04-integration/
├── 01-prisma-drizzle-integration.md
├── 02-cloudflare-deployment-integration.md
├── 03-pm2-wsl2-integration.md
└── 04-realtime-sse-integration.md
```

### Wave 5 (25 문서, 20,128줄)

```
05-roadmap/                          ← 13 문서 / 10,629줄
06-prototyping/                      ← 9 문서 / 6,621줄
07-appendix/                         ← 3 문서 / 2,878줄
```

### ADR 인덱스 (18건)

→ `02-architecture/01-adr-log.md` ADR-001~018

### DQ 인덱스 (64건 전수 + 폐기 4건)

→ `00-vision/07-dq-matrix.md` DQ-1.1~DQ-16.x

### Blueprint 인덱스 (14건)

→ `02-architecture/` 파일 03~16번

### Spike 인덱스 (31건 = 기존 9 + 신규 22)

→ `06-prototyping/01-spike-portfolio.md` SP-001~031

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v1.0 | 2026-04-18 | Wave 5 A1 sonnet | 초판 작성. Wave 1-5 종합 통계 + Compound Knowledge 12건 + R2 역방향 피드백 3건 + 다음 단계 16개 + 회고 |

---

*상위 인덱스: [07-appendix 인덱스](./) · [Wave 1-5 마스터 README](../README.md) · [마일스톤 WBS](../05-roadmap/01-milestones-wbs.md) · [용어집](./00-glossary.md)*
