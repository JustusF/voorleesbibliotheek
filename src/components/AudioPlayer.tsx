import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui'
import { getChapterProgress, saveChapterProgress, getChapterWithRecordings } from '../lib/storage'
import { playChapterChime } from '../lib/chime'
import type { Recording, Chapter, Book, User } from '../types'

interface ChapterWithRecordingStatus extends Chapter {
  hasRecording: boolean
  isCurrentChapter: boolean
}

interface AudioPlayerProps {
  recording: Recording
  chapter: Chapter
  book: Book
  reader: User
  allChapters: Chapter[]
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  onChapterSelect?: (chapter: Chapter) => void
  onRecordingSelect?: (recording: Recording, reader: User) => void
  availableRecordings?: Array<{ recording: Recording; reader: User }>
}

type SleepTimerOption = null | 5 | 10 | 15 | 30 | 'end_of_chapter'
type PlaybackSpeed = 0.75 | 1 | 1.25 | 1.5 | 2

export function AudioPlayer({
  recording,
  chapter,
  book,
  reader,
  allChapters,
  onClose,
  onNext,
  onPrevious,
  onChapterSelect,
  onRecordingSelect,
  availableRecordings,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isBuffering, setIsBuffering] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(recording.duration_seconds || 0)
  const [showChapterList, setShowChapterList] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const lastSaveRef = useRef(0)
  const previousRecordingIdRef = useRef(recording.id)
  const wasPlayingRef = useRef(false)

  // Playback speed
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1)

  // Sleep timer
  const [sleepTimer, setSleepTimer] = useState<SleepTimerOption>(null)
  const [sleepTimeRemaining, setSleepTimeRemaining] = useState<number | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Build chapter list with recording status
  const chaptersWithStatus: ChapterWithRecordingStatus[] = allChapters
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map(ch => ({
      ...ch,
      hasRecording: (getChapterWithRecordings(ch.id)?.recordings.length ?? 0) > 0,
      isCurrentChapter: ch.id === chapter.id,
    }))

  // Save progress periodically
  const saveProgress = useCallback(() => {
    if (audioRef.current && duration > 0) {
      saveChapterProgress(chapter.id, recording.id, audioRef.current.currentTime, duration)
    }
  }, [chapter.id, recording.id, duration])

  // Track if we should auto-play when chapter changes
  useEffect(() => {
    if (isPlaying) {
      wasPlayingRef.current = true
    }
  }, [isPlaying])

  // Auto-play when recording changes
  useEffect(() => {
    if (previousRecordingIdRef.current !== recording.id) {
      if (wasPlayingRef.current && audioRef.current) {
        setIsLoading(true)
        audioRef.current.play().then(() => {
          setIsPlaying(true)
        }).catch(() => {
          setIsPlaying(false)
        })
      }
      previousRecordingIdRef.current = recording.id
      wasPlayingRef.current = false
      lastSaveRef.current = 0
      setCurrentTime(0)
    }
  }, [recording.id])

  // Load saved progress on mount
  useEffect(() => {
    const savedProgress = getChapterProgress(chapter.id)
    if (savedProgress && savedProgress.recordingId === recording.id && !savedProgress.completed) {
      if (audioRef.current) {
        audioRef.current.currentTime = savedProgress.currentTime
        setCurrentTime(savedProgress.currentTime)
      }
    }
  }, [chapter.id, recording.id])

  // Apply playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Sleep timer logic
  useEffect(() => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current)
      sleepTimerRef.current = null
    }

    if (sleepTimer === null) {
      setSleepTimeRemaining(null)
      return
    }

    if (sleepTimer === 'end_of_chapter') {
      setSleepTimeRemaining(null)
      return
    }

    // Minutes-based timer
    setSleepTimeRemaining(sleepTimer * 60)
    sleepTimerRef.current = setInterval(() => {
      setSleepTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          // Timer expired - pause playback
          if (audioRef.current) {
            audioRef.current.pause()
            setIsPlaying(false)
          }
          setSleepTimer(null)
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current)
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current)
    }
  }, [sleepTimer])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      if (audio.currentTime - lastSaveRef.current >= 5) {
        saveProgress()
        lastSaveRef.current = audio.currentTime
      }
    }
    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsLoading(false)
      setHasError(false)
      audio.playbackRate = playbackSpeed
      const savedProgress = getChapterProgress(chapter.id)
      if (savedProgress && savedProgress.recordingId === recording.id && !savedProgress.completed) {
        audio.currentTime = savedProgress.currentTime
        setCurrentTime(savedProgress.currentTime)
      }
    }
    const handleEnded = () => {
      setIsPlaying(false)
      saveChapterProgress(chapter.id, recording.id, audio.duration, audio.duration)
      // If sleep timer is "end of chapter", don't auto-play next
      if (sleepTimer === 'end_of_chapter') {
        setSleepTimer(null)
        playChapterChime()
        return
      }
      if (onNext) {
        playChapterChime().then(() => onNext())
      }
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
      saveProgress()
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleError)
    }
  }, [chapter.id, recording.id, saveProgress, sleepTimer, playbackSpeed])

  const togglePlay = () => {
    if (!audioRef.current || hasError) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const skipForward = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 15, duration)
  }

  const skipBackward = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 15, 0)
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

  const cycleSpeed = () => {
    const speeds: PlaybackSpeed[] = [0.75, 1, 1.25, 1.5, 2]
    const currentIndex = speeds.indexOf(playbackSpeed)
    const nextIndex = (currentIndex + 1) % speeds.length
    setPlaybackSpeed(speeds[nextIndex])
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatSleepRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-cream/95 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-t-[32px] sm:rounded-[32px] shadow-floating p-6 sm:p-8 w-full sm:max-w-md relative max-h-[95vh] sm:max-h-none overflow-y-auto"
        >
          <audio ref={audioRef} src={recording.audio_url} preload="metadata" />

          {/* Top buttons row */}
          <div className="flex justify-between mb-4 sm:absolute sm:top-4 sm:left-4 sm:right-4 sm:mb-0">
            {/* Chapter list button */}
            <button
              onClick={() => { setShowChapterList(!showChapterList); setShowSettings(false) }}
              aria-label="Inhoudsopgave"
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
                showChapterList ? 'bg-sky text-white' : 'bg-cream-dark hover:bg-honey-light text-cocoa'
              }`}
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>

            <div className="flex gap-2">
              {/* Settings button */}
              <button
                onClick={() => { setShowSettings(!showSettings); setShowChapterList(false) }}
                aria-label="Instellingen"
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors ${
                  showSettings ? 'bg-sky text-white' : 'bg-cream-dark hover:bg-honey-light text-cocoa'
                }`}
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {/* Close button */}
              <button
                onClick={onClose}
                aria-label="Sluiten"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 rounded-t-[32px] sm:rounded-[32px] flex items-center justify-center z-10">
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
            <div className="absolute inset-0 bg-white/95 rounded-t-[32px] sm:rounded-[32px] flex items-center justify-center z-10">
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
          <div className="flex justify-center mb-4 sm:mb-6 mt-2 sm:mt-8">
            <motion.div
              animate={isPlaying ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-40 h-52 sm:w-48 sm:h-60 rounded-[24px] overflow-hidden shadow-lifted"
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
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="font-display text-xl sm:text-2xl text-cocoa mb-1">{chapter.title}</h2>
            {book.author && (
              <p className="text-cocoa-light text-sm mb-1">
                door {book.author}
              </p>
            )}
            <p className="text-cocoa-light text-sm">
              Voorgelezen door <span className="font-semibold">{reader.name}</span>
            </p>

            {/* Reader selection - show when multiple recordings exist */}
            {availableRecordings && availableRecordings.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                {availableRecordings.map(({ recording: rec, reader: r }) => (
                  <button
                    key={rec.id}
                    onClick={() => onRecordingSelect?.(rec, r)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
                      rec.id === recording.id
                        ? 'bg-sky text-white'
                        : 'bg-cream-dark text-cocoa hover:bg-honey-light'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold">
                      {r.name.charAt(0)}
                    </span>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sleep timer indicator */}
          {sleepTimer !== null && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs text-cocoa-light bg-lavender/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                {sleepTimer === 'end_of_chapter'
                  ? 'Stopt na dit hoofdstuk'
                  : sleepTimeRemaining !== null
                    ? `Slaaptimer: ${formatSleepRemaining(sleepTimeRemaining)}`
                    : ''
                }
                <button
                  onClick={() => setSleepTimer(null)}
                  className="ml-1 hover:text-cocoa"
                  aria-label="Slaaptimer annuleren"
                >
                  ×
                </button>
              </span>
            </div>
          )}

          {/* Progress bar */}
          <div className="mb-4 sm:mb-6">
            <div className="relative h-3 bg-cream-dark rounded-full overflow-hidden mb-2" aria-hidden="true">
              <motion.div
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky to-sky-light rounded-full"
                style={{ width: `${progress}%` }}
              />
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
            {isBuffering && (
              <p className="text-center text-sm text-cocoa-light mt-1" aria-live="polite">
                Bufferen...
              </p>
            )}
          </div>

          {/* Controls - main row with skip buttons */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-3" role="group" aria-label="Audio bediening">
            {/* Previous chapter */}
            <button
              onClick={onPrevious}
              disabled={!onPrevious}
              aria-label="Vorig hoofdstuk"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-cream-dark hover:bg-honey-light disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Skip backward 15s */}
            <button
              onClick={skipBackward}
              aria-label="15 seconden terug"
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors relative"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
              </svg>
              <span className="absolute -bottom-0.5 text-[9px] font-bold text-cocoa-light">15</span>
            </button>

            {/* Play/Pause */}
            <Button
              variant="play"
              size="xl"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pauzeren' : 'Afspelen'}
              disabled={hasError || isLoading}
              className="relative !w-16 !h-16 sm:!w-20 sm:!h-20"
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
                  className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-white border-t-transparent rounded-full"
                  aria-hidden="true"
                />
              ) : isPlaying ? (
                <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-10 h-10 sm:w-12 sm:h-12 ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </Button>

            {/* Skip forward 15s */}
            <button
              onClick={skipForward}
              aria-label="15 seconden vooruit"
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors relative"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
              </svg>
              <span className="absolute -bottom-0.5 text-[9px] font-bold text-cocoa-light">15</span>
            </button>

            {/* Next chapter */}
            <button
              onClick={onNext}
              disabled={!onNext}
              aria-label="Volgend hoofdstuk"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-cream-dark hover:bg-honey-light disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Secondary controls row: speed + playback rate indicator */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={cycleSpeed}
              aria-label={`Snelheid: ${playbackSpeed}x`}
              className="px-3 py-1.5 rounded-full bg-cream-dark hover:bg-honey-light text-xs font-bold text-cocoa transition-colors"
            >
              {playbackSpeed}x
            </button>
          </div>

          {/* Settings panel overlay */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-0 bg-white rounded-t-[32px] sm:rounded-[32px] z-20 flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b border-cream-dark">
                  <h3 className="font-display text-xl text-cocoa">Instellingen</h3>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-10 h-10 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors"
                  >
                    <svg className="w-5 h-5 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {/* Playback speed */}
                  <div>
                    <h4 className="text-sm font-medium text-cocoa mb-3">Afspeelsnelheid</h4>
                    <div className="flex gap-2">
                      {([0.75, 1, 1.25, 1.5, 2] as PlaybackSpeed[]).map(speed => (
                        <button
                          key={speed}
                          onClick={() => setPlaybackSpeed(speed)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                            playbackSpeed === speed
                              ? 'bg-sky text-white'
                              : 'bg-cream-dark text-cocoa hover:bg-honey-light'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sleep timer */}
                  <div>
                    <h4 className="text-sm font-medium text-cocoa mb-3">Slaaptimer</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 5, label: '5 min' },
                        { value: 10, label: '10 min' },
                        { value: 15, label: '15 min' },
                        { value: 30, label: '30 min' },
                        { value: 'end_of_chapter' as const, label: 'Einde hoofdstuk' },
                        { value: null, label: 'Uit' },
                      ]).map(option => (
                        <button
                          key={String(option.value)}
                          onClick={() => {
                            setSleepTimer(option.value as SleepTimerOption)
                            if (option.value !== null) setShowSettings(false)
                          }}
                          className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                            sleepTimer === option.value
                              ? 'bg-lavender text-white'
                              : 'bg-cream-dark text-cocoa hover:bg-honey-light'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chapter list overlay */}
          <AnimatePresence>
            {showChapterList && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-0 bg-white rounded-t-[32px] sm:rounded-[32px] z-20 flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b border-cream-dark">
                  <h3 className="font-display text-xl text-cocoa">Inhoudsopgave</h3>
                  <button
                    onClick={() => setShowChapterList(false)}
                    className="w-10 h-10 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors"
                  >
                    <svg className="w-5 h-5 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {chaptersWithStatus.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => {
                        if (ch.hasRecording && onChapterSelect && !ch.isCurrentChapter) {
                          setShowChapterList(false)
                          onChapterSelect(ch)
                        }
                      }}
                      disabled={!ch.hasRecording || ch.isCurrentChapter}
                      className={`w-full p-3 rounded-xl text-left flex items-center gap-3 transition-colors ${
                        ch.isCurrentChapter
                          ? 'bg-sky text-white'
                          : ch.hasRecording
                          ? 'bg-cream-dark/50 hover:bg-cream-dark text-cocoa'
                          : 'bg-cream/50 text-cocoa-light opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-display text-sm ${
                        ch.isCurrentChapter
                          ? 'bg-white/20'
                          : ch.hasRecording
                          ? 'bg-sky-light'
                          : 'bg-cream-dark'
                      }`}>
                        {ch.chapter_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium truncate ${ch.isCurrentChapter ? 'text-white' : ''}`}>
                          {ch.title}
                        </p>
                        {ch.isCurrentChapter && (
                          <p className="text-xs text-white/80">Nu aan het luisteren</p>
                        )}
                        {!ch.hasRecording && (
                          <p className="text-xs">Nog niet ingelezen</p>
                        )}
                      </div>
                      {ch.hasRecording && !ch.isCurrentChapter && (
                        <svg className="w-5 h-5 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      {ch.isCurrentChapter && (
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
