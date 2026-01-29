import { replaceRecordingAsync } from './storage'

// Error types for user-friendly messages
export type AudioUploadErrorType =
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'DURATION_DETECTION_FAILED'
  | 'UPLOAD_FAILED'
  | 'NETWORK_ERROR'

export interface AudioUploadSuccess {
  success: true
  recordingId: string
  duration: number
}

export interface AudioUploadError {
  success: false
  error: AudioUploadErrorType
  message: string
}

export type AudioUploadResult = AudioUploadSuccess | AudioUploadError

interface AudioValidationConfig {
  maxSizeBytes: number
  allowedMimeTypes: string[]
  allowedExtensions: string[]
}

const DEFAULT_CONFIG: AudioValidationConfig = {
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: [
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/ogg',
    'audio/webm',
  ],
  allowedExtensions: ['.mp3', '.wav', '.m4a', '.ogg', '.webm'],
}

/**
 * Validate audio file type and size
 */
function validateAudioFile(
  file: File,
  config: AudioValidationConfig
): { valid: true } | { valid: false; error: string } {
  // Check file size
  if (file.size > config.maxSizeBytes) {
    const maxSizeMB = Math.round(config.maxSizeBytes / (1024 * 1024))
    return {
      valid: false,
      error: `Bestand is te groot (max ${maxSizeMB}MB). Probeer het bestand te comprimeren.`,
    }
  }

  // Check MIME type
  const mimeTypeValid = config.allowedMimeTypes.some((type) =>
    file.type.toLowerCase().includes(type.toLowerCase())
  )

  // Check file extension as fallback (important for iOS files)
  const fileName = file.name.toLowerCase()
  const extensionValid = config.allowedExtensions.some((ext) =>
    fileName.endsWith(ext)
  )

  if (!mimeTypeValid && !extensionValid) {
    return {
      valid: false,
      error: 'Dit bestandstype wordt niet ondersteund. Gebruik MP3, WAV, M4A, OGG of WebM.',
    }
  }

  return { valid: true }
}

/**
 * Detect actual audio duration using Audio element
 */
async function detectAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    const objectUrl = URL.createObjectURL(file)

    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Duration detection timeout'))
    }, 10000) // 10 second timeout

    audio.onloadedmetadata = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)

      // Round to nearest second
      const duration = Math.round(audio.duration)

      // Validate duration
      if (isNaN(duration) || duration <= 0) {
        reject(new Error('Invalid duration'))
      } else {
        resolve(duration)
      }
    }

    audio.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load audio metadata'))
    }

    audio.src = objectUrl
  })
}

/**
 * Main upload function - validates, detects duration, and uploads audio file
 */
export async function uploadAudioFile(
  file: File,
  chapterId: string,
  readerId: string,
  config?: Partial<AudioValidationConfig>
): Promise<AudioUploadResult> {
  // Merge with default config
  const fullConfig: AudioValidationConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  }

  try {
    // Step 1: Validate file
    const validation = validateAudioFile(file, fullConfig)
    if (!validation.valid) {
      return {
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: validation.error,
      }
    }

    // Step 2: Detect duration
    let duration: number
    try {
      duration = await detectAudioDuration(file)
    } catch (error) {
      console.error('Duration detection failed:', error)
      return {
        success: false,
        error: 'DURATION_DETECTION_FAILED',
        message: 'Kon de lengte van het audiobestand niet bepalen.',
      }
    }

    // Step 3: Replace existing or add new recording (prevents duplicates)
    try {
      const recording = await replaceRecordingAsync(
        chapterId,
        readerId,
        file, // Pass the File directly (it's a Blob)
        duration
      )

      return {
        success: true,
        recordingId: recording.id,
        duration,
      }
    } catch (error) {
      console.error('Upload failed:', error)

      // Check if it's a network error
      if (error instanceof Error && error.message.includes('network')) {
        return {
          success: false,
          error: 'NETWORK_ERROR',
          message: 'Upload mislukt. Controleer je internetverbinding.',
        }
      }

      return {
        success: false,
        error: 'UPLOAD_FAILED',
        message: 'Upload mislukt. Probeer het opnieuw.',
      }
    }
  } catch (error) {
    console.error('Unexpected error in uploadAudioFile:', error)
    return {
      success: false,
      error: 'UPLOAD_FAILED',
      message: 'Er ging iets mis bij het uploaden. Probeer het opnieuw.',
    }
  }
}
