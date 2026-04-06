# 인수인계서 — 세션 3 (보안 Wave 2: Rate Limiting + 감사 로그)

> 작성일: 2026-04-06
> 이전 세션: [session1](./250406-session1-init-security.md), [session2](./260406-session2-dashboard-improve.md)

---

## 작업 요약

kdywave 보안 리서치로 14건 취약점 발견 후, Wave 1(CRITICAL/HIGH 즉시 수정) + Wave 2(Rate Limiting/감사 로그) 모두 완료. 세션 2(터미널 B)와 동시 작업하며 충돌 없이 통합 배포.

## 대화 다이제스트

### 토픽 1: kdywave 보안 리서치
> **사용자**: "/kdywave -- 이 프로젝트의 보안성을 강화하기 위한 연구"

kdywave S규모(2-Wave)로 보안 리서치 실행. 에이전트가 전체 API 소스코드를 분석하여 14건 취약점 발견:
- CRITICAL 4건: 인증 부재, 명령어 주입(execSync + 문자열 결합), 정보 노출
- HIGH 3건: CORS/CSRF 미설정, Rate Limiting 없음
- MEDIUM 4건: 입력 검증 불완전, Tunnel ID 노출, 에러 메시지 정보 유출
- LOW 3건: 보안 헤더, 감사 로그, Zod 미사용

**결론**: Wave 1(즉시) + Wave 2(강화) 2단계 수정 계획 수립

### 토픽 2: Wave 1 보안 수정
> **사용자**: "ㅇㅇ" (진행 승인)

7개 보안 조치 일괄 적용:
1. JWT 쿠키 인증 (`src/lib/auth.ts` + `src/middleware.ts`)
2. 로그인 페이지 (`src/app/login/page.tsx`)
3. 브루트포스 방지 (IP별 5회/5분 잠금)
4. execSync → execFileSync 전환 (모든 API)
5. CORS Origin 화이트리스트 + CSRF Referer 검증
6. 보안 헤더 6종 (HSTS, X-Frame-Options 등)
7. 터널 API 민감정보 제거

**문제 해결**: `output: "standalone"` 모드에서 `next start` 미동작 → standalone 제거로 해결

### 토픽 3: 로그인 비밀번호 설정
> **사용자**: "Knp13579!yan"

WSL2 `~/dashboard/.env.local`에 설정. AUTH_SECRET은 openssl rand로 자동 생성.

### 토픽 4: Cloudflare Tunnel 재시작
사이트 접속 시 Error 1033 발생 → cloudflared 프로세스 확인했으나 이미 종료됨 → `wsl -d Ubuntu` 내부에서 백그라운드 실행으로 해결.

### 토픽 5: 디스크 정보 개선
> **사용자**: "디스크 용량을 50GB 정도 늘릴수 있나?"

실제로는 용량이 충분하나 WSL2 가상디스크(1TB)만 표시 중이었음 → API를 Windows 물리 디스크(C:, E:) + WSL2 3개 모두 표시하도록 수정.

### 토픽 6: 터미널 B용 인수인계서 작성
> **사용자**: "대쉬보드 기능 개선은 다른 터미널이 할 수 있도록 상세 지침을 만들어줘"

`docs/handover/next-dev-prompt.md`에 6개 개선 작업 목록 + 우선순위 + 배포 절차 작성.

### 토픽 7: 동시 작업 충돌 방지
> **사용자**: "다른 터미널에 알려줄 내용을 작성해줘 충돌하지 않게"

`docs/locks/active-sessions.md` 작성: 터미널 A(middleware + lib), 터미널 B(app + components) 영역 분리.

### 토픽 8: Wave 2 실행
> **사용자**: "넌 진행해"

Rate Limiting + 감사 로그 구현:
- 인메모리 슬라이딩 윈도우 Rate Limiter (외부 의존성 없음)
- API별 차등: 일반 60/분, PM2 제어 10/분, 로그인 5/분
- 감사 로그: Edge Runtime 호환 인메모리 버퍼 (최초 fs 사용 → Edge Runtime 제약으로 인메모리로 변경)
- `/api/audit` 조회 API

### 토픽 9: 통합 배포
터미널 B 작업 완료 확인 후 양쪽 변경사항 통합 빌드 + WSL2 배포 성공.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | JWT 쿠키 인증 | JWT vs Basic Auth vs Cloudflare Access | 외부 의존성 없이 자체 구현 가능, 24시간 세션 |
| 2 | execFileSync 사용 | execSync vs execFileSync vs spawn | 쉘 해석 차단하면서 동기식 유지 (API 특성상 적합) |
| 3 | standalone 제거 | standalone vs 일반 모드 | standalone에서 next start 미동작, .env.local 미로드 |
| 4 | 인메모리 감사 로그 | 파일 기반 vs 인메모리 | Edge Runtime에서 fs 사용 불가 |
| 5 | Zod 검증 보류 | 즉시 적용 vs 보류 | 터미널 B가 API 추가 중이므로 충돌 방지 위해 나중에 일괄 적용 |

## 수정 파일 (19개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/auth.ts` | 신규: JWT 세션 관리, 비밀번호 검증 |
| 2 | `src/lib/rate-limit.ts` | 신규: 슬라이딩 윈도우 Rate Limiter |
| 3 | `src/lib/audit-log.ts` | 신규: 인메모리 감사 로그 |
| 4 | `src/middleware.ts` | 신규→수정: 인증 + CORS/CSRF + Rate Limit + 감사 로그 통합 |
| 5 | `src/app/login/page.tsx` | 신규: 로그인 UI |
| 6 | `src/app/api/auth/login/route.ts` | 신규: 비밀번호 인증 + 브루트포스 방지 |
| 7 | `src/app/api/auth/logout/route.ts` | 신규: 세션 삭제 |
| 8 | `src/app/api/audit/route.ts` | 신규: 감사 로그 조회 |
| 9 | `src/app/api/system/route.ts` | execSync→execFileSync, 멀티 디스크 |
| 10 | `src/app/api/pm2/route.ts` | execSync→execFileSync, 타입 강화 |
| 11 | `src/app/api/pm2/[action]/route.ts` | execSync→execFileSync |
| 12 | `src/app/api/pm2/logs/route.ts` | execSync→execFileSync |
| 13 | `src/app/api/tunnel/route.ts` | 민감정보 제거, execFileSync |
| 14 | `src/app/network/page.tsx` | 터널 API 변경 반영 |
| 15 | `src/components/layout/sidebar.tsx` | 로그아웃 버튼 추가 |
| 16 | `next.config.ts` | standalone 제거, 보안 헤더 6종 |
| 17 | `docs/guides/server-boot-manual.md` | 신규: 서버 부팅 매뉴얼 |
| 18 | `docs/locks/active-sessions.md` | 신규: 동시 작업 충돌 방지 |
| 19 | `.env.example` | 신규: 환경변수 템플릿 |

## 알려진 이슈
- middleware 경고 (Next.js 16 proxy 전환 권장, 동작 문제 없음)
- 감사 로그가 인메모리라 PM2 재시작 시 초기화됨
- Zod 입력 검증 미적용 (다음 세션)

## 다음 작업 제안
1. **Zod 입력 검증**: 전체 API route에 일괄 적용 (터미널 B 작업 완료됨)
2. **네트워크 트래픽 정보**: /proc/net/dev 파싱
3. **알림 페이지**: CPU/메모리 임계치 이벤트

---
[← handover/_index.md](./_index.md)
