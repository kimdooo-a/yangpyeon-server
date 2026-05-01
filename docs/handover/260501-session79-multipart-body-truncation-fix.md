# 인수인계서 — 세션 79 (S78-C 본진 검증 + multipart truncation 회귀 fix)

> 작성일: 2026-05-02 (세션 진행: 2026-05-01)
> 이전 세션: [session78](./260501-session78-multipart-upload-x1-server-proxy.md)
> 저널 원본: [journal-2026-05-01.md §"세션 79"](../logs/journal-2026-05-01.md)

---

## 작업 요약

세션 78 직후 운영자 71.3MB ZIP 1차 업로드 → PM2 err.log 의 `Request body exceeded 10MB for /api/v1/filebox/files/upload-multipart/part` 발견 → Next.js 16 standalone router-server proxy 의 default 10MB body clone limit 가 multipart 50MB part 를 silently truncate 하던 회귀 진단 → `next.config.ts` 에 `experimental.proxyClientMaxBodySize: '100mb'` 1 줄 추가 (commit `fd4d666`, +6/-0) → WSL 빌드+배포 → 운영자 동일 71.3MB 재업로드 PASS (DB 74,724,323 bytes + SeaweedFS 74,724,808 bytes, 정확 일치) → memory + handover 갱신 (commit `ff05a07`) → push.

S77~S79 3 세션에 걸친 검증 사슬 (auth-gate ping → architectural gap 발견 → multipart 라우트 신설 → infrastructure layer 회귀 발견 → fix → 결정적 검증) 완성.

## 대화 다이제스트

### 토픽 1: 세션 78 산출 요약 + 다음 행동 결정 위임
> **사용자**: (빈 메시지 — 세션 78 종료 직후 컨텍스트 자동 전달)

세션 78 종료 시점 상태가 컨텍스트로 남아 있었음. 미해결 P0 = S78-C (운영자 본인 60MB+ 실측, 자동화 불가). 자동화 가능한 후속 후보 표 제시 + 다음 행동 위임.

**결론**: S78-C 결과 대기 모드.

### 토픽 2: 운영자 71.3MB 1차 시도 → 회귀 발견
> **사용자**: "71.3mb 파일박스 업로드 실시함."

PM2 ypserver-err.log 확인 → `Request body exceeded 10MB for /api/v1/filebox/files/upload-multipart/part?...&partNumber={1,2}` 두 건 발견. 50MB part 가 10MB 로 truncate. SeaweedFS UploadPart 가 ETag/length mismatch 로 실패한 흐름 추정.

**결론**: s78 multipart 패치의 architectural gap. Next.js 16 신규 default 인지 못 함. 즉시 수정 결정.

### 토픽 3: body-streams.js 코드 수술 — 메커니즘 정확 파악
> **사용자**: (없음 — Claude 자율 진단)

`node_modules/next/dist/server/body-streams.js` + `next-server.js` + `router-server.js` + `config-shared.d.ts` 4 소스 read.

메커니즘:
1. `getCloneableBody(readable, sizeLimit)` 가 input stream 에 `data` listener 등록
2. middleware/proxy layer 가 `cloneBodyStream()` 호출 → input.on('data') fire → p1 (caller 반환), p2 (buffered 보관) 두 PassThrough 로 chunk 분기
3. `bytesRead > bodySizeLimit` 시 **p1, p2 둘 다 push(null) 조기 종료** + warning 발화
4. 핵심 함정: `finalize()` 가 호출되면 `replaceRequestBody(readable, buffered)` 로 **원본 request body 를 truncated p2 로 교체** (line 73)

설정 위치:
- `next-server.js:1274` — `attachRequestMeta` 가 모든 request 에 `bodySizeLimit = experimental.proxyClientMaxBodySize` (default 10MB) attach
- standalone 모드는 router-server (parent) → next-server (child) 2-process proxy 구조 → user middleware 없어도 fire

설정 이름 변천:
- 신규 권장: `experimental.proxyClientMaxBodySize`
- deprecated alias: `experimental.middlewareClientMaxBodySize` (warning 메시지 링크)
- 둘 다 set 시 throw

**결론**: 단순 경고가 아니라 데이터 손실 + 잘못된 동작 보장. fix = `experimental.proxyClientMaxBodySize: '100mb'` (route 의 MAX_PART_SIZE 와 동일값).

### 토픽 4: fix 적용 + tsc + WSL 빌드 + 배포

`next.config.ts` 6 줄 추가 (commit `fd4d666`):
```ts
experimental: {
  proxyClientMaxBodySize: '100mb',
},
```

코멘트 3 줄로 회귀 메커니즘 + setting 변천 + MAX_PART_SIZE 정합 명시.

검증:
- `npx tsc --noEmit` exit 0
- WSL `wsl-build-deploy.sh` 8 단계 PASS
- PM2 ypserver pid 210927 → 213048, ELF Linux x86-64, online 0s → 2s, 신규 에러 0
- 부팅 로그 20:33:56 KST

**결론**: fix 가 production binary 에 반영. 운영자 재시도 대기.

### 토픽 5: 운영자 2차 시도 + 결정적 검증
> **사용자**: "모두 진행했음 확인바람."

