import { test, expect, type Page } from '@playwright/test'

async function openSample(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /Darwin Agunos/ }).click()
  await page.waitForURL('http://localhost:3005/')
  await page.getByRole('button', { name: /try a sample/i }).click()
  await page.waitForURL(/\/proposals\//, { timeout: 30_000 })
  await page.waitForSelector('.doc-editor')
}

test('AI edit: select a block, ask AI, review diff, apply, persist', async ({ page }) => {
  await openSample(page)

  // click into the OUR FIRM paragraph (the 40th-anniversary one)
  await page.locator('.doc-editor p', { hasText: '40th anniversary' }).first().click()

  // ask AI
  await page.getByRole('button', { name: /Ask AI/ }).click()
  await page.getByPlaceholder(/Tell the AI/).fill('change anniversary to milestone')
  await page.getByRole('button', { name: 'Propose' }).click()

  // diff + rationale appear
  await expect(page.getByText(/Replaced/)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/04-ai-diff.png' })

  // apply → saved, block text changed, persists across reload
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('All changes saved')).toBeVisible()
  await expect(page.locator('.doc-editor', { hasText: '40th milestone' })).toBeVisible()

  await page.reload()
  await expect(page.getByText(/40th milestone/)).toBeVisible()
})
