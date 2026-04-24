# 인수인계서 — 세션 51 (kdywave 문서 이행도 평가 + ADR-020 신설 + 로드맵 공수 재보정)

> 작성일: 2026-04-25
> 이전 세션: [session50](./260419-session50-standalone-package.md) (2026-04-19, 6일 공백)
> 저널: 본 세션은 저널 미작성, 대화 히스토리만으로 작성

---

## 작업 요약

사용자 요청 "kdywave 문서 이행도 평가" → 3중 Wave 산출물(platform-evolution / supabase / 2026-04-supabase-parity, 누적 185+ 문서) 진행 vs 실 구현 상태를 비교 평가하여 종합 등급 **A-(85/100)** 산출. 이행 강점(역방향 피드백 0건, Phase 15 1주 압축 완수)과 결함 3건(ADR-015 vs 실구현 불일치, Git 태그 누락, 2주 회고 미시행)을 식별. 사용자 "즉시 권장 조치 순차적 모두 진행" 지시에 따라 **(1) ADR-020 신설 + ADR-015 부분 대체 + 5개 핵심 산출물 cross-reference, (2) Git 태그 v0.1.0-alpha.0/alpha.1/alpha.2 소급 부여 + 원격 push, (3) 로드맵 §1.2/§8.1.1/§13/§14.3 재보정(시나리오 A/B 병기)** 6개 작업 모두 자율 완료. 커밋 2건(7a45c7b, 7d68b00) + 태그 3건 원격 push 완료.

## 대화 다이제스트

### 토픽 1: kdywave 문서 이행도 평가 요청

> **사용자**: "kdywave 문서 이행도 평가."

**스킬 로드 + 병렬 탐색**: `kdywave` 스킬 invoke → 프로젝트 내 `_CHECKPOINT_KDYWAVE*.md`, `**/wave*.md`, `docs/**/*.md` 병렬 Glob 탐색.

**3중 Wave 레이어 발견**:

| 레이어 | 규모 | 산출물 | 완결 |
|------|------|------|------|
| platform-evolution-wave | S | 20문서 / 3Wave | 2026-04-06 |
| supabase-wave | M | 42문서 / 4Wave | 2026-04-06 |
| **2026-04-supabase-parity** | **L** | **123문서 / 5Wave / 106,588줄** | **2026-04-18** |

**평가 근거 추출**:
- `_CHECKPOINT_KDYWAVE.md`: Wave 5 완료 + cumulative 123/106588 + 역방향 피드백 0건 명시
- `README.md`: 14 카테고리 1순위 채택 + Wave 5 25문서 인덱스 + Compound Knowledge 5건
- `00-roadmap-overview.md`: 50주 × 870h × Phase 15-22 캘린더 + Week 0 체크리스트 7항목
- `260419-session50-standalone-package.md`: 세션 50 상세 (Capistrano 미진입 → standalone 채택)

**평가 차원 6종**:

| 차원 | 등급 | 코멘트 |
|------|------|------|
| Wave 리서치 산출 | **A+** | 117% 초과, 역방향 피드백 0건, DQ 100% 해결 |
| Phase 15 MVP 실행 | **A+** | 22h 계획을 추가 견고화 포함 1주 내 완료 |
| Phase 16 Obs/Vault | **A-** | Vault 완결, KEK 일치 이슈 1건 잔존 |
| Phase 16b Ops (ADR-015) | **C** | standalone+rsync 대체 경로 채택 → ADR 갱신 누락 |
| 거버넌스 (태그/회고) | **B-** | Git 태그 미생성, 2주 회고 미시행 |
| **전체** | **A- (85/100)** | 리서치·실행 우수, 변경 기록 추적 결함 |

**이행 리스크 3건 식별**:
- **R1 ADR-015 vs 실구현 불일치 (High)**: 로드맵 §2.2/§10.2의 Capistrano symlink 5초 롤백 → 실제는 rsync + pm2 reload (세션 50)
- **R2 standalone 700-패키지 인플레이션 (Medium)**: 131MB → ~400MB (세션 50 install-native-linux.sh fallback)
- **R3 계획외 대규모 리팩터 (Medium)**: 세션 40-44 timestamptz 캐스케이드(5세션) — Wave 4 ERD 마이그레이션 35-39h 추정 외

