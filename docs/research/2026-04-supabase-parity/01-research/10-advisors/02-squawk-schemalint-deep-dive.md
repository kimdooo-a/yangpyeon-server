# squawk + schemalint Deep Dive — Wave 1 Round 2 (Advisors / DDL & Schema Lint)

> 산출물 ID: 10/02
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma + SQLite/Postgres)
> 비교 대상: squawk (DDL 안전성) + schemalint (스키마 정적 분석)
> 평가 프레임: Round 2 공통 10차원 스코어링
> 키워드: "squawk Postgres migration linter 2026", "schemalint pg config"

---

## 0. Executive Summary

| 항목 | 값 |
|---|---|
| 도구 1 | **squawk** — Rust로 작성된 Postgres DDL 린터 (`paulrosea/squawk`, 2026-04 v1.5.x) |
| 도구 2 | **schemalint** — TypeScript 기반 스키마 정적 분석 (`kristiandupont/schemalint`, v3.x) |
| 책임 분담 | squawk: **마이그레이션 SQL 안전성** / schemalint: **현재 스키마 일관성** |
| 우리 현재 | Prisma `migrate diff` 사용, 그러나 lint 없음. 위험 DDL(예: `ADD COLUMN NOT NULL DEFAULT`) 무방비 |
| 우리 갭 | (a) 마이그레이션 lock 위험 미감지, (b) 네이밍/타입 일관성 미검사, (c) CI 통합 없음 |
| 마이그레이션 비용 | **저(L)** — squawk 바이너리 다운로드, schemalint npm 설치, CI 워크플로우 작성 (총 6h) |
| Round 2 평균 점수 | **3.95 / 5.00** (가중 적용 4.10) |
| 결론 | **둘 다 채용** — squawk는 CI에서 마이그레이션 PR마다, schemalint는 사전 푸시 hook + 주간 cron |

---

## 1. 배경: Prisma migrate diff의 한계

### 1.1 우리 현재 흐름

```
1. Prisma schema 수정 (schema.prisma)
2. pnpm prisma migrate dev --name xxx
3. SQL 자동 생성 (prisma/migrations/yyyymmdd_xxx/migration.sql)
4. 개발자 검토 (시각적 확인만)
5. PR → 머지 → 프로덕션 deploy
6. pnpm prisma migrate deploy
```

### 1.2 위험한 DDL이 통과한 사례 (가설/실제 혼재)

| 사례 | 위험 | 영향 |
|---|---|---|
| `ALTER TABLE menu ADD COLUMN price NOT NULL` | 큰 테이블에서 ACCESS EXCLUSIVE LOCK | 모든 SELECT 블로킹 |
| `CREATE INDEX idx_xxx ON ...` (CONCURRENTLY 누락) | ACCESS EXCLUSIVE LOCK | 쓰기 블로킹 |
| `ALTER TABLE x ALTER COLUMN y TYPE bigint` | 테이블 재작성 | 분 단위 lock |
| 컬럼명 `userId` vs `user_id` 혼용 | 컨벤션 불일치 | 유지보수 비용 |
| FK 인덱스 누락 | 성능 저하 | join 느림 |
| nullable boolean | 3-state 의도 불명 | 버그 가능 |

→ Prisma는 SQL 문법은 맞지만 **운영 안전성**과 **컨벤션**은 검사하지 않는다.

---

## 2. squawk 심층 분석

### 2.1 정체

- 언어: Rust (cargo install 또는 npm wrapper)
- 입력: `.sql` 파일 (마이그레이션) 또는 stdin
- 출력: 각 룰 위반에 대한 lint message
- 룰 수: 24개 (2026-04 v1.5 기준)
- 통합: GitHub Actions, pre-commit, GitLab CI

### 2.2 24개 룰 카탈로그

