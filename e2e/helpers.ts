import { test as base, expect, type Page } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { AUDIO_DIR, SUPABASE_URL } from './server/ports.mjs'
import { baseSeed } from './seed'

export { expect }

type Row = Record<string, unknown>

export interface BackendState {
  tables: Record<string, Row[]>
  objects: { name: string; size: number; contentType: string }[]
  log: { key: string; at: number; query: string }[]
}

export interface Rule {
  /** Begin van de sleutel, bv. "storage:upload" of "rest:recordings:POST" */
  match: string
  status?: number
  delayMs?: number
  times?: number
  drop?: boolean
}

async function control(pathname: string, body?: unknown) {
  const res = await fetch(`${SUPABASE_URL}/__control/${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.json()
}

export const backend = {
  reset: (seed: unknown = baseSeed()) => control('reset', { seed }),
  rules: (rules: Rule[]) => control('rules', rules),
  state: () => control('state') as Promise<BackendState>,
}

/** Lengte en luidheid van een geüploade opname, gemeten met ffmpeg. */
export function audioStats(objectName: string): { seconds: number; meanDb: number; maxDb: number } {
  const file = path.join(AUDIO_DIR, objectName)
  const probe = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]).toString().trim()
  // webm uit MediaRecorder heeft geen lengte in de kop: dan decoderen en tellen
  const decode = spawnSync('ffmpeg', ['-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const err = decode.stderr
  const time = [...err.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)].pop()
  const decoded = time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0
  return {
    seconds: Number(probe) > 0 ? Number(probe) : decoded,
    meanDb: Number(/mean_volume: (-?[\d.]+) dB/.exec(err)?.[1] ?? -99),
    maxDb: Number(/max_volume: (-?[\d.]+) dB/.exec(err)?.[1] ?? -99),
  }
}

export const test = base.extend<{ guard: void; problems: string[] }>({
  // Niets mag naar het echte Supabase-project of een andere buitenwereld.
  guard: [async ({ context }, use) => {
    const leaks: string[] = []
    await context.route(/supabase\.co|r2\.dev|workers\.dev/, (route) => {
      leaks.push(route.request().url())
      return route.abort()
    })
    // Statistiekenscript: hoort niet mee te tellen in een test
    await context.route(/plausible\.io/, (route) => route.abort())
    await use()
    expect(leaks, 'requests naar productie').toEqual([])
  }, { auto: true }],

  // Fouten die de gebruiker niet ziet maar die er wel zijn.
  problems: async ({ page }, use) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const text = m.text()
      if (/websocket|realtime|WebSocket|Failed to load resource/i.test(text)) return
      problems.push(`console: ${text}`)
    })
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`http ${r.status()} ${r.request().method()} ${r.url()}`)
    })
    await use(problems)
  },
})

/** Loopt de wizard door tot het opnamescherm van één hoofdstuk. */
export async function openChapterToRecord(page: Page, readerId: string, chapterLabel: RegExp) {
  await page.goto(`/voorlezen?wie=${readerId}`)
  await expect(page.getByRole('heading', { name: 'Welk hoofdstuk?' })).toBeVisible()
  await page.getByRole('button', { name: chapterLabel }).first().click()
}

/** Neemt `seconds` seconden op met de nepmicrofoon en stopt. */
export async function record(page: Page, seconds: number) {
  await page.getByRole('button', { name: 'Direct opnemen' }).click()
  await page.getByRole('button', { name: 'Start opname' }).click()
  await expect(page.getByRole('heading', { name: 'Aan het opnemen...' })).toBeVisible()
  await page.waitForTimeout(seconds * 1000)
  await page.getByRole('button', { name: 'Stop opname' }).click()
  await expect(page.getByRole('heading', { name: 'Opname klaar!' })).toBeVisible()
}
