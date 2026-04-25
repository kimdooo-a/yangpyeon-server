# 인수인계서 — 세션 52 (WSL 빌드 파이프라인 + NFT 네이티브 모듈 정합성 보장)

> 작성일: 2026-04-25
> 이전 세션: [session51 kdywave 이행도 평가](./260425-session51-kdywave-eval-adr020.md)
> 저널 원본: `docs/logs/journal-2026-04-25.md` (세션 52 섹션)

---

## 작업 요약

세션 50에서 재도입한 standalone WSL PM2 배포가 `better-sqlite3` 네이티브 바이너리 플랫폼 불일치(Windows PE → Linux ELF)로 로그인 시 `ERR_DLOPEN_FAILED`를 유발하던 회귀를 근본 해결. **L2(WSL 네이티브 빌드) 정상 경로 + L1(install-native-linux.sh 자가치유) 안전망**의 defense-in-depth 구조 확립. 사용자 진행 중이었던 3 파일(`pack-standalone.sh` 수정 / `install-native-linux.sh` 수정 / `wsl-build-deploy.sh` 신규)이 본 세션의 산출물로 확정되어 S51 핸드오버의 이월 사안이 자연 해소됨.

## 대화 다이제스트

### 토픽 1: standalone 로그 진단 — invalid ELF header 발견
> **사용자**: "standalone 로그 확인해봐... 로그인이 안돼."

PM2 err 로그 확인 중 반복되는 시그니처 발견:
```
⨯ Error: /home/smart/ypserver/.next/node_modules/better-sqlite3-90e2652d1716b047/build/Release/better_sqlite3.node: invalid ELF header
code: 'ERR_DLOPEN_FAILED'
```

`file(1)` 실행 결과 `PE32+ executable (DLL) for MS Windows` — Windows DLL이 Linux dlopen에 투입되어 실패. 에러 시점은 2026-04-19 22:21부터 2026-04-21 22:02까지 6건(로그인 시도 구간과 일치).

**결론**: 원인 "Windows 빌드의 NFT가 해시 디렉토리에 Windows 바이너리를 번들"로 특정. 즉각 임시 수정(정규 `node_modules/` ELF Linux `.node`를 NFT 해시 디렉토리에 덮어쓰고 PM2 재시작)으로 로그인 라우트 복구 확인(403 CSRF 차단 응답 = 핸들러 정상 도달).

### 토픽 2: 근본 해결 여부 재검토
> **사용자**: "최소수정이 근본적인 해결책이야?"

임시 수정은 band-aid임을 인정. 다음 `next build` 시 NFT가 다시 Windows `.node`를 끼워 넣고, 해시 디렉토리명(content-addressed)도 빌드마다 변할 수 있음. 3 계층 해결 강도 표로 제시:

| 수준 | 방법 | 영구성 |
|------|------|--------|
| L0 (band-aid) | 단일 `.node` 덮어쓰기 | 다음 빌드까지 |
| L1 (self-heal) | `install-native-linux.sh`에 NFT 해시 디렉토리 동기화 로직 | 스크립트 실행 시 |
| L2 (root cause) | WSL에서 직접 `next build` | 영구 (아키텍처 정합) |

**결론**: L2 메인 + L1 안전망 권장.

### 토픽 3: 권장안 실행 — L1 패치 + L2 신규 + pack 수정
> **사용자**: "너의 권장안대로 진행해줘."

3 파일 작업:

- **`standalone/install-native-linux.sh`**: NFT 해시 디렉토리 자가치유 블록 추가. `sync_native_to_nft()` 함수로 정규 `node_modules/<pkg>`의 `.node`를 `.next/node_modules/<pkg>-*/build/Release/`에 동기화. NFT hardlink로 inode 동일한 경우는 `-ef` 체크로 cp 스킵(Linux 빌드 정상 경로에서 no-op).
- **`scripts/wsl-build-deploy.sh` (신규)**: Windows 소스 → WSL 네이티브(`~/dev/ypserver-build/` on ext4, 9P 프로토콜 우회) → `npm ci` → `next build` → `pack-standalone.sh` → rsync 배포(`~/ypserver/`) → PM2 재시작까지 단일 명령 파이프라인. `set -euo pipefail`로 실패 즉시 중단.
- **`scripts/pack-standalone.sh`**: 세션 중 발견한 2 버그 수정. (1) helper 5종(start.sh/README.md/ecosystem.config.cjs/.env.production.example/install-native-linux.sh) 임시 디렉토리 save/restore — rsync `--delete-excluded`가 source에 없는 helper를 target에서 삭제하던 버그 차단. (2) `--exclude='/standalone/'` 앵커링으로 NFT가 재귀 트레이스하는 nested `standalone/standalone/` 누적 차단. (3) 첫 빌드 대비 `mkdir -p "$DEST"` 멱등성 보강.

