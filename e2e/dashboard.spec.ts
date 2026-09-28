import { expect, test } from '@playwright/test'
import { SPOUSE, STANDARD, openApp, stat } from './helpers'

test('shows the file profiles and their key numbers', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('tab', { name: STANDARD })).toHaveAttribute('aria-selected', 'true')
  await expect(stat(page, 'Earliest application date')).toContainText('31 Aug 2027')
  await expect(stat(page, 'Absent in 5-year window')).toContainText('293 / 450')
  await expect(stat(page, 'Still allowed before target')).toContainText('157 d')

  await page.getByRole('tab', { name: SPOUSE }).click()
  await expect(stat(page, 'Absent in 3-year window')).toContainText('/ 270')
  await expect(stat(page, 'ILR needed')).toBeVisible()
})

test('what-if slider shifts the earliest date and shows extra days', async ({ page }) => {
  await openApp(page)
  const days = page.locator('.controls input[type=number]')
  await days.fill('100')
  await expect(stat(page, 'Absent in 5-year window')).toContainText('what-if')
  await expect(stat(page, 'Earliest application date')).not.toContainText('31 Aug 2027')
  await days.fill('0')
  await expect(stat(page, 'Earliest application date')).toContainText('31 Aug 2027')
})

test('language switch persists and renders Russian', async ({ page }) => {
  await openApp(page)
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('учёт дней')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('учёт дней')
})

test('Arabic renders right-to-left while charts stay left-to-right', async ({ page }) => {
  await openApp(page, 'ar')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('.chart-scroll').first()).toHaveCSS('direction', 'ltr')
})

test('page never scrolls horizontally', async ({ page }) => {
  await openApp(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a corrupt browser override is set aside instead of blanking the page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('uk-days:profile:example-standard', JSON.stringify({ name: 'X', arrivedUK: '2022-09-01', rules: { windowYears: 300000 }, absences: [] })))
  await openApp(page)
  await expect(page.getByRole('alert').first()).toContainText('no longer pass validation')
  await expect(stat(page, 'Absent in 5-year window')).toContainText('293 / 450')
})

test('an invalid ?today= value falls back to the real date', async ({ page }) => {
  await page.goto('/?today=2026-99-99')
  await expect(page.getByRole('tab', { name: STANDARD })).toBeVisible()
  await expect(page.locator('.today')).not.toContainText('NaN')
})
