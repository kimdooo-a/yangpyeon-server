---
title: Next.js standalone 모드 운용법 오해 — 세션 3 결정 역전 사례
date: 2026-04-19
session: 50
tags: [nextjs, standalone, deployment, pm2, wsl, nft, native-modules, session-reversal]
category: pattern
confidence: high
---

## 문제

세션 3(2026-04-06)에서 `next.config.ts`의 `output: 'standalone'`을 **제거**한 결정이 잠금 상태로 유지되었음. 세션 3 인수인계서의 명시 사유:

> standalone 제거 | standalone vs 일반 모드 | standalone에서 **next start 미동작**, **.env.local 미로드**

이후 44 세션 동안 `next start`로 WSL 운영을 지속하다가 세션 50에서 standalone 기반 배포 페이로드 요구가 발생. 세션 3의 결정과 정면충돌.

## 원인

세션 3의 제거 사유는 **standalone 모드의 표준 동작을 버그/결함으로 오해**한 결과였다.

### 오해 1: "next start 미동작"
- ✗ 해석: standalone 모드에서 `next start`가 응답 안 함 → standalone이 깨짐
- ○ 사실: standalone 모드는 `next start`가 **의도적으로 지원되지 않는 설계**. `.next/standalone/server.js`가 **자체 HTTP 서버**를 내장하므로 `node .next/standalone/server.js`로 기동하는 것이 표준 경로. `next start`는 full `.next/` 디렉토리 + full `node_modules`를 전제로 하므로 standalone 산출물에는 적용 불가.

### 오해 2: ".env.local 미로드"
- ✗ 해석: 환경변수가 안 읽힘 → 설정이 깨짐
- ○ 사실: `.env.local`은 Next.js 관례상 **로컬 개발 전용**이며 프로덕션 빌드에서는 로드되지 않음(의도된 동작). standalone은 기동 디렉토리의 `.env`를 로드하며, 프로덕션 환경변수는 `.env.production` 또는 OS/PM2 환경변수로 주입하는 것이 설계상 정답.

**요컨대 세션 3은 "standalone을 `next start`로 기동하려 시도" + "`.env.local`을 프로덕션 시크릿 소스로 가정"이라는 **두 가지 운용법 오해를 한 번에 범했음**. 두 오해 모두 Next.js 공식 설계와 정확히 반대.

## 해결

### 세션 50에서 결정 역전 + 올바른 운용법 도입

1. **`next.config.ts`에 `output: 'standalone'` 재도입**, 주석에 운용법 명시:
   ```ts
   // 기동: node .next/standalone/server.js (next start 아님 — 세션 3의 "next start 미동작"은 모드 특성)
   // 후처리 필수: .next/static 및 public/ 는 NFT 비추적 → 수동 복사
   output: 'standalone',
   ```

2. **패키징 자동화** `scripts/pack-standalone.sh`:
   - `.next/standalone/*` → `standalone/`
   - `.next/static/` → `standalone/.next/static/` (수동 복사 필수)
   - `public/` → `standalone/public/`
   - `prisma/migrations/` → `standalone/prisma/`
   - **방어 제거**: NFT가 보수적으로 끌어오는 프로젝트 루트 `.env` / `data/` / `scripts/` 는 명시적 `rm`으로 시크릿 유출 차단

3. **기동 헬퍼 5종**:
   - `start.sh`: `NODE_ENV=production PORT=3000 node server.js` — 포그라운드
   - `ecosystem.config.cjs`: PM2 fork 모드
   - `install-native-linux.sh`: Windows 빌드 → Linux 네이티브 교체 (`better-sqlite3` · `@node-rs/argon2-linux-x64-gnu` · `prisma generate`)
   - `.env.production.example`: 환경변수 템플릿 (프로덕션 `.env` 템플릿)
   - `README.md`: 배포 절차 + 알려진 제약 5종

4. **.gitignore**: `/standalone/` 제외 + 기동 헬퍼 5개만 화이트리스트.

