import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, useToast } from '../../components/ui'
import { updateUser } from '../../lib/storage'
import type { User } from '../../types'

interface EditReaderModalProps {
  isOpen: boolean
  user: User | null
  onClose: () => void
  onReaderSaved: () => void
}

export function EditReaderModal({ isOpen, user, onClose, onReaderSaved }: EditReaderModalProps) {
  const { showToast } = useToast()
  const [editReaderName, setEditReaderName] = useState('')
  const [editReaderPhoto, setEditReaderPhoto] = useState<string | null>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user && isOpen) {
      setEditReaderName(user.name)
      setEditReaderPhoto(user.avatar_url)
    }
  }, [user, isOpen])

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 500 * 1024) {
      showToast('De foto is te groot. Kies een foto kleiner dan 500KB.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setEditReaderPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveReader = () => {
    if (!user || !editReaderName.trim()) return
    updateUser(user.id, {
      name: editReaderName.trim(),
      avatar_url: editReaderPhoto,
    })
    onReaderSaved()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && user && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-[24px] sm:rounded-[24px] shadow-floating p-6 max-w-md w-full"
          >
            <h2 className="font-display text-2xl text-cocoa mb-6">Voorlezer bewerken</h2>

            <input
              ref={editFileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {/* Photo upload */}
            <div className="flex justify-center mb-6">
              <button
                onClick={() => editFileInputRef.current?.click()}
                className="relative group min-w-[44px] min-h-[44px]"
              >
                {editReaderPhoto ? (
                  <img
                    src={editReaderPhoto}
                    alt="Preview"
                    className="w-24 h-24 rounded-full object-cover ring-4 ring-cream-dark"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-cream-dark flex items-center justify-center ring-4 ring-cream">
                    <span className="text-3xl font-display text-cocoa">
                      {editReaderName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </button>
            </div>
            <p className="text-center text-sm text-cocoa-light mb-6">Klik om de foto te wijzigen</p>

            <div>
              <label className="block text-sm font-medium text-cocoa mb-2">
                Naam
              </label>
              <input
                type="text"
                value={editReaderName}
                onChange={(e) => setEditReaderName(e.target.value)}
                placeholder="Bijv. Tante Mia"
                className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors"
              />
            </div>

            {editReaderPhoto && (
              <button
                onClick={() => setEditReaderPhoto(null)}
                className="mt-4 text-sm text-sunset hover:underline min-h-[44px]"
              >
                Foto verwijderen
              </button>
            )}

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" onClick={onClose} className="flex-1">
                Annuleren
              </Button>
              <Button variant="primary" onClick={handleSaveReader} className="flex-1">
                Opslaan
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
