---
title: ADR PROPOSED 단계의 사전 코드 .txt 보관 패턴 (ACCEPTED 직후 5분 src/ 진입)
date: 2026-05-01
session: 71
tags: [adr, workflow, code-review, fallback, deployment]
category: pattern
confidence: high
---

## 문제

ADR이 PROPOSED 상태이지만 권고 옵션이 명확한 경우, ACCEPTED 시점부터 src/ 코드 작성을 시작하면 출시까지 추가 N시간이 소요된다. 반대로 PROPOSED 시점에서 src/ 에 미리 코드를 작성하면:

1. **lint/tsc/build 깨짐**: 의존성 미설치 (`@aws-sdk/*` 등) 또는 schema 미적용 컬럼 (`File.storageType`) 사용 → 빌드 실패가 main 브랜치 또는 dev 환경 전체로 전파
2. **fallback 처리 부담**: PoC 결과 옵션이 거부되면 src/ 코드 폐기 + 의존성 제거 + git 이력 흔적이 큼
3. **ADR 결정 무시 위험**: PoC 가 끝나기 전에 코드를 만들면 결정이 코드에 끌려가는 (sunk-cost 편향) 패턴 발생

기존 패턴은 "ADR ACCEPTED 후 코드 작성" 순서가 강제되어 출시 지연 또는 우회로 코드를 미리 만들지만 lint/build 부작용을 감수.

## 원인

ADR PROPOSED → ACCEPTED 전이 시점이 외부 게이트(R2 토큰 발급, 사용자 승인 등)에 종속되는데, 그 게이트가 사용자 행동(분 단위) 으로 끝남에도 불구하고 코드 전이가 ACCEPTED 후 N시간(라이브러리 학습 + 라우트 작성 + 검증)이 또 걸리는 비대칭. 사전에 작성하면 game.

src/ 에 직접 두는 것의 부작용은 **코드의 "활성화 여부"가 파일 위치/확장자에 의해 결정되는 환경(Next.js, TypeScript, ESLint, vitest 등)** 때문. 즉 src/ 에 .ts 파일이 있으면 자동으로 빌드 대상.

## 해결

**사전 코드를 `docs/research/spikes/<spike-id>-prepared-code/` 디렉토리에 `.txt` 확장자로 보관**한다.

### 구조

```
docs/research/spikes/spike-XXX-prepared-code/
├── README.md                    # ACCEPTED 후 적용 절차 (5분)
├── migration.sql.txt            # → prisma/migrations/<TS>_<name>/migration.sql
├── module-name.ts.txt           # → src/lib/module-name.ts
├── route-X.ts.txt               # → src/app/api/.../X/route.ts
├── route-Y.ts.txt               # → src/app/api/.../Y/route.ts
├── env.example.txt              # → .env append
└── package-deps.txt             # → npm install 명령
```

### ACCEPTED 후 적용 절차 (5분)

```bash
# 1. 의존성 설치
npm install $(cat docs/research/spikes/spike-XXX-prepared-code/package-deps.txt | grep -v '^#' | xargs)

# 2. 마이그레이션 cp + rename
TS=$(date +%Y%m%d%H%M%S)
mkdir -p prisma/migrations/${TS}_<descriptive_name>
cp docs/research/spikes/spike-XXX-prepared-code/migration.sql.txt \
   prisma/migrations/${TS}_<name>/migration.sql

# 3. 모듈/라우트 cp + rename (확장자 .txt 제거)
cp docs/research/spikes/spike-XXX-prepared-code/module-name.ts.txt src/lib/module-name.ts
mkdir -p src/app/api/.../X
cp docs/research/spikes/spike-XXX-prepared-code/route-X.ts.txt src/app/api/.../X/route.ts
# ... 라우트 반복

# 4. .env 추가 (수동 확인 권장 — 시크릿 값 채워넣기)
cat docs/research/spikes/spike-XXX-prepared-code/env.example.txt >> .env

# 5. Prisma generate + migrate deploy + ypserver 재배포
npx prisma generate && npx prisma migrate deploy
/ypserver
```

### Fallback 시 폐기

PoC 결과 권고 옵션이 No-Go 면:

```bash
rm -rf docs/research/spikes/spike-XXX-prepared-code/
```

src/ 에 손이 안 갔으므로 lint/build/git 이력 영향 0. ADR 본문만 PROPOSED → REJECTED 로 변경.

## 검증 사례 (세션 71)

- ADR-032 (파일박스 R2 hybrid) PROPOSED 시점에 6 파일(.txt) 사전 작성
- 다른 터미널이 R2 토큰 발급 + PoC 6/6 합격 후 본 디렉토리에서 `cp + rename` 으로 src/ 진입
- spike-032-prepared-code/r2-client.ts.txt → src/lib/r2.ts (1:1 동일 내용 적용 확인됨)
- spike-032-prepared-code/route-r2-{presigned,confirm}.ts.txt → src/app/api/v1/filebox/files/r2-{presigned,confirm}/route.ts
- 결과: PROPOSED → ACCEPTED 동일 세션 승격 + V1 옵션 A 적용까지 단일 commit `275464c` 18 파일 +6180줄. 사전 코드가 없었다면 ACCEPTED 후 별도 세션 16h 소요.

## 교훈

- **확장자가 "활성화 게이트"** 인 빌드 시스템(Next.js, TS, ESLint)에서 `.txt` 는 자연스러운 격리 수단. 다른 빌드 시스템(Java/Maven, Go module)에서는 `.txt.suffix` 또는 별도 `prepared/` 폴더를 .gitignore 에서 빌드 제외하는 식으로 응용 가능.
- 사전 코드 디렉토리는 spike 본문(SP-XXX) 의 부속물로 묶어두면 추적성이 좋다. spike 가 ACCEPTED 되면 prepared-code/ 도 함께 영구 보존 (git tracked) — 미래에 "왜 V1=A 였나" 의문이 들 때 직접 비교 가능.
- README.md 에 ACCEPTED 후 적용 절차를 명시하면 다른 터미널/세션에서도 5분 안에 진입 가능. 본 사례에서 다른 터미널 Claude 가 README 절차 그대로 따라가 충돌 0.
- **PoC 6/6 합격을 ACCEPTED 게이트로 강제**: 권고 옵션이 자동 채택되지 않도록 spike §4 PoC 측정 항목 + 합격 기준 + No-Go 트리거 3종을 명시. 사전 코드는 PoC 통과 가능성 높을 때만 작성 가치.
- **예외**: 사전 코드는 "옵션 A 권고 강함" 케이스에서만 정당화. 옵션 매트릭스가 5/5 동등 또는 권고가 모호하면 ACCEPTED 후 작성이 안전.

## 관련 파일

- `docs/research/spikes/spike-032-prepared-code/` — 본 패턴 첫 적용 사례
- `docs/research/decisions/ADR-032-filebox-large-file-uploads.md` §7.1 — ACCEPTED 게이트와 사전 코드 연결
- `docs/research/spikes/spike-032-filebox-large-file-uploads.md` §8 — spike 본문에 사전 코드 위치 링크
