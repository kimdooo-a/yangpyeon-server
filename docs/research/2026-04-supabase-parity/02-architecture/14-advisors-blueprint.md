# 14. Advisors Blueprint — 양평 부엌 서버 대시보드

> Wave 4 · Tier 2 · B6 (DB 관리 클러스터) 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B6)
> 작성자: Claude Sonnet 4.6 — Wave 4 Agent B6
> 카테고리: 10 — Advisors (3-Layer 아키텍처)
> 상위: [02-architecture/](./) → [CLAUDE.md](../../../../CLAUDE.md)
> 연관: [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md) · [../00-vision/02-functional-requirements.md](../00-vision/02-functional-requirements.md)
> 입력 문서: [../01-research/10-advisors/](../01-research/10-advisors/) 4개 문서

---

## 1. 요약 (Executive Summary)

### 1.1 현황 및 목표

| 항목 | 현재 | 목표 |
|------|------|------|
| 카테고리 점수 | **65점** | **95점** |
| 갭 | 30점 | — |
| ADR 기준 | ADR-011 (Accepted) | 동일 유지 |
| 예상 공수 | — | **~80시간** (Phase 20) |
| 룰 수 | 0개 (현재) | ~80룰 (중복 제거 후) |
| splinter 포팅 목표 | — | 38룰 점진 포팅 |

Advisors는 14 카테고리 중 **Level 5 (통합 계층)** 에 속하며, Schema Visualizer(카테고리 3)의 schemalint와 일부 기능을 공유한다. Phase 20에서 65 → 95점 달성을 목표로 한다.

### 1.2 결론 3줄

1. **3-Layer 아키텍처 확정**: Layer 1 = schemalint (스키마 컨벤션, 개발 시점), Layer 2 = squawk (DDL 안전성, CI 시점), Layer 3 = splinter 38룰 Node TS 포팅 (런타임 성능/보안/무결성, 일일 cron).
2. **"역할 분담" 원칙**: 세 도구는 경쟁이 아니라 서로 다른 검사 시점(디자인/빌드/런타임)을 담당한다. 같은 개념이라도 시점이 다르면 중복 허용.
3. **DQ 3건 + 추가 DQ 전부 답변 완료**: DQ-ADV-5 (음소거 만료), DQ-ADV-7 (schemalint fixture), 기타 DQ-ADV-*를 본 문서 §9에서 확정한다.

---

## 2. Wave 1-2 채택안 확인

### 2.1 Wave 1-2 점수 기준

| 기술 | 가중 점수 | 채택 여부 | 역할 |
|------|----------|----------|------|
| schemalint | **4.42/5** | 채택 (Layer 1) | 스키마 컨벤션 린터 (네이밍, FK 인덱스, RLS 강제) |
| squawk | **4.00/5** | 채택 (Layer 2) | DDL 안전성 게이트 (LOCK 없는 인덱스, DROP 경고) |
| splinter 포팅 | **3.95/5** | 채택 (Layer 3) | 런타임 38룰 포팅 (보안 15, 성능 13, 유지보수 10) |
| Prisma Lint | 2.90/5 | 보조 | schema.prisma AST 레벨 (Prisma 보유 무료) |
| pglint | 2.80/5 | 거부 | 유지보수 활성도 낮음, Python 의존 |

### 2.2 "역할 분담" — 핵심 통찰

Wave 2 Agent E의 핵심 통찰: **세 도구는 경쟁이 아니라 역할 분담이다.**

```
시점별 책임 분리:
┌────────────────────────────────────────────────────────────────┐
│  개발 시점 (pre-commit)                                         │
│    Layer 1: schemalint — "스키마 구조가 컨벤션을 따르는가?"      │
│              입력: 라이브 Postgres introspection                │
│              예: snake_case, updated_at, FK 인덱스, RLS 활성   │
└────────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────────┐
│  CI 시점 (PR)                                                   │
│    Layer 2: squawk — "이 DDL SQL이 안전한가?"                   │
│              입력: .sql 마이그레이션 파일                       │
│              예: INDEX CONCURRENTLY 없는 인덱스, LOCK TABLE    │
└────────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────────┐
│  런타임 시점 (일일 cron)                                         │
│    Layer 3: splinter 포팅 — "현재 DB 상태가 건강한가?"          │
│              입력: 라이브 Postgres 쿼리 (pg_stat_statements 등) │
│              예: RLS 누락, 느린 쿼리, 인덱스 미사용             │
└────────────────────────────────────────────────────────────────┘
```

### 2.3 ADR-011 핵심 결정 재확인

**splinter PL/pgSQL 직접 실행 거부 이유**:

1. **SUPERUSER 필요**: splinter 원본은 PL/pgSQL로 DB 내부에서 실행 → 생산 DB SUPERUSER 강제 부여 → 보안 위험
2. **다중 DB 버전 호환 어려움**: PostgreSQL 16/17 간 내부 뷰 구조 차이 → 포팅 유지보수 부담
3. **TypeScript 네이티브 불가**: PL/pgSQL 룰은 Next.js 16 코드베이스와 통합 어려움 (출력 형식, 알림 연동 불가)
4. **Node TS 포팅**: 동일한 38개 검사 로직을 TypeScript로 재구현하면 Prisma/Zod/audit_log와 자연 통합

---

