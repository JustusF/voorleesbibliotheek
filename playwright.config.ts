import { defineConfig } from '@playwright/test'
import { ANON_KEY } from './e2e/server/fake-supabase.mjs'
import { APP_URL, SUPABASE_URL, VOICE_WAV } from './e2e/server/ports.mjs'

// De tests draaien tegen de gebouwde app en een nagebouwde Supabase
// (e2e/server). Er gaat niets naar productie. De microfoon is een ingesproken
// wav-bestand dat Chromium als nepapparaat afspeelt.
const fakeMic = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${VOICE_WAV}`,
  '--autoplay-policy=no-user-gesture-required',
]

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  globalSetup: './e2e/global-setup.ts',
  outputDir: './e2e/.results',
  workers: 1, // één gedeelde nep-database
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],
  use: {
    baseURL: APP_URL,
    video: 'on',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        permissions: ['microphone'],
        launchOptions: { args: fakeMic },
      },
    },
    {
      // Telefoonformaat met aanraking. Chromium, want WebKit in Playwright
      // heeft geen nepmicrofoon; een echte iPhone blijft een handtest.
      name: 'telefoon',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        permissions: ['microphone'],
        launchOptions: { args: fakeMic },
      },
    },
    {
      name: 'safari',
      testMatch: /luisteren\.e2e\.ts/,
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npx vite build --outDir dist-e2e --logLevel warn && node e2e/server/start.mjs',
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: ANON_KEY,
      VITE_AUDIO_STORAGE_BACKEND: 'supabase',
    },
  },
})
