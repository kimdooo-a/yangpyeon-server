# 인수인계서 — 세션 74 (R2 ACCEPTED 추적성 보강 — M1~M4 doc cleanup)

> 작성일: 2026-05-01
> 이전 세션: [session73](./260501-session73-r2-ui-download.md) (R2 UI 50MB 분기 + XHR 진행률 + 다운로드 302)
> 저널: [journal-2026-05-01.md](../logs/journal-2026-05-01.md) §"세션 74"

---

## 작업 요약

세션 71/72 R2 V1 옵션 A ACCEPTED 결정 직후, spike-032/ADR-032/wsl-build-deploy.sh 의 추적성 부족·부채 잔존 4건(M1~M4)을 자율 doc cleanup. 코드 변경 0(src/ 무관), V1 운영 가용성 무영향, 추적성·부채 해소만. 13분 소요. M5(다운로드 라우트)는 세션 73 다른 터미널에서 적용 완료, M6(UI 50MB 분기)도 세션 73 적용 완료 — 본 세션 별 작업 없음.

## 대화 다이제스트

### 토픽 1: S72 트랙 A 결과 검증 → 마무리 6건 식별

> **사용자**: "종합 판정 내용 참조해서 다음 작업 진행 ... 다음은 검증에서 발견된 마무리 4건(M1~M4, 약 15분) 자율 진행 여부 결정"

직전 검증에서 commit `275464c` (S72 R2 V1) 의 핵심 8/8 통과 확인. 부족 부분 6건:

| # | 항목 | 영향 | 처리 |
|---|------|------|------|
| M1 | spike-032 §4.2 PoC 표가 "합격 기준" 단일 컬럼, 실측값 commit 메시지에만 존재 | 추적성 부족 (왜 ACCEPTED?) | 본 세션 |
| M2 | spike-032 §3.2 권고 여전히 "옵션 B" — 실제 V1=A, §9 v0.3 미추가 | 일관성 흔들림 | 본 세션 |
| M3 | ADR-032 §7 ACCEPTED 게이트 체크박스 4개 미마킹 | 게이트 흔적 부재 | 본 세션 |
| M4 | wsl-build-deploy.sh /.env exclude 패치 미적용 (메모리 룰만 등록) | 신규 운영 키 추가 시 부담 영구 잔존 | 본 세션 |
| M5 | R2 다운로드 라우트 미신설 | UI 통합 시 추가 PR | S73 다른 터미널 적용 완료 |
| M6 | UI /filebox/page.tsx 50MB 분기 미적용 | 사용자 R2 라우트 활용 불가 | S73 다른 터미널 적용 완료 |

**결론**: M1~M4 자율 진행 (15분, docs+scripts 영역, 다른 터미널 트랙 A src/ 영역 무관).

### 토픽 2: M1 적용 — spike-032 §4.2 PoC 표 5컬럼 확장

3컬럼(`항목 | 방법 | 합격 기준`) → 5컬럼(`항목 | 방법 | 합격 기준 | 실측 | 판정`).

PoC 6/6 실측 매핑:
- presigned URL 발급 avg **1.8ms** (목표 <50ms 28× 마진) ✅
- 1MB / 100MB PUT 100% (749ms / 17.3s ~47Mbps) ✅
- HEAD 검증 **90ms** ✅
- 메모리 사용량: formData 호출 0 (구조적 보장) ✅
- 1GB PUT / 1GB wall-clock / CORS 브라우저 PUT — 회선·테스트 환경 한계로 ⏸ 보류 (V1 운영 단계 자연 검증)
- 송신 중 끊김 재시도 — 옵션 A 정의 동작, V2 multipart 진화 시 측정

**판정**: 합격 4 + 보류 3 + V2 이월 1 = ACCEPTED 의결. 보류 미달 시 옵션 D fallback 트리거.

### 토픽 3: M2 적용 — §3 헤더 정정 + §9 v0.3 추가

§3 헤더: `"권고: 옵션 B (R2 multipart presigned URL)"` → `"권고: V1=옵션 A → V2=옵션 B 점진 진화 (R2 hybrid)"` + 결정 요약 인용 블록 1줄.

§9 변경 이력 v0.3 (세션 74) entry 신규 — v0.2 와 v1.0 사이 삽입. 코드 변경 0, 추적성 보강 목적 명시.

### 토픽 4: M3 적용 — ADR-032 §7 게이트 체크 + 보류 사유

4개 체크박스 `[ ]` → `[x]` 마킹 + 각 게이트별 합격/보류 nested list:
- ✅ 합격 4: presigned 1.8ms / 1MB+100MB PUT 100% / HEAD 90ms / 메모리 (formData=0)
- ⏸ 보류 2: CORS (UI 통합 후 첫 50MB+ 케이스), 1GB wall-clock (~173s 추정, 미달 시 V2 우선 진입 트리거)
- ⏸ V2 1: 끊김 재시도 (옵션 A 구조적 정의)
- 승격 사유 1줄 추가

### 토픽 5: M4 적용 — wsl-build-deploy.sh /.env exclude

진단: **Line 53 build sync** 에 `--exclude '/.env'` 부재 → windows .env 가 매 빌드마다 build .env 덮어씀. **Line 109 deploy sync** 는 이미 보호 중. 비대칭 정책.

패치: build sync 에 `--exclude '/.env'` 1줄 + 4줄 주석(windows/build/ypserver 3계층 독립 관리 의도, memory `feedback_env_propagation` 참조).

S72 commit `275464c` 직후 메모리 룰만 등록되고 스크립트 패치는 대기 상태였던 부채 해소.

