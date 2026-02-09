/**
 * Storage Backend Abstraction Layer
 * Allows switching between Supabase Storage and Cloudflare R2
 */

import { SupabaseStorageBackend } from './backends/supabaseStorage'
import { R2StorageBackend, isR2Configured } from './backends/r2Storage'

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
   * @returns true if deletion was successful
   */
  delete(recordingId: string): Promise<boolean>

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
