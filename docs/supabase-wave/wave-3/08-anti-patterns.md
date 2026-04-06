# Supabase 안티패턴 & 주의사항 모음

> 작성일: 2026-04-06  
> 대상: Supabase + Next.js 프로덕션 환경 개발자  
> 참고: Supabase 공식 문서, 실제 운영 사례, 보안 취약점 사례

---

## 목차

1. [보안 안티패턴](#1-보안-안티패턴)
   - RLS 비활성화 상태로 배포
   - Service Role Key 클라이언트 노출
   - user_metadata에 민감 정보 저장
   - 너무 느슨한 Storage Policy
2. [성능 안티패턴](#2-성능-안티패턴)
   - 인덱스 없는 RLS 정책 (테이블 스캔)
   - 불필요한 SELECT *
   - Realtime 구독 미정리 (메모리 누수)
   - Edge Functions에서 매번 새 클라이언트 생성
3. [아키텍처 안티패턴](#3-아키텍처-안티패턴)
   - 모든 로직을 Edge Functions에 넣기
   - 과도한 Realtime 구독
   - 클라이언트에서 복잡한 조인
   - 단일 테이블에 모든 데이터 (NoSQL 사고방식)
4. [운영 안티패턴](#4-운영-안티패턴)
   - 마이그레이션 없이 대시보드로 스키마 변경
   - 환경 분리 없이 프로덕션 직접 개발
   - 백업 미설정 / 복원 테스트 미수행
   - 모니터링 없는 프로덕션 운영

---

## 1. 보안 안티패턴

보안 안티패턴은 데이터 유출, 무단 접근, 데이터 손상으로 직결된다. 실수 하나가 전체 사용자 데이터를 위험에 빠뜨릴 수 있다.

---

### 안티패턴 1-1: RLS 비활성화 상태로 배포

#### 문제 설명

Row Level Security(RLS)를 비활성화한 상태로 테이블을 배포하면, `anon` 키를 가진 누구든 해당 테이블의 모든 데이터를 읽고 수정할 수 있다. Supabase 테이블은 기본적으로 RLS가 비활성화된 채로 생성된다.

2025년, AI 생성 코드 플랫폼 Lovable이 생성한 앱들에서 RLS 미설정으로 인해 170개 이상의 앱에서 데이터가 노출된 사례가 있었다(CVE-2025-48757). 한 앱에서만 13,000명의 사용자 데이터가 유출되었다.

#### 왜 위험한가

```
1. PostgREST API는 기본적으로 모든 public 스키마 테이블을 노출
2. RLS 없으면 anon 키로 https://[project].supabase.co/rest/v1/users 호출 시
   전체 사용자 목록이 반환됨
3. Supabase anon 키는 프론트엔드 JS 번들에 항상 포함됨 (숨길 수 없음)
4. 따라서 anon 키는 "모든 사람이 알고 있다고 가정"하고 설계해야 함
```

#### 잘못된 코드

```sql
-- 테이블 생성만 하고 RLS 미설정
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  full_name TEXT,
  phone TEXT,
  address TEXT,
  ssn TEXT  -- 주민등록번호가 RLS 없이 노출!
);
-- 이 상태에서 anon 키로 전체 데이터 조회 가능
```

#### 올바른 대안

```sql
-- 1. RLS 즉시 활성화
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 2. 명시적 정책 설정 (기본: 아무도 못 읽음)
CREATE POLICY "사용자는 자신의 프로필만 조회"
ON user_profiles FOR SELECT
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "사용자는 자신의 프로필만 수정"
ON user_profiles FOR UPDATE
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "사용자는 자신의 프로필만 삽입"
ON user_profiles FOR INSERT
WITH CHECK ((SELECT auth.uid()) = user_id);

-- 주민등록번호 같은 초민감 데이터는 아예 별도 테이블로 분리
-- + 서비스 레이어에서만 접근
```

#### 자동 감지 설정

```sql
-- Supabase Database Advisor가 RLS 미설정 테이블을 자동으로 경고
-- Dashboard → Advisors → Security → "RLS disabled in public" 확인

-- 수동으로 RLS 미설정 테이블 조회
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE c.relrowsecurity = true
  );
```

---

### 안티패턴 1-2: Service Role Key 클라이언트 노출

#### 문제 설명

Service Role Key는 RLS를 완전히 우회하고 데이터베이스에 관리자 수준의 접근 권한을 부여한다. 이 키가 프론트엔드 코드나 공개 저장소에 노출되면 데이터베이스 전체가 공격에 노출된다.

Service Role Key 노출 = 데이터베이스에 대한 root 접근 권한 부여와 동일하다.

#### 왜 위험한가

```
Service Role Key로 할 수 있는 것:
1. 모든 테이블의 전체 데이터 조회 (RLS 무시)
2. 모든 사용자의 데이터 수정/삭제
3. auth.users 테이블 접근 (이메일, 비밀번호 해시 등)
4. 데이터베이스 스키마 변경
5. Storage 모든 파일 접근/삭제
```

#### 잘못된 코드

```typescript
// BAD 1: 환경변수 이름이 NEXT_PUBLIC_으로 시작 → 브라우저에 노출됨!
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!  // 위험!
);

// BAD 2: 클라이언트 컴포넌트에서 service role key 사용
'use client';
import { createClient } from '@supabase/supabase-js';

export function AdminPanel() {
  const supabase = createClient(
    'https://xxx.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // 하드코딩 위험!
  );
}

// BAD 3: .env 파일을 git에 커밋
// .gitignore에 .env, .env.local 누락
```

#### 올바른 대안

```typescript
// GOOD 1: 서버 사이드에서만 service role key 사용
// app/api/admin/route.ts (서버 컴포넌트/Route Handler)
import { createClient } from '@supabase/supabase-js';

// NEXT_PUBLIC_ 없이 선언 → 서버에서만 접근 가능
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // NEXT_PUBLIC_ 없음
);

export async function POST(request: Request) {
  // 서버에서만 실행되는 관리자 작업
  const { userId } = await request.json();
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return Response.json(data);
}
```

```bash
# .env.local (절대 커밋하지 않음)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...  # 노출 가능

# 절대 NEXT_PUBLIC_ 접두사 사용 금지!
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1...  # 서버 전용
```

```bash
# .gitignore에 반드시 포함
.env
.env.local
.env.*.local
*.env
```

#### 키 노출 시 즉각 대응

```
1. Supabase Dashboard → Settings → API → API Settings
2. "Roll service_role key" 클릭 → 즉시 새 키 발급
3. 모든 배포 환경의 환경변수 업데이트
4. git 히스토리에서 제거 (git filter-branch 또는 BFG Repo-Cleaner)
```

---

### 안티패턴 1-3: user_metadata에 민감 정보 저장

#### 문제 설명

Supabase Auth의 `user_metadata`(raw_user_meta_data)는 **클라이언트에서 자유롭게 수정 가능**하다. 사용자가 자신의 `user_metadata`를 임의로 변경할 수 있으므로, 역할(role), 권한(permission), 구독 상태 등 보안에 민감한 정보를 저장하면 안 된다.

#### user_metadata vs app_metadata 차이

| 구분 | user_metadata | app_metadata |
|------|---------------|--------------|
| 저장 컬럼 | raw_user_meta_data | raw_app_meta_data |
| 수정 권한 | 클라이언트(사용자) | 서버(Service Role Only) |
| 용도 | 사용자 설정 (이름, 알림 설정 등) | 역할, 권한, 구독 상태 |
| JWT 포함 여부 | 포함됨 | 포함됨 |

#### 잘못된 코드

```typescript
// BAD: user_metadata에 역할 저장 → 사용자가 스스로 admin으로 변경 가능!
await supabase.auth.updateUser({
  data: {
    role: 'admin',           // 위험! 사용자가 수정 가능
    is_premium: true,        // 위험! 결제 안 해도 premium 설정 가능
    subscription_end: '2099-12-31',  // 위험!
  }
});

// 이 사용자가 직접 아래 코드를 실행하면?
await supabase.auth.updateUser({
  data: { role: 'admin', is_premium: true }
});
// → 성공! user_metadata가 admin으로 변경됨
```

```typescript
// BAD: user_metadata 기반 권한 체크
const { data: { user } } = await supabase.auth.getUser();
if (user?.user_metadata?.role === 'admin') {
  // 위험! 사용자가 role을 admin으로 변경했을 수도 있음
  showAdminPanel();
}
```

#### 올바른 대안

```typescript
// GOOD 1: app_metadata는 서버 사이드에서만 설정
// API Route (서버 전용)
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const { userId, role } = await request.json();

  // app_metadata는 admin API로만 수정 가능
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { role }
  });
}
```

```sql
-- GOOD 2: 별도 profiles 테이블에서 RLS로 관리 (권장)
CREATE TABLE user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  is_premium BOOLEAN NOT NULL DEFAULT false,
  subscription_end TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 역할 조회만 가능 (수정 불가)
CREATE POLICY "사용자는 자신의 역할만 조회"
ON user_roles FOR SELECT
USING ((SELECT auth.uid()) = user_id);

-- 역할 수정은 별도 Admin API로만 가능 (RLS 정책 없음 → service role만 수정 가능)
```

```typescript
// GOOD 3: RLS 정책에서 app_metadata 활용
// JWT claim 기반 권한 체크 (서버 사이드)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- 정책 적용
CREATE POLICY "admin만 모든 게시글 관리"
ON posts FOR ALL
USING (is_admin());
```

---

### 안티패턴 1-4: 너무 느슨한 Storage Policy

#### 문제 설명

Storage 버킷의 정책이 너무 느슨하게 설정되면, 다른 사용자의 파일을 덮어쓰거나 삭제할 수 있다. 또는 공개 버킷이지만 업로드/삭제 정책 없이 방치되면 무제한 파일 업로드 공격이 가능하다.

#### 잘못된 코드

```sql
-- BAD 1: 인증된 사용자 전체가 모든 파일 업로드 가능
CREATE POLICY "인증된 사용자 업로드 허용"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');
-- 문제: 다른 사용자의 경로에도 파일 업로드 가능

-- BAD 2: 모든 파일 삭제 허용
CREATE POLICY "인증된 사용자 삭제 허용"
ON storage.objects FOR DELETE
USING (bucket_id = 'uploads' AND auth.role() = 'authenticated');
-- 문제: 다른 사용자 파일도 삭제 가능

-- BAD 3: 파일 타입 검증 없음 → .php, .exe 등 위험 파일 업로드 가능
```

#### 올바른 대안

```sql
-- GOOD: 사용자는 자신의 폴더에만 접근 가능
-- 파일 경로 규칙: {user_id}/{filename}

-- 자신의 폴더에만 업로드 가능
CREATE POLICY "사용자 개인 폴더 업로드"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- 자신의 파일만 업데이트 가능
CREATE POLICY "사용자 개인 파일 업데이트"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- 자신의 파일만 삭제 가능
CREATE POLICY "사용자 개인 파일 삭제"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- 공개 아바타는 모두 조회 가능
CREATE POLICY "아바타 공개 조회"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

```typescript
// 클라이언트에서 파일 타입 + 크기 검증 (서버 사이드 검증도 필요)
async function uploadAvatar(file: File) {
  // 파일 타입 검증
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('허용되지 않는 파일 형식입니다. (JPEG, PNG, WebP, GIF만 가능)');
  }

  // 파일 크기 검증 (5MB 제한)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('파일 크기는 5MB 이하여야 합니다.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  const fileName = `${user!.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,  // 덮어쓰기 방지
    });

  return data;
}
```

---

## 2. 성능 안티패턴

---

### 안티패턴 2-1: 인덱스 없는 RLS 정책

#### 문제 설명

RLS 정책의 USING/WITH CHECK 절에 사용되는 컬럼에 인덱스가 없으면, **모든 쿼리마다 테이블 전체를 순차 스캔**한다. 테이블이 커질수록 성능이 선형으로 저하된다.

#### 왜 위험한가

실제 성능 측정 결과:

| 조건 | 10,000행 | 100,000행 | 1,000,000행 |
|------|----------|-----------|-------------|
| 인덱스 없음 | 50ms | 500ms | 타임아웃 |
| 인덱스 있음 | 2ms | 2ms | 2ms |

#### 잘못된 코드

```sql
-- BAD: user_id 컬럼에 인덱스 없음
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- 인덱스 없음!
  title TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자는 자신의 게시글만 조회"
ON posts FOR SELECT
USING (auth.uid() = user_id);  -- 매 행마다 user_id 비교 → 전체 스캔!
```

#### 올바른 대안

```sql
-- GOOD 1: 인덱스 즉시 추가
CREATE INDEX idx_posts_user_id ON posts (user_id);

-- GOOD 2: auth.uid()를 SELECT로 감싸 캐싱 효과 (추가 최적화)
-- auth.uid()를 매 행마다 호출하는 대신 한 번만 평가하고 재사용
DROP POLICY "사용자는 자신의 게시글만 조회" ON posts;

CREATE POLICY "사용자는 자신의 게시글만 조회"
ON posts FOR SELECT
USING ((SELECT auth.uid()) = user_id);
-- SELECT로 감싸면 PostgreSQL optimizer가 initplan으로 최적화
-- 100배 이상 성능 향상 가능

-- GOOD 3: 복합 인덱스 (정렬 패턴까지 고려)
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC);
```

```sql
-- 현재 RLS 정책에 인덱스 없는 컬럼 탐지
SELECT
  p.tablename,
  p.policyname,
  p.qual AS using_clause,
  'user_id에 인덱스 없음' AS issue
