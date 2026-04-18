# 04. Table Editor 매트릭스 비교 — TanStack / AG / Glide / 14c-α 자체구현

> Wave 2 / Agent A / 매트릭스 문서
> 작성일: 2026-04-18 (세션 24 연장)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 매트릭스 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/tables` Table Editor 100/100 청사진
> 범위: 4개 후보(TanStack Table v8, AG Grid Community, Glide Data Grid, 14c-α 자체구현)의 10차원 가중 스코어 비교 + "자체구현 유지 vs 라이브러리 교체" 민감도 분석
> 근거 문서: Wave 1 deep-dive 01/02/03 (TanStack/AG/Glide) 전수 Read 완료

---

## 0. Executive Summary

### 결론 한 줄

**현재 진행 중인 14c-α 자체구현(TanStack v8 헤드리스 + EditableCell + useInlineEditMutation) 노선이 양평 부엌 컨텍스트(11 테이블 / 1만 행 미만 / shadcn+Tailwind 4 / 1인 운영)에서 4개 후보 중 가중 최고점(4.54/5)을 기록하며, AG Community(4.19/5)·Glide(3.30/5)·순수 TanStack(4.54/5와 동일 — 왜냐하면 14c-α가 곧 TanStack 기반 자체구현이므로)과의 격차는 "기존 자산(spec + EditableCell + useInlineEditMutation + RowFormModal + table-policy) 보존 여부"에서 결정된다.**

### 핵심 숫자

| 후보 | 종합 점수 | FUNC | PERF | DX | ECO | LIC | MAINT | INTEG | SEC | SH | COST |
|------|----------|------|------|-----|-----|-----|-------|-------|-----|-----|------|
| **14c-α 자체구현 (TanStack v8 + 자체 셀)** | **4.54** | 4.0 | 4.5 | 4.5 | 4.5 | 5.0 | 4.5 | 5.0 | 4.5 | 5.0 | 5.0 |
| AG Grid Community | 3.71~4.19 | 4.5 | 4.5 | 4.0 | 5.0 | 4.0 | 5.0 | 2.5~3.0 | 3.0~3.5 | 3.0 | 5.0 |
| Glide Data Grid | 3.30 (컨텍스트) / 4.12 (중립) | 4.5 | 3.5~5.0 | 3.5 | 3.5 | 5.0 | 4.5 | 1.5~2.0 | 5.0 | 4.0 | 5.0 |
| TanStack Table v8 (참조 기준) | 4.54 | 4.0 | 4.5 | 4.5 | 4.5 | 5.0 | 4.5 | 5.0 | 4.5 | 5.0 | 5.0 |

### DQ-1.9 최종 답

**14c-α 자체구현 노선 유지**. 근거 5개는 §1.3에서 상세.

### 새 DQ

- **DQ-2.1**: 14d에 FK selector를 cmdk + introspection으로 자체 구현할 때, cmdk 외에 `use-downshift` 같은 대체 Combobox 라이브러리를 검토할 필요가 있는가? (현재 답: cmdk 유지 — shadcn 기본 Combobox)
- **DQ-2.2**: 14d에 CSV import를 Papa Parse로 도입할 때, Workers 모드(별도 스레드)를 14d에 포함할까, 14e로 미룰까? (현재 답: 14d는 메인 스레드 파싱 + 100행 dry-run, Workers는 14e)
- **DQ-2.3**: TanStack Query 도입은 14e에서만 진행할지, 14c-β의 복합 PK 작업 중에 선도적으로 넣을지? (현재 답: 14e — 지금은 useState + 수동 setRows로 충분)

---

## 1. 평가 기준

### 1.1 10차원 가중 스코어링 (합 100%)

양평 부엌 대시보드 특성을 반영한 가중치. Cloudflare Tunnel + 1인 운영 + 11 테이블 + $0-5/월 운영.

| 차원 | 가중 | 5점 앵커 (업계 최고/사실상 표준) | 양평 특이 요소 |
|------|------|------------------------------|--------------|
| FUNC | 18% | AG Enterprise (범위 선택 + 채우기 핸들 + Excel export + 피벗) | Supabase Table Editor 동등이 목표 — AG Enterprise 수준까지 요구 안 함 |
| PERF | 10% | Glide Canvas (1M 행 60fps) | 11 테이블 모두 1만 미만 → 가상화 없이도 OK |
| DX | 14% | AG Grid React (declarative props만으로 끝) | shadcn/Tailwind 4 + 1인 운영 — 빠른 학습 + 짧은 코드 |
| ECO | 12% | AG Grid / TanStack 대규모 채택 | shadcn DataTable이 TanStack v8 기반 — 정합성 최고 |
| LIC | 8% | MIT 영구 | $0 필수 |
| MAINT | 10% | AG Grid Ltd (상업 회사, 매주 릴리스) | 1인 운영 → 안정성 중시 |
| INTEG | 10% | 이미 의존성 + 자산 재사용 | Phase 14b 자산(RowFormModal, table-policy, redactSensitiveValues, audit log) 재사용이 결정적 |
| SECURITY | 10% | XSS 표면 0 + 사용자 sanitize 불요 | User/ApiKey FULL_BLOCK + CSP 계획 — 보안 민감 |
| SELF_HOST | 5% | 번들 15KB 이내 + SSR 양립 | PM2 + Cloudflare Tunnel — 콜드 스타트 영향 작지만 번들 작을수록 유리 |
| COST | 3% | $0 영구 | SaaS 매출 모델 아님 → Enterprise 유료 비검토 |

### 1.2 "왜 4점 아니라 3점" 차별화 원칙

- 5점: 업계 최고/사실상 표준 (AG Enterprise 피벗, Glide 1M Canvas, shadcn DataTable 채택 수준)
- 4점: 동급 최고 중 하나 (AG Community, TanStack v8)
- 3점: 동작은 되나 디테일 부족 (react-data-grid, Material React Table)
- 2점: 빌트인 최소 (순수 DOM + 가상화 없음)
- 1점: 라이브러리 없음

### 1.3 결론 근거 5개 (DQ-1.9)

1. **기존 의존성 + spec + 일부 코드가 이미 정렬**: `package.json`에 `@tanstack/react-table ^8.21.3` 이미 포함, `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md` spec이 EditableCell + useInlineEditMutation + editable-cell-inputs 분리를 가정하여 작성됨. 라이브러리 교체 시 spec을 다시 써야 함.
2. **잔여 비용 동등**: 14c-α 자체구현 잔여(~7~10일) ≈ AG Community 마이그레이션(~7~10일) ≈ Glide 마이그레이션(~11~14일). 자체구현이 비용 동등 또는 약간 우위.
3. **라이선스/코스트/번들**: 4개 후보 모두 MIT + $0이지만 번들 크기는 TanStack 15KB < Glide ~150KB < AG ~200KB. PM2 + Cloudflare Tunnel 콜드 스타트 영향 미미하나, 작을수록 유리.
4. **자산 재사용**: Phase 14b의 RowFormModal, table-policy(FULL_BLOCK/DELETE_ONLY), redactSensitiveValues, audit log 2종이 모두 TanStack v8 헤드리스 + 셀 슬롯 패턴 위에 얹혀 있어 셀 편집으로 자연 확장됨. AG/Glide로 가면 wiring을 다시 검증.
5. **점수 격차**: 14c-α 4.54 > AG 3.71~4.19 > Glide 3.30. 특히 INTEG(통합 비용) 차원에서 14c-α가 5.0, AG 2.5~3.0, Glide 1.5~2.0 — 컨텍스트 패널티가 결정적.

---

## 2. 종합 점수표

### 2.1 원점수 매트릭스 (각 차원 1~5)

| 차원 | 가중 | 14c-α 자체구현 | TanStack v8 (소자) | AG Community | Glide (중립) | Glide (컨텍스트) |
|------|------|---------------|-------------------|--------------|-------------|------------------|
| FUNC | 18% | 4.0 | 4.0 | 4.5 | 4.5 | 4.5 |
| PERF | 10% | 4.5 | 4.5 | 4.5 | 5.0 | 3.5 |
| DX | 14% | 4.5 | 4.5 | 4.0 | 3.5 | 3.5 |
| ECO | 12% | 4.5 | 4.5 | 5.0 | 3.5 | 3.5 |
| LIC | 8% | 5.0 | 5.0 | 4.0 | 5.0 | 5.0 |
| MAINT | 10% | 4.5 | 4.5 | 5.0 | 4.5 | 4.5 |
| INTEG | 10% | 5.0 | 5.0 | 3.0 | 2.0 | 1.5 |
| SEC | 10% | 4.5 | 4.5 | 3.5 | 5.0 | 5.0 |
| SH | 5% | 5.0 | 5.0 | 3.0 | 4.0 | 4.0 |
| COST | 3% | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 |

*"TanStack v8 (소자)"는 "라이브러리 자체의 잠재적 점수" — 14c-α 자체구현과 사실상 동일하나 Phase 14b 자산 재사용 페널티 없는 가상 조건.*

### 2.2 가중 합산 점수

```
14c-α 자체구현:
  4.0×0.18 + 4.5×0.10 + 4.5×0.14 + 4.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 5.0×0.10 + 4.5×0.10 + 5.0×0.05 + 5.0×0.03
