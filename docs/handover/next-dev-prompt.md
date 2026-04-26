# 다음 세션 프롬프트 (세션 59)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 정체성 변경됨 (2026-04-26 세션 58)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — spec/aggregator-fixes 브랜치 진행 중

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 배포 — /ypserver prod (세션 24e에서 5 갭 보강 완료):
#   /ypserver prod                      # Phase 1~5 자동 (Windows 빌드 → 복사 → migrate → PM2)
#   /ypserver prod --skip-win-build     # Windows 빌드 항상 실패 환경에서 사용
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan |

---

## ⭐ 세션 59 우선 작업 P0: kdywave Phase 1 본격 아키텍처 wave

세션 58에서 ADR-022~029 8건 모두 ACCEPTED. 이제 결정된 옵션 위에서 본격 아키텍처 설계 wave 진행.

**입력**:
- `docs/research/baas-foundation/README.md` (인덱스)
- `docs/research/baas-foundation/00-context/` (사전 분석 2건)
- `docs/research/baas-foundation/01-adrs/ADR-022~029` (8 ACCEPTED)
- `docs/research/baas-foundation/03-spikes/spike-baas-001~002` (2건)

**산출 위치**: `docs/research/baas-foundation/04-architecture-wave/` (신설)

**예상**: 3~5시간, 산출물 다수
- 시스템 아키텍처 다이어그램 (5-Plane: manifest/core/plugin/data/ops)
- ADR-022~029 구현 specs (각 ADR을 코드 레벨 스펙으로 풀기)
- Phase 1~3 sprint plan (구현 task DAG)
- 마이그레이션 전략 (단일테넌트 → 멀티테넌트)

**호출**: `/kdywave docs/research/baas-foundation/` 또는 Skill tool로 invoke.

---

## 우선 작업 P1: spike-baas-002 부수 발견 즉시 fix (3건)

ADR-028 결정과 무관하게 즉시 fix 가능. spike-baas-002 §3.X 참조.

```bash
# 영향 파일 (절대 다른 터미널과 충돌 주의):
# src/lib/cron/runner.ts:21    DEFAULT_ALLOWED_FETCH 정책화 (ADR-024 의존이라 후순위)
# src/lib/cron/runner.ts:72    WEBHOOK fetch AbortController + 60s timeout
# src/lib/cron/registry.ts:135 runJob catch에 structured log (CK-38 패턴)
```

**충돌 회피**: spec/aggregator-fixes 브랜치가 cron 관련 코드를 수정 중일 가능성 → 머지 후 또는 별도 브랜치에서 진행.

---

## 우선 작업 P2 (S57 이월): Almanac spec 적용 진행 상태 점검

세션 57에서 spec/aggregator-fixes 브랜치가 v1.1 정합화 완료. 현재 상태:
- spec 18 파일 일괄 정합화 → tsc 셋업 외 0 에러 검증
- 사용자 결정 시 spec 적용 (npm install 3종 + shadcn 9종 + Prisma migration + 코드 cp)

**ADR-022~029 결정 영향**: Almanac v1.0 그대로 출시 → 출시 후 packages/tenant-almanac/로 마이그레이션 (~5~7일).

```bash
# 현재 브랜치 확인
git branch --show-current  # spec/aggregator-fixes 또는 main
git log --oneline -10
```

---

## 우선 작업 P3 (S56 이월): 2026-04-26 03:00 KST cleanup cron 결과 확인

```bash
wsl -- bash -lic 'pm2 logs ypserver --lines 80 --nostream | grep -A2 "audit log write failed"'
# → 5일 연속 발생하던 audit log write failed 가 사라져야 함
# 동시에:
curl -H 'Authorization: Bearer <ADMIN>' http://localhost:3000/api/admin/audit/health
# → §보완 1 카운터 (ok: true / failed: 0)
```

---

## 우선 작업 P4 (S56 이월): ADR-021 placeholder 충돌 6 위치 cascade 정정

세션 56 §보완 2 §D 표 참조:
- 02-architecture/01-adr-log.md §1029 (Realtime 백프레셔)
- 02-architecture/16-ux-quality-blueprint.md §1570 (AI 챗 영구 저장)
- 05-roadmap/03-risk-register.md §649·651 (Next.js 17 업그레이드)
- 07-appendix/01-kdygenesis-handoff.md §4 (PM2 cluster vs cron-worker)
- 07-appendix/02-final-summary.md §4 (동일)
- 07-appendix/02-dq-final-resolution.md §591-592 (Next.js 17 + 마이그레이션 롤백 5초)

