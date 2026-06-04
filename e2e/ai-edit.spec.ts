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

  // highlight the OUR FIRM paragraph (the 40th-anniversary one) → floating menu
  await page.locator('.doc-editor p', { hasText: '40th anniversary' }).first().click({ clickCount: 3 })

  // ask AI via the floating ✨ trigger
  const askAi = page.getByRole('button', { name: /Ask AI/ })
  await expect(askAi).toBeVisible()
  await askAi.click({ force: true })
  const input = page.getByPlaceholder(/Tell the AI/)
  await input.fill('change anniversary to milestone')
  await input.press('Enter')

  // diff + rationale appear
  await expect(page.getByText(/Replaced/)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/04-ai-diff.png' })

  // apply → saved, block text changed, persists across reload
  await page.getByRole('button', { name: 'Apply' }).click({ force: true })
  await expect(page.getByText('All changes saved')).toBeVisible()
  await expect(page.locator('.doc-editor', { hasText: '40th milestone' })).toBeVisible()

  await page.reload()
  await expect(page.getByText(/40th milestone/)).toBeVisible()
})

test('locked-field guard warns when an edit collaterally changes a locked fact', async ({ page }) => {
  await openSample(page)

  // intro paragraph contains the locked firm name + client
  await page.locator('.doc-editor p', { hasText: 'pleased to present qualifications' }).first().click({ clickCount: 3 })
  const askAi = page.getByRole('button', { name: /Ask AI/ })
  await expect(askAi).toBeVisible()
  await askAi.click({ force: true })

  // "change MECO to MECO Inc" mangles "MECO Engineering Company, Inc." (a locked fact)
  const input = page.getByPlaceholder(/Tell the AI/)
  await input.fill('change MECO to MECO Inc')
  await input.press('Enter')

  await expect(page.getByText(/also changes a locked fact/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Apply anyway' })).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/05-locked-guard.png' })
})

test('mock: literal "change Dixon to Walia" replaces and applies', async ({ page }) => {
  await openSample(page)

  await page.locator('.doc-editor p', { hasText: 'pleased to present qualifications' }).first().click({ clickCount: 3 })
  const askAi = page.getByRole('button', { name: /Ask AI/ })
  await expect(askAi).toBeVisible()
  await askAi.click({ force: true })

  const input = page.getByPlaceholder(/Tell the AI/)
  await input.fill('change Dixon to Walia')
  await input.press('Enter')

  await expect(page.getByText(/Replaced "Dixon"/)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/06-mock-change.png' })

  await page.getByRole('button', { name: /^Apply/ }).click({ force: true })
  await expect(page.getByText('All changes saved')).toBeVisible()
  await expect(page.locator('.doc-editor', { hasText: 'City of Walia' })).toBeVisible()
})
