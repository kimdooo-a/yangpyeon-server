# 2. 세션 관리

## 2-1. 세션 시작

[사용자 → Claude Code]
```
세션 시작.

1. docs/status/current.md 읽고 현재 상태 파악
2. docs/handover/ 에서 가장 최신 파일 읽기
3. docs/handover/next-dev-prompt.md 확인 (있을 경우)
4. 현재 상황 요약해줘
5. 오늘 할 작업 제안해줘
```

---

## 2-2. 세션 종료 (4단계 프로토콜)

[사용자 → Claude Code]
```
세션 종료.

1단계: docs/status/current.md 세션 요약표에 1행 추가
   - 세션 번호, 날짜, 제목, 아카이브 링크, 인수인계서 링크

2단계: docs/logs/ 아카이브에 상세 기록
   - 해당 날짜/기간 아카이브 파일에 추가
   - 형식A(월별): YYYY-MM.md / 형식B(날짜범위별): sessions-MMDD.md

3단계: docs/handover/에 인수인계서 작성
   - 파일명 택일:
     a) YYYYMMDD_HHMM_프로젝트명_handover.md (기존 형식)
     b) YYYY-MM-DD-sessionN.md (세션 기반 형식)
   - handover 관리 전략에 따라 정리 (max 5 순환 또는 영구 보존)

4단계: docs/handover/next-dev-prompt.md 갱신
   - 최근 완료 작업, Git 상태, 추천 다음 작업 업데이트

추가: git status 확인해서 .env 포함 안 됐는지 체크
```

---

## 2-3. 상황만 기록

[사용자 → Claude Code]
```
현재 상황 docs/status/current.md에 기록해줘.
다른 위치에 저장하지 말고 current.md만 갱신.

포함할 내용:
- 마지막 업데이트 시간
- 진행 중인 작업
- 오늘 완료한 작업
- 다음 작업
- 이슈/메모
- 세션 요약표에 1행 추가 (세션 종료 시)
```

---

## 2-4. 인수인계서만 작성

[사용자 → Claude Code]
```
docs/handover/에 인수인계서 작성해줘.

포함할 내용:
# 인수인계서
> 작성: YYYY-MM-DD HH:MM
> 프로젝트: 프로젝트명

## 오늘 완료한 작업
-

## 진행 중인 작업
- 현재 상태:
- 다음 단계:

## 다음에 해야 할 작업
1.
2.

## 주의사항 / 이슈
-

## 관련 파일
-
```

---

## 2-5. handover 정리

[사용자 → Claude Code]
```
docs/handover/ 파일 개수 확인해줘.
5개 초과면 가장 오래된 파일 내용을 archive/YYYY-MM.md에 추가하고 삭제해줘.
(영구 보존 전략 사용 시 이 명령은 불필요)
```

---

## 2-6. 다음 세션 프롬프트 갱신

[사용자 → Claude Code]
```
docs/handover/next-dev-prompt.md 갱신해줘.

업데이트할 내용:
- 최근 완료된 작업 (이번 세션)
- 현재 Git 상태 (브랜치, 커밋되지 않은 변경)
- 추천 다음 작업 (우선순위 1~4)
- 알려진 이슈 및 주의사항
```
