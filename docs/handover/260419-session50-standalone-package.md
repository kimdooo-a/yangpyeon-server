# 인수인계서 — 세션 50 (Next.js standalone 실행 패키지 + WSL 프로덕션 배포 전환)

> 작성일: 2026-04-19
> 이전 세션: [session49](./260419-session49-s49b-plan-expansion-phase16a-deploy.md)

---

## 작업 요약

Next.js 16 `output: "standalone"` 모드를 **세션 3에서 제거했던 결정을 역전하여 재도입**. 빌드 산출물 → `standalone/` 디렉토리로 정돈 복사하는 `scripts/pack-standalone.sh` 자동화 작성. WSL 배포 절차(Windows 네이티브 → Linux 네이티브 교체 스크립트 + PM2 ecosystem + 환경변수 템플릿 + README) 일괄 제공. 사용자 WSL에서 실측 배포하여 기존 `dashboard` PM2 프로세스를 새 `ypserver`로 **무사고 교체**, HTTP 200 OK / Ready in 0ms 확인. 이후 세션 49에서 준비된 Capistrano 배포 자동화(16b)로의 이행 대신, "standalone 패키지 기반 rsync + pm2 reload" 간소 운영 경로를 실증.

## 대화 다이제스트

### 토픽 1: standalone 실행 패키지 생성 요청
> **사용자**: "E:\00_develop\260406_luckystyle4u_server\standalone ... 실행 패키지 만들어줘."

**상황 분석**:
- `standalone/` 디렉토리가 이미 존재하나 비어 있음 (사용자 의도 신호)
- `next.config.ts`에 `output` 설정 없음
- `grep -r standalone`로 **세션 3(2026-04-06) 인수인계서의 명시적 제거 결정** 발견:
  > `standalone 제거 | standalone vs 일반 모드 | standalone에서 next start 미동작, .env.local 미로드`

**판단**: 세션 3의 제거 사유는 standalone 모드의 **표준 동작을 운용법 오해로 해석**한 결과. "next start 미동작"은 버그가 아니라 `node server.js`로 기동하는 설계. ".env.local 미로드"는 프로덕션 전용 `.env` 사용이 의도된 설계. CLAUDE.md "수정 전 확인 프로토콜"에 따라 **충돌 사실 한 줄 보고 후 자율 실행** 원칙으로 진행.

**결론**: `output: 'standalone'` 재도입 + 운용법 오해를 해소하는 패키징 자동화 + WSL 배포 절차를 동시 제공.

### 토픽 2: 빌드 + 패키징 스크립트 설계

**next.config.ts 수정**:
- `output: 'standalone'` 추가 (세션 3 역전)
- 주석에 "next start 아님 — `node .next/standalone/server.js`로 기동" 명시하여 향후 혼동 방지
- `serverExternalPackages: ['better-sqlite3']` · `outputFileTracingExcludes` 기존 설정 보존

**첫 빌드 산출물 점검** (`.next/standalone/` 51MB):
- NFT(Node File Trace)가 프로젝트 루트의 **.env / data/ / scripts/ / docs/ / PNG / playwright.config.ts / drizzle.config.ts / package-lock.json** 등을 보수적으로 끌어옴
- native 모듈: `better-sqlite3/build/Release/better_sqlite3.node` (Windows 빌드) + `@node-rs/argon2-win32-x64-msvc` 확인 — **플랫폼 교차 배포 시 교체 필수**

**`scripts/pack-standalone.sh` 작성 5단계**:
1. `standalone/` 정리 (기동 헬퍼 5개는 보존)
2. `.next/standalone/*` rsync 복사 + dev/test/lock 파일 제외 + `.env` / `data/` / `scripts/` **시크릿 방어 제거** + `logs/` 선제 생성
3. `.next/static/` 수동 복사 (NFT 비추적)
4. `public/` 수동 복사 (NFT 비추적)
5. `prisma/schema.prisma` + `migrations/` 복사

**기동 헬퍼 5개** (화이트리스트로 git에 포함):
- `start.sh` — `PORT=3000 HOSTNAME=0.0.0.0 node server.js` 포그라운드
- `ecosystem.config.cjs` — PM2 fork 모드 (SP-019 결과에 따라 기본 fork 유지, cluster 전환은 Phase 16c에서)
- `install-native-linux.sh` — `npm rebuild better-sqlite3` + `@node-rs/argon2-linux-x64-gnu` 강제 + `prisma generate`
- `.env.production.example` — DATABASE_URL / JWT / Vault 템플릿
- `README.md` — 배포 절차 + 알려진 제약 5종

