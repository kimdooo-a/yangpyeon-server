// PLUGIN-MIG-4 (S100): multi-file schema 활성화.
// schema 디렉토리(`prisma/`)에 있는 모든 .prisma 파일이 자동 머지됨 — Prisma v6.7.0+ GA.
// 컨슈머별 fragment.prisma (예: packages/tenant-almanac/prisma/fragment.prisma) 는
// `npm run prisma:assemble` 실행 시 `prisma/<tenant-id>.prisma` 로 복사되어
// schema.prisma 와 cross-file 모델 참조 가능 (Tenant.contentCategories 등).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
