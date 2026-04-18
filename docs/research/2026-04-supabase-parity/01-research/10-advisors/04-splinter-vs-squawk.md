# 04. splinter vs squawk — 1:1 심층 비교

> **Wave 2 / 10-advisors — 1:1 비교 (300+ 데이터 포인트)**
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드
> 입력: 01·02·03 문서
> 관계: **경쟁이 아니라 상호보완** — 본 문서의 핵심 프레임
> 평가 비교: "splinter 포팅(38 룰 PL/pgSQL → Node TS, 런타임 metadata 검사)" vs "squawk(24 룰 Rust, DDL SQL 정적 분석)"

---

## 0. Executive Summary (3줄)

1. **splinter와 squawk는 경쟁 관계가 아니다.** splinter는 **"지금 DB 상태"**(런타임 metadata)를, squawk는 **"다음 변경"**(DDL SQL)을 검사한다. 분석 대상 자체가 다른 도구.
2. **정확도 vs 속도 트레이드오프.** splinter는 실제 `pg_class`·`pg_stat_*`을 보므로 **거짓 양성 ≈ 0**·**거짓 음성 낮음**. squawk는 SQL AST만 보므로 속도 5000× 빠름·context-free·거짓 양성 가능.
3. **룰 확장 용이성은 splinter 압승.** splinter는 TS 포팅 후 사용자 룰 trivial. squawk은 사용자 룰 미지원 → 대안: 자체 `pgsql-ast-parser` 스크립트. **"같은 룰을 양쪽에 배치"는 비효율** — 어느 도구에 할당할지의 원칙 매트릭스가 본 문서 §10.

---

## 1. 비교 대상 재정의 — "검사 대상의 축"

### 1.1 분석 대상 — Runtime Metadata vs SQL AST

| 축 | splinter (포팅) | squawk |
|----|-----------------|--------|
| **입력 1차** | `pg_class`, `pg_namespace`, `pg_policies`, `pg_index`, `pg_stat_statements`, `pg_stat_user_indexes`, `information_schema.*` | `.sql` 파일 텍스트 |
| **입력 2차** | 라이브 Postgres 연결 | 선택적 PG 버전 hint (`.squawk.toml`) |
| **파서** | SQL 쿼리 실행 결과 | Rust pg_query 기반 AST |
| **결과 대상** | 현재 DB 인스턴스 | 이 SQL이 **장차** 실행될 때의 위험 |
| **동작 특성** | stateful, DB session 필요 | stateless, 파일만 있으면 실행 |

### 1.2 정확도 특성

| 지표 | splinter | squawk |
|------|----------|--------|
| **거짓 양성 (false positive)** | 매우 낮음 (실제 상태 기반) | 있음 (context-free) |
| **거짓 음성 (false negative)** | 룰이 구현한 만큼만 | 명시적 DDL 밖은 못봄 |
| **대상 범위** | DB의 "현재 사실" 전부 | PR에 포함된 SQL 파일만 |
| **재현성** | DB 상태 의존 | 파일 불변 → 100% 재현 |
| **시간 축** | 지금(now) | 미래(apply 시) |

### 1.3 성능 특성

| 지표 | splinter | squawk |
|------|----------|--------|
| **실행 시간 (우리 규모 150 테이블)** | 15~30s (38 rule × DB query) | **<0.1s** (AST parse) |
| **CPU 사용** | 낮음 (I/O bound) | 낮음 (Rust) |
| **병렬화** | 룰별 Promise.all 가능 | 파일 단위 병렬 |
| **증분 실행** | diff 모드 가능 (last run cache) | 변경된 `.sql` 파일만 |
| **Cold start** | DB 연결 수립 ~500ms | ~50ms |

---

## 2. 관점 1 — "RLS 활성화되지 않은 public 테이블" 탐지

### 2.1 splinter 런타임 방식 (0001 룰 TS 포팅)

