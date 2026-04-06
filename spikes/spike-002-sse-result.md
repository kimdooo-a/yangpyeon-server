# SPIKE-02: SSE + Cloudflare Tunnel 검증 결과

## 결과: 성공

### 검증 항목
1. ReadableStream + text/event-stream: **성공**
2. 로컬 실시간 수신: **성공** — 정확히 2초 간격으로 이벤트 수신
3. Cloudflare Tunnel 경유: **성공** — 버퍼링 없이 2초 간격 실시간 수신
4. Next.js build: **성공**

### 테스트 엔드포인트
- 경로: `/api/sse/test`
- 파일: `src/app/api/sse/test/route.ts`

### 로컬 테스트 결과 (localhost:3000)
```
data: {"time":"2026-04-06T13:51:21.290Z","counter":1,"cpu":71.67}
data: {"time":"2026-04-06T13:51:23.299Z","counter":2,"cpu":75.05}
data: {"time":"2026-04-06T13:51:25.307Z","counter":3,"cpu":39.12}
data: {"time":"2026-04-06T13:51:27.311Z","counter":4,"cpu":91.74}
```
→ 2초 간격으로 한 줄씩 실시간 도착 확인

### Cloudflare Tunnel 경유 결과 (stylelucky4u.com)
```
data: {"time":"2026-04-06T13:51:38.001Z","counter":1,"cpu":57.89}
data: {"time":"2026-04-06T13:51:40.001Z","counter":2,"cpu":7.93}
data: {"time":"2026-04-06T13:51:42.003Z","counter":3,"cpu":52.84}
data: {"time":"2026-04-06T13:51:44.003Z","counter":4,"cpu":76.57}
data: {"time":"2026-04-06T13:51:46.004Z","counter":5,"cpu":20.03}
```
→ Tunnel 경유해도 버퍼링 없이 2초 간격 실시간 도착 확인

### 필요 헤더
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

### 발견 사항
- Cloudflare Tunnel은 SSE를 네이티브하게 지원함 — 별도 설정 불필요
- `X-Accel-Buffering: no` 헤더가 버퍼링 방지에 효과적 (nginx/Cloudflare 프록시 대응)
- `Cache-Control: no-cache, no-transform`으로 중간 캐시 레이어 우회
- Next.js Route Handler의 ReadableStream + `export const dynamic = 'force-dynamic'` 조합이 SSE에 적합
- 미들웨어 인증이 SSE 경로를 차단하므로 PUBLIC_PATHS에 추가 필요 (또는 인증 후 쿠키 전달)
- PM2 환경(자체 호스팅)이므로 서버리스 실행 시간 제한 없음

### 미들웨어 변경
- `src/middleware.ts`의 PUBLIC_PATHS에 `/api/sse/test` 추가 (SPIKE 테스트용)
- 실제 프로덕션 SSE 엔드포인트에서는 인증 방식 결정 필요:
  - 옵션 A: URL 쿼리 파라미터로 토큰 전달 (`/api/sse/metrics?token=xxx`)
  - 옵션 B: 쿠키 기반 인증 (브라우저 EventSource는 쿠키 자동 전송)
  - 옵션 C: 커스텀 EventSource 래퍼로 Authorization 헤더 전달

### 다음 단계
- [ ] 테스트 엔드포인트 제거 또는 인증 적용
- [ ] 실제 시스템 모니터링 SSE 엔드포인트 구현 (CPU/메모리/디스크)
- [ ] EventSource 자동 재연결 클라이언트 구현
- [ ] PM2 재시작 시 재연결 동작 검증
