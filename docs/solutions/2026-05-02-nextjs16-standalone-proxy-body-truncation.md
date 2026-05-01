---
title: Next.js 16 standalone router-server proxy 가 모든 request body 를 default 10MB 로 silently truncate
date: 2026-05-02
session: 79
tags: [nextjs, nextjs-16, standalone-mode, body-streams, proxy, multipart-upload, body-truncation, cloneBodyStream, finalize, proxyClientMaxBodySize, middlewareClientMaxBodySize, router-server, infrastructure-regression, silent-data-loss]
category: bug-fix
confidence: high
---

## 문제

Next.js 16 standalone 모드 (`output: 'standalone'`) 로 배포된 ypserver 에서 50MB 부분(part) 단위 multipart upload 라우트 (`/api/v1/filebox/files/upload-multipart/part`) 를 호출하면, **route handler 내부의 `request.arrayBuffer()` 가 받은 body 가 10MB 로 잘려 있음**.

증상:
- PM2 stderr 로그: `Request body exceeded 10MB for /api/v1/filebox/files/upload-multipart/part?...&partNumber={1,2}. Only the first 10MB will be available unless configured.`
- route handler 내부 검증 (`buffer.length !== contentLength`) 또는 SeaweedFS `UploadPart` 호출 후 ETag mismatch / length mismatch 로 multipart complete 실패
- ≤50MB 로컬 POST (변경 없음) 와 ≤10MB 일반 JSON/form 라우트는 정상 동작 → 50MB+ binary upload 라우트만 깨짐
- frontend 진행률 100% 도달 후 "complete 단계에서 실패" 패턴

재현 조건:
- Next.js 16.x standalone 모드 (`output: 'standalone'`)
- middleware 또는 proxy/rewrite 가 직접/간접적으로 사용되는 경로
- 단일 request body > 10MB 인 라우트 (multipart binary upload, large form, large JSON 등)

## 원인

**Next.js 16 standalone 모드는 단순 packaging 옵션이 아니라 런타임 아키텍처 변경**이다. router-server (parent) → next-server (child) 의 2-process proxy 구조라 모든 request 가 cloneBodyStream 경로를 거친다.

**`node_modules/next/dist/server/body-streams.js`** 의 핵심 로직:

```js
// line 30: default 10MB
const DEFAULT_BODY_CLONE_SIZE_LIMIT = 10 * 1024 * 1024;

// line 52: getCloneableBody — 요청 stream 에 data listener 등록
function getCloneableBody(readable, sizeLimit) {
    let buffered = null;
    return {
        async finalize() {
            if (buffered) {
                replaceRequestBody(readable, buffered);  // ← KEY: 원본 request body 를 buffered 로 교체
                buffered = readable;
            }
        },
        cloneBodyStream() {
            const input = buffered ?? readable;
            const p1 = new PassThrough();
            const p2 = new PassThrough();
            const bodySizeLimit = sizeLimit ?? DEFAULT_BODY_CLONE_SIZE_LIMIT;
            input.on('data', (chunk) => {
                bytesRead += chunk.length;
                if (bytesRead > bodySizeLimit) {
                    console.warn('Request body exceeded ...');
                    p1.push(null); p2.push(null);  // ← KEY: BOTH p1 AND p2 조기 종료
                    return;
                }
                p1.push(chunk); p2.push(chunk);
            });
            buffered = p2;  // ← KEY: p2 가 finalize() 의 buffered 로 보관됨
            return p1;
        }
    };
}
```

**`node_modules/next/dist/server/next-server.js:1274`**:
```js
attachRequestMeta(req, parsedUrl, isUpgradeReq) {
    if (!isUpgradeReq) {
        const bodySizeLimit = this.nextConfig.experimental?.proxyClientMaxBodySize;
        addRequestMeta(req, 'clonableBody', getCloneableBody(req.originalRequest, bodySizeLimit));
        // ↑ 모든 request 에 attach. proxyClientMaxBodySize 미설정 시 default 10MB.
    }
}
```

**4-step 함정**:
1. router-server 가 모든 incoming request 에 대해 `getCloneableBody(req, 10MB)` 호출하여 `clonableBody` meta 설치
2. middleware 또는 proxy layer (router-server.js:377 등) 가 `cloneBodyStream()` 호출 → input.on('data') listener 가 fire 되며 p1 + p2 PassThrough 로 chunk 분기 시작
3. `bytesRead > 10MB` 시점에 warning 발화 + **p1 (caller 가 받은 stream) 과 p2 (buffered 로 보관) 둘 다 push(null) 로 조기 종료**
4. 이후 `finalize()` 가 호출되면 `replaceRequestBody(readable, buffered)` 로 **원본 request body 를 truncated p2 PassThrough 로 교체**. route handler 의 `request.arrayBuffer()` 또는 `await request.text()` 는 잘린 데이터 수신.

**핵심 함정**: warning 메시지 자체는 명시적이지만, "원본 request body 가 truncated PassThrough 로 replace 된다"는 부수효과는 비명시적. 메시지를 보고도 "그냥 경고겠지" 라고 넘기기 쉬움. 실제로는 데이터 손실 + 잘못된 동작 보장.