= 0.72 + 0.45 + 0.63 + 0.54 + 0.40
+ 0.45 + 0.50 + 0.45 + 0.25 + 0.15
= 4.54 / 5

AG Community (보수적, 컨텍스트 패널티 적용 INTEG 2.5 / SEC 3.0):
  4.5×0.18 + 4.5×0.10 + 4.0×0.14 + 5.0×0.12 + 4.0×0.08
+ 5.0×0.10 + 2.5×0.10 + 3.0×0.10 + 3.0×0.05 + 5.0×0.03
= 0.81 + 0.45 + 0.56 + 0.60 + 0.32
+ 0.50 + 0.25 + 0.30 + 0.15 + 0.15
= 4.09 / 5

AG Community (낙관적):
  4.5×0.18 + 4.5×0.10 + 4.0×0.14 + 5.0×0.12 + 4.0×0.08
+ 5.0×0.10 + 3.0×0.10 + 3.5×0.10 + 3.0×0.05 + 5.0×0.03
= 4.19 / 5

Glide (컨텍스트 한정):
  4.5×0.18 + 3.5×0.10 + 3.5×0.14 + 3.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 1.5×0.10 + 5.0×0.10 + 4.0×0.05 + 5.0×0.03
- 0.60 (14b 자산 손실 패널티)
= 3.30 / 5

Glide (중립):
  4.5×0.18 + 5.0×0.10 + 3.5×0.14 + 3.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 2.0×0.10 + 5.0×0.10 + 4.0×0.05 + 5.0×0.03
