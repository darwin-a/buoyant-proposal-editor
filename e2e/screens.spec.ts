import { test } from '@playwright/test'

// Visual-iteration harness: capture each key screen so we can review and refine the look.
// Run: pnpm exec playwright test e2e/screens.spec.ts
test.use({ viewport: { width: 1280, height: 900 } })

test('capture key screens', async ({ page }) => {
  // 1. login
  await page.goto('/login')
  await page.waitForSelector('text=Proposal Editor')
  await page.screenshot({ path: 'e2e/screenshots/01-login.png' })

  // 2. home (signed in — upload + recent proposals)
  await page.getByRole('button', { name: /Darwin Agunos/ }).click()
  await page.waitForURL('http://localhost:3005/')
  await page.waitForSelector('text=Edit a proposal')
  await page.screenshot({ path: 'e2e/screenshots/02-home.png' })

  // 3. editor (sample loaded) — viewport (above the fold) + full page
  await page.getByRole('button', { name: /try a sample/i }).click()
  await page.waitForURL(/\/proposals\//, { timeout: 30_000 })
  await page.waitForSelector('.doc-editor')
  await page.screenshot({ path: 'e2e/screenshots/03-editor-top.png' })
  await page.screenshot({ path: 'e2e/screenshots/03-editor-full.png', fullPage: true })
})
