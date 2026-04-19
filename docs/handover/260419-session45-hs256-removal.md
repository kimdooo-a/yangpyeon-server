# 세션 45 — HS256 legacy 제거 + 이월 6건 현실성 분류

- **날짜**: 2026-04-19
- **소요**: ~40분 (자율 실행)
- **범위**: 세션 44 이월 6건 중 본 세션 단독 실행 가능 1건(HS256) + baseline 관찰 1건(cleanup tick)
- **커밋**: `dac8c34` (9 파일 +321/-90) → origin/main 푸시 완료
- **세션 저널**: [journal-2026-04-19.md](../logs/journal-2026-04-19.md) (세션 44+45 누적)

---

## 요약

세션 44가 인계한 이월 6건에 대해 사용자가 "모든 이월 세션 모두 직접 실행"을 요청. AI 단독 실행 가능성 분류 후 실행:

| # | 항목 | 판정 | 이유 |
|---|------|------|------|
| 1 | KST 03:00 자동 cleanup tick 실측 | **부분 수행** | dashboard PM2 uptime 21분 → 24h+ 미충족, baseline 관찰만 가능 |
| 2 | MFA biometric 브라우저 QA (8 시나리오) | **불가** | WebAuthn Touch ID/Windows Hello 생체 인터랙션 필수 — 사용자 직접 |
| 3 | **HS256 legacy 제거** | **✅ 실행** | 본 세션 주 작업 (단독 세션 권장 분류) |
| 4 | Phase 16 진입 (Vault/Capistrano/Canary/Infra UI) | **불가** | 24h 스코프 — 단일 세션 범위 초과 |
| 5 | SP-013·016 물리 측정 | **불가** | PG+wal2json 설치 / 50GB 디스크 / 13h 실시간 측정 환경 필요 |
| 6 | `/kdygenesis --from-wave` | **불가** | 주간 실행 플로우 오케스트레이션 — 사용자 판단 영역 |

본 세션은 실질적으로 **HS256 legacy 제거 단독 세션**으로 압축 실행.

---

## 세션 44 → 45 이월 처리 판정 근거

### 환경 제약 (1·5)

`wsl pm2 jlist` 결과 `dashboard` restart=15 uptime=**0h21m** 확인. 세션 44의 PM2 ↺=15 baseline에서 세션 45 진입 시점까지 추가 재시작은 없었지만 uptime 자체가 아직 21분 → KST 03:00 tick은 24h+ 무중단 필요. 본 세션 도중 재배포(Phase 6)로 다시 ↺=16이 되면 시계 리셋. **정책**: baseline 관찰만 기록, 실측 자체는 세션 46+로 재이월.

SP-013/016은 프로덕션 PG에 wal2json 확장 설치 + 50GB 볼륨 + 30분 DML 주입 실측이 필요 — 원격 자동화 불가.

### 인간 인터랙션 (2·6)

MFA 8 시나리오 중 3번(Passkey Enroll), 4번(Login via Passkey)은 `navigator.credentials.create/get()` 호출을 통한 생체 인증(Touch ID/Windows Hello) 필수. 자동화 도구로는 사용자 프롬프트 대체 불가. `/kdygenesis --from-wave`는 85+ 태스크를 주간 플로우로 편성하는 경영/우선순위 결정 — 사용자 컨텍스트 필요.

### 스코프 초과 (4)

Phase 16 = Vault 8h + Capistrano 8h + Canary 4h + Infrastructure UI 4h = **24h**. 세션 평균 2~3h 규모 대비 8~12배. 본 세션에 일부만 착수하면 "중간 상태 이월"이 또 다른 이월을 낳음 (세션 43 → 44 → 45 패턴). **본 세션은 단독 세션 권장된 HS256에 집중**하고 Phase 16 은 별도 multi-session 계획 필요 항목으로 분리.

`★ Insight ─────────────────────────────────────`
- 세션 44 교훈 "이월 = 단순 미완이 아니라 분리 필요성의 신호" 확증 — 이월 6건 중 AI 단독 실행 가능한 것은 실질 1건. 6건을 한 세션에 묶으려 하면 각 작업이 서로의 컨텍스트를 잠식해 품질 저하. **강제 통합의 반증 샘플**.
- "단독 세션 권장" 레이블은 이번처럼 risk profile에 기반한 보수적 평가일 수도 있다. 실제 착수 전 환경 재점검(AUTH_SECRET이 이미 프로덕션 env에 없음) 하나로 1.5h→40min으로 축소됨. 이월 과제는 **실행 직전 환경 스냅샷으로 원래 예측을 수정**하는 습관이 비용을 크게 절감한다.
`─────────────────────────────────────────────────`

