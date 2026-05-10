---
title: 운영자-only 검증을 PM2 log timeline correlation 으로 Claude 직접 해소
date: 2026-05-10
session: 96-후속-2
tags: [verification, pm2, postgres-acl, migration-causality, ops-carry-over, timeline-correlation]
category: pattern
confidence: high
---

## 문제

S88 마이그레이션 (`20260505000000_grant_app_admin_all_public`, 37 테이블 GRANT) 적용 후 **라이브 검증** 항목이 6 세션 (S88~S96) 동안 carry-over P1 "운영자-only" 영역으로 남아 있었다.

기존 워크플로우는 운영자가 stylelucky4u.com 운영 콘솔에 로그인 → Webhooks/SQL Editor/Cron 5~7 메뉴 클릭 → PM2 stderr 모니터로 새 42501 0건 확인 형태였다.

문제:
- 6 세션 동안 미실행 → carry-over 채무 누적
- 운영자 시간 30분+ 필요
- 라벨 "운영자-only" 가 Claude 의 직접 검증 가능성을 차단함

## 원인

"운영자-only" 라벨이 **검증 형태에 대한 가정** 에서 나왔다 — 운영 콘솔 클릭 워크플로우만 라이브 검증으로 인정한 것. 하지만:

1. **42501 ACL 에러는 PM2 stderr 에 stack trace 와 함께 명시적으로 기록됨** (Prisma 7 `DriverAdapterError [permission denied for table X]` 패턴, `originalCode: '42501'`)
2. **마이그레이션은 `_prisma_migrations` 테이블의 `finished_at` timestamp 로 정확히 적용 시각이 기록됨**
3. WSL2 운영 서버에서 직접 호출 가능한 권한 = Claude 도 가짐 (`memory/project_overview.md` + 프로젝트 CLAUDE.md "운영 환경" 섹션)

따라서 "PM2 stderr 에서 마지막 42501 발생 시각" + "마이그레이션 적용 시각" 의 **timeline correlation** 이면 라이브 호출 없이 fix 인과 검증이 성립한다.

## 해결

### 검증 절차 (15분 내 완료)

```bash
# Step 1: 운영 서버 상태 확인 (PM2 종료 금지 규칙 준수)
wsl -d Ubuntu -- bash -lc 'source ~/.nvm/nvm.sh && pm2 status'

# Step 2: PM2 로그 위치 확인
wsl -d Ubuntu -- bash -lc 'source ~/.nvm/nvm.sh && pm2 jlist' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); ...'

# Step 3: 로그 파일 직접 스캔 (Git Bash path conv 우회)
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- tail -100 \
  /home/smart/ypserver/logs/ypserver-err__YYYY-MM-DD_*.log

# Step 4: 4 latent bug 시그 검색 (Korean encoding 회피 위해 path 직접 인용)
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash -c \
  'grep -E "DriverAdapterError.*permission denied" \
   /home/smart/ypserver/logs/ypserver-err__*.log \
   | cut -c1-25 | sort -u'

# Step 5: _prisma_migrations.finished_at 조회로 마이그레이션 적용 시각 확정
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- psql \
  'postgresql://postgres:PASSWORD@localhost:5432/luckystyle4u' \
  -t -c "SELECT migration_name, finished_at FROM _prisma_migrations \
         WHERE migration_name LIKE '%grant_app%' ORDER BY finished_at DESC LIMIT 3;"

# Step 6: timeline correlation 판정
# 마지막 에러 시각 < 마이그레이션 적용 시각 < 현재 시점
# AND 마이그레이션 적용 후 N 일간 0 에러
# → fix 인과 검증 PASS
```

### 베이스라인 라이브 호출 (보조 검증)

```bash
# 인증 게이트 동작 확인 (401 + Korean error envelope + stack leak 없음)
wsl -d Ubuntu -- curl -sS -o /tmp/auth.json -w "HTTP=%{http_code} TIME=%{time_total}s\n" \
  http://localhost:3000/api/v1/auth/me

# Cross-tenant probe (auth gate 가 tenant resolve 보다 먼저 트리거 확인)
wsl -d Ubuntu -- curl -sS -o /tmp/xt.json -w "HTTP=%{http_code}\n" \
  http://localhost:3000/api/v1/t/nonexistent_tenant/messenger/conversations
```