SeaweedFS data 디렉토리 inspection → `yangpyeon-filebox_8.dat = 74,724,808 bytes` 발견 (May 1 20:39, deploy 후 5.5분).

DB 측 `luckystyle4u.public.files`:
```sql
SELECT id, original_name, size, storage_type, created_at FROM files
WHERE size > 50000000 ORDER BY created_at DESC LIMIT 1;
-- 'dd9d1cc1-33ac-4beb-8678-3ebc0991df76', '260117 heath-infer-step01.zip',
-- 74724323, 'r2', '2026-05-01 11:39:23.499+09'
```

검증 결과:
- DB size = 74,724,323 bytes = client 원본 (multipart complete 후 정확한 합산)
- SeaweedFS volume size = 74,724,808 bytes = DB size + 485B (single needle metadata = part 단위 분리 저장이 아닌 단일 객체로 합쳐진 증거)
- created_at = deploy 후 5.5분 = 운영자 보고 시각 정확 일치
- 같은 파일명 (1차 시도와 동일) → 2차 시도가 정상 처리됐음을 의미
- ALS "Tenant context missing" 0건 (재시작 이후 신규 entry 없음)

**결론**: S78-C 결정적 검증 PASS. multipart 4 라우트 (init→part×2→complete) + ADR-033 X1 server proxy 가 본격 production 트래픽에서 정상 작동. s77~s79 3 세션 검증 사슬 완성.

### 토픽 6: memory + handover + commit + push

산출:
- `memory/reference_nextjs_proxy_body_limit.md` (신규) — 함정 메커니즘 baked-in
- `memory/MEMORY.md` 인덱스 1 행 추가
- `docs/handover/next-dev-prompt.md` — §"세션 79 종료" + §"세션 80 첫 작업" 신설
- `docs/status/current.md` — row 79 추가
- commit `ff05a07 docs(s79): S78-C 본진 검증 PASS + multipart body truncation fix 후속 갱신`
- push origin/spec/aggregator-fixes `50049c0..ff05a07` (다른 터미널의 `50049c0 docs(s78): /cs 의식` 위에 쌓임)

**결론**: 본 conversation /cs 진입.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | proxyClientMaxBodySize 100mb | (X1) 설정 100mb / (X2) streaming chunked / (X3) 별도 endpoint | X1 최단 (설정 1줄). X2 는 SeaweedFS UploadPart 가 ContentLength 명시 PUT 요구 → 부적합. X3 는 부수 코드 ↑. X1 채택, 100mb 는 route 의 MAX_PART_SIZE 와 동일값으로 정합성 유지. |
| 2 | proxyClientMaxBodySize (신규) vs middlewareClientMaxBodySize (deprecated alias) | warning 메시지가 deprecated alias 를 언급 / 신규 명 사용 | config-shared.d.ts:805~812 + config.js:617 확인 → 신규 권장 명을 사용. deprecated alias 는 warning 메시지의 잔존 링크일 뿐 두 키 동시 set 시 throw. |
| 3 | 결정적 검증 통과 후 commit 분리 | (A) 단일 commit / (B) fix + docs 분리 | B 채택. fix commit (`fd4d666`) 은 atomic, docs commit (`ff05a07`) 은 후속. revert 시 명확한 단위. |

## 수정 파일 (3개 + memory 2)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `next.config.ts` | `experimental.proxyClientMaxBodySize: '100mb'` 추가 (+6/-0, commit `fd4d666`) |
| 2 | `docs/handover/next-dev-prompt.md` | §"세션 79 종료" + §"세션 80 첫 작업" 신설 (+37/-29, commit `ff05a07`) |
| 3 | `docs/status/current.md` | row 79 추가 (+1/-0, commit `ff05a07`) |
| 4 | `~/.claude/projects/.../memory/reference_nextjs_proxy_body_limit.md` | (신규, 저장소 외) Next.js 16 standalone proxyClientMaxBodySize 함정 baked-in |
| 5 | `~/.claude/projects/.../memory/MEMORY.md` | (저장소 외) 인덱스 1 행 추가 |

/cs 산출 추가 (본 commit):
- `docs/logs/journal-2026-05-01.md` (세션 79 entries [1]~[8])
- `docs/logs/2026-05.md` (세션 79 entry)
- `docs/handover/260501-session79-multipart-body-truncation-fix.md` (본 파일, 신규)
- `docs/handover/_index.md` (row 79 추가)
- `docs/solutions/2026-05-02-nextjs16-standalone-proxy-body-truncation.md` (CK 신규)

## 상세 변경 사항

### 1. `next.config.ts` — proxyClientMaxBodySize 100mb 추가

```diff
+  // s79 추가: filebox multipart 50MB part 가 Next.js 16 standalone router-server proxy 의 default 10MB body clone limit 에 걸려 truncate 되는 회귀 차단.
+  // proxyClientMaxBodySize 미설정 시 router-server 의 cloneBodyStream → finalize() 가 잘린 buffer 로 원본 request body 를 replace 하여 route handler 가 truncated data 수신.
+  // MAX_PART_SIZE=100MB (route 자체 cap) 와 동일값으로 설정.
+  experimental: {
+    proxyClientMaxBodySize: '100mb',
+  },
```

