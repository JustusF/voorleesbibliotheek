// Efteling-style page turn chime — synthesized with Web Audio API
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext()
  }
  return audioContext
}

/**
 * Plays a bright bell/triangle chime reminiscent of the classic
 * Efteling read-along books' page turn signal.
 * Returns a promise that resolves when the chime has finished.
 */
export function playChapterChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext()
      const now = ctx.currentTime

      // Resume context if suspended (autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.35, now)
      masterGain.connect(ctx.destination)

      // Bell tone: fundamental + harmonics with fast decay
      const tones = [
        { freq: 1047, gain: 0.6, decay: 1.2 },  // C6 - fundamental
        { freq: 2094, gain: 0.25, decay: 0.8 },  // C7 - octave
        { freq: 3136, gain: 0.1, decay: 0.5 },   // G7 - fifth overtone
      ]

      tones.forEach(({ freq, gain, decay }) => {
        const osc = ctx.createOscillator()
        const env = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now)

        env.gain.setValueAtTime(gain, now)
        env.gain.exponentialRampToValueAtTime(0.001, now + decay)

        osc.connect(env)
        env.connect(masterGain)
        osc.start(now)
        osc.stop(now + decay)
      })

      // Resolve after the longest tone finishes
      setTimeout(resolve, 1200)
    } catch {
      // Silently fail — audio is non-critical
      resolve()
    }
  })
}
