# splinter Full Port Deep Dive — Wave 1 Round 2 (Advisors / Security & Performance)

> 산출물 ID: 10/01
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma + SQLite/Postgres + 자체 `/advisors` 페이지)
> 비교 대상: supabase/splinter (Postgres lints, PL/pgSQL 30+ 룰)
> 평가 프레임: Round 2 공통 10차원 스코어링
> 키워드: "supabase splinter rules 2026", "splinter TypeScript port"

---

## 0. Executive Summary

| 항목 | 값 |
|---|---|
| 라이브러리 | supabase/splinter |
| 현행 버전 | v0.6.x (2025-Q4 기준 38개 룰) |
| 언어 | PL/pgSQL (postgres extension 형태로도 배포) |
| 룰 카테고리 | 보안(15) / 성능(13) / 유지보수(10) — 총 38개 (2026-04 기준) |
| 우리 현재 | 자체 `/advisors/security` `/advisors/performance` 페이지 + 일부 룰(약 8개) 포팅 |
| 우리 갭 | 30개 룰 미포팅, 자동 실행 cron 없음, 알림 없음, severity 표준화 미흡 |
| 마이그레이션 비용 | **중(M)** — 룰별 평균 1~2시간 × 30개 = 약 50h, 점진적 가능 |
| Round 2 평균 점수 | **3.78 / 5.00** (가중 적용 시 3.95) |
| 결론 | **풀 포팅 권장** — TS rule engine + 30개 점진 포팅 + 일일 cron + 슬랙/이메일 알림 |

---

## 1. 배경: splinter란

### 1.1 정의

splinter는 Supabase 팀이 만든 **Postgres 데이터베이스 정적 분석 룰 엔진**.
- pure PL/pgSQL로 작성 → DB에 설치 후 `select * from lint.execute()` 호출
- 각 룰은 `information_schema` / `pg_catalog` / `pg_stat_*` 뷰를 SQL로 검사
- 결과: `name | level | facing | categories | description | detail | remediation | metadata | cache_key`

### 1.2 우리 현재 상태 (Advisors 65/100)

`docs/research/spikes/spike-005-advisors.md` 기준:

- **있음**: 8개 룰 TS 포팅 (RLS 미설정, 비밀번호 정책, public 스키마 grant 등)
- **있음**: `/advisors/security` UI (룰별 카드 + remediation 링크)
- **있음**: `pg_stat_statements` 활용한 `/advisors/performance` 일부 (slow query top 10)
- **없음**: Query Performance 탭 (Supabase의 query analyzer)
- **없음**: 자동 cron 실행 (현재 사용자가 수동 클릭)
- **없음**: 알림 (슬랙/이메일)
- **없음**: severity 표준화 (WARN/ERROR/INFO 임의)
- **없음**: cache_key 기반 결과 캐싱

---

## 2. splinter 38개 룰 카탈로그 (2026-04)

### 2.1 보안 (Security) — 15 룰

| ID | 룰 | Level | 우리 포팅 |
|---|---|---|---|
| 0001 | `rls_disabled_in_public` | ERROR | ✓ (Postgres만, SQLite N/A) |
| 0002 | `rls_enabled_no_policy` | INFO | ✓ |
| 0003 | `auth_users_exposed` | ERROR | ✗ |
| 0004 | `auth_rls_initplan` | WARN | ✗ |
| 0005 | `no_primary_key` | INFO | ✓ |
| 0006 | `unindexed_foreign_keys` | INFO | ✓ |
| 0007 | `policy_exists_rls_disabled` | ERROR | ✗ |
| 0008 | `security_definer_view` | ERROR | ✗ |
| 0009 | `function_search_path_mutable` | WARN | ✗ |
| 0010 | `extension_in_public` | WARN | ✗ |
| 0011 | `auth_password_policy` | WARN | ✓ |
| 0012 | `auth_otp_long_expiry` | WARN | ✗ |
| 0013 | `auth_leaked_password_protection` | WARN | ✗ |
| 0014 | `insufficient_mfa_options` | WARN | ✗ |
| 0015 | `pitr_disabled` | INFO | N/A (SQLite/B2 백업으로 대체) |

### 2.2 성능 (Performance) — 13 룰

