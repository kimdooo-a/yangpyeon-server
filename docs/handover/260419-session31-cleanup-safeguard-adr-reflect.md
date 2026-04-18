# 인수인계서 — 세션 31 (로컬 정리 + /ypserver safeguard + 세션 30 결과 ADR/DQ 반영)

> 작성일: 2026-04-19
> 이전 세션: [session 30](./260419-session30-spike-priority-set.md)
> 저널: [journal-2026-04-19.md §세션 31](../logs/journal-2026-04-19.md)

---

## 작업 요약

세션 30(스파이크 7건)의 후속 정리 + safeguard 내재화 세션. 본 터미널은 L0 (`/ypserver` §4 safeguard) + L1 (`/kdyskillaudit` PASS) + L2의 "놓친 지점"(ADR 통계 테이블 · DQ Resolved 마킹)을 담당하고, 타 터미널은 ADR-019 본문·Auth Advanced Blueprint §7.2·Compound Knowledge 5건을 동시 작성. 충돌 없이 분담 완료.

---

## 대화 다이제스트

### 토픽 1: 프로젝트 규모 확인

> **사용자**: "이 프로젝트 총 코드가 몇줄이야?"

`git ls-files | xargs -n 100 wc -l`로 정확 집계. 결과: **245,699줄 / 585파일**. 내역: 문서(.md) 211,371줄(86%) + TS/TSX 19,393줄(8%, 192파일) + JSON 11,701줄(5%) + 기타 3,234줄(1%).

**결론**: 코드 19K는 Next.js 대시보드 초기~중기 정상 범위. 문서 211K는 이례적으로 방대(OSS 수준의 2~4배) — "역사 삭제 금지" 원칙과 Wave 1~5 리서치 누적(123 문서/106,588줄) 영향.

### 토픽 2: Supabase Studio 소스 존재 여부

> **사용자**: "git에 supabase studio 코드 있어??"

`supabase` 키워드 매칭 204파일 스캔. **전부 리서치 문서**(supabase-scrape 14 + parity 연구 + handover). 코드 파일은 `src/lib/types/supabase-clone.ts` 1건(타입 정의만).

**결론**: Supabase Studio 본 소스는 포함되지 않음. **벤치마킹해서 직접 구현**하는 프로젝트로 확인. 코드 19,400줄은 전부 자체 구현.

### 토픽 3: `/kdyclean` 로컬 아티팩트 정리

> **사용자**: `/kdyclean` → 스캔 결과 확인 후 "진행"

스캔으로 안전 삭제 대상 ~11.4MB + 선택 삭제 대상 1.3GB(`.next/`, `node_modules/`) 분류. 사용자 승인 후 안전 묶음만 삭제:
- `nul`(14KB) + `_CHECKPOINT_KDYWAVE.md.bak`(<1KB) + `tsconfig.tsbuildinfo`(408KB)
- 빈 폴더 3종 (`cp/`, `ls/`, `tmp/` — 과거 오타 명령 흔적)
- `.playwright-mcp/`(492KB, 27 로그) + `test-results/`(9.4MB)
- 루트 `e2e-*.png` × 15 (~1MB)

**발견**: `.playwright-mcp/` 7개 파일이 과거 커밋에 tracked되어 있었음 → 이번 삭제로 git "D" 상태 → 저장소에서도 제거하려면 커밋 필요.

**`.gitignore` 업데이트**: `*.bak` 패턴 추가.

**커밋 `cadb8ad`**: `chore: 로컬 아티팩트 정리 — .playwright-mcp 및 체크포인트 백업 제거`. **핵심 기법**: 기존에 스테이지된 spike-010~016 파일과 섞이지 않도록 `git commit --only -- <pathspec>` 사용.

**결론**: 디스크 11.4MB 회수. 저장소에도 정리 반영. 기존 스테이지 상태 보존.

### 토픽 4: `/kdyguide` 실행 — 세션 작업 라우팅

> **사용자**: `/kdyguide`

Phase 0~3 실행 후 세션 내 실행 가능 범위로 한정(사용자 추가 지시 반영):
- **제외 (별도 세션 위임)**: Phase 15 Auth Advanced 22h, SP-013/016 물리 측정 13h, `/kdygenesis --from-wave` 수h
- **세션 내 가능 3항**: `/ypserver` safeguard / ADR·DQ 배치 반영(~2h) / Compound Knowledge 5건(~2h)

**Option A DAG 채택**:
```
L0: /ypserver safeguard 보강
L1: /kdyskillaudit (safeguard 검증)
L2: ADR/Blueprint/DQ 배치 반영
L3: Compound Knowledge 5건  ← 타 터미널 진행 중, 본 세션 제외
L4: /cs 세션 종료
```

