---
title: Cloudflare Tunnel 간헐 530 오류 (pm2 restart cloudflared로 복구)
date: 2026-04-17
session: 21
tags: [cloudflare-tunnel, cloudflared, wsl2, pm2, networking, quic]
category: workaround
confidence: medium
---

## 문제

세션 21 중 `https://stylelucky4u.com/*` 요청이 몇 차례 Cloudflare 530 "Origin DNS error" / 1033 "Argo Tunnel error"로 실패:

- WSL 내부 `http://localhost:3000/*` 경유: 200/401 정상
- 외부 터널 경유: 530 간헐
- 브라우저 console: `Refused to execute script ... ('text/plain')` — 터널이 에러 페이지 HTML을 내보내면서 JS/CSS MIME type 깨짐

재현 시점 공통점:
1. PM2 dashboard 재시작 직후 ~30초 내
2. 첫 PM2 설치 후 cloudflared 프로세스 처음 기동할 때

정상 복구 방법: `pm2 restart cloudflared` → 5초 후 모든 엔드포인트 200.

## 원인

**불확실** (confidence: medium). 가능성:

1. **PM2 재시작 후 타이밍 경쟁**: dashboard 프로세스와 cloudflared 둘 다 동시 재시작 시 cloudflared가 origin (dashboard:3000)에 연결 시도하는 타이밍과 dashboard ready 시점이 어긋날 수 있음.
2. **QUIC UDP 버퍼 경고**: cloudflared 로그에 `failed to sufficiently increase receive buffer size (was: 208 kiB, wanted: 7168 kiB, got: 416 kiB)` 반복 출력. QUIC 프로토콜 사용 시 UDP 수신 버퍼 부족 — 고부하 상황에서 패킷 드롭 유발 가능.
3. **4개 터널 연결 중 일부만 registered 상태에서 요청 수신**: cloudflared가 `connIndex=0~3` 4개 연결을 순차 등록하는 동안(수 초 소요) 특정 연결만 라우팅돼 불안정.

## 해결

### 단기 (세션 21에서 사용)

```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && pm2 restart cloudflared"
```

재시작 후 5~10초 대기하면 4개 터널 연결 모두 재등록 완료되며 정상화. 앱 프로세스는 영향 받지 않음.

### 중기 — QUIC 버퍼 튜닝

Linux(WSL2)에서 UDP 수신 버퍼 기본값을 상향:

```bash
# 세션 임시
sudo sysctl -w net.core.rmem_max=7500000
sudo sysctl -w net.core.rmem_default=2500000

# 영구 — /etc/sysctl.conf에 추가
echo "net.core.rmem_max=7500000" | sudo tee -a /etc/sysctl.conf
echo "net.core.rmem_default=2500000" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

cloudflared 재시작 후 warning 메시지 사라지는지 확인.

### 장기 — 배포 순서 조정

PM2에서 dashboard와 cloudflared를 **순차 기동**하도록 dependency 설정 또는 ecosystem 파일 분리:

```yaml
# ecosystem.config.js (예시)
module.exports = {
  apps: [
    {
      name: "dashboard",
      script: "npm",
      args: "start",
      wait_ready: true,  // HTTP ready 신호 대기
      listen_timeout: 10000,
    },
    {
      name: "cloudflared",
      script: "cloudflared",
      args: "tunnel run",
      // dashboard가 listen 시작한 후에만 기동
    }
  ]
};
```

또는 별도 스크립트:
```bash
pm2 restart dashboard && sleep 10 && pm2 restart cloudflared
```

## 교훈

1. **"WSL localhost OK / 프로덕션 530" 분기 시 먼저 cloudflared 상태 의심** — origin 자체 문제보다 터널 상태 이슈일 확률이 높음. `pm2 logs cloudflared --lines 20 --nostream`으로 connection registered 로그 확인.
2. **QUIC 버퍼 경고는 무시 금지** — "warning"으로 기록돼 있지만 고부하 상황에서 실제 연결 실패로 이어질 수 있음.
3. **배포 후 검증은 "서비스 가동 시작" 직후가 아니라 "터널 안정화 완료 후"** — PM2 uptime 0s는 서비스 프로세스가 시작된 시점일 뿐 터널 재등록 완료 시점은 아님. 최소 15초 대기 후 smoke 테스트 권장.
4. **E2E 시나리오 설계 시 "터널 경유" 경로와 "localhost" 경로를 둘 다 검증** — 세션 21처럼 터널 불안정 시 localhost curl로 애플리케이션 로직 검증을 병행하면 "앱 버그 vs 네트워크 버그" 구분이 쉬움.

## 관련 파일

- `~/dashboard/.cloudflared/` (WSL2 cloudflared config — 세션 16에서 PM2 등록)
- cloudflared logs: `~/.pm2/logs/cloudflared-out.log`, `~/.pm2/logs/cloudflared-error.log`
- 세션 16 인수인계: Cloudflare Tunnel PM2 복구 기록 (`docs/handover/260412-session16-supabase-deploy.md`)