**즉시 권장 조치 3건 제시**:
1. ADR-019 등록 + ADR-015 재검토 트리거 기록 (kdywave --feedback 모드)
2. Git 태그 소급 생성 (v0.1.0-alpha.0/alpha.1/alpha.2)
3. 로드맵 공수 재보정 (버퍼 20→25%, 또는 실측 속도 반영)

**결론**: 보고서 출력 완료, 사용자 결정 영역으로 권장 조치 제시.

### 토픽 2: 즉시 권장 조치 순차적 모두 진행

> **사용자**: "즉시 권장 조치 순차적 모두 진행."

**TaskCreate 3건 생성** + sequential 실행.

**Task 1 — ADR-020 신설 (ADR-019는 점유 중 발견 → 020으로 변경)**:
- `01-adr-log.md` 검색 결과 ADR-019가 이미 argon2id 전환에 점유 (세션 30, SP-011 기반)
- TaskUpdate로 작업명 "ADR-019 등록" → "ADR-020 등록"으로 갱신
- 5개 편집:
  - §0.4 요약 표에 ADR-020 행 추가 (Phase 16, "Supersedes ADR-015 부분")
  - ADR-015 본문에 "**세션 50 (2026-04-19) 보완 — 배포 경로 부분 대체**" 블록 + 4 재진입 트리거 정량화 (rsync 미정합/롤백 부재/사용자 2명+/canary 분기)
  - ADR-020 신규 본문 (컨텍스트·결정·대안·결과·근거·트리거·후속 P0 4건)
  - §3.1 다음 ADR 번호 020→021로 갱신
  - `05-rollout-strategy.md` 헤더에 부분 대체 통지 + ADR-020 링크

**Task 2 — Git 태그 소급 3건**:
- 매핑:
  - `v0.1.0-alpha.0` → `b4287b0` (세션 31 cs마감, Phase 15 착수 직전)
  - `v0.1.0-alpha.1` → `9d2a61e` (세션 39 cs마감, Phase 15 Auth Advanced 완결)
  - `v0.2.0-alpha.2` → `c4794d4` (세션 48 cs마감, Phase 16a Vault 완결)
- 모든 태그 메시지에 "소급" 명시 + 로드맵 §·SP 매핑 + 완료 기능 목록
- 사용자 결정 영역(외부 가시성)으로 push는 보류 → 토픽 3에서 push 승인

**Task 3 — 로드맵 공수 재보정**:
- §8.1 제목 갱신: "버퍼 20% → 25%로 상향 (2026-04-25 재보정)"
- §8.1.1 신설 (계획외 공수 + 실측 속도 + 시나리오 A/B 병기):
  - 계획외 공수 +46h 표 (timestamptz 캐스케이드 +20h, HS256 제거 +6h, Phase 15-D 보강 +12h, standalone +8h)
  - 실측 속도 비교 (계획 20h/주 → 실측 ~50h+/주, Phase 15 -85% 단축)
  - **시나리오 A**: 버퍼 25% + 916h × 1.25 / 20h/주 = 53~54주
  - **시나리오 B**: 916h / 50h/주 × 1.25 = 22.9주 → 25주 GA 가능
  - 측정 지표 3건 (코딩 시간/세션 수/계획외 비율)
- §1.2 핵심 수치 갱신 (50주 → 25-54주, 870h → 916h)
- §13 위험 신호 2건 추가:
  - **하향 이탈 -50%**: 빠른 진행이 곧 품질 보장 아님 (예: standalone 인플레이션)
  - **계획외 작업 비율 15% 초과**: Phase 17 종료 시 측정 → ADR 흡수 (예: ADR-019, ADR-020)
- §14.3 거버넌스 추가:
  - Phase 완료 시 git 태그 생성 의무
  - `git log --since=phase-start --until=phase-end --shortstat` 통계 자동 측정

**3 작업 완료 보고**: 5개 파일 변경 / 태그 3건 / 다음 권장 3건(push, 일괄 커밋, kdywave --feedback) 제시.

### 토픽 3: "모두 진행" — 후속 3건 일괄 자율 실행

> **사용자**: "모두 진행"

