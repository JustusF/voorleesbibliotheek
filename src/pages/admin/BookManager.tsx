import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button, Card, ConfirmDialog } from '../../components/ui'
import {
  getBooks,
  getChaptersForBook,
  deleteBook,
} from '../../lib/storage'
import { AddBookModal } from './AddBookModal'
import { EditBookModal } from './EditBookModal'
import { ChapterList } from './ChapterList'
import type { Book, User } from '../../types'

interface BookManagerProps {
  users: User[]
  onBooksChanged: () => void
}

export function BookManager({ users, onBooksChanged }: BookManagerProps) {
  const [books, setBooks] = useState<Book[]>(() => getBooks())
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [showAddBook, setShowAddBook] = useState(false)
  const [showEditBook, setShowEditBook] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    confirmText?: string
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  const refreshBooks = () => {
    setBooks(getBooks())
    onBooksChanged()
  }

  // Refresh books when returning from child views
  useEffect(() => {
    setBooks(getBooks())
  }, [selectedBook])

  const handleEditBook = (book: Book) => {
    setSelectedBook(book)
    setShowEditBook(true)
  }

  const handleDeleteBook = (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    setConfirmDialog({
      isOpen: true,
      title: 'Boek verwijderen?',
      message: `Weet je zeker dat je "${book?.title || 'dit boek'}" wilt verwijderen? Alle hoofdstukken en opnames worden ook permanent verwijderd.`,
      confirmText: 'Verwijderen',
      onConfirm: () => {
        deleteBook(bookId)
        refreshBooks()
        if (selectedBook?.id === bookId) {
          setSelectedBook(null)
        }
      },
    })
  }

  // Book detail view (chapter list)
  if (selectedBook && !showEditBook) {
    return (
      <ChapterList
        book={selectedBook}
        users={users}
        onBack={() => setSelectedBook(null)}
        onEditBook={handleEditBook}
      />
    )
  }

  // Book list view
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-display text-xl text-cocoa">
            {books.length === 0 ? 'Nog geen boeken' : `${books.length} boek${books.length !== 1 ? 'en' : ''}`}
          </h2>
          <Button variant="primary" onClick={() => setShowAddBook(true)}>
            + Boek toevoegen
          </Button>
        </div>

        {books.length === 0 ? (
          <Card hoverable={false} className="p-8 text-center">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-cocoa-light mb-4">
              Voeg je eerste boek toe om te beginnen met voorlezen!
            </p>
            <Button variant="primary" onClick={() => setShowAddBook(true)}>
              + Eerste boek toevoegen
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {books.map((book) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-honey-light flex items-center justify-center text-2xl">
                    📖
                  </div>
                  <div className="flex-1">
                    <p className="font-display text-lg text-cocoa">{book.title}</p>
                    <p className="text-sm text-cocoa-light">
                      {book.author && <span>{book.author} · </span>}
                      {getChaptersForBook(book.id).length} hoofdstukken
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedBook(book)}
                  >
                    Bekijken
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditBook(book)}
                  >
                    Bewerken
                  </Button>
                  <button
                    onClick={() => handleDeleteBook(book.id)}
                    className="p-2 text-cocoa-light hover:text-sunset transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      <AddBookModal
        isOpen={showAddBook}
        onClose={() => setShowAddBook(false)}
        onBookAdded={refreshBooks}
      />

      <EditBookModal
        isOpen={showEditBook}
        book={selectedBook}
        onClose={() => setShowEditBook(false)}
        onBookSaved={(updatedBook) => {
          setSelectedBook(updatedBook)
          refreshBooks()
        }}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant="danger"
      />
    </>
  )
}
