import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button, CloudDecoration } from '../components/ui'
import { FAMILY_NAME } from '../lib/storage'

// Floating stars decoration
function FloatingStars() {
  const stars = [
    { x: '10%', y: '15%', delay: 0, size: 'text-lg' },
    { x: '85%', y: '20%', delay: 0.5, size: 'text-xl' },
    { x: '15%', y: '70%', delay: 1, size: 'text-base' },
    { x: '90%', y: '75%', delay: 1.5, size: 'text-lg' },
    { x: '50%', y: '10%', delay: 2, size: 'text-sm' },
    { x: '75%', y: '60%', delay: 0.8, size: 'text-base' },
    { x: '25%', y: '85%', delay: 1.2, size: 'text-lg' },
  ]

  return (
    <>
      {stars.map((star, i) => (
        <motion.div
          key={i}
          className={`absolute ${star.size} pointer-events-none select-none`}
          style={{ left: star.x, top: star.y }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            scale: [0.8, 1.1, 0.8],
          }}
          transition={{
            duration: 3,
            delay: star.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          ✨
        </motion.div>
      ))}
    </>
  )
}

// Animated open book icon
function AnimatedBookIcon() {
  return (
    <motion.div
      className="relative w-36 h-36 mx-auto mb-8"
      initial={{ scale: 0.5, opacity: 0, rotateY: -30 }}
      animate={{ scale: 1, opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.8, type: 'spring', stiffness: 150 }}
    >
      {/* Glow effect */}
      <motion.div
        className="absolute inset-0 rounded-[36px] bg-gradient-to-br from-honey to-honey-dark blur-xl"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Main icon container */}
      <motion.div
        className="relative w-full h-full bg-gradient-to-br from-honey via-honey to-honey-dark rounded-[36px] shadow-floating flex items-center justify-center glow-honey"
        whileHover={{ scale: 1.05, rotateY: 10 }}
        transition={{ type: 'spring', stiffness: 300 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Book pages effect */}
        <motion.div
          className="absolute inset-2 rounded-[30px] bg-white/10"
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Book icon */}
        <motion.svg
          className="w-18 h-18 text-white drop-shadow-lg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          animate={{
            rotateZ: [0, 2, 0, -2, 0],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </motion.svg>

        {/* Sparkle on corner */}
        <motion.div
          className="absolute -top-2 -right-2 text-2xl"
          animate={{
            scale: [0, 1, 0],
            rotate: [0, 180, 360],
          }}
          transition={{ duration: 2, repeat: Infinity, delay: 1 }}
        >
          ⭐
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <CloudDecoration />
      <FloatingStars />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center z-10"
      >
        {/* Logo/Title */}
        <div className="mb-8">
          <AnimatedBookIcon />

          <motion.h1
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-cocoa mb-4 px-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <span className="block">De</span>
            <motion.span
              className="block shimmer-text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Voorleesbibliotheek
            </motion.span>
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl text-cocoa-light max-w-lg mx-auto font-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Verhalen voorgelezen door de mensen die van je houden
          </motion.p>
        </div>

        {/* Buttons with staggered animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-5 justify-center"
        >
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="play"
              size="lg"
              onClick={() => navigate('/luisteren')}
              className="min-w-[220px] glow-sky"
            >
              <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Luisteren
            </Button>
          </motion.div>

          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/voorlezen')}
              className="min-w-[220px]"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Voorlezen
            </Button>
          </motion.div>
        </motion.div>

        {/* Admin link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-10"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/beheer')}
            className="text-cocoa-light hover:text-cocoa"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Beheer
          </Button>
        </motion.div>

        {/* Family indicator with decorative line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-10 text-center"
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-8 h-px bg-gradient-to-r from-transparent to-cocoa-light/30" />
            <p className="text-sm text-cocoa-light font-medium">{FAMILY_NAME}</p>
            <div className="w-8 h-px bg-gradient-to-l from-transparent to-cocoa-light/30" />
          </div>
          <p className="text-xs text-cocoa-light/50 italic">Mogelijk gemaakt vanuit Kenia</p>
          <p className="text-xs text-cocoa-light/30 mt-2">v{__APP_VERSION__}</p>
        </motion.div>
      </motion.div>

      {/* Enhanced decorative elements */}
      <motion.div
        animate={{
          y: [0, -15, 0],
          rotate: [0, 5, 0],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-8 left-8 text-5xl opacity-25"
      >
        📚
      </motion.div>
      <motion.div
        animate={{
          y: [0, -12, 0],
          rotate: [0, -5, 0],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute bottom-12 right-12 text-4xl opacity-25"
      >
        🎧
      </motion.div>
      <motion.div
        animate={{
          y: [0, -8, 0],
          x: [0, 5, 0],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute top-1/3 left-12 text-3xl opacity-20 hidden md:block"
      >
        🌙
      </motion.div>
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 10, 0],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute top-1/4 right-16 text-2xl opacity-20 hidden md:block"
      >
        💫
      </motion.div>
    </div>
  )
}
