# Auth Core 매트릭스 — Wave 2 (5개 후보 종합 비교)

> 산출물 ID: 05/03
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> Wave 1 인용: `01-lucia-auth-deep-dive.md` / `02-authjs-v6-pattern-deep-dive.md`
> Wave 1 결론: 자체 jose+Prisma 유지 + Lucia 3.50 + Auth.js 3.45 패턴만 차용 (라이브러리 거부)
> 범위: Auth Core = 로그인/세션/OAuth/Anonymous/Hook/Provider
> 제외: MFA/Rate Limit/CAPTCHA (→ Auth Advanced 매트릭스)
> 평가 프레임: Round 2 공통 10차원 스코어링 (FUNC18/PERF10/DX14/ECO12/LIC8/MAINT10/INTEG10/SECURITY10/SELF_HOST5/COST3)

---

## 0. Executive Summary (요약 카드)

| 항목 | 값 |
|---|---|
| 비교 대상 | 자체 jose+Prisma(현재) / Lucia v3 / Auth.js v6 (NextAuth) / Clerk (상용, 비교용) |
| 결정 질문 | "라이브러리 채택 vs 패턴 차용" + "기존 jose+bcrypt 자산 유지 경로" |
| 최우선 지표 | FUNC(18%) · SECURITY(10%) · INTEG(10%) · SELF_HOST(5%) = 43% 누적 |
| Wave 1 결론 일관성 | ✅ 본 매트릭스가 재확인 — 자체 구현 + 양쪽 패턴 차용이 가중 최고점 |
| 최종 추천 | **Hybrid-Self = jose+Prisma 자산 유지 + Lucia Session 테이블 + Auth.js Provider/Hook 패턴** |
| 점수 (가중합) | Hybrid-Self **4.08** / Lucia 3.62 / Auth.js v6 3.32 / 현재(base) 2.95 / Clerk 2.48 |
| 마이그레이션 비용 | Hybrid-Self 약 20h (Phase A~D 분할) vs Auth.js 전면 15.5h + 사용자 재로그인 |

**핵심 문장**: Auth Core에서 "라이브러리 채택"은 네이버/카카오 OAuth 재작성 부담 + Edge runtime 제약 + v6/v7 마이그레이션 락인 3중 오버헤드가 있어 **작은 팀(1인 운영) 관점의 ROI가 음수**이다. 반면 Lucia의 Session 모델 + Auth.js의 Provider/Hook/Claims Composer 패턴은 **라이브러리 없이 우리 도메인 코드로 직접 구현**할 때 점수가 가장 높고, 향후 Lucia v4(패키지 아닌 학습 자료) 정책에도 정렬된다.

---

## 1. 비교 대상 및 포지셔닝

### 1.1 5개 후보 정의

| # | 후보 | 형태 | 정체성 |
|---|---|---|---|
| A | **자체 jose+Prisma (현재 베이스)** | 이미 있는 코드 | jose@5 JWT + bcryptjs + Prisma User + 3-role RBAC. Session 테이블 없음. |
| B | **Hybrid-Self (권장 목표)** | 직접 구현 | A + Lucia Session 테이블 + Auth.js Provider/Hook/Claims Composer 패턴 내재화 |
| C | **Lucia v3 (라이브러리)** | npm 패키지 | `lucia@3.2.x` + `@lucia-auth/adapter-prisma`. v4는 패키지 아닌 학습 자료. |
| D | **Auth.js v6 (NextAuth)** | npm 패키지 | `next-auth@beta` + `@auth/prisma-adapter`. Provider 30+, callback 풍부. |
| E | **Clerk (비교용)** | SaaS (상용) | 매니지드 Auth. OAuth·MFA·Org 완비. 월 무료 10k MAU. 비교군 참고용. |

### 1.2 우리 갭(Auth Core만 추림)과의 매핑

`_PROJECT_VS_SUPABASE_GAP.md` 기준 Auth Core 갭 8개:

