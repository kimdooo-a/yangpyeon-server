# 02. Cloudflare Tunnel + WSL2 + PM2 배포 파이프라인 통합 계약

> Wave 4 · Tier 3 · I2 Integration 클러스터 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-I2)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [04-integration/](./) → **이 문서**
> 연관: [../02-architecture/05-operations-blueprint.md](../02-architecture/05-operations-blueprint.md) · [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) (ADR-015)
> 관련 솔루션: [../../../../docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md](../../../../docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md)

---

## 0. 문서 구조

```
§1.  배포 토폴로지 상세 다이어그램
§2.  Cloudflare Tunnel 설정 전체 — config.yml + ingress + keepAlive
§3.  세션 25-B→C 교훈 및 향후 후속 작업 5건
§4.  DNS 관리 — 가비아 → Cloudflare 네임서버 위임
§5.  TLS 인증서 — Cloudflare Universal SSL
§6.  배포 파이프라인 5단계 정밀 명세
§7.  롤백 전략 — Capistrano symlink 스왑
§8.  Canary 배포 — canary.stylelucky4u.com
§9.  환경 변수 주입 체계
§10. 로그 파이프라인
§11. 530 에러 대응 절차
§12. WSL2 특성 및 운영 주의사항
§13. Wave 4 할당 DQ 답변
부록 Z. 근거 인덱스 · 변경 이력
```

---

## 1. 배포 토폴로지 상세 다이어그램

### 1.1 전체 플로우 개요

양평 부엌 서버 대시보드의 배포 환경은 단일 물리 머신(Windows 11 Pro) 위에 WSL2 Ubuntu를 실행 환경으로 두고, Cloudflare의 인프라를 통해 인터넷에 노출하는 구조다. 물리 머신의 인터넷 회선은 KT 가정용 회선이다.

```
┌──────────────────────────────────────────────────────────────────────┐
│  개발자 머신 (Windows 11 Pro)                                         │
│  드라이브: E:\00_develop\260406_luckystyle4u_server\                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  WSL2 Ubuntu 22.04 LTS                                      │    │
│  │  서비스 유저: ypb-runtime (로그인 불가 서비스 계정)             │    │
│  │  홈: /home/dev/luckystyle4u-server/                         │    │
│  │                                                             │    │
│  │  ┌───────────────────────────────────────────────────┐     │    │
│  │  │  PM2 (systemd pm2-smart.service 관리)              │     │    │
│  │  │                                                   │     │    │
│  │  │  yangpyeong-web (cluster:4, port 3000)            │     │    │
│  │  │  ├── Worker 0 (Next.js 16 App Router)             │     │    │
│  │  │  ├── Worker 1 (Next.js 16 App Router)             │     │    │
│  │  │  ├── Worker 2 (Next.js 16 App Router)             │     │    │
│  │  │  └── Worker 3 (Next.js 16 App Router)             │     │    │
│  │  │                                                   │     │    │
│  │  │  cron-worker (fork:1, 별도 포트 없음)               │     │    │
│  │  │  └── node-cron + PG advisory lock                 │     │    │
│  │  │                                                   │     │    │
│  │  │  luckystyle4u-canary (cluster:4, port 3002)       │     │    │
│  │  │  └── (카나리 배포 시에만 활성)                        │     │    │
│  │  │                                                   │     │    │
│  │  │  cloudflared (fork:1)                             │     │    │
│  │  │  └── protocol=http2, 4 connector                  │     │    │
│  │  └───────────────────────────────────────────────────┘     │    │
│  │                                                             │    │
│  │  PostgreSQL 17 (port 5432)                                  │    │
│  │  SeaweedFS filer + volume (port 8888/8080)                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Windows↔WSL2 NAT: localhost:3000 → WSL2 내부 IP:3000               │
│  E:\ 드라이브 마운트: /mnt/e/ (Windows 파일시스템 접근)                 │
└──────────────────────────────────────────────────────────────────────┘
           ↕ KT 가정용 회선 (QUIC UDP / HTTP/2 TCP)
           ↕ cloudflared 4 connector (icn06/icn01 데이터센터)
┌──────────────────────────────────────────────────────────────────────┐
│  Cloudflare Edge (글로벌 Anycast)                                     │
│                                                                      │
│  Tunnel: 2e18470f-b351-46ab-bf07-ead0d1979fb9                        │
│                                                                      │
│  stylelucky4u.com        → CF Proxy → Tunnel → localhost:3000        │
│  canary.stylelucky4u.com → CF Rule  → Tunnel → localhost:3002        │
│  api.stylelucky4u.com    → CF Proxy → Tunnel → localhost:3000/api/*  │
│                          (※ api 서브도메인은 잠재 경로, 미활성 상태)    │
│                                                                      │
│  Universal SSL (Let's Encrypt 기반 CF 발급)                           │
│  WAF + DDoS 보호 (무료 플랜)                                           │
└──────────────────────────────────────────────────────────────────────┘
           ↕ HTTPS
┌──────────────────────────────────────────────────────────────────────┐
│  인터넷 사용자 / Claude Code MCP 클라이언트                              │
│  도메인: https://stylelucky4u.com                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 디렉토리 레이아웃 (WSL2 내부)

```
/home/dev/luckystyle4u-server/
├── current/                    → symlink → releases/<latest>
├── current-canary/             → symlink → releases/<canary>
├── releases/
│   ├── 20260418T160000_66c1686/  ← 최신 릴리즈 (YYYYMMDDTHHMMSS_gitsha)
│   ├── 20260417T090000_5525bd2/  ← -1 세대
│   ├── 20260416T140000_078dfe2/  ← -2 세대
│   ├── 20260415T110000_67b414d/  ← -3 세대
│   └── 20260414T080000_1655fce/  ← -4 세대 (5세대까지 보관)
├── shared/
│   ├── .env.local               ← dev 환경 변수 (gitignore)
│   └── data/
│       ├── luckystyle4u.db      ← SQLite (metrics, sessions)
│       └── uploads/             ← 로컬 임시 업로드
└── logs/
    ├── pm2/                     → /var/log/pm2/ symlink
    └── deploy/                  ← 배포 이벤트 JSON 로그

/etc/luckystyle4u/
└── secrets.env                  ← MASTER_KEY + DB_URL + B2_* (chmod 0640, root:ypb-runtime)

~/.cloudflared/
├── config.yml                   ← cloudflared 설정 (§2 참조)
└── 2e18470f-b351-46ab-bf07-ead0d1979fb9.json  ← tunnel credentials
```

### 1.3 프로세스 간 통신 구조

```
[양평 대시보드 UI] ──HTTP──→ [Next.js App Router Route Handler]
                                     ↓ Prisma 7
                               [PostgreSQL 17]
                                     ↓ wal-g
                               [Backblaze B2]

