import { test, expect, type Page } from '@playwright/test';

// Helper: create a fresh user and navigate to dashboard
async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
}

const email = `txn_e2e_${Date.now()}@example.com`;
const password = 'TestPass123!';

test.describe('Transações', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/register');
    await page.fill('#name', 'Txn E2E User');
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.fill('#confirm', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
    await page.close();
  });

  test('navega para a tela de transações', async ({ page }) => {
    await loginAs(page, email, password);
    await page.click('a[href="/transactions"]');
    await expect(page).toHaveURL('/transactions');
    await expect(page.getByRole('heading', { name: /transações/i })).toBeVisible();
  });

  test('lista de transações é exibida', async ({ page }) => {
    await loginAs(page, email, password);
    await page.goto('/transactions');
    // Table or empty state should be visible
    const table = page.locator('table, [data-testid="empty-state"]');
    await expect(table.first()).toBeVisible({ timeout: 5_000 });
  });
});
