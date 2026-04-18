# Cloudflare Tunnel 1033/530 — HTTP/2 폴백 + KeepAlive 튜닝 (부분 수정)

> 작성일: 2026-04-18 (세션 25-A)
> 관련: [2026-04-17-cloudflare-tunnel-intermittent-530.md](./2026-04-17-cloudflare-tunnel-intermittent-530.md)

---

## 컨텍스트

세션 24부터 반복 관찰된 Cloudflare Tunnel 간헐 530 / Error 1033 (origin unreachable) 이슈를 세션 25-A에서 cloudflared config 수준에서 튜닝 시도. 결과는 **부분 개선**으로 약 50%까지 안정성 향상되었으나 100% 도달 실패 — 근본 원인이 Cloudflare edge ↔ cloudflared connector 간 KT 회선 패킷 drop으로 식별됨.

## 증상

- 외부 https://stylelucky4u.com 접속 시 Cloudflare 1033 Tunnel error 페이지 (HTTP 530)
- 같은 시점 WSL2 내부 `curl http://localhost:3000` 은 200 (origin 정상)
- cloudflared metrics 의 `cloudflared_tunnel_request_errors` = 0 (즉 connector까지 도달한 요청은 모두 정상 처리)
- 발생 패턴: 5초~수십 초 주기로 200 ↔ 530 flap

## 진단 (세션 25-A)

### cloudflared logs 관찰
```
INF Registered tunnel connection connIndex=0 connection=... protocol=http2 location=icn06
INF Registered tunnel connection connIndex=1 connection=... protocol=http2 location=icn01
INF Registered tunnel connection connIndex=2 connection=... protocol=http2 location=icn06
INF Registered tunnel connection connIndex=3 connection=... protocol=http2 location=icn01
```
4개 connector 모두 정상 등록(KR icn06/icn01).

### 안정성 측정 (5초 간격, 10초 timeout, --max-time 10)

| 모드 | 측정 trial 수 | 200 비율 | 연속 stable 최대 |
|------|--------------|----------|-----------------|
| QUIC (기본, 변경 전) | 14 | ~30% | 2 |
| HTTP/2 (변경 후) | 14 | ~50% | 4 |

### 결정적 메트릭
`cloudflared_tunnel_request_errors=0` + `cloudflared_tunnel_total_requests=2` 였는데 동일 시점 외부 trial 6회 발생 → **530 응답 4건은 cloudflared까지 도달조차 못함**. 즉 Cloudflare edge가 connector를 일시 lost 처리하고 origin에 요청을 보내지 않는 상태에서 530 응답.

## 적용한 부분 솔루션

`~/.cloudflared/config.yml`:

```yaml
tunnel: 2e18470f-b351-46ab-bf07-ead0d1979fb9
credentials-file: /home/smart/.cloudflared/2e18470f-b351-46ab-bf07-ead0d1979fb9.json

# QUIC(UDP) → HTTP/2(TCP) 폴백: KT 회선 UDP 패킷 손실 가능성 회피
protocol: http2
retries: 5
grace-period: 30s

originRequest:
  connectTimeout: 30s
  tlsTimeout: 10s
  tcpKeepAlive: 30s
  keepAliveConnections: 100
  keepAliveTimeout: 90s
  noHappyEyeballs: false

ingress:
  - hostname: stylelucky4u.com
    service: http://localhost:3000
  - service: http_status:404
```

### 효과
- QUIC → HTTP/2 폴백으로 안정성 30%→50% 개선
- connector restart 시 grace-period 30s로 in-flight 요청 보호
- origin keepalive 90s로 dashboard 콜드 hit 감소

### 한계
- Cloudflare edge ↔ cloudflared connector 간 KT 회선 패킷 drop은 cloudflared config로 해결 불가
- HTTP/2 모드로도 여전히 ~50% 시점에 530 발생

## 미해결 (다음 세션 권장)

### 1. WSL2 sysctl TCP keepalive 강화
```bash
sudo sysctl -w net.ipv4.tcp_keepalive_time=60
sudo sysctl -w net.ipv4.tcp_keepalive_intvl=10
sudo sysctl -w net.ipv4.tcp_keepalive_probes=6
sudo sysctl -w net.core.rmem_max=16777216
sudo sysctl -w net.core.wmem_max=16777216
```
WSL2 systemd 활성화 + `/etc/sysctl.d/99-cloudflared.conf` 영속화 필요.

### 2. WSL systemd 활성화 (idle shutdown 방지)
`/etc/wsl.conf`:
```ini
[boot]
systemd=true
```
Windows 측 `wsl --shutdown && wsl` 재기동 필요.

### 3. cloudflared 다중 인스턴스 + 로드밸런싱
Cloudflare Zero Trust dashboard에서 동일 hostname에 다수 tunnel 연결 → connector pool 다중화.

### 4. Cloudflare WARP 사용 (Origin 보호)
KT 회선이 CF에 직접 도달하도록 WARP client 설치.

### 5. 운영적 해결 — auto-restart cron
`pm2 restart cloudflared` 를 1시간 간격 cron으로 등록(brittle하지만 즉시 적용 가능).

## 재발 방지 / 운영 가이드

- 외부 530 발생 시 1차 조치는 `pm2 restart cloudflared` (10~40초 propagation 대기)
- cloudflared 재기동 직후 30~40초 동안 Cloudflare edge propagation lag로 530 가능 (정상)
- 안정성 측정 시 최소 10초 간격 + 10초 timeout 권장 (트랜션트 회피)
- 진단 시 `cloudflared_tunnel_request_errors` (origin 측 에러) 와 외부 530 (edge↔connector 에러) 구분

## 관련 솔루션

- [2026-04-17-cloudflare-tunnel-intermittent-530.md](./2026-04-17-cloudflare-tunnel-intermittent-530.md) — 첫 발견 + 1차 진단
- [2026-04-12-windows-lightningcss-missing.md](./2026-04-12-windows-lightningcss-missing.md) — WSL 의존성 차이의 다른 사례
- [2026-04-17-prisma-migration-windows-wsl-gap.md](./2026-04-17-prisma-migration-windows-wsl-gap.md) — Windows↔WSL2 NAT 환경 인식
