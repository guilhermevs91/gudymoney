import { test, expect } from '@playwright/test';

const testEmail = `e2e_${Date.now()}@example.com`;
const testPassword = 'TestPass123!';
const testName = 'E2E User';

test.describe('Autenticação', () => {
  test('cadastro de novo usuário', async ({ page }) => {
    await page.goto('/register');

    await page.fill('#name', testName);
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirm', testPassword);

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('login com e-mail e senha', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
  });

  test('rejeita credenciais inválidas', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'invalido@example.com');
    await page.fill('#password', 'SenhaErrada123!');
    await page.click('button[type="submit"]');

    await expect(page.getByText(/erro ao entrar|credenciais/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('redireciona para /login quando não autenticado', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login', { timeout: 5_000 });
  });
});