## 3. 3-Layer 아키텍처

### 3.1 Layer 1 — schemalint (스키마 컨벤션)

**검사 시점**: 개발 시 + 주간 cron (매주 월요일 04:00)
**입력**: 라이브 PostgreSQL introspection (schemalint의 `extract-pg-schema`)
**출력**: `advisor_findings` 테이블 (layer = 'SCHEMALINT')

```
schemalint 룰셋 (양평 부엌 커스텀):
├── name-casing (error)          — snake_case 컬럼/테이블명
├── name-inflection (error)      — 단수형 테이블명
├── prefer-text-to-varchar (error) — VARCHAR → TEXT
├── prefer-jsonb-to-json (error) — JSON → JSONB
├── prefer-identity-to-serial (warn) — SERIAL → IDENTITY
├── require-primary-key (error)  — PK 필수
├── require-updated-at (error)   — updated_at TIMESTAMPTZ 필수
├── require-fk-index (error)     — FK에 인덱스 필수
├── require-rls-on-public (error) — public 스키마 RLS 필수
└── require-audit-columns (warn) — created_at/updated_at 표준
```

Schema Visualizer(카테고리 3)의 schemalint 구현과 공유: `src/lib/schemalint/` 모듈을 양쪽에서 임포트한다.

### 3.2 Layer 2 — squawk (DDL 안전성)

**검사 시점**: PR 생성 시 (GitHub Actions)
**입력**: `prisma/migrations/*.sql` 파일
**출력**: PR 체크 통과/실패 + `advisor_findings` 테이블 (layer = 'SQUAWK')

```
squawk 핵심 룰 (24개 중 대표):
├── add-column-with-volatile-default   — 새 컬럼 volatile DEFAULT → 전체 테이블 잠금
├── alter-column-type                  — 컬럼 타입 변경 → LOCK TABLE
├── create-index-concurrently          — INDEX CONCURRENTLY 없는 인덱스 생성
├── drop-column                        — DROP COLUMN → 데이터 손실 위험
├── drop-constraint-not-valid          — NOT VALID 없이 CONSTRAINT 추가
├── rename-column                      — 컬럼 rename → 참조 코드 파괴
└── rename-table                       — 테이블 rename → 참조 코드 파괴
```

```yaml
# .github/workflows/schema-check.yml
name: Schema Safety Check

on:
  pull_request:
    paths:
      - 'prisma/migrations/**'

jobs:
  squawk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: squawk 설치
        run: curl -LSs https://github.com/sbdchd/squawk/releases/download/v1.3.0/squawk-linux-x86_64 -o /usr/local/bin/squawk && chmod +x /usr/local/bin/squawk
      - name: DDL 안전성 검사
        run: squawk prisma/migrations/**/*.sql
        # ERROR 발견 시 PR 차단 (squawk exit code 1)
```

### 3.3 Layer 3 — splinter 38룰 Node TS 포팅

**검사 시점**: 일일 cron (매일 02:30) + 수동 실행
**입력**: 라이브 PostgreSQL 쿼리 (pg_stat_statements, information_schema, pg_class 등)
**출력**: `advisor_findings` 테이블 (layer = 'SPLINTER')

**38룰 카테고리 분류**:

| 카테고리 | 룰 수 | 대표 룰 ID | 설명 |
|----------|-------|-----------|------|
| Security (보안) | 15 | 0001~0015 | RLS 비활성, 과도한 권한, 비밀번호 정책 등 |
| Performance (성능) | 13 | 0016~0028 | FK 인덱스 미설정, 느린 쿼리, 시퀀스 캐시 등 |
| Maintenance (유지보수) | 10 | 0029~0038 | 미사용 인덱스, 테이블 bloat, 장기 트랜잭션 등 |

**포팅 우선순위 (Phase 20 목표: 20개 완료)**:

1. **P0 Security 룰 8개** (가장 중요): 0001(rls_disabled_in_public), 0002(rls_disabled_tables), 0003(security_definer_view), 0004(function_with_security_definer), 0005(rls_enabled_no_policy), 0006(unindexed_foreign_keys), 0007(column_privileges_all), 0011(insecure_functions)
2. **P1 Performance 룰 7개**: 0016(unused_index), 0017(index_bloat), 0018(table_bloat), 0019(extension_available), 0020(connection_pooling), 0021(slow_queries_pg_stat), 0022(seq_scan_large_table)
3. **P2 Maintenance 룰 5개**: 0029(unused_extension), 0030(duplicate_index), 0031(no_primary_key), 0032(too_many_indexes), 0033(invalid_index)

---

## 4. 컴포넌트 아키텍처

### 4.1 컴포넌트 트리