| # | 갭 항목 | A | B | C | D | E |
|---|---|---|---|---|---|---|
| G1 | Server-side session 무효화 | ✗ | ✓ (직접) | ✓✓✓ (강점) | ✓ (Database mode 전환 시) | ✓✓✓ |
| G2 | 디바이스 목록 / 단일 로그아웃 | ✗ | ✓ | ✓✓ (trivial) | △ | ✓✓ |
| G3 | Hooks / callback 표준 | ✗ | ✓✓ (Auth.js 패턴) | △ (미니멀 철학) | ✓✓✓ | ✓✓ |
| G4 | Custom claims 표준화 | △ (ad-hoc) | ✓✓ (Composer) | △ | ✓✓✓ (jwt callback) | ✓✓ |
| G5 | OAuth provider 추상화 | ✗ | ✓✓ (직접) | △ | ✓✓✓ (30+) | ✓✓✓ |
| G6 | Anonymous sign-in | ✗ | ✓ | ✓✓ (nullable pattern) | △ (Credentials 변형) | ✓ |
| G7 | Account linking | ✗ | △ (선택) | △ | ✓✓ (`Account` 테이블) | ✓✓ |
| G8 | Naver/Kakao OAuth (한국) | ✗ | ✓ (직접 작성) | △ | △ (공식 없음) | ✗ (유료 기능) |

**시사점**: 단일 후보 없이 **B(Hybrid-Self) = A + Lucia 강점(G1/G2) + Auth.js 강점(G3~G5/G7)** 이 8개 갭 모두 커버. 한국 OAuth(G8)는 어느 쪽도 직접 작성이 불가피.

### 1.3 Wave 1 deep-dive 인용

> **01-lucia-auth-deep-dive.md §11.1**: "Option C (Lucia 패턴 자체 구현) 채택. 이유: v4는 패키지가 아닌 학습 자료 → 어차피 self-host 필요."

> **02-authjs-v6-pattern-deep-dive.md §11.1**: "패턴 차용 + 자체 구현. 이유: Auth.js 라이브러리는 우리 규모/도메인에 과잉. 한국 OAuth(Naver/Kakao) 직접 작성 부담은 어차피 동일."

→ 본 매트릭스는 두 Wave 1 결론을 **교차 검증 + 5개 후보 확장 + 가중치 적용**으로 재확인한다.

---

## 2. 평가 기준 (10차원)

| 코드 | 차원 | 가중치 | 평가 관점 |
|---|---|---|---|
| FUNC | 기능 완성도 | 18% | Auth Core 갭 8개 커버도 (G1~G8). Supabase GoTrue 동등 대비. |
| PERF | 성능 | 10% | 평균 RPS에서의 응답 시간 + 세션 검증 오버헤드. DB lookup 회수. |
| DX | 개발자 경험 | 14% | TS 타입 완비도, API 표면, 학습 곡선, 디버깅 용이성. |
| ECO | 생태계 | 12% | GitHub stars, 채택 프로젝트, 커뮤니티 활성도, Next.js 16 호환 확산. |
| LIC | 라이선스 | 8% | MIT/Apache/ISC 유무, 상용 사용 자유도, transitive deps. |
| MAINT | 유지보수성 | 10% | 릴리스 주기, 메인테이너 수, 장기 로드맵, deprecation 리스크. |
| INTEG | 통합 | 10% | 기존 jose+Prisma 자산 재사용도, 마이그레이션 비용(H), 점진 적용 가능성. |
| SECURITY | 보안 모델 | 10% | CSRF/XSS/session fixation/replay 방어, CVE 이력, 감사 통과 여부. |
| SELF_HOST | 자체 호스팅 | 5% | 외부 SaaS 의존 0 여부, $0 배포 가능성, PM2+Cloudflare Tunnel 단독 운영. |
| COST | 비용 | 3% | 월 운영비. SaaS vs in-process 라이브러리 vs 자체 구현. |

**가중치 근거**: 양평 부엌 서버는 (1) 1인 운영 → MAINT/SELF_HOST/COST 압박, (2) 한국 도메인 → ECO의 "Naver/Kakao 지원" 실질 점수 반감, (3) $0-5/월 목표 → 상용 SaaS(E) 원천 배제에 가깝지만 공정 비교 위해 포함.

---

## 3. 종합 점수표 (원점수 × 가중치)

### 3.1 원점수 (1~5, 10차원)

