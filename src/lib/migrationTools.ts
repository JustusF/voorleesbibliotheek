/**
 * Migration Tools for Supabase Project Migration
 * Allows exporting data from one Supabase project and importing into another
 */

import { supabase, isSupabaseConfigured } from './supabase'
import type { Book, Chapter, Recording, User } from '../types'

export interface ExportData {
  version: '1.0'
  exportedAt: string
  users: User[]
  books: Book[]
  chapters: Chapter[]
  recordings: Array<Omit<Recording, 'audio_url'> & { audio_url?: string }>
  audioFileIds: string[] // IDs of recordings that have audio files in storage
}

export interface MigrationProgress {
  stage:
    | 'idle'
    | 'exporting_data'
    | 'downloading_audio'
    | 'importing_data'
    | 'uploading_audio'
    | 'complete'
    | 'error'
  current: number
  total: number
  message: string
}

type ProgressCallback = (progress: MigrationProgress) => void

/**
 * Export all data from current Supabase project
 */
export async function exportAllData(
  onProgress?: ProgressCallback
): Promise<ExportData> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is niet geconfigureerd')
  }

  onProgress?.({
    stage: 'exporting_data',
    current: 0,
    total: 4,
    message: 'Gebruikers exporteren...',
  })

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
  if (usersError)
    throw new Error(`Fout bij exporteren gebruikers: ${usersError.message}`)

  onProgress?.({
    stage: 'exporting_data',
    current: 1,
    total: 4,
    message: 'Boeken exporteren...',
  })

  const { data: books, error: booksError } = await supabase
    .from('books')
    .select('*')
  if (booksError)
    throw new Error(`Fout bij exporteren boeken: ${booksError.message}`)

  onProgress?.({
    stage: 'exporting_data',
    current: 2,
    total: 4,
    message: 'Hoofdstukken exporteren...',
  })

  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select('*')
  if (chaptersError)
    throw new Error(`Fout bij exporteren hoofdstukken: ${chaptersError.message}`)

  onProgress?.({
    stage: 'exporting_data',
    current: 3,
    total: 4,
    message: 'Opnames exporteren...',
  })

  const { data: recordings, error: recordingsError } = await supabase
    .from('recordings')
    .select('*')
  if (recordingsError)
    throw new Error(`Fout bij exporteren opnames: ${recordingsError.message}`)

  // Identify recordings with audio in storage (URLs that point to Supabase storage)
  const audioFileIds =
    recordings
      ?.filter((r) => r.audio_url?.includes('supabase'))
      .map((r) => r.id) || []

  // For local export, keep audio_url as-is (base64 data URLs are preserved)
  // Storage URLs will need to be re-uploaded during import

  onProgress?.({
    stage: 'exporting_data',
    current: 4,
    total: 4,
    message: 'Export voltooid!',
  })

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    users: users || [],
    books: books || [],
    chapters: chapters || [],
    recordings: recordings || [],
    audioFileIds,
  }
}

/**
 * Download audio files from Supabase storage
 * Returns a Map of recording ID -> Blob
 */
export async function downloadAudioFiles(
  audioFileIds: string[],
  onProgress?: ProgressCallback
): Promise<Map<string, Blob>> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is niet geconfigureerd')
  }

  const audioBlobs = new Map<string, Blob>()

  for (let i = 0; i < audioFileIds.length; i++) {
    const id = audioFileIds[i]

    onProgress?.({
      stage: 'downloading_audio',
      current: i + 1,
      total: audioFileIds.length,
      message: `Audio downloaden ${i + 1}/${audioFileIds.length}...`,
    })

    try {
      const { data, error } = await supabase.storage
        .from('audio')
        .download(`${id}.webm`)

      if (error) {
        console.warn(`Kon audio ${id} niet downloaden:`, error)
        continue
      }

      if (data) {
        audioBlobs.set(id, data)
      }
    } catch (error) {
      console.warn(`Fout bij downloaden audio ${id}:`, error)
    }
  }

  return audioBlobs
}

/**
 * Import data into current Supabase project
 * NOTE: Requires the new Supabase credentials to be set in .env first!
 */
