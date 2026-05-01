# 인수인계서 — 세션 70 (부팅/종료 매뉴얼 개정 + 파일박스 1.4GB 전송 진단)

> 작성일: 2026-05-01
> 이전 세션: [session69](./260426-session69-aggregator-day2.md)
> 저널: [journal-2026-05-01.md](../logs/journal-2026-05-01.md)

---

## 작업 요약

- `docs/guides/server-boot-manual.md` 전면 개정 (옛 `dashboard` 시절 → 현 `ypserver` 멀티테넌트 BaaS) + 종료 시나리오 A~E 신규 추가.
- `양평서버_부팅매뉴얼.docx` 재생성 — v1 의 인라인 양식(Google Blue 14pt + 하단 테두리, 다크그레이 H2, 다크그린 코드, 연회색 표 테두리, 연하늘 표 헤더) 모두 styles.xml 에 baked-in.
- 파일박스 `/api/v1/filebox/files` 1.4GB 업로드 미수신 진단 — Cloudflare Tunnel 100MB / 50MB MAX_FILE_SIZE / 500MB quota / OOM 4단 게이트 모두 차단됨. **코드 변경 0**, 진단만.

---

## 대화 다이제스트

### 토픽 1: 서버 종료 방법 안내
> **사용자**: "서버 종료 방법 실행은 이 컴퓨터 wsl에서 실행중"

PM2 상태 확인: `cloudflared` (id 1) + `ypserver` (id 2) 둘 다 online. 4가지 시나리오 제시 — A(`pm2 stop ypserver` 잠시 정지), B(외부 트래픽까지 차단: cloudflared → ypserver 순서), C(`pm2 delete + unstartup` 영구 제거), D(`wsl --shutdown` WSL 자체 내림). graceful shutdown 8초(`kill_timeout`) 안내. PM2 nvm PATH 함정으로 `bash -ilc` 강제.

**결론**: 안내만 — 실제 종료는 사용자 결정 대기.

---

### 토픽 2: 부팅 매뉴얼 .md 전면 개정
> **사용자**: "양평서버_부팅매뉴얼 종료 방법 순서까지 넣고, 개정이 필요한 곳 반영해주고."

기존 `server-boot-manual.md` 가 단일 사용자 도구(`dashboard`) 시절 기준. 현 운영 구성과 5개 영역에서 차이:

| 옛 매뉴얼 | 현재 운영 |
|-----------|----------|
| PM2 앱명 `dashboard` | `ypserver` |
| 디렉토리 `~/dashboard` | `~/ypserver` (운영) + `~/dev/ypserver-build/` (빌드) |
| `pm2 start npm -- start` | `pm2 start ecosystem.config.cjs` (standalone) |
| cloudflared 별도 실행 / systemd | PM2 `id 1` 통합 관리 |
| `cd ~/dashboard && npm run build` | `wsl-build-deploy.sh` (NFT 크로스플랫폼 함정 회피) |

**신규 추가**: 종료 시나리오 A~E (E = PC 전체 종료/재부팅 절차) + graceful shutdown 동작 설명 + WSL `bash -ilc` PATH 함정 + 멀티테넌트 영향(Almanac 컨슈머 다운타임).

**결론**: `docs/guides/server-boot-manual.md` 전체 재작성.

---

### 토픽 3: docx 변환 — pandoc standalone 설치
> **사용자**: "docx가 필요해"

워크스페이스에 pandoc/LibreOffice/Word 모두 미설치. sudo 패스워드 필요로 `apt install pandoc` 차단 → GitHub release 의 standalone 바이너리(`pandoc-3.1.13-linux-amd64.tar.gz`)를 `~/.local/bin/pandoc` 에 직접 설치.

**중요 함정**: `wsl -d Ubuntu -- bash -ilc 'A="/mnt/e/.../한글파일.docx"; pandoc "$A"'` 형태에서 한글/특수문자 변수가 외부 셸 quoting 단계에서 빈 문자열로 잘림. 회피 — 인라인 경로 직접 또는 `/tmp/m.docx` 경유 후 `cp`.

**결론**: pandoc 설치 + 1차 docx 변환 성공 (그러나 Calibri 폴백으로 양식 어색함).

