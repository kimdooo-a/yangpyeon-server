import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 구성 — Phase 14c-α/γ E2E 자동화
 *
 * 환경변수:
 *   - E2E_BASE_URL: 대상 호스트 (기본: 프로덕션 stylelucky4u.com)
 *   - E2E_USERNAME / E2E_PASSWORD: 로그인 자격증명 (spec 내부에서 fallback 처리)
 *
 * 인증/세션 충돌 방지를 위해 fullyParallel=false, workers=1로 직렬 실행한다.
 */
export default defineConfig({
  testDir: "./scripts/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://stylelucky4u.com",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