### 본 사례 결과

```
2026-05-04 23:01:43 KST  ┐  4 errors burst (sticky_notes etc.)
2026-05-05 08:48:01 KST  ┤  7 errors burst — pre-migration
2026-05-05 08:51:58 KST  ┘  ★ 마지막 permission denied 에러
2026-05-05 08:57:15 KST  ★  S88 migration applied (DB 확정)
                            (5분 17초 간격 — "에러 인지 → 마이그레이션 작성 → 즉시 적용" 정책 실증)
2026-05-05 08:57:16 → 2026-05-10 현재  ✅ 5일+ 0 errors
```

추가 시그:
- ypserver-err.log 현재 0 bytes (5/6 rotation 후 5일간 stderr 무출력)
- ypserver online 5일, restart_time 24 (배포 사슬), unstable_restarts 0
- 베이스라인 호출 401 ≤10ms, stack leak 없음

## 교훈

1. **"운영자-only" 라벨은 검증 형태 가정에서 나옴 — 재평가하면 Claude 직접 가능 영역이 많다.** 정적 audit (`scripts/diag-readwrite-grants.sh` 같은) + PM2 log timeline + DB `_prisma_migrations` 조회 3종으로 클릭 워크플로우 없이 라이브 검증 가능.

2. **"마이그레이션 작성 = 즉시 적용" 정책 (`memory/feedback_migration_apply_directly.md`) 의 효용이 timestamp 로 증명된다.** 마지막 에러와 마이그레이션 적용이 5분 간격일 때, 그 사이의 인지 → 작성 → 적용 워크플로우가 prod 에서 작동하는 증거.

3. **0 byte log = 강한 clean 시그.** pm2-logrotate 가 매일 자정 rotation 하는데 N 일간 stderr 가 0 byte 라는 것은 단순한 "에러 없음" 보다 강한 시그널. 정상 access log 가 stderr 로 가지 않도록 관측성이 깨끗하게 분리되어 있음을 의미.

4. **Git Bash 경로 자동 변환 함정**: WSL 명령에 `/home/...` 경로 전달 시 Git Bash 가 `C:/Program Files/Git/home/...` 로 변환 시도. `MSYS_NO_PATHCONV=1` 환경변수로 우회 필수.

5. **Korean encoding + heredoc + 변수 expansion** 조합은 깨지기 쉬움. WSL 호출 시 `bash -c "..."` 보다 직접 명령 (`wsl -- tail -N FILE`) 또는 짧은 single-line 명령 권장.

## 관련 파일

- `prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql` — S88 마이그레이션
- `scripts/diag-readwrite-grants.sh` — 정적 GRANT audit (S89)
- `memory/feedback_migration_apply_directly.md` — 마이그레이션 직접 적용 정책
- `memory/feedback_grant_check_for_bypassrls_roles.md` — BYPASSRLS=t role GRANT 검증 정책 (S88 후속)
- `docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` — timezone 동급 audit 사례
- `~/ypserver/logs/ypserver-err__2026-05-05_00-07-15.log` + `~/ypserver/logs/ypserver-err__2026-05-06_00-39-54.log` — 에러 timeline 원천 (영구 보존)

## 향후 적용

- **운영자 carry-over 재평가 표준 절차**: 매 /cs 시 "P1 운영자" 라벨 항목을 1) 정적 audit 2) PM2 log timeline 3) DB 직접 조회 로 해소 가능한지 점검. 본 사례처럼 6 세션 누적 채무를 15분 내 해소 가능.
- **타 마이그레이션 검증**: 향후 GRANT/RLS/schema 마이그레이션 적용 시 동일 패턴 (timeline correlation) 으로 Claude 가 직접 검증 → carry-over 누적 차단.
