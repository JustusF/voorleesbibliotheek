import type { Page } from '@playwright/test'
import { test, expect, backend } from './helpers'
import { ids } from './seed'
import { ADMIN_PIN } from './server/ports.mjs'

test.beforeEach(async () => {
  await backend.reset()
})

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

async function login(page: Page) {
  await page.goto('/beheer')
  await expect(page.getByRole('heading', { name: 'Voer pincode in' })).toBeVisible()
  await typePin(page, ADMIN_PIN)
  await expect(page.getByRole('heading', { name: /boeken/ })).toBeVisible()
}

test('beheerder logt in en verwijdert een opname: rij en bestand zijn weg', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Bekijken' }).first().click()
  await expect(page.getByText('Kikker en de vreemdeling')).toBeVisible()
  await page.getByRole('button', { name: /Opnames van hoofdstuk 1 tonen/ }).click()
  await page.getByRole('button', { name: 'Opname van Tantanne verwijderen' }).click()
  await page.getByRole('button', { name: /^(Ja|Verwijder)/ }).last().click()

  await expect
    .poll(async () => (await backend.state()).tables.recordings.some((r) => r.id === ids.recKikker1))
    .toBe(false)
  const state = await backend.state()
  expect(state.objects.some((o) => o.name.startsWith(ids.recKikker1)), 'audiobestand is ook weg').toBe(false)
  // Na opnieuw laden komt hij niet terug uit de lokale kopie
  await page.reload()
  await page.waitForTimeout(2500)
  expect((await backend.state()).tables.recordings.some((r) => r.id === ids.recKikker1)).toBe(false)
})

test('beheerder verwijdert een boek: hoofdstukken en opnames gaan mee', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Kikker is Kikker verwijderen' }).click()
  await page.getByRole('button', { name: /^(Ja|Verwijder)/ }).last().click()
  await expect.poll(async () => (await backend.state()).tables.books.length).toBe(1)
  const state = await backend.state()
  expect(state.tables.chapters.filter((c) => c.book_id === ids.kikker)).toHaveLength(0)
  expect(state.tables.recordings).toHaveLength(0)
})

test('beheerder voegt een boek met hoofdstukken toe', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: '+ Boek toevoegen' }).click()
  await page.getByPlaceholder('Bijv. Kikker en zijn vriendjes').fill('Jip en Janneke')
  await page.getByPlaceholder('Bijv. Max Velthuijs').fill('Annie M.G. Schmidt')
  await page.getByPlaceholder(/De ontmoeting/).fill('Poppejans gaat varen\nEen kuil graven')
  await page.getByRole('button', { name: 'Toevoegen', exact: true }).click()
  await expect.poll(async () => (await backend.state()).tables.books.some((b) => b.title === 'Jip en Janneke')).toBe(true)
  const state = await backend.state()
  const book = state.tables.books.find((b) => b.title === 'Jip en Janneke')!
  await expect.poll(async () => (await backend.state()).tables.chapters.filter((c) => c.book_id === book.id).length).toBe(2)
})

test('beheerder kopieert de persoonlijke link van een voorlezer', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page)
  await page.getByRole('button', { name: 'Voorlezers' }).click()
  await page.getByRole('button', { name: 'Kopieer link' }).first().click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(new RegExp(`/voorlezen\\?wie=${ids.tantanne}$`))
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Welk hoofdstuk?' })).toBeVisible()
})

test('verkeerde pincode: duidelijke melding en niets is aanpasbaar', async ({ page }) => {
  await page.goto('/beheer')
  await typePin(page, '1111')
  await expect(page.getByText('Onjuiste pincode')).toBeVisible()
  await expect(page.getByRole('heading', { name: /boeken/ })).toHaveCount(0)
  await expect(page.getByText(/ADMIN_PIN_HASH/), 'geen technische termen in de melding').toHaveCount(0)
  // Daarna met de goede code er gewoon in
  await typePin(page, ADMIN_PIN)
  await expect(page.getByRole('heading', { name: /boeken/ })).toBeVisible()
})
