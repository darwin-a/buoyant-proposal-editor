import { test, expect } from '@playwright/test'
import { join } from 'node:path'

const FIXTURES = join(process.cwd(), 'docs', 'ExampleProposals', 'proposals')

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /Darwin Agunos/ }).click()
  await page.waitForURL('http://localhost:3005/')
}

// The whole point of moving parsing into the browser: a PDF far larger than Vercel's
// 4.5 MB request-body limit must still upload, because only the parsed JSON is POSTed.
test('uploads easy.pdf (13 MB) via in-browser parse', async ({ page }) => {
  await signIn(page)
  await page.setInputFiles('input[type=file]', join(FIXTURES, 'easy.pdf'))
  await page.waitForURL(/\/proposals\//, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'OUR FIRM' })).toBeVisible()
})

test('uploads hard.pdf (18 MB) — well over the 4.5 MB body limit', async ({ page }) => {
  await signIn(page)
  await page.setInputFiles('input[type=file]', join(FIXTURES, 'hard.pdf'))
  await page.waitForURL(/\/proposals\//, { timeout: 60_000 })
  // We don't chase fidelity on the hard fixture — just prove the loop opens with content.
  await expect(page.getByText('Locked facts', { exact: false })).toBeVisible()
})
