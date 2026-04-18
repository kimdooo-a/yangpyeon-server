import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Phase 14c-C 초기 도입 범위: 순수 함수 유닛 테스트만.
    // DB/네트워크 의존 모듈(runReadwrite, API 핸들러)은 별도 세션 이관.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/db/**/*.ts"],
      exclude: ["src/lib/db/**/*.test.ts", "src/lib/db/index.ts", "src/lib/db/schema.ts"],
    },
  },
});
