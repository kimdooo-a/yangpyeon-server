# Supabase 비용 최적화 전략

> **대상 프로젝트**: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> **스택**: Next.js 15 + TypeScript + Supabase + Cloudflare Tunnel
> **작성일**: 2026-04-06
> **Wave**: Wave-4 (의사결정 & 전략)

---

## 목차

1. [Supabase 가격 체계 개요](#1-supabase-가격-체계-개요)
2. [Free 플랜 최대 활용](#2-free-플랜-최대-활용)
3. [Pro 플랜 ($25/월) 가치 분석](#3-pro-플랜-25월-가치-분석)
4. [서비스별 비용 최적화](#4-서비스별-비용-최적화)
5. [인프라 비용 비교: Supabase 단독 vs 하이브리드](#5-인프라-비용-비교-supabase-단독-vs-하이브리드)
6. [장기 비용 전망](#6-장기-비용-전망)
7. [실전 비용 최적화 체크리스트](#7-실전-비용-최적화-체크리스트)

---

## 1. Supabase 가격 체계 개요

### 1.1 플랜별 가격 요약 (2026 기준)

| 플랜 | 월 기본료 | 주요 특징 | 적합 대상 |
|------|----------|----------|----------|
| **Free** | $0 | 제한된 리소스, 7일 비활성 정지 | 개인/사이드 프로젝트 |
| **Pro** | $25 + 사용량 | 무제한 활성, 일일 백업, 이미지 변환 | 성장 중인 앱, 소규모 비즈니스 |
| **Team** | $599 | 팀 협업, SSO, SOC2 Type II | 중규모 팀, 에이전시 |
| **Enterprise** | 커스텀 | 전용 지원, HIPAA, 맞춤형 SLA | 대기업, 규제 산업 |

### 1.2 과금 구조 이해

Supabase의 Pro 플랜은 **기본료 $25 + 사용량 초과 과금** 구조다.
기본 포함량을 초과하면 서비스별로 추가 요금이 발생한다.

**Pro 플랜 포함량 vs 초과 단가:**

| 서비스 | Pro 포함량 | 초과 단가 |
|--------|-----------|----------|
| 데이터베이스 용량 | 8 GB | $0.125/GB |
| 월간 활성 사용자 (MAU) | 100,000명 | $0.00325/명 |
| 파일 스토리지 | 100 GB | $0.021/GB |
| 데이터베이스 Egress | 50 GB | $0.09/GB (캐시: $0.03/GB) |
| 스토리지 Egress | 250 GB | $0.09/GB (캐시: $0.03/GB) |
| Edge Function 호출 | 2,000,000회 | $2/백만 회 |
| Realtime 메시지 | 2,000,000건 | $2.50/백만 건 |
| 컴퓨트 | Nano (shared) | 상위 tier 추가 비용 |

### 1.3 Spend Cap (지출 한도) 시스템

Pro 플랜에는 기본적으로 **Spend Cap**이 활성화된다.
Spend Cap이 활성화된 상태에서 포함량을 초과하면 서비스가 중단되지만, 예상치 못한 청구는 방지된다.

```
Spend Cap ON (기본값):
  포함량 초과 → 해당 서비스 중단 (과금 없음)
  예: 스토리지 100GB 초과 → 업로드 불가

Spend Cap OFF (선택):
  포함량 초과 → 초과 사용량만큼 과금 (서비스 중단 없음)
  예: 스토리지 110GB → $2.1 추가 청구
```

**권장**: 초기에는 Spend Cap ON으로 유지, 사용 패턴 파악 후 OFF 고려

---

## 2. Free 플랜 최대 활용

### 2.1 Free 플랜 리소스 한도 상세

**2026년 기준 Free 플랜 제공 리소스:**

| 리소스 | 한도 | 비고 |
|--------|------|------|
| 프로젝트 수 | 2개 | 활성 프로젝트 기준 |
| 데이터베이스 용량 | 500 MB | 테이블 + 인덱스 + WAL 포함 |
| DB Egress | 5 GB/월 | 쿼리 응답 데이터 |
| 월간 활성 사용자 (MAU) | 50,000명 | 로그인한 고유 사용자 |
| 파일 스토리지 | 1 GB | 객체 스토리지 |
| Storage Egress | 5 GB/월 | 파일 다운로드 데이터 |
| Edge Function 호출 | 500,000회/월 | 실행 횟수 기준 |
| Realtime 메시지 | 2,000,000건/월 | Broadcast + Postgres Changes |
| 백업 | 없음 | 수동 백업 필요 |
| 비활성 정지 | 7일 | 쿼리 없으면 자동 정지 |
| 컴퓨트 | Nano (shared) | 공유 인스턴스 |
| 이메일 발송 | 3회/시간 | SMTP 자체 설정으로 우회 가능 |

### 2.2 Free 플랜으로 충분한 사용 시나리오

**양평 부엌 서버 대시보드 기준으로 분석:**

| 시나리오 | 예상 사용량 | Free 적합 여부 |
|----------|-----------|--------------|
| 1인 운영자 대시보드 | MAU 1명, DB 50MB/월 증가 | **충분** |
| 가족 단위 (5명 이하) | MAU 5명, DB 100MB/월 증가 | **충분** |
| 소규모 팀 (10명 이하) | MAU 10명, DB 200MB/월 증가 | **충분** |
| 공개 서비스 | MAU 1,000명+, DB 무한 증가 | **부족** |

**Free 플랜이 이상적인 조건:**
- 사용자 수: 50,000 MAU 미만
- 데이터: 500MB 미만 (행 수로는 수백만 행 가능)
- 파일: 1GB 미만
- 개발/스테이징 환경
- 개인/포트폴리오 프로젝트

### 2.3 Free 플랜의 실제 한계점과 우회 전략

#### 2.3.1 한계 1: 7일 비활성 자동 정지

**문제**: 7일간 쿼리가 없으면 프로젝트가 자동 정지됨.
정지 후 첫 요청 시 콜드 스타트 (30초–수 분 지연) 발생.

**우회 전략:**

```
전략 A: 외부 헬스체크 서비스 활용 (권장)
→ UptimeRobot 무료 플랜: 5분마다 URL 핑
→ 설정: https://stats.uptimerobot.com → New Monitor
→ URL: https://your-project.supabase.co/rest/v1/?apikey={ANON_KEY}

전략 B: Cloudflare Workers 스케줄러 활용
→ 매 6시간마다 Supabase API 호출하는 Worker 배포
→ 비용: Cloudflare Workers 무료 플랜 (100K 요청/일)

전략 C: 로컬 cron (WSL2)
→ crontab -e
→ 0 */6 * * * curl -s "https://xxxx.supabase.co/rest/v1/system_metrics?limit=1" \
    -H "apikey: ANON_KEY" > /dev/null
```

#### 2.3.2 한계 2: 이메일 발송 3회/시간 제한

**문제**: Auth 이메일 (가입 확인, 비밀번호 재설정)이 시간당 3회로 제한됨.

**우회 전략:**

```
전략 A: 외부 SMTP 서버 연결 (권장)
→ Supabase 대시보드 → Auth → SMTP Settings
→ Resend (무료: 3,000이메일/월), SendGrid (무료: 100이메일/일)
→ AWS SES (매우 저렴: $0.10/1000이메일)

전략 B: 소셜 로그인만 활성화
→ Google/GitHub OAuth 사용 시 이메일 발송 없음
→ 작은 팀에 적합
```

#### 2.3.3 한계 3: 500MB 데이터베이스 용량

**문제**: 대용량 로그 데이터 축적 시 빠르게 소진됨.

**우회 전략:**

```
전략 A: 자동 데이터 TTL 적용 (권장)
→ pg_cron으로 오래된 데이터 자동 삭제
→ 예: 30일 이상 메트릭 데이터 삭제

전략 B: 요약 테이블 (Aggregation)
→ 원시 데이터는 7일만 보관
→ 일별/주별 집계 데이터를 별도 테이블에 보존

전략 C: 파티셔닝
→ 월별 파티션으로 오래된 파티션 DROP
→ 빠르고 인덱스 유지 비용 없음
```

```sql
-- 자동 데이터 정리 예시
-- supabase/migrations/20260406000010_data_retention.sql

-- 데이터 보존 정책 테이블
CREATE TABLE data_retention_policies (
  table_name TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL,
  last_cleanup TIMESTAMPTZ
);

INSERT INTO data_retention_policies (table_name, retention_days)
VALUES
  ('system_metrics', 7),         -- 원시 메트릭: 7일
  ('process_snapshots', 7),      -- 프로세스 스냅샷: 7일
  ('audit_logs', 90);            -- 감사 로그: 90일

-- pg_cron으로 매일 자정 정리
SELECT cron.schedule(
  'enforce-data-retention',
  '0 0 * * *',
  $$
  DELETE FROM system_metrics
  WHERE created_at < now() - interval '7 days';

  DELETE FROM process_snapshots
  WHERE created_at < now() - interval '7 days';
  $$
);
```

#### 2.3.4 한계 4: 공유 컴퓨트 (Nano)

**문제**: Free 플랜은 공유 인스턴스로 피크 타임 성능 저하 가능.

**우회 전략:**

```
전략 A: 쿼리 최적화로 컴퓨트 부하 최소화
→ 불필요한 컬럼 SELECT 제거 (SELECT * 금지)
→ LIMIT 사용으로 대용량 결과 방지
→ 집계 쿼리는 DB 함수로 처리 (왕복 최소화)

전략 B: 캐싱 레이어 추가
→ Next.js Route Segment Cache 활용
→ 자주 읽히는 데이터는 ISR(Incremental Static Regeneration) 적용
→ revalidate 설정으로 DB 호출 빈도 감소

전략 C: 비실시간 데이터는 폴링 간격 늘리기
→ 5초 폴링 → 30초 또는 60초로 조정
→ Realtime 사용 최소화 (메시지 과금 방지)
```

---

## 3. Pro 플랜 ($25/월) 가치 분석

### 3.1 Pro 플랜 추가 제공 리소스

Free 플랜 대비 Pro 플랜에서 추가되는 내용:

| 항목 | Free | Pro | 차이 |
|------|------|-----|------|
| 데이터베이스 용량 | 500 MB | 8 GB | **16배** |
| 월간 활성 사용자 | 50,000 | 100,000 | 2배 |
| 파일 스토리지 | 1 GB | 100 GB | **100배** |
| DB Egress | 5 GB | 50 GB | 10배 |
| Storage Egress | 5 GB | 250 GB | 50배 |
| Edge Function 호출 | 500K | 2M | 4배 |
| 자동 백업 | 없음 | 일일 (7일 보관) | **신규** |
| 비활성 정지 | 7일 | 없음 | **신규** |
| 이미지 변환 | 없음 | 포함 (100개/월 기본) | **신규** |
| 이메일 제한 | 3회/시간 | 없음 | **신규** |
| 우선 지원 | 없음 | 이메일 지원 | **신규** |
| 전용 Postgres | 없음 | 없음 (Nano 동일) | 동일 |

### 3.2 Pro 플랜의 핵심 가치

**$25/월이 의미 있는 3가지 상황:**

#### 상황 1: 7일 비활성 정지 문제
Free 플랜의 가장 큰 운영 리스크인 자동 정지가 Pro에서는 완전히 사라진다.
헬스체크 서버 관리 불필요.

#### 상황 2: 자동 일일 백업
데이터 손실 시 최대 1일치만 잃게 됨.
수동 백업 스크립트 관리 불필요.

#### 상황 3: 대용량 스토리지 (100 GB)
이미지, 문서, 로그 파일 저장 시 Free(1GB)와 압도적인 차이.

### 3.3 Pro 플랜 업그레이드 적기 판단 지표

다음 중 **하나라도** 해당하면 즉시 Pro 업그레이드 권장:

```
🔴 즉시 업그레이드 필요:
[ ] 7일 비활성 정지로 실제 서비스 중단 발생
[ ] 데이터 손실 발생 (백업 없어서 복구 불가)
[ ] DB 용량 400MB 초과 (Free 한도 80%)
[ ] 스토리지 800MB 초과 (Free 한도 80%)

🟡 업그레이드 고려:
[ ] MAU 40,000명 초과 (Free 한도 80%)
[ ] 팀원 증가로 공동 개발 필요
[ ] 이미지 변환 기능 필요
[ ] 외부 SMTP 설정이 번거롭고 이메일 발송 빈번

🟢 Free 유지 가능:
[ ] 1인 운영 + 소규모 데이터
[ ] 헬스체크 자동화 운영 중
[ ] 수동 백업 루틴 정착됨
```

### 3.4 Pro 플랜 숨겨진 비용 주의사항

Pro 플랜은 $25 고정이 아니다. 아래 항목은 **추가 과금**이 발생한다:

| 항목 | 초과 단가 | 주의 시나리오 |
|------|----------|-------------|
| DB 용량 초과 | $0.125/GB | 8GB 초과 시 |
| MAU 초과 | $0.00325/명 | 100K 초과 시 |
| Egress 초과 | $0.09/GB | 트래픽 급증 시 |
| 컴퓨트 업그레이드 | $10~$200+/월 | 성능 향상 필요 시 |
| PITR (시점 복구) | $100/월 | 엔터프라이즈 수준 백업 |
| IPv4 전용 주소 | $4/월 | 특수 요구사항 |

**예상 Pro 플랜 실제 비용 시나리오:**

| 사용 패턴 | 예상 월 비용 |
|----------|------------|
| 기본 (포함량 이내) | $25 |
| DB 10GB + 기본 | $25 + $0.25 = $25.25 |
| DB 20GB + 스토리지 150GB | $25 + $1.5 + $1.05 = $27.55 |
| MAU 150K + 기본 | $25 + $162.5 = $187.5 |
| 컴퓨트 Small 업그레이드 | $25 + $10 = $35 |

---

## 4. 서비스별 비용 최적화

### 4.1 Database 최적화

#### 4.1.1 커넥션 풀링 — 비용의 근본

서버리스 환경(Next.js API Routes)에서 DB 직접 연결 시 연결 폭발(connection explosion)이 발생한다.
Supabase의 **Supavisor** (PgBouncer 후계자)를 통한 Transaction mode 풀링이 필수다.

```
# .env.local
# 직접 연결 (5432 포트) — 마이그레이션, 관리 작업 전용
DATABASE_URL=postgresql://postgres:[PW]@db.[REF].supabase.co:5432/postgres

# Transaction mode 풀러 (6543 포트) — API Routes, 서버 컴포넌트 전용
DATABASE_POOLER_URL=postgresql://postgres.[REF]:[PW]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

**Prisma 사용 시:**

```
# prisma/.env
DATABASE_URL="postgresql://postgres.[REF]:[PW]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[PW]@db.[REF].supabase.co:5432/postgres"
```

```prisma
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")    // 풀러 URL
  directUrl = env("DIRECT_URL")       // 직접 연결 (마이그레이션용)
}
```

#### 4.1.2 쿼리 최적화로 Egress 절감

Egress는 DB에서 나가는 모든 데이터에 과금된다. 쿼리 최적화로 직접 절감 가능.

**나쁜 패턴 → 좋은 패턴:**

```typescript
// 나쁜 패턴: 불필요한 컬럼 모두 조회 (Egress 낭비)
const { data } = await supabase
  .from('system_metrics')
  .select('*')  // 모든 컬럼 (JSON 포함)

// 좋은 패턴: 필요한 컬럼만 조회
const { data } = await supabase
  .from('system_metrics')
  .select('id, created_at, cpu_total, memory_used_mb, disk_used_gb')
  .order('created_at', { ascending: false })
  .limit(60)  // 반드시 limit 지정
```

```typescript
// 나쁜 패턴: N+1 쿼리 (다중 왕복)
const { data: processes } = await supabase.from('process_snapshots').select('*')
for (const p of processes) {
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('resource', p.process_name) // N번 쿼리
}

// 좋은 패턴: JOIN으로 단일 쿼리
const { data } = await supabase
  .from('process_snapshots')
  .select(`
    *,
    audit_logs!inner(id, action, created_at)
  `)
  .order('created_at', { ascending: false })
  .limit(20)
```

#### 4.1.3 인덱스 관리 — DB 용량 최적화

인덱스는 DB 용량을 차지한다. 필요한 인덱스만 유지한다.

```sql
-- 미사용 인덱스 탐지 (월 1회 실행)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 불필요한 인덱스 제거
DROP INDEX IF EXISTS idx_unused_example;
```

```sql
-- 테이블별 용량 점검 (500MB 한도 관리)
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
  n_live_tup AS row_count
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

#### 4.1.4 집계 쿼리는 DB 함수로 처리

Edge Function 호출을 줄이고 DB 컴퓨트 내에서 처리:

```sql
-- DB 함수: 최근 1시간 평균 메트릭
CREATE OR REPLACE FUNCTION get_hourly_avg_metrics()
RETURNS TABLE (
  hour_start TIMESTAMPTZ,
  avg_cpu DECIMAL,
  avg_memory_percent DECIMAL,
  avg_disk_percent DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    date_trunc('hour', created_at) AS hour_start,
    AVG(cpu_total) AS avg_cpu,
    AVG(memory_used_mb / memory_total_mb * 100) AS avg_memory_percent,
    AVG(disk_used_gb / disk_total_gb * 100) AS avg_disk_percent
  FROM system_metrics
  WHERE created_at > now() - interval '24 hours'
  GROUP BY date_trunc('hour', created_at)
  ORDER BY hour_start DESC;
$$;
```

```typescript
// API Route에서 DB 함수 호출 (Edge Function 호출 불필요)
const { data } = await supabase.rpc('get_hourly_avg_metrics')
```

---

### 4.2 Storage 최적화

#### 4.2.1 CDN 캐싱으로 Egress 90% 절감

Supabase Storage는 CDN(Content Delivery Network)을 통해 파일을 서빙한다.
캐시된 Egress는 $0.03/GB (캐시 미스는 $0.09/GB — 3배 차이).

```typescript
// 파일 업로드 시 캐시 헤더 설정
const { data } = await supabase.storage
  .from('exports')
  .upload(filePath, file, {
    cacheControl: '3600',  // 1시간 CDN 캐싱
    upsert: false,
  })
```

```typescript
// Public URL 사용 시 CDN 자동 활용
const { data } = supabase.storage
  .from('public-assets')
  .getPublicUrl('logo.png')
// data.publicUrl은 CDN URL — 반복 요청 시 캐시 적용
```

#### 4.2.2 이미지 압축 업로드 전 처리

```typescript
// src/lib/image-compress.ts
// 업로드 전 클라이언트 사이드 압축
export async function compressImage(file: File, maxWidthPx = 1920): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    img.onload = () => {
      const scale = Math.min(1, maxWidthPx / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => resolve(blob!),
        'image/webp',   // WebP: JPEG 대비 30% 작음
        0.85            // 품질 85%
      )
    }

    img.src = URL.createObjectURL(file)
  })
}
```

#### 4.2.3 고아 파일 정리 자동화

DB 레코드는 삭제됐지만 Storage에 남은 파일이 용량을 낭비한다.

```sql
-- 고아 파일 탐지 뷰 (예시: user-avatars 버킷)
CREATE VIEW orphaned_avatars AS
SELECT o.name AS storage_path
FROM storage.objects o
WHERE o.bucket_id = 'user-avatars'
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id::text = split_part(o.name, '/', 1)
  );
```

```typescript
// supabase/functions/cleanup-orphaned-files/index.ts
// Edge Function으로 주기적 정리 (또는 pg_cron)
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 고아 파일 목록 조회
  const { data: orphans } = await supabase
    .from('orphaned_avatars')  // 위에서 만든 뷰
    .select('storage_path')

  if (orphans && orphans.length > 0) {
    const paths = orphans.map(o => o.storage_path)
    await supabase.storage.from('user-avatars').remove(paths)
  }

  return new Response(JSON.stringify({ cleaned: orphans?.length ?? 0 }))
})
```

---

### 4.3 Edge Functions 최적화

#### 4.3.1 Edge Function vs DB 함수 결정 트리

```
Edge Function을 사용해야 하는 경우:
  ✅ 외부 API 호출 (Stripe, Slack, Telegram 등)
  ✅ Webhook 수신 및 처리
  ✅ 인증이 필요한 서드파티 통합
  ✅ 복잡한 비즈니스 로직 (TypeScript/Deno 이점 활용)
  ✅ 백그라운드 처리 (이메일 발송, 알림)

DB 함수 (PostgreSQL)로 대체 가능한 경우:
  ✅ 데이터 변환 및 집계
  ✅ 유효성 검증 (Constraint, Trigger)
  ✅ 단순 계산 및 포맷팅
  ✅ 관련 테이블 JOIN 및 집계
  ✅ 스케줄 작업 (pg_cron 사용)
```

#### 4.3.2 불필요한 Edge Function 호출 줄이기

```typescript
// 나쁜 패턴: 매 클릭마다 Edge Function 호출
async function handleClick(itemId: string) {
  await fetch('/api/edge/track-click', {  // Edge Function 호출
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
}

// 좋은 패턴: 배치 처리 (30초마다 모아서 전송)
const clickBuffer: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function handleClick(itemId: string) {
  clickBuffer.push(itemId)
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      if (clickBuffer.length > 0) {
        fetch('/api/edge/track-clicks', {
          method: 'POST',
          body: JSON.stringify({ items: [...clickBuffer] }),
        })
        clickBuffer.length = 0
      }
      flushTimer = null
    }, 30_000)
  }
}
```

#### 4.3.3 Free 플랜 500K 호출 아끼기

```
500,000회/월 ÷ 30일 = 16,667회/일 ÷ 24시간 = 694회/시간

1분에 10번 이상 호출 → 월간 한도 초과 가능성 있음

비용 절감 전략:
- Webhook: 외부에서 1회 호출 → DB 직접 upsert (Edge Function 우회)
- 메트릭 수집: 60초마다 → 대신 Next.js API Route + DB 직접 INSERT
- 트리거 기반 작업: pg_trigger로 DB 레벨에서 처리
```

---

### 4.4 Realtime 최적화

#### 4.4.1 Realtime 과금 구조 이해

```
Free 플랜: 2,000,000 메시지/월 포함
Pro 플랜: 2,000,000 메시지/월 포함
초과 시: $2.50/백만 메시지

2,000,000 / 30일 / 24시간 / 60분 ≈ 46 메시지/분

활성 대시보드 1개 + 메트릭 업데이트 1분에 5회 → 하루 7,200메시지 → 월 216,000메시지
→ Free 한도 이내 (여유 있음)

활성 사용자 100명 동시 접속 + 1초마다 업데이트 → 월 259,200,000메시지
→ 초과 발생 ($647/월 추가 비용)
```

#### 4.4.2 구독 최소화 전략

```typescript
// 나쁜 패턴: 모든 이벤트 구독 (메시지 폭발)
const channel = supabase
  .channel('all-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: '*' }, handler)
  .subscribe()

// 좋은 패턴: 필요한 테이블 + 이벤트만 구독
const channel = supabase
  .channel('metrics-insert-only')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',          // INSERT만 (UPDATE, DELETE 제외)
      schema: 'public',
      table: 'system_metrics',  // 특정 테이블만
      filter: 'cpu_total=gt.80' // 필터로 메시지 추가 감소 (선택)
    },
    handler
  )
  .subscribe()
```

#### 4.4.3 폴링 대체 가능 여부 판단

```
Realtime이 필요한 경우:
  ✅ 여러 사용자가 동시에 같은 데이터를 보는 경우
  ✅ 알림성 이벤트 (즉각 반응 필요)
  ✅ 협업 기능 (공동 편집, 채팅)

폴링으로 충분한 경우 (비용 절감):
  ✅ 1인 사용자 대시보드 (여러 탭에서 보더라도)
  ✅ 30초 이상 주기적 갱신으로 충분한 메트릭
  ✅ 사용자가 화면을 보고 있을 때만 갱신이 의미 있는 경우
```

```typescript
// 폴링 구현 (Realtime 대체)
function useMetricsPolling(intervalMs = 30_000) {
  const [metrics, setMetrics] = useState<SystemMetric[]>([])

  useEffect(() => {
    let isMounted = true

    async function fetchMetrics() {
      const supabase = createClient()
      const { data } = await supabase
        .from('system_metrics')
        .select('id, created_at, cpu_total, memory_used_mb')
        .order('created_at', { ascending: false })
        .limit(60)

      if (isMounted && data) setMetrics(data)
    }

    fetchMetrics()
    const timer = setInterval(fetchMetrics, intervalMs)

    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [intervalMs])

  return metrics
}
```

---

### 4.5 Auth 비용 최적화

#### 4.5.1 MAU 정의 이해

Supabase의 **MAU(Monthly Active Users)** 는 해당 월에 **로그인한 고유 사용자 수**다.

```
중요: MAU는 "등록된 사용자"가 아니라 "활성(로그인한) 사용자"

예시:
- 등록 사용자: 10,000명
- 이번 달 로그인 사용자: 3,000명
→ MAU = 3,000명 (Free 50K 한도 이내)

절감 전략:
- 세션 유효 기간 늘리기 (자주 재로그인 불필요)
- "로그인 유지" 기능 활성화
- 소셜 로그인 활성화 (사용자 마찰 감소)
```

#### 4.5.2 Auth 설정 최적화

```
Supabase 대시보드 → Auth → Settings:

1. JWT 만료 시간 늘리기
   - 기본: 3600초 (1시간)
   - 권장: 86400초 (24시간) ~ 604800초 (7일)
   - 효과: 토큰 갱신 요청 감소 → DB 부하 감소

2. 이메일 확인 비활성화 (소규모 신뢰 팀)
   - Confirm Email 토글 OFF
   - 효과: 이메일 발송 횟수 절감 (SMTP 한도 아끼기)

3. 불필요한 OAuth 제공자 비활성화
   - 사용하지 않는 소셜 로그인 모두 OFF
   - 효과: 설정 단순화 + 잠재적 보안 리스크 감소
```

---

## 5. 인프라 비용 비교: Supabase 단독 vs 하이브리드

### 5.1 비교 시나리오

양평 부엌 서버 대시보드 + 향후 성장을 고려한 두 가지 아키텍처 비교:

**시나리오 A: Supabase 단독**
- 데이터베이스: Supabase DB
- 파일 저장: Supabase Storage
- CDN: Supabase CDN (내장)
- 서버리스: Supabase Edge Functions
- 인증: Supabase Auth
- 실시간: Supabase Realtime

**시나리오 B: Supabase + Cloudflare 하이브리드**
- 데이터베이스: Supabase DB (유지)
- 파일 저장: **Cloudflare R2** (대체)
- CDN: **Cloudflare CDN** (강화)
- 서버리스: **Cloudflare Workers** (일부 대체)
- 인증: Supabase Auth (유지)
- 실시간: Supabase Realtime (유지)

### 5.2 스토리지 비용 비교 (핵심 차이)

| 항목 | Supabase Storage (Pro) | Cloudflare R2 |
|------|----------------------|---------------|
| 기본 포함 | 100 GB/월 | 10 GB/월 (무료) |
| 스토리지 단가 | $0.021/GB | **$0.015/GB** |
| Egress 단가 | $0.09/GB (캐시 미스) | **$0 (무료!)** |
| 최소 비용 | Pro 플랜 $25에 포함 | 0원 (10GB 이내) |
| API 호출 | 포함 | Class A: $4.50/백만, Class B: $0.36/백만 |

**Egress 비용 차이가 핵심:**

```
시나리오: 월 50GB 파일 다운로드 (이미지 서비스 등)

Supabase Storage (캐시 미스):
→ 50GB × $0.09 = $4.50/월 추가 비용

Cloudflare R2:
→ 50GB × $0.00 = $0 (Egress 무료)

1년 절감액: $4.50 × 12 = $54
```

### 5.3 아키텍처별 월간 비용 시뮬레이션

**소규모 (1인 운영, 현재 양평 부엌):**

| 항목 | Supabase 단독 | 하이브리드 |
|------|-------------|----------|
| Supabase 기본 | $0 (Free) | $0 (Free) |
| 스토리지 | $0 (1GB 이내) | $0 (10GB 이내) |
| Egress | $0 (5GB 이내) | $0 |
| **월 합계** | **$0** | **$0** |

**중규모 (10~100명 사용자):**

| 항목 | Supabase 단독 | 하이브리드 |
|------|-------------|----------|
| Supabase Pro | $25 | $25 |
| 스토리지 50GB | 포함 | $0.75 (R2) |
| Egress 100GB | $9 (캐시 미스) | $0 (R2 무료) |
| Cloudflare Workers | — | $5 (10M 요청) |
| **월 합계** | **$34** | **$30.75** |

**대규모 (1,000명 이상, 대용량 파일):**

| 항목 | Supabase 단독 | 하이브리드 |
|------|-------------|----------|
| Supabase Pro | $25 | $25 |
| 스토리지 500GB | $8.40 (초과분 400GB) | $7.50 (R2) |
| Egress 1TB | $90 (추정) | $0 (R2 무료) |
| Cloudflare Workers | — | $5 |
| **월 합계** | **$123.40** | **$37.50** |

**결론: 파일 서비스 규모가 클수록 하이브리드 아키텍처가 훨씬 유리하다.**

### 5.4 하이브리드 아키텍처 구현 포인트

파일 스토리지만 R2로 이전하는 경우:

```typescript
// src/lib/storage-r2.ts
// Cloudflare R2는 S3 호환 API 제공

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function uploadToR2(key: string, body: Buffer, contentType: string) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))

  return `https://${process.env.R2_PUBLIC_DOMAIN}/${key}`
}

export async function getR2SignedUrl(key: string, expiresInSeconds = 3600) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  )
}
```

### 5.5 하이브리드 전환 권장 시점

```
Supabase 단독 유지 (현재):
✅ 파일 저장이 거의 없는 경우
✅ 관리 단순성이 우선인 경우
✅ 월 Egress 5GB 이내

하이브리드 전환 고려:
🔄 파일 다운로드 월 50GB 초과
🔄 이미지/동영상 서비스 계획
🔄 글로벌 사용자에게 낮은 지연시간 필요
🔄 스토리지 비용이 월 $10 이상
```

---

## 6. 장기 비용 전망

### 6.1 성장 단계별 비용 곡선

```
월 비용 (USD)

$200 │                                     ╭──── Supabase 단독
     │                               ╭────╯
$100 │                          ╭───╯
     │                     ╭───╯         ╭─── 하이브리드
$50  │                ╭───╯       ╭─────╯
$25  │      ╭────────╯      ╭───╯
$0   ├──────╯      ╭───────╯
     └──────────────────────────────────────
     1명   10명  100명   1K명  10K명  100K명
           MAU / 사용자 규모
```

### 6.2 사용자 규모별 예상 비용

| 규모 | MAU | Supabase 단독 예상 | 하이브리드 예상 |
|------|-----|------------------|--------------|
| 초기 (현재) | 1–10명 | $0 (Free) | $0 |
| 소규모 | 100명 | $0–$25 | $0–$25 |
| 중규모 | 1,000명 | $25–$50 | $25–$35 |
| 성장기 | 10,000명 | $50–$150 | $35–$80 |
| 대규모 | 100,000명 | $150–$500 | $80–$200 |
| 엔터프라이즈 | 100,000명+ | $599+ (Team) | 커스텀 |

### 6.3 비용 임계점 분석

**Free → Pro 전환 임계점:**
- MAU 기준: 40,000명 (Free 한도 80%)
- DB 용량 기준: 400MB (Free 한도 80%)
- 비용: $0 → $25/월

**Pro 기본 → 과금 구조 변화 임계점:**
- MAU: 100,000명 초과 시 $0.00325/명 추가
  - 예: MAU 150,000명 → $162.5 추가 (총 $187.5)
- DB: 8GB 초과 시 $0.125/GB
  - 예: DB 20GB → $1.5 추가 (총 $26.5)

**Pro → Team 전환 검토 시점:**
- MAU 100,000명 접근
- 팀 5명 이상
- SOC2 / HIPAA 규정 준수 필요
- 비용: $25 → $599/월 (24배 증가, 큰 결정)

### 6.4 장기 비용 최적화 로드맵

| 기간 | 예상 규모 | 권장 전략 |
|------|----------|----------|
| 현재 ~ 6개월 | 1–10 MAU | Free 플랜 + 헬스체크 자동화 |
| 6개월 ~ 1년 | 10–1,000 MAU | Free 유지, DB 자동 정리 정착 |
| 1년 ~ 2년 | 1,000–10,000 MAU | Pro $25 업그레이드 시점 판단 |
| 2년 이상 | 10,000 MAU+ | 하이브리드 아키텍처 전환 검토 |

### 6.5 대안 비용 비교 (참고)

"Supabase를 계속 써야 하는가?"를 판단할 때 참고:

| 서비스 | 기본 비용 | DB 용량 | Auth | 특징 |
|--------|---------|---------|------|------|
| **Supabase Free** | $0 | 500MB | 50K MAU | PostgreSQL, RLS |
| **Supabase Pro** | $25/월 | 8GB | 100K MAU | 백업, 이미지 변환 |
| **Firebase Spark** | $0 | 1GB Firestore | 무제한 | NoSQL |
| **Firebase Blaze** | 사용량 과금 | 무제한 | 무제한 | NoSQL |
| **PlanetScale** | $0 | 5GB | 없음 | MySQL, 브랜칭 |
| **Neon** | $0 | 0.5GB | 없음 | 서버리스 PostgreSQL |
| **Railway** | $5/월 | 1GB | 없음 | 컨테이너 기반 |

**결론**: Supabase는 PostgreSQL + 인증 + 파일 스토리지 + 실시간을 $0~$25에 통합 제공한다.
동등한 스택을 개별 서비스로 구성하면 $50~$100+이다.

---

## 7. 실전 비용 최적화 체크리스트

### 7.1 일일 확인 (자동화 가능)

```
[ ] 비활성 정지 방지 핑 실행 중 확인 (Free 플랜)
[ ] Edge Function 오류율 확인 (불필요한 재시도로 호출 낭비 방지)
```

### 7.2 주간 확인

```
[ ] DB 용량 증가량 확인 (Free: 500MB 한도, Pro: 8GB 한도)
[ ] Egress 누적 확인 (Free: 5GB/월 DB + 5GB/월 Storage)
[ ] 오래된 데이터 정리 스크립트 실행 확인
[ ] Storage 고아 파일 없는지 확인
```

### 7.3 월간 확인

```
[ ] Supabase 대시보드 → Billing → Usage 전체 검토
[ ] MAU 트렌드 분석 (50K 임박 여부)
[ ] 미사용 인덱스 탐지 및 정리
[ ] Edge Function 호출 수 분석 (DB 함수 대체 가능 여부)
[ ] Realtime 메시지 수 분석 (폴링 대체 가능 여부)
[ ] Pro 업그레이드 판단 기준 재점검
[ ] 백업 상태 확인 (수동 백업 실행)
```

### 7.4 분기별 확인

```
[ ] 아키텍처 리뷰: Supabase 단독 vs 하이브리드 재검토
[ ] 비용 예측: 향후 3개월 트렌드 기반 비용 추정
[ ] API 키 순환 (보안 + 비용 관리)
[ ] 불필요한 프로젝트 정리 (Free 플랜 2개 한도 최적 활용)
[ ] Supabase 요금제 변경 여부 확인 (공식 블로그)
```

### 7.5 비용 급증 대응 플로우

```
비용 급증 감지 시:

1. Supabase 대시보드 → Billing → Usage 상세 확인
   → 어떤 서비스가 초과됐는가?

2. 원인 분석:
   - MAU 급증 → 비활성 사용자 계정 검토, 세션 수명 연장
   - Egress 급증 → 쿼리 최적화, CDN 캐싱 확인
   - Storage 급증 → 고아 파일 정리, 이미지 압축 적용
   - Edge Function 급증 → 불필요한 호출 패턴 탐지

3. 즉시 조치:
   - Spend Cap 활성화 (추가 과금 차단)
   - 원인 기능 임시 비활성화
   - 데이터 정리 즉시 실행

4. 근본 해결:
   - 쿼리/코드 최적화
   - 캐싱 레이어 추가
   - TTL 정책 강화
```

---

> **요약**: 양평 부엌 서버 대시보드는 현재 규모에서 Free 플랜으로 충분히 운영 가능하다.
> 핵심 비용 최적화는 (1) 데이터 자동 TTL, (2) 쿼리 최적화, (3) 비활성 정지 방지 3가지다.
> Pro 업그레이드 시점은 "7일 정지로 서비스 중단 경험" 또는 "DB 400MB 초과" 중 먼저 도달하는 시점이다.

**출처:**
- [Supabase 공식 가격 정책](https://supabase.com/pricing)
- [Supabase 빌링 가이드](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase Realtime 가격](https://supabase.com/docs/guides/realtime/pricing)
- [Cloudflare R2 가격](https://developers.cloudflare.com/r2/pricing/)
- [Supabase vs R2 비교 (2026)](https://www.buildmvpfast.com/compare/supabase-vs-r2)
- [Supabase 연결 풀링 가이드](https://supabase.com/docs/guides/database/connection-management)
- [UI Bakery — Supabase Pricing 2026](https://uibakery.io/blog/supabase-pricing)
