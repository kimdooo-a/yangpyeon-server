# 코드 품질 점검 명령어

> React 성능 최적화, UI/UX 점검 명령어
> 기반: Vercel Engineering의 agent-skills

---

## 📋 점검 종류

| 점검 | 대상 | 룰 수 |
|-----|------|------|
| React 성능 | React/Next.js 코드 | 45개 |
| UI/UX | 모든 웹 UI | 100+ |
| 번들 사이즈 | import, dynamic import | 5개 |
| 접근성 | aria, 키보드, semantic | 다수 |

---

## 🔍 React 성능 점검

### Q-1. 전체 React 성능 점검

```
이 프로젝트 React 성능 점검해줘.

~/dev-templates/rules/react-best-practices/SKILL.md 읽고
우선순위 순서대로 체크해줘:

1. CRITICAL: Eliminating Waterfalls (async-*)
2. CRITICAL: Bundle Size Optimization (bundle-*)
3. HIGH: Server-Side Performance (server-*)
4. MEDIUM-HIGH: Client-Side Data Fetching (client-*)
5. MEDIUM: Re-render Optimization (rerender-*)

각 카테고리에서 해당하는 이슈 찾아서 정리해줘.
```

**Claude Code 출력 형식:**
```
📋 React 성능 점검 결과

🔴 CRITICAL 이슈

1. bundle-barrel-imports 위반
   - 파일: src/components/Icons.tsx:3
   - 현재: import { Check, X } from 'lucide-react'
   - 수정: import Check from 'lucide-react/dist/esm/icons/check'
   - 영향: 200-800ms 로딩 시간 절약

2. async-parallel 위반
   - 파일: src/app/api/data/route.ts:12
   - 현재: 순차적 await 3개
   - 수정: Promise.all() 사용
   - 영향: ~2초 → ~0.7초

🟡 HIGH 이슈
...

🟢 MEDIUM 이슈
...

📊 요약
- CRITICAL: 2개
- HIGH: 1개
- MEDIUM: 3개

수정 진행할까요?
```

---

### Q-2. 특정 파일 React 성능 점검

```
[파일경로] React 성능 점검해줘.

~/dev-templates/rules/react-best-practices/SKILL.md 기준으로.
```

---

### Q-3. 번들 사이즈 최적화 점검

```
이 프로젝트 번들 사이즈 점검해줘.

~/dev-templates/rules/react-best-practices/rules/ 에서
bundle-*.md 룰들 기준으로 체크해줘.

특히:
- barrel imports (lucide-react, @mui 등)
- dynamic imports 누락
- 불필요한 third-party 즉시 로딩
```

---

### Q-4. Waterfall 점검

```
이 프로젝트 API 호출 waterfall 점검해줘.

~/dev-templates/rules/react-best-practices/rules/ 에서
async-*.md 룰들 기준으로 체크해줘.

특히:
- 순차적 await → Promise.all()
- 불필요한 await 위치
- Suspense boundary 활용
```

---

### Q-5. 리렌더 최적화 점검

```
이 컴포넌트 리렌더 최적화 점검해줘.

~/dev-templates/rules/react-best-practices/rules/ 에서
rerender-*.md 룰들 기준으로 체크해줘.

특히:
- 불필요한 state 구독
- memo 필요한 곳
- 의존성 배열 최적화
```

---

## 🎨 UI/UX 점검

### Q-6. 전체 UI/UX 점검

```
이 프로젝트 UI/UX 점검해줘.

~/dev-templates/rules/web-design-guidelines/SKILL.md 읽고
아래 카테고리 순서대로 체크해줘:

1. 접근성 (aria-labels, semantic HTML, 키보드)
2. 폼 (autocomplete, validation, 에러 처리)
3. 포커스 상태 (visible focus, focus-visible)
4. 애니메이션 (prefers-reduced-motion)
5. 다크모드 (color-scheme, theme-color)

각 카테고리에서 이슈 찾아서 정리해줘.
```

