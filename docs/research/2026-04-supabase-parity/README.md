# Supabase 100점 동등성 — Wave 리서치 마스터 인덱스

> 양평 부엌 서버 대시보드의 14개 카테고리를 Supabase Cloud 동등 수준(100점)으로 끌어올리기 위한 체계적 리서치·설계 프로젝트.
> 규모: **L** | Wave: **5** | 예상 문서: **~91개** (Wave 1 = 33)
> 시작: 2026-04-18 (세션 24) | 근거: [이전 평가표](../../../) + [_PROJECT_VS_SUPABASE_GAP.md](../../references/_PROJECT_VS_SUPABASE_GAP.md)

상위: [CLAUDE.md](../../../CLAUDE.md) → [docs/](../../) → [research/](../) → **여기**

---

## 진행 상태 대시보드

| Wave | 단계 | 상태 | 문서 수 | 줄 수 | 비고 |
|------|------|------|---------|-------|------|
| 1 | 기초 deep-dive | 🔄 Round 2 진행 | 15/33 | 12,862 | Round 1 ✅ (5 카테고리), Round 2 🔄 (9 카테고리) |
| 2 | 비교 매트릭스 + 1:1 | ⏳ 대기 | 0/~28 | — | Wave 1 완료 후 |
| 3 | 100점 정의 + FR/NFR | ⏳ 대기 | 0/6 | — | |
| 4 | 카테고리별 청사진 | ⏳ 대기 | 0/14 | — | |
| 5 | 로드맵 + 스파이크 | ⏳ 대기 | 0/12 | — | |

## 14 카테고리 + Round 1 결론

| # | 카테고리 | 현재 | 1순위 후보 | Round 1 점수 | 100점 청사진 |
|---|---------|------|-----------|-------------|-------------|
| 1 | Table Editor | 75 | **TanStack v8 + 14c-α 자체구현** | 4.6/5 | 14c-α(85)→14c-β(93)→14d(99)→14e(100) |
| 2 | SQL Editor | 70 | (Round 2) | — | — |
| 3 | Schema Visualizer | 65 | (Round 2) | — | — |
| 4 | DB Ops (Webhooks/Cron/Backups) | 60 | (Round 2) | — | — |
| 5 | Auth Core (RBAC/감사) | 70 | (Round 2) | — | — |
| 6 | **Auth Advanced** ★ | 15 | **TOTP + WebAuthn + PostgreSQL Rate Limit** | 4.59/5 | Phase15(TOTP)→16(WebAuthn)→17(Rate Limit) = 60점, OAuth/CAPTCHA로 +40 |
| 7 | **Storage** ★ | 40 | **SeaweedFS** (Garage 차선) | 4.25/5 | SeaweedFS 단독으로 90~95점 도달 |
| 8 | **Edge Functions** ★ | 45 | **3층 하이브리드** (isolated-vm v6 + Deno 사이드카 + Sandbox 위임) | 4.22/5 | 92~95점 |
| 9 | **Realtime** ★ | 55 | **wal2json + supabase-realtime 포팅 하이브리드** | 4.05/5 | 100/100 도달 |
| 10 | Advisors | 65 | (Round 2) | — | — |
| 11 | Data API + Integrations | 45 | (Round 2) | — | — |
| 12 | Observability + Settings | 65 | (Round 2) | — | — |
| 13 | UX Quality | 75 | (Round 2) | — | — |
| 14 | Operations | 80 | (Round 2) | — | — |

★ = 사전 스파이크 검증 카테고리 (모두 "조건부 GO")

> Multi-tenancy 의도적 제외 (자체호스팅 컨텍스트).

## 핵심 의사결정 질문 (DQ) — Round 1 후 갱신

### 답변 완료 (Wave 1 잠정)

| DQ# | 카테고리 | 질문 | 잠정 답변 | 근거 문서 |
|-----|---------|------|----------|----------|
| DQ-1.1 | auth-advanced | TOTP만 vs WebAuthn 동시? | ✅ **동시 지원** | 06-auth-advanced/01,02 |
| DQ-1.2 | auth-advanced | Rate Limit 저장소? | ✅ **PostgreSQL/Prisma** | 06-auth-advanced/03 |
| DQ-1.3 | storage | S3 호환 엔진? | ✅ **SeaweedFS** | 07-storage/03 |
| DQ-1.4 | edge-functions | Edge runtime? | ✅ **isolated-vm v6 + Deno 사이드카 + Sandbox 위임 (3층)** | 08-edge-functions/01,02,03 |
| DQ-1.5 | realtime | CDC 구현? | ✅ **wal2json + supabase-realtime 포팅 (하이브리드)** | 09-realtime/01,03 |
| DQ-1.9 | table-editor | 라이브러리 선택? | ✅ **TanStack v8 자체구현 유지 + 14c-α** | 01-table-editor/01 |

### 미답변 (Round 2 예정)

| DQ# | 카테고리 | 질문 | Wave |
|-----|---------|------|------|
| DQ-1.6 | data-api | GraphQL: pg_graphql vs PostGraphile vs 자체구현? | 1 (Round 2) |
| DQ-1.7 | data-api | Queue: pgmq vs BullMQ vs SQLite? | 1 (Round 2) |
| DQ-1.8 | observability | Vault: pgsodium vs node:crypto + master key? | 1 (Round 2) |

### 신규 등록 — Round 1 발견 (글로벌 시퀀스)