첫 실행 시 드러난 2차 버그:
- pack 출력의 helpers가 `standalone/standalone/`로 nested된 채 배포 → helper save/restore 로직 추가로 해결.
- `install-native-linux.sh`의 `cp`가 NFT hardlink 동일 inode 마주치면 "are the same file"로 실패 → `set -euo pipefail`이 파이프라인 중단 → PM2 재시작 단계 미도달. `-ef` 조건 추가로 해결.

**결론**: L2 파이프라인 정상 동작. `.next/node_modules/better-sqlite3-*/build/Release/better_sqlite3.node` = ELF 64-bit Linux 확증. PM2 재시작 후 신규 ELF 에러 0건.

### 토픽 4: standalone 폴더 전수 교체 확인 요청
> **사용자**: "standalone 폴더는 모두 교체된거야?"

4 위치 전수 점검 후 **잔재 5 파일 발견** 보고:
- 배포 `~/ypserver/standalone/src/app/api/{sse,v1/data,pm2}/logs/` + `(protected)/logs/` — 5 파일.
- 원인: 제 rsync `--exclude 'data/'` / `'logs/'` 패턴에 leading `/` 앵커 부재. 앵커 없는 패턴은 **어느 깊이**의 동명 디렉토리도 보호 → `src/app/api/v1/data/`, `src/app/api/sse/logs/` 같은 코드 경로까지 `--delete`에서 제외되어 잔재 유지.

**수정**: `scripts/wsl-build-deploy.sh`의 rsync exclude 전부 leading `/` 앵커링으로 변경 — `/.env` / `/data/` / `/logs/`만 배포 루트의 production 자산으로 보호.

수동 정리(`rm -rf ~/ypserver/standalone`) + PM2 재시작 후 nested 완전 제거 확증. `find` 전수 검색 결과 프로젝트 자체 잔재 0건(매치는 정식 npm 패키지 내부 `node_modules/ajv/dist/standalone` 등만).

**결론**: 4 위치 모두 클린. 이 rsync 앵커링 함정은 CK에 교훈으로 편입.

### 토픽 5: 전체 변경 커밋 + 푸시
> **사용자**: "너의 제안대로 해줘" → "commit all changes including not related this session. and push."

2 커밋 체인:
- **`9a37dfb`** `feat(deploy): WSL 빌드 파이프라인 + NFT 네이티브 모듈 정합성 보장` — 본 세션 핵심 3 파일 (pack-standalone.sh, wsl-build-deploy.sh, install-native-linux.sh), 206 추가 / 12 삭제.
- **`de9c962`** `docs(supabase-parity): 27개 문서에 교차 참조 일괄 업데이트` — 본 대화와 무관한 supabase-parity 연구 문서 27건 × 각 +2 lines (ADR-020 백링크 역방향 전파 추정). 사용자 "including not related" 명시에 따라 커밋.

`git add -u`로 민감 파일(.env 등) 우발 포함 방지. `git push origin main` 성공 (`d2a7a99..de9c962 main -> main`).

**결론**: 로컬·원격 동기화 완료, working tree clean.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | L2(WSL 빌드) + L1(self-heal) 조합 | A) L0 band-aid만 / B) L1만 / C) L2만 / **D) L1+L2** | L2는 아키텍처 정합으로 재발 방지, L1은 사용자 실수·수동 수정 경로까지 커버. L1 단독은 NFT 해시 경로 누락 시 무력, L2 단독은 워크플로우 위반 시 무력. 둘의 결합이 비용 대비 가장 견고. |
| 2 | WSL 빌드 디렉토리 위치 | A) `/mnt/e/...` 직접 / B) `~/dev/ypserver-build/` 클론 | NTFS(9P 프로토콜)에서 `npm install` 수 분 소요. ext4 네이티브가 수십 초로 단축. Windows IDE 개발 경험 유지. |
| 3 | helper 보존 방식 | A) find `! -name` 유지 / B) 임시 dir save/restore / C) helpers를 별도 dir로 분리 | `--delete-excluded` 가 `find` preserve 의도를 파기하므로 A 단독은 불가. C는 구조 변경 범위 큼. B가 최소 변경으로 정합 확보. |
| 4 | rsync exclude 앵커링 | 없음(모든 깊이) vs leading `/` (루트만) | 앵커 없으면 `src/app/api/v1/data/` 같은 코드 경로까지 보호 → nested 잔재. 루트 앵커링이 프로덕션 자산 보호 의도와 1:1. |
| 5 | 관련 없는 docs 27건 동일 커밋 여부 | 분리 커밋 vs 단일 chore 커밋 | 사용자 "all changes" 명시 + git add -u 로 민감 파일 차단 + 커밋 메시지에 "이전 세션 누적 편집" 명시로 맥락 기록. |

