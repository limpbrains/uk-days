import type { Page } from '@playwright/test'

/** Names of the example profiles shipped in profiles/. */
export const STANDARD = 'Alex (example)'
export const SPOUSE = 'Sam (example, spouse route)'

/**
 * Opens the app on a fixed "today" so numbers in assertions are stable, in a given UI language.
 * The language is seeded once per tab (sessionStorage flag) so a later reload sees what the app saved.
 */
export async function openApp(page: Page, lang = 'en'): Promise<void> {
  await page.addInitScript((l) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('uk-days:lang', l)
      sessionStorage.setItem('e2e-seeded', '1')
    }
  }, lang)
  await page.goto('/?today=2026-09-28')
  await page.getByRole('tab', { name: STANDARD }).click()
}

export function stat(page: Page, label: string) {
  return page.locator('.stat', { hasText: label })
}
