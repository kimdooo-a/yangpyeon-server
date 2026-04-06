# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 15 + TypeScript + Tailwind CSS
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
# 개발 서버
npm run dev

# WSL2 배포 (Windows에서 실행)
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && npm install && npm run build && pm2 restart dashboard"

# npm install SSL 오류 시
export NODE_OPTIONS=--openssl-legacy-provider
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | 비밀번호: <ADMIN_PASSWORD> |

## 필수 참조 파일

```
CLAUDE.md                                          — 프로젝트 규칙 + 문서 트리
docs/status/current.md                             — 현재 상태 + 세션 요약표
docs/handover/260406-session2-dashboard-improve.md — 세션 2 인수인계서 (기능 개선)
docs/handover/250406-session1-init-security.md     — 세션 1 인수인계서 (초기화+보안)
docs/guides/server-boot-manual.md                  — 서버 부팅 매뉴얼
```

## 최근 완료된 작업

- 세션 1 (2026-04-06): 프로젝트 초기화 + 대시보드 v1 구현 + 보안 Wave 1 적용
- 세션 2 (2026-04-06): GitHub 푸시 + 대시보드 기능 개선 4종 (미니 그래프, 프로세스 모달, 로그 검색/필터, 반응형 사이드바)
- 세션 3 (2026-04-06, 터미널 A): 보안 Wave 2 (Rate Limiting, 감사 로그) + 통합 배포

## 현재 Git 상태

```
브랜치: main
리모트: origin (kimdooo-a/yangpyeon-server)
```

## 추천 다음 작업

### 1. Zod 입력 검증 일괄 적용 — 우선순위 높음
- [ ] 모든 API 라우트에 Zod 스키마 적용 (보안 Wave 2 완료 후 예정)
- 대상: /api/auth/login, /api/pm2/[action], /api/pm2/logs, /api/pm2/detail

### 2. CPU 사용률 개선 — 우선순위 높음
- [ ] /proc/stat 2회 읽기 (100ms 간격)로 실제 사용률 계산
- 현재: 순간 스냅샷이라 항상 0%에 가까움 (미니 그래프로 추이는 볼 수 있음)

### 3. 네트워크 페이지 개선 (src/app/network/page.tsx) — 우선순위 중간
- [ ] 네트워크 트래픽 정보 (/proc/net/dev 파싱)
- [ ] 외부 응답시간 측정

### 4. 새 페이지: 알림 (src/app/alerts/page.tsx) — 우선순위 중간
- [ ] CPU/메모리 임계치 초과 이벤트 기록
- [ ] 프로세스 다운 이벤트 기록
- [ ] 사이드바에 알림 메뉴 추가

### 5. UI/UX 추가 개선 — 우선순위 낮음
- [ ] 마지막 갱신 시각 표시 (각 카드에 "3초 전")
- [ ] 서버 연결 끊김 시 재연결 알림 배너
- [ ] 프로세스별 CPU/메모리 미니 그래프 (프로세스 페이지)

## 알려진 이슈 및 주의사항

- **middleware 경고**: Next.js 16에서 middleware → proxy 전환 권장 (현재 동작 문제 없음)
- **CPU 0%**: /proc/stat 순간 스냅샷이라 항상 0%에 가까움 → 미니 그래프로 추이 확인 가능, 근본 해결은 2회 읽기 필요
- **터널 수동 시작**: WSL 재시작 시 `cloudflared tunnel run yangpyeong` 수동 실행 필요
- **active-sessions.md**: 터미널 A/B 병렬 작업 종료 → 잠금 해제 필요 여부 확인

## 소스 구조 요약

```
src/
├── middleware.ts                 # 인증/CORS/CSRF/Rate Limiting (74줄+)
├── lib/
│   ├── auth.ts                  # JWT 세션 관리
│   ├── rate-limit.ts            # 슬라이딩 윈도우 Rate Limiter
│   └── audit-log.ts             # 인메모리 감사 로그
├── app/
│   ├── layout.tsx               # 루트 레이아웃 (반응형)
│   ├── page.tsx                 # 대시보드 홈 (미니 그래프, 디스크 색상)
│   ├── login/page.tsx           # 로그인
│   ├── processes/page.tsx       # PM2 관리 (상세 모달)
│   ├── logs/page.tsx            # 로그 뷰어 (검색, 필터)
│   ├── network/page.tsx         # 터널 상태
│   └── api/
│       ├── auth/login/route.ts  # 로그인 API
│       ├── auth/logout/route.ts # 로그아웃 API
│       ├── audit/route.ts       # 감사 로그 조회 API
│       ├── system/route.ts      # 시스템 정보 API
│       ├── pm2/route.ts         # PM2 목록 API
│       ├── pm2/[action]/route.ts # PM2 제어 API
│       ├── pm2/detail/route.ts  # PM2 상세 정보 API
│       ├── pm2/logs/route.ts    # PM2 로그 API
│       └── tunnel/route.ts      # 터널 상태 API
└── components/
    ├── layout/sidebar.tsx       # 사이드바 (반응형 햄버거)
    └── dashboard/
        ├── stat-card.tsx        # 통계 카드 (children, 5색상)
        ├── system-info.tsx      # 시스템 정보 테이블
        └── mini-chart.tsx       # SVG 미니 라인 차트
```

---
[← handover/_index.md](./_index.md)
