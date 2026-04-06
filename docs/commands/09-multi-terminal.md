# 9. 멀티 터미널 작업

## 9-1. Lock 생성

[사용자 → Claude Code]
```
src/components/Header.tsx 수정 작업 시작할 거야.

docs/locks/Header.tsx.lock 생성해줘.
내용:
- 터미널: 1번
- 시작: 현재 시간
- 작업: 헤더 네비게이션 수정
```

---

## 9-2. Lock 해제

[사용자 → Claude Code]
```
src/components/Header.tsx 수정 완료했어.
docs/locks/Header.tsx.lock 삭제해줘.
```

---

## 9-3. Lock 현황 확인

[사용자 → Claude Code]
```
docs/locks/ 확인해서 현재 잠긴 파일들 알려줘.
lock 파일 있으면 내용도 보여줘.
```

---

## 9-4. 작업 영역 분리 확인

[사용자 → Claude Code]
```
현재 이 터미널의 작업 영역 확인해줘.
다른 터미널과 충돌할 수 있는 파일 있는지 체크해줘.
```
