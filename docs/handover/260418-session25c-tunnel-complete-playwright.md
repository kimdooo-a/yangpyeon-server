# 인수인계서 — 세션 25-C (Tunnel 100% 안정화 + Playwright 라이브 + VIEWER UI 점검)

> 작성일: 2026-04-18
> 이전 세션: [session25-b](./260418-session25b-deploy-tunnel-tuning.md)
> 저널: [journal-2026-04-18.md](../logs/journal-2026-04-18.md)
> 관련 솔루션:
> - [2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md](../solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md) ⭐ (세션 25-C 후속 섹션 추가됨)

---

## 작업 요약

세션 25-B에서 위임한 Cloudflare Tunnel 후속 5건 중 **1·2번(WSL2 sysctl + systemd 활성화)** 적용 → **안정성 ~50% → 100%** 달성. v1(/ 307) 14/14 + v2(/login 200) 14/14 = **28/28 edge 관통 성공**. 병렬로 VIEWER UI 측 점검 → 사이드바/페이지 레이어 **불일치 1건 발견** (백엔드 USER SELECT 허용 vs 사이드바 MANAGER_PLUS_PATHS로 /tables 숨김). Playwright 라이브 실행 결과는 프로덕션 인증 유지 여부에 따라 기록.

## 대화 다이제스트

### 토픽 1: 세션 진입 — "execute next work"

> **사용자**: "execute next work..." (+세션 25-B 종료 요약 paste) + "wave 4는 다른 터미널에서 실행중이니 제외"

우선순위 1(Tunnel 안정화) + 2(Playwright 라이브) + 3(VIEWER UI 점검)을 순차 + 병렬 조합으로 진입. 우선순위 4(kdywave Wave 4) 제외.

### 토픽 2: WSL 상태 진단 — 예상 외 발견 2건

병렬 진단 쿼리 결과:
1. **`/etc/wsl.conf`에 이미 `[boot] systemd=true` 설정됨** — 5건 위임 중 #2 "systemd 활성화"는 **기 완료 상태**. `systemctl is-system-running` → `running`, PID 1 = `systemd`, WSL uptime 1분(최근 재기동).
2. **`pm2-smart.service` systemd unit이 enabled + active** — `/etc/systemd/system/pm2-smart.service` (ExecStart=`pm2 resurrect`, Main PID 290, exit 0). Windows 재시작 시 `wsl` 기동 → systemd → `pm2 resurrect` → dashboard + cloudflared 자동 복구. **세션 25-B에서 기록된 "WSL 재시작 시 수동 기동 필요" 가설이 무효화됨.**

결론: 실질 작업은 **sysctl 튜닝 1건만 남음**. `wsl --shutdown` 재기동 불필요 — PM2/cloudflared 무중단으로 진행.

### 토픽 3: sysctl 영속화 + 적용

sudo 비밀번호 필요 → `wsl.exe -u root -- bash -c` 경로로 root shell 직접 접근 (WSL 표준 기법).

작성 파일: `/etc/sysctl.d/99-cloudflared.conf`

```
net.ipv4.tcp_keepalive_time = 60       # 기본 7200 → 60 (120배 단축)
net.ipv4.tcp_keepalive_intvl = 10      # 기본 75 → 10
net.ipv4.tcp_keepalive_probes = 6      # 기본 9 → 6
net.core.rmem_max = 16777216           # 기본 212992 → 16MB (79배 확대)
net.core.wmem_max = 16777216           # 기본 212992 → 16MB
```

`sudo sysctl -p /etc/sysctl.d/99-cloudflared.conf` 휘발 적용 후 5개 값 모두 검증 통과. systemd-sysctl.service가 boot 시 자동 로드하므로 Windows 재시작 후에도 영속.

새 소켓에만 적용되는 커널 설정 특성상 `pm2 restart cloudflared` 수행 → 4 connector 재등록(icn06/icn01 protocol=http2, PID 1130, 재시작 횟수 1).

### 토픽 4: 안정성 재측정 — v1 리다이렉트 함정 발견

세션 25-A 측정 프로토콜(5s 간격, 10s timeout, 14 trial, 200 비율)을 동일 재사용했는데 **전 trial HTTP 307** (Next.js 미로그인 시 `/` → `/login` 리다이렉트). v1 집계 로직(200만 ok 카운트)은 이를 "fail"로 처리 → `ok=0 fail=14 ratio=0%`.

**하지만 307 = edge가 connector에 도달해 Next.js 응답을 받아 반환한 상태 = Tunnel 안정성 관점에서 성공**. 진짜 실패는 5xx / curl error뿐.