코멘트로 회귀 메커니즘 baked-in. 향후 동일 함정 재발 시 수정 위치 즉시 파악 가능.

### 2. `docs/handover/next-dev-prompt.md` — 세션 79 종료 + 80 우선순위

`§"프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 79 종료)"` 신설 (8 항목 압축):
1. S78-C 1차 시도 (20:27 KST) 실패 + PM2 err.log 진단
2. 회귀 메커니즘 (Next.js 16 standalone router-server proxy + finalize() body replace)
3. fix 적용 (next.config.ts +6/-0)
4. WSL 빌드 + 배포 + PM2 재시작
5. S78-C 2차 시도 (20:39 KST) PASS (DB 74,724,323 + SeaweedFS 74,724,808)
6. 새 memory 등록
7. 검증 패턴 실증 (feedback_verification_scope_depth.md 작동 확인)
8. 세션 80 첫 작업 = S78-E (P0 본진) / S78-H (P1) / S78-D (P1 보너스)

`§"⭐ 세션 80 첫 작업 우선순위"` 신설 (테이블) + S78-C 완료 마킹.

### 3. `memory/reference_nextjs_proxy_body_limit.md` — 함정 baked-in

신규 reference memory:
- 메커니즘 (body-streams.js + next-server.js + router-server.js + config-shared.d.ts 4 위치)
- 증상 (warning 메시지 + 후속 ETag/length mismatch 에러)
- 처리 (`experimental.proxyClientMaxBodySize: '100mb'`)
- setting 이름 변천 (proxyClientMaxBodySize 신규 권장 / middlewareClientMaxBodySize deprecated alias)
- 검증된 임계 (50MB × 동시 3 환경에서 100MB cap 충분, peak 메모리 ~150MB)
- 연관 commit/CK 링크

## 검증 결과

- `npx tsc --noEmit` — exit 0 (에러 0개)
- `wsl-build-deploy.sh` 8 단계 — PASS (Linux ELF x86-64 검증, 마이그레이션 0건, 스키마 검증 PASS)
- PM2 ypserver pid 213048 — ONLINE (uptime 0s → 2s, ↺ 18, 신규 에러 0)
- 운영자 71.3MB 재업로드 — PASS:
  - DB `files.size = 74,724,323 bytes` (71.265 MB)
  - SeaweedFS `yangpyeon-filebox_8.dat = 74,724,808 bytes` (volume header 485B 포함)
  - `created_at = 2026-05-01 11:39:23.499+09 (= 20:39:23 KST)` (deploy 후 5.5분)
- ALS "Tenant context missing" — 0건 (재시작 이후 신규 entry 없음)

## 터치하지 않은 영역

- S78-E Almanac aggregator 본진 (~28h, 별도 트랙)
- S78-H multipart cleanup cron (P1, abandoned upload 회수, 별도 PR)
- S78-D 폰 모바일 드래그 실측 (P1 보너스)
- S78-I filer leveldb 전환 (P2, 50만 entry 도달 시)
- S78-J PM2 startup 자동화 (P2, 운영자 결정)
- 메신저 M2-Step1 (P0 Track B)
- 무관 untracked (`.claude/*`, `.kdyswarm/*`, `baas-foundation/05-*`)

## 알려진 이슈

- **s78 1차 시도 부산물**: SeaweedFS 측에 abandoned multipart upload 1건이 잔존할 가능성 (uploadId `b454b18044c8b013f53ae2e3e8a345da00d13ad1_abc6ecda9947492dbc5d26e14910ba89`). frontend 가 새 uploadId 로 init 하므로 기능적 영향 없으나, S78-H multipart cleanup cron 등록 시 회수 대상.
- **현재 SeaweedFS 측 GC 부재**: S78-H 가 처리되기 전까지 abandoned multipart 가 쌓일 수 있음. 1인 운영 + 50GB 용량 한계 상황에서는 단기 부담 미미.

## 다음 작업 제안

1. **S78-E Almanac aggregator 본진** (P0, ~28h): spec 의 10 모듈 multi-tenant adaptation 이식. `packages/tenant-almanac/aggregator/` (T2.5 plugin) 또는 `src/lib/aggregator/` (M3 게이트 이전 임시).
2. **S78-H multipart cleanup cron** (P1, ~30분): `s3.clean.uploads -timeAgo=24h` 명령 cron 등록 (주 1회). cron runner kind 확장 또는 별도 스케줄러. abandoned multipart upload 회수.
3. **S78-D 폰 모바일 드래그 실측** (P1 보너스, ~5분): c7f1c39 PointerEvent 마이그레이션 검증.
4. **메신저 M2-Step1** (P0 Track B, 병행 가능): `docs/research/messenger/m2-detailed-plan.md` §3 도메인 헬퍼 4개.
5. **추가 file size 검증**: 100MB 1 파일 / 200MB 1 파일 / 1GB 1 파일 등 edge case 추가 실측 (운영자 본인 작업, 자동화 불가).

---
[← handover/_index.md](./_index.md)
