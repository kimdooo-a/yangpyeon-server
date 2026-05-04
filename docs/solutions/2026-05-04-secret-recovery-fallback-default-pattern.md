---
title: "시크릿 fallback default 패턴 = git history 영구 노출 매개체"
date: 2026-05-04
session: 85 (보조 chunk)
tags: [security, secrets, bash, git, filter-repo, gitguardian, env-validation, anti-pattern]
category: pattern
confidence: high
---

## 문제

GitGuardian 알람으로 admin 비밀번호 + Postgres superuser 비밀번호 평문이 **21개 파일 31개 위치**에 분산 노출됨이 확인됨.

증상:
- GitGuardian commit `5071755` push 7초 후 알람 발생
- 첫 진입점: `scripts/session44-verify.sh:16` `PASSWORD="${PASSWORD:-Knp13579!yan}"`
- 잠재적 영향 범위:
  - 실행 코드 10건 (scripts/)
  - production source 1건 (`src/lib/password.test.ts`)
  - 문서 14건 (handover/, plans/, guides/, logs/)
- 두 변형 동시 노출: `Knp13579!yan` (운영 admin) + `Knp13579yan` (postgres superuser)

재현 조건:
- bash 검증 스크립트에 `${VAR:-default-secret}` 패턴 사용
- TypeScript spec에 `process.env.X ?? "literal-secret"` 패턴 사용
- 한 번 박은 fallback default가 다른 스크립트로 "편의 패턴"으로 전파 (mirror)

## 원인

**근본 원인**: bash `${VAR:-default}` 와 TypeScript `??` 의 fallback default 패턴은 "편의를 위해 default 박자" 결정으로 시작되지만, **default 자체가 시크릿이면 git history 에 영구 박힘**과 등가.

전파 메커니즘:
1. 첫 작성 시 "검증 스크립트 빨리 돌리려면 default 박자" 판단
2. 다음 스크립트 작성자(이전 세션의 Claude 포함)가 같은 패턴 미러링
3. 21개 파일에 동일 안티패턴 확산

함정의 비대칭성:
- 코드 리뷰 시점에는 "환경변수 우선, fallback은 안전망" 으로 보임 → 무해 인식
- 실제로는 fallback default 자체가 영구 노출 매개체 → 환경변수 미설정 시 즉시 노출

추가 함정 (production source):
- `src/lib/password.test.ts` 가 운영 비밀번호와 **동일한 fixture** 사용 → 운영 시크릿이 테스트 코드에 평문으로 박힘. 운영 비밀번호 회전 시 테스트도 동시에 깨짐 (의존성 카플링).

## 해결

### 1. env-only 강제 패턴 (bash)

```bash
# ❌ Bad — fallback default = secret committed
PASSWORD="${PASSWORD:-Knp13579!yan}"

# ✅ Good — env 미설정 시 즉시 실패, default secret 부재
: "${PASSWORD:?PASSWORD env required (시크릿은 코드에 박지 말 것 — .env.test.local 또는 export PASSWORD=...)}"
```

bash 파라미터 확장 두 형태 정확한 의미:
- `${VAR:?msg}`: unset/empty면 stderr에 msg 출력 + `exit 1`
- `${VAR:-default}`: unset/empty면 default 사용 (편의 fallback)

→ 시크릿은 항상 전자.

### 2. env-only 강제 패턴 (TypeScript)

```typescript
// ❌ Bad
const PASS = process.env.E2E_PASSWORD ?? "Knp13579!yan";

// ✅ Good — fallback 제거 + 명시적 throw
const PASS = process.env.E2E_PASSWORD;
if (!PASS) {
  throw new Error("E2E_PASSWORD env required — set in .env.test.local");
}
```

nullish coalescing (`??`) 의 fallback default가 시크릿이면 fallback 안전성이 무의미.

### 3. 운영-테스트 비밀번호 분리

```typescript
// ❌ Bad — 운영 비밀번호와 동일
const TEST_PASSWORD = "Knp13579!yan";

// ✅ Good — 의미 명시 더미
const TEST_PASSWORD = "test-password-fixture-only";
```

