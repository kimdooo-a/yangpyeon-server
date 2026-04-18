# 제약 + 가정 (Constraints & Assumptions) — Supabase 100점 동등성

> Wave 3 (W3-R2) | 양평 부엌 서버 대시보드 — Supabase Parity
> 작성: 2026-04-18 (세션 26) | 근거: Wave 1+2 채택안 + `_CHECKPOINT_KDYWAVE.md` + `_PROJECT_VS_SUPABASE_GAP.md`
> 상위: [00-vision/](./) → [research/2026-04-supabase-parity/](../) → [CLAUDE.md](../../../../CLAUDE.md)

---

## 0. 개요

이 문서는 Supabase 100점 동등성 프로젝트의 **제약조건(Constraints)** 과 **가정(Assumptions)** 을 정의한다. vision-suite 템플릿 Part C3 + C4 구조를 따르며, 다음 두 섹션으로 구성된다.

### 0.1 구조

| 섹션 | 약칭 | 목적 | 개수 |
|------|------|-----|------|
| C3. Constraints | CON | 움직일 수 없는 경계, 설계 전제 | **12개** |
| C4. Assumptions | ASM | 검증이 필요한 전제, 리스크 원천 | **12개** |

### 0.2 구분 원칙

- **Constraint**: 비즈니스/기술/환경이 강제한 **고정 조건**. 수용하고 설계해야 하는 대상.
- **Assumption**: 현재 참이라 **믿고 있는 전제**. 틀릴 경우 위험 발생, 검증 필요.

### 0.3 우선순위 / 위험도

| 기호 | CON 영향도 | ASM 위험도 |
|------|-----------|-----------|
| 🔴 고 | 위반 시 프로젝트 성립 불가 | 틀리면 재설계 필요 |
| 🟡 중 | 위반 시 주요 재설계 | 틀리면 우회책 필요 |
| 🟢 저 | 위반 가능, 우회책 존재 | 틀려도 소폭 조정 |

### 0.4 변경 이력

| 버전 | 일자 | 작성자 | 변경 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | W3-R2 Agent | 초안 작성 (CON 12개, ASM 12개) |

---

## 1. C3. Constraints (CON)

### 1.1 제약 매트릭스 요약

| # | 제약조건 | 유형 | 영향도 | 설명 요약 | 영향 FR/NFR |
|---|---------|------|-------|----------|-------------|
| CON-1 | 단일 서버 운영 | 기술/환경 | 🔴 고 | WSL2 Ubuntu 1개, 수평 스케일 없음 | NFR-PERF, NFR-REL.3~5 |
| CON-2 | Cloudflare Tunnel만 | 기술/환경 | 🔴 고 | 공용 IP 노출 없음, localhost 바인딩만 | NFR-SEC.5, FR-14.2 |
| CON-3 | 1인 운영 | 비즈니스 | 🔴 고 | 24/7 on-call 없음, 단순성 우선 | NFR-MNT.1~4, NFR-REL.5 |
| CON-4 | PostgreSQL만 | 기술 | 🔴 고 | MySQL/MongoDB 지원 거부 (Wave 1 결정) | FR-1, FR-3, FR-11 |
| CON-5 | No Multi-tenancy | 비즈니스 | 🟡 중 | 의도적 제외 (09-multi-tenancy-decision.md) | FR-5, FR-11 |
| CON-6 | Windows 개발 / Linux 배포 | 환경 | 🟡 중 | WSL2 경유 배포, 빌드/배포 분리 | FR-14, NFR-CMP.4 |
| CON-7 | 라이선스 MIT/Apache/BSD만 | 법적 | 🔴 고 | GPL/AGPL 거부 | 전 의존성 |
| CON-8 | 도메인 stylelucky4u.com 고정 | 비즈니스 | 🟢 저 | 서브도메인 확장 가능 | FR-14.2 |
| CON-9 | 예산 $10/월 이하 | 비즈니스 | 🟡 중 | 운영비 + AI $5 별도 | NFR-COST.1~2 |
| CON-10 | bcrypt → argon2 마이그레이션 비용 제외 | 기술 부채 | 🟡 중 | Wave 3 범위 외, 장기 로드맵 | FR-5 (Auth Core) |
| CON-11 | AGPL/SSPL 의존성 금지 | 법적 | 🔴 고 | MinIO 2026-02-12 AGPL 전환 배제 사유 | FR-7 (Storage) |
| CON-12 | 데이터 주권 = 한국 | 법적/비즈니스 | 🟡 중 | 원본 DB/스토리지는 국내, 백업 B2(US)만 예외 | NFR-SEC, NFR-COST |