**.gitignore**: `/standalone/` 전체 제외 + 위 5개만 화이트리스트 (`!/standalone/start.sh` 등).

**결론**: 첫 패키지 131MB, 모든 산출물 생성 완료. Windows에서 포트 3099 스모크 테스트 → **HTTP 200 `/login` in 48ms** 확인. Prisma AuthenticationFailed 에러는 페이크 DB URL로 의도된 것이며 Prisma client · adapter-pg · cron 스케줄러 **정상 로드 신호**.

### 토픽 3: 보안 방어 — NFT가 가져온 민감 파일 제거

첫 패키지 점검에서 `standalone/.env` (실제 시크릿), `standalone/data/dashboard.db` (SQLite), `standalone/scripts/*` (프로젝트 스크립트) 발견. NFT가 프로젝트 루트 파일을 보수적으로 따라왔기 때문.

**대응**: `pack-standalone.sh`에 명시적 `rm -f $DEST/.env` / `rm -rf $DEST/data` / `rm -rf $DEST/scripts` 추가. 재팩 후 깔끔한 레이아웃 검증:
```
standalone/
├── .env.production.example  ← 템플릿만
├── .next/                   ← 빌드 산출물
├── ecosystem.config.cjs
├── install-native-linux.sh
├── logs/                    ← PM2 로그용 선제 생성
├── node_modules/            ← NFT 추적
├── package.json
├── prisma/{schema.prisma, migrations/}
├── public/
├── README.md
├── server.js                ← 진입점
├── src/generated/prisma/    ← Prisma 7 prisma-client 산출물
└── start.sh
```

### 토픽 4: "향후 업데이트 가능한가"
> **사용자**: "향후 계속 개발이 진행되는데 업데이트 가능한것은??"

**설명**:
- **앱 코드 전체 / UI / API / 미들웨어 / 환경변수 / Prisma 스키마 / 의존성**: `npm run build` + `pack-standalone.sh` 재실행으로 모두 반영
- **native 모듈 버전업**: 재빌드 후 WSL에서 `install-native-linux.sh` 재실행
- **Next.js 메이저 업그레이드**: 재빌드만으로 반영

**3가지 업데이트 경로 제시** (추천 순):
- A안: 증분 rsync + `pm2 reload` — 가장 단순, ~1초 무중단
- B안: 심볼릭 스왑 (세션 47 SP-018 PASS, 600ms fork reload 검증) — atomic 롤백 가능
- C안: 기존 `/ypserver prod` 워크플로우를 standalone 방식으로 개정

**주의사항 5건**: `.next/static` hash-named 파일이라 `--delete` rsync 필수 / `.env`는 타겟 별도 관리 / `pm2 reload` vs `restart` / Prisma migrate는 reload 전 선행 / 의존성 추가 시 NFT 재계산.

**결론**: 사용자 "아니야... 그냥 지금 standalone 실행방법은?" → 확장 제안 접고 **현 실행 방법 집중 답변**으로 전환.

### 토픽 5: 코드 변경 후 재빌드
> **사용자**: "다시 빌드해줘. 코드 변경했어."

- `.next/` 제거 → `npm run build` (백그라운드, exit 0) → `pack-standalone.sh` → 131→**134MB** (+3MB)
- 사용자에게 짧은 완료 보고 ("standalone/ 재생성").

### 토픽 6: WSL 이동부터 실행까지
> **사용자**: "지금 wsl인데 해당 폴더 이동부터 실행까지 알려줘."

**8단계 시퀀스 제공**:
1. `mkdir -p ~/ypserver`
2. `rsync -av --delete /mnt/e/.../standalone/ ~/ypserver/` — NTFS 오버헤드 회피 위해 ext4 홈 디렉토리 사용
3. `cd ~/ypserver`
4. `bash install-native-linux.sh` (최초 1회)
5. `cp .env.production.example .env && nano .env`
6. `sudo service postgresql status` 확인
7. `npx prisma migrate deploy --schema=prisma/schema.prisma`
8. `bash start.sh` 또는 `pm2 start ecosystem.config.cjs`

자주 막히는 지점 표 (invalid ELF / AuthenticationFailed / EADDRINUSE / migrate 실패) 동봉.

### 토픽 7: install-native-linux.sh 실행 결과 — binding.gyp 부재 대응

**증상**:
```
npm rebuild better-sqlite3 --build-from-source
→ gyp ERR! configure error: binding.gyp not found
```

**원인**: NFT가 추적한 standalone의 `node_modules/better-sqlite3`는 **필요한 JS/.node 파일만 복사**되어 `binding.gyp`가 없음 → node-gyp 소스 재빌드 불가 (정상 상황).

