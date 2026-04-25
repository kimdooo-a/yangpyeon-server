# 03. 스파이크 지연 세트 — Phase 18~22 직전 실행 계획

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · P1 산출물 · 작성일: 2026-04-18
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [06-prototyping/](./) → **이 문서**
> 연관: [01-spike-portfolio.md](./01-spike-portfolio.md) · [02-spike-priority-set.md](./02-spike-priority-set.md)
> 참조: [00-vision/07-dq-matrix.md](../00-vision/07-dq-matrix.md) · [02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md)

---

## 0. 지연 세트 정의

지연 세트는 Phase 18~22 직전에 실행되는 스파이크 15건이다. Phase 15~17 MVP에는 영향을 주지 않으나, 해당 Phase 구현 착수 전에 반드시 기술 불확실성을 해소해야 한다.

**지연 이유**: 우선 세트(SP-010~SP-016) 결과에 의존하거나, 해당 기능 카테고리 구현이 Phase 18 이후이거나, 특정 비즈니스 트리거(사용자 증가, 트래픽 급증 등)가 발동된 경우에만 실행하는 조건부 스파이크가 포함됨.

| ID | 제목 | 관련 DQ | 관련 ADR | 공수(h) | 실행 Phase | 우선순위 |
|----|------|---------|---------|---------|----------|---------|
| SP-017 | AG Grid vs TanStack v8 성능 비교 | DQ-1.13 | ADR-002 | 6 | Phase 18 직전 | 중(조건부) |
| SP-018 | TanStack Enterprise 가치 분석 | DQ-1.14 | ADR-002 | 2 | Phase 18 직전 | 저(조건부) |
| SP-019 | Schema Viz 외부 도구 임베드 vs 자체 구현 | DQ-3.3 | ADR-004 | 3 | Phase 20 직전 | 저 |
| SP-020 | pg_cron vs node-cron 마이그레이션 비용 | DQ-4.2 | ADR-005 | 4 | Phase 20 직전 | 중(조건부) |
| SP-021 | BullMQ vs pgmq 상세 벤치마크 | DQ-4.3 | ADR-005, ADR-012 | 5 | Phase 20 직전 | 중(조건부) |
| SP-022 | wal-g 100GB 복원 속도 실측 | DQ-4.22 | ADR-005 | 6 | Phase 20 직전 | 중 |
| SP-023 | FIDO Metadata Service 통합 경로 | DQ-AA-3 | ADR-007 | 4 | Phase 18 직전 | 중 |
| SP-024 | WebAuthn Conditional UI 브라우저 호환성 | DQ-AA-9 | ADR-007 | 3 | Phase 18 직전 | 중 |
| SP-025 | splinter 38룰 PG 버전 호환 포팅 | DQ-ADV-1 | ADR-011 | 8 | Phase 20 직전 | 중(SP-015 의존) |
| SP-026 | presence_diff 알고리즘 재구현 검증 | DQ-RT-3 | ADR-010 | 5 | Phase 19 직전 | 중(SP-013 의존) |
| SP-027 | PG 18 마이그레이션 영향 분석 | DQ-RT-6 | ADR-010, ADR-005 | 4 | Phase 22 직전 | 저 |
| SP-028 | Capacitor iOS/Android 인증 토큰 저장 | DQ-12.5 | ADR-013, ADR-017 | 5 | Phase 22 직전 | 저(조건부) |
| SP-029 | Docker 전환 TCO 검토 | DQ-OPS-1 | ADR-015 | 3 | Phase 22 직전 | 저(조건부) |
| SP-030 | Node 버전 업그레이드 정책 | DQ-OPS-3 | ADR-015, ADR-009 | 2 | Phase 20 직전 | 중 |
| SP-031 | DR 호스트 스펙 + 동기화 방식 | DQ-OPS-4 | ADR-015 | 3 | Phase 22 직전 | 저(조건부) |

**총 공수**: 약 63h / **실행 기간**: Phase 18~22 각 Phase 착수 2주 전

---

## 1. SP-017: AG Grid vs TanStack v8 성능 비교

### 1.1 질문과 배경

**핵심 질문**: TanStack Table v8 자체구현(ADR-002)이 실제 운영에서 p95 > 1.2s 응답을 보일 때, AG Grid Community(MIT)로의 전환이 합리적인가?

**배경**:
- ADR-002: "TanStack Table v8 헤드리스 자체구현 채택 — AG Grid/Glide 거부"
- DQ-1.13: "AG Grid를 도입한다면 14b 자산을 폐기하고 다시 짜는 것이 합리적인가? 잠정답변: 비합리적"
- ADR-002 §재검토 트리거 1: "테이블 row 수 100만 초과 + p95 > 1.2s"
- Wave 1 02문서 §35: "deep-dive 결론: 비합리적"

