# 동시 작업 충돌 방지 — 활성 세션 잠금

> 이 파일은 여러 터미널이 동시에 작업할 때 파일 충돌을 방지하기 위한 것입니다.
> **작업 시작 전 반드시 확인하고, 작업 완료 후 잠금을 해제하세요.**

---

## 현재 활성 세션

| 터미널 | 작업 | 잠금 파일 | 시작 |
|--------|------|----------|------|
| **터미널 A** | 보안 Wave 2 (Rate Limiting + 감사 로그) | 아래 참조 | 2026-04-06 |
| **터미널 B** | 대시보드 기능 개선 | 아래 참조 | 2026-04-06 |

---

## 터미널 A: 보안 Wave 2 — 수정 가능 영역

**수정 가능 (독점):**
```
src/middleware.ts                  ← Rate Limiting 로직 추가
src/lib/auth.ts                    ← 인증 관련 수정
src/lib/rate-limit.ts              ← 새로 생성 (Rate Limiter)
src/lib/audit-log.ts               ← 새로 생성 (감사 로그)
```

**수정 금지 (터미널 B 영역):**
```
src/app/page.tsx                   ← 터미널 B가 차트 추가 중
src/app/processes/page.tsx         ← 터미널 B가 개선 중
src/app/logs/page.tsx              ← 터미널 B가 개선 중
src/app/network/page.tsx           ← 터미널 B가 개선 중
src/components/**                  ← 터미널 B가 컴포넌트 추가 중
src/app/api/pm2/**                 ← 터미널 B가 새 API 추가 가능
```

**나중에 별도 세션에서 (양쪽 완료 후):**
```
src/app/api/**/route.ts            ← Zod 입력 검증 일괄 적용
```

---

## 터미널 B: 기능 개선 — 수정 가능 영역

**수정 가능 (독점):**
```
src/app/page.tsx                   ← 대시보드 홈 개선
src/app/processes/page.tsx         ← PM2 관리 개선
src/app/logs/page.tsx              ← 로그 뷰어 개선
src/app/network/page.tsx           ← 네��워크 개선
src/app/alerts/                    ← 새 페이지 (생성 가능)
src/components/**                  ← 컴포넌트 추가/수정
src/app/api/pm2/[name]/            ← 새 API 추가 가능
```

**수정 금지 (터미널 A 영역):**
```
src/middleware.ts                  ← 터미널 A가 Rate Limiting 추가 중
src/lib/auth.ts                    ← 터미널 A 영역
src/lib/rate-limit.ts              ← 터미널 A가 생성
src/lib/audit-log.ts               ← 터미널 A가 생성
```

**공유 영역 — 수정 시 주의:**
```
src/app/layout.tsx                 ← 수정 필요 시 상대방에게 알림
src/app/globals.css                ← 클래스 추가만 허용, 기존 삭제 금지
next.config.ts                     ← 터미널 A만 수정 (보안 헤더)
package.json                       ← 패키지 추가 시 상대방에게 알림
```

---

## 규칙

1. **잠금 파일에 없는 경로를 수정하려면** → 이 파일에 먼저 등록
2. **공유 영역 수정 시** → 상대 터미널에 알림 (또는 이 파일에 메모)
3. **새 파일 생성은 자유** → 단, 상대 영역의 디렉토리 안에 만들지 않기
4. **배포는 한 번에 하나만** → 빌드+배포 전 상대 터미널 작업 확인
5. **양쪽 작업 완료 후** → 이 파일 삭제하고 통합 세션에서 Zod 검증 일괄 적용

---

## 배포 순서

두 터미널이 동시에 배포하면 충돌합니다. 배포할 때:

1. 이 파일에 "배포 중: 터미널 X" 메모
2. 빌드 + WSL2 배포
3. 메모 삭제

**현재 배포 상태**: 없음 (대기 중)
