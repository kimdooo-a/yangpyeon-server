# 1. 프로젝트 초기화

## 1-1. 새 프로젝트 전체 초기화

[사용자 → Claude Code]
```
프로젝트 초기화해줘.

생성할 것:
1. CLAUDE.md (프로젝트 루트)
2. docs/ 폴더 구조
   - docs/commands/ (명령어 모음)
   - docs/rules/ (_index.md, git.md, coding.md, file-management.md, resource-requests.md, image-files.md)
   - docs/status/current.md, history/
   - docs/handover/README.md, archive/
   - docs/logs/YYYY-MM.md
   - docs/locks/README.md
3. public/images/ 폴더 구조 (icons, og, hero, ui, content)
4. .gitignore (.env, .env.local, nul, node_modules 등)
5. .env.example
```

---

## 1-2. 기존 프로젝트에 체계만 추가

[사용자 → Claude Code]
```
이 프로젝트에 docs 관리 체계 추가해줘.
기존 파일은 건드리지 말고, docs/ 폴더 구조만 만들어줘.
기존 public/images/ 있으면 그 구조 유지해줘.
```

---

## 1-3. 템플릿과 함께 초기화

[사용자 → Claude Code]
```
프로젝트 초기화 + Supabase 인증 템플릿 적용해줘.

1. 기본 초기화 (docs, CLAUDE.md, .gitignore 등)
2. ~/dev-templates/auth/supabase/ → src/lib/auth/ 복사
3. ~/dev-templates/auth/components/ → src/components/auth/ 복사
4. ~/dev-templates/ui/ → src/components/ui/ 복사
5. ~/dev-templates/api/fetcher.ts → src/lib/api/ 복사
```