```typescript
// /lib/advisors/rules/0001-rls-disabled-in-public.ts
import type { Rule } from '../types';

export const rule0001: Rule = {
  id: 'splinter-0001',
  name: 'rls_disabled_in_public',
  level: 'ERROR',
  categories: ['SECURITY'],
  applicableTo: ['postgres'],

  async check({ pgPool }) {
    if (!pgPool) return [];
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
      detail: `Table \`${r.schema}.${r.table}\` is public but RLS not enabled.`,
      metadata: { schema: r.schema, table: r.table },
      cacheKey: `rls_disabled_in_public_${r.schema}_${r.table}`,
      // ...
    }));
  },
};
```

**특징:**
- `pg_class.relrowsecurity = false` 를 직접 확인 → **현재 사실**
- 새 테이블이 생기든 RLS가 나중에 꺼지든 **무조건 감지**
- PR 변경이 아니어도 탐지 (예: DBA가 psql로 `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`)

### 2.2 squawk DDL 방식 (유사 목표에 대한 근접 룰)

squawk는 **"RLS 비활성 상태"를 직접 보지 않는다**. 가장 가까운 룰:

```sql
-- 이 SQL이 PR에 있을 때:
CREATE TABLE public.menu (
  id serial PRIMARY KEY,
  name text
);
-- squawk은 "RLS 비활성 채 테이블 생성" 자체를 룰로 갖고 있지 않음

-- 다음 SQL이라면:
ALTER TABLE public.menu DISABLE ROW LEVEL SECURITY;
-- squawk은 ban-drop-not-null 등과 유사한 룰이 없음 → 탐지 불가
```

**squawk의 구조적 한계:**
- DDL AST만 봄 → "결과 상태"를 모름
- 테이블 생성 후 별도 migration에서 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`가 올지 알 수 없음
- 따라서 **RLS 관련 룰은 squawk에 넣을 수 없음**

### 2.3 해결책 — 도구 간 역할 배정

| 룰 | splinter | squawk | 배정 |
|----|----------|--------|------|
| RLS 비활성 public 테이블 | ✓ 런타임 | ✗ 불가 | **splinter 독점** |
| DROP TABLE 위험 | ✗ (사후) | ✓ DDL | **squawk 독점** |
| ADD COLUMN NOT NULL without DEFAULT | ✗ (쿼리로 못 봄) | ✓ DDL | **squawk 독점** |
| 인덱스 bloat 감지 | ✓ pg_stat | ✗ 불가 | **splinter 독점** |

→ **경쟁 없음**. 룰 목록을 열거해 보면 자연스럽게 한 쪽에만 들어맞음.

---

## 3. 관점 2 — 신규 룰 추가 방법

### 3.1 splinter 측 — TS 플러그인 (매우 쉬움)

```typescript
// /lib/advisors/rules/yp-003-staff-no-role.ts
import type { Rule } from '../types';

export const ypStaffNoRole: Rule = {
  id: 'yp-003',
  name: 'staff_no_role',
  level: 'WARN',
  categories: ['MAINTENANCE'],
  description: '직원 테이블에 role이 NULL인 레코드',
  remediationUrl: 'https://stylelucky4u.com/docs/conventions#staff-role',
  applicableTo: ['postgres'],

  async check({ pgPool }) {
    const { rows } = await pgPool!.query(`
      select id, name, created_at
      from staff
      where role is null
    `);
    return rows.map(r => ({
      name: 'staff_no_role',
      level: 'WARN' as const,
      facing: 'INTERNAL' as const,
      categories: ['MAINTENANCE' as const],
      description: 'Staff with NULL role',
      detail: `Staff #${r.id} (${r.name}) has NULL role (created ${r.created_at})`,
      remediation: 'https://stylelucky4u.com/docs/conventions#staff-role',
      metadata: { staffId: r.id, staffName: r.name },
      cacheKey: `staff_no_role_${r.id}`,
    }));
  },
};

