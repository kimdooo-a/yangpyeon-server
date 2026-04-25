# Operations Runbook — 콘텐츠 어그리게이터

> **대상**: yangpyeon 운영자 / 당직자
> **목적**: 일상 점검·장애 대응·키 회전·차단 정책의 표준 절차를 한 문서에 모은다.
> **갱신 주기**: 월 1회 또는 인시던트 발생 시.

---

## 1. 일상 점검 (매일 09:00)

소요 시간: 5분.

### 체크리스트

1. **대시보드 확인** — `/admin/aggregator/dashboard`
   - [ ] 24h 수집량 ≥ 200
   - [ ] 24h 게시량 ≥ 50
   - [ ] 활성 소스 ≥ 60

2. **실패 소스 확인**
   ```sql
   SELECT slug, consecutive_failures, last_error
   FROM content_sources
   WHERE active = true AND consecutive_failures >= 3
   ORDER BY consecutive_failures DESC;
   ```
   - [ ] 위 결과가 0행 (또는 모두 알려진 일시 장애)

3. **Gemini RPD 사용률 확인**
   ```bash
   # yangpyeon audit log에서 분류기 호출 카운트
   grep "GEMINI_CLASSIFY" /var/log/yangpyeon/audit.log \
     | awk -F'"ts":"' '{print substr($2,1,10)}' \
     | uniq -c | tail -3
   ```
   - [ ] 일일 호출 < (Gemini RPD 한도) × 0.8

4. **큐 적체 확인**
   ```sql
   SELECT count(*) FROM content_ingested_items WHERE status='pending';
   ```
   - [ ] < 500 (그 이상이면 분류 워커 점검)

5. **Manual Review 큐**
   - [ ] `/admin/aggregator/items?tab=manual` 새로 들어온 항목 처리 (5분 이내)

### 점검 로그 남기기

```bash
echo "$(date -Iseconds) — daily check by $(whoami) — OK" \
  >> /var/log/yangpyeon/aggregator-daily.log
```

---

## 2. 장애 대응 매트릭스

| 증상 | 원인 후보 | 대응 |
|---|---|---|
| 24h 수집 0건 | cron 멈춤 / Postgres 연결 끊김 | `pm2 logs aggregator-fetcher` 확인 → `pm2 restart aggregator-fetcher` |
| 특정 소스 401/403 | UA 차단, API 키 만료 | `parser_config.headers` 갱신, 또는 active=false 후 대체 소스 검토 |
| 특정 소스 429 | rate limit hit | cron 주기 증가 (소스별 `fetch_interval_min` 조정) |
| 분류 큐 쌓임 (≥ 1000) | Gemini RPD 한도 / 워커 다운 | 1순위: 워커 재시작. 2순위: LLM 분류 OFF (`AGGREGATOR_LLM=false`), 규칙기반만 가동 |
| 분류 정확도 급락 | LLM 응답 포맷 변경 | 분류 모듈 출력 파서 점검, 임시로 보수적 임계치 사용 (confidence ≥ 0.7) |
| ApiKey rate limit hit (전체) | 정상 트래픽 폭증 / abuse | 1) `allow_anonymous=false` 강제 2) abuse IP 차단 (Vercel firewall) |
| `/explore` 5xx | DB 커넥션풀 고갈 | `prisma` 연결 수 확인, Postgres `pg_stat_activity` |
| Vercel 빌드 실패 | 마이그레이션/타입 오류 | 로컬 `npm run build`로 재현 → 핫픽스 PR |

### 에스컬레이션

- **SEV1 (서비스 중단)**: 발견 즉시 #incidents 채널 알림 + 당직 전화
- **SEV2 (수집 중단, 게시는 유지)**: 1시간 이내 대응
- **SEV3 (특정 소스 장애)**: 익일 처리

---

## 3. 키 회전 절차

### 3.1 Almanac 발급 API 키 (publishable)

대상: yangpyeon → Almanac 호출용 키.

1. **신 키 발급** — `/admin/api-keys` → "Issue new key"
   - 라벨: `almanac-{YYYYMMDD}`
   - 권한: read-only (`/api/v1/contents`, `/api/v1/categories`, `/api/v1/today-top`)

2. **Almanac에 새 키 배포**
   - Vercel 프로젝트 환경변수: `YANGPYEON_API_KEY` 갱신
   - `vercel --prod` 재배포
   - 새 deployment URL에서 `/explore` 정상 동작 확인

3. **모니터링** (1시간)
   - 신 키 사용량 ≥ 100 req/h, 구 키 사용량 점차 감소 확인
   ```sql
   SELECT key_label, count(*) FROM api_request_log
   WHERE ts > NOW() - INTERVAL '1 hour'
   GROUP BY key_label;
   ```

4. **구 키 revoke**
   - `/admin/api-keys` → 구 키 → "Revoke"
   - 5분 후 `select * from api_keys where label='almanac-{이전}'` → revoked_at 채워짐

### 3.2 Gemini API 키

1. Google AI Studio → 신 키 발급
2. yangpyeon `.env` (`GEMINI_API_KEY`) 갱신 + `pm2 restart aggregator-classifier`
3. 분류 정상 동작 확인 (`SELECT count(*) FROM content_ingested_items WHERE classified_at > NOW() - INTERVAL '10 min';` ≥ 1)
4. Google AI Studio에서 구 키 삭제

