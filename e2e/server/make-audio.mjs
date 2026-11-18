// Maakt de teststem: een ingesproken stukje dat Chromium als nepmicrofoon
// afspeelt, plus kant-en-klare bestanden voor de begindata en de uploadtest.
// macOS: `say` (stem Xander). Elders: een toon via ffmpeg.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { CACHE_DIR, VOICE_WAV, VOICE_LONG_WAV, SEED_WEBM, SEED_LONG_WEBM, UPLOAD_M4A } from './ports.mjs'

const TEXT =
  'Kikker zat aan de rand van het water en keek naar de lucht. ' +
  'Vandaag, dacht hij, wordt een bijzondere dag. ' +
  'Hij sprong op en liep naar het huis van Eend om het te vertellen.'

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'ignore' })
}

function speak(text, wav) {
  const aiff = wav.replace(/\.wav$/, '.aiff')
  try {
    run('say', ['-v', 'Xander', '-o', aiff, text])
    run('ffmpeg', ['-y', '-i', aiff, '-ar', '48000', '-ac', '1', wav])
    fs.rmSync(aiff, { force: true })
  } catch {
    run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-ar', '48000', '-ac', '1', wav])
  }
}

export function makeAudio() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  if (!fs.existsSync(VOICE_WAV)) speak(TEXT, VOICE_WAV)
  if (!fs.existsSync(VOICE_LONG_WAV)) speak(Array(8).fill(TEXT).join(' '), VOICE_LONG_WAV)
  if (!fs.existsSync(SEED_WEBM)) {
    run('ffmpeg', ['-y', '-i', VOICE_WAV, '-c:a', 'libopus', '-b:a', '32k', SEED_WEBM])
  }
  if (!fs.existsSync(SEED_LONG_WEBM)) {
    run('ffmpeg', ['-y', '-i', VOICE_LONG_WAV, '-c:a', 'libopus', '-b:a', '32k', SEED_LONG_WEBM])
  }
  if (!fs.existsSync(UPLOAD_M4A)) {
    run('ffmpeg', ['-y', '-i', VOICE_WAV, '-c:a', 'aac', '-b:a', '64k', UPLOAD_M4A])
  }
  return { VOICE_WAV, VOICE_LONG_WAV, SEED_WEBM, UPLOAD_M4A }
}

if (process.argv[1] === path.resolve(import.meta.dirname, 'make-audio.mjs')) {
  console.log(makeAudio())
}
