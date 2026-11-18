import { test, expect, backend, audioStats, openChapterToRecord, record } from './helpers'
import { ids } from './seed'
import { UPLOAD_M4A } from './server/ports.mjs'

test.beforeEach(async () => {
  await backend.reset()
})

const recordingsOf = async (chapterId: string) =>
  (await backend.state()).tables.recordings.filter((r) => r.chapter_id === chapterId)

const fileOf = (row: Record<string, unknown>) => String(row.audio_url).split('/').pop()!

test('voorlezer neemt een hoofdstuk op via de persoonlijke link', async ({ page, problems }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await record(page, 6)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })

  const mine = await recordingsOf(ids.kikker3)
  expect(mine).toHaveLength(1)
  expect(mine[0].reader_id).toBe(ids.tantanne)
  expect(String(mine[0].audio_url)).toMatch(/\/storage\/v1\/object\/public\/audio\/.+\.webm$/)
  expect(Number(mine[0].duration_seconds)).toBeGreaterThanOrEqual(5)
  expect(Number(mine[0].duration_seconds)).toBeLessThanOrEqual(8)

  // Het bestand staat er, heeft de goede lengte en er is echt een stem te horen
  const stats = audioStats(fileOf(mine[0]))
  expect(stats.seconds).toBeGreaterThan(4.5)
  expect(stats.seconds).toBeLessThan(8.5)
  expect(stats.maxDb, 'opname is niet stil').toBeGreaterThan(-20)

  // Het slot is weer vrij voor de volgende voorlezer
  expect((await backend.state()).tables.recording_locks).toHaveLength(0)
  expect(problems).toEqual([])
})

test('de opname is daarna te beluisteren via de deellink', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await record(page, 5)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })

  // Een ander apparaat: schone browser, alleen de link uit het deelbericht
  const other = await page.context().browser()!.newContext()
  const listener = await other.newPage()
  await listener.goto(`/luisteren?hoofdstuk=${ids.kikker3}`)
  await listener.getByRole('button', { name: /Magali/ }).click()
  await expect(listener.getByText('Voorgelezen door Tantanne')).toBeVisible()
  // Een opname uit de browser heeft geen lengte in het bestand; de speler
  // moet toch een gewone tijd tonen
  await expect(listener.getByLabel(/Totale duur 0:0[4-7]/)).toBeVisible()
  await listener.getByRole('button', { name: 'Afspelen' }).click()
  await expect
    .poll(() => listener.evaluate(() => document.querySelector('audio')?.currentTime ?? 0), { timeout: 15_000 })
    .toBeGreaterThan(1.5)
  // Uitgeluisterd: dat staat daarna ook zo in de database
  await expect
    .poll(async () => (await backend.state()).tables.progress.find((p) => p.chapter_id === ids.kikker3)?.completed, { timeout: 20_000 })
    .toBe(true)
  await other.close()
})

test('opnieuw opnemen vervangt de eigen opname en laat die van een ander staan', async ({ page }) => {
  // Bomma leest hoofdstuk 1 voor; daar staat al een opname van Tantanne
  await openChapterToRecord(page, ids.bomma, /Kikker en de vreemdeling/)
  await page.getByRole('button', { name: 'Ja, nieuwe opname' }).click()
  await record(page, 4)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Bomma!' })).toBeVisible({ timeout: 20_000 })
  let rows = await recordingsOf(ids.kikker1)
  expect(rows.map((r) => r.reader_id).sort()).toEqual([ids.tantanne, ids.bomma].sort())
  const firstTake = rows.find((r) => r.reader_id === ids.bomma)!

  // En nog een keer: Bomma doet het over
  await page.getByRole('button', { name: 'Ander hoofdstuk' }).click()
  await page.getByRole('button', { name: /Kikker en de vreemdeling/ }).first().click()
  await page.getByRole('button', { name: 'Ja, nieuwe opname' }).click()
  await record(page, 7)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Bomma!' })).toBeVisible({ timeout: 20_000 })

  rows = await recordingsOf(ids.kikker1)
  expect(rows, 'geen dubbele opname van dezelfde voorlezer').toHaveLength(2)
  const secondTake = rows.find((r) => r.reader_id === ids.bomma)!
  expect(secondTake.id).toBe(firstTake.id)
  expect(secondTake.audio_url).not.toBe(firstTake.audio_url)
  expect(Number(secondTake.duration_seconds)).toBeGreaterThanOrEqual(6)
  expect(audioStats(fileOf(secondTake)).seconds).toBeGreaterThan(5.5)
  // Tantannes opname is onaangeroerd
  expect(rows.find((r) => r.reader_id === ids.tantanne)!.id).toBe(ids.recKikker1)
})

