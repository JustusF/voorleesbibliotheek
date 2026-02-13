import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui'

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void
  onCancel: () => void
}

type RecordingState = 'idle' | 'requesting_permission' | 'permission_denied' | 'mic_test' | 'recording' | 'paused' | 'recorded' | 'playing'

export function AudioRecorder({ onRecordingComplete, onCancel }: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(20).fill(0))
  const [showRecordingFlash, setShowRecordingFlash] = useState(false)
  const [micTestPeak, setMicTestPeak] = useState(0)

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

  // Request mic permission and start mic test
  const startMicTest = useCallback(async () => {
    setState('requesting_permission')
    setPermissionError(null)
    setMicTestPeak(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = stream

      // Setup audio analyser for waveform visualization
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser

      // Start animation loop for audio levels (mic test)
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
          // Track peak level for mic test feedback
          const avg = levels.reduce((a, b) => a + b, 0) / levels.length
          setMicTestPeak(prev => Math.max(prev, avg))
        }
        animationRef.current = requestAnimationFrame(updateLevels)
      }
      updateLevels()

      setState('mic_test')
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

  // Start actual recording (after mic test passes)
  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    })
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: mimeType })
      blobRef.current = blob
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setState('recorded')
      stream.getTracks().forEach(track => track.stop())
      streamRef.current = null
      // Stop animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      setAudioLevels(Array(20).fill(0))
    }

    mediaRecorder.start()
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
    setAudioUrl(null)
    blobRef.current = null
    setDuration(0)
    setMicTestPeak(0)
    setState('idle')
  }, [audioUrl])

  const confirmRecording = useCallback(() => {
    if (blobRef.current) {
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

      <div className="text-center mb-8">
        <h2 className="font-display text-2xl text-cocoa mb-2">
          {state === 'idle' && 'Klaar om op te nemen'}
          {state === 'requesting_permission' && 'Even geduld...'}
          {state === 'permission_denied' && 'Microfoon nodig'}
          {state === 'mic_test' && 'Test je microfoon'}
          {state === 'recording' && 'Aan het opnemen...'}
          {state === 'paused' && 'Gepauzeerd'}
          {(state === 'recorded' || state === 'playing') && 'Opname klaar!'}
        </h2>
        <p className="text-cocoa-light">
          {state === 'idle' && 'Druk op de knop om te beginnen'}
          {state === 'requesting_permission' && 'We vragen toegang tot je microfoon...'}
          {state === 'permission_denied' && permissionError}
          {state === 'mic_test' && 'Zeg iets om te controleren of je microfoon werkt'}
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

      {/* Mic test volume meter */}
      {state === 'mic_test' && (
        <div className="mb-6">
          <div className="flex items-center justify-center gap-1 h-16 mb-3" aria-hidden="true" role="presentation">
            {audioLevels.map((level, i) => (
              <motion.div
                key={i}
                className="w-2 rounded-full bg-gradient-to-t from-moss to-honey"
                animate={{ height: Math.max(8, level * 60) }}
                transition={{ duration: 0.05 }}
              />
            ))}
          </div>
          {/* Volume indicator */}
          <div className="flex items-center gap-2 justify-center">
            <div className="flex-1 max-w-[200px] bg-cream-dark rounded-full h-2 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  micTestPeak > 0.15 ? 'bg-moss' :
                  micTestPeak > 0.05 ? 'bg-honey' : 'bg-cocoa-light'
                }`}
                animate={{ width: `${Math.min(100, micTestPeak * 300)}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>
          </div>
          {micTestPeak < 0.05 && (
            <p className="text-center text-sm text-sunset mt-2">
              We horen nog niets — zeg iets of controleer je microfoon
            </p>
          )}
          {micTestPeak >= 0.05 && micTestPeak < 0.15 && (
            <p className="text-center text-sm text-honey-dark mt-2">
              Volume is laag — probeer dichter bij de microfoon te spreken
            </p>
          )}
          {micTestPeak >= 0.15 && (
            <p className="text-center text-sm text-moss mt-2">
              Microfoon werkt goed!
            </p>
          )}
        </div>
      )}

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
      {state !== 'recording' && state !== 'paused' && state !== 'mic_test' && <div className="h-4 mb-4" />}

      {/* Main control */}
      <div className="flex justify-center mb-8" role="group" aria-label="Opname bediening">
        {(state === 'idle' || state === 'permission_denied') && (
          <Button variant="record" size="xl" onClick={startMicTest} aria-label="Test microfoon">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="6" />
            </svg>
          </Button>
        )}

        {state === 'mic_test' && (
          <Button variant="record" size="xl" onClick={startRecording} aria-label="Start opname">
            <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="6" />
            </svg>
          </Button>
        )}

        {state === 'requesting_permission' && (
          <div className="w-[120px] h-[120px] rounded-[32px] bg-cream-dark flex items-center justify-center" aria-label="Wachten op microfoon toegang">
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
              <svg className="w-12 h-12 ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

        {state === 'mic_test' && (
          <>
            <Button variant="ghost" onClick={() => {
              // Stop stream and go back
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop())
                streamRef.current = null
              }
              if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
                animationRef.current = null
              }
              setAudioLevels(Array(20).fill(0))
              onCancel()
            }}>
              Annuleren
            </Button>
            <Button variant="primary" onClick={startRecording}>
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="6" />
              </svg>
              Start opname
            </Button>
          </>
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