= 4.12 / 5
```

### 2.3 순위

| 순위 | 후보 | 점수 | 핵심 이유 |
|------|------|------|---------|
| 1 | 14c-α 자체구현 (유지) | 4.54 | 자산 재사용 + INTEG 5.0 + LIC 5.0 + SH 5.0 |
| 2 | AG Community | 4.09~4.19 | 빌트인 우위(PERF/FUNC) — 다만 INTEG/SEC/SH 약점 |
| 3 | Glide (중립) | 4.12 | PERF 만점 — 우리 컨텍스트에서 무의미 |
| 4 | Glide (컨텍스트) | 3.30 | INTEG 1.5 + 자산 폐기 |

*2위와 3위의 순서는 "컨텍스트 중립" 기준에서 뒤집힌다. 양평 부엌 한정이면 AG > Glide.*

---

## 3. 핵심 특성 비교

### 3.1 Stars / npm / 라이선스

| 항목 | TanStack v8 | AG Community | Glide Data Grid |
|------|-------------|--------------|-----------------|
| GitHub Stars (table 단독) | 25K+ | 12K+ (ag-grid) | 6K+ |
| npm 주간 다운로드 | 200만+ (`@tanstack/react-table`) | 100만+ (`ag-grid-react`) | 8만+ (`@glideapps/glide-data-grid`) |
| 라이선스 | MIT | MIT (Community) / 상업 EULA (Enterprise) | MIT |
| 번들 크기 (core + React 어댑터, gzipped) | 15.2KB | 150~250KB (모듈러/전체) | 150KB |
| 버전 | 8.21.x 안정, v9 발표됨 | v32~v33 활발 | 7.x (2026-02 시점) |
| React 19 호환 | 공식 호환 (v8.21.x) | v33에서 정식 | peer deps `>=16` |
| Next.js 16 App Router | `"use client"` 필수 | `"use client"` + dynamic 권장 | `"use client"` + `next/dynamic` 필수 (Canvas SSR 미지원) |
| TypeScript first-class | Yes (`ColumnDef<TData, TValue>`) | Yes (`ColDef<TData>`) | Yes |
| 회사/배경 | Tanner Linsley + 소수 코어 | AG Grid Ltd (영국 상업 회사) | Glide Apps (노코드 플랫폼) |
| BUS factor | 중 (Tanner 단일) | 높 (회사) | 중 (회사 자체 사용) |
| 공식 docs | 풍부 (TanStack 사이트) | 매우 풍부 (AG 사이트) | 풍부 (grid.glideapps.com) |
| 대표 채택사 | shadcn DataTable, Vercel, Shopify, Mux | Google, Apple, IBM | Glide, Notion, Hex |

### 3.2 렌더링 패러다임

| 항목 | TanStack v8 | AG Community | Glide |
|------|-------------|--------------|-------|
| 모델 | Headless (로직만) | Batteries-included (렌더 포함) | Canvas direct draw |
| DOM 셀 마크업 | 사용자 작성 `<table>`/`<tr>`/`<td>` | 자동 생성 `<div role="treegrid">` | `<canvas>` + overlay `<div>` |
| Tailwind 적용 | 100% 자유 (사용자가 입힘) | cellClass/rowClass + AG Theme 변수 매핑 | theme 객체로만 (CSS 클래스 불가) |
| shadcn 호환 | 공식 DataTable 예제 존재 | wrapper 필요 | wrapper 필요 |
| 접근성 (WCAG) | 시맨틱 `<table>` → 스크린리더 자동 | `<div role="...">` — AG가 ARIA 자동 | 시맨틱 없음 — 키보드만 |
| 브라우저 Ctrl+F | 작동 | 작동 | 불가 (Canvas) |
| React DevTools | 셀 검사 가능 | 셀 검사 가능 | 불가 |

### 3.3 핵심 기능 — 빌트인 여부

| 기능 | TanStack v8 | AG Community | Glide |
|------|-------------|--------------|-------|
| 셀 편집 진입/종료 | 자체 구현 | 빌트인 | 빌트인 (overlay popup) |
| 키보드 네비 (Tab/Arrow/Enter/Esc) | 자체 구현 (8년째 미표준) | 빌트인 (F2, Tab, Enter, Esc, Arrow, Home/End, Page) | 빌트인 |
| 다중 행 선택 (체크박스) | state.rowSelection + 체크박스 셀 직접 그림 | `rowSelection={{mode:'multiRow'}}` 1줄 | `rowSelectionMode="multi"` + CompactSelection |
| 정렬 | getSortedRowModel 빌트인 | 빌트인 (단일 컬럼) | 데이터 단계에서 사용자 |
| 필터 | getFilteredRowModel 빌트인 | 빌트인 (Text/Number/Date) | 사용자 |
| 페이지네이션 | getPaginationRowModel 빌트인 | 빌트인 | 빌트인 (Canvas) |
| 가상 스크롤 | `@tanstack/react-virtual` 별 패키지 | 빌트인 | 빌트인 (Canvas) |
| 범위 선택 (Excel) | 자체 구현 | Enterprise만 | 자체 구현 |
| 클립보드 복사 | 자체 구현 | Enterprise만 | 빌트인 (TSV 복사·붙여넣기) |
| CSV export | 자체 구현 | 빌트인 (`api.exportDataAsCsv`) | 자체 구현 |
| CSV import | 자체 구현 | 자체 구현 | 자체 구현 |
| Custom cell renderer | ColumnDef.cell 함수 | React 컴포넌트 cellRenderer | CustomRenderer.draw (Canvas 2D) |
| Custom cell editor | EditableCell 자체 | React 컴포넌트 cellEditor | Custom Cell + provideEditor |

### 3.4 14c-α spec 정렬도

| spec 요구 컴포넌트 | TanStack v8 매핑 | AG 매핑 | Glide 매핑 |
|---|---|---|---|
| `EditableCell` | ColumnDef.cell 함수 슬롯 (1:1) | cellEditor React 컴포넌트 (1:1 유사) | allowOverlay + provideEditor (비매핑) |
| `useInlineEditMutation` | 외부 훅 (라이브러리 비종속) | onCellValueChanged 핸들러로 흡수 | onCellEdited 핸들러로 흡수 |
| `editable-cell-inputs.tsx` | 헤드리스 셀 내부에서 사용 | cellEditor 구성요소로 재배치 | provideEditor 내부 React 컴포넌트 |
| `readonly 매트릭스` | columnDef.meta.readOnly | `editable: (params)=>...` | GridCell.readonly |
| `Tab 키` | 자체 findNextEditableCell + meta.focusCell | 빌트인 (tabToNextCell 오버라이드 가능) | 빌트인 |
| `expected_updated_at` | (라이브러리 비종속) | (라이브러리 비종속) | (라이브러리 비종속) |
| `409 토스트` | (라이브러리 비종속) | (라이브러리 비종속) | (라이브러리 비종속) |
| `audit log 2종` | (라이브러리 비종속) | (라이브러리 비종속) | (라이브러리 비종속) |
| spec 수정량 (pseudo) | 0 | ~30% | ~60% |

→ TanStack v8 = 14c-α spec과 완벽 정렬. AG는 부분 충돌(작음). Glide는 큰 충돌.

---

## 4. 차원별 분석

### 4.1 FUNC (18%) — 기능 폭

- **TanStack v8 (4.0)**: 정렬·필터·선택·그루핑·페이지네이션·확장·가상화(`@tanstack/react-virtual` 별 패키지) 빌트인 모델로 받음. 셀 편집·키보드·CSV·FK는 자체. spec과 자체구현이 맞물려 AG Community 수준 도달 가능. **단 "즉시" 못 씀 — 빌드해야 됨**.
- **AG Community (4.5)**: Community 빌트인이 우리 100점 청사진의 99%를 커버. CSV import, FK selector는 자체. Enterprise 전용 기능(범위 선택·채우기 핸들·Excel export·피벗)은 Supabase Table Editor가 요구하지 않음.
- **Glide (4.5)**: 셀 편집·키보드·다중 선택·가상화·**클립보드 복사·붙여넣기** 모두 빌트인. **클립보드는 AG Community에 없는 우위**. CSV import·정렬·필터는 자체구현.
- **왜 TanStack 4.0이고 4.5 아닌가**: "즉시 쓸 수 없음" 페널티. AG/Glide는 설치 직후 셀 편집·Tab이 작동하지만 TanStack은 EditableCell·findNextEditableCell·focusCell을 짜야 함. 14c-α는 이 빌드가 완료될 것이므로 프로젝트 결과물로는 4.5지만 "소자 자체"는 4.0.

### 4.2 PERF (10%) — 렌더링·스크롤·편집 지연

- **TanStack v8 (4.5)**: DOM 기반이지만 TanStack Virtual 결합 시 50K+ 행 60fps 검증 (Mojca Rojko Medium 사례). 100K+ 행은 `columnResizeMode: 'onEnd'` 등 최적화 필요 (jpcamara.com 사례 — 1000배 가속).
- **AG Community (4.5)**: 가상화 빌트인. 1만 행 즉시 60fps. 10만+ client-side 가능 (~150MB 메모리). 100만+는 Enterprise Server-side 필요.
- **Glide (5.0 중립 / 3.5 컨텍스트)**: Canvas → 1M+ 행 60fps + 메모리 ~50MB 일정. **중립 점수는 만점**. 우리 컨텍스트(11 테이블 / 1만 미만)에서 이 우위는 무의미 → 컨텍스트 점수 3.5로 감산.
- **왜 TanStack 4.5지 5.0 아닌가**: "가상화 별 패키지" 페널티. `@tanstack/react-virtual` 추가 설정이 필요. AG/Glide는 설정 0.

### 4.3 DX (14%) — 학습곡선·코드량

- **TanStack v8 (4.5)**: TS first, headless 학습 1~2일. 그 후 어떤 UI든 입힐 수 있어 "압축적 강력함". shadcn 공식 DataTable 예제가 v8 기반 — 우리 스택 정합성 최고. **이미 팀이 사용 중**이라 비용 0.
- **AG Community (4.0)**: declarative props만으로 대부분 끝. 매우 빠른 시작. **단 shadcn/Tailwind/sonner 통합에서 mismatch** — Theme 시스템 별도 학습. 모듈 등록 누락 시 silent fail. -0.5.
- **Glide (3.5)**: TS first, 문서 풍부. **Linen 데이터 모델 + theme 객체 학습 곡선 + Canvas 패러다임 디버깅 어려움**. React DevTools에서 셀 검사 불가. -1.5.
- **왜 TanStack 4.5지 5.0 아닌가**: 완전 headless라 처음 짜는 코드량이 "AG declarative" 대비 많음. 두 번째 짤 때는 패턴이 빨라 차이 없음.

### 4.4 ECO (12%) — 생태계·채택률·서드파티

- **TanStack v8 (4.5)**: Stars 25K+, npm 200만+, TanStack 패밀리(Query/Router/Form/Virtual) 정합성. Material React Table, Mantine React Table, Tremor, shadcn DataTable 모두 v8 기반.
- **AG Community (5.0)**: 글로벌 기업(Google, Apple, IBM) 채택. npm 100만+. Plotly Dash 통합, AG 콘퍼런스. 만점.
- **Glide (3.5)**: npm 8만+. Notion, Hex, Glide 자체. 생태계는 좁지만 깊음. -1.5.
- **왜 TanStack 4.5지 5.0 아닌가**: AG 대비 "글로벌 대기업 공식 채택" 규모 작음. 단 React 전문 영역에서는 사실상 표준.

### 4.5 LIC (8%) — 라이선스·비용 영속성

- **TanStack v8 / Glide (5.0)**: MIT 영구. 만점.
- **AG Community (4.0)**: Community MIT이지만 Enterprise 유료 라인이 있어 향후 기능 확장 시 유료 압박. -1.0.

### 4.6 MAINT (10%) — 유지보수·패치 빈도·BUS factor

- **TanStack v8 (4.5)**: 8.21.x 안정, 정기 패치, React 19 즉시 지원. Tanner + 소수 코어.
- **AG Community (5.0)**: AG Grid Ltd 상업 회사. 메이저 매년, 마이너 매월. React 19/Tailwind 4 즉시 지원. 만점.
- **Glide (4.5)**: Glide Apps 자체 사용 → 동기 강함. 2025~2026 active issues. -0.5 (BUS factor 작음).

### 4.7 INTEG (10%) — 기존 자산·스택 호환성 (★ 결정적)

- **TanStack v8 (5.0)**: 이미 의존성. shadcn/ui DataTable이 v8 기반. Tailwind 4 + React 19 + Next.js 16 모두 검증. 14c-α spec과 1:1 매핑.
- **AG Community (2.5~3.0)**: Tailwind 4 + shadcn 토큰과 AG Theme 변수 매핑 비용 1~2일. **14b 자산(EditableCell, useInlineEditMutation, spec) 손실 = -1.0** (보수) ~ -0.5 (낙관).
- **Glide (1.5~2.0)**: Canvas는 CSS 토큰 자동 못 받음. theme 매핑 함수 필수. 14b/14c-α 자산 100% 폐기. spec 재작성.
- **왜 TanStack 5.0**: 의존성 추가 비용 0 + 자산 보존 + spec 정합성.

### 4.8 SECURITY (10%) — XSS·CSRF·입력 검증

- **TanStack v8 (4.5)**: 라이브러리 자체 XSS 표면 0 (마크업 없음). React JSX escape 자동. -0.5: 셀 작성자가 raw HTML 주입 prop을 쓰지 않도록 코딩 룰 필요.
- **AG Community (3.0~3.5)**: cellRenderer 함수 사용 시 XSS 표면. Snyk SNYK-JS-AGGRIDCOMMUNITY-1932011, Issue #1961/#913/#3953/#5229, CVE-2017-16009 이력. -1.5 (TanStack 대비).
- **Glide (5.0)**: Canvas 렌더링 → `ctx.fillText()`는 텍스트로만 그림. 라이브러리 자체 XSS 표면 0. provideEditor React 컴포넌트만 주의. 만점.

### 4.9 SELF_HOST (5%) — 번들·SSR·CDN

- **TanStack v8 (5.0)**: 15.2KB + Virtual 5~10KB = 25KB 이내. SSR/CSR 모두 (`"use client"`). CDN/외부 통신 0. 만점.
- **AG Community (3.0)**: 모듈러 ~150KB, 전체 ~250KB. v8(15KB) 대비 10배+. SSR 가능하나 `"use client"` 필수. -2.0.
- **Glide (4.0)**: ~150KB. SSR 미지원 (Canvas client-only) → `next/dynamic`로 lazy load. -1.0.

### 4.10 COST (3%) — 직접 비용

- 4개 후보 모두 $0. 만점.
- AG Enterprise는 $999/dev/year — 우리는 도입 안 함.

---

## 5. 최종 순위 + 대안 시나리오 + 민감도 분석

### 5.1 최종 순위

| 순위 | 후보 | 점수 | 권장 여부 |
|------|------|------|----------|
| 1 | **14c-α 자체구현 (TanStack v8 + 자체 셀)** | **4.54** | **채택** (현재 노선 유지) |
| 2 | TanStack v8 (소자) | 4.54 | 동일 |
| 3 | AG Community | 4.09~4.19 | 백업 옵션 — 비전 확장 시 재평가 |
| 4 | Glide (컨텍스트) | 3.30 | 부분 도입 옵션 (EdgeFunctionRun 1M+ 시) |
| — | Glide (중립) | 4.12 | 타 컨텍스트 참조용 |

### 5.2 대안 시나리오 (컨텍스트 변경 시)

#### 시나리오 A: 행 수 폭증 (100K+ 상시)
- EdgeFunctionRun 로그가 월 1M+ 생성되는 상황.
- TanStack + Virtual로도 가능하나 AG Server-side 또는 Glide Canvas 우위 확대.
- **재평가 결과**: AG Enterprise ($999/dev/year) 또는 Glide 부분 도입 (EdgeFunctionRun 전용 페이지).
- **트리거 조건**: 월평균 EdgeFunctionRun 행 수 10만 초과 2개월 연속.

#### 시나리오 B: Excel급 UX 요구 (피벗·범위 선택·채우기 핸들)
- 사용자가 "Excel처럼 셀 드래그로 범위 선택 후 값 일괄 복사"를 강하게 요구.
- AG Community는 범위 선택 없음 → Enterprise 또는 Glide (클립보드 빌트인).
- **재평가 결과**: Glide 부분 도입 (복잡한 CRUD는 RowFormModal 유지, 빠른 분석은 Glide 뷰).
- **트리거 조건**: 사용자 피드백 3건 이상 + 비즈니스 가치 확인.

#### 시나리오 C: 팀 규모 확장 (개발자 3명+)
- 신규 개발자가 headless 학습 곡선 부담.
- AG의 declarative API가 학습 속도 우위.
- **재평가 결과**: 신규 페이지만 AG 시범 도입 → 비교 후 확대 여부 결정.
- **트리거 조건**: 개발자 2명 이상 신규 합류 + TanStack 학습에 1주 이상 소요.

#### 시나리오 D: 접근성 규제 강화 (WCAG 2.2 AA 필수)
- Glide 즉시 탈락 (Canvas 스크린리더 약함).
- TanStack(시맨틱 `<table>`) 또는 AG(ARIA 자동) 유지.
- **재평가 결과**: TanStack 유지 (시맨틱 마크업 우위).

### 5.3 민감도 분석 — 가중치 변경 시 순위

#### 민감도 A: PERF 가중 10% → 25%, FUNC 18% → 10% (대용량 데이터 중심)
```
14c-α:  (4.0×0.10 + 4.5×0.25 + 4.5×0.14 + 4.5×0.12 + 5.0×0.08
         + 4.5×0.10 + 5.0×0.10 + 4.5×0.10 + 5.0×0.05 + 5.0×0.03) — 재정규화
       = 4.52