test('pauzeren telt niet mee in de lengte', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Pauzeer opname' }).click()
  await expect(page.getByRole('heading', { name: 'Gepauzeerd' })).toBeVisible()
  await page.waitForTimeout(4000)
  await page.getByRole('button', { name: 'Hervat opname' }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Stop opname' }).click()
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })

  const [row] = await recordingsOf(ids.kikker3)
  const real = audioStats(fileOf(row)).seconds
  expect(real).toBeGreaterThan(5)
  expect(real).toBeLessThan(8)
  expect(Math.abs(Number(row.duration_seconds) - real), 'opgeslagen lengte klopt met het bestand').toBeLessThanOrEqual(1.5)
})

test('langere opname in meerdere stukken komt compleet aan', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await record(page, 24)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })
  const [row] = await recordingsOf(ids.kikker3)
  const stats = audioStats(fileOf(row))
  expect(stats.seconds).toBeGreaterThan(22.5)
  expect(Math.abs(Number(row.duration_seconds) - stats.seconds)).toBeLessThanOrEqual(1.5)
})

test('upload mislukt: de voorlezer ziet het, houdt de opname en kan opnieuw opslaan', async ({ page }) => {
  await backend.rules([{ match: 'storage:upload', status: 500, times: 2 }])
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await record(page, 5)
  await page.getByRole('button', { name: 'Opslaan' }).click()

  await expect(page.getByText('Opslaan mislukt')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /Bedankt/ })).toHaveCount(0)
  let state = await backend.state()
  expect(state.tables.recordings.filter((r) => r.chapter_id === ids.kikker3), 'geen halve opname in de database').toHaveLength(0)
  expect(state.tables.recordings.some((r) => String(r.audio_url).startsWith('data:')), 'geen audio als tekst in de database').toBe(false)

  // De storing is voorbij: dezelfde opname alsnog opslaan
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })
  state = await backend.state()
  const [row] = state.tables.recordings.filter((r) => r.chapter_id === ids.kikker3)
  expect(audioStats(fileOf(row)).seconds).toBeGreaterThan(4)
})

test('database hapert na de upload: de opname komt toch bij de familie aan', async ({ page }) => {
  await backend.rules([{ match: 'rest:recordings:POST', status: 503, times: 1 }])
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await record(page, 5)
  await page.getByRole('button', { name: 'Opslaan' }).click()

  // Of de app probeert het zelf opnieuw, of de voorlezer krijgt een foutmelding
  // en slaat nog eens op. "Gelukt" zeggen terwijl niemand het kan horen mag niet.
  const thanks = page.getByRole('heading', { name: 'Bedankt Tantanne!' })
  const failed = page.getByText('Opslaan mislukt')
  await expect(thanks.or(failed)).toBeVisible({ timeout: 30_000 })
  if (await failed.isVisible()) {
    await page.getByRole('button', { name: 'Opslaan' }).click()
    await expect(thanks).toBeVisible({ timeout: 20_000 })
  }
  expect(await recordingsOf(ids.kikker3), 'opname staat in de database').toHaveLength(1)
})

test('alles voorgelezen: de voorlezer maakt zelf een nieuw hoofdstuk', async ({ page }) => {
  await page.goto(`/voorlezen?wie=${ids.tantanne}`)
  await page.getByRole('button', { name: 'Ander boek' }).click()
  await page.getByRole('button', { name: /Nieuw boek toevoegen/ }).click()
  await page.getByPlaceholder('Bijv. Kikker en zijn vriendjes').fill('Pluk van de Petteflet')
  await page.getByPlaceholder('Bijv. Max Velthuijs').fill('Annie M.G. Schmidt')
  await page.getByRole('button', { name: 'Start opnemen' }).click()
  await page.getByRole('button', { name: /Hoofdstuk 1 voorlezen/ }).click()
  await record(page, 4)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })

  const state = await backend.state()
  const book = state.tables.books.find((b) => b.title === 'Pluk van de Petteflet')
  expect(book, 'nieuw boek staat in de database').toBeTruthy()
  expect(book!.author).toBe('Annie M.G. Schmidt')
  const chapters = state.tables.chapters.filter((c) => c.book_id === book!.id)
  expect(chapters).toHaveLength(1)
  expect(state.tables.recordings.filter((r) => r.chapter_id === chapters[0].id)).toHaveLength(1)
})

