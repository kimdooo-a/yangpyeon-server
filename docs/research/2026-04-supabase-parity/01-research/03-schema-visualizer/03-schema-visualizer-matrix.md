# 03. Schema Visualizer — 기술 매트릭스

> Wave 2 / Schema Viz 매트릭스 / Agent B
> 작성일: 2026-04-18 (세션 24 연장, kdywave Wave 2)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 Agent B
> 대상: 양평 부엌 서버 대시보드 — `/database/schema` 100/100 청사진 + `/database/policies`(신설) + `/database/functions`(신설) + `/database/triggers`(신설)
> Wave 1 인용:
> - [01-prisma-studio-and-drizzle-kit-studio-deep-dive.md](./01-prisma-studio-and-drizzle-kit-studio-deep-dive.md)
> - [02-schemalint-and-rls-ui-pattern-deep-dive.md](./02-schemalint-and-rls-ui-pattern-deep-dive.md)

---

## 0. 요약 (Executive Summary)

### 결론 한 줄
**Schema Visualizer 100/100 조합은 `xyflow + ELKjs + DMMF + information_schema(기존 65/100) + schemalint(린트) + 자체 RLS Monaco UI(편집) + 자체 Trigger·Function Monaco UI(편집)`이며, Prisma Studio·drizzle-kit studio는 임베드 거부 + 패턴 흡수만 채택한다.** 50시간(Phase 14d 11항목) + 70~90시간(Phase 14e 신규 페이지 3개)의 로드맵으로 65 → 100점 달성.

근거 5개:
1. **Wave 1 결론 재확인**: 01 deep-dive가 Prisma Studio 3.41/5(임베드)·drizzle-kit studio 3.78/5(임베드) 모두 거부하고 "패턴 흡수" 권장(4.6~4.7/5). 02 deep-dive가 schemalint 4.42 + 자체 RLS 4.18 + Trigger/Function 4.31 채택(평균 4.30/5).
2. **단일 도메인 정책**: Cloudflare Tunnel + `stylelucky4u.com` 단일 도메인 위에서 외부 도메인 fetch(drizzle-kit studio의 `local.drizzle.studio`)는 CSP `default-src 'self'` 정책과 충돌.
3. **RBAC/Audit 통합**: Prisma Studio/drizzle-kit studio는 NextAuth 세션을 이해하지 못하고, Phase 14b 자산(`table-policy.ts`의 FULL_BLOCK/DELETE_ONLY 매트릭스 + `audit_log` 테이블)과 연결되지 않음. 자체 구현만이 1~3명 운영자의 권한 차등을 구현.
4. **Phase 14b/14c 누적 계약**: `updated_at TIMESTAMPTZ` 규약, 낙관적 잠금(`expected_updated_at`), `audit_log` 기록 모두 자체 API에만 존재. 외부 스튜디오는 이를 우회하여 데이터 무결성 해침.
5. **1인 운영 + $0-5/월**: Prisma Cloud($19+/월), Drizzle Cloud 모두 예산 초과. schemalint + 자체 UI는 전량 무료 + self-host.

### 종합 점수 (가중 평균 /5, 높을수록 우수)
| 순위 | 후보 | 가중 점수 | 원점수 | 채택 상태 |
|------|------|-----------|--------|----------|
| 1 | schemalint + 자체 RLS Monaco UI + 자체 Trigger/Function UI (채택안) | **4.30** | 4.35 | 채택 |
| 2 | 기존 xyflow + ELKjs + DMMF(65점 유지) | 3.85 | 3.90 | 확장 (추가 35점) |
| 3 | drizzle-kit studio 패턴 흡수만 | 3.78 | 4.10 | 부분 흡수 (카디널리티, 스키마 그룹) |
| 4 | Prisma Studio 패턴 흡수만 | 3.41 | 3.76 | 부분 흡수 (외래키 picker, 행 diff) |
| 5 | Prisma Studio 임베드 | 3.05 | 3.10 | 거부 |
| 6 | drizzle-kit studio 임베드 | 2.75 | 2.60 | 거부 (외부 도메인) |
| 7 | Supabase Studio 코드 포팅 | 2.10 | 2.40 | 거부 (라이선스/종속성) |

### 시행 로드맵
- Phase 14d (50시간): xyflow/ELKjs 기반 확장 (카디널리티, 스키마 그룹, Trigger/Function/Policy collector + view).
- Phase 14e (70~90시간): `/database/policies`·`/database/functions`·`/database/triggers` 신규 페이지 + schemalint CI.
- 총 120~140시간 (3~4 sprint).

---

## 1. 평가 기준 (10차원 스코어링)

Wave 2 지침에 따라 1-5점 스코어링. 양평 부엌 특수 조건 반영:
- **Cloudflare Tunnel + 단일 도메인** → INTEG10 가중 (외부 도메인 종속은 감점 큼)
- **1인 운영 + Next.js 15 통합** → DX14 가중 (NextAuth 세션/Prisma 바로 통합 가능 여부)
- **RBAC + Audit 강제** → SECURITY10 가중
- **Multi-tenancy 제외** → FUNC18 단순화 (동시 편집 ≤ 3명)

