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
| 로그인 | 비밀번호: Knp13579!yan |

## 필수 참조 파일

```
CLAUDE.md                                          — 프로젝트 규칙 + 문서 트리
docs/status/current.md                             — 현재 상태 + 세션 요약표
docs/handover/260406-session4-frontend-design.md   — 최신 인수인계서 (디자인 개선)
docs/handover/260406-session3-security-wave2.md    — 보안 Wave 2 인수인계서
docs/guides/server-boot-manual.md                  — 서버 부팅 매뉴얼
spikes/spike-001-frontend-design/findings.md       — 디자인 리서치 결과
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

### 1. 배포 테스트 — 우선순위 높음
- [ ] `/ypserver` 스킬로 실제 WSL2 배포 테스트
- [ ] 디자인 개선 결과 실서버 확인

### 2. Zod 입력 검증 — 우선순위 높음
- [ ] 전체 API route에 Zod 스키마 적용 (보안 Wave 2 잔여)
- 대상: `/api/pm2/[action]`, `/api/pm2/logs`, `/api/pm2/detail`, `/api/auth/login`

### 3. 네트워크 페이지 개선 — 우선순위 중간
- [ ] 네트워크 트래픽 정보 (/proc/net/dev 파싱)
- [ ] 외부 응답시간 측정

### 4. 알림 페이지 — 선택
- [ ] /alerts 페이지: CPU/메모리 임계치 초과 이벤트 기록
- [ ] 프로세스 다운 이벤트 기록

## 알려진 이슈 및 주의사항

- **middleware 경고**: Next.js 16에서 middleware → proxy 전환 권장 (동작 문제 없음)
- **감사 로그 휘발**: 인메모리 방식이라 PM2 재시작 시 초기화됨
- **터널 수동 시작**: WSL 재시작 시 `cloudflared tunnel run yangpyeong` 수동 실행 필요
- ~~마지막 갱신 시각 표시~~ — 세션 4에서 대시보드에 구현 완료

---
[← handover/_index.md](./_index.md)
