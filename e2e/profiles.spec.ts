import { expect, test } from '@playwright/test'
import { openApp, stat } from './helpers'

test('creates a spouse-route profile from the preset, edits and deletes it', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'New profile' }).click()
  const form = page.locator('form.new-profile')
  await form.getByLabel('Name').fill('Anna')
  await form.getByLabel('Arrived in the UK').fill('2024-01-15')
  await form.getByRole('radio', { name: /Spouse/ }).check()
  await form.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByRole('tab', { name: 'Anna' })).toHaveAttribute('aria-selected', 'true')
  await expect(stat(page, 'Absent in 3-year window')).toContainText('0 / 270')
  await expect(stat(page, 'ILR needed')).toBeVisible()

  // Add a trip and leave it open-ended.
  await page.getByRole('button', { name: '+ Add trip' }).click()
  const row = page.locator('table.trips tbody tr').last()
  await row.locator('input[type=date]').nth(0).fill('2026-10-10')
  await row.locator('input[type=date]').nth(1).fill('')
  await expect(row.getByText('still abroad')).toBeVisible()

  // Survives a reload (localStorage).
  await page.reload()
  await page.getByRole('tab', { name: 'Anna' }).click()
  await expect(page.locator('table.trips tbody tr')).toHaveCount(1)

  // Delete needs two clicks.
  await page.getByRole('button', { name: 'Delete profile' }).click()
  await page.getByRole('button', { name: 'Click again to delete' }).click()
  await expect(page.getByRole('tab', { name: 'Anna' })).toHaveCount(0)
})

test('rejects an overlapping trip but keeps the last valid state', async ({ page }) => {
  await openApp(page)
  const rows = page.locator('table.trips tbody tr')
  const before = await rows.count()
  await page.getByRole('button', { name: '+ Add trip' }).click()
  await rows.last().locator('input[type=date]').nth(0).fill('2026-07-20') // inside the 10 Jul–15 Aug trip
  await expect(page.getByRole('alert')).toContainText('overlaps')
  // The valid trip added just before still counts; the overlapping edit does not.
  await expect(stat(page, 'Absent in 5-year window')).toContainText('299 / 450')
  await page.getByRole('button', { name: /Reset to profiles\/example-standard\.json/ }).click()
  await expect(rows).toHaveCount(before)
  await expect(stat(page, 'Absent in 5-year window')).toContainText('293 / 450')
})

test('imports an export file and reports invalid profiles', async ({ page }) => {
  await openApp(page)
  const file = {
    name: 'uk-days.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        app: 'uk-days',
        version: 1,
        profiles: [
          { id: 'local-imp', raw: { name: 'Imported', arrivedUK: '2023-05-01', absences: [] } },
          { id: 'local-bad', raw: { name: 'Bad', arrivedUK: '2023-05-01', absences: [{ out: '2024-01-20', in: '2024-01-10' }] } },
        ],
      }),
    ),
  }
  await page.locator('input[type=file]').setInputFiles(file)
  await expect(page.getByRole('status')).toContainText('1 profile(s) imported')
  await expect(page.getByRole('status')).toContainText('local-bad')
  await expect(page.getByRole('tab', { name: 'Imported' })).toBeVisible()
})

test('export downloads a JSON file with every profile', async ({ page }) => {
  await openApp(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all' }).click()])
  expect(download.suggestedFilename()).toMatch(/^uk-days-profiles-.*\.json$/)
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString())
  const data = JSON.parse(text)
  expect(data.app).toBe('uk-days')
  expect(data.profiles.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['example-standard', 'example-spouse']))
})
