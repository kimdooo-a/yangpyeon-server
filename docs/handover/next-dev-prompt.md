# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
# 개발 서버
npm run dev

# WSL2 배포 — /ypserver 스킬 사용 권장
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

## 필수 참조 파일

```
docs/MASTER-DEV-PLAN.md                            — 세션별 개발 마스터 계획서 (단일 진실 소스)
CLAUDE.md                                          — 프로젝트 규칙 + 문서 트리
docs/status/current.md                             — 현재 상태 + 세션 요약표
docs/handover/260406-session8-12-massive-feature.md — 최신 인수인계서 (세션 8~12)
```

## 최근 완료된 작업

- 세션 1~4: 프로젝트 초기화 + 대시보드 + 보안 + 디자인
- 세션 5: kdywave 종합 분석 + 마스터 계획서
- 세션 6: SPIKE 검증 + Zod
- 세션 7: 회원관리 + 파일박스 v2 (PostgreSQL)
- **세션 8~12 (최신)**: 토스트, 감사로그DB, IP화이트리스트, 메트릭차트, SSE실시간, 감사로그UI, 환경변수관리, DB인증통합, 역할접근제어, Cmd+K

## 현재 DB 구조

### PostgreSQL (Prisma)
- User (id, email, name, phone, passwordHash, role, isActive, lastLoginAt)
- Folder (id, name, parentId, ownerId) — 자기참조 트리
- File (id, name, storedName, mimeType, size, folderId, ownerId)

### SQLite (Drizzle) — data/dashboard.db
- audit_logs (id, timestamp, action, ip, path, method, status_code, user_agent, detail)
- metrics_history (id, timestamp, cpu_usage, memory_used, memory_total)
- ip_whitelist (id, ip, description, created_at)

## 현재 Git 상태

```
브랜치: main
리모트: origin → https://github.com/kimdooo-a/yangpyeon-server.git
```

## 추천 다음 작업

**마스터 계획서(`docs/MASTER-DEV-PLAN.md`)의 세션 번호를 따라 진행합니다.**

### 즉시 가능
- [ ] Phase 13d: 스켈레톤 UI + 빈 상태 컴포넌트 (테마 작업 완료 후)

### 세션 13~15 (마스터 계획 세션 14~18)
- [ ] Phase 14a: TanStack Table Editor (DB 테이블 브라우저)
- [ ] Phase 14b: CRUD 에디터 (행 추가/수정/삭제)
- [ ] Phase 14c: SQL Editor (Monaco Editor)
- [ ] Phase 15a: 파일 매니저 강화
- [ ] Phase 15b: 알림 시스템 (웹훅 + 이메일)
- [ ] Phase 15c: shadcn/ui 점진 전환

> 전체 로드맵: `docs/MASTER-DEV-PLAN.md` 참조

## 알려진 이슈 및 주의사항

- **middleware 경고**: Next.js 16에서 middleware → proxy 이름 변경 권장 (동작 문제 없음)
- **레거시 인증 30일 전환**: role 없는 구형 JWT → ADMIN 간주, DASHBOARD_PASSWORD fallback 유지
- **터널 수동 시작**: WSL 재시작 시 `cloudflared tunnel run yangpyeong` 수동 실행 필요
- **다른 터미널**: 배색/테마 작업 진행 중일 수 있음 — globals.css, 페이지 Tailwind 클래스 충돌 주의

---
[← handover/_index.md](./_index.md)