## 수정 파일 (본 세션 직접 편집)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `scripts/wsl-build-deploy.sh` | 신규 — L2 WSL 네이티브 빌드 파이프라인 (rsync src 동기화 → npm ci → build → pack → rsync 배포 → PM2 재시작, rsync exclude leading `/` 앵커링) |
| 2 | `standalone/install-native-linux.sh` | NFT 해시 디렉토리 자가치유 블록(`sync_native_to_nft`) + hardlink 동일 inode `-ef` 체크. [4/4] 단계 추가. |
| 3 | `scripts/pack-standalone.sh` | helper 5종 임시 디렉토리 save/restore + `mkdir -p "$DEST"` 멱등성 + `--exclude='/standalone/'` nested 재귀 차단 |
| 4 | `docs/solutions/2026-04-25-nft-native-binary-platform-mismatch.md` | 신규 CK — NFT 네이티브 바이너리 플랫폼 불일치 진단·해결 패턴 |

## 수정 파일 (병렬 커밋 — 본 대화 무관)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 5~31 | `docs/research/2026-04-supabase-parity/{00-vision,02-architecture,04-integration,05-roadmap,06-prototyping,07-appendix}/*.md` | 27 파일 × 각 +2 lines — ADR-020 백링크 추정, 이전 세션 누적 편집. |

## 상세 변경 사항

### 1. `scripts/wsl-build-deploy.sh` — L2 메인 경로

6 단계 파이프라인:
1. Windows 워킹트리(`/mnt/e/.../`) → WSL 빌드 디렉토리(`~/dev/ypserver-build/`) rsync (`node_modules/`, `.next/`, `standalone/.next/`, `standalone/node_modules/`, `.git/`, `data/`, `logs/` 등 exclude)
2. `npm ci`(실패 시 `npm install` 폴백)
3. `npm run build` (Next.js 프로덕션 빌드)
4. `bash scripts/pack-standalone.sh`
5. `rsync -a --delete --exclude '/.env' --exclude '/data/' --exclude '/logs/' standalone/ ~/ypserver/` — production 자산 루트 레벨만 보호
6. `pm2 restart ypserver --update-env`

내부에 `. "$NVM_DIR/nvm.sh"` 명시 소싱 — `wsl bash -lc` 환경에서 nvm 자동 로드 실패 대응.

### 2. `standalone/install-native-linux.sh` — L1 안전망

[4/4] 단계 추가:
- `sync_native_to_nft(pkg, rel_path)` 함수 — 정규 `node_modules/<pkg>/<rel_path>`의 `.node`를 `.next/node_modules/<pkg>-*/build/Release/`에 동기화
- `-ef` inode 동등성 체크 — NFT가 hardlink로 묶은 경우 cp "are the same file" 실패 방지
- 현재 대상: `better-sqlite3/build/Release/better_sqlite3.node`
- 멱등성: L2 정상 경로에서는 모든 NFT 디렉토리가 이미 동일 inode → "이미 동일 inode — 스킵" 출력만, no-op

### 3. `scripts/pack-standalone.sh` — 3 버그 수정

(1) helper 5종 임시 save/restore:
```bash
HELPERS=(start.sh README.md ecosystem.config.cjs .env.production.example install-native-linux.sh)
TMP_HELPERS="$(mktemp -d -t standalone-helpers.XXXXXX)"
trap 'rm -rf "$TMP_HELPERS"' EXIT
# backup before find/rsync, restore after
```

(2) nested 재귀 차단: rsync에 `--exclude='/standalone/'` (leading `/` 앵커로 source root 기준).

