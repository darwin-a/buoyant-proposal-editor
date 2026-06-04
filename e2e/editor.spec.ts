import { test, expect, type Page } from '@playwright/test'

async function openSample(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /Darwin Agunos/ }).click()
  await page.waitForURL('http://localhost:3005/')
  await page.getByRole('button', { name: /try a sample/i }).click()
  await page.waitForURL(/\/proposals\//, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'OUR FIRM' })).toBeVisible()
}

test('edit a block in TipTap and persist across reload', async ({ page }) => {
  await openSample(page)

  // type a marker into the editable document
  const editor = page.locator('.doc-editor')
  await editor.click()
  await page.keyboard.type('EDITED-BY-TEST ')

  // save
  const saveBtn = page.getByRole('button', { name: 'Save' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  await expect(page.getByText('All changes saved')).toBeVisible()

  // reload → the edit persisted
  await page.reload()
  await expect(page.getByText('EDITED-BY-TEST', { exact: false })).toBeVisible()

  await page.screenshot({ path: 'e2e/screenshots/editor.png', fullPage: true })
})