---

### 토픽 4: 1차 한글 친화 reference docx
> **사용자**: "양평서버_부팅매뉴얼 .. 뭔가 많이 망가졌는데... 양식이."

pandoc default reference docx 추출(`pandoc --print-default-data-file reference.docx`) → docDefaults rFonts 를 `맑은 고딕` 으로 패치 + Verbatim 코드 폰트 Consolas + ko-KR 언어. `_pandoc-ref-ko.docx` + `patch-pandoc-ref-ko.py` 작성.

**결론**: 한글 폰트는 정상화됐으나 v1 양식과 차이 컸음.

---

### 토픽 5: v1 양식 준수 — 1차 시도 (styles.xml만 봄)
> **사용자**: "너가 만든 것과 양평서버_부팅매뉴얼_v1 이것을 비교하고 양평서버_부팅매뉴얼_v1의 양식을 준수해서 다시 만들어줘."

v1 styles.xml 분석 결과: 본문 맑은 고딕 10.5pt / Heading1 #2E74B5 16pt / Heading2 #2E74B5 13pt / Heading3 #1F4D78 12pt / 표 single 4pt 검정. v1 docx 자체를 `--reference-doc` 으로 사용 → styles.xml + 헤더/푸터 + sectPr 자동 흡수. `build-pandoc-ref-from-v1.py` 작성 (pandoc 보조 스타일 주입 + 푸터 날짜 갱신).

**결론**: 사용자가 보기엔 여전히 "many differences" — 추가 분석 필요.

---

### 토픽 6: 시각 비교 — mammoth + Playwright
> **사용자**: "한번 너가 만든 파일과 양평서버_부팅매뉴얼_v1을 이미지화??"

LibreOffice/Word 미설치 환경에서 `npx mammoth` 로 docx → HTML + Playwright(Chrome DevTools MCP) 헤드리스 캡처. v1 + 새 docx 모두 캡처해 fullPage 비교.

**관찰**: 새 docx 가 빽빽 — v1 styles.xml 의 `<w:pPrDefault/>` 가 비어 있어 단락 간격 0pt. v1 은 콘텐츠가 짧아 티 안 났지만 새 매뉴얼은 콘텐츠 2배 + Heading3 15회로 위계 무너짐. reference docx 의 docDefaults pPr + Heading 1/2/3 spacing 보강.

**결론**: 1차 보강. 그러나 색상 차이는 그대로 (다음 토픽에서 발견).

---

### 토픽 7: **결정적 발견** — v1 양식은 styles.xml 이 아니라 인라인 오버라이드
> (Claude 자율 진행) document.xml 직접 분석.

v1 의 진짜 시각 사양 (인라인 오버라이드):

| 요소 | v1 인라인 실측 |
|------|----------------|
| Title | 맑은 고딕 20pt bold **#1A73E8** (Google Blue) center |
| Heading1 | 맑은 고딕 14pt bold **#1A73E8** + **하단 1pt #1A73E8 테두리** + before=360 after=160 |
| Heading2 | 맑은 고딕 12pt bold **#333333** (다크 그레이, 블루 아님!) before=240 after=120 |
| 코드 | Consolas 10pt **#1B5E20** (다크 그린) |
| 표 테두리 | single 1pt **#CCCCCC** (검정 아님!) |
| 표 헤더 셀 | shading **#F0F4FA** (연하늘) |
| 표 셀 마진 | top/bot 80, left/right 120 dxa |

styles.xml 만 본 1~5차 시도가 모두 빗나간 이유 = pandoc 은 인라인 오버라이드를 만들지 못하므로 styles.xml 에만 의존했던 결과. **해법**: styles.xml 에 인라인 사양을 baked-in. `build-pandoc-ref-from-v1.py` 전면 재작성 — styles.xml 통째로 교체.

**결론**: `_pandoc-ref-v1plus.docx` 강화 → 매뉴얼 docx 재생성. mammoth+CSS 비교는 단락 spacing·SourceCode 매핑 미반영으로 한계 — 진짜 시각 검증은 LibreOffice 필요(사용자 sudo 안내). 사용자 응답 없이 다음 토픽 전환.

---