---

## 4. 차단 정책 (콘텐츠)

수집된 콘텐츠를 어떤 기준으로 어떻게 막는지 명시.

### 자동 차단 (분류기 단계)

- 광고/스팸 키워드 매칭 → `quality_flag='blocked'` (게시 안 됨, 큐에 남음)
- 본문 50자 미만 → `manual_review`
- 중복 URL (`external_url` 동일) → `rejected` (insertion 단계에서 차단)

### 수동 차단 (관리자 큐레이션)

| 사유 | 액션 | 추가 조치 |
|---|---|---|
| 광고/스팸 (오탐 통과) | items → 차단 | 분류 룰 보강 |
| 표절·저작권 우려 | items → 차단 | 소스 비활성 검토 |
| 가짜뉴스/허위정보 | items → 차단 | 도메인 블랙리스트 추가 |
| 정치 편향 | **자동 차단 안 함** | 신고 누적 시 manual_review |
| 음란·폭력 | items → 차단 | 소스 즉시 비활성 |

### 도메인 블랙리스트

```sql
-- 추가
INSERT INTO content_source_blacklist (domain, reason, added_by)
VALUES ('spam-site.example', '광고성 콘텐츠 다수', 'admin@almanac');

-- 적용 (다음 수집부터 차단)
-- fetcher가 INSERT 전 blacklist 체크
```

---

## 5. 주간 리뷰 (매주 월요일)

소요 시간: 30분.

### 체크리스트

1. **트랙별 게시량 균형**
   ```sql
   SELECT track, count(*) FROM content_ingested_items
   WHERE published_at > NOW() - INTERVAL '7 days'
   GROUP BY track ORDER BY 2 DESC;
   ```
   - 균형 가이드: 가장 많은 트랙 / 가장 적은 트랙 비율 ≤ 5
   - 비율이 깨지면 → 약한 트랙의 키워드 룰 보강 또는 소스 추가

2. **카테고리별 게시량 점검**
   ```sql
   SELECT track, c.slug, count(*)
   FROM content_ingested_items i
   JOIN content_categories c ON c.id = i.category_id
   WHERE i.published_at > NOW() - INTERVAL '7 days'
   GROUP BY 1,2 ORDER BY 1, 3 DESC;
   ```
   - 0건 카테고리는 룰 누락 또는 소스 부재 → 추적

3. **소스 추가 제안 검토**
   - `docs/handover/source-suggestions.md` (있다면) 확인
   - 신규 소스 1~3개 추가 후 1주일 모니터링

4. **분류 오류 트렌드**
   - manual_review 비율 ≥ 5% 면 룰 보강

5. **API 사용량 리포트**
   - Almanac에서 호출량 그래프 확인 (피크/평균)

---

## 6. 비상 차단 절차 (전체 정지)

법적 이슈 또는 심각한 오분류로 **즉시 전체 게시 중단**이 필요한 경우.

```sql
-- 1) 모든 활성 소스 비활성화
UPDATE content_sources SET active = false WHERE active = true;
-- 영향 범위: 새 수집 중단. 이미 수집된 항목은 그대로.

-- 2) (선택) 게시 중지 — Almanac 응답에서 비공개 처리
UPDATE content_ingested_items SET status = 'paused'
WHERE status = 'published';
-- 영향 범위: /api/v1/contents 응답에서 빠짐. status='ready'는 유지.

-- 3) 알림
-- Slack #incidents에 RCA 시작 공지
```

복구 시 1번 → 2번 역순으로 단계적 재개.

---

## 7. 백업과 복원

- **자동 백업**: Postgres daily snapshot (Vercel Postgres 또는 Supabase 자체 기능)
- **수동 dump** (배포 전 권장):
  ```bash
  pg_dump "$DATABASE_URL" \
    --table=content_categories \
    --table=content_sources \
    --table=content_ingested_items \
    --table=content_source_runs \
    --table=content_publish_log \
    --file=backup-$(date +%Y%m%d).sql
  ```
- **복원**: 단일 테이블만 되돌리려면 dump에서 해당 테이블 섹션만 추출 후 import.

---

## 부록 A. 자주 쓰는 SQL 스니펫

```sql
-- 가장 많이 수집한 소스 TOP 10 (지난 7일)
SELECT s.slug, count(*) AS items
FROM content_ingested_items i
JOIN content_sources s ON s.id = i.source_id
WHERE i.fetched_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

-- 한 번도 게시 안 된 소스
SELECT s.slug
FROM content_sources s
LEFT JOIN content_ingested_items i ON i.source_id = s.id AND i.status='published'
WHERE s.active = true
GROUP BY s.id, s.slug
HAVING count(i.id) = 0;

-- 분류 신뢰도 분포
SELECT
  width_bucket(classifier_confidence, 0, 1, 10) AS bucket,
  count(*) AS n
FROM content_ingested_items
WHERE classified_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1;
```

## 부록 B. 변경 이력

| 일자 | 변경자 | 내용 |
|---|---|---|
| 2026-04-25 | 초안 | 최초 작성 |
