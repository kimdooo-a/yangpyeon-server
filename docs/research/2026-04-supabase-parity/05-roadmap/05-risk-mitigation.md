# 05. 리스크 완화 계획 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> Wave 5 · Tier 1 · R3 에이전트 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W5-R3)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [../00-vision/03-non-functional-requirements.md](../00-vision/03-non-functional-requirements.md) · [../00-vision/04-constraints-assumptions.md](../00-vision/04-constraints-assumptions.md) · [../00-vision/08-security-threat-model.md](../00-vision/08-security-threat-model.md) · [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md)
> 관련 ADR: ADR-001~018 (전체) · CON-1~12 · ASM-1~12

---

## 0. 문서 구조

```
§1.  리스크 분류 체계 — 5 카테고리 × 3 심각도 매트릭스
§2.  리스크 레지스터 테이블 — R-01 ~ R-30 (30건)
§3.  Top 10 Critical Risks 상세 — 스코어 15+ 리스크
§4.  기술 리스크 — Wave 1-4 식별 기술 불확실성
§5.  일정 리스크 — 1인 운영 버퍼 + Phase 지연 시나리오
§6.  운영 리스크 — 1인 운영 번아웃 + 외부 의존
§7.  보안 리스크 — STRIDE 잔여 위협 + 자체호스팅 특화 5
§8.  재무 리스크 — B2 비용 초과 + AI API 폭증
§9.  리스크 모니터링 대시보드 설계 (/admin/risk-dashboard)
§10. 리스크 재평가 주기 — Phase 완료 시 + 분기별
§11. 비즈니스 연속성 계획 (BCP) — 1인 운영자 사고 시 DR
부록 Z. 근거 인덱스
```

---

## 1. 리스크 분류 체계

### 1.1 5 카테고리 정의

| 카테고리 코드 | 명칭 | 범위 |
|------------|------|------|
| **TECH** | 기술 리스크 | 채택 기술 스택의 불확실성, 라이브러리 호환성, 미검증 아키텍처 |
| **SCHED** | 일정 리스크 | 1인 운영 공수 추정 오류, Phase 지연, 의존성 블로킹 |
| **OPS** | 운영 리스크 | 번아웃, 외부 서비스 장애, 인프라 단일 실패점 |
| **SEC** | 보안 리스크 | STRIDE 위협, 자체호스팅 특화 취약점, 시크릿 유출 |
| **FIN** | 재무 리스크 | 비용 초과, 예산 변동, ROI 저하 |

### 1.2 3 심각도 × 확률 매트릭스

확률(P) 1-5 × 영향(I) 1-5 = 스코어 1-25

| 스코어 | 심각도 | 대응 우선순위 |
|-------|-------|------------|
| **20-25** | Critical (위기) | 즉시 완화 조치, 프로젝트 차단 가능 |
| **15-19** | High (높음) | Phase 착수 전 완화 계획 수립 필수 |
| **10-14** | Medium (중간) | 모니터링 + 완화 병행 |
| **5-9** | Low (낮음) | 정기 재평가, 기회적 완화 |
| **1-4** | Negligible (무시) | 수용 (Accept) |

### 1.3 확률/영향 척도 정의

**확률 (P)**
- 5: 80%+ (Phase 내 발생 거의 확실)
- 4: 60-79% (발생 가능성 높음)
- 3: 40-59% (반반)
- 2: 20-39% (가능성 낮음)
- 1: 5-19% (거의 발생 안 함)

**영향 (I)**
- 5: 프로젝트 중단 또는 전체 재설계 필요
- 4: 2개 이상 Phase 지연 또는 핵심 기능 제거
- 3: 1개 Phase 지연 또는 아키텍처 부분 변경
- 2: 1-2주 지연 또는 기능 축소
- 1: 수일 지연 또는 보완으로 해결 가능

---

## 2. 리스크 레지스터 테이블

> 총 30건 (TECH 9건 / SCHED 5건 / OPS 7건 / SEC 6건 / FIN 3건)