```
src/lib/advisors/
├── layer1-schemalint/
│   ├── schemalint-runner.ts     ← schemalint 실행 진입점 (Schema Viz와 공유)
│   └── finding-reporter.ts     ← AdvisorFinding 변환 + 저장
│
├── layer2-squawk/
│   ├── squawk-ci-gate.ts        ← PR 체크 연동 + 결과 집계
│   └── migration-scanner.ts    ← 마이그레이션 파일 탐색
│
├── layer3-splinter/
│   ├── splinter-analyzer.ts    ← 38룰 포팅 실행 조율
│   ├── rule-engine.ts          ← RuleEngine 인터페이스 + 실행기
│   ├── rules/
│   │   ├── security/
│   │   │   ├── 0001-rls-disabled.ts
│   │   │   ├── 0002-rls-no-policy.ts
│   │   │   ├── 0006-unindexed-fk.ts
│   │   │   └── ... (15개)
│   │   ├── performance/
│   │   │   ├── 0016-unused-index.ts
│   │   │   ├── 0021-slow-queries.ts
│   │   │   └── ... (13개)
│   │   └── maintenance/
│   │       ├── 0029-unused-extension.ts
│   │       └── ... (10개)
│   └── pg-query-builder.ts     ← 룰별 PG 쿼리 빌더
│
├── core/
│   ├── finding-repository.ts   ← AdvisorFinding CRUD
│   ├── mute-manager.ts         ← 음소거 30일 만료 (DQ-ADV-5)
│   ├── rule-catalog.ts         ← advisor_rules 카탈로그 동기화
│   └── advisor-scheduler.ts   ← 일일 cron 등록
│
└── ui/
    └── advisors-dashboard/     ← /dashboard/advisors
```

### 4.2 RuleEngine 인터페이스

```typescript
// src/lib/advisors/layer3-splinter/rule-engine.ts

export interface AdvisorRule {
  id: string          // 'splinter_0001' | 'squawk_drop_column' | 'schemalint_require_rls'
  layer: AdvisorLayer // 'SCHEMALINT' | 'SQUAWK' | 'SPLINTER'
  severity: AdvisorSeverity  // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  category: string    // 'security' | 'performance' | 'maintenance' | 'convention'
  name: string
  description: string
}

export interface RuleResult {
  ruleId: string
  findings: FindingRecord[]
}

export interface FindingRecord {
  resourceType: string   // 'table' | 'function' | 'index' | 'query'
  resourceIdentifier: string  // 'public.users' | 'fn_get_user' | '...'
  details: Record<string, unknown>
  severity: AdvisorSeverity
}

// 모든 Layer 3 룰이 구현해야 하는 인터페이스
export interface SplinterRule {
  meta: AdvisorRule
  execute(db: PrismaClient | Pool): Promise<FindingRecord[]>
}
```

---

## 5. 룰 음소거 — 30일 자동 해제 (DQ-ADV-5)

### 5.1 MuteManager 구현

```typescript
// src/lib/advisors/core/mute-manager.ts
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit'

export class MuteManager {
  static readonly DEFAULT_MUTE_DAYS = 30   // DQ-ADV-5: 30일 자동 해제

  /**
   * 룰 음소거 설정
   * @param reason 음소거 이유 (필수 — 감사 추적)
   * @param expiresInDays 만료 일수 (기본 30일, DQ-ADV-5)
   */
  async mute(opts: {
    ruleId: string
    resourceType: string
    resourceIdentifier: string
    reason: string
    mutedBy: string   // User.id
    expiresInDays?: number
  }): Promise<void> {
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (opts.expiresInDays ?? MuteManager.DEFAULT_MUTE_DAYS))

    await prisma.advisorRuleMute.upsert({
      where: {
        ruleId_resourceType_resourceIdentifier: {
          ruleId: opts.ruleId,
          resourceType: opts.resourceType,
          resourceIdentifier: opts.resourceIdentifier,
        },
      },
      update: {
        reason: opts.reason,
        mutedBy: opts.mutedBy,
        mutedAt: new Date(),
        expiresAt,
      },
      create: {
        ruleId: opts.ruleId,
        resourceType: opts.resourceType,
        resourceIdentifier: opts.resourceIdentifier,
        reason: opts.reason,
        mutedBy: opts.mutedBy,
        expiresAt,
      },
    })

    // audit_log 기록 (음소거도 감사 대상)
    await writeAuditLog({
      userId: opts.mutedBy,
      action: 'advisor.mute',
      resourceType: 'advisor_rule_mute',
      resourceId: `${opts.ruleId}:${opts.resourceIdentifier}`,
      details: {
        ruleId: opts.ruleId,
        reason: opts.reason,
        expiresAt: expiresAt.toISOString(),
        expiresInDays: opts.expiresInDays ?? MuteManager.DEFAULT_MUTE_DAYS,
      },
    })
  }

  /**
   * 만료된 음소거 자동 해제 (일일 cron으로 실행)
   * DQ-ADV-5: 30일 자동 해제 — 영구 음소거 없음
   */
  async expireOldMutes(): Promise<number> {
    const expired = await prisma.advisorRuleMute.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
      },
    })

    if (expired.count > 0) {
      await writeAuditLog({
        userId: 'system',
        action: 'advisor.mute_expired',
        resourceType: 'advisor_rule_mute',
        resourceId: 'batch',
        details: { expiredCount: expired.count },
      })
    }

    return expired.count
  }

  /**
   * 특정 룰/리소스가 현재 음소거 상태인지 확인
   */
  async isMuted(
    ruleId: string,
    resourceType: string,
    resourceIdentifier: string,
  ): Promise<boolean> {
    const mute = await prisma.advisorRuleMute.findFirst({
      where: {
        ruleId,
        resourceType,
        resourceIdentifier,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    })
    return mute !== null
  }
}
```

