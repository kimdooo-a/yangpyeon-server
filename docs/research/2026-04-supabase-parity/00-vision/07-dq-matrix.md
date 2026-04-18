# 07-DQ 매트릭스 — 전역 미해결 질문 추적 레지스트리

> Wave 3 / Meta Agent-2 / 작성일: 2026-04-18
> 목적: Wave 1~2에서 등록된 64개 신규 DQ의 전수 목록화 + Wave 3/4/5 재분배

---

## 1. DQ 등록 현황 요약

| 구분 | 건수 | 설명 |
|------|------|------|
| Wave 1 잠정 답변 완료 | 9건 | DQ-1.1~1.9 |
| Wave 2 추가 확정 | 1건 | DQ-12.3 (MASTER_KEY 위치) |
| **신규 미답변 (Wave 2~5 대상)** | **64건** | 본 문서 전수 수록 |
| 폐기 처리 | 4건 | 리서치 진행으로 무의미해진 DQ |

### 잠정 답변 완료 9건 요약

| DQ# | 카테고리 | 확정 답변 |
|-----|---------|----------|
| DQ-1.1 | Auth Advanced | TOTP + WebAuthn 동시 지원 |
| DQ-1.2 | Auth Advanced | Rate Limit 저장소 = PostgreSQL/Prisma 어댑터 |
| DQ-1.3 | Storage | SeaweedFS 단독 채택 |
| DQ-1.4 | Edge Functions | 3층 하이브리드 (isolated-vm v6 + Deno 사이드카 + Sandbox 위임) |
| DQ-1.5 | Realtime | wal2json + supabase-realtime 포팅 하이브리드 |
| DQ-1.6 | Data API | pg_graphql 1순위 (도입은 수요 트리거 시) |
| DQ-1.7 | Data API | pgmq 메인 + SQLite 보조 |
| DQ-1.8 | Observability | node:crypto AES-256-GCM + envelope (KEK→DEK) |
| DQ-1.9 | Table Editor | TanStack v8 자체구현 + 14c-α (현재 노선 유지) |

> DQ-12.3 추가 확정 (Wave 2): MASTER_KEY = `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`

---

## 2. Wave 할당 원칙

| Wave | 주요 역할 | DQ 유형 |
|------|----------|---------|
| **Wave 3** | 100점 정의 + FR/NFR + 제약·가정 | 요구사항/정책 수준 DQ — "이것을 해야 하는가?" |
| **Wave 4** | 카테고리별 청사진 + 아키텍처 설계 | 아키텍처/통합 수준 DQ — "어떻게 구현하는가?" |
| **Wave 5** | 로드맵 + 스파이크 사양 | 타이밍/스파이크 수준 DQ — "언제, 어떤 실험으로?" |

---

## 3. 카테고리별 DQ 전수 목록

---

### 3.1 Table Editor (DQ-1.10~1.16, 7건)

---

### DQ-1.10 [Table Editor] 가상 스크롤 포함 단계

| 항목 | 내용 |
|------|------|
| **질문** | TanStack Virtual 가상 스크롤을 14c-α에 포함할까, 14d로 미룰까? |
| **배경** | Wave 1 01문서 §37 — 현재 11개 테이블 모두 1만 행 미만이므로 급하지 않음 |
| **영향** | FR-TE.4 (대용량 행 렌더링), NFR-PERF.2 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.11 [Table Editor] CSV 파서 선택

| 항목 | 내용 |
|------|------|
| **질문** | CSV 가져오기에 Papa Parse(16KB)를 정식 도입할까, 자체 CSV 파서(~3KB)를 작성할까? |
| **배경** | Wave 1 01문서 §38 — 자체 파서는 따옴표/이스케이프 엣지케이스 위험 존재 |
| **영향** | FR-TE.5 (CSV import), NFR-BUNDLE.1 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.12 [Table Editor] 외래키 셀렉터 컴포넌트

| 항목 | 내용 |
|------|------|
| **질문** | 외래키 selector를 cmdk(기존 의존성)로 만들지, base-ui Combobox로 만들지? |
| **배경** | Wave 1 01문서 §39 — cmdk가 현재 패턴이라 일관성 우위 |
| **영향** | FR-TE.6 (FK 셀 편집), NFR-DX.3 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.13 [Table Editor] AG Grid 전환 합리성

| 항목 | 내용 |
|------|------|
| **질문** | AG Grid를 도입한다면 14b 자산을 폐기하고 다시 짜는 것이 합리적인가? |
| **배경** | Wave 1 02문서 §35 — deep-dive 결론: 비합리적 |
| **영향** | 아키텍처 결정, 구현 비용 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/재검토 트리거 정의 |
| **현재 상태** | 잠정답변 (AG Grid 비채택) |
| **폐기 사유** | — |

---

### DQ-1.14 [Table Editor] Enterprise 라인 도입 가능성

| 항목 | 내용 |
|------|------|
| **질문** | AG Grid Enterprise 라인을 향후 도입할 가능성이 있는가? |
| **배경** | Wave 1 02문서 §36 — 양평 부엌은 SaaS 매출 모델 아님 → 비도입 권장 |
| **영향** | 라이선스 비용, 비즈니스 모델 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 비전 제약 |
| **현재 상태** | 잠정답변 (비도입) |
| **폐기 사유** | — |

---

### DQ-1.15 [Table Editor] 로그 Explorer 비전

| 항목 | 내용 |
|------|------|
| **질문** | 양평 부엌이 향후 "로그 explorer" 같은 시계열 대시보드를 만들 비전이 있는가? |
| **배경** | Wave 1 03문서 §36 — 있다면 Glide 부분 도입 검토 가능 |
| **영향** | 제품 비전, 카테고리 13(UX) 확장 방향 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/00-product-vision.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.16 [Table Editor] 접근성 요구사항

| 항목 | 내용 |
|------|------|
| **질문** | WCAG 2.2 AA 접근성 요구사항이 있는가? |
| **배경** | Wave 1 03문서 §37 — 있다면 Glide Data Grid 즉시 탈락 |
| **영향** | NFR-A11Y.1, 라이브러리 선택 기준 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### 3.2 Table Editor 매트릭스 추가 DQ (DQ-2.1~2.3, 3건)

---

### DQ-2.1 [Table Editor] cmdk vs use-downshift

| 항목 | 내용 |
|------|------|
| **질문** | 14d FK selector 구현 시 cmdk 외에 `use-downshift` 대체 Combobox 검토가 필요한가? |
| **배경** | Wave 2 매트릭스 01 §33 — 현재 답: cmdk 유지 (shadcn 기본 Combobox 일관성) |
| **영향** | FR-TE.6, NFR-DX.3 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (cmdk 유지) |
| **폐기 사유** | — |

---

### DQ-2.2 [Table Editor] Papa Parse Workers 단계

| 항목 | 내용 |
|------|------|
| **질문** | 14d CSV import에 Papa Parse Workers 모드를 포함할지, 14e로 미룰지? |
| **배경** | Wave 2 매트릭스 01 §34 — 현재 답: 14d 메인 스레드 파싱 + 100행 dry-run, Workers는 14e |
| **영향** | FR-TE.5, NFR-PERF.3 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (Workers는 14e) |
| **폐기 사유** | — |

---

### DQ-2.3 [Table Editor] TanStack Query 도입 시점