| ID | 리스크명 | 카테고리 | 확률(P) | 영향(I) | 스코어 | 발생 Phase | 완화 전략 요약 | 관련 ADR/CON |
|----|---------|---------|--------|--------|-------|-----------|-------------|------------|
| R-01 | isolated-vm v6 Node 호환성 파단 | TECH | 3 | 5 | **15** | 19 | Deno 사이드카로 대체 라우팅; 3층 decideRuntime 우선 | ADR-009 |
| R-02 | wal2json 논리 슬롯 소진 | TECH | 3 | 4 | **12** | 19 | 슬롯 2개 분리 운영(CDC/replica); 모니터링 알림 | ADR-010 |
| R-03 | SeaweedFS 50GB 스파이크 장애 | TECH | 2 | 5 | **10** | 17 | spike-007 사전 검증; B2 오프로드 자동 티어링 | ADR-008 |
| R-04 | pg_graphql 도입 트리거 미조건 | TECH | 3 | 2 | **6** | 21+ | REST+pgmq로 80~85점 유지; 4 트리거 정량 모니터링 | ADR-016 |
| R-05 | wal-g B2 아카이브 실패 | TECH | 2 | 4 | **8** | 17 | 알림 + 수동 pg_dump 폴백; daily 검증 크론 | ADR-005 |
| R-06 | argon2 bcrypt 마이그레이션 비용 폭발 | TECH | 2 | 3 | **6** | 17 | CON-10 범위 외로 동결; bcrypt-cost=12 강화로 대체 | CON-10 |
| R-07 | Prisma 7 breaking change | TECH | 2 | 4 | **8** | 15+ | Prisma changelog 구독; 테스트 커버리지 85%+ 유지 | ADR-006 |
| R-08 | Node.js LTS 단절 (v22 → v24) | TECH | 2 | 3 | **6** | 전 Phase | package.json engines 고정; nvm LTS 전환 프로토콜 | — |
| R-09 | ua-parser-js CVE 재발 | TECH | 2 | 3 | **6** | 16 | Dependabot 주간 스캔; ua-parser-js v1.0+ 고정 | ADR-007 |
| R-10 | 1인 운영자 번아웃 → 프로젝트 중단 | SCHED | 3 | 5 | **15** | 전 Phase | Phase당 20% 버퍼; 월 80h 상한 설정; BCP-1 발동 | CON-3 |
| R-11 | Phase 15-17 MVP 지연 (22+40+60=122h 초과) | SCHED | 3 | 4 | **12** | 15-17 | 스코프 컷 프로토콜; MVP 최소 기능셋 정의 | ADR-007 |
| R-12 | Auth Advanced (22h) 과소 추정 | SCHED | 3 | 3 | **9** | 15 | WebAuthn 스파이크(spike-009) 선행; 30h 버퍼 확보 | ADR-007 |
| R-13 | SQL Editor 320h 추정 오차 | SCHED | 4 | 3 | **12** | 18 | 4단계 분할(14c~14f); 14c-α 완료 후 재추정 | ADR-003 |
| R-14 | 의존성 블로킹 (Auth Core → Auth Advanced) | SCHED | 2 | 3 | **6** | 15-17 | 의존성 DAG 유지; 선행 완료 체크리스트 | ADR-010 |
| R-15 | Cloudflare Tunnel 장기 장애 | OPS | 2 | 5 | **10** | 전 Phase | cloudflared watchdog; 5분 재시작; 장애 알림 | CON-2 |
| R-16 | Cloudflare 계정 탈취 | OPS | 1 | 5 | **5** | 전 Phase | 2FA 필수; API 토큰 최소 권한; 정기 감사 | CON-2 |
| R-17 | WSL2 파일시스템 손상 | OPS | 2 | 4 | **8** | 전 Phase | 주간 pg_dump + B2 백업; WSL 익스포트 월간 | CON-1 |
| R-18 | PM2 cluster 분산 상태 불일치 | OPS | 2 | 3 | **6** | 전 Phase | PM2 health API 5초 폴링; graceful reload 강제 | ADR-015 |
| R-19 | B2 외부 서비스 종료/가격 변경 | OPS | 1 | 4 | **4** | 전 Phase | rclone S3 표준 API로 교체 가능; 탈출 테스트 연간 | ADR-008 |
| R-20 | 개인 PC 하드웨어 고장 (SPOF) | OPS | 1 | 5 | **5** | 전 Phase | B2 백업 주 1회; restore 훈련 분기 1회 | CON-1 |
| R-21 | KT 가정용 회선 장기 단절 | OPS | 1 | 4 | **4** | 전 Phase | Cloudflare 상태 모니터링; 모바일 핫스팟 단기 폴백 | CON-2 |
| R-22 | MASTER_KEY 평문 유출 | SEC | 1 | 5 | **5** | 전 Phase | chmod 0640; PM2 env_file 격리; secrets.env 백업 암호화 | ADR-013 |
| R-23 | isolated-vm VM escape | SEC | 1 | 5 | **5** | 19 | isolated-vm v6 공식 보안 패치 추적; 권한 최소화 | ADR-009 |
| R-24 | JWT 알고리즘 혼용 공격 (STRIDE S1) | SEC | 2 | 4 | **8** | 15 | jose `algorithms: ['ES256']` 명시; JWKS alg 검증 | ADR-006 |
| R-25 | XSS → 세션 탈취 (STRIDE S2) | SEC | 2 | 4 | **8** | 16 | CSP 헤더; HttpOnly 쿠키; revokedAt 구현 | ADR-006 |
| R-26 | SQL 인젝션 (STRIDE T3) | SEC | 2 | 4 | **8** | 18 | Prisma parameterized query; 읽기 전용 PG 역할 | ADR-003 |
| R-27 | AI 프롬프트 인젝션 (STRIDE 자체호스팅 특화 AH-4) | SEC | 3 | 3 | **9** | 21 | 시스템 프롬프트 고정; DB 직접 접근 차단; 출력 필터 | ADR-014 |
| R-28 | B2 스토리지 비용 $10/월 초과 | FIN | 2 | 3 | **6** | 17+ | 월 $10 가드 알림; 50GB SeaweedFS 로컬 티어 유지 | NFR-COST |
| R-29 | AI API 비용 $5/월 초과 | FIN | 3 | 2 | **6** | 21+ | DQ-12.3 MASTER_KEY 키 사용; 일일 $0.3 알림 | ADR-014 |
| R-30 | Anthropic API 가격 정책 변경 | FIN | 2 | 2 | **4** | 21+ | BYOK 키이므로 사용자 통제; 모델 교체(Haiku→다른 모델) | ADR-014 |

**스코어 분포**: Critical(≥20): 0건 / High(15-19): 2건 / Medium(10-14): 4건 / Low(5-9): 18건 / Negligible(1-4): 6건

---

## 3. Top 10 Critical Risks 상세

> R-01, R-02, R-10, R-11, R-13, R-15, R-24, R-25, R-26, R-27 (스코어 8~15, 상위 10건)

---

### 3.1 R-01: isolated-vm v6 Node 호환성 파단 (스코어 15)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | TECH |
| 확률 × 영향 | 3 × 5 = **15 (High)** |
| 발생 Phase | Phase 19 (Edge Functions) |
| 관련 ADR | ADR-009 (3층 하이브리드) |

**원인 분석**

isolated-vm은 Node.js 내부 V8 임베딩 API에 직접 의존한다. Node.js 메이저 버전 업그레이드(예: v22→v24)나 V8 엔진 내부 ABI 변경 시 네이티브 모듈 재빌드 실패가 발생한다. Wave 1 deep-dive에서 "조건부 GO" 결론을 내렸으나, 미검증 영역으로 spike-005에서 심화 검증 필요.

**징후 식별**

- npm install 시 node-gyp 빌드 오류
- `isolated-vm` GitHub 이슈에 Node 버전 호환 리포트 집중
- Wave 1 DQ-1.4 답변: "v6 Node 22 LTS에서 동작 확인, v24 검증 예정"

**완화 전략**

1. **사전**: spike-005 (Edge Functions 심화)에서 Node 22 LTS + isolated-vm v6 통합 테스트 수행 (Phase 19 착수 최소 4주 전)
2. **실시간**: `decideRuntime()` 라우터에서 isolated-vm 실패 시 Deno 사이드카 자동 폴오버 (ADR-009 P0→P1 강등 라우팅)
3. **장기**: Node.js engines 필드를 `">=22.0.0 <24.0.0"`로 고정; 마이너 업데이트만 허용