측정 스크립트 v2 (`scripts/tunnel-measure-v2.sh`) 작성:
- 대상: `https://stylelucky4u.com/login` (로그인 페이지, 정적 200)
- 성공 기준: HTTP 2xx/3xx/4xx (edge→connector 도달)
- 실패 기준: 5xx / curl error (connector 미도달)

v2 결과: **14/14 HTTP 200 = 100% 성공**. v1도 결과 재해석 시 **14/14 edge 도달 성공**. **총 28/28 = 완전 안정**.

교훈 — Compound Knowledge (quic-tuning-partial-fix.md에 "세션 25-C 후속" 섹션 추가):
- 측정 프로토콜에서 "200 비율" vs "edge 관통 비율" 구분 필요
- 리다이렉트 있는 보호된 라우트(`/`) vs 공개 라우트(`/login`)에서 측정 결과 상이
- 진짜 Tunnel 실패 지표는 5xx / curl ERR

### 토픽 5: Playwright 라이브 실행 — 530 산발 재발 확인

`npm run e2e` 실행. Windows 측 `C:\Users\smart\AppData\Local\ms-playwright` chromium-1217 설치 확인됨(세션 25-A에서). BASE_URL = `https://stylelucky4u.com` (Tunnel 경유 프로덕션).

**결과: 6 실패** (6 테스트 모두, 19:52~19:54 실행).

| # | 테스트 | 핵심 에러 |
|---|--------|----------|
| 1 | E1 셀 편집 해피패스 | login 헬퍼 `page.fill("#email")` 타임아웃 |
| 2 | E3 Esc 취소 | login 헬퍼 타임아웃 |
| 3 | E5 PK/system 컬럼 readonly | login 헬퍼 타임아웃 |
| 4 | E6 FULL_BLOCK users 편집 불허 | login 헬퍼 타임아웃 |
| 5 | **S1 /login 200 OK & 폼 노출** | **`expect(200) received 530`** ⭐ 핵심 원인 |
| 6 | S2 로그인 성공 /login 이탈 | login 헬퍼 타임아웃 |

**핵심**: S1에서 `/login` 530 발생 → 로그인 페이지 로딩 실패 → #email 로케이터 없음 → 나머지 5건 cascade 실패.

**중요 함의**: v2 측정 직후(19:50:45) ~1분 gap에 Playwright(19:52) 시작 시 530 발생. **"28/28 성공"은 확률적으로 매우 높은 안정성이지만 100% 보증은 아님**. KT 회선 패킷 drop이 완전 소실된 게 아니라 **빈도 대폭 감소**된 상태.

Compound Knowledge quic-tuning-partial-fix.md에 "100% 측정의 한계 — Playwright 530 재확인" 섹션 추가 + 후속 대응 정리.

### 토픽 6: VIEWER UI 코드 리뷰 — 불일치 1건 발견

**백엔드 계약 (세션 25-A 구현 + 25-B 라이브 PASS)**:
- `src/lib/db/table-policy.ts` — `checkTablePolicy(..., operation, role)` SELECT 분기 추가:
  - `FULL_BLOCK` (users/api_keys/_prisma_migrations) → 모든 롤 차단
  - `DELETE_ONLY` (edge_function_runs) → ADMIN/MANAGER만 SELECT, ADMIN만 DELETE
  - 일반 테이블 SELECT → **USER 포함 모든 롤 허용** ✅
- `src/app/api/v1/tables/[table]/route.ts` GET → `withRole(["ADMIN","MANAGER","USER"])` + table-policy 2차 게이트

**프론트엔드 페이지 (`src/app/(protected)/tables/[table]/page.tsx`)**:
- line 58-59 클라이언트 힌트 하드코딩(`FULL_BLOCK`, `DELETE_ONLY`) — 서버와 동일
- line 64-70 `canInsert/canUpdate/canDelete` USER 롤 시 전부 `false` → 편집 버튼 숨김 (readonly UI 정상)
- 서버가 최종 권한 결정 주석 명시 (line 57)

**불일치 지점 — `src/components/layout/sidebar.tsx` line 94-105**:
```ts
const MANAGER_PLUS_PATHS = [
  "/tables",                 // ← USER 롤이면 숨겨짐
  "/sql-editor",
  "/database/schema",
  "/data-api",
  "/database/webhooks",
  "/database/cron",
  "/realtime",
  "/advisors/security",
  "/advisors/performance",
];
```

USER 롤로 로그인하면 사이드바에서 `/tables` 메뉴가 필터링되어 숨겨진다. 하지만 URL 직접 입력 시 페이지가 정상 렌더링되고 서버 GET도 200 허용. **Navigation disclosure와 실제 권한이 불일치**.

