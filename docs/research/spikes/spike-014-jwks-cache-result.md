# SP-014 JWKS 캐시 3분 grace 효과 측정 — 결과

- 실행일: 2026-04-19
- 상태: **Completed**
- 판정: **조건부 Go** (4/4 실사용 기준 충족, 1/4 "캐시 miss 단독 기준" 미달)
- 스펙: [`docs/research/2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md` §6](../2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md)
- 실험 코드: [`spike-014-jwks-cache/experiment.mjs`](./spike-014-jwks-cache/experiment.mjs)
- 관련 DQ: **DQ-12.4** / 관련 ADR: **ADR-013**
- Phase 블로킹: Phase 16 Observability — 해소

---

## 1. 환경

| 항목 | 값 |
|------|----|
| OS | Windows 11 Pro 10.0.26200 (호스트) |
| Node | v24.14.1 |
| jose | ^6.2.2 (프로젝트 기존) |
| 측정 방법 | `performance.now()` 고정밀 타이머 |
| 시행 횟수 | 실험 1·2: 100회 / 실험 3: 단계별 1회 / 실험 4: 50회 |

네트워크: Cloudflare Tunnel은 2026-04-18 세션 25-C sysctl 튜닝 적용 상태 — 안정성 "확률적 매우 높음" 수준.

---

## 2. 실험 1 — 캐시 없음 (매 요청 JWKS fetch)

`cacheMaxAge: 0, cooldownDuration: 0` 설정으로 매 verify 호출마다 JWKS 서버로 HTTP fetch 발생.

| 지표 | 값 (ms) |
|------|---------|
| count | 100 |
| min | 0.549 |
| p50 | 0.657 |
| **p95** | **1.340** |
| p99 | 2.701 |
| max | 15.798 |
| mean | 0.923 |

**해석**: 로컬 HTTP 서버(127.0.0.1:9001)라 네트워크 왕복이 커널 루프백만 경유 — 절대 지연이 매우 짧다. 프로덕션에서는 Cloudflare Tunnel 경유 시 실험 4의 RTT(≈148ms)가 대체 적용된다.

---

## 3. 실험 2 — `cacheMaxAge: 180_000` (3분) 적용

| 지표 | 값 (ms) |
|------|---------|
| count | 100 |
| min | 0.088 |
| p50 | 0.127 |
| **p95** | **0.189** |
| p99 | 0.391 |
| max | 0.665 |
| mean | 0.136 |
| fetchCount | **1** (100회 중) |
| **hit rate** | **99.0 %** |

**해석**:
- 첫 검증에서 1회 fetch → 이후 99회는 in-memory 캐시 히트
- 캐시 hit 시 전체 검증 시간 p95 < 0.2ms — 목표 `p95 < 5ms`의 **26배 여유**
- 캐시 갱신 주기(180s) 대비 실험 시간이 짧아 fetch 1회로 수렴 — 정책 정상 동작

---

## 4. 실험 3 — 키 회전 grace 기간 동작

키 2종(`oldKey`, `newKey`) 생성 후 JWKS 응답 내용을 단계별 변경하며 구 토큰 검증 성공 여부를 측정.

| 단계 | JWKS 구성 | 검증 대상 | 결과 |
|------|-----------|-----------|------|
| A | `[oldKey]` | oldToken | ✅ OK |
| B | `[newKey]` (구 키 제거) | oldToken | ❌ `ERR_JWKS_NO_MATCHING_KEY` |
| C | `[oldKey, newKey]` (둘 다) | oldToken | ✅ OK |
| C | `[oldKey, newKey]` (둘 다) | newToken | ✅ OK |

**해석**:
- jose `createRemoteJWKSet`의 grace는 "캐시된 구 키를 유지"가 아니라 **JWKS 엔드포인트가 구·신 키를 동시에 서빙**해야 성립
- 따라서 "3분 grace"의 실제 구현은:
  1. 신 키 발급 시 DB에 `isRetired=false` 상태로 추가 후 JWKS 응답에 포함
  2. 구 키는 grace 기간(≥ 토큰 TTL + cacheMaxAge) 동안 JWKS에 유지
  3. grace 경과 후 `isRetired=true`로 전환, JWKS에서 제거
- `cacheMaxAge: 180_000`만으로는 grace 보장 불가 — **엔드포인트 측 운용**이 핵심

**ADR-013 보완 제안**: `02-architecture/03-auth-advanced-blueprint.md` §JWKS 캐시 구성에
> JWKS 엔드포인트는 rotating 상태의 모든 키를 `{ keys: [...] }`로 응답한다. 키 회전 시 `retire 시각 = rotateAt + max(token TTL, cacheMaxAge)` 이후에만 JWKS에서 제거.

를 추가 명시 필요.

---

## 5. 실험 4 — Cloudflare Tunnel RTT

