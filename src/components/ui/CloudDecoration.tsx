import { motion } from 'framer-motion'

interface CloudDecorationProps {
  className?: string
  variant?: 'default' | 'sparse' | 'rich'
}

// Cloud SVG path
const cloudPath = "M56 30c4.4 0 8-3.6 8-8s-3.6-8-8-8c0-7.7-6.3-14-14-14-5.5 0-10.3 3.2-12.6 7.8C27.8 6.6 25.5 6 23 6c-6.6 0-12 5.4-12 12 0 .3 0 .7.1 1C5.5 20.2 1 25.4 1 31.5c0 .2 0 .3 0 .5h55z"

// Soft cloud shape
const softCloudPath = "M48 32c6 0 10-4 10-9s-4-8-9-8c-1-8-8-15-17-15-6 0-11 3-14 8-2-1-4-1-6-1-7 0-12 6-12 13v1c-5 1-8 6-8 11h56z"

interface CloudConfig {
  x: string
  y: string
  size: string
  color: string
  duration: number
  delay: number
  opacity: number
  path: string
}

export function CloudDecoration({ className = '', variant = 'default' }: CloudDecorationProps) {
  const clouds: CloudConfig[] = variant === 'sparse' ? [
    { x: 'left-4', y: 'top-8', size: 'w-20 h-14', color: 'fill-cocoa-light', duration: 5, delay: 0, opacity: 0.12, path: cloudPath },
    { x: 'right-8', y: 'top-16', size: 'w-16 h-12', color: 'fill-sky', duration: 6, delay: 1.5, opacity: 0.1, path: softCloudPath },
  ] : variant === 'rich' ? [
    { x: 'left-4', y: 'top-6', size: 'w-28 h-20', color: 'fill-cocoa-light', duration: 5, delay: 0, opacity: 0.15, path: cloudPath },
    { x: 'right-6', y: 'top-12', size: 'w-24 h-16', color: 'fill-sky', duration: 6, delay: 1, opacity: 0.12, path: softCloudPath },
    { x: 'left-1/4', y: 'top-20', size: 'w-16 h-12', color: 'fill-honey', duration: 7, delay: 2, opacity: 0.08, path: cloudPath },
    { x: 'right-1/4', y: 'top-1/4', size: 'w-20 h-14', color: 'fill-lavender', duration: 8, delay: 0.5, opacity: 0.1, path: softCloudPath },
    { x: 'left-8', y: 'bottom-1/4', size: 'w-14 h-10', color: 'fill-moss', duration: 6, delay: 3, opacity: 0.08, path: cloudPath },
    { x: 'right-12', y: 'bottom-1/3', size: 'w-18 h-12', color: 'fill-sky-light', duration: 7, delay: 1.5, opacity: 0.1, path: softCloudPath },
  ] : [
    { x: 'left-6', y: 'top-8', size: 'w-24 h-16', color: 'fill-cocoa-light', duration: 5, delay: 0, opacity: 0.15, path: cloudPath },
    { x: 'right-10', y: 'top-14', size: 'w-20 h-14', color: 'fill-sky', duration: 6, delay: 1, opacity: 0.12, path: softCloudPath },
    { x: 'left-1/3', y: 'top-1/4', size: 'w-16 h-12', color: 'fill-honey', duration: 7, delay: 2, opacity: 0.08, path: cloudPath },
    { x: 'right-1/4', y: 'top-1/5', size: 'w-14 h-10', color: 'fill-lavender', duration: 5.5, delay: 0.8, opacity: 0.1, path: softCloudPath },
  ]

  return (
    <div className={`pointer-events-none select-none fixed inset-0 overflow-hidden ${className}`}>
      {clouds.map((cloud, i) => (
        <motion.div
          key={i}
          animate={{
            y: [0, -12, 0],
            x: [0, i % 2 === 0 ? 5 : -5, 0],
          }}
          transition={{
            duration: cloud.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: cloud.delay,
          }}
          className={`absolute ${cloud.x} ${cloud.y}`}
          style={{ opacity: cloud.opacity }}
        >
          <svg viewBox="0 0 64 40" className={`${cloud.size} ${cloud.color}`}>
            <path d={cloud.path} />
          </svg>
        </motion.div>
      ))}

      {/* Subtle gradient orbs for atmosphere */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.03, 0.06, 0.03],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-honey blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.03, 0.05, 0.03],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-sky blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.02, 0.04, 0.02],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-lavender blur-3xl"
      />
    </div>
  )
}