// /lib/advisors/rules/index.ts
import { ypStaffNoRole } from './yp-003-staff-no-role';
export const allRules = [rule0001, /* ... */, ypStaffNoRole];
```

**장점:**
- TypeScript 코드 그대로, 팀원이 쓰는 언어
- Unit test trivial (Prisma mock or fixture DB)
- i18n 가능 (description·remediation 한국어)
- 도메인 룰 (`menu_price_zero`, `order_orphan_no_kitchen`) 동일 패턴

### 3.2 squawk 측 — **사용자 룰 미지원**

squawk은 Rust로 컴파일된 바이너리 → 새 룰은 fork + Rust 코드 수정 + 재빌드 필요. 현실적 대안:

```typescript
// scripts/yp-ddl-check.ts
import { Parser } from 'pgsql-ast-parser';
import { readFileSync } from 'node:fs';

const filePath = process.argv[2];
const sql = readFileSync(filePath, 'utf-8');
const ast = new Parser().parse(sql);

let violations = 0;

for (const stmt of ast) {
  // 우리 룰: 'temp_' 로 시작하는 테이블 생성 금지
  if (stmt.type === 'create table' && stmt.name.name.startsWith('temp_')) {
    console.error(`❌ ${filePath}: Table '${stmt.name.name}' starts with 'temp_'`);
    violations++;
  }
  // 룰: money 컬럼 타입 bigint 강제
  if (stmt.type === 'create table') {
    for (const col of stmt.columns) {
      if (/^(price|amount|total|fee)/.test(col.name.name) && col.dataType.name !== 'bigint') {
        console.error(`❌ ${filePath}: Column '${col.name.name}' should be bigint`);
        violations++;
      }
    }
  }
}

if (violations > 0) process.exit(1);
```

**단점:**
- squawk의 표준 출력/reporter와 별도 관리
- `.squawk.toml` 룰 비활성화 기능 재사용 불가
- PR comment 통합을 또 만들어야 함

### 3.3 확장 용이성 비교

| 차원 | splinter 포팅 | squawk |
|------|--------------|--------|
| 룰 추가 시간 | 1~2시간 | 해당 없음 (사용자 룰 불가) |
| 프로그래밍 언어 | TypeScript (우리 주력) | Rust 학습 필요 (fork 시) |
| 테스트 작성 | easy (DB fixture) | — |
| i18n | easy | — |
| 배포 단위 | npm 버전 | 바이너리 fork |
| 결정 | **splinter = 확장성 ★★★★★** | **squawk = 고정 ★★** |

---

## 4. CI/CD 통합 형태 비교

### 4.1 squawk — PR 중심

```yaml
# .github/workflows/squawk.yml
name: Squawk
on:
  pull_request:
    paths: ['prisma/migrations/**/*.sql']

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Get changed migration files
        id: changed
        run: |
          files=$(git diff --name-only origin/${{ github.base_ref }} -- 'prisma/migrations/**/*.sql' | tr '\n' ' ')
          echo "files=$files" >> $GITHUB_OUTPUT
      - name: Install squawk
        run: |
          curl -L https://github.com/sbdchd/squawk/releases/latest/download/squawk-linux -o squawk
          chmod +x squawk
          sudo mv squawk /usr/local/bin/
      - name: Run squawk
        if: steps.changed.outputs.files != ''
        run: squawk ${{ steps.changed.outputs.files }} --reporter=github
