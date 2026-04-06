# 문서/상태 파일 관리 규칙

## 파일 구조 (고정, 임의 생성 금지)
```
docs/
├── rules/            → 규칙 저장
│   └── coding-stacks/  → 스택별 코딩 규칙
├── status/           → 현재 상태 (current.md만 갱신)
├── handover/         → 인수인계서 (세션 종료 시 작성)
│   └── archive/      → 오래된 인수인계서 보관 (max 5 전략 시)
├── logs/             → 작업 로그 (월별 또는 날짜범위별)
├── references/       → 기술 레퍼런스 (DB스키마, API, 인증 등)
├── guides/           → 운영 가이드 (개발서버, 배포, 트러블슈팅)
├── locks/            → 동시 작업 충돌 방지
└── commands/         → 명령어 모음 (복사용)
```

## _index.md 컨벤션

모든 `docs/` 하위 디렉토리에 색인 파일을 둡니다:

| 디렉토리 | 색인 파일 | 역할 |
|----------|-----------|------|
| rules/ | `_index.md` | 규칙 파일 목록 |
| logs/ | `_index.md` | 아카이브 색인 |
| references/ | `_index.md` | 레퍼런스 목록 |
| handover/ | `_index.md` | 인수인계서 마스터 목록 |
| commands/ | `_index.md` | 명령어 파일 목록 |
| guides/ | `README.md` | 가이드 목록 |

## 브레드크럼 네비게이션

모든 문서 상단에 위치 경로를 표시합니다:
```markdown
> 상위: [CLAUDE.md](../../CLAUDE.md) → [상위문서](./상위.md) → **여기**
```

## 파일 관리 원칙
- CLAUDE.md: 간결하게 유지, 비대해지면 docs/rules/로 분리
- rules/*.md: 비대해지면 파일 분할
- status/current.md: 세션 요약표는 누적 (삭제 안 함)
- references/*.md: 코드 변경 시 함께 갱신
- guides/*.md: 실행 가능한 명령어 중심 작성

## 상황 기록 방법
- 저장 위치: docs/status/current.md (절대 다른 곳 금지)
- 세션 요약표: 매 세션 종료 시 1행 추가 (덮어쓰기 아님)
- 상세 기록: docs/logs/ 아카이브에 누적

## 로그 아카이브 형식

프로젝트 특성에 따라 택일:

| 형식 | 파일명 패턴 | 적합한 경우 |
|------|-------------|-------------|
| **형식A: 월별** | `YYYY-MM.md` | 장기 프로젝트, 세션 빈도 낮음 |
| **형식B: 날짜범위별** | `sessions-MMDD.md` | 집중 개발, 하루 다수 세션 |

## 인수인계서 (handover) 관리 전략

프로젝트 특성에 따라 택일:

### 전략A: max 5 순환 (단기/소규모)
- 위치: docs/handover/
- 파일명: `YYYYMMDD_HHMM_프로젝트명_handover.md`
- 최대 5개 유지
- 초과 시: 가장 오래된 파일 → archive/YYYY-MM.md로 이동 후 삭제

### 전략B: 영구 보존 (장기/다수 참여)
- 위치: docs/handover/
- 파일명: `YYYY-MM-DD-sessionN.md` 또는 기존 형식
- 모든 인수인계서 보존
- `_index.md`에서 마스터 목록 관리

### 공통 규칙
- 세션 시작 시: 최신 handover 파일 확인
- 세션 종료 시: 새 handover 파일 작성 + next-dev-prompt.md 갱신

## 멀티 터미널 작업 시
- 공유 파일 수정 전: docs/locks/파일명.lock 생성
- 작업 완료 후: .lock 파일 삭제
- 다른 터미널은 .lock 존재 시 해당 파일 수정 금지

## 금지 사항
- docs/ 외 위치에 문서 저장
- 날짜+시간 조합 파일명 생성 (handover 제외)
- 같은 내용 여러 파일에 중복 기록
- CLAUDE.md 내용 임의 삭제 (분리만 허용)