**대응**: 스크립트 작성 시 이미 예견한 fallback (`npm install --no-save better-sqlite3`)이 동작 → prebuild-install이 **Linux prebuilt 바이너리 설치**. 부수 효과로 **npm이 의존성 전체 트리를 채우느라 700+ 패키지 추가** (standalone NFT 설계 위배 — 용량 증가). 기능은 정상 작동이나 다음 세션 개선 포인트.

- `@node-rs/argon2-linux-x64-gnu` `--force` 설치 OK
- `npx prisma generate --schema=prisma/schema.prisma` → `Generated Prisma Client (7.7.0)` OK

**검증** (사용자 실행):
```bash
file node_modules/better-sqlite3/build/Release/better_sqlite3.node
# ELF 64-bit LSB shared object, x86-64, GNU/Linux ✓
```

### 토픽 8: PM2 기존 `dashboard` 프로세스 교체

**현 상황 발견**: `pm2 list`에 `dashboard`(id=0, 19회 재시작) + `cloudflared`(id=1) 가동. `pm2 show dashboard | grep cwd` → `/home/smart/dashboard` — **별도 full 프로젝트**가 npm start로 돌고 있던 상태.

**교체 절차 실행** (사용자):
```bash
pm2 delete dashboard
cd ~/ypserver
pm2 start ecosystem.config.cjs    # name=ypserver
pm2 save
```

결과: id=6 `ypserver` online (17.5MB → 189.7MB 증가 = Next.js production 정상 레인지), 재시작 0회, cloudflared 유지.

**검증**:
```
curl -I http://127.0.0.1:3000/login → HTTP/1.1 200 OK (보안 헤더 6종 적용)
pm2 logs ypserver                   → Next.js 16.2.3 · Ready in 0ms · 에러 0
```

### 토픽 9: "최신 버전으로 서버 구동중이야?" 확신 점검
> **사용자**: "최신 버전으로 서버 구동중이야?"

**검증 명령**:
```bash
cat ~/ypserver/.next/BUILD_ID        # WYBvMpH13rjEvlzoA_mm1
stat -c '%y' ~/ypserver/.next/BUILD_ID  # 2026-04-19 21:44:55 KST
pm2 describe ypserver | grep created  # 2026-04-19T12:56:58Z = 21:56:58 KST
```

**결론**: 빌드 21:44:55 < PM2 기동 21:56:58 (12분차) → 최신 빌드를 서버가 로드 확정. BUILD_ID `WYBvMpH13rjEvlzoA_mm1` 고유 해시로 본 빌드 특정.

### 토픽 10: "이대로 켜두면 정상 운영 가능?" 장기 운영 체크리스트

**단기(수일)**: 그대로 OK — PM2 자동 재시작 + `pm2 save` 완료 + cloudflared 유지.

**장기 체크리스트 4건 (미완료, 후속 세션 이월)**:
| # | 항목 | 현 상태 | 조치 |
|---|------|---------|------|
| 1 | Windows 재부팅 후 WSL/PM2 자동 복구 | ❌ WSL 수동 기동 필요 | `/etc/wsl.conf + pm2 startup systemd` 또는 Windows 시작 프로그램 |
| 2 | PostgreSQL 자동 기동 | ❌ 매번 수동 | WSL systemd 활성화 후 `systemctl enable postgresql` |
| 3 | PM2 로그 로테이션 | ❌ `logs/ypserver-*.log` 무한 증가 | `pm2 install pm2-logrotate` |
| 4 | 디스크 모니터링 | △ WSL2 8GB/1007GB 여유 | 대시보드 주기 확인 |

