/**
 * Cloudflare R2 Storage Backend
 *
 * Uses multipart upload for files > 5 MB so each request stays well under
 * Cloudflare Workers' 30-second wall-clock limit. Each 5 MB part uploads in
 * a few seconds even on a slow mobile connection.
 */

import type { AudioStorageBackend } from '../storageBackend'
import { getAudioFileInfo, getExtensionFromUrl } from '../storageBackend'

const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL || ''
const R2_PUBLIC_URL  = import.meta.env.VITE_R2_PUBLIC_URL  || ''

// R2 minimum part size is 5 MB (last part may be smaller)
const CHUNK_SIZE = 5 * 1024 * 1024

export function isR2Configured(): boolean {
  return !!(R2_WORKER_URL && R2_PUBLIC_URL)
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** XHR-based PUT with upload progress and timeout. Returns resolved value or throws. */
function xhrPut(url: string, contentType: string, body: Blob, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = 5 * 60 * 1000 // 5 min per request (generous for one 5 MB part)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText)
      else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`))
    }
    xhr.onerror   = () => reject(new Error('Netwerkfout'))
    xhr.ontimeout = () => reject(new Error('Timeout (5 min overschreden)'))
    xhr.send(body)
  })
}

/** Simple fetch POST/DELETE (small payloads, no large body). */
async function apiFetch(url: string, method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return JSON.parse(text)
}

// ─── backend ────────────────────────────────────────────────────────────────

export class R2StorageBackend implements AudioStorageBackend {
  name = 'r2'

  isConfigured(): boolean { return isR2Configured() }

  getPublicUrl(recordingId: string): string {
    return `${R2_PUBLIC_URL}/${recordingId}.webm`
  }

  async upload(
    recordingId: string,
    audioBlob: Blob,
    onProgress?: (pct: number) => void,
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      console.warn('[R2] niet geconfigureerd')
      return null
    }

    const { extension, contentType } = getAudioFileInfo(audioBlob)
    const fileName = `${recordingId}${extension}`
    const sizeMB = (audioBlob.size / (1024 * 1024)).toFixed(1)
    console.log(`[R2] upload ${fileName} (${sizeMB} MB, blob.type="${audioBlob.type}")`)

    if (audioBlob.size <= CHUNK_SIZE) {
      return this._singleShot(fileName, audioBlob, contentType, onProgress)
    } else {
      return this._multipart(fileName, audioBlob, contentType, onProgress)
    }
  }

  async delete(recordingId: string, audioUrl?: string): Promise<boolean> {
    if (!this.isConfigured()) return false
    const extension = audioUrl ? getExtensionFromUrl(audioUrl) : '.webm'
    const fileName = `${recordingId}${extension}`
    try {
      await apiFetch(`${R2_WORKER_URL}/delete/${fileName}`, 'DELETE')
      return true
    } catch (err) {
      console.error('[R2] delete error:', err)
      return false
    }
  }

  // ── single-shot (≤ 5 MB) ──────────────────────────────────────────────────

  private async _singleShot(
    fileName: string,
    blob: Blob,
    contentType: string,
    onProgress?: (pct: number) => void,
  ): Promise<string> {
    await xhrPut(`${R2_WORKER_URL}/upload/${fileName}`, contentType, blob, onProgress)
    return `${R2_PUBLIC_URL}/${fileName}`
  }

  // ── multipart (> 5 MB) ────────────────────────────────────────────────────

  private async _multipart(
    fileName: string,
    blob: Blob,
    contentType: string,
    onProgress?: (pct: number) => void,
  ): Promise<string> {
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE)
    console.log(`[R2] multipart: ${totalChunks} delen voor ${fileName}`)

    // 1. Init
    const { uploadId } = await apiFetch(
      `${R2_WORKER_URL}/multipart/init/${fileName}`, 'POST'
    ) as { uploadId: string }

    const parts: { partNumber: number; etag: string }[] = []

    try {
      // 2. Upload parts
      for (let i = 0; i < totalChunks; i++) {
        const partNumber = i + 1
        const start = i * CHUNK_SIZE
        const chunk = blob.slice(start, start + CHUNK_SIZE)

        // Progress: each part contributes equally to the total percentage
        const partProgress = (pct: number) => {
          const overall = Math.round(((i + pct / 100) / totalChunks) * 100)
          onProgress?.(overall)
        }

        // Retry a failing part once before aborting
        let lastErr: Error | null = null
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const partUrl = `${R2_WORKER_URL}/multipart/part/${fileName}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`
            const raw = await xhrPut(partUrl, contentType, chunk, attempt === 1 ? partProgress : undefined)
            parts.push(JSON.parse(raw) as { partNumber: number; etag: string })
            lastErr = null
            break
          } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err))
            console.warn(`[R2] deel ${partNumber} poging ${attempt} mislukt:`, lastErr.message)
            if (attempt < 2) await new Promise(r => setTimeout(r, 1500))
          }
        }

        if (lastErr) {
          // Abort orphaned multipart upload so R2 doesn't accumulate incomplete uploads
          apiFetch(`${R2_WORKER_URL}/multipart/abort/${fileName}?uploadId=${encodeURIComponent(uploadId)}`, 'DELETE')
            .catch(() => {/* best-effort */})
          throw new Error(`Upload deel ${partNumber}/${totalChunks} mislukt: ${lastErr.message}`)
        }
      }

      // 3. Complete
      await apiFetch(`${R2_WORKER_URL}/multipart/complete/${fileName}`, 'POST', { uploadId, parts })
      onProgress?.(100)
      return `${R2_PUBLIC_URL}/${fileName}`

    } catch (err) {
      // Re-throw so callers can surface the message
      if (err instanceof Error) throw err
      throw new Error(String(err))
    }
  }
}
