import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button, CloudDecoration, Avatar, Card } from '../components/ui'
import { AudioRecorder } from '../components/AudioRecorder'
import { FileUpload } from '../components/FileUpload'
import { getBooks, getUsers, addRecording, addBook, getOrCreateNextChapter } from '../lib/storage'
import type { Book, Chapter, User } from '../types'

type Step = 'reader' | 'book' | 'record' | 'success'
type RecordMode = 'record' | 'upload' | null
type BookMode = 'select' | 'new'

export function ReadPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('reader')
  const [books, setBooks] = useState<Book[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedReader, setSelectedReader] = useState<User | null>(null)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [recordMode, setRecordMode] = useState<RecordMode>(null)
  const [bookMode, setBookMode] = useState<BookMode>('select')
  const [newBookTitle, setNewBookTitle] = useState('')
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null)

  useEffect(() => {
    setBooks(getBooks())
    setUsers(getUsers())
  }, [])

  const handleReaderSelect = (reader: User) => {
    setSelectedReader(reader)
    setStep('book')
  }

  const handleBookSelect = (book: Book) => {
    setSelectedBook(book)
    setBookMode('select')
    // Automatically create/get next chapter and go to record
    const chapter = getOrCreateNextChapter(book.id)
    setCurrentChapter(chapter)
    setStep('record')
  }

  const handleCreateBook = () => {
    if (!newBookTitle.trim()) return

    // Create the book (no chapters needed upfront)
    const book = addBook(newBookTitle.trim())

    // Refresh books list and select the new book
    setBooks(getBooks())
    setNewBookTitle('')
    setBookMode('select')
    handleBookSelect(book)
  }

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    if (!currentChapter || !selectedReader) return

    // Convert blob to base64 data URL for localStorage storage
    const reader = new FileReader()
    reader.onloadend = () => {
      const audioUrl = reader.result as string
      addRecording(currentChapter.id, selectedReader.id, audioUrl, duration)
      setStep('success')
    }
    reader.readAsDataURL(blob)
  }

  const handleFileUpload = async (file: File) => {
    if (!currentChapter || !selectedReader) return

    // Convert file to base64 data URL for localStorage storage
    const reader = new FileReader()
    reader.onloadend = () => {
      const audioUrl = reader.result as string
      // Estimate duration (will be updated when played)
      addRecording(currentChapter.id, selectedReader.id, audioUrl, 0)
      setStep('success')
    }
    reader.readAsDataURL(file)
  }

  const handleBack = () => {
    if (step === 'success') {
      setStep('record')
      setRecordMode(null)
    } else if (step === 'record') {
      if (recordMode) {
        setRecordMode(null)
      } else {
        setStep('book')
        setSelectedBook(null)
        setCurrentChapter(null)
      }
    } else if (step === 'book') {
      if (bookMode === 'new') {
        setBookMode('select')
        setNewBookTitle('')
      } else {
        setStep('reader')
        setSelectedReader(null)
      }
    } else {
      navigate('/')
    }
  }

  // Record next chapter of the same book
  const handleNextChapter = () => {
    if (!selectedBook) return
    const chapter = getOrCreateNextChapter(selectedBook.id)
    setCurrentChapter(chapter)
    setRecordMode(null)
    setStep('record')
  }

  // Start fresh with different book
  const handleNewRecording = () => {
    setStep('book')
    setSelectedBook(null)
    setCurrentChapter(null)
    setRecordMode(null)
  }

  const getStepIndex = (s: Step): number => {
    const steps = ['reader', 'book', 'record']
    return steps.indexOf(s)
  }

  return (
    <div className="min-h-screen p-6 md:p-8 relative overflow-hidden">
      <CloudDecoration />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8 relative z-10"
      >
        <Button variant="ghost" onClick={handleBack} className="!min-w-0 !min-h-0 p-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>
        <h1 className="font-display text-3xl text-cocoa">
          {step === 'reader' && 'Wie ben jij?'}
          {step === 'book' && 'Welk boek ga je voorlezen?'}
          {step === 'record' && selectedBook?.title}
          {step === 'success' && 'Gelukt!'}
        </h1>
      </motion.header>

      {/* Progress indicator */}
      {step !== 'success' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-md mx-auto mb-8"
        >
          <div className="flex items-center justify-between">
            {['reader', 'book', 'record'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-display text-lg
                  ${getStepIndex(step) >= i
                    ? 'bg-honey text-white'
                    : 'bg-cream-dark text-cocoa-light'
                  }
                `}>
                  {i + 1}
                </div>
                {i < 2 && (
                  <div className={`
                    w-12 md:w-24 h-1 mx-2 md:mx-4
                    ${getStepIndex(step) > i
                      ? 'bg-honey'
                      : 'bg-cream-dark'
                    }
                  `} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs md:text-sm text-cocoa-light">
            <span>Wie</span>
            <span>Boek</span>
            <span>Opnemen</span>
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* Step: Reader Selection */}
        {step === 'reader' && (
          <motion.div
            key="reader"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto"
          >
            <p className="text-center text-cocoa-light mb-6">Kies je naam zodat de kinderen weten wie voorleest</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {users.map((user) => (
                <motion.button
                  key={user.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleReaderSelect(user)}
                  className="p-4 bg-white rounded-[20px] shadow-soft hover:shadow-lifted flex flex-col items-center gap-3 transition-shadow"
                >
                  <Avatar
                    src={user.avatar_url}
                    name={user.name}
                    size="lg"
                  />
                  <span className="font-display text-lg text-cocoa">{user.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step: Book Selection */}
        {step === 'book' && bookMode === 'select' && (
          <motion.div
            key="book"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto"
          >
            {selectedReader && (
              <div className="flex items-center gap-3 mb-6 p-3 bg-white/50 rounded-xl">
                <Avatar src={selectedReader.avatar_url} name={selectedReader.name} size="sm" />
                <span className="text-cocoa">Voorlezer: <strong>{selectedReader.name}</strong></span>
              </div>
            )}

            <div className="space-y-3">
              {/* Add new book button - always visible at top */}
              <motion.button
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setBookMode('new')}
                className="w-full p-5 bg-gradient-to-r from-honey to-honey-dark rounded-[20px] shadow-soft hover:shadow-lifted text-left flex items-center gap-4 transition-shadow"
              >
                <div className="w-12 h-12 rounded-[12px] bg-white/30 flex items-center justify-center text-2xl">
                  ➕
                </div>
                <span className="font-display text-xl text-white">Nieuw boek toevoegen</span>
                <svg className="w-6 h-6 text-white/80 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>

              {/* Existing books */}
              {books.map((book) => (
                <motion.button
                  key={book.id}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleBookSelect(book)}
                  className="w-full p-5 bg-white rounded-[20px] shadow-soft hover:shadow-lifted text-left flex items-center gap-4 transition-shadow"
                >
                  <div className="w-12 h-12 rounded-[12px] bg-honey-light flex items-center justify-center text-2xl">
                    📖
                  </div>
                  <span className="font-display text-xl text-cocoa">{book.title}</span>
                  <svg className="w-6 h-6 text-cocoa-light ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step: New Book Form */}
        {step === 'book' && bookMode === 'new' && (
          <motion.div
            key="new-book"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-md mx-auto"
          >
            <Card hoverable={false} className="p-6">
              <div className="text-center mb-6">
                <div className="text-4xl mb-2">📚</div>
                <h2 className="font-display text-xl text-cocoa">Nieuw boek toevoegen</h2>
                <p className="text-cocoa-light text-sm mt-2">
                  Je kunt direct beginnen met opnemen. Hoofdstukken worden automatisch aangemaakt.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-cocoa mb-2">
                    Titel van het boek
                  </label>
                  <input
                    type="text"
                    value={newBookTitle}
                    onChange={(e) => setNewBookTitle(e.target.value)}
                    placeholder="Bijv. Kikker en zijn vriendjes"
                    className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey focus:outline-none transition-colors"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newBookTitle.trim()) {
                        handleCreateBook()
                      }
                    }}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBookMode('select')
                      setNewBookTitle('')
                    }}
                    className="flex-1"
                  >
                    Annuleren
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleCreateBook}
                    disabled={!newBookTitle.trim()}
                    className="flex-1"
                  >
                    Start opnemen
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Step: Record/Upload Selection */}
        {step === 'record' && !recordMode && (
          <motion.div
            key="record-choice"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-md mx-auto"
          >
            <div className="bg-white rounded-[32px] shadow-lifted p-8">
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  {selectedReader && (
                    <Avatar src={selectedReader.avatar_url} name={selectedReader.name} size="lg" />
                  )}
                </div>
                <p className="text-cocoa-light mb-2">{selectedReader?.name} gaat opnemen:</p>
                <p className="font-display text-2xl text-cocoa">
                  {selectedBook?.title}
                </p>
                <p className="font-display text-lg text-cocoa-light">
                  {currentChapter?.title}
                </p>
              </div>

              <div className="space-y-4">
                <Button
                  variant="record"
                  size="lg"
                  onClick={() => setRecordMode('record')}
                  className="w-full"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Direct opnemen
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setRecordMode('upload')}
                  className="w-full"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Bestand uploaden
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step: Recording */}
        {step === 'record' && recordMode === 'record' && (
          <motion.div
            key="recording"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              onCancel={() => setRecordMode(null)}
            />
          </motion.div>
        )}

        {/* Step: Upload */}
        {step === 'record' && recordMode === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <FileUpload onFileSelect={handleFileUpload} />
          </motion.div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
              className="w-32 h-32 mx-auto mb-8 bg-moss rounded-full flex items-center justify-center shadow-floating"
            >
              <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>

            <h2 className="font-display text-3xl text-cocoa mb-4">
              Bedankt {selectedReader?.name}!
            </h2>
            <p className="text-cocoa-light mb-2">
              <strong>{currentChapter?.title}</strong> van <strong>{selectedBook?.title}</strong>
            </p>
            <p className="text-cocoa-light mb-8">
              is opgeslagen en kan nu beluisterd worden.
            </p>

            <div className="flex flex-col gap-4">
              {/* Primary action: next chapter of same book */}
              <Button variant="primary" size="lg" onClick={handleNextChapter} className="w-full">
                <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Volgend hoofdstuk opnemen
              </Button>

              <div className="flex gap-4">
                <Button variant="secondary" onClick={handleNewRecording} className="flex-1">
                  Ander boek
                </Button>
                <Button variant="ghost" onClick={() => navigate('/')} className="flex-1">
                  Klaar voor nu
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