| DQ# | 카테고리 | 질문 | 다음 답변 Wave |
|-----|---------|------|--------------|
| DQ-1.10 | realtime | realtime-js 클라이언트와 자체 Phoenix 포팅 서버 간 회귀 테스트 절차? | 4 |
| DQ-1.11 | realtime | idle replication slot drop cron의 1시간 임계값이 PM2 graceful restart 30s 윈도우에 충분한가? | 3 |
| DQ-1.12 | auth-advanced | WebAuthn 활성 사용자에게 TOTP 강제 비활성화 옵션? | 3 |
| DQ-1.13 | auth-advanced | WebAuthn challenge 저장: Redis vs Prisma 임시 테이블? | 4 |
| DQ-1.14 | auth-advanced | FIDO MDS 통합으로 인증기 신뢰성 검증? | 5 |
| DQ-1.15 | auth-advanced | 계정 락 해제: 관리자 수동 vs 시간 자동? | 3 |
| DQ-1.16 | auth-advanced | 잠긴 계정 이메일 알림 (스팸 vs 보안 인식)? | 3 |
| DQ-1.17 | auth-advanced | rate limit 응답 표시: 정확한 시간 vs "잠시 후"? | 3 |
| DQ-1.18 | storage | imgproxy 사이드카 필수성 (SeaweedFS 내장 vs imgproxy 별도)? | 2 |
| DQ-1.19 | storage | SeaweedFS Filer 메타데이터 백엔드를 우리 PostgreSQL과 공유 시 충돌? | 4 |
| DQ-1.20 | storage | Cloudflare Tunnel + Volume Server 인증 패턴 (CF Access vs Next.js 프록시)? | 4 |
| DQ-1.21 | storage | RustFS (Apache 2.0 + Rust + 2.3x MinIO 성능) 별도 평가? | 2 |
| DQ-1.22 | edge-functions | workerd를 isolated-vm 대신 메인 엔진으로 대체? | 2 |
| DQ-1.23 | edge-functions | Vercel Sandbox 외부 SaaS 정책 예외 수용 여부? | 3 |
| DQ-1.24 | edge-functions | isolated-vm bus factor=1 → fork 모니터링 정책? | 5 |

### Wave 2~5에서 자동 등록 예정

| DQ# | 질문 |
|-----|------|
| DQ-2.1~14 | 각 카테고리 1순위 기술 최종 선택 |
| DQ-3.1~14 | 각 카테고리 "100점 = 무엇" 측정 가능 정의 |
| DQ-4.1~3 | 통합 데이터모델 변경 / 의존성 영향 / 백그라운드 워커 추가 |
| DQ-5.1~3 | 우선순위 매핑 / MVP vs Full / 검증 스파이크 5-8개 |

## Round 1 Compound Knowledge — 패턴 발견

세 카테고리(Edge Functions / Realtime / Storage)에서 같은 패턴이 반복됨:

> **"단일 솔루션은 100점을 만들지 못한다 → 하이브리드 설계가 필수"**

- Edge Functions: isolated-vm + Deno 사이드카 + Sandbox 위임 (3층)
- Realtime: wal2json CDC + supabase-realtime 포팅 (역할 분담)
- Storage: SeaweedFS 단독으로 가능 (예외 — 단일 솔루션 90+)

이는 Wave 4 아키텍처 청사진의 일관된 주제 — "**복합 시스템 통합 설계가 신규 의존성·운영 부담 합산 분석을 강제로 요구**".

## 산출물 구조

```
docs/research/2026-04-supabase-parity/
├── README.md                       ← 이 파일
├── _CHECKPOINT_KDYWAVE.md
├── 00-vision/                      ← Wave 3
├── 01-research/                    ← Wave 1-2
│   ├── 01-table-editor/            ✅ 3 deep-dive (957/829/827)
│   ├── 02-sql-editor/              🔄 Round 2 대기
│   ├── 03-schema-visualizer/       🔄 Round 2 대기
│   ├── 04-db-ops/                  🔄 Round 2 대기
│   ├── 05-auth-core/               🔄 Round 2 대기
│   ├── 06-auth-advanced/           ✅ 3 deep-dive (837/1126/1092) ★
│   ├── 07-storage/                 ✅ 3 deep-dive (664/850/936) ★
│   ├── 08-edge-functions/          ✅ 3 deep-dive (790/843/801) ★
│   ├── 09-realtime/                ✅ 3 deep-dive (789/654/867) ★
│   ├── 10-advisors/                🔄 Round 2 대기
│   ├── 11-data-api/                🔄 Round 2 대기
│   ├── 12-observability/           🔄 Round 2 대기
│   ├── 13-ux-quality/              🔄 Round 2 대기
│   └── 14-operations/              🔄 Round 2 대기
├── 02-architecture/                ← Wave 4
├── 03-ui-ux/                       ← Wave 4
├── 04-integration/                 ← Wave 4
├── 05-roadmap/                     ← Wave 5
├── 06-prototyping/                 ← Wave 5
└── 07-appendix/
```

## 다음 작업

- **현재**: Wave 1 Round 2 (5 Agent 백그라운드 발사 직후)
- 완료 후: Wave 1 매트릭스 (Wave 2) 진입 또는 `/cs` 권장 (대규모 컨텍스트 종료)
- 중단 시: `/kdywave --resume`

---

> 최종 수정: 2026-04-18 14:25 (Round 1 완료 + Round 2 발사 시점)
