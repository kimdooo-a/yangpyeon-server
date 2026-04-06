# 보안 점검 규칙

> 최종 정제 단계에서 필수로 확인해야 할 보안 항목

---

## 점검 우선순위

| 등급 | 의미 | AI 난이도 |
|------|------|----------|
| CRITICAL | 즉시 수정 필수, 배포 차단 | ●●●● |
| HIGH | 배포 전 수정 필요 | ●●● |
| MEDIUM | 가능한 빨리 수정 | ●● |

---

## CRITICAL 보안 항목

### 1. 인증 우회 (Authentication Bypass)

**점검 항목:**
- [ ] 모든 보호된 라우트에 인증 미들웨어 적용
- [ ] 토큰 검증 로직 존재
- [ ] 세션 만료 처리 구현

**취약 패턴:**
```typescript
// 위험: 인증 없이 접근 가능
app.get('/api/admin/*', handler)

// 안전: 인증 미들웨어 적용
app.get('/api/admin/*', authMiddleware, handler)
```

---

### 2. 인가 우회 (Authorization Bypass)

**점검 항목:**
- [ ] 리소스 접근 시 소유권 확인
- [ ] 역할 기반 접근 제어 (RBAC) 구현
- [ ] API 엔드포인트별 권한 확인

**취약 패턴:**
```typescript
// 위험: ID만으로 조회 (다른 사용자 데이터 접근 가능)
const data = await db.user.findUnique({ where: { id } })

// 안전: 현재 사용자 소유권 확인
const data = await db.user.findUnique({
  where: { id, userId: currentUser.id }
})
```

---

### 3. 환경 변수 노출

**점검 항목:**
- [ ] 클라이언트 코드에 NEXT_PUBLIC_ 외 환경변수 없음
- [ ] API 키가 프론트엔드에 노출되지 않음
- [ ] .env 파일이 .gitignore에 포함됨

**점검 명령어:**
```bash
# 프론트엔드 코드에서 환경변수 검색
grep -r "process.env" --include="*.tsx" --include="*.ts" src/
```

---

### 4. SQL 인젝션

**점검 항목:**
- [ ] ORM 사용 또는 파라미터화된 쿼리
- [ ] 사용자 입력 직접 쿼리 삽입 없음

**취약 패턴:**
```typescript
// 위험: 문자열 보간
db.query(`SELECT * FROM users WHERE id = ${userId}`)

// 안전: 파라미터화된 쿼리
db.query('SELECT * FROM users WHERE id = $1', [userId])
```

---

### 5. XSS (Cross-Site Scripting)

**점검 항목:**
- [ ] dangerouslySetInnerHTML 사용 최소화
- [ ] 사용자 입력 HTML 이스케이프
- [ ] CSP 헤더 설정

**취약 패턴:**
```tsx
// 위험: 사용자 입력 직접 렌더링
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// 안전: 새니타이저 사용
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

---

## HIGH 보안 항목

### 6. 입력 검증 부재

**점검 항목:**
- [ ] 모든 API 입력에 zod/yup 등 스키마 검증
- [ ] 파일 업로드 타입/크기 제한
- [ ] URL 파라미터 검증

---

### 7. 민감 정보 로깅

**점검 항목:**
- [ ] 비밀번호 로그 출력 없음
- [ ] 토큰/API 키 로그 출력 없음
- [ ] 개인정보 로그 출력 없음

**점검 명령어:**
```bash
# 로그에서 민감 키워드 검색
grep -rE "(password|token|secret|apiKey)" --include="*.ts" src/ | grep -i "console\|log"
```

---

### 8. CORS 설정 미흡

**점검 항목:**
- [ ] 프로덕션에서 와일드카드(*) 사용 안 함
- [ ] 허용 도메인 명시적 설정
- [ ] credentials 옵션 적절히 설정

---

## MEDIUM 보안 항목

### 9. 에러 메시지 노출

**점검 항목:**
- [ ] 프로덕션에서 스택 트레이스 숨김
- [ ] 내부 에러 코드 노출 안 함
- [ ] 사용자 친화적 에러 메시지

---

### 10. Rate Limiting 부재

**점검 항목:**
- [ ] 로그인 시도 제한
- [ ] API 호출 빈도 제한
- [ ] 봇 방지 메커니즘

---

## 보안 점검 명령어

### 전체 보안 점검

```
이 프로젝트 보안 점검해줘.

docs/rules/security-check.md 읽고
CRITICAL → HIGH → MEDIUM 순서로 체크해줘.

각 항목에서:
1. 해당 패턴 검색
2. 취약점 발견 시 파일:라인 표시
3. 수정 방법 제안
```

### 특정 항목 점검

```
이 프로젝트 [인증/인가/XSS/SQL인젝션] 점검해줘.
```

---

## 점검 결과 출력 형식

```
📋 보안 점검 결과

🔴 CRITICAL (배포 차단)
1. 인증 우회 가능
   - 파일: src/app/api/admin/route.ts:15
   - 현재: 인증 미들웨어 없음
   - 수정: withAuth 미들웨어 추가 필요

🟠 HIGH (배포 전 수정)
1. 입력 검증 부재
   - 파일: src/app/api/users/route.ts:23
   - 현재: body 직접 사용
   - 수정: zod 스키마 검증 추가

🟡 MEDIUM (권장 수정)
...

📊 요약
- CRITICAL: 1개 (배포 불가)
- HIGH: 2개
- MEDIUM: 1개

수정 진행할까요?
```

---

## 참고

- 정제 프로세스 → refining-process.md
- OWASP Top 10 → https://owasp.org/Top10/
