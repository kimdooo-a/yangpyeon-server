# 양평 부엌 서버 — 부팅 / 종료 운영 매뉴얼

> 최종 개정: 2026-05-01 (세션 70+, 멀티테넌트 BaaS 전환 + standalone 모드 + WSL 네이티브 빌드 반영)
> 이전 매뉴얼은 단일 사용자 도구(`dashboard`) 시절 기준이었으며, 본 개정에서 다음을 반영했습니다.
> - PM2 앱명 `dashboard` → `ypserver` (standalone)
> - 디렉토리 `~/dashboard` → `~/ypserver` (운영) / `~/dev/ypserver-build/` (빌드)
> - 기동 명령 `pm2 start npm -- start` → `pm2 start ecosystem.config.cjs`
> - cloudflared 별도 실행 → PM2 통합 관리 (id 1)
> - 업데이트 절차 → `wsl-build-deploy.sh` (NFT 크로스플랫폼 함정 회피)
> - **종료 절차 신규 추가** (시나리오 A~D)

## 서버 정보 요약

| 항목 | 값 |
|------|-----|
| PC 이름 | DESKTOP-KUL2BLG (양평 부엌) |
| 도메인 | stylelucky4u.com (운영 콘솔) + `/api/v1/t/<tenant>/*` (컨슈머) |
| WSL 사용자 | smart |
| 운영 디렉토리 | `~/ypserver/` (Linux ext4) |
| 빌드 워크트리 | `~/dev/ypserver-build/` (Linux ext4) |
| 소스 원본 | `/mnt/e/00_develop/260406_luckystyle4u_server` (Windows NTFS) |
| Next.js 모드 | standalone (`server.js` 직접 실행) — 포트 3000 |
| PM2 앱 | `ypserver` (id 2), `cloudflared` (id 1), `pm2-logrotate` (모듈) |
| 터널 ID | 2e18470f-b351-46ab-bf07-ead0d1979fb9 |
| 첫 컨슈머 | Almanac (`/api/v1/t/almanac/*`) — 다운타임 시 영향 |

## 윈도우 부팅 후 할 일

PC를 켜면 아래 순서대로 진행하세요. 보통 1~2분이면 완료됩니다.
PM2가 systemd에 등록되어 있다면 대부분 자동으로 올라옵니다 — `Step 2`만 확인하면 끝입니다.

| # | 할 일 | 명령어 |
|---|-------|--------|
| 1 | WSL 터미널 열기 | 시작 메뉴 → "Ubuntu" 또는 PowerShell에서 `wsl` |
| 2 | PM2 상태 확인 | `pm2 list` → `ypserver`, `cloudflared` 둘 다 `online` 이면 OK |
| 3 | 서버가 멈춰 있을 때 | `pm2 start ypserver && pm2 start cloudflared` |
| 4 | 자동 복원 (PM2 자체가 빈 목록) | `pm2 resurrect` |
| 5 | 접속 테스트 | 브라우저에서 https://stylelucky4u.com 접속 확인 |

## 상세 명령어 가이드

### Step 1: WSL 터미널 열기

```bash
wsl
# WSL Ubuntu 터미널로 진입합니다 (nvm PATH가 자동 로드되는 login shell)
```

> **주의**: PowerShell에서 한 줄로 실행하려면 반드시 interactive login 셸을 써야 nvm 경로가 잡힙니다.
> ```powershell
> wsl -d Ubuntu -- bash -ilc 'pm2 list'
> ```
> `bash -lc` (login만), `bash -c` (둘 다 안 함) 으로는 `pm2: command not found` 가 납니다.

### Step 2: PM2 상태 확인

```bash
pm2 list
# 현재 실행 중인 프로세스 목록을 확인합니다
```

정상 상태:

```
┌────┬────────────────┬─────────┬─────────┬──────────┬─────────┐
│ id │ name           │ mode    │ status  │ uptime   │ restart │
├────┼────────────────┼─────────┼─────────┼──────────┼─────────┤
│ 1  │ cloudflared    │ fork    │ online  │ ...      │ ...     │
│ 2  │ ypserver       │ fork    │ online  │ ...      │ ...     │
└────┴────────────────┴─────────┴─────────┴──────────┴─────────┘
```

- 둘 다 `online` 이면 정상.
- 한쪽만 `stopped` / `errored` 이면 → Step 3.
- 목록 자체가 비어 있으면 → Step 4 (PM2 데몬 재기동 후 resurrect).

### Step 3: 서버가 멈춰 있을 때 (개별 기동)

```bash
# ypserver만 멈춰 있을 때
pm2 start ypserver

# cloudflared만 멈춰 있을 때
pm2 start cloudflared

# 둘 다 (외부 트래픽이 살아 있도록 ypserver 먼저 → cloudflared)
pm2 start ypserver && pm2 start cloudflared
```

PM2 목록에 항목이 아예 없을 때 (예: `pm2 delete` 후 복원이 필요한 상황):

```bash
# ypserver 신규 등록
cd ~/ypserver && pm2 start ecosystem.config.cjs

# cloudflared 신규 등록
pm2 start /usr/local/bin/cloudflared --name cloudflared -- tunnel run

# 등록 후 영구 저장 (재부팅 자동 복원용)
pm2 save
```

로컬 검증:

```bash
curl -sI http://localhost:3000 | head -3
# HTTP/1.1 200 또는 308 이면 ypserver 살아 있음
```

### Step 4: 자동 복원

```bash
pm2 resurrect
# pm2 save 로 저장된 마지막 프로세스 목록을 복원합니다
```

### Step 5: 외부 접속 테스트

```bash
# 운영 콘솔
curl -sI https://stylelucky4u.com | head -3

# 첫 컨슈머 (Almanac) 헬스
curl -s https://stylelucky4u.com/api/v1/t/almanac/health
```

브라우저에서 https://stylelucky4u.com 접속해 운영 콘솔 UI가 뜨면 모든 설정이 정상입니다.

---

## 서버 종료 방법 (시나리오별)

> **종료 영향**: `ypserver` 가 멈추면 stylelucky4u.com 운영 콘솔 + 모든 컨슈머(Almanac 등)의 백엔드 호출이 즉시 중단됩니다. 작업 직전 Almanac 등 컨슈머 측 사용자 활동 여부를 한번 확인하세요.
>
> **순서 원칙**: 외부 트래픽 입구인 `cloudflared` 를 먼저 끊은 뒤 `ypserver` 를 멈추면 종료 중 502/half-open 에러가 안 생깁니다. 재기동은 역순 (`ypserver` → `cloudflared`).

### 시나리오 A — 잠깐 멈췄다가 재기동 (배포·디버깅용, 가장 흔함)

PM2 목록·자동복구 설정은 유지됩니다. `pm2 start <name>` 한 번이면 부활.

```bash
# ypserver만 잠시 정지 (외부 터널은 살아 있어 502 페이지가 노출됨)
pm2 stop ypserver

# 재기동
pm2 start ypserver
```

> **graceful shutdown**: `ecosystem.config.cjs` 의 `kill_timeout: 8000` 설정에 따라 `pm2 stop` 후 최대 8초 동안 in-flight 요청을 처리한 뒤 종료됩니다. 즉시 사라지지 않아도 정상이며, `pm2 logs ypserver --lines 30` 으로 확인할 수 있습니다.

### 시나리오 B — 외부 트래픽까지 완전 차단 (점검 모드)

```bash
# 1. 입구 차단
pm2 stop cloudflared

# 2. 앱 정지
pm2 stop ypserver

# 재기동 (역순 — 앱이 살아 있는 상태에서 입구를 연다)
pm2 start ypserver
pm2 start cloudflared
```

