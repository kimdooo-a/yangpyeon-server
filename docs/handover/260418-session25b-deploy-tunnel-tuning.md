# 인수인계서 — 세션 25-A + 25-B (4건 권장 작업 + 후속 배포 + Tunnel 튜닝)

> 작성일: 2026-04-18
> 이전 세션: [session24-beta](./260418-session24-phase-14c-beta.md) (세션 25는 다른 세션이 진행, [session25-supabase-parity-wave-1](./260418-session25-supabase-parity-wave-1.md))
> 저널: [journal-2026-04-18.md](../logs/journal-2026-04-18.md) (세션 25-A·25-B 섹션)
> 관련 솔루션:
> - [2026-04-18-raw-sql-updatedat-bump.md](../solutions/2026-04-18-raw-sql-updatedat-bump.md)
> - [2026-04-18-nextjs-private-folder-routing.md](../solutions/2026-04-18-nextjs-private-folder-routing.md)
> - [2026-04-18-timestamp-precision-optimistic-locking.md](../solutions/2026-04-18-timestamp-precision-optimistic-locking.md)
> - [2026-04-18-csrf-api-settings-guard.md](../solutions/2026-04-18-csrf-api-settings-guard.md)
> - [2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md](../solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md) ⭐

---

## 작업 요약

세션 24의 "다음 세션 권장" 4건(Compound Knowledge × 4 / Playwright / runReadwrite 테스트 / VIEWER 확장)을 자율 모드로 병렬 실행 후, 사용자의 "순차적으로 진행" 지시에 따라 후속 3단계(git push / `/ypserver prod` 배포 + viewer-curl V1~V9 라이브 매트릭스 / Cloudflare Tunnel QUIC→HTTP/2 튜닝) 수행. **VIEWER 확장 라이브 검증 PASS**, **Tunnel 안정성 ~30%→~50% 부분 개선**(100% 미달 — KT 회선 패킷 drop 진단).

## 대화 다이제스트

### 토픽 1: 세션 진입 — "다음 세션 권장 작업 실행해줘"

> **사용자**: "다음 세션 권장 작업 실행해줘......● 🎉 세션 24 전체 완료 — A + B + C 5축 달성"

세션 24의 종료 요약을 그대로 paste. 그 안의 "다음 세션 권장" 4건:
1. Compound Knowledge 4건 추출
2. USER-as-VIEWER 확장
3. runReadwrite 유닛 테스트 (pg 의존성 모킹)
4. Playwright 설치 + α/γ 스펙 자동화

자율 메모리(`feedback_autonomy.md`) 기반 → 분기 질문 없이 즉시 진입. 의존성 분석:
- 4건 모두 코드 충돌 없는 독립 작업 → 병렬 가능
- VIEWER만 보안 정책 재설계라 직접 작업

**결론**: 3 Agent 병렬 + VIEWER 직접.

### 토픽 2: 4건 병렬 발사 + 결과 종합

3 `Agent` 병렬 발사:
- **A** Compound Knowledge 4건 (284s) — 130~170줄/file × 4, cross-link 그래프 완성
- **B** Playwright 설치 + α 스펙 (506s) — `@playwright/test@1.59.1` + Chromium + config + spec 보강. **라이브 6 테스트 모두 530** (Cloudflare 1033) — 인프라만 완료
- **C** runReadwrite pg pool 모킹 (116s) — `src/lib/pg/pool.test.ts` 33 케이스. **vitest 89→122**

**D 직접 (VIEWER 확장)**:
- `table-policy.ts`: `TableOperation`에 `"SELECT"` 추가, 분기 (FULL_BLOCK 차단 / DELETE_ONLY는 ADMIN+MANAGER만 / 일반은 USER 포함)
- `route.ts` GET: `withRole(["ADMIN","MANAGER","USER"])` 확장 + 2차 게이트
- `table-policy.test.ts` +9 케이스 (SELECT × 3 카테고리)
- `phase-14c-viewer-curl.sh` V1~V9 회귀 스크립트

전체 vitest **89→131 PASS**.

**결론**: 4건 모두 코드/유닛 테스트 통과. Playwright 라이브 미통과(별도 세션) + VIEWER 라이브 매트릭스 미실시(배포 필요).

### 토픽 3: 병렬 세션 25(/kdywave) 통합 commit 발견

