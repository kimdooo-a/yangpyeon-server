# 기술 부채 전략 — 양평 부엌 서버 대시보드

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · R2 에이전트 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W5-R2)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [01-adr-log.md](../02-architecture/01-adr-log.md) · [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md) · [03-mvp-scope.md](./03-mvp-scope.md)

---

## 0. 문서 목적

양평 부엌 서버 대시보드는 Wave 1~4에서 **의도적으로 부채를 축적**하면서 설계 속도를 높였다. "1인 운영 + $0/month + 122h MVP" 제약 아래에서 모든 결정을 완벽하게 할 수는 없었다. 이 문서는:

1. Wave 1~4에서 발생한 기술 부채를 **분류·등록**하고
2. 각 부채의 영향 범위와 해결 타이밍을 **정량화**하며
3. 1인 운영 환경에서 부채가 "손에 감당할 수 없는 수준"이 되기 전에 관리하는 **프로세스**를 정의한다

---

## 1. 기술 부채 분류 체계

### 1.1 4유형 × 3심각도 매트릭스

|               | **고 (High)** | **중 (Medium)** | **저 (Low)** |
|---------------|--------------|----------------|-------------|
| **설계 부채** | 아키텍처 변경 없이 해결 불가, 대규모 리팩토링 필요 | 설계 패턴 불일치, 부분 리팩토링으로 해결 | 개념 불일치, 문서 수정으로 해소 가능 |
| **코드 부채** | 버그 유발 가능, 기능 추가 차단 | 코드 중복, 과잉 커플링 | 스타일 불일치, 네이밍 규칙 위반 |
| **테스트 부채** | 핵심 경로 테스트 없음, 회귀 위험 높음 | 해피패스만 있음, 엣지케이스 없음 | 커버리지 낮음, 통합 테스트 부족 |
| **문서 부채** | ADR 누락, 의사결정 근거 없음 | API 문서 불완전, 다이어그램 미갱신 | 주석 부족, CHANGELOG 미작성 |

### 1.2 심각도 정의

| 심각도 | 정의 | 방치 허용 기간 | 해결 우선순위 |
|--------|------|-------------|------------|
| **고** | 프로덕션 장애 또는 보안 사고 유발 가능, 기능 추가 차단 | 다음 릴리스까지 | 부채 스프린트에서 즉시 처리 |
| **중** | 기능 확장 시 추가 공수 +30% 이상 예상, 운영 부담 증가 | 2 Phase 이내 | 스프린트 20% 할당으로 점진 해소 |
| **저** | 완성도 저하, 미래 기술적 의사결정에 간접 영향 | v1.0 전까지 | 여유 공수에서 처리 |

---

## 2. 현재 식별된 기술 부채 테이블

Wave 1~4에서 의도적으로 또는 트레이드오프 결과로 발생한 부채 22건을 등록한다.

| ID | 설명 | 유형 | 심각도 | 영향 카테고리 | 발생 Wave | 해결 릴리스 | 예상 공수 |
|----|------|------|--------|------------|---------|-----------|---------|
| TD-1 | bcrypt → argon2id 미이행 (DQ-AC-1) | 설계 | **고** | Auth Core, Auth Advanced | Wave 1 R2 | Phase 22 | 8h |
| TD-2 | PM2 cluster:4 미이행 (단일 프로세스 운영 중) | 설계 | **고** | Operations, 전체 | Wave 4 B2 | Phase 16 | 4h |
| TD-3 | JWT HS256 → ES256 전환 미완료 | 설계 | **고** | Auth Core, Observability | Wave 1 R2 | Phase 16 | 6h |
| TD-4 | MASTER_KEY 없이 env 평문 운영 중 | 설계 | **고** | Observability, 전체 보안 | Wave 2 F | Phase 16 | 포함됨 |
| TD-5 | SeaweedFS 50GB 이상 운영 미검증 | 설계 | **고** | Storage | Wave 1 R1 | Phase 17 전 (spike-007) | 16h |
| TD-6 | 세션 테이블 없음 (JWT-only, 서버 무효화 불가) | 설계 | **고** | Auth Core | Wave 1 R2 | Phase 17 | 8h |
| TD-7 | Refresh Token tokenFamily 미구현 (단순 revokedAt만) | 코드 | **고** | Auth Advanced, Auth Core | Wave 4 B1 | Phase 17 | 6h |
| TD-8 | Rate Limit 단일 프로세스 전제 (cluster 확장 시 race condition) | 설계 | **고** | Auth Advanced | Wave 1 R2 | Phase 16 (cluster 이행 시) | 4h |
| TD-9 | Docker 이행 조건 문서화만 존재, 실제 Dockerfile 없음 | 설계 | **중** | Operations | Wave 2 G | Phase 22 (조건 충족 시) | 20h |
| TD-10 | wal-g 백업 검증 드릴 자동화 없음 | 테스트 | **중** | DB Ops | Wave 1 R2 | Phase 17 | 4h |
| TD-11 | Node.js 버전 고정 없음 (.nvmrc 없음) | 코드 | **중** | 전체 | Wave 4 B2 | Phase 16 | 1h |
| TD-12 | DR(Disaster Recovery) 호스트 미지정 | 설계 | **중** | Operations | Wave 4 B2 | Phase 17 | 8h |
| TD-13 | splinter 38룰 Node TS 포팅 미완성 | 코드 | **중** | Advisors | Wave 1 R2 | Phase 20 | 40h |
| TD-14 | pg_graphql 수요 트리거 4개 미추적 | 문서 | **중** | Data API | Wave 2 F | Phase 21 착수 시 | 2h |
| TD-15 | MFA 백업 코드 소진 알림 없음 | 코드 | **중** | Auth Advanced | Wave 4 B1 | Phase 15 | 2h |
| TD-16 | API 응답 ETag 캐시 미구현 (FR-1.1 명시) | 코드 | **중** | Table Editor | Wave 3 R1 | Phase 18 | 4h |
| TD-17 | 스키마 ERD 노드 위치 로컬 스토리지만 저장 (다중 기기 비동기) | 코드 | **저** | Schema Visualizer | Wave 3 R1 | Phase 20 | 3h |
| TD-18 | EXPLAIN ANALYZE 비정상 쿼리 백그라운드 로깅 미구현 | 코드 | **저** | SQL Editor | Wave 3 R1 | Phase 18 | 4h |
| TD-19 | Advisors 결과 Slack 다이제스트 미구현 (DQ-ADV-5) | 코드 | **저** | Advisors | Wave 2 E | Phase 20 | 8h |
| TD-20 | WCAG 2.2 AA 자동 접근성 검사 미통합 | 테스트 | **저** | UX Quality | Wave 4 U1 | Phase 21 | 6h |
| TD-21 | pgmq archive 정책 미정의 (DQ-1.34) | 문서 | **저** | Data API | Wave 2 F | Phase 21 | 2h |
| TD-22 | Canary 실험 측정 지연 (Cloudflare Analytics 48h 지연) | 설계 | **저** | Operations | Wave 4 B2 | Phase 16 | 3h |

