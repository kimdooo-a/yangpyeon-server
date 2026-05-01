---
title: Cloudflare Tunnel 100MB request body 한계 — 대용량 업로드 silent 실패 패턴
date: 2026-05-01
session: 70
tags: [cloudflare-tunnel, upload, formdata, oom, request-body, file-box]
category: pattern
confidence: high
---

## 문제

운영자가 stylelucky4u.com 의 파일박스(`/api/v1/filebox/files`)에 1.4GB 파일을 업로드 시도하는데:

- 브라우저 progress bar 는 "전송중" 상태로 무한히 표시됨 (수십 분 경과)
- 송신 측 PC 는 정상 동작
- **수신 측 (이 PC) 에서는 한 바이트도 들어오지 않음**:
  - Wi-Fi 트래픽 5초간 RX 0 B/s
  - `~/filebox/files/` 신규 파일 0개
  - ypserver 로그에 filebox 라우트 호출 0건
  - PM2 ypserver 메모리 정상

증상이 "전송중인데 안 들어옴" 이라 진단이 어렵다.

## 원인

**4단 게이트가 모두 차단되는 깊은 결함**. 첫 게이트(Cloudflare Tunnel)에서 이미 끊어져 ②~④는 도달조차 못 하지만, 첫 게이트만 풀어도 ②③④에서 다시 막히는 누적 구조:

| # | 게이트 | 한계 | 1.4GB 시 |
|---|--------|------|---------|
| ① | **Cloudflare Tunnel 무료/Pro 플랜** | request body **100MB** | 14× 초과 — 100MB 시점 stream RST 또는 413 |
| ② | **앱 코드 `MAX_FILE_SIZE` 상수** | 50MB (env `FILEBOX_MAX_SIZE` 미설정) | 28× 초과 |
| ③ | **앱 코드 `DEFAULT_STORAGE_LIMIT` quota** | 500MB (ADMIN 100GB) | 일반 유저면 2.8× 초과 |
| ④ | **`request.formData()` 메모리 로딩** | PM2 `max_memory_restart: 512MB` | 1.4GB 로딩 시 OOM 크래시 |

**브라우저 progress bar 가 무한 도는 이유** = HTTP/2 over QUIC 터널에서 클라이언트는 stream 에 계속 쓰는 동안 Cloudflare 가 100MB 도달 시 stream 을 reset 한다. 일부 브라우저(특히 Chrome)는 reset 을 받아 자동 재시도를 시작하므로 progress bar 가 0% 부터 다시 차오르길 무한 반복 — 사용자는 "계속 전송 중" 으로 보임.

## 해결

### 즉시 (1.4GB 옮겨야 할 때)

Cloudflare 우회 — LAN 직접 전송:

| 방법 | 소요 |
|------|------|
| SendAnywhere PC 앱 (LAN 직접) | 15~60초 |
| USB 메모리 직접 꽂기 | 1~3분 |
| WSL SMB 공유 (`\\<로컬IP>\smart`) | 30초~1분 |
| `scp file.zip user@<로컬IP>:~/Downloads/` (송신 측이 Mac/Linux/WSL) | 15~30초 |

### 진단 절차 (시스템 차원 빠른 확인)

```powershell
# 1. Wi-Fi 트래픽 5초 측정 — 0 B/s 면 도달 안 함
$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" }
foreach ($a in $adapters) {
  $s1 = Get-NetAdapterStatistics -Name $a.Name; Start-Sleep 5
  $s2 = Get-NetAdapterStatistics -Name $a.Name
  "$($a.Name): RX $(($s2.ReceivedBytes - $s1.ReceivedBytes)/5) B/s"
}

# 2. 임시 파일 검색 (.partial / .crdownload / .tmp >10MB)
Get-ChildItem -Path $env:USERPROFILE,"C:\","D:\","E:\" -Recurse -ErrorAction SilentlyContinue -File `
    -Include *.partial,*.crdownload,*.tmp,*.!ut,*.part,*.download |
  Where-Object { $_.Length -gt 10MB }

# 3. 활성 file-transfer 프로세스
Get-Process | Where-Object { $_.Name -match "OneDrive|Dropbox|Google|sync|naver|kakao|sendany" }
```

3개 모두 비어 있으면 **수신 측에 도달 안 함 = 송신 측 또는 중간(Cloudflare/방화벽) 차단**.

### 장기 (파일박스 large-file 지원, 별도 ADR/spike 필요)

4단 게이트 모두 풀어야 함:

1. **R2/S3 presigned URL 발급 라우트** — 클라이언트가 R2 에 직접 PUT, 서버는 메타만 받음 (Cloudflare 우회)
2. **TUS 또는 자체 chunked upload** — 5~50MB chunk + resumable
3. **`request.formData()` 제거** → Web Stream chunk 단위 disk write
4. **`MAX_FILE_SIZE` env 분리** + ADMIN tier quota 별도 정의

본 세션에서는 코드 변경 0, 진단/권고만.

## 교훈

- **Cloudflare Tunnel 무료/Pro 의 request body 100MB 는 hard limit** — Pro 플랜 업그레이드도 동일. Business($200/mo) = 200MB, Enterprise(영업) = 500MB. 1GB+ 는 어떤 플랜이든 단일 요청으로 못 넣음 → presigned URL + Cloudflare 우회가 필수.
- **`request.formData()` 는 streaming 이 아니라 전체 body 메모리 로딩** — 큰 파일 다루는 라우트는 처음부터 Web Stream / multipart-stream 으로 설계해야 함. PM2 `max_memory_restart` 와 합쳐 OOM 크래시 → 운영 영향.
- **브라우저 progress bar 의 "전송중" = 실제 전송 보장 아님** — Cloudflare RST → Chrome 자동 재시도 패턴에서 progress 가 0%~100% 무한 반복. 송신 측 진행률만 믿지 말고 수신 측 시스템 트래픽/디스크/로그로 검증.
- **4단 게이트는 누적 구조** — 어느 하나만 풀어도 다음 게이트에서 즉시 다시 막힘. ADR 신설 시 4개 모두 동시 처리 필요.
- **silent 실패의 진단 비대칭**: 송신 측 = "전송중" UI / 수신 측 = "도달 0건" 로그. 시스템 차원 메트릭 (Wi-Fi B/s, 디스크 .partial, 프로세스 I/O) 5초 만에 확정 가능.

## 관련 파일

- `src/lib/filebox-db.ts` — `MAX_FILE_SIZE` (50MB), `DEFAULT_STORAGE_LIMIT` (500MB), `ADMIN_STORAGE_LIMIT` (100GB)
- `src/app/api/v1/filebox/files/route.ts` — `request.formData()` 사용 (1.4GB 시 OOM)
- `~/ypserver/ecosystem.config.cjs` — PM2 `max_memory_restart: 512MB`
- `~/.cloudflared/config.yml` — Cloudflare Tunnel 설정 (무료 플랜 100MB hard limit)