`git status` 후 modified 0 → `git log -1 --stat` 확인 → 직전 commit `5525bd2`가 본 세션 변경 + 세션 25(kdywave Wave 1) 변경 32 파일 / +6,114줄 통합.

**원인**: 동일 git working tree에서 두 세션이 동시 진행 시, 먼저 commit하는 쪽이 다른 쪽의 미커밋 변경까지 묶어 가게 됨.

**결론**: 누락 위험 0이지만 세션 표 누락 위험 1. `current.md`에 25-A 행 추가 → commit `1655fce`. 역사 보존 책임은 늦은 쪽이 짊.

### 토픽 4: 사용자 "순차적으로 진행" → 3단계

> **사용자**: "순차적으로 진행"

(1) git push → (2) `/ypserver prod --skip-win-build` 배포 → (3) Cloudflare Tunnel QUIC 튜닝.

### 토픽 5: 1단계 — git push origin main

`5525bd2..1655fce` push 완료.

### 토픽 6: 2단계 — `/ypserver prod --skip-win-build` 배포

`/ypserver` 스킬 호출 + Phase 2-1~2-6 + Phase 3 헬스체크 모두 통과:
- PM2 restart 모드, Prisma migrate deploy(no pending), WSL 빌드 성공, Drizzle migrate 적용, dashboard PID 2446, cloudflared online, wsl_local=200

**viewer-curl.sh V1~V9 라이브 매트릭스 — 전 PASS**:
- USER 일반 테이블 SELECT 200 (V1~V3)
- USER FULL_BLOCK 403 (V4~V6)
- USER DELETE_ONLY 403 (V7) / ADMIN 200 (V9)
- USER POST 회귀 가드 403 (V8)

**결론**: VIEWER dual-gate 패턴(withRole 1차 + checkTablePolicy 2차) 라이브 동작 입증.

### 토픽 7: 3단계 — Cloudflare Tunnel QUIC→HTTP/2 튜닝 (부분 수정)

`~/.cloudflared/config.yml` 변경:
- `protocol: http2` (QUIC→TCP 폴백)
- `retries: 5`, `grace-period: 30s`
- `originRequest.keepAliveConnections: 100`, `keepAliveTimeout: 90s`

`pm2 restart cloudflared` → 4 connector 모두 등록(KR icn06/icn01 protocol=http2).

**안정성 측정**:
| 모드 | 200 비율 | 연속 stable 최대 |
|------|----------|-----------------|
| QUIC (기본) | ~30% | 2 |
| HTTP/2 (변경 후) | ~50% | 4 |

**결정적 진단**: `cloudflared_tunnel_request_errors=0` + `total_requests=2` 시점 외부 trial 6회 → **530 응답이 cloudflared까지 도달조차 못함**. 즉 Cloudflare edge ↔ connector 사이 KT 회선 패킷 drop이 진짜 원인.

**결론**: cloudflared config로는 100% 도달 불가. 5건 위임:
1. WSL2 sysctl tcp_keepalive + rmem/wmem
2. WSL systemd 활성화 (idle shutdown 방지)
3. cloudflared 다중 인스턴스
4. Cloudflare WARP
5. auto-restart cron

### 토픽 8: Compound Knowledge — `cloudflare-tunnel-quic-tuning-partial-fix.md`

부분 수정 + 진단 + 다음 세션 위임 5건 명세 → `docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` (116줄). commit `67b414d` push 완료.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 4건 병렬 실행 | 순차 1×4 / 병렬 4 | 작업 독립성 확인 → 병렬로 wall clock 단축 |
| 2 | VIEWER DELETE_ONLY SELECT 정책 | 모두 허용 / 운영자만 | 운영 로그(edge_function_runs) PII 보호 → 운영자 제한 |
| 3 | 25-A 행 별도 추가 | 25 행 수정 / 25-A 신규 행 | "역사 절대 삭제 금지" + 다른 세션 수정 회피 |
| 4 | Tunnel HTTP/2 폴백 우선 | OS sysctl 먼저 / config 먼저 | config는 무중단·롤백 쉬움. sysctl는 sudo + WSL 재기동 필요 |
| 5 | Tunnel 100% 미달 시 종료 | 추가 OS 작업 / 본 세션 종료 | sysctl + systemd는 별도 세션 범주, 본 세션은 진단까지 |

## 수정 파일 (이번 세션 직접 변경 — 5525bd2에 포함분 + 추가 commit)