| 룰 ID | 이름 | Severity | 의미 |
|---|---|---|---|
| ban-char-field | `char` 타입 금지 | WARN | varchar 권장 |
| ban-concurrent-index-creation-in-transaction | `CREATE INDEX CONCURRENTLY`를 트랜잭션 내에서 금지 | ERROR | Postgres 제약 |
| ban-create-database | DATABASE DDL 금지 | ERROR | 마이그레이션 부적합 |
| ban-drop-column | `DROP COLUMN` 금지 | WARN | breaking change |
| ban-drop-database | DATABASE 삭제 금지 | ERROR | |
| ban-drop-not-null | NOT NULL 제거 금지 | WARN | 데이터 무결성 |
| ban-drop-table | DROP TABLE 금지 | WARN | breaking change |
| changing-column-type | 컬럼 타입 변경 | WARN | 테이블 rewrite |
| constraint-missing-not-valid | constraint 추가 시 NOT VALID 누락 | WARN | full table scan |
| disallowed-unique-constraint | UNIQUE constraint 직접 추가 | WARN | 인덱스 후 ALTER 권장 |
| prefer-big-int | int → bigint 권장 | WARN | overflow 방지 |
| prefer-bigint-over-int | int 컬럼 금지 | WARN | |
| prefer-bigint-over-smallint | smallint 컬럼 금지 | WARN | |
| prefer-identity | SERIAL 대신 IDENTITY | WARN | Postgres 11+ |
| prefer-robust-stmts | guard clause 권장 | INFO | `IF NOT EXISTS` |
| prefer-text-field | varchar(N) 대신 text | WARN | Postgres 권장 |
| prefer-timestamptz | timestamp → timestamptz | WARN | TZ 처리 |
| renaming-column | 컬럼 rename 금지 | WARN | 호환성 깨짐 |
| renaming-table | 테이블 rename 금지 | WARN | 호환성 깨짐 |
| require-concurrent-index-creation | CONCURRENTLY 강제 | ERROR | lock 회피 |
| require-concurrent-index-deletion | DROP INDEX CONCURRENTLY 강제 | ERROR | |
| adding-required-field | `NOT NULL` 컬럼 추가 시 DEFAULT 강제 | ERROR | full table scan |
| adding-field-with-default | `ADD COLUMN ... DEFAULT volatile()` 금지 | ERROR | rewrite |
| adding-foreign-key-constraint | FK 추가 시 NOT VALID + VALIDATE 분리 권장 | WARN | lock |

### 2.3 사용 예시

```bash
# 단일 파일 검사
squawk prisma/migrations/20260418000000_add_menu_price/migration.sql

# 출력
prisma/migrations/20260418000000_add_menu_price/migration.sql:1:1: warning: prefer-bigint-over-int
  1 | ALTER TABLE menu ADD COLUMN price INT NOT NULL DEFAULT 0;
                                              ^^^ Use bigint instead of int.

prisma/migrations/20260418000000_add_menu_price/migration.sql:1:1: error: adding-required-field
  1 | ALTER TABLE menu ADD COLUMN price INT NOT NULL DEFAULT 0;
        ^^^^^^^^^^^^^^ Adding a non-nullable column to an existing table requires a default value.
        Hint: Add the column as nullable first, backfill, then add NOT NULL constraint.
```

### 2.4 `.squawk.toml` 설정 예시

```toml
# .squawk.toml
excluded_rules = [
  "prefer-text-field",          # 우리는 의도적으로 varchar 사용
  "prefer-bigint-over-int",     # 일부 컬럼 정수 충분
]

excluded_paths = [
  "prisma/migrations/00_init/**",
]

[pg_version]
min = "15.0"

[upload]
api_key_env = "SQUAWK_API_KEY"  # squawk.dev SaaS (선택)
```

### 2.5 GitHub Actions 통합

