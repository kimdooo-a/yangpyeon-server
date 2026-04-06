# Wave 4 — Supabase CI/CD & 배포 파이프라인 설계

> 작성일: 2026-04-06  
> 참조: [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) | [GitHub Actions](https://supabase.com/docs/guides/functions/examples/github-actions) | [Branching](https://supabase.com/docs/guides/deployment/branching) | [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)

---

## 목차

1. [로컬 개발 워크플로우](#1-로컬-개발-워크플로우)
2. [브랜칭 전략](#2-브랜칭-전략)
3. [GitHub Actions 파이프라인](#3-github-actions-파이프라인)
4. [마이그레이션 관리](#4-마이그레이션-관리)
5. [시크릿 관리](#5-시크릿-관리)
6. [모니터링 통합](#6-모니터링-통합)
7. [전체 흐름 요약](#7-전체-흐름-요약)

---

## 1. 로컬 개발 워크플로우

### 1.1 전제 조건

로컬 개발을 시작하기 전 아래 도구가 설치되어 있어야 한다.

| 도구 | 버전 | 역할 |
|------|------|------|
| Docker Desktop | 4.x 이상 | 로컬 Supabase 스택 실행 |
| Supabase CLI | 최신 (`npm i -g supabase`) | 마이그레이션/배포 |
| Node.js | 18 이상 | 타입 생성, 스크립트 |
| Git | 2.x | 버전 관리 |

### 1.2 Docker 기반 로컬 Supabase 스택

`supabase start` 명령은 내부적으로 Docker Compose로 아래 컨테이너를 띄운다.

```
┌─────────────────────────────────────────────────────┐
│               로컬 Supabase 스택 (Docker)            │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐   │
│  │ supabase │  │  Kong    │  │  GoTrue (Auth) │   │
│  │ Studio   │  │ (Gateway)│  │  :9999         │   │
│  │  :54323  │  │  :54321  │  └────────────────┘   │
│  └──────────┘  └──────────┘                        │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐   │
│  │ Postgres │  │  PostgREST│  │   Realtime     │   │
│  │  :54322  │  │  :3000   │  │   :4000        │   │
│  └──────────┘  └──────────┘  └────────────────┘   │
│                                                     │
│  ┌──────────┐  ┌──────────┐                        │
│  │ Storage  │  │ Deno Edge│                        │
│  │  :5000   │  │ Functions│                        │
│  └──────────┘  └──────────┘                        │
└─────────────────────────────────────────────────────┘
```

### 1.3 프로젝트 초기화 ~ 배포 전체 흐름

```bash
# ① 프로젝트 초기화 (최초 1회)
supabase init
# → supabase/ 디렉토리 생성
# → supabase/config.toml 생성

# ② 원격 프로젝트와 연결
supabase login
supabase link --project-ref <PROJECT_REF>

# ③ 로컬 스택 시작
supabase start
# → Docker 컨테이너 일괄 기동
# → 로컬 Studio: http://localhost:54323

# ④ 개발 작업
# 방법 A: Studio UI에서 테이블/함수 편집 후 diff 캡처
supabase db diff --schema public -f add_products_table

# 방법 B: SQL 파일을 직접 작성
# supabase/migrations/20260406120000_add_products.sql

# ⑤ 마이그레이션 로컬 적용 테스트
supabase db reset            # 마이그레이션 전체 재실행 (seed 포함)
# 또는
supabase db push --local     # 미적용 마이그레이션만 실행

# ⑥ 타입 자동 생성 (TypeScript 프로젝트)
supabase gen types typescript --local > src/lib/database.types.ts

# ⑦ Edge Functions 개발/테스트
supabase functions new my-function
supabase functions serve my-function --no-verify-jwt  # 로컬 서빙

# ⑧ 원격 스테이징에 배포
supabase db push                      # 마이그레이션 적용
supabase functions deploy my-function # Edge Function 배포

# ⑨ 프로덕션 배포 (CI/CD에 위임 권장)
# → GitHub Actions 섹션 참조

# ⑩ 로컬 스택 종료
supabase stop
```

### 1.4 디렉토리 구조

```
프로젝트 루트/
├── supabase/
│   ├── config.toml              ← 로컬 설정 (포트, 기능 on/off)
│   ├── seed.sql                 ← 로컬/Preview 브랜치 초기 데이터
│   ├── migrations/              ← 마이그레이션 파일 (타임스탬프 정렬)
│   │   ├── 20260101000000_init.sql
│   │   ├── 20260201000000_add_users.sql
│   │   └── 20260406000000_add_products.sql
│   └── functions/               ← Edge Functions
│       └── my-function/
│           └── index.ts
├── .env.local                   ← 로컬 환경변수 (커밋 금지)
└── src/
    └── lib/
        └── database.types.ts    ← supabase gen types 결과물
```

### 1.5 config.toml 핵심 설정

```toml
# supabase/config.toml
[api]
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
port = 54323
api_url = "http://127.0.0.1"

[auth]
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["https://127.0.0.1:3000"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false

# 이메일 OTP (로컬 테스트용 — 실제 발송 안 함)
[auth.email.smtp]
# 로컬은 Inbucket으로 수신: http://localhost:54324
```

---

## 2. 브랜칭 전략

### 2.1 핵심 개념: Git 브랜치 = Supabase 브랜치

Supabase Database Branching은 **Git 브랜치와 Supabase 인스턴스를 1:1 대응**시킨다.  
PR을 생성하면 독립된 Postgres 인스턴스(Preview Branch)가 자동 프로비저닝된다.

```
Git 브랜치                Supabase 인스턴스
─────────────────────────────────────────────
main            ←→   프로덕션 프로젝트 (영구)
develop         ←→   Persistent Branch (영구)
feature/xxx     ←→   Preview Branch    (PR 수명)
hotfix/yyy      ←→   Preview Branch    (PR 수명)
```

### 2.2 브랜치 유형

| 유형 | 수명 | 용도 | 비용 |
|------|------|------|------|
| **Persistent Branch** | 영구 (수동 삭제) | staging, QA, develop | 별도 인스턴스 과금 |
| **Preview Branch** | PR 수명 (머지/닫기 시 삭제) | 기능 개발, 리뷰 | 사용량 기반 |

```
로컬 개발
   │
   ├─→ feature/add-payment-table
   │       │
   │       ├─→ [PR 생성] → Preview Branch 자동 프로비저닝
   │       │                  - 독립된 Postgres 인스턴스
   │       │                  - 독립된 API 키
   │       │                  - seed.sql로 데이터 시딩
   │       │
   │       └─→ [PR 머지] → main에 마이그레이션 적용
   │                       → Preview Branch 자동 삭제
   │
   └─→ develop (Persistent)
           └─→ 장기 QA/통합 테스트 환경
```

### 2.3 환경 분리 전략

```
환경          브랜치        Supabase 프로젝트    목적
──────────────────────────────────────────────────────
local         (all)         Docker 로컬           개발
preview       feature/*     Preview Branch        PR 리뷰
staging       develop       Persistent Branch     통합 테스트
production    main          메인 프로젝트          서비스 운영
```

### 2.4 환경변수 분리

각 환경별로 Supabase 연결 정보가 다르므로, 다음 구조로 관리한다.

```bash
# .env.local (로컬 개발 — 커밋 금지)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>

# .env.staging (staging 환경 — 커밋 금지, CI에서 주입)
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>

# .env.production (프로덕션 — 커밋 금지, CI에서 주입)
NEXT_PUBLIC_SUPABASE_URL=https://<prod-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<prod-anon-key>
```

### 2.5 GitHub Integration 설정

Supabase Dashboard → Project Settings → Integrations → GitHub

```
1. GitHub 저장소 연결
2. Production Branch: main
3. Deploy to production: ON (main 머지 시 자동 배포)
4. Required checks: ON (마이그레이션 검증 실패 시 PR 머지 차단)
5. Preview Branches: ON (PR 생성 시 자동 프로비저닝)
```

---

## 3. GitHub Actions 파이프라인

### 3.1 파이프라인 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions 파이프라인                    │
│                                                                 │
│  PR 생성/업데이트                PR 머지               릴리스    │
│  ───────────────          ───────────────────      ──────────── │
│  1. 체크아웃              1. 마이그레이션 적용      1. 프로덕션  │
│  2. CLI 설치              2. 타입 생성              배포 체크    │
│  3. 마이그레이션 검증     3. Edge Fn 배포           2. 헬스체크  │
│  4. 타입 생성 검증        4. 캐시 퍼지              3. 알림 발송 │
│  5. 린트                  5. 슬랙 알림                           │
│  6. 단위/통합 테스트                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 PR 검증 워크플로우 (pr-validate.yml)

```yaml
# .github/workflows/pr-validate.yml
name: PR 검증

on:
  pull_request:
    branches: [main, develop]
    types: [opened, synchronize, reopened]

env:
  SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
  SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL_STAGING }}

jobs:
  # ─── 잡 1: 마이그레이션 검증 ───────────────────────────────────
  validate-migrations:
    name: 마이그레이션 검증
    runs-on: ubuntu-latest
    steps:
      - name: 저장소 체크아웃
        uses: actions/checkout@v4

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 로컬 Supabase 스택 시작
        run: supabase start

      - name: 마이그레이션 유효성 검사 (dry-run)
        run: |
          supabase db reset          # 전체 마이그레이션 재실행
          echo "✓ 마이그레이션 검증 완료"

      - name: 마이그레이션 차이 확인
        run: |
          # 원격 스키마와 로컬 마이그레이션 간 diff 확인
          supabase db diff --linked --schema public || true

      - name: 로컬 스택 종료
        if: always()
        run: supabase stop --no-backup

  # ─── 잡 2: 타입 생성 검증 ──────────────────────────────────────
  validate-types:
    name: TypeScript 타입 검증
    runs-on: ubuntu-latest
    needs: validate-migrations
    steps:
      - uses: actions/checkout@v4

      - name: Node.js 설치
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 의존성 설치
        run: npm ci

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 로컬 스택 시작
        run: supabase start

      - name: 타입 생성 및 변경 사항 확인
        run: |
          supabase gen types typescript --local > /tmp/database.types.ts
          diff src/lib/database.types.ts /tmp/database.types.ts && \
            echo "✓ 타입 최신 상태" || \
            (echo "✗ 타입이 마이그레이션과 동기화되지 않음. 'supabase gen types' 실행 필요" && exit 1)

      - name: 로컬 스택 종료
        if: always()
        run: supabase stop --no-backup

  # ─── 잡 3: 린트 및 테스트 ──────────────────────────────────────
  lint-and-test:
    name: 린트 및 테스트
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Node.js 설치
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 의존성 설치
        run: npm ci

      - name: TypeScript 타입 체크
        run: npm run type-check

      - name: ESLint 실행
        run: npm run lint

      - name: 단위 테스트
        run: npm run test:unit
        env:
          CI: true

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 로컬 스택 시작
        run: supabase start

      - name: 통합 테스트 (로컬 Supabase 대상)
        run: npm run test:integration
        env:
          SUPABASE_URL: http://127.0.0.1:54321
          SUPABASE_ANON_KEY: ${{ env.SUPABASE_LOCAL_ANON_KEY }}

      - name: 로컬 스택 종료
        if: always()
        run: supabase stop --no-backup
```

### 3.3 PR 머지 배포 워크플로우 (deploy-staging.yml)

```yaml
# .github/workflows/deploy-staging.yml
name: 스테이징 배포

on:
  push:
    branches: [develop]

env:
  SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
  PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID_STAGING }}

jobs:
  deploy-staging:
    name: 스테이징 환경 배포
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 스테이징 프로젝트 연결
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_STAGING }}

      - name: 마이그레이션 적용
        run: |
          supabase db push
          echo "✓ 스테이징 마이그레이션 완료"
        env:
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD_STAGING }}

      - name: Edge Functions 배포
        run: |
          supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF_STAGING }}
          echo "✓ Edge Functions 배포 완료"

      - name: Edge Functions 시크릿 설정
        run: |
          supabase secrets set \
            SOME_API_KEY=${{ secrets.SOME_API_KEY }} \
            --project-ref ${{ secrets.SUPABASE_PROJECT_REF_STAGING }}

      - name: Node.js 설치
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 의존성 설치
        run: npm ci

      - name: 타입 갱신
        run: |
          supabase gen types typescript \
            --project-id ${{ secrets.SUPABASE_PROJECT_REF_STAGING }} \
            > src/lib/database.types.ts
          echo "✓ 타입 갱신 완료"

      - name: 배포 알림 (Slack)
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ 스테이징 배포 성공: ${{ github.ref_name }} (${{ github.sha }})"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 3.4 프로덕션 배포 워크플로우 (deploy-production.yml)

```yaml
# .github/workflows/deploy-production.yml
name: 프로덕션 배포

on:
  push:
    branches: [main]
  # 수동 트리거 (긴급 배포)
  workflow_dispatch:
    inputs:
      confirmed:
        description: '프로덕션 배포를 확인합니까? (yes 입력)'
        required: true
        default: 'no'

env:
  SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

jobs:
  # ─── 사전 검증 ────────────────────────────────────────────────
  pre-deploy-check:
    name: 배포 전 검증
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: 수동 트리거 확인
        if: github.event_name == 'workflow_dispatch'
        run: |
          if [ "${{ github.event.inputs.confirmed }}" != "yes" ]; then
            echo "배포 취소됨"
            exit 1
          fi

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 프로덕션 프로젝트 연결
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_PROD }}

      - name: 마이그레이션 사전 점검
        run: |
          # 적용되지 않은 마이그레이션 목록 확인
          supabase migration list --linked
          echo "✓ 마이그레이션 사전 점검 완료"

  # ─── 프로덕션 배포 ────────────────────────────────────────────
  deploy-production:
    name: 프로덕션 배포
    runs-on: ubuntu-latest
    environment: production           # GitHub Environments 보호 규칙 적용
    needs: pre-deploy-check
    steps:
      - uses: actions/checkout@v4

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: 프로덕션 프로젝트 연결
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF_PROD }}

      - name: DB 백업 트리거 (선택적)
        run: |
          echo "배포 전 수동 백업 확인 (Supabase Dashboard에서 PITR 확인)"

      - name: 마이그레이션 적용 (프로덕션)
        run: |
          supabase db push
          echo "✓ 프로덕션 마이그레이션 완료"
        env:
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD_PROD }}

      - name: Edge Functions 배포 (프로덕션)
        run: |
          supabase functions deploy \
            --project-ref ${{ secrets.SUPABASE_PROJECT_REF_PROD }}
          echo "✓ Edge Functions 배포 완료"

      - name: 헬스 체크
        run: |
          sleep 10  # 배포 안정화 대기
          curl -sf "${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}/rest/v1/" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            && echo "✓ API 헬스 체크 통과" \
            || (echo "✗ API 헬스 체크 실패" && exit 1)

      - name: 배포 알림 (Slack)
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "${{ job.status == 'success' && '✅' || '❌' }} 프로덕션 배포 ${{ job.status }}: ${{ github.sha }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 3.5 릴리스 체크리스트 워크플로우

```yaml
# .github/workflows/release-checklist.yml
name: 릴리스 체크리스트

on:
  release:
    types: [published]

jobs:
  release-checks:
    name: 릴리스 배포 체크리스트
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: "[체크] 마이그레이션 파일 이름 컨벤션 확인"
        run: |
          # 타임스탬프 형식 YYYYMMDDHHmmss 확인
          for f in supabase/migrations/*.sql; do
            name=$(basename "$f" .sql)
            if ! [[ "$name" =~ ^[0-9]{14}_ ]]; then
              echo "✗ 비표준 마이그레이션 파일명: $f"
              exit 1
            fi
          done
          echo "✓ 마이그레이션 파일명 컨벤션 통과"

      - name: "[체크] .env 파일 커밋 방지"
        run: |
          if git ls-files | grep -E '\.env$|\.env\.local$|\.env\.production$'; then
            echo "✗ .env 파일이 추적되고 있습니다!"
            exit 1
          fi
          echo "✓ .env 파일 미추적 확인"

      - name: "[체크] 시크릿 하드코딩 탐지"
        run: |
          # 기본적인 패턴 탐지 (supabase 키 패턴)
          if grep -r "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" src/ --include="*.ts" --include="*.tsx"; then
            echo "✗ 하드코딩된 JWT 토큰이 발견되었습니다!"
            exit 1
          fi
          echo "✓ 하드코딩 시크릿 없음"
```

---

## 4. 마이그레이션 관리

### 4.1 마이그레이션 파일 컨벤션

**파일명 형식**: `YYYYMMDDHHMMSS_<설명>.sql`

```
supabase/migrations/
├── 20260101000000_init_schema.sql          ← 초기 스키마
├── 20260201120000_add_users_table.sql      ← 사용자 테이블 추가
├── 20260301090000_add_products_table.sql   ← 상품 테이블 추가
├── 20260401083000_add_rls_policies.sql     ← RLS 정책 추가
└── 20260406100000_add_audit_log.sql        ← 감사 로그 추가
```

**컨벤션 규칙**:
- 타임스탬프는 UTC 기준 `supabase migration new <name>` 으로 자동 생성
- 설명(description)은 소문자 + 언더스코어 (snake_case)
- 한 파일에는 하나의 논리적 변경만 포함 (원자성)
- 각 SQL 파일 상단에 목적/날짜 주석 포함

```sql
-- supabase/migrations/20260406100000_add_audit_log.sql
-- 목적: 사용자 행동 감사 로그 테이블 추가
-- 작성자: 자동 생성 (supabase migration new)
-- 관련 이슈: #42

-- 감사 로그 테이블 생성
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   TEXT,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS 활성화
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 인덱스
CREATE INDEX idx_audit_logs_user_id    ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action     ON public.audit_logs (action);

-- 관리자만 조회 가능
CREATE POLICY "관리자만 감사 로그 조회"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### 4.2 마이그레이션 명령 레퍼런스

```bash
# 새 마이그레이션 파일 생성
supabase migration new add_products_table
# → supabase/migrations/20260406120000_add_products_table.sql 생성

# 로컬 DB에 미적용 마이그레이션 적용
supabase db push --local

# 로컬 DB 완전 초기화 (모든 마이그레이션 재실행 + seed)
supabase db reset

# 원격 DB에 마이그레이션 적용 (스테이징/프로덕션)
supabase db push

# 현재 연결된 프로젝트의 마이그레이션 상태 확인
supabase migration list --linked

# 로컬 DB 스키마 변경 내용을 마이그레이션 파일로 캡처
supabase db diff --schema public -f <파일명>

# 원격 스키마를 로컬로 당겨오기
supabase db pull
```

### 4.3 Squash 전략

마이그레이션 파일이 누적되어 관리가 어려워질 때 squash로 단일화한다.  
**주의**: squash는 새 팀원 합류나 새 환경 프로비저닝 속도를 개선하지만,  
이미 적용된 이력이 있는 프로덕션 DB에서는 squash 버전을 인식시켜야 한다.

```bash
# 특정 버전까지 squash
supabase migration squash --version 20260406120000

# 또는 모든 마이그레이션을 하나로 (신규 프로젝트 권장)
supabase migration squash
```

**squash 적용 절차**:

```
1. 스테이징에서 먼저 검증
   └─ supabase migration squash (스테이징 브랜치에서)
   └─ supabase db reset (로컬)
   └─ 기존 동작 테스트

2. 프로덕션 적용 전 백업
   └─ Supabase Dashboard → Backups → Manual Backup

3. 프로덕션 마이그레이션 이력 테이블 업데이트
   -- squash된 버전을 이미 적용된 것으로 표시
   INSERT INTO supabase_migrations.schema_migrations (version)
   VALUES ('20260406120000_squashed')
   ON CONFLICT DO NOTHING;

4. 이전 마이그레이션 이력 정리 (선택적)
   -- 주의: 프로덕션에서는 신중히
   DELETE FROM supabase_migrations.schema_migrations
   WHERE version < '20260406120000_squashed';
```

### 4.4 롤백 계획

Supabase의 PostgreSQL은 트랜잭션 DDL을 지원하므로 단일 마이그레이션 내의 변경은 원자적이다.  
단, **DROP**이나 **데이터 손실** 작업은 자동 롤백이 불가능하다.

**롤백 전략 A: PITR (Point-in-Time Recovery)**

```
Supabase Dashboard → Database → Backups → Point in Time

- Pro Plan 이상에서 사용 가능
- 최대 7일~90일 이내 임의 시점으로 복원
- 복원은 새 프로젝트로 진행 후 데이터 마이그레이션
```

**롤백 전략 B: 명시적 롤백 마이그레이션**

```sql
-- 마이그레이션: 20260406_add_products.sql (Forward)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- 롤백 마이그레이션: 20260406_rollback_add_products.sql
-- 긴급 상황 시 수동 실행
DROP TABLE IF EXISTS public.products;
```

**롤백 전략 C: 단계적 배포 + 기능 플래그**

```sql
-- 새 컬럼을 NULL 허용으로 추가 (하위 호환)
ALTER TABLE public.users ADD COLUMN new_feature_flag BOOLEAN DEFAULT FALSE;

-- 기능 플래그로 신규 코드 경로 제어
-- 문제 발생 시 모든 사용자의 플래그를 FALSE로
UPDATE public.users SET new_feature_flag = FALSE;
```

---

## 5. 시크릿 관리

### 5.1 GitHub Secrets 구조

```
GitHub Repository Secrets (저장소 전역)
├── SUPABASE_ACCESS_TOKEN          ← Supabase 개인 접근 토큰
└── SLACK_WEBHOOK_URL              ← Slack 알림 웹훅

GitHub Environment Secrets (환경별 분리)
├── staging/
│   ├── SUPABASE_PROJECT_REF_STAGING
│   ├── SUPABASE_DB_PASSWORD_STAGING
│   ├── NEXT_PUBLIC_SUPABASE_URL
│   └── NEXT_PUBLIC_SUPABASE_ANON_KEY
└── production/
    ├── SUPABASE_PROJECT_REF_PROD
    ├── SUPABASE_DB_PASSWORD_PROD
    ├── NEXT_PUBLIC_SUPABASE_URL
    └── NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**GitHub Environments 보호 규칙 (production)**:
- Required reviewers: 1명 이상 승인 필요
- Deployment branches: `main` 브랜치만 허용
- Wait timer: 5분 (실수 방지)

### 5.2 Edge Functions 시크릿 (Supabase Vault)

Edge Functions 내에서 사용하는 외부 API 키는 `supabase secrets`로 관리한다.

```bash
# 시크릿 설정
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxx
supabase secrets set OPENAI_API_KEY=sk-xxxxx

# 설정된 시크릿 목록 확인 (값은 표시 안 됨)
supabase secrets list

# Edge Function에서 접근
# Deno.env.get('STRIPE_SECRET_KEY')
```

```typescript
// supabase/functions/create-payment/index.ts
import Stripe from 'npm:stripe';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

Deno.serve(async (req) => {
  // ... 결제 처리
});
```

### 5.3 Supabase Vault (DB 레벨 시크릿)

```sql
-- Vault 확장 활성화
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 시크릿 저장
SELECT vault.create_secret(
  'external-api-key',       -- 이름
  'sk_live_xxxxx',          -- 값 (암호화 저장)
  '외부 결제 서비스 API 키' -- 설명
);

-- 시크릿 조회 (복호화)
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'external-api-key';
```

### 5.4 환경변수 관리 원칙

```
규칙 1: NEXT_PUBLIC_ 접두사 변수에 민감 정보 금지
  ✗ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=...  (클라이언트 번들에 포함됨)
  ✓ SUPABASE_SERVICE_ROLE_KEY=...               (서버사이드 전용)

규칙 2: .env 파일 Git 추적 금지
  .gitignore에 반드시 포함:
    .env
    .env.local
    .env.production
    .env.staging

규칙 3: .env.example 파일로 스키마 문서화 (실제 값 없이)
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

규칙 4: 서비스 롤 키는 서버 API 라우트/Edge Functions에서만 사용
  ✗ const supabase = createClient(url, serviceRoleKey)  // 클라이언트 컴포넌트
  ✓ // API Route (app/api/admin/route.ts)
    const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```

### 5.5 키 로테이션 절차

```
# Supabase JWT 시크릿 로테이션 (anon + service_role 키 동시 변경)
# 주의: 기존 키 즉시 무효화 → 배포 다운타임 발생 가능

절차:
1. 현재 사용 중인 모든 서비스의 배포 준비 (새 키로 재배포 준비)
2. Supabase Dashboard → Settings → API → JWT Settings → Rotate
3. 새 anon key, service_role key 복사
4. GitHub Secrets 업데이트
5. 모든 환경 재배포
6. 재배포 완료 확인 (헬스 체크)

# 2025 도입된 신규 API 키 시스템 (sb_publishable_*, sb_secret_*)
# - 기존 JWT 기반과 달리 독립 로테이션 가능
# - 세분화된 권한 설정 가능
# - 다운타임 없이 교체 가능 (이중 키 기간 운영)
```

---

## 6. 모니터링 통합

### 6.1 배포 후 헬스 체크

```bash
#!/bin/bash
# scripts/health-check.sh
# 배포 후 자동 헬스 체크 스크립트

SUPABASE_URL="${1:-$NEXT_PUBLIC_SUPABASE_URL}"
ANON_KEY="${2:-$NEXT_PUBLIC_SUPABASE_ANON_KEY}"
MAX_RETRIES=5
RETRY_INTERVAL=10

check_api() {
  local url="$SUPABASE_URL/rest/v1/"
  local response=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    "$url")

  if [ "$response" = "200" ]; then
    echo "✓ REST API 정상 ($response)"
    return 0
  else
    echo "✗ REST API 비정상 ($response)"
    return 1
  fi
}

check_auth() {
  local url="$SUPABASE_URL/auth/v1/health"
  local response=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    "$url")

  if [ "$response" = "200" ]; then
    echo "✓ Auth 서비스 정상 ($response)"
    return 0
  else
    echo "✗ Auth 서비스 비정상 ($response)"
    return 1
  fi
}

# 재시도 로직
for i in $(seq 1 $MAX_RETRIES); do
  echo "헬스 체크 시도 $i/$MAX_RETRIES..."
  if check_api && check_auth; then
    echo "✅ 배포 헬스 체크 완료"
    exit 0
  fi
  sleep $RETRY_INTERVAL
done

echo "❌ 헬스 체크 실패 (${MAX_RETRIES}회 시도)"
exit 1
```

### 6.2 GitHub Actions에서 헬스 체크 연동

```yaml
# .github/workflows/deploy-production.yml에 추가
- name: 배포 후 헬스 체크
  run: |
    chmod +x scripts/health-check.sh
    ./scripts/health-check.sh \
      "${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}" \
      "${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}"
```

### 6.3 Supabase 로그 모니터링

```sql
-- Supabase Dashboard → Logs → Postgres Logs에서 쿼리 가능
-- 또는 Log Explorer API 활용

-- 최근 에러 조회 (Supabase Log Explorer SQL)
SELECT
  timestamp,
  event_message,
  metadata->>'error' as error,
  metadata->>'query'  as query
FROM postgres_logs
WHERE
  timestamp > now() - interval '1 hour'
  AND metadata->>'error_severity' IN ('ERROR', 'FATAL', 'PANIC')
ORDER BY timestamp DESC
LIMIT 50;

-- 슬로우 쿼리 탐지
SELECT
  timestamp,
  metadata->>'duration' as duration_ms,
  metadata->>'query'    as query
FROM postgres_logs
WHERE
  timestamp > now() - interval '24 hours'
  AND (metadata->>'duration')::float > 1000  -- 1초 초과
ORDER BY (metadata->>'duration')::float DESC
LIMIT 20;
```

### 6.4 알림 설정 (Slack + GitHub Actions)

```yaml
# 공통 알림 재사용 가능한 워크플로우
# .github/workflows/notify.yml

name: 알림 발송

on:
  workflow_call:
    inputs:
      status:
        required: true
        type: string
      environment:
        required: true
        type: string
      message:
        required: false
        type: string

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Slack 알림
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "${{ inputs.status == 'success' && '✅' || '❌' }} *${{ inputs.environment }} 배포 ${{ inputs.status }}*\n커밋: `${{ github.sha }}`\n작업자: ${{ github.actor }}\n${{ inputs.message }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          SLACK_WEBHOOK_TYPE: INCOMING_WEBHOOK
```

---

## 7. 전체 흐름 요약

```
개발자 로컬
─────────────────────────────────────────────────────────────────
① supabase start
② 기능 개발 + 마이그레이션 작성
③ supabase db reset (로컬 검증)
④ supabase gen types (타입 갱신)
⑤ git push → feature/xxx 브랜치

GitHub
─────────────────────────────────────────────────────────────────
⑥ PR 생성
   → Supabase Preview Branch 자동 생성
   → pr-validate.yml 실행
      - 마이그레이션 검증
      - 타입 동기화 검증
      - 린트/테스트

⑦ PR 리뷰 + 승인

⑧ PR 머지 → develop
   → deploy-staging.yml 실행
      - 마이그레이션 적용 (staging)
      - Edge Functions 배포 (staging)
      - 알림 발송

⑨ staging 검증 완료 후 develop → main PR 생성

⑩ PR 머지 → main
   → deploy-production.yml 실행
      - 사전 검증
      - 마이그레이션 적용 (production)
      - Edge Functions 배포 (production)
      - 헬스 체크
      - 알림 발송
```

---

> 출처:
> - [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
> - [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
> - [GitHub Actions — Supabase Docs](https://supabase.com/docs/guides/functions/examples/github-actions)
> - [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
> - [Supabase CLI Reference](https://supabase.com/docs/reference/cli/introduction)
> - [Supabase Local Development](https://supabase.com/docs/guides/local-development/overview)
> - [Automated Testing with GitHub Actions](https://supabase.com/docs/guides/deployment/ci/testing)
> - [GitHub Integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