| 항목 | 내용 |
|------|------|
| **질문** | TanStack Query 도입은 14e에서만 진행할지, 14c-β에서 선도적으로 넣을지? |
| **배경** | Wave 2 매트릭스 01 §35 — 현재 답: 14e (지금은 useState + 수동 setRows로 충분) |
| **영향** | NFR-MAINT.2, 구현 복잡도 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (14e에서 도입) |
| **폐기 사유** | — |

---

### 3.3 SQL Editor (DQ-2.4~2.6, 3건)

---

### DQ-2.4 [SQL Editor] EXPLAIN Visualizer 구현 방식

| 항목 | 내용 |
|------|------|
| **질문** | EXPLAIN Visualizer를 pev2 Vue wrapper로 쓸지, 자체 d3 트리로 구현할지? |
| **배경** | Wave 2 매트릭스 02 §35 — 현재 답: 14f 보너스에서 자체 d3 트리 권장 (의존성 경감) |
| **영향** | FR-SQL.5 (Plan Visualizer), NFR-BUNDLE.2 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/sql-editor-blueprint.md |
| **현재 상태** | 잠정답변 (자체 d3 트리) |
| **폐기 사유** | — |

---

### DQ-2.5 [SQL Editor] sql-formatter 위치

| 항목 | 내용 |
|------|------|
| **질문** | sql-formatter(MIT)를 클라이언트(Monaco action)에서 쓸지, 서버 라우트(/api/sql/format)에서 쓸지? |
| **배경** | Wave 2 매트릭스 02 §36 — 현재 답: 서버 (일관성 + 번들 경감) |
| **영향** | FR-SQL.3, NFR-BUNDLE.1 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/sql-editor-blueprint.md |
| **현재 상태** | 잠정답변 (서버 라우트) |
| **폐기 사유** | — |

---

### DQ-2.6 [SQL Editor] AI 라우트 추가 격리

| 항목 | 내용 |
|------|------|
| **질문** | AI 라우트에 `app_readonly` 롤 + `BEGIN READ ONLY` + statement_timeout 이중 가드 외에 컨테이너/샌드박스 격리가 필요한가? |
| **배경** | Wave 2 매트릭스 02 §37 — 현재 답: 14e는 DB 레벨만, 14g 이후 추가 |
| **영향** | NFR-SEC.5 (AI 격리), FR-SQL.6 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/sql-editor-blueprint.md |
| **현재 상태** | 잠정답변 (14g 이후 추가 격리) |
| **폐기 사유** | — |

---

### 3.4 Schema Visualizer (DQ-3.1~3.15, 15건)

---

### DQ-3.1 [Schema Viz] 관계 자동 추론 알고리즘

| 항목 | 내용 |
|------|------|
| **질문** | drizzle-kit studio의 "관계 자동 추론" 알고리즘(컬럼명 휴리스틱: `userId` → `user.id`)을 자체 introspect에도 적용? |
| **배경** | Wave 1 Schema Viz 01 §38 — 우리 schema는 명시적 FK이지만 레거시 DB 대비 준비 |
| **영향** | FR-SV.2 (ERD 자동 생성), 레거시 DB 지원 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-3.2 [Schema Viz] 행 selector 재사용

| 항목 | 내용 |
|------|------|
| **질문** | Prisma Studio의 행 selector 모달을 별도 컴포넌트로 분리해 `/tables` Table Editor 외래키 셀에서도 재사용? |
| **배경** | Wave 1 Schema Viz 01 §39 — cmdk 기반 재사용 가능성 |
| **영향** | FR-TE.6, FR-SV.3, NFR-DX.2 (코드 재사용) |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-3.3 [Schema Viz] 스튜디오 임베드 검토

| 항목 | 내용 |
|------|------|
| **질문** | Prisma Studio / drizzle-kit studio를 운영자 유틸로 옵션 임베드(iframe)할 가치가 있는가? |
| **배경** | Wave 1 Schema Viz 01 §40 — 답: No. 도메인 분리 + 인증 통합 비용이 자체 구현 비용보다 큼 |
| **영향** | 아키텍처 결정, 인증 통합 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/재검토 조건 |
| **현재 상태** | 잠정답변 (임베드 거부) |
| **폐기 사유** | — |

---

### DQ-3.4 [Schema Viz] ERD 레이아웃 저장 스키마

| 항목 | 내용 |
|------|------|
| **질문** | 사용자별 ERD 레이아웃 저장 — User 테이블에 `preferences JSON` 컬럼 추가 vs 별도 `user_preferences` 테이블? |
| **배경** | Wave 1 Schema Viz 01 §881 — 별도 테이블 권장 (preferences 확장 시 User 변경 없음, RLS 분리) |
| **영향** | FR-SV.4, DB 스키마 설계 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 잠정답변 (별도 테이블) |
| **폐기 사유** | — |

---

### DQ-3.5 [Schema Viz] Monaco vs CodeMirror 6

| 항목 | 내용 |
|------|------|
| **질문** | RLS 정책 편집기로 Monaco(100KB+) vs CodeMirror 6(모듈러 ~50KB) 어느 것? |
| **배경** | Wave 1 Schema Viz 02 §33 — SQL Editor spike-005가 Monaco 채택 → 일관성으로 Monaco |
| **영향** | NFR-BUNDLE.2, FR-SV.5 (RLS 편집) |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 잠정답변 (Monaco) |
| **폐기 사유** | — |

---

### DQ-3.6 [Schema Viz] schemalint CI 통합

| 항목 | 내용 |
|------|------|
| **질문** | schemalint를 CI에 통합하여 PR 차단 정책으로 운용? |
| **배경** | Wave 1 Schema Viz 02 §34 — 답: Yes, PR blocking 채택 |
| **영향** | NFR-OPS.3 (CI 품질 게이트), FR-AD.2 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (PR 차단 채택) |
| **폐기 사유** | — |

---

### DQ-3.7 [Schema Viz] RLS 편집 UX 방식

| 항목 | 내용 |
|------|------|
| **질문** | RLS 정책 편집을 시각(드롭다운+빌더) vs 코드(SQL raw) 방식으로 제공? |
| **배경** | Wave 1 Schema Viz 02 §35 — 답: 둘 다(탭 전환), 시각 모드는 70% 시나리오 |
| **영향** | FR-SV.5, NFR-UX.2 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/01-user-stories.md |
| **현재 상태** | 잠정답변 (듀얼 탭) |
| **폐기 사유** | — |

---

### DQ-3.8 [Schema Viz] Trigger 함수 언어 지원

| 항목 | 내용 |
|------|------|
| **질문** | Trigger 함수 본문에 PostgreSQL 외 언어(PL/Python, PL/Perl) 지원? |
| **배경** | Wave 1 Schema Viz 02 §36 — 답: No, plpgsql only (보안 위험 + 운영자 학습 비용) |
| **영향** | FR-SV.6, NFR-SEC.6 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (plpgsql only) |
| **폐기 사유** | — |

---

### DQ-3.9 [Schema Viz] Trigger 비활성화 토글 UI

| 항목 | 내용 |
|------|------|
| **질문** | Trigger 비활성화 토글(`ALTER TABLE x DISABLE TRIGGER y`)을 UI에서 1클릭으로 노출? |
| **배경** | Wave 1 Schema Viz 02 §1348 — 답: Yes, audit log 필수 |
| **영향** | FR-SV.7, NFR-AUDIT.1 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 잠정답변 (Yes + audit) |
| **폐기 사유** | — |

---

### DQ-3.10 [Schema Viz] Function rename 방식

