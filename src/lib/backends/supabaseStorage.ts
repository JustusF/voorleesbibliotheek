/**
 * Supabase Storage Backend
 * Wraps existing Supabase Storage functionality with the AudioStorageBackend interface
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import type { AudioStorageBackend } from '../storageBackend'
import { getAudioFileInfo, getExtensionFromUrl } from '../storageBackend'

export class SupabaseStorageBackend implements AudioStorageBackend {
  name = 'supabase'

  /**
   * Upload audio to Supabase Storage
   */
  async upload(recordingId: string, audioBlob: Blob): Promise<string | null> {
    if (!isSupabaseConfigured || !supabase) {
      console.warn('[SupabaseStorage] Supabase niet geconfigureerd')
      return null
    }

    const { extension, contentType } = getAudioFileInfo(audioBlob)
    const fileName = `${recordingId}${extension}`
    const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(1)
    console.log(`[SupabaseStorage] Uploading ${fileName} (${sizeMB}MB, ${contentType})`)

    try {
      // Timeout: 3 minutes for large files on mobile
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000)

      const uploadPromise = supabase.storage
        .from('audio')
        .upload(fileName, audioBlob, {
          contentType,
          upsert: true,
        })

      const { data, error } = await Promise.race([
        uploadPromise,
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Upload timeout: bestand duurt te lang om te uploaden'))
          )
        ),
      ]).finally(() => clearTimeout(timeoutId))

      if (error) {
        console.error('[SupabaseStorage] Upload error:', error.message, error)
        // Re-throw with the actual Supabase error message so callers can surface it
        throw new Error(`Supabase upload mislukt: ${error.message}`)
      }

      const { data: urlData } = supabase.storage
        .from('audio')
        .getPublicUrl(data.path)

      return urlData.publicUrl
    } catch (error) {
      // Re-throw errors with meaningful messages so callers can surface them
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Upload mislukt: ${String(error)}`)
    }
  }

  /**
   * Delete audio from Supabase Storage
   */
  async delete(recordingId: string, audioUrl?: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) {
      return false
    }

    const extension = audioUrl ? getExtensionFromUrl(audioUrl) : '.webm'
    const fileName = `${recordingId}${extension}`

    try {
      const { error } = await supabase.storage
        .from('audio')
        .remove([fileName])

      if (error) {
        console.error('[SupabaseStorage] Delete error:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('[SupabaseStorage] Unexpected delete error:', error)
      return false
    }
  }

  /**
   * Get public URL for a recording
   */
  getPublicUrl(recordingId: string): string {
    if (!supabase) {
      return ''
    }

    const { data } = supabase.storage
      .from('audio')
      .getPublicUrl(`${recordingId}.webm`)

    return data.publicUrl
  }

  /**
   * Check if Supabase Storage is configured
   */
  isConfigured(): boolean {
    return isSupabaseConfigured
  }
}
