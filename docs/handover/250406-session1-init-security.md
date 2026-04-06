# 인수인계서: 세션 1 — 프로젝트 초기화 + 보안 적용

> 작성일: 2026-04-06
> 작성자: 세션 1 (초기화 + 보안)

---

## 1. 이번 세션에서 한 일

### 1.1 프로젝트 초기화
- kdysetting으로 개발 체계 구축 (CLAUDE.md, docs/, .claude/)
- Next.js 16 + TypeScript + Tailwind CSS 프로젝트 생성
- WSL2 배포 완료 (PM2 `dashboard` 프로세스)

### 1.2 대시보드 v1 구현
- **4개 페이지**: `/` 대시보드, `/processes` PM2 관리, `/logs` 로그 뷰어, `/network` 터널 상태
- **5개 API**: /api/system, /api/pm2, /api/pm2/[action], /api/pm2/logs, /api/tunnel
- **UI**: Supabase 스타일 다크 테마, 사이드바 네비게이션

### 1.3 보안 Wave 1 적용 (kdywave)
- JWT 쿠키 인증 + 로그인 페이지
- 브루트포스 방지 (5회/5분 잠금)
- execSync → execFileSync 전환 (명령어 주입 차단)
- CORS/CSRF 미들웨어
- 보안 헤더 6종 (HSTS, X-Frame-Options 등)
- 터널 API 민감정보 제거

---

## 2. 현재 운영 상태

| 항목 | 값 |
|------|-----|
| PM2 프로세스 | `dashboard` (online, 포트 3000) |
| 외부 URL | https://stylelucky4u.com |
| 로그인 | 비밀번호: `<ADMIN_PASSWORD>` (WSL2 ~/dashboard/.env.local) |
| Cloudflare Tunnel | `yangpyeong` (백그라운드 실행 중, 재부팅 시 수동 시작 필요) |
| 소스 위치 (Windows) | E:\00_develop\260406_luckystyle4u_server |
| 소스 위치 (WSL2) | /home/smart/dashboard |

---

## 3. 아키텍처

### 3.1 네트워크 구조
```
외부 → Cloudflare Edge (인천) → Tunnel (QUIC) → WSL2 localhost:3000 → Next.js (PM2)
```

### 3.2 소스 구조 (총 18파일, 1,203줄)

```
src/
├── middleware.ts                    # 인증/CORS/CSRF 미들웨어 (74줄)
├── lib/
│   └── auth.ts                     # JWT 세션 관리 (54줄)
├── app/
│   ├── globals.css                 # 다크 테마 CSS
│   ├── layout.tsx                  # 루트 레이아웃 + Sidebar (25줄)
│   ├── page.tsx                    # 대시보드 홈 (138줄)
│   ├── login/page.tsx              # 로그인 페이지 (88줄)
│   ├── processes/page.tsx          # PM2 프로세스 관리 (165줄)
│   ├── logs/page.tsx               # 로그 뷰어 (85줄)
│   ├── network/page.tsx            # 터널 상태 (98줄)
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts      # 비밀번호 인증 + 브루트포스 방지 (79줄)
│       │   └── logout/route.ts     # 세션 삭제 (14줄)
│       ├── system/route.ts         # CPU/메모리/디스크 정보 (106줄)
│       ├── pm2/
│       │   ├── route.ts            # PM2 프로세스 목록 (42줄)
│       │   ├── [action]/route.ts   # PM2 제어: restart/stop/start (39줄)
│       │   └── logs/route.ts       # PM2 로그 조회 (34줄)
│       └── tunnel/route.ts         # Cloudflare Tunnel 상태 (30줄)
└── components/
    ├── layout/
    │   └── sidebar.tsx             # 사이드바 네비게이션 + 로그아웃 (62줄)
    └── dashboard/
        ├── stat-card.tsx           # 통계 카드 컴포넌��� (37줄)
        └── system-info.tsx         # 시스템 정보 테이블 (33줄)
```

### 3.3 인증 흐름
```
미인증 요청 → middleware.ts → /login 리다이렉트
                 ↓ (JWT 쿠키 검증)
인증 요청 → middleware.ts → CORS/CSRF 체크 → API/페이지 접근 허용

로그인: POST /api/auth/login { password } → JWT 쿠키 발급 (24시간)
로그아웃: POST /api/auth/logout → 쿠키 삭제
```

### 3.4 API 응답 구조

**GET /api/system**
```json
{
  "cpu": { "model": "i5-14500", "cores": 20, "usage": 2.3 },
  "memory": { "total": 8144457728, "used": 703430656, "free": 7441027072, "percent": 8.6 },
  "disks": [
    { "mount": "C:", "total": 1023181582336, "used": 88397246464, "free": 934784335872, "percent": 8.6 },
    { "mount": "E:", "total": 512092008448, "used": 644530176, "free": 511447478272, "percent": 0.1 },
    { "mount": "WSL2", "total": 1081101176832, "used": 3513696256, "free": 1022595125248, "percent": 0.3 }
  ],
  "uptime": 339.76,
  "hostname": "DESKTOP-KUL2BLG",
  "platform": "Linux 6.6.87.2-microsoft-standard-WSL2",
  "nodeVersion": "v24.14.1",
  "time": "2026. 4. 6. PM 6:55:03"
}
```

**GET /api/pm2**
```json
{
  "processes": [
    { "name": "dashboard", "pm_id": 0, "status": "online", "cpu": 0, "memory": 61600000, "uptime": 300000, "restarts": 0 }
  ]
}
```

**GET /api/tunnel**
```json
{ "running": true, "connections": 2 }
```

### 3.5 기술 스택 상세

| 패키지 | 버전 | 용도 |
|--------|------|------|
| next | 16.2.2 | 프레임워크 |
| react | 19.2.4 | UI |
| typescript | 6.0.2 | 타입 |
| tailwindcss | 4.2.2 | 스타일링 |
| jose | latest | JWT 토큰 |

### 3.6 환경변수 (.env.local — WSL2에만 존재)

| 변수 | 설명 |
|------|------|
| DASHBOARD_PASSWORD | 로그인 비밀번호 |
| AUTH_SECRET | JWT 서명 시크릿 (base64, 32바이트) |

---

## 4. 보안 수정 미완료 (Wave 2)

| 항목 | 우선순위 | 설명 |
|------|---------|------|
| Rate Limiting | MEDIUM | API 요청 횟수 제한 (현재 무제한) |
| Zod 입력 검증 | MEDIUM | request body/query 스키마 검증 |
| 감사 로그 | LOW | 누가 언제 무엇을 했는지 기록 |

---

## 5. 알려진 이슈

1. **middleware 경고**: Next.js 16에서 middleware → proxy 전환 권장 (동작에는 문제 없음)
2. **Cloudflare Tunnel 수동 시작**: WSL 재시작 시 `cloudflared tunnel run yangpyeong`을 수동 실행해야 함 (systemd 서비스 미등록)
3. **CPU 사용률 0%**: `/proc/stat` 기반이라 순간 스냅샷만 제공, 평균값이 아님
4. **로그 뷰어 프로세스 필터**: 드롭다운에 "전체 로그"만 있고 개별 프로세스 옵션이 없음

---

## 6. 배포 절차 (소스 수정 후)

```bash
# Windows에서 수정 후 WSL2에 배포
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && \
  rm -rf src .next && \
  cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && \
  cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts \
     /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json \
     /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts \
     /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs \
     /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && \
  npm install && npm run build && pm2 restart dashboard"
```

> **주의**: `npm install` 시 SSL 오류가 나면 `export NODE_OPTIONS=--openssl-legacy-provider` 추가