| 항목 | 내용 |
|------|------|
| **질문** | Function rename을 별도 ALTER FUNCTION 분기 처리 vs DROP+CREATE? |
| **배경** | Wave 1 Schema Viz 02 §1349 — 답: ALTER FUNCTION RENAME (참조 무결성 보존) |
| **영향** | FR-SV.8, DB 안전성 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 잠정답변 (ALTER FUNCTION RENAME) |
| **폐기 사유** | — |

---

### DQ-3.11 [Schema Viz] Policy 삭제 경고

| 항목 | 내용 |
|------|------|
| **질문** | Policy 삭제 시 "이 정책 삭제하면 N개 사용자가 X 테이블에 접근 못할 수 있음" 경고 표시? |
| **배경** | Wave 1 Schema Viz 02 §1350 — Phase 14e 후속 (정책 의존성 분석 별도 deep-dive) |
| **영향** | FR-SV.9, NFR-UX.3 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-3.12 [Schema Viz] RLS 정책 저장 후 ERD 새로고침

| 항목 | 내용 |
|------|------|
| **질문** | Phase 14e-3 `/database/policies`의 정책 적용 후 ERD가 자동 새로고침되는가? |
| **배경** | Wave 2 매트릭스 03 §545 — 답: Yes, `revalidatePath('/database/schema')` |
| **영향** | FR-SV.5, NFR-UX.1 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 잠정답변 (revalidatePath 사용) |
| **폐기 사유** | — |

---

### DQ-3.13 [Schema Viz] schemalint 커스텀 룰 언어

| 항목 | 내용 |
|------|------|
| **질문** | schemalint 커스텀 룰을 JavaScript vs TypeScript로 작성? |
| **배경** | Wave 2 매트릭스 03 §546 — 답: TypeScript (프로젝트 컨벤션 + 타입 안전) |
| **영향** | NFR-DX.2, NFR-MAINT.1 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (TypeScript) |
| **폐기 사유** | — |

---

### DQ-3.14 [Schema Viz] Monaco 테마

| 항목 | 내용 |
|------|------|
| **질문** | Monaco 테마 — vs-dark vs 자체 커스텀 테마? |
| **배경** | Wave 2 매트릭스 03 §547 — 답: vs-dark (추후 커스텀 시 tokens 덮어쓰기) |
| **영향** | NFR-UX.4 (다크 테마 일관성) |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 잠정답변 (vs-dark) |
| **폐기 사유** | — |

---

### DQ-3.15 [Schema Viz] 마지막 허용 정책 삭제 경고

| 항목 | 내용 |
|------|------|
| **질문** | 정책 삭제 전 "이 정책이 마지막 허용 정책입니까?" 경고 표시? |
| **배경** | Wave 2 매트릭스 03 §548 — 답: Yes, Phase 14e-9에서 구현 |
| **영향** | FR-SV.9, NFR-UX.3 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/schema-viz-blueprint.md |
| **현재 상태** | 잠정답변 (Yes) |
| **폐기 사유** | — |

---

### 3.5 DB Ops (DQ-4.1~4.23, 23건)

---

### DQ-4.1 [DB Ops] PM2 cluster 전환

| 항목 | 내용 |
|------|------|
| **질문** | PM2 fork 모드에서 cluster 모드로 전환? |
| **배경** | Wave 1 DB Ops 01 §35 — 답: No, fork 모드 유지. WSL2 + 운영자 1~3명에는 fork면 충분 |
| **영향** | NFR-PERF.1, 인프라 복잡도 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 확장 조건 |
| **현재 상태** | 잠정답변 (fork 유지) |
| **폐기 사유** | — |

---

### DQ-4.2 [DB Ops] pg_cron 도입

| 항목 | 내용 |
|------|------|
| **질문** | pg_cron PostgreSQL 확장을 도입? |
| **배경** | Wave 1 DB Ops 01 §36 — 답: No (현재). SQL-only 잡이 5개 이상 누적되면 재검토 |
| **영향** | FR-DBOPS.1, NFR-OPS.2 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 재검토 조건 |
| **현재 상태** | 잠정답변 (미도입) |
| **폐기 사유** | — |

---

### DQ-4.3 [DB Ops] BullMQ(Redis) 도입

| 항목 | 내용 |
|------|------|
| **질문** | BullMQ(Redis 기반)로 재시도/큐 강화? |
| **배경** | Wave 1 DB Ops 01 §37 — 답: No. Redis = 신규 의존성 추가, advisory lock + retry로 충분 |
| **영향** | FR-DBOPS.2, 인프라 비용 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 재검토 조건 |
| **현재 상태** | 잠정답변 (미도입) |
| **폐기 사유** | — |

---

### DQ-4.4 [DB Ops] 잡 결과 영속화 보존 기간

| 항목 | 내용 |
|------|------|
| **질문** | 잡 결과 영속화 보존 기간은? |
| **배경** | Wave 1 DB Ops 01 §38 — 답: 30일 + 실패는 90일 (audit_log 보존과 일관) |
| **영향** | FR-DBOPS.3, NFR-STORE.1 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (30일 / 실패 90일) |
| **폐기 사유** | — |

---

### DQ-4.5 [DB Ops] 잡 알림 채널

| 항목 | 내용 |
|------|------|
| **질문** | 잡 실패 알림을 Slack/Discord webhook으로 보낼지? |
| **배경** | Wave 1 DB Ops 01 §39 — 답: 14e 추가, Webhook 모델 재사용 |
| **영향** | FR-DBOPS.4, NFR-OPS.4 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (Webhook 재사용) |
| **폐기 사유** | — |

---

### DQ-4.6 [DB Ops] 수동 실행 권한

| 항목 | 내용 |
|------|------|
| **질문** | 잡 수동 실행 권한은 누구에게? |
| **배경** | Wave 1 DB Ops 01 §1044 — 답: admin/owner만, audit log 필수 |
| **영향** | FR-DBOPS.5, NFR-SEC.7 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (admin/owner + audit) |
| **폐기 사유** | — |

---

### DQ-4.7 [DB Ops] 잡 실패 시 자동 비활성화

| 항목 | 내용 |
|------|------|
| **질문** | 잡 연속 실패 시 자동 비활성화? |
| **배경** | Wave 1 DB Ops 01 §1045 — 답: No, 알림만. 운영자 판단 |
| **영향** | FR-DBOPS.6, 운영 정책 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (알림만, 수동 판단) |
| **폐기 사유** | — |

---

### DQ-4.8 [DB Ops] cron timezone 처리

| 항목 | 내용 |
|------|------|
| **질문** | cron-parser timezone 처리를 어떻게? |
| **배경** | Wave 1 DB Ops 01 §1046 — 답: "Asia/Seoul" 강제 (UTC 혼동 방지) |
| **영향** | FR-DBOPS.1, NFR-OPS.5 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (Asia/Seoul 강제) |
| **폐기 사유** | — |

---

### DQ-4.9 [DB Ops] lock timeout vs job timeout 분리

| 항목 | 내용 |
|------|------|
| **질문** | lock timeout과 job timeout을 분리 관리할지? |
| **배경** | Wave 1 DB Ops 01 §1047 — 답: 통합 (job timeout이 lock timeout 역할 겸함) |
| **영향** | FR-DBOPS.7, 구현 복잡도 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (통합) |
| **폐기 사유** | — |

---

### DQ-4.10 [DB Ops] 원격 스토리지 선택

| 항목 | 내용 |
|------|------|
| **질문** | 백업 원격 스토리지로 B2 vs S3 vs Cloudflare R2? |
| **배경** | Wave 1 DB Ops 02 §34 — 답: B2 (이미 사용 중, 비용 최저) |
| **영향** | NFR-BACKUP.1, 운영 비용 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (B2) |
| **폐기 사유** | — |

