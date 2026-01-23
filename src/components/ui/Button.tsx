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
    bg-honey text-white
    hover:bg-honey-dark
    shadow-soft hover:shadow-lifted
  `,
  secondary: `
    bg-cream-dark text-cocoa
    hover:bg-honey-light
    shadow-soft hover:shadow-lifted
  `,
  ghost: `
    bg-transparent text-cocoa
    hover:bg-cream-dark
  `,
  play: `
    bg-sky text-white
    hover:bg-sky-light hover:text-cocoa
    shadow-lifted hover:shadow-floating
  `,
  record: `
    bg-sunset text-white
    hover:bg-sunset-light
    shadow-lifted hover:shadow-floating
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
