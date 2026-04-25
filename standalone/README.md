# 양평 부엌 대시보드 — standalone 실행 패키지

Next.js 16 `output: "standalone"` 모드로 빌드된 자체 실행 가능한 배포 페이로드입니다.
원본 프로젝트 `node_modules` 전체 없이 **추적된 최소 의존성**만 포함합니다.

> **갱신 이력**: 2026-04-19(세션 48) 초안 → **2026-04-25(세션 56)** 운영 진화 반영 (`/home/smart/ypserver` deploy / `wsl-build-deploy.sh` 8단계 파이프라인 / ADR-021 빌드 게이트 / ypserver 스킬 v2).

---

## 🧭 용도별 시나리오 (3 case)

본 README 는 패키지 자체의 사용설명서이지만, 본 프로젝트 운영은 시나리오별로 **다른 진실 소스**를 가집니다:

| 시나리오 | 진실 소스 | 명령 |
|---|---|---|
| **A. 본 운영 호스트 단순 재기동** (코드 변경 0, 방금 stopped → 다시 online) | `~/.claude/skills/ypserver/SKILL.md` v2 (세션 55) + `pm2 dump.pm2` | `wsl -- bash -lic 'pm2 start ypserver && pm2 save'` |
| **B. 본 운영 호스트 코드 변경 후 재배포** (Windows src → WSL build → 운영 반영) | `scripts/wsl-build-deploy.sh` (세션 52, 8단계) + ADR-021 빌드 게이트 (세션 56) | `MSYS_NO_PATHCONV=1 wsl bash -c 'bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/wsl-build-deploy.sh'` |
| **C. 새 호스트에 standalone 배포** (외부 서버 신규 셋업) | **본 README §🚀 빠른 시작** (이하 5 단계) | rsync → install-native → .env → migrate → pm2 start |

> **시나리오 A/B 가 본 운영 호스트(`/home/smart/ypserver`)의 정상 워크플로우**이고, 시나리오 C 는 패키지를 다른 머신에 복제할 때만 사용합니다. README 의 §🚀 빠른 시작은 시나리오 C 의 가이드입니다.

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

## 🚀 빠른 시작 — 시나리오 C (새 호스트에 standalone 배포)

> 본 운영 호스트(`/home/smart/ypserver`)는 이 절차가 아닌 **시나리오 A/B** 를 사용합니다 (위 §🧭 표 참조). 본 §은 패키지를 처음 받는 외부 서버용 가이드입니다.

```bash
# 1) 패키지 전송 (Windows → WSL 예시)
rsync -av --delete \
  /mnt/e/00_develop/260406_luckystyle4u_server/standalone/ \
  /opt/ypserver/   # 또는 /home/<user>/ypserver, 임의 경로 가능

# 2) 플랫폼별 네이티브 교체 (Windows 빌드 산출물을 Linux 에서 쓸 때 필수)
cd /opt/ypserver
bash install-native-linux.sh

# 3) 환경변수 배치
cp .env.production.example .env
vi .env   # DATABASE_URL, DASHBOARD_PASSWORD, JWT_V1_SECRET, MASTER_KEY_PATH 등 작성

# 4) Prisma 마이그레이션 (초기/스키마 변경 후만)
npx prisma migrate deploy --schema=prisma/schema.prisma

# 5) Drizzle (SQLite) 마이그레이션 — ADR-021 (세션 56). 패키지에 db-migrations/ 동봉됨.
SQLITE_DB_PATH=$PWD/data/dashboard.db \
DRIZZLE_MIGRATIONS_DIR=$PWD/db-migrations \
  node scripts/run-migrations.cjs   # 멱등 (재실행 시 skip)

# 6) 스키마 검증 — 필수 4 테이블(__drizzle_migrations, audit_logs, ip_whitelist, metrics_history) 존재 확인
SQLITE_DB_PATH=$PWD/data/dashboard.db \
  node scripts/verify-schema.cjs

# 7) 기동
bash start.sh                          # 포그라운드 (테스트용)
# 또는
pm2 start ecosystem.config.cjs         # 백그라운드 + 자동 재시작
pm2 save && pm2 startup                # 부팅 시 자동 시작
```

기본 접속: `http://<host>:3000` — Cloudflare Tunnel 경유 시 `https://stylelucky4u.com`

> 시나리오 B(`wsl-build-deploy.sh`)는 단계 5/6 에 해당하는 게이트가 빌드 파이프라인 [6/8]/[7/8] 단계에 자동 내장되어 있습니다 (ADR-021 §2.2).

---

## 🔨 재빌드 절차

### 옵션 1: 운영 호스트까지 자동 반영 (시나리오 B, 권장)

Windows 워킹트리에서:

```bash
MSYS_NO_PATHCONV=1 wsl bash -c \
  'bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/wsl-build-deploy.sh'
```

`scripts/wsl-build-deploy.sh` 가 8단계 자동 실행:

| 단계 | 내용 |
|---|---|
| [1/8] | Windows 워킹트리 → WSL 네이티브 빌드 디렉토리(`~/dev/ypserver-build/`) 동기화 (ext4, 9P 우회) |
| [2/8] | `npm ci` (lockfile 엄격) |
| [3/8] | `next build` (Next.js 16 standalone) |
| [4/8] | `pack-standalone.sh` — standalone/ 정돈 + drizzle migrations 동봉 (ADR-021) |
| [5/8] | rsync 배포 → `/home/smart/ypserver/` (`.env`/`data/`/`logs/` 보존) |
| **[6/8]** | **drizzle migrate** — `run-migrations.cjs` (ADR-021 빌드 게이트 fail-fast) |
| **[7/8]** | **schema verify** — `verify-schema.cjs` (필수 4 테이블 부재 시 PM2 reload 차단) |
| [8/8] | PM2 reload (`pm2 restart ypserver --update-env`) |