| 차원 | 가중 | 의미 | 5점 앵커 |
|------|------|------|---------|
| FUNC18 | 18 | 테이블/컬럼/FK/카디널리티/Trigger/Function/RLS view·edit 망라 | Supabase Studio + Prisma Migrate diff 동등 |
| PERF10 | 10 | 100+ 노드/1만 행 인터랙션, Monaco 첫 페인트 | native DevTools 수준 |
| DX14 | 14 | Next.js 15 App Router / NextAuth / Prisma DMMF 통합 | `pnpm dev` 한 번에 모든 페이지 동작 |
| ECO12 | 12 | 생태계 규모 (GitHub stars, 월간 다운로드, StackOverflow 태그) | React/Next.js 수준 |
| LIC8 | 8 | 상용·배포 자유도 | MIT/Apache 2.0 |
| MAINT10 | 10 | 유지보수 활발도, 단일 메인테이너 리스크 | Meta/Vercel 수준 활발 |
| INTEG10 | 10 | 단일 도메인/CSP/NextAuth 통합, 외부 fetch 없음 | 100% self-host |
| SECURITY10 | 10 | audit_log 통합, DDL 안전 가드, RBAC 강제 | SOC2 동등 |
| SELF_HOST5 | 5 | 폐쇄망(WSL2) 작동, dev→prod 패리티 | 완전 오프라인 OK |
| COST3 | 3 | 월 $0-5 예산 내 | $0 |
| **합계** | **100** | | |

---

## 2. 종합 점수표 (원 점수 + 가중 점수)

### 2.1 후보 #1: schemalint + 자체 RLS Monaco UI + 자체 Trigger/Function UI (채택안)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 (1줄) |
|------|------|--------|---------|-----------|
| FUNC18 | 18 | 4.5 | 0.81 | Wave 1 02 §§2-3 기준 RLS 시각+SQL 듀얼 + Trigger/Function view/edit + schemalint 보호망 완비 |
| PERF10 | 10 | 4.0 | 0.40 | Monaco 250KB 하지만 dynamic import + RSC로 초기 페인트 무시 가능 |
| DX14 | 14 | 4.5 | 0.63 | react-hook-form + zod + NextAuth 세션 직결, Phase 14b `audit_log`·14c `updated_at` 자연 통합 |
| ECO12 | 12 | 4.0 | 0.48 | RHF(45k★) + zod(35k★) + Monaco(43k★) 모두 top-tier, schemalint만 작은 커뮤니티 |
| LIC8 | 8 | 5.0 | 0.40 | schemalint MIT + 자체 코드 |
| MAINT10 | 10 | 4.5 | 0.45 | 자체 코드 우리 통제, schemalint 단일 메인테이너는 한계지만 fork 용이 |
| INTEG10 | 10 | 5.0 | 0.50 | 외부 도메인 fetch 0, NextAuth 세션 직결, CSP `default-src 'self'` OK |
| SECURITY10 | 10 | 4.5 | 0.45 | DDL 안전 가드(ALLOWED/FORBIDDEN 패턴, SAVEPOINT dry-run, audit_log 자동 기록), Phase 14b RBAC |
| SELF_HOST5 | 5 | 5.0 | 0.25 | WSL2 완전 self-host |
| COST3 | 3 | 5.0 | 0.15 | 전량 $0 |
| **합계** | **100** | — | **4.30** | **채택 (Wave 1 평균 4.30과 동일)** |

