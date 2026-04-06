# 부록: 전체 흐름 요약

## A. 일반적인 개발 흐름

```
[사용자 → Claude Code] 세션 시작
        ↓
[Claude Code] 상황 파악 후 요약
        ↓
[사용자 → Claude Code] 작업 요청
        ↓
[Claude Code] 작업 수행
        ↓
(이미지 필요 시)
[Claude Code → 사용자] Antigravity 프롬프트 출력
        ↓
[사용자 → Antigravity] 프롬프트 복사해서 이미지 생성
        ↓
[사용자 → Claude Code] 이미지 저장 완료 알림
        ↓
[Claude Code] 코드에 이미지 연결
        ↓
[사용자 → Claude Code] 세션 종료
        ↓
[Claude Code] current.md + handover 작성
```

---

## B. 이미지 작업 흐름

```
1. [사용자 → Claude Code] "파비콘 이미지 프롬프트 만들어줘"
2. [Claude Code → 사용자] 프롬프트 + 저장 경로 + 파일명 출력
3. [사용자] 프롬프트 복사
4. [사용자 → Antigravity] 프롬프트 붙여넣기, 이미지 생성
5. [사용자] 생성된 이미지를 지정된 경로에 저장
6. [사용자 → Claude Code] "이미지 저장했어. 위치: public/images/icons/icon-favicon-512.png"
7. [Claude Code] 파일 확인 후 코드에 연결
```

---

## C. 역할 정리

| 역할 | 담당 |
|-----|------|
| Claude Code | 코드 작성, 파일 관리, 프롬프트 생성, 상황 기록 |
| Antigravity | 이미지 생성, 브라우저 테스트 |
| 사용자 | 명령 입력, 프롬프트 전달, 이미지 저장, 결과 알림 |

---

## D. 폴더 구조 참조

```
프로젝트/
├── CLAUDE.md                  # 프로젝트별 규칙
├── public/
│   └── images/
│       ├── icons/             # 아이콘, 파비콘
│       ├── og/                # OG 이미지
│       ├── hero/              # 히어로 배경
│       ├── ui/                # Empty state, 로딩 등
│       └── content/           # 콘텐츠용
└── docs/
    ├── commands/              # 명령어 모음
    │   ├── _index.md
    │   ├── 01-project-init.md
    │   ├── 02-session.md
    │   ├── ...
    │   └── 99-appendix.md
    ├── rules/                 # 상세 규칙
    │   ├── _index.md
    │   ├── git.md
    │   ├── coding.md
    │   ├── file-management.md
    │   ├── resource-requests.md
    │   └── image-files.md
    ├── status/
    │   ├── current.md         # 현재 상태 (항상 덮어쓰기)
    │   └── history/           # 월별 히스토리
    ├── handover/
    │   ├── README.md          # 템플릿
    │   ├── archive/           # 오래된 인수인계서
    │   └── YYYYMMDD_HHMM_*.md # 인수인계서 (최대 5개)
    ├── logs/
    │   └── YYYY-MM.md         # 월별 로그
    └── locks/
        └── README.md          # Lock 파일 설명
```

---

## E. 파일 관리 원칙

| 파일 | 비대해지면 |
|-----|----------|
| CLAUDE.md | docs/rules/로 분리 |
| docs/rules/*.md | 파일 분할 |
| docs/status/current.md | history/로 이동 |
| docs/logs/YYYY-MM.md | 다음 월 파일 생성 |
| docs/handover/*.md | 핵심만 기록 |
| handover 파일 개수 | 5개 초과 시 archive/로 이동 |
