# Supabase CLI & 로컬 개발 환경

> 작성일: 2026-04-06 | Wave 1 리서치 문서

---

## 목차

1. [개요](#1-개요)
2. [설치 및 초기 설정](#2-설치-및-초기-설정)
3. [로컬 개발 스택 아키텍처](#3-로컬-개발-스택-아키텍처)
4. [핵심 CLI 명령어](#4-핵심-cli-명령어)
5. [마이그레이션 관리](#5-마이그레이션-관리)
6. [시드 데이터 관리](#6-시드-데이터-관리)
7. [타입 생성](#7-타입-생성)
8. [Edge Functions 로컬 개발](#8-edge-functions-로컬-개발)
9. [데이터베이스 Diff](#9-데이터베이스-diff)
10. [원격 DB 연결 (Link)](#10-원격-db-연결-link)
11. [Database Branching & Preview Environments](#11-database-branching--preview-environments)
12. [GitHub Actions 통합](#12-github-actions-통합)
13. [CI/CD 파이프라인 구성](#13-cicd-파이프라인-구성)
14. [제한사항 및 주의점](#14-제한사항-및-주의점)

---

## 1. 개요

### Supabase CLI란?

Supabase CLI(Command Line Interface)는 Supabase 프로젝트를 터미널에서 직접 관리할 수 있도록 해주는 공식 도구다. 로컬 개발 환경 구성부터 프로덕션 배포, 데이터베이스 마이그레이션, 타입 생성, Edge Functions 배포까지 Supabase 개발 라이프사이클 전체를 커버한다.

### CLI의 역할과 책임

```
Supabase CLI
├── 로컬 개발 환경 관리 (supabase start/stop)
├── 마이그레이션 관리 (schema versioning)
├── 타입 자동 생성 (TypeScript, Go, Swift)
├── Edge Functions 로컬 실행/테스트
├── 데이터베이스 diff & 스키마 비교
├── 원격 DB 링크 및 동기화
├── Database Branching (Preview 환경)
└── GitHub Actions/CI 통합
```

### CLI 아키텍처 특징

- **Docker 기반 로컬 스택**: 전체 Supabase 백엔드를 로컬 Docker 컨테이너로 실행
- **선언적 마이그레이션**: SQL 파일 기반의 버전 관리 가능한 스키마 관리
- **Shadow Database 패턴**: diff 시 별도 shadow DB를 생성하여 안전하게 비교
- **Management API 통합**: 원격 Supabase 프로젝트와 직접 통신
- **Config-as-Code**: `supabase/config.toml`로 프로젝트 설정을 코드로 관리

---

## 2. 설치 및 초기 설정

### 설치 방법

**macOS (Homebrew)**
```bash
brew install supabase/tap/supabase
```

**Linux/WSL (직접 다운로드)**
```bash
# 최신 버전 확인 후 다운로드
curl -fsSL https://supabase.com/install.sh | sh
```

**npm (Node.js 환경)**
```bash
npm install -g supabase
# 또는 npx로 실행
npx supabase --version
```

**Windows (Scoop)**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### 버전 확인 및 업데이트

```bash
supabase --version
# 출력 예: 1.200.3

# Homebrew로 업데이트
brew upgrade supabase

# 설치 가능한 최신 버전 확인
supabase update
```

### 로그인

```bash
# Supabase 계정으로 로그인 (브라우저 인증)
supabase login

# 환경변수로 인증 (CI 환경)
export SUPABASE_ACCESS_TOKEN=your_access_token
```

### 프로젝트 초기화

```bash
# 새 프로젝트 디렉토리에서
supabase init

# 생성되는 파일 구조:
# supabase/
# ├── config.toml          ← 프로젝트 설정
# ├── seed.sql             ← 초기 데이터 (선택)
# ├── migrations/          ← 마이그레이션 파일들
# └── functions/           ← Edge Functions (선택)
```

### config.toml 주요 설정

```toml
# supabase/config.toml

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323

[inbucket]
enabled = true
port = 54324

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://127.0.0.1:3000"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false

[storage]
enabled = true
file_size_limit = "50MiB"

[functions]
verify_jwt = true
```

---

## 3. 로컬 개발 스택 아키텍처

### Docker 컨테이너 구성

`supabase start` 명령을 실행하면 다음 서비스들이 Docker 컨테이너로 실행된다:

| 서비스 | 컨테이너명 | 기본 포트 | 역할 |
|--------|-----------|----------|------|
| **PostgreSQL** | supabase_db | 54322 | 메인 데이터베이스 |
| **GoTrue** | supabase_auth | - | 인증 서비스 |
| **PostgREST** | supabase_rest | - | REST API 자동 생성 |
| **Realtime** | supabase_realtime | - | WebSocket 실시간 구독 |
| **Storage** | supabase_storage | - | 파일 스토리지 API |
| **Kong** | supabase_kong | 54321 | API 게이트웨이 |
| **Studio** | supabase_studio | 54323 | 웹 대시보드 UI |
| **Inbucket** | supabase_inbucket | 54324 | 이메일 테스트 서버 |
| **imgproxy** | supabase_imgproxy | - | 이미지 변환 |
| **Supavisor** | supabase_pooler | - | 커넥션 풀링 |
| **Analytics** | supabase_analytics | - | 로그/분석 |
| **vector** | supabase_vector | - | 로그 수집 |

### 서비스 접근 엔드포인트

```bash
# 로컬 Supabase Studio 대시보드
http://localhost:54323

# API 엔드포인트 (Kong 게이트웨이)
http://localhost:54321

# PostgreSQL 직접 연결
postgresql://postgres:postgres@localhost:54322/postgres

# 이메일 테스트 (Inbucket)
http://localhost:54324
```

### 네트워크 아키텍처

```
클라이언트 앱
    │
    ▼
Kong (54321) ─── API 게이트웨이, 라우팅, JWT 검증
    │
    ├── /rest/v1/*  → PostgREST → PostgreSQL
    ├── /auth/v1/*  → GoTrue
    ├── /storage/v1/* → Storage API → 파일 시스템
    ├── /realtime/v1/* → Realtime (WebSocket)
    └── /functions/v1/* → Edge Runtime
```

### 로컬 개발 시작/종료

```bash
# 로컬 스택 시작
supabase start

# 실행 중인 서비스 상태 확인
supabase status

# 출력 예시:
#          API URL: http://127.0.0.1:54321
#      GraphQL URL: http://127.0.0.1:54321/graphql/v1
#   S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
#           DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#       Studio URL: http://127.0.0.1:54323
#     Inbucket URL: http://127.0.0.1:54324
#         anon key: eyJ...
#   service_role key: eyJ...

# 로컬 스택 중지
supabase stop

# 컨테이너와 데이터 완전 삭제 후 재시작
supabase stop --no-backup
```

---

## 4. 핵심 CLI 명령어

### 전체 명령어 구조

```
supabase
├── login / logout
├── init                    ← 프로젝트 초기화
├── start                   ← 로컬 환경 시작
├── stop                    ← 로컬 환경 중지
├── status                  ← 실행 상태 확인
├── db
│   ├── start / stop        ← DB 서비스만 제어
│   ├── reset               ← DB 초기화 (마이그레이션 재적용)
│   ├── pull                ← 원격 스키마 가져오기
│   ├── push                ← 로컬 마이그레이션 원격 적용
│   ├── diff                ← 스키마 차이 비교
│   ├── dump                ← DB 덤프
│   └── lint                ← SQL 린트
├── migration
│   ├── new                 ← 새 마이그레이션 파일 생성
│   ├── list                ← 마이그레이션 목록
│   ├── up                  ← 마이그레이션 적용
│   ├── repair              ← 마이그레이션 히스토리 수정
│   └── squash              ← 마이그레이션 합치기
├── gen
│   └── types               ← TypeScript 타입 생성
├── functions
│   ├── new                 ← 새 함수 생성
│   ├── serve               ← 로컬 실행
│   ├── deploy              ← 배포
│   └── delete              ← 삭제
├── secrets
│   ├── set                 ← 시크릿 설정
│   ├── list                ← 시크릿 목록
│   └── unset               ← 시크릿 삭제
├── link                    ← 원격 프로젝트 연결
├── projects                ← 프로젝트 관리
├── orgs                    ← 조직 관리
└── inspect                 ← DB 성능 진단
```

---

## 5. 마이그레이션 관리

### 마이그레이션 기본 개념

Supabase CLI는 `supabase/migrations/` 디렉토리에 타임스탬프 기반 SQL 파일로 스키마 변경 이력을 관리한다.

```
supabase/migrations/
├── 20240101000000_create_users.sql
├── 20240115000000_add_posts_table.sql
├── 20240201000000_add_indexes.sql
└── 20240301000000_add_rls_policies.sql
```

### 새 마이그레이션 생성

```bash
# 빈 마이그레이션 파일 생성
supabase migration new create_profiles_table

# 생성된 파일: supabase/migrations/20240401123456_create_profiles_table.sql
```

```sql
-- supabase/migrations/20240401123456_create_profiles_table.sql

CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  website TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 정책: 사용자는 자신의 프로필만 읽기/수정 가능
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 트리거: updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 마이그레이션 적용

```bash
# 로컬 DB에 모든 미적용 마이그레이션 적용
supabase migration up

# 로컬 DB 초기화 후 모든 마이그레이션 처음부터 재적용
supabase db reset

# 원격 프로젝트에 마이그레이션 push
supabase db push

# dry-run (실제 적용 없이 확인만)
supabase db push --dry-run
```

### 원격 스키마 가져오기

```bash
# 먼저 원격 프로젝트 연결
supabase link --project-ref your-project-ref

# 원격 DB의 현재 스키마를 마이그레이션으로 가져오기
supabase db pull

# 특정 스키마만 가져오기
supabase db pull --schema public,auth
```

### 마이그레이션 목록 확인

```bash
supabase migration list

# 출력 예시:
#         LOCAL      │     REMOTE     │     TIME (UTC)
#  ─────────────────┼────────────────┼──────────────────────────
#   20240101000000  │ 20240101000000 │ 2024-01-01 00:00:00 UTC
#   20240115000000  │ 20240115000000 │ 2024-01-15 00:00:00 UTC
#   20240201000000  │                │ applied locally only
```

### 마이그레이션 히스토리 수정 (repair)

원격과 로컬의 마이그레이션 상태가 불일치할 때 사용:

```bash
# 특정 마이그레이션을 적용된 것으로 표시
supabase migration repair --status applied 20240101000000

# 특정 마이그레이션을 되돌린 것으로 표시
supabase migration repair --status reverted 20240115000000
```

### 마이그레이션 Squash (합치기)

오래된 마이그레이션 파일들을 하나로 합칠 때:

```bash
# 지정한 버전 이전의 모든 마이그레이션을 하나로 합침
supabase migration squash --version 20240101000000
```

---

## 6. 시드 데이터 관리

### seed.sql 활용

`supabase/seed.sql` 파일에 개발/테스트용 초기 데이터를 정의한다.

```sql
-- supabase/seed.sql

-- 테스트 사용자 프로필
INSERT INTO profiles (id, username, full_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', '관리자'),
  ('00000000-0000-0000-0000-000000000002', 'testuser', '테스트 사용자');

-- 테스트 포스트
INSERT INTO posts (title, content, author_id, published) VALUES
  ('첫 번째 포스트', '내용입니다.', '00000000-0000-0000-0000-000000000001', true),
  ('두 번째 포스트', '내용입니다.', '00000000-0000-0000-0000-000000000002', false);

-- 카테고리
INSERT INTO categories (name, slug) VALUES
  ('기술', 'technology'),
  ('일상', 'daily'),
  ('리뷰', 'review');
```

### 시드 데이터 적용

```bash
# DB 리셋 시 seed.sql 자동 적용
supabase db reset

# seed.sql만 별도 적용
supabase db reset --db-url postgresql://postgres:postgres@localhost:54322/postgres
psql "postgresql://postgres:postgres@localhost:54322/postgres" < supabase/seed.sql
```

### 환경별 시드 데이터

```bash
# config.toml에서 시드 파일 경로 지정
[db.seed]
sql_paths = ["./seed.sql", "./seeds/dev-data.sql"]
```

---

## 7. 타입 생성

### TypeScript 타입 자동 생성

Supabase CLI는 데이터베이스 스키마를 분석하여 TypeScript 타입 정의를 자동으로 생성한다.

```bash
# 로컬 DB에서 타입 생성
supabase gen types typescript --local > src/types/supabase.ts

# 원격 프로젝트에서 타입 생성
supabase gen types typescript --project-id your-project-id > src/types/supabase.ts

# 특정 스키마만 포함
supabase gen types typescript --local --schema public,auth > src/types/supabase.ts
```

### 생성된 타입 구조 예시

```typescript
// src/types/supabase.ts (자동 생성)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
          website: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      posts: {
        Row: {
          id: number
          title: string
          content: string | null
          author_id: string
          published: boolean
          created_at: string
        }
        Insert: {
          title: string
          content?: string | null
          author_id: string
          published?: boolean
          created_at?: string
        }
        Update: {
          title?: string
          content?: string | null
          author_id?: string
          published?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_stats: {
        Args: { user_id: string }
        Returns: {
          post_count: number
          comment_count: number
        }[]
      }
    }
    Enums: {
      user_role: "admin" | "editor" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
```

### 타입 활용 방법

```typescript
// Supabase 클라이언트에 타입 적용
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 타입 추론 자동 적용
const { data: profiles } = await supabase
  .from('profiles')        // 자동완성
  .select('id, username, full_name')
  // data는 자동으로 올바른 타입으로 추론됨

// Helper 타입 활용
type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
```

### package.json 스크립트로 자동화

```json
{
  "scripts": {
    "types": "supabase gen types typescript --local > src/types/supabase.ts",
    "types:remote": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/supabase.ts"
  }
}
```

---

## 8. Edge Functions 로컬 개발

### 새 Edge Function 생성

```bash
supabase functions new my-function

# 생성 구조:
# supabase/functions/
# └── my-function/
#     └── index.ts
```

```typescript
// supabase/functions/my-function/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const { name } = await req.json()

  // Supabase 클라이언트 (서비스 롤 키 사용)
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('username', name)
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
```

### 로컬 실행 및 테스트

```bash
# 모든 함수 서빙
supabase functions serve

# 특정 함수만 서빙
supabase functions serve my-function

# JWT 검증 없이 (개발용)
supabase functions serve my-function --no-verify-jwt

# 환경변수 파일 지정
supabase functions serve --env-file ./supabase/.env.local

# 테스트 호출
curl -i --location --request POST \
  'http://127.0.0.1:54321/functions/v1/my-function' \
  --header 'Authorization: Bearer eyJ...' \
  --header 'Content-Type: application/json' \
  --data '{"name":"testuser"}'
```

### 시크릿 관리

```bash
# 로컬 .env 파일에 시크릿 설정
# supabase/.env.local
MY_SECRET_KEY=secret_value
EXTERNAL_API_KEY=api_key_here

# 원격 시크릿 설정
supabase secrets set MY_SECRET_KEY=secret_value

# 시크릿 목록 확인
supabase secrets list

# 시크릿 삭제
supabase secrets unset MY_SECRET_KEY
```

### Edge Functions 배포

```bash
# 특정 함수 배포
supabase functions deploy my-function

# 모든 함수 배포
supabase functions deploy

# JWT 검증 없이 배포
supabase functions deploy my-function --no-verify-jwt
```

---

## 9. 데이터베이스 Diff

### 스키마 변경 감지 (db diff)

`supabase db diff`는 현재 로컬 DB 상태와 마이그레이션 파일들을 비교하여 차이점을 SQL로 출력한다. 내부적으로 **shadow database**를 생성하여 안전하게 비교한다.

```bash
# 현재 스키마 변경사항 확인
supabase db diff

# 변경사항을 새 마이그레이션 파일로 저장
supabase db diff --file supabase/migrations/$(date +%Y%m%d%H%M%S)_my_changes.sql

# 특정 스키마만 diff
supabase db diff --schema public

# 원격과 비교 (linked 상태에서)
supabase db diff --linked
```

### Shadow Database 동작 원리

```
db diff 실행 흐름:

1. Shadow DB 생성 (임시 PostgreSQL 인스턴스)
2. Shadow DB에 기존 마이그레이션 파일 전체 적용
3. 현재 로컬 DB 상태와 Shadow DB 비교
4. migra 도구로 SQL diff 생성
5. Shadow DB 삭제
```

### Supabase Studio에서 스키마 수정 후 diff 활용

```bash
# Studio에서 직접 테이블/컬럼 수정 후
# 변경사항을 마이그레이션 파일로 캡처
supabase db diff -f new_schema_changes
# supabase/migrations/YYYYMMDDHHMMSS_new_schema_changes.sql 생성

# 생성된 파일 검토 후 커밋
git add supabase/migrations/
git commit -m "feat: 스키마 변경 마이그레이션 추가"
```

---

## 10. 원격 DB 연결 (Link)

### 프로젝트 연결

```bash
# 원격 Supabase 프로젝트 ID로 연결
supabase link --project-ref abcdefghijklmn

# DB 비밀번호 입력 프롬프트
# Enter your database password (or leave blank to skip):

# 연결 상태 확인
supabase status
```

### 연결 후 가능한 작업

```bash
# 원격 스키마를 로컬로 가져오기
supabase db pull

# 로컬 마이그레이션을 원격에 적용
supabase db push

# 원격에서 타입 생성
supabase gen types typescript --linked > src/types/supabase.ts

# 원격 DB 직접 접근 (psql)
supabase db remote commit  # 원격 변경사항 가져오기
```

---

## 11. Database Branching & Preview Environments

### Database Branching 개요

Database Branching은 각 Git 브랜치마다 독립적인 Supabase 프로젝트(Preview Branch)를 자동으로 생성하는 기능이다. Pull Request 기반 개발 워크플로우를 완전히 지원한다.

```
main 브랜치
└── Production Supabase 프로젝트

feature/new-table 브랜치
└── Preview Supabase 프로젝트 (자동 생성)
    ├── 독립된 PostgreSQL DB
    ├── 자체 API 엔드포인트
    ├── seed.sql로 테스트 데이터 주입
    └── PR 머지/닫힘 시 자동 삭제
```

### 주요 특징

- **프로덕션 데이터 격리**: Preview 브랜치에 프로덕션 데이터 복사 없음
- **자동 마이그레이션 적용**: 브랜치의 마이그레이션 파일 자동 실행
- **시드 데이터 지원**: `seed.sql`로 테스트 데이터 자동 주입
- **비활성 시 자동 일시정지**: 리소스 절약
- **PR 연동**: PR 머지/닫힘 시 자동 정리

### GitHub 통합 설정

```bash
# Supabase 대시보드 → Project Settings → Integrations
# GitHub 연결 후 저장소 선택

# 또는 supabase.com/dashboard에서
# 1. Project → Settings → Integrations → GitHub
# 2. GitHub 계정 연결
# 3. 저장소 선택
# 4. Production Branch 설정 (main/master)
```

### 브랜치 관리 명령어

```bash
# 현재 브랜치 목록
supabase branches list

# 새 브랜치 생성
supabase branches create --name staging

# 브랜치 삭제
supabase branches delete my-branch-id

# Preview 브랜치에서 타입 생성
supabase gen types typescript --branch-id preview_branch_id > src/types/supabase.ts
```

### Preview Branch 활용 패턴

```bash
# 1. 개발 브랜치 생성
git checkout -b feature/add-comments-table

# 2. 새 마이그레이션 작성
supabase migration new add_comments_table

# 3. SQL 작성 후 로컬 테스트
supabase db reset

# 4. PR 생성 → Preview Branch 자동 생성
git push origin feature/add-comments-table
# GitHub PR 열기

# 5. PR 코멘트에 Preview Branch URL 자동 게시
# - API URL: https://xxxx.supabase.co
# - anon key: eyJ...

# 6. PR 머지 → Production에 마이그레이션 자동 적용
# 7. Preview Branch 자동 삭제
```

---

## 12. GitHub Actions 통합

### 기본 마이그레이션 배포 워크플로우

```yaml
# .github/workflows/supabase-migration.yml

name: Supabase 마이그레이션 배포

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/migrations/**'

jobs:
  deploy:
    name: DB 마이그레이션 배포
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Supabase 프로젝트 연결
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: DB 마이그레이션 배포 (dry-run)
        run: supabase db push --dry-run
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

      - name: DB 마이그레이션 배포
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

### Preview Branch 자동 생성 워크플로우

```yaml
# .github/workflows/preview-branch.yml

name: Supabase Preview Branch

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  create-preview:
    name: Preview Branch 생성
    runs-on: ubuntu-latest

    outputs:
      preview_url: ${{ steps.preview.outputs.url }}
      anon_key: ${{ steps.preview.outputs.anon_key }}

    steps:
      - uses: actions/checkout@v4

      - name: Preview Branch 생성/업데이트
        id: preview
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Supabase Preview 배포
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
          BRANCH_URL=$(supabase branches create \
            --name "pr-${{ github.event.pull_request.number }}" \
            --output json | jq -r '.api_url')
          echo "url=$BRANCH_URL" >> $GITHUB_OUTPUT
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: PR에 Preview URL 코멘트
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Supabase Preview Branch\n\nAPI URL: ${{ steps.preview.outputs.url }}`
            })
```

### Edge Functions 배포 워크플로우

```yaml
# .github/workflows/deploy-functions.yml

name: Edge Functions 배포

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Supabase CLI 설치
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Edge Functions 배포
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
          supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: 시크릿 동기화
        run: |
          supabase secrets set \
            EXTERNAL_API_KEY=${{ secrets.EXTERNAL_API_KEY }} \
            STRIPE_SECRET=${{ secrets.STRIPE_SECRET }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### GitHub Secrets 설정

```
SUPABASE_ACCESS_TOKEN    ← supabase.com/account/tokens
SUPABASE_PROJECT_ID      ← 프로젝트 Reference ID
SUPABASE_DB_PASSWORD     ← 데이터베이스 비밀번호
```

---

## 13. CI/CD 파이프라인 구성

### 권장 브랜치 전략

```
main (프로덕션)
├── staging (스테이징)
└── feature/* (개발 브랜치)

각 환경별 Supabase 프로젝트:
- Production: main 브랜치 → 프로덕션 Supabase 프로젝트
- Staging: staging 브랜치 → 스테이징 Supabase 프로젝트
- Preview: PR 브랜치 → Preview Branch (자동 생성/삭제)
```

### 전체 CI/CD 파이프라인 예시

```yaml
# .github/workflows/full-pipeline.yml

name: 전체 CI/CD 파이프라인

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

env:
  SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

jobs:
  lint-and-test:
    name: 코드 검사 및 테스트
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  db-validation:
    name: DB 마이그레이션 검증
    runs-on: ubuntu-latest
    needs: lint-and-test
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: 로컬 Supabase 시작
        run: supabase start
      - name: 마이그레이션 검증
        run: supabase db reset
      - name: 타입 일관성 검사
        run: |
          supabase gen types typescript --local > /tmp/generated-types.ts
          diff src/types/supabase.ts /tmp/generated-types.ts || \
            (echo "타입 파일이 최신 상태가 아닙니다. 'npm run types'를 실행하세요." && exit 1)
      - name: Supabase 종료
        run: supabase stop

  deploy-preview:
    name: Preview 환경 배포
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    needs: db-validation
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Preview 브랜치 마이그레이션 배포
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
          supabase db push
        env:
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

  deploy-production:
    name: 프로덕션 배포
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    needs: db-validation
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: 프로덕션 마이그레이션 배포
        run: |
          supabase link --project-ref ${{ secrets.PROD_SUPABASE_PROJECT_ID }}
          supabase db push --dry-run
          supabase db push
          supabase functions deploy
        env:
          SUPABASE_DB_PASSWORD: ${{ secrets.PROD_SUPABASE_DB_PASSWORD }}
```

---

## 14. 제한사항 및 주의점

### Docker 의존성

```
필수 요구사항:
- Docker Desktop (macOS/Windows) 또는 Docker Engine (Linux)
- Docker Compose v2 이상
- 최소 4GB RAM (권장 8GB 이상)
- 10GB 이상의 디스크 여유 공간
```

**WSL2 환경 (Windows)**:
```bash
# WSL2에서 Docker Desktop 통합 필요
# Docker Desktop → Settings → Resources → WSL Integration
# 해당 WSL2 배포판 활성화 필수
```

### 포트 충돌 주의

```toml
# config.toml에서 포트 변경 가능
[api]
port = 54321   # 충돌 시 변경

[db]
port = 54322   # 충돌 시 변경

[studio]
port = 54323   # 충돌 시 변경
```

### 버전 호환성

- CLI 버전과 Supabase 클라우드 버전이 다를 경우 동작 불일치 발생 가능
- `supabase update`로 항상 최신 버전 유지 권장
- `config.toml`의 `major_version`이 실제 클라우드 DB 버전과 일치해야 함

### 마이그레이션 관리 주의점

```bash
# 위험: 직접 DB 수정 후 마이그레이션 없이 커밋
# → 다른 개발자 환경에서 스키마 불일치 발생

# 올바른 순서:
# 1. supabase migration new 로 파일 생성
# 2. SQL 작성
# 3. supabase db reset 으로 로컬 검증
# 4. 커밋 및 PR
# 5. 리뷰 후 머지
# 6. 자동 배포 (CI/CD)
```

### 로컬 환경 데이터 영속성

```bash
# supabase stop 은 컨테이너만 중지 (데이터 유지)
supabase stop

# supabase stop --no-backup 은 모든 로컬 데이터 삭제
supabase stop --no-backup  # 주의: 로컬 DB 데이터 전부 삭제됨

# supabase db reset 도 로컬 데이터 초기화
supabase db reset  # 마이그레이션 + seed.sql 재적용
```

### 리소스 최적화

```bash
# 사용하지 않는 서비스 비활성화 (config.toml)
[studio]
enabled = false   # Studio 불필요 시

[inbucket]
enabled = false   # 이메일 테스트 불필요 시

[analytics]
enabled = false   # 로그 분석 불필요 시
```

### 프로덕션 DB에 직접 push 주의

```bash
# 프로덕션에 db push 전 반드시 dry-run 먼저 실행
supabase db push --dry-run

# 실제 배포 전 백업 확인
# 되돌리기 어려운 마이그레이션 (DROP TABLE 등) 특히 주의
```

---

## 참고 자료

- [Supabase CLI 공식 문서](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [CLI Reference](https://supabase.com/docs/reference/cli/introduction)
- [Database Migrations 가이드](https://supabase.com/docs/guides/deployment/database-migrations)
- [Database Branching 공식 문서](https://supabase.com/docs/guides/deployment/branching)
- [GitHub Actions 통합](https://supabase.com/docs/guides/deployment)
- [Supabase CLI GitHub](https://github.com/supabase/cli)
