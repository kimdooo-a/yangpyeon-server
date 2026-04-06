# 스토리지·파일 관리 기능 설계

> Wave 2+3 리서치 문서 · 작성일: 2026-04-06
> 상위: [platform-evolution-wave README](../README.md)

---

## 목차

1. [사용 시나리오 분석](#1-사용-시나리오-분석)
2. [파일 매니저 UI 설계](#2-파일-매니저-ui-설계)
3. [저장 전략](#3-저장-전략)
4. [API 설계](#4-api-설계)
5. [보안 설계](#5-보안-설계)
6. [파일 미리보기 시스템](#6-파일-미리보기-시스템)
7. [구현 복잡도 분석](#7-구현-복잡도-분석)
8. [구현 로드맵](#8-구현-로드맵)

---

## 1. 사용 시나리오 분석

### 1-1. 왜 파일 관리가 필요한가

서버 대시보드를 운영하다 보면 다음과 같은 상황이 반복된다:

```
시나리오 A: 설정 파일 수정
  - WSL2 서버의 nginx.conf 또는 PM2 ecosystem.config.js를 변경하고 싶다
  - 현재: SSH 접속 → 에디터 실행 → 저장 → 서비스 재시작
  - 개선: 브라우저에서 파일 탐색 → 인라인 편집 → 저장

시나리오 B: 로그 아카이브 다운로드
  - PM2 로그가 수십 MB로 쌓였다
  - 현재: SSH 접속 → scp/rsync로 복사
  - 개선: 브라우저에서 파일 선택 → 다운로드

시나리오 C: 배포 파일 업로드
  - 정적 파일이나 설정을 서버에 올려야 한다
  - 현재: WinSCP, SFTP 클라이언트 필요
  - 개선: 드래그앤드롭 업로드

시나리오 D: 로그 실시간 확인
  - 로그 뷰어는 PM2 로그만 보여준다
  - Nginx 에러 로그, 시스템 syslog도 보고 싶다
  - 개선: 허용된 경로의 임의 파일 tail 보기

시나리오 E: 임시 파일 관리
  - 서버 작업 중 생성된 임시 파일 목록 및 정리
  - 디스크 용량 초과 시 큰 파일 찾기
```

### 1-2. 우선순위 매트릭스

| 시나리오 | 빈도 | 보안 위험 | 구현 난이도 | 우선순위 |
|---------|------|----------|------------|---------|
| 로그 파일 조회/다운로드 | 높음 | 낮음 | 낮음 | **1순위** |
| 설정 파일 조회 | 중간 | 중간 | 낮음 | **2순위** |
| 파일 업로드 | 중간 | 높음 | 중간 | 3순위 |
| 설정 파일 편집 | 낮음 | 매우 높음 | 중간 | 4순위 |
| 인증서/키 파일 관리 | 낮음 | 매우 높음 | 중간 | 5순위 (별도 처리) |

### 1-3. 범위 제한 (보안 설계의 출발점)

파일 매니저는 **전체 파일시스템에 접근하는 것이 아니라** 미리 정의된 허용 경로(버킷)에만 접근한다.

```
허용 버킷 예시:
  /buckets/logs/      → /var/log/pm2/, ~/.pm2/logs/ 심볼릭 링크
  /buckets/configs/   → ~/dashboard/설정 파일들
  /buckets/uploads/   → ~/dashboard-uploads/ (업로드 전용 격리 공간)
  /buckets/backups/   → ~/backups/ (읽기 전용)

절대 허용하지 않는 경로:
  /etc/              → 시스템 설정
  /proc/             → 커널 인터페이스
  ~/.ssh/            → SSH 키
  /root/             → 루트 홈
  환경변수 파일 (.env, .env.local)
```

---

## 2. 파일 매니저 UI 설계

### 2-1. 전체 레이아웃

Supabase Storage의 2단 레이아웃을 참고:

```
┌─────────────────────────────────────────────────────────────────┐
│  스토리지                               [+ 업로드]  [새 폴더]   │
├──────────────────┬──────────────────────────────────────────────┤
│                  │ logs > pm2                                    │
│  버킷 목록       │                              [그리드] [리스트]│
│  ─────────────  ├────────────────────────────────────────────── │
│  📁 logs         │ 이름 ↑          크기     수정일      액션     │
│  📁 configs      ├────────────────────────────────────────────── │
│  📁 uploads      │ 📁 ..                                          │
│  📁 backups      │ 📄 dashboard-error.log  2.3 MB   어제 3시    [⋮]│
│                  │ 📄 dashboard-out.log    1.1 MB   방금 전     [⋮]│
│                  │ 📄 server-error.log     450 KB   3일 전      [⋮]│
│                  │                                               │
│                  │                                               │
│                  │           (빈 영역 → 드래그앤드롭 안내)        │
└──────────────────┴───────────────────────────────────────────────┘
```

### 2-2. 파일 컨텍스트 메뉴 (⋮)

```
┌──────────────────┐
│ 👁️ 미리보기        │
│ ⬇️ 다운로드        │
│ ✏️ 이름 변경       │
│ 📋 경로 복사       │
│ ──────────────── │
│ 🗑️ 삭제           │
└──────────────────┘
```

### 2-3. 파일 미리보기 패널 (오른쪽 슬라이드오버)

```
┌──────────────────────────────────────────────┐
│ dashboard-error.log            [다운로드] [×]│
├──────────────────────────────────────────────┤
│ 크기: 2.3 MB  ·  수정일: 2026-04-06 15:32   │
│ 타입: text/plain  ·  인코딩: UTF-8           │
├──────────────────────────────────────────────┤
│ [처음 1000줄 표시 중]  [전체 표시] [끝으로 ] │
├──────────────────────────────────────────────┤
│ 2026-04-06T15:31:44.231Z 0|dashboard  Error  │
│   Cannot read properties of undefined        │
│   at Object.handler (/home/user/dash/src...) │
│ 2026-04-06T15:31:44.232Z 0|dashboard  Error  │
│   ...                                        │
└──────────────────────────────────────────────┘
```

### 2-4. 업로드 UI

```
┌──────────────────────────────────────────────┐
│              파일 업로드                     │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │                                     │    │
│  │    📤                               │    │
│  │    파일을 드래그하거나 클릭하세요    │    │
│  │                                     │    │
│  │    최대 50MB · txt, log, json, yaml │    │
│  │    conf, toml, md 허용              │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  업로드 대기열                               │
│  ┌───────────────────────────────────────┐  │
│  │ config.yaml          1.2 KB  ████████│  │
│  │ nginx.conf           4.5 KB  ██░░░░░░│  │
│  └───────────────────────────────────────┘  │
│                           [취소]  [업로드]   │
└──────────────────────────────────────────────┘
```

### 2-5. 폴더 트리 탐색

버킷 선택 후 폴더 구조 탐색:

```typescript
// 경로 브레드크럼 컴포넌트
function Breadcrumb({ parts }: { parts: string[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight size={14} className="text-gray-500" />}
          {i === parts.length - 1 ? (
            <span className="text-gray-200">{part}</span>
          ) : (
            <button className="text-gray-400 hover:text-gray-200">{part}</button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
```

### 2-6. 그리드 뷰 vs 리스트 뷰

**리스트 뷰 (기본):**
```
이름 ▲         크기      수정일         타입
dashboard.log  2.3 MB   어제 15:32    텍스트
config.json    1.2 KB   3일 전         JSON
nginx.conf     4.5 KB   1주 전         텍스트
```

**그리드 뷰:**
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│    📄    │  │    📄    │  │    🔧    │
│          │  │          │  │          │
│dashboard │  │config    │  │nginx     │
│.log      │  │.json     │  │.conf     │
│ 2.3 MB   │  │ 1.2 KB   │  │ 4.5 KB   │
└──────────┘  └──────────┘  └──────────┘
```

그리드 뷰는 이미지 미리보기가 있을 때 유용하다. 텍스트/로그 파일 위주인 이 프로젝트는 **리스트 뷰를 기본**으로 하되 토글 지원.

### 2-7. 파일 타입 아이콘 매핑

```typescript
const FILE_ICONS: Record<string, string> = {
  '.log':   '📋',  // 로그
  '.txt':   '📄',  // 텍스트
  '.json':  '📊',  // JSON
  '.yaml':  '⚙️',  // YAML 설정
  '.yml':   '⚙️',
  '.conf':  '🔧',  // 설정 파일
  '.toml':  '🔧',
  '.ini':   '🔧',
  '.env':   '🔒',  // (표시만, 다운로드 차단)
  '.key':   '🔑',  // (접근 차단)
  '.pem':   '🔑',
  '.md':    '📝',  // 마크다운
  '.sh':    '⚡',  // 쉘 스크립트
  '.ts':    '🔷',  // TypeScript
  '.js':    '🟡',  // JavaScript
};
```

---

## 3. 저장 전략

### 3-1. 로컬 파일시스템 기반 (WSL2 환경 최적)

Supabase Storage는 S3를 백엔드로 쓰지만, 이 프로젝트는 WSL2 로컬 파일시스템을 직접 활용한다.

```
아키텍처:
  브라우저 ← HTTP → Next.js API Routes → Node.js fs 모듈 → WSL2 파일시스템

장점:
  - 추가 인프라 불필요 (S3, MinIO 등)
  - 지연 시간 극소 (로컬 I/O)
  - 백업: rsync 또는 cp 명령어로 충분
  - 셀프호스팅 철학에 부합

단점:
  - 서버 마이그레이션 시 파일도 같이 이동 필요
  - 수평 확장 불가 (단일 서버이므로 무관)
```

### 3-2. 버킷 구조 설계

```
~/dashboard-storage/           ← 스토리지 루트 (환경변수 STORAGE_ROOT)
├── logs/                      ← logs 버킷
│   ├── .bucket.json           ← 버킷 메타데이터
│   └── [심볼릭 링크 or 실제 파일]
├── configs/                   ← configs 버킷
│   ├── .bucket.json
│   └── [설정 파일들]
├── uploads/                   ← uploads 버킷
│   ├── .bucket.json
│   └── [업로드 파일들]
└── backups/                   ← backups 버킷 (읽기 전용)
    ├── .bucket.json
    └── [백업 파일들]
```

**버킷 메타데이터 (`.bucket.json`):**
```json
{
  "name": "logs",
  "description": "PM2 및 시스템 로그",
  "readOnly": true,
  "allowedExtensions": [".log", ".txt"],
  "maxFileSizeMB": 100,
  "realPath": "/home/user/.pm2/logs"
}
```

### 3-3. 심볼릭 링크 활용

로그 파일은 실제 경로가 분산돼 있다. 심볼릭 링크로 버킷에 연결:

```bash
# 설정 스크립트 (scripts/setup-storage.sh)
STORAGE_ROOT=~/dashboard-storage

mkdir -p $STORAGE_ROOT/logs
mkdir -p $STORAGE_ROOT/configs
mkdir -p $STORAGE_ROOT/uploads
mkdir -p $STORAGE_ROOT/backups

# PM2 로그 연결
ln -sf ~/.pm2/logs $STORAGE_ROOT/logs/pm2

# 대시보드 설정 연결
ln -sf ~/dashboard/ecosystem.config.js $STORAGE_ROOT/configs/ecosystem.config.js
ln -sf ~/dashboard/.env $STORAGE_ROOT/configs/.env  # ← .env는 UI에서 내용 숨김
```

### 3-4. 경로 탈출 방지 (Path Traversal 방어)

```typescript
import path from 'path';

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/home/user/dashboard-storage';

export function resolveSafePath(bucket: string, filePath: string): string | null {
  // 버킷 이름 검증
  if (!/^[a-z0-9-]+$/.test(bucket)) return null;

  const bucketRoot = path.join(STORAGE_ROOT, bucket);
  const requested = path.join(bucketRoot, filePath);

  // 경로 정규화 후 버킷 루트 하위인지 확인
  const resolved = path.resolve(requested);
  if (!resolved.startsWith(path.resolve(bucketRoot))) {
    console.warn(`경로 탈출 시도: ${filePath} → ${resolved}`);
    return null;
  }

  return resolved;
}

// 사용 예시
const safePath = resolveSafePath('logs', '../../../etc/passwd');
// → null (차단)

const safePath2 = resolveSafePath('logs', 'pm2/dashboard-error.log');
// → '/home/user/dashboard-storage/logs/pm2/dashboard-error.log' (허용)
```

### 3-5. 파일 메타데이터 캐싱

대용량 디렉토리에서 `fs.readdir` + `fs.stat` 반복 호출은 느리다. 간단한 메모리 캐시:

```typescript
interface FileMetaCache {
  entries: FileMeta[];
  cachedAt: number;
}

const metaCache = new Map<string, FileMetaCache>();
const CACHE_TTL_MS = 5000; // 5초

export async function listFiles(bucket: string, subPath: string): Promise<FileMeta[]> {
  const key = `${bucket}:${subPath}`;
  const cached = metaCache.get(key);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.entries;
  }

  const safePath = resolveSafePath(bucket, subPath);
  if (!safePath) throw new Error('잘못된 경로');

  const entries = await readDirWithMeta(safePath);
  metaCache.set(key, { entries, cachedAt: Date.now() });
  return entries;
}
```

---

## 4. API 설계

### 4-1. 엔드포인트 목록

```
파일 매니저 API:

GET    /api/storage/buckets                   — 버킷 목록
GET    /api/storage/[bucket]                  — 버킷 루트 파일 목록
GET    /api/storage/[bucket]/list?path=...    — 하위 경로 파일 목록
GET    /api/storage/[bucket]/download?path=.. — 파일 다운로드 (스트리밍)
GET    /api/storage/[bucket]/preview?path=..  — 파일 미리보기 (텍스트 일부)
POST   /api/storage/[bucket]/upload?path=..   — 파일 업로드 (multipart)
DELETE /api/storage/[bucket]/delete?path=..   — 파일 삭제
PATCH  /api/storage/[bucket]/rename           — 이름 변경
POST   /api/storage/[bucket]/mkdir?path=..    — 폴더 생성
```

### 4-2. 버킷 목록 API

```typescript
// GET /api/storage/buckets
// 응답 예시:
{
  "buckets": [
    {
      "name": "logs",
      "description": "PM2 및 시스템 로그",
      "readOnly": true,
      "fileCount": 12,
      "totalSize": 15728640  // bytes
    },
    {
      "name": "configs",
      "description": "서버 설정 파일",
      "readOnly": false,
      "fileCount": 5,
      "totalSize": 20480
    }
  ]
}
```

### 4-3. 파일 목록 API

```typescript
// GET /api/storage/logs/list?path=pm2&sort=modified&order=desc&page=1&limit=50

// 응답:
{
  "path": "pm2",
  "bucket": "logs",
  "entries": [
    {
      "name": "dashboard-error.log",
      "path": "pm2/dashboard-error.log",
      "type": "file",
      "size": 2408448,
      "sizeHuman": "2.3 MB",
      "mimeType": "text/plain",
      "extension": ".log",
      "modifiedAt": "2026-04-06T15:32:00.000Z",
      "isReadOnly": false
    },
    {
      "name": "pm2",
      "path": "pm2",
      "type": "directory",
      "size": 0,
      "modifiedAt": "2026-04-06T00:00:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "totalPages": 1
}
```

### 4-4. 파일 다운로드 API

```typescript
// GET /api/storage/logs/download?path=pm2/dashboard-error.log

export async function GET(
  request: NextRequest,
  { params }: { params: { bucket: string } }
) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path') || '';

  const safePath = resolveSafePath(params.bucket, filePath);
  if (!safePath) {
    return NextResponse.json({ error: '잘못된 경로' }, { status: 400 });
  }

  try {
    const stat = await fs.stat(safePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: '파일이 아닙니다' }, { status: 400 });
    }

    // 파일 스트리밍 (대용량 파일에 중요)
    const fileStream = createReadStream(safePath);
    const fileName = path.basename(safePath);

    return new Response(fileStream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '파일을 읽을 수 없습니다' }, { status: 404 });
  }
}
```

### 4-5. 파일 미리보기 API

```typescript
// GET /api/storage/logs/preview?path=pm2/dashboard.log&lines=1000&from=end

export async function GET(request: NextRequest, ...) {
  const lines = parseInt(searchParams.get('lines') || '500');
  const from = searchParams.get('from') || 'end'; // 'start' | 'end'

  // 최대 라인 제한 (서버 부하 방지)
  const MAX_LINES = 5000;
  const clampedLines = Math.min(lines, MAX_LINES);

  const safePath = resolveSafePath(bucket, filePath);
  if (!safePath) return errorResponse('잘못된 경로');

  // 민감 파일 차단
  const blocked = ['.env', '.key', '.pem', '.p12', '.pfx'];
  if (blocked.some(ext => safePath.endsWith(ext))) {
    return NextResponse.json({ error: '이 파일은 미리보기를 지원하지 않습니다' }, { status: 403 });
  }

  // tail 방식으로 마지막 N줄 읽기
  const content = from === 'end'
    ? await readLastLines(safePath, clampedLines)
    : await readFirstLines(safePath, clampedLines);

  return NextResponse.json({
    path: filePath,
    content,
    linesShown: content.length,
    truncated: /* 전체 줄 수 > clampedLines */,
  });
}
```

### 4-6. 파일 업로드 API

```typescript
// POST /api/storage/uploads/upload
// Content-Type: multipart/form-data

export async function POST(request: NextRequest, ...) {
  // uploads 버킷만 업로드 허용
  if (params.bucket !== 'uploads') {
    return NextResponse.json({ error: '업로드 불가 버킷' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const targetPath = formData.get('path') as string || '';

  // 검증
  const MAX_SIZE_MB = 50;
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `최대 ${MAX_SIZE_MB}MB 까지 업로드 가능합니다` }, { status: 413 });
  }

  const ALLOWED_EXTENSIONS = ['.log', '.txt', '.json', '.yaml', '.yml', '.conf', '.toml', '.md', '.sh'];
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: '허용되지 않는 파일 형식입니다' }, { status: 415 });
  }

  // 파일명 새니타이징
  const sanitizedName = file.name
    .replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
    .slice(0, 255);

  const safePath = resolveSafePath(params.bucket, path.join(targetPath, sanitizedName));
  if (!safePath) {
    return NextResponse.json({ error: '잘못된 경로' }, { status: 400 });
  }

  // 덮어쓰기 방지 (선택)
  const exists = await fileExists(safePath);
  if (exists) {
    // 타임스탬프 추가
    const ext = path.extname(sanitizedName);
    const base = path.basename(sanitizedName, ext);
    const newName = `${base}_${Date.now()}${ext}`;
    // ...
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(safePath, buffer);

  return NextResponse.json({ success: true, path: path.join(targetPath, sanitizedName) });
}
```

### 4-7. 파일 삭제 API

```typescript
// DELETE /api/storage/uploads/delete?path=config.json

export async function DELETE(request: NextRequest, ...) {
  // 읽기 전용 버킷 차단
  const bucketMeta = await getBucketMeta(params.bucket);
  if (bucketMeta.readOnly) {
    return NextResponse.json({ error: '읽기 전용 버킷입니다' }, { status: 403 });
  }

  const safePath = resolveSafePath(params.bucket, filePath);
  if (!safePath) return errorResponse('잘못된 경로');

  // 심볼릭 링크 삭제 금지 (원본 보호)
  const lstat = await fs.lstat(safePath);
  if (lstat.isSymbolicLink()) {
    return NextResponse.json({ error: '심볼릭 링크는 삭제할 수 없습니다' }, { status: 403 });
  }

  await fs.unlink(safePath);

  // 감사 로그
  writeAuditLog({
    action: 'FILE_DELETE',
    path: `${params.bucket}/${filePath}`,
    ip: extractClientIp(request.headers),
  });

  return NextResponse.json({ success: true });
}
```

---

## 5. 보안 설계

### 5-1. 위협 모델

```
위협 1: 경로 탈출 (Path Traversal) ← 최우선
  공격: /api/storage/logs/download?path=../../.env
  방어: path.resolve() + startsWith(bucketRoot) 검증

위협 2: 임의 파일 실행
  공격: .sh, .py 파일 업로드 후 PM2로 실행
  방어: 업로드 허용 확장자 화이트리스트
         실행 권한이 없는 디렉토리에 저장

위협 3: 대용량 파일 업로드 (DoS)
  방어: 크기 제한 (50MB), Rate Limiting

위협 4: 민감 파일 노출 (.env, .key, .pem)
  방어: 다운로드/미리보기 시 차단 목록 확인
         .env 파일은 버킷 연결 자체를 금지

위협 5: MIME 타입 스푸핑
  공격: 악성 HTML을 .txt로 업로드 → 다운로드 시 실행
  방어: Content-Disposition: attachment (항상)
         Content-Type: application/octet-stream
         X-Content-Type-Options: nosniff

위협 6: 업로드 폭탄 (많은 파일로 디스크 고갈)
  방어: 버킷별 최대 파일 수, 총 용량 제한
         Rate Limiting (업로드 횟수)
```

### 5-2. 민감 파일 차단 목록

```typescript
// src/lib/storage-security.ts

const BLOCKED_EXTENSIONS = new Set([
  '.env', '.env.local', '.env.production',
  '.key', '.pem', '.p12', '.pfx', '.crt', '.cer',
  '.jks', '.keystore',
]);

const BLOCKED_FILENAMES = new Set([
  '.env', '.env.local', '.htpasswd', 'id_rsa', 'id_ed25519',
  'authorized_keys', 'known_hosts',
]);

export function isBlockedFile(fileName: string): boolean {
  const base = path.basename(fileName).toLowerCase();
  const ext = path.extname(base).toLowerCase();

  return (
    BLOCKED_EXTENSIONS.has(ext) ||
    BLOCKED_FILENAMES.has(base) ||
    base.startsWith('.env')
  );
}
```

### 5-3. 감사 로그 연동

모든 파일 작업은 감사 로그에 기록:

```typescript
type StorageAction =
  | 'FILE_LIST'
  | 'FILE_DOWNLOAD'
  | 'FILE_PREVIEW'
  | 'FILE_UPLOAD'
  | 'FILE_DELETE'
  | 'FILE_RENAME'
  | 'DIR_CREATE';

// 파일 다운로드, 업로드, 삭제는 반드시 기록
// 목록 조회는 선택적 기록
```

### 5-4. 버킷별 접근 제어

```typescript
interface BucketPermissions {
  roles: ('admin' | 'viewer')[];  // 접근 가능한 역할
  actions: {
    list: boolean;
    preview: boolean;
    download: boolean;
    upload: boolean;
    delete: boolean;
    rename: boolean;
  };
}

const BUCKET_PERMISSIONS: Record<string, BucketPermissions> = {
  logs: {
    roles: ['admin', 'viewer'],
    actions: { list: true, preview: true, download: true, upload: false, delete: false, rename: false },
  },
  configs: {
    roles: ['admin'],
    actions: { list: true, preview: true, download: true, upload: true, delete: false, rename: false },
  },
  uploads: {
    roles: ['admin'],
    actions: { list: true, preview: true, download: true, upload: true, delete: true, rename: true },
  },
  backups: {
    roles: ['admin'],
    actions: { list: true, preview: true, download: true, upload: false, delete: false, rename: false },
  },
};
```

---

## 6. 파일 미리보기 시스템

### 6-1. 지원 파일 타입

```
텍스트 미리보기 (라인 넘버 포함):
  .log, .txt, .sh, .env (내용 마스킹)

코드 하이라이팅 (선택적):
  .json → 프리티 프린트 + 접기/펼치기
  .yaml, .yml → 구문 색상
  .ts, .js, .py → 코드 하이라이팅 (Prism.js 경량 번들)

이미지 미리보기:
  .jpg, .png, .gif, .svg → <img> 태그로 표시

지원 안 함 (다운로드만):
  .zip, .tar.gz, .gz → 다운로드 버튼만 제공
  .pdf → 다운로드 버튼만 제공 (브라우저 PDF 뷰어로 열기 옵션)
  .key, .pem → 차단
```

### 6-2. JSON 미리보기

```typescript
function JsonPreview({ content }: { content: string }) {
  let parsed: unknown;
  let parseError: string | null = null;

  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parseError = (e as Error).message;
  }

  if (parseError) {
    return (
      <div className="text-red-400 text-sm p-4">
        JSON 파싱 오류: {parseError}
        <pre className="mt-2 text-gray-300">{content}</pre>
      </div>
    );
  }

  return (
    <pre className="text-sm text-gray-300 overflow-auto p-4">
      {JSON.stringify(parsed, null, 2)}
    </pre>
  );
}
```

### 6-3. 대용량 파일 처리

```
파일 크기별 전략:
  < 100 KB  → 전체 내용 로드
  100 KB ~ 1 MB → 처음/끝 500줄만 로드, 중간 생략 표시
  > 1 MB    → 처음/끝 200줄만 로드, 전체 다운로드 유도
  > 50 MB   → 미리보기 차단, 다운로드만 제공

UI 표시:
  ┌────────────────────────────────────────┐
  │ [처음 200줄] ──── 2.3 MB 파일 ──────── │
  │ ... (중간 생략됨) ...                  │
  │ [마지막 200줄] 전체 보기: [다운로드]   │
  └────────────────────────────────────────┘
```

---

## 7. 구현 복잡도 분석

### 7-1. MVP (최소 기능 제품)

**공수: 약 8~10시간**

```
포함 기능:
  ✅ 버킷 목록 API
  ✅ 파일 목록 API (리스트 뷰만)
  ✅ 텍스트 파일 미리보기
  ✅ 파일 다운로드
  ✅ 파일 업로드 (단일 파일, uploads 버킷만)
  ✅ 경로 탈출 방지
  ✅ 민감 파일 차단
  ✅ 감사 로그 연동

제외 기능 (이후 단계):
  ❌ 폴더 생성/삭제
  ❌ 파일 이름 변경
  ❌ 드래그앤드롭 업로드
  ❌ 다중 파일 선택/일괄 작업
  ❌ 코드 하이라이팅
  ❌ 그리드 뷰
  ❌ 파일 인라인 편집
```

### 7-2. 풀 구현

**공수: 약 20~30시간**

```
MVP +
  ✅ 드래그앤드롭 업로드 (다중 파일)
  ✅ 폴더 생성
  ✅ 이름 변경
  ✅ 그리드 뷰
  ✅ 코드 하이라이팅 (JSON, YAML)
  ✅ 파일 인라인 편집 (설정 파일)
  ✅ 버킷별 접근 제어 (역할 기반)
  ✅ 업로드 진행 표시 (XMLHttpRequest)
  ✅ 파일 검색 (이름 기반)
  ✅ 정렬 (이름/크기/수정일)
  ✅ 파일 메타데이터 캐싱
```

### 7-3. 의존성 추가 목록

```
MVP:
  - 추가 없음 (Node.js 내장 fs 모듈 사용)
  - multer 또는 Next.js FormData API (업로드)

풀 구현 추가:
  - prismjs 또는 shiki (코드 하이라이팅, 경량)
  - react-dropzone (드래그앤드롭 업로드)
  - tailwind-merge (조건부 클래스 병합, 이미 사용 중일 수 있음)
```

### 7-4. 기존 코드와의 통합

```
기존 감사 로그 시스템 (src/lib/audit-log.ts):
  → 파일 작업에도 동일 함수 사용

기존 Rate Limiting (src/lib/rate-limit.ts):
  → /api/storage/* 엔드포인트에 별도 Rate Limit 추가
  → 업로드: 분당 10회, 다운로드: 분당 50회

기존 미들웨어 (src/middleware.ts):
  → /api/storage/* 인증 검증은 이미 커버됨
  → 역할 검증만 추가하면 됨

기존 사이드바:
  → '스토리지' 메뉴 항목 추가
  → /storage 라우트
```

---

## 8. 구현 로드맵

### Phase 1 — 파일 조회 (1~2시간)

```
목표: 기존 로그 파일을 브라우저에서 탐색하고 다운로드

1. STORAGE_ROOT 환경변수 설정
2. src/lib/storage.ts 작성
   - resolveSafePath()
   - listFiles()
   - readFilePreview()
3. /api/storage/[bucket]/list, /download, /preview API 작성
4. /storage 페이지 기본 UI (리스트 뷰)
5. 사이드바에 스토리지 메뉴 추가
```

### Phase 2 — 파일 업로드 (2~3시간)

```
목표: uploads 버킷에 파일 업로드

1. /api/storage/[bucket]/upload API 작성
2. 업로드 UI 컴포넌트
3. 파일 타입/크기 검증 (클라이언트 + 서버)
4. 업로드 진행 피드백
```

### Phase 3 — 파일 관리 (2~3시간)

```
목표: 이름 변경, 삭제, 폴더 생성

1. 삭제 API + 확인 모달
2. 이름 변경 API + 인라인 편집
3. 폴더 생성 API + UI
4. 다중 선택 + 일괄 삭제
```

### Phase 4 — 고급 기능 (4~5시간)

```
목표: 코드 하이라이팅, 드래그앤드롭, 검색

1. JSON/YAML 미리보기 향상
2. 드래그앤드롭 업로드
3. 파일명 검색
4. 정렬 기능
5. 그리드 뷰 전환
```

### Supabase Storage와의 설계 유사성

| Supabase Storage | 이 구현 |
|-----------------|---------|
| Buckets | ~/dashboard-storage/ 하위 폴더 |
| Objects | 실제 파일 |
| Policies | BUCKET_PERMISSIONS 설정 |
| Public/Private | readOnly 플래그 |
| Storage API | /api/storage/* |
| Supabase Dashboard UI | /storage 페이지 |
| S3-compatible API | - (로컬 파일시스템 직접 사용) |

> 참고: Supabase Storage Architecture
> https://supabase.com/docs/guides/storage/architecture
>
> OWASP File Upload Cheat Sheet
> https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

---

*작성: kdywave 리서치 에이전트 · 2026-04-06*
*이전 문서: [03-auth-management-evolution.md](./03-auth-management-evolution.md)*
*다음 문서: [05-realtime-log-events.md](./05-realtime-log-events.md)*