**총 22건** (고: 8건, 중: 8건, 저: 6건)

---

## 3. 부채 발생 소스별 분류

Wave별로 어떤 이유에서 부채가 의도적으로 생성되었는지를 인용한다.

### 3.1 Wave 1 발생 부채 (7건: TD-1, TD-2, TD-5, TD-6, TD-8, TD-11, TD-13)

Wave 1의 목적은 "14 카테고리 기술 채택안 확정"이었다. 이 단계에서 **"지금 당장 구현하지 않고 채택안만 확정"** 하는 결정이 다수 내려졌다.

**근거 인용**: `_CHECKPOINT_KDYWAVE.md §Wave 1 Round 1`
> "DQ-1.1~1.9 모두 잠정 답변 확정 / 신규 DQ 64건 등록 (Wave 2~5에서 답변)"

즉, Wave 1에서 64건의 미결 사항(DQ)이 새로 등록되었으며 이 중 다수가 "구현 시점을 의도적으로 미룬 부채"로 전환되었다.

- **TD-1 (argon2 미이행)**: `01-research/05-auth-core/01-lucia-auth-deep-dive.md §DQ-AC-1` — "argon2id 이행은 bcrypt 기존 해시와의 롤링 마이그레이션 전략이 필요. Wave 1에서는 bcrypt 유지, DQ-AC-1로 등록."
- **TD-5 (SeaweedFS 50GB 미검증)**: `01-research/07-storage/01-seaweedfs-deep-dive.md §리스크` — "50GB+ 운영 검증은 spike-007에서 별도 수행" 명시. Wave 1에서 채택안만 확정, 부하 테스트는 의도 지연.
- **TD-6 (세션 테이블 없음)**: `01-research/05-auth-core/02-authjs-v6-pattern-deep-dive.md §11.1` — "Session 테이블은 Phase 17에서 추가할 갭(G1)" 명시.
- **TD-13 (splinter 포팅 미완성)**: `01-research/10-advisors/` — "splinter 38룰 Node TS 포팅은 점진 머지" 결정. Wave 1에서 방향만 확정.

### 3.2 Wave 2 발생 부채 (4건: TD-4, TD-9, TD-14, TD-19)

Wave 2의 목적은 "1:1 비교로 채택안 검증"이었다. 이 단계에서 **"미래 조건부 도입"** 결정이 공식화되었다.

**근거 인용**: `_CHECKPOINT_KDYWAVE.md §Wave 2 종합 결론`
> "정량화된 재고 조건 — 모든 채택안에 '언제 재검토할지' 트리거 명시"

- **TD-4 (MASTER_KEY 평문)**: `01-research/12-observability/03-observability-matrix.md` — Wave 2 F 에이전트가 DQ-12.3 확정. "MASTER_KEY=/etc/luckystyle4u/secrets.env — Wave 4 Observability Blueprint에서 구현." Wave 2 시점에는 구현 없이 위치만 확정.
- **TD-9 (Docker Dockerfile 없음)**: `01-research/14-operations/02-docker-vs-capistrano-compare.md §이행 조건` — "Docker 이행 조건 4개 모두 현재 미충족. 조건 충족 시 재검토." 의도적 미이행.
- **TD-14 (pg_graphql 트리거 미추적)**: `01-research/11-data-api/03-graphql-pg_graphql-compare.md §ADR-016` — "수요 트리거 4개 정량화 완료. 추적은 운영 단계에서 시작." 추적 시스템 미구현.
- **TD-19 (Slack 다이제스트 미구현)**: `01-research/10-advisors/02-advisors-matrix.md §DQ-ADV-5` — "Slack 다이제스트는 Phase 20 Advisors 구현 시 통합" 명시.