점검 중 외부에 503/유지보수 페이지를 띄우고 싶다면 cloudflared 는 살린 상태에서 ypserver 만 멈추면 Cloudflare 가 자동으로 502/error 를 반환합니다.

### 시나리오 C — PM2 목록에서 영구 제거 (서버 운영 자체 종료)

PM2 자동 시작도 풀어 재부팅해도 살아나지 않게 합니다.

```bash
# 1. 프로세스 제거
pm2 delete ypserver cloudflared

# 2. 저장된 부팅 목록 갱신 (resurrect 시 빈 목록)
pm2 save

# 3. systemd 자동 시작까지 끄려면
pm2 unstartup systemd
# → 안내 문구가 나오면 그대로 sudo 명령 한 줄 복사·실행
```

> **복구 방법**: 다시 운영하려면 Step 3 의 "신규 등록" 명령으로 ypserver / cloudflared 를 다시 등록하고 `pm2 save && pm2 startup systemd` 까지 수행합니다.

### 시나리오 D — WSL 자체를 내림 (PC 종료 직전 또는 WSL 재부팅)

```powershell
# Windows PowerShell에서
wsl --shutdown
```

- PM2 데몬도 같이 죽고, 다음 WSL 부팅 시 systemd 가 PM2 를 띄우면서 `pm2 resurrect` 가 자동으로 마지막 저장 상태를 복원합니다.
- `pm2 save` 가 한 번도 호출된 적 없으면 자동 복원이 안 되므로, 정상 운영 중 변경 후엔 항상 `pm2 save` 로 잠가두세요.

### 시나리오 E — PC 자체를 종료/재부팅

1. (선택) Almanac 등 컨슈머 측 사용자 활동 여부 확인
2. WSL 안에서 `pm2 save` 로 현재 상태 저장
3. `wsl --shutdown` (시나리오 D)
4. Windows 종료/재부팅
5. 재부팅 후 `Step 1~2` 수행 — systemd 가 자동으로 PM2 를 띄우면 `pm2 list` 만 확인하면 끝

---

## 코드 업데이트 후 재배포 (NFT 크로스플랫폼 함정 회피)

> ⚠️ **절대로 Windows 측에서 `npm run build` 하지 마세요.**
> Windows 의 `next build` 는 NFT(Node File Trace) 가 standalone 산출물의 `.next/node_modules/<pkg>-<hash>/` 안에 Windows `.node` 바이너리를 끼워 넣어, Linux 런타임에서 `dlopen` 시 `invalid ELF header` 로 크래시합니다 (세션 52, 2026-04-25 진단). 빌드는 반드시 WSL ext4 에서 수행합니다.

표준 배포 절차 — **WSL 안에서** 한 줄:

```bash
bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/wsl-build-deploy.sh
```

이 스크립트가 자동으로 수행하는 단계:

| 단계 | 작업 |
|------|------|
| 1/8 | Windows 워킹트리 → `~/dev/ypserver-build/` 동기화 (rsync) |
| 2/8 | `npm ci` (lockfile 엄격, 실패 시 `npm install` 폴백) |
| 3/8 | `next build` (Linux 네이티브) |
| 4/8 | `pack-standalone.sh` — 5개 부속 (ecosystem/install-native-linux/start.sh 등) 결합 |
| 5/8 | `~/ypserver/` 로 rsync (`.env` / `data/` / `logs/` 보존) |
| 6/8 | Drizzle 마이그레이션 적용 (ADR-021 빌드타임 게이트) |
| 7/8 | 스키마 검증 (실패 시 PM2 reload 차단) |
| 8/8 | `pm2 restart ypserver --update-env` + `pm2 save` |

배포 직후 검증:

```bash
pm2 logs ypserver --lines 30
curl -sI http://localhost:3000 | head -3
```

---

## 문제 해결 (트러블슈팅)

### `pm2: command not found`

