# 양평 부엌 서버 대시보드

## CLAUDE.md 관리 규칙 (이 섹션 삭제 금지)

## 프로젝트 정보
- 프로젝트명: 양평 부엌 서버 대시보드 (stylelucky4u.com)
- 스택: Next.js 15 + TypeScript + Tailwind CSS
- 시작일: 2026-04-06
- 배포 환경: WSL2 Ubuntu (PM2) + Cloudflare Tunnel
- 도메인: stylelucky4u.com
- 포트: 3000 (localhost)

## 문서 체계 (풀뿌리 트리)

이 파일(CLAUDE.md)이 루트입니다. 모든 기록은 아래 트리를 따라 빠짐없이 연결됩니다.
**역사는 절대 삭제하지 않습니다.**

```
CLAUDE.md (루트 — 지금 이 파일)
│
├─→ docs/rules/_index.md ················ 프로젝트 규칙
│   ├─→ coding-stacks/ ················ 스택별 코딩 규칙
│   ├─→ resource-requests.md ··········· 외부 리소스 요청 양식
│   ├─→ image-files.md ················ 이미지 파일 관리
│   └─→ navigation-connectivity.md ···· 페이지 연결성 규칙 (고아 페이지 방지)
│
├─→ docs/status/current.md ·············· 프로젝트 현황 + 세션 요약표
│   └─→ docs/logs/_index.md ··········· 세션 기록 아카이브 색인
│       └─→ YYYY-MM.md / sessions-MMDD.md
│
├─→ docs/references/_index.md ············ 기술 레퍼런스 색인
│   ├─→ _TEMPLATE_REFERENCE.md ········ 레퍼런스 작성 템플릿
│   ├─→ _NAVIGATION_MAP.md ············ 페이지 라우트 맵 & 연결성 추적
│   │   └─ ⚠️ kdyweb 사용 시 _WEB_CONTRACT.md가 이 파일을 대체
│   └─→ _WEB_CONTRACT.md ·············· (kdyweb 사용 시) 웹 구조 계약 — 단일 진실 소스
│
├─→ docs/handover/_index.md ·············· 인수인계서 마스터 목록
│   ├─→ next-dev-prompt.md ··········· 다음 세션 프롬프트
│   └─→ README.md ····················· 인수인계 프로토콜
│
├─→ docs/guides/README.md ················ 운영 가이드 디렉토리
│
└─→ docs/commands/_index.md ·············· 명령어 모음 (복사해서 사용)
```

## 핵심 원칙
- **역사 삭제 금지** — 세션 기록, 인수인계서 등 모든 기록은 영구 보존
- **풀뿌리 연결** — 위 트리를 따라가면 모든 기록에 도달 가능해야 함
- **페이지 연결성** — 모든 페이지는 홈(/)에서 클릭으로 도달 가능해야 함 (`docs/rules/navigation-connectivity.md`)
  - kdyweb 스킬 사용 시: `docs/references/_WEB_CONTRACT.md`가 페이지 라우트 맵의 단일 진실 소스이며, `_NAVIGATION_MAP.md`를 대체합니다
- .env, .env.local, nul 파일 커밋 금지
- 시크릿 키 클라이언트 노출 금지
- 이미지/API키 등 외부 리소스 필요 시 정해진 형식으로 요청

## 프로젝트별 규칙
- 주석/커밋 메시지 한국어
- 스택별 코딩 규칙: docs/rules/coding-stacks/typescript-react.md
- UI: 다크 테마, Supabase 대시보드 스타일 (사이드바 네비게이션, 카드 기반)
- 한국어 UI
- 배포: PM2로 프로세스 관리, Cloudflare Tunnel 경유

## 세션 시작/종료
- **시작**: `docs/status/current.md` + 최신 `docs/handover/` 인수인계서 확인
- **종료** (4단계):
  1. `docs/status/current.md` 세션 요약표에 1행 추가
  2. 해당 날짜 아카이브에 상세 기록 (`docs/logs/`)
  3. 인수인계서 작성 (`docs/handover/`)
  4. `docs/handover/next-dev-prompt.md` 갱신