**범위**:
- 100만 행 데이터셋으로 TanStack v8 + 가상 스크롤 vs AG Grid Community 렌더 성능 비교
- 스크롤, 정렬, 필터 p95 응답 시간 측정
- 번들 크기 비교 (TanStack < 1MB vs AG Grid Community ~2MB)

**성공 기준 (AG Grid Go — 전환 권장)**:
```
- TanStack v8 스크롤 p95 > 1.2s (100만 행 기준)
- AND AG Grid Community 동일 조건 p95 < 600ms (2배 이상 우위)
- AND 번들 증가 < 1MB

[TanStack 유지 — 현상 유지]
- TanStack v8 p95 ≤ 1.2s → ADR-002 현상 유지, SP-018 불필요
```

**실행 시점 트리거**: TanStack v8으로 Phase 18 구현 착수 후 실제 성능 측정에서 p95 > 1.2s 발생 시. 트리거 없으면 실행 스킵.

**반영 위치**: ADR-002 재검토 → TanStack v8 유지 확정 또는 AG Grid Community 전환 ADR-023 신규

**kdyspike 명령어**:
```bash
/kdyspike --full "TanStack Table v8 vs AG Grid Community 100만 행 렌더 성능 비교" \
  --max-hours 6 \
  --output "docs/research/spikes/spike-017-aggrid-tanstack-result.md"
```

---

## 2. SP-018: TanStack Enterprise 가치 분석

### 2.1 질문과 배경

**핵심 질문**: AG Grid Enterprise 라이선스($999+/개발자)를 향후 도입할 가능성이 있는가? 1인 비SaaS 환경에서의 ROI를 분석한다.

**배경**:
- DQ-1.14: "AG Grid Enterprise 라인을 향후 도입할 가능성이 있는가? 잠정답변: 비도입"
- ADR-002: "AG Grid: 상용 라이선스 $999/개발자 — 거부: CON-7 라이선스(오픈소스만) + CON-9 비용 상한 위반"
- CON-9: 단일 라이브러리 비용 상한 $500/년

**범위**:
- AG Grid Enterprise 기능 목록 vs 양평 대시보드 실제 필요 기능 매핑
- $999/개발자 라이선스 대비 TanStack v8 자체구현 공수(60h × 운영자 가치) 비교
- 비SaaS 단일 운영자 환경에서 Enterprise 기능의 실용성 분석

**성공 기준 (Enterprise Go — 실질 가치 있음)**:
```
- AG Grid Enterprise 전용 기능 중 양평 필요 기능 ≥ 3개
- AND 기능 자체구현 공수 > 30h (라이선스 대비 절감)
- AND CON-9 비용 상한 완화 의사 결정

[No-Go — 현상 유지]
- 필요 기능 < 2개 → ADR-002 현상 유지
```

**실행 시점 트리거**: SP-017에서 AG Grid Community No-Go 판정 시에만 실행. 독립 실행 불가.

**반영 위치**: ADR-002 재검토 보완 자료

**kdyspike 명령어**:
```bash
/kdyspike --micro "AG Grid Enterprise 기능 목록 vs 양평 대시보드 필요 기능 매핑" \
  --max-hours 2 \
  --output "docs/research/spikes/spike-018-tanstack-enterprise-result.md"
```

---

## 3. SP-019: Schema Viz 외부 도구 임베드 vs 자체구현

### 3.1 질문과 배경

**핵심 질문**: Prisma Studio / drizzle-kit studio를 iframe으로 임베드하는 것이 자체구현(ADR-004)보다 유리한 시점이 도래했는가?

**배경**:
- ADR-004: "Prisma Studio와 drizzle-kit Studio는 임베드 거부, UX 패턴만 흡수"
- DQ-3.3: "Prisma Studio / drizzle-kit studio를 운영자 유틸로 옵션 임베드(iframe)할 가치가 있는가? 잠정답변: No"
- ADR-004 §재검토 트리거 3: "Prisma Studio가 임베드 가능한 공식 헤드리스 모드 제공 시"

**범위**:
- Prisma Studio 최신 버전에서 headless/embed 모드 공식 지원 여부 확인
- drizzle-kit studio 안정성 현황 재평가 (커뮤니티 기여자 현황)
- iframe 인증 통합 방식 (postMessage + JWT 토큰 전달) 구현 비용 추정

**성공 기준 (임베드 Go)**:
```
- Prisma Studio가 공식 headless 모드 또는 embed API 제공
- AND 인증 통합 구현 < 10h
- AND ADR-004 §거부 사유가 해소됨

[임베드 거부 유지]
- Prisma Studio headless 미지원 → ADR-004 현상 유지
```

**실행 시점**: Phase 20 Schema Visualizer 구현 착수 2주 전. 우선 세트 결과와 무관.

**반영 위치**: ADR-004 재검토 (현상 유지 확인 또는 Superseded 처리)

**kdyspike 명령어**:
```bash
/kdyspike --micro "Prisma Studio 최신 버전 headless embed 모드 공식 지원 여부" \
  --max-hours 3 \
  --output "docs/research/spikes/spike-019-schema-viz-embed-result.md"
```

