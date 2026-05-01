# 인수인계서 — 세션 73 (R2 UI 분기 + 다운로드 redirect + CORS 자동화 스크립트)

> 작성일: 2026-05-01
> 이전 세션: [session72](./260501-session72-r2-v1-applied.md) (R2 V1 옵션 A 백엔드 적용 + commit 275464c)
> 저널: [logs/journal-2026-05-01.md](../logs/journal-2026-05-01.md) §"## 세션 73"

---

## 작업 요약

세션 72 next-dev-prompt §S72-A의 line 3~5 (다운로드 라우트 / UI 50MB 분기 / 진행률) 직행. R2 백엔드는 세션 72에 살아있었지만 **UI/다운로드 미연결** 상태였음. 본 세션이 그 게이트만 닫음.

핵심 변경:
1. **`FileUploadZone` 50MB 임계점 자동 분기** — 50MB 이하 = 기존 multipart, 초과 = presigned PUT → R2 직업로드 → confirm. **`XMLHttpRequest.upload.onprogress` 로 실제 진행률 % 표시** (기존은 60% 펄스 페이크).
2. **다운로드 라우트 storageType 분기** — `getFileForDownload` 가 R2 파일을 `filePath=null` 로 반환, 라우트가 `presignR2GetUrl(...)` + `NextResponse.redirect(url, 302)` 로 R2 직다운로드 (Cloudflare Tunnel 우회 → 진짜 100MB body limit 회피).
3. **`presignR2GetUrl` ResponseContentDisposition 옵션 확장** — 한국어 파일명 RFC 5987 attachment 헤더 보존 (R2 가 응답 시 그대로 set 함).
4. **`deleteFile` 분기** — R2 파일은 DB row 만 삭제, 물리 unlink skip. 단 R2 객체는 잔존 — 다음 PR에서 `deleteR2Object()` 추가 필요 (TODO 코드 주석 명시).
5. **`scripts/r2-cors-apply.mjs` 자동화 스크립트** — origins 2개 (`https://stylelucky4u.com`, `http://localhost:3000`) × methods PUT/GET/HEAD × MaxAge 1h. **현재 토큰이 Object 전용이라 적용 시 AccessDenied(403)** — 콘솔 작업으로 우회 (아래 §"검증 보류 → 운영자 작업" 참고).

---

## 대화 다이제스트

### 토픽 1: 베이스라인 파악 — UI/다운로드 미적용 확인

next-dev-prompt §S72-A 의 line 3~5 → 기존 코드 확인:
- `src/components/filebox/file-upload-zone.tsx` — `/api/v1/filebox/files` multipart POST 만, 50MB 분기 없음
- `src/app/api/v1/filebox/files/[id]/route.ts` — `fs.readFile(result.filePath)` 무조건 → R2 파일은 ENOENT
- `src/lib/filebox-db.ts` `getFileForDownload` — `fs.access` 무조건

서버측 `MAX_FILE_SIZE = 50MB` (validateFile) 가 50MB 초과를 reject. 따라서 50MB+ 파일은 R2 라우트로 우회해야 함.

### 토픽 2: TaskCreate 5건 등록 → 순차 진행

① 현황 파악 → ② UI 50MB 분기 → ③ 다운로드 storageType 분기 → ④ 빌드+배포+헬스체크 → ⑤ commit + 인수인계

자율 실행 정책 준수 (분기 질문 0).

### 토픽 3: UI 분기 — XHR 진행률

`upload(File, folderId, onProgress)` 내부 분기:
- `file.size > LOCAL_THRESHOLD (50MB)` → `uploadR2()`: presigned URL 발급 → R2 PUT (`xhr.upload.onprogress` 추적) → confirm
- 그 외 → `uploadLocal()`: multipart POST (XHR 으로 통일, 진행률 동일하게 표시)
- `file.size > R2_MAX_SIZE (5GB)` → 사전 reject

**Content-Type 양쪽 일치 필수** — presigned URL 서명에 포함되는 항목. `file.type || "application/octet-stream"` fallback 을 presign 요청과 R2 PUT 헤더 양쪽에서 동일하게 사용.

### 토픽 4: 다운로드 라우트 redirect 분기

`getFileForDownload` 가 R2 파일에 대해 `{ filePath: null, metadata: file }` 반환 (return 타입 union 화). 라우트:
```ts
if (result.metadata.storageType === "r2") {
  const url = await presignR2GetUrl(storedName, 600, {
    responseContentDisposition: `attachment; filename*=UTF-8''${encodedName}`,
  });
  return NextResponse.redirect(url, 302);
}
```
`<a download>` 의 same-origin 제약을 ResponseContentDisposition 의 `attachment` 디렉티브가 우회 — R2 가 응답에 헤더를 그대로 박아 브라우저가 다운로드로 처리.

### 토픽 5: 빌드 → tsc 에러 → prisma generate

첫 tsc 검증에서 `Property 'storageType' does not exist on type ...` 3건. 마이그레이션은 적용됐지만 **prisma generate 가 stale**. `npx prisma generate` 후 깨끗.

`wsl-build-deploy.sh` 풀 파이프라인 통과 (8/8) → PM2 ypserver 재시작 (pid 190213, online). `/api/v1/filebox/usage` 401 (인증 필요), `/api/v1/filebox/files/r2-presigned` 401 — 라우트 살아있음.