※ 세션 25-C에서 `/etc/wsl.conf systemd=true` 이미 설정 + `pm2-smart.service` enabled 확인된 바 있음 (`pm2-smart.service` 는 이전 `dashboard` 프로세스 대상). 새 `ypserver` 대상으로 `pm2 save` 재실행했으므로 resurrect 후보에는 이미 등록됨 — Windows 재부팅 시 실 복구 여부는 다음 세션에서 실측 필요.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 세션 3의 standalone 제거 결정을 역전 | A) 세션 3 존중(일반 빌드) / B) standalone 재도입 | B. 빈 `standalone/` 폴더 존재 = 사용자 의도 신호 + 세션 3 사유가 운용법 오해로 판명 + `autonomy` 메모리에 따라 자율 채택 |
| 2 | `standalone/` 을 git 비추적 + 기동 헬퍼 5개만 화이트리스트 | A) 전체 커밋 / B) 전체 ignore / C) 헬퍼만 화이트리스트 | C. 빌드 산출물은 재생성 가능(`pack-standalone.sh`), 헬퍼는 운영 스크립트라 보존 가치 |
| 3 | pack 스크립트에 명시적 시크릿 방어 (`rm .env / data / scripts`) | A) rsync exclude만 신뢰 / B) 명시적 rm 추가 | B. rsync exclude 패턴 매칭 누락 관찰됨(playwright.config.ts 유출 사례) + 시크릿은 2중 방어 필요 |
| 4 | install-native-linux.sh fallback이 700 패키지를 끌어온 현상 허용 | A) 즉시 개선 / B) 기능 검증 우선 | B. 첫 배포라 기능 동작 우선. NFT 설계 철학 위배는 후속 세션 개선 이월 |
| 5 | WSL 배포 위치 `~/ypserver` (NOT `/opt/ypserver`) | A) `/opt/` sudo / B) `~/ypserver` | B. sudo 최소화 + NTFS 오버헤드 회피 + 개인 프로젝트 운영 규모 적합 |
| 6 | 기존 PM2 `dashboard` 삭제 후 새 `ypserver` 등록 (이름 변경 허용) | A) 이름 유지(dashboard) / B) 새 이름(ypserver) | B. 이력 단절 인지 가능 + ecosystem.config.cjs와 이름 일치 + `/home/smart/dashboard` 디렉토리는 롤백용으로 보존 |
| 7 | fork 모드 유지 (cluster 미전환) | A) fork / B) cluster:4 | A. SP-019에서 cluster 이점(+39.9% RPS) 확증됐으나 scheduler/SQLite/SP-009 통합 고려 필요 — Phase 16c에서 전환 |

## 수정 파일 (9개 — 코드 2, 스크립트 6, 문서 1)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `next.config.ts` | `output: 'standalone'` 추가 + 운용법 주석 (`node .next/standalone/server.js`) |
| 2 | `.gitignore` | `/standalone/` 제외 + 기동 헬퍼 5개 화이트리스트 (`!/standalone/start.sh` 등) |
| 3 | `scripts/pack-standalone.sh` | 신규 — NFT 누락분(`.next/static`/`public/`/migrations) 수동 복사 + 시크릿/로컬 DB 방어 제거 + `logs/` 선제 생성 |
| 4 | `standalone/start.sh` | 신규 — `PORT=3000 HOSTNAME=0.0.0.0 node server.js` 포그라운드 기동 헬퍼 |
| 5 | `standalone/ecosystem.config.cjs` | 신규 — PM2 fork 모드 (max_memory_restart 512M, kill_timeout 8s, logs/ 경로) |
| 6 | `standalone/install-native-linux.sh` | 신규 — `npm rebuild better-sqlite3` fallback + `@node-rs/argon2-linux-x64-gnu --force` + `prisma generate` |
| 7 | `standalone/.env.production.example` | 신규 — DATABASE_URL / JWT_V1_SECRET / DASHBOARD_PASSWORD / FILEBOX 템플릿 |
| 8 | `standalone/README.md` | 신규 — 배포 5단계 + 알려진 제약 5종 + 헬스체크 체크리스트 + 관련 문서 링크 |
| 9 | `docs/solutions/2026-04-19-nextjs-standalone-output-misunderstanding.md` | 신규 CK — 세션 3 오해 해부 + 올바른 운용법 + 재발 방지 |

**커밋 0건** (본 세션 /cs 단계에서 병합 커밋 예정 — 플랜 확장/standalone 패키지/session 50 문서 일괄)

## 검증 결과

- `npm run build` — exit 0, Next.js 16.2.3, **Ready in 0ms**
- `pack-standalone.sh` — 첫 131MB → (코드 변경 후 재빌드) 134MB
- Windows 스모크 테스트 (포트 3099) — HTTP 200 `/login` in 48ms, Prisma/better-sqlite3/cron 정상 로드
- WSL `install-native-linux.sh` — better_sqlite3.node Linux ELF 확정, argon2 Linux plugin, Prisma client 재생성 OK
- WSL `pm2 start` — `ypserver` online, 189.7MB, 재시작 0, HTTP/1.1 200 OK
- 로그 점검 — Next.js 16.2.3 Ready · 에러 0 · 보안 헤더 6종 응답 적용
- BUILD_ID vs PM2 created_at 교차 검증 — 빌드 21:44:55 → PM2 기동 21:56:58 (12분차) → 최신 빌드 로드 확정

## 터치하지 않은 영역