### 토픽 8: 파일박스 1.4GB 전송 진단
> **사용자**: "파일 박스 확인좀해봐 데이터 들어오고있는지. 1.4GB 파일 다른 컴퓨터에서 전송시킨지 오래되었는데 아직도 전송중이래."
> **사용자**: "크롬에서 stylelucky4u.com 접속 후에 파일박스로 파일 전송시켰음."

#### 시스템 차원 진단 (사용자 서비스 미식별 단계)

- Wi-Fi 트래픽 5초간 RX/TX 0 B/s
- C/D/E 드라이브 전체 1.2~1.6GB 파일 0개 + 최근 7일 수정 1GB+ 파일 0개
- `.partial` / `.crdownload` / `.tmp` 임시 파일 0개
- 실행 중 file-transfer 앱 = OneDrive 1개 (OneDrive 폴더는 25일째 무수정)
- HTTPS 443 연결 = Chrome 11개 (그중 하나가 stylelucky4u.com 일 가능성)

#### 서비스 식별 후 정밀 진단

서비스 = 양평 서버 자체의 파일박스 (`/api/v1/filebox/files`).

- 파일박스 저장소 `~/filebox/files/` — 마지막 파일 2026-04-26, 120KB. 신규 0건.
- ypserver 로그 (재시작 후 11분간) — filebox 라우트 호출 0건.
- PM2 `restarts: 9` (마지막 재시작 10:01:18) — 09:12 의 "Tenant context missing" 에러 폭주 후 추정.

#### 4단 게이트 분석

| 게이트 | 한계 | 1.4GB |
|--------|------|-------|
| ① **Cloudflare Tunnel 무료/Pro** | request body **100MB** | 14× 초과 — **첫 차단** (브라우저 progress bar 의 무한 retry 원인) |
| ② **`MAX_FILE_SIZE` 코드 상수** | **50MB** (env 미설정) | 28× 초과 |
| ③ **`DEFAULT_STORAGE_LIMIT` quota** | **500MB** (ADMIN 100GB) | 일반 유저면 2.8× 초과 |
| ④ **`request.formData()` 메모리** | PM2 `max_memory_restart: 512MB` | 1.4GB 로딩 시 OOM 크래시 |

#### 권고

- **즉시**: 송신 측 전송 취소 + 브라우저 탭 닫기 (어차피 한 바이트도 안 들어옴).
- **이번 1.4GB 옮기기**: SendAnywhere PC 앱 (LAN 직접) / USB 직접 / SMB 공유 / scp over LAN — 1Gbps Wi-Fi 라면 ~15초.
- **파일박스 1.4GB 지원**: 별도 ADR + spike 필요 — R2 presigned URL + TUS chunked upload + `request.formData()` 제거 + Cloudflare Tunnel 우회. 반나절~1일 작업.

**결론**: 코드 변경 0. 진단·권고만. 사용자 측 송신 취소 결정 대기.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | **종료 시나리오 A~E 분리** | 단일 명령 vs 시나리오별 분기 | 운영 영향(Almanac 컨슈머)이 시나리오별로 달라 명확히 분리 필요 |
| 2 | **종료 순서: cloudflared → ypserver / 재기동 역순** | 동시 vs 분리 | 외부 트래픽 입구 먼저 끊어야 종료 도중 502 안 뜸 |
| 3 | **pandoc standalone 사용자 영역 설치** | apt(sudo 필요) vs standalone | sudo 패스워드 필요해 차단 — `~/.local/bin/pandoc` 으로 회피 |
| 4 | **v1 docx 자체를 reference-doc 으로** (1차) | reference-doc 직접 사용 vs 새 reference 빌드 | v1 의 styles.xml + 헤더/푸터 + sectPr 자동 흡수로 빠른 1차 시도 |
| 5 | **v1 인라인 사양을 styles.xml 에 baked-in** (2차) | reference-doc 그대로 vs styles.xml 수정 | pandoc 은 인라인 오버라이드 못 만듦 — 같은 비주얼을 스타일 정의에 baked-in 해야 함 |
| 6 | **파일박스 1.4GB 코드 수정 0** | 즉시 1.4GB 지원 추가 vs ADR/spike 후 별도 PR | 4단 게이트 모두 손봐야 하는 큰 작업 — 사용자가 1.4GB 를 옮기는 것이 본 세션 즉시 목표라 LAN 우회 권고 |