### 토픽 6: R2 CORS 자동화 시도 → AccessDenied → 콘솔 작업으로 분리

`scripts/r2-cors-apply.mjs` 에서 `PutBucketCorsCommand` 호출 → **AccessDenied (403)**. 현재 R2 토큰은 Object Read & Write 만 → bucket-level (CORS) 변경 불가.

스크립트는 보존 (admin 토큰 발급 시 즉시 사용 가능). 본 세션에선 콘솔 작업으로 운영자(=본인)에게 위임.

---

## 파일 변경 (본 세션 작성/수정)

```
[수정]
src/components/filebox/file-upload-zone.tsx  — 50MB 분기 + XHR 진행률 + 5GB cap
src/lib/filebox-db.ts                        — getFileForDownload R2 분기 (filePath: null) + deleteFile R2 분기
src/lib/r2.ts                                — presignR2GetUrl: responseContentDisposition 옵션 추가
src/app/api/v1/filebox/files/[id]/route.ts   — storageType='r2' → 302 redirect

[신규]
scripts/r2-cors-apply.mjs                    — R2 버킷 CORS 자동화 (admin 토큰 필요)
docs/handover/260501-session73-r2-ui-download.md  (본 인수인계)
```

---

## 검증 결과

| 항목 | 결과 |
|---|---|
| TypeScript `tsc --noEmit` | 0 에러 (prisma generate 후) |
| WSL 빌드 [1/8]~[8/8] | 통과 (Drizzle 0건 신규 / 스키마 검증 OK / PM2 restart) |
| PM2 ypserver online | ✓ pid 190213, mem 210mb |
| GET / | 307 (로그인 redirect — 정상) |
| GET /api/v1/filebox/usage | 401 (auth — 정상) |
| POST /api/v1/filebox/files/r2-presigned (no auth) | 401 (auth — 정상) |

---

## 검증 보류 → 운영자 작업

### A. R2 CORS 콘솔 적용 (1회성, ~3분)

현재 토큰 Object Read/Write 한정 → 자동 적용 불가. Cloudflare R2 콘솔 작업:

1. https://dash.cloudflare.com → R2 → `yangpyeon-filebox-prod` 버킷
2. Settings → CORS Policy → Add CORS policy → JSON 모드
3. 아래 JSON paste → Save:

```json
[
  {
    "AllowedOrigins": [
      "https://stylelucky4u.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

또는 admin 권한 토큰 발급 후 `node scripts/r2-cors-apply.mjs` 실행으로 자동화 가능.

### B. 50MB+ 브라우저 PUT 실측 (~5분)

CORS 적용 후 https://stylelucky4u.com/filebox 에서:
1. 60MB 이상 파일 드래그 → "R2" 라우트 표기 확인 → 진행률 % 실시간 갱신 → 업로드 완료 → 파일 목록에 등장
2. 다운로드 클릭 → 302 redirect → R2 endpoint 직접 응답 (Network 탭에서 확인) → 파일 받기

실패 시 상위 가능성: (1) CORS 정책 불일치, (2) Content-Type 헤더 불일치, (3) presigned URL 만료(300초).

### C. R2 파일 삭제 시 객체 잔존 → 별도 PR

`deleteFile()` 가 R2 파일은 DB row 만 삭제. R2 객체는 24h cleanup cron 또는 즉시 `deleteObject` 추가가 다음 단계. R2 quota 누적 발생.

---

## 다음 세션 (S74) 추천

1. **CORS 적용 후 브라우저 실측** (위 §B) — 5분
2. **R2 파일 삭제 시 deleteObject 호출** — 5줄 추가, `r2.ts` 에 `deleteR2Object(key)` + `filebox-db.deleteFile` 분기에서 호출. 같은 PR 에 24h pending cleanup cron 도 묶을 수 있음 (next-dev-prompt §S72-A line 6 의 30일 모니터링과 별개).
3. **Almanac aggregator 비즈니스 로직 이식** (~28h, P0-1) — 본 R2 트랙 종료 후 본격 시작.
4. **(옵션) R2 quota 표시 UI** — 현재 사용량 카드는 로컬 quota 만 표시. R2 quota 별도 표시 또는 통합. P2.

---

## 메모리 변경 0

본 세션은 새 메모리 패턴 발견 없음 — 기존 메모리(자율 실행 / .env 3계층 전파 / workspace 싱글턴 / kdyswarm 베이스라인) 모두 그대로 적용.

---

## 운영 상태 (세션 73 종료 시점)

- **PM2**: ypserver online (pid 190213) + cloudflared (pid 1280, 5d uptime) + pm2-logrotate
- **마이그레이션**: 28+1 (29) up to date — `20260501100000_add_file_storage_type` 적용됨 (세션 72)
- **R2 백엔드**: 라우트 3종 (presigned/confirm/[id] redirect) 살아있음
- **R2 프론트엔드**: 50MB 자동 분기 + XHR 진행률 적용
- **CORS**: 미적용 (운영자 콘솔 작업 대기)
- **첫 컨슈머 Almanac**: 백엔드 5 endpoint live, aggregator 로직 ~28h 대기 (변동 없음)