FROM pg_policies p
LEFT JOIN pg_indexes i ON i.tablename = p.tablename AND i.indexdef LIKE '%user_id%'
WHERE p.schemaname = 'public'
  AND p.qual LIKE '%user_id%'
  AND i.indexname IS NULL;
```

---

### 안티패턴 2-2: 불필요한 SELECT *

#### 문제 설명

`SELECT *`는 모든 컬럼을 반환한다. JSONB나 TEXT 형태의 대용량 컬럼이 포함된 경우, 실제로 필요하지 않은 데이터를 네트워크로 전송하여 불필요한 대역폭과 파싱 비용이 발생한다.

#### 잘못된 코드

```typescript
// BAD 1: 모든 컬럼 조회 (content는 수천 자 텍스트, metadata는 대용량 JSONB)
const { data: posts } = await supabase
  .from('posts')
  .select('*');  // content, metadata, raw_html 등 불필요한 컬럼 포함

// BAD 2: 목록에서 상세 데이터까지 모두 조회
const { data: users } = await supabase
  .from('profiles')
  .select('*');  // bio(긴 텍스트), settings(JSONB), preferences(JSONB) 포함
```

#### 올바른 대안

```typescript
// GOOD 1: 필요한 컬럼만 명시
const { data: posts } = await supabase
  .from('posts')
  .select('id, title, slug, created_at, author:profiles(id, full_name, avatar_url)')
  .order('created_at', { ascending: false })
  .limit(20);

