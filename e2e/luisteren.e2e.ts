import type { Page } from '@playwright/test'
import { test, expect, backend } from './helpers'
import { baseSeed, ids, audioUrl } from './seed'
import { UPLOAD_M4A } from './server/ports.mjs'

test.beforeEach(async () => {
  await backend.reset()
})

const position = (page: Page) => page.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)

async function chooseListener(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Luisteren/ }).click()
  await page.getByRole('button', { name: /Magali/ }).click()
}

test('kind kiest naam, boek en hoofdstuk en hoort de opname', async ({ page, problems }) => {
  await chooseListener(page)
  await page.getByRole('button', { name: /Kikker is Kikker/ }).click()
  await page.getByRole('button', { name: /Kikker en de vreemdeling/ }).click()
  await expect(page.getByText('Voorgelezen door Tantanne')).toBeVisible()
  const play = page.getByRole('button', { name: 'Afspelen' })
  if (await play.isVisible().catch(() => false)) await play.click()
  await expect.poll(() => position(page), { timeout: 15_000 }).toBeGreaterThan(2)

  // Waar ze gebleven is, staat op haar naam in de database
  await expect
    .poll(async () => (await backend.state()).tables.progress.filter((p) => p.listener_id === ids.magali).length, { timeout: 20_000 })
    .toBe(1)
  expect(problems).toEqual([])
})

test('deellink op een apparaat dat de app nog nooit zag opent het juiste hoofdstuk', async ({ page }) => {
  await page.goto(`/luisteren?hoofdstuk=${ids.kikker2}`)
  const who = page.getByRole('heading', { name: 'Wie gaat luisteren?' })
  const player = page.getByText('Voorgelezen door Bomma')
  await expect(who.or(player)).toBeVisible()
  if (await who.isVisible()) await page.getByRole('button', { name: /Magali/ }).click()
  await expect(player, 'na het kiezen van een naam staat het gedeelde hoofdstuk klaar').toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kikker is bang' })).toBeVisible()
})

test('halverwege gestopt: de startpagina biedt aan om verder te luisteren', async ({ page }) => {
  await chooseListener(page)
  await page.getByRole('button', { name: /Kikker is Kikker/ }).click()
  await page.getByRole('button', { name: /Kikker en de vreemdeling/ }).click()
  const play = page.getByRole('button', { name: 'Afspelen' })
  if (await play.isVisible().catch(() => false)) await play.click()
  await expect.poll(() => position(page), { timeout: 20_000 }).toBeGreaterThan(11)
  await page.goto('/')
  await expect(page.getByText(/Verder luisteren, Magali/)).toBeVisible()
  await expect(page.getByText(/Kikker en de vreemdeling/)).toBeVisible()
})

test('hoofdstuk uit: het volgende voorgelezen hoofdstuk komt vanzelf', async ({ page }) => {
  await chooseListener(page)
  await page.getByRole('button', { name: /Kikker is Kikker/ }).click()
  await page.getByRole('button', { name: /Kikker en de vreemdeling/ }).click()
  const play = page.getByRole('button', { name: 'Afspelen' })
  if (await play.isVisible().catch(() => false)) await play.click()
  await expect.poll(() => position(page), { timeout: 15_000 }).toBeGreaterThan(1)
  // Doorspoelen naar vlak voor het eind
  await page.evaluate(() => {
    const audio = document.querySelector('audio')!
    audio.currentTime = audio.duration - 3
  })
  await expect(page.getByRole('heading', { name: 'Kikker is bang' })).toBeVisible({ timeout: 40_000 })
  // Ook nadat het volgende hoofdstuk is begonnen blijft hoofdstuk 1 uitgeluisterd
  await page.waitForTimeout(3000)
  const done = (await backend.state()).tables.progress.find((p) => p.chapter_id === ids.kikker1)
  expect(done?.completed, 'hoofdstuk 1 staat als uitgeluisterd').toBe(true)
  const local = await page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('voorleesbibliotheek_progress_'))!
    return JSON.parse(localStorage.getItem(key)!)[id]
  }, ids.kikker1)
  expect(local.completed).toBe(true)
})

test('kind voegt zichzelf toe als luisteraar', async ({ page }) => {
  await page.goto('/luisteren')
  await page.getByRole('button', { name: 'Luisteraar toevoegen' }).click()
  await page.getByPlaceholder('Naam van het kind...').fill('Noor')
  await page.getByRole('button', { name: 'Toevoegen' }).click()
  await expect
    .poll(async () => (await backend.state()).tables.users.find((u) => u.name === 'Noor')?.role)
    .toBe('listener')
})

test('twee voorlezers voor één hoofdstuk: het kind kan kiezen', async ({ page }) => {
  const seed = baseSeed()
  seed.tables.recordings.push({
    id: 'e0000000-0000-4000-8000-000000000009',
    chapter_id: ids.kikker1,
    reader_id: ids.bomma,
    audio_url: audioUrl(`${ids.recKikker2}.webm`),
    duration_seconds: 8,
    created_at: '2026-10-07T10:00:00.000+00:00',
  })
  await backend.reset(seed)
  await chooseListener(page)
  await page.getByRole('button', { name: /Kikker is Kikker/ }).click()
  await page.getByRole('button', { name: /Kikker en de vreemdeling/ }).click()
  await expect(page.getByText(/Tantanne/).first()).toBeVisible()
  await expect(page.getByText(/Bomma/).first(), 'de tweede voorlezer is te kiezen').toBeVisible()
})

test('opname in mp4 (iPhone-formaat) speelt af', async ({ page }) => {
  const seed = baseSeed()
  const id = 'e0000000-0000-4000-8000-000000000021'
  seed.tables.recordings.push({
    id, chapter_id: ids.minoes1, reader_id: ids.tantanne,
    audio_url: audioUrl(`${id}.mp4`), duration_seconds: 8, created_at: '2026-10-08T10:00:00.000+00:00',
  })
  ;(seed.objects as Record<string, string>)[`${id}.mp4`] = UPLOAD_M4A
  await backend.reset(seed)
  await chooseListener(page)
  await page.getByRole('button', { name: /Minoes/ }).click()
  await page.getByRole('button', { name: /De poes die juffrouw werd/ }).click()
  const play = page.getByRole('button', { name: 'Afspelen' })
  if (await play.isVisible().catch(() => false)) await play.click()
  await expect.poll(() => position(page), { timeout: 15_000 }).toBeGreaterThan(2)
})

test('audiobestand is weg: het kind krijgt een melding, geen eeuwig draaiend wieltje', async ({ page }) => {
  const seed = baseSeed()
  delete (seed.objects as Record<string, string>)[`${ids.recKikker1}.webm`]
  await backend.reset(seed)
  await chooseListener(page)
  await page.getByRole('button', { name: /Kikker is Kikker/ }).click()
  await page.getByRole('button', { name: /Kikker en de vreemdeling/ }).click()
  await expect(page.getByRole('heading', { name: 'Kon audio niet laden' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Opnieuw proberen' })).toBeVisible()
})
