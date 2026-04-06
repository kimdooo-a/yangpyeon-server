# 10. Supabase 재해 복구 & 백업 전략

> 작성일: 2026-04-06  
> 대상 독자: Supabase 프로덕션 운영자, 인프라 담당자  
> 참고: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) | [PITR 공식 문서](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)

---

## 목차

1. [백업 전략](#1-백업-전략)
2. [복원 절차](#2-복원-절차)
3. [재해 복구 계획 (DRP)](#3-재해-복구-계획-drp)
4. [장애 시나리오별 대응](#4-장애-시나리오별-대응)
5. [복원 테스트 및 DR 드릴](#5-복원-테스트-및-dr-드릴)
6. [셀프호스팅 환경 DR](#6-셀프호스팅-환경-dr)

---

## 1. 백업 전략

데이터는 서비스의 생명이다. 백업이 없거나 복원이 불가능한 백업은 없는 것과 같다. Supabase는 플랜별로 다른 수준의 백업을 제공하며, 추가적인 수동 백업 전략을 병행하는 것이 모범 사례다.

---

### 1-1. 자동 백업 (플랜별 비교)

Supabase는 모든 프로젝트에 대해 자동 백업을 수행하지만, **플랜마다 보존 기간과 기능이 다르다**.

| 항목 | Free | Pro | Team | Enterprise |
|------|------|-----|------|------------|
| 자동 일별 백업 | 없음 | O | O | O |
| 보존 기간 | - | 7일 | 14일 | 30일 |
| PITR 지원 | X | 애드온 | 애드온 | 애드온 |
| 대시보드 복원 | X | O | O | O |
| 백업 다운로드 | X | O | O | O |
| 월 비용 | $0 | $25 | $599 | 협의 |

> **Free 플랜 주의사항**: Free 플랜 프로젝트는 자동 백업이 없다. Supabase 공식 문서는 Free 플랜 사용자에게 `supabase db dump` 명령어로 정기적으로 직접 백업하고 외부에 보관할 것을 권고한다.

**자동 백업의 내부 동작**:
- Supabase 자동 백업은 **물리적 백업(Physical Backup)** 방식으로 동작한다
- PostgreSQL WAL(Write-Ahead Log) 파일을 지속적으로 S3에 업로드
- 복원 시 WAL 파일을 재생(replay)하여 지정 시점으로 복원
- 일별 백업은 매일 UTC 기준으로 생성되며, 각 백업은 전체 스냅샷이 아닌 증분 방식

---

### 1-2. PITR (Point-in-Time Recovery)

PITR은 **초 단위 정밀도**로 데이터베이스를 특정 시점으로 복원할 수 있는 기능이다. Pro, Team, Enterprise 플랜에서 유료 애드온으로 활성화할 수 있다.

#### PITR 동작 원리

```
[정상 운영]
  DB → WAL 생성 → S3에 WAL 파일 지속 업로드
  
  타임라인:
  T0(베이스 백업) ─────────────────────► T_now
                  ↑                ↑
               WAL 파일들이 연속으로 저장됨

[복원 요청: T_target 시점으로 복원]
  1. T0 베이스 백업 복원
  2. T0 → T_target 구간의 WAL 파일 재생
  3. T_target 시점의 정확한 DB 상태 복원
```

PITR은 PostgreSQL의 표준 WAL 스트리밍 메커니즘을 기반으로 한다. Supabase는 이를 관리형으로 제공하므로 별도 인프라 설정 없이 대시보드에서 활성화할 수 있다.

#### PITR 활성화

1. Supabase Dashboard → 프로젝트 선택
2. **Settings** → **Add-ons**
3. **Point in Time Recovery** 섹션에서 보존 기간 선택
4. **Save** 클릭

> **필수 조건**: PITR 활성화 시 최소 **Small 컴퓨트 애드온** 이상이 필요하다. Nano 컴퓨트에서는 PITR이 활성화되지 않는다.

#### PITR 가격 (2026년 기준)

| 보존 기간 | 월 비용 |
|----------|---------|
| 7일 | $100 |
| 14일 | $200 |
| 28일 | $400 |

> PITR 요금은 Spend Cap 적용 대상이 아니므로, 예산 관리 시 별도 계산해야 한다.

> **중요**: PITR을 활성화하면 일별(Daily) 자동 백업은 **더 이상 생성되지 않는다**. PITR이 더 세밀한 복원을 제공하므로 중복 필요가 없기 때문이다. PITR 활성화 전에 생성된 일별 백업은 남아 있어 복원 가능하다.

---

### 1-3. 수동 백업 (pg_dump / supabase db dump)

자동 백업에만 의존하는 것은 위험하다. 특히 Free 플랜이거나, 장기 보존이 필요하거나, 외부 저장소에 별도 보관해야 하는 경우 수동 백업을 구성한다.

#### supabase CLI로 백업 (권장)

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 링크
supabase link --project-ref [PROJECT-REF]

# 스키마만 덤프
supabase db dump -f schema_$(date +%Y%m%d).sql

# 데이터만 덤프 (COPY 형식)
supabase db dump -f data_$(date +%Y%m%d).sql --data-only

# 역할 덤프
supabase db dump -f roles_$(date +%Y%m%d).sql --role-only

# 전체 덤프 (스키마 + 데이터)
# 순서대로 모두 덤프 후 복원 시에도 순서대로: roles → schema → data
```

> `supabase db dump`는 내부적으로 `pg_dump`를 실행하되, Supabase 관리 스키마(`auth`, `storage`, `extensions` 등)와 내부 역할을 자동으로 제외한다. **Raw `pg_dump` 사용 시 이 필터링이 적용되지 않아 복원 시 권한 오류가 발생할 수 있다.**

#### pg_dump 직접 사용 (주의 사항 포함)

```bash
# Connection String 확인: Dashboard → Settings → Database → Connection String

# Supabase 내부 스키마 제외하여 덤프
pg_dump \
  --no-owner \
  --no-privileges \
  --exclude-schema=auth \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  --exclude-schema=extensions \
  --exclude-schema=graphql \
  --exclude-schema=graphql_public \
  --exclude-schema=pgsodium \
  --exclude-schema=vault \
  --exclude-schema=supabase_functions \
  --format=plain \
  "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### GitHub Actions를 이용한 자동 수동 백업

```yaml
# .github/workflows/backup.yml
name: Supabase 자동 백업

on:
  schedule:
    - cron: '0 2 * * *'  # 매일 오전 2시 (UTC)
  workflow_dispatch:       # 수동 실행 허용

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Supabase CLI 설치
        run: npm install -g supabase

      - name: 백업 생성
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
        run: |
          DATE=$(date +%Y%m%d_%H%M%S)
          supabase link --project-ref $PROJECT_REF
          supabase db dump -f schema_${DATE}.sql
          supabase db dump -f data_${DATE}.sql --data-only
          supabase db dump -f roles_${DATE}.sql --role-only

      - name: AWS S3에 업로드
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          aws s3 cp schema_*.sql s3://my-backup-bucket/supabase/db/
          aws s3 cp data_*.sql s3://my-backup-bucket/supabase/db/
          aws s3 cp roles_*.sql s3://my-backup-bucket/supabase/db/

      - name: 오래된 백업 정리 (90일 초과)
        run: |
          aws s3 ls s3://my-backup-bucket/supabase/db/ | \
          awk '{print $4}' | \
          while read f; do
            DATE=$(echo $f | grep -oP '\d{8}')
            if [ $(date -d "$DATE" +%s) -lt $(date -d "-90 days" +%s) ]; then
              aws s3 rm "s3://my-backup-bucket/supabase/db/$f"
            fi
          done
```

---

### 1-4. Storage 백업 (S3 API 활용)

Supabase Storage는 S3 호환 API를 제공하므로 `aws-cli`, `rclone`, `s3cmd` 등 표준 S3 도구로 백업할 수 있다.

#### S3 접근 키 발급

1. Supabase Dashboard → **Storage** 탭
2. **S3 Connection** 섹션
3. **New access key** 클릭하여 Access Key ID와 Secret Access Key 발급

#### rclone을 이용한 Storage 백업

```bash
# rclone 설치
brew install rclone  # macOS
# 또는
sudo apt install rclone  # Ubuntu

# rclone 설정
rclone config

# 설정 내용:
# Name: supabase-storage
# Type: s3
# Provider: Other
# Access Key ID: [발급받은 키]
# Secret Access Key: [발급받은 키]
# Endpoint: https://[PROJECT-REF].supabase.co/storage/v1/s3
# Region: ap-northeast-2 (프로젝트 리전)
```

```bash
# Storage 전체 백업
rclone sync \
  supabase-storage:[PROJECT-REF] \
  /local/backup/storage/$(date +%Y%m%d) \
  --progress

# S3로 직접 동기화 (Supabase Storage → AWS S3)
rclone sync \
  supabase-storage:[PROJECT-REF] \
  aws-s3:my-backup-bucket/storage/ \
  --progress
```

#### aws-cli를 이용한 방법

```bash
export AWS_ACCESS_KEY_ID="supabase-s3-access-key"
export AWS_SECRET_ACCESS_KEY="supabase-s3-secret"
export AWS_DEFAULT_REGION="ap-northeast-2"

aws s3 sync \
  s3://[PROJECT-REF] \
  ./storage-backup \
  --endpoint-url https://[PROJECT-REF].supabase.co/storage/v1/s3
```

---

## 2. 복원 절차

백업은 복원이 성공해야 의미가 있다. 복원 절차를 미리 숙지하고 주기적으로 테스트해야 한다.

---

### 2-1. 대시보드에서 복원

일별 자동 백업(Pro 이상)에서 복원하는 가장 간단한 방법이다.

1. Supabase Dashboard → 해당 프로젝트
2. **Settings** → **Database**
3. **Backups** 탭 클릭
4. 복원할 날짜의 백업 옆 **Restore** 버튼 클릭
5. 확인 다이얼로그에서 프로젝트명 입력 후 확인

> **주의**: 대시보드 복원은 **현재 DB를 완전히 덮어쓴다**. 복원 전 현재 상태를 별도 백업하는 것이 안전하다.

```bash
# 복원 전 현재 상태 백업
supabase db dump -f pre_restore_backup_$(date +%Y%m%d_%H%M%S).sql
```

---

### 2-2. CLI로 복원

```bash
# 1. 스키마 복원
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f roles_backup.sql

psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f schema_backup.sql

# 2. 데이터 복원
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f data_backup.sql

# 3. Custom format 덤프 복원 (pg_restore 사용)
pg_restore \
  --no-owner \
  --no-privileges \
  --dbname="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  backup.dump

# 4. 복원 후 시퀀스 초기화 (필요한 경우)
# INSERT 시 ID 충돌 방지
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
```

**연결 풀러(Connection Pooler) vs 직접 연결**:

```bash
# 마이그레이션/복원 시: 반드시 직접 연결(Direct Connection) 사용
# 포트 5432, 호스트: db.[PROJECT-REF].supabase.co
# Connection Pooler(포트 6543)는 DDL 작업에 적합하지 않음

# 직접 연결 문자열
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

---

### 2-3. PITR 복원 (특정 시점 복원)

PITR을 활성화한 경우, **초 단위 정밀도**로 원하는 시점으로 복원할 수 있다.

#### 대시보드에서 PITR 복원

1. Dashboard → **Settings** → **Database** → **Backups**
2. **Point in Time** 탭 선택
3. 날짜/시간 선택기에서 복원 시점 선택
4. **Review** → 확인 후 **Restore**

#### 복원 시점 결정 가이드

```
장애 발생 타임라인 예시:

10:00 — 정상 운영
10:15 — 관리자가 실수로 users 테이블 대량 삭제
10:17 — 장애 인지
10:20 — 복원 요청

복원 목표 시점: 10:14:59 (삭제 직전 1초 전)

PITR로 10:14:59를 선택하면 해당 시점의 정확한 DB 상태로 복원됨
```

> **주의**: PITR 복원도 새 프로젝트를 생성하여 복원하거나 기존 프로젝트를 덮어쓰는 방식이다. 복원 중 서비스가 중단될 수 있다.

---

### 2-4. 부분 복원 (특정 테이블만)

전체 DB 복원 없이 특정 테이블만 복원하는 경우다. 이 시나리오는 훨씬 복잡하므로 사전 대비가 필요하다.

#### 방법 A: 다른 프로젝트에 복원 후 데이터 추출

```bash
# 1. 새 Supabase 프로젝트 생성 (임시 복원용)
# Dashboard → New Project

# 2. 백업을 새 프로젝트에 복원
psql "postgresql://postgres:[NEW-PASSWORD]@db.[NEW-PROJECT-REF].supabase.co:5432/postgres" \
  -f full_backup.sql

# 3. 특정 테이블만 추출
pg_dump \
  --table=users \
  --data-only \
  --column-inserts \
  "postgresql://postgres:[NEW-PASSWORD]@db.[NEW-PROJECT-REF].supabase.co:5432/postgres" \
  > users_only.sql

# 4. 원본 프로젝트에 적용
# 주의: 중복 키 충돌 처리 필요
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" << 'EOF'
-- 복원 전 충돌 처리 (예: 삭제된 행만 복원)
BEGIN;

-- 임시 테이블에 백업 데이터 로드
CREATE TEMP TABLE users_restore AS SELECT * FROM users WHERE FALSE;

\i users_only.sql  -- 백업 데이터를 임시 테이블에 INSERT

-- 실제 테이블에 없는 행만 삽입
INSERT INTO users
SELECT * FROM users_restore
WHERE id NOT IN (SELECT id FROM users);

COMMIT;
EOF
```

#### 방법 B: 로직 복제(Logical Replication) 활용 (고급)

```sql
-- 복원할 테이블의 변경 내역을 WAL에서 디코딩
-- pg_logical_slot_get_changes 활용 (고급 기능, 별도 설정 필요)
SELECT * FROM pg_logical_slot_get_changes(
  'my_slot',
  NULL,
  NULL,
  'add-tables', 'public.users'
);
```

---

### 2-5. 백업 다운로드 및 로컬 복원

로컬 개발 환경에서 프로덕션 데이터를 복원하여 디버깅하는 경우에 유용하다.

```bash
# 1. 백업 파일 다운로드 (Dashboard 또는 CLI)
supabase db dump \
  --project-ref [PROJECT-REF] \
  -f prod_backup.sql

# 2. 로컬 Supabase 시작
supabase start

# 3. 로컬 DB에 복원
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
  -f prod_backup.sql

# 또는 Supabase 로컬 개발 가이드를 따른 복원
# https://supabase.com/docs/guides/local-development/restoring-downloaded-backup
supabase db reset
```

---

## 3. 재해 복구 계획 (DRP)

---

### 3-1. RTO / RPO 정의

| 지표 | 정의 | 목표 설정 기준 |
|------|------|--------------|
| **RTO** (Recovery Time Objective) | 장애 발생부터 서비스 복구까지 허용 최대 시간 | 비즈니스 임팩트 기반 (예: 쇼핑몰 = 4시간) |
| **RPO** (Recovery Point Objective) | 복구 후 허용되는 최대 데이터 손실 기간 | 데이터 변경 빈도 기반 (예: 1시간) |

**Supabase 플랜별 실질적 RTO/RPO**:

| 플랜 | RPO (최악 시나리오) | RTO (예상) | 비고 |
|------|------------------|------------|------|
| Free | 모든 데이터 손실 가능 | 수 시간 | 수동 백업 없으면 복원 불가 |
| Pro (일별 백업) | 최대 24시간 데이터 손실 | 1-4시간 | 백업 시점 이후 변경 사항 손실 |
| Pro + PITR | 수 초 ~ 수 분 | 1-4시간 | 가장 정밀한 복원 |
| Team + PITR | 수 초 ~ 수 분 | 1-2시간 | 더 빠른 지원 SLA |
| Enterprise | 협의 (SLA 계약) | 계약 기반 | 전담 지원 |

> Supabase는 RTO/RPO에 대한 공식 SLA를 Pro/Team 수준에서는 명시하지 않는다. Enterprise 계약에서만 공식 SLA가 제공된다. 중요 서비스는 멀티 리전 전략이나 Enterprise를 고려해야 한다.

---

### 3-2. 플랜별 DR 능력 비교

```
Free 플랜 DR 능력:
  [낮음] 수동 백업만 가능, 복원 자동화 없음
  권장: 최소 일별 cron으로 pg_dump + S3 저장

Pro 플랜 DR 능력:
  [중간] 일별 자동 백업 + 선택적 PITR
  권장: PITR 활성화 + 수동 백업 병행

Team 플랜 DR 능력:
  [높음] 14일 일별 백업 + PITR + 지원 SLA
  권장: 읽기 복제본 추가로 고가용성 구성

Enterprise DR 능력:
  [최고] 30일+ 백업 + PITR + 멀티 리전 + 전담 SLA
  권장: 전담 솔루션 아키텍처 협의
```

---

### 3-3. 멀티 리전 전략 (읽기 복제본)

Supabase 읽기 복제본(Read Replica)은 **Pro 이상** 플랜에서 사용할 수 있으며, 다른 리전에 읽기 전용 데이터베이스를 배포하여 지연 감소와 재해 복구에 활용한다.

#### 읽기 복제본 설정

1. Dashboard → **Database** → **Read Replicas**
2. **Create read replica** 클릭
3. 리전 선택 (예: ap-northeast-2 → ap-southeast-1)
4. 컴퓨트 크기 선택 후 확인

#### 읽기 복제본 활용 패턴

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Primary (쓰기)
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Read Replica (읽기 전용, 다른 리전)
export const supabaseReplica = createClient(
  process.env.SUPABASE_REPLICA_URL!,  // 읽기 복제본 URL
  process.env.SUPABASE_ANON_KEY!
);

// 사용 예시: 읽기는 복제본, 쓰기는 Primary
export async function getPosts() {
  const { data } = await supabaseReplica.from('posts').select('*');
  return data;
}

export async function createPost(data: NewPost) {
  const { data: post } = await supabase.from('posts').insert(data).single();
  return post;
}
```

> **2025년 4월부터**: Supabase는 Data API 요청에 대해 **지오 라우팅(Geo-routing)** 을 적용한다. 클라이언트와 가장 가까운 읽기 복제본으로 자동 라우팅되므로, 글로벌 서비스에서 지연 시간을 크게 줄일 수 있다.

#### 읽기 복제본 → 쓰기 승격 (장애 시)

현재 Supabase 관리형 서비스에서는 읽기 복제본을 Primary로 **자동 승격**하는 기능은 제공하지 않는다. 이 기능이 필요하다면:
1. Enterprise 계약에서 Supabase 팀과 협의
2. 셀프호스팅으로 직접 PostgreSQL 복제본 승격 관리
3. 새 프로젝트를 읽기 복제본 백업에서 복원하는 수동 절차 수행

---

## 4. 장애 시나리오별 대응

---

### 4-1. 시나리오 1: 데이터 삭제 실수 (사용자/관리자)

**증상**: SQL Editor에서 실수로 `DELETE FROM users WHERE id = ...` 실행, 또는 잘못된 조건으로 대량 삭제

**즉시 대응**:

```sql
-- 1. 현재 접속 세션 확인 및 위험 세션 종료
SELECT pid, usename, application_name, state, query
FROM pg_stat_activity
WHERE state != 'idle';

-- 특정 세션 강제 종료
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid = [PID];

-- 2. 추가 변경 방지 (읽기 전용 모드로 전환 불가능하면 RLS 강화)
-- 임시 조치: 모든 테이블 UPDATE/DELETE 차단
REVOKE UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
```

**복원 절차**:

```
PITR 있는 경우:
  1. 삭제 발생 시각 확인 (로그 분석)
  2. 삭제 직전 시점으로 PITR 복원 요청
  3. 삭제 시점 이후 생성된 데이터 별도 백업 후 수동 적용

일별 백업만 있는 경우:
  1. 가장 최근 일별 백업 복원
  2. 복원 후 ~ 장애 발생 전까지의 데이터 손실 감수 또는 수동 복구
```

**사후 조치**:

```sql
-- Soft Delete 패턴 도입 (물리 삭제 대신 논리 삭제)
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- RLS 정책에 deleted_at IS NULL 조건 추가
CREATE POLICY "users_not_deleted"
  ON users FOR SELECT
  USING (deleted_at IS NULL AND auth.uid() = id);

-- 감사 로그 테이블 생성
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  operation   TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  row_id      uuid,
  old_data    JSONB,
  new_data    JSONB,
  changed_by  uuid REFERENCES auth.users(id),
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 트리거로 자동 감사 로그
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (table_name, operation, row_id, old_data, new_data, changed_by)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER users_audit
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

---

### 4-2. 시나리오 2: 스키마 변경 실수

**증상**: `DROP COLUMN`, `ALTER TABLE`, `DROP TABLE` 등 잘못된 DDL 실행

**예방 조치**:

```sql
-- 1. 마이그레이션 전 항상 현재 상태 백업
-- CI/CD 파이프라인에 통합 권장

-- 2. 컬럼 삭제는 절대 즉시 하지 않는다 (3단계 접근법)
-- Step 1: 컬럼을 코드에서 참조하지 않도록 업데이트 (배포)
-- Step 2: 컬럼에 NOT NULL 제약 제거, 기본값 NULL 허용 (배포)
-- Step 3: 일정 기간 후 실제 컬럼 삭제 (보통 2주 이상)

-- 나쁜 예: 즉시 삭제
ALTER TABLE users DROP COLUMN phone;

-- 좋은 예: 단계적 삭제
-- Step 1: 코드 업데이트 후
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Step 2: 2주 후
ALTER TABLE users DROP COLUMN phone;
```

**복원 절차**:

```bash
# PITR로 DDL 실수 직전 시점 복원
# → Dashboard → Backups → Point in Time → 시간 선택

# 또는 백업 파일에서 스키마만 추출하여 적용
grep -A 50 "CREATE TABLE users" backup.sql > recover_users_schema.sql
```

---

### 4-3. 시나리오 3: Supabase 플랫폼 장애

**증상**: Supabase API/DB에 접근 불가, 서비스 전체 중단

**모니터링 설정**:

```bash
# Supabase Status 페이지 RSS 구독
# https://status.supabase.com/
# → Subscribe to Updates 클릭

# 또는 Better Uptime, Uptime Robot 등 모니터링 서비스에 등록
# 엔드포인트: https://[PROJECT-REF].supabase.co/rest/v1/
```

**즉시 대응**:

1. [status.supabase.com](https://status.supabase.com) 확인
2. Supabase Discord `#status` 채널 확인
3. 플랫폼 장애라면: 복구 기다림 (일반적으로 빠른 복구)
4. 장기 장애라면: 읽기 전용 모드 전환 고려

```typescript
// 장애 시 읽기 전용 페이지 표시 (Next.js)
// middleware.ts
export function middleware(request: NextRequest) {
  const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
  
  if (MAINTENANCE_MODE && !request.nextUrl.pathname.startsWith('/maintenance')) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }
}
```

**사후 조치 (멀티 리전 구성)**:

- 중요 읽기 쿼리는 캐시 레이어(Redis, Vercel KV 등) 적용
- CDN 엣지에 정적 폴백 페이지 배포
- 주요 집계 데이터는 별도 캐시에 저장하여 DB 장애 시도 서비스 가능하도록 설계

---

### 4-4. 시나리오 4: 보안 침해 대응

**증상**: Service Role Key 유출, 비인가 접근 감지, 대량 데이터 유출

**즉시 대응 (골든 아워 내)**:

```
T+0분:  침해 인지
T+5분:  Service Role Key 즉시 재생성
        → Dashboard → Settings → API → Service role key → Regenerate
T+10분: JWT Secret 재생성 (모든 활성 세션 무효화)
        → Dashboard → Settings → API → JWT Secret → Generate new secret
T+15분: 의심 사용자 계정 비활성화
T+30분: 피해 범위 조사 시작
```

**키 재생성 후 영향 범위**:

```bash
# JWT Secret 재생성 시: 모든 활성 세션의 JWT가 즉시 무효화됨
# → 모든 로그인 사용자가 강제 로그아웃됨
# → 서버 사이드 서비스도 재시작 필요

# 환경변수 업데이트 후 재배포
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel redeploy --force
```

**감사 로그 분석**:

```sql
-- 최근 1시간 비정상 접근 패턴 조회
SELECT
  changed_by,
  table_name,
  operation,
  COUNT(*) AS count,
  MIN(changed_at) AS first_seen,
  MAX(changed_at) AS last_seen
FROM audit_logs
WHERE changed_at > NOW() - INTERVAL '1 hour'
GROUP BY changed_by, table_name, operation
HAVING COUNT(*) > 100  -- 비정상적으로 많은 작업
ORDER BY count DESC;

-- 대량 삭제/업데이트 탐지
SELECT *
FROM audit_logs
WHERE operation IN ('DELETE', 'UPDATE')
AND changed_at > NOW() - INTERVAL '24 hours'
ORDER BY changed_at DESC
LIMIT 1000;
```

**Supabase 보안 체크리스트**:

```sql
-- 1. RLS 활성화 여부 확인
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = false;  -- RLS 비활성화된 테이블 목록

-- 2. 불필요한 anon 정책 확인
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE 'anon' = ANY(roles)
ORDER BY tablename;

-- 3. Service Role 직접 접근 테이블 확인
-- (정책 없이 Service Role만 접근 가능한 테이블)
```

---

## 5. 복원 테스트 및 DR 드릴

---

### 5-1. 복원 테스트 주기 및 방법

**"테스트하지 않은 백업은 없는 것과 같다."**

| 테스트 유형 | 주기 | 방법 |
|-----------|------|------|
| 기본 복원 테스트 | 월 1회 | 새 Supabase 프로젝트에 백업 복원 후 검증 |
| PITR 복원 테스트 | 분기 1회 | 임의 시점 선택, 복원 후 데이터 일치 확인 |
| 전체 DR 드릴 | 반기 1회 | 프로덕션 장애 시나리오 모의 훈련 |
| 보안 침해 대응 훈련 | 연 1회 | 키 재생성 + 세션 무효화 + 복구 절차 전체 |

#### 월간 복원 테스트 스크립트

```bash
#!/bin/bash
# scripts/monthly-restore-test.sh

set -e

echo "=== 월간 백업 복원 테스트 시작 ==="
DATE=$(date +%Y%m%d)
TEST_PROJECT="restore-test-${DATE}"

# 1. 현재 백업 생성
echo "[1/5] 현재 DB 백업 생성..."
supabase db dump -f "/tmp/test_schema_${DATE}.sql"
supabase db dump -f "/tmp/test_data_${DATE}.sql" --data-only

# 2. 새 프로젝트 생성 (Supabase Management API 사용)
# 실제로는 Dashboard에서 수동 생성 후 PROJECT-REF 입력
echo "[2/5] 테스트용 프로젝트 준비 (수동 확인 필요)..."
read -p "테스트 프로젝트 REF 입력: " TEST_PROJECT_REF

# 3. 백업 복원
echo "[3/5] 스키마 복원..."
psql "postgresql://postgres:${TEST_DB_PASSWORD}@db.${TEST_PROJECT_REF}.supabase.co:5432/postgres" \
  -f "/tmp/test_schema_${DATE}.sql"

echo "[4/5] 데이터 복원..."
psql "postgresql://postgres:${TEST_DB_PASSWORD}@db.${TEST_PROJECT_REF}.supabase.co:5432/postgres" \
  -f "/tmp/test_data_${DATE}.sql"

# 4. 검증
echo "[5/5] 데이터 검증..."
ORIGINAL_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users;")
RESTORED_COUNT=$(psql "postgresql://postgres:${TEST_DB_PASSWORD}@db.${TEST_PROJECT_REF}.supabase.co:5432/postgres" \
  -t -c "SELECT COUNT(*) FROM users;")

if [ "$ORIGINAL_COUNT" = "$RESTORED_COUNT" ]; then
  echo "복원 검증 성공: users 테이블 ${RESTORED_COUNT}행 일치"
else
  echo "복원 검증 실패: 원본 ${ORIGINAL_COUNT}, 복원 ${RESTORED_COUNT}"
  exit 1
fi

echo "=== 복원 테스트 완료 ==="
echo "테스트 프로젝트 정리: Dashboard에서 ${TEST_PROJECT_REF} 프로젝트 삭제 필요"
```

---

### 5-2. DR 드릴 시나리오 및 체크리스트

#### 시나리오 A: 데이터 대량 삭제 복구 드릴

```
목표: 실수로 삭제된 1,000건 이상의 사용자 데이터를 1시간 내에 복구

단계:
1. [ ] 삭제 발생 시각 특정 (로그 조회)
2. [ ] PITR 복원 또는 일별 백업 중 선택
3. [ ] 복원 대상 프로젝트 결정 (현재 덮어쓰기 vs 새 프로젝트)
4. [ ] 복원 실행 및 진행 모니터링
5. [ ] 복원 후 데이터 검증
6. [ ] 서비스 재개
7. [ ] PIR (Post-Incident Review) 작성

소요 시간 목표: 60분 이내
```

#### 시나리오 B: 키 유출 대응 드릴

```
목표: Service Role Key 유출 후 30분 내 모든 접근 차단 및 서비스 복구

단계:
1. [ ] Service Role Key 재생성 (Dashboard)
2. [ ] JWT Secret 재생성 여부 결정 (필요 시)
3. [ ] 프로덕션 환경변수 업데이트
4. [ ] 서버/서비스 재시작
5. [ ] 새 키로 접근 테스트
6. [ ] 감사 로그 분석 (유출 기간 비인가 접근 여부)
7. [ ] 사용자 알림 여부 결정

소요 시간 목표: 30분 이내
```

---

### 5-3. 모니터링 알림 설정

#### Supabase 내장 모니터링

```sql
-- pg_cron으로 주기적 헬스 체크 (Supabase Pro 이상에서 pg_cron 사용 가능)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매 5분마다 DB 상태 체크
SELECT cron.schedule(
  'db-health-check',
  '*/5 * * * *',
  $$
  INSERT INTO monitoring_logs (check_type, status, message)
  SELECT
    'db_health',
    CASE WHEN COUNT(*) > 0 THEN 'ok' ELSE 'warning' END,
    'Active connections: ' || COUNT(*)::text
  FROM pg_stat_activity
  WHERE state != 'idle';
  $$
);
```

#### 외부 모니터링 (Uptime Robot / Better Uptime)

```javascript
// health-check API 엔드포인트 구성
// app/api/health/route.ts (Next.js)

import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const start = Date.now();
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // 간단한 쿼리로 DB 연결 확인
    const { error } = await supabase
      .from('health_checks')
      .select('id')
      .limit(1);
    
    if (error) throw error;
    
    return Response.json({
      status: 'ok',
      latency: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { status: 'error', message: String(err) },
      { status: 503 }
    );
  }
}
```

#### Slack 알림 연동

```typescript
// lib/alerting.ts
export async function sendAlert(message: string, severity: 'info' | 'warning' | 'critical') {
  const emoji = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }[severity];
  
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${emoji} [Supabase DR Alert] ${message}`,
      username: 'DR Monitor',
    }),
  });
}

// 백업 완료 알림
await sendAlert('일별 백업 완료: users 10,234건, posts 45,123건', 'info');

// 복원 테스트 실패 알림
await sendAlert('월간 복원 테스트 실패: users 테이블 레코드 불일치', 'critical');
```

---

## 6. 셀프호스팅 환경 DR

Supabase를 직접 서버에 배포하는 경우, 백업과 DR은 완전히 직접 관리해야 한다. `docker-compose`로 배포된 Supabase 셀프호스팅 환경을 기준으로 설명한다.

---

### 6-1. WAL-G 설정

WAL-G는 PostgreSQL WAL 파일을 S3, GCS, Azure Blob 등에 연속적으로 백업하는 오픈소스 도구다.

```bash
# WAL-G 설치 (Ubuntu)
curl -L https://github.com/wal-g/wal-g/releases/latest/download/wal-g-pg-ubuntu-20.04-amd64.tar.gz \
  | tar -xz -C /usr/local/bin

chmod +x /usr/local/bin/wal-g
```

```bash
# /etc/wal-g/config.yaml (WAL-G 설정)
cat > /etc/wal-g/config.yaml << 'EOF'
WALG_S3_PREFIX: s3://my-backup-bucket/walg
AWS_REGION: ap-northeast-2
AWS_ACCESS_KEY_ID: [ACCESS_KEY]
AWS_SECRET_ACCESS_KEY: [SECRET_KEY]
PGHOST: localhost
PGPORT: 5432
PGUSER: postgres
PGPASSWORD: [PASSWORD]
PGDATABASE: postgres
WALG_COMPRESSION_METHOD: brotli
WALG_DELTA_MAX_STEPS: 6  # 기본 베이스 백업 + 6개 증분
EOF
```

```bash
# postgresql.conf에 WAL 아카이빙 설정 추가
cat >> /etc/postgresql/15/main/postgresql.conf << 'EOF'
wal_level = replica
archive_mode = on
archive_command = 'wal-g wal-push %p'
archive_timeout = 60  # 60초마다 WAL 아카이브 강제 전환
EOF

# PostgreSQL 재시작
systemctl restart postgresql
```

```bash
# 베이스 백업 생성
wal-g backup-push /var/lib/postgresql/15/main

# 백업 목록 확인
wal-g backup-list

# 특정 시점 복원
wal-g backup-fetch /var/lib/postgresql/15/main LATEST
echo "restore_command = 'wal-g wal-fetch %f %p'" >> /var/lib/postgresql/15/main/recovery.conf

# cron으로 일별 베이스 백업 자동화
echo "0 3 * * * postgres /usr/local/bin/wal-g backup-push /var/lib/postgresql/15/main" \
  >> /etc/cron.d/walg-backup

# 오래된 백업 정리 (30일 이상)
wal-g delete retain FULL 30 --confirm
```

---

### 6-2. Barman (PostgreSQL 전용 백업 관리자)

Barman은 PostgreSQL 전용 백업 도구로, 기업 환경에서 널리 사용된다.

```bash
# 설치 (Ubuntu)
apt-get install barman barman-cli

# /etc/barman.conf
cat > /etc/barman/barman.conf << 'EOF'
[barman]
barman_home = /var/lib/barman
barman_user = barman
log_file = /var/log/barman/barman.log
log_level = INFO
compression = gzip
reuse_backup = link
backup_method = rsync

[supabase-db]
description = Supabase Self-Hosted PostgreSQL
conninfo = host=localhost user=barman dbname=postgres
backup_directory = /var/lib/barman/supabase-db
backup_compression = gzip
retention_policy = RECOVERY WINDOW OF 14 DAYS
EOF
```

```bash
# Barman 연결 테스트
barman check supabase-db

# 즉시 백업
barman backup supabase-db

# 백업 목록
barman list-backup supabase-db

# 특정 시점 복원
barman recover supabase-db latest /var/lib/postgresql/15/main \
  --target-time "2026-04-05 14:30:00"

# 백업 유효성 검사
barman check-backup supabase-db latest
```

---

### 6-3. 읽기 복제본 승격 (Failover)

셀프호스팅 환경에서는 Primary 장애 시 Standby 서버를 Primary로 승격할 수 있다.

```bash
# PostgreSQL Streaming Replication 설정 (Primary)
# postgresql.conf
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB

# pg_hba.conf (복제 허용)
# host replication replicator [STANDBY-IP]/32 md5

# Standby 서버 초기화
pg_basebackup \
  -h [PRIMARY-HOST] \
  -U replicator \
  -D /var/lib/postgresql/15/main \
  -P \
  -Xs \
  -R  # recovery.conf 자동 생성
```

```bash
# Primary 장애 감지 시 Standby 승격
# /var/lib/postgresql/15/main/standby.signal 파일 삭제 후
# postgresql.conf의 primary_conninfo 제거
# PostgreSQL 재시작

# 또는 pg_ctl 사용
sudo -u postgres pg_ctl promote -D /var/lib/postgresql/15/main

# 승격 확인
psql -U postgres -c "SELECT pg_is_in_recovery();"
# false = Primary로 승격 완료
```

```bash
# Patroni (자동 HA 관리자) 설치 - 자동 failover 권장
pip install patroni[etcd]

# /etc/patroni/config.yml
cat > /etc/patroni/config.yml << 'EOF'
scope: supabase-cluster
name: pg-primary

restapi:
  listen: 0.0.0.0:8008

etcd:
  hosts: [etcd-host]:2379

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576  # 1MB

postgresql:
  listen: 0.0.0.0:5432
  connect_address: [THIS-SERVER-IP]:5432
  data_dir: /var/lib/postgresql/15/main
  pgpass: /tmp/pgpass
  authentication:
    replication:
      username: replicator
      password: [REPLICATION-PASSWORD]
    superuser:
      username: postgres
      password: [POSTGRES-PASSWORD]
EOF

# Patroni 시작
patroni /etc/patroni/config.yml
```

---

### 6-4. 셀프호스팅 DR 체크리스트

```
일별 확인:
  [ ] WAL 아카이빙 상태 정상 (wal-g backup-list)
  [ ] 복제 지연 확인 (SELECT * FROM pg_stat_replication;)
  [ ] 디스크 사용량 확인 (백업 저장소 포함)

주간 확인:
  [ ] 테스트 서버에 백업 복원 테스트
  [ ] Barman/WAL-G 백업 유효성 검사
  [ ] Patroni 상태 확인

월간 확인:
  [ ] 전체 DR 복원 테스트
  [ ] 복제본 승격 테스트 (Staging 환경)
  [ ] 백업 보존 정책 및 스토리지 비용 검토

분기 확인:
  [ ] DR 계획 문서 업데이트
  [ ] RTO/RPO 달성 가능 여부 재평가
  [ ] 팀 DR 훈련 실시
```

---

## 빠른 참조: 장애 유형별 대응표

| 장애 유형 | 즉시 조치 | 복구 방법 | 예방 조치 |
|----------|----------|----------|----------|
| 데이터 실수 삭제 | 추가 변경 차단 | PITR 복원 | Soft Delete + 감사 로그 |
| 스키마 실수 변경 | 서비스 읽기 전용 | PITR 복원 | 단계적 DDL 변경 정책 |
| 보안 키 유출 | 키 즉시 재생성 | 세션 무효화 + 재배포 | 환경변수 관리 강화 |
| 플랫폼 전체 장애 | Status 페이지 확인 | 플랫폼 복구 대기 | 캐시 레이어 + 폴백 페이지 |
| DB 연결 불가 | Connection Pooler 확인 | 직접 연결로 전환 | 모니터링 알림 설정 |
| 스토리지 파일 손실 | 접근 차단 | S3 복사본에서 복원 | rclone 자동 백업 |

---

## 참고 자료

- [Supabase Database Backups 공식 문서](https://supabase.com/docs/guides/platform/backups)
- [Point-in-Time Recovery 공식 문서](https://supabase.com/blog/postgres-point-in-time-recovery)
- [PITR 사용량 관리](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery)
- [Supabase CLI Backup & Restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Read Replicas 공식 문서](https://supabase.com/docs/guides/platform/read-replicas)
- [Supabase Database Backups Features](https://supabase.com/features/database-backups)
- [셀프호스팅 백업 복원](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [자동 백업 (GitHub Actions)](https://supabase.com/docs/guides/deployment/ci/backups)
- [WAL-G GitHub](https://github.com/wal-g/wal-g)
- [Barman 공식 문서](https://pgbarman.org/)
