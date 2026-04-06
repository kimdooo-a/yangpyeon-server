# 09. Supabase 마이그레이션 전략

> 작성일: 2026-04-06  
> 대상 독자: Supabase 도입 또는 이전을 검토하는 풀스택 개발자  
> 참고: [Supabase 공식 마이그레이션 가이드](https://supabase.com/docs/guides/platform/migrating-to-supabase)

---

## 목차

1. [Firebase → Supabase 마이그레이션](#1-firebase--supabase-마이그레이션)
2. [기존 PostgreSQL → Supabase 마이그레이션](#2-기존-postgresql--supabase-마이그레이션)
3. [Supabase → 다른 플랫폼 탈출 전략](#3-supabase--다른-플랫폼-탈출-전략)
4. [무중단 마이그레이션 패턴](#4-무중단-마이그레이션-패턴)
5. [도구 및 자동화 스크립트](#5-도구-및-자동화-스크립트)

---

## 1. Firebase → Supabase 마이그레이션

Firebase는 Google이 제공하는 BaaS(Backend as a Service)로, NoSQL 기반의 Firestore와 Firebase Auth, Cloud Storage 등을 묶어서 제공한다. Supabase는 PostgreSQL 기반의 오픈소스 대안으로, SQL과 관계형 모델, RLS(Row Level Security)를 핵심으로 한다.

Firebase에서 Supabase로 전환하는 것은 단순한 플랫폼 교체가 아니라 **패러다임 전환**이다. NoSQL 문서 모델에서 관계형 모델로, 클라이언트 SDK 중심에서 PostgREST API 중심으로 사고방식 자체가 달라진다.

---

### 1-1. Firestore → PostgreSQL 데이터 변환

#### 패러다임 차이 이해

| 개념 | Firestore | PostgreSQL |
|------|-----------|------------|
| 저장 단위 | 문서(Document) | 행(Row) |
| 그룹 단위 | 컬렉션(Collection) | 테이블(Table) |
| 중첩 데이터 | 서브컬렉션, 중첩 필드 | 외래 키 관계 또는 JSONB |
| 쿼리 방식 | 필드 기반 필터링 | SQL WHERE절 |
| 트랜잭션 | 제한적 (단일 문서 원자성) | ACID 완전 지원 |
| 조인 | 불가 (클라이언트에서 병합) | JOIN으로 서버 처리 |

#### 변환 접근 방식

Firestore의 단순 컬렉션은 1:1로 테이블로 변환할 수 있다. 그러나 서브컬렉션이나 중첩 객체가 많으면 정규화(Normalization) 설계가 필요하다.

**예시: Firestore 문서 구조**

```json
// /users/{uid} 컬렉션
{
  "name": "김철수",
  "email": "kim@example.com",
  "address": {
    "city": "서울",
    "zip": "04523"
  },
  "orders": [
    { "product": "노트북", "price": 1200000 },
    { "product": "마우스", "price": 35000 }
  ]
}
```

**PostgreSQL 정규화 후 스키마**

```sql
-- 사용자 테이블
CREATE TABLE users (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE,  -- 원본 Firebase UID 보존 (마이그레이션 후 제거 가능)
  name      TEXT NOT NULL,
  email     TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 주소 테이블 (1:1 관계)
CREATE TABLE user_addresses (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  city    TEXT,
  zip     TEXT
);

-- 주문 테이블 (1:N 관계)
CREATE TABLE orders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  product    TEXT NOT NULL,
  price      INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

> **JSONB 활용 팁**: 스키마가 매우 유동적이거나 완전한 정규화가 어렵다면, 일부 필드를 `JSONB` 컬럼으로 보존한 뒤 점진적으로 정규화할 수 있다.

```sql
-- 임시 전략: 원본 데이터를 JSONB로 보존
CREATE TABLE users_raw (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT UNIQUE,
  data        JSONB,   -- Firestore 원본 문서 전체
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- 이후 정규화 시 JSONB에서 추출
INSERT INTO users (firebase_uid, name, email)
SELECT
  firebase_uid,
  data->>'name',
  data->>'email'
FROM users_raw;
```

#### Firestore 데이터 내보내기 및 변환 스크립트

공식 커뮤니티 도구 [supabase-community/firebase-to-supabase](https://github.com/supabase-community/firebase-to-supabase)를 활용한다.

```bash
# 1. 도구 설치
git clone https://github.com/supabase-community/firebase-to-supabase.git
cd firebase-to-supabase/firestore

npm install

# 2. Firebase Service Account 키 파일 준비
# Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
# serviceAccountKey.json으로 저장

# 3. Firestore 컬렉션 JSON으로 내보내기
node exportFirestore.js --credential=./serviceAccountKey.json --collection=users

# 결과: users.json 파일 생성
```

내보낸 JSON을 PostgreSQL INSERT 구문으로 변환:

```javascript
// transform.js
const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('users.json', 'utf-8'));

const inserts = raw.map(doc => {
  const name = doc.name?.replace(/'/g, "''") ?? '';
  const email = doc.email?.replace(/'/g, "''") ?? '';
  return `INSERT INTO users (firebase_uid, name, email) VALUES ('${doc.id}', '${name}', '${email}') ON CONFLICT (firebase_uid) DO NOTHING;`;
});

fs.writeFileSync('users_insert.sql', inserts.join('\n'));
console.log(`Generated ${inserts.length} INSERT statements`);
```

```bash
# Supabase DB에 적용
psql "$DATABASE_URL" -f users_insert.sql
```

---

### 1-2. Firebase Auth → Supabase Auth 사용자 마이그레이션

Firebase Auth와 Supabase Auth 모두 JWT 기반이지만, 사용자 테이블 구조와 인증 플로우가 다르다.

#### 사전 준비

```bash
# Firebase Admin SDK 설치
npm install firebase-admin

# Supabase Admin 패키지 설치
npm install @supabase/supabase-js
```

#### 사용자 내보내기 스크립트

```javascript
// export-firebase-users.js
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function exportUsers() {
  const users = [];
  let nextPageToken;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  fs.writeFileSync(
    'firebase_users.json',
    JSON.stringify(users.map(u => ({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName,
      photoURL: u.photoURL,
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
    })), null, 2)
  );

  console.log(`Exported ${users.length} users`);
}

exportUsers().catch(console.error);
```

#### Supabase로 사용자 임포트

```javascript
// import-to-supabase.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Service Role Key 사용 (절대 클라이언트 노출 금지)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function importUsers() {
  const users = JSON.parse(fs.readFileSync('firebase_users.json', 'utf-8'));
  
  let success = 0;
  let failed = 0;
  
  for (const user of users) {
    try {
      // 방법 1: 임시 비밀번호로 계정 생성 (사용자가 비밀번호 재설정 필요)
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        email_confirm: user.emailVerified,
        user_metadata: {
          display_name: user.displayName,
          avatar_url: user.photoURL,
          firebase_uid: user.uid,  // 기존 UID 보존
        },
        // password는 생략 → 사용자가 "비밀번호 재설정" 이메일 수신
      });
      
      if (error) throw error;
      success++;
    } catch (err) {
      console.error(`Failed: ${user.email}`, err.message);
      failed++;
    }
    
    // Firebase 무료 플랜 rate limit: 초당 1000건
    // 대량 임포트 시 딜레이 추가
    await new Promise(r => setTimeout(r, 10));
  }
  
  console.log(`임포트 완료: 성공 ${success}, 실패 ${failed}`);
}

importUsers();
```

#### 주의사항: 비밀번호 해시 불호환

Firebase Auth와 Supabase Auth는 **비밀번호 해시 알고리즘이 다르다**. Firebase는 bcrypt 변형을 사용하지만 Supabase는 표준 bcrypt를 사용하므로, 기존 비밀번호 해시를 그대로 이전할 수 없다.

**권장 전략**:
1. 사용자 계정만 먼저 이전 (비밀번호 없이)
2. "비밀번호 재설정" 이메일을 일괄 발송
3. 또는 소셜 로그인(Google, GitHub 등)을 병행 제공하여 마찰 최소화

---

### 1-3. Cloud Storage → Supabase Storage 파일 마이그레이션

```javascript
// migrate-storage.js
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const bucket = admin.storage().bucket('your-firebase-project.appspot.com');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrateFiles() {
  const [files] = await bucket.getFiles({ prefix: 'avatars/' });

  for (const file of files) {
    const tempPath = path.join(os.tmpdir(), path.basename(file.name));
    
    try {
      // Firebase Storage에서 다운로드
      await file.download({ destination: tempPath });
      
      // Supabase Storage에 업로드
      const { error } = await supabase.storage
        .from('avatars')          // Supabase 버킷명
        .upload(file.name, fs.readFileSync(tempPath), {
          contentType: file.metadata.contentType,
          upsert: true,
        });
      
      if (error) throw error;
      console.log(`마이그레이션 완료: ${file.name}`);
    } catch (err) {
      console.error(`실패: ${file.name}`, err.message);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}

migrateFiles();
```

**Supabase 버킷 생성 (마이그레이션 전)**:

```sql
-- Supabase Dashboard SQL Editor 또는 마이그레이션 파일로 실행
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false);
```

---

### 1-4. Security Rules → RLS 정책 변환

Firebase Security Rules는 JavaScript 유사 DSL로 작성되고, Supabase는 PostgreSQL의 RLS(Row Level Security)를 사용한다.

**Firebase Security Rules 예시**:

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 자신의 문서 읽기/쓰기
    match /users/{userId} {
      allow read, write: if request.auth != null 
                        && request.auth.uid == userId;
    }
    
    // 모든 인증 사용자가 게시물 읽기, 작성자만 수정/삭제
    match /posts/{postId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null 
                           && request.auth.uid == resource.data.authorId;
    }
  }
}
```

**Supabase RLS 정책으로 변환**:

```sql
-- users 테이블 RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 자신의 행만 읽기/수정 허용
CREATE POLICY "users_self_read"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_self_update"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- posts 테이블 RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 읽기
CREATE POLICY "posts_authenticated_read"
  ON posts FOR SELECT
  TO authenticated
  USING (true);

-- 인증 사용자 생성 (자신의 author_id만)
CREATE POLICY "posts_create"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- 작성자만 수정/삭제
CREATE POLICY "posts_owner_update"
  ON posts FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "posts_owner_delete"
  ON posts FOR DELETE
  USING (auth.uid() = author_id);
```

> **핵심 차이**: Firebase Rules는 요청 시점에 평가되고, RLS는 쿼리 실행 시 DB 레벨에서 필터링된다. RLS는 SQL 레벨에서 동작하므로 어떤 방법으로 DB에 접근해도 우회할 수 없다.

---

### 1-5. 점진적 마이그레이션 전략 (듀얼 라이팅)

완전히 한 번에 전환하는 것은 위험하다. **듀얼 라이팅(Dual Writing)** 전략으로 안전하게 전환한다.

```
[Phase 1] Firebase만 사용 (현재 상태)
  클라이언트 → Firebase SDK → Firestore + Auth + Storage

[Phase 2] 듀얼 라이팅 (쓰기는 두 곳, 읽기는 Firebase)
  클라이언트 → Firebase SDK → Firestore (primary)
             ↘ Supabase SDK → PostgreSQL (shadow write)

[Phase 3] 검증 후 읽기 전환 (읽기는 Supabase, 쓰기는 두 곳)
  클라이언트 → Supabase SDK → PostgreSQL (읽기)
             ↘ Firebase SDK → Firestore (쓰기 동기화 유지)

[Phase 4] Supabase 완전 전환
  클라이언트 → Supabase SDK → PostgreSQL + Auth + Storage
  (Firebase 종료)
```

**듀얼 라이팅 구현 예시 (TypeScript)**:

```typescript
// lib/dual-write.ts
import { db as firestore } from './firebase';
import { supabase } from './supabase';
import { doc, setDoc } from 'firebase/firestore';

export async function createPost(post: {
  title: string;
  content: string;
  authorId: string;
}) {
  const timestamp = new Date().toISOString();
  
  // 1. Firebase에 쓰기 (primary)
  const firebaseRef = doc(firestore, 'posts', crypto.randomUUID());
  await setDoc(firebaseRef, {
    ...post,
    createdAt: timestamp,
  });
  
  // 2. Supabase에 쓰기 (shadow) — 실패해도 Firebase 성공이면 OK
  try {
    await supabase.from('posts').insert({
      firebase_id: firebaseRef.id,
      title: post.title,
      content: post.content,
      author_id: post.authorId,
      created_at: timestamp,
    });
  } catch (err) {
    // 에러 로깅만, 사용자에게 노출 안 함
    console.error('[shadow-write] Supabase write failed:', err);
    // 추후 동기화 큐에 넣어서 재시도
  }
  
  return firebaseRef.id;
}
```

---

## 2. 기존 PostgreSQL → Supabase 마이그레이션

자체 호스팅 PostgreSQL 또는 다른 클라우드 PostgreSQL(RDS, Neon, PlanetScale 등)에서 Supabase로 이전하는 경우, Firestore보다 훨씬 단순하다.

---

### 2-1. pg_dump / pg_restore 활용

**기본 덤프**:

```bash
# 전체 덤프 (스키마 + 데이터)
pg_dump \
  --no-owner \
  --no-privileges \
  --format=plain \
  --file=backup.sql \
  "postgresql://user:password@old-host:5432/mydb"

# 스키마만 덤프
pg_dump \
  --no-owner \
  --no-privileges \
  --schema-only \
  --file=schema.sql \
  "postgresql://user:password@old-host:5432/mydb"

# 데이터만 덤프 (COPY 형식, 빠름)
pg_dump \
  --no-owner \
  --no-privileges \
  --data-only \
  --format=custom \
  --file=data.dump \
  "postgresql://user:password@old-host:5432/mydb"
```

> `--no-owner`, `--no-privileges` 플래그는 필수다. Supabase는 자체적인 역할(supabase_admin 등)을 관리하므로, 원본의 권한 설정을 그대로 가져오면 복원 시 오류가 발생한다.

**Supabase로 복원**:

```bash
# Supabase 프로젝트 연결 문자열 확인
# Dashboard → Settings → Database → Connection String → URI

# 스키마 복원
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f schema.sql

# 데이터 복원 (custom 포맷)
pg_restore \
  --no-owner \
  --no-privileges \
  --dbname="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  data.dump
```

**성능 팁**: 대용량 데이터셋은 마이그레이션 서버를 **소스 또는 대상 DB와 같은 리전**에 배포하면 네트워크 지연을 크게 줄일 수 있다.

---

### 2-2. Supabase CLI로 마이그레이션

Supabase CLI는 `pg_dump`를 내부적으로 사용하되, Supabase 관리 스키마(auth, storage, 익스텐션 등)를 자동 제외한다.

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 링크
supabase link --project-ref [PROJECT-REF]

# 스키마 덤프 (데이터 제외)
supabase db dump --file schema.sql

# 데이터 덤프
supabase db dump --file data.sql --data-only

# 역할 덤프
supabase db dump --file roles.sql --role-only

# 원격 DB에서 덤프 (--db-url 사용)
supabase db dump \
  --db-url "postgresql://postgres:password@db.[OLD-PROJECT].supabase.co:5432/postgres" \
  --file old_schema.sql
```

---

### 2-3. 스키마 호환성 확인

Supabase는 PostgreSQL 15+를 기반으로 하므로, 대부분의 표준 PostgreSQL 문법은 그대로 호환된다. 그러나 아래 항목은 사전 확인이 필요하다.

```sql
-- 1. 사용 중인 PostgreSQL 버전 확인
SELECT version();

-- 2. 사용 중인 익스텐션 목록 확인
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;

-- 3. 비표준 타입 확인 (enum 등)
SELECT n.nspname, t.typname, t.typtype
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typtype = 'e'  -- enum 타입
AND n.nspname NOT IN ('pg_catalog', 'information_schema');
```

**Supabase에서 지원하는 주요 익스텐션**:
- `pgvector` — AI/ML 벡터 검색
- `pg_cron` — 내부 스케줄러
- `uuid-ossp` — UUID 생성
- `postgis` — 지리 데이터
- `pg_stat_statements` — 쿼리 통계
- `plv8` — JavaScript 프로시저

익스텐션 활성화:
```sql
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

### 2-4. RLS 추가 설정

기존 PostgreSQL 앱은 RLS 없이 애플리케이션 레이어에서 접근 제어를 했을 가능성이 높다. Supabase PostgREST를 통해 클라이언트에서 직접 DB에 접근할 경우 반드시 RLS를 활성화해야 한다.

```sql
-- 모든 테이블에 RLS 활성화 (배치)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
    -- 기본적으로 모든 접근 차단 → 명시적 정책 필요
    RAISE NOTICE 'RLS enabled: %', r.tablename;
  END LOOP;
END;
$$;
```

> **중요**: RLS 활성화 후 정책이 없으면 `anon`과 `authenticated` 역할은 아무것도 읽을 수 없다. 서버 사이드(Service Role)에서만 접근할 테이블이라면 정책 없이도 괜찮지만, 클라이언트 접근이 필요한 테이블은 반드시 SELECT 정책을 추가해야 한다.

---

### 2-5. API 전환 (기존 ORM → PostgREST)

기존 앱이 Prisma, TypeORM, Drizzle 등 ORM을 사용하고 있다면 두 가지 선택지가 있다.

**선택지 A: ORM 계속 사용 (연결만 변경)**

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Supabase Connection Pooler URL로 변경
}
```

```env
# .env
# Supabase Dashboard → Settings → Database → Connection Pooling → URI
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**선택지 B: Supabase JS SDK 사용 (PostgREST)**

```typescript
// 기존 ORM 방식
const posts = await prisma.post.findMany({
  where: { authorId: userId },
  orderBy: { createdAt: 'desc' },
  take: 10,
});

// Supabase SDK 방식 (동일 결과)
const { data: posts } = await supabase
  .from('posts')
  .select('*')
  .eq('author_id', userId)
  .order('created_at', { ascending: false })
  .limit(10);
```

---

## 3. Supabase → 다른 플랫폼 탈출 전략

**벤더 종속(Vendor Lock-in)**은 모든 클라우드 서비스 선택 시 고려해야 할 리스크다. Supabase는 오픈소스이므로 자체 호스팅이 가능하고, 표준 PostgreSQL을 사용하므로 탈출 비용이 상대적으로 낮다.

---

### 3-1. 데이터 내보내기

```bash
# 전체 덤프
pg_dump \
  --no-owner \
  --no-privileges \
  "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  > full_backup.sql

# Supabase CLI 사용 (권장 — 내부 스키마 자동 제외)
supabase db dump \
  --project-ref [PROJECT-REF] \
  --file schema.sql

supabase db dump \
  --project-ref [PROJECT-REF] \
  --data-only \
  --file data.sql
```

**Storage 파일 내보내기**:

```javascript
// Supabase Storage는 S3 호환 API를 제공한다
// aws-cli 또는 rclone으로 버킷 전체 다운로드 가능

// aws-cli 사용 예시
// AWS_ACCESS_KEY_ID = Supabase Dashboard → Storage → S3 Access Keys
// AWS_SECRET_ACCESS_KEY = 위와 동일
// REGION = ap-northeast-2 (프로젝트 리전)

// $ aws s3 sync \
//   s3://[PROJECT-REF] ./local-backup \
//   --endpoint-url https://[PROJECT-REF].supabase.co/storage/v1/s3 \
//   --region ap-northeast-2
```

---

### 3-2. 벤더 종속 최소화 전략

**Supabase 종속 요소**:

| 기능 | Supabase 방식 | 이식 가능한 대안 |
|------|--------------|----------------|
| 인증 | Supabase Auth JWT | 표준 JWT + auth 스키마 직접 관리 |
| 실시간 | Supabase Realtime | pg_listen/notify + WebSocket |
| API | PostgREST | Hasura, PostgREST 자체 호스팅 |
| Storage | Supabase Storage | MinIO, S3 직접 사용 |
| Edge Functions | Deno Deploy | Cloudflare Workers, Vercel Functions |

**이식성 높은 코드 패턴**:

```typescript
// 나쁜 예 — Supabase 깊이 종속
import { supabase } from './supabase';

export async function getUser(id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

// 좋은 예 — 추상화 레이어로 격리
// lib/db/users.ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;
}

// lib/db/supabase/users.ts
export class SupabaseUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    return data;
  }
}

// 나중에 Supabase → Prisma 전환 시 구현체만 교체
// lib/db/prisma/users.ts
export class PrismaUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }
}
```

---

### 3-3. 사전 설계: 이식성 높은 코드 작성법

1. **Repository 패턴**: DB 접근 코드를 인터페이스 뒤에 숨긴다
2. **환경변수 중심**: Supabase URL/Key를 코드에 하드코딩하지 않는다
3. **표준 SQL 우선**: PostgREST 전용 기능보다 표준 SQL 쿼리를 선호한다
4. **마이그레이션 파일 관리**: `supabase/migrations/` 디렉토리로 스키마 변경 이력 관리
5. **Storage URL 추상화**: 파일 URL을 직접 저장하지 않고 경로(path)만 저장하여 CDN 변경 시 유연성 확보

---

## 4. 무중단 마이그레이션 패턴

---

### 4-1. 블루-그린 배포

블루-그린 배포는 **두 개의 동일한 프로덕션 환경**을 유지하고, 트래픽을 순간 전환하는 방식이다.

```
[현재 상태]
  사용자 트래픽 → 로드 밸런서 → [블루 환경] → Firebase
  
[전환 준비]
  사용자 트래픽 → 로드 밸런서 → [블루 환경] → Firebase (active)
                                [그린 환경] → Supabase  (준비 중)

[전환]
  사용자 트래픽 → 로드 밸런서 → [그린 환경] → Supabase (active)
                                [블루 환경] → Firebase  (롤백 대기)
```

**Cloudflare Workers를 이용한 트래픽 전환**:

```javascript
// cloudflare-worker.js
export default {
  async fetch(request, env) {
    const MIGRATION_ENABLED = env.USE_SUPABASE === 'true';
    
    if (MIGRATION_ENABLED) {
      // 그린 환경으로 라우팅
      return fetch(request.url.replace('app-blue.com', 'app-green.com'), request);
    }
    
    // 블루 환경 (기본)
    return fetch(request);
  }
};
```

**체크리스트**:
- [ ] 그린 환경에서 모든 기능 테스트 완료
- [ ] 데이터 동기화 검증 (블루-그린 간 데이터 일치 확인)
- [ ] 롤백 절차 문서화 및 테스트
- [ ] 전환 시 모니터링 알림 설정
- [ ] DNS TTL 낮추기 (전환 전 5분으로 줄이기)

---

### 4-2. Feature Flag 기반 점진 전환

Feature Flag를 사용하면 **사용자 세그먼트별**로 점진적으로 전환할 수 있다.

```typescript
// lib/feature-flags.ts
export type FeatureFlag = 'USE_SUPABASE_AUTH' | 'USE_SUPABASE_DB' | 'USE_SUPABASE_STORAGE';

export function isFeatureEnabled(flag: FeatureFlag, userId?: string): boolean {
  // 환경변수 기반 전역 제어
  if (process.env[`FEATURE_${flag}`] === 'true') return true;
  if (process.env[`FEATURE_${flag}`] === 'false') return false;
  
  // 사용자 기반 점진 롤아웃 (userId의 해시로 비율 제어)
  if (userId) {
    const rolloutPercentage = parseInt(process.env[`FEATURE_${flag}_ROLLOUT`] ?? '0');
    const hash = simpleHash(userId + flag);
    return (hash % 100) < rolloutPercentage;
  }
  
  return false;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

**점진 롤아웃 예시**:

```typescript
// app/api/posts/route.ts
export async function GET(req: Request) {
  const userId = getUserId(req);
  
  if (isFeatureEnabled('USE_SUPABASE_DB', userId)) {
    // Supabase에서 읽기
    const { data } = await supabase.from('posts').select('*');
    return Response.json(data);
  }
  
  // 기존 Firebase에서 읽기
  const posts = await getPostsFromFirestore();
  return Response.json(posts);
}
```

`.env` 설정 예시:

```env
# 0% → 10% → 50% → 100% 단계적 롤아웃
FEATURE_USE_SUPABASE_DB_ROLLOUT=10
FEATURE_USE_SUPABASE_AUTH_ROLLOUT=0
FEATURE_USE_SUPABASE_STORAGE_ROLLOUT=0
```

---

### 4-3. 데이터 동기화 전략

듀얼 라이팅 기간에는 두 시스템의 데이터를 항상 동기화해야 한다.

**동기화 검증 스크립트**:

```javascript
// scripts/verify-sync.js
// Firestore와 Supabase의 레코드 수 및 최신 데이터 비교

async function verifySync() {
  // Firestore 카운트
  const firestoreCount = await getFirestoreCount('posts');
  
  // Supabase 카운트
  const { count: supabaseCount } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Firestore: ${firestoreCount}, Supabase: ${supabaseCount}`);
  
  if (firestoreCount !== supabaseCount) {
    console.error(`동기화 불일치: ${firestoreCount - supabaseCount}건 차이`);
    // 알림 발송 (Slack, Discord 등)
  }
}
```

**동기화 큐를 이용한 재시도 패턴**:

```typescript
// lib/sync-queue.ts
// Redis 또는 Supabase 테이블을 큐로 사용

export async function enqueueSyncTask(task: {
  operation: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data?: Record<string, unknown>;
}) {
  await supabase.from('sync_queue').insert({
    ...task,
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString(),
  });
}

// 백그라운드 워커 (pg_cron 또는 외부 cron job)
export async function processSyncQueue() {
  const { data: tasks } = await supabase
    .from('sync_queue')
    .select('*')
    .eq('status', 'pending')
    .lt('retry_count', 3)
    .order('created_at')
    .limit(50);
  
  for (const task of tasks ?? []) {
    try {
      await syncToSupabase(task);
      await supabase.from('sync_queue').update({ status: 'completed' }).eq('id', task.id);
    } catch (err) {
      await supabase.from('sync_queue').update({
        status: task.retry_count >= 2 ? 'failed' : 'pending',
        retry_count: task.retry_count + 1,
        error: String(err),
      }).eq('id', task.id);
    }
  }
}
```

---

## 5. 도구 및 자동화 스크립트

---

### 5-1. Supabase CLI 핵심 명령어

```bash
# 설치
npm install -g supabase
# 또는
brew install supabase/tap/supabase

# 버전 확인
supabase --version

# 로그인
supabase login

# 프로젝트 초기화
supabase init

# 프로젝트 링크 (원격)
supabase link --project-ref [PROJECT-REF]

# DB 덤프 (스키마)
supabase db dump -f schema.sql

# DB 덤프 (데이터)
supabase db dump -f data.sql --data-only

# 마이그레이션 파일 생성
supabase migration new create_posts_table

# 마이그레이션 실행
supabase db push

# 로컬 개발 환경 시작
supabase start

# 원격 DB 풀 (원격 스키마를 로컬 마이그레이션으로 변환)
supabase db pull
```

---

### 5-2. pgloader를 이용한 다른 DB에서 마이그레이션

pgloader는 MySQL, SQLite, CSV 등에서 PostgreSQL로 마이그레이션할 때 유용하다.

```bash
# macOS
brew install pgloader

# Ubuntu/Debian
apt-get install pgloader
```

**MySQL → Supabase**:

```
-- mysql-to-supabase.load
LOAD DATABASE
  FROM      mysql://myuser:mypassword@localhost/mydb
  INTO      postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

WITH include drop, create tables, create indexes,
     reset sequences, foreign keys

SET maintenance_work_mem to '512MB',
    work_mem to '64MB'

EXCLUDING TABLE NAMES MATCHING ~<migration.*>

BEFORE LOAD DO
$$ DROP SCHEMA IF EXISTS public CASCADE; $$,
$$ CREATE SCHEMA public; $$;
```

```bash
pgloader mysql-to-supabase.load
```

**SQLite → Supabase**:

```
LOAD DATABASE
  FROM      sqlite:///path/to/app.db
  INTO      postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

WITH include drop, create tables;
```

---

### 5-3. 완전 자동화 마이그레이션 스크립트 (Firebase → Supabase)

```bash
#!/bin/bash
# migrate-firebase-to-supabase.sh
# 사용법: ./migrate-firebase-to-supabase.sh

set -e  # 에러 시 즉시 중단

echo "=== Firebase → Supabase 마이그레이션 시작 ==="

# 환경변수 확인
: "${FIREBASE_CREDENTIAL:?환경변수 FIREBASE_CREDENTIAL 필요}"
: "${SUPABASE_URL:?환경변수 SUPABASE_URL 필요}"
: "${SUPABASE_SERVICE_ROLE_KEY:?환경변수 SUPABASE_SERVICE_ROLE_KEY 필요}"

STEP=1

echo "[$STEP] Firestore 데이터 내보내기..."
node scripts/export-firestore.js
((STEP++))

echo "[$STEP] Firebase Auth 사용자 내보내기..."
node scripts/export-firebase-users.js
((STEP++))

echo "[$STEP] 스키마 생성 (Supabase)..."
psql "$DATABASE_URL" -f supabase/migrations/*.sql
((STEP++))

echo "[$STEP] 데이터 임포트 (Supabase)..."
node scripts/import-to-supabase.js
((STEP++))

echo "[$STEP] Firebase Auth 사용자 임포트..."
node scripts/import-users-to-supabase.js
((STEP++))

echo "[$STEP] 데이터 검증..."
node scripts/verify-migration.js
((STEP++))

echo "[$STEP] Storage 마이그레이션..."
node scripts/migrate-storage.js

echo "=== 마이그레이션 완료 ==="
```

---

### 5-4. 마이그레이션 검증 체크리스트

마이그레이션 완료 후 반드시 아래 항목을 확인한다.

```sql
-- 1. 레코드 수 일치 확인
SELECT
  'users' AS table_name,
  COUNT(*) AS row_count
FROM users
UNION ALL
SELECT 'posts', COUNT(*) FROM posts
UNION ALL
SELECT 'comments', COUNT(*) FROM comments;

-- 2. 외래 키 무결성 확인
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS references
FROM pg_constraint
WHERE contype = 'f'
AND connamespace = 'public'::regnamespace;

-- 3. NULL이 되면 안 되는 컬럼 확인
SELECT COUNT(*) FROM users WHERE email IS NULL;
SELECT COUNT(*) FROM posts WHERE author_id IS NULL;

-- 4. RLS 정책 확인
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public';

-- 5. 인덱스 확인
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 참고 자료

- [Supabase 공식 마이그레이션 가이드](https://supabase.com/docs/guides/platform/migrating-to-supabase)
- [Firebase Firestore → Supabase 마이그레이션](https://supabase.com/docs/guides/platform/migrating-to-supabase/firestore-data)
- [Firebase Auth → Supabase 마이그레이션](https://supabase.com/docs/guides/platform/migrating-to-supabase/firebase-auth)
- [firebase-to-supabase 커뮤니티 도구](https://github.com/supabase-community/firebase-to-supabase)
- [PostgreSQL → Supabase 마이그레이션](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres)
- [Supabase CLI - DB Dump](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Supabase Backup and Restore (CLI)](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