// GOOD 2: 목록 vs 상세 쿼리 분리
// 목록용: 가벼운 컬럼만
const { data: postList } = await supabase
  .from('posts')
  .select('id, title, slug, excerpt, created_at');

// 상세용: 전체 컬럼
const { data: postDetail } = await supabase
  .from('posts')
  .select('*')
  .eq('slug', slug)
  .single();

// GOOD 3: TypeScript 타입과 함께 명시적 컬럼 선택
type PostListItem = Pick<Post, 'id' | 'title' | 'slug' | 'created_at'>;

const { data } = await supabase
  .from('posts')
  .select('id, title, slug, created_at')
  .returns<PostListItem[]>();
```

#### JSONB 컬럼 최적화

```typescript
// BAD: 전체 JSONB 조회
const { data } = await supabase
  .from('products')
  .select('id, name, metadata');  // metadata에 모든 스펙 포함 (수십 KB)

// GOOD: JSONB에서 필요한 필드만 추출 (SQL 함수 사용)
const { data } = await supabase
  .from('products')
  .select(`
    id,
    name,
    metadata->price AS price,
    metadata->category AS category
  `);
```

---

### 안티패턴 2-3: Realtime 구독 미정리 (메모리 누수)

#### 문제 설명

Supabase Realtime 구독은 WebSocket 연결을 유지한다. React 컴포넌트가 언마운트될 때 구독을 해제하지 않으면 **메모리 누수**가 발생하고, 애플리케이션이 오래 실행될수록 성능이 저하된다. 특히 SPA(Single Page Application)에서 페이지 이동을 반복하면 누수가 누적된다.

#### 잘못된 코드

```typescript
// BAD: 구독 해제 없음 → 컴포넌트 언마운트 후에도 이벤트 계속 수신
function MessageList({ channelId }: { channelId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // 구독 시작
    supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();

    // cleanup 없음! → 메모리 누수
  }, [channelId]);  // channelId 변경마다 구독 누적됨!
}
```

#### 올바른 대안

```typescript
// GOOD: 반드시 cleanup 함수에서 구독 해제
function MessageList({ channelId }: { channelId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();

    // cleanup: 컴포넌트 언마운트 또는 channelId 변경 시 구독 해제
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return <div>{/* ... */}</div>;
}
```

```typescript
// BETTER: 커스텀 훅으로 추상화
function useRealtimeMessages(channelId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // 초기 데이터 로드
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at')
      .then(({ data }) => data && setMessages(data));

    // Realtime 구독
    const channel = supabase
      .channel(`room-${channelId}`)
      .on('postgres_changes', {
        event: '*',  // INSERT, UPDATE, DELETE 모두
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessages(prev => [...prev, payload.new as Message]);
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`채널 ${channelId} 구독 완료`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return messages;
}
```

#### 구독 수 모니터링

```typescript
// 현재 열린 채널 수 확인 (디버깅용)
console.log('활성 채널 수:', supabase.getChannels().length);

// 모든 채널 강제 정리 (개발/테스트용)
await supabase.removeAllChannels();
```

---

### 안티패턴 2-4: Edge Functions에서 매번 새 클라이언트 생성

#### 문제 설명

Supabase Edge Functions의 각 요청마다 새 Supabase 클라이언트를 생성하면 불필요한 초기화 오버헤드가 발생한다. 또한 Edge Functions의 Isolate(격리 환경)는 일정 시간 동안 유지되므로, 모듈 수준에서 클라이언트를 생성하면 재사용할 수 있다.

#### 잘못된 코드

```typescript
// BAD: 요청마다 새 클라이언트 생성 (초기화 비용 반복)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // 매 요청마다 새 클라이언트 생성 → 불필요한 초기화
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data } = await supabase.from('posts').select('*');
  return new Response(JSON.stringify(data));
});
```

#### 올바른 대안

```typescript
// GOOD: 모듈 수준에서 한 번만 생성 (Isolate 재사용 시 캐싱됨)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 모듈 초기화 시 한 번만 생성
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  // 요청별 사용자 컨텍스트가 필요한 경우: JWT에서 추출
  const authHeader = req.headers.get('Authorization');

  // 사용자 권한이 필요한 작업
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader! },
      },
    }
  );
  // 참고: 사용자 클라이언트는 요청별로 새로 생성해야 함 (다른 사용자 요청 혼용 방지)

  // admin 작업은 재사용
  const { data } = await supabaseAdmin.from('global_config').select('*');
  return new Response(JSON.stringify(data));
});
```

---

## 3. 아키텍처 안티패턴

---

### 안티패턴 3-1: 모든 로직을 Edge Functions에 넣기

#### 문제 설명

Edge Functions는 JavaScript/TypeScript로 작성되며 Supabase 인프라 외부에서 실행된다. 데이터 집약적인 작업(집계, 조인, 변환)을 Edge Function에서 처리하면 불필요한 데이터 이동이 발생한다.

#### 잘못된 코드

```typescript
// BAD: Edge Function에서 집계 처리
serve(async () => {
  // 10,000개 주문을 전부 가져와서 JS에서 집계
  const { data: orders } = await supabase
    .from('orders')
    .select('*');  // 10,000개 전체 전송!

  const stats = {
    total: orders.length,
    totalRevenue: orders.reduce((sum, o) => sum + o.amount, 0),
    averageOrder: orders.reduce((sum, o) => sum + o.amount, 0) / orders.length,
    byStatus: orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {}),
  };

  return new Response(JSON.stringify(stats));
});
```

#### 올바른 대안

```sql
-- GOOD: DB 함수로 집계 (데이터 이동 최소화)
CREATE OR REPLACE FUNCTION get_order_stats()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT JSONB_BUILD_OBJECT(
    'total', COUNT(*),
    'total_revenue', COALESCE(SUM(amount), 0),
    'average_order', COALESCE(AVG(amount), 0),
    'by_status', (
      SELECT JSONB_OBJECT_AGG(status, count)
      FROM (
        SELECT status, COUNT(*) AS count
        FROM orders
        GROUP BY status
      ) s
    )
  )
  FROM orders;