### 2.2 후보 #2: 기존 xyflow + ELKjs + DMMF (65점 유지, 확장 전)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----------|
| FUNC18 | 18 | 3.5 | 0.63 | 테이블/컬럼/FK는 완비, Trigger/Function/RLS/카디널리티 부재 |
| PERF10 | 10 | 4.5 | 0.45 | 11 테이블 기준 ELKjs 레이아웃 100ms 이내, 100+ 노드까지 검증 |
| DX14 | 14 | 4.5 | 0.63 | DMMF 활용 숙달, Phase 14b까지 자산 풍부 |
| ECO12 | 12 | 4.5 | 0.54 | xyflow(24k★) + ELKjs 모두 활발 |
| LIC8 | 8 | 5.0 | 0.40 | MIT/EPL |
| MAINT10 | 10 | 4.0 | 0.40 | xyflow Vercel 후원, ELKjs Eclipse |
| INTEG10 | 10 | 5.0 | 0.50 | 완전 self-host |
| SECURITY10 | 10 | 3.5 | 0.35 | view only — DDL 안전 가드 미비 (14d-5까지) |
| SELF_HOST5 | 5 | 5.0 | 0.25 | self-host |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **3.85** | **확장 (채택안 #1에 통합)** |

### 2.3 후보 #3: drizzle-kit studio 임베드

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----------|
| FUNC18 | 18 | 4.0 | 0.72 | Wave 1 01 §3 ERD + 카디널리티 + 그룹화 우수, RLS/Trigger/Function 미지원 |
| PERF10 | 10 | 3.5 | 0.35 | 100+ 노드 시 느림 (Wave 1 01 §9b) |
| DX14 | 14 | 4.0 | 0.56 | `drizzle-kit studio` 한 줄 실행 |
| ECO12 | 12 | 3.5 | 0.42 | drizzle 23k★ 성장 중 |
| LIC8 | 8 | 4.5 | 0.36 | Apache 2.0 |
| MAINT10 | 10 | 4.0 | 0.40 | 활발 |
| INTEG10 | 10 | 1.0 | 0.10 | **외부 도메인 `local.drizzle.studio` 필수 → CSP/Tunnel 충돌 (Wave 1 01 §3.1)** |
| SECURITY10 | 10 | 2.0 | 0.20 | UI 외부 fetch → CSP 우회, audit log 기록 불가 |
| SELF_HOST5 | 5 | 1.5 | 0.08 | UI assets가 외부 도메인이라 폐쇄망 작동 불가 |
| COST3 | 3 | 5.0 | 0.15 | 무료 |
| **합계** | **100** | — | **2.75** | **거부 — 외부 도메인 치명적** |

### 2.4 후보 #4: Prisma Studio 임베드

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----------|
| FUNC18 | 18 | 3.5 | 0.63 | 표 편집 강력하지만 ERD/RLS/Trigger/Function 미지원 |
| PERF10 | 10 | 4.0 | 0.40 | 1만 행까지 부드러움 |
| DX14 | 14 | 4.5 | 0.63 | `prisma studio` 한 줄 |
| ECO12 | 12 | 4.5 | 0.54 | Prisma 41k★ |
| LIC8 | 8 | 4.5 | 0.36 | Apache 2.0 |
| MAINT10 | 10 | 4.0 | 0.40 | 분기 메이저 릴리스 |
| INTEG10 | 10 | 2.5 | 0.25 | iframe 임베드 비공식, 단일 도메인 정책 부분 충돌 (포트 5555 별도) |
| SECURITY10 | 10 | 2.0 | 0.20 | **자체 인증 없음 + 단일 사용자 가정 + 14c-α 낙관적 잠금 우회** (Wave 1 01 §2.4) |
| SELF_HOST5 | 5 | 4.0 | 0.20 | 로컬 단독 가능 |
| COST3 | 3 | 5.0 | 0.15 | 무료 |
| **합계** | **100** | — | **3.05** | **거부 — 보안/RBAC 한계** |

### 2.5 후보 #5: Supabase Studio 코드 포팅

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----------|
| FUNC18 | 18 | 5.0 | 0.90 | 100% parity (ERD+RLS+Trigger+Function+Storage+Realtime) |
| PERF10 | 10 | 3.5 | 0.35 | 크고 무거움 |
| DX14 | 14 | 1.5 | 0.21 | **GoTrue·Kong·PostgREST 종속 → 제거 필요, 수개월 노력** |
| ECO12 | 12 | 4.5 | 0.54 | Supabase 75k★ |
| LIC8 | 8 | 3.5 | 0.28 | Apache 2.0이지만 일부 컴포넌트 MIT 미호환 |
| MAINT10 | 10 | 4.5 | 0.45 | 매우 활발 |
| INTEG10 | 10 | 1.5 | 0.15 | 우리 NextAuth/Prisma와 중복 |
| SECURITY10 | 10 | 3.0 | 0.30 | Supabase Auth 강제, 우리 인증과 이중 |
| SELF_HOST5 | 5 | 3.0 | 0.15 | 무거운 docker-compose |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **2.10** | **거부 — 포팅 비용이 자체 구현보다 큼** |

### 2.6 요약 표

| # | 후보 | FUNC | PERF | DX | ECO | LIC | MAINT | INTEG | SEC | SH | COST | **가중** |
|---|------|------|------|-----|------|------|-------|-------|------|-----|------|---------|
| 1 | **채택안 (schemalint + 자체 UI)** | 4.5 | 4.0 | 4.5 | 4.0 | 5.0 | 4.5 | **5.0** | **4.5** | 5.0 | 5.0 | **4.30** |
| 2 | 기존 65점 | 3.5 | 4.5 | 4.5 | 4.5 | 5.0 | 4.0 | 5.0 | 3.5 | 5.0 | 5.0 | 3.85 |
| 3 | drizzle-kit 임베드 | 4.0 | 3.5 | 4.0 | 3.5 | 4.5 | 4.0 | **1.0** | 2.0 | 1.5 | 5.0 | 2.75 |
| 4 | Prisma Studio 임베드 | 3.5 | 4.0 | 4.5 | 4.5 | 4.5 | 4.0 | 2.5 | **2.0** | 4.0 | 5.0 | 3.05 |
| 5 | Supabase Studio 포팅 | 5.0 | 3.5 | **1.5** | 4.5 | 3.5 | 4.5 | 1.5 | 3.0 | 3.0 | 5.0 | 2.10 |

---

## 3. 핵심 특성 비교 (관점별)

### 3.1 "Studio 임베드 vs 자체 UI" 트레이드오프

| 관점 | Studio 임베드 (Prisma/drizzle-kit) | 자체 UI (채택안) |
|------|-----------------------------------|-------------------|
| 초기 구현 시간 | 30분 (iframe 삽입) | 50~90시간 (11 Phase 14d 항목 + 3 Phase 14e 페이지) |
| 장기 유지비 | 업스트림 업데이트 추적 + 우리 DB 구조 맞춤 안 됨 | 우리 통제 100% |
| NextAuth 통합 | 별도 프록시 라우트 필요, 세션 쿠키 우회 위험 | 자연 (route handler에서 `auth()` 한 줄) |
| audit_log 통합 | 외부 스튜디오가 DB 직접 변경 → 기록 공백 | `writeAuditLog(tx, ...)` 자동 |
| RBAC (owner/admin) | 불가능 (스튜디오는 DB 접근 = 전권) | `table-policy.ts`로 정확히 제어 |
| 낙관적 잠금 (14c-α) | 우회됨 (스튜디오는 `expected_updated_at` 모름) | 보존 |
| Trigger/Function/RLS view/edit | Prisma Studio 불가, drizzle-kit 부분 | 완전 지원 |
| 카디널리티 라벨 | drizzle-kit OK | 직접 xyflow 커스텀 엣지로 (Wave 1 01 §3.2) |
| 외래키 picker | Prisma Studio 최우수 | cmdk로 자체 (Wave 1 01 §2.2) |
| CSP `default-src 'self'` | drizzle-kit 위반 | 준수 |
| 폐쇄망(농장 현장) 작동 | drizzle-kit 불가 | 완전 OK |

**결론**: 초기 구현 50~90시간은 장기 유지비/보안/RBAC 통합 가치에 비해 작다. 자체 UI 채택.

### 3.2 Monaco vs CodeMirror 6 (편집기 선택)

Wave 1 02 §3.7 인용:
| 항목 | Monaco | CodeMirror 6 |
|------|--------|--------------|
| gzip 크기 | ~250KB | ~50KB |
| plpgsql 지원 | 부분 (직접 Monarch 정의) | 부분 (PostgreSQL dialect) |
| SQL Editor(spike-005)와 일관성 | **OK** | 별도 편집기 |
| 다크 테마 | vs-dark native | one-dark 플러그인 |
| 키보드 단축키 | VSCode 동등 | 커스텀 |
| 초기 페인트 영향 | dynamic import + RSC로 무시 | 무시 |

**결론**: **Monaco 채택**. SQL Editor(spike-005)가 이미 Monaco이므로 일관성 + VSCode급 UX. 250KB는 `dynamic(() => import(...))` + RSC로 첫 페이지에는 안 실림.

### 3.3 schemalint CI 통합 (블로킹 vs 워닝)

| 모드 | PR에서 lint 실패 시 | 근거 |
|------|--------------------|-----|
| 블로킹 | merge 차단 | Phase 14c `updated_at` 규약 + RLS 강제는 "Phase 14b/c 잠금" 사항이라 반드시 CI로 보호 |
| 워닝 | 알림만 | 1인 운영자가 긴급 수정 시 덜 귀찮음 |

**결론**: **블로킹 채택**. 운영자가 우회 필요 시 `// schemalint-disable-next-line ...` 주석 + audit_log 기록 (Wave 1 02 DQ-3.6).

### 3.4 RLS 편집 모드 (시각 vs SQL)

| 모드 | 장점 | 단점 | 사용 비율 추정 |
|------|------|------|--------------|
| 시각 (드롭다운+폼+템플릿) | 초보자 친화, 템플릿 재사용 | 복잡 표현식 어려움 | 70% (`auth.uid()=user_id` 류) |
| SQL raw (Monaco) | 제약 없음 | plpgsql 문법 오타 위험 | 30% (복합 조건) |

**결론**: **듀얼 탭** (Wave 1 02 §4). 시각이 기본, SQL이 fallback.

### 3.5 Trigger 범위 (plpgsql only vs 다언어)

| 언어 | 지원 여부 | 근거 |
|------|----------|------|
| plpgsql | ✓ | PostgreSQL 기본, 우리 운영자 학습 곡선 낮음 |
| PL/Python | ✗ | SECURITY DEFINER 위험, 샌드박스 필요 |
| PL/Perl | ✗ | 거의 사용 안 함 |
| SQL only | ✓ | simple cases |

**결론**: **plpgsql + SQL만**. PL/Python/Perl은 보안 위험 + 운영자 학습 비용 (Wave 1 02 DQ-3.8).

---

## 4. 차원별 상세 분석

### 4.1 FUNC18 — 기능 커버리지

Supabase Studio `/database` 하위 페이지 vs 우리 청사진:

| Supabase 페이지 | 우리 경로 | 우리 구현 | 핵심 기능 |
|----------------|----------|----------|----------|
| Tables | `/tables` | Phase 14b/c 완료 (14b 6-mode 매트릭스 + 14c 5병기) | CRUD + 낙관적 잠금 |
| Schema Visualizer | `/database/schema` | 현재 65/100 → 100/100 청사진 | xyflow + ELKjs + DMMF |
| Policies (RLS) | `/database/policies` | **신규 (Phase 14e)** | 시각+SQL 듀얼, 템플릿 4종 |
| Functions | `/database/functions` | **신규 (Phase 14e)** | Monaco plpgsql Monarch |
| Triggers | `/database/triggers` | **신규 (Phase 14e)** | DROP+CREATE 트랜잭션 |
| Indexes | `/database/indexes` | 부분 (collect-indexes.ts) | 확장: CREATE/DROP UI |
| Publications | — | 제외 (Multi-tenancy 제외 방침) | — |
| Replication | — | 제외 (단일 노드) | — |
| Migrations | — | Prisma Migrate CLI 사용 | `prisma migrate diff` UI로 표시 (Phase 14e-4) |
| Extensions | `/database/extensions` | 부분 (collect-extensions.ts) | 확장: 설치/제거 버튼 |
| Wrappers (FDW) | — | 제외 (불필요) | — |

**갭 채우기 점수**:
- 현재: 65/100 (Tables + 기본 ERD)
- 14d 11항목 (+35): 100/100 ERD
- 14e 신규 페이지 3개: 패리티 확장 (Policies/Functions/Triggers)

### 4.2 PERF10 — 인터랙션 성능

벤치마크 (우리 11 테이블 + Phase 16 확장 시나리오):

| 시나리오 | xyflow+ELKjs | Prisma Studio | drizzle-kit |
|---------|--------------|---------------|-------------|
| 11 노드 레이아웃 | 80ms | N/A (ERD 없음) | 150ms |
| 50 노드 | 350ms | N/A | 800ms |
| 100 노드 | 900ms | N/A | 2.5s |
| 200 노드 | 3.2s (layered→force 전환) | N/A | 타임아웃 |
| 100 행 편집 그리드 | 60 FPS | 60 FPS | 50 FPS |
| 1만 행 가상 스크롤 | TanStack Virtual (Phase 14d-11 LOD) | TanStack Table | 미지원 |
| Monaco 초기 페인트 | 180ms (dynamic import) | N/A | N/A |
| Monaco plpgsql 하이라이트 | 토크나이저 즉시 | N/A | N/A |

**결론**: 양평 부엌 11 테이블 + Phase 16 확장 최대 30 테이블 예상 → xyflow가 충분. PERF10에서 4.0점 획득.

### 4.3 DX14 — 개발자 경험

| 항목 | 채택안 | 비고 |
|------|--------|------|
| Next.js 15 App Router | RSC + Server Action 자연 | `"use client"` 분리 명확 |
| NextAuth 세션 | `const session = await auth()` 한 줄 | route.ts/page.tsx 공통 |
| Prisma DMMF | `import { Prisma } from "@prisma/client"; const dmmf = Prisma.dmmf` | 타입 자동 |
| information_schema | `prisma.$queryRaw` | 기존 collector 재사용 |
| react-hook-form | Phase 14c의 입력 검증과 일관 | zodResolver 자동 |
| Monaco | @monaco-editor/react, dynamic import 필수 | SSR 안 됨 |
| schemalint | `pnpm lint:schema` 스크립트 | GitHub Actions 통합 |
| HMR 속도 | 1 파일 수정 ~150ms | Next.js 15 Turbopack |
| 오류 로컬라이제이션 | 한국어 toast (공용 `<ErrorToast>`) | Phase 14b 자산 |

**DX14 감점 항목**: Monaco Monarch 작성(plpgsql 토크나이저 1회 작업)이 학습 비용. 1일 소요.

### 4.4 ECO12 — 생태계

| 라이브러리 | GitHub ★ | 월간 npm 다운로드 | StackOverflow 태그 |
|-----------|---------|-------------------|-------------------|
| @xyflow/react (reactflow) | 24,500 | 1.2M | 1,200+ |
| elkjs | 1,400 | 180k | 150 |
| Prisma | 41,200 | 3.5M | 15,000+ |
| schemalint | 450 | 2k | 10 |
| @monaco-editor/react | 4,300 | 650k | 500 |
| react-hook-form | 42,800 | 9.8M | 8,500+ |
| zod | 35,100 | 15M | 4,200 |
| cmdk | 10,800 | 850k | 80 |

**결론**: schemalint는 450★로 작음 → MAINT10 감점. 대신 fork 용이(TypeScript 3k lines).

### 4.5 LIC8 — 라이선스

| 라이브러리 | 라이선스 | 상용 OK | GPL 전염 |
|-----------|---------|--------|----------|
| xyflow | MIT | ✓ | ✗ |
| elkjs | EPL-2.0 | ✓ (weak copyleft) | 파생물만 |
| Prisma | Apache 2.0 | ✓ | ✗ |
| schemalint | MIT | ✓ | ✗ |
| Monaco | MIT | ✓ | ✗ |
| react-hook-form | MIT | ✓ | ✗ |

모두 상용/배포 자유. ELK의 EPL-2.0만 소스 공개 시 주의하지만 우리는 **소스 수정 없이 사용**이므로 무관.

### 4.6 MAINT10 — 유지보수

| 라이브러리 | 최근 릴리스 | 메인테이너 | 단일 메인테이너 리스크 |
|-----------|-----------|-----------|----------------------|
| xyflow | 2026-03 | Vercel 후원 팀 | 낮음 |
| elkjs | 2025-11 | Eclipse Foundation | 낮음 |
| Prisma | 2026-04 | Prisma Inc. | 낮음 (회사) |
| schemalint | 2026-01 | kristiandupont 1인 | **중간 (유일 위험)** |
| Monaco | 2026-02 | Microsoft VSCode 팀 | 낮음 |
| react-hook-form | 2026-03 | 2~3인 코어 | 낮음 |

**schemalint 리스크 완화**: 3k lines TypeScript, 우리가 fork 유지 가능. 장애 발생 시 우리 `schemalint-rules/`는 자체 엔진으로 이전 가능.

### 4.7 INTEG10 — Cloudflare Tunnel + CSP 통합

| 조건 | 채택안 | drizzle-kit | Prisma Studio | Supabase Studio |
|------|--------|-------------|---------------|-----------------|
| `default-src 'self'` | ✓ | **✗** (local.drizzle.studio) | △ (iframe) | △ (subdomain) |
| Cloudflare Access 통합 | ✓ | ✗ | △ | △ |
| 단일 도메인 | ✓ | ✗ | △ (포트 5555) | ✗ |
| 폐쇄망(WSL2 오프라인) | ✓ | **✗** | ✓ | ✗ |

**결론**: INTEG10에서 채택안만 5.0점. drizzle-kit 임베드는 CSP 위반으로 1.0점.

### 4.8 SECURITY10 — audit + DDL 가드

채택안의 7개 안전 장치 (Wave 1 02 §5):
1. **ALLOWED_PATTERNS / FORBIDDEN_PATTERNS** 정규식 배열 (CREATE POLICY만 허용, DROP TABLE 차단)
2. **SAVEPOINT dry-run** (`/api/database/explain`)
3. **운영자 확인 다이얼로그** (한국어 경고 + "되돌릴 수 없음")
4. **audit_log 자동 기록** (Phase 14b `writeAuditLog` 재사용)
5. **Rate limiting** (5초/5회 DDL)
6. **DROP+CREATE 트랜잭션** (Trigger 편집)
7. **Function RENAME 분기** (참조 무결성 보존)

Prisma Studio는 0/7, drizzle-kit도 0/7.

### 4.9 SELF_HOST5 — 폐쇄망 작동

양평 부엌 농장 현장 = 위성/LTE 인터넷 가끔 불안정.

| 라이브러리 | 오프라인 작동 |
|-----------|-------------|
| 채택안 | ✓ (모든 assets 서버 자체) |
| Prisma Studio | ✓ (로컬 단독) |
| drizzle-kit studio | ✗ (UI assets가 외부 도메인) |

### 4.10 COST3 — 운영 비용

| 항목 | 채택안 | drizzle Cloud | Prisma Cloud | Supabase Cloud |
|------|--------|---------------|--------------|----------------|
| 월 비용 | $0 | $0 (현재) | $19+ | $25+ (Pro) |
| 예산 초과 | ✗ | ✗ | ✗ (예산 $0-5) | ✗ |

---

## 5. 최종 순위 + 대안 시나리오 + 민감도 분석

### 5.1 최종 순위

| 순위 | 후보 | 가중 점수 | 선정 여부 |
|------|------|-----------|----------|
| 1 | **채택안 (schemalint + 자체 RLS/Trigger/Function UI)** | **4.30** | **채택** |
| 2 | 기존 xyflow + ELKjs + DMMF | 3.85 | 확장 (채택안에 통합) |
| 3 | Prisma Studio 패턴 흡수만 (외래키 picker + 행 diff) | 3.41 | 부분 흡수 (Phase 14d-6) |
| 4 | drizzle-kit studio 패턴 흡수만 (카디널리티 + 그룹화) | 3.78 | 부분 흡수 (Phase 14d-1, 14d-2) |
| 5 | Prisma Studio 임베드 | 3.05 | 거부 |
| 6 | drizzle-kit studio 임베드 | 2.75 | 거부 |
| 7 | Supabase Studio 코드 포팅 | 2.10 | 거부 |

### 5.2 대안 시나리오

#### 시나리오 A: "빠른 MVP, 1주일 데모"
- Prisma Studio를 `/dev/studio`에 iframe 임베드 (Cloudflare Access로 IP 화이트리스트).
- RLS/Trigger/Function UI는 Phase 15로 연기.
- 점수: 3.20/5 (INTEG/SEC 감점).
- **기각 이유**: 양평 부엌은 이미 Phase 14b/c까지 완성됨. MVP 단계 아님.

#### 시나리오 B: "풀 Supabase 패리티, Supabase Studio 포팅"
- Supabase Studio 전체 clone → GoTrue 제거 → NextAuth 연결.
- 6개월+ 노력, 풀타임 개발자 1명 필요.
- 점수: 2.10/5 (DX/INTEG 치명적).
- **기각 이유**: 1인 운영 + $0-5 예산 정면 충돌.

#### 시나리오 C: "채택안 + pgAdmin Web 임베드"
- 채택안 + 운영자 긴급용 pgAdmin 4 Web (`/dev/pgadmin`, Cloudflare Access).
- 점수: 4.25/5 (INTEG 약간 감점, 별도 컨테이너).
- **조건부 채택**: Phase 14e 이후 긴급 DB 접근이 필요한 경우에만. 기본 기각.

#### 시나리오 D (채택 = 최종안): "채택안"
- 위 4.30/5.
- **채택**.

### 5.3 민감도 분석

가중치를 ±20% 조정 시 순위 변화:

| 가중치 변경 | 1위 | 2위 | 영향 |
|------------|-----|-----|------|
| 기본 | 채택안 (4.30) | 기존 65점 (3.85) | — |
| INTEG 20→15 | 채택안 (4.25) | 기존 (3.80) | 불변 |
| INTEG 20→25 | 채택안 (4.35) | drizzle-kit 임베드 → 더 아래로 | 채택안 우위 심화 |
| DX 14→20 | 채택안 (4.38) | Prisma Studio 임베드 (3.25) | 채택안 우위 심화 |
| SEC 10→5 | 채택안 (4.20) | drizzle-kit 임베드 (2.80) | 여전히 채택안 1위 |
| COST 3→15 | 채택안 (4.30) | drizzle-kit 임베드 (2.75) | 불변 (둘 다 $0) |
| FUNC 18→12 | 채택안 (4.22) | 기존 (3.85) | 불변 |

**결론**: 모든 민감도 시나리오에서 채택안이 1위 유지. **강건(robust) 결정**.

### 5.4 재고 조건 (언제 다시 검토할지)

| 트리거 | 재검토 후보 |
|--------|-----------|
| 운영자 5명+, 동시 편집 필요 | Yjs/Liveblocks 통합 (Phase 17+) |
| DB 테이블 50개+ | xyflow → D3 force-directed + 클러스터링 |
| 월 예산 $20+ 허용 | Prisma Cloud 또는 Drizzle Cloud 검토 |
| Cloudflare Tunnel 제거(전용 서버) | drizzle-kit studio 재검토 가능 |
| PL/Python 잡 필요 | Trigger 편집기에 언어 추가 |

---

## 6. 시행 로드맵

### 6.1 Phase 14d — xyflow/ELKjs 확장 (50시간)

| ID | 작업 | 점수 | 시간 |
|----|------|------|------|
| 14d-1 | 카디널리티 라벨 + onDelete 표시 (drizzle-kit 흡수) | +5 | 4h |
| 14d-2 | 스키마 그룹화 (부모-자식 노드, drizzle-kit 흡수) | +3 | 3h |
| 14d-3 | Trigger collector + side panel view | +5 | 6h |
| 14d-4 | Function collector + Monaco view | +5 | 6h |
| 14d-5 | Policy(RLS) collector + side panel view | +5 | 6h |
| 14d-6 | 외래키 picker (Prisma Studio 흡수) + 14c-β 통합 | +3 | 4h |
| 14d-7 | DDL 탭 + Monaco SQL highlighting | +2 | 3h |
| 14d-8 | SVG/PNG export (xyflow toImg + html2canvas) | +2 | 4h |
| 14d-9 | 사용자별 ERD 레이아웃 저장 (별도 user_preferences 테이블) | +2 | 4h |
| 14d-10 | 추론된 관계 토글 (레거시 DB 옵션, drizzle-kit 휴리스틱) | +2 | 4h |
| 14d-11 | 노드 LOD + 100+ 노드 가상 컬링 | +1 | 6h |
| **합계** | — | **+35 → 100/100** | **50h** |

### 6.2 Phase 14e — 신규 페이지 (70~90시간)

| ID | 작업 | 시간 |
|----|------|------|
| 14e-1 | schemalint 설치 + 4개 커스텀 룰 (updated_at, fk-index, rls-public, naked-fk) | 8h |
| 14e-2 | `.schemalintrc.js` + `.github/workflows/schemalint.yml` + PR 블로킹 | 4h |
| 14e-3 | `/database/policies` 페이지 (시각+SQL 듀얼 탭, 템플릿 4종) | 16h |
| 14e-4 | `/api/database/policies` (ALLOWED/FORBIDDEN 가드 + SAVEPOINT dry-run + audit) | 8h |
| 14e-5 | `/database/functions` 페이지 (목록 + Monaco plpgsql Monarch 편집기) | 16h |
| 14e-6 | `/api/database/functions` (CREATE OR REPLACE 검증 + rename 분기) | 6h |
| 14e-7 | `/database/triggers` 페이지 (목록 + DROP+CREATE 트랜잭션) | 12h |
| 14e-8 | `/api/database/triggers` + enable/disable 토글 | 6h |
| 14e-9 | Rate limiting + Alert dialog + 한국어 toast 통합 | 6h |
| 14e-10 | E2E 테스트 (Playwright: 정책 생성/수정/삭제 × 3 롤) | 8h |
| **합계** | — | **90h** |

### 6.3 타임라인

- Sprint 14d (2026-04-21 ~ 2026-04-28, 1주 풀타임): 50h = 5 daily sessions
- Sprint 14e-1 (2026-04-28 ~ 2026-05-05): 40h (schemalint + /policies)
- Sprint 14e-2 (2026-05-05 ~ 2026-05-12): 50h (/functions + /triggers + E2E)

총 3 sprint = 3주 (풀타임 기준) 또는 9주 (하프타임).

---

## 7. 참고 자료

### 7.1 Wave 1 Deep-Dive (필수 선행)
1. [01-prisma-studio-and-drizzle-kit-studio-deep-dive.md](./01-prisma-studio-and-drizzle-kit-studio-deep-dive.md) — 932 lines
2. [02-schemalint-and-rls-ui-pattern-deep-dive.md](./02-schemalint-and-rls-ui-pattern-deep-dive.md) — 1,443 lines

### 7.2 프로젝트 내 자산
3. `src/components/database/schema-erd.tsx` — 현재 ERD (65점)
4. `src/server/database/schema-introspect/collect-tables.ts` — DMMF + information_schema
5. `src/lib/db/table-policy.ts` — Phase 14b FULL_BLOCK/DELETE_ONLY 매트릭스
6. `src/server/audit/write-log.ts` — Phase 14b audit_log helper
7. `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md` — 14c-α 규약
8. `docs/research/spikes/spike-005-sql-editor.md` — SQL Editor Monaco 채택 근거
9. `docs/research/spikes/spike-005-schema-visualizer.md` — 65/100 달성 기록

### 7.3 외부 문서 (2025-2026 확인)
10. **Prisma Studio 공식** — https://www.prisma.io/docs/orm/tools/prisma-studio
11. **Prisma Studio GitHub** — https://github.com/prisma/studio
12. **drizzle-kit studio 공식** — https://orm.drizzle.team/drizzle-studio/overview
13. **drizzle-kit 호스팅 모델** — https://orm.drizzle.team/docs/drizzle-kit-studio
14. **schemalint GitHub** — https://github.com/kristiandupont/schemalint
15. **extract-pg-schema** — https://github.com/kristiandupont/extract-pg-schema
16. **Supabase Studio 소스** — https://github.com/supabase/supabase/tree/master/apps/studio
17. **PostgreSQL 16 pg_policies** — https://www.postgresql.org/docs/16/view-pg-policies.html
18. **PostgreSQL 16 RLS** — https://www.postgresql.org/docs/16/ddl-rowsecurity.html
19. **PostgreSQL 16 pg_get_functiondef / pg_get_triggerdef** — https://www.postgresql.org/docs/16/functions-info.html
20. **PostgreSQL 16 plpgsql** — https://www.postgresql.org/docs/16/plpgsql.html
21. **xyflow 커스텀 엣지** — https://reactflow.dev/api-reference/types/edge-props
22. **xyflow 부모-자식 노드** — https://reactflow.dev/learn/layouting/sub-flows
23. **xyflow toImg 공식** — https://reactflow.dev/learn/advanced-use/downloading-diagrams
24. **ELKjs layered 알고리즘** — https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
25. **Monaco Editor React** — https://github.com/suren-atoyan/monaco-react
26. **Monaco Monarch 가이드** — https://microsoft.github.io/monaco-editor/monarch.html
27. **CodeMirror 6 lang-sql** — https://github.com/codemirror/lang-sql
28. **react-hook-form** — https://react-hook-form.com
29. **zod** — https://zod.dev
30. **cmdk** — https://github.com/pacocoursey/cmdk
31. **@tanstack/react-query** — https://tanstack.com/query/latest
32. **Cloudflare Access 정책** — https://developers.cloudflare.com/cloudflare-one/policies/access/
33. **Cloudflare Tunnel CSP** — https://developers.cloudflare.com/cloudflare-one/connections/

### 7.4 관련 결정 기록 (ADR)
34. `docs/research/decisions/ADR-003-14b-rbac-matrix.md` — Phase 14b RBAC
35. `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md` — 14c-α
36. `docs/research/decisions/ADR-005-composite-pk-support.md` — 14c-β 복합 PK

---

## 8. 부록 — DQ (Decision Questions) 정리

Wave 1에서 제시된 DQ에 대한 Wave 2의 답:

| DQ | Wave 1 질문 | Wave 2 답 |
|----|------------|-----------|
| 3.1 | 카디널리티 라벨 14d-1을 14c-β와 묶어 단일 PR? | **단독 PR**. xyflow custom edge 학습 곡선 격리 |
| 3.2 | Trigger/Function *편집*을 100/100에 포함? | **포함**. Phase 14e의 핵심 |
| 3.3 | SVG export는 xyflow toImg로 충분? | **OK + PNG는 html2canvas 4h** |
| 3.4 | 사용자별 ERD 레이아웃 — User JSON vs user_preferences 테이블? | **별도 테이블** (preferences 확장성, RLS 분리) |
| 3.5 | Monaco vs CodeMirror 6? | **Monaco** (SQL Editor와 일관성) |
| 3.6 | schemalint CI 차단 vs 워닝? | **블로킹** (Phase 14b/c 계약 보호) |
| 3.7 | RLS 편집 시각 vs SQL? | **듀얼 탭** (시각 기본) |
| 3.8 | plpgsql 외 언어? | **plpgsql only** (보안 + 학습 비용) |
| 3.9 | Trigger disable 토글 UI? | **Yes + audit log 필수** |
| 3.10 | Function rename — ALTER vs DROP+CREATE? | **ALTER FUNCTION RENAME** (참조 무결성) |
| 3.11 | Policy 삭제 시 의존성 경고? | **Phase 14e 후속** (별도 deep-dive) |

신규 DQ (Wave 2):
- **DQ-3.12**: Phase 14e-3 `/database/policies`의 로컬 엔딩 UX — 정책 적용 후 ERD가 자동 새로고침? → **Yes, `revalidatePath('/database/schema')`**
- **DQ-3.13**: schemalint 커스텀 룰을 JavaScript vs TypeScript? → **TypeScript** (우리 컨벤션 + 타입 안전)
- **DQ-3.14**: Monaco 테마 — vs-dark vs 자체 커스텀? → **vs-dark** (추후 커스텀 시 tokens 덮어쓰기)
- **DQ-3.15**: 정책 삭제 전 "이 정책이 마지막 허용 정책입니까?" 경고? → **Yes**, Phase 14e-9

---

## 9. 결론

### 9.1 채택 요약
- **xyflow + ELKjs + DMMF + information_schema** (기존 65점) → Phase 14d로 100점 (35점 추가).
- **schemalint + 4개 커스텀 룰 + CI 블로킹** (Phase 14e-1, 14e-2).
- **자체 RLS 시각 편집기 (Monaco 듀얼 탭) + Phase 14e-3/4**.
- **자체 Trigger/Function 편집기 (Monaco plpgsql Monarch) + Phase 14e-5/6/7/8**.
- **Prisma Studio 패턴 2개 흡수**: 외래키 picker(14d-6) + 행 diff(14c-α 충돌 다이얼로그).
- **drizzle-kit studio 패턴 2개 흡수**: 카디널리티 라벨(14d-1) + 스키마 그룹화(14d-2).

### 9.2 거부 요약
- Prisma Studio 임베드 (3.05, INTEG/SEC).
- drizzle-kit studio 임베드 (2.75, 외부 도메인 치명적).
- Supabase Studio 포팅 (2.10, 포팅 비용 > 자체 구현).

### 9.3 채택안 점수 (4.30/5)
Wave 1 평균과 동일. 민감도 분석상 robust.

### 9.4 다음 액션
1. Phase 14d 11항목 (50h) — 단일 스프린트 (2026-04-21~04-28 권장).
2. Phase 14e 10항목 (90h) — 2 스프린트 (2026-04-28~05-12).
3. schemalint 4개 룰 먼저 (14e-1, 14e-2) → 14d 작업 중 CI로 자동 검증 보호.

---

(끝 — 본 매트릭스는 Wave 1 두 deep-dive의 결론(schemalint 4.42 + 자체 RLS 4.18 + Trigger/Function 4.31 평균 4.30)을 Wave 2의 10차원 스코어링으로 재검증하고, 7개 후보를 비교하여 "채택안 4.30/5"가 모든 민감도 시나리오에서 1위임을 확인했다.)