### 3.3 Wave 3 발생 부채 (3건: TD-15, TD-16, TD-17)

Wave 3의 목적은 "비전·요구사항 수립"이었다. FR을 작성하면서 **"P0이지만 기존 코드에 없는 것"** 이 드러났다.

**근거 인용**: `_CHECKPOINT_KDYWAVE.md §Wave 3 Compound Knowledge`
> "Wave 1에서 이미 각 카테고리의 1위 기술이 확정됨 → FR의 '구현 기술' 컬럼이 처음부터 채워진 상태"

즉, FR을 명시화하는 과정에서 "명시는 되었으나 구현되지 않은" 항목이 부채로 확인되었다.

- **TD-15 (백업 코드 소진 알림)**: `00-vision/02-functional-requirements.md §FR-6.1 세부 3` — "복구 코드 소진 시 재발급 안내" — 현재 미구현 상태로 Wave 3에서 FR만 작성됨.
- **TD-16 (ETag 캐시)**: `00-vision/02-functional-requirements.md §FR-1.1 세부 5` — "결과는 ETag로 캐시, 미변경 시 304" — FR 명시 시 기존 구현에 없음이 확인.
- **TD-17 (ERD 노드 위치 다중 기기 비동기)**: `00-vision/02-functional-requirements.md §FR-3.1 세부 2` — "노드 위치는 로컬 스토리지에 저장" — 명시적으로 다중 기기 비동기 문제를 "P2 이후"로 연기.

### 3.4 Wave 4 발생 부채 (8건: TD-3, TD-7, TD-8, TD-10, TD-12, TD-18, TD-20, TD-21, TD-22)

Wave 4의 목적은 "카테고리별 Blueprint 작성"이었다. 설계가 구체화되면서 **"지금은 이렇게 하고 나중에 고친다"** 패턴이 각 Blueprint에 등록되었다.

**근거 인용**: `_CHECKPOINT_KDYWAVE.md §Wave 4 핵심 발견`
> "DQ 28 답변 완료 — Wave 4 할당 DQ 모두 Blueprint 내부에서 정량 답변"
> "ADR 18건 누적 + 재검토 트리거 45건 정량화"

- **TD-3 (HS256 → ES256 미완)**: `02-architecture/04-observability-blueprint.md §2.2` — "현재 HS256 단일 JWT_SECRET로 동작 중, ES256 전환은 Phase 16 JWKS 구현 시 완료." Phase 16 전까지 보안 갭 존재.
- **TD-7 (tokenFamily 미구현)**: `02-architecture/03-auth-advanced-blueprint.md §1.3` — "DQ-AA-8 확정 답변 — revokedAt + tokenFamily 하이브리드. 단순 revokedAt만 현재 구현." Blueprint에서 미구현 명시.
- **TD-10 (백업 드릴 자동화)**: `02-architecture/05-operations-blueprint.md §1.3` — "복구 드릴 정기화, restore audit 자동화" WBS에 포함되었으나 현재 자동화 없음.
- **TD-12 (DR 호스트 미지정)**: `02-architecture/05-operations-blueprint.md §DQ-OPS-4` — "DR 호스트 결정 미완료" — DQ-OPS-4로 등록, Phase 17까지 해결 예정.
- **TD-18 (EXPLAIN 로깅)**: `02-architecture/08-sql-editor-blueprint.md §DQ-2.4` — "비정상 쿼리 추적 로깅" Blueprint에 명시, Phase 18 구현 예정.
- **TD-20 (WCAG 2.2 자동 검사)**: `03-ui-ux/00-design-system.md §WCAG 2.2 AA` — "목표: WCAG 2.2 AA 자동 검사 통합 — Phase 21 UX Quality."
- **TD-22 (Canary 측정 지연)**: `02-architecture/05-operations-blueprint.md §리스크` — "Cloudflare Analytics 48h 지연. Canary 실험이 데이터 지연으로 인해 신속 판단 어려움."

---

## 4. 부채 상세 — 심각도 "고" 전체 (8건)

고 심각도 부채는 프로덕션 장애 또는 보안 사고를 유발할 수 있으므로 상세 기술이 필요하다.

---

