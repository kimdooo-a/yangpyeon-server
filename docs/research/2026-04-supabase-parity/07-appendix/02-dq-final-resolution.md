# 02. DQ 최종 해결 (Final Resolution) — 양평 부엌 서버 대시보드

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.
> ⚠️ **ADR 번호 placeholder 충돌 정정 (2026-04-25)**: 본 문서의 "ADR-020: 마이그레이션 롤백 5초 구현 패턴(Phase 16 스파이크 결과)"은 실제 ADR-020(standalone+rsync+pm2 reload, 세션 50)과 충돌. 마이그레이션 롤백 패턴 후보는 향후 **ADR-022** 슬롯으로 재할당 권장.

> Wave 5 · Tier 2 (A1) 산출물 — kdywave W5-A1 (Agent Appendix-1)
> 작성일: 2026-04-18 (세션 28+)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [07-appendix/](./) → **이 문서**
> 연관: [01-glossary.md](./01-glossary.md) · [03-genesis-handoff.md](./03-genesis-handoff.md) · [`../00-vision/07-dq-matrix.md`](../00-vision/07-dq-matrix.md) · [`../02-architecture/01-adr-log.md`](../02-architecture/01-adr-log.md)

---

## 목차

- [1. DQ 매트릭스 개요](#1-dq-매트릭스-개요)
- [2. Wave 1 DQ 9건 최종 답변 확인](#2-wave-1-dq-9건-최종-답변-확인)
- [3. Wave 3 DQ 20건 해결 확인](#3-wave-3-dq-20건-해결-확인)
- [4. Wave 4 DQ 28건 해결 확인](#4-wave-4-dq-28건-해결-확인)
- [5. Wave 5 DQ 16건 최종 답변 (이 세션)](#5-wave-5-dq-16건-최종-답변-이-세션)
- [6. DQ 답변 → 문서 영향 맵](#6-dq-답변--문서-영향-맵)
- [7. 폐기 DQ 4건 재확인](#7-폐기-dq-4건-재확인)
- [8. 잔여 열린 질문 (Long-Open DQ)](#8-잔여-열린-질문-long-open-dq)
- [9. ADR 재검토 트리거 인덱스 (45건)](#9-adr-재검토-트리거-인덱스-45건)

---

## 1. DQ 매트릭스 개요

### 1.1 전수 통계

| 구분 | 건수 | 상태 | 위치 |
|------|------|------|------|
| Wave 1 잠정 답변 | 9건 | ✅ 확정 (DQ-1.1~1.9) | Wave 1 Round 1-2 |
| Wave 2 추가 확정 | 1건 | ✅ 확정 (DQ-12.3) | Wave 2 F 매트릭스 |
| Wave 3 답변 | 20건 | ✅ 확정 (FR/NFR/ASM 반영) | Wave 3 Vision Suite |
| Wave 4 답변 | 28건 | ✅ 확정 (Blueprint 본문) | Wave 4 청사진 14개 |
| **Wave 5 답변 (본 문서)** | **16건** | ✅ **이 세션에서 확정** | 본 §5 |
| 폐기 DQ | 4건 | ⓧ 무효화 | 본 §7 |
| **합계 (폐기 포함)** | **78건** | — | — |
| **합계 (유효)** | **64건 + 잠정 9건 + 확정 1건 = 74건** | — | — |

**주**: Wave 3 DQ 매트릭스 문서(`00-vision/07-dq-matrix.md`)가 정의한 64건은 "Wave 2 이후 신규 미답변"을 지칭하며, DQ-1.1~1.9 및 DQ-12.3은 이미 확정된 10건과 구별된다. 본 문서는 둘 다 포함해 "전수 74건"을 관리한다.

### 1.2 Wave별 DQ 해결 매핑

```
Wave 1 → 9건  (DQ-1.1~1.9, 잠정 답변)
Wave 2 → 1건  (DQ-12.3, 추가 확정)
Wave 3 → 20건 (FR/NFR/CON/ASM에 반영)
Wave 4 → 28건 (Blueprint 14개 본문에 반영)
Wave 5 → 16건 (본 문서에서 최종 확정)
폐기   → 4건  (DQ-1.5 Edge / DQ-1.6 Edge / DQ-UX-1 / DQ-UX-2)
```

### 1.3 답변 품질 기준

모든 DQ 답변은 다음 4가지 품질 기준을 충족해야 한다.

1. **정량 (Quantitative)**: 수치/임계값/조건이 명시되어야 한다.
2. **출처 (Sourced)**: Wave 1-5 문서 §로 근거가 추적 가능해야 한다.
3. **재검토 가능 (Revisable)**: 재검토 트리거를 최소 1개 명시한다.
4. **비파괴 (Non-destructive)**: 답변이 바뀌어도 기존 산출물의 구조를 파괴하지 않도록 트레이드오프를 기재한다.

---

## 2. Wave 1 DQ 9건 최종 답변 확인

Wave 1 Round 1/2에서 잠정 답변으로 확정된 DQ 9건을 Wave 2~4에서 강화 여부를 포함해 재검토한다.

| DQ# | 카테고리 | Wave 1 잠정 답변 | Wave 2-4 강화 확인 | ADR 매핑 |
|-----|---------|----------------|-------------------|---------|
| **DQ-1.1** | Auth Advanced | TOTP + WebAuthn 동시 지원 | Wave 2 C 매트릭스 4.59/5 유지 / Wave 4 B1 Blueprint 22h WBS | ADR-007 |
| **DQ-1.2** | Auth Advanced | PostgreSQL/Prisma 어댑터 (Rate Limit) | Wave 2 C 재검증 / Wave 4 B1 `rate_limit_events` 테이블 확정 | ADR-007 |
| **DQ-1.3** | Storage | SeaweedFS 단독 채택 | Wave 2 D 4.25/5 / Wave 4 B3 Blueprint + B2 오프로드 | ADR-008 |
| **DQ-1.4** | Edge Functions | 3층 하이브리드 (isolated-vm v6 + Deno 사이드카 + Sandbox 위임) | Wave 2 D 4.22/5 + `decideRuntime()` 코드 / Wave 4 B3 40h WBS | ADR-009 |
| **DQ-1.5** | Realtime | wal2json + supabase-realtime 포팅 하이브리드 | Wave 2 E "경쟁이 아니라 역할 분담" 결론 / Wave 4 B5 2계층 설계 + Slot 2개 분리 | ADR-010 |
| **DQ-1.6** | Data API | pg_graphql 1순위 (도입은 수요 트리거 시) | Wave 2 F 4.29/5 + 4 수요 트리거 정량화 / Wave 4 B5 REST 강화 + 조건부 스키마 | ADR-012, ADR-016 |
| **DQ-1.7** | Data API | pgmq 메인 + SQLite 보조 | Wave 2 F 재검증 / Wave 4 B5 Outbox 패턴 + dead-letter queue 설계 | ADR-012 |
| **DQ-1.8** | Observability | node:crypto AES-256-GCM + envelope (KEK→DEK) | Wave 2 F 0.87 권고도 + 92.54/94.20 KMS 대비 우위 / Wave 4 B2 Blueprint | ADR-013 |
| **DQ-1.9** | Table Editor | TanStack v8 자체구현 + 14c-α | Wave 2 A 4.54/5 유지 / Wave 4 B4 4단계 WBS (14c-α~14e) | ADR-002 |

**Wave 2-4 강화 결론**: 9건 모두 **역방향 피드백 0건**. Wave 1 채택안이 Wave 2 매트릭스/1:1 비교, Wave 3 FR 매핑, Wave 4 청사진에서 모두 재검증되어 강화되었다.

### 2.1 Wave 2 추가 확정 1건

| DQ# | 카테고리 | 답변 | 출처 |
|-----|---------|------|------|
| **DQ-12.3** | Observability | MASTER_KEY = `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file` | Wave 2 F 매트릭스 676줄 / ADR-013 |

---

## 3. Wave 3 DQ 20건 해결 확인

Wave 3에서 FR/NFR/CON/ASM에 반영된 20건을 테이블로 정리한다.

| DQ# | 카테고리 | 최종 답변 | 반영 문서 |
|-----|---------|----------|----------|
| **DQ-1.10** | Table Editor | 가상 스크롤은 14d 단계에서 도입 (현재 11 테이블 1만 행 미만) | `02-functional-requirements.md` FR-TE.4 |
| **DQ-1.11** | Table Editor | Papa Parse 정식 도입 (자체 파서 엣지케이스 리스크 회피) | FR-TE.5 |
| **DQ-1.12** | Table Editor | FK 셀렉터 = cmdk (기존 의존성 + shadcn 일관성) | FR-TE.6 |
| **DQ-1.15** | Table Editor | 로그 Explorer 비전 **없음** (현재 14 카테고리 범위로 충분) | `00-product-vision.md §A4` |
| **DQ-1.16** | Table Editor | WCAG 2.2 AA 필수 (Glide Data Grid 즉시 탈락 근거) | `03-non-functional-requirements.md` NFR-A11Y.1 |
| **DQ-2.1** | Table Editor | cmdk 유지 (use-downshift 재검토 불필요) | FR-TE.6 |
| **DQ-2.2** | Table Editor | Papa Parse Workers는 14e에서 도입 (14d는 메인 스레드 + 100행 dry-run) | FR-TE.5, NFR-PERF.3 |
| **DQ-2.3** | Table Editor | TanStack Query는 14e에서 도입 (현재 useState+수동 setRows 충분) | NFR-MAINT.2 |
| **DQ-3.5** | Schema Viz | Monaco 채택 (CodeMirror 6 대비 SQL Editor와 일관성 우위) | NFR-BUNDLE.2 |
| **DQ-3.6** | Schema Viz | schemalint CI 통합 + PR 차단 채택 | NFR-OPS.3, CON 추가 |
| **DQ-3.7** | Schema Viz | RLS 편집 = 시각(드롭다운+빌더) + 코드(raw) 듀얼 탭 | FR-SV.5, NFR-UX.2 |
| **DQ-3.8** | Schema Viz | Trigger 함수 언어 = plpgsql only (보안 위험 + 운영자 학습 비용 회피) | CON-11 추가 |
| **DQ-3.13** | Schema Viz | schemalint 커스텀 룰 언어 = TypeScript (프로젝트 컨벤션) | NFR-DX.2 |
| **DQ-3.14** | Schema Viz | Monaco 테마 = vs-dark 기본 (커스텀 토큰 덮어쓰기 가능) | NFR-UX.4 |
| **DQ-4.4** | DB Ops | 잡 결과 영속화 = 성공 30일 + 실패 90일 (audit log 일관) | CON |
| **DQ-4.6** | DB Ops | 수동 실행 권한 = admin/owner만 + audit log 필수 | FR-DBOPS.5, NFR-SEC.7 |
| **DQ-4.7** | DB Ops | 잡 연속 실패 시 자동 비활성화 **안 함** (알림만, 운영자 판단) | FR-DBOPS.6 |
| **DQ-4.8** | DB Ops | cron timezone = "Asia/Seoul" 강제 (UTC 혼동 방지) | NFR-OPS.5 |
| **DQ-4.10** | DB Ops | 백업 원격 스토리지 = Backblaze B2 (기존 사용 중, $0.3/월) | NFR-BACKUP.1 |
| **DQ-4.12** | DB Ops | 백업 보존 = 베이스 7개 + WAL 14일 (14일 PITR) | NFR-BACKUP.3 |

**추가 Wave 3 답변** (20건에 포함되지 않은 잠정 답변 목록은 Matrix `§4 Wave 3 주요 DQ 목록`에 전수): DQ-4.13 / DQ-4.14 / DQ-4.15 / DQ-4.16 / DQ-4.17 / DQ-AC-3 / DQ-AC-5 / DQ-AC-6 / DQ-AC-7 / DQ-AC-8 / DQ-AC-9 / DQ-AC-10 / DQ-AC-11 / DQ-AC-12 / DQ-AC-13 / DQ-AA-1 / DQ-AA-2 / DQ-AA-4 / DQ-AA-5 / DQ-AA-6 / DQ-AA-7 / DQ-AA-10 / DQ-ADV-2 / DQ-ADV-3 / DQ-ADV-4 / DQ-ADV-6 / DQ-12.1 / DQ-12.2 / DQ-12.7 / DQ-12.8 / DQ-UX-3 / DQ-AI-2 / DQ-OPS-2.

각 DQ가 FR/NFR/CON/ASM 어느 항목에 반영됐는지는 `00-vision/07-dq-matrix.md §4`와 대응한다.

---

## 4. Wave 4 DQ 28건 해결 확인

Wave 4 청사진 14개 Blueprint에서 답변된 28건을 테이블로 정리한다.

| DQ# | 카테고리 | 최종 답변 | Blueprint 출처 |
|-----|---------|----------|--------------|
| **DQ-2.4** | SQL Editor | EXPLAIN Visualizer = 자체 d3 트리 구현 (pev2 Vue wrapper 대신, 의존성 경감) | `08-sql-editor-blueprint.md §5` |
| **DQ-2.5** | SQL Editor | sql-formatter = 서버 라우트 `/api/sql/format` (일관성 + 번들 경감) | `08-sql-editor-blueprint.md §4` |
| **DQ-2.6** | SQL Editor | AI 라우트 격리 = 14e까지 DB 레벨(`app_readonly` + `BEGIN READ ONLY` + statement_timeout) / 14g 이후 컨테이너 추가 | `08-sql-editor-blueprint.md §6` |
| **DQ-3.1** | Schema Viz | 관계 자동 추론 = 컬럼명 휴리스틱(`userId → user.id`) 구현 (레거시 DB 대비) | `12-schema-visualizer-blueprint.md §3` |
| **DQ-3.2** | Schema Viz | 행 selector 모달을 별도 컴포넌트 (`/components/data/foreign-key-picker.tsx`)로 분리 재사용 | `12-schema-visualizer-blueprint.md §4` |
| **DQ-3.4** | Schema Viz | ERD 레이아웃 저장 = 별도 `user_preferences` 테이블 (User 스키마 변경 방지) | `12-schema-visualizer-blueprint.md §5`, `02-data-model-erd.md §3` |
| **DQ-3.9** | Schema Viz | Trigger 비활성화 토글 = 1클릭 UI + audit log 필수 | `12-schema-visualizer-blueprint.md §6` |
| **DQ-3.10** | Schema Viz | Function rename = ALTER FUNCTION RENAME (DROP+CREATE 대신, 참조 무결성 보존) | `12-schema-visualizer-blueprint.md §7` |
| **DQ-3.11** | Schema Viz | Policy 삭제 시 의존성 분석 경고 ("N명이 X 테이블 접근 못 함") 구현 (Phase 14e 후속) | `12-schema-visualizer-blueprint.md §8` |
| **DQ-3.12** | Schema Viz | RLS 정책 저장 후 ERD 자동 새로고침 = `revalidatePath('/database/schema')` | `12-schema-visualizer-blueprint.md §9` |
| **DQ-3.15** | Schema Viz | "마지막 허용 정책" 삭제 경고 = Phase 14e-9에서 구현 | `12-schema-visualizer-blueprint.md §10` |
| **DQ-4.5** | DB Ops | 잡 알림 채널 = Webhook 모델 재사용 (Slack/Discord 공통) | `13-db-ops-blueprint.md §5` |
| **DQ-4.9** | DB Ops | lock timeout vs job timeout = 통합 (job timeout이 lock timeout 역할 겸함) | `13-db-ops-blueprint.md §6` |
| **DQ-4.11** | DB Ops | 복원 검증 자동화 = 매월 1일 staging container 복원 + 결과 webhook | `13-db-ops-blueprint.md §7` |
| **DQ-4.18** | DB Ops | 복원 후 audit_log 별도 보관 = restore-event 기록 필수 | `13-db-ops-blueprint.md §8` |
| **DQ-4.19** | DB Ops | CronJobRun output 크기 = 10KB 제한 + 초과 시 truncate + S3 링크 | `13-db-ops-blueprint.md §9` |
| **DQ-4.20** | DB Ops | advisory lock key 충돌 = sha256 64비트 → 2^32 잡까지 ~0%, 무시 가능 | `13-db-ops-blueprint.md §10` |
| **DQ-4.21** | DB Ops | wal-g backup-verify 주기 = 토요일 03:00 | `13-db-ops-blueprint.md §11` |
| **DQ-4.23** | DB Ops | Backup kind = string literal union (enum 마이그레이션 비용 회피) | `13-db-ops-blueprint.md §12` |
| **DQ-AA-8** | Auth Advanced | JWT refresh rotation = `revokedAt` + `tokenFamily` **하이브리드** (reuse 감지 시 family 전체 무효화) | `03-auth-advanced-blueprint.md §7` |
| **DQ-ADV-5** | Advisors | 룰 음소거 만료 = 30일 자동 해제 + 연장 가능 | `14-advisors-blueprint.md §5` |
| **DQ-ADV-7** | Advisors | schemalint unit test fixture = pgsql-ast-parser (shadow DB 대신, 테스트 속도) | `14-advisors-blueprint.md §6` |
| **DQ-RT-1** | Realtime | WebSocket 서버 위치 = 별도 PM2 프로세스 (`realtime-worker`) | `11-realtime-blueprint.md §4` |
| **DQ-RT-2** | Realtime | access_token 재발급 주기 = JWT 만료(1h)마다 + 5분 grace | `11-realtime-blueprint.md §5` |
| **DQ-RT-4** | Realtime | pg_notify = wal2json 이벤트 변환 계층에서 **자동** 발송 | `11-realtime-blueprint.md §6` |
| **DQ-RT-5** | Realtime | Replication Slot = wal2json(CDC) + supabase-realtime 포팅(Channel) **2개 분리** | `11-realtime-blueprint.md §7` |
| **DQ-1.25** | Data API | Persisted Query = pg_graphql 도입 시에만 허용, ad-hoc 쿼리 거부 | `15-data-api-blueprint.md §4` |
| **DQ-1.26** | Data API | GraphQL Subscription = Realtime 포팅 + 통합 endpoint `/graphql/realtime` | `15-data-api-blueprint.md §5` |
| **DQ-1.27** | Data API | introspection CI = `prisma db pull` + `pg_graphql introspection diff` 검증 | `15-data-api-blueprint.md §6` |
| **DQ-1.31** | Data API | pgmq archive 정리 = pg_cron 대신 **node-cron** (pg_cron 미채택 정책과 일관) | `15-data-api-blueprint.md §7` |
| **DQ-1.32** | Data API | pgmq dead-letter 알림 = Slack webhook (Advisors와 공통 채널) | `15-data-api-blueprint.md §8` |
| **DQ-11.1** | Data API | operator parser JSONB path = Prisma 7 JsonFilter 호환 검증 후 지원 | `15-data-api-blueprint.md §9` |
| **DQ-11.3** | Data API | pgmq worker = PM2 fork mode 2개 고정 (dynamic scaling은 부담) | `15-data-api-blueprint.md §10` |
| **DQ-12.13** | Observability | 긴급 JWKS 회전 시 refresh_token = 세션 버전 번호 증가(블랙리스트보다 경량) | `04-observability-blueprint.md §6` |
| **DQ-AI-1** | UX Quality | AI 챗 메시지 = 영구 저장 (`AiThread` + `AiMessage` 모델, 검색/감사 목적) | `16-ux-quality-blueprint.md §4` |

**Wave 4 강화 확인**: 28건 모두 Blueprint 본문 내 §로 명시적 답변 + 재검토 트리거 존재. 신규 ADR로 승격된 사례는 없음 (대부분 Blueprint 내부 결정 수준).

---

## 5. Wave 5 DQ 16건 최종 답변 (이 세션)

본 세션에서 확정하는 Wave 5 할당 DQ 16건 상세 답변. 각 DQ는 **배경 + 답변 + 근거 + 재검토 트리거 + 문서 영향**의 5단 구조로 작성.

---

### DQ-1.13 [Table Editor] AG Grid 전환 합리성

**Wave 5 최종 답변**: **비도입 (유지 결정)**. TanStack Table v8 + 14c-α 자체구현을 유지한다. AG Grid 전환은 다음 **단일 트리거** 충족 시에만 재검토한다: "테이블 row 수 100만 초과 + p95 렌더링 > 1.2s이 2주 연속 지속" (ADR-002 재검토 트리거 #1). 2026-04 현재 양평의 11개 주요 테이블은 모두 1만 행 미만이며, 14c-α 기반 성능 벤치마크(Wave 4 B4 Blueprint)에서 p95 < 400ms로 여유가 충분하다. AG Grid 전환은 (a) 상용 라이선스 $999/개발자 (CON-7 오픈소스 원칙 위반), (b) 기존 shadcn/ui 토큰 통합 파기, (c) 14c-α/β 자산 50h 폐기를 동시 요구하므로 ROI 음수.

**근거**: ADR-002, `01-research/01-table-editor/02-deep-aggrid.md §35`, Wave 2 A 매트릭스 568줄.

**재검토 트리거**: (1) 단일 테이블 100만 행 + p95>1.2s 2주 지속, (2) TanStack Table v9 major release에서 v8 ABI 깨짐 + 마이그레이션 공수 > 50h, (3) MIT/Apache-2.0 라이선스의 AG Grid 대체 라이브러리 출현.

**문서 영향**: ADR-002 재검토 트리거 섹션에 "Wave 5 DQ-1.13에서 재확인됨" 주석 추가. `09-table-editor-blueprint.md` 결론부에 "AG Grid 비도입 재확정" 한 줄 추가.

---

### DQ-1.14 [Table Editor] Enterprise 라인 도입 가능성

**Wave 5 최종 답변**: **영구 비도입**. AG Grid Enterprise 라인의 핵심 기능(Row Grouping / Pivoting / Master-Detail / Excel Export)은 양평의 도메인 영역(Supabase Studio 동등 Table Editor)과 무관하다. 양평은 "관리 대시보드"이지 "BI 도구"가 아니다. Wave 3 `00-product-vision.md §A4`에서 확정된 14 카테고리 범위에 엔터프라이즈 그리드 수요가 포함되지 않았다. 더불어 Enterprise 라이선스는 사용자당 $999+이며, Wave 3 비전의 "월 $10 이하 운영" (AP-5) 원칙을 근본적으로 위배한다.

**근거**: `00-product-vision.md §A4`, `01-research/01-table-editor/02-deep-aggrid.md §36`, Wave 1 DQ-1.14 잠정 답변.

**재검토 트리거**: (1) 양평이 B2B SaaS로 전환되어 외부 고객에게 BI 기능 제공 (ADR-001 재검토 트리거 #2와 동시 발동), (2) "관리 대시보드" 범위를 벗어나는 새 카테고리 추가 결정.

**문서 영향**: `00-product-vision.md §A4` 비전 제약 재확인. ADR-002의 영구 비도입 근거로 인용.

---

### DQ-3.3 [Schema Viz] 스튜디오 임베드 검토 (Prisma Studio / drizzle-kit Studio)

**Wave 5 최종 답변**: **영구 임베드 거부**. Prisma Studio, drizzle-kit Studio 모두 iframe 또는 리버스 프록시 임베드 방식을 거부한다. Wave 2 B 매트릭스에서 INTEG 점수 -2.5 / SEC 점수 -2.5의 치명적 갭이 확인됐다. 구체적으로 (a) 도메인 분리 (Prisma Studio 기본 포트 5555) → Auth 쿠키 통합 비용 30h+, (b) 다크 테마 강제 커스터마이징 불가, (c) 한국어 UI 부재, (d) 운영자 로그인 세션과 별도 인증이 **2중 인증 피로** 유발. Wave 4 B6 Blueprint가 schemalint + @xyflow + elkjs 자체구현으로 동일 기능 50h에 도달하며, 외부 도구 임베드 도입 30h + 유지보수 간접비를 넘어선다.

**근거**: Wave 2 B 매트릭스 577줄, ADR-004, `01-research/03-schema-visualizer/02-deep-prisma-studio.md §40`.

**재검토 트리거**: (1) Prisma Studio가 공식 headless/embeddable 모드 + 커스텀 테마 API + JWT SSO 어댑터를 동시 제공 (불가능에 가까움), (2) 양평 자체 Schema Viz 유지보수 공수가 주당 2시간 초과.

**문서 영향**: ADR-004 재검토 트리거에 "Prisma Studio 임베드 옵션 공식 제공 시" 추가. `12-schema-visualizer-blueprint.md §1` 결론부에 "외부 도구 임베드 영구 거부 재확인" 주석.

---

### DQ-4.1 [DB Ops] PM2 cluster 전환

**Wave 5 최종 답변**: **cluster:4 채택 확정 (fork에서 cluster로 전환)**. Wave 1 당시 "fork 유지"로 잠정 답변됐으나, Wave 4 운영 Blueprint(`05-operations-blueprint.md §3`)에서 다음을 근거로 cluster:4로 상향 확정: (1) **가용성**: fork 단일 프로세스는 메모리 누수 발생 시 전체 다운 → cluster는 worker 1개 실패 시 나머지 3개로 계속 서비스. (2) **무중단 배포**: PM2 `pm2 reload` = rolling restart. fork는 `pm2 restart`가 1-2초 다운타임. (3) **CPU 활용**: WSL2 Ubuntu 할당 CPU 4코어를 4 worker가 병렬 소비. 단, **cron 작업은 별도 `cron-worker` fork 모드 앱으로 분리** (cluster에서 node-cron 중복 실행 방지, Wave 4 ADR-005 부록 §2.4 참조). 세션 상태는 PostgreSQL Session 테이블 공유로 worker 간 일치 보장.

**근거**: ADR-015, `05-operations-blueprint.md §3`, `01-research/04-db-ops/01-deep-node-cron.md §35`.

**재검토 트리거**: (1) 월간 트래픽 100만 요청 초과 → cluster:8로 확장 검토 (ADR-015 재검토 트리거 #1 연동), (2) WSL2 CPU 할당 2코어 이하로 축소되는 예외 상황, (3) Redis 세션 스토어 도입 제안 (현재는 PG Session 테이블로 충분).

**문서 영향**: ADR-015 "cluster:4 고정" 기존 결정 재확인. DQ 매트릭스 상 "fork 유지" 잠정 답변을 "cluster:4 확정"으로 상향 정정. `02-functional-requirements.md` FR-OPS.3에 반영됨.

**세션 30 (2026-04-19) SP-010 실측 보강**:
- Node `cluster` 모듈 fork vs cluster:4 RPS = **×1.40 (+39.9%)** · autocannon 50 conn × 10s
- SQLite WAL 4 worker_threads 10s × 50 writes/s = SQLITE_BUSY **0.000% (0/1968)**
- node-cron 중복 방지는 PG `pg_try_advisory_lock` 공식 보증으로 축약
- **즉시 전환 여부**: 현재 트래픽 기준 **Phase 16 이전에는 fork 유지** 권장. Phase 16 착수 시점에 재측정 후 전환
- **치명적 운영 규칙**: `pm2 delete all` 명령 금지 (namespace 필터 무시 버그, `dashboard`/`cloudflared` 삭제 사고 발생 → `pm2 resurrect`로 복구)
- 상세: `docs/research/spikes/spike-010-pm2-cluster-result.md`, `docs/solutions/2026-04-19-pm2-delete-all-namespace-bug.md`

---

### DQ-4.2 [DB Ops] pg_cron 도입

**Wave 5 최종 답변**: **영구 비도입**. Node 핸들러가 80% 로직이므로 pg_cron 도입 ROI가 없다. Wave 1 DB Ops deep-dive(`01-research/04-db-ops/01-deep-node-cron.md §36`)와 Wave 2 B 매트릭스(525줄)에서 정량 검증된 결론: pg_cron은 (a) SUPERUSER 요구 → CON-4(단순성) 위배, (b) TypeScript 로직 호출을 위해 결국 `pg_cron.schedule('job', $$ SELECT net.http_post(...) $$)` 패턴이 되며 이는 node-cron 직접 호출의 우회일 뿐, (c) cron 스케줄 UI의 소스 오브 트루스가 PG 내부에 숨겨져 운영자 가시성 감소, (d) PG 확장 버전 업그레이드가 Prisma 마이그레이션과 충돌 잠재. 대안인 node-cron은 TypeScript strict 타입 + `cron-parser`로 Asia/Seoul 강제 + advisory lock으로 cluster 중복 방지가 이미 Wave 4에서 설계 완료되어 있다.

**근거**: ADR-005, `01-research/04-db-ops/01-deep-node-cron.md §36`, Wave 2 B 1:1 비교 716줄.

**재검토 트리거**: (1) PostgreSQL 17+가 pg_cron을 기본 확장으로 탑재(CREATE EXTENSION 시 SUPERUSER 불필요), (2) SQL-only 잡이 5개 이상 누적되어 TypeScript 래퍼가 역으로 오버헤드가 됨, (3) pg_cron이 scheduler UI(관리자 대시보드) 표준화 API 제공.

**문서 영향**: ADR-005 재검토 트리거 재확인. `13-db-ops-blueprint.md §3` 결정 인용.

---

### DQ-4.3 [DB Ops] BullMQ(Redis) 도입

**Wave 5 최종 답변**: **영구 비도입**. Redis 의존성 추가는 1인 운영 부담 증가 + PG 트랜잭션 일관성 상실 두 치명적 비용을 초래한다. Wave 1 DB Ops 01 §37과 Wave 4 B5 Blueprint에서 pgmq로 다음이 이미 달성됨: (a) **Outbox 패턴**: 트랜잭션 내 메시지 쓰기로 "DB 커밋 성공 = 메시지 발송 확정" 일관성 (BullMQ는 별도 Redis 트랜잭션 필요), (b) **단일 백업 경로**: wal-g PITR이 pgmq 데이터도 함께 백업 (BullMQ는 Redis AOF/RDB 별도 백업 + 복원), (c) **관측성 통합**: pgmq는 SQL로 직접 큐 상태 조회. Redis 추가 시 메모리 2-4GB 추가 할당 + Redis 6.2+ 보안 패치 추적 + 네트워크 RTT가 PM2 cluster와 Redis 사이에 발생.

**근거**: ADR-012, `01-research/11-data-api/03-deep-pgmq.md §34`, Wave 2 F 매트릭스.

**재검토 트리거**: (1) pgmq 큐 메시지 초당 1000+ 지속 (현재 설계는 초당 50 수준 가정), (2) Upstash Redis 영구 무료 플랜 + 관리형 백업 + PG와 같은 AZ 배치 옵션 제공, (3) 팀 > 2명으로 확장되어 Redis 운영 분담 가능.

**문서 영향**: ADR-012 재확인. `15-data-api-blueprint.md §3` "BullMQ 거부" 결정부 인용.

---

### DQ-4.22 [DB Ops] 복원 미리보기 속도 가정 (50MB/s)

**Wave 5 최종 답변**: **스파이크 SP-022로 위임, 기준 "100GB 복원 30분 이하"**. Wave 2 매트릭스 03 §662에서 제시된 "50MB/s 가정"은 이론값이며, 실 운영 환경(WSL2 + Backblaze B2 → PostgreSQL 17) 측정치가 필요하다. Wave 5 우선 세트 스파이크에 **SP-022 (wal-g 복원 벤치마크)**를 추가하여 다음 3조건을 검증:
- (a) 100GB 베이스 백업 + 7일치 WAL 복원 소요시간 측정 (목표: 30분 이하 = RTO 목표)
- (b) 다운로드 병목 구간 특정: (i) B2 → WSL2 네트워크, (ii) 압축 해제 CPU, (iii) PG 적용 I/O
- (c) 병렬 다운로드 스레드 수 조정 (기본 4 → 8 검증)

벤치마크 결과에 따라 UI의 "예상 복원 시간" 계산식을 실측치로 보정한다. 스파이크 완료까지는 50MB/s 가정을 UI에 표시하되 "초기 추정" 주석을 붙인다.

**근거**: Wave 2 매트릭스 03 §662, `01-research/04-db-ops/02-deep-wal-g.md §35`, NFR-BACKUP.8 (RTO 30분).

**재검토 트리거**: (1) 실제 백업 크기 100GB 도달 시 즉시 SP-022 실행, (2) B2 → Cloudflare R2 전환 시 재측정 필요, (3) PG 17 → 18 마이그레이션 시 복원 성능 회귀 가능성.

**문서 영향**: `06-prototyping/spike-022-wal-g-benchmark.md` 신규 스파이크 문서 추가 예정 (Wave 5 Tier 1 S 에이전트 담당). NFR-BACKUP.8 주석에 "SP-022로 실측 보정" 추가.

---

### DQ-AA-3 [Auth Advanced] FIDO MDS 통합

**Wave 5 최종 답변**: **Phase 15+2주 (Phase 17 이후 강화) 통합**. MVP Phase 15의 WebAuthn 기본 구현은 FIDO MDS 없이 자체 프로비저닝을 허용한다(Wave 4 B1 Blueprint 기본). FIDO MDS 통합(`+2점 보너스`)은 다음 단계적 롤아웃:
- **Phase 17 진입 전**: FIDO Alliance에서 MDS 메타데이터 BLOB 다운로드 + 오프라인 캐싱 (`docs/references/fido-mds-cache.jwt`).
- **Phase 17 중**: 등록 단계에서만 MDS 검증 (인증기 신뢰 레벨 태그 저장). 로그인 단계는 기존 흐름 유지.
- **Phase 17+2주**: MDS 자동 업데이트 cron (매주 월요일 03:00 node-cron).
- **미지원 인증기**: MDS에 없는 인증기는 경고 표시 + 등록 허용 (강제 거부하지 않음, 사용성 우선).

초기는 offline 캐싱만으로 충분하다. 온라인 실시간 검증은 FIDO MDS endpoint 장애 시 등록 실패 위험.

**근거**: ADR-007, `01-research/06-auth-advanced/02-deep-totp.md §633`, FIDO Alliance 공식 문서 (2025-10 기준).

**재검토 트리거**: (1) FIDO MDS v4 릴리스 (현재 v3) → 검증 API 변경, (2) 외부 인증 감사 요구 (SOC 2 Type II 대응 시), (3) WebAuthn 인증기 중 MDS 미등록 비율 > 30%.

**문서 영향**: `03-auth-advanced-blueprint.md §8`에 "Phase 17+2주 MDS 통합" 신규 섹션 추가. NFR-SEC.15 (FIDO MDS) 주석에 "Wave 5 DQ-AA-3 상세" 링크.

---

### DQ-AA-9 [Auth Advanced] Conditional UI 활성화 시점

**Wave 5 최종 답변**: **Phase 17 완료 후 +2주, 지원 브라우저 한정 활성화**. Conditional UI(autofill 방식의 WebAuthn 로그인)는 현재 브라우저별 지원 격차가 있다:
- **지원**: Chrome 108+ / Edge 108+ / Safari 16+ / Firefox 117+
- **미지원**: Safari iOS 15 이하 / 구버전 모바일 웹뷰

**활성화 전략**:
1. **Phase 17 완료 확인**: WebAuthn 기본 흐름(등록/로그인/복구) 안정화 후 최소 2주 운영 관찰.
2. **Feature Detection**: `PublicKeyCredential.isConditionalMediationAvailable()` 런타임 체크.
3. **점진적 활성화**:
   - 지원 브라우저: 로그인 폼의 `<input autocomplete="webauthn">`에 Conditional UI 자동 제공.
   - 미지원 브라우저: fallback = "Passkey로 로그인" 별도 버튼 (기존 WebAuthn 명시 플로우).
4. **A/B 측정**: 활성화 후 4주간 WebAuthn 사용률 + 로그인 성공률 비교.

사용자가 Passkey를 등록했지만 Conditional UI 미지원 브라우저 접근 시에도 백업 인증(TOTP)으로 보장된다(ADR-007 다중 MFA 전략).

**근거**: W3C WebAuthn Level 3 (Conditional UI 섹션), Wave 4 B1 Blueprint §9.

**재검토 트리거**: (1) Safari iOS 15 사용률 1% 이하로 감소 (현재 ~5% 추정), (2) Conditional UI 지원 브라우저 95%+ 도달, (3) WebAuthn Level 4 표준 공개.

**문서 영향**: `03-auth-advanced-blueprint.md §9` Conditional UI 활성화 조건 섹션 추가. FR-MFA.3 구체화.

---

### DQ-ADV-1 [Advisors] Postgres 마이그레이션 시점

**Wave 5 최종 답변**: **splinter 38룰 포팅은 PG 14/15/16 세 버전 케이스별 분기 구조 + 현재 SQLite Session만 PG 전환 검토**. Wave 1/2 리서치에서 Advisors 룰의 50%가 PG 전용(`pg_stat_statements`, `pg_indexes`, `pg_policies` 등)임이 확인됨. 그러나 양평의 Session 테이블은 현재 SQLite(Wave 3 Auth Core), Prisma User/File/Folder는 이미 PG다. 따라서 "마이그레이션 필요 대상"은 Session 하나. 전략:

- **즉시 (Phase 15)**: splinter 포팅 시 룰 메타데이터에 `pgVersion: '14|15|16|all'` 컬럼 추가. 현재는 PG 17만 대상.
- **Phase 16 중**: Session 테이블 SQLite → PG 마이그레이션 검토 (DQ-AC-2와 연동). 단, fork 모드 cron 작업은 SQLite로 유지 (I/O 부담 분산).
- **PG 17+ 검증**: 2026-07 PG 17.2 릴리스 이후 splinter 룰 전수 실행 검증. PG 18은 2026-Q4 예상 → 그때 별도 마이그레이션 계획.
- **룰 스킵 로직**: 런타임 `SELECT current_setting('server_version_num')` 체크 → 미지원 버전 룰은 스킵 + 로그 경고.

**근거**: ADR-011, `01-research/10-advisors/01-deep-splinter.md §703`, Wave 4 B6 Advisors Blueprint §4.

**재검토 트리거**: (1) PG 18 릴리스 시 SP-027 PG 18 마이그레이션 영향 평가 스파이크 발동, (2) splinter upstream에 PG 버전 매트릭스 공식 표시 추가, (3) SQLite Session 사용량이 PG 전환 ROI를 정당화하는 수준으로 증가.

**문서 영향**: `14-advisors-blueprint.md §4`에 "PG 버전별 룰 분기" 섹션 추가. `02-data-model-erd.md §6` 마이그레이션 순서에 "SQLite Session → PG (선택, Phase 16)" 추가.

---

### DQ-RT-3 [Realtime] presence_diff 구조 검증

**Wave 5 최종 답변**: **Phoenix Presence 패턴 그대로 포팅 + 스파이크 SP-025로 호환성 검증**. supabase-realtime(Elixir/Phoenix)의 `presence_diff` 메시지 구조는 Phoenix 공식 문서화된 포맷이며, `@supabase/realtime-js` v2 클라이언트가 이를 파싱한다. 양평은 다음 전략을 채택:

1. **구조 준수**: `{ joins: { userId: [...metas] }, leaves: { userId: [...metas] } }` 포맷 유지. metas에는 `{ online_at, device, ... }` 포함.
2. **구현 방식**: PG `pg_notify` + Node 메모리 내 CRDT (G-Counter 기반)로 presence 상태 관리. 분산 노드 확장은 현재 불필요 (ADR-015 cluster:4 동일 호스트).
3. **검증 스파이크 SP-025**:
   - supabase-realtime JS 클라이언트를 양평 WS 서버에 연결 → presence_diff 수신 파싱 성공률 측정 (목표 100%)
   - 3 클라이언트 동시 연결 → join/leave 순서 일관성 확인
   - WS 재연결 시 state 복원 확인
4. **부적합 시 대응**: `@supabase/realtime-js` 클라이언트 사용 포기 → 자체 클라이언트 번들에 Channel API 래퍼 배포.

**근거**: Wave 2 매트릭스 09 §301, `01-research/09-realtime/02-deep-supabase-realtime.md §8`, Phoenix Presence 공식 문서.

**재검토 트리거**: (1) supabase-realtime v3 presence 포맷 변경, (2) 사용자 동시 접속 100명+ 도달 → CRDT 한계, (3) Redis Pub/Sub 대체 제안 (DQ-4.3 재검토와 연동).

**문서 영향**: `06-prototyping/spike-025-presence-compat.md` 신규 스파이크 문서. `11-realtime-blueprint.md §5` Presence 섹션 상세화.

---

### DQ-RT-6 [Realtime] PG 18 업그레이드 타이밍

**Wave 5 최종 답변**: **2026-Q4 PG 18 릴리스 후 스파이크 SP-027로 평가, 현재는 PG 17 고정**. PostgreSQL 18의 핵심 신기능인 `idle_replication_slot_timeout`은 wal2json slot의 비활성 자동 정리를 PG 네이티브로 제공하여, 현재 양평의 `cron:ypb_kill_idle_slots` (매 1시간 실행)를 폐기 가능. 그러나:

1. **현재 위치 (2026-04)**: PG 17 고정. 자체 cron이 idle slot 관리.
2. **평가 시점 (2026-Q4)**: PG 18 릴리스 + 마이너 2회(18.2) 안정화 대기.
3. **스파이크 SP-027**:
   - `idle_replication_slot_timeout` 동작 검증 (wal2json + Realtime 2개 slot)
   - `pg_upgrade` 17 → 18 dry-run on staging
   - Prisma 7의 PG 18 호환성 확인 (DMMF 변경 여부)
   - wal2json 1.x가 PG 18 호환 확인 (현재 PG 14+ 공식 지원)
4. **마이그레이션 창**: Phase 22 이후 (MVP + Beta 완료 후 안정기).
5. **Fallback**: 자체 cron `ypb_kill_idle_slots`는 PG 18 이후에도 안전망으로 유지 (트리거: `idle_replication_slot_timeout` 미작동 감지 시).

**근거**: PG 18 릴리스 노트 (2026-Q4 예상), ADR-010 재검토 트리거 #1, Wave 2 매트릭스 09 §304.

**재검토 트리거**: (1) PG 18.2 안정판 릴리스 (공식 LTS 지정 후), (2) wal2json이 PG 18에서 breaking change, (3) Prisma 7/8이 PG 18 공식 지원 발표.

**문서 영향**: `06-prototyping/spike-027-pg18-migration.md` 신규 스파이크 문서. ADR-010 재검토 트리거 #1과 교차 참조.

---

### DQ-12.4 [Observability] JWKS Cloudflare Workers 캐시

**Wave 5 최종 답변**: **P2 대기 + 3분 grace TTL 설계 재확인**. Cloudflare Workers 앞단 캐시는 JWKS endpoint의 성능 최적화 수단이지만, 양평의 현재 규모(QPS < 50)에서 ROI가 명확하지 않다. Wave 4 B1/B2 Blueprint의 기본 설계를 유지:

1. **기본 동작**: `/.well-known/jwks.json`에 `Cache-Control: public, max-age=180, stale-while-revalidate=600` 헤더 설정. 3분 fresh + 10분 stale-revalidate.
2. **키 회전 시**: 3분 grace TTL로 이전 키도 JWKS에 유지 → 캐시된 클라이언트가 자연 만료로 새 키 획득. JWT 검증 시 kid 필드로 특정 키 선택.
3. **Workers 캐시 도입 조건** (재검토 트리거):
   - JWKS endpoint에 대한 분당 요청 100+ (과도한 외부 클라이언트 발생)
   - Capacitor 모바일 클라이언트 확산으로 TLS 핸드셰이크 비용 누적
4. **도입 시 비용**: Cloudflare Workers Free Tier 10만 요청/일. 현 규모 충분히 커버. 단, Workers KV 에러 발생 시 JWKS 장애 = 전체 인증 마비 리스크 → fallback 로직 필수.

**근거**: Wave 2 매트릭스 12 §620, ADR-013, `04-observability-blueprint.md §7`.

**재검토 트리거**: (1) JWKS 요청 분당 100+ 2주 지속, (2) Capacitor 앱 배포로 JWKS 요청 5배 증가, (3) Cloudflare Workers KV 무료 한도 초과 변경.

**문서 영향**: ADR-013에 "3분 grace TTL + stale-while-revalidate 600" 명시. `04-observability-blueprint.md §7` 캐시 전략 섹션 상세화.

**세션 30 (2026-04-19) SP-014 실측 보강**:
- jose `createRemoteJWKSet({ cacheMaxAge: 180_000 })`: 검증 p95 **0.189ms**, hit rate **99.0%**
- Cloudflare Tunnel RTT (stylelucky4u.com): p95 148.7ms (기준 100ms 48% 초과하나 hit 99%로 실효 영향 1%)
- **실효 지연**: 0.99 × 0.189 + 0.01 × 148.5 ≈ **1.62ms** → NFR-PERF.9 50ms 대비 30배 여유
- Workers 캐시 도입 현 시점 **불필요** (재검토 트리거 유지)
- **중요 명료화**: "3분 grace"는 jose 클라이언트 `cacheMaxAge`만으로 성립하지 않는다. JWKS 엔드포인트가 `SigningKey.retireAt > NOW()` 조건으로 **구·신 키 모두 응답에 포함**해야 grace 성립. Phase 17 Auth Core 구현 시 이 정책 필수.
- 상세: `docs/research/spikes/spike-014-jwks-cache-result.md`, `docs/solutions/2026-04-19-jwks-grace-endpoint-vs-client-cache.md`

---

### DQ-12.5 [Observability] Capacitor JWKS 방식

**Wave 5 최종 답변**: **빌드 타임 inline 기본 + grace 7일 + 런타임 fetch fallback**. Capacitor 모바일 앱(iOS/Android 네이티브 빌드)에서 JWKS 사용 전략:

1. **빌드 타임 Inline**: 앱 빌드 시 현재 JWKS를 `src/assets/jwks.json`에 inline. 앱 번들에 포함. 오프라인 환경에서도 JWT 검증 가능.
2. **키 회전 대응 (grace 7일)**: 빌드 시점의 JWKS는 이후 7일간 유효 보장 (서버의 키 회전 주기를 30일로 설정하고, 각 키는 최소 7일 grace 유지).
3. **런타임 fetch fallback**: JWT 검증 실패 시(키 ID 미일치) → 런타임에 `/.well-known/jwks.json` fetch → 로컬 업데이트 → 재검증.
4. **Secure Storage**: 사용자의 Refresh Token만 iOS Keychain(`capacitor-secure-storage-plugin`) / Android EncryptedSharedPreferences에 저장. Access Token은 메모리만.
5. **JWT는 Refresh만 저장**: Access Token은 5분 단명 → 메모리 유지. Refresh Token은 30일 → Secure Storage. 이유: Access 탈취 시 5분 이내 로테이션으로 피해 제한.

**근거**: Wave 2 매트릭스 12 §621, ADR-013, Capacitor 공식 Secure Storage 문서.

**재검토 트리거**: (1) Capacitor 앱 공식 배포 결정 (FR-MOBILE.1 활성화), (2) iOS 17+/Android 14+ Keychain API 변경, (3) JWKS 회전 주기 변경 (현 30일 → 7일로 단축 시 grace 조정 필요).

**문서 영향**: `04-observability-blueprint.md §8`에 "Capacitor JWKS 전략" 섹션 추가. FR-MOBILE.1에 "빌드 타임 inline + 런타임 fallback" 구체화.

---

### DQ-AC-1 [Auth Core] argon2 교체 시점

**Wave 5 최종 답변**: **Phase 17 진입 시 Double-hash 마이그레이션**. bcryptjs → `@node-rs/argon2` 전환 전략:

1. **현재 (Phase 15-16)**: bcryptjs 유지. 새 가입자도 bcrypt 해시로 저장.
2. **Phase 17 진입 시점**: `@node-rs/argon2` 의존성 추가 + Prisma `users.passwordAlg: String @default("bcrypt")` 컬럼 추가 마이그레이션.
3. **Double-hash 전환 (점진적)**:
   - 로그인 성공 시 `if (user.passwordAlg === 'bcrypt')` → 평문 비밀번호로 argon2id 재해시 → `passwordHash` / `passwordAlg='argon2id'` 업데이트.
   - 새 가입자: 처음부터 argon2id.
   - 1년 후: 바뀌지 않은 bcrypt 계정은 "보안 업그레이드 안내" 이메일 + 다음 로그인 시 강제 재해시.
4. **Argon2id 파라미터**: `m=65536` (64MB), `t=3`, `p=4`. OWASP 권장.
5. **성능 측정**: Phase 17 스파이크 SP-028에서 로그인 p95 측정 (목표 400ms 이하).

**근거**: OWASP Password Storage Cheat Sheet 2025, `01-research/05-auth-core/01-deep-lucia.md §628`, ADR-006 재검토 트리거 #1.

**재검토 트리거**: (1) OWASP 권장 파라미터 변경 (m/t/p 업데이트), (2) Node.js N-API 호환성 이슈로 `@node-rs/argon2` 빌드 실패, (3) Phase 17 진입 지연 (12개월 초과 시) → bcrypt 유지 평가.

**문서 영향**: `06-auth-core-blueprint.md §5`에 "argon2id 마이그레이션 플레이북" 섹션 추가. ADR-022(예상) 신규 추가: "argon2id 전환 결정".

**세션 30 (2026-04-19) SP-011 실측 보강 + 사실관계 정정**:
- **사실관계 정정**: 프로젝트 현행은 `bcryptjs`가 아니라 **`bcrypt@^6.0.0`** (N-API native). Wave 1~5 문서의 "bcryptjs" 표기는 오기 — 후속 일괄 수정 필요
- **성능 실측**: argon2id(default) vs bcrypt(cost=12)
  - hash: 19.8ms vs 172.2ms p95 → **8.7× 빠름**
  - verify: 13.6ms vs 167.8ms p95 → **12.3× 빠름**
  - spec 예상 5× 대폭 초과
- WSL2 Ubuntu 24.04 + Node v24.14.1에서 `@node-rs/argon2` prebuilt binary **3.3초** 설치 (node-gyp 빌드 없음)
- 1000 사용자 점진 마이그레이션 시뮬레이션: 오류 **0/1000**
- **ADR-019** (argon2id 전환) 정식 등록 — 기존 제안 번호 ADR-022는 본 결정과 동일
- 상세: `docs/research/spikes/spike-011-argon2-result.md`, `docs/solutions/2026-04-19-napi-prebuilt-native-modules.md`

---

### DQ-AC-2 [Auth Core] Session 테이블 인덱스 전략 (SQLite → PG)

**Wave 5 최종 답변**: **Session 테이블 PG 이전 시 복합 인덱스 + UNIQUE tokenFamily**. 현재 Session은 SQLite(`./data/sessions.sqlite`)지만 Phase 16~17 중 PG로 이전 검토. 인덱스 전략:

1. **PK 인덱스** (자동): `id` UUID.
2. **조회 인덱스** (복합): `(user_id, revoked_at, expires_at)` — 사용자의 활성 세션 조회 최적화. `WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()` 패턴.
3. **UNIQUE 인덱스**: `token_family` UUID — refresh token rotation의 family 식별. Reuse Detection 쿼리: `SELECT * FROM sessions WHERE token_family = ? AND id != ?`.
4. **정리 인덱스**: `expires_at` — cron 청소용. `DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '30 days'`.
5. **EXPLAIN 검증**: `EXPLAIN ANALYZE` 수행 쿼리 계획 확인, Index Scan 확정.

**SQLite vs PG 인덱스 차이**:
- SQLite는 인덱스 통계(ANALYZE) 수동 실행 필요. PG는 autovacuum + auto_analyze.
- SQLite는 복합 인덱스의 "leftmost prefix" 규칙 동일. PG는 추가로 BRIN/GIN 가능 (Session에는 불필요).
- PG는 `CLUSTER` 명령으로 heap 정렬 가능 (Session 테이블 월간 `CLUSTER ON idx_sessions_user_id` 검토).

**마이그레이션 순서**: (a) PG Session 스키마 생성, (b) 앱 배포 시 쓰기 이중화(PG + SQLite), (c) 2주 후 읽기 PG 전환, (d) 4주 후 SQLite 폐기.

**근거**: ADR-006, `01-research/05-auth-core/01-deep-lucia.md §629`, PG EXPLAIN 가이드.

**재검토 트리거**: (1) Session 테이블 row 수 100만 초과 → 파티셔닝 검토, (2) PG 버전업으로 인덱스 최적화 기능 추가, (3) Session 조회 p95 > 50ms.

**세션 30 (2026-04-19) SP-015 실측 보강**:
- PostgreSQL 16.13 + 100,000 행 Session 테이블 실측
  - 일반 복합 인덱스 `(userId, expiresAt)`: Bitmap Heap Scan + Bitmap Index Scan, p95 **48μs** (1000 iter)
  - 인덱스 drop 후 Seq Scan: p95 5,105μs (**106× 저하** — 인덱스 필수성 실증)
- SQLite(better-sqlite3 + WAL): p95 **53μs** (동일 쿼리)
- **중요 발견**: `CREATE INDEX ... WHERE "expiresAt" > NOW()` 실행 시 **ERROR: functions in index predicate must be marked IMMUTABLE** (NOW()는 STABLE). PG partial index on TTL 조건은 원천 불가능 → **cleanup job 대안 채택**:
  ```sql
  DELETE FROM "Session" WHERE "expiresAt" < NOW() - INTERVAL '1 day';
  -- node-cron 또는 pg_cron으로 일 1회 야간 실행
  ```
- 일반 복합 인덱스만으로 목표 `p95 < 2ms`의 **40× 여유** 달성 — partial index 자체가 불필요
- 1M extrapolation p95 ≈ 65μs (log10 증가) — 파티셔닝 불필요
- 상세: `docs/research/spikes/spike-015-session-index-result.md`, `docs/solutions/2026-04-19-pg-partial-index-now-incompatibility.md`

**문서 영향**: `02-data-model-erd.md §6.3`에 "Session 마이그레이션 플랜" 추가. `06-auth-core-blueprint.md §6` 인덱스 전략 명시.

---

### DQ-OPS-1 [Operations] self-hosted runner Docker 전환

**Wave 5 최종 답변**: **영구 비도입 + 별도 WSL distro로 격리 경로 확보**. GitHub Actions self-hosted runner의 Docker 격리는 ADR-015의 "Docker 거부 조건 0개 충족" 결정과 일관되게 **미도입**. 대신:

1. **현재 방식**: WSL2 Ubuntu의 `ypb-runtime` 유저로 runner 실행. 샌드박스는 유저 권한 + AppArmor 프로파일.
2. **격리 경로 (조건부)**: 별도 WSL distro(`Ubuntu-Runner`)를 생성하여 프로덕션 WSL과 네트워크/파일시스템 분리. Docker보다 메모리 오버헤드 낮음 (WSL2 distro는 공유 커널).
3. **Docker 추가 시 비용**:
   - 이미지 빌드 시간 +30초/빌드
   - 메모리 200-500MB 추가 (Docker daemon)
   - Cloudflare Tunnel 연결 복잡도 (컨테이너 네트워크 → WSL2 → Tunnel)
   - WSL2에서 Docker Desktop Windows 의존성 → Linux-only 자체호스팅 원칙 위배
4. **재검토 트리거**: 다중 노드 확장 시 (ADR-015 재검토 트리거 #1).

**근거**: ADR-015, `01-research/14-operations/01-deep-capistrano.md §34`, Wave 2 G 매트릭스.

**재검토 트리거**: (1) 월간 트래픽 100만 요청 초과, (2) 팀 2명+ 확장, (3) 컴플라이언스 요구(SOC 2 격리 증빙)로 Docker 컨테이너 필수화.

**문서 영향**: ADR-015 재검토 트리거 재확인. `05-operations-blueprint.md §4` "Docker 비도입 근거" 섹션 인용.

---

### DQ-OPS-3 [Operations] Node 버전 전환 격리 수준

**Wave 5 최종 답변**: **Node 24 LTS 기준 + `.nvmrc` 버전 고정 + LTS 릴리스 6개월 후 업그레이드 평가**. Node 버전 관리 정책:

1. **현재 기준**: Node 24 LTS (2025-10 릴리스). `.nvmrc` 파일에 `24.2.0` 고정. CI와 운영 WSL 동기화.
2. **업그레이드 규칙**:
   - 새 LTS (예: Node 26) 릴리스 후 최소 6개월 대기.
   - LTS 이행기 + 보안 패치 3회 수신 후 양평 업그레이드 검토.
   - 현재 LTS EOL(End-of-Life) 이전 최소 3개월 여유 두고 이행.
3. **전환 격리**: Docker 미도입 방침에 따라 "release 수준 격리"로 충분. PM2 `exec_interpreter: /home/ypb/.nvm/versions/node/v24.2.0/bin/node` 명시. 이전 버전은 `/home/ypb/.nvm/versions/node/v22.x/bin/node` 존재하여 symlink 롤백 시 사용 가능.
4. **호환성 리스크**:
   - Prisma 7: Node 20+ 지원. Node 24는 명시적 테스트.
   - isolated-vm v6: Node 24 ABI 전용 빌드 릴리스 확인.
   - jose: Pure ESM이므로 Node 18.17+ 대부분 호환.
   - @node-rs/argon2: 네이티브 모듈이므로 Node 메이저 버전마다 재빌드.
5. **Docker 전환 조건**: 다중 Node 버전 병행 운영 필요 시 (현재 없음).

**근거**: Node.js 공식 릴리스 스케줄, ADR-015, `01-research/14-operations/01-deep-capistrano.md §248`.

**재검토 트리거**: (1) Node 24 EOL 선언 (2027-04 예상), (2) 양평이 사용하는 네이티브 모듈 중 Node 24 호환 불가 사례 발생, (3) Node 25(non-LTS)에서 보안 critical 패치가 24로 backport되지 않음.

**문서 영향**: `.nvmrc` 파일 신규 커밋 (Phase 15 전). `05-operations-blueprint.md §5` Node 버전 정책 섹션.

---

### DQ-OPS-4 [Operations] 2번째 호스트 DR 추가

**Wave 5 최종 답변**: **현재 불필요 + Phase 17 이후 지역 이원화 검토**. DR(Disaster Recovery) 호스트는 현 단계(MVP Phase 15-17)에서 비용/복잡도 ROI가 없다. 단, 장기 경로를 열어둠:

1. **현재 전략 (단일 호스트)**:
   - **데이터 DR**: wal-g PITR → Backblaze B2 (오프사이트). RPO 60초 / RTO 30분.
   - **앱 DR**: GitHub이 코드 백업 (무료 무제한). `/ypserver prod` 1명령으로 신규 WSL 환경 재구축 가능.
   - **DNS DR**: Cloudflare DNS가 별도 관리 (운영 호스트 장애와 무관).
2. **Phase 17+ 검토 조건**:
   - 월간 다운타임 > 1시간 발생 2회 이상.
   - 운영 호스트 하드웨어 장애 경험 1회 이상.
   - 사용자 2명+ 증가로 가용성 SLA 99.5% 요구.
3. **도입 시 구성**:
   - Warm Standby: 두 번째 WSL2 호스트에 주간 wal-g 복원 + 네트워크 대기. 페일오버 수동 (DNS 전환).
   - Cold Standby: B2에서 온디맨드 복원 (RTO 30분 그대로). → 현 전략의 연장.
4. **지역 이원화**: 물리적 이중화는 한국 내 두 번째 WSL2 (예: VPS)가 최소 비용 경로. AWS/GCP 관리형은 AP-5(월 $10) 위배.

**근거**: ADR-015, `01-research/14-operations/01-deep-capistrano.md §249`, NFR-AVAIL.1.

**재검토 트리거**: (1) 하드웨어 장애 1회 이상 발생, (2) SLA 99.5%+ 요구 (현재 목표 99.0%), (3) 월간 사용자 5명+ 도달.

**문서 영향**: `05-operations-blueprint.md §6`에 "DR 호스트 조건부 도입 로드맵" 섹션 추가. NFR-AVAIL.1 가용성 목표 99.0% 재확인.

---

## 6. DQ 답변 → 문서 영향 맵

Wave 5 16건 DQ 답변이 어떤 Blueprint / ADR / FR을 수정/추가/갱신하는지 매트릭스.

| DQ# | 신규 ADR | 기존 ADR 갱신 | Blueprint 수정 | FR/NFR 영향 | 신규 스파이크 |
|-----|---------|-------------|--------------|------------|-------------|
| DQ-1.13 (AG Grid) | — | ADR-002 재검토 트리거 주석 | `09-table-editor-blueprint.md §결론` | — | — |
| DQ-1.14 (Enterprise) | — | ADR-002 (영구 비도입) | — | CON-7 인용 | — |
| DQ-3.3 (임베드) | — | ADR-004 재검토 트리거 | `12-schema-visualizer-blueprint.md §1` | — | — |
| DQ-4.1 (cluster) | — | ADR-015 §세션 30 보완 (PM2 delete all 금지) | `05-operations-blueprint.md §3` | FR-OPS.3 | **SP-010 완료** (+39.9% RPS, SQLITE_BUSY 0%) |
| DQ-4.2 (pg_cron) | — | ADR-005 영구 비도입 재확인 | `13-db-ops-blueprint.md §3` | — | — |
| DQ-4.3 (BullMQ) | — | ADR-012 Redis 거부 재확인 | `15-data-api-blueprint.md §3` | — | — |
| DQ-4.22 (복원속도) | — | — | — | NFR-BACKUP.8 주석 | **SP-022** (wal-g 벤치) |
| DQ-AA-3 (FIDO MDS) | — | ADR-007 §8 추가 | `03-auth-advanced-blueprint.md §8` | NFR-SEC.15 | — |
| DQ-AA-9 (Conditional UI) | — | ADR-007 §9 추가 | `03-auth-advanced-blueprint.md §9` | FR-MFA.3 | — |
| DQ-ADV-1 (PG 마이그) | — | ADR-011 분기 구조 | `14-advisors-blueprint.md §4` | — | **SP-027** 연동 |
| DQ-RT-3 (presence_diff) | — | ADR-010 presence 상세 | `11-realtime-blueprint.md §5` | FR-RT.2 | **SP-025** (Presence) |
| DQ-RT-6 (PG 18) | — | ADR-010 재검토 트리거 #1 | — | — | **SP-027** (PG 18) |
| DQ-12.4 (JWKS 캐시) | — | ADR-013 §세션 30 보완 (grace=endpoint 정책) | `04-observability-blueprint.md §7`, `03-auth-advanced-blueprint.md §JWKS` | NFR-PERF.9 | **SP-014 완료** (p95 0.189ms, hit 99%) |
| DQ-12.5 (Capacitor) | — | ADR-013 §8 추가 | `04-observability-blueprint.md §8` | FR-MOBILE.1 | — |
| DQ-AC-1 (argon2) | **ADR-019** (세션 30 등록, 기존 "ADR-022"로 지칭) | ADR-006 §세션 30 보완 | `06-auth-core-blueprint.md §5`, `03-auth-advanced-blueprint.md §패스워드` | NFR-SEC.10 | **SP-011 완료** (13× faster) |
| DQ-AC-2 (Session) | — | ADR-006 §세션 30 보완 (cleanup job 대안) | `06-auth-core-blueprint.md §6`, `02-data-model-erd.md §6.3` | NFR-MAINT.4 | **SP-015 완료** (p95 48μs) |
| DQ-OPS-1 (Docker) | — | ADR-015 재검토 트리거 재확인 | `05-operations-blueprint.md §4` | — | — |
| DQ-OPS-3 (Node 버전) | — | — | `05-operations-blueprint.md §5` | NFR-MAINT.8 | — |
| DQ-OPS-4 (DR 호스트) | — | — | `05-operations-blueprint.md §6` | NFR-AVAIL.1 | — |

### 6.1 예상 신규 ADR

- **ADR-019**: Prisma 7 → Prisma 8 업그레이드 타이밍 (ASM-11 검증 후)
- **ADR-020**: 마이그레이션 롤백 5초 구현 패턴 (Phase 16 스파이크 결과)
- **ADR-021**: Next.js 16 → 17 업그레이드 전략 (2026-Q4 예상)
- **ADR-022**: argon2id 전환 결정 (본 DQ-AC-1)
- **ADR-023**: Capacitor 모바일 클라이언트 공식 지원 여부 (DQ-12.5 발동 시)

### 6.2 예상 신규 스파이크

- **SP-022**: wal-g 100GB 복원 벤치마크 (DQ-4.22)
- **SP-025**: supabase-realtime JS 클라이언트 presence 호환 테스트 (DQ-RT-3)
- **SP-027**: PG 17 → 18 마이그레이션 영향 평가 (DQ-RT-6, DQ-ADV-1 연동)
- **SP-028**: bcrypt → argon2id 성능 벤치마크 (DQ-AC-1)

---

## 7. 폐기 DQ 4건 재확인

Wave 5 시점에서 폐기 상태를 재검증. 모두 **폐기 유지**.

| DQ# | 원래 질문 | 폐기 사유 | Wave 5 재확인 |
|-----|----------|----------|-------------|
| **DQ-1.5 (Edge)** | workerd를 isolated-vm 대신 메인 엔진으로? | Wave 1/2에서 3층 하이브리드 확정 → workerd 단독 논의 무의미 | ✅ 폐기 유지. 3층(isolated-vm+Deno+Sandbox) 구조가 ADR-009로 고착. |
| **DQ-1.6 (Edge)** | Vercel Sandbox Hobby 무료 티어 예외 수용? | 3층 하이브리드의 L3(Sandbox 위임)가 이미 조건부로 포함 → 별도 정책 불필요 | ✅ 폐기 유지. L3 선택 경로가 월 10만 invocation 내 무료 티어 활용 설계. |
| **DQ-UX-1** | 프롬프트 캐싱 TTL 5분 vs 1시간? | Wave 2에서 5분 확정 (2회 hit 손익분기 분석 완료) | ✅ 폐기 유지. Anthropic prompt caching API 표준 5분. |
| **DQ-UX-2** | AI Gateway(Vercel) 채택 여부? | Wave 2에서 미채택 확정 (WSL2+PM2 환경 / 자체 `/admin/ai-usage` 대체) | ✅ 폐기 유지. AI SDK v6 직접 호출로 충분. Vercel 계정 불필요. |

---

## 8. 잔여 열린 질문 (Long-Open DQ)

Wave 5 이후에도 즉시 답변할 수 없는 "장기 열린 질문"은 다음 항목들이다. 이들은 프로덕션 운영 데이터 또는 외부 의사결정이 입력되어야 답변 가능.

### 8.1 측정 기반 열린 질문

- **OQ-1**: SeaweedFS 50GB 실운영 시 restart failure 발생률 (ASM-4) — **SP-007 스파이크 + 6개월 운영 통계 필요**.
- **OQ-2**: wal-g 실제 100GB 복원 시간 (DQ-4.22 확장) — **SP-022 + 첫 실재 백업 복원 후 측정**.
- **OQ-3**: Realtime Channel 동시 접속자 상한 (cluster:4 + 단일 PG) — **SP-026 부하 테스트 필요**.
- **OQ-4**: Edge Fn invocation 월 10만 초과 시 L3 Sandbox 비용 (ADR-009 재검토 트리거 #3) — **운영 데이터 수집**.

### 8.2 외부 의존 열린 질문

- **OQ-5**: PG 18 Prisma 7 호환 공식 발표 시점 (DQ-RT-6 연동) — **Prisma 팀 로드맵 외부 의존**.
- **OQ-6**: Node 26 LTS 릴리스 시점 (DQ-OPS-3) — **Node.js 재단 스케줄 외부 의존**.
- **OQ-7**: FIDO MDS v4 릴리스 (DQ-AA-3) — **FIDO Alliance 외부 의존**.
- **OQ-8**: MinIO AGPL 전환 후 대체 OSS 출현 여부 (ADR-008 재검토 트리거) — **OSS 커뮤니티 동향 관찰**.

### 8.3 비즈니스 의존 열린 질문

- **OQ-9**: B2B SaaS 전환 결정 (ADR-001/002/014/015 동시 발동 트리거) — **프로젝트 오너 장기 전략 결정**.
- **OQ-10**: 팀 확장(2명+) 시점 (여러 ADR 재검토 트리거) — **프로젝트 오너 결정**.
- **OQ-11**: Capacitor 모바일 앱 공식 지원 결정 (FR-MOBILE.1 활성화) — **사용자 수요 기반**.
- **OQ-12**: pg_graphql 4 수요 트리거 중 2+ 충족 시기 (ADR-016) — **연 1회 4월 정기 리뷰**.

---

## 9. ADR 재검토 트리거 인덱스 (45건)

ADR 18건 × 평균 2.5 트리거 = **총 45건 재검토 조건**. 아래는 DQ와의 교차 매핑.

### 9.1 ADR-001 ~ ADR-007 재검토 트리거

| ADR | 트리거 # | 조건 | 연관 DQ |
|-----|--------|------|--------|
| ADR-001 | 1 | 사용자 2명+ 6개월 지속 | OQ-10 |
| ADR-001 | 2 | B2B SaaS 전환 결정 | OQ-9 |
| ADR-001 | 3 | 독립 팀 관리 FR 신규 추가 | — |
| ADR-001 | 4 | GDPR/PIPA 법적 격리 요건 | — |
| ADR-002 | 1 | 테이블 row 100만+ p95>1.2s | **DQ-1.13** |
| ADR-002 | 2 | TanStack v9 major release ABI 깨짐 | — |
| ADR-002 | 3 | MIT/Apache-2.0 AG Grid 대체 출현 | — |
| ADR-003 | 1 | supabase-studio 라이선스 변경 | — |
| ADR-003 | 2 | Monaco v0.50+ breaking | — |
| ADR-003 | 3 | Next.js 16 Server Component Monaco 비호환 | — |
| ADR-004 | 1 | 스키마 200 테이블+ 레이아웃 >3s | — |
| ADR-004 | 2 | schemalint TS 포팅 룰 엔진 breaking | — |
| ADR-004 | 3 | Prisma Studio 공식 headless 모드 제공 | **DQ-3.3** |
| ADR-005 | 1 | Cron 작업 50개+ 정확도 문제 | — |
| ADR-005 | 2 | wal-g major version 호환 break | — |
| ADR-005 | 3 | B2 가격 > $1/월 인상 | — |
| ADR-005 | 4 | PG 17+ pg_cron 기본 탑재 | **DQ-4.2** |
| ADR-006 | 1 | Node 24 LTS jose breaking | DQ-AC-1, DQ-OPS-3 |
| ADR-006 | 2 | OAuth Provider 5개+ 증가 | — |
| ADR-006 | 3 | WebAuthn/Passkey 단독 인증 전환 | — |
| ADR-007 | 1 | Safari iOS 26+ WebAuthn 안정화 | DQ-AA-9 |
| ADR-007 | 2 | RL PG counter QPS>1000 | — |
| ADR-007 | 3 | Passkey(FIDO 2) 단일 인증 표준화 | — |

### 9.2 ADR-008 ~ ADR-014 재검토 트리거

| ADR | 트리거 # | 조건 | 연관 DQ |
|-----|--------|------|--------|
| ADR-008 | 1 | SeaweedFS restart failure >1건/주 | OQ-1 |
| ADR-008 | 2 | SeaweedFS 파일 손상 1건+ | — |
| ADR-008 | 3 | 커뮤니티 이탈 (AGPL 전환) | — |
| ADR-009 | 1 | isolated-vm v6 Node 24 ABI 깨짐 | DQ-OPS-3 |
| ADR-009 | 2 | Deno 2.x Next.js 통합 공식 지원 | — |
| ADR-009 | 3 | Edge fn invocation 10만+/월 | OQ-4 |
| ADR-010 | 1 | PG 18+ wal2json 비호환 | **DQ-RT-6** |
| ADR-010 | 2 | pgoutput JSON 개선 | — |
| ADR-010 | 3 | supabase-realtime 포팅 복잡도 초과 | **DQ-RT-3** |
| ADR-011 | 1 | splinter 룰 50+ 업스트림 | **DQ-ADV-1** |
| ADR-011 | 2 | DB 내부 실행 더 빠른 룰 발견 | — |
| ADR-012 | (ADR-016 상세) | 4 수요 트리거 중 2+ | OQ-12 |
| ADR-013 | 1 | MASTER_KEY 유출 의심 | — |
| ADR-013 | 2 | DEK 회전 365일 | — |
| ADR-013 | 3 | HashiCorp Vault 단일 바이너리화 | — |
| ADR-014 | 1 | AI 비용 >$8/월 2개월 | — |
| ADR-014 | 2 | AI SDK v7 breaking | — |
| ADR-014 | 3 | Anthropic Haiku 가격 2배 인상 | — |
| ADR-014 | 4 | 대체 AI 공급자 등장 | — |

### 9.3 ADR-015 ~ ADR-018 재검토 트리거

| ADR | 트리거 # | 조건 | 연관 DQ |
|-----|--------|------|--------|
| ADR-015 | 1 | 월간 트래픽 100만+ | **DQ-4.1**, **DQ-OPS-1** |
| ADR-015 | 2 | 팀 2명+ | OQ-10 |
| ADR-015 | 3 | 다중 환경 (dev/stg/prod) | — |
| ADR-015 | 4 | B2B SaaS 전환 | OQ-9 |
| ADR-016 | 연 1회 4월 정기 리뷰 | pg_graphql 도입 4 중 2+ 충족 | OQ-12 |
| ADR-017 | 1 | 외부 사용자 첫 가입 | — |
| ADR-017 | 2 | Anonymous + OAuth 통합 요구 | — |
| ADR-017 | 3 | SSO(SAML) 기업 요청 | — |
| ADR-018 | 1 | Blueprint 3개+ 레이어 경계 벗어남 | — |
| ADR-018 | 2 | 신규 카테고리 (14→15) 추가 | — |

### 9.4 재검토 트리거 총계

**18 ADR × 평균 2.5 트리거 = 45건**. 모든 트리거는 정량 조건 또는 명확한 이벤트로 정의되어 자동/반자동 감시 가능하다. Wave 5 kdyobserve 스킬 구현 시 Prometheus alert 규칙으로 변환:

```yaml
# 예시: Prometheus alert rules (설계)
- alert: ADR_008_SeaweedFS_Restart
  expr: rate(seaweedfs_restart_total[1w]) > 1
  labels: { adr: "ADR-008", dq: "OQ-1" }
  annotations: { summary: "SeaweedFS restart >1/week — ADR-008 재검토 발동" }

- alert: ADR_014_AI_Cost
  expr: ai_monthly_cost_usd > 8 and on() (time() - ai_cost_breach_start_timestamp) > 2 * 30 * 86400
  labels: { adr: "ADR-014" }
  annotations: { summary: "AI 월 비용 >$8 2개월 지속 — ADR-014 재검토 발동" }
```

---

## 부록: 전체 DQ 커버리지 감사

### A.1 DQ 식별자 전수 목록 (Wave 3 `07-dq-matrix.md` 기준)

**Table Editor (10건)**: DQ-1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 2.1, 2.2, 2.3
**SQL Editor (3건)**: DQ-2.4, 2.5, 2.6
**Schema Viz (15건)**: DQ-3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15
**DB Ops (23건)**: DQ-4.1 ~ 4.23
**Auth Core (13건)**: DQ-AC-1 ~ AC-13
**Auth Advanced (10건)**: DQ-AA-1 ~ AA-10
**Advisors (7건)**: DQ-ADV-1 ~ ADV-7
**Realtime (6건)**: DQ-RT-1 ~ RT-6
**Data API (9건)**: DQ-1.25, 1.26, 1.27, 1.31, 1.32, 11.1, 11.3 등
**Observability (9건)**: DQ-12.1, 12.2, 12.4, 12.5, 12.7, 12.8, 12.13 등
**UX Quality (3건)**: DQ-UX-3, DQ-AI-1, DQ-AI-2
**Operations (4건)**: DQ-OPS-1 ~ OPS-4
**Wave 1 확정 (9건)**: DQ-1.1 ~ 1.9
**Wave 2 확정 (1건)**: DQ-12.3
**폐기 (4건)**: DQ-1.5(E), DQ-1.6(E), DQ-UX-1, DQ-UX-2

**합계 검증**: Wave 2+ 신규 64건 + Wave 1 잠정 9건 + Wave 2 확정 1건 + 폐기 4건 = **78건 전수** (Wave 3 `07-dq-matrix.md §1` 수록 기준 일치).

### A.2 Wave 5 답변 커버리지 감사

Wave 5 최종 답변 대상 16건 중 본 문서 §5에서 답변한 항목:

```
[✓] DQ-1.13 (AG Grid)
[✓] DQ-1.14 (Enterprise)
[✓] DQ-3.3 (스튜디오 임베드)
[✓] DQ-4.1 (PM2 cluster)
[✓] DQ-4.2 (pg_cron)
[✓] DQ-4.3 (BullMQ)
[✓] DQ-4.22 (복원 속도)
[✓] DQ-AA-3 (FIDO MDS)
[✓] DQ-AA-9 (Conditional UI)
[✓] DQ-ADV-1 (PG 마이그)
[✓] DQ-RT-3 (presence_diff)
[✓] DQ-RT-6 (PG 18)
[✓] DQ-12.4 (JWKS 캐시)
[✓] DQ-12.5 (Capacitor)
[✓] DQ-AC-1 (argon2)
[✓] DQ-AC-2 (Session 인덱스)
[✓] DQ-OPS-1 (Docker)
[✓] DQ-OPS-3 (Node 버전)
[✓] DQ-OPS-4 (DR 호스트)
```

**합계**: **19개 답변** (L3 미션의 Wave 5 16건 + 보너스 3건 = OPS-1/OPS-3/OPS-4를 함께 답변했기 때문).

### A.3 최종 커버리지

```
Wave 1 잠정:        9 / 9  (100%)
Wave 2 추가 확정:   1 / 1  (100%)
Wave 3 답변:       20 / 20 (100%)
Wave 4 답변:       28 / 28 (100%)
Wave 5 답변:       16 / 16 (100%, 본 §5)
폐기 재확인:        4 / 4  (100%, §7)
─────────────────────────────
전체 DQ 커버리지:  74 / 74 (100%) + 폐기 4건
```

---

> **DQ 최종 해결 문서 끝**. Wave 5 · A1 · 2026-04-18 · 양평 부엌 서버 대시보드 — 74 DQ × 45 재검토 트리거 × 16 Wave 5 답변 완결.
> 다음 문서: [03-genesis-handoff.md](./03-genesis-handoff.md) (kdygenesis 연계 초안).
