import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../../components/ui'
import { updateBook, getChaptersForBook } from '../../lib/storage'
import type { Book } from '../../types'

// Search for book cover using Google Books API
async function searchBookCover(title: string, author?: string): Promise<string | null> {
  try {
    const searchQuery = encodeURIComponent(
      author ? `${title} ${author}` : title
    )
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${searchQuery}&maxResults=5`
    )
    const data = await response.json()

    if (data.items && data.items.length > 0) {
      for (const book of data.items) {
        const imageLinks = book.volumeInfo?.imageLinks
        if (imageLinks) {
          const coverUrl = (
            imageLinks.extraLarge ||
            imageLinks.large ||
            imageLinks.medium ||
            imageLinks.thumbnail ||
            imageLinks.smallThumbnail
          )?.replace('http://', 'https://')
          if (coverUrl) {
            return coverUrl
          }
        }
      }
    }
    return null
  } catch (error) {
    console.error('Error fetching book cover:', error)
    return null
  }
}

interface EditBookModalProps {
  isOpen: boolean
  book: Book | null
  onClose: () => void
  onBookSaved: (updatedBook: Book) => void
}

export function EditBookModal({ isOpen, book, onClose, onBookSaved }: EditBookModalProps) {
  const [editBookTitle, setEditBookTitle] = useState('')
  const [editBookAuthor, setEditBookAuthor] = useState('')
  const [editBookCover, setEditBookCover] = useState<string | null>(null)
  const [isSearchingEditCover, setIsSearchingEditCover] = useState(false)
  const [chapterCount, setChapterCount] = useState(0)

  useEffect(() => {
    if (book && isOpen) {
      setEditBookTitle(book.title)
      setEditBookAuthor(book.author || '')
      setEditBookCover(book.cover_url)
      setChapterCount(getChaptersForBook(book.id).length)
    }
  }, [book, isOpen])

  const handleSearchEditCover = async () => {
    if (!editBookTitle.trim()) return

    setIsSearchingEditCover(true)
    const cover = await searchBookCover(editBookTitle.trim(), editBookAuthor.trim() || undefined)
    if (cover) {
      setEditBookCover(cover)
    }
    setIsSearchingEditCover(false)
  }

  const handleSaveBook = () => {
    if (!book || !editBookTitle.trim()) return

    updateBook(book.id, {
      title: editBookTitle.trim(),
      author: editBookAuthor.trim() || null,
      cover_url: editBookCover
    })

    onBookSaved({
      ...book,
      title: editBookTitle.trim(),
      author: editBookAuthor.trim() || null,
      cover_url: editBookCover
    })
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && book && (
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
            className="bg-white rounded-t-[24px] sm:rounded-[24px] shadow-floating p-6 max-w-lg w-full"
          >
            <h2 className="font-display text-2xl text-cocoa mb-6">Boek bewerken</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-cocoa mb-2">
                  Titel van het boek
                </label>
                <input
                  type="text"
                  value={editBookTitle}
                  onChange={(e) => setEditBookTitle(e.target.value)}
                  placeholder="Bijv. Kikker en zijn vriendjes"
                  className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-cocoa mb-2">
                  Schrijver (optioneel)
                </label>
                <input
                  type="text"
                  value={editBookAuthor}
                  onChange={(e) => setEditBookAuthor(e.target.value)}
                  placeholder="Bijv. Max Velthuijs"
                  className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors"
                />
              </div>

              {/* Cover art section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-cocoa">
                    Boekomslag
                  </label>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSearchEditCover}
                    disabled={isSearchingEditCover || !editBookTitle.trim()}
                  >
                    {isSearchingEditCover ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-4 h-4 border-2 border-cocoa-light border-t-transparent rounded-full mr-2"
                        />
                        Zoeken...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Zoek cover
                      </>
                    )}
                  </Button>
                </div>
                {editBookCover ? (
                  <div className="flex items-center gap-4 p-3 bg-cream rounded-xl">
                    <img
                      src={editBookCover}
                      alt="Boekomslag"
                      className="w-16 h-20 object-cover rounded-lg shadow-sm"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-cocoa">Boekomslag ingesteld</p>
                      <button
                        onClick={() => setEditBookCover(null)}
                        className="text-sm text-sunset hover:underline"
                      >
                        Verwijderen
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-cocoa-light">
                    Geen boekomslag. Klik op "Zoek cover" om er een te vinden.
                  </p>
                )}
              </div>

              <div className="bg-cream rounded-xl p-4">
                <p className="text-sm text-cocoa-light">
                  <strong>{chapterCount}</strong> hoofdstukken in dit boek.
                  Ga naar het boek overzicht om hoofdstukken toe te voegen of te verwijderen.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" onClick={onClose} className="flex-1">
                Annuleren
              </Button>
              <Button variant="primary" onClick={handleSaveBook} className="flex-1">
                Opslaan
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
