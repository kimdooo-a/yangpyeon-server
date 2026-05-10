import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "./src") },
      // Phase 1.5: app-side 가 packages/core 의 pure 모듈 (lock-key, circuit-breaker-state) 을 사용.
      // npm install 은 미완 — vitest 는 path alias 로 직접 src/ 해석.
      // Phase 1.4(T1.4): prisma-tenant-client 가 @yangpyeon/core/tenant/context 서브패스 사용 — wildcard alias 우선 매칭.
      { find: /^@yangpyeon\/core\/(.*)$/, replacement: resolve(__dirname, "./packages/core/src") + "/$1" },
      { find: "@yangpyeon/core", replacement: resolve(__dirname, "./packages/core/src/index.ts") },
    ],
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "packages/**/src/**/*.test.ts",
    ],
    // Playwright spec(`scripts/e2e/**/*.spec.ts`)이 vitest 스코프에 끌려오지 않도록 명시 제외.
    exclude: ["node_modules/**", "scripts/**"],
    // INFRA-2 (S98) — MSW 서버 부트스트랩 + jsdom 전용 jest-dom matcher.
    // 파일별 jsdom opt-in 은 `// @vitest-environment jsdom` 주석 사용.
    setupFiles: ["./src/test/setup.ts"],
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
