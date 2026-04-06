# TypeScript + React/Next.js 코딩 규칙

> 상위: [rules/_index.md](../_index.md) → [coding-stacks/_index.md](./_index.md) → **여기**

---

## 타입 규칙

- `any` 타입 금지, `strict` 모드 필수
- `unknown` 사용 후 타입 가드로 좁히기
- 타입/인터페이스: PascalCase, `I` 접두사 없음
- API 응답 타입은 별도 파일로 관리

## 네이밍 규칙

| 대상 | 규칙 | 예시 |
|------|------|------|
| 파일명 | kebab-case | `user-profile.tsx` |
| 컴포넌트 | PascalCase | `UserProfile` |
| 훅 | camelCase + `use` 접두사 | `useUserProfile` |
| 상수 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 타입/인터페이스 | PascalCase | `UserProfileProps` |
| 유틸 함수 | camelCase | `formatDate` |

## 컴포넌트 규칙

- 함수형 컴포넌트만 사용
- Props는 인터페이스로 정의
- `dangerouslySetInnerHTML` 사용 시 반드시 sanitize
- `NEXT_PUBLIC_` 접두사 환경변수에 민감 정보 주의

## 파일 구조

### 소규모 프로젝트 (글로벌 src/ 구조)
```
src/
├── components/
├── api/ 또는 lib/api/
├── types/
└── lib/ 또는 utils/
```

### 중대규모 프로젝트 (feature 기반 구조)
```
src/
├── features/[기능명]/
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   ├── types/
│   └── index.ts
└── shared/
```

적용 기준: 기능 모듈이 3개 이상이거나 팀 협업 시

## 모듈화 규칙

### 단일 책임 원칙
```
# Bad
UserProfile.tsx  ← 표시 + 수정 + 업로드 + 검증

# Good
UserProfile.tsx       ← 조합만
├── ProfileForm.tsx   ← 수정 폼
├── AvatarUpload.tsx  ← 이미지 업로드
└── useProfileValidation.ts ← 검증 훅
```

### 의존성 규칙
- 단방향: pages → features → shared → utils
- 외부 라이브러리는 래퍼로 격리
- `import ../../../` 발생 시 구조 재설계

### 분리 기준
- 2회 사용 → 공통으로 분리
- 3개 프로젝트 → 재사용 라이브러리로 이동
- props 10개 초과 → 컴포넌트 분할

---
[← coding-stacks/_index.md](./_index.md)
