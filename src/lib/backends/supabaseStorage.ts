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

    try {
      const { data, error } = await supabase.storage
        .from('audio')
        .upload(fileName, audioBlob, {
          contentType,
          upsert: true,
        })

      if (error) {
        console.error('[SupabaseStorage] Upload error:', error)
        return null
      }

      const { data: urlData } = supabase.storage
        .from('audio')
        .getPublicUrl(data.path)

      return urlData.publicUrl
    } catch (error) {
      console.error('[SupabaseStorage] Unexpected upload error:', error)
      return null
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
