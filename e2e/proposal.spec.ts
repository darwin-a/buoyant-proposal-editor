import { test, expect } from '@playwright/test'

// Full flow: sign in → load the sample proposal → view it. Also captures a screenshot
// so we can eyeball the editor surface. Requires Postgres up (docker compose up -d db).
test('sign in, load sample, view proposal', async ({ page }) => {
  await page.goto('/login')

  // demo quick-pick: sign in as Darwin
  await page.getByRole('button', { name: /Darwin Agunos/ }).click()
  await page.waitForURL('http://localhost:3005/')

  // try a sample → lands on the proposal
  await page.getByRole('button', { name: /try a sample/i }).click()
  await page.waitForURL(/\/proposals\//, { timeout: 30_000 })

  await expect(page.getByRole('heading', { name: 'OUR FIRM' })).toBeVisible()
  await expect(page.getByText('Locked facts', { exact: false })).toBeVisible()

  await page.screenshot({ path: 'e2e/screenshots/proposal-view.png', fullPage: true })
})