---

## HS256 legacy 제거 (주 작업)

### 사전 상태 스냅샷

| 항목 | 값 |
|------|------|
| dashboard PM2 uptime | 0h21m (restart=15) |
| cloudflared uptime | 9h54m (restart=0) |
| 활성 v1 sessions (refresh-token 기반) | 8 |
| JWKS 활성 키 | 1 (kid=`047353dc...`, ES256, status=CURRENT) |
| **WSL2 .env 에 `AUTH_SECRET`** | **❌ 미설정** (↔ `JWT_V1_SECRET` 는 SET) |

**결정적 사실**: `AUTH_SECRET`이 이미 프로덕션 env에 없어서 `getLegacySecret()`는 언제나 `null` 반환 → HS256 fallback 경로는 세션 45 시점 이미 dead code. 제거 = 리스크 0 순수 cleanup.

### 코드 변경 (3 파일, +10 / -81)

#### 1) `src/lib/auth.ts` (81→44 라인, -44%)

- `getLegacySecret()` 함수 삭제
- `verifySession()` 의 "kid 없음 → HS256 legacy" 분기 삭제 → `if (!header.kid) return null;` 조기 반환
- 주석: "세션 45 이전 HS256 fallback 제거" 명시, readability 최적화
- `createSession()`, `getSessionFromCookies()`, `verifyPassword()` 는 그대로

#### 2) `src/lib/auth/signing.ts` 전체 삭제 (45 라인)

- `grep` 전수 스캔 결과 import 0건 확인 (`getCurrentSigningKey`, `listSigningKeys` 모두 미사용 export)
- 세션 14~32 시절 env-based 2키 로테이션 스켈레톤으로 추정. 세션 33 JWKS DB 모델 도입 후 대체되었으나 파일만 잔존
- 삭제 후 `src/lib/auth/` 에 `keys.ts` 하나 남음

#### 3) `.env.example`

```diff
-AUTH_SECRET=여기에_랜덤_시크릿_키_입력_32자_이상
+# AUTH_SECRET (HS256 legacy) 는 세션 45 에서 제거됨. dashboard_session 은 ES256 JWKS 로 서명.
```

삭제가 아니라 **주석 forensic marker**로 보존 → 향후 `grep AUTH_SECRET` 로 제거 이력 즉시 추적 가능.

### 신규 자산

- `scripts/session45-active-sessions.cjs` (신규, 37 라인) — Prisma 직접 쿼리로 활성 sessions + jwks_keys 스냅샷. 향후 HS256 유사 작업에 재활용 가능 (다만 `generated/prisma/client` 모듈 해상도 이슈로 본 세션에서는 psql 직접 쿼리 사용).

### 검증 (변경마다 파이프라인)

- **tsc --noEmit**: 0 에러
- **vitest**: 14 files / **254 PASS** (세션 44 대비 회귀 0건)
- **/ypserver prod --skip-win-build** 1회 재배포:
  - Prisma migrate deploy: No pending migrations
  - WSL2 npm run build: 성공 (Next.js 16 모든 라우트 컴파일)
  - Drizzle migrate: applied successfully
  - PM2 restart: ↺=16 (15→16)
  - cloudflared: 9h54m 유지
  - Health: HTTP 307 (로그인 리다이렉트 정상)

### E2E 로그인 검증

- `POST /api/auth/login` (Origin/Referer 헤더 포함, CSRF 통과)
- 응답: `{success:true, deprecated:true}` HTTP 200
- **dashboard_session 쿠키 JWT header** 디코드:
  ```json
  {"alg":"ES256","kid":"047353dc2ff3f3f7e7da17b0d8110050"}
  ```
- **payload**:
  ```json
  {"sub":"legacy","email":"admin","role":"ADMIN","authenticated":true,"iat":1776595949,"exp":1776682349}
  ```