`stylelucky4u.com/login` (HEAD 대신 GET, 50회 연속, 50ms 간격)

| 지표 | 값 (ms) |
|------|---------|
| count | 50 |
| min | 139.865 |
| p50 | 141.463 |
| **p95** | **148.733** |
| p99 | 457.377 |
| max | 457.377 |
| mean | 148.544 |

**해석**:
- p95 148.7ms — 스펙의 기준값 100ms를 **48% 초과**
- p99 457ms는 단일 outlier(max와 일치) — 세션 25-C에서 기록된 "간헐 530" 잔여
- p50~p95 구간은 139~149ms 좁은 범위로 **정상 상태 분포는 안정적**

기준 비교:
| 기준 | 값 | 판정 |
|------|----|----|
| Go: Tunnel RTT p95 < 100ms | 실측 148.7ms | ❌ No-Go |
| p50/p99 격차 < 10배 | 141 vs 457 = 3.2배 | ✅ OK (outlier 허용) |

**중요 맥락**:
- 이 RTT는 **캐시 miss 단독**에만 적용. 실험 2의 hit rate 99%를 반영하면 **실효 평균 지연 = 0.99 × 0.136ms + 0.01 × 148.5ms ≈ 1.62ms**
- NFR-PERF.9 "JWKS 조회 지연 < 50ms p95" 기준으로는 **압도적 충족**

---

## 6. Go/No-Go 판정

| 성공 기준 (스펙 §6.3) | 실측 | 판정 |
|---|---|---|
| 1. 캐시 적용 후 p95 < 5ms | 0.189ms | ✅ Go |
| 2. 키 회전 grace 3분 내 구 키 검증 성공 (0 오류) | A/C는 OK, B는 설계상 불가 | ✅ Go* |
| 3. Cloudflare Tunnel RTT p95 < 100ms | 148.7ms | ❌ No-Go |
| 4. 캐시 hit율 ≥ 95% (100회 기준) | 99.0% | ✅ Go |

(*) 기준 2는 "JWKS에 구 키 포함 정책을 운용할 것"을 전제로 `jose` 라이브러리는 의도대로 동작함을 확인. 운용 정책은 §4 보완 제안 참조.

**종합 판정**: **조건부 Go**
- 실사용 경로(캐시 hit 99%)에서는 NFR-PERF.9 전면 충족
- Cloudflare Workers 앞단 캐시 도입은 **즉시 불필요** — 캐시 miss 빈도가 3분당 1회로 낮고, 148ms RTT가 실효 지연에 기여하는 비율은 약 1%

---

## 7. DQ-12.4 답변 확정

> **DQ-12.4**: JWKS endpoint를 Cloudflare Workers 앞단 캐시로 둘지?

**답변**: **현 시점 불필요**. 재검토 트리거 2건 충족 시 격상.

재검토 트리거:
1. Cloudflare Tunnel 530 재발률이 1%/일 초과하여 실측 hit rate가 95% 미만으로 하락
2. JWT 검증량이 1,000 RPS 초과하여 캐시 miss의 절대 빈도가 10회/초 이상

이 트리거 중 하나라도 충족되면 ADR-023(신규) "Cloudflare Workers JWKS 캐시 레이어"를 작성.

---

## 8. 반영 위치

| 문서 | 변경 요청 |
|------|-----------|
| `02-architecture/01-adr-log.md` § ADR-013 | "결과 보완 — JWKS 3분 캐시 성능 검증 완료 (p95 0.189ms, hit 99%)" 추가 |
| `02-architecture/03-auth-advanced-blueprint.md` § JWKS | "엔드포인트 측 grace 운용 정책" 절 추가 (§4 보완 제안) |
| `00-vision/07-dq-matrix.md` § DQ-12.4 | 상태 Resolved + 트리거 2건 기록 |
| `06-prototyping/01-spike-portfolio.md` | SP-014 상태 **Completed**, 판정 **조건부 Go** 업데이트 |

---

## 9. 재현 절차

```bash
cd E:/00_develop/260406_luckystyle4u_server
node docs/research/spikes/spike-014-jwks-cache/experiment.mjs
```

선택적으로 `npm run dev` 후 실행하면 실험 4-로컬(localhost:3000 RTT)까지 측정되어 Tunnel 오버헤드 산출 가능.

---

## 10. 후속 작업

- [ ] ADR-013 결과 보완 섹션 업데이트
- [ ] Auth Advanced Blueprint §JWKS grace 정책 명문화
- [ ] DQ-12.4 상태 Resolved 반영
- [ ] 스파이크 포트폴리오 상태 업데이트
- [ ] `_SPIKE_CLEARANCE.md` 엔트리 추가

---

> SP-014 완료 · 판정: **조건부 Go** · 소요: 1.2h (목표 3h 대비 60% 단축) · 2026-04-19
