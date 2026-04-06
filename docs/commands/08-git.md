# 8. Git 관리

## 8-1. .gitignore 확인/수정

[사용자 → Claude Code]
```
.gitignore 확인해줘.

필수 항목 있는지 체크:
- .env
- .env.local
- .env.*
- nul
- node_modules/
- .next/
- dist/
- *.log

없는 거 있으면 추가해줘.
```

---

## 8-2. 커밋 전 확인

[사용자 → Claude Code]
```
git status로 확인해줘.

1. .env 파일 포함 안 됐는지
2. 불필요한 파일 포함 안 됐는지
3. 문제 없으면 커밋 메시지 제안해줘 (한국어로)
```

---

## 8-3. 커밋하기

[사용자 → Claude Code]
```
변경사항 커밋해줘.
커밋 메시지는 한국어로, 의미 있는 단위로.
커밋 전 .env 포함 여부 다시 확인해줘.
```