> **DQ-ADV-5 결정 근거**:
> - **영구 음소거 거부**: 영구 음소거는 Advisor 가치를 서서히 무력화한다. 팀이 "이건 우리 컨텍스트에서 무시해도 된다"고 판단하더라도 30일 후 재검토를 강제하여 상황 변화를 인식하게 한다.
> - **30일 기준**: "한 스프린트(2주) + 여유 2주". 대부분의 정당한 예외는 해당 기간 내에 해결되거나 재구조화된다.
> - **audit 보존**: 음소거 설정/해제 이력은 audit_log에 영구 기록. 삭제되어도 감사 추적 유지.

### 5.2 음소거 UI

```typescript
// 음소거 다이얼로그 (30일 기본, 조정 가능)
<MuteRuleDialog
  ruleId={finding.ruleId}
  resourceIdentifier={finding.resourceIdentifier}
  defaultDays={30}
  maxDays={90}    // 최대 90일 (프로젝트 정책)
  onMute={(reason, days) => muteRule({ reason, expiresInDays: days })}
/>
```

---

## 6. 데이터 모델

### 6.1 신규 테이블 요약

| 테이블 | 저장소 | Phase | 근거 | ERD 참조 |
|--------|--------|-------|------|---------|
| `advisor_rules` | PostgreSQL | 20 | 3-Layer 룰 카탈로그 | §3.5.1 |
| `advisor_findings` | PostgreSQL | 20 | 룰 실행 결과 영속화 | §3.5.2 |
| `advisor_rule_mutes` | PostgreSQL | 20 | 음소거 30일 만료 (DQ-ADV-5) | §3.5.3 |

모든 테이블 스키마는 `02-data-model-erd.md §3.5`의 제안을 그대로 채용한다.

### 6.2 `advisor_rules` 핵심 설계

```prisma
model AdvisorRule {
  id           String   @id
  // ID 규칙: 'splinter_0001' | 'squawk_drop_column' | 'schemalint_require_rls'
  // Layer 접두사 + 원본 룰 ID로 고유성 보장

  layer        AdvisorLayer    // SCHEMALINT | SQUAWK | SPLINTER
  severity     AdvisorSeverity // CRITICAL | HIGH | MEDIUM | LOW | INFO
  category     String          // 'security' | 'performance' | 'maintenance' | 'convention'
  name         String          // 한국어 표시명
  description  String          // 상세 설명 + 해결 방법
  enabled      Boolean @default(true)
  metadata     Json    @default("{}")  // 룰별 추가 설정

  findings     AdvisorFinding[]
  mutes        AdvisorRuleMute[]

  @@index([layer, severity])
  @@map("advisor_rules")
}
```

### 6.3 `advisor_findings` 증분 업데이트 전략

```typescript
// 발견 사항은 INSERT ON CONFLICT DO UPDATE (upsert)로 증분 관리
// 이전 발견이 해결되면 resolvedAt 설정, 새 발견은 lastSeenAt 갱신

export async function upsertFinding(finding: CreateFindingInput): Promise<void> {
  await prisma.advisorFinding.upsert({
    where: {
      ruleId_resourceType_resourceIdentifier: {
        ruleId: finding.ruleId,
        resourceType: finding.resourceType,
        resourceIdentifier: finding.resourceIdentifier,
      },
    },
    update: {
      lastSeenAt: new Date(),
      details: finding.details,
      resolvedAt: null,  // 다시 나타났으므로 resolved 취소
    },
    create: {
      ruleId: finding.ruleId,
      resourceType: finding.resourceType,
      resourceIdentifier: finding.resourceIdentifier,
      details: finding.details,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  })
}

// 이전 실행에 있었지만 이번 실행에서 사라진 발견 → resolvedAt 설정
export async function markResolvedFindings(
  ruleId: string,
  currentIdentifiers: string[],
): Promise<void> {
  await prisma.advisorFinding.updateMany({
    where: {
      ruleId,
      resolvedAt: null,
      resourceIdentifier: { notIn: currentIdentifiers },
    },
    data: { resolvedAt: new Date() },
  })
}
```

---

## 7. UI — /dashboard/advisors

### 7.1 라우트 구조

```
app/
└── (dashboard)/
    └── advisors/
        ├── page.tsx           ← AdvisorsDashboard (전체 요약 + 룰별 현황)
        ├── [ruleId]/
        │   └── page.tsx       ← RuleFindingsPage (룰별 발견 목록)
        └── settings/
            └── page.tsx       ← AdvisorSettingsPage (룰 활성/비활성 + 음소거 관리)
```

### 7.2 AdvisorsDashboard 주요 기능

```typescript
// /dashboard/advisors 페이지 레이아웃

/*
┌────────────────────────────────────────────────────────────┐
│  Advisors 대시보드                            [수동 실행]   │
│                                                             │
│  요약 카드:                                                 │
│  [CRITICAL 3] [HIGH 12] [MEDIUM 28] [LOW 45] [INFO 7]      │
│                                                             │
│  레이어별 현황:                                             │
│  Layer 1 schemalint  — 마지막 실행: 2026-04-18 04:00       │
│  Layer 2 squawk      — 마지막 PR: 2026-04-17 (PASS)        │
│  Layer 3 splinter    — 마지막 실행: 2026-04-18 02:30       │
│                                                             │
│  카테고리 탭: [보안] [성능] [유지보수] [컨벤션]              │
│                                                             │
│  발견 목록 (테이블 형식):                                    │
│  심각도  | 룰명                    | 리소스        | 조치  │
│  CRITICAL | RLS 비활성 테이블       | public.orders | 해결  │
│  HIGH    | FK 인덱스 없음           | public.users  | 무시  │
│  ...                                                        │
└────────────────────────────────────────────────────────────┘
*/
```