```

**특성:**
- 1분 이내 완료
- `fetch-depth: 0` 필요 (diff 계산)
- `--reporter=github` → PR annotation 자동
- 매 PR마다 실행 (대부분 OK로 통과)

### 4.2 splinter — Cron + Manual 중심

```typescript
// /app/api/cron/advisors/route.ts (04-03 문서와 동일)
export async function GET(req: Request) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET)
    return new Response('Unauthorized', { status: 401 });

  const run = await prisma.advisorRun.create({ data: { ruleCount: 0, errorCount: 0 } });
  const results = await runAdvisors({ db: 'postgres', prisma, pgPool, config: {} });

  await prisma.advisorResult.createMany({
    data: results.map(r => ({ runId: run.id, ...r })),
  });

  const newErrors = await diffWithLastRun(run.id);
  if (newErrors.length > 0) {
    await notifySlack({
      text: `[양평 부엌 Advisors] 신규 ERROR ${newErrors.length}건`,
      blocks: newErrors.map(formatErrorBlock),
    });
  }

  return Response.json({ runId: run.id, total: results.length });
}
```

**특성:**
- 일일 cron 1회 (새벽 03:00 KST)
- DB 전체 스캔 → 15~30s
- 결과는 DB에 저장 (AdvisorRun/AdvisorResult)
- diff 로직으로 "새로 발견된 것만" 알림
- `/advisors` 대시보드에서 수동 재실행 가능

### 4.3 CI/CD 차단 매트릭스

| 상황 | squawk | splinter |
|------|--------|----------|
| PR에 위험 DDL | ❌ ERROR → 병합 차단 | — (DDL이 아직 적용 안 됨) |
| 프로덕션 DB에 RLS 비활성 테이블 발견 | 해당 없음 | 🚨 Slack 알림 (신규 시) |
| Migration 후 새 테이블 생성 | 다음 PR의 squawk에서 검사 | 다음 날 cron이 감지 |
| 컨벤션 위반 (`userId`) | — | — (schemalint 영역) |
| 인덱스 bloat 누적 | — | WARN → 주간 다이제스트 |

---

## 5. 설치 비용 비교 — Rust binary vs Node

### 5.1 CI 환경

| 단계 | squawk | splinter (포팅) |
|------|--------|-----------------|
| 초기 설치 | `curl ... && chmod +x` (5s) | `npm ci` 이미 존재 |
| 버전 업데이트 | release asset 재다운로드 | `npm update` |
| 크기 | ~10MB binary | 프로젝트 번들 포함 |
| 캐시 | GitHub Actions cache | node_modules 캐시 |

### 5.2 로컬 개발자 환경

| 단계 | squawk | splinter (포팅) |
|------|--------|-----------------|
| Mac/Linux | brew install / curl | `pnpm install` |
| Windows | scoop install / 수동 | `pnpm install` |
| husky pre-commit | `squawk` 명령어 | `pnpm tsx scripts/advisors-quick.ts` |
| 설치 부담 | Rust binary 한 개 | 이미 프로젝트 내 |

**결론:** squawk는 **CI 전용으로 한정**하면 부담 작음. 로컬 pre-commit에도 추가하려면 팀원 환경별 설치 필요 — 대안으로 Docker wrapper.

### 5.3 Docker wrapper 예시 (설치 부담 최소화)

```json
// package.json scripts
{
  "scripts": {
    "squawk": "docker run --rm -v $PWD:/workspace -w /workspace sbdchd/squawk:latest squawk"
  }
}
```

→ 로컬에서는 Docker만 있으면 됨. husky hook도 이 스크립트 호출.

---

## 6. 비교 매트릭스 (종합)

| 차원 | splinter 포팅 | squawk | 결합 시 |
|------|--------------|--------|---------|
| **FUNC — 탐지 범위** | 38룰 (SEC/PERF/MAINT 전체) | 24룰 (DDL 안전) | 62룰 (중복 0) |
| **FUNC — 런타임 상태** | 5/5 | 0/5 | 5/5 |
| **FUNC — DDL 안전성** | 0/5 | 5/5 | 5/5 |
| **PERF — 실행 속도** | 15~30s | **<0.1s** | 각자 영역 |
| **PERF — DB 부담** | Medium (38 쿼리) | 0 | Medium |
| **DX — 룰 추가 용이성** | ★★★★★ (TS) | ★ (불가, fork) | ★★★★ (splinter에 몰아줌) |
| **DX — 메시지 커스터마이징** | ★★★★★ | ★★ (고정) | ★★★★ |
| **DX — i18n** | ✓ | ✗ | splinter만 한국어 |
| **ECO — Stars/Users** | Supabase 신뢰 | Snyk·Tinder | 양쪽 |
| **LIC** | Apache 2.0 → MIT 포팅 | GPL-3.0 | 둘 다 호환 |
| **MAINT** | 우리가 책임 | 외부 팀 | 반반 |
| **INTEG — 설치 비용** | 0 (번들) | 바이너리 10MB | 작음 |
| **SECURITY — 정확도** | ★★★★★ (runtime 사실) | ★★★★ (AST) | ★★★★★ |
| **SELF_HOST** | ★★★★★ | ★★★★★ | ★★★★★ |
| **COST** | $0 | $0 | $0 |
| **Wave 1 가중점수** | 3.95 | 4.00 | ~4.30 추정 |

---

## 7. 두 도구가 잡는 "동일 개념" 맵

완전 동일 룰은 **0개**. 근접 개념 2개만 존재:

### 7.1 "FK에 인덱스 없음"

| 항목 | splinter 0006 | squawk | 결정 |
|------|---------------|--------|------|
| 시점 | 런타임 (지금 이미 누락) | 해당 없음 (DDL이 FK 추가할 때만 간접) | **splinter만 유지** |
| schemalint의 index-foreign-keys와 겹치는가? | Yes | — | 시점이 다르므로 둘 다 유지 |

### 7.2 "TIMESTAMP without TIMEZONE"

| 항목 | splinter | squawk prefer-timestamptz | 결정 |
|------|----------|--------------------------|------|
| 시점 | 룰 없음 (splinter 원본에 없음) | DDL 추가 시 | **squawk만 유지** (미래 방어) |
| 이미 배포된 `timestamp` 컬럼은? | 사내 룰로 splinter에 추가 (`yp-timestamp-no-tz`) | squawk 범위 밖 | **사내 룰로 보완** |

**교훈:** 두 도구의 룰 목록을 봤을 때 **자연스럽게 분리**된다. 이는 설계자가 의도했다기보다 **분석 대상이 다르면 룰도 달라지는 자연 귀결**.

---

## 8. 실제 룰 배정 원칙 매트릭스

**"이 룰을 어느 도구에 넣을 것인가"** — 사내 룰 작성 시 참고.

### 8.1 splinter에 넣어야 하는 룰 (runtime 상태 검사)

- ✅ "지금 DB에 X 조건인 레코드/테이블이 있는가?"
- ✅ 통계 (pg_stat_statements, pg_stat_user_indexes) 기반
- ✅ 설정 파라미터 (`show`, `pg_settings`) 기반
- ✅ 도메인 데이터 이상 (`menu_price_zero`, `order_orphan`)
- ✅ 누적 효과 (bloat, dead tuples, unused index)

### 8.2 squawk에 맞는 룰 (DDL 정적 분석)

- ✅ "이 DDL이 lock을 과도하게 잡는가?"
- ✅ "이 DDL이 breaking change를 만드는가?"
- ✅ "이 DDL이 Postgres anti-pattern을 포함하는가?"
- ✅ type 선호 (varchar → text, int → bigint)
- ✅ 키워드 존재 여부 (CONCURRENTLY, NOT VALID)

### 8.3 판별 플로우차트

```
룰 후보 X가 있을 때:
  1. "DB에 쿼리를 날려서 판단 가능한가?" → Yes → splinter
  2. "DDL SQL 텍스트만으로 판단 가능한가?" → Yes → squawk
  3. 둘 다 가능하다면 → "시간축이 어느 쪽이 중요한가?"
       - 과거·현재 상태 모니터링 → splinter
       - 미래 변경 차단 → squawk
  4. 둘 다 아니라면 → schemalint 검토 (컨벤션 룰은 schema introspect)