- Phase 16a Vault 관련 파일 (세션 48 완결, 본 세션 무변경)
- Phase 16b Capistrano 플랜 (세션 49 작성, 본 세션은 **대안 경로로 standalone rsync 선택**하여 미진입)
- `scripts/capistrano-bootstrap.sh`, `scripts/phase16-bootstrap-verify.sh` (세션 49 산출물 unstaged — 본 세션 커밋 대상 아님)
- `src/` 전체 (본 세션 코드 변경 0)
- 기존 `~/dashboard` 디렉토리 (WSL) — 롤백용 보존

## 알려진 이슈

### 1. install-native-linux.sh fallback이 700 패키지를 끌어옴 (개선 대상)
**증상**: `npm rebuild better-sqlite3 --build-from-source` 실패 (binding.gyp 없음) → fallback `npm install --no-save better-sqlite3` → npm이 의존성 전체 트리 채움.

**영향**: standalone NFT 설계 철학(추적된 최소 의존성) 위배. 용량 131MB → ~400MB(추정) 팽창. **기능 정상**.

**권장 개선 (다음 세션)**:
- 옵션 A: `install-native-linux.sh`에서 `npm install --no-save --no-package-lock --prefer-offline better-sqlite3@12.8.0 @node-rs/argon2@2.0.2` 명시 버전 + prebuild 우선
- 옵션 B: 프로젝트 루트에서 Linux 바이너리만 pack 과정에서 미리 다운로드해 `standalone/node_modules/.native-linux/` 에 번들 → 타겟에서 덮어쓰기만
- 옵션 C: 타겟에서 full `npm ci --production` 수용 (standalone 개념 포기, Capistrano 방식에 가까움)

### 2. Windows 재부팅 시 자동 복구 미검증
**증상**: 세션 25-C에서 `pm2-smart.service` enabled 확인했으나 이는 이전 `dashboard` 대상. 새 `ypserver`로 교체 후 `pm2 save` 재실행했으므로 resurrect 목록에는 반영됨. **실 Windows 재부팅 후 복구 여부는 실측 안 함**.

**권장 (다음 세션)**: WSL2 `systemctl is-system-running` + `systemctl status pm2-smart` 확인 + Windows 시작 시 wsl 자동 기동 검증 (1회 재부팅 테스트).

### 3. PostgreSQL 자동 기동 미확인
`sudo service postgresql status` 확인이 사용자 환경에서 수동 필요할 수 있음 — systemd enable 여부 실측 안 됨.

### 4. standalone 패키지 크기 인플레이션 (이슈 #1 파생)
첫 팩 131MB → 재빌드 팩 134MB → **install-native-linux.sh 실행 후 타겟 ~400MB**. rsync 재동기 시 증분 전송이라 영향 적지만 디스크 사용량 모니터링 필요.

## 다음 작업 제안

### 우선순위 0 (즉시)
1. **Windows 재부팅 1회 리허설**로 Windows → WSL → PM2 → cloudflared 자동 복구 체인 실증
2. **install-native-linux.sh 개선** (위 권장 A안 채택) — standalone 사이즈 원상복구

### 우선순위 1 (이번 주)
3. **PM2 logrotate 설치**: `pm2 install pm2-logrotate` + `pm2 set pm2-logrotate:max_size 10M`
4. **PostgreSQL systemd enable**: `sudo systemctl enable postgresql`

### 우선순위 2 (원래 이월 — 세션 49 이월 지속)
5. **KEK 일치 퍼즐 조사** (세션 49 이월 #1)
6. **Phase 16b Capistrano 진입 여부 재평가**: 본 세션에서 standalone+rsync+pm2 reload 실증했으므로 Capistrano 필요성 재검토
   - 찬: 무중단 원자성 롤백, releases/ 히스토리
   - 반: standalone 방식이 이미 작동 + 운영 단순성 + Phase 16c cluster 도입이 더 큰 임팩트
7. **세션 49 미완 이월 유지**: MASTER_KEY_PATH 단일 출처 확정 / rotateKek 단위 테스트 / SecretItem @@index 중복 / `_test_session` drop / MFA biometric / SP-013·016 / KST tick

### Compound Knowledge 후보
- **session 3 결정 역전 사례** — "이전 세션의 명시적 결정도 운용법 오해로 판명되면 역전 가능. 단, 역전 사유를 명시적 문서화"
- **standalone NFT + 플랫폼 교차 배포** — Windows 빌드 + Linux 기동 시 native 바이너리 교체 패턴 + fallback의 의존성 인플레이션 트레이드오프

---

**사용 스킬**: (standalone 관련 스킬 없음 — 소프트웨어 엔지니어링 일반 워크플로우) → cs

[← handover/_index.md](./_index.md)
