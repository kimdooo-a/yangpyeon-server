# 양평 부엌 서버 - 윈도우 부팅 후 행동 매뉴얼

## 서버 정보 요약

| 항목 | 값 |
|------|-----|
| PC 이름 | DESKTOP-KUL2BLG (양평 부엌) |
| 도메인 | stylelucky4u.com |
| WSL 사용자 | smart |
| Node.js 서버 | PM2 (dashboard) - 포트 3000 |
| 터널 | Cloudflare Tunnel (yangpyeong) |
| 터널 ID | 2e18470f-b351-46ab-bf07-ead0d1979fb9 |

## 윈도우 부팅 후 할 일

PC를 켜면 아래 순서대로 진행하세요. 보통 1~2분이면 완료됩니다.

| # | 할 일 | 상세 방법 |
|---|-------|----------|
| 1 | WSL 터미널 열기 | 시작 메뉴에서 "Ubuntu" 검색 후 클릭, 또는 PowerShell에서 `wsl` 입력 |
| 2 | 서버 상태 확인 | `pm2 status` 입력 → dashboard가 online이면 OK |
| 3 | 서버가 꺼져있다면 | `cd ~/dashboard && pm2 start npm --name dashboard -- start` |
| 4 | 터널 실행 | `cloudflared tunnel run yangpyeong` |
| 5 | 접속 테스트 | 브라우저에서 https://stylelucky4u.com 접속 확인 |

## 상세 명령어 가이드

### Step 1: WSL 터미널 열기

바탕화면이나 시작 메뉴에서 Ubuntu를 실행합니다.
또는 PowerShell/CMD에서:

```bash
wsl
# WSL Ubuntu 터미널로 진입합니다
```

### Step 2: PM2 서버 상태 확인

```bash
pm2 status
# 현재 실행 중인 프로세스 목록을 확인합니다
```

- `dashboard`가 **online**이면 정상입니다.
- **stopped** 또는 목록에 없으면 아래 명령어로 시작:

```bash
cd ~/dashboard
pm2 start npm --name dashboard -- start
# Next.js 대시보드 서버를 PM2로 시작합니다
```

로컬 테스트:

```bash
curl http://localhost:3000
# 대시보드 HTML이 나오면 성공
```

### Step 3: Cloudflare 터널 실행

```bash
cloudflared tunnel run yangpyeong
# Cloudflare Tunnel을 시작합니다 (포그라운드)
```

"Registered tunnel connection" 메시지가 4개 나오면 성공!

터널을 백그라운드로 실행하려면:

```bash
nohup cloudflared tunnel run yangpyeong &
# 터미널을 닫아도 터널이 유지됩니다
```

### Step 4: 외부 접속 테스트

브라우저에서 https://stylelucky4u.com 접속
대시보드 UI가 나오면 모든 설정이 정상입니다!

## 문제 해결 (트러블슈팅)

### PM2가 안 될 때

```bash
source ~/.nvm/nvm.sh && pm2 status
# NVM 환경 로드 후 다시 시도
```

### 터널 연결이 안 될 때

```bash
# 인증 파일 확인
ls ~/.cloudflared/2e18470f-b351-46ab-bf07-ead0d1979fb9.json
# 파일이 있어야 합니다

# 설정 파일 확인
cat ~/.cloudflared/config.yml
# tunnel ID와 ingress 설정 확인
```

### 사이트 접속이 안 될 때

1. PM2 서버가 실행 중인지 확인 (`pm2 status`)
2. cloudflared 터널이 실행 중인지 확인
3. 로컬에서 `curl http://localhost:3000` 확인
4. Cloudflare 대시보드에서 DNS 레코드 확인

### 서버 완전 재시작

```bash
pm2 restart dashboard
# Next.js 대시보드 서버 재시작
```

### 대시보드 업데이트 후 재배포

```bash
cd ~/dashboard
npm run build
pm2 restart dashboard
```

## 자동 시작 설정 (선택)

매번 수동으로 터널을 실행하기 귀찮다면, systemd 서비스로 등록하세요:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
# cloudflared를 시스템 서비스로 등록합니다
```

이렇게 하면 WSL이 시작될 때 자동으로 터널이 열립니다.
PM2는 이미 systemd 서비스로 등록되어 있어서 자동 시작됩니다.

## 전체 구조

```
Windows 11 → WSL2 Ubuntu → PM2 + Next.js → Cloudflare Tunnel → stylelucky4u.com

외부 사용자 요청 → Cloudflare Edge (인천) → Tunnel (QUIC) → localhost:3000 → Next.js 대시보드
```