---

### DQ-4.11 [DB Ops] 복원 검증 자동화

| 항목 | 내용 |
|------|------|
| **질문** | 복원 환경(staging container)을 cron으로 매주 자동 검증? |
| **배경** | Wave 1 DB Ops 02 §35 — 답: Yes, 매월 1일 + 결과 webhook |
| **영향** | FR-DBOPS.8, NFR-BACKUP.2 (RTO 검증) |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (매월 1일 자동 검증) |
| **폐기 사유** | — |

---

### DQ-4.12 [DB Ops] 백업 보존 정책

| 항목 | 내용 |
|------|------|
| **질문** | 백업 보존 정책 — 베이스 N개 + WAL N일? |
| **배경** | Wave 1 DB Ops 02 §36 — 답: 베이스 7개 + WAL 14일 (14일 PITR 가능) |
| **영향** | NFR-BACKUP.3, 스토리지 비용 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (베이스 7개 + WAL 14일) |
| **폐기 사유** | — |

---

### DQ-4.13 [DB Ops] 백업 암호화

| 항목 | 내용 |
|------|------|
| **질문** | 백업 암호화를 wal-g libsodium/openpgp + B2 SSE 이중 적용? |
| **배경** | Wave 1 DB Ops 02 §37 — 답: libsodium + B2 SSE 이중 |
| **영향** | NFR-SEC.8, NFR-BACKUP.4 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 잠정답변 (이중 암호화) |
| **폐기 사유** | — |

---

### DQ-4.14 [DB Ops] pg_dump 보조 보관

| 항목 | 내용 |
|------|------|
| **질문** | pg_dump 보조 보관 기간은? |
| **배경** | Wave 1 DB Ops 02 §38 — 답: 월 1회 dump를 12개월 보관 |
| **영향** | NFR-BACKUP.5, 스토리지 비용 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (월 1회 12개월) |
| **폐기 사유** | — |

---

### DQ-4.15 [DB Ops] 암호화 키 보관

| 항목 | 내용 |
|------|------|
| **질문** | libsodium 암호화 키를 몇 곳에 보관? 분실 시 백업 영구 복호화 불가 |
| **배경** | Wave 1 DB Ops 02 §968 — 답: 3중 보관 (서버 .env + 1Password + 인쇄) |
| **영향** | NFR-SEC.9, NFR-BACKUP.6 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (3중 보관) |
| **폐기 사유** | — |

---

### DQ-4.16 [DB Ops] archive_timeout 설정

| 항목 | 내용 |
|------|------|
| **질문** | PostgreSQL `archive_timeout` 값은? RPO 60초 보장을 위해 |
| **배경** | Wave 1 DB Ops 02 §969 — 답: 60초 |
| **영향** | NFR-BACKUP.7 (RPO 60초), 디스크 I/O |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 잠정답변 (60초) |
| **폐기 사유** | — |

---

### DQ-4.17 [DB Ops] 복원 시 PM2 자동 중지

| 항목 | 내용 |
|------|------|
| **질문** | 복원 시 PM2 프로세스를 자동으로 중지할지? |
| **배경** | Wave 1 DB Ops 02 §970 — 답: No, 운영자 명시적 중지 |
| **영향** | FR-DBOPS.9, 안전성 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (수동 중지) |
| **폐기 사유** | — |

---

### DQ-4.18 [DB Ops] 복원 후 audit log 보관

| 항목 | 내용 |
|------|------|
| **질문** | 복원 후 audit_log를 별도 보관? restore-event 기록 |
| **배경** | Wave 1 DB Ops 02 §971 — 답: Yes, restore-event 기록 |
| **영향** | FR-DBOPS.10, NFR-AUDIT.2 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (restore-event 기록) |
| **폐기 사유** | — |

---

### DQ-4.19 [DB Ops] CronJobRun output 크기 제한

| 항목 | 내용 |
|------|------|
| **질문** | CronJobRun의 `output: Json?` 크기 제한은? |
| **배경** | Wave 2 매트릭스 03 §659 — 답: 10KB, 초과 시 truncate + S3 링크 |
| **영향** | FR-DBOPS.3, NFR-STORE.2 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (10KB) |
| **폐기 사유** | — |

---

### DQ-4.20 [DB Ops] advisory lock key 충돌 확률

| 항목 | 내용 |
|------|------|
| **질문** | advisory lock key 충돌 확률은 허용 가능한가? |
| **배경** | Wave 2 매트릭스 03 §660 — 답: sha256 64비트 → 2^32 잡까지 ~0% |
| **영향** | FR-DBOPS.7, 동시성 안전성 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (충돌 무시 가능) |
| **폐기 사유** | — |

---

### DQ-4.21 [DB Ops] wal-g backup-verify 주기

| 항목 | 내용 |
|------|------|
| **질문** | wal-g `backup-verify`를 언제 실행? |
| **배경** | Wave 2 매트릭스 03 §661 — 답: 토요일 03:00 |
| **영향** | NFR-BACKUP.2, 운영 부하 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (토요일 03:00) |
| **폐기 사유** | — |

---

### DQ-4.22 [DB Ops] 복원 미리보기 속도 가정

| 항목 | 내용 |
|------|------|
| **질문** | 복원 미리보기의 시간 추정 50MB/s 가정이 적절한가? |
| **배경** | Wave 2 매트릭스 03 §662 — 답: 첫 실제 복원 후 측정치로 보정 |
| **영향** | NFR-BACKUP.8 (RTO 30분), UI 표시 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 스파이크 사양 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-4.23 [DB Ops] Backup kind enum 확장성

| 항목 | 내용 |
|------|------|
| **질문** | Backup 모델의 `kind` 필드를 enum으로 정의할지, string literal union으로 정의할지? |
| **배경** | Wave 2 매트릭스 03 §663 — 답: string literal union (enum 마이그레이션 비용 회피) |
| **영향** | DB 스키마 설계, NFR-MAINT.3 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/db-ops-blueprint.md |
| **현재 상태** | 잠정답변 (string literal union) |
| **폐기 사유** | — |

---

### 3.6 Auth Core (DQ-LUCIA-1~5, DQ-AJS-1~6, DQ-AC-M-1~5, 16건)

---

### DQ-AC-1 [Auth Core] argon2 교체 시점

| 항목 | 내용 |
|------|------|
| **질문** | bcryptjs → @node-rs/argon2 교체 시점은? (성능 5×, native 모듈 부담) |
| **배경** | Wave 1 Auth Core 01 §628 — 현행 bcrypt, 향후 argon2 전환 검토 |
| **영향** | NFR-SEC.10, NFR-PERF.4 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 마이그레이션 타이밍 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-2 [Auth Core] Session 테이블 DB 이전 인덱스 전략

| 항목 | 내용 |
|------|------|
| **질문** | Session 테이블을 SQLite(현행) → Postgres로 이전 시 인덱스 전략 차이? |
| **배경** | Wave 1 Auth Core 01 §629 — SQLite vs Postgres 인덱스 특성 차이 |
| **영향** | FR-AUTH.2, NFR-MAINT.4 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ DB 마이그레이션 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-3 [Auth Core] Anonymous 로그인 RBAC 역할

