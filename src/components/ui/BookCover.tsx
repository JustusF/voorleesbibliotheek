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

const colorPalette = [
  'from-honey to-honey-dark',
  'from-sky to-sky-light',
  'from-lavender to-lavender',
  'from-moss to-moss',
  'from-sunset to-sunset-light',
]

function getGradientForTitle(title: string): string {
  const index = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colorPalette[index % colorPalette.length]
}

export function BookCover({ book, size = 'md', onClick }: BookCoverProps) {
  const gradient = getGradientForTitle(book.title)

  return (
    <motion.button
      whileHover={{ y: -8, rotateY: 5 }}
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
      style={{ perspective: '1000px' }}
    >
      {book.cover_url ? (
        <img
          src={book.cover_url}
          alt={book.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className={`
          w-full h-full
          bg-gradient-to-br ${gradient}
          flex flex-col items-center justify-center
          p-4
        `}>
          {/* Book spine effect */}
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-black/10" />

          {/* Book icon */}
          <svg
            className="w-12 h-12 text-white/80 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>

          <span className="text-white font-display text-center text-sm leading-tight px-2">
            {book.title}
          </span>
        </div>
      )}

      {/* Hover shine effect */}
      <div className="
        absolute inset-0
        bg-gradient-to-tr from-transparent via-white/20 to-transparent
        translate-x-[-100%] group-hover:translate-x-[100%]
        transition-transform duration-700
      " />
    </motion.button>
  )
}