test('pagina herladen tijdens de opname: het stuk tot dan toe is te herstellen', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await page.waitForTimeout(23_000) // twee stukken van 10 seconden zijn weggeschreven
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Welk hoofdstuk?' })).toBeVisible()
  await expect(page.getByText('Je vorige opname is niet opgeslagen')).toBeVisible()
  await expect(page.getByText(/Kikker is Kikker, hoofdstuk 3/)).toBeVisible()
  await page.getByRole('button', { name: 'Opname terughalen' }).click()
  await expect(page.getByRole('heading', { name: 'Opname klaar!' })).toBeVisible()
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })

  const [row] = await recordingsOf(ids.kikker3)
  const stats = audioStats(fileOf(row))
  expect(stats.seconds).toBeGreaterThan(18)
  expect(stats.maxDb).toBeGreaterThan(-20)
})

test('een onderbroken opname van hoofdstuk 3 belandt niet in hoofdstuk 4', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await page.waitForTimeout(12_000)
  await page.reload()

  // De lijst zegt bij welk hoofdstuk de onderbroken opname hoort
  await expect(page.getByText(/Kikker is Kikker, hoofdstuk 3/)).toBeVisible()
  // In hoofdstuk 4 wordt hij niet aangeboden
  await page.getByRole('button', { name: /Kikker in de kou/ }).first().click()
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await expect(page.getByRole('button', { name: 'Start opname' })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page.getByText('Vorige opname gevonden')).toHaveCount(0)

  // Terughalen vanaf de lijst zet hem in hoofdstuk 3
  await page.getByRole('button', { name: 'Terug' }).click()
  await page.getByRole('button', { name: 'Terug' }).click()
  await page.getByRole('button', { name: 'Opname terughalen' }).click()
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })
  expect(await recordingsOf(ids.kikker4), 'niets in het verkeerde hoofdstuk').toHaveLength(0)
  expect(await recordingsOf(ids.kikker3)).toHaveLength(1)
})

test('twee voorlezers tegelijk op hetzelfde hoofdstuk: de tweede krijgt een melding', async ({ page, browser }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()

  const other = await browser.newContext()
  const bomma = await other.newPage()
  await bomma.goto(`/voorlezen?wie=${ids.bomma}`)
  await bomma.getByRole('button', { name: /Hoofdstuk 3 voorlezen/ }).click()
  await expect(bomma.getByText('Tantanne is dit hoofdstuk nu aan het opnemen.')).toBeVisible()

  // Tantanne stopt ermee: het hoofdstuk is weer vrij
  await page.getByRole('button', { name: 'Annuleren' }).click()
  await expect.poll(async () => (await backend.state()).tables.recording_locks.length).toBe(0)
  await bomma.getByRole('button', { name: 'Ander hoofdstuk' }).click()
  await bomma.getByRole('button', { name: /Hoofdstuk 3 voorlezen/ }).click()
  await expect(bomma.getByRole('button', { name: 'Direct opnemen' })).toBeVisible()
  await other.close()
})

test('wie het tabblad sluit laat geen slot van twee uur achter', async ({ page, browser }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await expect(page.getByRole('button', { name: 'Direct opnemen' })).toBeVisible()
  await page.close()

  const other = await browser.newContext()
  const bomma = await other.newPage()
  await bomma.goto(`/voorlezen?wie=${ids.bomma}`)
  await bomma.getByRole('button', { name: /Hoofdstuk 3 voorlezen/ }).click()
  await expect(bomma.getByRole('button', { name: 'Direct opnemen' }), 'Bomma kan gewoon opnemen').toBeVisible()
  await other.close()
})

test('de melding houdt niemand tegen: de tweede voorlezer kan het hoofdstuk toch voorlezen', async ({ page, browser }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  const other = await browser.newContext()
  const bomma = await other.newPage()
  await bomma.goto(`/voorlezen?wie=${ids.bomma}`)
  await bomma.getByRole('button', { name: /Hoofdstuk 3 voorlezen/ }).click()
  await bomma.getByRole('button', { name: 'Toch voorlezen' }).click()
  await record(bomma, 4)
  await bomma.getByRole('button', { name: 'Opslaan' }).click()
  await expect(bomma.getByRole('heading', { name: 'Bedankt Bomma!' })).toBeVisible({ timeout: 20_000 })
  expect(await recordingsOf(ids.kikker3)).toHaveLength(1)
  await other.close()
})

test('annuleren tijdens het opnemen slaat niets op', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Annuleren' }).click()
  await expect(page.getByRole('button', { name: 'Direct opnemen' })).toBeVisible()
  const state = await backend.state()
  expect(state.tables.recordings).toHaveLength(2)
  expect(state.tables.recording_locks).toHaveLength(0)
})

