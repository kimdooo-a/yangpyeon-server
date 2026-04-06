# 10. 상황별 조합 명령어

## 10-1. 하루 시작 (전체)

[사용자 → Claude Code]
```
하루 시작.

1. docs/status/current.md 읽어줘
2. docs/handover/ 최신 파일 읽어줘
3. docs/locks/ 확인해서 잠긴 파일 있는지 알려줘
4. 현재 상황 요약해줘
5. 오늘 할 작업 우선순위 제안해줘
```

---

## 10-2. 하루 마무리 (전체)

[사용자 → Claude Code]
```
하루 마무리.

1. docs/status/current.md 업데이트
2. docs/handover/에 인수인계서 작성 (YYYYMMDD_HHMM_프로젝트명_handover.md)
3. handover 5개 초과면 archive로 정리
4. docs/locks/ 내 lock 파일 있으면 해제
5. git status 확인
6. .env 포함 안 됐으면 커밋
```

---

## 10-3. 작업 인계 (다른 터미널/세션으로)

[사용자 → Claude Code]
```
이 작업 다른 터미널로 넘길 거야.

1. docs/status/current.md에 현재 상황 상세히 기록
2. docs/handover/에 인수인계서 작성
3. 관련 파일 lock 있으면 해제
4. 넘겨받을 터미널이 확인해야 할 것들 정리해줘
```

---

## 10-4. 새 기능 개발 시작

[사용자 → Claude Code]
```
사용자 프로필 기능 개발 시작.

1. 현재 상황 current.md에 기록
2. 필요하면 feature 브랜치 생성
3. 관련 파일들 lock 필요하면 생성
4. 작업 계획 정리해줘
```

---

## 10-5. 기능 개발 완료

[사용자 → Claude Code]
```
사용자 프로필 기능 개발 완료.

1. 코드 정리 및 주석 확인 (한국어)
2. 테스트 필요하면 Antigravity 브라우저 테스트 요청 형식으로 알려줘
3. current.md 업데이트
4. 관련 lock 해제
5. 커밋 준비
```

---

## 10-6. 이미지 작업 플로우

[사용자 → Claude Code]
```
이미지 작업 시작.

1. public/images/ 기존 체계 확인
2. 필요한 이미지 목록 정리
3. 각각 Antigravity 프롬프트 생성 (저장 경로, 파일명 포함)
```

[Claude Code → 사용자]
```
(03-image.md의 3-1 ~ 3-4 형식으로 프롬프트 출력)
```

[사용자 → Antigravity]
```
(Claude Code가 생성한 프롬프트 복사해서 Antigravity에 붙여넣기)
```

[사용자 → Claude Code] (이미지 저장 후)
```
이미지 저장했어.
위치: public/images/icons/icon-favicon-512.png
코드에 연결해줘.
```