### 1.2 상세 정의

#### CON-1. 단일 서버 운영

| 필드 | 값 |
|------|-----|
| **유형** | 기술 / 환경 |
| **영향도** | 🔴 고 |
| **설명** | 프로덕션은 WSL2 Ubuntu 22.04 LTS 단일 인스턴스. 수평 스케일(로드 밸런서 + N개 노드) 없음. 수직 스케일은 가능(RAM 증설). |
| **근거** | 1인 운영 · 예산 제약 · 현재 트래픽 규모 (ASM-9 연계) |
| **함의** | (1) 상태 저장 컴포넌트(PostgreSQL, SeaweedFS)는 로컬 디스크, (2) 무중단 배포는 PM2 cluster:4 reload로 달성, (3) SPOF는 자동 복구 스크립트로 완화 |
| **영향 FR/NFR** | NFR-PERF (처리량 상한), NFR-REL.3~5, FR-14 |
| **재검토 조건** | 월 요청 > 100만, CPU 지속 > 80%, 다운타임 연 > 4h |

#### CON-2. Cloudflare Tunnel만 허용

| 필드 | 값 |
|------|-----|
| **유형** | 기술 / 환경 |
| **영향도** | 🔴 고 |
| **설명** | 공용 IPv4/IPv6 노출 없음. `cloudflared` 터널을 통해서만 인바운드 트래픽. Next.js는 `127.0.0.1:3000`에만 바인딩. UFW로 외부 인바운드 차단. |
| **근거** | 자체호스팅 보안 강화, DDoS 완화, 정적 IP 불필요, Cloudflare 무료 플랜 활용 |
| **함의** | (1) mTLS는 Cloudflare Edge에서 terminate, (2) 실 클라이언트 IP는 `CF-Connecting-IP` 헤더, (3) WebSocket/SSE는 Cloudflare HTTP/2 지원 |
| **영향 FR/NFR** | NFR-SEC.5, FR-14.2, FR-9 (Realtime) |
| **재검토 조건** | Cloudflare Tunnel SLA 99.5% 미만 지속, 또는 월 트래픽 1TB 초과 |

#### CON-3. 1인 운영

| 필드 | 값 |
|------|-----|
| **유형** | 비즈니스 |
| **영향도** | 🔴 고 |
| **설명** | 개발 · 운영 · 장애 대응 모두 1인(김도영). 24/7 on-call 불가. 주/야간 장애 발생 시 자동 복구 우선. |
| **근거** | 프로젝트 소유자 단일, 외부 고용 없음 |
| **함의** | (1) 단순성 > 기능 풍부함, (2) 자동화 > 수동 개입, (3) 문서화는 미래의 자신을 위해 작성, (4) 의사결정은 빠르지만 리뷰어 부족 → 체크리스트 보완 |
| **영향 FR/NFR** | NFR-MNT.1~4, NFR-REL.5, NFR-UX.1 |
| **재검토 조건** | 팀 확장 시 (2인 이상) — 전체 재검토 |

#### CON-4. PostgreSQL만 (유일한 주 DB)