**TaskCreate 3건 추가** (#4 일괄 커밋, #5 태그 push, #6 kdywave --feedback 전파).

**#4 일괄 커밋**:
```
7a45c7b  docs(adr,roadmap): kdywave 이행도 평가 후속 — ADR-020 신설 + ADR-015 부분 대체
         + 공수 시나리오 A/B 병기
```
3 파일 변경 / 126 insertions / 6 deletions. HEREDOC + Co-Authored-By 표준 메시지.

**#5 원격 push**:
```
git push origin main && git push origin v0.1.0-alpha.0 v0.1.0-alpha.1 v0.2.0-alpha.2
→ c4b90f7..7a45c7b  main -> main
→ * [new tag]  v0.1.0-alpha.0 / alpha.1 / alpha.2
```
모두 정상 push.

**#6 kdywave --feedback 전파**:
- Grep으로 41 파일이 ADR-015/Capistrano 언급 발견
- 영향력 큰 5개 핵심에만 cross-reference 추가 (Wave 1 deep-dive와 _archived/는 역사 보존):
  1. `01-adr-log.md §2 의존 그래프`: ADR-015 → ADR-020 부분 대체 화살표
  2. `01-adr-log.md §0.4 카테고리 매핑`: Operations 행에 ADR-020 추가
  3. `01-adr-log.md §0.4 Phase 매핑`: Phase 16 ADR 목록에 ADR-020 추가
  4. `README.md` row 14 Operations: Capistrano-style → standalone+rsync로 채택 갱신
  5. `02-architecture/05-operations-blueprint.md` 헤더: 부분 대체 경고 + ADR-020 링크
  6. `04-integration/02-cloudflare-deployment-integration.md` 헤더: 동일 경고

```
7d68b00  docs(kdywave-feedback): ADR-020 신설 사실 5개 핵심 산출물에 역방향 전파
```
4 파일 / 10 insertions / 6 deletions. push 완료.

**최종 결과**: 6개 작업 모두 완료, 커밋 2건 / 태그 3건 / 5개 핵심 산출물 동기화 / 변경 cross-reference 100% 정합.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 권장 조치 명세를 ADR-019 → ADR-020 으로 변경 | A) 사용자 권장대로 ADR-019 / B) 충돌 회피 ADR-020 | B. 검색 결과 ADR-019가 이미 argon2id 전환(세션 30 SP-011)에 점유 — 사용자 권장은 일반화 표기였고, "역사 삭제 금지" 원칙상 기존 ADR-019 본문은 보존하고 신규 020 신설이 정답. TaskUpdate로 작업명 갱신. |
| 2 | ADR-015를 Deprecated가 아닌 "부분 Superseded"로 처리 | A) Deprecated / B) Superseded 전체 / C) Superseded 부분만 | C. ADR-015의 *PM2 cluster:4 + canary 서브도메인* 부분은 그대로 유효 — Capistrano-style symlink/releases 부분만 ADR-020에 의해 대체. 정확한 표현 = "부분 대체". |
| 3 | Capistrano 본문(05-rollout-strategy.md §3·§6)을 삭제하지 않고 "유보 자산"으로 보존 | A) 삭제 / B) 보존 + 헤더 경고 | B. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 재가동되어야 하므로 미래 자산. CLAUDE.md "역사 삭제 금지" 원칙 직접 적용. |
| 4 | Git 태그 push 여부 사용자 결정 영역으로 1차 보류 → "모두 진행" 시점에 즉시 실행 | A) 자동 push / B) 1차 보류 후 명시 승인 | B. 시스템 프롬프트의 "Actions visible to others" 카테고리 명확 충족 — 첫 보고에서 보류 후 사용자 "모두 진행" 즉시 push. 안전 디폴트 유지. |
| 5 | 41 영향 파일 중 5개 핵심에만 cross-reference 추가 (선택적 전파) | A) 41 전부 / B) 5 핵심만 | B. 정보 도달성은 그래프 따라가면 100% 보장 + 컨텍스트 폭발/상호 모순 위험 회피. Wave 1 deep-dive(73문서)와 _archived/는 역사 보존 원칙으로 미수정. |
| 6 | 로드맵 공수 보정에 단일값이 아닌 시나리오 A/B 병기 | A) 단일 추정치(53주 또는 25주) / B) 두 시나리오 병기 | B. 1주 압축이 일시적(Auth 도메인 익숙) vs 구조적(Opus 4.7 가속) 어느 쪽인지 Phase 16~17 측정 후 확정. 섣부른 단일 수렴은 잘못된 안심을 유발. |
| 7 | 본 세션 무관 사용자 작업 3건은 cs 커밋에서 제외 | A) 일괄 포함 / B) 명시적 제외 + handover 보고 | B. `M scripts/pack-standalone.sh` / `M standalone/install-native-linux.sh` / `?? scripts/wsl-build-deploy.sh`는 본 대화 히스토리에 없음 → 사용자 진행 중 작업 가능성. "수정 전 확인 프로토콜" 적용. |