**복구 절차**

1. isolated-vm 레이어를 `disabled` 플래그로 비활성화
2. Deno 사이드카를 P0 우선으로 승격
3. 기능 손실 범위 평가 후 사용자 알림 (Slack Webhook)
4. isolated-vm 패치 릴리스 추적 (GitHub Watch)

**모니터링 지표**

- `/api/edge-functions/health` 엔드포인트 성공률 ≥ 99.5%
- cold start p95 ≤ 50ms (NFR-PERF.4)
- 빌드 CI에서 isolated-vm import 테스트 통과 여부

---

### 3.2 R-02: wal2json 논리 슬롯 소진 (스코어 12)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | TECH |
| 확률 × 영향 | 3 × 4 = **12 (Medium)** |
| 발생 Phase | Phase 19 (Realtime) |
| 관련 ADR | ADR-010 (wal2json 하이브리드) |

**원인 분석**

PostgreSQL 기본 `max_replication_slots = 10`. 양평 대시보드는 wal2json CDC 슬롯 + standby 복제용으로 2개를 사용한다. 슬롯 누적(장애 후 미정리, 테스트 슬롯 잔류)으로 소진 시 WAL 파일이 무한 보존되어 디스크 풀이 발생한다.

**징후 식별**

- `pg_replication_slots` 테이블의 `active = false` 슬롯 증가
- WAL 디렉토리 크기 급증 (정상 대비 3배+)
- Realtime CDC 이벤트 수신 지연 (p95 > 400ms, NFR-PERF.3 위반)

**완화 전략**

1. `max_replication_slots = 5`로 명시 설정 (기본값 의존 제거)
2. 슬롯 자동 정리 크론: `node-cron`에서 비활성 슬롯 daily 검사 + 알림
3. 슬롯 네이밍 규칙: `ypb_cdc_main`, `ypb_cdc_replica` 고정 (패턴 외 슬롯 = 비정상)
4. WAL 디렉토리 크기 모니터링: 5GB 초과 시 Slack 알림

**복구 절차**

1. 비활성 슬롯 수동 삭제: `SELECT pg_drop_replication_slot('slot_name')`
2. WAL 보존 해제 후 pg_checkpoint 실행
3. wal2json 재구독 (Realtime 서비스 재시작)

**모니터링 지표**

- `pg_replication_slots` inactive 슬롯 수 ≤ 0 (알림 임계치: 1+)
- WAL 디렉토리 크기 < 3GB (알림: 5GB+)
- Realtime CDC 지연 p95 ≤ 200ms

---

### 3.3 R-10: 1인 운영자 번아웃 → 프로젝트 중단 (스코어 15)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SCHED |
| 확률 × 영향 | 3 × 5 = **15 (High)** |
| 발생 Phase | 전 Phase (특히 Phase 18 SQL Editor 320h 구간) |
| 관련 CON | CON-3 (1인 운영) |

**원인 분석**

총 공수 870h를 1인이 담당한다. 주당 20h 투입 시 약 43주(10개월) 소요. 이 기간 동안 개인 사정(휴가, 병가, 업무 과부하)으로 투입이 중단되거나 동기 부여 상실 시 프로젝트가 완전 중단될 수 있다. 1인 운영 프로젝트의 최대 리스크 집중점.

**징후 식별**

- 연속 2주 이상 커밋 없음
- 주당 투입 시간 8h 이하 지속
- 프로젝트 로그 현황(`docs/status/current.md`)에 세션 기록 공백

**완화 전략**

1. **버퍼 확보**: 각 Phase 공수 추정에 20% 버퍼 자동 포함 (예: Phase 15 22h → 27h 배정)
2. **월 상한 설정**: 월 80h 이상 투입 금지 (번아웃 방지)
3. **단계 분할**: 큰 Phase(SQL Editor 320h)는 주 1회 커밋 가능한 단위(14c-α, 14c-β 등)로 쪼개기
4. **휴식 트리거**: 연속 3주 풀 투입 후 1주 휴식 의무화
5. **BCP 발동**: 운영자 사고 시 BCP-1 프로토콜(§11 참조)

**복구 절차**

1. 현재 진행 Phase 상태 스냅샷 (`docs/status/current.md` 갱신)
2. 재개 프롬프트: `docs/handover/next-dev-prompt.md` 최신화
3. Wave 5 로드맵 재조정 (완료 Phase 고정, 남은 Phase 재배치)

**모니터링 지표**

- 주간 커밋 횟수 ≥ 1 (알림: 2주 공백)
- 월 투입 시간 집계 (`docs/logs/` 세션 기록 기반)
- 세션 로그 세션 간 간격 ≤ 14일

---

### 3.4 R-11: Phase 15-17 MVP 지연 (스코어 12)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SCHED |
| 확률 × 영향 | 3 × 4 = **12 (Medium)** |
| 발생 Phase | 15-17 (MVP 핵심 구간) |
| 관련 ADR | ADR-007 (Auth Advanced), ADR-013 (Observability) |

**원인 분석**

Phase 15(Auth Advanced 22h) + Phase 16(Observability/Ops 40h) + Phase 17(Auth Core/Storage 60h) = MVP 합산 122h. Wave 4 청사진에서 WBS 수준 태스크로 분해했지만, WebAuthn 통합(spike-009 미완), SeaweedFS 설치(spike-007 진행 중)의 실제 구현 복잡도가 추정을 초과할 가능성이 있다.

**징후 식별**

- Phase 15 20h 투입 후 TOTP UI 미완성 (50% 지연 신호)
- spike-009(WebAuthn) 결과에서 브라우저 호환 이슈 식별
- SeaweedFS 로컬 설치에서 WSL2 네트워크 이슈 반복

**완화 전략**

1. **스코프 컷 프로토콜**: Phase 15 지연 시 WebAuthn 제외 후 TOTP+TOTP 먼저 출시 (60점 → 75점으로 부분 달성)
2. **스파이크 선행**: spike-007(SeaweedFS), spike-009(TOTP/WebAuthn) 완료 후 Phase 착수
3. **조기 경고**: Phase 절반 진행 시점에 공수 대비 완료도 80% 미달이면 스코프 컷 발동