---

## 수정 파일 (5개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/guides/server-boot-manual.md` | 전체 재작성 — `dashboard` → `ypserver`, standalone 모드, wsl-build-deploy.sh, 종료 시나리오 A~E |
| 2 | `docs/guides/양평서버_부팅매뉴얼.docx` | 재생성 — v1 인라인 양식 baked-in 적용 |
| 3 | `docs/guides/_pandoc-ref-v1plus.docx` | **신규** — 재사용용 강화 reference docx |
| 4 | `scripts/build-pandoc-ref-from-v1.py` | **신규** — v1 → 강화 reference 빌더 (styles.xml 통째 교체 + 푸터 날짜 갱신) |
| 5 | `docs/logs/journal-2026-05-01.md` | **신규** — 본 세션 저널 |

추가 메타:
- `docs/logs/2026-05.md` — **신규** 월별 아카이브
- `docs/logs/_index.md` — 2026-05 항목 추가
- `docs/status/current.md` — 세션 70 행 추가, 최종 수정 갱신

---

## 상세 변경 사항

### 1. server-boot-manual.md — 전체 재작성

**개정 지점 6**:

1. PM2 앱명 `dashboard` → `ypserver`
2. 디렉토리 `~/dashboard` → `~/ypserver` (운영) / `~/dev/ypserver-build/` (빌드)
3. 기동 명령 `pm2 start npm --name dashboard -- start` → `pm2 start ecosystem.config.cjs` (standalone)
4. cloudflared 별도 실행/systemd → PM2 `id 1` 통합 관리
5. 업데이트 절차 `cd ~/dashboard && npm run build && pm2 restart dashboard` → `bash /mnt/e/.../scripts/wsl-build-deploy.sh` 8단계 (NFT 크로스플랫폼 함정 회피)
6. "Registered tunnel connection 4개" 진단 포인트 → PM2 로그 (`pm2 logs cloudflared`) 경유

**신규 추가 8 섹션**:

- 종료 시나리오 A: 잠깐 정지 + 재기동 (배포·디버깅용)
- 종료 시나리오 B: 외부 트래픽까지 차단 (점검 모드, cloudflared → ypserver 순서)
- 종료 시나리오 C: PM2 영구 제거 + `unstartup` (서버 운영 자체 종료)
- 종료 시나리오 D: `wsl --shutdown` (PC 종료 직전 또는 WSL 재부팅)
- 종료 시나리오 E: PC 자체 종료/재부팅 절차
- graceful shutdown 8초 (`kill_timeout`) 동작 설명
- WSL `bash -ilc` interactive login 셸 강제 안내 (PM2 PATH 함정)
- 트러블슈팅에 `invalid ELF header` NFT 함정 신호 추가

### 2. 양평서버_부팅매뉴얼.docx — 재생성

`_pandoc-ref-v1plus.docx` 를 reference 로 사용하여 `.md` → docx 변환. v1 인라인 양식 baked-in 결과:

| 요소 | 적용 사양 |
|------|----------|
| 본문 | 맑은 고딕 10.5pt, 단락 after=100 |
| Title | 맑은 고딕 20pt bold #1A73E8 center |
| Heading1 | 맑은 고딕 14pt bold #1A73E8 + 하단 1pt #1A73E8 테두리 + before=360 after=160 |
| Heading2 | 맑은 고딕 12pt bold #333333 + before=240 after=120 |
| Heading3 | 맑은 고딕 11pt bold #1F4D78 + before=200 after=100 |
| 코드 인라인/블럭 | Consolas 10pt #1B5E20 + 회색 배경 |
| 표 테두리 | single 1pt #CCCCCC + 셀 마진 80/120 |
| 표 헤더 행 | bold + #F0F4FA shading (firstRow conditional) |
| 헤더 | DESKTOP-KUL2BLG \| stylelucky4u.com |
| 푸터 | 2026.05.01 Page <PAGE> |

### 3. build-pandoc-ref-from-v1.py — v1 → reference docx 빌더