### 7.3 발견 사항 카드 컴포넌트

```typescript
// src/components/advisors/finding-card.tsx
'use client'

interface FindingCardProps {
  finding: AdvisorFindingWithRule
  onMute: (findingId: bigint, reason: string, days: number) => void
  onMarkFixed: (findingId: bigint) => void
}

export function FindingCard({ finding, onMute, onMarkFixed }: FindingCardProps) {
  return (
    <Card className={cn(
      'border-l-4',
      finding.rule.severity === 'CRITICAL' && 'border-l-red-500',
      finding.rule.severity === 'HIGH' && 'border-l-orange-500',
      finding.rule.severity === 'MEDIUM' && 'border-l-yellow-500',
      finding.rule.severity === 'LOW' && 'border-l-blue-500',
      finding.rule.severity === 'INFO' && 'border-l-gray-400',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={finding.rule.severity} />
            <LayerBadge layer={finding.rule.layer} />
            <span className="font-medium">{finding.rule.name}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowMuteDialog(true)}>
              30일 무시
            </Button>
            <Button size="sm" onClick={() => onMarkFixed(finding.id)}>
              해결됨
            </Button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <code>{finding.resourceIdentifier}</code>
          {' · '}
          {formatRelativeTime(finding.firstSeenAt)}부터
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm">{finding.rule.description}</p>
        <FindingDetailsAccordion details={finding.details} />
      </CardContent>

      {/* 음소거 다이얼로그 */}
      <MuteRuleDialog
        open={showMuteDialog}
        ruleId={finding.ruleId}
        resourceIdentifier={finding.resourceIdentifier}
        onMute={(reason, days) => onMute(finding.id, reason, days)}
        onClose={() => setShowMuteDialog(false)}
      />
    </Card>
  )
}
```

---

## 8. splinter Node 포팅 — PL/pgSQL → TypeScript 재구현

### 8.1 포팅 전략

```
Phase 20 목표: P0 Security 8개 + P1 Performance 7개 + P2 Maintenance 5개 = 20룰 포팅
Phase 21+ (점진): 나머지 18룰 포팅 (운영 중 필요성 기준 우선순위 조정)
```

### 8.2 룰 포팅 예시 — 0001 rls_disabled_in_public

```typescript
// src/lib/advisors/layer3-splinter/rules/security/0001-rls-disabled.ts
import type { SplinterRule, FindingRecord } from '../../rule-engine'
import type { Pool } from 'pg'

export const rlsDisabledRule: SplinterRule = {
  meta: {
    id: 'splinter_0001',
    layer: 'SPLINTER',
    severity: 'CRITICAL',
    category: 'security',
    name: 'RLS 비활성 공개 테이블',
    description: [
      'public 스키마의 테이블에 Row Level Security(RLS)가 비활성화되어 있습니다.',
      '모든 인증된 사용자가 테이블의 모든 행에 접근 가능합니다.',
      '해결: ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;',
    ].join(' '),
  },

  async execute(pool: Pool): Promise<FindingRecord[]> {
    // splinter 원본 쿼리를 TypeScript로 포팅
    // 원본 PL/pgSQL: SELECT schemaname, tablename FROM pg_tables
    //               WHERE schemaname = 'public'
    //               AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = tablename AND relrowsecurity = true)
    const result = await pool.query(`
      SELECT
        t.schemaname,
        t.tablename,
        c.relname
      FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
      WHERE t.schemaname = 'public'
        AND c.relrowsecurity = false
        AND t.tablename NOT LIKE '_prisma_%'
        AND t.tablename NOT LIKE '_drizzle_%'
      ORDER BY t.tablename
    `)

    return result.rows.map(row => ({
      resourceType: 'table',
      resourceIdentifier: `${row.schemaname}.${row.tablename}`,
      details: {
        schemaname: row.schemaname,
        tablename: row.tablename,
        fix: `ALTER TABLE "${row.schemaname}"."${row.tablename}" ENABLE ROW LEVEL SECURITY;`,
      },
      severity: 'CRITICAL' as const,
    }))
  },
}
```

### 8.3 룰 포팅 예시 — 0006 unindexed_foreign_keys

```typescript
// src/lib/advisors/layer3-splinter/rules/security/0006-unindexed-fk.ts
export const unindexedFkRule: SplinterRule = {
  meta: {
    id: 'splinter_0006',
    layer: 'SPLINTER',
    severity: 'HIGH',
    category: 'security',
    name: '인덱스 없는 외래키',
    description: '외래키 컬럼에 인덱스가 없어 JOIN 쿼리 성능이 저하됩니다. CREATE INDEX ON {table}({column});으로 해결하세요.',
  },

  async execute(pool: Pool): Promise<FindingRecord[]> {
    const result = await pool.query(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE tablename = tc.table_name
            AND schemaname = tc.table_schema
            AND indexdef LIKE '%' || kcu.column_name || '%'
        )
    `)

    return result.rows.map(row => ({
      resourceType: 'table',
      resourceIdentifier: `${row.table_schema}.${row.table_name}`,
      details: {
        column: row.column_name,
        referencedTable: row.foreign_table,
        referencedColumn: row.foreign_column,
        fix: `CREATE INDEX CONCURRENTLY ON "${row.table_schema}"."${row.table_name}"("${row.column_name}");`,
      },
      severity: 'HIGH' as const,
    }))
  },
}
```

### 8.4 SplinterAnalyzer — 배치 실행

```typescript
// src/lib/advisors/layer3-splinter/splinter-analyzer.ts
import { Pool } from 'pg'
import { rlsDisabledRule } from './rules/security/0001-rls-disabled'
import { unindexedFkRule } from './rules/security/0006-unindexed-fk'
// ... 나머지 룰 임포트

