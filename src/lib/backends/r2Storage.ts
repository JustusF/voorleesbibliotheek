/**
 * Cloudflare R2 Storage Backend
 * Communicates with Cloudflare Workers proxy for secure R2 access
 */

import type { AudioStorageBackend } from '../storageBackend'

// Environment variables for R2 configuration
const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL || ''
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || ''

/**
 * Check if R2 is properly configured
 */
export function isR2Configured(): boolean {
  return !!(R2_WORKER_URL && R2_PUBLIC_URL)
}

export class R2StorageBackend implements AudioStorageBackend {
  name = 'r2'
  private workerUrl: string
  private publicUrl: string

  constructor() {
    this.workerUrl = R2_WORKER_URL
    this.publicUrl = R2_PUBLIC_URL
  }

  /**
   * Upload audio to R2 via Cloudflare Worker proxy
   */
  async upload(recordingId: string, audioBlob: Blob): Promise<string | null> {
    if (!this.isConfigured()) {
      console.warn('[R2Storage] R2 niet geconfigureerd')
      return null
    }

    const fileName = `${recordingId}.webm`
    const contentType = audioBlob.type || 'audio/webm'

    try {
      const response = await fetch(`${this.workerUrl}/upload/${fileName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: audioBlob,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[R2Storage] Upload error:', response.status, errorText)
        return null
      }

      // Return the public URL for the uploaded file
      return this.getPublicUrl(recordingId)
    } catch (error) {
      console.error('[R2Storage] Unexpected upload error:', error)
      return null
    }
  }

  /**
   * Delete audio from R2 via Cloudflare Worker proxy
   */
  async delete(recordingId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false
    }

    const fileName = `${recordingId}.webm`

    try {
      const response = await fetch(`${this.workerUrl}/delete/${fileName}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        console.error('[R2Storage] Delete error:', response.status)
        return false
      }

      return true
    } catch (error) {
      console.error('[R2Storage] Unexpected delete error:', error)
      return false
    }
  }

  /**
   * Get public URL for a recording
   * R2 public bucket URLs are in the format: https://pub-{hash}.r2.dev/{filename}
   */
  getPublicUrl(recordingId: string): string {
    return `${this.publicUrl}/${recordingId}.webm`
  }

  /**
   * Check if R2 is configured
   */
  isConfigured(): boolean {
    return isR2Configured()
  }
}