**복구 절차**

1. 현재 완료 기능 배포 (부분 출시)
2. 잔여 기능을 Phase N+1로 이월
3. 로드맵 재조정 (`05-roadmap/00-release-plan.md` 갱신)

**모니터링 지표**

- Phase별 완료도 주간 체크포인트 (번다운 차트)
- 공수 소진 대비 기능 완료도 비율 ≥ 0.8

---

### 3.5 R-13: SQL Editor 320h 추정 오차 (스코어 12)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SCHED |
| 확률 × 영향 | 4 × 3 = **12 (Medium)** |
| 발생 Phase | Phase 18 (SQL Editor) |
| 관련 ADR | ADR-003 (supabase-studio 패턴 차용) |

**원인 분석**

SQL Editor는 14 카테고리 중 단일 최대 공수(320h, 40일 = 전체 870h의 37%)를 차지한다. supabase-studio Apache-2.0 패턴 차용 + 자체 Plan Visualizer(D3) + Monaco 에디터 통합 + AI 자동완성의 복잡도가 추정 오차를 높인다. Wave 2 Agent-A의 1:1 비교에서도 "supabase-studio 직접 임베드 거부 → 패턴만 차용"이라는 전략이 추가 구현 비용을 수반한다.

**징후 식별**

- 14c-α (기본 Monaco + 쿼리 실행) 완료에 80h+ 소요 (추정 60h 대비 33% 초과)
- Plan Visualizer D3 렌더링 복잡도 예상 초과
- supabase-studio 패턴 차용 시 API 불일치 발견

**완화 전략**

1. **4단계 분할 고정**: 14c-α(기본) → 14c-β(AI) → 14d(고급) → 14f(보너스) 각 단계 독립 출시
2. **14c-α 완료 후 재추정**: 실제 코드량 기반으로 전체 320h 재산정
3. **보너스 기능 제거 우선**: 14f(보너스) 범위를 언제든 Won't로 전환 가능하도록 설계

**복구 절차**

1. 14c-α 완료 기준으로 나머지 단계 공수 재추정
2. 14f 보너스 스코프를 Phase 22(유지보수)로 이월
3. 전체 870h 재산정 후 로드맵 갱신

**모니터링 지표**

- 14c-α 완료 공수 vs 추정 60h 비율 (1.0 이상이면 전체 재추정)
- 각 단계(14c-β, 14d, 14f) 착수 전 공수 재검토 체크리스트 완료

---

### 3.6 R-15: Cloudflare Tunnel 장기 장애 (스코어 10)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | OPS |
| 확률 × 영향 | 2 × 5 = **10 (Medium)** |
| 발생 Phase | 전 Phase (운영 상시) |
| 관련 CON | CON-2 (Cloudflare Tunnel 의존) |

**원인 분석**

양평 대시보드는 Cloudflare Tunnel을 유일한 인터넷 진입점으로 사용(CON-2). Cloudflare 전역 장애(2021년 6월 사례 등), 터널 자격증명 만료, `cloudflared` 프로세스 크래시가 발생하면 외부 접근이 완전 차단된다. Wave 4 I2 에이전트에서 "QUIC→HTTP/2 강제 전환"으로 일부 안정화했지만 Cloudflare 자체 장애는 내부 통제 불가.

**징후 식별**

- `cloudflared` 프로세스 비정상 종료 (PM2 로그)
- Cloudflare 상태 페이지(cloudflarestatus.com) 인시던트 등록
- 외부 HTTP 모니터에서 5xx 연속 10회+

**완화 전략**

1. PM2 `cloudflared` 프로세스: `autorestart: true`, `max_restarts: 10`, `restart_delay: 5000`
2. PM2 health API에서 cloudflared 상태 30초 폴링 → 실패 시 Slack 즉시 알림
3. Cloudflare Status RSS 구독 (자동 알림)
4. 내부망 접근: WSL2 localhost:3000 직접 접근으로 운영 계속 가능 (외부 서비스만 불가)

**복구 절차**

1. `pm2 restart cloudflared` 즉시 실행
2. Cloudflare 대시보드에서 Tunnel 상태 확인
3. 30분 이상 장애 시 Cloudflare Status 인시던트 추적
4. 24시간+ 장애 시 BCP-2 발동(내부망 전용 운영 모드)

**모니터링 지표**

- cloudflared 프로세스 상태 `online` 유지율 ≥ 99.9%
- 외부 HTTP 모니터(UptimeRobot 등) 응답률 ≥ 99.5%
- Tunnel 재시작 횟수 < 3/일 (초과 시 원인 분석)

---

### 3.7 R-24: JWT 알고리즘 혼용 공격 (스코어 8)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SEC |
| 확률 × 영향 | 2 × 4 = **8 (Low-Medium)** |
| 발생 Phase | Phase 15-16 (Auth Core + JWKS 구현 시) |
| 관련 ADR | ADR-006 (jose JWT), ADR-013 (JWKS) |

**원인 분석**

STRIDE S1: 공격자가 `alg: "none"` 또는 HS256 JWT를 위조하여 관리자로 인증을 시도. Wave 3 보안 위협 모델(08-security-threat-model.md §2 S1)에서 "중-높음" 리스크로 분류. Phase 16에서 JWKS 구현 시 알고리즘 화이트리스트 설정 오류가 발생할 수 있다.

**징후 식별**

- 비정상 JWT 구조의 API 요청 (감사 로그에서 감지)
- `jwtVerify` 오류 급증 (정상 오류와 구분 필요)
- JWKS 엔드포인트에 알고리즘 외 토큰 검증 시도

**완화 전략**

1. `jose.jwtVerify(token, JWKS, { algorithms: ['ES256'] })` 명시적 고정
2. `alg: 'none'` 토큰 수신 즉시 403 + 감사 로그 기록
3. JWKS 엔드포인트에 `alg` 필드 포함 검증 테스트 (Phase 16 WBS 항목)
4. CI에서 JWT 알고리즘 화이트리스트 정적 분석 (ESLint 커스텀 룰)

**복구 절차**