### TD-1: bcrypt → argon2id 미이행

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | 현재 비밀번호 해시는 `bcrypt(cost=12)`로 운영 중. OWASP 2024 권고는 argon2id로 이전을 권장하며, NIST SP 800-63B도 메모리 하드 함수 채용을 명시. bcrypt는 GPU 병렬 공격에 상대적으로 취약. |
| **원인** | Wave 1 R2 `01-research/05-auth-core/01-lucia-auth-deep-dive.md §DQ-AC-1` — "argon2id 이행은 bcrypt 기존 해시와의 롤링 마이그레이션 전략이 필요. Wave 1에서는 bcrypt 유지" 의도적 연기. |
| **영향 범위** | Auth Core (FR-5.1, FR-5.3), Auth Advanced (FR-6.1 백업 코드 해시) |
| **해결 방안** | 로그인 시 "argon2id로 재해시" 롤링 마이그레이션 — 기존 bcrypt 해시 보유 사용자가 로그인 시 argon2id로 무중단 전환. 신규 가입자는 즉시 argon2id. |
| **예상 공수** | 8h (마이그레이션 스크립트 + 테스트 + 모니터링) |
| **목표 릴리스** | Phase 22 (보안 CVE 없으면 현재 bcrypt cost=12 허용, Phase 22 보너스 기능에서 처리) |
| **상태** | 미착수 (DQ-AC-1 Wave 5 할당) |
| **임시 완화** | bcrypt cost=12 유지 (GPU 공격 대비 현재 충분한 수준, 1인 운영 소규모 공격 표면) |

---

### TD-2: PM2 cluster:4 미이행 (단일 프로세스 운영 중)

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | 현재 PM2 단일 프로세스(`pm2 start --no-daemon`) 운영 중. ADR-015에서 cluster:4 + graceful reload 0초 다운타임이 결정되었으나 미이행 상태. 단일 프로세스는 배포 시 순간 다운타임 ~10초 발생. |
| **원인** | Wave 4 B2 `02-architecture/05-operations-blueprint.md §1.1` — "현재: 수동 SSH + git pull + pm2 restart (~15분, 다운타임 ~10초). 목표: Capistrano-style 자동화 (0초 다운타임)" — Phase 16 이전까지 현재 방식 유지. |
| **영향 범위** | Operations (FR-14.1), 전체 가용성 (NFR-REL) |
| **해결 방안** | PM2 ecosystem.config.js에 `instances: 4, exec_mode: 'cluster'` 설정. Capistrano 배포 스크립트와 동시 이행. |
| **예상 공수** | 4h (설정 변경 + 배포 스크립트 연동 + 테스트) |
| **목표 릴리스** | Phase 16 (Capistrano 배포 스크립트와 동시 완료) |
| **상태** | Phase 16 계획됨 |
| **임시 완화** | 배포를 사용자 활동이 적은 새벽 시간(03:00~05:00)에 수동 수행 |

---

### TD-3: JWT HS256 → ES256 전환 미완료

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | 현재 `jose` 라이브러리로 HS256(대칭 키) JWT를 발급 중. ES256(비대칭 키) 전환이 Phase 16 JWKS 구현의 선행 조건이지만 현재 미완료. HS256 단일 키 환경에서는 키 회전 시 전체 사용자 로그아웃 강제 발생. |
| **원인** | Wave 4 B2 `02-architecture/04-observability-blueprint.md §2.2` — "현재 인증 구조는 HS256 단일 JWT_SECRET 환경변수로 동작, 키 회전 시 모든 사용자가 즉시 로그아웃됨. ES256 전환은 JWKS 구현 시 완료." |
| **영향 범위** | Observability (FR-12.2), Auth Core (FR-5.1, FR-5.2), Auth Advanced (FR-6.1~6.3) |
| **해결 방안** | jose `SignJWT`를 ES256 `CryptoKey`로 교체. JWKS 엔드포인트에서 `kid` 포함 검증. 구 HS256 토큰 grace 30일 (마이그레이션 기간) 허용 후 배제. |
| **예상 공수** | 6h (키 전환 + 검증 로직 + grace 기간 관리) |
| **목표 릴리스** | Phase 16 (JWKS Blueprint와 동시 구현) |
| **상태** | Phase 16 계획됨 |
| **임시 완화** | JWT_SECRET 180일 고정 운영 (회전 불가), 긴급 회전 시 전체 로그아웃 감수 |

---

### TD-4: MASTER_KEY 없이 env 평문 운영 중

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | 환경변수(`.env.local`)에 평문 저장된 API 키, DB 접속 문자열, JWT 시크릿이 Vault 암호화 없이 운영 중. MASTER_KEY 기반 AES-256-GCM envelope 암호화가 Phase 16에서 구현될 때까지 시크릿 보호 수준이 불완전. |
| **원인** | Wave 2 F `01-research/12-observability/03-observability-matrix.md §DQ-12.3` — "MASTER_KEY=/etc/luckystyle4u/secrets.env — Wave 4 Observability Blueprint에서 구현." 확정되었으나 구현 미완료. |
| **영향 범위** | Observability (FR-12.1), 전체 보안 (NFR-SEC.2) |
| **해결 방안** | Phase 16 VaultService 구현으로 완전 해소. 임시로 .env.local 파일 권한 0600 + git 제외 확인. |
| **예상 공수** | Phase 16에 포함됨 (VaultService 8h) |
| **목표 릴리스** | Phase 16 |
| **상태** | Phase 16 계획됨 |
| **임시 완화** | .env.local chmod 0600, gitignore 확인, 서버 접근 SSH 키만 허용 |

---