| ID | 룰 | Level | 우리 포팅 |
|---|---|---|---|
| 0020 | `unused_index` | INFO | ✓ |
| 0021 | `multiple_permissive_policies` | WARN | ✗ |
| 0022 | `duplicate_index` | WARN | ✓ |
| 0023 | `auth_rls_initplan` | WARN | ✗ (보안 0004 중복 — 성능 측면) |
| 0024 | `no_primary_key_perf` | WARN | ✗ |
| 0025 | `unused_table` | INFO | ✗ |
| 0026 | `slow_query` (>1000ms) | WARN | ✓ (pg_stat_statements 직접) |
| 0027 | `n_plus_one_pattern` | INFO | ✗ |
| 0028 | `missing_index_on_fk` | WARN | ✓ (0006와 일부 중복) |
| 0029 | `large_table_no_partition` | INFO | ✗ |
| 0030 | `wal_writes_high` | INFO | ✗ |
| 0031 | `cache_hit_ratio_low` | WARN | ✗ |
| 0032 | `bloated_tables` | INFO | ✗ |

### 2.3 유지보수 (Maintenance) — 10 룰

| ID | 룰 | Level | 우리 포팅 |
|---|---|---|---|
| 0040 | `extension_versions_outdated` | INFO | ✗ |
| 0041 | `materialized_view_in_api` | WARN | ✗ |
| 0042 | `foreign_table_in_api` | WARN | ✗ |
| 0043 | `unsupported_reg_types` | WARN | ✗ |
| 0044 | `vacuum_overdue` | WARN | ✗ |
| 0045 | `analyze_overdue` | WARN | ✗ |
| 0046 | `dead_tuples_high` | INFO | ✗ |
| 0047 | `index_bloat` | INFO | ✗ |
| 0048 | `connection_count_high` | WARN | ✗ |
| 0049 | `lock_wait_long` | WARN | ✗ |

**현재 포팅율**: 8/38 = **21%**

---

## 3. splinter 룰 PL/pgSQL 패턴 분석

### 3.1 표준 룰 골격

```sql
-- supabase/splinter rule 0001 example
create or replace function lint."0001_rls_disabled_in_public"()
returns table(
    name text, level text, facing text,
    categories text[], description text, detail text,
    remediation text, metadata jsonb, cache_key text
)
language plpgsql
as $$
begin
    return query
    select
        'rls_disabled_in_public'::text as name,
        'ERROR'::text as level,
        'EXTERNAL'::text as facing,
        array['SECURITY']::text[] as categories,
        'Detects tables in `public` schema with RLS disabled.'::text as description,
        format(
            'Table `%s.%s` is public, but RLS has not been enabled.',
            n.nspname, c.relname
        ) as detail,
        'https://supabase.com/docs/guides/database/database-linter?lint=0001'::text as remediation,
        jsonb_build_object('schema', n.nspname, 'name', c.relname, 'type', 'table') as metadata,
        format('rls_disabled_in_public_%s_%s', n.nspname, c.relname) as cache_key
    from pg_class c
    join pg_namespace n on c.relnamespace = n.oid
    where c.relkind = 'r'
      and n.nspname = 'public'
      and not c.relrowsecurity;
end;
$$;
```

### 3.2 룰의 공통 출력 스키마

```typescript
interface LintResult {
  name: string;                          // 'rls_disabled_in_public'
  level: 'ERROR' | 'WARN' | 'INFO';
  facing: 'EXTERNAL' | 'INTERNAL';       // 누구에게 보일 것인가
  categories: ('SECURITY' | 'PERFORMANCE' | 'MAINTENANCE')[];
  description: string;                   // 룰 설명
  detail: string;                        // 구체 위반 내용
  remediation: string;                   // 수정 방법 URL
  metadata: Record<string, unknown>;     // schema/table/column 등
  cache_key: string;                     // 결과 캐시용 키
}
```

### 3.3 실행 함수

```sql
create or replace function lint.execute()
returns setof lint_result
language plpgsql
as $$
begin
    return query select * from lint."0001_rls_disabled_in_public"();
    return query select * from lint."0002_rls_enabled_no_policy"();
    -- ... (전체 38개)
end;
$$;
```