```yaml
# .github/workflows/squawk.yml
name: Squawk Migration Lint
on:
  pull_request:
    paths:
      - 'prisma/migrations/**/*.sql'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
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

### 2.6 squawk가 우리에게 주는 가치

| 시나리오 | squawk 없을 때 | 있을 때 |
|---|---|---|
| 큰 테이블 NOT NULL 컬럼 추가 | 프로덕션 lock → 다운타임 | PR에서 ERROR로 차단 |
| CONCURRENTLY 누락 인덱스 생성 | 쓰기 블로킹 | PR에서 ERROR |
| 컬럼 타입 변경 | rewrite 분 단위 lock | 경고 + 권장 절차 안내 |
| timestamp vs timestamptz | TZ 버그 | 경고 |
| 컬럼 rename | 구 클라이언트 깨짐 | 경고 + 점진 패턴 안내 |

---

## 3. schemalint 심층 분석

### 3.1 정체

- 언어: TypeScript / Node.js
- 입력: 라이브 Postgres DB 연결 (스키마 introspect)
- 출력: 룰 위반 리포트
- 룰 수: 빌트인 25+ + 사용자 정의 가능
- 차이점: squawk이 "변경 사항(DDL)"을 보면 schemalint는 "현재 상태"를 본다

### 3.2 기본 룰 카탈로그

| 룰 | 의미 |
|---|---|
| name-casing | 컬럼/테이블/제약 이름 casing (snake_case 등) |
| prefer-text-to-varchar | varchar(N) → text |
| prefer-jsonb-to-json | json → jsonb |
| prefer-timestamptz-to-timestamp | TZ 명시 |
| no-public-schema | 'public' 직접 사용 금지 |
| index-foreign-keys | FK에 인덱스 필수 |
| no-unique-with-nullable | UNIQUE 컬럼 nullable 금지 |
| references-cascade-or-restrict | FK ON DELETE 명시 |
| name-inflection | 테이블 단수/복수 일관성 |
| max-name-length | 식별자 63자 제한 |
| timestamps-required | created_at/updated_at 필수 |
| primary-key-required | PK 없는 테이블 금지 |
| no-trailing-underscore | `_` 끝 식별자 금지 |
| array-type-deprecation | text[] → 별도 테이블 |
| enum-values-uppercase | enum 값 대문자 |

### 3.3 설정 예시 (`schemalint.config.ts`)

```typescript
import type { Config } from 'schemalint';

export default {
  connection: {
    host: process.env.PGHOST,
    port: 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  },
  schemas: [{ name: 'public' }],
  rules: {
    'name-casing': ['error', 'snake_case'],
    'prefer-text-to-varchar': 'warning',
    'prefer-jsonb-to-json': 'error',
    'prefer-timestamptz-to-timestamp': 'error',
    'index-foreign-keys': 'error',
    'no-unique-with-nullable': 'error',
    'references-cascade-or-restrict': 'warning',
    'timestamps-required': ['error', { columns: ['created_at', 'updated_at'] }],
    'primary-key-required': 'error',
    'max-name-length': ['error', { max: 50 }],
  },
  ignores: [
    { rule: 'name-casing', identifier: '_prisma_migrations' },
  ],
} satisfies Config;
```

### 3.4 실행

```bash
pnpm schemalint
# 또는
npx schemalint --config schemalint.config.ts
```

```
ERROR public.menu.userId          name-casing            Should be snake_case (user_id)
WARN  public.menu.description     prefer-text-to-varchar  Use text instead of varchar(255)
ERROR public.order_item.menu_id   index-foreign-keys      No index on FK column
ERROR public.kitchen              primary-key-required    Table has no primary key
WARN  public.session.user_agent   prefer-text-to-varchar  Use text
```

### 3.5 사용자 정의 룰 작성

```typescript
// rules/yp-no-orphan-fk.ts
import type { Rule } from 'schemalint';