**Claude Code 출력 형식:**
```
📋 UI/UX 점검 결과

🔴 접근성 이슈

1. aria-label 누락
   - 파일: src/components/IconButton.tsx:15
   - 현재: <button><Icon /></button>
   - 수정: <button aria-label="닫기"><Icon /></button>

2. 키보드 접근 불가
   - 파일: src/components/Dropdown.tsx:42
   - 현재: onClick만 있음
   - 수정: onKeyDown 추가 (Enter, Escape)

🟡 폼 이슈

1. autocomplete 누락
   - 파일: src/components/LoginForm.tsx:23
   - 현재: <input type="email" />
   - 수정: <input type="email" autoComplete="email" />

🟢 애니메이션 이슈
...

📊 요약
- 접근성: 2개
- 폼: 1개
- 애니메이션: 0개

수정 진행할까요?
```

---

### Q-7. 접근성 점검

```
이 페이지 접근성 점검해줘.

~/dev-templates/rules/web-design-guidelines/SKILL.md 기준으로
접근성 관련 항목만 체크해줘:

- aria-labels
- semantic HTML (header, main, nav, section)
- 키보드 네비게이션
- alt text
- 색상 대비
```

---

### Q-8. 폼 UX 점검

```
이 폼 UX 점검해줘.

체크할 항목:
- autocomplete 속성
- 유효성 검사 메시지
- 에러 상태 표시
- 제출 버튼 상태 (loading, disabled)
- 필수 필드 표시
```

---

### Q-9. 다크모드 점검

```
이 프로젝트 다크모드 점검해줘.

체크할 항목:
- color-scheme 메타 태그
- theme-color 메타 태그
- CSS 변수 사용
- 하드코딩된 색상 값
- 이미지 다크모드 대응
```

---

## 🔧 자동 수정

### Q-10. 점검 후 자동 수정

```
React 성능 점검하고 수정까지 해줘.

1. ~/dev-templates/rules/react-best-practices/ 기준으로 점검
2. CRITICAL 이슈부터 자동 수정
3. 수정 전/후 diff 보여주기
4. 테스트 영향 있으면 알려주기
```

---

### Q-11. 특정 룰만 적용

```
bundle-barrel-imports 룰 적용해줘.

1. ~/dev-templates/rules/react-best-practices/rules/bundle-barrel-imports.md 읽기
2. 프로젝트에서 해당 패턴 찾기
3. 자동 수정
```

---

## 📋 빠른 참조

| 상황 | 명령어 |
|-----|-------|
| 전체 React 점검 | `이 프로젝트 React 성능 점검해줘` |
| 번들 사이즈만 | `이 프로젝트 번들 사이즈 점검해줘` |
| Waterfall만 | `이 프로젝트 API 호출 waterfall 점검해줘` |
| 전체 UI/UX | `이 프로젝트 UI/UX 점검해줘` |
| 접근성만 | `이 페이지 접근성 점검해줘` |
| 폼만 | `이 폼 UX 점검해줘` |
| 점검 + 수정 | `React 성능 점검하고 수정까지 해줘` |

---

## 🔄 정제 프로세스 점검

> 코드 품질을 단계적으로 향상시키는 정제 프로세스
> 상세 내용: docs/rules/refining-process.md

---

### Q-12. 구조 정제 점검 (1차 정제)

```
이 프로젝트 구조 정제 점검해줘.

docs/rules/refining-process.md 읽고
1차 정제 기준으로 체크해줘:

1. 미구현 정리
   - 더미 데이터 사용 여부
   - 임시 하드코딩 여부
   - 비활성 기능 여부

2. 타입 정리
   - any 타입 사용 여부
   - 명시적 타입 정의 여부

3. Import 정리
   - 사용하지 않는 import
   - barrel imports 최적화 필요 여부

4. 코드-DB 스키마 동기화 (중요!)
   - 코드에서 사용하지 않는 DB 컬럼/테이블
   - 삭제된 기능 관련 스키마 잔존 여부
   - 타입 정의와 DB 스키마 일치 여부

각 항목별로 이슈 찾아서 정리해줘.
```

**출력 형식:**
```
📋 1차 정제 (구조) 점검 결과

📦 미구현 항목
- src/data/mockUsers.ts: 더미 데이터 사용 중
- src/components/Settings.tsx:42: 하드코딩된 API URL

🔷 타입 이슈
- src/lib/api.ts:15: any 타입 사용
- src/hooks/useData.ts:23: any 타입 사용

📥 Import 이슈
- src/pages/Home.tsx: 미사용 import 3개
- src/components/Icons.tsx: barrel import 최적화 필요

🗄️ 스키마 동기화 이슈
- reviews.image_url: 코드에서 미사용 (리뷰 이미지 기능 삭제됨)
- user_preferences 테이블: 코드에서 참조 없음
- types/database.ts: DB 스키마와 3개 필드 불일치

📊 요약
- 미구현: 2개
- 타입: 2개
- Import: 2개
- 스키마 동기화: 3개

수정 진행할까요?
```