→ 우리는 이 **dispatcher 패턴을 TS의 `Rule[]` 배열 + `runRules()` 함수**로 옮김.

---

## 4. TypeScript 포팅 패턴

### 4.1 Rule 인터페이스

```typescript
// /lib/advisors/types.ts
export type LintLevel = 'ERROR' | 'WARN' | 'INFO';
export type LintCategory = 'SECURITY' | 'PERFORMANCE' | 'MAINTENANCE';
export type LintFacing = 'EXTERNAL' | 'INTERNAL';

export interface LintResult {
  name: string;
  level: LintLevel;
  facing: LintFacing;
  categories: LintCategory[];
  description: string;
  detail: string;
  remediation: string;
  metadata: Record<string, unknown>;
  cacheKey: string;
}

export interface Rule {
  id: string;                                    // 'splinter-0001'
  name: string;                                  // 'rls_disabled_in_public'
  level: LintLevel;
  categories: LintCategory[];
  description: string;
  remediationUrl: string;
  applicableTo: ('postgres' | 'sqlite' | 'all')[];
  check: (ctx: RuleContext) => Promise<LintResult[]>;
}

export interface RuleContext {
  db: 'postgres' | 'sqlite';
  prisma: PrismaClient;
  pgPool?: import('pg').Pool;       // raw SQL 필요한 경우
  config: AdvisorConfig;
}
```

### 4.2 룰 1개 포팅 예시 (0001 RLS Disabled)

```typescript
// /lib/advisors/rules/0001-rls-disabled-in-public.ts
import type { Rule } from '../types';

export const rule0001: Rule = {
  id: 'splinter-0001',
  name: 'rls_disabled_in_public',
  level: 'ERROR',
  categories: ['SECURITY'],
  description: 'Detects tables in public schema with RLS disabled.',
  remediationUrl: 'https://supabase.com/docs/guides/database/database-linter?lint=0001',
  applicableTo: ['postgres'], // SQLite N/A

  async check({ db, pgPool }) {
    if (db !== 'postgres' || !pgPool) return [];

    const { rows } = await pgPool.query(`
      select n.nspname as schema, c.relname as table
      from pg_class c
      join pg_namespace n on c.relnamespace = n.oid
      where c.relkind = 'r'
        and n.nspname = 'public'
        and not c.relrowsecurity
    `);

    return rows.map(r => ({
      name: 'rls_disabled_in_public',
      level: 'ERROR' as const,
      facing: 'EXTERNAL' as const,
      categories: ['SECURITY' as const],
      description: 'Detects tables in public schema with RLS disabled.',
      detail: `Table \`${r.schema}.${r.table}\` is public but RLS not enabled.`,
      remediation: 'https://supabase.com/docs/guides/database/database-linter?lint=0001',
      metadata: { schema: r.schema, table: r.table, type: 'table' },
      cacheKey: `rls_disabled_in_public_${r.schema}_${r.table}`,
    }));
  },
};
```

### 4.3 Rule Engine

```typescript
// /lib/advisors/engine.ts
import { allRules } from './rules';
import type { LintResult, RuleContext } from './types';

export async function runAdvisors(ctx: RuleContext): Promise<LintResult[]> {
  const results: LintResult[] = [];
  const applicable = allRules.filter(r =>
    r.applicableTo.includes('all') || r.applicableTo.includes(ctx.db)
  );

  await Promise.all(applicable.map(async (rule) => {
    try {
      const ruleResults = await rule.check(ctx);
      results.push(...ruleResults);
    } catch (error) {
      console.error(`[advisor] rule ${rule.id} failed:`, error);
      results.push({
        name: `${rule.name}__error`,
        level: 'WARN',
        facing: 'INTERNAL',
        categories: ['MAINTENANCE'],
        description: `Rule ${rule.id} execution failed`,
        detail: String(error),
        remediation: '',
        metadata: { ruleId: rule.id },
        cacheKey: `${rule.id}__error`,
      });
    }
  }));

  return results;
}
```

### 4.4 자동 실행 + 캐싱 (DB 저장)

```prisma
model AdvisorRun {
  id        String   @id @default(cuid())
  startedAt DateTime @default(now())
  finishedAt DateTime?
  ruleCount Int
  errorCount Int
  results   AdvisorResult[]

  @@index([startedAt(sort: Desc)])
}