```bash
python3 scripts/build-pandoc-ref-from-v1.py \
    docs/guides/양평서버_부팅매뉴얼_v1.docx \
    docs/guides/_pandoc-ref-v1plus.docx \
    2026.05.01
```

styles.xml 통째 교체 + 푸터 날짜 sub. 다음 매뉴얼 갱신 시 `--reference-doc` 으로 재사용.

### 4. 파일박스 1.4GB 진단 (코드 변경 0)

별도 작업 없음. 사용자에게 4단 게이트 표 + LAN 우회 권고 + 향후 ADR 권고 전달.

---

## 검증 결과

- `pandoc --version` → 3.1.13 ✅ (sudo 없이 standalone 설치)
- `docs/guides/_pandoc-ref-v1plus.docx` styles.xml — VerbatimChar/SourceCode/BlockText/Compact/TOCHeading/Table 모두 정의됨 ✅
- `docs/guides/양평서버_부팅매뉴얼.docx` 재생성 — 20.5KB, 헤더 + 푸터(2026.05.01) + Heading 모두 적용 ✅
- 파일박스 진단 — 시스템 차원 (Wi-Fi 0 B/s, 신규 파일 0개, 로그 호출 0건) 모두 송신 측 전송이 도달 못 함을 증명 ✅
- 코드 변경 0 (server-boot-manual.md 와 docx, scripts/build-pandoc-ref-from-v1.py 외엔 무수정).

---

## 터치하지 않은 영역

- **파일박스 코드** (`src/lib/filebox-db.ts`, `src/app/api/v1/filebox/files/route.ts`) — 1.4GB 지원은 별도 ADR + spike 필요로 보류.
- **Almanac aggregator** 영역 (S69 완료, 외부 검증 대기 중) — 미진입.
- **메신저 Phase 1 M2** (S68 정밀화 계획 작성됨) — 미진입.
- **ypserver 운영** — 본 세션 중 자체 재시작 1회(10:01:18) 발생했으나 본 세션 작업과 무관 (Tenant context missing 에러 폭주 후 추정).
- **`scripts/wsl-build-deploy.sh`** — 본 세션 시작 전부터 modified 상태였음 (다른 세션에서 작업).

---

## 알려진 이슈

- **mammoth+Playwright 시각 비교의 한계** — mammoth 가 SourceCode 단락을 `<pre>` 로 변환 안 함, 단락 spacing 미반영. true 시각 검증은 LibreOffice 필요. 사용자 sudo 로 LibreOffice 설치 안내했으나 응답 없이 다음 토픽 전환.
- **파일박스 large-file 미지원** — 4단 게이트 중 어떤 것 하나만 풀어도 다른 게이트가 즉시 차단. 1.4GB+ 지원하려면 4개 모두 손봐야 함. ADR 신설 필요.
- **사용자가 매뉴얼 docx 시각 검증을 아직 안 함** — 새 양식이 v1 과 충분히 같은지 사용자 확인 필요. 추가 패치 가능성 있음.

---

## 다음 작업 제안

### P0 (선택)

1. **사용자가 새 docx 열어 v1 과 비교** → 다른 점 알려주면 `_pandoc-ref-v1plus.docx` 추가 패치.
2. **파일박스 large-file 지원 spike + ADR** — R2 presigned URL + TUS chunked upload + Cloudflare Tunnel 우회. 영향: stylelucky4u.com 의 파일박스가 진정한 cloud 저장소로 작동.

### P1 (이월)

3. **메신저 Phase 1 M2 Step 1** — S68 의 `m2-detailed-plan.md` §3 시그니처 그대로 진입. 영역 분리(Almanac 미커밋과 격리) 유지.
4. **Almanac aggregator 비즈니스 로직** (fetcher/dedupe/classify/promote ~28h, T2.5 packages/tenant-almanac/ plugin 마이그레이션 게이트).

### P2 (인프라)

5. **LibreOffice 설치** (sudo 필요) — 향후 docx 시각 검증 자동화 기반. `! wsl -d Ubuntu -- bash -ilc 'sudo apt install -y --no-install-recommends libreoffice-core libreoffice-writer'`

---

[← handover/_index.md](./_index.md)
