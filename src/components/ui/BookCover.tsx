import { motion } from 'framer-motion'
import type { Book } from '../../types'

interface BookCoverProps {
  book: Book
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
}

const sizeStyles = {
  sm: 'w-28 h-36',
  md: 'w-40 h-52',
  lg: 'w-56 h-72',
}

// Richer color palette with depth
const colorPalettes = [
  { from: '#F5A623', via: '#FFB84D', to: '#D4890F', accent: '#FFF5E0' },  // Honey
  { from: '#7EC8E3', via: '#9DD5EB', to: '#5BB5D6', accent: '#E8F6FB' },  // Sky
  { from: '#C4B7D5', via: '#D5CCE3', to: '#9E8BB8', accent: '#F5F2F9' },  // Lavender
  { from: '#8FBC8F', via: '#A5CBA5', to: '#6B9A6B', accent: '#EFF5EF' },  // Moss
  { from: '#E85D4C', via: '#F07A6C', to: '#C94A3A', accent: '#FCEBE9' },  // Sunset
  { from: '#D4AF37', via: '#E5C55A', to: '#B8942E', accent: '#FCF8E8' },  // Gold
]

function getColorForTitle(title: string) {
  const index = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colorPalettes[index % colorPalettes.length]
}

// Decorative patterns for book covers
function BookPattern({ pattern }: { pattern: number }) {
  const patterns = [
    // Stars pattern
    <g key="stars" opacity="0.15">
      <text x="20" y="30" fontSize="12">✦</text>
      <text x="60" y="50" fontSize="8">✦</text>
      <text x="35" y="75" fontSize="10">✦</text>
      <text x="70" y="25" fontSize="6">✦</text>
      <text x="15" y="60" fontSize="8">✦</text>
    </g>,
    // Dots pattern
    <g key="dots" opacity="0.12">
      {[...Array(12)].map((_, i) => (
        <circle key={i} cx={15 + (i % 4) * 22} cy={20 + Math.floor(i / 4) * 25} r="3" fill="white" />
      ))}
    </g>,
    // Waves pattern
    <g key="waves" opacity="0.1" stroke="white" fill="none" strokeWidth="2">
      <path d="M0 30 Q 25 20, 50 30 T 100 30" />
      <path d="M0 55 Q 25 45, 50 55 T 100 55" />
      <path d="M0 80 Q 25 70, 50 80 T 100 80" />
    </g>,
    // Hearts pattern
    <g key="hearts" opacity="0.12">
      <text x="25" y="35" fontSize="14">♡</text>
      <text x="60" y="60" fontSize="10">♡</text>
      <text x="20" y="80" fontSize="8">♡</text>
      <text x="70" y="40" fontSize="12">♡</text>
    </g>,
    // Moon and stars
    <g key="moon" opacity="0.15">
      <text x="55" y="35" fontSize="18">☽</text>
      <text x="25" y="50" fontSize="8">✧</text>
      <text x="75" y="65" fontSize="6">✧</text>
      <text x="35" y="80" fontSize="10">✧</text>
    </g>,
  ]
  return <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">{patterns[pattern % patterns.length]}</svg>
}

export function BookCover({ book, size = 'md', onClick }: BookCoverProps) {
  const colors = getColorForTitle(book.title)
  const patternIndex = book.title.length % 5

  return (
    <motion.button
      whileHover={{ y: -10, rotateY: 8, rotateX: -3 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      className={`
        ${sizeStyles[size]}
        relative
        rounded-[20px]
        overflow-hidden
        shadow-lifted
        hover:shadow-floating
        cursor-pointer
        group
        border-0
        p-0
      `}
      style={{ perspective: '1000px', transformStyle: 'preserve-3d' }}
    >
      {book.cover_url ? (
        <>
          <img
            src={book.cover_url}
            alt={book.title}
            className="w-full h-full object-cover"
          />
          {/* Subtle overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/10" />
        </>
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center p-4 relative"
          style={{
            background: `linear-gradient(145deg, ${colors.from} 0%, ${colors.via} 50%, ${colors.to} 100%)`,
          }}
        >
          {/* Decorative pattern */}
          <BookPattern pattern={patternIndex} />

          {/* Book spine effect - enhanced */}
          <div
            className="absolute left-0 top-0 bottom-0 w-4"
            style={{
              background: `linear-gradient(90deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.05) 100%)`,
            }}
          />

          {/* Inner glow effect */}
          <div
            className="absolute inset-4 rounded-xl pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 30% 20%, ${colors.accent}40 0%, transparent 60%)`,
            }}
          />

          {/* Book icon with shadow */}
          <motion.svg
            className="w-14 h-14 text-white mb-3 drop-shadow-lg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            initial={{ opacity: 0.8 }}
            whileHover={{ opacity: 1, scale: 1.1 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </motion.svg>

          {/* Title with text shadow for depth */}
          <span
            className="text-white font-display text-center text-sm leading-tight px-3 relative z-10"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {book.title}
          </span>

          {/* Author if available */}
          {book.author && (
            <span
              className="text-white/80 text-center text-xs mt-1 px-3 relative z-10"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
            >
              {book.author}
            </span>
          )}
        </div>
      )}

      {/* Enhanced hover shine effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)',
        }}
        initial={{ x: '-100%' }}
        whileHover={{ x: '100%' }}
        transition={{ duration: 0.6 }}
      />

      {/* Border glow on hover */}
      <div className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 0 2px ${colors.accent}80`,
        }}
      />
    </motion.button>
  )
}