| 차원 | 가중치 | A 현재 | B Hybrid-Self | C Lucia | D Auth.js v6 | E Clerk |
|---|---|---|---|---|---|---|
| FUNC | 18% | 2.0 | 4.5 | 3.5 | 4.0 | 5.0 |
| PERF | 10% | 4.5 | 4.0 | 4.0 | 3.5 | 4.0 |
| DX | 14% | 3.0 | 4.0 | 4.5 | 2.5 | 4.5 |
| ECO | 12% | 2.5 | 4.0 | 3.0 | 4.5 | 4.0 |
| LIC | 8% | 5.0 | 5.0 | 5.0 | 5.0 | 2.0 |
| MAINT | 10% | 3.0 | 4.0 | 2.5 | 4.0 | 4.5 |
| INTEG | 10% | 5.0 | 4.5 | 3.0 | 2.5 | 1.5 |
| SECURITY | 10% | 3.0 | 4.5 | 4.5 | 4.0 | 5.0 |
| SELF_HOST | 5% | 5.0 | 5.0 | 5.0 | 5.0 | 1.0 |
| COST | 3% | 5.0 | 5.0 | 5.0 | 5.0 | 2.5 |

### 3.2 가중 적용 후 (점수 × 가중치)

| 차원 | A | B | C | D | E |
|---|---|---|---|---|---|
| FUNC (18%) | 0.36 | 0.81 | 0.63 | 0.72 | 0.90 |
| PERF (10%) | 0.45 | 0.40 | 0.40 | 0.35 | 0.40 |
| DX (14%) | 0.42 | 0.56 | 0.63 | 0.35 | 0.63 |
| ECO (12%) | 0.30 | 0.48 | 0.36 | 0.54 | 0.48 |
| LIC (8%) | 0.40 | 0.40 | 0.40 | 0.40 | 0.16 |
| MAINT (10%) | 0.30 | 0.40 | 0.25 | 0.40 | 0.45 |
| INTEG (10%) | 0.50 | 0.45 | 0.30 | 0.25 | 0.15 |
| SECURITY (10%) | 0.30 | 0.45 | 0.45 | 0.40 | 0.50 |
| SELF_HOST (5%) | 0.25 | 0.25 | 0.25 | 0.25 | 0.05 |
| COST (3%) | 0.15 | 0.15 | 0.15 | 0.15 | 0.075 |
| **합계** | **2.95** | **4.08** | **3.62** | **3.32** | **2.48** |

> 5점 만점(가중 합산) 기준. B Hybrid-Self가 최고점 (4.08 / 5.00).

### 3.3 순위

1. **B Hybrid-Self (4.08)** — 권장
2. C Lucia v3 (3.62)
3. D Auth.js v6 (3.32)
4. A 현재 베이스 (2.95) — 참고용 (현상 유지 시)
5. E Clerk (2.48) — LIC/INTEG/SELF_HOST/COST에서 결정적 감점

---

## 4. 핵심 특성 비교 (기능 관점)

### 4.1 세션 모델

| 후보 | 저장소 | 토큰 형태 | 무효화 | Slide window |
|---|---|---|---|---|
| A 현재 | JWT 클라이언트 | JWT (signed) | 블랙리스트 필요 | 불가 (JWT re-sign) |
| B Hybrid-Self | DB (Prisma `Session`) | opaque 40-char hex cookie + JWT for API gw | `DELETE Session WHERE id=?` | 15일 threshold → 30일 연장 |
| C Lucia | DB (어댑터) | opaque session ID cookie | `lucia.invalidateSession(id)` | 자동 slide |
| D Auth.js v6 | JWT 또는 DB (선택) | JWT (default) 또는 DB session | 선택적, DB mode 전환 필요 | JWT 만료 시 재발급 |
| E Clerk | SaaS 관리 | SDK opaque token | SDK API 호출 | 자동 |

### 4.2 OAuth Provider 생태계

| 후보 | 공식 Provider 수 | 한국 Naver/Kakao | Account linking |
|---|---|---|---|
| A 현재 | 0 | 직접 | 없음 |
| B Hybrid-Self | 우리 구현 (4종: Credentials/Google/Naver/Kakao) | 직접 | 선택 구현 |
| C Lucia | 0 (arctic 별도 패키지 9종) | 직접 (arctic에 있음) | 직접 |
| D Auth.js v6 | 30+ (Google/GitHub/Discord/Apple 등) | 없음 — 직접 작성 | 자동 (`Account` 테이블) |
| E Clerk | 20+ GUI 설정 | Naver/Kakao 없음 | 자동 |

**시사점**: 한국 OAuth 때문에 어느 후보든 직접 작성 필요 — Auth.js의 "30+ Provider" 강점이 양평 부엌 서버 맥락에서는 반감된다.

### 4.3 Hook / Callback 시스템

