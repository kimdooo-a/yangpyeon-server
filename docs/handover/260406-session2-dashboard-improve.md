# 인수인계서 — 세션 2 (대시보드 기능 개선)

> 작성일: 2026-04-06
> 이전 세션: [session1](./250406-session1-init-security.md)

---

## 작업 요약

GitHub 원격 저장소 초기 푸시 + 대시보드 기능 4종 개선 (미니 그래프, 프로세스 상세 모달, 로그 검색/필터, 반응형 사이드바). 터미널 A(보안 Wave 2)와 병렬 작업.

## 대화 다이제스트

### 토픽 1: GitHub 원격 저장소 푸시
> **사용자**: GitHub 새 레포 생성 화면 공유 (kimdooo-a/yangpyeon-server)

커밋 이력이 없는 상태에서 remote 추가 → 초기 커밋 생성 → `main` 브랜치로 푸시 완료. `.claude/` 폴더는 로컬 전용으로 제외.

**결론**: 69개 파일 초기 커밋 성공, origin/main 추적 설정 완료

### 토픽 2: next-dev-prompt.md 기반 기능 개선 시작
> **사용자**: "진행해줘" (세션 1 인수인계서의 추천 작업 6개 참조)

next-dev-prompt.md 확인 → 우선순위 높은 4개 작업 선정 (대시보드 홈, PM2 프로세스, 로그 뷰어, UI/UX). 소스 파일 10개 전체 읽기 후 병렬 에이전트 구현 시도.

### 토픽 3: 충돌 방지 — 멀티 터미널 영역 분리
> **사용자**: "충돌 방지 지침이 docs/locks/active-sessions.md에 있으니 작업 전에 읽어줘. 이 터미널(A)이 src/middleware.ts와 src/lib/에서 보안 작업 중이니까 그쪽은 건드리지 마. 네 영역은 src/app/ 페이지들과 src/components/"

active-sessions.md 확인 후 터미널 B 영역만 수정하도록 제한:
- 수정 가능: `src/app/` 페이지, `src/components/`, `src/app/api/pm2/`
- 수정 금지: `src/middleware.ts`, `src/lib/`

**결론**: 영역 분리 준수하며 4개 에이전트 병렬 실행

### 토픽 4: 4개 기능 병렬 구현
> 대시보드 홈, PM2 프로세스, 로그 뷰어, 반응형 사이드바를 4개 에이전트로 동시 구현

1. **대시보드 홈**: SVG 미니 라인 차트 (외부 라이브러리 없이), useRef로 20개 데이터 포인트 버퍼링, 디스크 색상 단계
2. **PM2 프로세스**: 새 API `GET /api/pm2/detail?name=` + 프로세스명 클릭 시 상세 모달 (13개 항목)
3. **로그 뷰어**: PM2 프로세스 목록 동적 드롭다운, 키워드 검색, 레벨 필터 (전체/경고/에러)
4. **반응형 사이드바**: 모바일 햄버거 메뉴 + 오버레이 + translate-x 애니메이션

빌드 성공 확인 (`npx next build` — 15개 라우트 정상).

**결론**: Phase 9 핵심 기능 완료, 빌드 통과

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 미니 차트 SVG 직접 구현 | recharts vs SVG 직접 | 번들 크기 최소화, 서버 대시보드에 외부 차트 라이브러리 과잉 |
| 2 | PM2 상세 API를 query param 방식 | `/api/pm2/[name]/detail` vs `/api/pm2/detail?name=` | 기존 `[action]` 동적 라우트와 충돌 방지 |
| 3 | 터미널 A/B 영역 분리 | 순차 작업 vs 병렬+잠금 | 동시 작업 효율, active-sessions.md로 충돌 방지 |

## 수정 파일 (10개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/components/dashboard/mini-chart.tsx` | **신규** — SVG 미니 라인 차트 컴포넌트 |
| 2 | `src/components/dashboard/stat-card.tsx` | children prop 추가, red 색상 옵션 추가 |
| 3 | `src/app/page.tsx` | CPU/메모리 히스토리 버퍼링 + 미니 차트 삽입 + 디스크 색상 단계 |
| 4 | `src/app/api/pm2/detail/route.ts` | **신규** — PM2 프로세스 상세 정보 API |
| 5 | `src/app/processes/page.tsx` | 프로세스명 클릭 → 상세 모달 추가 |
| 6 | `src/app/logs/page.tsx` | 프로세스 드롭다운 동적 로딩, 키워드 검색, 레벨 필터 |
| 7 | `src/components/layout/sidebar.tsx` | 모바일 햄버거 메뉴 + 오버레이 사이드바 |
| 8 | `src/app/layout.tsx` | body에 relative, main에 pt-14 md:pt-0 추가 |

## 상세 변경 사항

### 1. 대시보드 홈 — 실시간 그래프 + 디스크 색상
- `MiniChart`: SVG path + linearGradient, viewBox 200x40, preserveAspectRatio="none"
- `StatCard`: `children` prop으로 차트 삽입, `red` 색상 추가
- `DashboardPage`: `useRef`로 cpuHistory/memHistory 20포인트 버퍼, `diskColor()` 함수로 50/80% 임계값

### 2. PM2 프로세스 — 상세 모달
- `/api/pm2/detail`: pm2 jlist → name으로 필터 → 13개 필드 반환 (exec_path, cwd, log 경로 등)
- 모달: fixed overlay + stopPropagation, 외부 클릭으로 닫기

### 3. 로그 뷰어 — 검색 + 필터
- 초기 로딩 시 `/api/pm2`에서 프로세스 목록 가져와 select 옵션 동적 생성
- `filteredLogs`: level 필터 (error/warn regex) + search 키워드 (대소문자 무시)

### 4. 반응형 사이드바
- `md:hidden` 햄버거 버튼 (fixed z-50), X 아이콘 토글
- 모바일 사이드바: `-translate-x-full` ↔ `translate-x-0` 전환
- 데스크톱: `hidden md:flex` 기존 사이드바 유지

## 검증 결과
- `npx next build` — 성공 (15개 라우트, 에러 없음)

## 터치하지 않은 영역
- `src/middleware.ts` — 터미널 A 보안 영역
- `src/lib/` — 터미널 A 영역 (auth.ts, rate-limit.ts, audit-log.ts)
- `src/app/network/page.tsx` — Phase 9b로 이관
- `src/app/alerts/` — Phase 9b로 이관

## 알려진 이슈
- CPU 0% 이슈 — 미니 그래프로 추이 확인 가능하나 근본 해결은 /proc/stat 2회 읽기 필요
- 터미널 A 보안 Wave 2 작업과 통합 커밋 필요 (Zod 검증 일괄 적용은 Phase 11)

## 다음 작업 제안
1. 터미널 A/B 작업 통합 후 배포
2. Phase 9b: 네트워크 트래픽 정보, 알림 페이지
3. Phase 11: Zod 입력 검증 일괄 적용
4. CPU 사용률 /proc/stat 2회 측정 로직 개선

---
[← handover/_index.md](./_index.md)
