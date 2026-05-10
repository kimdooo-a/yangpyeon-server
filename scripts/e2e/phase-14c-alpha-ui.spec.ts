import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://stylelucky4u.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} env var required — set in .env.test.local or export before running. 시크릿은 코드에 박지 말 것.`,
    );
  }
  return value;
}

const EMAIL = requireEnv("E2E_USERNAME");
const PASS = requireEnv("E2E_PASSWORD");

/**
 * 공통 로그인 헬퍼.
 * - src/app/login/page.tsx 는 input에 name 속성이 없고 id만 있으므로 #email/#password 사용.
 * - 로그인 성공 시 router.push("/") 로 홈 이동 → URL이 root 또는 임의 dashboard 경로가 됨.
 */
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASS);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.describe("Phase 14c-α 인라인 편집", () => {
  test("E1: 셀 편집 해피패스", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const firstNameCell = page
      .locator("tbody tr")
      .first()
      .locator("button")
      .filter({ hasText: /^[^N].*/ })
      .first();
    await firstNameCell.click();
    const input = page.locator("input:focus, textarea:focus").first();
    await input.fill("alpha-E1-edited");
    await input.press("Enter");
    await expect(page.locator("text=alpha-E1-edited")).toBeVisible({ timeout: 5_000 });
  });

  test("E3: Esc 취소", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const firstNameCell = page.locator("tbody tr").first().locator("button").first();
    const original = await firstNameCell.textContent();
    await firstNameCell.click();
    const input = page.locator("input:focus, textarea:focus").first();
    await input.fill("should-be-discarded");
    await input.press("Escape");
    await expect(page.locator("tbody tr").first().locator("button").first()).toHaveText(original ?? "");
  });

  test("E5: PK/system 컬럼 readonly", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const headerCells = await page.locator("thead th").allTextContents();
    const idIdx = headerCells.findIndex((h) => h.includes("id") && !h.includes("owner"));
    expect(idIdx).toBeGreaterThanOrEqual(0);
    const idCell = page.locator(`tbody tr:first-child td:nth-child(${idIdx + 1})`);
    await expect(idCell.locator("button")).toHaveCount(0);
  });

  test("E6: FULL_BLOCK 테이블 users — 모든 편집 비허용", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/users`);
    await expect(page.locator("tbody tr:first-child button").first()).toHaveCount(0);
  });
});

/**
 * Smoke 케이스 — 로그인 자체가 동작하지 않으면 위 4개가 전부 실패하므로,
 * 진단용으로 별도 분리. baseURL 검증 + 로그인 후 home 도달까지를 확인한다.
 */
test.describe("Phase 14c-α smoke", () => {
  test("S1: /login 200 OK & 폼 노출", async ({ page }) => {
    const res = await page.goto(`${BASE}/login`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("S2: 로그인 성공 시 /login 이탈", async ({ page }) => {
    await login(page);
    expect(page.url()).not.toContain("/login");
  });
});