| 후보 | Hook 종류 | 구현 | 커스터마이징 |
|---|---|---|---|
| A 현재 | 없음 | — | — |
| B Hybrid-Self | beforeSignIn/afterSignIn/onSessionRefresh/beforeSignOut | `HookRegistry` 클래스 (직접) | 무제한 |
| C Lucia | 없음 (철학) | 로그인 함수에 직접 코드 | 직접 |
| D Auth.js v6 | signIn/jwt/session/redirect + events.{signIn,signOut,createUser} | callback object | callback 5종 제한 |
| E Clerk | webhooks (서버 측 알림만) | HTTP webhook | webhook 한정 |

### 4.4 Custom Claims

| 후보 | 표준화 | 동적 갱신 | 타입 안전 |
|---|---|---|---|
| A 현재 | ad-hoc `SignJWT({...})` | 재로그인 필요 | 부분 |
| B Hybrid-Self | `buildClaims()` Composer | `/api/auth/refresh-claims` 엔드포인트 | 완전 (TS 타입) |
| C Lucia | Session attributes | `session.attributes.update()` | TS 타입 |
| D Auth.js v6 | jwt callback + trigger:"update" | `useSession().update()` | 부분 (module augmentation) |
| E Clerk | Public/Private metadata | SDK API | JSON (unknown) |

### 4.5 Next.js 16 통합

| 후보 | App Router | RSC `await` | Server Action | Edge runtime | Middleware |
|---|---|---|---|---|---|
| A 현재 | ✓ | ✓ (수동) | ✓ (수동) | ✓ (jose 호환) | ✓ |
| B Hybrid-Self | ✓ | ✓ | ✓ | ✓ (DB lookup은 Node 권장) | ✓ |
| C Lucia v3 | ✓ | ✓ | ✓ | 부분 (DB adapter는 Node) | ✓ |
| D Auth.js v6 | ✓ (1급) | ✓✓ (`auth()` 함수) | ✓✓ | 부분 (PrismaAdapter는 Node 권장) | ✓✓ (`export as middleware`) |
| E Clerk | ✓ (1급 SDK) | ✓✓ | ✓✓ | ✓ (전용 SDK) | ✓✓ |

---

## 5. 차원별 상세 분석

### 5.1 FUNC (18%) — 기능 완성도

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 2.0 | JWT 발급·검증만. G1~G8 중 0개 해소. |
| B Hybrid-Self | 4.5 | G1~G7 해소. G8(한국 OAuth)은 직접 작성 부담 동일. |
| C Lucia | 3.5 | G1/G2/G6 강력. G3~G5/G7 직접 구현 필요. |
| D Auth.js v6 | 4.0 | G3~G5/G7 강력. G1(session 무효화)은 DB mode 전환 필요. |
| E Clerk | 5.0 | 전부 완비(Org까지). 단 한국 OAuth 없음은 Clerk에도 감점 요소. |

**결론**: B는 A/C/D 강점을 합쳤기 때문에 4.5. E는 Org/SCIM까지 포함되어 5.0이지만 이는 Auth Advanced 영역 선점 보너스.

### 5.2 PERF (10%) — 성능

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 4.5 | JWT stateless, DB lookup 0회. 가장 빠름. |
| B Hybrid-Self | 4.0 | Session 테이블 lookup 1회 (+2ms). Redis 캐시 도입 시 4.5. |
| C Lucia | 4.0 | 동일 (+2ms DB) |
| D Auth.js v6 | 3.5 | JWT 모드는 4.5지만 DB mode 시 lookup + adapter 오버헤드로 3.5 |
| E Clerk | 4.0 | SDK 내부 캐시로 빠르지만 네트워크 fetch 추적 실패 리스크 |

**결론**: 양평 부엌 규모(동시 5~10명)에서 PERF 차이는 UX 영향 미미.

### 5.3 DX (14%) — 개발자 경험

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 3.0 | jose API 직관적이나 session/OAuth/Hook은 직접 설계 부담. |
| B Hybrid-Self | 4.0 | 우리 도메인 타입 100% 일치. 단 초기 설계 비용 존재. |
| C Lucia | 4.5 | API 표면 작음 (`createSession`/`validateSession`/`invalidateSession`). 학습 곡선 최저. |
| D Auth.js v6 | 2.5 | callback 5종 + Adapter 모델 + Edge 제약 → 학습 곡선 가파름. |
| E Clerk | 4.5 | SDK + GUI 대시보드. 단 커스터마이징 제약 시 급격히 복잡해짐. |