$$;
```

```typescript
// Edge Function은 단순 RPC 호출만
serve(async () => {
  const { data: stats } = await supabase.rpc('get_order_stats');
  // 10,000개 대신 집계 결과 1개만 전송
  return new Response(JSON.stringify(stats));
});
```

**판단 기준: DB 함수 vs Edge Function**

| 작업 | 추천 |
|------|------|
| 데이터 집계, 통계 계산 | DB 함수 (SQL) |
| 복잡한 조인 및 변환 | DB 함수 (SQL) |
| 트랜잭션 내 복잡한 로직 | DB 함수 (PL/pgSQL) |
| 외부 API 호출 | Edge Function |
| 이메일/메시지 발송 | Edge Function |
| 파일 처리, 이미지 변환 | Edge Function |
| 복잡한 비즈니스 로직 + 외부 연동 | Edge Function |

---

### 안티패턴 3-2: 과도한 Realtime 구독

#### 문제 설명

Realtime은 WebSocket 연결을 유지하며 DB 변경을 실시간으로 전송한다. 모든 데이터에 Realtime을 적용하면 불필요한 서버 부하와 클라이언트 오버헤드가 발생한다.

#### 잘못된 코드

```typescript
// BAD: 갱신 빈도가 낮은 데이터에 Realtime 구독
function Dashboard() {
  // 설정은 거의 바뀌지 않는데 Realtime 구독
  const { data: settings } = useRealtimeQuery(
    supabase.from('site_settings').select('*')
  );

  // 상품 목록도 Realtime (초당 수백 개 변경 가능)
  const { data: products } = useRealtimeQuery(
    supabase.from('products').select('*')  // 필터 없이 전체 구독!
  );
}
```

#### 올바른 대안

```typescript
// GOOD: 실시간성이 필요한 데이터에만 Realtime 적용

