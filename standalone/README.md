# 양평 부엌 대시보드 — standalone 실행 패키지

Next.js 16 `output: "standalone"` 모드로 빌드된 자체 실행 가능한 배포 페이로드입니다.
원본 프로젝트 `node_modules` 전체 없이 **추적된 최소 의존성**만 포함합니다.

---

## 📦 패키지 구성

```
standalone/
├── server.js                   ← Next.js 진입점 (node server.js 로 기동)
├── package.json                ← 런타임 메타 (scripts 는 사용하지 않음)
├── .next/                      ← 빌드 산출물
│   ├── server/                 ← 서버 번들 (App Router / API Routes)
│   └── static/                 ← 클라이언트 JS/CSS/이미지 (pack-standalone.sh 가 복사)
├── public/                     ← 정적 자산 (pack-standalone.sh 가 복사)
├── node_modules/               ← NFT 추적된 최소 의존성
├── src/generated/prisma/       ← Prisma 7 prisma-client 산출물
├── prisma/
│   ├── schema.prisma           ← 런타임 마이그레이션/재생성 시 참조
│   └── migrations/             ← prisma migrate deploy 용
├── start.sh                    ← 포그라운드 기동 헬퍼
├── ecosystem.config.cjs        ← PM2 프로세스 정의
├── install-native-linux.sh     ← WSL/Linux 에서 Windows 네이티브 교체
└── .env.production.example     ← 환경변수 템플릿
```

---

## 🚀 빠른 시작 (WSL / Linux 서버)

```bash
# 1) 패키지 전송 (Windows → WSL 예시)
rsync -av --delete \
  /mnt/e/00_develop/260406_luckystyle4u_server/standalone/ \
  /opt/ypserver/

# 2) 플랫폼별 네이티브 교체 (Windows 빌드 산출물을 Linux 에서 쓸 때 필수)
cd /opt/ypserver
bash install-native-linux.sh

# 3) 환경변수 배치
cp .env.production.example .env
vi .env   # DATABASE_URL, DASHBOARD_PASSWORD, JWT_V1_SECRET 등 작성

# 4) Prisma 마이그레이션 (초기/스키마 변경 후만)
npx prisma migrate deploy --schema=prisma/schema.prisma

# 5) 기동
bash start.sh                          # 포그라운드 (테스트용)
# 또는
pm2 start ecosystem.config.cjs         # 백그라운드 + 자동 재시작
pm2 save && pm2 startup                # 부팅 시 자동 시작
```

기본 접속: `http://<host>:3000` — Cloudflare Tunnel 경유 시 `https://stylelucky4u.com`

---

## 🔨 재빌드 절차

standalone 패키지를 다시 만들고 싶을 때는 **프로젝트 루트**에서:

```bash
npm run build                    # .next/standalone 재생성
bash scripts/pack-standalone.sh  # standalone/ 로 정돈 복사
```

> `scripts/pack-standalone.sh` 는 `docs/`, `spikes/`, PNG 등 NFT 가
> 보수적으로 끌어온 **불필요 파일을 제외**하고 복사합니다.

---

## ⚠️ 알려진 제약

### 1. 플랫폼별 네이티브 바이너리
Windows 에서 `next build` 시 다음이 **Windows 바이너리로** 포함됩니다:
- `better-sqlite3/build/Release/better_sqlite3.node`
- `@node-rs/argon2-win32-x64-msvc`

**Linux 기동 전에 반드시** `bash install-native-linux.sh` 실행.

### 2. Prisma 엔진
Prisma 7 `prisma-client` provider 는 `src/generated/prisma/` 에 생성된
클라이언트를 사용하며, 엔진은 `@prisma/adapter-pg` 경유로 pg 드라이버에
위임합니다. 플랫폼 재생성이 필요하면 `npx prisma generate` 재실행.

### 3. .env 로드 경로
Next.js standalone 은 **서버 기동 디렉토리의 `.env`** 를 자동 로드합니다.
`start.sh` 가 `cd` 를 패키지 루트로 이동시키므로, `.env` 는 `standalone/.env`
위치에 있어야 합니다. `.env.local` 은 **로드되지 않습니다** (프로덕션 전용).

### 4. pg_dump / 백업 라우트
`next.config.ts` 에서 `/api/v1/backups` 는 `pg_dump` 바이너리를 NFT 에서
제외했습니다. 백업 기능을 사용하려면 타겟 호스트에 `pg_dump` 가 PATH 에
있어야 합니다: `sudo apt install postgresql-client` (WSL Ubuntu).

### 5. 파일박스 저장소
`FILEBOX_DIR` 이 가리키는 디렉토리는 패키지에 포함되지 **않습니다**.
타겟 호스트에 미리 생성하고 쓰기 권한을 부여하세요.

---

## 🩺 헬스체크 / 운영 점검

| 확인 항목 | 명령 |
|-----------|------|
| 프로세스 상태 | `pm2 status` |
| 최근 로그 | `pm2 logs ypserver --lines 100` |
| 포트 바인딩 | `ss -tlnp \| grep :3000` |
| 루트 응답 | `curl -I http://127.0.0.1:3000/` |
| 로그인 페이지 | `curl -I http://127.0.0.1:3000/login` |
| Cloudflare Tunnel | `sudo systemctl status cloudflared` |

---

## 🔗 관련 문서

- `docs/handover/260419-session48-phase16a-vault.md` — 최신 세션 상태 (Vault/MFA)
- `docs/handover/260406-session3-security-wave2.md` — 과거 standalone 제거 결정(현재 재도입)
- `docs/MASTER-DEV-PLAN.md` — 세션 로드맵
- `spikes/sp-018-symlink-swap/` — 무중단 배포 심볼릭 스왑 검증
- `spikes/sp-019-pm2-cluster/` — PM2 cluster + SQLite WAL 경합 검증 (현재 fork 모드 사용)