---

## 필수 참조 파일 ⭐ 세션 58 종료 시점

```
CLAUDE.md (4개 섹션 갱신: 프로젝트 정보, 문서 체계, 핵심 원칙 7원칙, 운영 규칙) ⭐⭐⭐
docs/status/current.md (정체성/스택 갱신, 세션 58 행 추가)
docs/handover/260426-session58-baas-foundation.md ⭐⭐⭐ 직전 세션 인수인계
docs/research/baas-foundation/README.md ⭐⭐⭐ 진입점

docs/research/baas-foundation/01-adrs/ (8 ADR ACCEPTED 2026-04-26)
docs/research/baas-foundation/03-spikes/spike-baas-001 (Prisma — 옵션 B 권고 변경 근거)
docs/research/baas-foundation/03-spikes/spike-baas-002 (worker pool — 옵션 D 권고 강화 + 부수 fix 3건)

docs/handover/260425-session57-aggregator-spec-rewrite.md (Almanac spec 정합화)
docs/handover/260425-session56-* (audit cleanup cron 진단)
docs/handover/260425-session55-ypserver-skill-v2-deploy.md (ypserver 스킬 v2)
```

---

## 멀티테넌트 BaaS 핵심 7원칙 (ADR-022 ACCEPTED 2026-04-26)

이 7원칙은 **양보 불가**. 새 코드/PR이 위반하면 reject:

1. **Tenant는 1급 시민, prefix가 아니다.** 모든 신규 모델/route/cron/log에 `tenant_id` 첫 컬럼.
2. **플랫폼 코드와 컨슈머 코드 영구 분리.** yangpyeon 코드베이스 = 플랫폼만.
3. **한 컨슈머의 실패는 다른 컨슈머에 닿지 않는다.** worker pool 격리.
4. **컨슈머 추가는 코드 수정 0줄.** TS manifest + DB row만으로.
5. **셀프 격리 + 자동 복구 + 관측성 = 3종 세트 동시.**
6. **불변 코어, 가변 plugin.** 코어는 6개월에 한 번.
7. **모든 결정은 "1인 운영 가능한 N의 상한"으로 검증.** N=20에서 1인 운영 가능성이 머지 게이트.

---

## 직전 세션들 요약

- **세션 58** (2026-04-26): BaaS Foundation 설계 — ADR-022~029 ACCEPTED + spike 2건 + CLAUDE.md 정체성 재정의 (현재)
- **세션 57** (2026-04-26): Almanac aggregator spec v1.0 → v1.1 정합화 (81→0 에러)
- **세션 56** (2026-04-25): cleanup cron audit silent failure 진단 + ADR-021
- **세션 55** (2026-04-25): ypserver 글로벌 스킬 v1→v2 전면 리팩터
- **세션 54** (2026-04-25): cleanup-scheduler.ts catch 진단 패치 + CK-38
- **세션 53** (2026-04-25): ADR placeholder cascade 5건 정정 + KEK 해결
- **세션 50** (2026-04-19): Next.js standalone 재도입 + ADR-020

---

## 세션 59 시작 시 추천 첫 액션

1. **CLAUDE.md, current.md, 본 next-dev-prompt 읽기** (변경된 정체성 파악)
2. **docs/handover/260426-session58-baas-foundation.md 읽기** (직전 세션 결정 흡수)
3. **docs/research/baas-foundation/README.md + 8 ADR + 2 spike 빠른 훑기** (~30분)
4. **/kdywave Skill 호출** 또는 Phase 1 직접 진입
5. spike-baas-002 부수 fix 3건은 별도 PR 또는 Phase 1 첫 작업

---

## 다른 작업 컨텍스트 (세션 57 종료 시점 인수)

P0 spec 적용 (사용자 결정 시):
1. npm install rss-parser cheerio @google/genai
2. npx shadcn@latest add tabs table badge input select textarea checkbox switch label
3. CronKind enum에 AGGREGATOR 추가 (수동) + schema-additions.prisma append
4. src/lib/aggregator/ + src/app/api/v1/almanac/ + src/app/admin/aggregator/ + api-guard-publishable.ts cp
5. cron/runner.ts + data-api/allowlist.ts + types/supabase-clone.ts 머지
6. npx prisma generate + npx tsc --noEmit (0 에러 기대)
7. (사용자 승인 후) prisma migrate dev / pm2 reload

**ADR-022~029 결정 적용 후 처리**: Almanac은 spec v1.0 그대로 출시, 출시 후 packages/tenant-almanac/로 마이그레이션.
