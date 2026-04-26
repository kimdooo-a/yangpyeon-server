import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // Phase 1.5: app-side 가 packages/core 의 pure 모듈 (lock-key, circuit-breaker-state) 을 사용.
      // npm install 은 미완 — vitest 는 path alias 로 직접 src/ 해석.
      "@yangpyeon/core": resolve(__dirname, "./packages/core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "tests/**/*.test.ts",
      "packages/**/src/**/*.test.ts",
    ],
    // Playwright spec(`scripts/e2e/**/*.spec.ts`)이 vitest 스코프에 끌려오지 않도록 명시 제외.
    exclude: ["node_modules/**", "scripts/**"],
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