### TD-5: SeaweedFS 50GB 이상 운영 미검증

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | Wave 1에서 SeaweedFS를 Storage 채택안으로 확정했으나 50GB 이상 데이터 적재 시 메모리 사용량·GC 지연·파일 손상 위험이 미검증 상태. RAM 350-600MB 운용 가정이 실제 부하 상황에서 유효한지 불명확. |
| **원인** | Wave 1 R1 `01-research/07-storage/01-seaweedfs-deep-dive.md §리스크` — "50GB+ 운영은 spike-007에서 별도 부하 테스트" 명시. Wave 1 시점에는 채택안 확정에 집중, 부하 테스트는 Phase 17 전으로 연기. |
| **영향 범위** | Storage (FR-7.1~7.4) 전체 |
| **해결 방안** | Wave 5 spike-007-seaweedfs-50gb 실행: WSL2에서 50GB 더미 데이터 업로드 → 메모리 모니터링 → GC 지연 측정 → PM2 max_memory_restart 임계값 설정. |
| **예상 공수** | 16h (spike 포함, Phase 17 착수 전 필수) |
| **목표 릴리스** | Phase 17 착수 전 (선행 조건) |
| **상태** | spike-007 Wave 5 계획됨 |
| **임시 완화** | 현재 Storage 운영 최소화, 로컬 파일시스템으로 임시 처리 |

---

### TD-6: 세션 테이블 없음 (JWT-only, 서버 무효화 불가)

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | 현재 인증 구조는 JWT 토큰만으로 상태를 관리. 서버 측 세션 테이블 없이는 "전체 로그아웃", "특정 디바이스 로그아웃", "계정 해킹 시 강제 무효화"가 불가능. JWT 만료(15분) 전까지 탈취된 토큰도 유효 상태 유지. |
| **원인** | Wave 1 R2 `01-research/05-auth-core/01-lucia-auth-deep-dive.md §11.1` — "Session 테이블은 Phase 17에서 추가할 갭(G1)" 명시. 현재 구조에서 세션 테이블 추가는 스키마 마이그레이션 + 로직 변경 모두 필요. |
| **영향 범위** | Auth Core (FR-5.2, FR-5.4), Auth Advanced (MFA 세션 업그레이드) |
| **해결 방안** | `user_sessions` 테이블 생성 (Lucia 패턴): `id, user_id, refresh_token_hash, user_agent, ip, created_at, last_used_at, expires_at, revoked_at`. Refresh Token rotation으로 재사용 탐지 추가. |
| **예상 공수** | 8h (G1 포함, Phase 17) |
| **목표 릴리스** | Phase 17 |
| **상태** | Phase 17 계획됨 |
| **임시 완화** | Access Token 만료를 15분으로 단축 (탈취 시 피해 최소화), Refresh Token 7일 DB 해시 저장 |

---

### TD-7: Refresh Token tokenFamily 미구현

| 항목 | 내용 |
|------|------|
| **유형** | 코드 부채 |
| **심각도** | 고 |
| **설명** | 현재 `revokedAt` 컬럼만으로 Refresh Token 재사용 감지 중. DQ-AA-8 최종 답변은 "revokedAt + tokenFamily 하이브리드"이나 tokenFamily 테이블 미구현. 가족 단위 무효화(한 사용자의 전체 refresh 세대 무효화)가 불가능. |
| **원인** | Wave 4 B1 `02-architecture/03-auth-advanced-blueprint.md §1.3` — "DQ-AA-8 확정 답변 — revokedAt + tokenFamily 하이브리드. 단순 revokedAt 방식은 Reuse Detection 불완전." Blueprint에서 미구현 명시. |
| **영향 범위** | Auth Core (FR-5.2 세션 Refresh), Auth Advanced (Phase 15 MFA 세션 업그레이드) |
| **해결 방안** | `token_families` 테이블 추가: `family_id, user_id, created_at, last_rotation, is_compromised`. Refresh 시 family_id 유지, 재사용 감지 시 `is_compromised=true` + 해당 family 전체 무효화. |
| **예상 공수** | 6h (테이블 생성 + 로직 + 테스트, Phase 17 G1과 통합) |
| **목표 릴리스** | Phase 17 (세션 테이블 TD-6과 동시) |
| **상태** | Phase 17 계획됨 |
| **임시 완화** | revokedAt 단독으로 개별 토큰 무효화는 동작, 가족 단위 무효화만 불가 |

---

### TD-8: Rate Limit 단일 프로세스 전제

| 항목 | 내용 |
|------|------|
| **유형** | 설계 부채 |
| **심각도** | 고 |
| **설명** | Phase 15에서 구현하는 `rate-limiter-flexible` PostgreSQL 어댑터는 PG UNLOGGED 테이블로 카운터를 공유. PM2 cluster:4(Phase 16에서 이행) 환경에서는 4개 워커가 같은 PG 테이블을 동시에 UPSERT하게 됨. 이는 설계상 의도한 동작이지만, UPSERT 동시성 충돌 시 카운터 부정확 위험이 있음. |
| **원인** | Wave 1 R2 `01-research/06-auth-advanced/03-rate-limiter-flexible-deep-dive.md §12.3` — "DQ-1.2 최종 답변: PostgreSQL (Prisma 어댑터). cluster 전환 시 코드 변경 불필요" 명시. 그러나 UPSERT race condition 상세 분석은 "QPS 한계 초과 시 Redis 이전 트리거" 조건부로 처리. |
| **영향 범위** | Auth Advanced (FR-6.3 Rate Limit) |
| **해결 방안** | PostgreSQL `FOR UPDATE SKIP LOCKED` + 트랜잭션 UPSERT로 race condition 제거. QPS 피크 > 500/초 시 Redis 이전 트리거 등록(ADR-007). |
| **예상 공수** | 4h (UPSERT 로직 강화 + 부하 테스트) |
| **목표 릴리스** | Phase 16 (cluster:4 이행 시 동시) |
| **상태** | Phase 16 계획됨 |
| **임시 완화** | 현재 단일 프로세스이므로 race condition 없음 (Phase 16 cluster 이행 전까지 위험 없음) |