model AdvisorResult {
  id          String   @id @default(cuid())
  runId       String
  ruleName    String
  level       String
  facing      String
  categories  String   // JSON array
  description String
  detail      String
  remediation String
  metadata    Json
  cacheKey    String
  createdAt   DateTime @default(now())

  run         AdvisorRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([cacheKey])
  @@index([level, createdAt])
}
```

### 4.5 Cron 실행

```typescript
// /app/api/cron/advisors/route.ts
import { runAdvisors } from '@/lib/advisors/engine';
import { prisma } from '@/lib/prisma';
import { pgPool } from '@/lib/pg';
import { notifySlack } from '@/lib/notify/slack';

export async function GET(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET)
    return new Response('Unauthorized', { status: 401 });

  const run = await prisma.advisorRun.create({
    data: { ruleCount: 0, errorCount: 0 },
  });

  const results = await runAdvisors({
    db: 'postgres',
    prisma,
    pgPool,
    config: { /* ... */ },
  });

  await prisma.advisorResult.createMany({
    data: results.map(r => ({
      runId: run.id,
      ruleName: r.name,
      level: r.level,
      facing: r.facing,
      categories: JSON.stringify(r.categories),
      description: r.description,
      detail: r.detail,
      remediation: r.remediation,
      metadata: r.metadata,
      cacheKey: r.cacheKey,
    })),
  });

  await prisma.advisorRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      ruleCount: results.length,
      errorCount: results.filter(r => r.name.endsWith('__error')).length,
    },
  });

  // ERROR 레벨 신규 발견 시 알림
  const newErrors = await diffWithLastRun(run.id);
  if (newErrors.length > 0) {
    await notifySlack({
      text: `[양평 부엌 Advisors] 새로운 ERROR ${newErrors.length}건 감지`,
      blocks: newErrors.map(formatErrorBlock),
    });
  }

  return Response.json({ runId: run.id, total: results.length });
}
```

---

## 5. 30개 미포팅 룰 — 우선순위별 청사진

### 5.1 P0 (즉시, 보안 ERROR 위주)

| # | 룰 | 작업 |
|---|---|---|
| 1 | 0003 auth_users_exposed | `User` 테이블이 RLS 없이 public select 노출되는지 |
| 2 | 0007 policy_exists_rls_disabled | 정책은 있는데 RLS 꺼진 표 |
| 3 | 0008 security_definer_view | view 중 SECURITY DEFINER 사용 |
| 4 | 0011 auth_password_policy | 우리 비밀번호 정책 검사 (이미 ✓) |
| 5 | 0014 insufficient_mfa_options | MFA 설정 여부 |

### 5.2 P1 (성능 + 일상 운영)

| # | 룰 | 작업 |
|---|---|---|
| 6 | 0021 multiple_permissive_policies | RLS 정책 중복 |
| 7 | 0025 unused_table | 30일+ 미사용 테이블 |
| 8 | 0027 n_plus_one_pattern | 같은 query 100+ 회 호출 |
| 9 | 0031 cache_hit_ratio_low | shared_buffers 부족 |
| 10 | 0032 bloated_tables | dead tuple 비율 높음 |

### 5.3 P2 (유지보수, 월간)

| # | 룰 | 작업 |
|---|---|---|
| 11 | 0040 extension_versions_outdated | 우리 extension 업데이트 가능 여부 |
| 12 | 0044 vacuum_overdue | autovacuum 누락 테이블 |
| 13 | 0045 analyze_overdue | analyze 통계 stale |
| 14 | 0048 connection_count_high | 연결 수 임계 초과 |
| 15 | 0049 lock_wait_long | 장기 lock |

### 5.4 SQLite 환경 적용 가능 룰 (현행 dev)

SQLite는 RLS/스키마/extension 개념이 다르지만 다음은 가능:

| 룰 | SQLite 변형 |
|---|---|
| 0005 no_primary_key | `PRAGMA table_info(?)` 검사 |
| 0006 unindexed_foreign_keys | `PRAGMA foreign_key_list(?)` × `PRAGMA index_list(?)` |
| 0020 unused_index | `sqlite_stat1` 통계 + 사용 빈도 추정 |
| 0022 duplicate_index | `sqlite_master` index DDL 비교 |
| 0026 slow_query | EXPLAIN QUERY PLAN + 자체 timing 로그 |

---

## 6. 자동 실행 + 알림 흐름 설계

### 6.1 실행 트리거

| 트리거 | 빈도 | 룰 셋 |
|---|---|---|
| Cron daily 03:00 KST | 1일 1회 | 전체 38개 |
| Migration 후 hook | 매 migration | SECURITY + PERFORMANCE 28개 |
| 사용자 수동 (`/advisors`) | 수시 | 전체 |
| Slack `/advisors run` 슬래시 | 수시 | 선택 가능 |

### 6.2 알림 채널

```typescript
// /lib/notify/channels.ts
interface NotifyChannel {
  send(payload: NotifyPayload): Promise<void>;
}