// 실시간 채팅 메시지 → Realtime 적합
function ChatRoom({ roomId }: { roomId: string }) {
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,  // 필터 필수!
      }, handler)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [roomId]);
}

// 주문 상태 업데이트 → Realtime 적합
function OrderStatus({ orderId }: { orderId: string }) {
  useEffect(() => {
    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,  // 특정 주문만 구독
      }, handler)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [orderId]);
}

// 사이트 설정 → 폴링이 더 적합 (React Query 사용)
function SiteSettings() {
  const { data } = useQuery({
    queryKey: ['site-settings'],
    queryFn: () => supabase.from('site_settings').select('*').single(),
    staleTime: 10 * 60 * 1000,  // 10분간 캐시
    refetchInterval: false,      // 자동 재요청 없음
  });
}
```

**Realtime 사용 판단 기준**

| 조건 | Realtime | 폴링 |
|------|----------|------|
| 변경 빈도 | 초당 수 회 이상 | 분당 수 회 이하 |
| 지연 허용 | < 1초 | 수십 초 가능 |
| 사용자 수 | 소수 (채팅방 등) | 전체 사용자 |
| 변경 감지 방식 | 즉시 필요 | 주기적 확인으로 충분 |

---

### 안티패턴 3-3: 클라이언트에서 복잡한 조인 처리

#### 문제 설명

클라이언트(브라우저)에서 여러 테이블을 별도로 조회하고 JavaScript로 조인하면, 불필요한 데이터 전송과 처리 비용이 발생한다.

#### 잘못된 코드

```typescript
// BAD: 클라이언트에서 여러 테이블 조회 후 JS로 조인
async function getDashboardData() {
  const [
    { data: orders },
    { data: users },
    { data: products }
  ] = await Promise.all([
    supabase.from('orders').select('*'),          // 전체 주문
    supabase.from('profiles').select('*'),         // 전체 사용자
    supabase.from('order_items').select('*'),      // 전체 주문 항목
  ]);

  // 클라이언트에서 조인 처리
  return orders.map(order => ({
    ...order,
    user: users.find(u => u.id === order.user_id),
    items: products.filter(p => p.order_id === order.id),
  }));
}
```

#### 올바른 대안

```typescript
// GOOD 1: PostgREST Embedding 활용
async function getDashboardData() {
  const { data } = await supabase
    .from('orders')
    .select(`
      id,
      status,
      total_amount,
      created_at,
      user:profiles(id, full_name, email),
      items:order_items(
        id,
        quantity,
        unit_price,
        product:products(id, name, sku)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);
  return data;
}

// GOOD 2: 복잡한 경우 DB View 또는 함수 활용
-- VIEW 생성
CREATE VIEW order_summary AS
SELECT
  o.id,
  o.status,
  o.total_amount,
  o.created_at,
  p.full_name AS customer_name,
  p.email AS customer_email,
  COUNT(oi.id) AS item_count
FROM orders o
JOIN profiles p ON p.id = o.user_id
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, p.id;
```

---

### 안티패턴 3-4: 단일 테이블에 모든 데이터 (NoSQL 사고방식)

#### 문제 설명

NoSQL(MongoDB 등) 경험자가 Supabase를 사용할 때 모든 것을 하나의 테이블에 JSONB로 저장하는 패턴을 사용하는 경우가 있다. PostgreSQL은 관계형 DB이므로 적절한 정규화가 필요하다.

#### 잘못된 코드

```sql
-- BAD: NoSQL 스타일 단일 테이블 설계
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT,  -- 'user', 'post', 'comment', 'order' 등
  data JSONB,  -- 모든 데이터를 JSONB로
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 이렇게 저장:
-- { "type": "user", "data": {"name": "홍길동", "email": "...} }
-- { "type": "post", "data": {"title": "...", "user_id": "..."} }
-- { "type": "order", "data": {"items": [...], "total": 1000} }
```

#### 왜 위험한가

```
1. 외래 키 참조 무결성 보장 불가 (DB 레벨 제약 없음)
2. 인덱스 효율 저하 (JSONB 인덱스는 B-Tree보다 비효율적)
3. 쿼리 복잡성 증가 (data->>'user_id' 같은 표현식 필요)
4. RLS 정책 작성이 복잡하고 버그 가능성 높음
5. 타입 검증 불가 (JSONB 내부 타입 체크 어려움)
6. pg_stat_statements에서 쿼리 패턴 분석 어려움
```

#### 올바른 대안

```sql
-- GOOD: 관계형 설계 (정규화)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 반정형 데이터는 JSONB로 (하이브리드 접근)
-- 단, 검색/필터링이 필요한 필드는 별도 컬럼으로 분리
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,  -- 자주 검색/정렬 → 별도 컬럼
  category TEXT NOT NULL,          -- 자주 필터링 → 별도 컬럼
  attributes JSONB,                 -- 제품별 다른 속성 → JSONB 적합
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 자주 검색하는 JSONB 필드에는 인덱스 추가
CREATE INDEX idx_products_attributes_brand
  ON products ((attributes->>'brand'));
```

---

## 4. 운영 안티패턴

---

### 안티패턴 4-1: 마이그레이션 없이 대시보드로 스키마 변경

#### 문제 설명

Supabase Dashboard의 Table Editor에서 직접 스키마를 변경하면, 변경 이력이 코드베이스에 남지 않는다. 다른 개발자의 로컬 환경이나 스테이징 환경에서 동일한 변경을 재현할 수 없고, 롤백이 어렵다.

#### 잘못된 과정

```
1. Dashboard → Table Editor → 새 컬럼 추가 "클릭"
2. 프로덕션 DB에 즉시 적용됨
3. 로컬 개발 환경: 해당 컬럼 없음 → 에러
4. 스테이징 환경: 해당 컬럼 없음 → 에러
5. 팀원 B가 같은 컬럼을 다른 이름으로 추가 → 충돌
6. 프로덕션 롤백 방법 없음
```

#### 올바른 대안

```bash
# Supabase CLI를 사용한 마이그레이션 관리

# 1. 현재 프로덕션 스키마 로컬에 동기화
supabase db pull

# 2. 새 마이그레이션 파일 생성
supabase migration new add_phone_to_profiles

# 3. 마이그레이션 작성
# supabase/migrations/20260406_add_phone_to_profiles.sql
```

```sql
-- supabase/migrations/20260406120000_add_phone_to_profiles.sql
-- 설명: profiles 테이블에 전화번호 컬럼 추가

ALTER TABLE profiles
ADD COLUMN phone TEXT,
ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT false;

-- 인덱스 추가 (전화번호 검색용)
CREATE INDEX idx_profiles_phone ON profiles (phone)
WHERE phone IS NOT NULL;

-- 기존 RLS 정책은 변경 불필요 (컬럼 추가는 기존 정책에 영향 없음)
COMMENT ON COLUMN profiles.phone IS '사용자 전화번호 (선택사항)';
COMMENT ON COLUMN profiles.phone_verified IS '전화번호 인증 여부';
```

```bash
# 4. 로컬 DB에 적용 및 테스트
supabase db reset  # 로컬 DB 초기화 후 마이그레이션 전체 재실행
# 또는
supabase migration up  # 새 마이그레이션만 적용

# 5. 스테이징에 배포
supabase db push --db-url postgresql://...staging...

# 6. PR 리뷰 후 프로덕션 배포
supabase db push --db-url postgresql://...production...
```

#### 대시보드에서 변경했을 때 사후 처리

```bash
# 대시보드에서 이미 변경했다면: 변경 내용을 마이그레이션으로 캡처
supabase db diff --schema public > supabase/migrations/20260406120000_capture_dashboard_changes.sql

# 캡처된 마이그레이션 검토 후 커밋
git add supabase/migrations/
git commit -m "feat: 대시보드 스키마 변경사항 마이그레이션으로 캡처"
```

---

### 안티패턴 4-2: 환경 분리 없이 프로덕션 직접 개발

#### 문제 설명

로컬 개발 중 프로덕션 DB에 직접 연결하여 테스트하면, 실수로 실제 데이터를 손상시킬 위험이 있다. 새 기능 개발 중 DB 스키마 실험이 프로덕션 서비스에 영향을 줄 수 있다.

#### 환경별 설정 구분

```bash
# .env.local (로컬 개발)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # 로컬 키
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...      # 로컬 키

# .env.staging
NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # 스테이징 프로젝트 키
SUPABASE_SERVICE_ROLE_KEY=...

# .env.production (CI/CD 시스템에서 관리, 코드에 없음)
NEXT_PUBLIC_SUPABASE_URL=https://xyz789.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # 프로덕션 프로젝트 키
SUPABASE_SERVICE_ROLE_KEY=...
```

```bash
# 로컬 개발 환경 시작
supabase start  # Docker에서 Supabase 로컬 인스턴스 실행
# → http://localhost:54321 (API)
# → http://localhost:54323 (Studio)

# 시드 데이터 삽입
supabase db seed  # supabase/seed.sql 실행

# 환경 변수 확인
supabase status  # 로컬 키 확인
```

#### Supabase Branching 활용 (Pro Plan 이상)

```bash
# Git 브랜치마다 독립된 DB 환경 생성
git checkout -b feature/new-user-profile
supabase branches create feature/new-user-profile

# 브랜치에서 스키마 변경 테스트
supabase migration new update_profiles_schema

# PR 머지 시 스테이징, 프로덕션 순서로 자동 마이그레이션
```

---

### 안티패턴 4-3: 백업 미설정 / 복원 테스트 미수행

#### 문제 설명

Supabase는 자동 백업을 제공하지만, 백업이 제대로 작동하는지, 복원 절차를 알고 있는지 확인하지 않으면 장애 시 대응이 불가능하다. "백업이 있다"와 "복원할 수 있다"는 다른 문제다.

#### 백업 설정 확인

```
Supabase Dashboard → Settings → Backups:

Free Plan: 백업 없음 (수동 백업만 가능)
Pro Plan: 매일 자동 백업, 7일 보관
Team Plan: 매일 자동 백업, 14일 보관
Enterprise: 커스텀 보관 기간

→ Pro Plan 이상 사용 또는 수동 백업 자동화 설정 필수
```

#### 수동 백업 자동화

```bash
#!/bin/bash
# scripts/backup.sh
# cron 또는 GitHub Actions로 주기적 실행

set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${DATE}.sql"

# pg_dump로 백업
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-acl \
  --no-owner \
  --file="${BACKUP_FILE}"

# 압축
gzip "${BACKUP_FILE}"

# S3 또는 다른 스토리지에 업로드
# aws s3 cp "${BACKUP_FILE}.gz" "s3://my-backups/supabase/${BACKUP_FILE}.gz"
# 또는 Supabase Storage에 업로드
supabase storage cp "${BACKUP_FILE}.gz" "ss://backups/${BACKUP_FILE}.gz"

# 30일 이상 된 로컬 백업 삭제
find . -name "backup_*.sql.gz" -mtime +30 -delete

echo "백업 완료: ${BACKUP_FILE}.gz"
```

#### 복원 절차 문서화 및 테스트

```bash
# 복원 테스트 (분기별 1회 필수)

# 1. 새 Supabase 프로젝트 생성 (복원 테스트용)
# 2. 백업 파일로 복원
pg_restore \
  --dbname="postgresql://postgres:[PASSWORD]@db.[TEST-PROJECT].supabase.co:5432/postgres" \
  --no-acl \
  --no-owner \
  backup_20260406_030000.sql

# 3. 데이터 무결성 확인
# - 테이블 수 확인
# - 주요 테이블 row count 확인
# - 앱 기능 동작 확인

# 4. 복원 소요 시간 기록 (RTO 계산)
echo "복원 테스트 완료: $(date)"
```

```sql
-- 백업 검증 쿼리 (복원 후 실행)
SELECT
  schemaname,
  tablename,
  n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- 예상 row count와 실제 비교 (체크리스트)
-- profiles: 1,234행 예상 → 실제: ___행
-- posts: 5,678행 예상 → 실제: ___행
-- orders: 9,012행 예상 → 실제: ___행
```

---

### 안티패턴 4-4: 모니터링 없는 프로덕션 운영

#### 문제 설명

사용자 신고가 오기 전까지 문제를 모르는 상태는 최악의 운영 방식이다. 성능 저하, 오류 급증, 디스크 부족 등을 사전에 감지하고 대응해야 한다.

#### 최소 모니터링 체크리스트

```typescript
// 1. Supabase Dashboard 알림 설정
// Settings → Notifications:
// - CPU 사용률 80% 초과
// - 메모리 사용률 80% 초과
// - 디스크 사용률 80% 초과
// - API 에러율 5% 초과

// 2. 외부 업타임 모니터링 (무료 도구)
// - UptimeRobot (https://uptimerobot.com) - 5분 간격 무료
// - Better Uptime
// - Datadog (유료)

// 3. 에러 트래킹
// - Sentry (Next.js 공식 통합)
// next.config.ts에 Sentry 설정
```

```typescript
// 4. 주요 메트릭 대시보드 (간단한 내부 모니터링)
// supabase/functions/health-check/index.ts

serve(async () => {
  const checks = {
    timestamp: new Date().toISOString(),
    database: false,
    api_latency_ms: 0,
    active_connections: 0,
  };

  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from('health_checks')
      .select('id')
      .limit(1);

    checks.database = !error;
    checks.api_latency_ms = Date.now() - start;
  } catch (e) {
    checks.database = false;
  }

  const { data: connData } = await supabase.rpc('get_active_connections');
  checks.active_connections = connData || 0;

  const isHealthy = checks.database && checks.api_latency_ms < 1000;

  return new Response(JSON.stringify(checks), {
    status: isHealthy ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

```sql
-- 주기적으로 확인해야 할 주요 지표 쿼리 모음
-- (cron 또는 모니터링 스크립트에서 실행)

-- 1. 데이터베이스 크기 추이
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- 2. 가장 큰 테이블
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS total_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::regclass) DESC
LIMIT 10;

-- 3. 캐시 히트율 (95% 이하면 위험)
SELECT
  ROUND(100.0 * SUM(blks_hit) / NULLIF(SUM(blks_hit) + SUM(blks_read), 0), 2)
  AS cache_hit_pct
FROM pg_stat_database
WHERE datname = current_database();

-- 4. 인덱스 bloat (인덱스 팽창)
SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS scans
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
```

---

## 5. 종합 체크리스트

### 배포 전 보안 체크리스트

```
[ ] 모든 public 스키마 테이블에 RLS 활성화
[ ] Service Role Key가 NEXT_PUBLIC_ 환경변수로 노출되지 않음
[ ] .env 파일이 .gitignore에 포함됨
[ ] user_metadata에 역할/권한 정보 저장하지 않음
[ ] Storage 버킷 정책이 소유자 기반으로 설정됨
[ ] 파일 업로드 타입/크기 검증 코드 존재
[ ] auth.uid()를 SELECT로 감싸는 RLS 정책 패턴 적용
```

### 배포 전 성능 체크리스트

```
[ ] RLS 정책에 사용되는 컬럼에 인덱스 존재
[ ] SELECT * 대신 필요한 컬럼만 조회
[ ] React 컴포넌트의 Realtime 구독이 cleanup 함수 포함
[ ] 대용량 목록에 cursor 기반 페이지네이션 적용
[ ] 집계 쿼리는 DB 함수(RPC) 또는 Materialized View 활용
[ ] EXPLAIN ANALYZE로 느린 쿼리 검토
```

### 운영 체크리스트

```
[ ] 백업 설정 및 복원 테스트 완료 (분기별)
[ ] 로컬/스테이징/프로덕션 환경 분리
[ ] 모든 스키마 변경이 마이그레이션 파일로 관리됨
[ ] CPU/메모리/디스크 알림 설정
[ ] 업타임 모니터링 설정 (외부 서비스)
[ ] 에러 트래킹 설정 (Sentry 등)
[ ] pg_stat_statements로 느린 쿼리 주기적 확인
```

---

## 참고 자료

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Securing Your Data](https://supabase.com/docs/guides/database/secure-data)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase Security Retro 2025](https://supaexplorer.com/dev-notes/supabase-security-2025-whats-new-and-how-to-stay-secure.html)
- [Service Role Key Security](https://chat2db.ai/resources/blog/secure-supabase-role-key)
- [Backup and Restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors)
