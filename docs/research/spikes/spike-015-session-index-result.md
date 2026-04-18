# SP-015 Session 인덱스 최적화 쿼리 플랜 분석 — 결과

- 실행일: 2026-04-19
- 상태: **Completed**
- 판정: **Go** — 단, partial index 설계 가정 1건 수정 필요
- 스펙: [`02-spike-priority-set.md` §7](../2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md)
- 실험 코드:
  - [`spike-015-session-index/sqlite-bench.mjs`](./spike-015-session-index/sqlite-bench.mjs)
  - [`spike-015-session-index/pg-bench.sh`](./spike-015-session-index/pg-bench.sh)
- 관련 DQ: **DQ-AC-2** / 관련 ADR: **ADR-006**
- Phase 블로킹: Phase 17 Auth Core — 해소

---

## 1. 환경

| 항목 | 값 |
|------|----|
| Node | v24.14.1 (Windows) |
| better-sqlite3 | ^12.8.0 |
| PostgreSQL | 16.13 (WSL2 Ubuntu 24.04) |
| 행 수 | 10만 (1000 user × 100 session/user, 80% active + 20% expired) |
| 쿼리 | `SELECT * FROM Session WHERE userId = ? AND expiresAt > NOW() LIMIT 100` |
| 시행 | 1000회 순차 |

---

## 2. SQLite 결과 (better-sqlite3 / WAL mode)

**Insert 10만 행**: 536ms · 186,709 rows/s

**EXPLAIN QUERY PLAN**:
```
SEARCH Session USING INDEX idx_session_user_exp (userId=? AND expiresAt>?)
```
→ 복합 인덱스 `(userId, expiresAt)` 정확히 활용

**Query 벤치마크 (1000 iter)**:
| 지표 | 값 (ms) |
|------|---------|
| min | 0.031 |
| p50 | 0.034 |
| **p95** | **0.053** |
| p99 | 0.085 |
| max | 0.877 |
| mean | 0.040 |

**Table/Index size**:
- Session 테이블: 9.5 MB
- idx_session_user_exp: 2.8 MB (28% 오버헤드)

---

## 3. PostgreSQL 결과 (16.13)

**Insert 10만 행**: `generate_series` 단일 INSERT — 측정 시간 생략 (SQL 내부)

**EXPLAIN (ANALYZE, BUFFERS) — 일반 복합 인덱스**:
```
 Limit  (cost=5.10..265.81 rows=79 width=92) (actual time=0.027..0.243 rows=80 loops=1)
   Buffers: shared hit=79
   ->  Bitmap Heap Scan on _test_session
         Recheck Cond: (("userId" = 'user-00001'::text) AND ("expiresAt" > now()))
         ->  Bitmap Index Scan on idx_session_user_exp
               Index Cond: (("userId" = 'user-00001'::text) AND ("expiresAt" > now()))
 Planning Time: 0.277 ms
 Execution Time: 0.265 ms
```
→ Bitmap Index Scan + Bitmap Heap Scan 조합, 79/10만 행만 방문

**Query 벤치마크 (1000 iter) — 일반 인덱스**:
| 지표 | 값 (μs) | 값 (ms) |
|------|---------|---------|
| p50 | 31 | 0.031 |
| **p95** | **48** | **0.048** |
| p99 | 80 | 0.080 |
| max | 589 | 0.589 |

**Partial Index 실험 — ❌ 설계 불가**:
```sql
CREATE INDEX idx_session_user_partial ON _test_session (userId, expiresAt)
  WHERE expiresAt > NOW();
-- ERROR: functions in index predicate must be marked IMMUTABLE
```

**근본 원인**: PostgreSQL 문서에 따라 `NOW()`는 `STABLE` volatility로 분류 — `IMMUTABLE`이 아니므로 index predicate에 사용 불가. 이는 Phase 17 Auth Core Blueprint의 "partial index for active sessions" 가정이 **PG 제약에서 실현 불가능**함을 의미.

**Seq Scan (인덱스 drop 후 추가 측정) — 부산물**:
| 지표 | 값 (μs) |
|------|---------|
| p50 | 4,512 |
| p95 | 5,105 |
| p99 | 5,763 |
| max | 8,666 |

→ 인덱스 없을 때 대비 **약 106배 저하**. 인덱스 필수성 실증.

---

## 4. SQLite vs PG 비교

| 지표 | SQLite | PG | 승자 |
|------|--------|-----|----|
| p50 | 0.034ms | 0.031ms | PG (근소) |
| p95 | 0.053ms | 0.048ms | PG (근소) |
| p99 | 0.085ms | 0.080ms | PG (근소) |
| max | 0.877ms | 0.589ms | PG |

**결론**:
- 두 엔진 모두 목표 `p95 < 2ms` 를 **30~40배 충족**
- PG가 근소 우위 (Bitmap Index Scan 최적화 효과)
- 실용 관점에서 **동등한 수준** — 어느 쪽이든 성능 병목 아님

---

## 5. DQ-AC-2 답변 확정

> **DQ-AC-2**: Session 테이블을 SQLite(현행) → PostgreSQL로 이전 시 인덱스 전략 차이?

**답변**:

### 5.1 기본 복합 인덱스 — 동일 전략
두 엔진 모두 `(userId, expiresAt)` 복합 인덱스로 충분하다. 기대 쿼리(`WHERE userId = ? AND expiresAt > NOW()`)를 정확히 활용.

```sql
-- SQLite & PG 공통
CREATE INDEX idx_session_user_exp ON Session (userId, expiresAt);
```

