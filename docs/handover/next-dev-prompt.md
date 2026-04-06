# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
# 개발 서버
npm run dev

# WSL2 배포 — /ypserver 스킬 사용 권장
# 수동 배포:
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
docs/MASTER-DEV-PLAN.md                            — ⭐ 세션별 개발 마스터 계획서 (단일 진실 소스)
CLAUDE.md                                          — 프로젝트 규칙 + 문서 트리
docs/status/current.md                             — 현재 상태 + 세션 요약표
docs/handover/260406-session4-frontend-design.md   — 최신 인수인계서 (디자인 개선)
docs/handover/260406-session3-security-wave2.md    — 보안 Wave 2 인수인계서
docs/guides/server-boot-manual.md                  — 서버 부팅 매뉴얼
```

## 최근 완료된 작업

- 세션 1 (2026-04-06): 프로젝트 초기화 + 대시보드 v1 + 보안 Wave 1
- 세션 2 (2026-04-06): 대시보드 기능 개선 (그래프, 모달, 검색, 반응형)
- 세션 3 (2026-04-06): 보안 Wave 2 (Rate Limiting + 감사 로그)
- 세션 4 (2026-04-06): 프론트엔드 디자인 전면 개선 + ypserver 배포 스킬

## 현재 Git 상태

```
브랜치: main
리모트: origin → https://github.com/kimdooo-a/yangpyeon-server.git
```

## 추천 다음 작업

**마스터 계획서(`docs/MASTER-DEV-PLAN.md`)의 세션 번호를 따라 진행합니다.**

### 세션 5: SPIKE 기술 검증 (다음 세션)
- [ ] SPIKE-01: SQLite + Drizzle + Next.js 빌드 검증 (2h)
- [ ] SPIKE-04: shadcn/ui 기존 테마 호환 (1h) — SPIKE-01과 병렬
- [ ] SPIKE-02: SSE + Cloudflare Tunnel 통과 (1h)

### 세션 6: Phase 11a+11b — Zod + 토스트
- [ ] 전체 API route에 Zod 스키마 적용
- [ ] Sonner 토스트 알림 시스템

### 세션 7: Phase 11d+11e — SQLite + 감사 로그 영속화
- [ ] SQLite + Drizzle 도입 (3 테이블)
- [ ] 감사 로그 인메모리 → DB 전환

> 전체 로드맵: 세션 5~18, 총 14 세션 계획  
> 상세: `docs/MASTER-DEV-PLAN.md` 참조

## 알려진 이슈 및 주의사항

- **middleware 경고**: Next.js 16에서 middleware → proxy 전환 권장 (동작 문제 없음)
- **감사 로그 휘발**: 인메모리 방식이라 PM2 재시작 시 초기화됨
- **터널 수동 시작**: WSL 재시작 시 `cloudflared tunnel run yangpyeong` 수동 실행 필요
- ~~마지막 갱신 시각 표시~~ — 세션 4에서 대시보드에 구현 완료

---
[← handover/_index.md](./_index.md)