```

---

## 9. 거짓 양성 / 거짓 음성 사례 비교

### 9.1 squawk 거짓 양성

```sql
-- 테스트 DB 세팅용 migration
CREATE INDEX idx_test ON test_data(id);
```

squawk: `require-concurrent-index-creation` ERROR

현실: 신규 테이블 초기 데이터 용이라 locking 걱정 없음 → 거짓 양성.
해결: `.squawk.toml`의 `excluded_paths` 또는 인라인 `-- squawk-disable-next-line`.

### 9.2 splinter 거짓 양성

드묾. `pg_class`·`pg_policies`는 사실 그 자체 → 거짓 양성 거의 0.

다만 "INFO" 레벨 룰(`no_primary_key`)은 의도적 staging 테이블도 잡을 수 있음 → mute 패턴으로 해결.

### 9.3 거짓 음성 비교

| 상황 | squawk | splinter |
|------|--------|----------|
| 이미 적용된 위험 DDL | 못 봄 (migration 이전 버전) | 런타임 결과 상태로 탐지 가능 |
| 외부 DBA 수동 변경 | 못 봄 (migration 없음) | 탐지 |
| 새 extension 활성화 | 못 봄 | 0040 extension_versions_outdated 등으로 추적 |
| PR에 포함된 신규 DDL | 탐지 | 다음 일일 cron까지 대기 |

**상호 보완:** squawk가 미래 차단, splinter가 과거·현재 발견 → 시간축 전 구간 커버.

---

## 10. 룰 할당 원칙 매트릭스 (최종)

Advisors 100점 경로에서 "어떤 룰을 어느 도구에 할당하는가"의 원칙. 사내 룰 작성 시 반드시 참고.

| 룰 특성 | splinter (Layer 3) | squawk (Layer 1/2) | schemalint (Layer 2) |
|---------|---------------------|---------------------|----------------------|
| **시점 = 런타임 상태** | ✓ 주담당 | ✗ | △ (구조만) |
| **시점 = DDL 실행 직전** | ✗ | ✓ 주담당 | ✗ |
| **시점 = 스키마 스냅샷** | △ | ✗ | ✓ 주담당 |
| **대상 = 보안 (RLS/auth)** | ✓ 주담당 | △ | ✗ |
| **대상 = DDL 안전성 (lock)** | ✗ | ✓ 주담당 | ✗ |
| **대상 = 컨벤션 (naming)** | ✗ | ✗ | ✓ 주담당 |
| **대상 = 통계 (bloat/slow query)** | ✓ 주담당 | ✗ | ✗ |
| **대상 = 도메인 데이터 이상** | ✓ 주담당 | ✗ | △ (구조) |
| **사용자 정의 룰 필요** | ✓ (TS) | ✗ | ✓ (TS) |
| **i18n 필요** | ✓ | ✗ | ✓ |

### 10.1 애매한 영역 — 그리고 결정

| 룰 | 1차 배정 | 이유 |
|----|----------|------|
| "NOT NULL 추가 실수" | squawk | DDL 변경 시점 차단이 더 저렴 |
| "기존 테이블 RLS off" | splinter | squawk은 기존 상태 못 봄 |
| "컬럼 타입 jsonb가 아님" | schemalint (우선) + squawk (중복) | schemalint는 state, squawk은 미래 방어 |
| "FK 인덱스 없음" | schemalint (우선) + splinter (누적 검증) | 시점 분리 |
| "extension in public" | splinter | 현재 상태 검사 |
| "UNIQUE + nullable 혼합" | schemalint | 구조적 컨벤션 |

---

## 11. 우리 현황 기반 권장 시작점

### 11.1 Phase A (2주) — squawk 먼저

```
이유: 즉시 차단 효과, 설치 비용 최저, 룰 고정되어 있어 학습 부담 ↓
작업:
  1. squawk 바이너리 + .squawk.toml
  2. .husky/pre-commit 훅
  3. GitHub Actions workflow
  4. PR 첫 사이클 통과 시 ERROR 조정
