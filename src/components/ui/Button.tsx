import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'play' | 'record'
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-br from-honey via-honey to-honey-dark text-white
    hover:from-honey-dark hover:via-honey hover:to-honey
    shadow-soft hover:shadow-lifted
    border-2 border-honey-dark/20
  `,
  secondary: `
    bg-gradient-to-br from-cream to-cream-dark text-cocoa
    hover:from-honey-light hover:to-honey-light
    shadow-soft hover:shadow-lifted
    border-2 border-cocoa/10
  `,
  ghost: `
    bg-transparent text-cocoa
    hover:bg-cream-dark/80
    border-2 border-transparent
  `,
  play: `
    bg-gradient-to-br from-sky via-sky to-sky-light text-white
    hover:from-sky-light hover:via-sky hover:to-sky
    shadow-lifted hover:shadow-floating
    border-2 border-sky/30
  `,
  record: `
    bg-gradient-to-br from-sunset via-sunset to-sunset-light text-white
    hover:from-sunset-light hover:via-sunset hover:to-sunset
    shadow-lifted hover:shadow-floating
    border-2 border-sunset-light/30
  `,
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm rounded-[16px]',
  md: 'px-6 py-3 text-base rounded-[20px]',
  lg: 'px-8 py-4 text-lg rounded-[24px]',
  xl: 'px-10 py-6 text-xl rounded-[32px] min-w-[120px] min-h-[120px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={`
          inline-flex items-center justify-center gap-2
          font-semibold cursor-pointer
          transition-colors duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {children}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'
