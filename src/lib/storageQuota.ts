/**
 * Storage quota monitoring and management
 * Prevents localStorage from exceeding limits and causing crashes
 */

export interface StorageQuotaInfo {
  used: number
  available: number
  percentage: number
  nearLimit: boolean
  criticalLevel: boolean
}

const STORAGE_LIMIT = 5 * 1024 * 1024 // 5MB typical localStorage limit
const WARNING_THRESHOLD = 0.8 // 80%
const CRITICAL_THRESHOLD = 0.95 // 95%

/**
 * Calculate current localStorage usage
 */
export function getStorageUsage(): StorageQuotaInfo {
  let totalBytes = 0

  try {
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        // Count key + value size
        totalBytes += key.length + (localStorage[key]?.length || 0)
      }
    }
  } catch (error) {
    console.error('Error calculating storage usage:', error)
  }

  const percentage = totalBytes / STORAGE_LIMIT

  return {
    used: totalBytes,
    available: STORAGE_LIMIT - totalBytes,
    percentage,
    nearLimit: percentage >= WARNING_THRESHOLD,
    criticalLevel: percentage >= CRITICAL_THRESHOLD,
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get storage quota as percentage string
 */
export function getStoragePercentage(): string {
  const { percentage } = getStorageUsage()
  return `${Math.round(percentage * 100)}%`
}

/**
 * Check if we can safely store data of given size
 */
export function canStore(sizeBytes: number): boolean {
  const { available } = getStorageUsage()
  // Add 10% buffer for safety
  return available > sizeBytes * 1.1
}

/**
 * Get oldest recordings to cleanup
 * Returns array of recording IDs sorted by creation date (oldest first)
 */
export function getOldestRecordings(count: number = 10): string[] {
  try {
    const recordingsJson = localStorage.getItem('recordings')
    if (!recordingsJson) return []

    const recordings = JSON.parse(recordingsJson)
    if (!Array.isArray(recordings)) return []

    return recordings
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime()
        const dateB = new Date(b.created_at).getTime()
        return dateA - dateB // Oldest first
      })
      .slice(0, count)
      .map(r => r.id)
  } catch (error) {
    console.error('Error getting oldest recordings:', error)
    return []
  }
}

/**
 * Cleanup old recordings to free space
 * Returns number of recordings removed
 */
export function cleanupOldRecordings(targetMB: number = 2): number {
  try {
    const recordingsJson = localStorage.getItem('recordings')
    if (!recordingsJson) return 0

    let recordings = JSON.parse(recordingsJson)
    if (!Array.isArray(recordings)) return 0

    const targetBytes = targetMB * 1024 * 1024
    let freedBytes = 0
    let removedCount = 0

    // Sort by creation date (oldest first)
    recordings.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return dateA - dateB
    })

    // Remove oldest recordings until we've freed enough space
    const remaining = []
    for (const recording of recordings) {
      const recordingSize = recording.audio_url?.length || 0

      if (freedBytes < targetBytes) {
        freedBytes += recordingSize
        removedCount++
        console.log(`Removed old recording: ${recording.id}`)
      } else {
        remaining.push(recording)
      }
    }

    // Save cleaned recordings
    localStorage.setItem('recordings', JSON.stringify(remaining))

    return removedCount
  } catch (error) {
    console.error('Error cleaning up recordings:', error)
    return 0
  }
}

/**
 * Get storage warning message based on usage
 */
export function getStorageWarningMessage(): string | null {
  const { percentage, criticalLevel, nearLimit } = getStorageUsage()

  if (criticalLevel) {
    return `Opslag bijna vol (${Math.round(percentage * 100)}%). Nieuwe opnames worden geblokkeerd totdat je oude opnames verwijdert.`
  }

  if (nearLimit) {
    return `Opslag loopt vol (${Math.round(percentage * 100)}%). Verwijder oude opnames om ruimte te maken.`
  }

  return null
}

/**
 * Check if there's enough storage space for new recording
 * Call this before adding new recordings
 * Returns false if storage is too full - NO auto-cleanup to prevent data loss
 */
export function ensureStorageSpace(requiredBytes: number = 1024 * 1024): boolean {
  const { available } = getStorageUsage()

  // Simply check if we have enough space
  // If not, user must manually cleanup - we don't delete their data automatically
  return available >= requiredBytes
}

/**
 * Get user-friendly error message when storage is full
 */
export function getStorageFullMessage(): string {
  return 'Opslag vol. Verwijder oude opnames om nieuwe toe te voegen.'
}