1. 비정상 JWT 탐지 시 해당 세션 즉시 무효화 (revokedAt 갱신)
2. JWKS 키 긴급 회전 (30초 grace period 후 구 키 비활성화)
3. 감사 로그 분석으로 침해 범위 파악

**모니터링 지표**

- 감사 로그 `auth_failure_reason = 'invalid_algorithm'` 이벤트 수 ≤ 0 (0이어야 정상)
- JWKS `alg` 검증 테스트 CI 통과율 100%

---

### 3.8 R-25: XSS → 세션 탈취 (스코어 8)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SEC |
| 확률 × 영향 | 2 × 4 = **8 (Low-Medium)** |
| 발생 Phase | Phase 16 (Auth Core 보안 강화) |
| 관련 ADR | ADR-006 (jose JWT + 세션 관리) |

**원인 분석**

STRIDE S2: XSS 취약점을 통해 세션 쿠키 또는 Bearer 토큰을 탈취. Monaco 에디터, SQL 입력 필드, Table Editor 셀 편집 등 사용자 입력 영역이 다수 존재하며, Next.js SSR 환경에서도 CSP 미설정 시 인라인 스크립트 실행이 가능하다.

**징후 식별**

- CSP 위반 보고서 (report-uri 미설정 시 탐지 불가)
- 비정상 지역/UA에서의 세션 활성화
- tokenFamily 불일치 (ADR-006 revokedAt+tokenFamily 하이브리드 감지)

**완화 전략**

1. Next.js `headers()` CSP: `script-src 'self' 'nonce-{random}'` (인라인 스크립트 차단)
2. 세션 쿠키: `HttpOnly; Secure; SameSite=Strict`
3. tokenFamily 기반 리프레시 체인: 탈취된 토큰으로 refresh 시도 → 전체 세션 무효화
4. Monaco 에디터 샌드박스: `iframe sandbox` 격리 또는 DOMPurify 적용

**복구 절차**

1. tokenFamily 침해 탐지 시 해당 계정 전체 세션 즉시 만료
2. 관리자 Slack 알림 + 감사 로그 기록
3. CSP 위반 보고서 분석으로 공격 벡터 파악

**모니터링 지표**

- CSP 위반 보고서 수 (report-to 설정 후 추적)
- tokenFamily 침해 이벤트 수 ≤ 0

---

### 3.9 R-26: SQL 인젝션 (스코어 8)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SEC |
| 확률 × 영향 | 2 × 4 = **8 (Low-Medium)** |
| 발생 Phase | Phase 18 (SQL Editor 구현) |
| 관련 ADR | ADR-003 (SQL Editor), ADR-004 (Schema Viz) |

**원인 분석**

STRIDE T3: SQL Editor에서 사용자가 임의 SQL을 실행할 수 있는 인터페이스를 구현하는 과정에서, API 레이어가 사용자 입력을 직접 PostgreSQL에 전달하는 코드 경로가 생길 수 있다. 특히 "read-only PG 역할" 설정 오류 시 DDL 실행까지 허용될 위험.

**징후 식별**

- API 로그에서 `DROP`, `TRUNCATE`, `DELETE WITHOUT WHERE` 패턴 탐지
- PostgreSQL `pg_stat_statements`에서 비정상 쿼리 패턴
- `READ ONLY` 역할 설정에도 불구한 DDL 실행 성공 이벤트

**완화 전략**

1. SQL Editor API: `ypb_readonly` 역할만 허용 (INSERT/UPDATE/DELETE/DDL 불가)
2. Prisma에서 일반 CRUD는 `ypb_runtime` 역할, SQL Editor는 `ypb_readonly` 역할 분리
3. 쿼리 실행 전 `SET TRANSACTION READ ONLY` 강제
4. 허용 문 타입 화이트리스트: `SELECT`, `EXPLAIN`, `EXPLAIN ANALYZE`만 허용

**복구 절차**

1. 인젝션 탐지 시 해당 API 즉시 비활성화
2. PG 감사 로그(`pg_audit` 확장) 활성화로 실행된 쿼리 전수 조회
3. 영향 범위 평가 후 데이터 무결성 검증

**모니터링 지표**

- SQL Editor API에서 `ypb_readonly` 역할 사용률 100% (다른 역할 사용 = 즉시 알림)
- DDL 실행 이벤트 감사 로그 수 ≤ 0

---

### 3.10 R-27: AI 프롬프트 인젝션 (스코어 9)

**리스크 요약**

| 항목 | 내용 |
|------|------|
| 카테고리 | SEC |
| 확률 × 영향 | 3 × 3 = **9 (Medium)** |
| 발생 Phase | Phase 21 (UX Quality / AI Assistant) |
| 관련 ADR | ADR-014 (AI SDK v6 + Anthropic BYOK) |

**원인 분석**

Wave 3 보안 위협 모델(AH-4, 자체호스팅 특화): 사용자가 AI Assistant 입력창에 악의적 프롬프트를 삽입하여 시스템 프롬프트를 무력화하거나, AI가 DB 스키마 정보를 유출하도록 유도할 수 있다. Anthropic BYOK 키를 사용하므로 비용 폭탄(API 남용) 위험도 수반.

**징후 식별**

- AI 응답에서 시스템 프롬프트 구조가 반영된 내용 탐지
- AI API 비용 일일 $0.3 초과 (DQ-12.3 MASTER_KEY 예산 가드 트리거)
- 비정상 스키마 정보 포함 AI 응답

**완화 전략**

1. 시스템 프롬프트 고정 + 사용자 입력과 명시적 분리 (`<user_query>` 태그)
2. AI가 DB 직접 접근 불가: MCP 도구를 통한 읽기 전용 API만 허용
3. 응답 출력 필터: 민감 키워드(`MASTER_KEY`, `B2_APP_KEY` 등) 자동 마스킹
4. 일일 토큰 예산: Anthropic API `max_tokens` 제한 + 일일 요청 횟수 상한

**복구 절차**

1. 비정상 AI 응답 탐지 시 AI Assistant 일시 비활성화
2. Anthropic API 키 즉시 교체 (BYOK이므로 사용자 통제 가능)
3. 해당 세션 대화 기록 감사

**모니터링 지표**

- AI 일일 API 비용 ≤ $0.3 (초과 시 알림)
- AI 응답 내 민감 키워드 노출 이벤트 수 ≤ 0