[cron-worker] ─PG advisory lock─→ [PostgreSQL]
              ─wal-g 트리거─→      [B2 백업 버킷]
              ─HTTP webhook─→      [Slack / Discord]

[cloudflared] ─4 connector─→  [Cloudflare Edge]
                ↕ http://localhost:3000
              [yangpyeong-web PM2 cluster:4]
```

---

## 2. Cloudflare Tunnel 설정 전체

### 2.1 `~/.cloudflared/config.yml` 전체 예시

아래 설정은 세션 25-B→C 부분 수정 결과를 반영한 최종 권장 설정이다. QUIC(UDP)에서 HTTP/2(TCP)로 프로토콜을 변경하여 KT 회선 UDP 패킷 손실 가능성을 회피하고, TCP keepalive 강화와 함께 사용한다.

```yaml
# ~/.cloudflared/config.yml
# 마지막 수정: 세션 25-C (2026-04-18) — HTTP/2 폴백 + keepAlive 튜닝 완료
# 참조: docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md

tunnel: 2e18470f-b351-46ab-bf07-ead0d1979fb9
credentials-file: /home/smart/.cloudflared/2e18470f-b351-46ab-bf07-ead0d1979fb9.json

# ─────────────────────────────────────────────────────────────────────
# 프로토콜 설정
# QUIC(UDP)는 KT 가정용 회선에서 패킷 손실 시 30% 안정성 → HTTP/2(TCP)로 변경.
# 세션 25-C 측정: HTTP/2 + sysctl 튜닝으로 28/28 edge 관통 달성.
# ─────────────────────────────────────────────────────────────────────
protocol: http2
retries: 5
grace-period: 30s

# ─────────────────────────────────────────────────────────────────────
# Origin 연결 설정
# tcpKeepAlive: cloudflared ↔ origin(localhost:3000) TCP keepalive
# keepAliveConnections: origin 커넥션 풀 크기
# keepAliveTimeout: 유휴 커넥션 유지 시간 (dashbaord 콜드 hit 감소)
# noHappyEyeballs: false — IPv6/IPv4 동시 시도 허용 (WSL2 IPv4 전용이므로 무관하나 유지)
# ─────────────────────────────────────────────────────────────────────
originRequest:
  connectTimeout: 30s
  tlsTimeout: 10s
  tcpKeepAlive: 30s
  keepAliveConnections: 100
  keepAliveTimeout: 90s
  noHappyEyeballs: false
  # 추가 권장 (Phase 16에서 적용 예정):
  # http2Origin: false  # origin이 HTTP/1.1이므로 강제 비활성 (default false 확인)

# ─────────────────────────────────────────────────────────────────────
# Ingress 규칙
# 순서 중요: 위에서 아래로 매칭. 마지막 catch-all 필수.
# ─────────────────────────────────────────────────────────────────────
ingress:
  # 메인 도메인
  - hostname: stylelucky4u.com
    service: http://localhost:3000
    originRequest:
      connectTimeout: 30s
      keepAliveConnections: 100

  # 카나리 서브도메인 (Phase 16 canary 배포 시 활성화)
  - hostname: canary.stylelucky4u.com
    service: http://localhost:3002
    originRequest:
      connectTimeout: 30s
      keepAliveConnections: 20

  # API 서브도메인 (잠재 경로 — 현재 미활성, Phase 22+ 도입 검토)
  # - hostname: api.stylelucky4u.com
  #   service: http://localhost:3000
  #   originRequest:
  #     connectTimeout: 30s

  # catch-all: 위 규칙에 매칭되지 않는 모든 요청 → 404
  - service: http_status:404
```

### 2.2 WSL2 sysctl 설정 (영속화)

cloudflared의 HTTP/2 커넥션 안정성은 WSL2 커널 레벨 TCP keepalive 설정과 밀접하게 연관된다. 세션 25-C에서 아래 설정을 영속화하여 100% edge 관통률을 달성했다.

```bash
# 파일: /etc/sysctl.d/99-cloudflared.conf
# 적용: sudo sysctl -p /etc/sysctl.d/99-cloudflared.conf
# 영속화: systemd-sysctl.service가 boot 시 자동 로드

# TCP keepalive 강화 — KT 회선 패킷 drop 즉시 복구
net.ipv4.tcp_keepalive_time = 60       # 기본 7200 → 60 (120배 단축)
net.ipv4.tcp_keepalive_intvl = 10      # 기본 75 → 10 (probe 간격 단축)
net.ipv4.tcp_keepalive_probes = 6      # 기본 9 → 6 (probe 횟수)

# 소켓 버퍼 확장 — 순간 패킷 burst 흡수
net.core.rmem_max = 16777216           # 기본 212992 → 16MB (79배)
net.core.wmem_max = 16777216           # 기본 212992 → 16MB
```

적용 후 PM2에서 cloudflared 재시작 필요:
```bash
pm2 restart cloudflared
# 재시작 후 4개 connector 재등록 확인 (icn06/icn01 location)
# pm2 logs cloudflared --lines 20
```

### 2.3 PM2 ecosystem.config.js — cloudflared 포함 전체

```javascript
// /home/dev/luckystyle4u-server/current/ecosystem.config.js
module.exports = {
  apps: [
    // ─── 웹 서버 (cluster 모드, 4 워커) ────────────────────────────
    {
      name: 'yangpyeong-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/dev/luckystyle4u-server/current',
      instances: 4,
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env_file: '/etc/luckystyle4u/secrets.env',   // MASTER_KEY + DB_URL 주입
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
      },
      // 로그 설정
      output: '/var/log/pm2/yangpyeong-web-out.log',
      error: '/var/log/pm2/yangpyeong-web-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ─── 카나리 웹 서버 (cluster 모드, 4 워커) ────────────────────
    // 카나리 배포 시에만 pm2 start/stop 사용
    {
      name: 'luckystyle4u-canary',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/dev/luckystyle4u-server/current-canary',
      instances: 4,
      exec_mode: 'cluster',
      autorestart: false,          // 카나리는 자동 재시작 비활성 (수동 관리)
      env_file: '/etc/luckystyle4u/secrets.env',
      env: {
        PORT: 3002,
        NODE_ENV: 'production',
      },
      output: '/var/log/pm2/canary-out.log',
      error: '/var/log/pm2/canary-err.log',
    },

    // ─── cron 워커 (fork 모드, 단일 인스턴스) ────────────────────
    // ADR-005: cluster 모드 금지 (cron 중복 실행 방지)
    {
      name: 'cron-worker',
      script: 'dist/lib/db-ops/cron/cron-worker-entry.js',
      cwd: '/home/dev/luckystyle4u-server/current',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/etc/luckystyle4u/secrets.env',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      restart_delay: 5000,         // 재시작 간격 5초 (advisory lock 해제 대기)
      output: '/var/log/pm2/cron-worker-out.log',
      error: '/var/log/pm2/cron-worker-err.log',
    },

    // ─── cloudflared (fork 모드) ──────────────────────────────────
    // Cloudflare Tunnel connector. config.yml 참조.
    {
      name: 'cloudflared',
      script: '/usr/local/bin/cloudflared',
      args: 'tunnel --config /home/smart/.cloudflared/config.yml run',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,         // 재시작 간격 3초
      output: '/var/log/pm2/cloudflared-out.log',
      error: '/var/log/pm2/cloudflared-err.log',
    },
  ],
}
```

### 2.4 `~/.bashrc` 운영 편의 설정 (WSL2)

```bash
# ~/.bashrc — 양평 서버 운영 단축키