const PHASE_20_RULES: SplinterRule[] = [
  // P0 Security (8개)
  rlsDisabledRule,
  rlsNoPolicyRule,
  securityDefinerViewRule,
  unindexedFkRule,
  // ... P0 나머지
  // P1 Performance (7개)
  unusedIndexRule,
  slowQueriesRule,
  // ... P1 나머지
  // P2 Maintenance (5개)
  duplicateIndexRule,
  // ... P2 나머지
]

export class SplinterAnalyzer {
  constructor(private pool: Pool) {}

  async runAll(): Promise<AdvisorRunSummary> {
    const muteManager = new MuteManager()
    const startTime = Date.now()
    const summary: AdvisorRunSummary = { layerId: 'SPLINTER', rulesRun: 0, findingsNew: 0, findingsResolved: 0 }

    for (const rule of PHASE_20_RULES) {
      const findings = await rule.execute(this.pool)
      summary.rulesRun++

      // 음소거 필터링
      const activeFindings = await this.filterMuted(findings, rule.meta.id, muteManager)

      // upsert 발견 사항
      for (const finding of activeFindings) {
        await upsertFinding({ ruleId: rule.meta.id, ...finding })
      }

      // 해결된 발견 사항 마킹
      const currentIdentifiers = activeFindings.map(f => f.resourceIdentifier)
      await markResolvedFindings(rule.meta.id, currentIdentifiers)

      summary.findingsNew += activeFindings.length
    }

    summary.durationMs = Date.now() - startTime
    return summary
  }

  private async filterMuted(
    findings: FindingRecord[],
    ruleId: string,
    muteManager: MuteManager,
  ): Promise<FindingRecord[]> {
    const results: FindingRecord[] = []
    for (const finding of findings) {
      const muted = await muteManager.isMuted(ruleId, finding.resourceType, finding.resourceIdentifier)
      if (!muted) results.push(finding)
    }
    return results
  }
}
```

---

## 9. Wave 4 할당 DQ 답변

### DQ-ADV-5 — 룰 음소거 만료

**질문**: 룰 음소거 만료 정책 — 영구 vs 30일 자동 해제?

**답변**: **30일 자동 해제** (§5.1 구현)

상세 근거:
- **영구 음소거 거부**: 시간이 지나면서 예외의 유효성이 약해진다. 영구 음소거는 Advisor 시스템 가치를 서서히 무력화한다.
- **30일 선택**: 스프린트 2주 + 여유 2주 = 30일. 정당한 예외 대부분은 30일 내 해결/재구조화 가능.
- **운영자 보호**: 잊어버린 음소거를 자동 해제하여 보안 위험이 누적되는 상황 방지.
- **audit 보존**: 음소거 만료도 audit_log에 기록 → 감사 추적 유지.
- **최대 90일 옵션**: 특수한 장기 예외(레거시 코드 리팩토링 일정이 3개월 이상)를 위해 UI에서 최대 90일까지 허용.

---

### DQ-ADV-7 — schemalint 룰 unit test fixture

**질문**: schemalint 커스텀 룰 unit test fixture — pgsql-ast-parser vs 실제 shadow DB?

**답변**: **pgsql-ast-parser를 1차 방어선으로 사용, shadow DB는 2차 통합 테스트**

```typescript
// pgsql-ast-parser 단위 테스트 (shadow DB 불필요)
import { describe, it, expect } from 'vitest'
import { buildMockSchemaObject } from '../test-helpers/schema-mock'
import { requireRls } from '../../rules/require-rls'

describe('require-rls-on-public', () => {
  it('RLS 비활성 테이블 위반 감지', () => {
    const schemaObject = buildMockSchemaObject({
      tables: [{
        name: 'orders',
        schemaName: 'public',
        isRowLevelSecurityEnabled: false,
      }],
    })

    const findings: unknown[] = []
    requireRls.process({ schemaObject, report: f => findings.push(f) })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      identifier: 'public.orders',
    })
  })
})
```

**선택 근거**:
- pgsql-ast-parser: 실제 PostgreSQL DB 없이 SQL AST 파싱 → CI에서 DB 의존 없음, 속도 빠름 (~100ms)
- shadow DB: 실제 DB 필요 → CI 설정 복잡, 속도 느림 (~10s)
- **결정**: 단위 테스트는 pgsql-ast-parser, 통합 테스트(실제 DB 연결)는 GitHub Actions에서 PostgreSQL 서비스 컨테이너로 실행 (별도 test:integration 스크립트)

---

### DQ-ADV-2 — Slack 알림 채널

**질문**: Slack 알림 채널 — 별도 `#advisors` vs `#alerts` 통합?