export async function importAllData(
  data: ExportData,
  audioBlobs: Map<string, Blob>,
  onProgress?: ProgressCallback
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      'Nieuwe Supabase niet geconfigureerd. Pas eerst de .env aan met de nieuwe credentials.'
    )
  }

  // Import order matters due to foreign keys!

  onProgress?.({
    stage: 'importing_data',
    current: 0,
    total: 4,
    message: 'Gebruikers importeren...',
  })

  if (data.users.length > 0) {
    const { error: usersError } = await supabase
      .from('users')
      .upsert(data.users, { onConflict: 'id' })
    if (usersError)
      throw new Error(`Fout bij importeren gebruikers: ${usersError.message}`)
  }

  onProgress?.({
    stage: 'importing_data',
    current: 1,
    total: 4,
    message: 'Boeken importeren...',
  })

  if (data.books.length > 0) {
    const { error: booksError } = await supabase
      .from('books')
      .upsert(data.books, { onConflict: 'id' })
    if (booksError)
      throw new Error(`Fout bij importeren boeken: ${booksError.message}`)
  }

  onProgress?.({
    stage: 'importing_data',
    current: 2,
    total: 4,
    message: 'Hoofdstukken importeren...',
  })

  if (data.chapters.length > 0) {
    const { error: chaptersError } = await supabase
      .from('chapters')
      .upsert(data.chapters, { onConflict: 'id' })
    if (chaptersError)
      throw new Error(`Fout bij importeren hoofdstukken: ${chaptersError.message}`)
  }

  // Upload audio files and update recording URLs
  const recordingsWithUrls = []

  for (let i = 0; i < data.recordings.length; i++) {
    const recording = data.recordings[i]

    onProgress?.({
      stage: 'uploading_audio',
      current: i + 1,
      total: data.recordings.length,
      message: `Audio uploaden ${i + 1}/${data.recordings.length}...`,
    })

    const blob = audioBlobs.get(recording.id)

    if (blob) {
      // Upload audio to new storage
      const fileName = `${recording.id}.webm`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('audio')
        .upload(fileName, blob, { contentType: 'audio/webm', upsert: true })

      if (uploadError) {
        console.warn(`Kon audio ${recording.id} niet uploaden:`, uploadError)
        // Keep original URL (might be base64)
        recordingsWithUrls.push(recording)
        continue
      }

      const { data: urlData } = supabase.storage
        .from('audio')
        .getPublicUrl(uploadData.path)

      recordingsWithUrls.push({
        ...recording,
        audio_url: urlData.publicUrl,
      })
    } else {
      // No blob (might be base64 URL), keep as-is
      recordingsWithUrls.push(recording)
    }
  }

  onProgress?.({
    stage: 'importing_data',
    current: 3,
    total: 4,
    message: 'Opnames importeren...',
  })

  if (recordingsWithUrls.length > 0) {
    const { error: recordingsError } = await supabase
      .from('recordings')
      .upsert(recordingsWithUrls, { onConflict: 'id' })
    if (recordingsError)
      throw new Error(`Fout bij importeren opnames: ${recordingsError.message}`)
  }

  onProgress?.({
    stage: 'complete',
    current: 4,
    total: 4,
    message: 'Migratie voltooid!',
  })
}

/**
 * Download export data as JSON file
 */
export function downloadAsJson(data: ExportData, filename?: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const dateStr = new Date().toISOString().split('T')[0]
  const defaultFilename = `voorleesbibliotheek-export-${dateStr}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename || defaultFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Load export data from JSON file
 */
export function loadFromJsonFile(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as ExportData

        // Validate the data structure
        if (data.version !== '1.0') {
          throw new Error(`Onbekende export versie: ${data.version}`)
        }

        if (!Array.isArray(data.users) || !Array.isArray(data.books)) {
          throw new Error('Ongeldig export bestand')
        }

        resolve(data)
      } catch (error) {
        reject(
          new Error(
            `Kon bestand niet lezen: ${error instanceof Error ? error.message : 'Onbekende fout'}`
          )
        )
      }
    }

    reader.onerror = () => {
      reject(new Error('Fout bij lezen van bestand'))
    }

    reader.readAsText(file)
  })
}

/**
 * Create a summary of the export data
 */
export function getExportSummary(data: ExportData): string {
  return [
    `Geëxporteerd op: ${new Date(data.exportedAt).toLocaleString('nl-NL')}`,
    `Gebruikers: ${data.users.length}`,
    `Boeken: ${data.books.length}`,
    `Hoofdstukken: ${data.chapters.length}`,
    `Opnames: ${data.recordings.length}`,
    `Audio bestanden: ${data.audioFileIds.length}`,
  ].join('\n')
}