### 5525bd2에 통합된 본 세션 변경 (병렬 세션 25 commit)
| # | 파일 | 변경 |
|---|------|------|
| 1 | `docs/solutions/2026-04-18-raw-sql-updatedat-bump.md` | 신규 143줄 |
| 2 | `docs/solutions/2026-04-18-nextjs-private-folder-routing.md` | 신규 134줄 |
| 3 | `docs/solutions/2026-04-18-timestamp-precision-optimistic-locking.md` | 신규 166줄 |
| 4 | `docs/solutions/2026-04-18-csrf-api-settings-guard.md` | 신규 174줄 |
| 5 | `src/lib/pg/pool.test.ts` | 신규 465줄 (33 케이스) |
| 6 | `src/lib/db/table-policy.ts` | +14/-4 (SELECT 분기) |
| 7 | `src/lib/db/table-policy.test.ts` | +49 (SELECT × 3 매트릭스) |
| 8 | `src/app/api/v1/tables/[table]/route.ts` | +9 (USER 확장 + 2차 게이트) |
| 9 | `playwright.config.ts` | 신규 31줄 |
| 10 | `scripts/e2e/phase-14c-alpha-ui.spec.ts` | +64 (selector 교정 + smoke) |
| 11 | `scripts/e2e/phase-14c-viewer-curl.sh` | 신규 124줄 (V1~V9) |
| 12 | `vitest.config.ts` | +2 (`exclude scripts/**`) |
| 13 | `tsconfig.json` | +3 (scripts exclude 제거) |
| 14 | `package.json` + `lock` | +5 + +63 (Playwright deps) |

### 추가 commit (본 세션 단독)
| # | Commit | 파일 | 변경 |
|---|--------|------|------|
| 1 | `1655fce` | `docs/status/current.md` | +1 (25-A 행 추가) |
| 2 | `67b414d` | `docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` | 신규 116줄 |

### 본 세션 종료 시 (이 인수인계서 commit)
| # | 파일 | 변경 |
|---|------|------|
| 1 | `docs/logs/journal-2026-04-18.md` | 25-A·25-B append |
| 2 | `docs/status/current.md` | 25-B 행 추가 |
| 3 | `docs/logs/2026-04.md` | 25-A·25-B 섹션 신규 |
| 4 | `docs/handover/260418-session25b-deploy-tunnel-tuning.md` | 신규 (이 파일) |
| 5 | `docs/handover/_index.md` | 25-B 항목 추가 |
| 6 | `docs/handover/next-dev-prompt.md` | Tunnel 미해결 + VIEWER 라이브 PASS 반영 |

## 검증 결과

- `npx vitest run` → **131 tests PASS** (4 test files)
- `viewer-curl.sh` 라이브 → **V1~V9 전 PASS** (프로덕션)
- `/ypserver prod` 5단계 모두 통과
- `git push origin main` → 1655fce, 67b414d push 완료
- Cloudflare Tunnel 안정성 측정 → ~50% (HTTP/2 모드)

## 알려진 이슈

- **Cloudflare Tunnel ~50% 안정성** — config 튜닝으로는 한계. 다음 세션에서 OS 레이어(sysctl + systemd) 진입 필수
- **Playwright 라이브 미실행** — Tunnel 안정화 후 `npm run e2e`. selector + config는 준비 완료
- **VIEWER UI 측 미검증** — API는 PASS이나 Table Editor 페이지 가드 / 사이드바 노출 / RowFormModal "행 추가" 버튼이 USER 롤에 어떻게 보이는지 별도 점검
- **`~/.cloudflared/config.yml` 백업 보관** — `.bak.20260418-152XYZ` (rollback 가능)

## 다음 작업 제안

1. **Cloudflare Tunnel 100% 안정화** ⭐ — `2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md`의 5건 중 (1) WSL2 sysctl + (2) wsl systemd 우선
2. **Playwright 라이브 실행** — Tunnel 안정화 후 `npm run e2e` (현 spec α 6 케이스 + γ 스펙 추가 필요)
3. **VIEWER UI 측 점검** — Table Editor 페이지가 USER 롤에 readonly로 보이는지, 사이드바 노출 정책, "행 추가" 버튼 비활성 상태
4. **kdywave Wave 3 진입** — 세션 26 후속, 비전+FR/NFR ~11~20 문서

---
[← handover/_index.md](./_index.md)