### 옵션 2: standalone 패키지만 정돈 (외부 배포용)

운영 반영 없이 standalone/ 폴더만 새로 채우고 싶을 때:

```bash
npm run build                    # .next/standalone 재생성
bash scripts/pack-standalone.sh  # standalone/ 로 정돈 복사 (drizzle migrations 동봉 포함)
```

> `scripts/pack-standalone.sh` (세션 56 갱신) 는 `docs/`, `spikes/`, PNG 등 NFT 가
> 보수적으로 끌어온 **불필요 파일을 제외**하고 복사하며, **`src/lib/db/migrations/` →
> `<bundle>/db-migrations/`** 로 drizzle 마이그레이션을 동봉합니다 (시나리오 C 의 단계 5 가능).

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

### 6. Drizzle 마이그레이션 빌드 게이트 (ADR-021, 세션 56)
SQLite (`audit_logs` 등 cross-cutting observability) 는 prisma 와 별개로
drizzle 마이그레이션을 자기 책임으로 적용해야 합니다. 빈 DB 로 traffic 을
수락하면 도메인 임계 경로(로그인 등)에서 `SqliteError: no such table: audit_logs`
가 throw 되어 사용자 응답 500 으로 나타납니다.

**시나리오 B** 는 이를 [6/8] migrate / [7/8] verify 빌드 게이트로 차단합니다.
**시나리오 C** 는 §🚀 빠른 시작 단계 5/6 으로 직접 적용합니다.
**부팅 self-heal**: `instrumentation.ts` 가 부팅 시 `applyPendingMigrations()`
를 best-effort 로 호출 — 빌드 게이트가 1차, 부팅 self-heal 이 2차 안전망.

도메인 라우트는 `safeAudit(entry, context?)` (`src/lib/audit-log-db.ts`) 만
사용해야 합니다 (audit 실패가 도메인 응답을 깨뜨리지 않는 cross-cutting fail-soft).
정식 명세: `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md`.

---

## 🩺 헬스체크 / 운영 점검

| 확인 항목 | 명령 |
|-----------|------|
| 프로세스 상태 | `pm2 status` |
| 최근 로그 | `pm2 logs ypserver --lines 100` |
| 포트 바인딩 | `ss -tlnp \| grep :3000` |
| 루트 응답 | `curl -I http://127.0.0.1:3000/` |
| 로그인 페이지 | `curl -I http://127.0.0.1:3000/login` |
| Cloudflare Tunnel | `sudo systemctl status cloudflared` 또는 `pm2 status cloudflared` |
| **SQLite 스키마 (ADR-021)** | `node scripts/verify-schema.cjs` (4 테이블 OK) |
| **Audit 카운터 (S56 §보완 1)** | `curl -H "Authorization: Bearer $ADMIN" http://127.0.0.1:3000/api/admin/audit/health` (failed:0) |
| 03:00 KST cleanup tick | `pm2 logs ypserver --lines 80 --nostream \| grep -A2 "audit log write failed"` |

---

## 🔗 관련 문서

### 운영 표준 (시나리오 A/B 진실 소스)
- `~/.claude/skills/ypserver/SKILL.md` v2 (세션 55) — 글로벌 ypserver 스킬, 단순 재기동/재배포 SOP
- `scripts/wsl-build-deploy.sh` (세션 52) — 8단계 파이프라인 단일 명령
- `scripts/pack-standalone.sh` (세션 56 갱신) — drizzle migrations 동봉 추가
- `scripts/run-migrations.cjs` / `scripts/verify-schema.cjs` (세션 56 신규) — ADR-021 빌드 게이트

### ADR / 결정 문서
- `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` (세션 56) — safeAudit + migration self-heal
- `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` — ADR-001~021 wave registry (§5 참조)
- `docs/solutions/2026-04-25-audit-fail-soft-and-migration-self-heal.md` — CK 4층 결함 해결 패턴
- `docs/solutions/2026-04-25-nft-native-binary-platform-mismatch.md` (세션 52) — 빌드 환경 = 실행 환경 원칙

### 세션 핸드오버 (최신 → 과거)
- `docs/handover/260425-session56-audit-fail-soft-migration-self-heal.md` ⭐ — 본 README 갱신 시점, 4층 결함 해결 + ADR-021 + audit-failure 메트릭 + Wave registry 정합성
- `docs/handover/260425-session55-ypserver-skill-v2-deploy.md` — ypserver 스킬 v2 리팩터
- `docs/handover/260425-session52-wsl-build-pipeline.md` — wsl-build-deploy.sh 신규
- `docs/handover/260419-session50-standalone-package.md` — standalone 재도입 + ~/ypserver
- `docs/handover/260419-session48-phase16a-vault.md` — Vault/MFA
- `docs/handover/260406-session3-security-wave2.md` — 과거 standalone 제거 결정 (현재 재도입)

### 로드맵 / 스파이크
- `docs/MASTER-DEV-PLAN.md` — 세션 로드맵
- `docs/research/2026-04-supabase-parity/05-roadmap/00-roadmap-overview.md` — 50주 916h 시나리오 A/B
- `spikes/sp-018-symlink-swap/` — 무중단 배포 심볼릭 스왑 검증
- `spikes/sp-019-pm2-cluster/` — PM2 cluster + SQLite WAL 경합 검증 (현재 fork 모드 사용)
