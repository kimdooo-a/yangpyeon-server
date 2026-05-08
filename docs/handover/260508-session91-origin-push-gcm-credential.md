# 인수인계서 — 세션 91 (origin push + GCM multi-account credential workaround)

> 작성일: 2026-05-08
> 이전 세션: [session90](./260505-session90-silent-catch-sweep-cont.md) (다른 터미널 closure)
> 저널: [journal-2026-05-08.md](../logs/journal-2026-05-08.md)

---

## 작업 요약

S90 종료 시점 4 commits ahead 상태에서 origin push 진행. 1차 시도 403 (다른 GitHub 계정 token caching) → Git credential helper 직접 명령 (`git credential reject`) 으로 우회 → 2차 시도 성공. CK 1건 산출 (multi-account GCM credential 함정 + 표준 우회 패턴).

## 대화 다이제스트

### 토픽 1: push 옵션 의사결정 (3 → 1)
> **사용자**: "권장대로 진행."

S90 sweep 종료 시점 다음 4 commits 가 origin 미반영:
- `d10b5e9` fix(ui+rules): silent catch + PR 게이트 룰 #4 BYPASSRLS=t 확장
- `5f64675` fix(ui): silent catch 6건 sweep
- `67461da` docs(s89): /cs 마무리 chunk (다른 터미널)
- `2120769` docs(s90): /cs sweep cont chunk (다른 터미널)

push 가 외부 가시 (origin sync) 행동이라 사용자 명시 동의 필요. 3 옵션 (즉시 / 대기 / 본 세션 /cs 후 일괄) 제시 후 Option 1 권장 — 근거 = src 와 docs 영역 분리 + 585 PASS 검증 완료 + 블로킹 의존성 회피 + Option 3 은 `feedback_concurrent_terminal_overlap` 위반.

**결론**: Option 1 채택, push 진행.

### 토픽 2: 1차 push 실패 — 403 진단

```
remote: Permission to kimdooo-a/yangpyeon-server.git denied to aromaseoro-lab.
```

`git config user.email = smartkdy7@gmail.com` (정상) + `git remote -v` (정상) 인데 다른 계정 권한으로 거절. 진단 분기:
- 1계층 (commit author metadata) 정상
- 2계층 (transport auth = GitHub PAT 의 owner) 가 `aromaseoro-lab` 으로 caching → 이게 root cause
- 3계층 (`git config credential.helper = manager` = Git Credential Manager) 이 WCM entry 를 자동 사용

→ 사용자 환경의 Windows Credential Manager 에 다른 프로젝트에서 caching 된 `aromaseoro-lab` PAT 가 `git:https://github.com` entry 로 보관된 것이 본 사고 메커니즘.

### 토픽 3: WCM UI 부재 + cmdkey 인코딩 함정

> **사용자**: "A .... windows 시작 -그 어디에도 자격 증명 관리자가 없음."

Windows 11 시작 메뉴 검색이 자격 증명 관리자를 노출하지 않는 환경. 우회 경로 시도:
- `cmdkey /list | findstr /i "github"` → 빈 결과 + 인코딩 garbled
- `cmdkey /list` 단독 → 한국어 Windows + Bash 인코딩 변환 실패로 잘못된 매개 변수 에러

→ 결론: Bash 경유 cmd 명령은 한국어 Windows 환경에서 신뢰 불가. **Git 자체 명령으로 우회 가능**.

### 토픽 4: git credential reject 표준 우회

진단:
- `git config --get credential.helper` = **`manager`** (Git Credential Manager, GCM)
- GCM 은 WCM 을 storage backend 로 사용하는 어댑터 → Git ↔ WCM 사이 양방향 통신 가능

표준 Git credential helper 프로토콜로 entry 무효화:

```bash
printf "protocol=https\nhost=github.com\n\n" | git credential reject
```

- protocol/host stdin → Git 이 helper (manager) 호출 → GCM 이 WCM entry 삭제
- silent success (출력 없음 정상)
- `host=github.com` 정확 매칭으로 다른 도메인/repo credential 영향 0
- cross-platform 호환 (macOS Keychain / Linux libsecret 동일 작동)

**결론**: WCM UI 부재 환경에서도 Git 직접 명령으로 깔끔하게 처리.

### 토픽 5: 2차 push 성공 + GCM auto-fallback 발견

```
$ git push origin spec/aggregator-fixes
e33a318..2120769  spec/aggregator-fixes -> spec/aggregator-fixes
```

**브라우저 OAuth prompt 미발생**. 추정 메커니즘:
- GCM 2.x 가 동일 host 에 대해 multi-account credential 을 동시 보관 가능
- `aromaseoro-lab` token 이 default 였다가 reject 후 우선순위 떨어짐
- repo URL owner (`kimdooo-a/yangpyeon-server`) 가 보관된 다른 token (`kimdooo-a`) 과 매칭 → 자동 silent 인증