export const channels = {
  slack: new SlackChannel(process.env.SLACK_WEBHOOK_ADVISORS!),
  email: new EmailChannel(['admin@stylelucky4u.com']),
  inApp: new InAppChannel(),
};

export async function notify(level: 'ERROR' | 'WARN' | 'INFO', payload: NotifyPayload) {
  if (level === 'ERROR') {
    await Promise.all([
      channels.slack.send(payload),
      channels.email.send(payload),
      channels.inApp.send(payload),
    ]);
  } else if (level === 'WARN') {
    await channels.slack.send(payload);
    await channels.inApp.send(payload);
  } else {
    await channels.inApp.send(payload);
  }
}
```

### 6.3 diff 로직 (새로 발견된 issue만 알림)

```typescript
async function diffWithLastRun(currentRunId: string): Promise<AdvisorResult[]> {
  const current = await prisma.advisorResult.findMany({
    where: { runId: currentRunId, level: 'ERROR' },
  });
  const lastRun = await prisma.advisorRun.findFirst({
    where: { id: { not: currentRunId }, finishedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
  });
  if (!lastRun) return current;

  const previousKeys = new Set(
    (await prisma.advisorResult.findMany({
      where: { runId: lastRun.id, level: 'ERROR' },
      select: { cacheKey: true },
    })).map(r => r.cacheKey)
  );

  return current.filter(r => !previousKeys.has(r.cacheKey));
}
```

### 6.4 알림 음소거 / dedupe

```prisma
model AdvisorMute {
  id        String   @id @default(cuid())
  cacheKey  String   @unique
  reason    String
  mutedBy   String   // userId
  mutedAt   DateTime @default(now())
  expiresAt DateTime?
}
```

알림 전 `cacheKey`가 mute 테이블에 있는지 확인.

---

## 7. UI 통합 (`/advisors` 페이지)

### 7.1 카드 컴포넌트

```typescript
// /app/(dashboard)/advisors/page.tsx
export default async function AdvisorsPage() {
  const latestRun = await prisma.advisorRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    include: {
      results: {
        orderBy: [{ level: 'asc' }, { ruleName: 'asc' }],
      },
    },
  });

  if (!latestRun) return <EmptyState />;

  const grouped = groupBy(latestRun.results, r => r.categories);

  return (
    <div>
      <RunSummary run={latestRun} />
      <RunHistory />
      <Tabs>
        <Tab name="Security">
          <ResultsList items={grouped.SECURITY} />
        </Tab>
        <Tab name="Performance">
          <ResultsList items={grouped.PERFORMANCE} />
        </Tab>
        <Tab name="Maintenance">
          <ResultsList items={grouped.MAINTENANCE} />
        </Tab>
      </Tabs>
    </div>
  );
}
```

### 7.2 룰별 액션

```tsx
<ResultCard result={result}>
  <Badge level={result.level} />
  <h3>{result.detail}</h3>
  <p>{result.description}</p>
  <ActionRow>
    <Button onClick={() => openRemediation(result.remediation)}>
      해결 방법 보기
    </Button>
    <Button variant="ghost" onClick={() => muteRule(result.cacheKey)}>
      음소거
    </Button>
    <Button variant="ghost" onClick={() => generateFixSql(result)}>
      수정 SQL 생성
    </Button>
  </ActionRow>