---

## 4. 기술 리스크 심화 분석

### 4.1 Wave 1-4에서 식별된 기술 불확실성

| 기술 | 불확실성 | Wave 1 결론 | 완화 스파이크 |
|------|---------|------------|------------|
| isolated-vm v6 | Node 22 LTS 호환, VM escape 패치 | 조건부 GO | spike-005 |
| wal2json 슬롯 제한 | 슬롯 소진 시 WAL 무한 성장 | 슬롯 2개 분리 | spike-008 |
| SeaweedFS 50GB | 대용량 스파이크 시 OOM | B2 티어링 | spike-007 |
| pgmq | pgmq-core npm 패키지 안정성 | pgmq 채택 | spike-010 |
| splinter 포팅 | PL/pgSQL → Node TS 포팅 완성도 | 패턴 포팅 | 없음 (인라인) |

### 4.2 기술 선택 트레이드오프 리스크

**MinIO 배제 (ADR-008)**
MinIO 2026-02-12 AGPL 전환(CON-11)으로 SeaweedFS를 선택했다. SeaweedFS는 MinIO 대비 커뮤니티가 작고, 문서화 수준이 낮으며, enterprise 지원이 없다. 장기적으로 SeaweedFS 프로젝트 유지보수 중단 시 마이그레이션 비용이 발생한다.

**완화**: SeaweedFS → B2 직접 tiering 비율을 높여 SeaweedFS 의존도를 줄임 (Hot 50GB 이상은 B2 자동 오프로드).

**Deno 사이드카 (ADR-009)**
isolated-vm 장애 시 폴오버로 사용. Deno 버전 관리와 WSL2 내 Deno 설치 유지가 추가 운영 부담.

**완화**: Deno 버전을 `v2.x`로 고정; PM2에서 deno-worker 별도 프로세스로 관리.

**pg_graphql 보류 (ADR-012, ADR-016)**
4개 수요 트리거(GraphQL 구현 요구 1건+, 성능 개선 50%+ 요구, 프론트엔드 협업자 2명+, 모바일 클라이언트 추가)가 충족될 때까지 pg_graphql 미도입. 트리거 미달 시 영구 보류 가능성. 이 경우 Data API 카테고리 80~85점에서 정체.

---

## 5. 일정 리스크 심화 분석

### 5.1 1인 운영 버퍼 초과 시나리오

**시나리오 A: 정상 진행**
- 주당 투입: 20h
- Phase 15-17 (122h): 약 6주
- Phase 18 (320h SQL Editor): 약 16주
- 전체 870h: 약 43주 (2026-04 → 2027-02)

**시나리오 B: 20% 버퍼 초과 (경고 수준)**
- 버퍼 소진 후 공수 추정 오차 25%:
  870h × 1.25 = 1,088h → 약 54주 (2027-04까지)
- 대응: Phase 18 SQL Editor 4단계 중 14f(보너스) 제거 → 공수 -80h

**시나리오 C: 50% 이상 초과 (위기 수준)**
- 870h × 1.5 = 1,305h → 약 65주 (2027-07까지)
- 대응: Phase 20(DB 관리), Phase 21(Data API) 순서 교체; 하위 카테고리 Won't 전환
- BCP-1 발동 검토

### 5.2 Phase 15-17 MVP 최소 출시 기준

MVP는 Auth Advanced 60점 달성을 기준으로 한다.

| 기능 | 필수/선택 | Phase |
|------|---------|-------|
| TOTP 2FA 등록 + 인증 | 필수 | 15 |
| 세션 관리 UI (revokedAt) | 필수 | 15 |
| Observability: Vault + JWKS | 필수 | 16 |
| Operations: Capistrano 배포 | 필수 | 16 |
| Auth Core: jose JWT 완전 이식 | 필수 | 17 |
| Storage: SeaweedFS 기본 기능 | 필수 | 17 |
| WebAuthn 등록 + 인증 | 선택 (MVP 이후) | 15+ |
| Rate Limit (Redis) | 선택 (Phase 17 말) | 17 |

---

## 6. 운영 리스크 심화 분석

### 6.1 1인 운영의 구조적 취약점

CON-3(1인 운영)은 프로젝트의 근본적 제약이자 최대 리스크 집중점이다.

| 취약점 | 현황 | 완화 |
|-------|------|------|
| 24/7 온콜 불가 | PM2 자동 재시작 + Slack 알림으로 부분 대체 | PM2 max_memory_restart + autorestart |
| 도메인 전문성 단절 | 인수인계 문서 체계(`docs/handover/`) 완비 | next-dev-prompt.md 매 세션 갱신 |
| 휴가/병가 시 서비스 | 자동 복구 스크립트로 단기 무인 운영 | PM2 + 크론 자동화 |
| 지식 이전 불가 | Wave 1-5 리서치 문서 98 → 111건 | 문서화 우선 문화 |

### 6.2 WSL2 특성 기인 운영 리스크

CON-6(Windows 개발 / Linux 배포): WSL2는 프로덕션 리눅스 서버와 미묘한 차이가 있다.

- **네트워크 NAT**: Windows 재부팅 시 WSL2 IP 변경 → Cloudflare Tunnel 재연결 필요
- **파일시스템 마운트**: `/mnt/e/` 경유 I/O는 네이티브 Linux 대비 20-30% 느림
- **시스템 리소스 공유**: Windows 앱이 RAM/CPU 경쟁 시 PM2 워커 성능 저하

**완화**: WSL2 고정 IP 설정(`.wslconfig`); E 드라이브 대신 WSL2 네이티브 파일시스템(`/home/dev/`) 사용 권장.

### 6.3 외부 서비스 의존 매트릭스

| 서비스 | 의존 유형 | 대체 가능 여부 | 전환 비용 |
|-------|---------|------------|---------|
| Cloudflare Tunnel | 인터넷 진입 유일 경로 | 어려움 (ngrok 등으로 임시 대체만) | 높음 |
| Backblaze B2 | Cold 백업/스토리지 오프로드 | rclone S3 API로 다른 S3 서비스 전환 | 중간 |
| Anthropic API | AI Assistant | 다른 LLM API (OpenAI 등)으로 교체 | 낮음 |
| 가비아 도메인 | DNS 네임서버 | Cloudflare 이전 가능 | 낮음 |