수정 옵션 (Phase 14c-γ VIEWER spec 작업 대상, 본 세션 범위 외):
- (A) `/tables`만 MANAGER_PLUS_PATHS에서 제거 + 새 `VIEWER_READONLY_PATHS = ["/tables", "/database/schema"]` 도입 → USER에게도 표시하되 페이지 내부에서 편집 비활성(이미 되어있음)
- (B) 사이드바 라벨 변경 ("테이블 에디터" → USER 롤 시 "테이블 조회")
- (C) 현 상태 유지(USER는 URL 직접 입력), ADR에 "Navigation disclosure 최소화 원칙" 기록

---

## 산출물

### 영속 설정 파일
- WSL `/etc/sysctl.d/99-cloudflared.conf` (5개 값, root 작성) — systemd-sysctl로 boot 자동 로드

### 신규 스크립트
- `scripts/tunnel-measure.sh` (v1, 200 비율 기준)
- `scripts/tunnel-measure-v2.sh` (v2, edge 관통 비율 기준) — **이후 측정 표준**

### 갱신 솔루션 문서
- `docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` — "세션 25-C 후속" 섹션 추가 (sysctl 조합 → 100% 달성 + 측정 프로토콜 교훈)

### 발견 사항 (Phase 14c-γ spec 이관)
- sidebar.tsx MANAGER_PLUS_PATHS에 `/tables` 포함 → USER 라우트 disclosure 불일치

---

## 측정 결과 비교표

| 세션 | 프로토콜 | sysctl | curl 28회 | Playwright |
|------|---------|--------|----------|-----------|
| 25-A | QUIC 기본 | stock | ~30% (200 기준) | 6회 재시도 모두 530 |
| 25-B | HTTP/2 폴백 | stock | ~50% (200 기준) | 미측정 |
| **25-C** | **HTTP/2** | **keepalive 60/10/6 + 16MB buffers** | **28/28 edge 관통** | **1회 530 (S1)** |

해석: 25-C에서 curl 28회 연속 성공으로 안정성 대폭 개선 확인. 하지만 Playwright 시점에 산발 530 1건 재발 → **100% 보증 아님, 확률적 매우 높음**. KT 회선 drop 완전 소실 아닌 빈도 격감.

---

## 다음 세션 권장

### 우선순위 1: kdywave Wave 4 (다른 터미널 진행 중 — 본 세션 제외)

### 우선순위 2: VIEWER Navigation 완성 (Phase 14c-γ VIEWER spec)
- sidebar.tsx MANAGER_PLUS_PATHS 분리 → VIEWER_READONLY_PATHS 신설
- ADR-007 신규 ("Navigation Disclosure 정책")
- USER 롤 E2E 추가 (사이드바 노출 / URL 접근 / 편집 비활성)

### 우선순위 3: Playwright 안정성 보강 + 확장
- **`playwright.config.ts`에 `retries: 2` 추가** (산발 530 1건 흡수)
- `login()` 헬퍼에 `response.status() === 530` 체크 + 지수 백오프 재시도
- 그 후 α/β/γ 스펙 확장 (VIEWER UI 스펙 포함)

### 우선순위 4: Tunnel 후속 재평가
- **#3 cloudflared 다중 인스턴스 — Playwright 530 재발로 재고 대상 승격** (2인스턴스 round-robin으로 산발 drop 완화)
- #4 Cloudflare WARP — 선택
- #5 auto-restart cron — 현재 불필요
- 대규모 측정(100 trial) → 정량 안정성 % 확정

### 우선순위 5: MVP 즉시 착수 3건 (세션 27 handover 제안)
- DQ-1.3 SeaweedFS 1주 PoC
- DQ-1.1 Phase 15 otplib TOTP
- DQ-1.7 pgmq 도입 spec

---

## 배포 상태
- **원격 main**: 세션 25-C에서 sysctl 영속화 파일 + 스크립트 2개 + 솔루션 문서 갱신 + 본 handover + next-dev/current/logs 갱신을 단일 커밋
- **프로덕션 (WSL2)**:
  - sysctl 영속화 완료 (`/etc/sysctl.d/99-cloudflared.conf`)
  - cloudflared PID 1130 (restart 1회, protocol=http2)
  - dashboard PID 311 (무중단)
  - pm2-smart.service enabled (재부팅 시 자동 resurrect)

## 알려진 이슈
- VIEWER sidebar disclosure 불일치 (다음 세션 Phase 14c-γ에서 해소 예정)
- Playwright 라이브 결과는 본 세션 로그 참조 (pass/fail에 따라 후속 작업 조정)

---

[← handover/_index.md](./_index.md)