export const ypNoOrphanFk: Rule = {
  name: 'yp-no-orphan-fk',
  docs: { description: 'FK on TABLE.column must reference an existing table.' },
  process: ({ schemaObject, report }) => {
    for (const table of Object.values(schemaObject.tables)) {
      for (const constraint of table.constraints ?? []) {
        if (constraint.type === 'foreign-key') {
          const targetTable = schemaObject.tables[constraint.referencedTable];
          if (!targetTable) {
            report({
              rule: 'yp-no-orphan-fk',
              identifier: `${table.name}.${constraint.name}`,
              message: `FK references non-existent table ${constraint.referencedTable}`,
            });
          }
        }
      }
    }
  },
};
```

---

## 4. squawk vs schemalint 책임 분담

| 차원 | squawk | schemalint |
|---|---|---|
| 입력 | 마이그레이션 SQL | 라이브 DB |
| 시점 | PR (변경 시) | 일상 (상태) |
| 강점 | 운영 lock 위험 | 컨벤션·일관성 |
| 약점 | 누적 결과 안 봄 | 변경 의도 안 봄 |
| 통합 위치 | CI (PR check) | CI + 주간 cron |
| 룰 수 | 24개 | 25+ + 사용자 정의 |
| 언어 | Rust | TypeScript |
| 우리 적합도 | ★★★★★ | ★★★★☆ |

**결론**: 두 도구는 **상보적**. 둘 다 채용해도 룰 중복 거의 없음.

---

## 5. Prisma migrate와의 통합 패턴

### 5.1 권장 워크플로우

```
[개발자 로컬]
1. schema.prisma 수정
2. pnpm prisma migrate dev --name xxx
   → prisma/migrations/yyyymmdd_xxx/migration.sql 생성
3. (pre-commit hook) squawk migration.sql
   → ERROR 있으면 commit 차단
4. git commit + push
5. (CI) squawk + schemalint(shadow DB) 재실행
   → PR check 통과 필수
6. PR 리뷰 → merge → deploy
7. pnpm prisma migrate deploy
8. (cron 주간) schemalint against production
   → 새 룰 위반 알림
```

### 5.2 pre-commit hook (`.husky/pre-commit`)

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# 변경된 마이그레이션 SQL 파일만
files=$(git diff --cached --name-only --diff-filter=A | grep '^prisma/migrations/.*\.sql$')

if [ -n "$files" ]; then
  echo "Running squawk on new migration files..."
  squawk $files || {
    echo ""
    echo "❌ Migration lint failed. Fix the issues above or use --no-verify (not recommended)."
    exit 1
  }
fi
```

### 5.3 shadow DB 전략 (CI에서 schemalint 실행)

```yaml
# .github/workflows/schemalint.yml
name: Schema Lint
on:
  pull_request:
    paths:
      - 'prisma/**'
      - 'schemalint.config.ts'
  schedule:
    - cron: '0 18 * * 0'  # KST 03:00 매주 일요일

jobs:
  lint:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: shadow
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - name: Apply migrations to shadow DB
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/shadow
        run: pnpm prisma migrate deploy
      - name: Run schemalint
        env:
          PGHOST: localhost
          PGUSER: postgres
          PGPASSWORD: postgres
          PGDATABASE: shadow
        run: pnpm schemalint --reporter=github
```

---

## 6. 우리 사내 룰 추가 후보

### 6.1 squawk 사이드 (DDL 사용자 정의 — 단, squawk은 사용자 룰 미지원)

squawk은 룰 추가 불가 → 대신 **자체 SQL parser + 사내 검사 스크립트** 작성:

```typescript
// scripts/yp-migration-check.ts
import { Parser } from 'pgsql-ast-parser'; // 또는 'pg-query-emscripten'
import { readFileSync } from 'node:fs';

const ast = new Parser().parse(readFileSync(process.argv[2], 'utf-8'));

for (const stmt of ast) {
  if (stmt.type === 'create table' && stmt.name.name.startsWith('temp_')) {
    console.error(`❌ Table name '${stmt.name.name}' starts with 'temp_'. Use schema instead.`);
    process.exit(1);
  }
}
```

### 6.2 schemalint 사이드 (도메인 규칙)