---

## 7. 보안 리스크 심화 분석

### 7.1 STRIDE 미완화 잔여 위협

Wave 3 보안 위협 모델(08-security-threat-model.md)의 29 STRIDE 위협 중 완화 상태 분류:

| STRIDE 카테고리 | 전체 | 완전 완화 | 부분 완화 | 미완화 |
|--------------|------|--------|--------|------|
| S (Spoofing) | 5 | 2 | 3 | 0 |
| T (Tampering) | 5 | 3 | 2 | 0 |
| R (Repudiation) | 4 | 2 | 2 | 0 |
| I (Info Disclosure) | 5 | 2 | 2 | 1 |
| D (DoS) | 5 | 3 | 2 | 0 |
| E (Elevation of Privilege) | 5 | 2 | 3 | 0 |
| **합계** | **29** | **14** | **14** | **1** |

**잔여 미완화 위협 I-4: Vault DEK 평문 노출**
- 현황: Phase 16 이전까지 시크릿은 `.env` 평문 저장
- 완화 시점: Phase 16 Vault 구현 완료 시 해소
- 임시 완화: `/etc/luckystyle4u/secrets.env` chmod 0640 적용

### 7.2 자체호스팅 특화 5대 위협

Wave 3에서 정의한 자체호스팅 특화 위협(AH-1~AH-5):

| 위협 | 설명 | 완화 Phase |
|-----|------|----------|
| AH-1 | 물리 서버 도난 (WSL2 디스크) | 암호화 볼륨(VeraCrypt) 적용 — Phase 16 |
| AH-2 | 윈도우 업데이트로 WSL2 중단 | Windows Update 예약 시간 제어 + 모니터링 — 현재 |
| AH-3 | cloudflared 자격증명 파일 노출 | `/root/.cloudflared/cert.pem` 권한 0600 — 현재 |
| AH-4 | AI 프롬프트 인젝션 | R-27로 추적 — Phase 21 |
| AH-5 | isolated-vm escape → 호스트 장악 | isolated-vm sandbox 정책 강화 — Phase 19 |

---

## 8. 재무 리스크 심화 분석

### 8.1 B2 스토리지 비용 초과 시나리오

**정상 운영**: 50GB × $0.006/GB/월 = $0.30 + 다운로드 10GB × $0.01/GB = $0.10 = **$0.40/월**

**초과 시나리오 A: 100GB 도달**
50GB 초과분 50GB × $0.006 = $0.30 추가 → **총 $0.70/월** (한도 내)

**초과 시나리오 B: 500GB 도달 (대용량 스파이크)**
500GB × $0.006 = $3.00 + 다운로드 100GB × $0.01 = $1.00 = **$4.00/월** (한도 내지만 주의)

**초과 시나리오 C: 2TB 도달 (최악 케이스)**
2TB × $0.006 = $12.00 → **NFR-COST.1 위반 ($10 초과)**
대응: SeaweedFS 로컬 티어 용량 확장 + B2 오프로드 임계치 상향

**가드레일**: B2 버킷 사용량 주간 체크 → 100GB 초과 시 Slack 알림; 월 $5 초과 시 자동 오프로드 일시 중지.

### 8.2 AI API 비용 예산 관리

ADR-014(AI SDK v6 BYOK)에서 설정한 예산: $5/월 상한

| 사용 모드 | 예상 비용 |
|---------|--------|
| Haiku 위주 (조회, 간단한 쿼리) | ~$0.5~1.0/월 |
| Sonnet 혼합 (복잡한 분석) | ~$2.0~3.0/월 |
| Opus 집중 사용 (비정상적 사용) | ~$10+/월 (예산 초과) |

**DQ-12.3 MASTER_KEY 예산 가드 구현**:
- 일일 토큰 예산: 100K input + 50K output tokens
- 일일 $0.3 초과 시 Slack 알림
- 월 $5 초과 시 AI Assistant 자동 비활성화 + 알림

---

## 9. 리스크 모니터링 대시보드 설계

### 9.1 `/admin/risk-dashboard` 페이지 설계

**접근 경로**: `/dashboard/settings/risk-dashboard` (사이드바 Settings > Risk 항목)

