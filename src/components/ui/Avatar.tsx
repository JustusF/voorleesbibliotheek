import { motion } from 'framer-motion'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeStyles = {
  sm: 'w-10 h-10 text-sm',
  md: 'w-16 h-16 text-lg',
  lg: 'w-24 h-24 text-2xl',
  xl: 'w-32 h-32 text-4xl',
}

const colorPalette = [
  'bg-honey-light',
  'bg-sky-light',
  'bg-lavender',
  'bg-moss',
  'bg-sunset-light',
]

function getColorForName(name: string): string {
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colorPalette[index % colorPalette.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  const bgColor = getColorForName(name)
  const initials = getInitials(name)

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`
        ${sizeStyles[size]}
        rounded-full
        flex items-center justify-center
        overflow-hidden
        shadow-soft
        ring-4 ring-white
        cursor-pointer
        ${src ? '' : bgColor}
        ${className}
      `}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-display font-semibold text-cocoa select-none">
          {initials}
        </span>
      )}
    </motion.div>
  )
}
