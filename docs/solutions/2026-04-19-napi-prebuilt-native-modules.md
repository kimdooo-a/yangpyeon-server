---
title: N-API prebuilt 패턴 — native addon 설치 3~5초, node-gyp 고통 해소
date: 2026-04-19
session: 30 (SP-011, SP-012)
tags: [native-addon, napi, n-api, argon2, isolated-vm, better-sqlite3, wsl2]
category: pattern
confidence: high
---

## 문제

"Native addon은 설치가 고통스럽다"는 통념은 CVE 권고(`@node-rs/argon2`를 피하라거나, `isolated-vm` 은 무리라거나)의 근거로 자주 인용된다. 과거 경험:

- **node-gyp**: Python 2.7/3.x, Visual Studio Build Tools, GCC 버전 불일치로 실패
- **node-pre-gyp**: prebuilt 없으면 local 빌드 fallback → 실패율 높음
- **bcrypt**: Node 메이저 업그레이드 시 `npm rebuild` 필수
- **sharp**: libvips 바인딩 빌드 실패 흔함

이 통념이 ADR-006의 "bcryptjs 유지, argon2 전환은 native 부담" 판단과 ADR-009의 "isolated-vm v6 Node 24 ABI 호환 깨짐" 재검토 트리거의 정당성으로 쓰였다.

## 발견

SP-011/SP-012 실측 결과 (WSL2 Ubuntu 24.04.4 LTS + Node v24.14.1):

| 패키지 | 설치 시간 | 빌드 로그 | 결과 |
|--------|-----------|-----------|------|
| `@node-rs/argon2` | **3.3초** | node-gyp 호출 없음 | prebuilt binary |
| `isolated-vm@6.1.2` | **1.6초** | node-gyp 호출 없음 | prebuilt binary |
| `better-sqlite3@12.8.0` | ~5초 | prebuild 다운로드 | prebuilt binary |
| `bcrypt@6.0.0` | 기존 설치 | N-API 기반 | prebuilt binary |

공통점: **N-API(Node API)** 기반 + **prebuilt binary** 제공.

## 원인

Node 10(2018) 이후 N-API가 안정화되면서:
1. **ABI 독립**: Node 메이저 버전 변경 시 재빌드 불필요 (N-API 버전만 유지)
2. **prebuild 관례**: 배포 시 주요 플랫폼용 binary를 npm 레지스트리에 함께 업로드
3. **napi-rs 생태계**: Rust로 작성된 native addon이 GitHub Actions에서 자동 매트릭스 빌드 후 배포

특히 `@node-rs/*` 패키지는 napi-rs 프레임워크 기반으로 Linux/macOS/Windows × x64/arm64 조합 전부 prebuilt 제공. 로컬 설치는 단순 파일 다운로드.

## 해결 — 도입 결정 시 판단 기준

### 안전하게 도입 가능
| 패키지 | 기반 | prebuilt |
|--------|------|----------|
| `@node-rs/*` 전체 | napi-rs | ✅ |
| `isolated-vm` v6+ | N-API | ✅ |
| `better-sqlite3` v7+ | N-API | ✅ |
| `sharp` v0.30+ | N-API + libvips prebuild | ✅ |
| `@swc/*` | napi-rs | ✅ |
| `bcrypt` v6+ | N-API | ✅ |

### 여전히 주의 필요
- NAN(legacy) 기반 addon — Node 메이저 업그레이드 시 rebuild 필요
- libvips/ffmpeg/ImageMagick 외부 system library 의존 — 개별 설치 필요
- 비상업 패키지 중 prebuild 미제공 — node-gyp 로컬 빌드 fallback

### 판단 체크리스트
```bash
# 1. package.json의 binding 확인
cat node_modules/<pkg>/package.json | grep -E '"napi"|"gypfile"|"binary"'

# 2. 실제 설치 시간 측정
time npm install <pkg>
# < 10초면 prebuilt, 30초+ 면 로컬 빌드

# 3. N-API 버전 확인
node -e "const p=require('<pkg>'); console.log(p)"
# Error: NODE_MODULE_VERSION 호환 에러 → ABI 문제
```

## 교훈

1. **"native 모듈 부담" 통념은 2018년 이전 기준**: 2026년 현재 주요 패키지는 전부 prebuilt. 통념으로 설계 결정을 좌우하지 말 것.
2. **ADR에서 "native 부담"을 근거로 사용할 때 해당 패키지의 현행 상태 확인**: 본 프로젝트 ADR-006이 "bcryptjs 유지" 이유로 든 CON-10("native 모듈 의존성 제한")은 bcrypt/argon2 양쪽 모두 N-API라 증분 부담 없음 — 재검토 필요.
3. **실측 30분으로 대체 가능한 가정 검증**: SP-011은 30분 이내 완료. ADR 결정의 근거가 되는 가정은 실측이 항상 우선.
4. **CON-10 조항 재해석**: "native 모듈 의존성 제한"은 "node-gyp 빌드 회피"가 본질. N-API prebuilt는 이 제약을 사실상 충족.

## 적용 범위 (본 프로젝트)

- **Phase 17 Auth Core**: `@node-rs/argon2` 도입 (ADR-022 제안)
- **Phase 19 Edge Functions**: `isolated-vm@6.1.2` 도입 (ADR-009 확정)
- **Phase X Image Processing**: `sharp` 도입 고려 (썸네일/리사이즈)
- **성능 중요 모듈**: napi-rs 기반 패키지 탐색 (`@swc/core`, `@napi-rs/canvas` 등)

## 관련 파일

- `docs/research/spikes/spike-011-argon2-result.md` §2 설치 테스트
- `docs/research/spikes/spike-012-isolated-vm-v6-result.md` §1 환경
- `02-architecture/01-adr-log.md` § ADR-006, ADR-009 — CON-10 재검토 대상