---

## 4. SP-020: pg_cron vs node-cron 마이그레이션 비용

### 4.1 질문과 배경

**핵심 질문**: node-cron 기반 잡이 50개를 초과할 때, pg_cron PostgreSQL 확장으로 마이그레이션하는 실제 비용은 얼마인가?

**배경**:
- ADR-005: "주기 작업 = node-cron (Node.js TypeScript 네이티브) — pg_cron 거부"
- DQ-4.2: "pg_cron PostgreSQL 확장을 도입? 잠정답변: No. SQL-only 잡이 5개 이상 누적되면 재검토"
- ADR-005 §재검토 트리거 1: "Cron 작업 수 > 50개 + 정확도 문제 발생"
- ADR-005 §재검토 트리거 4: "PostgreSQL 17+에서 pg_cron이 기본 탑재 되는 경우"

**범위**:
- WSL2 환경에서 pg_cron 확장 설치 난이도 측정
- node-cron vs pg_cron: 동일 잡 10개 구현 공수 비교
- 실패/재시도 처리 방식 차이 분석
- PM2 프로세스 분리 없이 pg_cron이 중복 방지 자동 처리하는지 확인

**성공 기준 (pg_cron Go — 마이그레이션 권장)**:
```
- pg_cron 설치 성공 (WSL2 PG 확장 인스톨 성공)
- pg_cron 잡 10개 구현 공수 < node-cron 동일 구현의 50%
- 중복 실행 자동 방지 (PG 내부 locking)
- node-cron → pg_cron 마이그레이션 공수 < 20h

[node-cron 유지]
- pg_cron 설치 실패 또는 마이그레이션 공수 > 40h → ADR-005 현상 유지
```

**실행 시점 트리거**: 누적 node-cron 잡 수 ≥ 30개 이상 발생 시 또는 Phase 20 DB Ops 구현 착수 전.

**반영 위치**: ADR-005 재검토 → node-cron 유지 확인 또는 pg_cron 전환 ADR 신규

**kdyspike 명령어**:
```bash
/kdyspike --full "pg_cron WSL2 설치 + node-cron 마이그레이션 비용 비교" \
  --max-hours 4 \
  --output "docs/research/spikes/spike-020-pgcron-nodecron-result.md"
```

---

## 5. SP-021: BullMQ vs pgmq 상세 벤치마크

### 5.1 질문과 배경

**핵심 질문**: pgmq(ADR-012 채택)가 실제 운영에서 처리 한계(초당 메시지 처리량, 재시도 정확도)에 도달했을 때, BullMQ(Redis 기반)로의 전환 비용과 이점은 무엇인가?

**배경**:
- ADR-012: "pgmq + SQLite 보조 즉시 채택 — BullMQ/Redis 미도입"
- DQ-4.3: "BullMQ(Redis 기반)로 재시도/큐 강화? 잠정답변: No. Redis = 신규 의존성 추가"
- ADR-005 §재검토 트리거: Cron 50개 초과 + 정확도 문제
- NFR-COST.3: Redis 추가 의존성 금지 (AP-5 비용 상한)

**범위**:
- pgmq: 초당 메시지 처리량 벤치마크 (PG 단일 노드 기준)
- BullMQ + Redis: 동일 워크로드 벤치마크
- 재시도 정확도 비교 (5회 실패 후 dead-letter queue 전환)
- Upstash Redis 무료 플랜(10,000 요청/일)으로 BullMQ 운영 가능한지 비용 검토

**성공 기준 (BullMQ Go)**:
```
- pgmq 처리량 < 100 msg/s (운영 요건 미달)
- AND BullMQ 처리량 ≥ 1,000 msg/s
- AND Upstash 무료 플랜으로 운영 가능 (일 처리량 < 10,000)
- AND 재시도 정확도 차이 > 10배

[pgmq 유지]
- pgmq 처리량 ≥ 500 msg/s → ADR-012 현상 유지
```

**실행 시점 트리거**: Phase 20 Data API 구현 중 pgmq 성능 한계 실측 후 발동. 선제 실행 불필요.

**반영 위치**: ADR-012 재검토 → pgmq 유지 확정 또는 BullMQ 도입 ADR 신규

**kdyspike 명령어**:
```bash
/kdyspike --full "pgmq vs BullMQ 처리량 + 재시도 정확도 벤치마크" \
  --max-hours 5 \
  --output "docs/research/spikes/spike-021-bullmq-pgmq-result.md"
```

---

## 6. SP-022: wal-g 100GB 복원 속도 실측

### 6.1 질문과 배경

**핵심 질문**: wal-g 백업에서 100GB 데이터셋을 복원할 때, 50MB/s 가정(DQ-4.22)이 실제 Backblaze B2 환경에서 달성 가능한가? RTO 30분 목표가 유효한가?

