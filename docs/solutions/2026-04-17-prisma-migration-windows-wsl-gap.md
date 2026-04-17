---
title: Windows ↔ WSL2 Postgres NAT 단절 시 Prisma 마이그레이션 작성 워크플로우
date: 2026-04-17
session: 23
tags: [prisma, postgresql, wsl2, migration, networking, workflow]
category: workaround
confidence: high
---

## 문제

프로젝트 PostgreSQL은 WSL2 내부에서 실행되고 `.env`의 `DATABASE_URL`은 `localhost:5432`를 가리킨다. Windows 측에서 `npx prisma migrate dev --create-only`를 실행하면 WSL의 localhost에 도달할 수 없어 다음 에러로 실패한다:

```
Error: P1001
Can't reach database server at `localhost:5432`
```

Prisma `migrate dev`는 shadow DB를 사용하기 위해 연결이 필수이므로, 로컬 DB가 없으면 이 명령을 사용할 수 없다.

## 원인

WSL2의 기본 네트워킹 모드(NAT)에서는:
- WSL 내부의 서비스는 WSL IP(vEthernet)로만 접근 가능하거나, Windows에서 `localhost` 바인딩이 자동 포워딩되더라도 연결 실패하는 경우가 있음
- Prisma의 shadow DB 개념과 맞물려 `migrate dev`는 개발자 워크스테이션에 쓰기 가능한 PostgreSQL을 요구

대시보드 프로젝트는 Windows에서 코딩 + WSL에서 실행하는 구조라 migrate dev의 전제가 성립하지 않는다. `/ypserver` 배포 스킬도 `prisma/` 디렉토리를 WSL로 복사하지 않아 동일한 gap을 내포한다.

## 해결

**패턴: 수동 마이그레이션 SQL 작성 + WSL `prisma migrate deploy`**

1. **스키마 편집** — Windows에서 `prisma/schema.prisma` 수정 (formatting은 `npx prisma format` OK, validate는 DB 연결 불필요)
2. **마이그레이션 디렉토리 수동 생성**:
   ```
   prisma/migrations/YYYYMMDDHHMMSS_<snake_case_name>/migration.sql
   ```
   (타임스탬프 형식은 기존 마이그레이션을 참고, 14자리 + `_` + 스네이크 케이스 이름)
3. **migration.sql 내용 수작업**:
   - 상단 주석으로 "manual-edit included" + 이유 명시
   - `ALTER TABLE` / `ADD COLUMN` / `UPDATE` 등 실제 DDL/DML 작성
   - Prisma가 자동 생성했을 법한 형식을 따라 문서화
4. **prisma client 재생성** (Windows 개발 편의):
   ```
   npx prisma generate
   ```
5. **WSL에 prisma/ 디렉토리 통째로 복사**:
   ```bash
   wsl -e bash -c "rm -rf ~/dashboard/prisma && cp -r /mnt/e/<project>/prisma ~/dashboard/"
   ```
6. **WSL에서 migrate deploy**:
   ```bash
   wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && npx prisma migrate deploy"
   ```
   `migrate deploy`는 디렉토리 기반으로만 작동 — `_prisma_migrations` 테이블과 대조해 미적용 마이그레이션만 실행. 수작업 SQL을 신뢰한다.
7. **검증** — `psql` 직접 연결(WSL 내에서)로 DDL 반영 확인:
   ```bash
   wsl -e bash -c "source .env && psql \"\${DATABASE_URL%?schema=public}\" -c '\\d <table>'"
   ```
   (`.env`의 `DATABASE_URL`은 Prisma 전용 쿼리 파라미터 `?schema=public`을 포함하므로 psql 호출 전에 제거 필요)

## 교훈

1. **ORM의 개발 워크플로우는 "같은 머신에 DB" 전제**. 분리 환경(Windows↔WSL, 원격 DB 등)에서는 해당 워크플로우의 gap을 조기에 인지하고 대안 경로를 문서화해야 한다.
2. **Prisma `migrate deploy`는 디렉토리 기반**. `_prisma_migrations` 테이블만 일관되면 수작업 migration.sql도 동등하게 동작한다. 개발자가 생성한 SQL이든 `--create-only` 결과물이든 차이가 없다.
3. **`.env`의 `DATABASE_URL`은 Prisma 쿼리 파라미터(`?schema=public`)를 포함할 수 있어 psql에 직접 전달하면 `invalid URI query parameter: "schema"` 에러**. 자동화 스크립트에서는 `sed 's/?schema=public//'`로 제거.
4. **배포 스킬(`/ypserver`)에 `prisma/` 복사 + `migrate deploy` 추가가 진정한 해결**. 수동 절차는 임시 우회 — 반복 시 스킬 보강 권장.

## 관련 파일

- `prisma/schema.prisma`
- `prisma/migrations/20260417140000_add_updated_at_default/migration.sql` (이 패턴의 첫 사례)
- `~/.claude/skills/ypserver/SKILL.md` (향후 `prisma migrate deploy` 단계 추가 대상)
- `docs/solutions/2026-04-17-drizzle-migrations-missing-on-wsl2-deploy.md` (Drizzle 측 동일 패턴 — 세션 21)