**user middleware 가 없어도 fire**: standalone 모드의 router-server.js 가 자체적으로 cloneBodyStream 경로를 사용. 사용자 코드만 봐서는 trigger 가 없어 보임.

## 해결

`next.config.ts` 의 `experimental` 섹션에 `proxyClientMaxBodySize` 추가:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // ... other config
  experimental: {
    proxyClientMaxBodySize: '100mb',  // 기본 10MB. binary upload 라우트의 최대 body size 와 동일하게 설정.
  },
};

export default nextConfig;
```

**값 결정 가이드**:
- 라우트 자체의 max payload 와 동일값 (예: 50MB part × 동시 3 의 경우 100MB cap)
- 너무 크게 설정해도 메모리는 stream 소비 시점에만 사용 (limit 자체가 메모리 예약은 아님)
- 단, 너무 크면 악의적 large request 로 인한 memory pressure 증가 가능 → 라우트별로 필요한 최소값 선택

**Setting 이름 변천 (Next.js 16)**:

| 이름 | 상태 | 비고 |
|------|------|------|
| `experimental.proxyClientMaxBodySize` | **신규 권장** | Next.js 16 정식 |
| `experimental.middlewareClientMaxBodySize` | deprecated alias | warning 메시지의 링크는 이 deprecated 명을 가리킴. 두 키 동시 set 시 throw (`config.js:617`). |

`config-shared.d.ts:805~812` 에서 타입 정의 + deprecated 마커 확인 가능.

**검증 절차**:
1. `npx tsc --noEmit` — type 체크 통과 확인 (`SizeLimit` 타입은 `'100mb'` / `100_000_000` 둘 다 허용)
2. `next build` (또는 standalone 빌드) — config 적용 확인
3. 실제 large body 요청 1회 결정적 검증 (운영자 본인 작업, 자동화 ping 으론 사각지대)
4. PM2 stderr 에서 `Request body exceeded` 메시지 사라짐 확인

## 교훈

1. **"standalone" 은 packaging 옵션이 아니라 아키텍처 변경**: router-server + next-server 2-process proxy 구조. 단일 process 모드와 default 동작이 달라질 수 있는 모든 영역 (body limit, header forwarding, timeout 등) 에 영향. 신규 setting 이 추가되면 standalone 환경에서 다시 검증 필수.

2. **Default 값의 silent 위험**: 10MB default 는 보통 form/JSON 한도로 합리적. 그러나 multipart binary upload 라우트는 이 가정 자체가 깨지는 영역. **신규 default 가 추가될 때 = 모든 binary route 재검증 트리거** 룰화 가치 있음.

3. **warning 메시지의 부수효과 비명시성**: "Request body exceeded 10MB. Only the first 10MB will be available unless configured" 만 봐서는 "걍 경고겠지" 로 읽힘. 실제로는 truncated stream 으로 원본 request body 를 replace 하는 destructive side effect. 향후 Next.js 가 문서/메시지를 보강하면 좋겠지만, 그 전까지는 본 CK 가 mental jump 보완.

4. **연쇄 함정 패턴** (s77 → s78 → s79 3 세션): 모두 동일 4-step 함정 (기능 X 추가 → X 자체 정확 → infrastructure layer silently 변형 → 표면 응답만 검증). 방어책 = "데이터 보존 검증" — 응답 status 가 아니라 client byte 가 server 까지 도달했는지 비교 (예: DB 저장된 size 가 client upload size 와 일치하는가). 자매 CK = `2026-05-01-verification-scope-depth-auth-gate-only-insufficient.md`.

5. **검증 시 실측 1건 우선**: 본 회귀는 9 라우트 ping smoke (s77 PHASE 4) 와 새 라우트 4 401 ping (s78 검증) 모두 통과. 사용자 본인의 실제 71.3MB 업로드 1회 = 결정적 발견 시점. **자동화 가능한 ping coverage 가 늘어나도 자동화 불가능한 결정적 검증 1건은 대체 불가** — PR 본문 또는 인수인계서에 "이 PR 은 사용자 X 작업 완료 시까지 결정적 검증 부재" 명시 룰화.

## 관련 파일

- `next.config.ts` (s79 fix 적용 위치)
- `node_modules/next/dist/server/body-streams.js` (회귀 메커니즘 핵심)
- `node_modules/next/dist/server/next-server.js:1274` (`attachRequestMeta` 가 모든 request 에 cloneBodyStream attach)
- `node_modules/next/dist/server/lib/router-server.js:377` (proxy 경로에서 cloneBodyStream 호출)
- `node_modules/next/dist/server/config-shared.d.ts:805-812` (타입 정의 + deprecated 마커)
- `src/app/api/v1/filebox/files/upload-multipart/part/route.ts` (회귀 영향 받은 라우트)
- `~/.claude/projects/.../memory/reference_nextjs_proxy_body_limit.md` (메모리 룰)
- `docs/solutions/2026-05-01-verification-scope-depth-auth-gate-only-insufficient.md` (자매 CK)
- commit `fd4d666 fix(filebox): proxyClientMaxBodySize 100mb` (s79 핵심 fix)