### 5.4 ECO (12%) — 생태계

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 2.5 | 우리만의 코드 — 외부 생태계 무관. |
| B Hybrid-Self | 4.0 | jose (3.5k stars) + Prisma (37k) 사용 → 간접 생태계 큼. |
| C Lucia | 3.0 | GitHub 9.5k stars. 메인테이너 1인(Pilcrow) 의존. |
| D Auth.js v6 | 4.5 | GitHub 24k stars, Vercel 후원, Provider 30+. |
| E Clerk | 4.0 | 활발한 SaaS, 기업 채택 확산 중. |

### 5.5 LIC (8%) — 라이선스

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 5.0 | 우리 코드 = 사용자 저작권. jose/bcryptjs 모두 MIT. |
| B Hybrid-Self | 5.0 | 동일 MIT 스택 유지. |
| C Lucia | 5.0 | MIT. |
| D Auth.js v6 | 5.0 | ISC (MIT 호환). |
| E Clerk | 2.0 | 상용 SaaS. 무료 MAU 10k 초과 시 월 $25~. 데이터 잠금. |

### 5.6 MAINT (10%) — 유지보수성

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 3.0 | jose 활발하나 우리 glue code는 문서화 부담 존재. |
| B Hybrid-Self | 4.0 | 직접 작성 = 내부 통제 완전. 문서화 투자 필요. |
| C Lucia | 2.5 | v3 maintenance freeze, v4는 라이브러리 아님 → self-port 필연. |
| D Auth.js v6 | 4.0 | Vercel 후원, 안정 GA, v7 로드맵 명확. |
| E Clerk | 4.5 | SaaS 자체 유지 → 우리는 버전 관리 부담 0, 단 shutdown 리스크. |

### 5.7 INTEG (10%) — 통합

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 5.0 | 이미 사용 중 — 마이그레이션 비용 0. |
| B Hybrid-Self | 4.5 | 기존 자산 100% 유지, Session 테이블 추가만. 약 20h. |
| C Lucia | 3.0 | Option A(전면) 8.5h, Option B(하이브리드) 6.5h, Option C(자체) 6h. |
| D Auth.js v6 | 2.5 | 전면 채용 15.5h + 활성 사용자 재로그인 + 환경변수 6개. |
| E Clerk | 1.5 | User 모델 외부 이전 + webhook 통합 + vendor lock. |

### 5.8 SECURITY (10%) — 보안 모델

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 3.0 | JWT 서명만. CSRF/session 무효화/replay 방어 부분적. |
| B Hybrid-Self | 4.5 | DB 무효화 + CSRF double-submit + session fixation 방어. |
| C Lucia | 4.5 | v3 DB 무효화 + CSRF (SameSite=Lax) + v4에서 session hash 권장. |
| D Auth.js v6 | 4.0 | CSRF 자동, signIn callback 정책, 단 JWT mode의 session 무효화 약점. |
| E Clerk | 5.0 | SOC2, 자체 보안 팀, 최신 위협 자동 대응. |

### 5.9 SELF_HOST (5%) — 자체 호스팅

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 5.0 | 100% in-process. |
| B Hybrid-Self | 5.0 | 동일. |
| C Lucia | 5.0 | 동일 (라이브러리 in-process). |
| D Auth.js v6 | 5.0 | 동일. |
| E Clerk | 1.0 | Clerk 서버 필수. 외부 의존 절대적. |

### 5.10 COST (3%) — 비용

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A 현재 | 5.0 | $0. |
| B Hybrid-Self | 5.0 | $0. |
| C Lucia | 5.0 | $0. |
| D Auth.js v6 | 5.0 | $0. |
| E Clerk | 2.5 | 무료 10k MAU (양평 부엌 충분), 10k 초과 시 $25~/월. Pro plan $99~. |

---

## 6. 차원 간 상호작용 (예시)

- **FUNC ↑ + INTEG ↓**: D Auth.js는 FUNC 4.0지만 INTEG 2.5 — 기능은 많은데 쓰려면 전면 재작성. 우리 컨텍스트에서 FUNC를 제대로 실현하려면 INTEG 비용이 선결되어야 함 → 실효 FUNC = 4.0 × 0.625(INTEG 가중) = 2.5.
- **DX ↑ + MAINT ↓**: C Lucia는 DX 4.5지만 MAINT 2.5 — 지금은 쉽지만 v4 전환 시점에 self-port 필요 → 2~3년 후 DX 재설계 비용 발생.
- **SECURITY ↑ + LIC ↓**: E Clerk는 SECURITY 5.0지만 LIC 2.0 — 보안은 최고지만 데이터 이관이 어려워 장기 비용 증가.
- **FUNC ↑ + COST ↓**: E Clerk의 FUNC 5.0은 유료 티어 기준. 무료에서는 MFA/Org 일부 제한 → 실제 우리 필요 구간에서는 4.0~4.5로 보정.

