# 11. 트러블슈팅

## 11-1. CLAUDE.md 내용이 날아갔을 때

[사용자 → Claude Code]
```
CLAUDE.md가 비었거나 내용이 이상해.
docs/rules/_index.md 참고해서 CLAUDE.md 복구해줘.

기본 구조:
- 필수 참조 링크들
- 핵심 원칙
- 세션 시작/종료 규칙
```

---

## 11-2. 상황 기록이 다른 곳에 저장됐을 때

[사용자 → Claude Code]
```
상황 기록이 다른 위치에 저장됐어.
해당 파일 내용을 docs/status/current.md로 옮기고
잘못된 파일은 삭제해줘.
```

---

## 11-3. handover 파일명이 규칙과 다를 때

[사용자 → Claude Code]
```
docs/handover/ 확인해서 파일명 규칙 안 맞는 거 있으면 수정해줘.
규칙: YYYYMMDD_HHMM_프로젝트명_handover.md
```

---

## 11-4. 이미지가 잘못된 위치에 저장됐을 때

[사용자 → Claude Code]
```
public/images/ 확인해서 폴더 구조 안 맞는 이미지 있으면
올바른 위치로 옮겨줘.

폴더 구조:
- icons/ : 아이콘, 파비콘
- og/ : OG 이미지
- hero/ : 히어로 배경
- ui/ : Empty state, 로딩 등
- content/ : 콘텐츠용
```
