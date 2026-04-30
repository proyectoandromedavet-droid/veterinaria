import { test, expect } from '@playwright/test'

test('login screen renders required controls', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByTestId('login-page')).toBeVisible()
  await expect(page.getByTestId('login-email')).toBeVisible()
  await expect(page.getByTestId('login-password')).toBeVisible()
  await expect(page.getByTestId('login-submit')).toBeVisible()
})
