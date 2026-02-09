/**
 * Storage space checking utilities
 * Prevents users from starting recordings when insufficient storage is available
 */

// Minimum required storage space: 1GB
const MIN_REQUIRED_BYTES = 1 * 1024 * 1024 * 1024 // 1GB

export interface StorageCheckResult {
  canRecord: boolean
  availableBytes: number
  availableFormatted: string
  requiredBytes: number
  requiredFormatted: string
  message: string | null
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Check if the Storage API is available in this browser
 */
function isStorageApiAvailable(): boolean {
  return typeof navigator !== 'undefined' &&
         'storage' in navigator &&
         typeof navigator.storage.estimate === 'function'
}

/**
 * Check available storage space using the Storage Manager API
 * Returns null if the API is not available
 */
export async function checkAvailableStorage(): Promise<StorageCheckResult> {
  // If Storage API is not available, allow recording (fallback behavior)
  if (!isStorageApiAvailable()) {
    console.warn('[StorageCheck] Storage API niet beschikbaar, sta opname toe')
    return {
      canRecord: true,
      availableBytes: Infinity,
      availableFormatted: 'Onbekend',
      requiredBytes: MIN_REQUIRED_BYTES,
      requiredFormatted: formatBytes(MIN_REQUIRED_BYTES),
      message: null,
    }
  }

  try {
    const estimate = await navigator.storage.estimate()

    // quota = total available, usage = currently used
    const quota = estimate.quota || 0
    const usage = estimate.usage || 0
    const available = quota - usage

    const canRecord = available >= MIN_REQUIRED_BYTES

    return {
      canRecord,
      availableBytes: available,
      availableFormatted: formatBytes(available),
      requiredBytes: MIN_REQUIRED_BYTES,
      requiredFormatted: formatBytes(MIN_REQUIRED_BYTES),
      message: canRecord
        ? null
        : `Niet genoeg opslagruimte beschikbaar. Je hebt ${formatBytes(available)} vrij, maar minimaal ${formatBytes(MIN_REQUIRED_BYTES)} is nodig om veilig te kunnen opnemen.`,
    }
  } catch (error) {
    console.error('[StorageCheck] Fout bij controleren opslag:', error)
    // On error, allow recording (don't block user due to API issues)
    return {
      canRecord: true,
      availableBytes: Infinity,
      availableFormatted: 'Onbekend',
      requiredBytes: MIN_REQUIRED_BYTES,
      requiredFormatted: formatBytes(MIN_REQUIRED_BYTES),
      message: null,
    }
  }
}

/**
 * Simple helper to check if recording can start
 */
export async function canStartRecording(): Promise<boolean> {
  const result = await checkAvailableStorage()
  return result.canRecord
}

/**
 * Get a user-friendly warning message if storage is low
 */
export async function getStorageWarningMessage(): Promise<string | null> {
  const result = await checkAvailableStorage()
  return result.message
}