**레이아웃**: 3-pane (좌: 리스크 목록 / 중: 상세 / 우: 지표 차트)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Risk Dashboard                              업데이트: 2분 전        │
├──────────────────┬──────────────────────────┬─────────────────────┤
│  리스크 목록      │  R-01 상세               │  실시간 지표         │
│                  │                          │                      │
│  ● R-01 High 15  │  isolated-vm v6 호환성   │  cloudflared: ✅     │
│  ● R-02 Med 12   │  마지막 점검: 2026-04-18  │  wal slots: 1/5     │
│  ● R-10 High 15  │                          │  B2 비용: $0.40/월  │
│  ● R-11 Med 12   │  완화 상태: 부분 완화     │  AI 비용: $1.2/월   │
│  ...             │  다음 검토: Phase 19 착수  │  WAL 크기: 1.2GB    │
│                  │                          │  세션 공백: 3일      │
└──────────────────┴──────────────────────────┴─────────────────────┘
```

### 9.2 각 리스크별 자동 지표 수집

| 리스크 ID | 지표 | 데이터 소스 | 수집 주기 | 알림 임계치 |
|---------|------|-----------|---------|----------|
| R-01 | isolated-vm 헬스체크 | `/api/edge-functions/health` | 5분 | 실패 3회 연속 |
| R-02 | PG 복제 슬롯 수 | `pg_replication_slots` | 1시간 | inactive 슬롯 1+ |
| R-10 | 마지막 커밋 일수 | GitHub API | 1일 | 14일 이상 |
| R-11 | Phase 진행률 | `docs/status/current.md` | 수동 | 완료도 < 80% |
| R-15 | cloudflared 프로세스 | PM2 API | 30초 | 비정상 종료 |
| R-22 | secrets.env 권한 | cron 검사 | 1일 | 권한 0640 외 |
| R-28 | B2 버킷 크기 | B2 API | 1주 | $5/월 초과 |
| R-29 | AI API 비용 | Anthropic API | 1일 | $0.3/일 초과 |

### 9.3 SQLite 리스크 지표 스키마 (Drizzle)

```typescript
// SQLite risk_metrics 테이블 (Drizzle schema)
export const riskMetrics = sqliteTable('risk_metrics', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  riskId:     text('risk_id').notNull(),         // 'R-01', 'R-02' 등
  metricName: text('metric_name').notNull(),
  metricValue: real('metric_value'),
  isAlerting: integer('is_alerting', { mode: 'boolean' }).default(false),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
});
```

---

## 10. 리스크 재평가 주기

### 10.1 Phase 완료 시점 재평가 프로토콜

각 Phase 완료 시 다음 항목을 수행한다:

1. **레지스터 전수 검토**: 30건 모두 현재 상태 갱신 (완화됨/변경됨/신규 추가)
2. **스코어 재산정**: 완화 조치 반영 후 확률·영향 재평가
3. **신규 리스크 식별**: 구현 과정에서 새롭게 발견된 리스크 추가
4. **ADR 연동 갱신**: 재검토 트리거 달성 여부 확인 (ADR-001~018, 재검토 트리거 45건)

| Phase | 완료 시 필수 재평가 리스크 |
|-------|----------------------|
| 15 | R-01, R-12, R-24 (Auth Advanced 관련) |
| 16 | R-22, R-25, R-15 (Observability/Ops/보안) |
| 17 | R-03, R-05, R-26 (Storage/백업/SQL) |
| 18 | R-13, R-26 (SQL Editor/인젝션) |
| 19 | R-01, R-02, R-23 (Edge/Realtime) |
| 20 | R-04, R-07 (DB 관리/의존성) |
| 21-22 | R-27, R-29, R-30 (AI/재무) |

### 10.2 분기별 전수 재평가 프로토콜

매 분기(3개월) 1회 전체 30건 리스크 재평가:

1. 리스크 레지스터 테이블 전체 갱신
2. 외부 환경 변화 반영 (의존성 CVE, Cloudflare 정책 변경 등)
3. 완화된 리스크 Closed 처리 (기록은 유지 — 역사 삭제 금지)
4. 신규 리스크 최대 5건 식별·등록
5. Top 10 Critical Risks 재선정

---

## 11. 비즈니스 연속성 계획 (BCP)

### 11.1 운영자 사고 시나리오별 DR 프로토콜

CON-3(1인 운영)의 구조적 취약점에 대응하는 비즈니스 연속성 계획.

**BCP-1: 단기 운영 중단 (1-30일)**

| 상황 | 대응 |
|------|------|
| 휴가/여행 | 자동 복구 스크립트 + PM2 자동 재시작으로 무인 운영 |
| 경미한 병가 | `docs/handover/next-dev-prompt.md` 기준 재개 |
| 대응 가능 여부 | 외부에서 SSH 또는 Cloudflare 터널 접속으로 점검 가능 |

자동화 필수 항목:
- PM2 프로세스 자동 재시작 (`autorestart: true`)
- 일일 pg_dump + B2 업로드 크론 (03:00 KST)
- WAL-g 아카이빙 (15분 주기)
- Slack 알림 (장애 발생 시 자동 발송)

**BCP-2: 장기 운영 중단 (30일+)**

DQ-OPS-4 연계: 장기 운영 중단 시 대리 운영 프로토콜.

1. **접근 권한 이전**: `docs/handover/emergency-access.md` (비공개) — MASTER_KEY 보관 위치, PM2 명령어, B2 자격증명 복구 방법
2. **서비스 동결**: `pm2 stop all` + `cloudflared stop` → 데이터 보존 상태 유지
3. **데이터 복구 경로**: B2에서 최신 백업 복원 → WSL2 재설치 → PM2 재시작 (RTO 목표 4h)
4. **도메인 관리**: 가비아 계정 이전 또는 Cloudflare 네임서버 유지

**BCP-3: 프로젝트 영구 중단**

1. 최종 pg_dump + B2 업로드 (데이터 영구 보존)
2. 도메인 만료 전 데이터 다운로드 완료
3. `docs/research/2026-04-supabase-parity/` 연구 문서 GitHub 저장소 공개 (선택)

### 11.2 BCP 복구 시간 목표 (RTO/RPO)

| 시나리오 | RPO | RTO | 달성 방법 |
|---------|-----|-----|---------|
| PM2 프로세스 크래시 | 0 (상태 비저장) | 30초 | PM2 autorestart |
| PostgreSQL 중단 | ≤ 15분 (WAL-g) | 30분 | systemd + pg_ctl |
| WSL2 재기동 | ≤ 15분 | 10분 | PM2 startup 스크립트 |
| 물리 서버 교체 | ≤ 24시간 (B2 백업) | 4시간 | B2 restore + WSL 재설치 |
| 운영자 교체 | 문서화 손실 없음 | 1주 (온보딩) | handover 체계 |

---

## 부록 Z. 근거 인덱스

| 인용 문서 | 항목 |
|---------|------|
| `00-vision/03-non-functional-requirements.md` | NFR-PERF.4, NFR-COST.1, NFR-REL.3 |
| `00-vision/04-constraints-assumptions.md` | CON-1~12, ASM-1~12 |
| `00-vision/08-security-threat-model.md` | STRIDE S1~E5, AH-1~AH-5 |
| `00-vision/09-multi-tenancy-decision.md` | ADR-001 재검토 트리거 |
| `00-vision/10-14-categories-priority.md` | Phase 15-22 공수 |
| `02-architecture/01-adr-log.md` | ADR-001~018, 재검토 트리거 45건 |
| `02-architecture/04-observability-blueprint.md` | Phase 16 WBS, MASTER_KEY |
| `02-architecture/05-operations-blueprint.md` | BCP 관련, DQ-OPS-4 |
| `04-integration/02-cloudflare-deployment-integration.md` | Tunnel 장애 대응 |
| `04-integration/03-external-services-integration.md` | B2 비용, AI API 예산 |
| `_CHECKPOINT_KDYWAVE.md` | Wave 4 공수 870h, TCO $250 |

---

> 최종 수정: 2026-04-18 (Wave 5 R3 에이전트, 30 리스크 / Top 10 상세 / BCP 3단계)
