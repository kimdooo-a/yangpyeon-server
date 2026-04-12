---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: storage
---

# 06. Storage

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Storage
Manage
Files

Analytics
New
Vectors

Configuration
S3

Files
General file storage for most types of digital content
Docs
Buckets
Settings
Policies
Search for a bucket

Sorted by created at

New bucket
Icon    Name    Policies    File size limit    Allowed MIME types    Actions
blog-images

Public
0

Unset (50 MB)

Any

Go to bucket details
```

## 드러난 UI / 기능 목록

- **Manage**:
  - Files — 일반 파일(버킷 기반)
  - Analytics (New) — 스토리지 분석 엔진(Iceberg/Parquet 기반 추정)
  - Vectors — 임베딩 벡터 스토리지(pgvector)
- **Configuration**:
  - S3 — S3 호환 프로토콜 노출 설정
- Files 영역: `General file storage for most types of digital content` + Docs 링크
- **Buckets / Settings / Policies** 탭
- 버킷 리스트 컬럼: Icon, Name, Policies(count), File size limit, Allowed MIME types, Actions
- 예시: `blog-images` / Public / 0 policies / Unset(50 MB) / Any / "Go to bucket details"
- `New bucket` 생성 버튼, `Search for a bucket`, `Sorted by created at`

## 추론되는 기술 스택

- **supabase/storage-api** (Node.js) — S3 뒷단, PG 메타데이터 저장
- **버킷(bucket)**: 최상위 컨테이너. Public/Private 플래그
- **Policies**: 버킷별 RLS 정책(INSERT/SELECT/UPDATE/DELETE)
- **MIME Type 제한 + 크기 제한**: 업로드 시 content-type 검증 + Content-Length 체크
- **Analytics(Iceberg)**: 로그/이벤트 데이터를 Parquet+Iceberg로 저장해 쿼리 가능한 "Storage Vectors" 형태
- **Vectors**: `pgvector` 확장 + Supabase CLI로 임베딩 인덱스 관리
- **S3 호환 프로토콜**: 기존 S3 SDK에서 그대로 사용 가능하게 endpoint/key 발급
- **이 프로젝트와의 차이**: 현재 파일박스는 **로컬 파일시스템 + Prisma Folder/File 트리**로 구현. 버킷/MIME 제한/Public 공유는 없음. S3 호환은 필요도 낮음.