test('bewust geannuleerde opname komt later niet terug als "onderbroken"', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await page.waitForTimeout(12_000)
  await page.getByRole('button', { name: 'Annuleren' }).click()
  await page.getByRole('button', { name: 'Terug' }).click()
  await expect(page.getByRole('heading', { name: 'Welk hoofdstuk?' })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page.getByText('Je vorige opname is niet opgeslagen')).toHaveCount(0)
})

test('nieuw boek aanmaken lukt niet: melding, en daarna alsnog', async ({ page }) => {
  await backend.rules([{ match: 'rest:books:POST', status: 503, times: 3 }])
  await page.goto(`/voorlezen?wie=${ids.tantanne}`)
  await page.getByRole('button', { name: 'Ander boek' }).click()
  await page.getByRole('button', { name: /Nieuw boek toevoegen/ }).click()
  await page.getByPlaceholder('Bijv. Kikker en zijn vriendjes').fill('Otje')
  await page.getByRole('button', { name: 'Start opnemen' }).click()
  await expect(page.getByText(/Het boek kon niet worden opgeslagen/)).toBeVisible({ timeout: 15_000 })
  expect((await backend.state()).tables.books.some((b) => b.title === 'Otje')).toBe(false)
  await page.getByRole('button', { name: 'Start opnemen' }).click()
  await expect(page.getByRole('heading', { name: 'Welk hoofdstuk?' })).toBeVisible()
  expect((await backend.state()).tables.books.filter((b) => b.title === 'Otje')).toHaveLength(1)
})

test('bestand uploaden (m4a van de telefoon)', async ({ page }) => {
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Bestand uploaden' }).click()
  await page.locator('input[type=file]').setInputFiles(UPLOAD_M4A)
  const confirm = page.getByRole('button', { name: /uploaden|opslaan|bevestig/i })
  if (await confirm.first().isVisible().catch(() => false)) await confirm.first().click()
  await expect(page.getByRole('heading', { name: 'Bedankt Tantanne!' })).toBeVisible({ timeout: 20_000 })
  const [row] = await recordingsOf(ids.kikker3)
  expect(String(row.audio_url)).toMatch(/\.mp4$/)
  expect(Number(row.duration_seconds)).toBeGreaterThan(5)
})

test('microfoon geweigerd: duidelijke melding, geen vastloper', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await expect(page.getByRole('heading', { name: 'Microfoon nodig' })).toBeVisible()
  await expect(page.getByText(/geen toestemming gegeven voor de microfoon/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start opname' })).toBeVisible()
})

test('weinig vrije opslag op het apparaat houdt een korte opname niet tegen', async ({ page }) => {
  // iPhones melden vaak maar een paar honderd MB aan vrije browseropslag
  await page.addInitScript(() => {
    navigator.storage.estimate = () => Promise.resolve({ quota: 400 * 1024 * 1024, usage: 20 * 1024 * 1024 })
  })
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await expect(page.getByRole('button', { name: 'Direct opnemen' })).toBeEnabled()
  await expect(page.getByText('Onvoldoende opslagruimte')).toHaveCount(0)
})

test('apparaat echt vol: de voorlezer leest waarom opnemen niet kan', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.estimate = () => Promise.resolve({ quota: 60 * 1024 * 1024, usage: 50 * 1024 * 1024 })
  })
  await openChapterToRecord(page, ids.tantanne, /Hoofdstuk 3 voorlezen/)
  await expect(page.getByText('Onvoldoende opslagruimte')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Direct opnemen' })).toBeDisabled()
})

test('onbekende voorlezer in de link: kiezen wie je bent', async ({ page }) => {
  await page.goto('/voorlezen?wie=99999999-9999-4999-8999-999999999999')
  await expect(page.getByRole('heading', { name: 'Wie ben jij?' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Tantanne/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Magali/ }), 'luisteraars staan er niet tussen').toHaveCount(0)
})

test('eerste bezoek terwijl de database niet reageert: geen leeg of vastgelopen scherm', async ({ page }) => {
  await backend.rules([{ match: 'rest:', status: 503 }])
  await page.goto(`/voorlezen?wie=${ids.tantanne}`)
  // Geen lege boekenkast met verzonnen namen, maar zeggen wat er aan de hand is
  await expect(page.getByRole('heading', { name: 'De bibliotheek laadt niet' })).toBeVisible({ timeout: 30_000 })
  await backend.rules([])
  await page.getByRole('button', { name: 'Opnieuw proberen' }).click()
  await expect(page.getByRole('heading', { name: 'Welk hoofdstuk?' })).toBeVisible()
})
