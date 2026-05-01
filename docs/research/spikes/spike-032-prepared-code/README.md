# SP-032 사전 코드 V0 — ADR-032 ACCEPTED 직후 즉시 적용용

> 작성: 2026-05-01 (세션 71)
> 상태: 사전 작성 (ACCEPTED 게이트 통과 시 즉시 src/ 이동)
> ADR: [ADR-032](../../decisions/ADR-032-filebox-large-file-uploads.md) PROPOSED

---

## 폴더 내용

| 파일 | 적용 대상 | 작성 분량 |
|------|----------|----------|
| `migration.sql.txt` | `prisma/migrations/<TS>_add_file_storage_type/migration.sql` | additive 1 컬럼 |
| `r2-client.ts.txt` | `src/lib/r2.ts` | S3 SDK 래퍼 (presigned URL 발급) |
| `route-r2-presigned.ts.txt` | `src/app/api/v1/filebox/files/r2-presigned/route.ts` | POST 발급 |
| `route-r2-confirm.ts.txt` | `src/app/api/v1/filebox/files/r2-confirm/route.ts` | POST 메타 등록 |
| `env.example.txt` | `.env` 추가 라인 | 5 변수 |
| `package-deps.txt` | npm install 명령 | 2 의존성 |

---

## ACCEPTED 후 적용 절차 (5분)

```bash
# 1. 의존성 설치 (cat package-deps.txt 참조)
npm install @aws-sdk/client-s3@^3.620.0 @aws-sdk/s3-request-presigner@^3.620.0

# 2. 마이그레이션 파일 위치
mkdir -p prisma/migrations/20260502000000_add_file_storage_type
cp docs/research/spikes/spike-032-prepared-code/migration.sql.txt \
   prisma/migrations/20260502000000_add_file_storage_type/migration.sql

# 3. R2 client 모듈
cp docs/research/spikes/spike-032-prepared-code/r2-client.ts.txt src/lib/r2.ts

# 4. 라우트 2개
mkdir -p src/app/api/v1/filebox/files/r2-presigned
mkdir -p src/app/api/v1/filebox/files/r2-confirm
cp docs/research/spikes/spike-032-prepared-code/route-r2-presigned.ts.txt \
   src/app/api/v1/filebox/files/r2-presigned/route.ts
cp docs/research/spikes/spike-032-prepared-code/route-r2-confirm.ts.txt \
   src/app/api/v1/filebox/files/r2-confirm/route.ts

# 5. .env 추가 (직접 편집)
cat docs/research/spikes/spike-032-prepared-code/env.example.txt >> .env

# 6. Prisma schema 패치 (수동 1줄)
#    File 모델에 다음 추가:
#      storageType String @default("local") @map("storage_type")

# 7. Prisma client 재생성 + 마이그레이션 적용 (Claude 직접)
wsl -- bash -lic 'cd /mnt/e/00_develop/260406_luckystyle4u_server && \
  DATABASE_URL="postgresql://postgres:<DB_PASSWORD>@localhost:5432/luckystyle4u?schema=public" \
  npx prisma generate && npx prisma migrate deploy'

# 8. ypserver 재배포
/ypserver

# 9. PoC 측정 (spike-032 §4.2 6 항목)
```

---

## fallback 시 폐기

PoC 결과 옵션 A No-Go 시 (R2 SDK 자체 동작 안 함, CORS 차단 등) → 본 폴더 전체 무용. ADR-032 §3 옵션 D (Web Stream → disk) 로 fallback. 그 경우 본 사전 코드는 git 미적용 상태로 폐기 (커밋 0).

---

## 패턴 준수

- **`tenantPrismaFor` 적용**: filebox-db.ts 가 현재 단일 사용자 컨텍스트로 `tenant/no-raw-prisma-without-tenant` lint disable 처리 → R2 라우트도 동일 패턴. T1.5 멀티테넌트 filebox 전환 시 일괄 변경.
- **`withAuth` 가드**: 기존 filebox 라우트와 동일 — 인증 사용자만 호출 가능.
- **Zod 입력 검증**: `src/lib/schemas/filebox.ts` 기존 패턴 활용.
- **에러 응답**: `errorResponse(code, message, status)` 기존 패턴.