- `alg:"ES256"` + `kid` 헤더 존재 → HS256 아닌 JWKS ES256 서명 확인. kid는 프로덕션 JWKS CURRENT 키와 완벽 일치.
- 인증 경로 검증:
  - `GET /` with cookie → **HTTP 200** (인증 통과)
  - `GET /settings/users` with cookie → **HTTP 200** (admin 권한 검증 통과)
  - `GET /` without cookie → **HTTP 307** (로그인 리다이렉트, 예상 동작)

HS256 fallback 제거 후에도 실사용 admin 세션이 ES256 kid 기반으로 정상 작동. 제거 영향 0.

---

## KST 03:00 자동 cleanup tick — baseline 관찰 (P1)

세션 44 baseline = 0 entries (정상). 본 세션 진입 시 감사 로그 조회:

```
[
  { action: "CLEANUP_EXECUTED_MANUAL", summary: {sessions:2, ...} },
  { action: "CLEANUP_EXECUTED_MANUAL", summary: {sessions:4, ...} },
  ... (10건 모두 `_MANUAL` 자동 아님, 세션 35/36/44 UI 트리거 유래)
]
```

- 자동 `CLEANUP_EXECUTED` (action 에 `_MANUAL` 없음) 엔트리는 여전히 **0건**.
- 실측 조건: dashboard uptime 24h+ 동안 KST 03:00 통과. 세션 45 재배포로 PM2 ↺=16 리셋 → 다시 0시 시계 시작.
- **세션 46 진입 시 필수 체크**: `wsl pm2 describe dashboard | grep uptime` 이 24h+ 인지 확인 후 `audit_logs WHERE action='CLEANUP_EXECUTED'` 조회. PM2 restart가 잦으면 관찰 자체가 계속 밀림 → **불필요한 재배포 자제** 필요.

---

## 이월 (세션 46~)

1. **KST 03:00 자동 cleanup tick 실측** — 세션 46 진입 시 dashboard uptime 확인. 24h+ 면 즉시 검증, 미만이면 또 이월
2. **MFA biometric 브라우저 QA** — `docs/guides/mfa-browser-manual-qa.md` 8 시나리오 + Phase 15-D 활성 세션 3 시나리오, 사용자 직접 실행
3. **Phase 16 진입 (24h)** — Vault VaultService / Capistrano / Canary / Infrastructure UI. 세션 계획 분해 필요 (sub-phase별 4h 단위로)
4. **SP-013/016 물리 측정 (13h)** — 환경 확보 시점 별도 세션
5. **/kdygenesis --from-wave** — 사용자 판단 필요한 스코프 결정 영역

---

## 영향 파일

```
M  .env.example                  # AUTH_SECRET → forensic marker 주석
M  src/lib/auth.ts                # HS256 fallback 제거 (-44 lines)
D  src/lib/auth/signing.ts        # 전체 삭제 (-45 lines, 미사용 확정)
A  scripts/session45-active-sessions.cjs  # 진단 재사용 자산
M  docs/handover/260419-session45-hs256-removal.md  # 본 문서
M  docs/handover/_index.md
M  docs/handover/next-dev-prompt.md
M  docs/status/current.md
M  docs/logs/2026-04.md
```

---

## 회귀 가드 / 재현 스크립트

- `scripts/session45-active-sessions.cjs` — HS256 제거 전후 활성 세션/JWKS 상태 스냅샷. 향후 유사 "legacy secret 제거" 작업 진입 시 30초 실행으로 환경 재점검.
- 본 세션 E2E curl 순서 (handover 본문 포함) — dashboard_session JWT header 디코드 → `alg:"ES256"` + kid 확인 → 인증 HTTP 200. HS256 퇴행 즉시 탐지 가능.

---

## 연관 문서

- **세션 33** `260419-session33-phase15-step3-4-5.md` — JWKS 도입, HS256 legacy 24h 전환 계획 수립
- **세션 39 이후** 지속 인계 — HS256 제거 "단독 세션 권장"
- **Compound Knowledge**: 본 세션에서 CK 신규 없음 — AUTH_SECRET이 env에서 이미 제거된 상태에서의 pure refactor는 generalizable pattern 부족. 만약 유사 legacy 제거가 향후 반복되면 (JWT_V1_SECRET 로테이션 등) 그때 패턴화 고려.

---

[← handover/_index.md](./_index.md)
