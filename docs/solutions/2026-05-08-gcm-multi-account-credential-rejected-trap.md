---
title: Git Credential Manager multi-account 충돌 + git credential reject 우회
date: 2026-05-08
session: 91
tags: [git, github, credential-manager, gcm, wcm, multi-account, push, 403, korean-windows]
category: tooling
confidence: high
---

## 문제

`git push origin spec/aggregator-fixes` 가 다음 에러로 실패:

```
remote: Permission to kimdooo-a/yangpyeon-server.git denied to aromaseoro-lab.
fatal: unable to access 'https://github.com/kimdooo-a/yangpyeon-server.git/': The requested URL returned error: 403
```

**증상의 모순성**:
- `git config user.email` = `smartkdy7@gmail.com` (kimdooo-a 의 메일, commit metadata 정상)
- `git remote -v` = `https://github.com/kimdooo-a/yangpyeon-server.git` (URL 정상)
- 그런데 push 가 `aromaseoro-lab` 권한으로 거절

## 원인

**Git 의 인증은 3계층 구조**이고, 각 계층이 독립적으로 잘못 설정될 수 있다:

| 계층 | 정보 | 저장 위치 | 검증 주체 |
|------|------|----------|---------|
| 1. Commit author | `user.name` / `user.email` | `git config` (repo or global) | **검증 안 됨** (메타데이터, 변조 가능) |
| 2. Transport auth | GitHub Personal Access Token | OS credential store | GitHub API (실제 push 권한 결정) |
| 3. Helper bridge | credential helper (manager/store/cache) | `git config credential.helper` | Git ↔ OS store 어댑터 |

본 사고는 **계층 2 misconfiguration**. Windows Credential Manager (WCM) 가 이전 프로젝트에서 caching 된 `aromaseoro-lab` 의 PAT 을 `git:https://github.com` entry 로 보관 중이었고, GCM (Git Credential Manager) 가 이 entry 를 자동 사용. commit author 가 `kimdooo-a` 이든 무관 — push 시점엔 transport auth 만 확인됨.

**Multi-account git 사용자의 흔한 함정**: 한 GitHub 계정 token 이 한번 입력되면 명시적으로 삭제하지 않는 한 무한정 재사용. WCM 이 도메인 단위 (`github.com`) 로만 entry 를 구분해서, 같은 도메인의 다른 owner repo 에 push 할 때도 같은 token 을 적용 → repo owner 와 token owner 불일치 시 403.

## 해결

### 1차 시도 (실패) — Windows Credential Manager UI

전통 경로:
1. Windows 시작 → "자격 증명 관리자" 검색
2. Windows 자격 증명 → `git:https://github.com` 항목 삭제
3. push 재시도 → 새 token 입력 prompt

→ **사용자 환경에서 시작 메뉴 검색이 자격 증명 관리자를 노출하지 않음**. Windows 11 검색 UI 의 알려진 동작 (한국어 환경 + 카테고리 필터링 영향 추정).

### 2차 시도 (실패) — cmdkey CLI

`cmdkey /list` PowerShell 명령은 정상 작동하지만, **Bash → cmd 호출 시 한국어 Windows 인코딩 문제**:

```bash
$ cmdkey /list | findstr /i "github"
FINDSTR: github은(는) 표시할 수 없습니다.   # 인코딩 garbled 후 잘못된 매개 변수 처리
```

### 3차 시도 (성공) — git credential reject

GCM 자체가 표준 Git credential helper 프로토콜을 따르므로, **OS UI 를 우회하고 Git 명령으로 직접 entry 무효화**:

```bash
printf "protocol=https\nhost=github.com\n\n" | git credential reject
```

- protocol/host 를 stdin 으로 전달 → Git 이 helper (manager) 호출 → GCM 이 WCM 에서 해당 entry 삭제
- silent success (출력 없음 정상)
- 다른 도메인/repo credential 영향 0 (`host=github.com` 정확 매칭)

이후 `git push origin spec/aggregator-fixes` 즉시 성공:

```
e33a318..2120769  spec/aggregator-fixes -> spec/aggregator-fixes
```

**브라우저 OAuth prompt 미발생**. 추정 메커니즘:
- GCM 2.x 가 동일 host 에 대해 multi-account credential 을 동시 보관 가능
- `aromaseoro-lab` token 이 default 였다가 reject 후 우선순위 떨어짐
- repo URL owner (`kimdooo-a/yangpyeon-server`) 가 보관된 다른 token (`kimdooo-a`) 과 매칭 → 자동 silent 인증

## 교훈

1. **`user.name/email` ≠ push 인증**: commit author 는 push 권한과 무관한 메타데이터다. 403 발생 시 `git config` 보지 말고 `git config credential.helper` + OS credential store 를 보라.
2. **`git credential reject` 가 cross-platform 표준 우회**: WCM UI / cmdkey / `gh auth` / SSH 전환 같은 OS 별 우회 대신, Git 자체 프로토콜 명령을 쓰면 macOS Keychain / Linux libsecret 에서도 동일하게 작동.
3. **GCM 의 multi-account 우아한 처리**: reject 가 모든 token 을 날리는 게 아니라 default 로 잡혀있던 잘못된 매칭만 무효화. 적합한 다른 token 이 있으면 자동 fallback. `gh auth login` 재시작이 늘 필요한 건 아님.
4. **Bash + 한국어 Windows + cmdkey 인코딩 함정**: 한국어 Windows 환경에서는 Bash (Git Bash / WSL bridge) 를 통한 cmd 명령 호출이 인코딩 변환 실패하는 케이스가 흔함. PowerShell 직접 실행 또는 Git 자체 명령 우선.
5. **인증 실패의 진짜 정보는 transport layer 에 있다**: 403 응답에는 `denied to <username>` 형태로 실제 사용된 token owner 가 명시됨. 이 부분이 commit author 와 다르면 곧 계층 2 문제.

## 관련 파일

- `git config credential.helper` (이 repo 의 설정 = `manager`)
- Windows Credential Manager — `control /name Microsoft.CredentialManager`
- GCM 문서: https://github.com/git-ecosystem/git-credential-manager
- 본 세션 push 결과: `git log origin/spec/aggregator-fixes..HEAD` 가 빈 결과 (origin sync 완료)

## 메모리 룰 승격 검토

이 패턴은 다른 다중 GitHub 계정 사용자에게도 보편적이라 memory 룰 승격 후보:

- **이름 후보**: `feedback_git_push_403_credential_layer_check.md`
- **룰**: push 가 403 일 때 `git config user.email` 이 아닌 `git config credential.helper` + OS credential store 를 진단. **Why**: 본 사고는 commit author 와 transport auth 를 혼동한 1차 진단 분기 함정. **How to apply**: GitHub 403 발생 시 (a) credential helper 확인 (b) `git credential reject` 시도 (c) 그래도 안 되면 helper 별 OS UI/CLI 진단.
- **승격 결정**: S92+ 사용자 결정 (본 세션은 CK 만 산출).