비-로그인 셸에서 nvm PATH 가 안 잡힌 경우입니다.

```bash
source ~/.nvm/nvm.sh && pm2 list
# 또는
wsl -d Ubuntu -- bash -ilc 'pm2 list'   # Windows 측에서 한 줄로
```

### `ypserver` 가 즉시 errored / restart 폭주

```bash
pm2 logs ypserver --err --lines 50
# 가장 흔한 원인:
# - .env 누락/오타 → ~/ypserver/.env 확인
# - DB 마이그레이션 미적용 → wsl-build-deploy.sh 재실행
# - 포트 3000 충돌 → ss -ltnp | grep 3000
```

`invalid ELF header` 가 보이면 NFT 함정입니다 — Windows 측에서 빌드한 산출물이 섞인 상태이므로 `wsl-build-deploy.sh` 로 재배포하면 즉시 해결됩니다.

### 터널 연결이 안 될 때

```bash
# 인증 파일 확인
ls ~/.cloudflared/2e18470f-b351-46ab-bf07-ead0d1979fb9.json

# 설정 파일 확인
cat ~/.cloudflared/config.yml

# PM2 cloudflared 로그
pm2 logs cloudflared --lines 50
```

"Registered tunnel connection" 메시지가 4개 모두 보여야 정상입니다.

### 사이트 접속이 안 될 때 (체크리스트)

1. `pm2 list` → `ypserver`, `cloudflared` 둘 다 online?
2. `curl -sI http://localhost:3000` → 200/308?
3. `pm2 logs cloudflared --lines 30` → "Registered tunnel connection" 4개?
4. Cloudflare 대시보드 → DNS 레코드 + Tunnel 상태 healthy?
5. 방화벽/네트워크 일시 차단 여부 (드물게 KT/SKT 망 이슈)

### 서버 완전 재시작 (코드 변경 없음)

```bash
pm2 restart ypserver --update-env
# .env 변경 사항을 같이 반영하려면 --update-env 필수
```

---

## 자동 시작 설정 상태

현재 운영 PC 는 PM2 가 systemd 에 등록되어 있어 WSL 부팅 시 `ypserver`, `cloudflared` 가 자동 복원됩니다.

만약 새 PC 로 이전하거나 자동 시작이 풀렸다면:

```bash
# PM2 systemd 등록 (한 번만)
pm2 startup systemd
# → 출력되는 sudo 명령 한 줄 복사·실행

# 현재 프로세스 목록을 부팅 시 복원할 상태로 저장
pm2 save
```

---

## 전체 구조

```
Windows 11
  └─ WSL2 Ubuntu (smart)
       ├─ systemd → PM2 데몬
       │             ├─ id 1: cloudflared (tunnel run)        ┐
       │             ├─ id 2: ypserver (~/ypserver/server.js) │
       │             └─ module: pm2-logrotate                 │
       │                                                      │
       └─ ~/dev/ypserver-build/ (빌드 전용 ext4 워크트리)     │
                                                              │
Cloudflare Edge (인천)  ◀──── QUIC 터널 ────────────────────┘
       │
       └─ stylelucky4u.com → 운영 콘솔 (Next.js)
                          → /api/v1/t/almanac/* (Almanac 컨슈머)
                          → /api/v1/t/<tenant>/* (향후 컨슈머)
```

## 연관 문서

- `CLAUDE.md` — 운영 정책, 마이그레이션 직접 적용 규칙
- `docs/research/baas-foundation/01-adrs/` — ADR-022~029 (멀티테넌트 BaaS 전환 결정)
- `scripts/wsl-build-deploy.sh` — WSL 네이티브 빌드/배포 자동화
- `~/ypserver/ecosystem.config.cjs` — PM2 기동 설정 (graceful shutdown 8초)
- `memory/project_standalone_reversal.md` — standalone 모드 재도입 (2026-04-19 세션 3)