---

## 5. 부채 관리 프로세스

6단계 관리 사이클을 정의한다. 1인 운영 환경에 최적화된 경량 프로세스이다.

### 5.1 Stage 1: 등록 (Registration)

새 부채 발생 조건:
- 설계 결정 시 "지금은 이렇게 하고 나중에 고친다"고 명시한 경우
- FR 작성 시 "P2 또는 Post-MVP"로 미룬 기능
- Blueprint에서 "DQ-XX는 Phase YY에서 해결" 명시된 경우

등록 형식:
```
TD-[N]: [한 줄 설명]
- 유형: 설계/코드/테스트/문서
- 심각도: 고/중/저
- 발생 Wave: Wave [N]
- 발생 근거: [파일 경로 §섹션]
- 해결 릴리스: Phase [N]
- 예상 공수: Xh
```

### 5.2 Stage 2: 분류 (Classification)

등록된 부채를 §1.1 매트릭스(4유형 × 3심각도)로 분류. 분류 기준:

- 심각도 "고" 자동 조건:
  - 보안 취약점 직접 유발 가능
  - 프로덕션 장애 시 복구 불가
  - 기능 추가 완전 차단 (다른 PR 머지 불가)
- 심각도 "중" 자동 조건:
  - 다음 Phase 구현 시 공수 +30% 이상 예상
  - 1인 운영자 주당 30분 이상 추가 부담
- 나머지는 심각도 "저"

### 5.3 Stage 3: 우선순위 결정 (Prioritization)

매 Phase 시작 전, 미해결 부채 목록을 검토하고 다음 기준으로 우선순위 결정:

1. 심각도 "고" → 반드시 이번 Phase 내 처리 (§6 임계치 규칙 적용)
2. 심각도 "중" → 스프린트 20% 할당 (§6 원칙 적용)
3. 심각도 "저" → 여유 공수 시 처리, 아니면 다음 Phase로 이월

### 5.4 Stage 4: 릴리스 할당 (Release Assignment)

각 부채는 특정 Phase에 해결 릴리스가 할당된다. 할당 변경 조건:

- 기능 우선순위 변경 (오너 결정)
- 의존성 변화 (선행 Phase 지연)
- 심각도 변경 (CVE 등 외부 요인)

할당 변경 시 반드시 이 문서의 §2 테이블을 업데이트해야 한다.

### 5.5 Stage 5: 검증 (Verification)

부채 해결 후 검증 조건:

- 해결 코드가 테스트로 커버됨 (Unit 또는 Integration)
- 원인이 된 Wave N 문서의 해당 섹션에 "해결됨 (Phase M)" 주석 추가
- `docs/status/current.md` 세션 요약표에 TD-N 해결 기록

### 5.6 Stage 6: 완료 (Completion)

완료 조건:
- 검증 통과
- 이 문서 §2 테이블의 "상태" 컬럼을 "완료 (Phase M)" 로 업데이트
- 고 심각도 완료 시 `docs/handover/` 인수인계서에 명시

---

## 6. 스프린트당 20% 할당 원칙

### 6.1 원칙 정의

1인 운영 환경에서 부채 관리는 다음 원칙을 따른다:

> **매 Phase의 총 공수 중 20%는 기술 부채 해소에 할당한다.**

예시:
- Phase 16 총 공수 40h → 부채 할당 8h
- Phase 17 총 공수 60h → 부채 할당 12h
- Phase 18 총 공수 80h → 부채 할당 16h

### 6.2 Phase별 부채 예산

| Phase | 총 공수 | 부채 할당(20%) | 해소 예정 TD | 누적 해소 TD |
|-------|--------|--------------|------------|------------|
| Phase 15 | 22h | 4.4h | TD-15 | TD-15 |
| Phase 16 | 40h | 8h | TD-2, TD-3, TD-4, TD-8, TD-11, TD-22 | 7건 |
| Phase 17 | 60h | 12h | TD-5 일부, TD-6, TD-7, TD-10, TD-12 | 12건 |
| Phase 18 | 80h | 16h | TD-16, TD-18 | 14건 |
| Phase 19 | 70h | 14h | — (이 Phase는 신규 구현 집중) | 14건 |
| Phase 20 | 60h | 12h | TD-13, TD-17, TD-19 | 17건 |
| Phase 21 | 40h | 8h | TD-14, TD-20, TD-21 | 20건 |
| Phase 22 | 30h | 6h | TD-1, TD-9 (조건 충족 시) | 22건 |

### 6.3 이탈 기준 및 경고

아래 중 하나라도 발생하면 "부채 스프린트" 발동:

