import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://stylelucky4u.com";
const EMAIL = "kimdooo@stylelucky4u.com";
const PASS = "Knp13579!yan";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(tables|$)/, { timeout: 10000 });
}

test.describe("Phase 14c-α 인라인 편집", () => {
  test("E1: 셀 편집 해피패스", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const firstNameCell = page.locator('tbody tr').first().locator('button').filter({ hasText: /^[^N].*/ }).first();
    await firstNameCell.click();
    const input = page.locator('input:focus, textarea:focus').first();
    await input.fill("alpha-E1-edited");
    await input.press("Enter");
    await expect(page.locator('text=alpha-E1-edited')).toBeVisible({ timeout: 5000 });
  });

  test("E3: Esc 취소", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const firstNameCell = page.locator('tbody tr').first().locator('button').first();
    const original = await firstNameCell.textContent();
    await firstNameCell.click();
    const input = page.locator('input:focus, textarea:focus').first();
    await input.fill("should-be-discarded");
    await input.press("Escape");
    await expect(page.locator('tbody tr').first().locator('button').first()).toHaveText(original ?? "");
  });

  test("E5: PK/system 컬럼 readonly", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const headerCells = await page.locator('thead th').allTextContents();
    const idIdx = headerCells.findIndex((h) => h.includes("id") && !h.includes("owner"));
    expect(idIdx).toBeGreaterThanOrEqual(0);
    const idCell = page.locator(`tbody tr:first-child td:nth-child(${idIdx + 1})`);
    await expect(idCell.locator('button')).toHaveCount(0);
  });

  test("E6: FULL_BLOCK 테이블 users — 모든 편집 비허용", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/users`);
    await expect(page.locator('tbody tr:first-child button').first()).toHaveCount(0);
  });
});
