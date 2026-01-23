import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef } from 'react'

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  children: React.ReactNode
  hoverable?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, hoverable = true, className = '', ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={hoverable ? { y: -4, scale: 1.01 } : undefined}
        whileTap={hoverable ? { scale: 0.99 } : undefined}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={`
          bg-white
          rounded-[24px]
          shadow-soft
          hover:shadow-lifted
          transition-shadow duration-300
          overflow-hidden
          ${className}
        `}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

Card.displayName = 'Card'