**답변**: **`#alerts` 통합 채널 기본 + severity별 필터링**

- 운영 초기(채널 분리 오버헤드 > 혜택)에는 `#alerts`로 통합
- CRITICAL/HIGH만 즉시 알림, MEDIUM/LOW는 일일 다이제스트로 배치
- 채널 분리 조건: Advisor 발견 수 > 50건/일 지속 2주 → `#advisors` 별도 채널 생성

---

### DQ-ADV-3 — 알림 임계 수준

**질문**: 알림 임계 — ERROR만 즉시 알림 vs WARN도 일일 다이제스트?

**답변**: **CRITICAL/HIGH = 즉시 알림, MEDIUM/LOW/INFO = 일일 다이제스트 (07:00)**

```typescript
// 알림 정책
const NOTIFY_POLICY = {
  immediate: ['CRITICAL', 'HIGH'],     // 즉시 Slack 알림
  daily_digest: ['MEDIUM', 'LOW'],      // 07:00 일일 요약
  silent: ['INFO'],                     // 알림 없음 (UI에서만 표시)
}
```

---

### DQ-ADV-4 — PR 차단 정책

**질문**: PR 차단 정책 — ERROR 발견 시 머지 block?

**답변**: **squawk(Layer 2) ERROR = PR 차단, schemalint(Layer 1) = PR 경고만**

- squawk: DDL 안전성 실패(예: INDEX 없이 대용량 테이블에 컬럼 추가) → 프로덕션 장애 직결 → PR 차단
- schemalint: 네이밍 컨벤션 위반 → 즉각 장애 없음 → PR 경고 + 머지는 허용 (단, 30분 내 수정 권고)
- splinter(Layer 3): 런타임 분석 → CI 실행 불가 (라이브 DB 필요) → PR 차단 대상 아님

---

### DQ-ADV-6 — squawk WARN 승격 정책

**질문**: squawk WARN에 대한 합의 — ERROR 승격 정책 (매 6개월 팀 리뷰?)

**답변**: **연 1회(4월) 정기 리뷰 + 프로덕션 인시던트 발생 시 즉시 승격**

- 1인 운영이므로 "팀 리뷰" 대신 운영자 단독 결정으로 충분
- 트리거: squawk WARN 규칙으로 예방 가능했던 인시던트 발생 → 즉시 ERROR 승격
- 문서화: 승격 시 ADR에 기록 (ADR-011 상세화 또는 신규 ADR)

---

## 10. Phase 20 WBS — Advisors (~80h)

### 10.1 작업 분해

| Task ID | 작업 내용 | 예상 시간 | 의존 Task | FR 매핑 |
|---------|----------|----------|----------|---------|
| **Core 인프라 (~20h)** | | | | |
| AD-01 | `advisor_rules` / `advisor_findings` / `advisor_rule_mutes` 마이그레이션 | 3h | — | §6.1 |
| AD-02 | RuleEngine 인터페이스 + FindingRepository CRUD 구현 | 4h | AD-01 | §4.2 |
| AD-03 | MuteManager (30일 만료 + audit_log) 구현 | 4h | AD-02 | DQ-ADV-5 |
| AD-04 | rule-catalog 동기화 (advisor_rules 초기 데이터) | 2h | AD-01 | §4.1 |
| AD-05 | advisor-scheduler (일일 cron 02:30 등록) | 2h | — | §4.1 |
| AD-06 | 알림 정책 구현 (즉시/다이제스트) | 5h | — | DQ-ADV-3 |
| **Layer 1 schemalint (~8h)** | | | | |
| AD-07 | schemalint → AdvisorFinding 변환 연동 | 4h | AD-02, SV-07 | FR-10 |
| AD-08 | 주간 cron 등록 (월요일 04:00) | 2h | AD-07 | FR-10 |
| AD-09 | PR 경고 GitHub Actions 연동 (Warning 모드) | 2h | AD-07 | DQ-ADV-4 |
| **Layer 2 squawk (~8h)** | | | | |
| AD-10 | squawk CI 통합 (GitHub Actions PR 차단) | 4h | — | DQ-ADV-4 |
| AD-11 | squawk 결과 → AdvisorFinding 연동 | 3h | AD-02 | FR-10.3 |
| AD-12 | squawk 설정 튜닝 (프로젝트 컨텍스트) | 1h | AD-10 | FR-10.3 |
| **Layer 3 splinter 포팅 (~30h)** | | | | |
| AD-13 | SplinterAnalyzer 배치 실행기 + MuteManager 통합 | 4h | AD-03 | FR-10.1 |
| AD-14 | P0 Security 룰 8개 포팅 + 단위 테스트 | 12h | AD-13 | FR-10.1, DQ-ADV-7 |
| AD-15 | P1 Performance 룰 7개 포팅 + 단위 테스트 | 10h | AD-13 | FR-10.2 |
| AD-16 | P2 Maintenance 룰 5개 포팅 + 단위 테스트 | 4h | AD-13 | FR-10 |
| **UI (~14h)** | | | | |
| AD-17 | /dashboard/advisors 대시보드 페이지 | 6h | AD-02 | FR-10 |
| AD-18 | FindingCard + MuteDialog + SeverityBadge 컴포넌트 | 4h | AD-17 | FR-10 |
| AD-19 | /dashboard/advisors/settings 페이지 (룰 관리) | 4h | AD-17 | FR-10 |
| **합계** | | **~80h** | | |