### 5.2 Partial Index — PG에서 실현 가능한 변형
**NOW() 기반 partial index 불가** → 대안 2가지:

**대안 A: Fixed timestamp predicate**
```sql
-- 서비스 운영 기간 내 만료 시점보다 과거인 값으로 고정
CREATE INDEX idx_session_active ON Session (userId, expiresAt)
  WHERE expiresAt > '2026-01-01'::timestamptz;
```
- 장점: partial index로 크기 감소
- 단점: 주기적 재생성 필요 (고정 날짜가 과거로 밀리면 효과 상실)

**대안 B: Cleanup job + 일반 인덱스 (권장)**
```sql
-- pgcron 또는 애플리케이션 스케줄러로 일 1회
DELETE FROM Session WHERE expiresAt < NOW() - INTERVAL '1 day';
```
- 장점: 데이터 볼륨 자체를 제한. 인덱스 크기 자동 유지
- 단점: 쓰기 부하 약간 증가 (야간 실행)
- **실측 상 현재 성능에서 partial 최적화 불필요** → 대안 B 채택 권장

### 5.3 기본키 선택
- **SHA-256 해시 (hex 64자)**: 텍스트 기반 BTree — 현재 실험 기준 p95 48μs
- **UUID v7**: 시계열 정렬 우위 (INSERT 시 hot pages 집중 방지) — 실측 미수행

UUID v7 비교는 후속 스파이크(SP-023 또는 옵션)로 이관 가능. 현재 성능 수준에서 **UUID v7 전환 이득이 적음** → 현 SHA-256 해시 유지 권장.

---

## 6. Go/No-Go 판정

| 성공 기준 | 실측 | 판정 |
|---|---|---|
| 1. PG partial index 적용 후 p95 < 2ms (10만 행) | partial 불가 → 일반 인덱스 p95=0.048ms | ✅ Go (대안 채택) |
| 2. 인덱스 설계 확정 (SQLite-PG 차이 명문화) | 본 문서 §5 | ✅ Go |
| 3. Prisma 마이그레이션 스크립트 초안 작성 가능 | §7 참조 | ✅ Go |

No-Go 기준:
- PG partial 외 경로로도 p95 > 10ms → 0.048ms이므로 해당 없음
- SHA-256 기반 기본키에서 sequential scan → Bitmap Index Scan 확인

**종합 판정**: **Go**

---

## 7. Prisma 마이그레이션 스크립트 초안

```prisma
model Session {
  id        String   @id @db.Char(64)  // SHA-256 hex
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt], name: "idx_session_user_exp")
}
```

PG에 raw SQL로 cleanup job 병행:
```sql
-- prisma/migrations/.../cleanup-session-cron.sql
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
  DELETE FROM "Session" WHERE "expiresAt" < NOW() - INTERVAL '1 day';
$$ LANGUAGE SQL;

-- node-cron 또는 pg_cron에서 일 1회 호출
```

---

## 8. 1M 행 extrapolation

10만 행 기준 p95=0.048ms(PG) / 0.053ms(SQLite). 복합 인덱스는 O(log N) → 10배 증가 시 약 1.3~1.4배 (log10 ≈ 1.3).

추정 1M 행 p95:
- PG: 약 0.065ms
- SQLite: 약 0.072ms

둘 다 목표 2ms 대비 여전히 30배 여유. **1M 실측 불필요**로 판단.

---

## 9. 반영 위치

| 문서 | 변경 요청 |
|------|-----------|
| `02-architecture/03-auth-advanced-blueprint.md` § 세션 스키마 | "partial index NOW() 불가 — cleanup job 대체" 절 추가 |
| `02-architecture/01-adr-log.md` § ADR-006 | "SP-015 검증 완료 — SHA-256 hex + 복합 인덱스 채택" 기록 |
| `00-vision/07-dq-matrix.md` § DQ-AC-2 | 상태 **Resolved** + 대안 B 채택 |
| `06-prototyping/01-spike-portfolio.md` | SP-015 상태 **Completed**, 판정 **Go** |

---

## 10. 재현 절차

```bash
# SQLite (Windows Node)
cd E:/00_develop/260406_luckystyle4u_server
node docs/research/spikes/spike-015-session-index/sqlite-bench.mjs

# PostgreSQL (WSL2)
wsl.exe bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/docs/research/spikes/spike-015-session-index/pg-bench.sh"
```

---

## 11. 후속 작업

- [ ] ADR-006 결과 보완 섹션 업데이트
- [ ] Auth Advanced Blueprint §세션 스키마 partial-index 주의 명시
- [ ] DQ-AC-2 상태 Resolved + 대안 B 채택 근거
- [ ] Prisma schema에 Session 모델 추가 (Phase 17 준비)
- [ ] `_SPIKE_CLEARANCE.md` 엔트리 추가

---

## 12. Compound Knowledge 후보

**"PostgreSQL partial index + NOW() 비호환 → cleanup job 전환 패턴"**
- 트리거: NOW() 기반 partial index `ERROR: functions in index predicate must be marked IMMUTABLE`
- 해결: partial index 대신 cleanup job + 일반 인덱스
- 일반화 가능: TTL 기반 테이블(Session, OTP, Token, Cache 등)에 전역 적용
- 파일: `docs/solutions/2026-04-19-pg-partial-index-now-incompatibility.md` 작성 권장

---

> SP-015 완료 · 판정: **Go** · 소요: 0.8h (목표 2h 대비 60% 단축) · 2026-04-19