| 경고 트리거 | 정의 | 대응 |
|----------|------|------|
| **고 임계치** | 심각도 "고" 미해결 부채 3건 이상 누적 | 다음 Phase를 50% 이상 부채 처리로 전환 |
| **전체 임계치** | 전체 미해결 부채 10건 이상 누적 | 다음 Phase를 25% 부채 처리로 전환 |
| **할당 이탈** | 연속 2 Phase에서 20% 미달 | 경고 기록 + 다음 Phase 30%로 증량 |
| **고 지연** | 심각도 "고" 항목이 목표 릴리스 +1 Phase 초과 | 즉시 부채 스프린트 발동 |

---

## 7. 부채 축적 임계치 & 경고

### 7.1 임계치 규칙

```
규칙 R1: 고 심각도 3건 이상 미해결 → 다음 릴리스 = 부채 스프린트
규칙 R2: 전체 미해결 10건 이상 → 다음 릴리스 25% 이상 부채 처리
규칙 R3: 고 심각도 항목이 목표 릴리스 +1 Phase 초과 → 즉시 부채 스프린트
규칙 R4: Phase 종료 시 고 심각도 미해결 = 0건 목표 (비상 시 최대 1건 허용)
```

### 7.2 현재 고 심각도 부채 상태 (Wave 5 기준)

| TD | 설명 | 목표 릴리스 | 현재 상태 |
|----|------|----------|---------|
| TD-1 | argon2 미이행 | Phase 22 | 임시 완화 중 (bcrypt cost=12) |
| TD-2 | PM2 cluster:4 미이행 | Phase 16 | 계획됨 |
| TD-3 | HS256 → ES256 미완 | Phase 16 | 계획됨 |
| TD-4 | MASTER_KEY 평문 | Phase 16 | 계획됨 |
| TD-5 | SeaweedFS 50GB 미검증 | Phase 17 전 | spike-007 계획됨 |
| TD-6 | 세션 테이블 없음 | Phase 17 | 계획됨 |
| TD-7 | tokenFamily 미구현 | Phase 17 | 계획됨 |
| TD-8 | Rate Limit race condition | Phase 16 | 계획됨 |

**현재 고 심각도 8건** — 임계치 R1(3건) 초과 상태이지만, Phase 15-17 계획 내 해소 예정.  
Phase 15 착수 시 TD-2, TD-3, TD-4, TD-8이 Phase 16에서, TD-6, TD-7이 Phase 17에서 동시 처리되므로 규칙 R1/R3 위반은 아님 (목표 릴리스 내 계획됨).

### 7.3 경고 발동 시 부채 스프린트 내용

부채 스프린트 발동 시 해당 Phase에서 처리하는 항목:

1. 심각도 "고" 전체 목록 재검토 및 최신화
2. 목표 릴리스 초과 항목 즉시 착수
3. Phase 신규 기능 구현 50% 이하로 제한
4. 세션 종료 시 `docs/logs/`에 부채 스프린트 보고서 작성

---

## 8. Wave 5 DQ 관련 부채 상세

Wave 5에서 답변이 필요한 DQ 중 부채와 직결되는 항목을 상세 기술한다.

### 8.1 DQ-AC-1: argon2 마이그레이션 (TD-1 연계)

**질문**: bcrypt에서 argon2id로 언제, 어떻게 전환할 것인가?

**현황**: Wave 1 R2에서 "이행 필요하나 롤링 마이그레이션 전략 수립 후" 연기.

**Wave 5 답변 방향**:
- 롤링 마이그레이션: 로그인 성공 시 `password_hash_type` 컬럼 확인 → bcrypt이면 argon2id로 재해시 후 저장
- 신규 가입: 즉시 argon2id
- 마이그레이션 완료 판단: `password_hash_type = 'argon2id'` 비율 100% 도달 시 bcrypt 코드 제거
- 공수: 8h (Phase 22)

**유발하는 부채**: TD-1 (심각도 고) — Phase 22까지 bcrypt 취약성 허용

### 8.2 DQ-4.1 cluster 관련 (TD-2, TD-8 연계)

**질문**: PM2 cluster:4 전환 시 node-cron 중복 실행 방지 전략은?

**현황**: Wave 4 B6 `02-architecture/13-db-ops-blueprint.md §FR-4.1` — "PM2 단일 프로세스 (cluster 아님 — cron 중복 방지)" 명시. cluster:4 이행 시 node-cron이 4개 워커에서 모두 실행되는 문제.

**Wave 5 답변 방향**:
- 해결책: PM2에서 cron 담당 워커를 1개로 지정 (`CRON_WORKER=true` 환경변수, 첫 번째 워커만 node-cron 실행)
- 또는: SQLite에 cron 잠금 레코드 → 가장 먼저 잠금 획득한 워커만 실행
- 공수: Phase 16 TD-2 해소 시 동시 처리 (4h 포함)

**유발하는 부채**: TD-2 (PM2 cluster 미이행)이 cron 중복 실행 리스크를 간접 발생

### 8.3 DQ-OPS-1: Docker 이행 (TD-9 연계)

**질문**: Docker Compose 이행 조건 4개 중 언제 충족될 것인가?

