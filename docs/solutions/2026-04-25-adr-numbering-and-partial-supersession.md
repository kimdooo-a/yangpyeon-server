---
title: ADR 번호 충돌 감지 + 부분 대체(Partial Supersession) 패턴
date: 2026-04-25
session: 51
tags: [adr, architecture-decision, governance, supersession, kdywave]
category: pattern
confidence: high
---

## 문제

세션 51에서 kdywave 이행도 평가 후속 조치로 "ADR-019 등록 + ADR-015 재검토 트리거 기록"을 권장했으나, 실제 `01-adr-log.md` 검색 결과 ADR-019는 **이미 점유 중**이었음:

```
ADR-019: Password Hash — argon2id 전환 (bcrypt → @node-rs/argon2)
- 날짜: 2026-04-19 (세션 30, SP-011 실측 기반)
- §0.4 요약 표: 19행
- §3.1 다음 ADR 번호 규칙: "현재 020부터"
```

또한 ADR-015(Operations Capistrano)는 *부분*만 무효화되었음 — *PM2 cluster:4 + canary 서브도메인* 부분은 유효, *Capistrano-style symlink + releases/* 부분만 ADR-020(standalone+rsync)에 의해 대체.

기존 ADR 처리 옵션:
- `Deprecated` (전체 무효)
- `Superseded by ADR-XXX` (전체 대체)
- ??? (부분 대체)

## 원인

1. **ADR 번호 채택 시 사용자 권장 번호와 실제 점유 상태의 불일치**: 사용자가 "ADR-019"를 권장한 것은 일반화 표기였고, 실제 다음 가용 번호 검색은 검색 부재 상태였음.
2. **단일 ADR이 다층 결정의 묶음일 때 부분 대체의 표현 부재**: ADR-015는 (a) Capistrano symlink, (b) PM2 cluster:4, (c) canary 서브도메인 3 결정의 묶음. 일부만 변경되는 경우 표준 ADR 어휘에 적절한 표현이 없음.
3. **"역사 삭제 금지" 원칙과 "최신 결정 명확성"의 긴장**: ADR-015 본문을 그대로 두면 미래 독자가 활성 결정으로 오해, 삭제하면 역사 손실.

## 해결

### 1. 신규 ADR 등록 전 필수 확인 3단계

```bash
# (1) §0.4 요약 표에서 다음 가용 번호 확인
grep "^| ADR-" docs/research/<wave>/02-architecture/01-adr-log.md | tail -5

# (2) §3.1 "현재 NNN부터" 규칙 확인
grep -A1 "현재" docs/research/<wave>/02-architecture/01-adr-log.md

# (3) 본문 §1에서 마지막 ADR 번호 확인
grep "^### ADR-" docs/research/<wave>/02-architecture/01-adr-log.md | tail -3
```

3 위치가 일치해야 등록 가능. 불일치 시 등록 전 정합화.

### 2. 부분 대체(Partial Supersession) 표기 어휘

| 상황 | 상태 표기 | §0.4 행 | 본문 처리 |
|------|---------|---------|----------|
| 전체 무효 | `Deprecated` | 상태만 변경 | 본문 보존 + 상단 경고 |
| 전체 대체 | `Superseded by ADR-XXX` | 상태 + 대체 ADR 명시 | 본문 보존 + 상단 forward reference |
| **부분 대체** | `Accepted (부분 ADR-XXX에 의해 Superseded)` | 양쪽 ADR 동시 표기 | **신구 ADR 본문 모두 보존**. 기존 본문에 "**세션 N 보완 — XXX 부분 대체**" 블록 + 4 재진입 트리거 정량화 |

**부분 대체 어휘 예시 (ADR-015 §0.4 행)**:
```
| ADR-015 | Operations Capistrano-style + PM2 cluster:4 + canary 서브도메인 | Accepted | 16 |
```
↓ 부분 대체 등록 후
```
| ADR-015 | Operations ... | Accepted | 16 |
| ADR-020 | 배포 경로 — Next.js standalone + rsync + pm2 reload (ADR-015 재검토 트리거 발동, 세션 50) | Accepted (Supersedes ADR-015 부분) | 16 |
```

### 3. ADR 본문 보완 블록 표준 형식

기존 ADR 본문 끝에 추가 (삭제 금지):

```markdown
- **세션 N (YYYY-MM-DD) 보완 — {부분 대체 사실}**:
  - **상태 변경**: 본 ADR-XXX의 *{대체된 부분}*은 ...단계까지 진행되었으나, ...
  - **결과**: 본 ADR-XXX의 *{유효 부분}* 부분은 **유효 유지**, *{대체된 부분}* 부분은 **ADR-YYY에 의해 부분 대체(Superseded)**.
  - **재검토 트리거 추가 ({신구 ADR 전환 조건})**:
    1. {정량 트리거 1}
    2. {정량 트리거 2}
    ...
  - **근거 문서**: {핸드오버/솔루션 문서}
  - **연계**: ADR-YYY (XXX) 본문 참조
```

### 4. ADR 의존 그래프 §2 갱신 패턴

```
│ ADR-015 Operations
│       │
│       │ Capistrano symlink/releases 부분만 부분 대체
│       ▼
│ ADR-020 standalone+rsync+pm2 reload (세션 N, 활성)
```

화살표가 "부분 대체"임을 명시 (전체 대체 시 `▶▶▶` 또는 `Superseded by` 라벨).

### 5. 영향 산출물 cross-reference 전파

41 영향 파일 중 5개 핵심에만 헤더 cross-reference 추가:
- 마스터 인덱스 (README.md)
- ADR 의존 그래프 (01-adr-log.md §2)
- 원본 Blueprint (02-architecture/05-operations-blueprint.md)
- Integration 계약 (04-integration/02-cloudflare-deployment-integration.md)
- 롤아웃 전략 (05-roadmap/05-rollout-strategy.md)

나머지 36개는 그래프 따라가면 정보 도달 가능 + 정식 `/kdywave --feedback` 모드에서 일괄 처리.

## 교훈

- **신규 ADR 번호는 검색으로만 확정** — 사용자 권장이나 직관 채택 금지. §0.4/§3.1/본문 3 위치 동시 확인.
- **부분 대체는 새 ADR 신설 + 기존 ADR 본문에 보완 블록**이 정답. "Deprecated"는 과대 처리 / "Superseded 전체"는 부정확.
- **"역사 삭제 금지"는 ADR 본문에서 가장 중요** — 미래 트리거 충족 시 재가동될 유보 자산이므로 §3·§6 같은 구체적 디렉토리 구조도 보존.

## 관련 파일

- `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` (ADR-019 점유 사례 + ADR-020 신설 + ADR-015 보완)
- `docs/research/2026-04-supabase-parity/05-roadmap/05-rollout-strategy.md` (헤더 부분 대체 통지)
- `docs/handover/260425-session51-kdywave-eval-adr020.md` (의사결정 #1, #2, #3)
- `docs/handover/260419-session50-standalone-package.md` (ADR-020 신설 근거 — standalone 실증)
