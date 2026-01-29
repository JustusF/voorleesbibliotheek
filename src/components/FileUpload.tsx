import { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Button } from './ui'

interface FileUploadProps {
  onFileSelect: (file: File) => void | Promise<void>
  isUploading?: boolean
  uploadError?: string | null
}

export function FileUpload({ onFileSelect, isUploading = false, uploadError = null }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setValidationError(null)

    const file = e.dataTransfer.files[0]
    if (!file) return

    // Basic validation - check MIME type OR file extension
    const hasAudioMimeType = file.type.startsWith('audio/')
    const hasAudioExtension = /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name)

    if (!hasAudioMimeType && !hasAudioExtension) {
      setValidationError('Dit bestandstype wordt niet ondersteund.')
      return
    }

    setSelectedFile(file)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null)

    const file = e.target.files?.[0]
    if (!file) return

    // Basic validation - check MIME type OR file extension (iOS voice memos may have empty MIME type)
    const hasAudioMimeType = file.type.startsWith('audio/')
    const hasAudioExtension = /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name)

    if (!hasAudioMimeType && !hasAudioExtension) {
      setValidationError('Dit bestandstype wordt niet ondersteund.')
      return
    }

    setSelectedFile(file)
  }, [])

  const handleConfirm = useCallback(() => {
    if (selectedFile) {
      onFileSelect(selectedFile)
    }
  }, [selectedFile, onFileSelect])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const hasError = validationError || uploadError

  return (
    <div className="w-full max-w-md mx-auto">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm"
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
      />

      {!selectedFile ? (
        <>
          <motion.div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && inputRef.current?.click()}
            animate={{
              scale: isDragging ? 1.02 : 1,
              borderColor: hasError ? '#EF4444' : isDragging ? '#F5A623' : '#E8E0D5',
            }}
            className={`
              relative
              border-3 border-dashed rounded-[24px]
              p-12
              transition-colors
              ${isUploading ? 'cursor-wait opacity-75' : 'cursor-pointer'}
              ${hasError ? 'bg-red-50' :
                isDragging ? 'bg-honey-light/20' :
                'bg-cream-dark/50 hover:bg-cream-dark'}
            `}
            style={{ borderWidth: '3px' }}
          >
            <div className="text-center">
              <motion.div
                animate={isDragging ? { y: [-5, 0, -5] } : {}}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="mb-4"
              >
                <svg
                  className={`w-16 h-16 mx-auto ${
                    hasError ? 'text-red-500' :
                    isDragging ? 'text-honey' :
                    'text-cocoa-light'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </motion.div>

              <p className="font-display text-xl text-cocoa mb-2">
                {isDragging ? 'Laat los om te uploaden' : 'Sleep hier een audiobestand'}
              </p>
              <p className="text-cocoa-light text-sm">
                of klik om een bestand te kiezen
              </p>
              <p className="text-cocoa-light/60 text-xs mt-4">
                MP3, WAV, M4A, OGG ondersteund
              </p>
            </div>
          </motion.div>

          {hasError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-[16px]"
            >
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-red-800 font-medium">
                    {validationError || uploadError}
                  </p>
                  <button
                    onClick={() => {
                      setValidationError(null)
                      inputRef.current?.click()
                    }}
                    className="text-sm text-red-600 hover:text-red-700 underline mt-2"
                  >
                    Probeer opnieuw
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-white rounded-[24px] shadow-soft p-6 ${isUploading ? 'opacity-75' : ''}`}
        >
          {isUploading && (
            <div className="mb-4 flex items-center gap-3 text-moss">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-sm font-medium">Bezig met uploaden...</p>
            </div>
          )}

          <div className="flex items-center gap-4 mb-6">
            <div className={`w-14 h-14 rounded-[16px] ${isUploading ? 'bg-moss/10' : 'bg-moss/20'} flex items-center justify-center`}>
              {isUploading ? (
                <svg className="w-7 h-7 text-moss animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V8" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-moss" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-cocoa truncate">{selectedFile.name}</p>
              <p className="text-sm text-cocoa-light">{formatFileSize(selectedFile.size)}</p>
            </div>
            {!isUploading && (
              <button
                onClick={() => setSelectedFile(null)}
                className="w-10 h-10 rounded-full hover:bg-cream-dark flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => setSelectedFile(null)}
              className="flex-1"
              disabled={isUploading}
            >
              Ander bestand
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              className="flex-1"
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploaden...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Uploaden
                </>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
