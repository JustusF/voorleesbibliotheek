import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

const ADMIN_PIN_KEY = 'voorleesbibliotheek_admin_pin'
const ADMIN_SESSION_KEY = 'voorleesbibliotheek_admin_session'
const ADMIN_SESSION_TIMESTAMP_KEY = 'voorleesbibliotheek_admin_session_ts'
const ADMIN_RATE_LIMIT_KEY = 'voorleesbibliotheek_admin_rate_limit'

const SESSION_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 3
const LOCKOUT_DURATION_MS = 5 * 60 * 1000 // 5 minutes

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

interface RateLimitState {
  attempts: number
  firstAttemptTime: number
  lockoutUntil: number | null
}

function getRateLimitState(): RateLimitState {
  try {
    const stored = localStorage.getItem(ADMIN_RATE_LIMIT_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch { /* ignore */ }
  return { attempts: 0, firstAttemptTime: 0, lockoutUntil: null }
}

function setRateLimitState(state: RateLimitState) {
  localStorage.setItem(ADMIN_RATE_LIMIT_KEY, JSON.stringify(state))
}

function checkRateLimit(): { allowed: boolean; lockoutRemainingMs: number } {
  const state = getRateLimitState()
  const now = Date.now()

  // Check if currently locked out
  if (state.lockoutUntil && now < state.lockoutUntil) {
    return { allowed: false, lockoutRemainingMs: state.lockoutUntil - now }
  }

  // Clear lockout if expired
  if (state.lockoutUntil && now >= state.lockoutUntil) {
    setRateLimitState({ attempts: 0, firstAttemptTime: 0, lockoutUntil: null })
    return { allowed: true, lockoutRemainingMs: 0 }
  }

  // Reset attempts if more than 1 minute since first attempt
  if (state.attempts > 0 && now - state.firstAttemptTime > 60 * 1000) {
    setRateLimitState({ attempts: 0, firstAttemptTime: 0, lockoutUntil: null })
    return { allowed: true, lockoutRemainingMs: 0 }
  }

  return { allowed: true, lockoutRemainingMs: 0 }
}

function recordFailedAttempt(): { locked: boolean; lockoutRemainingMs: number } {
  const state = getRateLimitState()
  const now = Date.now()

  const newState: RateLimitState = {
    attempts: state.attempts + 1,
    firstAttemptTime: state.firstAttemptTime || now,
    lockoutUntil: null,
  }

  if (newState.attempts >= MAX_ATTEMPTS) {
    newState.lockoutUntil = now + LOCKOUT_DURATION_MS
    newState.attempts = 0
    newState.firstAttemptTime = 0
  }

  setRateLimitState(newState)

  if (newState.lockoutUntil) {
    return { locked: true, lockoutRemainingMs: LOCKOUT_DURATION_MS }
  }
  return { locked: false, lockoutRemainingMs: 0 }
}

/** Check if the session is still valid (not expired) */
export function isSessionValid(): boolean {
  const session = sessionStorage.getItem(ADMIN_SESSION_KEY)
  if (session !== 'true') return false

  const tsStr = sessionStorage.getItem(ADMIN_SESSION_TIMESTAMP_KEY)
  if (!tsStr) return false

  const ts = parseInt(tsStr, 10)
  return Date.now() - ts < SESSION_TIMEOUT_MS
}

/** Refresh the session activity timestamp */
export function refreshSession() {
  sessionStorage.setItem(ADMIN_SESSION_TIMESTAMP_KEY, String(Date.now()))
}

export { ADMIN_PIN_KEY, ADMIN_SESSION_KEY, ADMIN_SESSION_TIMESTAMP_KEY }

export function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isSetup, setIsSetup] = useState(false)
  const [confirmPin, setConfirmPin] = useState('')
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [lockoutRemaining, setLockoutRemaining] = useState(0)

  useEffect(() => {
    const storedPin = localStorage.getItem(ADMIN_PIN_KEY)
    if (!storedPin) {
      setIsSetup(true)
    }
  }, [])

  // Update lockout countdown
  useEffect(() => {
    if (lockoutRemaining <= 0) return

    const interval = setInterval(() => {
      const { allowed, lockoutRemainingMs } = checkRateLimit()
      if (allowed) {
        setLockoutRemaining(0)
        setError('')
      } else {
        setLockoutRemaining(lockoutRemainingMs)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lockoutRemaining])

  // Check rate limit on mount
  useEffect(() => {
    const { allowed, lockoutRemainingMs } = checkRateLimit()
    if (!allowed) {
      setLockoutRemaining(lockoutRemainingMs)
      const mins = Math.ceil(lockoutRemainingMs / 60000)
      setError(`Te veel pogingen. Probeer het over ${mins} minuten opnieuw.`)
    }
  }, [])

  const startSession = useCallback(() => {
    sessionStorage.setItem(ADMIN_SESSION_KEY, 'true')
    sessionStorage.setItem(ADMIN_SESSION_TIMESTAMP_KEY, String(Date.now()))
    onUnlock()
  }, [onUnlock])

  const handlePinInput = async (digit: string) => {
    // Block input during lockout
    if (lockoutRemaining > 0) return

    if (isSetup) {
      if (step === 'enter') {
        const newPin = pin + digit
        setPin(newPin)
        setError('')
        if (newPin.length === 4) {
          setStep('confirm')
          setConfirmPin('')
        }
      } else {
        const newConfirm = confirmPin + digit
        setConfirmPin(newConfirm)
        setError('')
        if (newConfirm.length === 4) {
          if (newConfirm === pin) {
            // Hash the PIN before storing
            const hashedPin = await hashPin(pin)
            localStorage.setItem(ADMIN_PIN_KEY, hashedPin)
            startSession()
          } else {
            setError('Pincodes komen niet overeen')
            setPin('')
            setConfirmPin('')
            setStep('enter')
          }
        }
      }
    } else {
      const newPin = pin + digit
      setPin(newPin)
      setError('')
      if (newPin.length === 4) {
        const storedPin = localStorage.getItem(ADMIN_PIN_KEY)
        const hashedInput = await hashPin(newPin)

        // Support both hashed and legacy plain-text PINs
        if (hashedInput === storedPin || newPin === storedPin) {
          // If it was a plain-text PIN, upgrade it to hashed
          if (newPin === storedPin) {
            localStorage.setItem(ADMIN_PIN_KEY, hashedInput)
          }
          // Clear rate limit on success
          setRateLimitState({ attempts: 0, firstAttemptTime: 0, lockoutUntil: null })
          startSession()
        } else {
          const result = recordFailedAttempt()
          if (result.locked) {
            const mins = Math.ceil(result.lockoutRemainingMs / 60000)
            setError(`Te veel pogingen. Probeer het over ${mins} minuten opnieuw.`)
            setLockoutRemaining(result.lockoutRemainingMs)
          } else {
            setError('Onjuiste pincode')
          }
          setPin('')
        }
      }
    }
  }

  const handleBackspace = () => {
    if (lockoutRemaining > 0) return

    if (isSetup && step === 'confirm') {
      setConfirmPin(prev => prev.slice(0, -1))
    } else {
      setPin(prev => prev.slice(0, -1))
    }
    setError('')
  }

  const currentPin = isSetup && step === 'confirm' ? confirmPin : pin
  const isLocked = lockoutRemaining > 0

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs text-center"
      >
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="font-display text-2xl text-cocoa mb-2">
          {isSetup
            ? step === 'enter' ? 'Kies een pincode' : 'Bevestig pincode'
            : 'Voer pincode in'
          }
        </h1>
        <p className="text-cocoa-light text-sm mb-8">
          {isSetup
            ? step === 'enter' ? 'Kies een 4-cijferige code voor de beheerpagina' : 'Voer dezelfde code nogmaals in'
            : 'Voer je 4-cijferige pincode in om verder te gaan'
          }
        </p>

        {/* Pin dots */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              animate={error ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              className={`w-4 h-4 rounded-full transition-colors ${
                i < currentPin.length ? 'bg-honey' : 'bg-cream-dark'
              } ${error ? 'bg-sunset' : ''}`}
            />
          ))}
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sunset text-sm mb-4"
          >
            {error}
          </motion.p>
        )}

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handlePinInput(String(num))}
              disabled={isLocked}
              className="w-16 h-16 rounded-2xl bg-white shadow-soft text-xl font-display text-cocoa hover:bg-cream active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] min-w-[44px]"
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => navigate('/')}
            className="w-16 h-16 rounded-2xl text-cocoa-light hover:bg-cream-dark/50 flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => handlePinInput('0')}
            disabled={isLocked}
            className="w-16 h-16 rounded-2xl bg-white shadow-soft text-xl font-display text-cocoa hover:bg-cream active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] min-w-[44px]"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={isLocked}
            className="w-16 h-16 rounded-2xl text-cocoa-light hover:bg-cream-dark/50 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] min-w-[44px]"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
            </svg>
          </button>
        </div>
      </motion.div>
    </div>
  )
}
