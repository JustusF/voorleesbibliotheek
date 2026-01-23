import { useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  showCloseButton?: boolean
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={`bg-white rounded-[24px] shadow-floating p-6 w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto relative`}
          >
            {/* Close button */}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Sluiten"
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-cream-dark hover:bg-honey-light flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Title */}
            <h2 id="modal-title" className="font-display text-2xl text-cocoa mb-6 pr-10">
              {title}
            </h2>

            {/* Content */}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Form-specific modal with cancel/confirm actions
interface FormModalProps extends Omit<ModalProps, 'children'> {
  children: ReactNode
  onConfirm: () => void
  confirmText?: string
  cancelText?: string
  isConfirmDisabled?: boolean
  isLoading?: boolean
}

export function FormModal({
  onConfirm,
  confirmText = 'Opslaan',
  cancelText = 'Annuleren',
  isConfirmDisabled = false,
  isLoading = false,
  children,
  ...modalProps
}: FormModalProps) {
  return (
    <Modal {...modalProps}>
      {children}

      <div className="flex gap-3 mt-6">
        <button
          onClick={modalProps.onClose}
          className="flex-1 px-4 py-3 rounded-xl border-2 border-cream-dark text-cocoa hover:bg-cream transition-colors font-medium"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={isConfirmDisabled || isLoading}
          className={`
            flex-1 px-4 py-3 rounded-xl font-medium transition-colors
            ${isConfirmDisabled || isLoading
              ? 'bg-cream-dark text-cocoa-light cursor-not-allowed'
              : 'bg-honey text-white hover:bg-honey-dark'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
              />
              Bezig...
            </span>
          ) : (
            confirmText
          )}
        </button>
      </div>
    </Modal>
  )
}

// Confirmation dialog
interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Bevestigen',
  cancelText = 'Annuleren',
  variant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" showCloseButton={false}>
      <p className="text-cocoa-light mb-6">{message}</p>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 rounded-xl border-2 border-cream-dark text-cocoa hover:bg-cream transition-colors font-medium"
        >
          {cancelText}
        </button>
        <button
          onClick={handleConfirm}
          className={`
            flex-1 px-4 py-3 rounded-xl font-medium transition-colors
            ${variant === 'danger'
              ? 'bg-sunset text-white hover:bg-sunset/90'
              : 'bg-honey text-white hover:bg-honey-dark'
            }
          `}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