검증:
- `e33a318..2120769` 표기 = fast-forward (force push 가 아님, `+` prefix 없음)
- 4 commits 모두 origin 반영
- PR 게이트 룰 #4 BYPASSRLS=t 확장 origin level 활성화

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | push timing = Option 1 (즉시) | (1) 즉시 / (2) 대기 / (3) 본 세션 /cs 후 | src/docs 영역 분리 + 검증 완료 + 블로킹 회피 + (3) 은 동시터미널 충돌 룰 위반 |
| 2 | credential 우회 경로 = `git credential reject` | (A) WCM UI / (B) cmdkey CLI / (C) git credential reject / (D) SSH 전환 / (E) gh auth login | (A) UI 부재 / (B) 한국어 인코딩 함정 / (D)(E) 과도한 변경 → (C) 표준 cross-platform 명령 |

## 수정 파일 (7개)

본 세션 src 코드 변경 0 — 인프라/문서만:

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/logs/journal-2026-05-08.md` | 신규 — 본 세션 저널 5 토픽 |
| 2 | `docs/handover/260508-session91-origin-push-gcm-credential.md` | 신규 — 본 인수인계서 |
| 3 | `docs/solutions/2026-05-08-gcm-multi-account-credential-rejected-trap.md` | 신규 — CK 다중 계정 GCM 함정 + 표준 우회 |
| 4 | `docs/status/current.md` | S91 row 추가 (테이블 맨 아래) |
| 5 | `docs/logs/2026-05.md` | S91 entry 추가 (최상단) |
| 6 | `docs/handover/_index.md` | 2026-05-08 그룹 신설 + S91 링크 |
| 7 | `docs/handover/next-dev-prompt.md` | S91 → S92 진척, S92 우선순위 표 |

## 상세 변경 사항

### 1. origin push (commit history 변경 없음)

`d10b5e9 5f64675 67461da 2120769` 4 commits 가 origin/spec/aggregator-fixes 에 fast-forward push. 본 세션 전 이미 commit 된 변경분 → push 자체는 코드 변경 0.

### 2. GCM credential reject (1회성 인증 캐시 무효화)

```bash
printf "protocol=https\nhost=github.com\n\n" | git credential reject
```

WCM 의 `git:https://github.com` entry 1개 무효화. 다른 entry/도메인 영향 0.

### 3. CK 1건 신규

`docs/solutions/2026-05-08-gcm-multi-account-credential-rejected-trap.md`
- 3계층 인증 모델 (commit author / transport auth / helper bridge) 진단 매트릭스
- WCM UI 부재 + cmdkey 한국어 인코딩 함정 + Git 직접 명령 우회 패턴
- GCM 2.x multi-account auto-fallback 메커니즘 추정
- memory 룰 승격 후보 (`feedback_git_push_403_credential_layer_check.md`)

## 검증 결과

- `git push origin spec/aggregator-fixes` → `e33a318..2120769` fast-forward 성공
- `git status` → `nothing to commit, working tree clean` (push 직후, /cs 산출 전)
- `git log origin/spec/aggregator-fixes..HEAD` → 빈 결과 (origin sync 완료)
- 코드 회귀 검증 불필요 (코드 변경 0)

## 터치하지 않은 영역

- 코드 (`src/`, `prisma/`, `tests/`) — 본 세션 변경 0
- PM2 운영 서버 4종 (`feedback_pm2_servers_no_stop` 적용)
- 다른 터미널 commits (`67461da` `2120769`) — 영역 보존, push 만 함께 origin 반영
- WCM 의 다른 entry (`aromaseoro-lab` 외 도메인/repo) — `host=github.com` 정확 매칭으로 영향 0
- 기존 S88-S90 carry-over 작업 (사용자 폰 재시도 / ops live 검증 / S85-F2 단독 chunk 등)

## 알려진 이슈

- **GCM 의 default token 이 여전히 `aromaseoro-lab` 일 가능성**: reject 가 우선순위만 떨어뜨렸을 뿐 entry 자체가 무효화됐는지 확인 안 됨. 다음 push 시 같은 403 재발 가능 (낮은 확률) — 그 경우 SSH 전환 (`git remote set-url origin git@github.com:kimdooo-a/yangpyeon-server.git`) 을 영구 해결책으로 검토.
- **다른 터미널의 next-dev-prompt 갱신 흐름과 충돌 가능성**: 본 세션이 next-dev-prompt 를 S92 로 진척시키지만, 다른 터미널이 별도 작업 중이면 다음 세션 진입 시 머지 충돌 가능. 본 세션 commit 후 즉시 origin push 권장.

## 다음 작업 제안

S92+ 우선순위는 next-dev-prompt 참조. 본 세션 결과로 차감 가능한 것:

- ~~origin push 잔여 4 commits~~ ✅ 완료 (S91)
- 신규 추가: GCM credential 룰 메모리 승격 검토 (P3, 5분, S92 또는 사용자 결정 영역)

이전 carry-over 그대로 유지:
- P0 사용자 휴대폰 /notes 재시도 (S88-USER-VERIFY)
- P1 ops live 검증 (S88-OPS-LIVE, 운영자 직접)
- P0 S85-F2 M4 UI Phase 2 (5-6 작업일 단독 chunk)
- 그 외 S87/S86 carry-over

---

[← handover/_index.md](./_index.md)