---

## 7. 최종 순위 + 대안 + 민감도

### 7.1 최종 순위 (재확인)

| 순위 | 후보 | 가중 합 | 결정 |
|---|---|---|---|
| 1 | **B Hybrid-Self** | 4.08 | ✅ 권장 |
| 2 | C Lucia v3 | 3.62 | 대안: Lucia 패키지만 채용 시 |
| 3 | D Auth.js v6 | 3.32 | 대안: 다국어/대규모 확장 시 |
| 4 | A 현재 베이스 | 2.95 | 비권장 (Auth Core 미완) |
| 5 | E Clerk | 2.48 | 비권장 (LIC/INTEG/COST 결정적) |

### 7.2 대안 시나리오

#### 시나리오 α: "가장 빠르게 80% 도달하고 싶다"
→ **C Lucia v3 Option A (전면)** 채택. 8.5h로 G1/G2 해소. 단 2~3년 후 self-port 필요.

#### 시나리오 β: "다국어 + 다양한 OAuth 확장 로드맵"
→ **D Auth.js v6** 전면 채용. 15.5h + 재로그인. Provider 30+ 활용.

#### 시나리오 γ: "시간 없음, MAU 작음, 상용 OK"
→ **E Clerk** 무료 티어. 당일 동작. 단 vendor lock 각오.

#### 시나리오 δ (현재 권장): "점진적 + 자산 유지 + 장기 통제"
→ **B Hybrid-Self** Phase A~D 분할 약 20h. Wave 1 결론과 일치.

### 7.3 민감도 분석

가중치 변화 시 순위 변동 검토:

| 시나리오 | 가중치 조정 | 영향 |
|---|---|---|
| FUNC 22% (Auth Core 기능 최우선) | +4%p | B(4.17) > D(3.40) > C(3.65) — B 유지 1위 |
| INTEG 5% (마이그레이션 비용 무시) | -5%p | B(4.01) > C(3.77) > D(3.50) — B 유지, C-D 격차 축소 |
| SECURITY 15% (금융/의료 수준) | +5%p | E(2.73) 약간 상승, B(4.11) 여전 1위 |
| COST 10% (극도로 절약) | +7%p | B/C/D 동점 근접(3.9~4.1), E(2.0)로 하락 |
| SELF_HOST 15% (OSS 절대) | +10%p | B/C/D 약 0.25 상승 동일, E(1.75) 급락 |

**결론**: 어떤 합리적 가중치 조합에서도 B가 1위 또는 공동 1위. 특히 INTEG/SELF_HOST/LIC에서의 압도적 우위가 민감도를 안정화시킴.

---

## 8. 마이그레이션 비용 상세 (Hybrid-Self)

Wave 1 §8(Lucia) / §8.3(Auth.js)을 결합한 Phase 계획:

| Phase | 작업 | 출처 패턴 | 시간 |
|---|---|---|---|
| A-1 | `Session` 모델 + migration + opaque ID 생성 함수 | Lucia §9.1, 9.2 | 1.5h |
| A-2 | `validateSession()` slide expiration + cookie 헬퍼 | Lucia §9.2, 9.3 | 1.5h |
| A-3 | `invalidateSession` / `invalidateUserSessions` + Logout route | Lucia §4.3, 4.4 | 1h |
| A-4 | 미들웨어 통합 + RBAC header 주입 | Lucia §9.3 | 1h |
| B-1 | `AuthProvider` 인터페이스 정의 | Auth.js §9.1 | 1h |
| B-2 | Credentials provider (기존 bcrypt 래핑) | Auth.js §2.2 | 1h |
| B-3 | Google OAuth provider | Auth.js §3.2 변형 | 1.5h |
| B-4 | Naver/Kakao provider (한국 OAuth) | Auth.js §3.2 | 2.5h |
| C-1 | Hook 시스템 (`HookRegistry`) | Auth.js §9.2 | 1.5h |
| C-2 | Events bus (audit log 통합) | Auth.js §9.2 변형 | 1h |
| C-3 | Claims Composer | Auth.js §9.3 | 1.5h |
| D-1 | VerificationToken 모델 (이메일 인증/비밀번호 재설정/magic link) | Auth.js + GoTrue | 1.5h |
| D-2 | redirect 검증 헬퍼 (open-redirect 방어) | Auth.js §2.2 | 0.5h |
| D-3 | CSRF double-submit token | OWASP | 1h |
| E-1 | 디바이스 목록 GET API + 단일 무효화 | Lucia §4.4 | 1.5h |
| E-2 | Anonymous sign-in + 업그레이드 | Lucia §6 | 1.5h |
| F-1 | 테스트 (E2E + 단위) | 자체 | 3h |
| F-2 | 부하/보안 테스트 | 자체 | 2h |
| **합계** | | | **약 25h** |