**결론**: Option A로 진행. L3는 타 터미널이 담당.

### 토픽 5: L0 — `/ypserver` §4 PM2 safeguard 신설

세션 30 실증 사고(`pm2 delete all --namespace sp010` → 프로덕션 dashboard + cloudflared 동시 삭제) 기반으로 글로벌 `~/.claude/skills/ypserver/SKILL.md`에 **§4 운영 safeguard — PM2 파괴적 명령 가드** 신설. 78줄 / 5 서브섹션:

| § | 제목 | 핵심 |
|---|------|------|
| 4-1 | 절대 금지 명령 | `pm2 delete all`, `pm2 delete all --namespace X`, `pm2 stop all`, `pm2 kill` 4종 전면 금지 |
| 4-2 | 실증 사고 (2026-04-19 SP-010) | PM2 v6.0.14 버그 기록. 향후 버전 수정되어도 방어 규칙 유지 |
| 4-3 | 허용 대안 | 이름 개별 지정 `pm2 delete sp010-fork sp010-cluster-0`. `pm2 list` 확인 2단계 |
| 4-4 | 실행 전 의무 4단계 | list 스냅샷 → dashboard/cloudflared 포함 여부 → `all`/`--namespace` 즉시 거부 → 실행 후 list 재확인 |
| 4-5 | 복구 절차 3순위 | `pm2 resurrect` → 수동 기동 → `pm2 save` + 헬스체크 |

description 앞부분에 `⚠ pm2 delete all 사용 금지 — 세션 30 실증 버그` 경고 추가.

**결론**: 글로벌 스킬(git 미추적)에 safeguard 내재화. 에이전트가 `/ypserver` 경유 troubleshooting 시 자동 인지.

### 토픽 6: L1 — `/kdyskillaudit` 검증

대상: 수정된 `~/.claude/skills/ypserver/SKILL.md` (275줄, scripts/ 없음).

5 Phase 스캔:

| Phase | 항목 | 결과 |
|:---:|---|:---:|
| 1 | 프롬프트 인젝션 (ignore/override 등) | 0 hit |
| 2 | 커맨드 인젝션 (`curl\|sh`, `rm -rf /`, `eval`) | 0 hit |
| 3 | 크레덴셜 접근 (`ANTHROPIC_API_KEY`, `~/.ssh`, `process.env`) | 0 hit |
| 4 | 권한 상승 (`sudo`, `chmod 777`, `--no-verify`, `--force`) | 0 hit |
| 5 | 외부 전송 (`curl/wget POST`) | 0 hit |

**판정: ✅ PASS** (FAIL 0, WARN 0). 산출: `docs/security/skill-audit-2026-04-19.md`.

§4의 `pm2 delete`/`pm2 resurrect` 코드 블록은 문서 예시로서 에이전트 자동 실행 대상이 아니므로 FAIL 패턴 매칭에 걸리지 않음.

**결론**: safeguard 섹션은 안전 통과. 감사 파일 영구 보존.

### 토픽 7: L2 — ADR/Blueprint/DQ 배치 반영

next-dev-prompt 우선순위 4 전체 항목 대상. 작업 시작 후 **다른 터미널이 병렬로 동일 작업 중임을 발견**:

- **타 터미널 담당** (중복 회피): ADR-019 본문 / ADR-009 RESOLVED 마킹 / ADR-006/008/010/013/015 §세션 30 보완 / Auth Advanced Blueprint §7.2.1~7.2.3 / Compound Knowledge 5건
- **본 터미널 담당** (놓친 지점 집중):
  - `DQ-AC-1 Resolved` (argon2 Phase 17)
  - `DQ-AC-2 Resolved` (Session 복합 인덱스 + cleanup job)
  - `DQ-4.1 Resolved 조건부 Go` (cluster:4 트리거 + PM2 safeguard 규칙 인용)
  - `DQ-12.4 Resolved 현 시점 불필요` (hit 99%에서 Workers 캐시 ROI 낮음, 재도입 트리거 2건 정의)
  - ADR §0.4 요약 테이블 ADR-019 행 추가
  - ADR §4.1 Auth Core 카테고리 (006/017 → 006/017/**019**)
  - ADR §4.2 Accepted 18 → **19**
  - ADR §4.3 Phase 17 (006/008 → 006/008/**019**)
  - ADR §4.4 트리거 45 → **48** (ADR-009 SP-012 해소 명시)
  - ADR §5 예상 목록 번호 재정렬 (기존 019→020, argon2 항목 제거)

**결론**: 충돌 없이 분담 완료. 타 터미널 `89392f7` 커밋에 본 세션 작업까지 통합 병합.

### 토픽 8: L3 — Compound Knowledge 5건 (타 터미널)

본 세션 직접 산출 없음. 타 터미널 커밋 `67731da`에 5건 작성 완료:
- `2026-04-19-pg-partial-index-now-incompatibility.md` (SP-015)
- `2026-04-19-napi-prebuilt-native-modules.md` (SP-011)
- `2026-04-19-pm2-delete-all-namespace-bug.md` (SP-010)
- `2026-04-19-isolated-vm-v6-node24-wsl2-verified.md` (SP-012)
- `2026-04-19-jwks-grace-endpoint-vs-client-cache.md` (SP-014)

본 세션 역할: **forward reference 연결만**. `/ypserver` §4-5, ADR-019, DQ-12.4/AC-2 확정 답변에서 각 CK 파일 인용.

**결론**: 지식 중복 방지. 본 세션은 "사용"만, 타 터미널이 "생산".

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | `/kdyclean` 안전 묶음만 실행 | 안전/전체 | `.next`(191MB) + `node_modules`(1.1GB)는 재설치 비용 크고 개발 중단됨 — 후순위 |
| 2 | `git commit --only` 분리 커밋 | 전체 스테이지 일괄 / only pathspec | 기존 스테이지된 spike-010~016 unrelated 파일 섞이지 않도록 |
| 3 | Option A 채택 (safeguard 우선) | Option A(안전) / Option B(문서) | 프로덕션 삭제 실증 사고 직후 — 재발 방지 최우선 |
| 4 | `/ypserver` §4 5단 구조 | 경고 한 줄 / 독립 섹션 | 에이전트 판단 기준을 금지→사고→대안→체크→복구로 분해, /kdyskillaudit PASS 유지 |
| 5 | ADR 번호 ADR-019 확정 | 019 (규칙 §3.1) / 022 (§5 forecast) | §3.1 "현재 019부터" 규칙 우선. §5 forecast 번호 한 칸씩 내림 |
| 6 | L3 CK 5건 본 세션 제외 | 타 터미널과 병렬 / 본 세션 수행 | 사용자 명시 지시 "다른 터미널 진행 중" — 중복 방지 |

---

## 수정 파일 (본 터미널 직접 작업)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `.gitignore` | `*.bak` 패턴 추가 |
| 2 | (삭제) `nul` / `_CHECKPOINT_KDYWAVE.md.bak` / `tsconfig.tsbuildinfo` | 루트 임시 파일 |
| 3 | (삭제) `cp/`, `ls/`, `tmp/` | 빈 폴더 |
| 4 | (삭제) `.playwright-mcp/` (27 파일) | MCP 콘솔 로그 |
| 5 | (삭제) `test-results/` (9.4MB) | Playwright 테스트 결과 |
| 6 | (삭제) `e2e-*.png` × 15 | 루트 디버그 스크린샷 |
| 7 | `~/.claude/skills/ypserver/SKILL.md` (글로벌, git 미추적) | §4 운영 safeguard 78줄 신설 + description 경고 |
| 8 | `docs/security/skill-audit-2026-04-19.md` (신규) | 감사 PASS 보고서 |
| 9 | `docs/research/2026-04-supabase-parity/00-vision/07-dq-matrix.md` | DQ-AC-1/AC-2/4.1/12.4 Resolved (4건) |
| 10 | `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` | §0.4 / §4.1 / §4.2 / §4.3 / §4.4 / §5 통계·Phase 매핑 ADR-019 동기화 (6 지점) |

### 타 터미널 작업 (본 세션 기간 병합 커밋)

- `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` — ADR-019 본문 (약 50줄)
- `docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md` — §7.2.1~7.2.3 신설
- `docs/research/2026-04-supabase-parity/06-prototyping/01-spike-portfolio.md` — 상태 업데이트
- `docs/research/2026-04-supabase-parity/07-appendix/02-dq-final-resolution.md` — 반영
- `docs/solutions/2026-04-19-*.md` × 5 — CK 5건 신규

### 세션 31 /cs 메타 커밋 (본 단계)

- `docs/status/current.md` — 세션 31 행 추가
- `docs/logs/2026-04.md` — 세션 31 엔트리 추가
- `docs/logs/journal-2026-04-19.md` — 세션 31 섹션 append
- `docs/handover/260419-session31-cleanup-safeguard-adr-reflect.md` — 본 인수인계서 신규
- `docs/handover/_index.md` — 세션 31 링크 추가
- `docs/handover/next-dev-prompt.md` — 갱신

---

## 상세 변경 사항

### 1. `/ypserver` §4 운영 safeguard (핵심)

§4-1 ~ §4-5 5 서브섹션. 에이전트가 `/ypserver` 호출 중 또는 연관 troubleshooting 중 `pm2 delete` 시도 시 이 섹션이 판단 기준. 상세는 `~/.claude/skills/ypserver/SKILL.md:187-269` 참조.

### 2. ADR 통계 동기화 (6 지점)

argon2id 전환이 ADR-019로 확정되면서 §0.4 요약 / §4.x 통계 / §5 forecast 전면 동기화. ADR-009 재검토 트리거 1 (`isolated-vm v6 Node 24 ABI 호환`)은 SP-012 실측으로 RESOLVED 마킹 유지.

### 3. DQ 4건 Resolved

SP-011/015/010/014 실측 인용 + 확정 답변 1~2문단 + Compound Knowledge forward reference.

---

## 검증 결과

- `/kdyskillaudit ~/.claude/skills/ypserver/SKILL.md` — **PASS** (5 Phase 0/0/0/0/0, `docs/security/skill-audit-2026-04-19.md`)
- `git status` — working tree clean (타 터미널 `89392f7` 병합 후)
- `git log --oneline -4` — `89392f7` / `67731da` / `8a14424` / `cadb8ad` 연속 기록
- ADR §4.2 Accepted 19건과 `^### ADR-` grep 19매치 일치 확인

---

## 터치하지 않은 영역

- `.next/` (191MB) — 개발 빌드 캐시, 재실행 시 자동 재생성하지만 이번엔 유지
- `node_modules/` (1.1GB) — 재설치 2~5분 비용으로 유지
- `skeleton-*.png` × 5 — git tracked, "역사 삭제 금지" 원칙상 보존
- `docs/logs/` — 세션 기록 영구 보존
- Phase 15 Auth Advanced MVP 구현 — 22h 단일 세션 초과로 미착수
- SP-013 wal2json / SP-016 SeaweedFS 물리 측정 — 별도 환경 필요

---

## 알려진 이슈

- **`.playwright-mcp/` 과거 tracked 파일 7건**: 이번 `cadb8ad` 커밋으로 저장소에서 완전 제거됨. `.gitignore`의 `/.playwright-mcp/` 규칙은 신규 파일만 막으므로 기 tracked 파일은 명시적 `git rm` 또는 working dir 삭제 + 커밋 필요했음
- **글로벌 스킬은 git 미추적**: `~/.claude/skills/ypserver/SKILL.md` 수정은 저장소에 기록되지 않음. 본 인수인계서가 유일한 change log. 다른 머신 동기화는 `kdysync` 필요
- **병렬 터미널 분담 주의**: 타 터미널과 같은 파일 동시 편집 시 "File has been modified" 오류 경험(세션 31 중 ADR-019 본문 작성 시점). **큰 리팩토링 시 사전 영역 분할 필요**

---

## 다음 작업 제안

### 우선순위 1: Phase 15 Auth Advanced MVP (22h, 즉시 착수 가능)

세션 30 스파이크 결과가 이미 ADR-019 / Blueprint §7.2 / DQ Resolved에 반영되어 구현 순서 명확:

1. **Prisma Session 모델** (1h) — SP-015 Go 기준: SHA-256 hex + `(userId, expiresAt)` 복합 인덱스 + cleanup job
2. **argon2id 도입** (3h) — ADR-019 기준: `@node-rs/argon2` + `verifyPassword()` 점진 마이그레이션
3. **JWKS endpoint** (4h) — SP-014 조건부 Go: `/api/.well-known/jwks.json` + ES256 + endpoint grace
4. **TOTP** (8h) — `otplib` + QR + 백업 코드 + 강제 해제
5. **WebAuthn** (10h) — `@simplewebauthn/server` + Passkey 등록/인증
6. **Rate Limit** (4h) — PostgreSQL 기반

상세: `docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md`

### 우선순위 2: SP-013/016 물리 측정 (13h, 별도 환경 필요)

- SP-013 wal2json (5h) — PG + wal2json + 30분 DML 주입 + 슬롯 손상 recovery
- SP-016 SeaweedFS 50GB (8h) — weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 3: `/kdygenesis --from-wave` 연계

입력: `docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md` (85+ 태스크 초안) → 주간 실행 플로우

### 세션 31 직접 후속 (소규모)

- `ypserver` 스킬에 `--help` 플래그 추가 고려 (safeguard 규칙 조회용)
- `docs/security/` 디렉토리에 감사 이력 추적용 `_index.md` 생성 고려

---

[← handover/_index.md](./_index.md)