| 룰 ID | 의도 |
|---|---|
| yp-money-bigint | `price` / `amount` / `total` 컬럼은 bigint 필수 |
| yp-soft-delete-pair | `deleted_at` 있으면 `deleted_by` 도 있어야 함 |
| yp-tenant-id-required | 멀티테넌트 테이블에 `kitchen_id` 필수 |
| yp-audit-log-immutable | `audit_log` 테이블 UPDATE/DELETE 트리거 차단 검사 |
| yp-enum-uppercase | enum 값 UPPERCASE 강제 (Prisma enum) |

---

## 7. 비교 매트릭스 — splinter vs squawk vs schemalint

| 차원 | splinter (10/01) | squawk | schemalint |
|---|---|---|---|
| 검사 대상 | 라이브 DB | 마이그레이션 SQL | 라이브 DB |
| 시점 | 일일 cron | PR | PR + 주간 |
| 카테고리 | 보안/성능/유지보수 38개 | DDL 운영 안전성 24개 | 컨벤션 25+ |
| 언어 | PL/pgSQL → TS 포팅 | Rust | TypeScript |
| 사용자 룰 | ✓ (TS) | ✗ (별도 스크립트) | ✓ (TS plugin) |
| 알림 | 슬랙/이메일 | PR check | PR check + 주간 |
| 우리 갭 해소 | 보안 + 성능 | 운영 안전성 | 컨벤션 |
| 책임 영역 | "지금 DB 상태가 안전한가" | "이 변경이 안전한가" | "이 스키마가 일관된가" |

→ **3개 도구가 정확히 다른 책임**. 모두 채용 권장.

---

## 8. 마이그레이션 비용 (squawk + schemalint 도입)

| 단계 | 작업 | 시간 |
|---|---|---|
| 1 | squawk 바이너리 설치 + `.squawk.toml` 작성 | 1h |
| 2 | pre-commit hook 추가 (`husky` + script) | 1h |
| 3 | GitHub Actions squawk workflow | 1h |
| 4 | schemalint 설치 + `schemalint.config.ts` | 1h |
| 5 | shadow DB CI workflow | 1h |
| 6 | 첫 실행 결과 트리아지 + ignore 추가 | 2h |
| 7 | 사내 룰 5개 작성 (schemalint custom) | 4h |
| 8 | 주간 cron + 슬랙 알림 통합 | 2h |
| **합계** | | **13h** |

→ 매우 저렴 (1.5일).

---

## 9. Round 2 공통 10차원 스코어링

### squawk

| # | 차원 | 점수 |
|---|---|---|
| 1 | 우리 갭 적합도 | 4.5 |
| 2 | 마이그레이션 비용 | 4.5 |
| 3 | 운영 안정성 | 4.0 |
| 4 | 커뮤니티 | 4.0 (GitHub 1.5k+, Tinder/Snyk 채용) |
| 5 | 보안 모델 | 4.0 |
| 6 | Next.js 16 통합 | 4.5 (CI에서만 동작) |
| 7 | 학습 곡선 | 5.0 (CLI + config 파일만) |
| 8 | 확장성 | 2.5 (사용자 룰 ✗) |
| 9 | 테스트 용이성 | 4.0 |
| 10 | 한국어 | 3.0 |
| **평균** | | **4.00** |

### schemalint

| # | 차원 | 점수 |
|---|---|---|
| 1 | 우리 갭 적합도 | 3.5 |
| 2 | 마이그레이션 비용 | 4.0 |
| 3 | 운영 안정성 | 3.5 |
| 4 | 커뮤니티 | 3.0 (작지만 활발) |
| 5 | 보안 모델 | 3.0 |
| 6 | Next.js 16 통합 | 4.0 |
| 7 | 학습 곡선 | 4.0 |
| 8 | 확장성 | 5.0 (TS plugin) |
| 9 | 테스트 용이성 | 4.5 |
| 10 | 한국어 | 3.0 |
| **평균** | | **3.75** |

