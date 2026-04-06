# 프로젝트 현황

> 상위: [CLAUDE.md](../../CLAUDE.md) → **여기**

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 프로젝트명 | 양평 부엌 서버 대시보드 |
| 스택 | Next.js 15 + TypeScript + Tailwind CSS |
| 최종 수정 | 2026-04-06 (세션 1) |

## 현재 진행 상태

- [x] Phase 1: 초기화 (개발 체계 셋팅)
- [ ] Phase 2: Next.js 프로젝트 생성
- [ ] Phase 3: 서버 모니터링 API + UI
- [ ] Phase 4: PM2 프로세스 관리
- [ ] Phase 5: Cloudflare Tunnel 상태
- [ ] Phase 6: 로그 뷰어
- [ ] Phase 7: 배포 (PM2 + Cloudflare Tunnel)

## 프로젝트 구조

```
[Next.js 프로젝트 초기화 후 갱신]
```

## 실행 방법

```bash
# 개발
npm run dev

# 프로덕션 (WSL2)
npm run build && pm2 start npm --name dashboard -- start
```

## 접속 URL

| 서비스 | URL | 비고 |
|--------|-----|------|
| 로컬 | http://localhost:3000 | 개발/프로덕션 동일 포트 |
| 외부 | https://stylelucky4u.com | Cloudflare Tunnel 경유 |

## 세션 기록 요약표

> 매 세션 종료 시 1행 추가 (삭제 안 함)
> 상세 기록 → [logs/_index.md](../logs/_index.md)

| 세션 | 날짜 | 제목 | 아카이브 | 인수인계서 |
|------|------|------|----------|------------|
| 1 | 2026-04-06 | 프로젝트 초기화 + 개발 체계 셋팅 | [2026-04](../logs/2026-04.md) | - |

## 이슈/메모
- KT 회선 포트 80/443 차단 → Cloudflare Tunnel 필수
- 기존 테스트 서버(~/server/app.js)를 대시보드로 대체 예정