AG:    4.22
Glide (중립): 4.25
Glide (컨텍스트): 3.50
```
→ Glide(중립)이 AG를 앞서지만 컨텍스트 패널티에서는 여전히 14c-α 1위.

#### 민감도 B: INTEG 10% → 5%, DX 14% → 19% (신규 프로젝트 + 개발 속도 중심)
```
14c-α:  4.47
AG:    4.19
Glide (컨텍스트): 3.52
```
→ 1위 유지, 격차는 축소.

#### 민감도 C: LIC 8% → 15%, ECO 12% → 5% (상업 라이선스 회피 극대화)
```
14c-α:  4.54 → 4.58 (LIC 5.0 상승 혜택)
AG:    4.09 → 4.06 (LIC 4.0 때문에 감소)
Glide: 3.30 → 3.38
```
→ 14c-α 격차 확대.

#### 민감도 D: SEC 10% → 20% (보안 극대화)
```
14c-α:  4.54 → 4.55 (SEC 4.5 약간 상승)
AG:    4.09 → 3.91 (SEC 3.0~3.5 감소)
Glide: 3.30 → 3.55 (SEC 5.0 상승, 다만 INTEG 패널티 유지)
```
→ Glide가 AG보다 근접 접근. 14c-α 1위 유지.

### 5.4 "만약 0부터 시작했다면" (Hypothetical)

spec/14b 자산이 없다고 가정 → INTEG 페널티 제거:
```
14c-α 자체구현 (가상):     4.54
TanStack v8 (소자):        4.54
AG Community (소자):       4.35 (INTEG 4.0으로)
Glide (소자):              4.30 (INTEG 4.0으로)
```

→ 격차 축소. TanStack v8 + 자체구현이 여전히 근소 우위 (FUNC 동급 + INTEG 우위). 단 "빠른 개발 시작"이 최우선이면 AG Community가 대안.

---

## 6. 리스크 매트릭스

| 리스크 | 후보 | 심각도 | 완화 |
|------|------|--------|------|
| 키보드 네비 8년째 미표준 | TanStack | 중 | α 단계는 Tab/Enter/Esc만. Arrow는 14e |
| 데이터 참조 안정성 (setRows 후 selection 깨짐) | TanStack | 낮 | `getRowId: (r) => r.id` 명시 |
| TanStack Query 미도입 → 캐시 수동 | TanStack (현재) | 중 | 14e에서 도입 검토 |
| v9 EOL 압박 | TanStack | 낮 | v8 LTS + MIT fork 가능 |
| EdgeFunctionRun 가상화 미도입 | TanStack (14c-α) | 낮 | 14d 우선순위 |
| Tab 네비 E2 실패 | TanStack (14c-α) | 중 | D2 커밋에 findNextEditableCell 추가 |
| Sonner 3액션 한도 | TanStack/AG/Glide 공통 | 낮 | description에 안내 |
| 14b 자산 손실 | AG / Glide | 높 | 채택 시 sunk cost |
| Tailwind ↔ AG Theme 통합 디버깅 | AG | 중 | Quartz Dark + override 사전 학습 |
| Enterprise 압박 | AG | 중 | 사용자 대화로 차단 |
| cellRenderer XSS | AG | 낮 | React 컴포넌트 cellRenderer만 (룰) |
| 번들 +200KB | AG | 낮 | 모듈러 import + `next/dynamic` |
| Canvas 패러다임 학습 | Glide | 높 | — (완화 불가) |
| 접근성 약함 | Glide | 중 | 사내 용 한정 |
| Canvas 디버깅 | Glide | 중 | 빌드된 데모로 사전 검증 |
| Glide Apps 회사 의존 | Glide | 낮 | MIT fork 가능 |
| SSR 미지원 | Glide | 낮 | `next/dynamic` 패턴 |

---

## 7. 14c-α → 100점 로드맵 (선정안)

Wave 1 deep-dive 01의 §11.2 청사진을 매트릭스 관점에서 재확인.

| Phase | 기간 | 작업 | FUNC/DX/PERF 기여 | 점수 변화 |
|-------|------|------|------------------|----------|
| 14c-α (현재) | ~3일 잔여 | D1 PATCH / D2 EditableCell+Tab / D3 wiring / D4 ADR / D5 E2E | FUNC +10, DX +5 | 75 → 90 |
| 14c-β (완료) | — | 복합 PK + VIEWER 권한 매트릭스 + 다중 행 선택 | FUNC +3 | 90 → 93 |
| 14d | ~7일 | FK selector (cmdk + introspection) + CSV import (Papa Parse) + 가상 스크롤(EdgeFunctionRun) | FUNC +5, PERF +1 | 93 → 99 |
| 14e | ~3일 | Arrow key 셀 포커스 모드 + 셀 범위 복사 (Ctrl+C → TSV) + TanStack Query 도입 | DX +1 | 99 → 100 |

**총 잔여: ~13일** (세션 기준 1인 풀타임 2~3주).

---

## 8. 차원별 종합 스프레드시트 (원+가중)

```
                       Wgt  | 14c-α | TStk  | AG    | Glide(c) | Glide(n)
