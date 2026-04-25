# E2E Checklist — 1.0 출시 게이트

> **사용법**: 각 게이트의 측정 명령을 순서대로 실행하고, 기준 통과 시 체크박스에 X를 표시합니다.
> 게이트 4개를 모두 통과해야 1.0 출시 승인. 미통과 항목은 **차단 사유**에 메모.
>
> 측정 환경: 프로덕션 (`almanac-flame.vercel.app`). 스테이징은 별도 컬럼으로 기록.

---

## Gate 1. 60+ 소스 활성, 24h 수집 ≥ 300건

수집 파이프라인의 **최저 가동률**을 보장합니다.

### 측정

```sql
-- (1) 활성 소스 수
SELECT count(*) AS active_sources
FROM content_sources
WHERE active = true;
-- 기준: ≥ 60

-- (2) 24시간 수집량
SELECT count(*) AS items_24h
FROM content_ingested_items
WHERE fetched_at > NOW() - INTERVAL '24 hours';
-- 기준: ≥ 300

-- (3) 위험 상태 소스 (연속실패 5+) — 0건이어야 합격
SELECT slug, kind, consecutive_failures, last_error
FROM content_sources
WHERE active = true AND consecutive_failures >= 5
ORDER BY consecutive_failures DESC;
-- 기준: 0행
```

### 체크리스트

- [ ] 활성 소스 ≥ 60개
- [ ] 24h 수집 ≥ 300건
- [ ] 연속 실패 ≥ 5인 소스 0건
- [ ] 위 3개 측정값을 캡처/스크린샷으로 기록

| 항목 | 측정값 | 통과 | 비고 |
|---|---|---|---|
| 활성 소스 | __ | ☐ | |
| 24h 수집 | __ | ☐ | |
| 위험 소스 | __ | ☐ | |

---

## Gate 2. 분류 정확도 ≥ 90%

자동 분류 결과의 신뢰도를 **샘플 50건**에 대해 사람이 검증합니다.

### 측정 절차

1. 무작위 50건 추출
   ```sql
   SELECT id, source_id, title, track, category_id, classifier_confidence
   FROM content_ingested_items
   WHERE classified_at > NOW() - INTERVAL '24 hours'
     AND status = 'ready'
   ORDER BY random()
   LIMIT 50;
   ```

2. 각 항목에 대해 검토자가 **"트랙·카테고리가 올바른가?"** Y/N 판정.
   - 한 트랙이라도 명백히 틀리면 N
   - 카테고리가 미세하게 다르더라도 의미적으로 인접하면 Y (예: `chatgpt-tools` ↔ `llm-apps`)

3. 정확도 = (Y 개수) / 50

### 체크리스트

- [ ] 50건 샘플 검토 완료
- [ ] 정확도 ≥ 45/50 (90%)
- [ ] 오분류 패턴 분석 (오분류 5건 이상이면 룰 보강 후 재측정)
- [ ] 결과를 스프레드시트로 보관 (`docs/assets/yangpyeon-aggregator-spec/verification/_classification-audit-{날짜}.csv`)

| 측정값 | 결과 | 통과 |
|---|---|---|
| 정확도 (Y/50) | __ /50 | ☐ |
| 오분류 패턴 | (예: 자동화 → 도구로 잘못 분류 3건) | — |

---

## Gate 3. API p95 < 250ms (cache hit), < 500ms (miss)

REST 응답 성능 게이트. **간단한 curl 반복** 또는 **k6 로드 테스트** 선택.

### 측정 (간단 — curl 반복)

```bash
# Cache hit 측정 — 같은 쿼리 100회 (CDN/Edge 캐시 워밍업 후)
curl -s -o /dev/null -w "" \
  "https://almanac-flame.vercel.app/api/v1/contents?track=ai-money&limit=20"  # 워밍업

for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    "https://almanac-flame.vercel.app/api/v1/contents?track=ai-money&limit=20"
done | sort -n | awk 'BEGIN{c=0}{a[c++]=$1}END{print "p95:", a[int(c*0.95)]}'
# 기준: p95 < 0.250 (초)
```

```bash
# Cache miss 측정 — 매번 다른 쿼리 (limit/offset/cursor 변형)
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    "https://almanac-flame.vercel.app/api/v1/contents?track=ai-money&limit=20&offset=$((i*5))"
done | sort -n | awk 'BEGIN{c=0}{a[c++]=$1}END{print "p95:", a[int(c*0.95)]}'
# 기준: p95 < 0.500
```

### 측정 (정밀 — k6)

```js
// scripts/k6-aggregator.js
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 10, duration: '1m' };
export default function () {
  const r = http.get('https://almanac-flame.vercel.app/api/v1/contents?track=ai-money&limit=20');
  check(r, { 'status 200': (res) => res.status === 200 });
}
```
```bash
k6 run scripts/k6-aggregator.js
# 결과의 http_req_duration p(95) 확인
```

### 체크리스트

- [ ] Cache hit p95 < 250ms
- [ ] Cache miss p95 < 500ms
- [ ] 에러율 < 0.1%
- [ ] 측정 시점·시간대 기록 (피크/오프피크 구분)

| 시나리오 | p95 (ms) | 통과 |
|---|---|---|
| `/contents` cache hit | __ | ☐ |
| `/contents` cache miss | __ | ☐ |
| `/today-top` | __ | ☐ |
| `/categories` | __ | ☐ |

---

## Gate 4. `/explore` LCP < 2.5s, CLS < 0.1

콘텐츠 탐색 페이지의 **Core Web Vitals**.

### 측정

#### 옵션 A — Lighthouse CLI

```bash
npx lighthouse https://almanac-flame.vercel.app/explore \
  --only-categories=performance \
  --output=json --output-path=./lh-report.json \
  --chrome-flags="--headless"

# LCP / CLS 추출
node -e "
const r = require('./lh-report.json');
console.log('LCP:', r.audits['largest-contentful-paint'].numericValue/1000, 's');
console.log('CLS:', r.audits['cumulative-layout-shift'].numericValue);
"
```

#### 옵션 B — Vercel Analytics

1. Vercel 대시보드 → Analytics → Web Vitals
2. `/explore` 라우트 필터
3. 최근 7일 P75 값 확인 (Lab가 아닌 Field 데이터)

### 체크리스트

- [ ] LCP P75 < 2.5s (Field) 또는 Lab < 2.5s
- [ ] CLS P75 < 0.1
- [ ] FID/INP P75 < 200ms
- [ ] 모바일 + 데스크톱 양쪽 측정

| 메트릭 | Mobile | Desktop | 통과 |
|---|---|---|---|
| LCP | __ s | __ s | ☐ |
| CLS | __ | __ | ☐ |
| INP | __ ms | __ ms | ☐ |

---

## 출시 결정

| 게이트 | 통과 |
|---|---|
| 1. 수집 가동률 | ☐ |
| 2. 분류 정확도 | ☐ |
| 3. API 성능 | ☐ |
| 4. 페이지 성능 | ☐ |

- [ ] **4개 모두 통과** → 1.0 출시 승인
- [ ] 결과 docs/handover/ 에 기록
- [ ] `operations-runbook.md` 의 일상 점검 절차 시작
