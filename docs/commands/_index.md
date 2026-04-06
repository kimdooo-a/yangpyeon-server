# 명령어 모음 (복사해서 사용)

> 상위: [CLAUDE.md](../../CLAUDE.md) → **여기**

## 범례
```
[사용자 → Claude Code] : 사용자가 Claude Code에게 입력하는 명령
[Claude Code → 사용자] : Claude Code가 사용자에게 출력하는 형식
[사용자 → Antigravity] : 사용자가 Antigravity에 복사해서 붙여넣을 내용
```

---

## 파일 목록

| 파일 | 내용 | 명령어 수 |
|-----|------|---------|
| [01-project-init.md](./01-project-init.md) | 프로젝트 초기화 | 3개 |
| [02-session.md](./02-session.md) | 세션 관리 | 6개 |
| [03-image.md](./03-image.md) | 이미지 요청 (Antigravity) | 6개 |
| [04-external-resource.md](./04-external-resource.md) | 외부 리소스 요청 | 3개 |
| [05-feature.md](./05-feature.md) | 기능 생성 요청 | 12개 |
| [06-template.md](./06-template.md) | 코드 템플릿 | 4개 |
| [07-docs.md](./07-docs.md) | 문서/파일 관리 | 5개 |
| [08-git.md](./08-git.md) | Git 관리 | 3개 |
| [09-multi-terminal.md](./09-multi-terminal.md) | 멀티 터미널 작업 | 4개 |
| [10-workflow.md](./10-workflow.md) | 상황별 조합 명령어 | 6개 |
| [11-troubleshooting.md](./11-troubleshooting.md) | 트러블슈팅 | 4개 |
| [12-quality-check.md](./12-quality-check.md) | 코드 품질 점검 | 11개 |
| [99-appendix.md](./99-appendix.md) | 부록: 전체 흐름 요약 | - |

---

## 빠른 참조

### 자주 쓰는 명령어

**세션 시작** → [02-session.md](./02-session.md#2-1-세션-시작)
```
세션 시작.
```

**세션 종료** → [02-session.md](./02-session.md#2-2-세션-종료-4단계-프로토콜)
```
세션 종료.
```

**다음 세션 프롬프트 갱신** → [02-session.md](./02-session.md#2-6-다음-세션-프롬프트-갱신)
```
next-dev-prompt.md 갱신해줘.
```

**이미지 프롬프트** → [03-image.md](./03-image.md)
```
[용도] 이미지 프롬프트 만들어줘.
```

**관리자 페이지 생성** → [05-feature.md](./05-feature.md#5-1-관리자-페이지-전체-생성)
```
이 프로젝트를 파악하고 관리자 페이지 만들어줘.
```

**미구현 기능 점검** → [05-feature.md](./05-feature.md#5-7-미구현-페이지-전체-점검-및-구현)
```
이 프로젝트의 모든 페이지 점검해줘.
```

**다국어 점검** → [05-feature.md](./05-feature.md#5-11-전체-프로젝트-다국어-점검)
```
이 프로젝트 전체 다국어 점검해줘.
```

**하루 시작** → [10-workflow.md](./10-workflow.md#10-1-하루-시작-전체)
```
하루 시작.
```

**하루 마무리** → [10-workflow.md](./10-workflow.md#10-2-하루-마무리-전체)
```
하루 마무리.
```

**React 성능 점검** → [12-quality-check.md](./12-quality-check.md#q-1-전체-react-성능-점검)
```
이 프로젝트 React 성능 점검해줘.
```

**UI/UX 점검** → [12-quality-check.md](./12-quality-check.md#q-6-전체-uiux-점검)
```
이 프로젝트 UI/UX 점검해줘.
```

---

## 개발 단계별 참조

→ Phase별 명령어 가이드: [`04-dev-stages/README.md`](../../../../04-dev-stages/README.md)

| Phase | 관련 명령어 파일 |
|-------|----------------|
| Phase 1: 초기화 | [01-project-init.md](./01-project-init.md), [06-template.md](./06-template.md) |
| Phase 2: UI/디자인 | [03-image.md](./03-image.md), [04-external-resource.md](./04-external-resource.md) |
| Phase 3~5: 기능/콘텐츠/다국어 | [05-feature.md](./05-feature.md) |
| Phase 6: 검수/완성 | [12-quality-check.md](./12-quality-check.md) |
| Phase 7: 배포 | [08-git.md](./08-git.md) |
| Phase 8: 세션 관리 | [02-session.md](./02-session.md) |

---
[← CLAUDE.md](../../CLAUDE.md)