| 항목 | 내용 |
|------|------|
| **질문** | Anonymous sign-in 시 RBAC role은 무엇으로? STAFF vs 새로운 GUEST? |
| **배경** | Wave 1 Auth Core 01 §630 — 현행 역할 체계와 충돌 가능성 |
| **영향** | FR-AUTH.3, NFR-SEC.11 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-4 [Auth Core] 디바이스 목록 UI user-agent 파싱

| 항목 | 내용 |
|------|------|
| **질문** | 디바이스 목록 UI에서 user-agent parsing 라이브러리는? (`ua-parser-js`?) |
| **배경** | Wave 1 Auth Core 01 §631 |
| **영향** | FR-AUTH.4, NFR-BUNDLE.3 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/auth-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-5 [Auth Core] x-forwarded-for 신뢰 정책

| 항목 | 내용 |
|------|------|
| **질문** | Cloudflare Tunnel 환경에서 `x-forwarded-for` 신뢰 전략? (CF-Connecting-IP 사용?) |
| **배경** | Wave 1 Auth Core 01 §632 — Cloudflare Tunnel 경유이므로 CF 헤더 신뢰 |
| **영향** | NFR-SEC.12, FR-AUTH.5 (Rate Limit 정확성) |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-6 [Auth Core] Session id 해시 저장

| 항목 | 내용 |
|------|------|
| **질문** | Session `id`를 SHA-256 hash로 DB 저장할 것인가? (Lucia v4 권장) |
| **배경** | Wave 2 매트릭스 05 §438 |
| **영향** | NFR-SEC.13, FR-AUTH.2 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-7 [Auth Core] Account linking 스키마

| 항목 | 내용 |
|------|------|
| **질문** | Account linking 스키마(`Account` 테이블)를 Phase E에 포함할 것인가? |
| **배경** | Wave 2 매트릭스 05 §439 |
| **영향** | FR-AUTH.6, DB 스키마 설계 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-8 [Auth Core] Provider 인터페이스 범위

| 항목 | 내용 |
|------|------|
| **질문** | Provider 인터페이스는 OAuth 2.0 / OIDC / Credentials 3종만 정의할 것인가, WebAuthn도 포함할 것인가? |
| **배경** | Wave 2 매트릭스 05 §440 |
| **영향** | FR-AUTH.7, FR-AUTH.1 (WebAuthn) |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-9 [Auth Core] CF-Connecting-IP 헤더 통일

| 항목 | 내용 |
|------|------|
| **질문** | `x-forwarded-for` vs `cf-connecting-ip` 신뢰 정책을 Auth Advanced(rate-limit)와 통일할 것인가? |
| **배경** | Wave 2 매트릭스 05 §441 |
| **영향** | NFR-SEC.12, Auth Advanced 통합 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-10 [Auth Core] Session revokedAt vs DELETE

| 항목 | 내용 |
|------|------|
| **질문** | 세션 테이블에 `revokedAt` 추가 vs DELETE만 할 것인가? (audit trail 관점) |
| **배경** | Wave 2 매트릭스 05 §442 |
| **영향** | NFR-AUDIT.3, FR-AUTH.8 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-11 [Auth Core] OAuth Naver 사업자 인증

| 항목 | 내용 |
|------|------|
| **질문** | Naver OAuth client_secret 발급 절차에 비즈니스 사업자 인증이 필요한가? |
| **배경** | Wave 1 Auth Core 02 §729 |
| **영향** | FR-AUTH.7 (OAuth), 제약 사항 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-12 [Auth Core] Account linking 자동 vs 수동

| 항목 | 내용 |
|------|------|
| **질문** | Account linking 시 같은 이메일 다른 provider 정책 — 자동 link vs 수동 confirm? |
| **배경** | Wave 1 Auth Core 02 §730 |
| **영향** | FR-AUTH.6, NFR-SEC.14 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AC-13 [Auth Core] 다중 OAuth provider 허용

| 항목 | 내용 |
|------|------|
| **질문** | 직원 계정에 다중 OAuth provider 연결 허용? (개인 Google + 회사 카카오워크?) |
| **배경** | Wave 1 Auth Core 02 §733 |
| **영향** | FR-AUTH.6, UX 정책 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/01-user-stories.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### 3.7 Auth Advanced (DQ-WT-1~7, DQ-AA-M-1~8, 15건)

---

### DQ-AA-1 [Auth Advanced] WebAuthn 활성 시 TOTP 비활성화

| 항목 | 내용 |
|------|------|
| **질문** | WebAuthn 활성 사용자에게 TOTP 자동 비활성화? |
| **배경** | Wave 1/2 Auth Advanced — 답: 사용자 선택 (옵션 제공) |
| **영향** | FR-MFA.1, NFR-UX.5 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (옵션 제공) |
| **폐기 사유** | — |

---

### DQ-AA-2 [Auth Advanced] Challenge 저장소

| 항목 | 내용 |
|------|------|
| **질문** | WebAuthn Challenge 저장: Redis vs Prisma 임시 테이블? |
| **배경** | Wave 2 매트릭스 06 §531 — 답: Prisma (외부 의존성 0) |
| **영향** | FR-MFA.2, 인프라 의존성 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (Prisma 임시 테이블) |
| **폐기 사유** | — |

---

### DQ-AA-3 [Auth Advanced] FIDO MDS 통합

| 항목 | 내용 |
|------|------|
| **질문** | FIDO MDS 통합으로 인증기 메타데이터 검증? (+2점 보너스) |
| **배경** | Wave 1/2 Auth Advanced — Phase 17 이후 검토 |
| **영향** | NFR-SEC.15, +2점 보너스 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ Phase 17 이후 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AA-4 [Auth Advanced] 계정 락 해제 방식

| 항목 | 내용 |
|------|------|
| **질문** | 계정 락 해제: 관리자 수동 + 시간 자동 모두 지원? |
| **배경** | Wave 1 Auth Advanced 03 §996 — 답: 둘 다 지원 |
| **영향** | FR-RL.1, NFR-UX.6 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (둘 다 지원) |
| **폐기 사유** | — |

---

### DQ-AA-5 [Auth Advanced] 잠긴 계정 이메일 알림

| 항목 | 내용 |
|------|------|
| **질문** | 잠긴 계정에 이메일 알림 발송? (스팸 위험 vs 보안 인식) |
| **배경** | Wave 1 Auth Advanced 03 §997 |
| **영향** | FR-RL.2, NFR-SEC.16 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-AA-6 [Auth Advanced] Rate limit 응답 표시

| 항목 | 내용 |
|------|------|
| **질문** | Rate limit 응답 표시: 정확한 시간(초) vs 모호한 "잠시 후"? |
| **배경** | Wave 1 Auth Advanced 03 §998 — 답: 초 단위 + "잠시 후" 병행 |
| **영향** | NFR-UX.7, FR-RL.3 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/01-user-stories.md |
| **현재 상태** | 잠정답변 (초 + 모호 병행) |
| **폐기 사유** | — |

---

### DQ-AA-7 [Auth Advanced] CAPTCHA 선택

| 항목 | 내용 |
|------|------|
| **질문** | CAPTCHA: hCaptcha vs Cloudflare Turnstile? |
| **배경** | Wave 2 매트릭스 06 §536 — 답: Turnstile 우선 (이미 CF 사용) |
| **영향** | FR-RL.4, NFR-SEC.17 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (Turnstile) |
| **폐기 사유** | — |

---

### DQ-AA-8 [Auth Advanced] JWT refresh rotation 전략