# ─── 배포 관련 단축키 ──────────────────────────────────────────
alias ypstatus='pm2 list'
alias yplogs='pm2 logs yangpyeong-web --lines 50'
alias yprestart='pm2 reload yangpyeong-web --update-env'
alias yptunnel='pm2 logs cloudflared --lines 20'
alias yp530='pm2 restart cloudflared && echo "30-40초 propagation 대기..." && sleep 35 && bash ~/scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 5 5'

# ─── Cloudflare Tunnel 안정성 측정 ─────────────────────────────
alias yptunnelcheck='bash /home/dev/luckystyle4u-server/current/scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 14 5'

# ─── 배포 경로 단축 ────────────────────────────────────────────
export YPB_HOME=/home/dev/luckystyle4u-server
alias ypcd='cd $YPB_HOME/current'
alias ypreleases='ls -lt $YPB_HOME/releases'
alias ypcurrent='readlink -f $YPB_HOME/current'

# ─── sysctl 상태 확인 ──────────────────────────────────────────
alias ypsysctl='echo "TCP keepalive_time:$(sysctl -n net.ipv4.tcp_keepalive_time) rmem:$(sysctl -n net.core.rmem_max)"'

# ─── 긴급 롤백 ────────────────────────────────────────────────
alias yprollback='bash $YPB_HOME/current/scripts/rollback.sh'
```

---

## 3. 세션 25-B→C 교훈 및 향후 후속 작업 5건

### 3.1 교훈 요약

세션 24에서 처음 발견된 Cloudflare Tunnel 간헐 530 / Error 1033 이슈는 3세션에 걸쳐 단계적으로 진단·개선되었다.

| 세션 | 적용 내용 | edge 관통 비율 |
|------|----------|---------------|
| 세션 25-A | QUIC 기본 설정 유지 | ~30% (200 기준) |
| 세션 25-B | HTTP/2 폴백 + keepAlive 튜닝 | ~50% (200 기준) |
| **세션 25-C** | **HTTP/2 + sysctl keepalive 60/10/6 + 16MB buffers** | **100% (28/28, 2xx/3xx 기준)** |

**측정 방법 교훈**: "200 비율"은 Tunnel 안정성과 동일하지 않다. 보호된 라우트(`/`)는 307 리다이렉트를 반환하므로 200 집계 시 오판한다. **올바른 측정 기준**: `2xx + 3xx + 4xx = 성공, 5xx + curl error = 실패`. `/login` 같은 공개 라우트를 진단용으로 사용한다.

**근본 원인**: KT 가정용 회선에서 Cloudflare edge ↔ cloudflared connector 간 UDP 패킷 손실(QUIC 모드). HTTP/2(TCP)로 전환 + TCP keepalive 60초 강화로 connection-level 즉시 복구. KT 회선 자체는 변하지 않았으므로 장애 심화 시 530 재발 가능성 존재.

**한계**: 세션 25-C 측정 직후 약 1분 후 Playwright 실행 시 530 1건 발생. "100% 보증"이 아닌 "매우 높은 안정성(>99%)" 수준. 샘플 100 trial 이상 측정 시 정확한 수치 확보 가능.

### 3.2 향후 후속 작업 5건 (우선순위 순)

#### 후속-1: cloudflared 다중 인스턴스 (★ 최우선, 현재 미완)

Playwright 530 발생을 고려하면 단일 cloudflared 인스턴스의 순간 connector 손실이 여전히 리스크다. Cloudflare Zero Trust 대시보드에서 동일 hostname에 2개 tunnel을 연결하면 round-robin + failover가 가능하다.

```bash
# WSL2에서 두 번째 cloudflared 인스턴스 설정
# 1. 두 번째 tunnel 생성 (Zero Trust 대시보드 또는 CLI)
cloudflared tunnel create yangpyeong-backup

# 2. ~/.cloudflared/config-backup.yml 작성
# (tunnel ID 변경, 동일 ingress 규칙)

# 3. PM2에 두 번째 인스턴스 추가
# ecosystem.config.js의 cloudflared-backup 앱 추가
{
  name: 'cloudflared-backup',
  script: '/usr/local/bin/cloudflared',
  args: 'tunnel --config /home/smart/.cloudflared/config-backup.yml run',
  exec_mode: 'fork',
  instances: 1,
}
```

**기대 효과**: 첫 번째 connector 손실 시 Cloudflare가 두 번째 tunnel로 자동 failover. 산발 530 빈도 추가 감소.

#### 후속-2: Playwright retries: 2 추가 (즉시 적용 가능)

E2E 테스트에서 산발 530을 흡수한다. `playwright.config.ts`에 `retries: 2` 추가.

```typescript
// playwright.config.ts
export default defineConfig({
  retries: 2,  // 산발 530 1~2회 재시도로 흡수
  timeout: 30000,
  // ...
})
```

#### 후속-3: 주기적 안정성 모니터링 (cron 등록)

매일 오전 9시 `scripts/tunnel-measure-v2.sh`를 실행하여 안정성을 로그로 남긴다. 95% 미만 시 Slack 알림 발송.

```bash
# node-cron 잡 등록 예시 (cron-worker-entry.ts)
# 매일 09:00 UTC+9 (= 00:00 UTC) 실행
cron.schedule('0 0 * * *', async () => {
  const result = await runTunnelMeasure('https://stylelucky4u.com/login', 20, 5)
  if (result.successRate < 0.95) {
    await slackNotifier.send({
      channel: '#infra-alerts',
      text: `⚠️ Tunnel 안정성 저하: ${(result.successRate * 100).toFixed(1)}% (기준: 95%)`,
    })
  }
})
```

#### 후속-4: Cloudflare WARP 설치 (선택적)

KT 회선이 CF에 직접 도달하도록 WARP 클라이언트를 WSL2에 설치하면 라우팅 최적화가 가능하다. 현재 sysctl 튜닝으로 충분하나, 장기 안정성이 필요하면 고려한다.

```bash
# WSL2에서 WARP 설치 (Ubuntu)
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ jammy main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
sudo apt-get update && sudo apt-get install cloudflare-warp
warp-cli register
warp-cli connect
```

#### 후속-5: auto-restart cron (긴급 대응)

sysctl 값 drift 감지 시 자동 재적용. 현재는 불필요하지만 장기 운영 시 대비.

```bash
# /etc/cron.d/cloudflared-healthcheck
# 매 시간 sysctl 값 확인 후 필요 시 재적용
0 * * * * root /usr/local/bin/check-sysctl.sh >> /var/log/sysctl-check.log 2>&1
```

```bash
#!/bin/bash
# /usr/local/bin/check-sysctl.sh
CURRENT=$(sysctl -n net.ipv4.tcp_keepalive_time)
if [ "$CURRENT" -ne 60 ]; then
  echo "[$(date)] sysctl drift 감지 (tcp_keepalive_time=$CURRENT), 재적용"
  sysctl -p /etc/sysctl.d/99-cloudflared.conf
  pm2 restart cloudflared