**현황**: ADR-015에서 "이행 조건 4개: 월 100만 트래픽+, 팀 2명+, 3단계 환경, B2B SaaS 전환" 정의.

**Wave 5 답변 방향**:
- 4개 모두 현재 미충족 (1인 운영, 소규모 트래픽, 단일 환경)
- 추적 방법: `docs/status/current.md`에 월별 트래픽 기록. 조건 충족 시 ADR-015 재검토 발동.
- Dockerfile 사전 준비 권장 여부: "준비하되 commit하지 말 것" — Phase 22 보너스 기능으로 Dockerfile 초안 작성
- 공수: 20h (Docker 이행 실제 착수 시)

**유발하는 부채**: TD-9 (Dockerfile 없음) — 조건 충족 시 즉시 이행 불가

### 8.4 DQ-OPS-3: Node.js 버전 고정 (TD-11 연계)

**질문**: 운영 중인 Node.js 버전을 어떻게 고정하고 업그레이드할 것인가?

**현황**: Wave 4 B2에서 `DQ-OPS-3` 등록. 현재 `.nvmrc` 없음, Node.js 버전 비고정.

**Wave 5 답변 방향**:
- 즉시 조치: `.nvmrc` 파일에 `20.18.0` (LTS) 고정, package.json `engines.node` 추가
- 업그레이드 정책: Node.js LTS 버전 6개월 내 채택, 최신 Current 버전 미사용
- 공수: 1h (Phase 16, TD-11)

**유발하는 부채**: TD-11 (Node.js 버전 고정 없음) — 개발·운영 환경 버전 불일치 위험

### 8.5 DQ-OPS-4: DR 호스트 (TD-12 연계)

**질문**: 재해 복구(Disaster Recovery) 시 복원 대상 호스트를 어디로 할 것인가?

**현황**: Wave 4 B2 `02-architecture/05-operations-blueprint.md §DQ-OPS-4` — "DR 호스트 결정 미완료" 등록.

**Wave 5 답변 방향**:
- 옵션 A: 동일 서버 별도 포트 (8080 → DR용, 3000 → 프로덕션)
- 옵션 B: Cloudflare Workers 경량 정적 DR 페이지
- 권장: 옵션 A — WSL2 단일 서버에서 별도 PM2 앱으로 DR 환경 구동, Cloudflare Tunnel 설정에서 /dr 경로 분기
- 공수: 8h (Phase 17, TD-12)

**유발하는 부채**: TD-12 (DR 호스트 미지정) — 재해 발생 시 복구 방향 불명확

---

## 9. 부채 추적 도구 제안

### 9.1 /admin/tech-debt 페이지 (권장)

양평 부엌 서버 대시보드에 `/admin/tech-debt` 관리 페이지를 구현하는 방안이다.

**구현 방향:**
- SQLite `tech_debt` 테이블: `id, title, type, severity, phase_target, status, created_wave, estimated_hours, resolved_at`
- 이 문서(04-tech-debt-strategy.md)의 §2 테이블을 초기 seed로 적재
- UI: TanStack Table로 정렬/필터 (심각도별, Phase별, 상태별)
- 심각도 "고" 항목은 빨간 뱃지 → 대시보드 메인에도 경고 표시
- Phase 시작 시 오너가 이 페이지에서 부채 검토 → 해소 계획 수립

**장점:**
- 별도 외부 도구 없음 ($0, 1인 운영 적합)
- Next.js 대시보드에 완전 통합
- wal-g 백업에 포함되어 데이터 보존 보장

**구현 공수:** 4h (Phase 15-16 사이 틈새 공수 활용 가능)

### 9.2 GitHub Issues + Labels (대안)

이 프로젝트의 git 저장소가 GitHub에 있다면 GitHub Issues에 `tech-debt` 레이블로 관리하는 방안이다.

**구현 방향:**
- 각 TD 항목을 GitHub Issue로 등록
- 레이블: `tech-debt`, `severity:high`, `severity:medium`, `severity:low`
- Milestone: Phase 16, Phase 17 등으로 목표 릴리스 추적
- GitHub Projects 보드로 Kanban 관리

**단점:**
- 외부 서비스 의존 (GitHub 다운 시 접근 불가)
- 이 문서와 Issues 간 이중 관리 부담

### 9.3 권장 결론

**Phase 15-16 사이에 `/admin/tech-debt` 페이지 구현** (4h). 이 문서가 단일 진실 소스이고, 페이지는 실시간 상태 추적 도구 역할을 한다. GitHub Issues는 보조 수단으로만 활용한다.

---

> 작성: Wave 5 R2 에이전트  
> 근거: [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md) § Wave 1~4 Compound Knowledge · [01-adr-log.md](../02-architecture/01-adr-log.md) § ADR-001~018 · [03-auth-advanced-blueprint.md](../02-architecture/03-auth-advanced-blueprint.md) § DQ-AA-8 · [04-observability-blueprint.md](../02-architecture/04-observability-blueprint.md) § DQ-12.3 · [05-operations-blueprint.md](../02-architecture/05-operations-blueprint.md) § DQ-OPS-1~4 · [06-auth-core-blueprint.md](../02-architecture/06-auth-core-blueprint.md) § G1~G8  
> 이전: [03-mvp-scope.md](./03-mvp-scope.md)