---

### Q-13. 품질 정제 점검 (2차 정제)

```
이 프로젝트 품질 정제 점검해줘.

docs/rules/refining-process.md 읽고
2차 정제 기준으로 체크해줘:

1. React 품질
   - ~/dev-templates/rules/react-best-practices/ 기준
   - CRITICAL, HIGH 이슈 찾기

2. 에러 처리
   - API 호출에 try-catch 있는지
   - 에러 메시지 사용자 친화적인지
   - 에러 경계 설정되어 있는지

3. UI 상태
   - 로딩 상태 UI 있는지
   - 에러 상태 UI 있는지
   - 빈 상태 UI 있는지

4. 주석 정리
   - TODO 찾기
   - FIXME 찾기
   - 불필요한 주석 찾기

각 항목별로 이슈 찾아서 정리해줘.
```

**출력 형식:**
```
📋 2차 정제 (품질) 점검 결과

⚛️ React 품질 이슈
🔴 CRITICAL
- src/app/api/data/route.ts:12: 순차적 await 3개 → Promise.all() 필요

🟡 HIGH
- src/components/List.tsx:45: 불필요한 리렌더 발생

⚠️ 에러 처리 이슈
- src/lib/api.ts:fetchUsers(): try-catch 없음
- src/hooks/useAuth.ts:login(): 에러 메시지 기술적

🎨 UI 상태 이슈
- src/pages/Dashboard.tsx: 로딩 상태 UI 없음
- src/components/UserList.tsx: 빈 상태 UI 없음

📝 주석 이슈
- src/lib/db.ts:42: TODO: 커넥션 풀 설정
- src/components/Form.tsx:15: FIXME: 유효성 검사

📊 요약
- React CRITICAL: 1개
- React HIGH: 1개
- 에러 처리: 2개
- UI 상태: 2개
- TODO/FIXME: 2개

수정 진행할까요?
```

---

### Q-14. 최종 정제 점검 (성능/보안)

```
이 프로젝트 최종 정제 점검해줘.

docs/rules/refining-process.md와
docs/rules/security-check.md 읽고
최종 정제 기준으로 체크해줘:

1. 보안 점검
   - CRITICAL 보안 이슈 (인증, 인가, 환경변수, SQL, XSS)
   - HIGH 보안 이슈 (입력검증, 로깅, CORS)

2. 성능 최적화
   - 번들 사이즈 최적화
   - 이미지/폰트 최적화
   - 캐싱 전략

3. 정리
   - console.log 제거
   - debugger 제거
   - 주석 처리된 코드 제거

4. 환경 분리
   - 개발/프로덕션 환경 변수
   - API 엔드포인트 확인
   - 테스트 데이터 제거

각 항목별로 이슈 찾아서 정리해줘.
```

**출력 형식:**
```
📋 최종 정제 (성능/보안) 점검 결과

🔒 보안 이슈
🔴 CRITICAL (배포 차단)
- src/app/api/admin/route.ts:15: 인증 미들웨어 없음

🟠 HIGH
- src/app/api/users/route.ts:23: 입력 검증 없음

⚡ 성능 이슈
- src/components/Icons.tsx: barrel import 최적화 필요
- public/images/hero.png: 2.3MB (최적화 필요)

🧹 정리 필요
- src/lib/debug.ts:5: console.log 발견
- src/pages/Test.tsx:12: 주석 처리된 코드 50줄

🌍 환경 이슈
- src/lib/api.ts:3: 하드코딩된 API URL
- src/data/testUsers.ts: 테스트 데이터 포함

📊 요약
- 보안 CRITICAL: 1개 (배포 불가)
- 보안 HIGH: 1개
- 성능: 2개
- 정리: 2개
- 환경: 2개

⚠️ CRITICAL 이슈 해결 전까지 배포 불가

수정 진행할까요?
```

---

### Q-15. 전체 정제 상태 요약