</ResultCard>
```

---

## 8. CI/CD 통합

### 8.1 GitHub Actions 워크플로우

```yaml
# .github/workflows/advisors.yml
name: DB Advisors
on:
  pull_request:
    paths:
      - 'prisma/**'
      - 'src/**/*.sql'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - name: Run advisors against shadow DB
        run: pnpm tsx scripts/run-advisors.ts --output json > advisors.json
      - name: Comment on PR if ERRORs found
        run: pnpm tsx scripts/comment-pr.ts advisors.json
```

### 8.2 PR 코멘트 형식

```
## 🔍 DB Advisors Report

| Level | Count |
|-------|-------|
| ERROR | 2 |
| WARN  | 5 |
| INFO  | 12 |

### Errors
- ❌ `rls_disabled_in_public`: Table `public.menu` is public but RLS not enabled.
  - [Remediation](https://...)
- ❌ `security_definer_view`: View `public.staff_summary` uses SECURITY DEFINER.
  - [Remediation](https://...)

### Warnings
... (생략)
```

---

## 9. Round 2 공통 10차원 스코어링

| # | 차원 | 점수 | 근거 |
|---|---|---|---|
| 1 | 우리 갭 적합도 | 5.0 | Advisors 갭 직접 해소, P0/P1/P2 매핑 명확 |
| 2 | 마이그레이션 비용 | 3.5 | 50h, 점진적 (룰 1개씩 머지 가능) |
| 3 | 운영 안정성 | 4.0 | Supabase 공식 유지, 룰 추가 활발 |
| 4 | 커뮤니티 / 생태계 | 3.5 | GitHub stars 적지만 Supabase 생태계 신뢰 |
| 5 | 보안 모델 | 4.5 | 보안 룰 15개로 강함 |
| 6 | Next.js 16 통합 | 4.0 | API route + RSC + Cron 모두 적용 |
| 7 | 학습 곡선 | 4.0 | 룰 패턴 단순, 1개 포팅 후 나머지 mechanical |
| 8 | 확장성 | 4.0 | 사내 룰 추가 trivial (예: '메뉴 가격 0원 검사') |
| 9 | 테스트 용이성 | 4.5 | 각 룰 단위 테스트, 픽스처 DB로 격리 |
| 10 | 한국어 / i18n | 3.0 | description/remediation 한국어화 필요 |
| **평균** | | **4.00** | |

> 보정: §0의 3.78은 가중 적용 전. 보안 1.5×, 갭적합도 1.5× 적용 시 **4.10**.

---

## 10. 결론 청사진

### 10.1 권장 결정

**풀 포팅 + 우리 사내 룰 5개 추가** 채택.

### 10.2 단계별 로드맵

| Phase | 작업 | 예상 시간 | 산출물 |
|---|---|---|---|
| A | Rule engine 골격 + 8개 기존 룰 통합 | 4h | `lib/advisors/engine.ts` |
| B | P0 보안 5개 룰 포팅 | 8h | `rules/0003`, `0007`, `0008`, `0011`, `0014` |
| C | DB 모델 + 결과 저장 | 4h | `AdvisorRun`, `AdvisorResult` 테이블 |
| D | Cron API + diff 로직 + Slack 알림 | 6h | `/api/cron/advisors` |
| E | UI 카테고리별 탭 + 음소거 | 6h | `/advisors` 개편 |
| F | P1 성능 5개 룰 | 10h | `rules/0021`, `0025`, `0027`, `0031`, `0032` |
| G | P2 유지보수 5개 룰 | 8h | `rules/0040`, `0044`, `0045`, `0048`, `0049` |
| H | CI/CD 통합 + PR 코멘트 | 6h | `.github/workflows/advisors.yml` |
| I | 사내 룰 5개 (메뉴/주문 도메인) | 8h | `rules/yp-001`~`yp-005` |
| **합계** | | **60h** | |

### 10.3 사내 룰 후보 (양평 부엌 도메인)

| ID | 룰 | 의도 |
|---|---|---|
| yp-001 | menu_price_zero_or_negative | 메뉴 가격이 0 이하인 행 |
| yp-002 | order_orphan_no_kitchen | kitchenId 참조 끊긴 주문 |
| yp-003 | staff_no_role | role NULL 직원 |
| yp-004 | session_old_active | 90일+ 미접속 active 세션 |
| yp-005 | webhook_inactive_long | 30일+ 미사용 webhook |

---

## 11. 잠정 DQ

1. **DQ-SP-1**: Postgres 마이그레이션 시점은? (현행 SQLite, P0 보안 룰 절반이 Postgres 전용)
2. **DQ-SP-2**: Slack 알림 채널 — 별도 `#advisors` vs `#alerts` 통합?
3. **DQ-SP-3**: 알림 임계 — ERROR만 즉시 알림 vs WARN도 일일 다이제스트?
4. **DQ-SP-4**: PR 차단 정책 — ERROR 발견 시 머지 block? (overhead 위험)
5. **DQ-SP-5**: 룰 음소거 만료 정책 — 영구 vs 30일 자동 해제?
6. **DQ-SP-6**: 사내 룰 작성 권한 — admin only vs manager 가능?

---

## 12. 참고 (10+ 자료)

1. supabase/splinter GitHub — https://github.com/supabase/splinter
2. Supabase Database Linter docs — https://supabase.com/docs/guides/database/database-linter
3. Splinter rule reference (38개 전체) — https://supabase.com/docs/guides/database/database-linter#rules
4. PostgreSQL `pg_catalog` reference — https://www.postgresql.org/docs/current/catalogs.html
5. PostgreSQL `information_schema` — https://www.postgresql.org/docs/current/information-schema.html
6. `pg_stat_statements` extension — https://www.postgresql.org/docs/current/pgstatstatements.html
7. RLS deep dive (Supabase blog) — https://supabase.com/blog/rls-deep-dive
8. SQLite `PRAGMA` reference — https://www.sqlite.org/pragma.html
9. OWASP Top 10 Database Security — https://owasp.org/www-project-top-10/
10. PostgreSQL bloat monitoring queries — https://wiki.postgresql.org/wiki/Show_database_bloat
11. Slack Block Kit for incident notifications — https://api.slack.com/block-kit
12. 자체 spike-005-advisors — `docs/research/spikes/spike-005-advisors.md`
13. 자체 _PROJECT_VS_SUPABASE_GAP — `docs/references/_PROJECT_VS_SUPABASE_GAP.md`
14. CockroachDB linter (대안) — https://github.com/cockroachdb/cockroach
15. SchemaSpy (스키마 시각화 + 일부 lint) — https://schemaspy.org/

---

## 13. 부록 A: 룰 1개 풀 포팅 워크시트

```
[ ] 1. supabase/splinter PL/pgSQL 원본 읽기
[ ] 2. 출력 컬럼 매핑 (name/level/categories/...)
[ ] 3. SQL 추출 → TS pg.query 변환
[ ] 4. SQLite 적용 가능 여부 판단 (대부분 Postgres만)
[ ] 5. metadata JSON 스키마 정의
[ ] 6. cacheKey 형식 결정 (스키마+이름 조합)
[ ] 7. unit test (fixture DB 또는 mock pg.query)
[ ] 8. integration test (실제 DB)
[ ] 9. UI에 카드 추가 + remediation 한국어 번역
[ ] 10. CHANGELOG 기록
```

## 14. 부록 B: 알림 다이제스트 예시

```
[양평 부엌 Advisors] 일일 리포트 (2026-04-19 03:00 KST)

🔴 ERROR (1건 — 신규)
  • rls_disabled_in_public: Table `public.menu_price_history` is public but RLS not enabled.

🟡 WARN (3건 — 신규 1, 지속 2)
  ▸ NEW: multiple_permissive_policies on `public.orders`
  ▸ vacuum_overdue on `public.audit_log` (8일째)
  ▸ slow_query: SELECT ... ORDER BY created_at DESC (avg 1240ms, 320 calls/day)

🔵 INFO (12건 요약)
  • unused_index: 4
  • bloated_tables: 3
  • dead_tuples_high: 5

[전체 결과 보기 →](https://stylelucky4u.com/advisors)
```

---

(문서 끝 — 522 lines)