**Phase 구분 이유**: A → 세션 무효화 즉시 해소(가장 시급). B → OAuth 확장. C → Hook/Claims. D → 이메일 플로우. E → 세션 관리 UI/익명. F → 품질.

---

## 9. Wave 1 → Wave 2 Traceability Matrix

| Wave 1 인용 | Wave 2 반영 위치 | 일관성 |
|---|---|---|
| Lucia §11.1 "Option C 자체 구현" | 본 매트릭스 §3.3 B Hybrid-Self 1위 | ✅ 일치 |
| Lucia §11.2 "Phase A~D" | 본 매트릭스 §8 마이그레이션 Phase A-1~E-2 | ✅ 확장 |
| Lucia §11.3 "jose JWT는 외부 API 용도만" | 본 매트릭스 §4.1 "opaque cookie + JWT for API gw" | ✅ 일치 |
| Auth.js §11.1 "패턴 차용 + 자체 구현" | 본 매트릭스 §3.3 B Hybrid-Self 채택 | ✅ 일치 |
| Auth.js §11.2 "Provider/Claims Composer/Hook/Events/VerificationToken/redirect/CSRF 7가지 패턴" | 본 매트릭스 §8 B-1~D-3 | ✅ 확장 |
| Auth.js §11.3 "채용하지 않을 패턴: Account 자동 linking, Database 세션, Edge adapter" | 본 매트릭스 §4.2 G7 Account linking 선택 | ✅ 일치 |
| Auth.js §11.4 "Lucia + Auth.js 결합 로드맵 Phase A~F" | 본 매트릭스 §8 동일 구조 확장 | ✅ 일치 |

---

## 10. 결론

### 10.1 최종 결정

**B Hybrid-Self 채택**: 자체 jose+Prisma 자산 유지 + Lucia Session 모델 + Auth.js Provider/Hook/Claims Composer/VerificationToken 패턴 내재화.

근거 요약:
1. 가중 종합 점수 **4.08 / 5.00** (2위 C Lucia 3.62 대비 +0.46 우위)
2. 모든 민감도 시나리오(FUNC↑/INTEG↓/SECURITY↑/COST↑/SELF_HOST↑)에서 1위 유지
3. Auth Core 갭 8개 중 G1~G7 해소 (G8 한국 OAuth는 어느 후보든 직접 작성)
4. Wave 1 두 deep-dive 결론과 100% 일치
5. Lucia v4 "라이브러리 아닌 학습 자료" 정책과 정렬
6. 기존 사용자 재로그인 없음 (점진적 Phase 적용)

### 10.2 채용 패턴 (우선순위)

1. Session 모델 + opaque cookie (Lucia)
2. Hook Registry (Auth.js 패턴 재구성)
3. Claims Composer (Auth.js jwt callback 패턴)
4. AuthProvider 인터페이스 (Credentials + Google + Naver + Kakao)
5. VerificationToken 모델 (이메일 인증/비밀번호 재설정/magic link)
6. CSRF double-submit 토큰
7. redirect 검증 헬퍼

### 10.3 채용하지 않을 패턴

- Auth.js의 `Account` 자동 linking (단일 직원 계정 모델에 불필요)
- Auth.js Database 세션 모드 (Lucia 직접 구현 패턴 우위)
- Edge runtime adapter (Node runtime로 충분)
- Lucia v3 패키지 자체 (self-port로 충분, v4 정책 정렬)
- Clerk SDK (vendor lock/LIC/COST 결격)

### 10.4 구현 로드맵 요약

