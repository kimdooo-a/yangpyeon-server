# 프로젝트 현황

> 상위: [CLAUDE.md](../../CLAUDE.md) → **여기**

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 프로젝트명 | 양평 부엌 서버 대시보드 |
| 스택 | Next.js 16 + TypeScript + Tailwind CSS 4 |
| 최종 수정 | 2026-04-06 (세션 4) |

## 현재 진행 상태

- [x] Phase 1: 초기화 (개발 체계 셋팅)
- [x] Phase 2: Next.js 프로젝트 생성 + 대시보드 v1
- [x] Phase 3: 서버 모니터링 API + UI
- [x] Phase 4: PM2 프로세스 관리
- [x] Phase 5: Cloudflare Tunnel 상태
- [x] Phase 6: 로그 뷰어
- [x] Phase 7: 배포 (PM2 + Cloudflare Tunnel)
- [x] Phase 8: 보안 Wave 1 (인증, 명령어 주입 방지, CORS/CSRF, 보안 헤더)
- [x] Phase 9: 대시보드 기능 개선 (그래프, 프로세스 모달, 로그 검색, 반응형 사이드바)
- [x] Phase 9b: 프론트엔드 디자인 전면 개선 (5개 페이지 + 공통 컴포넌트 + 사이드바)
- [ ] Phase 9c: 추가 개선 (네트워크 트래픽, 알림 페이지) ← **다음 작업**
- [x] Phase 10: 보안 Wave 2 (Rate Limiting, 감사 로그) — Zod는 다음 세션
- [ ] Phase 11: Zod 입력 검증 (전체 API 일괄 적용)

## 실행 방법

```bash
# 개발
npm run dev

# WSL2 배포 (Windows에서)
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && npm install && npm run build && pm2 restart dashboard"
```

## 접속 URL

| 서비스 | URL | 비고 |
|--------|-----|------|
| 로컬 | http://localhost:3000 | 개발/프로덕션 동일 포트 |
| 외부 | https://stylelucky4u.com | Cloudflare Tunnel 경유, 로그인 필요 |

## 세션 기록 요약표

> 매 세션 종료 시 1행 추가 (삭제 안 함)
> 상세 기록 → [logs/_index.md](../logs/_index.md)

| 세션 | 날짜 | 제목 | 아카이브 | 인수인계서 |
|------|------|------|----------|------------|
| 1 | 2026-04-06 | 초기화 + 대시보드 v1 + 보안 Wave 1 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/250406-session1-init-security.md) |
| 2 | 2026-04-06 | 대시보드 기능 개선 (그래프, 모달, 검색, 반응형) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session2-dashboard-improve.md) |
| 3 | 2026-04-06 | 보안 Wave 2 (Rate Limiting + 감사 로그) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session3-security-wave2.md) |
| 4 | 2026-04-06 | 프론트엔드 디자인 전면 개선 + ypserver 배포 스킬 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session4-frontend-design.md) |

## 이슈/메모
- KT 회선 포트 80/443 차단 → Cloudflare Tunnel 필수
- 기존 테스트 서버 삭제 완료, 대시보드로 대체됨
- middleware 경고 (Next.js 16 proxy 전환 권장, 현재 동작 문제 없음)
- CPU 사용률 0% 표시 이슈 (순간 스냅샷, 평균 계산 로직 필요) — 미니 그래프로 추이 확인 가능해짐
- Cloudflare Tunnel: WSL 재시작 시 수동 시작 필요