### 10.2 Phase 20 내 우선순위

```
Sprint A (40h): AD-01~09 + AD-10~12 — Layer 1+2 완전 구현 + Core 인프라
Sprint B (40h): AD-13~19 — Layer 3 splinter 포팅 20룰 + UI
```

### 10.3 목표 점수 달성 경로

| 구간 | 완료 조건 | 예상 점수 |
|------|----------|----------|
| Sprint A 완료 | schemalint + squawk CI 통합 + 음소거 관리 | 80점 |
| Sprint B 완료 | splinter 20룰 포팅 + 대시보드 UI | **95점** |

### 10.4 점진 포팅 로드맵 (Phase 20 이후)

```
Phase 20: 20룰 포팅 (P0 8 + P1 7 + P2 5)
Phase 21: +9룰 포팅 (P1/P2 나머지)
Phase 22: +9룰 포팅 (P2/P3 나머지)
= 총 38룰 완성 (100점 달성)
```

---

## 부록 A. 기술 결정 요약

| 결정 | 선택 | 거부 | 이유 |
|------|------|------|------|
| splinter 실행 방식 | Node TS 포팅 | PL/pgSQL 직접 실행 | SUPERUSER 불필요, TypeScript 통합 (ADR-011) |
| 음소거 만료 | 30일 자동 해제 | 영구 음소거 | Advisor 가치 유지, 상황 변화 인식 강제 (DQ-ADV-5) |
| fixture 테스트 | pgsql-ast-parser (단위) + shadow DB (통합) | shadow DB 단독 | CI 속도 + DB 의존 없음 (DQ-ADV-7) |
| PR 차단 | squawk ERROR만 차단 | schemalint도 차단 | DDL 안전성 = 즉각 장애, 컨벤션 = 지연 수정 가능 |
| 알림 채널 | #alerts 통합 (초기) | #advisors 별도 | 운영 초기 오버헤드 최소화, 임계 도달 시 분리 |
| 룰 포팅 순서 | P0 Security 우선 | 균등 포팅 | 보안 위험 최우선, ROI 최대화 |
| finding 업데이트 | 증분 upsert | 전량 재생성 | DB 부하 최소화, 해결 이력 보존 |

---

## 부록 B. 3-Layer 룰 완전 목록 (Phase 20 포팅 대상 20룰)

### B.1 Layer 3 — P0 Security (8룰)

| 룰 ID | 이름 | 원본 splinter ID | 심각도 |
|-------|------|----------------|--------|
| splinter_0001 | RLS 비활성 공개 테이블 | rls_disabled_in_public | CRITICAL |
| splinter_0002 | RLS 활성이지만 정책 없음 | rls_enabled_no_policy | CRITICAL |
| splinter_0003 | SECURITY DEFINER 뷰 | security_definer_view | HIGH |
| splinter_0004 | SECURITY DEFINER 함수 | function_security_definer | HIGH |
| splinter_0005 | 과도한 컬럼 권한 | column_privileges_all | HIGH |
| splinter_0006 | FK 인덱스 없음 | unindexed_foreign_keys | HIGH |
| splinter_0007 | 취약한 auth 설정 | insecure_auth_config | HIGH |
| splinter_0008 | 공개 함수 권한 과도 | public_function_over_privilege | HIGH |

### B.2 Layer 3 — P1 Performance (7룰)

| 룰 ID | 이름 | 원본 splinter ID | 심각도 |
|-------|------|----------------|--------|
| splinter_0016 | 미사용 인덱스 | unused_index | MEDIUM |
| splinter_0017 | 인덱스 bloat | index_bloat | MEDIUM |
| splinter_0018 | 테이블 bloat | table_bloat | MEDIUM |
| splinter_0019 | 미설치 유용한 확장 | extension_available | LOW |
| splinter_0020 | 연결 풀링 미설정 | connection_pooling_recommended | LOW |
| splinter_0021 | 느린 쿼리 (pg_stat_statements) | slow_queries | HIGH |
| splinter_0022 | 대용량 테이블 순차 스캔 | seq_scan_large_table | HIGH |

### B.3 Layer 3 — P2 Maintenance (5룰)

| 룰 ID | 이름 | 원본 splinter ID | 심각도 |
|-------|------|----------------|--------|
| splinter_0029 | 미사용 확장 | unused_extension | LOW |
| splinter_0030 | 중복 인덱스 | duplicate_index | MEDIUM |
| splinter_0031 | PK 없는 테이블 | no_primary_key | HIGH |
| splinter_0032 | 인덱스 과다 | too_many_indexes | LOW |
| splinter_0033 | 무효 인덱스 | invalid_index | MEDIUM |

---

> **Blueprint 끝.** Wave 4 · B6 · Advisors · 2026-04-18
> 연관 Blueprint: [12-schema-visualizer-blueprint.md](./12-schema-visualizer-blueprint.md) · [13-db-ops-blueprint.md](./13-db-ops-blueprint.md)
> 총 공수: **~80h** (Phase 20)
> Phase 20 합산 공수: 50h (Schema Viz) + 68h (DB Ops) + 80h (Advisors) = **198h**
