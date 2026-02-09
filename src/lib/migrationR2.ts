/**
 * R2 Migration Tool
 * Migrates audio files from Supabase Storage to Cloudflare R2
 *
 * NOTE: This is a backend-only tool, not exposed in the frontend UI.
 * Run via Node.js or browser console for one-time migration.
 */

import { supabase, isSupabaseConfigured } from './supabase'
import { R2StorageBackend, isR2Configured } from './backends/r2Storage'

export interface R2MigrationProgress {
  stage: 'idle' | 'fetching_recordings' | 'migrating' | 'updating_urls' | 'complete' | 'error'
  current: number
  total: number
  message: string
  errors: string[]
  migratedRecordings: string[]
}

type ProgressCallback = (progress: R2MigrationProgress) => void

/**
 * Check if migration is possible
 */
export function canMigrateToR2(): { canMigrate: boolean; reason?: string } {
  if (!isSupabaseConfigured) {
    return { canMigrate: false, reason: 'Supabase is niet geconfigureerd' }
  }

  if (!isR2Configured()) {
    return { canMigrate: false, reason: 'Cloudflare R2 is niet geconfigureerd' }
  }

  return { canMigrate: true }
}

/**
 * Get count of recordings that need migration
 */
export async function getRecordingsToMigrateCount(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) {
    return 0
  }

  const { data, error } = await supabase
    .from('recordings')
    .select('audio_url')

  if (error || !data) {
    console.error('Error fetching recordings count:', error)
    return 0
  }

  // Count recordings with Supabase Storage URLs (not R2 or base64)
  return data.filter(r =>
    r.audio_url?.includes('supabase') &&
    !r.audio_url?.startsWith('data:') &&
    !r.audio_url?.includes('.r2.dev')
  ).length
}

/**
 * Migrate all audio from Supabase Storage to Cloudflare R2
 *
 * This function:
 * 1. Fetches all recordings with Supabase Storage URLs
 * 2. Downloads each audio file from Supabase
 * 3. Uploads to R2 via the Worker proxy
 * 4. Updates the database with the new R2 URL
 */
export async function migrateSupabaseToR2(
  onProgress?: ProgressCallback
): Promise<{ success: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  const migratedRecordings: string[] = []

  // Validate configuration
  const { canMigrate, reason } = canMigrateToR2()
  if (!canMigrate) {
    throw new Error(reason)
  }

  if (!supabase) {
    throw new Error('Supabase client niet beschikbaar')
  }

  const r2Backend = new R2StorageBackend()

  // Step 1: Fetch all recordings
  onProgress?.({
    stage: 'fetching_recordings',
    current: 0,
    total: 0,
    message: 'Opnames ophalen uit database...',
    errors,
    migratedRecordings,
  })

  const { data: recordings, error: fetchError } = await supabase
    .from('recordings')
    .select('*')

  if (fetchError) {
    throw new Error(`Fout bij ophalen opnames: ${fetchError.message}`)
  }

  // Filter recordings that need migration (Supabase URLs, not base64 or R2)
  const toMigrate = recordings?.filter(r =>
    r.audio_url?.includes('supabase') &&
    !r.audio_url?.startsWith('data:') &&
    !r.audio_url?.includes('.r2.dev')
  ) || []

  if (toMigrate.length === 0) {
    onProgress?.({
      stage: 'complete',
      current: 0,
      total: 0,
      message: 'Geen opnames om te migreren.',
      errors,
      migratedRecordings,
    })
    return { success: 0, failed: 0, errors }
  }

  let success = 0
  let failed = 0

  // Step 2: Migrate each recording
  for (let i = 0; i < toMigrate.length; i++) {
    const recording = toMigrate[i]

    onProgress?.({
      stage: 'migrating',
      current: i + 1,
      total: toMigrate.length,
      message: `Migreren ${i + 1}/${toMigrate.length}: ${recording.id}`,
      errors,
      migratedRecordings,
    })

    try {
      // Download from Supabase Storage
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('audio')
        .download(`${recording.id}.webm`)

      if (downloadError || !audioData) {
        const errorMsg = `${recording.id}: Download mislukt - ${downloadError?.message || 'Geen data'}`
        console.error(errorMsg)
        errors.push(errorMsg)
        failed++
        continue
      }

      // Upload to R2
      const newUrl = await r2Backend.upload(recording.id, audioData)

      if (!newUrl) {
        const errorMsg = `${recording.id}: Upload naar R2 mislukt`
        console.error(errorMsg)
        errors.push(errorMsg)
        failed++
        continue
      }

      // Update database with new URL
      const { error: updateError } = await supabase
        .from('recordings')
        .update({ audio_url: newUrl })
        .eq('id', recording.id)

      if (updateError) {
        const errorMsg = `${recording.id}: Database update mislukt - ${updateError.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
        failed++
        continue
      }

      // Success!
      migratedRecordings.push(recording.id)
      success++

      console.log(`[Migration] ${recording.id} succesvol gemigreerd naar R2`)

    } catch (error) {
      const errorMsg = `${recording.id}: ${error instanceof Error ? error.message : 'Onbekende fout'}`
      console.error(errorMsg)
      errors.push(errorMsg)
      failed++
    }
  }

  // Step 3: Complete
  onProgress?.({
    stage: 'complete',
    current: toMigrate.length,
    total: toMigrate.length,
    message: `Migratie voltooid: ${success} gelukt, ${failed} mislukt`,
    errors,
    migratedRecordings,
  })

  return { success, failed, errors }
}

/**
 * Verify R2 migration - check if all recordings are accessible
 */
export async function verifyR2Migration(): Promise<{
  total: number
  accessible: number
  failed: string[]
}> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase niet geconfigureerd')
  }

  const { data: recordings, error } = await supabase
    .from('recordings')
    .select('id, audio_url')

  if (error || !recordings) {
    throw new Error(`Fout bij ophalen opnames: ${error?.message}`)
  }

  // Filter R2 URLs only
  const r2Recordings = recordings.filter(r => r.audio_url?.includes('.r2.dev'))

  let accessible = 0
  const failed: string[] = []

  for (const recording of r2Recordings) {
    try {
      const response = await fetch(recording.audio_url, { method: 'HEAD' })
      if (response.ok) {
        accessible++
      } else {
        failed.push(recording.id)
      }
    } catch {
      failed.push(recording.id)
    }
  }

  return {
    total: r2Recordings.length,
    accessible,
    failed,
  }
}

/**
 * Cleanup: Delete audio from Supabase Storage after successful R2 migration
 * WARNING: Only run this after verifying all R2 uploads are accessible!
 */
export async function cleanupSupabaseStorage(recordingIds: string[]): Promise<{
  deleted: number
  failed: string[]
}> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase niet geconfigureerd')
  }

  let deleted = 0
  const failed: string[] = []

  for (const id of recordingIds) {
    try {
      const { error } = await supabase.storage
        .from('audio')
        .remove([`${id}.webm`])

      if (error) {
        console.error(`Cleanup failed for ${id}:`, error)
        failed.push(id)
      } else {
        deleted++
      }
    } catch (error) {
      console.error(`Cleanup error for ${id}:`, error)
      failed.push(id)
    }
  }

  return { deleted, failed }
}
