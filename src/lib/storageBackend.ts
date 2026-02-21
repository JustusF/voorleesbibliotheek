/**
 * Storage Backend Abstraction Layer
 * Allows switching between Supabase Storage and Cloudflare R2
 */

import { SupabaseStorageBackend } from './backends/supabaseStorage'
import { R2StorageBackend, isR2Configured } from './backends/r2Storage'

/**
 * Detect audio file info from a Blob's MIME type.
 * MP4 containers (from WhatsApp Audio, etc.) get .mp4 extension; everything else defaults to .webm.
 */
export function getAudioFileInfo(blob: Blob): { extension: string; contentType: string } {
  const type = (blob.type || '').toLowerCase()
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac') || type.includes('mp4a')) {
    return { extension: '.mp4', contentType: 'audio/mp4' }
  }
  return { extension: '.webm', contentType: 'audio/webm' }
}

/**
 * Extract file extension from a stored audio URL.
 * Falls back to .webm for backward compatibility.
 */
export function getExtensionFromUrl(audioUrl: string): string {
  try {
    const path = new URL(audioUrl).pathname
    if (path.endsWith('.mp4')) return '.mp4'
  } catch {
    // Not a valid URL, check raw string
    if (audioUrl.includes('.mp4')) return '.mp4'
  }
  return '.webm'
}

/**
 * Abstract interface for audio storage backends
 */
export interface AudioStorageBackend {
  /** Name of the storage backend (for logging/debugging) */
  name: string

  /**
   * Upload audio to storage
   * @param recordingId - Unique recording ID (used as filename base)
   * @param audioBlob - Audio data as Blob
   * @returns Public URL to access the audio, or null if upload failed
   */
  upload(recordingId: string, audioBlob: Blob): Promise<string | null>

  /**
   * Delete audio from storage
   * @param recordingId - Recording ID to delete
   * @param audioUrl - Optional stored audio URL to determine file extension
   * @returns true if deletion was successful
   */
  delete(recordingId: string, audioUrl?: string): Promise<boolean>

  /**
   * Get the public URL for a recording
   * @param recordingId - Recording ID
   * @returns Public URL to access the audio
   */
  getPublicUrl(recordingId: string): string

  /**
   * Check if this backend is properly configured
   */
  isConfigured(): boolean
}

/**
 * Get the storage backend based on environment configuration
 *
 * Priority:
 * 1. If VITE_AUDIO_STORAGE_BACKEND=r2 and R2 is configured, use R2
 * 2. Otherwise, use Supabase Storage (default)
 */
export function getStorageBackend(): AudioStorageBackend {
  const backendConfig = import.meta.env.VITE_AUDIO_STORAGE_BACKEND || 'supabase'

  if (backendConfig === 'r2' && isR2Configured()) {
    return new R2StorageBackend()
  }

  return new SupabaseStorageBackend()
}

/**
 * Check if any storage backend is configured
 */
export function isAnyStorageConfigured(): boolean {
  const backend = getStorageBackend()
  return backend.isConfigured()
}

/**
 * Get the name of the currently active storage backend
 */
export function getActiveBackendName(): string {
  const backend = getStorageBackend()
  return backend.name
}
