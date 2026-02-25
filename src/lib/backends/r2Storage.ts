/**
 * Cloudflare R2 Storage Backend
 * Communicates with Cloudflare Workers proxy for secure R2 access
 */

import type { AudioStorageBackend } from '../storageBackend'
import { getAudioFileInfo, getExtensionFromUrl } from '../storageBackend'

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
   * Upload audio to R2 via Cloudflare Worker proxy.
   * Uses XMLHttpRequest for upload progress events and a generous timeout.
   */
  async upload(
    recordingId: string,
    audioBlob: Blob,
    onProgress?: (pct: number) => void
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      console.warn('[R2Storage] R2 niet geconfigureerd')
      return null
    }

    const { extension, contentType } = getAudioFileInfo(audioBlob)
    const fileName = `${recordingId}${extension}`
    const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(1)
    console.log(`[R2Storage] Uploading ${fileName} (${sizeMB}MB, blob.type="${audioBlob.type}", contentType="${contentType}")`)

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', `${this.workerUrl}/upload/${fileName}`)
      xhr.setRequestHeader('Content-Type', contentType)
      // 15-minute timeout — handles very long recordings on slow connections
      xhr.timeout = 15 * 60 * 1000

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress?.(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(`${this.publicUrl}/${fileName}`)
        } else {
          reject(new Error(`R2 upload mislukt (${xhr.status}): ${xhr.responseText}`))
        }
      }

      xhr.onerror = () => reject(new Error('Netwerkfout bij uploaden. Controleer je internetverbinding.'))
      xhr.ontimeout = () => reject(new Error('Upload timeout (15 min overschreden). Probeer het opnieuw.'))

      xhr.send(audioBlob)
    })
  }

  /**
   * Delete audio from R2 via Cloudflare Worker proxy
   */
  async delete(recordingId: string, audioUrl?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false
    }

    const extension = audioUrl ? getExtensionFromUrl(audioUrl) : '.webm'
    const fileName = `${recordingId}${extension}`

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
