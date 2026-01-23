import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui'
import { getChapterProgress, saveChapterProgress } from '../lib/storage'
import type { Recording, Chapter, Book, User } from '../types'

interface AudioPlayerProps {
  recording: Recording
  chapter: Chapter
  book: Book
  reader: User
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
}

export function AudioPlayer({
  recording,
  chapter,
  book,
  reader,
  onClose,
  onNext,
  onPrevious,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isBuffering, setIsBuffering] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(recording.duration_seconds || 0)
  const lastSaveRef = useRef(0)

  // Save progress periodically
  const saveProgress = useCallback(() => {
    if (audioRef.current && duration > 0) {
      saveChapterProgress(chapter.id, recording.id, audioRef.current.currentTime, duration)
    }
  }, [chapter.id, recording.id, duration])

  // Load saved progress on mount
  useEffect(() => {
    const savedProgress = getChapterProgress(chapter.id)
    if (savedProgress && savedProgress.recordingId === recording.id && !savedProgress.completed) {
      // Resume from saved position
      if (audioRef.current) {
        audioRef.current.currentTime = savedProgress.currentTime
        setCurrentTime(savedProgress.currentTime)
      }
    }
  }, [chapter.id, recording.id])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      // Save progress every 5 seconds
      if (audio.currentTime - lastSaveRef.current >= 5) {
        saveProgress()
        lastSaveRef.current = audio.currentTime
      }
    }
    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsLoading(false)
      setHasError(false)
      // Load saved position after metadata is ready
      const savedProgress = getChapterProgress(chapter.id)
      if (savedProgress && savedProgress.recordingId === recording.id && !savedProgress.completed) {
        audio.currentTime = savedProgress.currentTime
        setCurrentTime(savedProgress.currentTime)
      }
    }
    const handleEnded = () => {
      setIsPlaying(false)
      saveChapterProgress(chapter.id, recording.id, audio.duration, audio.duration)
    }
    const handleWaiting = () => setIsBuffering(true)
    const handleCanPlay = () => {
      setIsBuffering(false)
      setIsLoading(false)
    }
    const handleError = () => {
      setHasError(true)
      setIsLoading(false)
      setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('error', handleError)

    return () => {
      // Save progress when unmounting
      saveProgress()
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleError)
    }
  }, [chapter.id, recording.id, saveProgress])

  const togglePlay = () => {
    if (!audioRef.current || hasError) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const retryLoad = () => {
    if (!audioRef.current) return
    setHasError(false)
    setIsLoading(true)
    audioRef.current.load()
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-cream/95 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-[32px] shadow-floating p-8 max-w-md w-full"
        >
          <audio ref={audioRef} src={recording.audio_url} preload="metadata" />

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Sluiten"
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors"
          >
            <svg className="w-6 h-6 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 rounded-[32px] flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-sky border-t-transparent rounded-full"
                />
                <p className="text-cocoa-light">Audio laden...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {hasError && (
            <div className="absolute inset-0 bg-white/95 rounded-[32px] flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-4 text-center p-6">
                <div className="w-16 h-16 rounded-full bg-sunset/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-sunset" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display text-xl text-cocoa mb-1">Kon audio niet laden</h3>
                  <p className="text-cocoa-light text-sm">Controleer je internetverbinding en probeer opnieuw</p>
                </div>
                <Button variant="primary" onClick={retryLoad}>
                  Opnieuw proberen
                </Button>
              </div>
            </div>
          )}

          {/* Book cover */}
          <div className="flex justify-center mb-6">
            <motion.div
              animate={isPlaying ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-48 h-60 rounded-[24px] overflow-hidden shadow-lifted"
            >
              {book.cover_url ? (
                <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-honey to-honey-dark flex items-center justify-center">
                  <svg className="w-16 h-16 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
              )}
            </motion.div>
          </div>

          {/* Chapter info */}
          <div className="text-center mb-6">
            <h2 className="font-display text-2xl text-cocoa mb-1">{chapter.title}</h2>
            {book.author && (
              <p className="text-cocoa-light text-sm mb-1">
                door {book.author}
              </p>
            )}
            <p className="text-cocoa-light">
              Voorgelezen door <span className="font-semibold">{reader.name}</span>
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            {/* Visual progress with emoji markers */}
            <div className="relative h-3 bg-cream-dark rounded-full overflow-hidden mb-2" aria-hidden="true">
              <motion.div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky to-sky-light rounded-full"
                style={{ width: `${progress}%` }}
              />
              {/* Progress markers - like a path */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 text-lg" aria-hidden="true">🌱</div>
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-2xl"
                style={{ left: `${Math.max(5, Math.min(95, progress))}%` }}
                aria-hidden="true"
              >
                📖
              </motion.div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 text-lg" aria-hidden="true">🏠</div>
            </div>
            {/* Accessible seek slider */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={seek}
              aria-label="Audio voortgang"
              aria-valuetext={`${formatTime(currentTime)} van ${formatTime(duration)}`}
              className="audio-seek-slider w-full h-2 rounded-full appearance-none cursor-pointer bg-cream-dark"
            />
            <div className="flex justify-between mt-2 text-sm text-cocoa-light" aria-live="polite" aria-atomic="true">
              <span>{formatTime(currentTime)}</span>
              <span aria-label={`Totale duur ${formatTime(duration)}`}>{formatTime(duration)}</span>
            </div>
            {/* Buffering indicator */}
            {isBuffering && (
              <p className="text-center text-sm text-cocoa-light mt-1" aria-live="polite">
                Bufferen...
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-6" role="group" aria-label="Audio bediening">
            <Button
              variant="ghost"
              size="lg"
              onClick={onPrevious}
              disabled={!onPrevious}
              aria-label="Vorig hoofdstuk"
              className="opacity-70 hover:opacity-100"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </Button>

            <Button
              variant="play"
              size="xl"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pauzeren' : 'Afspelen'}
              disabled={hasError || isLoading}
              className="relative"
            >
              {isPlaying && !isBuffering && (
                <motion.div
                  className="absolute inset-0 rounded-[32px] border-4 border-sky"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  aria-hidden="true"
                />
              )}
              {isBuffering ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-4 border-white border-t-transparent rounded-full"
                  aria-hidden="true"
                />
              ) : isPlaying ? (
                <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-12 h-12 ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              onClick={onNext}
              disabled={!onNext}
              aria-label="Volgend hoofdstuk"
              className="opacity-70 hover:opacity-100"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
