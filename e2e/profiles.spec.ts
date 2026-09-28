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

  // Add a trip and leave it open-ended: 2026-09-18 → still abroad on 2026-09-28 = 10 full days.
  await page.getByRole('button', { name: '+ Add trip' }).click()
  const row = page.locator('table.trips tbody tr').last()
  await row.locator('input[type=date]').nth(0).fill('2026-09-18')
  await row.locator('input[type=date]').nth(1).fill('')
  await expect(row.getByText('still abroad')).toBeVisible()
  await expect(row.locator('td.num')).toContainText('10 so far')
  await expect(stat(page, 'Absent in 3-year window')).toContainText('10 / 270')

  // An open-ended trip cannot start in the future.
  await row.locator('input[type=date]').nth(0).fill('2026-10-10')
  await expect(page.getByRole('alert')).toContainText('cannot start after today')
  await row.locator('input[type=date]').nth(0).fill('2026-09-18')
  await expect(page.getByRole('alert')).toHaveCount(0)

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
  await expect(page.getByRole('status')).toContainText('1 added, 0 replaced')
  await expect(page.getByRole('status')).toContainText('local-bad')
  await expect(page.getByRole('tab', { name: 'Imported' })).toBeVisible()

  // Importing the same id again replaces it instead of duplicating.
  await page.locator('input[type=file]').setInputFiles(file)
  await expect(page.getByRole('status')).toContainText('0 added, 1 replaced')
  await expect(page.getByRole('tab', { name: 'Imported' })).toHaveCount(1)

  // Unsupported version and malformed shapes are rejected without adding anything.
  const bad = { name: 'v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'uk-days', version: 2, profiles: [] })) }
  await page.locator('input[type=file]').setInputFiles(bad)
  await expect(page.getByRole('status')).toContainText('unsupported export version 2')
  const shape = { name: 'shape.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ name: 'S', arrivedUK: '2023-05-01', absences: [{ out: ['2024-01-01'], in: '2024-01-05' }] })) }
  await page.locator('input[type=file]').setInputFiles(shape)
  await expect(page.getByRole('status')).toContainText('"out" must be a string')
  await expect(page.getByRole('tab', { name: 'S', exact: true })).toHaveCount(0)
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