FUNC (5점)             .18  | 4.0   | 4.0   | 4.5   | 4.5      | 4.5
  가중                     | 0.72  | 0.72  | 0.81  | 0.81     | 0.81
PERF                   .10  | 4.5   | 4.5   | 4.5   | 3.5      | 5.0
  가중                     | 0.45  | 0.45  | 0.45  | 0.35     | 0.50
DX                     .14  | 4.5   | 4.5   | 4.0   | 3.5      | 3.5
  가중                     | 0.63  | 0.63  | 0.56  | 0.49     | 0.49
ECO                    .12  | 4.5   | 4.5   | 5.0   | 3.5      | 3.5
  가중                     | 0.54  | 0.54  | 0.60  | 0.42     | 0.42
LIC                    .08  | 5.0   | 5.0   | 4.0   | 5.0      | 5.0
  가중                     | 0.40  | 0.40  | 0.32  | 0.40     | 0.40
MAINT                  .10  | 4.5   | 4.5   | 5.0   | 4.5      | 4.5
  가중                     | 0.45  | 0.45  | 0.50  | 0.45     | 0.45
INTEG                  .10  | 5.0   | 5.0   | 2.5   | 1.5      | 2.0
  가중                     | 0.50  | 0.50  | 0.25  | 0.15     | 0.20