공수: 6h
예상 가치: 위험 DDL 즉시 차단 (adding-required-field, require-concurrent-index-creation 등 즉효)
```

### 11.2 Phase B (4주) — splinter P0 5룰 포팅

```
작업:
  1. Rule engine 골격 + 기존 8룰 통합
  2. P0 보안 5룰 포팅 (0003, 0007, 0008, 0011, 0014)
  3. DB 저장 (AdvisorRun, AdvisorResult)
  4. cron API + diff 로직 + Slack 알림
공수: 20h
예상 가치: Layer 3 런타임 검사 시작. RLS·security_definer 보안 커버
```

### 11.3 Phase C (4주) — splinter 나머지 + 사내 룰

```
작업:
  1. P1 성능 5룰, P2 유지보수 5룰
  2. 사내 도메인 룰 5개 (yp-001 ~ yp-005)
  3. /advisors UI 카테고리 탭 + 음소거
공수: 30h
예상 가치: 100점 경로 완주
```

---

## 12. 프로젝트 결론 — 경쟁이 아니라 상호보완

### 12.1 핵심 명제

> **"splinter와 squawk는 같은 평면에서 경쟁하지 않는다. 분석 대상이 다르다."**
>
> - splinter: 런타임 metadata (pg_catalog·pg_stat) — "지금 DB 상태"
> - squawk: DDL SQL AST — "이 변경이 안전한가"
>
> 두 도구의 룰 목록은 자연스럽게 분리되며, 동일 개념이라도 시점이 달라 중복 유지는 정당하다.

### 12.2 룰 할당 원칙 (§10 요약)

1. 런타임 상태 → **splinter**
2. DDL 안전성 → **squawk**
3. 스키마 컨벤션 → **schemalint** (Layer 2 다른 도구)
4. 같은 개념의 이중 검증은 **"시점이 다른 경우만"** 허용
5. 사용자 룰이 필요하면 → **splinter (TS) 또는 schemalint (TS)**. squawk는 고정.

### 12.3 최종 구성

| Layer | 도구 | 시점 | 담당 룰 수 |
|-------|------|------|-----------|
| 1. Design-time | Prisma Lint + squawk (hook) | pre-commit | ~10 + 24 |
| 2. CI-time | squawk (PR) + schemalint (shadow DB) | PR | 24 + 25+ |
| 3. Runtime | splinter (cron) | daily/weekly | 38 |

**총 약 80 룰** (중복 제거 후). Phase C 완료 시 Advisors 100/100 달성.

### 12.4 본 비교가 밝힌 안 쓰는 조합

- ❌ squawk 단독 → 런타임 상태 놓침
- ❌ splinter 단독 → DDL 선제 차단 못함
- ❌ 두 도구에 같은 룰 중복 배치 → 알림 피로 증가
- ❌ Prisma Lint로 SQL DDL 커버 시도 → 구조적 불가

---

## 13. 참고 자료 (1:1 비교 보강용)

1. splinter GitHub — https://github.com/supabase/splinter
2. squawk GitHub — https://github.com/sbdchd/squawk
3. squawk rules — https://squawkhq.com/docs/rules
4. pg_catalog 공식 — https://www.postgresql.org/docs/current/catalogs.html
5. pg_query AST (squawk 내부) — https://github.com/pganalyze/pg_query
6. pgsql-ast-parser (squawk 대체 TS 파서) — https://github.com/oguimbal/pgsql-ast-parser
7. Strong Migrations (squawk 영감) — https://github.com/ankane/strong_migrations
8. Supabase Database Linter — https://supabase.com/docs/guides/database/database-linter
9. 자체 03번 Advisors 매트릭스 — `docs/research/2026-04-supabase-parity/01-research/10-advisors/03-advisors-matrix.md`
10. 자체 01번 splinter deep-dive — `docs/research/2026-04-supabase-parity/01-research/10-advisors/01-splinter-full-port-deep-dive.md`
11. 자체 02번 squawk/schemalint deep-dive — `docs/research/2026-04-supabase-parity/01-research/10-advisors/02-squawk-schemalint-deep-dive.md`

---

**문서 끝.** (1:1 결론: 경쟁 아닌 상호보완 · 분석 대상이 다름 · 룰은 시점으로 분리 · 단독으로는 80% 커버, 결합 시 100%.)