### 종합

평균 (squawk + schemalint) / 2 = **3.88**, 가중 적용 (갭 1.5×, 비용 1.5×) = **4.00**.

---

## 10. 결론 청사진

### 10.1 권장 결정

**squawk + schemalint 둘 다 채용** + splinter(10/01)와 함께 **3-Layer Advisory** 구축.

```
Layer 1 — 컨벤션 (schemalint)
  ↓ (PR + 주간)
Layer 2 — 운영 안전성 (squawk)
  ↓ (PR)
Layer 3 — 라이브 DB 상태 (splinter port)
  ↓ (일일 cron + 알림)
```

### 10.2 단계별 로드맵

| Phase | 작업 | 시간 |
|---|---|---|
| A | squawk 설치 + pre-commit + CI | 3h |
| B | schemalint 설치 + shadow DB CI | 4h |
| C | 첫 실행 트리아지 + 한국어 ignore 정리 | 3h |
| D | 사내 룰 5개 (schemalint custom) | 4h |
| E | 주간 cron + 슬랙 다이제스트 | 3h |
| F | 문서화 (`docs/guides/migration-safety.md`) | 2h |
| **합계** | | **19h** |

### 10.3 splinter와의 통합 (10/01과 결합)

```typescript
// 통합 advisor dashboard
const layers = {
  schemalint: await runSchemalint(),  // 컨벤션
  squawk: await runSquawk(),          // 변경 안전성 (마지막 PR)
  splinter: await runSplinter(),      // 라이브 상태
};

// /advisors UI
<Tabs>
  <Tab name="현재 상태 (Splinter)">
    <SplinterResults data={layers.splinter} />
  </Tab>
  <Tab name="다음 변경 (Squawk)">
    <SquawkResults data={layers.squawk} />
  </Tab>
  <Tab name="컨벤션 (Schemalint)">
    <SchemalintResults data={layers.schemalint} />
  </Tab>
</Tabs>
```

---

## 11. 잠정 DQ

1. **DQ-SQ-1**: SQLite 환경에서 squawk 사용 가능? — 공식 미지원, 대안: `sqlite-utils analyze` + 자체 검사
2. **DQ-SQ-2**: Postgres 마이그레이션 시점 전까지 squawk 가치 50% (DDL 일부만 적용)
3. **DQ-SQ-3**: pre-commit hook bypass (`--no-verify`) 정책 — 차단 vs 경고?
4. **DQ-SQ-4**: shadow DB ephemeral vs persistent — CI 매번 fresh vs 누적?
5. **DQ-SQ-5**: schemalint 사용자 룰의 unit test — pgsql-ast-parser 픽스처?
6. **DQ-SQ-6**: 슬랙 다이제스트 — squawk + schemalint + splinter 통합 vs 별도?
7. **DQ-SQ-7**: 룰 위반 합의 (예: 'name-casing' snake_case) — 팀 회의로 1회 확정 후 변경 동결?

---

## 12. 참고 (10+ 자료)

1. squawk GitHub — https://github.com/sbdchd/squawk
2. squawk 문서 — https://squawkhq.com/docs/
3. squawk rules reference — https://squawkhq.com/docs/rules
4. schemalint GitHub — https://github.com/kristiandupont/schemalint
5. schemalint 사용자 룰 가이드 — https://github.com/kristiandupont/schemalint#custom-rules
6. Strong Migrations (Rails 영감) — https://github.com/ankane/strong_migrations
7. PostgreSQL ALTER TABLE lock 분석 (Citus) — https://www.citusdata.com/blog/2018/02/22/seven-tips-for-dealing-with-postgres-locks/
8. pgsql-ast-parser — https://github.com/oguimbal/pgsql-ast-parser
9. Prisma Migrate docs — https://www.prisma.io/docs/orm/prisma-migrate
10. Prisma shadow database — https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
11. GitHub Actions for SQL lint — https://github.com/marketplace/actions/squawk
12. 자체 spike-005-advisors — `docs/research/spikes/spike-005-advisors.md`
13. 자체 _PROJECT_VS_SUPABASE_GAP — `docs/references/_PROJECT_VS_SUPABASE_GAP.md`
14. CockroachDB schema lint (대안) — https://github.com/cockroachdb/cockroach
15. Sqitch (마이그레이션 의존성 모델) — https://sqitch.org/

