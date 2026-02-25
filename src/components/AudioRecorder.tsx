import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui'
import {
  startBackupSession,
  saveChunkToBackup,
  getRecoverableRecording,
  clearBackup,
  requestWakeLock,
  releaseWakeLock,
} from '../lib/recordingBackup'

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void
  onCancel: () => void
  chapterId?: string
  readerId?: string
}

type RecordingState = 'idle' | 'requesting_permission' | 'permission_denied' | 'recording' | 'paused' | 'recorded' | 'playing'

export function AudioRecorder({ onRecordingComplete, onCancel, chapterId, readerId }: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  // Recovery state for interrupted recordings
  const [recoveredBlob, setRecoveredBlob] = useState<Blob | null>(null)
  const [recoveredDuration, setRecoveredDuration] = useState(0)
  const [showRecovery, setShowRecovery] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const chunkIndexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const sessionIdRef = useRef<string>('')
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(20).fill(0))
  const [showRecordingFlash, setShowRecordingFlash] = useState(false)

  // Check if microphone is available
  useEffect(() => {
    const checkMicrophonePermission = async () => {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        if (permissionStatus.state === 'denied') {
          setState('permission_denied')
          setPermissionError('Microfoon toegang is geblokkeerd. Ga naar je browserinstellingen om dit toe te staan.')
        }
      } catch {
        // Permission API not supported, we'll handle it when trying to record
      }
    }
    checkMicrophonePermission()
  }, [])

  // Check for recoverable recording on mount
  useEffect(() => {
    const checkRecovery = async () => {
      const recovered = await getRecoverableRecording()
      if (recovered && recovered.chunks.length > 0) {
        const blob = new Blob(recovered.chunks, { type: recovered.meta.mimeType })
        // Estimate duration from chunk count (each chunk is ~10 seconds)
        const estimatedDuration = recovered.chunks.length * 10
        setRecoveredBlob(blob)
        setRecoveredDuration(estimatedDuration)
        setShowRecovery(true)
      }
    }
    checkRecovery()
  }, [])

  // Cleanup on unmount to prevent dangling mic/recorder
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
      releaseWakeLock(wakeLockRef.current)
    }
  }, [])

  // Handle recovery: use the recovered recording
  const handleRecoverRecording = useCallback(() => {
    if (!recoveredBlob) return
    blobRef.current = recoveredBlob
    const url = URL.createObjectURL(recoveredBlob)
    setAudioUrl(url)
    setDuration(recoveredDuration)
    setShowRecovery(false)
    setState('recorded')
    // Backup stays until upload succeeds (cleared by ReadPage on success)
  }, [recoveredBlob, recoveredDuration])

  // Handle recovery: discard and start fresh
  const handleDiscardRecovery = useCallback(() => {
    setRecoveredBlob(null)
    setShowRecovery(false)
    clearBackup()
  }, [])

  // Request mic permission and start recording immediately (no mic test step)
  const startRecording = useCallback(async () => {
    setState('requesting_permission')
    setPermissionError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      // Keep original stream reference for cleanup
      streamRef.current = stream

      // Request wake lock to prevent screen sleep during recording
      wakeLockRef.current = await requestWakeLock()

      // Set up audio processing chain for louder recordings
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)

      // Analyser for waveform visualization (connected directly to mic for accurate display)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64
      analyserRef.current = analyser
      source.connect(analyser)

      // Compressor to even out dynamics (makes quiet parts louder, loud parts softer)
      const compressor = audioContext.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-45, audioContext.currentTime)
      compressor.knee.setValueAtTime(30, audioContext.currentTime)
      compressor.ratio.setValueAtTime(8, audioContext.currentTime)
      compressor.attack.setValueAtTime(0.003, audioContext.currentTime)
      compressor.release.setValueAtTime(0.25, audioContext.currentTime)

      // Gain boost to increase overall volume
      const gainNode = audioContext.createGain()
      gainNode.gain.value = 2.0

      // Limiter to prevent clipping/distortion
      const limiter = audioContext.createDynamicsCompressor()
      limiter.threshold.setValueAtTime(-2, audioContext.currentTime)
      limiter.knee.setValueAtTime(0, audioContext.currentTime)
      limiter.ratio.setValueAtTime(20, audioContext.currentTime)
      limiter.attack.setValueAtTime(0.001, audioContext.currentTime)
      limiter.release.setValueAtTime(0.01, audioContext.currentTime)

      // Output destination for processed audio
      const destination = audioContext.createMediaStreamDestination()

      // Chain: source → compressor → gain → limiter → destination
      source.connect(compressor)
      compressor.connect(gainNode)
      gainNode.connect(limiter)
      limiter.connect(destination)

      // Start audio level visualization
      const updateLevels = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
          analyserRef.current.getByteFrequencyData(dataArray)
          const levels: number[] = []
          const step = Math.floor(dataArray.length / 20)
          for (let i = 0; i < 20; i++) {
            levels.push(dataArray[i * step] / 255)
          }
          setAudioLevels(levels)
        }
        animationRef.current = requestAnimationFrame(updateLevels)
      }
      updateLevels()

      // Start backup session in IndexedDB
      const sessionId = `rec-${Date.now()}`
      sessionIdRef.current = sessionId
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      await startBackupSession(sessionId, mimeType, chapterId, readerId)

      // Create MediaRecorder with the processed (amplified) stream
      // Use timeslice of 10 seconds so chunks are saved incrementally
      const processedStream = destination.stream
      const mediaRecorder = new MediaRecorder(processedStream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []
      chunkIndexRef.current = 0

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          // Save each chunk to IndexedDB as backup
          const idx = chunkIndexRef.current++
          saveChunkToBackup(sessionIdRef.current, idx, e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        blobRef.current = blob
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setState('recorded')
        // Stop original microphone stream
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        // Stop animation
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {})
          audioContextRef.current = null
        }
        // Release wake lock
        releaseWakeLock(wakeLockRef.current)
        wakeLockRef.current = null
        setAudioLevels(Array(20).fill(0))
      }

      // Start recording with 10-second timeslice for incremental chunk capture
      mediaRecorder.start(10000)
      setState('recording')
      setDuration(0)

      // Haptic + visual feedback on mobile when recording starts
      if (navigator.vibrate) {
        navigator.vibrate([50, 30, 50])
      }
      setShowRecordingFlash(true)
      setTimeout(() => setShowRecordingFlash(false), 600)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)

    } catch (err) {
      console.error('Failed to access microphone:', err)
      setState('permission_denied')

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setPermissionError('Je hebt geen toestemming gegeven voor de microfoon. Klik op het slot-icoontje in je browser om dit aan te passen.')
        } else if (err.name === 'NotFoundError') {
          setPermissionError('Geen microfoon gevonden. Sluit een microfoon aan en probeer het opnieuw.')
        } else if (err.name === 'NotReadableError') {
          setPermissionError('De microfoon is in gebruik door een andere app. Sluit andere apps en probeer het opnieuw.')
        } else {
          setPermissionError('Er ging iets mis met de microfoon. Probeer het opnieuw.')
        }
      } else {
        setPermissionError('Er ging iets mis. Probeer het opnieuw.')
      }
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      mediaRecorderRef.current.stop()
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setState('paused')
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      // Stop audio level animation while paused
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setState('recording')
      // Resume timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
      // Resume audio level animation
      const updateLevels = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
          analyserRef.current.getByteFrequencyData(dataArray)
          const levels: number[] = []
          const step = Math.floor(dataArray.length / 20)
          for (let i = 0; i < 20; i++) {
            levels.push(dataArray[i * step] / 255)
          }
          setAudioLevels(levels)
        }
        animationRef.current = requestAnimationFrame(updateLevels)
      }
      updateLevels()
    }
  }, [])

  const playPreview = useCallback(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.play()
      setState('playing')
    }
  }, [audioUrl])

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setState('recorded')
    }
  }, [])

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    // Clean up stream if still active
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    releaseWakeLock(wakeLockRef.current)
    wakeLockRef.current = null
    clearBackup()
    setAudioUrl(null)
    blobRef.current = null
    setDuration(0)
    setState('idle')
  }, [audioUrl])

  const confirmRecording = useCallback(() => {
    if (blobRef.current) {
      // Backup stays until upload succeeds (cleared by caller on success)
      onRecordingComplete(blobRef.current, duration)
    }
  }, [duration, onRecordingComplete])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-white rounded-[32px] shadow-lifted p-8 max-w-md w-full mx-auto relative overflow-hidden">
      {/* Recording start flash */}
      <AnimatePresence>
        {showRecordingFlash && (
          <motion.div
            initial={{ opacity: 0.6, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 bg-sunset/20 rounded-[32px] pointer-events-none z-10"
          />
        )}
      </AnimatePresence>
      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setState('recorded')} />}

      {/* Recovery banner for interrupted recordings */}
      {showRecovery && state === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-honey/10 border-2 border-honey/30 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-honey flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium text-cocoa text-base">Vorige opname gevonden</p>
              <p className="text-sm text-cocoa-light mt-1">
                Er is een onderbroken opname van ~{formatTime(recoveredDuration)} gevonden. Wil je deze herstellen?
              </p>
              <div className="flex gap-3 mt-3">
                <Button variant="primary" size="sm" onClick={handleRecoverRecording}>
                  Herstellen
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDiscardRecovery}>
                  Weggooien
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="text-center mb-8">
        <h2 className="font-display text-2xl text-cocoa mb-2">
          {state === 'idle' && 'Klaar om op te nemen'}
          {state === 'requesting_permission' && 'Even geduld...'}
          {state === 'permission_denied' && 'Microfoon nodig'}
          {state === 'recording' && 'Aan het opnemen...'}
          {state === 'paused' && 'Gepauzeerd'}
          {(state === 'recorded' || state === 'playing') && 'Opname klaar!'}
        </h2>
        <p className="text-cocoa-light text-lg">
          {state === 'idle' && !showRecovery && 'Druk op de rode knop om te beginnen'}
          {state === 'idle' && showRecovery && ''}
          {state === 'requesting_permission' && 'We vragen toegang tot je microfoon...'}
          {state === 'permission_denied' && permissionError}
          {state === 'recording' && 'Spreek duidelijk in de microfoon'}
          {state === 'paused' && 'Druk op de knop om verder te gaan'}
          {(state === 'recorded' || state === 'playing') && 'Beluister je opname hieronder'}
        </p>
      </div>

      {/* Timer display */}
      <div className="flex justify-center mb-4" aria-live="polite" aria-atomic="true">
        <motion.div
          animate={state === 'recording' ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 1, repeat: Infinity }}
          className={`
            text-5xl font-display tabular-nums
            ${state === 'recording' ? 'text-sunset' : 'text-cocoa'}
          `}
          aria-label={`Opname tijd: ${formatTime(duration)}`}
        >
          {formatTime(duration)}
        </motion.div>
      </div>

      {/* Audio waveform visualization */}
      {(state === 'recording' || state === 'paused') && (
        <div className="flex items-center justify-center gap-1 h-16 mb-6" aria-hidden="true" role="presentation">
          {audioLevels.map((level, i) => (
            <motion.div
              key={i}
              className={`w-2 rounded-full ${state === 'paused' ? 'bg-cocoa-light' : 'bg-gradient-to-t from-sunset to-honey'}`}
              animate={{ height: state === 'paused' ? 8 : Math.max(8, level * 60) }}
              transition={{ duration: 0.05 }}
            />
          ))}
        </div>
      )}

      {/* Spacer when not recording */}
      {state !== 'recording' && state !== 'paused' && <div className="h-4 mb-4" />}

      {/* Main control */}
      <div className="flex justify-center mb-8" role="group" aria-label="Opname bediening">
        {(state === 'idle' || state === 'permission_denied') && (
          <Button variant="record" size="xl" onClick={startRecording} aria-label="Start opname">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </Button>
        )}

        {state === 'requesting_permission' && (
          <div className="w-[100px] h-[100px] rounded-[32px] bg-cream-dark flex items-center justify-center" aria-label="Wachten op microfoon toegang">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 border-4 border-honey border-t-transparent rounded-full"
              aria-hidden="true"
            />
          </div>
        )}

        {state === 'recording' && (
          <div className="flex items-center gap-4">
            {/* Pause button */}
            <Button variant="ghost" size="lg" onClick={pauseRecording} aria-label="Pauzeer opname">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </Button>

            {/* Stop button with pulsing ring */}
            <div className="relative">
              <motion.div
                className="absolute inset-0 rounded-[32px] bg-sunset pointer-events-none"
                animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                aria-hidden="true"
              />
              <Button variant="record" size="xl" onClick={stopRecording} aria-label="Stop opname">
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </Button>
            </div>
          </div>
        )}

        {state === 'paused' && (
          <div className="flex items-center gap-4">
            {/* Resume button */}
            <Button variant="primary" size="lg" onClick={resumeRecording} aria-label="Hervat opname">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </Button>

            {/* Stop button */}
            <Button variant="record" size="xl" onClick={stopRecording} aria-label="Stop opname">
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </Button>
          </div>
        )}

        {(state === 'recorded' || state === 'playing') && (
          <Button
            variant="play"
            size="xl"
            onClick={state === 'playing' ? stopPreview : playPreview}
            aria-label={state === 'playing' ? 'Stop preview' : 'Beluister opname'}
          >
            {state === 'playing' ? (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </Button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 justify-center">
        {(state === 'idle' || state === 'permission_denied') && (
          <Button variant="ghost" onClick={onCancel}>
            Annuleren
          </Button>
        )}

        {state === 'recording' && (
          <Button variant="ghost" onClick={onCancel}>
            Annuleren
          </Button>
        )}

        {state === 'paused' && (
          <>
            <Button variant="ghost" onClick={onCancel}>
              Annuleren
            </Button>
            <Button variant="primary" onClick={resumeRecording}>
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Verder opnemen
            </Button>
          </>
        )}

        {(state === 'recorded' || state === 'playing') && (
          <>
            <Button variant="ghost" onClick={resetRecording}>
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Opnieuw
            </Button>
            <Button variant="primary" onClick={confirmRecording}>
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Opslaan
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