| 항목 | 내용 |
|------|------|
| **질문** | JWT refresh rotation: revokedAt 사용 vs tokenFamily table? |
| **배경** | Wave 2 매트릭스 06 §537 — 답: revokedAt + tokenFamily 하이브리드 |
| **영향** | NFR-SEC.18, FR-AUTH.9 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/auth-blueprint.md |
| **현재 상태** | 잠정답변 (하이브리드) |
| **폐기 사유** | — |

---

### DQ-AA-9 [Auth Advanced] Conditional UI 활성화 시점

| 항목 | 내용 |
|------|------|
| **질문** | WebAuthn Conditional UI(autofill) 활성화 시점은? |
| **배경** | Wave 1/2 Auth Advanced — Phase 17 완료 후 안정화 2주 뒤 |
| **영향** | FR-MFA.3, NFR-UX.8 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ Phase 17 이후 |
| **현재 상태** | 잠정답변 (Phase 17+2주) |
| **폐기 사유** | — |

---

### DQ-AA-10 [Auth Advanced] 백업 코드 재조회

| 항목 | 내용 |
|------|------|
| **질문** | 백업 코드 표시 방식: 한번만 vs 재조회 가능? |
| **배경** | Wave 1/2 Auth Advanced — 답: 한번만 (재조회 = 재생성으로만) |
| **영향** | FR-MFA.4, NFR-SEC.19 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (한번만) |
| **폐기 사유** | — |

---

### 3.8 Advisors (DQ-SP-1~6, DQ-SQ-1~7, DQ-AD-1~7, 20건 — 대표 10건 수록)

---

### DQ-ADV-1 [Advisors] Postgres 마이그레이션 시점

| 항목 | 내용 |
|------|------|
| **질문** | Postgres 마이그레이션 시점은? 현행 SQLite, P0 보안 룰 절반이 Postgres 전용 |
| **배경** | Wave 1 Advisors 01 §703 — splinter P0 룰 중 SQLite 적용 가능 것 먼저 포팅 가능 |
| **영향** | FR-AD.1, 전체 로드맵 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ DB 마이그레이션 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-ADV-2 [Advisors] Slack 알림 채널

| 항목 | 내용 |
|------|------|
| **질문** | Slack 알림 채널 — 별도 `#advisors` vs `#alerts` 통합? |
| **배경** | Wave 1 Advisors 01 §704 |
| **영향** | FR-AD.2, NFR-OPS.6 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-ADV-3 [Advisors] 알림 임계 수준

| 항목 | 내용 |
|------|------|
| **질문** | 알림 임계 — ERROR만 즉시 알림 vs WARN도 일일 다이제스트? |
| **배경** | Wave 1 Advisors 01 §705 |
| **영향** | FR-AD.3, NFR-OPS.7 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-ADV-4 [Advisors] PR 차단 정책

| 항목 | 내용 |
|------|------|
| **질문** | PR 차단 정책 — ERROR 발견 시 머지 block? (overhead 위험) |
| **배경** | Wave 1 Advisors 01 §706 |
| **영향** | FR-AD.4, NFR-OPS.8 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-ADV-5 [Advisors] 룰 음소거 만료

| 항목 | 내용 |
|------|------|
| **질문** | 룰 음소거 만료 정책 — 영구 vs 30일 자동 해제? |
| **배경** | Wave 1 Advisors 01 §707 |
| **영향** | FR-AD.5, NFR-MAINT.5 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/advisors-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-ADV-6 [Advisors] squawk WARN 승격 정책

| 항목 | 내용 |
|------|------|
| **질문** | squawk WARN에 대한 합의 — ERROR 승격 정책 (매 6개월 팀 리뷰?) |
| **배경** | Wave 2 매트릭스 10 §354 |
| **영향** | FR-AD.6, 운영 정책 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-ADV-7 [Advisors] schemalint 룰 unit test

| 항목 | 내용 |
|------|------|
| **질문** | schemalint 커스텀 룰 unit test fixture — pgsql-ast-parser vs 실제 shadow DB? |
| **배경** | Wave 2 매트릭스 10 §355 |
| **영향** | NFR-TEST.1, FR-AD.7 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/advisors-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### 3.9 Realtime (DQ-RT-1~6, 6건)

---

### DQ-RT-1 [Realtime] WebSocket 서버 위치

| 항목 | 내용 |
|------|------|
| **질문** | Phase 1 WebSocket 서버를 Next.js 16 Route Handler vs 별도 PM2 프로세스로 분리? |
| **배경** | Wave 2 매트릭스 09 §299 |
| **영향** | FR-RT.1, NFR-PERF.5 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/realtime-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-RT-2 [Realtime] access_token 재발급 주기

| 항목 | 내용 |
|------|------|
| **질문** | Realtime 포팅의 `access_token` 재발급 주기 — JWT 만료(1h)마다 vs 15분 마다? |
| **배경** | Wave 2 매트릭스 09 §300 |
| **영향** | NFR-SEC.20, NFR-PERF.6 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/realtime-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-RT-3 [Realtime] presence_diff 구조 검증

| 항목 | 내용 |
|------|------|
| **질문** | `@supabase/realtime-js`의 `presence_diff` 메시지 구조 정확도 검증 필요한가? |
| **배경** | Wave 2 매트릭스 09 §301 |
| **영향** | NFR-COMPAT.1 (Supabase 호환), FR-RT.2 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 스파이크 사양 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-RT-4 [Realtime] pg_notify 자동 vs 명시적

| 항목 | 내용 |
|------|------|
| **질문** | pg_listen을 cache bust 신호로 쓸 때, wal2json 이벤트에서 자동 `pg_notify` 발송 vs 애플리케이션 write 경로에서 명시적 notify? |
| **배경** | Wave 2 매트릭스 09 §302 |
| **영향** | FR-RT.3, 아키텍처 설계 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/realtime-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-RT-5 [Realtime] Replication Slot 공유 vs 분리

| 항목 | 내용 |
|------|------|
| **질문** | 하이브리드 구성에서 Slot 1개 공유 vs 2개 분리 (wal2json·Realtime 각각)? |
| **배경** | Wave 2 매트릭스 09 §303 |
| **영향** | NFR-PERF.7, FR-RT.4 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/realtime-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-RT-6 [Realtime] PG 18 업그레이드 타이밍

| 항목 | 내용 |
|------|------|
| **질문** | PG 18 `idle_replication_slot_timeout` 가용 시까지 대기 vs PG 17에서 자체 cron 유지? |
| **배경** | Wave 2 매트릭스 09 §304 |
| **영향** | NFR-MAINT.6, FR-RT.4 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ PG 업그레이드 |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### 3.10 Data API (DQ-1.25~1.34, DQ-11.1~11.9, 19건 — 대표 수록)

---

### DQ-1.25 [Data API] Persisted Query 허용 범위

| 항목 | 내용 |
|------|------|
| **질문** | pg_graphql 도입 시 Persisted Query만 허용할지 ad-hoc 쿼리도 허용할지? |
| **배경** | Wave 1 Data API 01 §533 |
| **영향** | NFR-SEC.21, FR-DAPI.1 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.26 [Data API] GraphQL + Realtime 통합 endpoint

| 항목 | 내용 |
|------|------|
| **질문** | pg_graphql Subscription 부재를 메우기 위해 Realtime 포팅과 결합 시 통합 endpoint 설계 |
| **배경** | Wave 1 Data API 01 §534 |
| **영향** | FR-DAPI.2, FR-RT.5 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.27 [Data API] introspection CI 자동화