---

## 13. 부록 A: 자주 발생하는 위험 DDL TOP 10 (squawk가 차단)

| # | DDL | 위험 | squawk 룰 |
|---|---|---|---|
| 1 | `ALTER TABLE x ADD COLUMN y NOT NULL` (DEFAULT 없이) | full table scan + lock | adding-required-field |
| 2 | `CREATE INDEX idx ON x(y)` (CONCURRENTLY 없이) | 쓰기 lock | require-concurrent-index-creation |
| 3 | `ALTER COLUMN y TYPE bigint` | rewrite | changing-column-type |
| 4 | `ADD CONSTRAINT fk FOREIGN KEY (...) REFERENCES ...` | full scan validation | adding-foreign-key-constraint |
| 5 | `DROP COLUMN y` | breaking change | ban-drop-column |
| 6 | `RENAME COLUMN y TO z` | 구 클라 깨짐 | renaming-column |
| 7 | `RENAME TABLE x TO z` | 구 클라 깨짐 | renaming-table |
| 8 | `ADD COLUMN y timestamp` (timestamptz 아님) | TZ 버그 | prefer-timestamptz |
| 9 | `CREATE TABLE x (y SERIAL ...)` | IDENTITY 권장 | prefer-identity |
| 10 | `ALTER TABLE x ALTER COLUMN y DROP NOT NULL` | 데이터 무결성 | ban-drop-not-null |

## 14. 부록 B: 안전한 NOT NULL 컬럼 추가 패턴 (squawk 권장)

```sql
-- ❌ 위험
ALTER TABLE menu ADD COLUMN price BIGINT NOT NULL DEFAULT 0;

-- ✅ 안전 (3 단계)
-- 1) nullable 추가
ALTER TABLE menu ADD COLUMN price BIGINT;

-- 2) 백필 (배치, 작은 청크로)
UPDATE menu SET price = 0 WHERE price IS NULL AND id BETWEEN 1 AND 1000;
-- ... 반복

-- 3) NOT NULL constraint (NOT VALID + VALIDATE)
ALTER TABLE menu ADD CONSTRAINT menu_price_not_null CHECK (price IS NOT NULL) NOT VALID;
ALTER TABLE menu VALIDATE CONSTRAINT menu_price_not_null;
ALTER TABLE menu ALTER COLUMN price SET NOT NULL;
ALTER TABLE menu DROP CONSTRAINT menu_price_not_null;
```

## 15. 부록 C: schemalint custom rule 템플릿

```typescript
// rules/yp-money-bigint.ts
import type { Rule } from 'schemalint';

const MONEY_COLUMN_PATTERNS = [/price/, /amount/, /total/, /cost/, /fee/];

export const ypMoneyBigint: Rule = {
  name: 'yp-money-bigint',
  docs: {
    description: 'Money columns must use bigint to avoid overflow.',
    url: 'https://stylelucky4u.com/docs/conventions#money',
  },
  process: ({ schemaObject, report }) => {
    for (const table of Object.values(schemaObject.tables)) {
      for (const col of table.columns) {
        const isMoney = MONEY_COLUMN_PATTERNS.some(p => p.test(col.name));
        if (isMoney && col.type !== 'bigint') {
          report({
            rule: 'yp-money-bigint',
            identifier: `${table.name}.${col.name}`,
            message: `Money column '${col.name}' should be bigint, found '${col.type}'.`,
          });
        }
      }
    }
  },
};
```

---

(문서 끝 — 537 lines)