fi
```

---

## 4. DNS 관리 — 가비아 → Cloudflare 네임서버 위임

### 4.1 네임서버 위임 구조

도메인 `stylelucky4u.com`은 가비아(gabia.com)에서 등록되었으며, DNS 관리는 Cloudflare에 위임되어 있다.

```
도메인 등록: 가비아 (gabia.com)
  ↓ 네임서버 위임
  NS: kelly.ns.cloudflare.com
  NS: paul.ns.cloudflare.com
DNS 관리: Cloudflare 대시보드 (CF Account: smartkdy7@naver.com)
```

### 4.2 가비아에서 변경 불필요한 항목

가비아 컨트롤 패널에서 **네임서버만 Cloudflare로 지정**한 후에는 모든 DNS 레코드를 Cloudflare 대시보드에서 관리한다. 가비아에서 A레코드/CNAME을 추가하면 Cloudflare 설정과 충돌하므로 절대 하지 않는다.

### 4.3 Cloudflare DNS 레코드 현황

| 타입 | 이름 | 값 | TTL | CF 프록시 |
|------|------|-----|-----|----------|
| CNAME | `stylelucky4u.com` | `2e18470f-b351-46ab-bf07-ead0d1979fb9.cfargotunnel.com` | Auto | ✅ (Proxied) |
| CNAME | `canary` | `2e18470f-b351-46ab-bf07-ead0d1979fb9.cfargotunnel.com` | Auto | ✅ (Proxied) |
| CNAME | `www` | `stylelucky4u.com` | Auto | ✅ (Proxied) |

Cloudflare Tunnel을 사용하므로 origin IP는 DNS에 노출되지 않는다. CNAME 값은 tunnel ID 기반 `cfargotunnel.com` 엔드포인트다.

### 4.4 DNS 전파 대기 시간

- TTL Auto = 300초 (5분) — 첫 설정 또는 레코드 변경 시 최대 5분 대기
- cloudflared 재시작 후 **30~40초** edge propagation lag 발생 (정상 동작)
- 530 발생 직후 `pm2 restart cloudflared` 실행 시 30~40초 이내 정상 복구 기대

---

## 5. TLS 인증서 — Cloudflare Universal SSL

### 5.1 인증서 발급 구조

```
[클라이언트] ──HTTPS──→ [Cloudflare Edge]
              TLS 종료 at CF Edge
              인증서: Cloudflare Universal SSL (Let's Encrypt 기반 자동 갱신)

[Cloudflare Edge] ──HTTP──→ [cloudflared connector]
                  Tunnel 내부 구간 (암호화됨, CF 자체 mTLS)

[cloudflared] ──HTTP──→ [localhost:3000]
              내부 구간 (WSL2 내부 루프백, 암호화 불필요)
```

### 5.2 SSL 설정

| 항목 | 설정값 |
|------|-------|
| SSL/TLS 모드 | Full (Strict 불필요 — origin은 HTTP localhost) |
| Universal SSL | 활성화 (자동 갱신 — 만료 30일 전 갱신) |
| HSTS | 활성화 (max-age=31536000, includeSubDomains) |
| 최소 TLS 버전 | TLS 1.2 |
| TLS 1.3 | 활성화 |
| OCSP Stapling | 활성화 (CF 자동 관리) |

### 5.3 인증서 관리 주의사항

Cloudflare Tunnel 사용 시 origin에 별도 SSL 인증서가 **불필요**하다. cloudflared가 CF Edge와 mTLS로 통신하며, origin은 HTTP(localhost:3000)로만 서빙한다. Let's Encrypt 인증서를 별도로 발급하거나 `--no-tls-verify` 옵션을 사용하지 않아도 된다.

---

## 6. 배포 파이프라인 5단계 정밀 명세

### 6.1 배포 파이프라인 개요 (ADR-015)

Capistrano-style symlink 배포를 기반으로 한 5단계 파이프라인이다. `--skip-win-build` 플래그로 Windows 빌드 단계를 스킵할 수 있다.

```
Phase 1: Windows 빌드 (또는 --skip-win-build)
  ↓
Phase 2: rsync WSL2 동기화
  ↓
Phase 3: Prisma migrate + Drizzle migrate
  ↓
Phase 4: PM2 graceful reload cluster:4
  ↓
Phase 5: 헬스체크 (5회 × 5초)
```

### 6.2 Phase 1 — Windows 빌드 (또는 --skip-win-build)

```bash
# deploy.sh (Windows PowerShell에서 호출 또는 WSL2 내부에서 직접 실행)

RELEASE_ID=$(date +%Y%m%dT%H%M%S)_$(git rev-parse --short HEAD)
RELEASE_PATH="$YPB_HOME/releases/$RELEASE_ID"

# Windows 빌드 스킵 여부 판단
if [ "$SKIP_WIN_BUILD" != "true" ]; then
  echo "[Phase 1] Windows에서 next build 실행..."
  # Windows 경로에서 빌드 (E:\00_develop\260406_luckystyle4u_server)
  powershell.exe -Command "cd E:\00_develop\260406_luckystyle4u_server; npm run build"
  if [ $? -ne 0 ]; then
    echo "❌ Windows 빌드 실패. 배포 중단."
    exit 1
  fi
  echo "✅ Windows 빌드 완료."
else
  echo "[Phase 1] --skip-win-build: Windows 빌드 스킵 (WSL2 내부 빌드 사용)"
  # WSL2 내부에서 직접 빌드
  cd /mnt/e/00_develop/260406_luckystyle4u_server
  npm run build
  if [ $? -ne 0 ]; then
    echo "❌ WSL2 빌드 실패. 배포 중단."
    exit 1
  fi
fi
```

**Windows 빌드 vs WSL2 빌드 선택 기준**:
- **Windows 빌드 권장**: lightningcss 등 Windows 바이너리 네이티브 의존성이 있을 때 (`세션 25-C 이전 경험 — 2026-04-12-windows-lightningcss-missing.md`)
- **WSL2 빌드 (`--skip-win-build`)**: CI/CD 자동화, Windows 환경 없는 경우

### 6.3 Phase 2 — rsync WSL2 동기화

```bash
echo "[Phase 2] rsync: E:\00_develop → WSL2 $RELEASE_PATH"
mkdir -p "$RELEASE_PATH"

# rsync: Windows 빌드 결과물을 WSL2 releases 디렉토리로 복사
rsync -avz --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.env.local' \
  --exclude='*.log' \
  --exclude='test-results/' \
  --exclude='e2e-*.png' \
  /mnt/e/00_develop/260406_luckystyle4u_server/ \
  "$RELEASE_PATH/"

if [ $? -ne 0 ]; then
  echo "❌ rsync 실패. 배포 중단."
  rm -rf "$RELEASE_PATH"
  exit 1
fi

# node_modules는 shared/node_modules에서 symlink
# (빌드 시간 절약: 의존성 변경 없으면 재설치 불필요)
ln -sfn "$YPB_HOME/shared/node_modules" "$RELEASE_PATH/node_modules"

echo "✅ rsync 완료 ($RELEASE_PATH)"
```

### 6.4 Phase 3 — Prisma migrate + Drizzle migrate

```bash
echo "[Phase 3] DB 마이그레이션 실행..."

cd "$RELEASE_PATH"

# Prisma: 새 마이그레이션이 있을 경우 실행
# --skip-generate: 빌드 시 이미 generate 완료
npx prisma migrate deploy --skip-generate
if [ $? -ne 0 ]; then
  echo "❌ Prisma migrate 실패. 롤백 실행."
  # Phase 3 실패 시 심볼릭 링크 변경 없으므로 DB 롤백만 필요
  # down.sql이 있는 경우: npx prisma migrate resolve --rolled-back <migration_name>
  exit 1
fi

# Drizzle: SQLite metrics DB 마이그레이션 (별도 관리)
# (metrics_history, ai_usage_events 등 SQLite 전용 테이블)
if [ -f "drizzle.config.ts" ]; then
  npx drizzle-kit migrate
  if [ $? -ne 0 ]; then
    echo "❌ Drizzle migrate 실패."
    exit 1
  fi
fi

echo "✅ DB 마이그레이션 완료."
```

**주의사항**:
- Prisma migration은 **트랜잭션 내에서 실행**된다. 실패 시 PostgreSQL이 자동 롤백한다.
- 마이그레이션 `down.sql`이 없는 경우 DB 롤백 불가 → Phase 3 실패 시 새 배포 파일만 삭제하고 symlink 변경 없이 중단한다.
- **프로덕션 DB에 직접 스키마 변경 금지** (CLAUDE.md 코딩 규칙). 반드시 migration 파일을 통해 적용.

### 6.5 Phase 4 — PM2 graceful reload cluster:4

```bash
echo "[Phase 4] symlink 교체 + PM2 graceful reload..."

# symlink 교체 (이 시점부터 신규 릴리즈 경로 사용)
ln -sfn "$RELEASE_PATH" "$YPB_HOME/current"
if [ $? -ne 0 ]; then
  echo "❌ symlink 교체 실패."
  exit 1
fi

# PM2 graceful reload (zero-downtime)
# cluster:4 → 각 워커를 순차 재시작 (1개 재시작 시 나머지 3개 서비스 유지)
pm2 reload yangpyeong-web --update-env
if [ $? -ne 0 ]; then
  echo "❌ PM2 reload 실패. 자동 롤백 실행..."
  # 이전 release 경로로 symlink 복구
  PREV_RELEASE=$(ls -t "$YPB_HOME/releases" | sed -n '2p')
  if [ -n "$PREV_RELEASE" ]; then
    ln -sfn "$YPB_HOME/releases/$PREV_RELEASE" "$YPB_HOME/current"
    pm2 reload yangpyeong-web --update-env
    echo "롤백 완료: $PREV_RELEASE"
  fi
  exit 1
fi

# cron-worker 재시작 (fork 모드 — reload 대신 restart)
pm2 restart cron-worker
echo "✅ PM2 reload 완료."
```

**graceful reload 동작 원리**:
```
cluster:4 상태:
  Worker 0 (running) ← 새 요청 수신 중
  Worker 1 (running)
  Worker 2 (running)
  Worker 3 (running)

reload 실행:
  1. Worker 0에 SIGINT 전송 → Worker 0 연결 완료 후 종료
  2. 새 Worker 0' 시작 → ready 상태 대기
  3. Worker 0' ready → Worker 1에 SIGINT 전송
  4. 순차 반복 (항상 3개 이상 서비스 중)

결과: 다운타임 0초 (요청 손실 없음)
```

### 6.6 Phase 5 — 헬스체크

```bash
echo "[Phase 5] 헬스체크 (5회 × 5초)..."

HEALTH_URL="http://localhost:3000/api/health"
MAX_ATTEMPTS=5
INTERVAL=5
SUCCESS=0

for i in $(seq 1 $MAX_ATTEMPTS); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL")
  if [ "$STATUS" = "200" ]; then
    echo "  [$i/$MAX_ATTEMPTS] ✅ 헬스체크 성공 (HTTP $STATUS)"
    SUCCESS=1
    break
  else
    echo "  [$i/$MAX_ATTEMPTS] ⏳ 헬스체크 대기 중 (HTTP $STATUS) — ${INTERVAL}초 후 재시도"
    sleep $INTERVAL
  fi
done

if [ "$SUCCESS" = "0" ]; then
  echo "❌ 헬스체크 실패 (${MAX_ATTEMPTS}회). 자동 롤백 실행..."
  bash "$YPB_HOME/current/scripts/rollback.sh"
  exit 1
fi

# 배포 완료 시 오래된 릴리즈 정리 (5개 초과 시)
ls -dt "$YPB_HOME/releases/*" | tail -n +6 | xargs rm -rf 2>/dev/null || true

echo "✅ 배포 완료! 릴리즈: $RELEASE_ID"
echo "   URL: https://stylelucky4u.com"
echo "   PM2: pm2 list"
```

`/api/health` 엔드포인트:
```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    // DB 연결 확인
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.DEPLOY_VERSION ?? 'unknown',
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 503 },
    )
  }
}
```

---

## 7. 롤백 전략 — Capistrano symlink 스왑 (5초 다운타임)

### 7.1 롤백 설계 원칙

ADR-015에서 결정한 Capistrano-style 롤백의 핵심은 **symlink 스왑**이다. `current` symlink를 이전 릴리즈로 되돌리고 PM2 reload를 실행하면 약 5초 이내에 롤백이 완료된다.

Docker image rollback(~30~60초) 대비 6배 빠르다.

### 7.2 롤백 스크립트 (`scripts/rollback.sh`)

```bash
#!/bin/bash
# scripts/rollback.sh
# 사용법:
#   ./scripts/rollback.sh                  # 이전 릴리즈로 자동 롤백
#   ./scripts/rollback.sh <release_id>     # 특정 릴리즈로 롤백