**배경**:
- ADR-005: "백업 = wal-g + Backblaze B2"
- DQ-4.22: "복원 미리보기의 시간 추정 50MB/s 가정이 적절한가? 잠정답변: 첫 실제 복원 후 측정치로 보정"
- NFR-BACKUP.8: RTO 30분 목표
- `02-architecture/13-db-ops-blueprint.md` §복원 UI: "50MB/s 가정으로 추정 시간 표시"

**범위**:
- Backblaze B2 → WSL2 다운로드 실측 속도 (미국 서버 기준)
- 100GB 데이터셋: wal-g `backup-fetch` 실제 소요 시간 측정
- PITR 복원: base + WAL fetch 합산 시간
- B2 → B2 동일 리전 vs 외부 리전 속도 차이

**성공 기준 (Go — 50MB/s 가정 유효)**:
```
- B2 다운로드 실속도 ≥ 40MB/s (가정 대비 80%)
- 100GB 복원 완료 시간 ≤ 42분 (RTO 30분 + 20% 여유)
- PITR base + WAL fetch 합산 ≤ 30분

[No-Go — RTO 재조정 필요]
- 실속도 < 20MB/s → RTO 60분으로 완화 또는 B2 리전 변경
```

**실행 시점**: Phase 20 DB Ops 구현 착수 2주 전. 우선 세트 결과와 무관.

**반영 위치**: ADR-005 §결과 보완 "RTO 실측값 반영", `13-db-ops-blueprint.md` §복원 UI 수정

**kdyspike 명령어**:
```bash
/kdyspike --full "wal-g 100GB B2 복원 속도 실측 + RTO 검증" \
  --max-hours 6 \
  --output "docs/research/spikes/spike-022-walg-restore-result.md"
```

---

## 7. SP-023: FIDO Metadata Service 통합 경로

### 7.1 질문과 배경

**핵심 질문**: FIDO MDS(Metadata Service)를 통합하여 WebAuthn 인증기 메타데이터 검증을 추가할 때, 구현 경로와 공수는 어떻게 되는가? (+2점 보너스)

**배경**:
- ADR-007: "TOTP + WebAuthn + Rate Limit 3종 전부 동시 채택"
- DQ-AA-3: "FIDO MDS 통합으로 인증기 메타데이터 검증? (+2점 보너스) — Phase 17 이후 검토"
- NFR-SEC.15: 인증기 메타데이터 검증 보안 강화 요건
- @simplewebauthn/server: FIDO MDS 통합 공식 지원 여부 확인 필요