| 필드 | 값 |
|------|-----|
| **유형** | 기술 |
| **영향도** | 🔴 고 |
| **설명** | 주 DB는 **PostgreSQL 15+** 단일. MySQL/MariaDB/MongoDB/DynamoDB 지원 거부. SQLite는 **보조** 용도(로컬 캐시, Drizzle 샘플)만 허용. |
| **근거** | Wave 1 결정 (모든 채택안이 PG 확장/기능 기반 — wal2json, pgmq, splinter, Prisma 7), 다중 DB 지원 비용 > 이익 |
| **함의** | (1) Schema Visualizer는 PG 전용, (2) Data API는 PostgREST 방언, (3) 사용자에게 "PG를 알아야 함" 전제 부여 |
| **영향 FR/NFR** | FR-1, FR-2, FR-3, FR-4, FR-11, NFR-CMP.2 |
| **재검토 조건** | 없음 (의도적 단일화) |

#### CON-5. No Multi-tenancy (의도적 제외)

| 필드 | 값 |
|------|-----|
| **유형** | 비즈니스 |
| **영향도** | 🟡 중 |
| **설명** | SaaS 풍의 orgs/teams/projects 다계층 테넌트는 지원하지 않는다. 사용자(`auth.users`)는 단일 workspace에 속한다. |
| **근거** | [09-multi-tenancy-decision.md] 참조 — 1인 운영 + 단일 도메인 + 복잡도 대비 수요 없음 |
| **함의** | (1) RLS는 tenant 격리가 아닌 role 기반, (2) Supabase의 `auth.uid()` 패턴은 유지, `organization_id` 컬럼 강제는 없음, (3) 추후 필요 시 migration path 문서화 |
| **영향 FR/NFR** | FR-5, FR-6, FR-11, NFR-CMP.1 |
| **재검토 조건** | 외부 서비스형 제공 시, 또는 2개 이상 독립 조직이 한 인스턴스 공유 요구 시 |

#### CON-6. Windows 개발 / Linux 배포