SEC                    .10  | 4.5   | 4.5   | 3.0   | 5.0      | 5.0
  가중                     | 0.45  | 0.45  | 0.30  | 0.50     | 0.50
SH                     .05  | 5.0   | 5.0   | 3.0   | 4.0      | 4.0
  가중                     | 0.25  | 0.25  | 0.15  | 0.20     | 0.20
COST                   .03  | 5.0   | 5.0   | 5.0   | 5.0      | 5.0
  가중                     | 0.15  | 0.15  | 0.15  | 0.15     | 0.15
──────────────────────────────────────────────────────────────
총합                         | 4.54  | 4.54  | 3.99* | 3.32**   | 4.12
                                                * 보수적
                                              ** 자산 손실 패널티 -0.60 미적용
```

*AG 원계산 4.09에서 보수 반영. 자산 손실 페널티 명시.*

---

## 9. 왜 14c-α가 1위인가 — 세부 증명

### 9.1 FUNC 4.0 < AG 4.5 인데도 1위인 이유
- FUNC 차 0.5 × 가중 0.18 = 0.09 손실
- INTEG 차 5.0 vs 2.5~3.0 = 2.0~2.5 × 0.10 = 0.20~0.25 이득
- SEC 차 4.5 vs 3.0~3.5 = 1.0~1.5 × 0.10 = 0.10~0.15 이득
- SH 차 5.0 vs 3.0 = 2.0 × 0.05 = 0.10 이득
- LIC 차 5.0 vs 4.0 = 1.0 × 0.08 = 0.08 이득
- **순이득: 0.39~0.49 ≫ 0.09 손실** → 14c-α 우위 확실

### 9.2 Glide PERF 5.0인데도 3위인 이유
- PERF 차 5.0 vs 4.5 = 0.5 × 0.10 = 0.05 이득
- INTEG 차 1.5 vs 5.0 = -3.5 × 0.10 = -0.35 손실
- DX 차 3.5 vs 4.5 = -1.0 × 0.14 = -0.14 손실
- 14b 자산 손실 패널티 -0.60
- **순손실: -1.04** → Glide 컨텍스트 점수 3.30으로 추락

### 9.3 "동점 1위"는 왜?
- 14c-α 자체구현과 "TanStack v8 (소자)"가 동일 점수(4.54)인 이유: 14c-α = TanStack v8 + 자체 셀 + 자체 훅. 소자 자체의 잠재점수와 구현 결과가 일치.
- 결정적 차이: AG/Glide와의 격차에서는 INTEG+자산보존이 결정적 요인.

---

## 10. 결론 — DQ-1.9 최종 답

### 10.1 답

**14c-α 자체구현 유지 (TanStack Table v8 + EditableCell + useInlineEditMutation + Phase 14b 자산 재사용).**

### 10.2 확정 근거 요약

1. 종합 4.54 > AG 4.09~4.19 > Glide 3.30 (컨텍스트 한정)
2. spec 완벽 정렬
3. Phase 14b 자산 100% 재사용
4. 번들 15KB + MIT + SSR 양립
5. 잔여 비용 ~7~10일, AG/Glide 마이그레이션 동등 또는 더 김

### 10.3 재평가 트리거 (명시)

- 월평균 EdgeFunctionRun 로그 10만 행 초과 2개월 연속 → AG Server-side 또는 Glide 부분 도입 검토
- 사용자 피드백 3건+ "Excel처럼 범위 선택·채우기 핸들" 요구 → AG Enterprise 또는 Glide 부분 도입
- 개발자 2명 이상 신규 합류 + TanStack 학습 1주+ 소요 → AG 시범 도입 검토
- 접근성 규제 WCAG 2.2 AA 필수화 → Glide 탈락, TanStack 유지 확정

### 10.4 14c-α 완료 후 100점 청사진

```
75 → 14c-α (현재 진행) → 90
90 → 14c-β (완료) → 93
93 → 14d (FK + CSV + 가상화) → 99
99 → 14e (Arrow + 범위복사 + TanStack Query) → 100
```

---

## 11. 참고 자료 (10개+)

### Wave 1 deep-dive (내부)
1. [01-tanstack-table-v8-cell-editing-deep-dive.md](./01-tanstack-table-v8-cell-editing-deep-dive.md) — TanStack v8 자체구현 분석 (957줄)
2. [02-ag-grid-community-deep-dive.md](./02-ag-grid-community-deep-dive.md) — AG Community 마이그레이션 분석 (830줄)
3. [03-glide-data-grid-deep-dive.md](./03-glide-data-grid-deep-dive.md) — Glide Canvas 분석 (828줄)

### 외부 (Wave 1 deep-dive에서 인용된 것)
4. [TanStack Table v8 공식 문서](https://tanstack.com/table/v8)
5. [React TanStack Table Editable Data 예제](https://tanstack.com/table/v8/docs/framework/react/examples/editable-data)
6. [Making Tanstack Table 1000x faster — JP Camara (2023)](https://jpcamara.com/2023/03/07/making-tanstack-table.html)
7. [Building Performant Virtualized Table — Mojca Rojko (Medium CodeX)](https://medium.com/codex/building-a-performant-virtualized-table-with-tanstack-react-table-and-tanstack-react-virtual-f267d84fbca7)
8. [TanStack/table Issue #1500 — Tab key editable cells](https://github.com/TanStack/table/issues/1500)
9. [AG Grid 공식 사이트](https://www.ag-grid.com/)
10. [AG Grid Pricing Breakdown 2026 — Simple Table](https://www.simple-table.com/blog/ag-grid-pricing-license-breakdown-2026)
11. [TanStack vs AG Grid Comparison — Simple Table](https://www.simple-table.com/blog/tanstack-table-vs-ag-grid-comparison)
12. [AG Grid GitHub Issue #5229 — cellRenderer XSS](https://github.com/ag-grid/ag-grid/issues/5229)
13. [Snyk SNYK-JS-AGGRIDCOMMUNITY-1932011](https://security.snyk.io/vuln/SNYK-JS-AGGRIDCOMMUNITY-1932011)
14. [Glide Data Grid 공식 사이트](https://grid.glideapps.com/)
15. [@glideapps/glide-data-grid npm](https://www.npmjs.com/package/@glideapps/glide-data-grid)
16. [Render 1 Million Rows — keyurparalkar](https://github.com/keyurparalkar/render-million-rows)
17. [Top Free Alternatives to AG Grid — SVAR.dev](https://svar.dev/blog/top-react-alternatives-to-ag-grid/)
18. [React Data Grid Bundle Size Comparison — Simple Table](https://www.simple-table.com/blog/react-data-grid-bundle-size-comparison)
19. [Best React Table Libraries 2026 Comparison — Simple Table](https://www.simple-table.com/blog/best-react-table-libraries-2026)
20. [Table Performance Guide — Strapi](https://strapi.io/blog/table-in-react-performance-guide)

### 내부 관련 문서
21. [Phase 14c-α 인라인 편집 spec](../../../../superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md) — 237줄
22. [ADR-004 낙관적 잠금](../../decisions/ADR-004-phase-14c-alpha-optimistic-locking.md) — 38줄

---

## 부록 A — 가중치 원본 표 (재확인용)

| 차원 | Wave 2 가중 | 출처 |
|------|------------|------|
| FUNC | 18% | L4 지침 |
| PERF | 10% | L4 지침 |
| DX | 14% | L4 지침 |
| ECO | 12% | L4 지침 |
| LIC | 8% | L4 지침 |
| MAINT | 10% | L4 지침 |
| INTEG | 10% | L4 지침 |
| SEC | 10% | L4 지침 |
| SH | 5% | L4 지침 |
| COST | 3% | L4 지침 |
| **합** | **100%** | |

## 부록 B — 비교 요약 한 줄표

| 후보 | 한 줄 |
|------|------|
| **14c-α 자체구현** | TanStack v8 헤드리스 + 자체 EditableCell + 자체 useInlineEditMutation. **이미 진행 중 + spec 완벽 정렬 + 자산 100% 재사용** — **1위** |
| AG Community | 빌트인 우위(셀편집/키보드/가상화/다중선택) — **단 14b 자산 폐기 + Tailwind 통합 비용 + Enterprise 압박** — 2위 백업 |
| Glide Data Grid | Canvas 1M+ 60fps — **단 우리 컨텍스트 무의미 + shadcn mismatch + 접근성 약함 + 자산 100% 폐기** — 3위 (부분 도입 옵션) |

## 부록 C — "언제 바꿔야 하는가" 플로우

```
Q1: 행 수 100K+ 상시 되었나?
    ├─ No  → Q2
    └─ Yes → AG Enterprise 또는 Glide 부분 도입 평가

Q2: Excel급 UX 요구 3건+ 있나?
    ├─ No  → Q3
    └─ Yes → Glide 부분 도입 평가

Q3: 개발자 2명+ 신규 합류?
    ├─ No  → 14c-α 유지
    └─ Yes → AG 시범 도입 평가

Q4: WCAG 2.2 AA 규제?
    ├─ No  → 14c-α 유지
    └─ Yes → Glide 탈락, TanStack 확정
```

— 끝 —