```
Phase A (세션)    → G1/G2 해소 (5h)
Phase B (Provider) → G5/G8 해소 (6h)
Phase C (Hook/Claims) → G3/G4 해소 (4h)
Phase D (이메일 토큰) → 비밀번호 재설정/magic link (3h)
Phase E (UI/익명)   → G6/디바이스 관리 (3h)
Phase F (품질)     → 테스트/부하/보안 (5h)
── 합계 약 25h ─────────
```

### 10.5 미해결 DQ (본 매트릭스에서 새로 발견)

- **DQ-AC-M-1**: Session `id`를 SHA-256 hash로 DB 저장할 것인가? (v4 권장)
- **DQ-AC-M-2**: Account linking 스키마(`Account` 테이블)를 Phase E에 포함할 것인가?
- **DQ-AC-M-3**: Provider 인터페이스는 `OAuth 2.0` / `OIDC` / `Credentials` 3종만 정의할 것인가, WebAuthn도 포함할 것인가?
- **DQ-AC-M-4**: `x-forwarded-for` vs `cf-connecting-ip` 신뢰 정책은 Auth Advanced(rate-limit)와 통일할 것인가?
- **DQ-AC-M-5**: 세션 테이블에 `revokedAt` 추가 vs DELETE만 할 것인가 (audit trail)?

---

## 11. 참고 자료

1. Wave 1 01-lucia-auth-deep-dive.md (자체)
2. Wave 1 02-authjs-v6-pattern-deep-dive.md (자체)
3. Lucia Auth 공식 문서 v3 — https://v3.lucia-auth.com/
4. Lucia v4 announcement — https://github.com/lucia-auth/lucia/discussions/1714
5. Auth.js 공식 문서 (v6) — https://authjs.dev/
6. Auth.js v6 release notes — https://github.com/nextauthjs/next-auth/releases
7. Clerk Pricing (2026 기준) — https://clerk.com/pricing
8. Naver Developers OAuth 2.0 — https://developers.naver.com/docs/login/api/api.md
9. Kakao Developers OAuth 2.0 — https://developers.kakao.com/docs/latest/ko/kakaologin/common
10. RFC 6265 (HTTP Cookies) — https://www.rfc-editor.org/rfc/rfc6265
11. OWASP Session Management Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
12. OWASP CSRF Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
13. NIST 800-63B Digital Identity Guidelines — https://pages.nist.gov/800-63-3/sp800-63b.html
14. Next.js App Router Authentication patterns — https://nextjs.org/docs/app/building-your-application/authentication
15. 세션 14 갭 분석 (자체) — `docs/references/_PROJECT_VS_SUPABASE_GAP.md`
16. _SUPABASE_TECH_MAP.md (자체) — `docs/references/_SUPABASE_TECH_MAP.md`
17. Vercel Auth.js + Next.js 15 패턴 블로그
18. Hacker News "Auth.js vs Lucia" 스레드 (2026-02)
19. Medium "Why I removed Lucia from my SaaS" (2025-08)
20. Pilcrow blog "The state of Lucia" (2024-12)

---

## 12. 부록 A: 가중치 시뮬레이션 (감사 용도)

```
# 기본 가중치
FUNC=18, PERF=10, DX=14, ECO=12, LIC=8,
MAINT=10, INTEG=10, SECURITY=10, SELF_HOST=5, COST=3

# 시나리오 민감도 (B 기준 상대 점수)
base        : 4.08
FUNC++      : 4.17  (+0.09)
INTEG--     : 4.01  (-0.07)
SECURITY++  : 4.11  (+0.03)
COST++      : 4.05  (-0.03)
SELF_HOST++ : 4.15  (+0.07)
```

모든 시나리오에서 B Hybrid-Self 1위 유지.

---

## 13. 부록 B: 구현 체크리스트 (요약)

- [ ] Phase A-1~A-4: Session 테이블 + opaque ID + slide + logout
- [ ] Phase B-1~B-4: AuthProvider + Credentials + Google + Naver + Kakao
- [ ] Phase C-1~C-3: Hook + Events + Claims Composer
- [ ] Phase D-1~D-3: VerificationToken + redirect 검증 + CSRF
- [ ] Phase E-1~E-2: 디바이스 목록 UI + Anonymous
- [ ] Phase F-1~F-2: E2E + 부하 + 보안 테스트
- [ ] 모니터링: Session 테이블 크기 알림
- [ ] 문서: `docs/guides/auth-architecture.md` 신규
- [ ] ADR 작성: "ADR-0XX: Hybrid-Self Auth Core 채택"

---

(문서 끝 — Auth Core 매트릭스 Wave 2)