```
이 프로젝트 정제 상태 요약해줘.

docs/rules/refining-process.md 읽고
전체 정제 프로세스 진행 상황 분석해줘:

1. 1차 정제 (구조) 상태
2. 2차 정제 (품질) 상태
3. 최종 정제 (성능/보안) 상태

각 단계별:
- 완료된 항목 수
- 미완료 항목 수
- 주요 미완료 항목

전체 진행률과 다음 작업 제안해줘.
```

**출력 형식:**
```
📋 정제 상태 요약

| 단계 | 상태 | 완료 | 미완료 | 주요 이슈 |
|------|------|------|--------|----------|
| 1차 (구조) | ✅ 완료 | 8/8 | 0 | - |
| 2차 (품질) | ⚠️ 진행중 | 5/8 | 3 | TODO 2개, 에러UI 1개 |
| 최종 (보안) | ❌ 미시작 | 0/10 | 10 | 전체 |

📊 전체 진행률: 50%

🔴 차단 이슈
- 없음

📋 다음 작업 (우선순위)
1. TODO 2개 처리 (src/lib/db.ts, src/components/Form.tsx)
2. 에러 상태 UI 추가 (src/pages/Dashboard.tsx)
3. 2차 정제 완료 후 → 최종 정제 시작

예상 남은 작업: 2차 정제 완료 + 최종 정제 전체
```

---

### Q-16. 코드-DB 스키마 동기화 점검

> AI가 자주 놓치는 항목 - 기능 변경 후 DB 스키마가 과거 상태로 남는 문제

```
코드와 DB 스키마 동기화 점검해줘.

1. 코드에서 실제 사용하는 테이블/컬럼 목록 추출
   - types/database.ts 또는 스키마 정의 파일 확인
   - API/서비스에서 실제 쿼리하는 필드

2. DB 스키마와 비교
   - SQL 파일 또는 마이그레이션 파일 확인
   - supabase/prisma 등 스키마 정의

3. 불일치 항목 찾기
   - 코드에서 미사용인 DB 컬럼 (데드 스키마)
   - DB에 없는데 코드에서 참조하는 필드
   - 타입 불일치

삭제된 기능 관련 스키마 특히 주의해서 봐줘.
```

**출력 형식:**
```
📋 코드-DB 스키마 동기화 점검

🗄️ 데드 스키마 (코드에서 미사용)
- reviews.image_url: 리뷰 이미지 기능 삭제됨
- reviews.image_alt: 위와 동일
- user_preferences 테이블 전체: 설정 기능 변경됨

⚠️ 참조 오류 (DB에 없음)
- types/User.ts:avatarUrl → users.avatar_url 컬럼 없음

🔷 타입 불일치
- products.price: DB=numeric, Code=string

📊 요약
- 데드 스키마: 3개 (정리 필요)
- 참조 오류: 1개 (수정 필요)
- 타입 불일치: 1개

권장 조치:
1. 데드 스키마 → 마이그레이션으로 DROP
2. 참조 오류 → 타입 정의 수정
3. 타입 불일치 → 코드 또는 DB 수정
```

---

## 📋 빠른 참조

| 상황 | 명령어 |
|-----|-------|
| 전체 React 점검 | `이 프로젝트 React 성능 점검해줘` |
| 번들 사이즈만 | `이 프로젝트 번들 사이즈 점검해줘` |
| Waterfall만 | `이 프로젝트 API 호출 waterfall 점검해줘` |
| 전체 UI/UX | `이 프로젝트 UI/UX 점검해줘` |
| 접근성만 | `이 페이지 접근성 점검해줘` |
| 폼만 | `이 폼 UX 점검해줘` |
| 점검 + 수정 | `React 성능 점검하고 수정까지 해줘` |
| **1차 정제** | `이 프로젝트 구조 정제 점검해줘` |
| **2차 정제** | `이 프로젝트 품질 정제 점검해줘` |
| **최종 정제** | `이 프로젝트 최종 정제 점검해줘` |
| **정제 요약** | `이 프로젝트 정제 상태 요약해줘` |
| **스키마 동기화** | `코드와 DB 스키마 동기화 점검해줘` |

---

## 📚 참고 자료

- [react-best-practices 전체 문서](~/dev-templates/rules/react-best-practices/AGENTS.md)
- [개별 룰 파일들](~/dev-templates/rules/react-best-practices/rules/)
- [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills)
- [정제 프로세스](docs/rules/refining-process.md)
- [보안 점검 규칙](docs/rules/security-check.md)