### 실증 결과 (세션 50 WSL 배포)
- rsync 전송 → `install-native-linux.sh` → `pm2 start ecosystem.config.cjs`
- `curl http://127.0.0.1:3000/login` → **HTTP 200 OK**, 보안 헤더 6종 적용
- `pm2 logs ypserver` → `Next.js 16.2.3 · Ready in 0ms` · 에러 0
- BUILD_ID vs PM2 created_at 교차 검증: 빌드 후 12분 → 최신 빌드 로드 확정

## 교훈

### 1. "이전 세션의 명시적 결정"도 운용법 오해로 판명되면 역전 가능

CLAUDE.md의 "수정 전 확인 프로토콜"은 "이전 세션 결정은 잠금 상태"라 규정하지만, 잠금의 근거가 **프레임워크 표준 동작에 대한 오해**로 판명되면 예외. 역전 조건:
- 원 결정 사유를 현재 시점에서 객관적으로 반증 가능
- 프레임워크/라이브러리 공식 설계와 원 결정이 정면 충돌
- 역전 후 즉시 실증 가능 (세션 50은 같은 세션 내 배포 성공으로 반증)

**역전 시 반드시**:
- 충돌 사실을 사용자에게 **한 줄로 명시 보고** (세션 50: "⚠️ 이전 결정 충돌 발견 — 한 줄 보고")
- 역전 사유를 CK 문서(이 문서)로 영구 기록 — 미래 역재역전 방지

### 2. Next.js standalone 모드 = 별개 제품이라 간주하라

`next start` 기반 사고방식을 그대로 standalone에 적용하면 모든 것이 "동작 안 함"으로 보임. standalone은:
- 자체 HTTP 서버 (`server.js`) 내장
- NFT 기반 최소 `node_modules`
- `.next/static` / `public/` 은 **NFT 비추적 → 수동 복사 필수**
- 환경변수는 기동 디렉토리 `.env` 우선 (`.env.local` 무시)
- `next start` 미지원 (의도된 설계)

### 3. NFT의 보수성은 양날의 검

Next.js NFT는 `require()` 그래프를 추적해 최소 의존성을 산출하지만, **동적 `fs` 연산**이나 **프로젝트 루트 파일 참조**가 있으면 보수적으로 다수 파일을 끌어온다. 세션 50 실측 사례:
- `.env` (실제 시크릿) · `data/dashboard.db` · `scripts/` 전체 · PNG 이미지 등이 `.next/standalone/`에 복사됨
- pack 스크립트에서 **명시적 `rm`로 2중 방어** 필수

### 4. 플랫폼 교차 빌드 시 native 모듈 교체 패턴

Windows에서 `next build` → WSL에서 기동할 때:
- `better-sqlite3/build/Release/better_sqlite3.node` (Windows PE) → Linux ELF로 재빌드 필요
- `@node-rs/argon2-win32-x64-msvc` → `@node-rs/argon2-linux-x64-gnu`로 교체

**주의**: `npm rebuild --build-from-source`는 NFT 표면에 `binding.gyp`가 없으면 실패 → fallback `npm install --no-save`가 의존성 전체 트리를 채우는 부작용으로 용량 인플레이션. **향후 개선**: `--prefer-offline --no-package-lock`로 prebuild만 가져오거나, pack 시점에 Linux 바이너리를 `standalone/node_modules/.native-linux/`에 번들.

## 관련 파일

- `next.config.ts` — `output: 'standalone'` 재도입 (세션 50)
- `scripts/pack-standalone.sh` — NFT 누락분 수동 복사 + 시크릿 방어 제거
- `standalone/start.sh` · `standalone/ecosystem.config.cjs` · `standalone/install-native-linux.sh` · `standalone/.env.production.example` · `standalone/README.md` — 기동 헬퍼 5종
- `.gitignore` — `/standalone/` 제외 + 헬퍼 화이트리스트
- `docs/handover/260406-session3-security-wave2.md` — **역전 대상 원 결정**
- `docs/handover/260419-session50-standalone-package.md` — 역전 및 실증 세션 전문
- `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/project_standalone_reversal.md` — 프로젝트 메모리 (미래 세션 자동 인지)

## 관련 Compound Knowledge

- `docs/solutions/2026-04-19-progressive-large-scale-plan-just-in-time.md` — "이전 세션의 outline을 풀 디테일로 확장 시 오래된 전제 재검증" 원칙의 확장 적용 사례