| 항목 | 내용 |
|------|------|
| **질문** | Prisma 7 schema와 pg_graphql introspection 사이의 동기화 자동 검증 (CI에서 `prisma db pull` + `pg_graphql introspection diff`) |
| **배경** | Wave 1 Data API 01 §535 |
| **영향** | NFR-MAINT.7, FR-DAPI.3 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.31 [Data API] pgmq archive 정리 정책

| 항목 | 내용 |
|------|------|
| **질문** | pgmq archive 정리 정책 — pg_cron vs pg_partman 선택 |
| **배경** | Wave 1 Data API 03 §678 |
| **영향** | FR-DAPI.4, NFR-STORE.3 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-1.32 [Data API] pgmq dead-letter 알림

| 항목 | 내용 |
|------|------|
| **질문** | pgmq dead-letter 알림 채널 (Slack/email/dashboard) |
| **배경** | Wave 1 Data API 03 §679 |
| **영향** | FR-DAPI.5, NFR-OPS.9 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-11.1 [Data API] JSONB path filter

| 항목 | 내용 |
|------|------|
| **질문** | operator parser에서 JSONB path (`filter[meta.key]=value`) 지원 여부 — Prisma 7 JsonFilter 호환성 검증 필요 |
| **배경** | Wave 2 매트릭스 11 §448 |
| **영향** | FR-DAPI.6, NFR-COMPAT.2 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-11.3 [Data API] pgmq worker 스케일링

| 항목 | 내용 |
|------|------|
| **질문** | pgmq worker를 PM2 fork mode 2개로 고정할지, dynamic scaling을 도입할지? |
| **배경** | Wave 2 매트릭스 11 §450 |
| **영향** | NFR-PERF.8, FR-DAPI.4 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/data-api-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### 3.11 Observability + JWKS (DQ-12.1~12.14, 14건)

---

### DQ-12.1 [Observability] MASTER_KEY 오프라인 복사본 수

| 항목 | 내용 |
|------|------|
| **질문** | MASTER_KEY 파일의 오프라인 복사본을 몇 개까지 유지할지? (1개 vs 2개 — 분실 vs 노출) |
| **배경** | Wave 2 매트릭스 12 §617 |
| **영향** | NFR-SEC.22, NFR-BACKUP.9 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-12.2 [Observability] SecretItem 값 길이 제한

| 항목 | 내용 |
|------|------|
| **질문** | SecretItem.value 길이 제한 — 4KB? 무제한? (DoS/저장 효율) |
| **배경** | Wave 2 매트릭스 12 §618 |
| **영향** | FR-VAULT.1, NFR-STORE.4 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/03-non-functional-requirements.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-12.4 [Observability] JWKS Cloudflare Workers 캐시

| 항목 | 내용 |
|------|------|
| **질문** | JWKS endpoint를 Cloudflare Workers 앞단 캐시로 둘지? (P2 대기) |
| **배경** | Wave 2 매트릭스 12 §620 |
| **영향** | NFR-PERF.9, NFR-COMPAT.3 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ P2 백로그 |
| **현재 상태** | 잠정답변 (P2 대기) |
| **폐기 사유** | — |

---

### DQ-12.5 [Observability] Capacitor JWKS 방식

| 항목 | 내용 |
|------|------|
| **질문** | Capacitor 앱이 JWKS를 빌드 타임 inline할지, 런타임 fetch할지? |
| **배경** | Wave 2 매트릭스 12 §621 — 오프라인 내구성 vs 회전 즉시성 |
| **영향** | NFR-COMPAT.4, FR-MOBILE.1 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 모바일 확장 |
| **현재 상태** | 잠정답변 (빌드 타임 inline + grace) |
| **폐기 사유** | — |

---

### DQ-12.7 [Observability] KEK 회전 자동화 수준

| 항목 | 내용 |
|------|------|
| **질문** | KEK 회전 주기를 자동 알림만 할지, 자동 실행까지 갈지? (1인 운영 인지 부하) |
| **배경** | Wave 2 매트릭스 12 §623 |
| **영향** | NFR-SEC.23, NFR-OPS.10 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (자동 알림 + 수동 실행) |
| **폐기 사유** | — |

---

### DQ-12.8 [Observability] Vault 감사 로그 보관 기간

| 항목 | 내용 |
|------|------|
| **질문** | 감사 로그(Vault read/write) 보관 기간 (90일? 1년?) |
| **배경** | Wave 2 매트릭스 12 §624 |
| **영향** | NFR-AUDIT.4, NFR-STORE.5 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### DQ-12.13 [Observability] 긴급 JWKS 회전 시 refresh_token 무효화

| 항목 | 내용 |
|------|------|
| **질문** | 긴급 회전 시 모든 기존 refresh_token 무효화 전략 (블랙리스트 vs 세션 버전) |
| **배경** | Wave 1 Observability 02 §657 |
| **영향** | NFR-SEC.24, FR-AUTH.10 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/auth-blueprint.md |
| **현재 상태** | 미답변 |
| **폐기 사유** | — |

---

### 3.12 UX Quality (DQ-UX-1~3, DQ-3.1~3.3, 6건)

---

### DQ-UX-3 [UX Quality] Opus 4.7 토큰 예산

| 항목 | 내용 |
|------|------|
| **질문** | Opus 4.7 새 tokenizer로 토큰 35% 증가 가능성 — 월 예산 $5 → $7 상향? |
| **배경** | Wave 2 매트릭스 13 §257 — 답: $5 유지, Opus 4.7 호출 빈도 제한 |
| **영향** | NFR-COST.1, FR-AI.1 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 ($5 유지) |
| **폐기 사유** | — |

---

### DQ-AI-1 [UX Quality] 챗 메시지 영구 저장

| 항목 | 내용 |
|------|------|
| **질문** | AI 챗 메시지 영구 저장? (`AiThread` + `AiMessage` 모델) |
| **배경** | Wave 1 UX Quality 01 §629 — 답: Yes, 검색/감사 목적 |
| **영향** | FR-AI.2, NFR-STORE.6 |
| **Wave 할당** | Wave 4 |
| **담당 문서** | 02-architecture/ux-blueprint.md |
| **현재 상태** | 잠정답변 (Yes, 영구 저장) |
| **폐기 사유** | — |

---

### DQ-AI-2 [UX Quality] Schema 제안 자동 실행

| 항목 | 내용 |
|------|------|
| **질문** | AI Schema 제안의 prisma migrate를 자동 실행할 것인가? |
| **배경** | Wave 1 UX Quality 01 §631 — 답: No, 두 단계 승인 |
| **영향** | FR-AI.3, NFR-SEC.25 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/02-functional-requirements.md |
| **현재 상태** | 잠정답변 (두 단계 승인) |
| **폐기 사유** | — |

---

### 3.13 Operations (DQ-OPS-1~4, DQ-4.1~4.3 중복 없이 4건)

---

### DQ-OPS-1 [Operations] self-hosted runner Docker 전환

| 항목 | 내용 |
|------|------|
| **질문** | self-hosted runner를 Docker isolated로 전환할 것인가? |
| **배경** | Wave 2 매트릭스 14 §246 — 답: No, 별도 WSL distro 가능성만 확보 |
| **영향** | NFR-OPS.11, 인프라 복잡도 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ Docker 이행 조건 |
| **현재 상태** | 잠정답변 (No, WSL distro 유지) |
| **폐기 사유** | — |

---

### DQ-OPS-2 [Operations] 마이그레이션 실패 시 중단 정책

