import { motion } from 'framer-motion'

interface CloudDecorationProps {
  className?: string
}

export function CloudDecoration({ className = '' }: CloudDecorationProps) {
  return (
    <div className={`pointer-events-none select-none ${className}`}>
      {/* Top left cloud */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-8 left-8 text-6xl opacity-20"
      >
        <svg viewBox="0 0 64 40" className="w-24 h-16 fill-cocoa-light">
          <path d="M56 30c4.4 0 8-3.6 8-8s-3.6-8-8-8c0-7.7-6.3-14-14-14-5.5 0-10.3 3.2-12.6 7.8C27.8 6.6 25.5 6 23 6c-6.6 0-12 5.4-12 12 0 .3 0 .7.1 1C5.5 20.2 1 25.4 1 31.5c0 .2 0 .3 0 .5h55z"/>
        </svg>
      </motion.div>

      {/* Top right cloud */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute top-12 right-12 text-4xl opacity-15"
      >
        <svg viewBox="0 0 64 40" className="w-20 h-14 fill-sky">
          <path d="M56 30c4.4 0 8-3.6 8-8s-3.6-8-8-8c0-7.7-6.3-14-14-14-5.5 0-10.3 3.2-12.6 7.8C27.8 6.6 25.5 6 23 6c-6.6 0-12 5.4-12 12 0 .3 0 .7.1 1C5.5 20.2 1 25.4 1 31.5c0 .2 0 .3 0 .5h55z"/>
        </svg>
      </motion.div>

      {/* Middle cloud */}
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute top-1/4 right-1/4 text-5xl opacity-10"
      >
        <svg viewBox="0 0 64 40" className="w-16 h-12 fill-honey">
          <path d="M56 30c4.4 0 8-3.6 8-8s-3.6-8-8-8c0-7.7-6.3-14-14-14-5.5 0-10.3 3.2-12.6 7.8C27.8 6.6 25.5 6 23 6c-6.6 0-12 5.4-12 12 0 .3 0 .7.1 1C5.5 20.2 1 25.4 1 31.5c0 .2 0 .3 0 .5h55z"/>
        </svg>
      </motion.div>
    </div>
  )
}