## 수정 파일 (7개 — 모두 docs/)

| # | 파일 | 변경 내용 | 커밋 |
|---|------|-----------|------|
| 1 | `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` | §0.4 표 ADR-020 행 / ADR-015 §세션 50 보완 / ADR-020 신규 본문 / §2 의존 그래프 ADR-020 노드 / §3.1 다음 번호 021 / Operations 카테고리 매핑 / Phase 16 매핑 | 7a45c7b + 7d68b00 |
| 2 | `docs/research/2026-04-supabase-parity/05-roadmap/05-rollout-strategy.md` | 헤더 부분 대체 통지 + ADR-020 링크 (본문 §3·§6 Capistrano 디렉토리 보존) | 7a45c7b |
| 3 | `docs/research/2026-04-supabase-parity/05-roadmap/00-roadmap-overview.md` | §1.2 핵심 수치 갱신 / §8.1 제목 25% 상향 / §8.1.1 신설 (계획외 +46h, 실측 속도, 시나리오 A/B, 측정 지표 3건) / §13 위험 신호 2건 / §14.3 거버넌스 (git 태그 + 자동 측정) | 7a45c7b |
| 4 | `docs/research/2026-04-supabase-parity/README.md` | 14 카테고리 표 row 14 Operations 채택안을 standalone+rsync로 갱신 | 7d68b00 |
| 5 | `docs/research/2026-04-supabase-parity/02-architecture/05-operations-blueprint.md` | 헤더 부분 대체 경고 + ADR-020 링크 | 7d68b00 |
| 6 | `docs/research/2026-04-supabase-parity/04-integration/02-cloudflare-deployment-integration.md` | 헤더 부분 대체 경고 + ADR-020 링크 | 7d68b00 |
| 7 | `docs/handover/260425-session51-kdywave-eval-adr020.md` | (본 파일) 신규 인수인계서 | (cs 단계 커밋 예정) |

**Git 태그 3건 (소급, 원격 push 완료)**:
- `v0.1.0-alpha.0` → `b4287b0` (세션 31 cs마감, Phase 15 착수 직전)
- `v0.1.0-alpha.1` → `9d2a61e` (세션 39 cs마감, Phase 15 Auth Advanced 완결)
- `v0.2.0-alpha.2` → `c4794d4` (세션 48 cs마감, Phase 16a Vault 완결)

## 검증 결과

- ADR 파일 구조 정합성: §0.4 표 / §1 본문 / §2 의존 그래프 / §3.1 번호 / §0.4 Phase 매핑 / §0.4 카테고리 매핑 6 위치 모두 ADR-020 반영 확인
- 5개 cross-reference 산출물: ADR-015 단독 언급 → ADR-015 + ADR-020 동시 언급으로 100% 변경 확인
- `git log --oneline -3`: 7d68b00, 7a45c7b, c4b90f7 ← 본 세션 커밋 2건 + 직전 세션 커밋
- `git push origin main && git push origin <태그3>`: 모두 정상 (`c4b90f7..7a45c7b main -> main` + `[new tag] × 3`)
- `git tag --list "v*"`: 3건 모두 정확한 SHA에 생성 확인
- 본 세션 변경 파일 vs 사용자 진행 중 파일 분리: cs 커밋 대상은 본 세션 7개만, 사용자의 3개 작업(M pack-standalone.sh / M install-native-linux.sh / ?? wsl-build-deploy.sh)은 미수정 보존

## 터치하지 않은 영역

- **사용자 진행 중 3건** (대화 히스토리 외, cs 커밋 미포함):
  - `M scripts/pack-standalone.sh` — 사용자가 세션 50 이후 추가 수정 가능성
  - `M standalone/install-native-linux.sh` — 세션 50 알려진 이슈 #1 (700 패키지 인플레이션) 개선 작업 추정
  - `?? scripts/wsl-build-deploy.sh` — 신규 미추적 파일, 세션 50 우선순위 0 항목 진행 추정
  → 사용자 진행 중 작업 가능성으로 보존. 다음 세션 진입 시 작성 의도 확인 필요.