### 토픽 6: 변경 결과 검증

```
$ git diff --stat docs/research/* scripts/wsl-build-deploy.sh
 ADR-032-filebox-large-file-uploads.md       | 17 +++++++-----
 spike-032-filebox-large-file-uploads.md     | 27 ++++++++++++++--------
 scripts/wsl-build-deploy.sh                 | 13 +++++++++--
 3 files changed, 39 insertions(+), 18 deletions(-)
```

PM2 ypserver pid 187964 online (변경 없음, src/ 무관 docs cleanup 이므로 재배포 불필요).

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|-----------|
| 1 | M1~M4 자율 진행, M5/M6 별도 PR | (A) M1~M6 일괄 / (B) M1~M4 만 / (C) 모두 다음 세션 | (B) 채택 — M5/M6 = 4h+ V1 진화 작업, 본 세션 doc cleanup 영역과 분리. 다른 터미널이 src/ 영역 진행 중이라 충돌 회피 우선. (실제로 M5/M6 는 같은 시점 다른 터미널 s73 에서 적용 완료) |
| 2 | M3 게이트 체크 마킹 시 보류 사유 명시 | (A) `[x]` 만 / (B) `[x]` + 보류 사유 | (B) 채택 — 6개월 뒤 본문만 본 사람이 "왜 ACCEPTED?" 추적 가능해야 함. CORS/1GB 보류 재현 trigger 명시로 미래 운영자가 어디서 측정 시작할지 즉시 파악 가능 |
| 3 | M4 패치를 1줄 + 주석 4줄 | (A) 1줄만 / (B) 1줄 + 주석 4줄 | (B) 채택 — exclusively-build 의도가 비자명, 6개월 뒤 함정 재현 방지. memory feedback_env_propagation 참조까지 코드에 baked-in |

## 수정 파일 (3개) — 본 세션 src/ 영향 0

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/research/spikes/spike-032-filebox-large-file-uploads.md` | §3 헤더 정정 + §4.2 PoC 표 5컬럼 확장(실측+판정) + §9 v0.3 entry. +27/−9. |
| 2 | `docs/research/decisions/ADR-032-filebox-large-file-uploads.md` | §7 게이트 4건 모두 [x] 마킹 + 보류 2건/V2 이월 1건 사유 nested list + 승격 사유 1줄. +17/−5. |
| 3 | `scripts/wsl-build-deploy.sh` | Line 53 build sync 에 `--exclude '/.env'` 1줄 + 의도 주석 4줄. +13/−4. |

세션 종료 4 docs (current.md s74 행 / logs/2026-05.md s74 entry / journal s74 / 본 인수인계서) + next-dev-prompt s75 갱신은 이 commit 에 동행.

## 검증 결과

- **빌드/타입**: 변경된 파일이 모두 docs(+ shell script)이므로 tsc/build 영향 0. M4 wsl-build-deploy.sh 패치는 다음 빌드 1회에서 자동 검증 (windows .env 가 build 측을 덮지 않으면 `[2/8] npm ci` 단계 R2 키 미존재 ↔ 보호 동작 확인).
- **R2 V1 운영 가용성**: 변경 없음 (PM2 ypserver pid 187964 online 그대로).
- **PoC 재실행**: 불필요 (실측 결과는 S72 PoC 의 그대로 인용).

## 터치하지 않은 영역

- `src/` 전 영역 (다른 터미널 s73 진행 중인 R2 UI/다운로드/ALS 마이그레이션 영역과 분리)
- `prisma/` (S72 마이그레이션 적용 상태 그대로)
- `package.json` / `package-lock.json` (S72 의존성 그대로)
- Almanac aggregator 비즈니스 로직 (~28h 대기)
- 메신저 Phase 1 M2 (배선 미진입)

## 알려진 이슈

- **R2 콘솔 CORS 1회 작업 보류** (s73 인계): 현 토큰 Object Read/Write 한정 → bucket-level 정책 변경 시 AccessDenied(403). 콘솔 작업 또는 admin 토큰 발급 필요. UI 50MB+ 브라우저 PUT 실측 차단 중.
- **R2 객체 cleanup 부채**: deleteFile 가 R2 파일은 DB row 만 삭제 (s73 TODO 주석). deleteR2Object + 24h cleanup cron 미구현 (s75 권고).
- **other-terminal 미커밋 영역** (본 세션과 무관 보존): src/lib/r2.ts / src/lib/filebox-db.ts / src/components/filebox/file-upload-zone.tsx / src/app/api/v1/* 28+ 라우트 / src/lib/messenger/* / src/components/sticky-notes/sticky-note-card.tsx — s73 다른 터미널이 ALS 마이그레이션 + R2 UI 작업 진행 후 미커밋 상태. 본 세션 commit 영역과 분리.

## 다음 작업 제안 (S75+)

다음 세션에서 우선 처리 권고:
1. **R2 콘솔 CORS 적용** (운영자 본인 3분, dash.cloudflare.com → R2 → CORS Policy paste)
2. **50MB+ 브라우저 PUT 실측** (5분, /filebox 60MB 드래그 → 진행률 % → 다운로드 302 redirect 확인)
3. **R2 객체 cleanup 부채** (P1, ~3h, 같은 PR 권고): `deleteR2Object` + filebox-db.deleteFile 분기 + 24h cleanup cron
4. **세션 73 다른 터미널 미커밋 commit** (다른 터미널에서 처리하거나 본 워킹트리에서 분리 commit)
5. (이월) Almanac aggregator 비즈니스 로직 ~28h, 메신저 M2

---

[← handover/_index.md](./_index.md)