**범위**:
- FIDO Alliance MDS3 API 접근 방식 (https://mds.fidoalliance.org/)
- @simplewebauthn/server의 `MetadataService` 클래스 사용법
- MDS 주기적 갱신(30일) cron 구현 공수
- 양평 대시보드 실제 운영 인증기(Chrome, Safari, Touch ID) 메타데이터 조회 성공 여부

**성공 기준 (Go)**:
```
- FIDO MDS3 API 접근 성공 (인증 필요 없는 공개 API)
- @simplewebauthn/server MetadataService 통합 동작 확인
- 주요 인증기 (Chrome/Edge passkey, Touch ID) 메타데이터 조회 성공
- 구현 공수 < 15h

[No-Go]
- MDS API 접근 실패 또는 주요 인증기 미등록
- 구현 공수 > 30h
```

**실행 시점**: Phase 15 WebAuthn 안정화 + 2주 후. Phase 17 완료 전 보너스 점수 확보 목적.

**반영 위치**: ADR-007 §결과 보완 "FIDO MDS 보너스 구현", `03-auth-advanced-blueprint.md` §MDS 통합

**kdyspike 명령어**:
```bash
/kdyspike --full "FIDO MDS3 통합 경로 검증 — @simplewebauthn MetadataService" \
  --max-hours 4 \
  --output "docs/research/spikes/spike-023-fido-mds-result.md"
```

---

## 8. SP-024: WebAuthn Conditional UI 브라우저 호환성 매트릭스

### 8.1 질문과 배경

**핵심 질문**: WebAuthn Conditional UI(autofill 기반 패스키 제안)가 양평 대시보드의 주요 접속 브라우저(Chrome, Safari iOS, Edge)에서 실제로 동작하는가?

**배경**:
- ADR-007: "WebAuthn + TOTP 동시 채택"
- DQ-AA-9: "WebAuthn Conditional UI(autofill) 활성화 시점? 잠정답변: Phase 17+2주"
- NFR-UX.8: Conditional UI UX 지원 요건
- @simplewebauthn/browser: `startAuthentication({ useBrowserAutofill: true })` API

**범위**:
- Chrome 130+, Safari 18+ iOS, Edge 130+ 각각 Conditional UI 지원 여부
- `autocomplete="username webauthn"` input 속성 + `PublicKeyCredentialRequestOptions`
- 패스키가 저장된 디바이스와 패스키 없는 디바이스에서의 UX 차이
- WSL2 개발 환경에서 HTTPS 없이 Conditional UI 테스트 가능한지 확인 (localhost 예외)

**성공 기준 (Go)**:
```
- Chrome 130+: Conditional UI 정상 동작
- Safari iOS 18+: Conditional UI 정상 동작
- Edge 130+: Conditional UI 정상 동작
- 패스키 없는 디바이스: 폴백 UI 자동 전환 (오류 없음)

[부분 Go]
- Chrome만 동작 → Chrome 우선 출시 + Safari/Edge는 조건부 비활성화
```

**실행 시점**: SP-023 완료 후 (FIDO MDS 통합 여부에 따라 Conditional UI 활성화 조건 달라짐). Phase 17 완료 + 2주 후.

**반영 위치**: ADR-007 §결과 보완, `03-auth-advanced-blueprint.md` §Conditional UI 브라우저 지원 매트릭스

**kdyspike 명령어**:
```bash
/kdyspike --full "WebAuthn Conditional UI 브라우저 호환성 매트릭스 (Chrome/Safari/Edge)" \
  --max-hours 3 \
  --output "docs/research/spikes/spike-024-conditional-ui-result.md"
```

---

## 9. SP-025: splinter 38룰 PG 버전 호환 포팅

### 9.1 질문과 배경

**핵심 질문**: Supabase splinter의 38개 PL/pgSQL 룰을 TypeScript로 포팅할 때, PostgreSQL 버전 간 호환성 문제는 무엇이며 포팅 가능한 룰 수는 몇 개인가?

**배경**:
- ADR-011: "Layer 3: splinter 38룰 Node TS 포팅 (런타임 RLS 누락/느린 쿼리/인덱스 제안)"
- DQ-ADV-1: "Postgres 마이그레이션 시점? 현행 SQLite, P0 보안 룰 절반이 Postgres 전용"
- ADR-011 §재검토 트리거 1: "splinter 룰 추가 업스트림 (> 50룰) → 포팅 비용 재평가"
- `docs/research/spikes/spike-005-advisors.md`: schemalint Layer 1 검증 완료

**범위**:
- splinter 38룰 전체 목록 분석 (PG 15/16 전용 vs 공통)
- TS 포팅 가능 룰 수 산정 (PL/pgSQL → Node.js 쿼리 변환)
- PG 16 vs PG 17 간 system catalog 차이가 포팅 룰에 미치는 영향
- P0 보안 룰 10개 우선 포팅 가능 여부 확인

**성공 기준 (Go)**:
```
- 38룰 중 ≥ 25룰 PG 15/16 공통 호환 (PG 전용 룰 포팅 가능)
- P0 보안 룰 10개 TS 포팅 완료 (개념 증명 수준)
- PG 16 → 17 마이그레이션 시 룰 수정 필요 항목 < 5개
- 포팅 총 공수 < 80h (ADR-011 §결과 이내)

[No-Go]
- P0 룰 중 PG 전용 의존성이 > 50% → Layer 3 범위 축소 후 재설계
```

**실행 시점**: SP-015 완료 후 SQLite→PG 이전 결정 확정 시. Phase 20 Advisors 구현 착수 4주 전.

**반영 위치**: ADR-011 §결과 보완, `02-architecture/11-advisors-blueprint.md` §splinter 포팅 범위 확정

**kdyspike 명령어**:
```bash
/kdyspike --full "splinter 38룰 PG 호환성 분석 + P0 룰 10개 TS 포팅 PoC" \
  --max-hours 8 \
  --output "docs/research/spikes/spike-025-splinter-porting-result.md"
```

---

## 10. SP-026: presence_diff 알고리즘 재구현 검증

### 10.1 질문과 배경

**핵심 질문**: SP-013에서 캡처한 `presence_diff` 메시지 구조를 기반으로, supabase-realtime 포팅 코드의 presence 상태 관리 알고리즘이 원본과 동일하게 동작하는가?

**배경**:
- ADR-010: "supabase-realtime 포팅 — Channel 계층"
- DQ-RT-3: "`@supabase/realtime-js`의 `presence_diff` 메시지 구조 정확도 검증" — SP-013 완료 후 심화
- `02-architecture/11-realtime-blueprint.md` §Presence 상태 관리

**범위**:
- SP-013 결과의 presence_diff 구조를 기반으로 TypeScript 알고리즘 구현
- 5개 시나리오 검증: (1) 사용자 join (2) 사용자 leave (3) 동시 join/leave (4) 네트워크 단절 후 재연결 (5) 동일 사용자 다중 탭
- 원본 supabase-realtime Elixir 코드와 동작 비교

**성공 기준 (Go)**:
```
- 5개 시나리오 모두 원본과 동일한 presence_diff 이벤트 발생
- 네트워크 재연결 후 presence 상태 일관성 유지
- 50 동시 접속자 presence 업데이트 p95 < 100ms

[No-Go]
- 3개 이상 시나리오 불일치 → 원본 Elixir 코드 추가 분석 필요
```

**실행 시점**: SP-013 완료 후 즉시. Phase 19 Realtime 구현 착수 전.

**반영 위치**: ADR-010 §결과 보완, `11-realtime-blueprint.md` §Presence 알고리즘 확정

**kdyspike 명령어**:
```bash
/kdyspike --full "presence_diff 알고리즘 TypeScript 재구현 + 5 시나리오 검증" \
  --max-hours 5 \
  --output "docs/research/spikes/spike-026-presence-diff-result.md"
```

---

## 11. SP-027: PG 18 마이그레이션 영향 분석

### 11.1 질문과 배경

**핵심 질문**: PostgreSQL 18 출시 시 `idle_replication_slot_timeout` 기능을 활용하면 현재 자체 cron 기반 슬롯 관리가 불필요해지는가? 마이그레이션 영향 범위는?

**배경**:
- DQ-RT-6: "PG 18 `idle_replication_slot_timeout` 가용 시까지 대기 vs PG 17에서 자체 cron 유지?"
- ADR-010 §재검토 트리거 1: "PostgreSQL 18+에서 wal2json 비호환 발생"
- `02-architecture/11-realtime-blueprint.md` §슬롯 관리

**범위**:
- PG 18 RC에서 `idle_replication_slot_timeout` 파라미터 동작 확인
- wal2json 확장 PG 18 호환성 확인
- Prisma 7 → PG 18 드라이버 호환성 확인
- 현재 자체 cron 슬롯 관리 코드 제거 가능 여부

**성공 기준 (마이그레이션 Go)**:
```
- PG 18에서 wal2json 정상 동작
- `idle_replication_slot_timeout` 설정으로 슬롯 자동 정리 확인
- Prisma 7 PG 18 드라이버 호환성 확인
- 자체 cron 슬롯 관리 코드 제거 가능 (공수 절감)

[PG 17 유지]
- wal2json PG 18 비호환 → PG 17 LTS 유지 + ADR-010 재검토 트리거 기록
```

**실행 시점**: PG 18 RC 공식 릴리스 후 (예상 2026년 하반기). Phase 22 전.

**반영 위치**: ADR-010 §재검토 기록, `11-realtime-blueprint.md` §PG 버전 정책 업데이트

**kdyspike 명령어**:
```bash
/kdyspike --micro "PG 18 wal2json 호환성 + idle_replication_slot_timeout 동작 확인" \
  --max-hours 4 \
  --output "docs/research/spikes/spike-027-pg18-migration-result.md"
```

---

## 12. SP-028: Capacitor iOS/Android 인증 토큰 저장 패턴

### 12.1 질문과 배경

**핵심 질문**: Capacitor 모바일 앱에서 JWKS를 빌드 타임 inline할지 런타임 fetch할지? 그리고 JWT access/refresh 토큰을 iOS Keychain / Android Keystore에 안전하게 저장하는 패턴은?

**배경**:
- DQ-12.5: "Capacitor 앱이 JWKS를 빌드 타임 inline할지, 런타임 fetch할지? 잠정답변: 빌드 타임 inline + grace"
- ADR-013: "JWKS jose ES256 키쌍"
- ADR-017: "OAuth Providers Phase 18+ 조건부 도입"
- ADR-022 예상 (Capacitor 모바일 클라이언트 지원 여부)

**범위**:
- Capacitor v7 + @capacitor-community/http 오프라인 환경 JWKS 접근 방식
- iOS: SecureStorage 플러그인 + Keychain 토큰 저장
- Android: EncryptedSharedPreferences + Keystore 토큰 저장
- 토큰 갱신 시 grace 기간(inline JWKS가 구 키 기준이면 검증 실패 위험)

**성공 기준 (Go)**:
```
- iOS Keychain 토큰 저장 성공 + 앱 재시작 후 복원 성공
- Android Keystore 토큰 저장 성공 + 앱 재시작 후 복원 성공
- 오프라인 환경에서 inline JWKS로 JWT 검증 성공
- 키 회전 grace 24시간 이내 자동 갱신

[No-Go]
- iOS/Android 구현 중 하나라도 Keychain/Keystore 연동 실패
- 오프라인 검증 불가 → 웹 전용 유지 결정
```

**실행 시점 트리거**: 모바일 앱 개발 결정 확정 시. Phase 22 또는 비즈니스 요건 변경 시.

**반영 위치**: ADR-013 §JWKS 모바일 확장, ADR-017 §Capacitor 도입 조건, ADR-023 예상 신규

**kdyspike 명령어**:
```bash
/kdyspike --full "Capacitor iOS/Android JWT 토큰 저장 + JWKS inline 패턴 검증" \
  --max-hours 5 \
  --output "docs/research/spikes/spike-028-capacitor-token-result.md"
```

---

## 13. SP-029: Docker 전환 TCO 검토

### 13.1 질문과 배경

**핵심 질문**: ADR-015의 Docker 이행 조건 4개 중 1개 이상 충족 시, 현재 PM2 native 배포에서 Docker Compose로 전환하는 총 소유 비용(TCO)은 얼마인가?

**배경**:
- ADR-015: "네이티브 PM2 cluster:4 + Capistrano-style symlink 배포 — Docker 미사용(조건 0개 충족)"
- DQ-OPS-1: "self-hosted runner를 Docker isolated로 전환할 것인가? 잠정답변: No"
- ADR-015 §재검토 트리거 (Docker 이행 조건): 월 트래픽 > 100만 / 팀 > 2명 / 다중 환경 / B2B SaaS

**범위**:
- Docker Compose 8~10 컨테이너 구성 설계 (Next.js + PG + SeaweedFS + Realtime + ...)
- 컨테이너화 전환 공수: Dockerfile 작성 + compose 설계 + 볼륨 마운트
- WSL2에서 Docker Desktop vs Docker Engine(native) 성능 비교
- PM2 vs Docker 운영 부담 1인 기준 비교

**성공 기준 (Docker 전환 Go)**:
```
- Docker 이행 조건 ≥ 2개 충족
- 전환 총 공수 < 80h
- Docker 운영 부담이 PM2와 동등하거나 낮음
- 성능 저하 < 10% (컨테이너 오버헤드)

[PM2 유지]
- Docker 이행 조건 < 1개 충족 → ADR-015 현상 유지
```

**실행 시점 트리거**: ADR-015 재검토 트리거 4개 중 1개 이상 발동 시. Phase 22 이후 또는 비즈니스 환경 변화 시.

**반영 위치**: ADR-015 재검토 → PM2 유지 확정 또는 Docker 전환 ADR 신규

**kdyspike 명령어**:
```bash
/kdyspike --full "Docker Compose vs PM2 TCO 비교 — 전환 공수 + 운영 부담 + 성능" \
  --max-hours 3 \
  --output "docs/research/spikes/spike-029-docker-tco-result.md"
```

---

## 14. SP-030: Node 버전 업그레이드 정책

### 14.1 질문과 배경

**핵심 질문**: Node 20 LTS → Node 22 LTS 전환 시 릴리스 격리(.nvmrc)만으로 충분한가? 주요 native 모듈(better-sqlite3, @node-rs/argon2, isolated-vm v6)이 Node 22에서 ABI 충돌 없이 재빌드되는가?

**배경**:
- DQ-OPS-3: "Node 버전 전환 시 (20→22) release 수준 격리로 충분 vs Docker 전환? 잠정답변: release 격리로 충분"
- ADR-015: "PM2 cluster:4 + 네이티브 Node.js" — Docker 미사용
- ADR-009: isolated-vm v6 (SP-012에서 Node 22 호환성 검증 예정)
- ADR-006: @node-rs/argon2 (SP-011에서 검증 예정)

**범위**:
- Node 20 → 22 LTS 전환 시 nvm 설치 절차 및 PM2 재시작 방법
- better-sqlite3 Node 22 네이티브 rebuild 성공 여부
- @node-rs/argon2 Node 22 ABI 호환성
- isolated-vm v6 Node 22 ABI 호환성 (SP-012 결과 활용)
- `npm rebuild` vs 전체 재설치 비교

**성공 기준 (release 격리 Go)**:
```
- better-sqlite3: Node 22에서 npm rebuild 성공
- @node-rs/argon2: Node 22에서 정상 동작 (SP-011 결과 재확인)
- isolated-vm v6: Node 22에서 정상 동작 (SP-012 결과 재확인)
- PM2 reload 후 전체 native 모듈 정상 작동
- 전환 소요 시간 < 30분

[Docker 전환 필요]
- native 모듈 ≥ 2개 Node 22 ABI 불호환 → SP-029 Docker TCO 검토 착수
```

**실행 시점**: Node 20 LTS EOL 6개월 전 (예상 2026년 10월). SP-011, SP-012 완료 후.

**반영 위치**: ADR-015 §운영 정책 보완, `.nvmrc` 업데이트

**kdyspike 명령어**:
```bash
/kdyspike --full "Node 20 → 22 LTS 전환 — native 모듈 ABI 호환성 + PM2 reload" \
  --max-hours 2 \
  --output "docs/research/spikes/spike-030-node-upgrade-result.md"
```

---

## 15. SP-031: DR 호스트 스펙 + 동기화 방식

### 15.1 질문과 배경

**핵심 질문**: 2번째 호스트(DR)를 추가할 때 최소 스펙과 동기화 방식(wal-g 복원 vs PostgreSQL 스트리밍 복제)은 무엇인가?

**배경**:
- DQ-OPS-4: "2번째 호스트(DR) 추가 시점? 잠정답변: 현 시점 불필요, Cloudflare Tunnel replica로 향후 확장 경로 유지"
- ADR-015: "단일 호스트 PM2 native — 수평 확장 필요 시 재설계"
- NFR-AVAIL.1: 월간 가용성 99.5% 목표

**범위**:
- DR 호스트 최소 스펙: CPU/RAM/디스크 요건 산정
- 동기화 방식 A: wal-g 복원 기반 (RPO 60초, RTO 30분)
- 동기화 방식 B: PG 스트리밍 복제 (RPO < 1초, RTO < 5분, 운영 부담 증가)
- Cloudflare Tunnel DR 설정 (서브도메인 자동 전환)
- DR 비용: WSL2 PC 추가 vs VPS(Hetzner €3.3/월)

**성공 기준 (DR 추가 Go)**:
```
- DR 이행 조건 충족 (트래픽 > 10만/월 또는 가용성 99.5% 미달)
- 동기화 방식 선정 (wal-g 또는 스트리밍)
- DR 전환 소요 시간 < RTO 목표 이내
- 월 비용 < $10 (Hetzner CX21 기준)

[단일 호스트 유지]
- 이행 조건 미충족 → ADR-015 현상 유지
```

**실행 시점 트리거**: 월간 트래픽 10만 초과 또는 장애 발생 후. Phase 22 이후.

**반영 위치**: ADR-015 재검토 → DR 추가 ADR 신규 또는 현상 유지

**kdyspike 명령어**:
```bash
/kdyspike --full "DR 호스트 스펙 산정 + wal-g vs 스트리밍 복제 동기화 방식 비교" \
  --max-hours 3 \
  --output "docs/research/spikes/spike-031-dr-host-result.md"
```

---

## 16. 지연 세트 실행 시점 매핑

각 스파이크가 어느 Phase 직전에 실행되어야 하는지 명시한다.

| 실행 Phase | 스파이크 | 공수(h) | 합계(h) |
|-----------|---------|---------|---------|
| Phase 18 직전 (SQL+Table Editor) | SP-023 FIDO MDS | 4 | |
| Phase 18 직전 | SP-024 Conditional UI | 3 | |
| Phase 18 직전 (조건부) | SP-017 AG Grid 비교 | 6 | |
| Phase 18 직전 (조건부) | SP-018 Enterprise 분석 | 2 | **15h** |
| Phase 19 직전 (Edge+Realtime) | SP-026 presence_diff | 5 | **5h** |
| Phase 20 직전 (Schema+DBOps+Advisors) | SP-019 Schema Viz 임베드 | 3 | |
| Phase 20 직전 | SP-020 pg_cron 비용 | 4 | |
| Phase 20 직전 (조건부) | SP-021 BullMQ 벤치마크 | 5 | |
| Phase 20 직전 | SP-022 wal-g 복원 | 6 | |
| Phase 20 직전 | SP-025 splinter 포팅 | 8 | |
| Phase 20 직전 | SP-030 Node 버전 | 2 | **28h** |
| Phase 22 직전 (마무리) | SP-027 PG 18 | 4 | |
| Phase 22 직전 (조건부) | SP-028 Capacitor | 5 | |
| Phase 22 직전 (조건부) | SP-029 Docker TCO | 3 | |
| Phase 22 직전 (조건부) | SP-031 DR 호스트 | 3 | **15h** |

**총 지연 세트 공수**: 63h (조건부 포함) / 조건부 제외 시 41h

---

## 17. 조건부 스파이크 트리거 요약

"특정 트리거 발동 시에만 실행"하는 조건부 스파이크 목록.

| 스파이크 | 트리거 조건 | 트리거 미발동 시 처리 |
|---------|-----------|------------------|
| SP-017 AG Grid | TanStack v8 p95 > 1.2s (Phase 18 실측) | 스킵, ADR-002 현상 유지 |
| SP-018 Enterprise | SP-017 No-Go 판정 | 스킵, ADR-002 현상 유지 |
| SP-020 pg_cron | node-cron 잡 수 ≥ 30개 | 스킵, ADR-005 현상 유지 |
| SP-021 BullMQ | pgmq 처리량 < 100 msg/s 실측 | 스킵, ADR-012 현상 유지 |
| SP-028 Capacitor | 모바일 앱 개발 결정 | 스킵, 웹 전용 유지 |
| SP-029 Docker | ADR-015 이행 조건 ≥ 1개 충족 | 스킵, PM2 native 유지 |
| SP-031 DR 호스트 | 트래픽 > 10만/월 또는 장애 발생 | 스킵, 단일 호스트 유지 |

**조건부 스파이크 총 7건 공수**: 31h — 트리거 미발동 시 전액 절감

---

> **지연 세트 끝.** Wave 5 · P1 · 2026-04-18
> SP-017 ~ SP-031 · 15건 · ~63h · Phase 18~22 각 착수 전 실행 목표
