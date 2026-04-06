# Git 규칙

## .gitignore 필수 항목
```
.env
.env.local
.env.*
nul
node_modules/
.next/
dist/
*.log
.DS_Store
```

## 커밋 규칙
- 메시지 한국어로 작성
- 의미 있는 단위로 커밋
- 커밋 전 `git status`로 .env 포함 여부 확인
- **세션 종료 전 반드시 1회 이상 커밋** (소스 변경이 있는 경우)
- 5세션 이상 미커밋 금지 — 거대 일괄 커밋은 코드 리뷰/롤백을 불가능하게 함

## 브랜치 규칙
- main: 안정 버전
- dev: 개발 통합
- feature/*: 기능별 작업