| 필드 | 값 |
|------|-----|
| **유형** | 환경 |
| **영향도** | 🟡 중 |
| **설명** | 개발 머신은 Windows 11, WSL2 내부에서 배포. 빌드는 Windows에서 가능하나 **최종 배포 대상은 Linux x86_64**. |
| **근거** | 운영자 환경 + WSL2 성숙도 |
| **함의** | (1) 경로 구분자 이슈(`\` vs `/`) 유의, (2) native module은 Linux 빌드 필수(`isolated-vm` 재빌드), (3) 파일 권한/소유자는 WSL2에서 명시 |
| **영향 FR/NFR** | FR-14 (Operations), NFR-CMP.4 |
| **재검토 조건** | macOS 이주 또는 CI 빌드 도입 시 |

#### CON-7. 라이선스: MIT / Apache-2.0 / BSD만 허용

| 필드 | 값 |
|------|-----|
| **유형** | 법적 |
| **영향도** | 🔴 고 |
| **설명** | 의존성 및 포크/차용 코드는 **MIT, Apache-2.0, BSD-2/3-Clause, ISC** 라이선스만 허용. **GPL, AGPL, SSPL** 거부. LGPL은 dynamic link 한정으로 허용(감사 필수). |
| **근거** | 자체호스팅 배포 시 소스 공개 의무 회피, 상용 재배포 가능성 확보 |
| **함의** | (1) MinIO(AGPL 전환) 배제 원인, (2) 포크/차용 시 라이선스 헤더 보존, (3) `license-checker` CI 단계 필수 |
| **영향 FR/NFR** | 전 의존성, 특히 FR-2 (supabase-studio Apache-2.0 활용), FR-7 (Storage) |
| **재검토 조건** | 없음 (원칙 고정) |

#### CON-8. 도메인 stylelucky4u.com 고정

| 필드 | 값 |
|------|-----|
| **유형** | 비즈니스 |
| **영향도** | 🟢 저 |
| **설명** | 프로덕션 도메인은 `stylelucky4u.com`으로 고정. 서브도메인(`api.`, `canary.`, `storage.`) 확장 가능. |
| **근거** | 기존 자산, 브랜드 일관성 |
| **함의** | (1) JWT `iss` 클레임에 도메인 하드코딩, (2) CORS 허용 origin 고정, (3) Cloudflare 존 단일 |
| **영향 FR/NFR** | FR-14.2, NFR-SEC.9 (CORS) |
| **재검토 조건** | 리브랜딩 시 |

#### CON-9. 예산 $10/월 이하

| 필드 | 값 |
|------|-----|
| **유형** | 비즈니스 |
| **영향도** | 🟡 중 |
| **설명** | 운영비 상한은 **월 $10**. 이에는 도메인(연 $15 → 월 $1.25), Cloudflare 무료, B2 오브젝트 스토리지($0.005/GB/월), 전기료(미산입), ISP (미산입) 포함. AI 비용은 $5 별도 (NFR-COST.2). |
| **근거** | 1인 사이드 프로젝트 지속가능성 |
| **함의** | (1) SaaS 외부 의존 최소화, (2) AWS/GCP 관리형 서비스 금지, (3) Docker Hub pro 미사용, (4) CI는 GitHub Actions 무료 플랜 내 |
| **영향 FR/NFR** | NFR-COST.1~2, 의존성 선택 전반 |
| **재검토 조건** | 수익화 시작 또는 팀 확장 시 |

#### CON-10. bcrypt → argon2 마이그레이션 비용 제외

| 필드 | 값 |
|------|-----|
| **유형** | 기술 부채 |
| **영향도** | 🟡 중 |
| **설명** | Auth Core는 현재 bcrypt 기반이며, argon2id로의 교체는 Wave 3 범위 외. 장기 로드맵(Wave 5 Phase 20+)에서 재검토. 신규 해시는 그대로 bcrypt, 기존 저장 해시는 점진적 upgrade-on-login 가능성 열어둠. |
| **근거** | bcrypt도 OWASP Acceptable, argon2 이주 공수 > 단기 이득 |
| **함의** | (1) Auth Core Phase는 bcrypt 유지, (2) `password_hash` 컬럼 알고리즘 prefix(`$2b$`) 검사 |
| **영향 FR/NFR** | FR-5 (Auth Core), NFR-SEC.3 |
| **재검토 조건** | argon2 Node 바인딩 성숙 + 공격 벡터 변화 |

#### CON-11. AGPL / SSPL 의존성 금지

| 필드 | 값 |
|------|-----|
| **유형** | 법적 |
| **영향도** | 🔴 고 |
| **설명** | AGPL, SSPL (MongoDB, Elastic 2.0, Confluent Community License 포함) 라이선스 의존성은 **원천 금지**. |
| **근거** | 네트워크 서비스 이용 시에도 소스 공개 의무 — 자체호스팅 배포 모델 비호환 |
| **함의** | (1) MinIO 2026-02-12 AGPL 전환 → 배제 확정, (2) MongoDB 원천 거부(CON-4와 중첩), (3) 의존성 선택 시 라이선스 우선 확인 |
| **영향 FR/NFR** | FR-7 (Storage) SeaweedFS 선택의 주 이유, 전 카테고리 |
| **재검토 조건** | 없음 (원칙 고정) |

#### CON-12. 데이터 주권 = 한국

| 필드 | 값 |
|------|-----|
| **유형** | 법적 / 비즈니스 |
| **영향도** | 🟡 중 |
| **설명** | 원본 DB와 Hot 스토리지(SeaweedFS)는 **한국 내 WSL2 서버**에 위치. 개인정보가 포함된 경우 국외 이전 제한. B2 백업(US)은 **암호화된 백업 용도**로 한정 예외 (GDPR/PIPA 검토 필요 시 재평가). |
| **근거** | 개인정보보호법(PIPA) 제28조, 한국 사용자 대상 서비스 |
| **함의** | (1) B2 업로드 전 envelope 암호화 적용, (2) Claude API 호출 시 민감 정보 redact, (3) Cloudflare Edge 캐시에 PII 저장 금지 |
| **영향 FR/NFR** | NFR-SEC.2 (envelope), NFR-COST.1 (B2), FR-7 (Storage) |
| **재검토 조건** | 해외 사용자 서비스 확장 시 |

---

## 2. C4. Assumptions (ASM)

### 2.1 가정 매트릭스 요약

| # | 가정 | 검증 시점 | 위험도 | 영향 영역 |
|---|------|----------|-------|----------|
| ASM-1 | 1인 운영자 Node.js/TS 숙련도 | 구현 착수 시 | 🔴 고 | 전 카테고리 |
| ASM-2 | Cloudflare Tunnel 안정성 99.9%+ | 6개월 운영 데이터 | 🟡 중 | NFR-REL |
| ASM-3 | WSL2 I/O 성능 충분 | 벤치마크 | 🟡 중 | NFR-PERF, FR-7 |
| ASM-4 | SeaweedFS filer + volume 단일 노드 안정 | 스파이크 50GB+ | 🔴 고 | FR-7 |
| ASM-5 | isolated-vm v6 Node 24 호환 | Edge Fn 스파이크 | 🔴 고 | FR-8 |
| ASM-6 | wal2json CDC 안정성 | Realtime 스파이크 7일 운영 | 🟡 중 | FR-9 |
| ASM-7 | pgmq 확장 production-ready | Data API 스파이크 | 🟡 중 | FR-11 |
| ASM-8 | Cloudflare 무료 플랜 로드 내 | 트래픽 모니터링 | 🟢 저 | NFR-COST |
| ASM-9 | 월 평균 요청 10만 이하 | 초기 3개월 | 🟢 저 | NFR-PERF |
| ASM-10 | Claude Haiku + Sonnet 월 $5 이하 | AI SDK 로그 | 🟡 중 | NFR-COST.2 |
| ASM-11 | Prisma 7 + PostgreSQL 17 안정성 | CI matrix | 🟡 중 | 전 카테고리 |
| ASM-12 | 1인 오너 on-call 가용성 (주 5회) | 3개월 사후 | 🟡 중 | NFR-REL |

### 2.2 상세 정의

#### ASM-1. 1인 운영자 Node.js/TS 숙련도

| 필드 | 값 |
|------|-----|
| **가정** | 운영자(김도영)는 Node.js 24 + TypeScript 5.x + Next.js 16 App Router + Prisma 7 + PM2를 **중급 이상** 수준으로 구현 가능하다. shadcn/ui + Tailwind 4 + xyflow 등 프론트엔드 스택도 함께 숙지. |
| **검증 시점** | Wave 4 청사진 이후 실제 구현 착수 시 |
| **검증 방법** | (1) Wave 1 스파이크 4건 (세션 12) 재검토, (2) 초기 Phase 15 (Auth Core) 1주 속도 측정, (3) kdyinvestigate 연속 발동 빈도 |
| **위험도** | 🔴 고 |
| **틀릴 경우 완화책** | (a) 스킬셋 gap 식별 후 학습 주간 배정, (b) 복잡 모듈은 kdyswarm 병렬 분해로 개별 크기 축소, (c) Wave 5 로드맵 시간 50% 버퍼 |

#### ASM-2. Cloudflare Tunnel 안정성 99.9%+

| 필드 | 값 |
|------|-----|
| **가정** | Cloudflare Tunnel 무료 플랜은 **월 가용성 99.9% 이상** 유지되며, WebSocket/SSE/HTTP/2 모두 안정 동작한다. |
| **검증 시점** | 프로덕션 출시 후 6개월 운영 데이터 |
| **검증 방법** | (1) Cloudflare Status 페이지 모니터링, (2) 자체 canary ping → `status.stylelucky4u.com` uptime 로그, (3) WebSocket 장기 연결 drop률 |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) Tailscale Funnel 백업 터널, (b) 유료 플랜 Cloudflare Zero Trust ($7/user/월) 승격 검토 |

#### ASM-3. WSL2 I/O 성능 충분

| 필드 | 값 |
|------|-----|
| **가정** | WSL2 Ubuntu + ext4 파일시스템의 I/O 성능은 Storage(SeaweedFS 80MB/s write), PostgreSQL WAL (60초 RPO), CDC(wal2json 200ms) 목표를 충족한다. |
| **검증 시점** | 구현 초기 벤치마크 (스파이크 단계) |
| **검증 방법** | (1) `fio` 랜덤 write 4K/128K 벤치마크, (2) PostgreSQL `pgbench -c 10 -T 60` TPS, (3) SeaweedFS `weed benchmark` |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) `\\wsl.localhost\Ubuntu\home\...` Windows 파일시스템 교차 접근 제거, (b) Docker Desktop WSL2 backend 최적화, (c) 베어메탈 Ubuntu 이주(장기) |

#### ASM-4. SeaweedFS filer + volume 단일 노드 안정

| 필드 | 값 |
|------|-----|
| **가정** | SeaweedFS의 filer + volume 1 노드 배치 모드는 **50GB+ 데이터 규모에서 7일 연속 운영** 시 데이터 손실 없이 안정 동작한다. |
| **검증 시점** | Storage 스파이크 프로토타입 단계 |
| **검증 방법** | (1) 프로토타입 50GB 데이터 주입 + 7일 운영, (2) 임의 시점 SIGKILL 후 재시작 무결성 확인, (3) B2 async replication lag 감시 |
| **위험도** | 🔴 고 |
| **틀릴 경우 완화책** | (a) Garage (BSD 라이선스)로 백업안 전환(Wave 1 2위), (b) 단일 노드 대신 multi-volume 구성, (c) 파일 청크 크기 조정 |

#### ASM-5. isolated-vm v6 Node 24 호환

| 필드 | 값 |
|------|-----|
| **가정** | `isolated-vm` v6.x는 **Node.js 24 LTS**에서 native build 성공 + runtime 정상 동작한다. `v8` ABI 호환성 문제 없음. |
| **검증 시점** | Edge Functions 스파이크 (Wave 1에서 "조건부 GO" 완료) |
| **검증 방법** | (1) `npm install isolated-vm` 성공률, (2) 1000회 Isolate 생성/소멸 + 메모리 누수 테스트, (3) cold start 50ms 목표 도달 |
| **위험도** | 🔴 고 |
| **틀릴 경우 완화책** | (a) Node 22 LTS로 downgrade, (b) 3층 하이브리드 중 Deno 사이드카 비중 확대, (c) Vercel Sandbox 위임 비중 확대 |

#### ASM-6. wal2json CDC 안정성

| 필드 | 값 |
|------|-----|
| **가정** | `wal2json` 확장은 PostgreSQL 15/16/17에서 **7일 연속 logical replication** 수행 시 slot bloat, 메시지 순서 보장, WAL 축적 없이 안정 동작한다. |
| **검증 시점** | Realtime 스파이크 (Wave 1에서 "조건부 GO" 완료) |
| **검증 방법** | (1) 10 TPS 쓰기 부하 + 7일 운영, (2) `pg_replication_slots` 모니터링, (3) 메시지 순서 감사 (시퀀스 홀 감지) |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) supabase-realtime 포팅 단독 모드로 전환, (b) `pgoutput` 네이티브로 이주, (c) 단방향 polling fallback |

#### ASM-7. pgmq 확장 production-ready

| 필드 | 값 |
|------|-----|
| **가정** | `pgmq` 확장 v1.x는 **30초 이내 잡 실행 SLA** + at-least-once 배달 + 컨슈머 lease 갱신을 단일 PostgreSQL 인스턴스에서 안정 수행한다. |
| **검증 시점** | Data API 스파이크 (Wave 1 Round 2) |
| **검증 방법** | (1) 1000 msg 큐 + 병렬 워커 4개, (2) 컨슈머 크래시 시 재처리 확인, (3) `pgmq.metrics` 테이블 lag 감시 |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) BullMQ + Redis 전환 (단, 예산/의존성 증가), (b) SQLite 보조 큐 + node-cron (이미 2순위로 채택), (c) Outbox 테이블 + polling |

#### ASM-8. Cloudflare 무료 플랜 로드 내

| 필드 | 값 |
|------|-----|
| **가정** | Cloudflare 무료 플랜의 터널 대역폭 / 페이지 뷰 / Workers invocation 쿼터는 프로젝트 트래픽(ASM-9)을 커버한다. |
| **검증 시점** | 출시 후 3개월 트래픽 모니터링 |
| **검증 방법** | (1) Cloudflare 분석 탭 월간 리포트, (2) Tunnel 대역폭 실측, (3) 429/529 에러 빈도 |
| **위험도** | 🟢 저 |
| **틀릴 경우 완화책** | (a) 유료 Pro 플랜 $20/월 승격, (b) CDN 미사용 경로 최적화 |

#### ASM-9. 월 평균 요청 10만 이하

| 필드 | 값 |
|------|-----|
| **가정** | 초기 1년간 월 평균 HTTP 요청 수는 **100,000회 이하**이며, 피크 TPS < 50이다. |
| **검증 시점** | 출시 후 초기 3개월 |
| **검증 방법** | (1) Pino 요청 로그 집계, (2) Prometheus `http_requests_total` rate(5m) |
| **위험도** | 🟢 저 |
| **틀릴 경우 완화책** | (a) PM2 cluster:8로 확장, (b) RAM 증설(수직 스케일), (c) PostgREST-style aggressive caching |

#### ASM-10. Claude Haiku + Sonnet 비용 월 $5 이하

| 필드 | 값 |
|------|-----|
| **가정** | AI SDK v6 Anthropic provider로 Haiku 4.7 기본 라우팅 + Sonnet 4.7 승격 가드 적용 시, 월 AI 사용 비용이 **$5 이하** 유지된다 (1인 운영 사용 패턴 가정). |
| **검증 시점** | 출시 후 매월 |
| **검증 방법** | (1) Anthropic Console usage, (2) AI SDK `usage.totalTokens` × 공시 단가 집계 |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) Sonnet 승격 가드 threshold 강화, (b) Prompt caching 적극 활용, (c) BYOK 옵션으로 사용자 자체 부담 전환 |

#### ASM-11. Prisma 7 + PostgreSQL 17 안정성

| 필드 | 값 |
|------|-----|
| **가정** | Prisma 7 `migrate` + `generate` + query engine이 PostgreSQL 17까지 지원하며, breaking change 발생 시 Wave 1~2 기준 단기 우회가 가능하다. |
| **검증 시점** | CI matrix 매 주 + Prisma release note 모니터링 |
| **검증 방법** | (1) GitHub Actions PG 15/16/17 matrix build, (2) `prisma migrate diff` 회귀 테스트, (3) Prisma Discord changelog follow |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) Prisma 6 downgrade, (b) 특정 쿼리에 한해 `@prisma/adapter-pg` raw로 우회, (c) Drizzle 부분 이주 (SQLite 이미 사용 중) |

#### ASM-12. 1인 오너 on-call 가용성 (주 5회)

| 필드 | 값 |
|------|-----|
| **가정** | 운영자는 **주 5회 이상** 서비스 상태를 확인 가능하며, critical alert(예: Cloudflare down, DB crash) 발생 시 **1시간 이내 대응 개시** 가능하다. |
| **검증 시점** | 출시 후 3개월 사후 |
| **검증 방법** | (1) Prometheus alertmanager 응답 시간 기록, (2) 수동 점검 로그 |
| **위험도** | 🟡 중 |
| **틀릴 경우 완화책** | (a) 자동 복구 스크립트 범위 확대 (NFR-REL.5), (b) 읽기 전용 모드 자동 전환 기능, (c) status.stylelucky4u.com 공개 상태 페이지 |

---

## 3. 영향 매트릭스

### 3.1 CON × FR 교차표 (주요)

| | FR-1~3 Table/SQL/Schema | FR-4 DB Ops | FR-5~6 Auth | FR-7 Storage | FR-8 Edge Fn | FR-9 Realtime | FR-11 Data API | FR-13 UX | FR-14 Ops |
|-|-|-|-|-|-|-|-|-|-|
| CON-1 단일 서버 | ● | ● | — | ● | ● | ● | ● | — | ● |
| CON-2 Cloudflare | — | — | ● | — | — | ● | ● | — | ● |
| CON-3 1인 운영 | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| CON-4 PG only | ● | ● | ● | — | — | ● | ● | — | — |
| CON-5 No Multi-tenant | — | — | ● | — | — | — | ● | — | — |
| CON-7 라이선스 | ● (supabase-studio 차용) | ● | ● | ● (SeaweedFS Apache) | ● | ● | ● | ● | ● |
| CON-9 예산 | — | — | — | ● (B2) | — | — | — | ● (Claude) | ● |
| CON-11 AGPL 금지 | — | — | — | ● (MinIO 배제) | — | — | — | — | — |

● = 강한 영향, — = 약한 영향

### 3.2 ASM × NFR 교차표 (주요)

| | NFR-PERF | NFR-SEC | NFR-REL | NFR-COST | NFR-CMP |
|-|-|-|-|-|-|
| ASM-1 TS 숙련도 | 간접 | 간접 | 간접 | — | — |
| ASM-2 Cloudflare | ● | ● | ● | ● | — |
| ASM-3 WSL2 I/O | ● | — | ● | — | ● |
| ASM-4 SeaweedFS | ● | — | ● | — | — |
| ASM-5 isolated-vm | ● | ● | — | — | ● |
| ASM-6 wal2json | ● | — | ● | — | ● |
| ASM-7 pgmq | ● | — | ● | — | ● |
| ASM-9 트래픽 | ● | — | ● | ● | — |
| ASM-10 AI 비용 | — | — | — | ● | — |
| ASM-11 Prisma 7 | — | — | — | — | ● |

---

## 4. 검증 계획 (Assumption Validation Plan)

### 4.1 Wave별 검증 배치

| Wave | 검증 대상 ASM | 방법 |
|------|-------------|------|
| Wave 4 (청사진) | ASM-1, ASM-3 | 설계 세부 작성 시 실현 가능성 검토 |
| Wave 5 (스파이크) | ASM-4, ASM-5, ASM-6, ASM-7 | 프로토타입 구현 |
| Phase 15~20 (구현) | ASM-11 | CI matrix 회귀 |
| 출시 후 3개월 | ASM-2, ASM-8, ASM-9, ASM-10, ASM-12 | 운영 데이터 수집 |

### 4.2 조기 경보 지표 (EWI)

| 가정 | 경보 임계값 | 조치 |
|------|-----------|------|
| ASM-2 | Cloudflare Tunnel 월 가용성 < 99.5% | 백업 터널 준비 |
| ASM-4 | SeaweedFS restart failure > 1건/주 | Garage 이주 스파이크 |
| ASM-9 | 월 요청 > 50만 | 용량 계획 갱신 |
| ASM-10 | 월 AI 비용 > $8 | Sonnet 가드 강화 |

---

## 5. 관련 문서

- [02-functional-requirements.md](./02-functional-requirements.md) — FR
- [03-non-functional-requirements.md](./03-non-functional-requirements.md) — NFR
- [05-100점-definition.md](./05-100점-definition.md) — 100점 정의 (Wave 3 M1)
- [07-dq-matrix.md](./07-dq-matrix.md) — DQ 매트릭스 (Wave 3 M2)
- [08-security-threat-model.md](./08-security-threat-model.md) — 보안 위협 모델 (Wave 3 M2)
- [09-multi-tenancy-decision.md](./09-multi-tenancy-decision.md) — Multi-tenancy 결정 (Wave 3 M3) — CON-5 근거
- [../_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md) — 진행 체크포인트
- [../../references/_PROJECT_VS_SUPABASE_GAP.md](../../../references/_PROJECT_VS_SUPABASE_GAP.md) — 현 프로젝트 vs Supabase 갭 분석

---

> 다음 단계: Wave 4 청사진 작성 시 각 CON을 **설계 전제**로 인용하고, 각 ASM은 스파이크/CI/운영 모니터링으로 검증 절차에 연결한다. 검증 결과 틀렸다고 판명된 ASM은 즉시 재설계 트리거로 에스컬레이션한다.
