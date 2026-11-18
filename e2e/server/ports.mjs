import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const APP_PORT = 4319
export const SUPABASE_PORT = 54329
export const APP_URL = `http://localhost:${APP_PORT}`
export const SUPABASE_URL = `http://localhost:${SUPABASE_PORT}`
export const ADMIN_PIN = '4826'

/** Gegenereerde bestanden (stem, geüploade opnames); staat in .gitignore. */
export const CACHE_DIR = path.resolve(here, '../.cache')
export const AUDIO_DIR = path.join(CACHE_DIR, 'uploads')
export const VOICE_WAV = path.join(CACHE_DIR, 'stem.wav')
export const VOICE_LONG_WAV = path.join(CACHE_DIR, 'stem-lang.wav')
export const SEED_WEBM = path.join(CACHE_DIR, 'seed.webm')
export const SEED_LONG_WEBM = path.join(CACHE_DIR, 'seed-lang.webm')
export const UPLOAD_M4A = path.join(CACHE_DIR, 'upload.m4a')