테스트 fixture는 비대칭적 보안 위험 — 운영 시크릿이 production source tree 안에 박히면 테스트 환경 격리가 무너짐.

### 4. 사후 회수 (이미 노출된 경우)

a) **1순위 — 비밀번호 회전 (가장 중요)**:
- GitHub history purge로 fork/clone/Archive 캐시는 회수 불가
- 회전이 유일한 실효 보안 조치
- 이번 사례에서는 사용자 거부 (1인 사설 repo + 외부 가입 없음 영향 범위 제한 가정)

b) **2순위 — git history purge** (`git-filter-repo`):

```bash
# 설치
pip install git-filter-repo

# 안전망 3중
git branch sec/before-purge-main main
git branch sec/before-purge-spec spec/aggregator-fixes
git stash push --include-untracked -m "..."  # working tree 보호

# replace-text 매핑
cat > .git-secret-purge.txt <<EOF
Knp13579!yan==><ADMIN_PASSWORD>
Knp13579yan==><DB_PASSWORD>
EOF

# 실행 (origin 자동 제거됨, 안전 기본값)
git filter-repo --replace-text .git-secret-purge.txt --force

# origin 수동 복구
git remote add origin <URL>

# 시크릿 잔존 검증
git log --all -p | grep -c "Knp13579"  # 0 expected

# fetch 후 force-with-lease push (race 방지)
git fetch origin
git push --force-with-lease origin main spec/aggregator-fixes

# stash 복원
git stash pop && git stash pop

# 백업 브랜치 정리 (검증 후 즉시 가능 — GitHub reflog ~90일 잔존)
git branch -D sec/before-purge-{main,spec}
```

c) **3순위 — 재발 방지 자동화**:
- pre-commit hook: `gitleaks` 또는 `detect-secrets`
- 메모리/룰 파일에 안티패턴 등록 (다음 세션 발화 차단)

## 교훈

1. **fallback default = secret committed**: bash `${VAR:-default}` 또는 TS `??` 의 default가 시크릿이면 git에 영구 박힘과 등가. "환경변수 우선이라 안전" 인식은 함정.

2. **운영-테스트 비밀번호 분리**: production source tree의 테스트 fixture는 운영 비밀번호와 절대 동일하면 안 됨. 의미 명시 더미(`"test-password-fixture-only"`) 사용.

3. **첫 작성 시 안티패턴이 미러링됨**: 21개 파일이 같은 패턴 → 첫 fallback default 결정이 후속 스크립트 작성자에게 전파. 메모리 룰로 첫 발화 자체를 차단해야 효과.

4. **history purge 후에도 보안 회복 ≠ 완료**: GitHub Archive Program / public fork / scraper 캐시는 회수 불가. private repo면 영향 제한, public이면 비밀번호 회전이 유일한 실효 조치.

5. **filter-repo 의 자연 보너스**: force-purge 직전에 다른 터미널이 commit한 무관 작업도 history rewrite 시 자연 합류 → force push로 함께 push됨. multi-terminal 환경에서 의도하지 않은 부수 효과 가능.

## 관련 파일

- `memory/feedback_no_secret_defaults_in_scripts.md` — 메모리 룰 (재발 방지 게이트)
- `memory/feedback_autonomy.md` — 분기 질문 금지 (사용자 회전 거부 시 즉시 진행 룰)
- `docs/handover/260504-session85-secret-recovery-history-purge.md` — 본 사례 인수인계서
- `docs/logs/journal-2026-05-04.md` — 세션 저널
- 정리된 21개 파일 (commit `a4e1ef9` = filter-repo 후 `5c56676`)

## 자매 CK

- `2026-05-03-delegation-prompt-vs-environment-gap-adaptation.md` — 위임 프롬프트와 실제 환경 갭 4건 적응 패턴 (다른 컨텍스트의 사전 정찰 가치)
- `2026-05-02-prismapg-timezone-prod-audit.md` — prod-only 함정 패턴 (BYPASSRLS 가 latent bug 가림)
- `cc231fd-plan-estimate-vs-reality-gap-infrastructure-blind-spot.md` — 검증 사각지대 패턴