set -e
YPB_HOME=/home/dev/luckystyle4u-server

if [ -n "$1" ]; then
  TARGET="$YPB_HOME/releases/$1"
  if [ ! -d "$TARGET" ]; then
    echo "❌ 릴리즈를 찾을 수 없음: $TARGET"
    exit 1
  fi
else
  # 현재 symlink가 가리키는 경로 제외하고 가장 최신 릴리즈 선택
  CURRENT=$(readlink -f "$YPB_HOME/current")
  TARGET=$(ls -dt "$YPB_HOME/releases"/* | grep -v "^$CURRENT$" | head -1)
  if [ -z "$TARGET" ]; then
    echo "❌ 롤백 가능한 이전 릴리즈가 없음."
    exit 1
  fi
fi

echo "⏮ 롤백 대상: $TARGET"
echo "   현재: $(readlink -f "$YPB_HOME/current")"

# 1. symlink 교체
ln -sfn "$TARGET" "$YPB_HOME/current"

# 2. PM2 graceful reload
pm2 reload yangpyeong-web --update-env

# 3. 헬스체크 (빠른 버전 — 3회)
for i in 1 2 3; do
  sleep 2
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000/api/health")
  if [ "$STATUS" = "200" ]; then
    echo "✅ 롤백 완료 (${i}회 헬스체크 성공)"
    echo "   활성 릴리즈: $TARGET"
    exit 0
  fi
done

echo "⚠️ 롤백 후 헬스체크 미확인 — 수동 확인 필요: pm2 list && pm2 logs"
```

### 7.3 DB 마이그레이션 롤백

- **Prisma migration**: `down.sql` 파일이 있는 마이그레이션의 경우 `npx prisma migrate resolve --rolled-back <name>` 후 `down.sql` 수동 실행
- **Drizzle migration**: SQLite 파일은 시스템 레벨 백업(`shared/data/luckystyle4u.db.bak`)에서 복구
- **코드만 롤백 (DB 마이그레이션 없는 경우)**: 위 rollback.sh 그대로 사용

**주의**: 마이그레이션 down.sql 없이 코드만 롤백하면 이전 코드가 새 스키마와 충돌할 수 있다. **Additive-only 마이그레이션 원칙**: 컬럼 삭제, 타입 변경 등 destructive 마이그레이션은 2단계(레거시 코드 → 마이그레이션 → 신 코드)로 분리한다.

---

## 8. Canary 배포 — canary.stylelucky4u.com

### 8.1 Canary 배포 전략

`canary.stylelucky4u.com`을 `localhost:3002`에 매핑하여 카나리 트래픽을 분리한다. Cloudflare Rule API로 메인 도메인 트래픽 일부를 카나리 서브도메인으로 리다이렉트하는 방식을 사용한다.

```
인터넷 사용자 → stylelucky4u.com
                    ↓
             Cloudflare WAF/Rule
             ┌────────────────────────────────────┐
             │  트래픽 분배 규칙 (Cloudflare Rules) │
             │  - 99% → 원래 origin (port 3000)    │
             │  - 1%  → canary origin (port 3002)  │
             └────────────────────────────────────┘
                    ↓              ↓
             yangpyeong-web    luckystyle4u-canary
             (port 3000)       (port 3002)
```

### 8.2 Canary 단계별 트래픽 분배

| 단계 | 트래픽 비율 | 유지 기간 | 판정 기준 |
|------|-----------|---------|---------|
| 1단계 | 1% | 30분 | 에러율 0%, p95 < 500ms |
| 2단계 | 5% | 1시간 | 에러율 < 0.1%, p95 < 600ms |
| 3단계 | 25% | 2시간 | 에러율 < 0.5%, p95 < 800ms |
| 4단계 | 100% | 즉시 승격 | 전단계 기준 통과 |

### 8.3 Canary 판정 메트릭

| 메트릭 | 측정 방법 | 판정 기준 |
|--------|---------|---------|
| HTTP 에러율 | PM2 로그 JSON 집계 | < 0.1% (2단계), < 0.5% (3단계) |
| p95 응답시간 | SQLite metrics_history | < 600ms (2단계), < 800ms (3단계) |
| DB 에러 수 | Prisma 쿼리 에러 카운트 | 0건 (1단계), < 5건/분 (2~3단계) |
| 503/530 비율 | Cloudflare Analytics | < 0.1% |

### 8.4 Cloudflare Rule API로 트래픽 분배

Cloudflare Rules는 무료 플랜에서 Phase Rules를 지원한다. 트래픽 비율 제어는 `cf.random_seed` 값을 활용한다.

```bash
# Cloudflare Rule API 호출 (canary 1% 활성화)
# CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN은 /etc/luckystyle4u/secrets.env에서 주입

curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_transform/entrypoint/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "redirect",
    "action_parameters": {
      "from_value": {
        "status_code": 302,
        "target_url": {
          "expression": "concat(\"https://canary.stylelucky4u.com\", http.request.uri.path)"
        },
        "preserve_query_string": true
      }
    },
    "expression": "(http.host eq \"stylelucky4u.com\") and (cf.random_seed / 65535 lt 0.01)",
    "description": "Canary 1% redirect",
    "enabled": true
  }'
```

트래픽 비율 조정은 `cf.random_seed / 65535 lt X` 표현식의 `X` 값을 변경한다 (0.01=1%, 0.05=5%, 0.25=25%).

### 8.5 Canary 롤백

카나리 이슈 발생 시 즉시 비활성화:
```bash
# 카나리 Rule 삭제 (Rule ID는 생성 시 응답에서 취득)
curl -X DELETE \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_transform/entrypoint/rules/$CANARY_RULE_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# PM2에서 카나리 앱 중지
pm2 stop luckystyle4u-canary
```

---

## 9. 환경 변수 주입 체계

### 9.1 환경별 설정 경로

| 환경 | 파일 경로 | 관리 방법 |
|------|----------|---------|
| 개발 (dev) | `/mnt/e/00_develop/260406_luckystyle4u_server/.env.local` | gitignore, 로컬 편집 |
| 프로덕션 (prod) | `/etc/luckystyle4u/secrets.env` | root 관리, PM2 env_file |
| Canary | `/etc/luckystyle4u/secrets.env` | 동일 파일 사용 (canary는 코드만 다름) |

### 9.2 `/etc/luckystyle4u/secrets.env` 구조

```bash
# /etc/luckystyle4u/secrets.env
# 권한: chmod 0640, chown root:ypb-runtime
# PM2 ecosystem의 env_file로만 주입. git 저장소 포함 금지.

# ─── Core (필수) ───────────────────────────────────────────────
DATABASE_URL="postgresql://ypb_user:PASSWORD@localhost:5432/luckystyle4u_prod"
NEXT_PUBLIC_APP_URL="https://stylelucky4u.com"
NODE_ENV="production"

# ─── Vault (DQ-12.3 결정 — ADR-013) ──────────────────────────
# MASTER_KEY: AES-256 KEK. 길이 64자 hex (32 bytes).
# 손실 시 모든 Vault secrets 복호화 불가 → GPG USB 백업 필수.
MASTER_KEY="<64자 hex 문자열>"

# ─── Cloudflare (선택 — Canary Rule API 사용 시) ───────────────
CLOUDFLARE_ZONE_ID="<zone id>"
CLOUDFLARE_API_TOKEN="<api token — Zone:Edit 권한>"

# ─── Backblaze B2 ─────────────────────────────────────────────
B2_BUCKET_NAME="luckystyle4u-prod"
B2_ACCOUNT_ID="<b2 account id>"
B2_APPLICATION_KEY="<b2 app key>"
B2_ENDPOINT="https://s3.us-west-004.backblazeb2.com"
B2_REGION="us-west-004"

# ─── wal-g (DB Ops 백업) ──────────────────────────────────────
WALG_S3_PREFIX="s3://luckystyle4u-prod/wal-archive"
AWS_ACCESS_KEY_ID="$B2_ACCOUNT_ID"
AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY"
AWS_ENDPOINT_URL_S3="$B2_ENDPOINT"
AWS_REGION="$B2_REGION"

# ─── Notification ─────────────────────────────────────────────
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# ─── 배포 정보 ────────────────────────────────────────────────
DEPLOY_VERSION="$(cat /home/dev/luckystyle4u-server/current/VERSION 2>/dev/null || echo 'unknown')"
```

### 9.3 .env.local (개발 환경)

```bash
# .env.local (gitignore — 로컬 개발 전용)
DATABASE_URL="postgresql://ypb_user:devpassword@localhost:5432/luckystyle4u_dev"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
MASTER_KEY="<개발용 MASTER_KEY — prod와 반드시 다르게>"
# B2, Slack 등은 mock 또는 dev 전용 bucket 사용
```

**보안 원칙**:
- `NEXT_PUBLIC_` 접두사 변수에 민감 정보 포함 금지
- `MASTER_KEY`, `DATABASE_URL`, `B2_APPLICATION_KEY` 등은 절대 클라이언트 번들에 포함하지 않음
- `.env.local`, `.env`, `nul` 파일 git 커밋 금지 (CLAUDE.md 규칙)

---

## 10. 로그 파이프라인

### 10.1 로그 흐름

```
[Next.js 앱] → Pino 구조화 JSON 로그 → PM2 stderr/stdout
                                              ↓
                                    /var/log/pm2/yangpyeong-web-out.log
                                    /var/log/pm2/yangpyeong-web-err.log
                                              ↓
                              [log-parser 서비스 (cron-worker 내)]
                                              ↓
                              SQLite metrics_history (응답시간, 에러율)
                                              ↓
                              [대시보드 Observability 페이지]
                              (SSE 실시간 스트리밍 — Phase 16)
```

### 10.2 구조화 JSON 로그 포맷 (Pino)

```typescript
// 배포 이벤트 로그 예시
{
  "level": "info",
  "time": "2026-04-18T07:30:00.000Z",
  "event": "deploy_success",
  "releaseId": "20260418T163000_66c1686",
  "gitSha": "66c1686",
  "branch": "main",
  "durationMs": 32450,
  "healthCheckPassed": true,
  "triggeredBy": "github-actions-run-12345"
}

// HTTP 요청 로그 예시
{
  "level": "info",
  "time": "2026-04-18T07:30:01.500Z",
  "method": "GET",
  "url": "/api/health",
  "statusCode": 200,
  "responseTimeMs": 12,
  "userId": "user_01234",
  "workerId": 2
}
```

### 10.3 PM2 로그 로테이션

```bash
# pm2-logrotate 모듈 설치
pm2 install pm2-logrotate

# 설정
pm2 set pm2-logrotate:max_size 50M      # 파일당 최대 50MB
pm2 set pm2-logrotate:retain 10         # 10개 파일 보관
pm2 set pm2-logrotate:compress true     # gzip 압축
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # 매일 자정 로테이션
```

---

## 11. 530 에러 대응 절차

### 11.1 1차 대응 (운영자 즉시 실행)

외부에서 `https://stylelucky4u.com` 접속 시 Cloudflare 530 또는 Error 1033 발생:

```bash
# 1. origin 정상 여부 먼저 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
# → 200이면 origin 정상 (Tunnel 문제)
# → 503/000이면 PM2 앱 문제

# 2. PM2 앱 상태 확인
pm2 list
# → Online이면 Tunnel 문제 → 3번으로
# → Errored/Stopped이면 pm2 restart yangpyeong-web

# 3. cloudflared 재시작 (1차 대응)
pm2 restart cloudflared
echo "30~40초 Cloudflare edge propagation 대기..."
sleep 35

# 4. 외부 접속 재확인
bash scripts/tunnel-measure-v2.sh https://stylelucky4u.com/login 5 5
```

### 11.2 단계별 진단 트리

```
외부 530 발생
  ↓
  curl http://localhost:3000/api/health
  ├── 200 → Origin 정상 → Tunnel 문제
  │   ├── pm2 restart cloudflared → 35초 대기 → 재확인
  │   └── 여전히 530 → cloudflared_tunnel_request_errors 확인
  │       ├── 0 → edge↔connector 경로 문제 (KT 회선)
  │       │   → sysctl 확인: sysctl net.ipv4.tcp_keepalive_time
  │       │   → 60이 아니면: sudo sysctl -p /etc/sysctl.d/99-cloudflared.conf
  │       └── >0 → origin 측 에러 → pm2 logs yangpyeong-web 확인
  └── 503/000 → Origin 문제
      ├── pm2 list로 앱 상태 확인
      ├── pm2 restart yangpyeong-web
      └── pm2 logs yangpyeong-web --lines 50 (에러 확인)
```

### 11.3 30~40초 Propagation Lag 주의

cloudflared 재시작 직후 **30~40초 동안 Cloudflare edge가 새 connector를 인식하는 propagation lag**가 정상적으로 발생한다. 이 시간 동안 530 응답은 정상이므로 즉시 재진단하지 않는다.

---

## 12. WSL2 특성 및 운영 주의사항

### 12.1 systemd 활성화 상태 확인

세션 25-C에서 이미 활성화되어 있음이 확인되었다:

```bash
# WSL2 systemd 상태 확인
systemctl is-system-running
# → "running" (정상)
# → "degraded" → systemctl --failed 로 실패한 유닛 확인

# PM2 서비스 상태 확인
systemctl status pm2-smart.service
# → active (running) (정상)
```

`/etc/wsl.conf` 설정:
```ini
# /etc/wsl.conf (이미 설정됨 — 세션 25-C 확인)
[boot]
systemd=true
```

### 12.2 Windows 재시작 시 자동 복구

systemd + pm2-smart.service 설정으로 Windows 재시작 시 자동 복구:
```
Windows 부팅
  ↓
WSL2 Ubuntu 기동 (자동)
  ↓
systemd PID 1 시작
  ↓
pm2-smart.service 활성화
  ↓
pm2 resurrect (저장된 pm2 상태 복구)
  ↓
yangpyeong-web (cluster:4) + cloudflared + cron-worker 자동 시작
```

"세션 25-B handover의 '수동 기동 필요' 가설은 세션 25-C에서 무효화됨."

### 12.3 WSL2 특성 주의사항

| 특성 | 내용 | 대응 |
|------|------|------|
| Windows 재시작 시 WSL 자동 종료 | Windows 재부팅 → WSL2 종료 | systemd pm2 서비스로 자동 복구 |
| `/tmp` 휘발성 | WSL2 재시작 시 /tmp 초기화 | 영속 데이터는 /home/dev/ 또는 /etc/ 사용 |
| Windows↔WSL2 파일시스템 성능 | /mnt/e/ 접근은 ~60~70% 성능 | 프로덕션 서빙 경로는 /home/dev/ 사용 |
| NAT 환경 | WSL2 내부 IP는 Windows 재시작마다 변경 | localhost 바인딩 사용 (WSL2가 자동 포워딩) |
| 메모리 제한 | 기본 물리 메모리의 50% | `.wslconfig`에서 조정 가능 |

### 12.4 `.wslconfig` 권장 설정 (Windows 측)

```ini
# C:\Users\smart\.wslconfig
[wsl2]
memory=8GB          # 8GB 메모리 허용 (PM2 cluster:4 + PG + SeaweedFS)
processors=4        # CPU 코어 수
swap=2GB
localhostForwarding=true   # localhost:3000 Windows↔WSL2 자동 포워딩
```

---

## 13. Wave 4 할당 DQ 답변

### 13.1 DQ-14.* 배포 관련 — 안전성 vs 다운타임 허용 범위

**DQ: PM2 graceful reload가 다운타임 0을 보장하는가? 허용 가능한 다운타임 범위는?**

답변:
- PM2 graceful reload(cluster:4)는 이론적 다운타임 0을 보장한다. 4개 워커 중 1개씩 순차 재시작하며 나머지 3개가 서비스를 유지한다.
- **허용 다운타임**: 프로덕션 배포 기준 0초 (graceful reload). 롤백 기준 5초 이내 (symlink 스왑 + PM2 reload 완료까지).
- **cloudflared 재시작 시 30~40초**: Cloudflare edge propagation lag로 외부 접근 일시 불가. 이는 배포 파이프라인과 무관하며, 단순 cloud flared 재시작 시에만 발생한다.
- 배포 안전성 우선 정책: Phase 5 헬스체크 실패 시 즉시 자동 롤백. 헬스체크 없이 배포가 완료된 것으로 간주하지 않는다.

### 13.2 DQ-14.* — Canary 판정 메트릭

**DQ: Canary 배포에서 full rollout 결정을 위한 메트릭과 판정 기준은?**

답변:
- **1단계(1%)**: HTTP 에러율 0%, p95 < 500ms → 30분 관찰 후 2단계 진행
- **2단계(5%)**: HTTP 에러율 < 0.1%, p95 < 600ms → 1시간 관찰
- **3단계(25%)**: HTTP 에러율 < 0.5%, p95 < 800ms → 2시간 관찰
- **4단계(100%)**: 3단계 기준 통과 시 즉시 승격
- 판정은 SQLite `metrics_history` 테이블 기반 자동 집계 (Phase 16 구현 예정)
- 수동 개입: 운영자가 대시보드 Deployment 페이지에서 "Promote to Full" 버튼 클릭

### 13.3 DQ-OPS-2 — 배포 실패 시 자동 롤백 트리거

**DQ: 자동 롤백이 트리거되는 조건은?**

1. Phase 3 (DB 마이그레이션) 실패 → 코드 배포 중단 (symlink 변경 없음)
2. Phase 4 (PM2 reload) 실패 → 즉시 이전 symlink 복구 + PM2 reload
3. Phase 5 (헬스체크) 5회 연속 실패 → `rollback.sh` 자동 호출
4. 카나리 판정 기준 초과 → `pm2 stop luckystyle4u-canary` + Cloudflare Rule 삭제

---

## 부록 Z. 근거 인덱스 · 변경 이력

### Z.1 이 문서가 인용하는 문서

| 문서 경로 | 인용 목적 |
|----------|---------|
| `../02-architecture/01-adr-log.md` (ADR-015) | Capistrano+PM2 결정 근거 |
| `../02-architecture/05-operations-blueprint.md` | 배포 파이프라인 상세 |
| `../../../../docs/solutions/2026-04-18-cloudflare-tunnel-quic-tuning-partial-fix.md` | 세션 25-B→C 교훈 |
| `../02-architecture/04-observability-blueprint.md` | MASTER_KEY 위치 (DQ-12.3) |
| `../02-architecture/13-db-ops-blueprint.md` | cron-worker PM2 fork 모드 |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent I2 (Sonnet 4.6) | Wave 4 Tier 3 초안 — 배포 토폴로지 + Tunnel + PM2 + Canary 전체 |

### Z.3 후속 Wave 4/5 연결

- → `03-external-services-integration.md` (이 클러스터 다음 문서): B2 + Anthropic + Slack 통합
- → Phase 16 구현 시: `05-operations-blueprint.md §8` /ypserver 스킬 갭 해소와 연동
- → Phase 21 이후: Canary 자동 판정 메트릭 파이프라인 (`metrics_history` → 자동 승격 트리거)

---

> **문서 끝.** Wave 4 · I2 · 2026-04-18 · 양평 부엌 서버 대시보드 — Cloudflare Tunnel + WSL2 + PM2 배포 파이프라인 통합 계약 (총 700줄+).