- `docs/research/2026-04-supabase-parity/01-research/` (Wave 1-2 deep-dive 73문서) — 역사 보존
- `docs/research/2026-04-supabase-parity/_archived/` — 역사 보존
- 나머지 36개 ADR-015/Capistrano 언급 파일 — 영향력 낮음, 다음 `/kdywave --feedback` 정식 실행 시 일괄 처리 권장
- `_CHECKPOINT_KDYWAVE.md` — Wave 5 완료 상태로 잠금. ADR-020 추가는 별도 워크플로우 (kdywave --feedback 정식 모드)
- 코드 영역 100% (`src/`, `prisma/`, `scripts/`, `standalone/`) — docs 한정 세션
- 다른 2개 wave (`docs/supabase-wave/`, `docs/platform-evolution-wave/`) — 본 평가는 2026-04-supabase-parity 중심

## 알려진 이슈

### 1. 사용자 진행 중 3건 — 다음 세션 진입 시 확인 필요
세션 50 이후 사용자가 별도로 수정한 것으로 추정되는 파일 3건이 git working tree에 있음. cs 커밋 대상에서 제외. 다음 세션 진입 시 사용자 의도 확인 후 처리 권장.

### 2. 41 영향 파일 중 36개 미전파 — 정식 kdywave --feedback 모드 권장
본 세션의 cross-reference는 5개 핵심만. 나머지 36개(주로 05-roadmap의 milestones/release-plan/risk-register/cost-tco 등)는 ADR-015 단독 언급 상태. 정식 `/kdywave --feedback` 모드를 다음 세션에서 실행하여 자동 일괄 처리 권장.

### 3. _CHECKPOINT_KDYWAVE.md 미갱신
ADR-020 신설은 Wave 5 완료 후 발생한 변경이므로 체크포인트의 "역방향 피드백 0건" 사실에는 영향 없음. 단 후속 변경 이력으로 §보완 행 추가가 깔끔. 다음 세션에서 처리.

### 4. 시나리오 A/B 측정 지점 미설정
§8.1.1에서 "Phase 16 종료 시 측정"으로 설정했으나, Phase 16은 사실상 16a(Vault 완결)만 완료된 상태. Phase 16b(Ops/배포) 완전 완료 시점이 불분명. 다음 세션에서 Phase 16 정의 명확화 권장.

## 다음 작업 제안

### 우선순위 0 (즉시)
1. **사용자 작업 3건 의도 확인** — `pack-standalone.sh`/`install-native-linux.sh`/`wsl-build-deploy.sh`
2. **세션 50 알려진 이슈 #2 (Windows 재부팅 자동 복구)** 실증 — WSL → PM2 → cloudflared 체인

### 우선순위 1 (이번 주)
3. **kdywave --feedback 정식 모드** 다음 세션에서 실행 → 36개 잔여 파일 일괄 ADR-020 cross-reference
4. **_CHECKPOINT_KDYWAVE.md** 후속 변경 이력 §보완 행 추가
5. **세션 50 이월 (PM2 logrotate / postgresql systemd)**

### 우선순위 2 (이월 — 세션 49+50 승계)
6. **KEK 일치 퍼즐 조사** (세션 49 이월)
7. **Phase 16b Capistrano 진입 여부 재평가** — ADR-020 신설로 사실상 결정됨 (Capistrano = 유보 자산)
8. **MASTER_KEY_PATH 단일 출처 확정** (세션 49 이월)
9. **rotateKek 단위 테스트** / **SecretItem @@index 중복 정리** / **`_test_session` drop** / **MFA biometric** / **SP-013·016** / **KST tick**

### Compound Knowledge 후보 (본 세션)
- **ADR 번호 충돌 + 부분 대체 패턴** — 신규 ADR 등록 시 기존 점유 검색 필수, "Deprecated" / "Superseded 전체" / "Superseded 부분"의 3 모드. 본 세션 ADR-020 사례를 기록하여 미래 동일 상황(예: ADR-005 DB Ops가 부분 대체될 때)에 재사용. (`docs/solutions/2026-04-25-adr-numbering-and-partial-supersession.md`로 작성 예정)

---

[← handover/_index.md](./_index.md)