(3) 멱등성: 첫 빌드(clone) 환경에서 standalone/ 미존재 시 `mkdir -p "$DEST"` 선제 생성.

## 검증 결과

- **빌드 검증**: WSL 네이티브 `next build` 성공 — 77 static pages, 107+ routes 정상 생성.
- **네이티브 바이너리 플랫폼**:
  - `~/ypserver/.next/node_modules/better-sqlite3-90e2652d1716b047/build/Release/better_sqlite3.node` → `ELF 64-bit LSB shared object, x86-64, version 1 (GNU/Linux), BuildID[sha1]=7fdd4a4a...` ✓
  - `~/ypserver/node_modules/better-sqlite3/build/Release/better_sqlite3.node` → 동일 BuildID ELF ✓
- **PM2**: PID 96142, online, ↺=2 (세션 중 재시작 2회 — band-aid 임시 + L2 재배포).
- **로그인 검증**: `POST /api/auth/login` → HTTP 403 `{"error":"CSRF 차단"}` — 핸들러 정상 도달, SQLite dlopen OK.
- **ELF 에러**: 2026-04-25 07:27 (L2 재배포 이후) 이후 **신규 0건**. 기존 6건은 2026-04-19~21 역사 기록.
- **nested 잔재**: `find ~/ypserver -type d -name standalone` → 프로젝트 자체 잔재 0건 (매치는 정식 npm 패키지 내부만).
- **프로덕션 자산 보존**: `.env` / `data/` / `logs/` 모두 원본 유지 (Apr 19 21:52 / 21:56 타임스탬프 그대로).

## 터치하지 않은 영역

- Next.js 소스 코드 (컴포넌트, 라우트 핸들러, lib) — 변경 없음.
- Prisma 스키마 / 마이그레이션 — 변경 없음.
- `next.config.ts` — 변경 없음 (`serverExternalPackages` 유지).
- 프로덕션 DB (`/home/smart/ypserver/data/`) — 보존, 스키마 변경 없음.
- 27 supabase-parity docs — 내용 자체 검토 생략, 사용자 요청에 따라 그대로 커밋.

## 알려진 이슈

- **`~/ypserver/.env` 내용**: DATABASE_URL에 Postgres 패스워드 평문 포함 (`<DB_PASSWORD>`). 로컬 WSL 한정이나 운영 원칙상 rotation 권장.
- **`~/ypserver/data/` 비어 있음**: SQLite DB 파일 부재. 주 DB는 Postgres(DATABASE_URL) 사용 중이며 better-sqlite3는 보조 용도(예: rate-limit 버킷)로 추정되나 DB 파일 경로 미확인. 런타임 동작엔 영향 없으나 cleanup-scheduler "audit log write failed" 일일 메시지와 연관 가능성 있음 — 다음 세션 조사 권장.
- **Windows 측 `standalone/` 워킹트리 untracked 아티팩트**: gitignore 커버로 커밋 무관하나 로컬 파일시스템 어지러움. 정리는 다음 세션 재량.
- **NFT 해시 디렉토리명 변동 가능성**: 현재 `better-sqlite3-90e2652d1716b047`은 content-addressed로 빌드마다 안정적이지만 Next.js 업그레이드 시 해시 알고리즘 변경 가능 — `install-native-linux.sh`는 glob 패턴(`better-sqlite3-*`)으로 이미 방어됨.

## 다음 작업 제안

- **S53**: WSL `~/ypserver/data/` SQLite DB 위치 조사 + cleanup-scheduler "audit log write failed" 원인 진단. 현재 일일 03:00 반복 기록 중(기능 영향 無로 추정되나 미확인).
- **S53 (선택)**: 브라우저에서 stylelucky4u.com 실제 로그인 E2E 검증 (CSRF 토큰 포함 풀 플로우) — L2 배포 후 엔드 투 엔드 확증.
- **S53 (선택)**: `~/ypserver/.env` Postgres 패스워드 rotation. 현재 로컬 WSL 한정이나 운영 원칙상 정기 교체 권장.
- **S53+ 이월 (S51에서)**: `/kdywave --feedback` 정식 모드 — 36 잔여 파일 ADR-020 cross-reference 일괄. Windows 재부팅 자동복구 실증(S50 이슈 #2). S50/S49 이월 사안들(pm2-logrotate, KEK 퍼즐 등).

---

[← handover/_index.md](./_index.md)