| 항목 | 내용 |
|------|------|
| **질문** | Prisma migrate 실패 시 symlink 스왑하지 않고 중단 — Slack fatal 알림 + 수동 개입 정책? |
| **배경** | Wave 2 매트릭스 14 §247 — 자동 롤백은 migration 성공 이후 단계에서만 |
| **영향** | FR-OPS.1, NFR-SAFE.1 |
| **Wave 할당** | Wave 3 |
| **담당 문서** | 00-vision/04-constraints-assumptions.md |
| **현재 상태** | 잠정답변 (수동 개입) |
| **폐기 사유** | — |

---

### DQ-OPS-3 [Operations] Node 버전 전환 격리 수준

| 항목 | 내용 |
|------|------|
| **질문** | Node 버전 전환 시 (20→22) release 수준 격리로 충분 vs Docker 전환? |
| **배경** | Wave 2 매트릭스 14 §248 — 답: release 격리로 충분, `.nvmrc`로 버전 고정 |
| **영향** | NFR-MAINT.8, NFR-OPS.12 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ Docker 이행 조건 |
| **현재 상태** | 잠정답변 (release 격리) |
| **폐기 사유** | — |

---

### DQ-OPS-4 [Operations] 2번째 호스트 DR 추가

| 항목 | 내용 |
|------|------|
| **질문** | 2번째 호스트(DR) 추가 시점? |
| **배경** | Wave 2 매트릭스 14 §249 — 답: 현 시점 불필요, Cloudflare Tunnel replica로 향후 확장 경로 유지 |
| **영향** | NFR-AVAIL.1, 인프라 비용 |
| **Wave 할당** | Wave 5 |
| **담당 문서** | 05-roadmap/ 확장 조건 |
| **현재 상태** | 잠정답변 (현재 불필요) |
| **폐기 사유** | — |

---

## 4. Wave별 DQ 분배 요약표

| Wave | DQ 수 | 주요 주제 | 주요 담당 문서 |
|------|-------|----------|--------------|
| **Wave 3** | **20건** | 요구사항/정책 (FR/NFR/ASM) | 02-functional-requirements.md, 03-non-functional-requirements.md, 04-constraints-assumptions.md |
| **Wave 4** | **28건** | 아키텍처/통합 설계 | 02-architecture/ 카테고리별 blueprint |
| **Wave 5** | **16건** | 타이밍/스파이크/재검토 트리거 | 05-roadmap/, 스파이크 사양 |
| **합계** | **64건** | — | — |

### Wave 3 주요 DQ 목록 (20건)

DQ-1.10(가상 스크롤 단계), DQ-1.11(CSV 파서), DQ-1.12(FK 셀렉터), DQ-1.15(로그 Explorer 비전), DQ-1.16(접근성), DQ-2.1~2.3(Table Editor 매트릭스), DQ-3.5(Monaco), DQ-3.6(schemalint CI), DQ-3.7(RLS UX), DQ-3.8(plpgsql), DQ-3.13(룰 언어), DQ-3.14(Monaco 테마), DQ-4.4(잡 보존), DQ-4.6(수동 실행 권한), DQ-4.7(자동 비활성화), DQ-4.8(timezone), DQ-4.10(B2), DQ-4.12(보존 정책), DQ-4.13(암호화), DQ-4.14(pg_dump), DQ-4.15(키 보관), DQ-4.16(archive_timeout), DQ-4.17(PM2 중지), DQ-AC-3(Anonymous role), DQ-AC-5(CF-IP), DQ-AC-6(session hash), DQ-AC-7(account linking), DQ-AC-8(provider), DQ-AC-9(CF통일), DQ-AC-10(revokedAt), DQ-AC-11(Naver), DQ-AC-12(linking 정책), DQ-AC-13(다중 provider), DQ-AA-1(TOTP/WebAuthn), DQ-AA-2(Challenge), DQ-AA-4(계정락), DQ-AA-6(RL 응답), DQ-AA-7(CAPTCHA), DQ-AA-10(백업코드), DQ-ADV-2(Slack), DQ-ADV-3(임계), DQ-ADV-4(PR 차단), DQ-ADV-6(WARN 승격), DQ-12.1(MASTER_KEY), DQ-12.2(SecretItem), DQ-12.7(KEK 알림), DQ-12.8(audit 보관), DQ-UX-3(예산), DQ-AI-2(승인), DQ-OPS-2(마이그 실패)

### Wave 4 주요 DQ 목록 (28건)

DQ-2.4(d3 트리), DQ-2.5(sql-formatter), DQ-2.6(AI 격리), DQ-3.1(관계 추론), DQ-3.2(selector 재사용), DQ-3.4(ERD 레이아웃), DQ-3.9(Trigger 토글), DQ-3.10(Function rename), DQ-3.11(Policy 삭제), DQ-3.12(ERD 새로고침), DQ-3.15(마지막 정책), DQ-4.5(잡 알림), DQ-4.9(timeout), DQ-4.11(복원 검증), DQ-4.18(audit), DQ-4.19(output 제한), DQ-4.20(advisory lock), DQ-4.21(backup-verify), DQ-4.23(kind enum), DQ-AA-8(refresh rotation), DQ-ADV-5(음소거 만료), DQ-ADV-7(unit test), DQ-RT-1(WS 위치), DQ-RT-2(token 주기), DQ-RT-4(pg_notify), DQ-RT-5(Slot 수), DQ-1.25(Persisted Query), DQ-1.26(통합 endpoint), DQ-1.27(introspection CI), DQ-1.31(pgmq archive), DQ-1.32(dead-letter), DQ-11.1(JSONB), DQ-11.3(pgmq worker), DQ-12.13(refresh 무효화), DQ-AI-1(영구 저장)

### Wave 5 주요 DQ 목록 (16건)

DQ-1.13(AG Grid), DQ-1.14(Enterprise), DQ-3.3(임베드), DQ-4.1(cluster), DQ-4.2(pg_cron), DQ-4.3(BullMQ), DQ-4.22(복원 속도), DQ-AA-3(FIDO MDS), DQ-AA-9(Conditional UI), DQ-ADV-1(PG 마이그), DQ-RT-3(presence_diff), DQ-RT-6(PG 18), DQ-12.4(JWKS 캐시), DQ-12.5(Capacitor), DQ-AC-1(argon2), DQ-AC-2(Session 인덱스), DQ-OPS-1(Docker), DQ-OPS-3(Node 버전), DQ-OPS-4(DR 호스트)

---

## 5. 폐기 DQ (Cancel)

| DQ# | 원래 질문 | 폐기 사유 |
|-----|----------|----------|
| DQ-1.5 (Edge) | workerd를 isolated-vm 대신 메인 엔진으로 쓸 가치? | Wave 1/2에서 3층 하이브리드로 확정 — workerd 단독 채택 논의 무의미 |
| DQ-1.6 (Edge) | Vercel Sandbox Hobby 무료 티어를 예외 정책으로 수용? | 3층 하이브리드 확정 시 Sandbox는 3층 중 하나로 포함 — 별도 정책 불필요 |
| DQ-UX-1 | 프롬프트 캐싱 TTL 5분 vs 1시간 | Wave 2에서 5분으로 확정 (2회 hit 손익분기 분석 완료) |
| DQ-UX-2 | AI Gateway(Vercel) 채택 여부 | Wave 2에서 미채택 확정 (WSL2+PM2 환경, 자체 `/admin/ai-usage`로 대체) |

---

> 작성: kdywave Wave 3 Meta Agent-2 · 2026-04-18
> 총 DQ: 64건 전수 수록 (폐기 4건 포함) · Wave 3: 20건 / Wave 4: 28건 / Wave 5: 16건
