import { useState, useEffect, useReducer, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button, CloudDecoration, Avatar, Card, ConfirmDialog } from '../components/ui'
import { AudioRecorder } from '../components/AudioRecorder'
import { FileUpload } from '../components/FileUpload'
import { getBooks, getBook, getUsers, addRecordingAsync, addBook, getOrCreateNextChapter, getChaptersForBook, getRecordingsForChapter, updateChapter, getRecordingsForReader, getChapter } from '../lib/storage'
import { uploadAudioFile } from '../lib/audioUpload'
import { checkAvailableStorage, type StorageCheckResult } from '../lib/storageSpaceCheck'
import { checkChapterLock, acquireLock, releaseLock, type LockCheckResult } from '../lib/recordingLock'
import { clearBackup } from '../lib/recordingBackup'
import type { Book, Chapter, User, Recording } from '../types'

type Step = 'reader' | 'book' | 'chapter' | 'record' | 'success'
type RecordMode = 'record' | 'upload' | null
type BookMode = 'select' | 'new'

// Wizard state managed by useReducer
interface WizardState {
  step: Step
  selectedReader: User | null
  selectedBook: Book | null
  currentChapter: Chapter | null
  recordMode: RecordMode
  bookMode: BookMode
}

type WizardAction =
  | { type: 'SELECT_READER'; reader: User }
  | { type: 'SELECT_BOOK'; book: Book }
  | { type: 'SET_CHAPTER'; chapter: Chapter }
  | { type: 'SET_RECORD_MODE'; mode: RecordMode }
  | { type: 'SET_BOOK_MODE'; mode: BookMode }
  | { type: 'SET_STEP'; step: Step }
  | { type: 'BACK_TO_READER' }
  | { type: 'BACK_TO_BOOK' }
  | { type: 'BACK_TO_CHAPTER' }
  | { type: 'BACK_TO_RECORD' }
  | { type: 'RESET_FOR_NEW_BOOK' }
  | { type: 'RESET_FOR_ANOTHER_CHAPTER' }

const initialWizardState: WizardState = {
  step: 'reader',
  selectedReader: null,
  selectedBook: null,
  currentChapter: null,
  recordMode: null,
  bookMode: 'select',
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SELECT_READER':
      return { ...state, step: 'book', selectedReader: action.reader }
    case 'SELECT_BOOK':
      return { ...state, step: 'chapter', selectedBook: action.book, bookMode: 'select' }
    case 'SET_CHAPTER':
      return { ...state, currentChapter: action.chapter }
    case 'SET_RECORD_MODE':
      return { ...state, recordMode: action.mode }
    case 'SET_BOOK_MODE':
      return { ...state, bookMode: action.mode }
    case 'SET_STEP':
      return { ...state, step: action.step }
    case 'BACK_TO_READER':
      return { ...state, step: 'reader', selectedReader: null }
    case 'BACK_TO_BOOK':
      return { ...state, step: 'book', selectedBook: null }
    case 'BACK_TO_CHAPTER':
      return { ...state, step: 'chapter', currentChapter: null }
    case 'BACK_TO_RECORD':
      return { ...state, step: 'record', recordMode: null }
    case 'RESET_FOR_NEW_BOOK':
      return { ...state, step: 'book', selectedBook: null, currentChapter: null, recordMode: null }
    case 'RESET_FOR_ANOTHER_CHAPTER':
      return { ...state, step: 'chapter', currentChapter: null, recordMode: null }
    default:
      return state
  }
}

export function ReadPage() {
  const navigate = useNavigate()
  const [wizard, dispatch] = useReducer(wizardReducer, initialWizardState)
  const { step, selectedReader, selectedBook, currentChapter, recordMode, bookMode } = wizard

  const [books, setBooks] = useState<Book[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [newBookTitle, setNewBookTitle] = useState('')
  const [bookChapters, setBookChapters] = useState<Chapter[]>([])

  // Overwrite confirmation state
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const [pendingChapter, setPendingChapter] = useState<Chapter | null>(null)

  // Chapter editing state
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [editChapterTitle, setEditChapterTitle] = useState('')

  // Reader dashboard state
  const [showDashboard, setShowDashboard] = useState(false)
  const [readerRecordings, setReaderRecordings] = useState<Recording[]>([])

  // Saving progress state
  const [isSaving, setIsSaving] = useState(false)

  // New book author state
  const [newBookAuthor, setNewBookAuthor] = useState('')

  // Save error state
  const [saveError, setSaveError] = useState<string | null>(null)

  // Upload state
  const [uploadState, setUploadState] = useState<{
    isUploading: boolean
    error: string | null
    progress: number
  }>({ isUploading: false, error: null, progress: 0 })

  // Storage check state
  const [storageCheck, setStorageCheck] = useState<StorageCheckResult | null>(null)
  const [isCheckingStorage, setIsCheckingStorage] = useState(false)

  // Lock check state
  const [lockWarning, setLockWarning] = useState<LockCheckResult | null>(null)
  const [showLockWarning, setShowLockWarning] = useState(false)

  useEffect(() => {
    setBooks(getBooks())
    setUsers(getUsers())
  }, [])

  // Prevent closing tab while saving
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (isSaving) {
      window.addEventListener('beforeunload', handleBeforeUnload)
    } else {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isSaving, handleBeforeUnload])

  const handleReaderSelect = (reader: User) => {
    setReaderRecordings(getRecordingsForReader(reader.id))
    dispatch({ type: 'SELECT_READER', reader })
  }

  const handleBookSelect = (book: Book) => {
    const chapters = getChaptersForBook(book.id)
    setBookChapters(chapters)
    dispatch({ type: 'SELECT_BOOK', book })
  }

  const handleChapterSelect = async (chapter: Chapter) => {
    if (!selectedReader) return

    // First check if someone else is recording this chapter
    const lockStatus = await checkChapterLock(chapter.id, selectedReader.id)
    if (lockStatus.isLocked) {
      setLockWarning(lockStatus)
      setShowLockWarning(true)
      return
    }

    // Acquire lock early (before overwrite dialog) to prevent race conditions
    await acquireLock(chapter.id, selectedReader.id, selectedReader.name)

    // Check if chapter already has recordings
    const existingRecordings = getRecordingsForChapter(chapter.id)
    if (existingRecordings.length > 0) {
      // Show confirmation dialog
      setPendingChapter(chapter)
      setShowOverwriteConfirm(true)
    } else {
      // No existing recordings, check storage and proceed
      dispatch({ type: 'SET_CHAPTER', chapter })
      await checkStorageAndProceed()
    }
  }

  const handleConfirmOverwrite = async () => {
    if (pendingChapter) {
      dispatch({ type: 'SET_CHAPTER', chapter: pendingChapter })
      setPendingChapter(null)
      // Check storage before going to record step
      await checkStorageAndProceed()
    }
    setShowOverwriteConfirm(false)
  }

  // Check storage space before allowing recording
  const checkStorageAndProceed = async () => {
    setIsCheckingStorage(true)
    try {
      const result = await checkAvailableStorage()
      setStorageCheck(result)
      if (result.canRecord) {
        dispatch({ type: 'SET_STEP', step: 'record' })
      }
      // If can't record, the UI will show the warning
    } finally {
      setIsCheckingStorage(false)
    }
  }

  // Start recording or upload (lock already acquired in handleChapterSelect)
  const handleStartRecording = (mode: 'record' | 'upload') => {
    if (!currentChapter || !selectedReader) return
    dispatch({ type: 'SET_RECORD_MODE', mode })
  }

  // Release lock when canceling
  const handleCancelRecording = async () => {
    if (currentChapter && selectedReader) {
      await releaseLock(currentChapter.id, selectedReader.id)
    }
    dispatch({ type: 'SET_RECORD_MODE', mode: null })
  }

  const handleCancelOverwrite = async () => {
    // Release lock since user cancelled the overwrite
    if (pendingChapter && selectedReader) {
      await releaseLock(pendingChapter.id, selectedReader.id)
    }
    setPendingChapter(null)
    setShowOverwriteConfirm(false)
  }

  // Chapter editing functions
  const handleEditChapter = (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingChapter(chapter)
    setEditChapterTitle(chapter.title)
  }

  const handleSaveChapterEdit = () => {
    if (!editingChapter || !editChapterTitle.trim()) return
    updateChapter(editingChapter.id, { title: editChapterTitle.trim() })
    if (selectedBook) {
      setBookChapters(getChaptersForBook(selectedBook.id))
    }
    setEditingChapter(null)
    setEditChapterTitle('')
  }

  const handleCancelChapterEdit = () => {
    setEditingChapter(null)
    setEditChapterTitle('')
  }

  const handleNewChapter = async () => {
    if (!selectedBook) return
    const chapter = getOrCreateNextChapter(selectedBook.id)
    dispatch({ type: 'SET_CHAPTER', chapter })
    setBookChapters(getChaptersForBook(selectedBook.id))
    // Check storage before going to record step
    await checkStorageAndProceed()
  }

  const handleCreateBook = () => {
    if (!newBookTitle.trim()) return

    // Create the book with optional author
    const book = addBook(newBookTitle.trim(), newBookAuthor.trim() || undefined)

    // Refresh books list and select the new book
    setBooks(getBooks())
    setNewBookTitle('')
    setNewBookAuthor('')
    dispatch({ type: 'SET_BOOK_MODE', mode: 'select' })
    handleBookSelect(book)
  }

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    if (!currentChapter || !selectedReader) return

    setIsSaving(true)
    try {
      // Directly upload the blob to storage backend (R2 or Supabase)
      // This is much more efficient than converting to base64 first,
      // especially for large recordings (9+ minutes)
      await addRecordingAsync(currentChapter.id, selectedReader.id, blob, duration)

      // Upload succeeded: clear the IndexedDB backup
      await clearBackup()
      // Refresh reader's recordings for dashboard
      setReaderRecordings(getRecordingsForReader(selectedReader.id))
      // Release the lock after successful save
      await releaseLock(currentChapter.id, selectedReader.id)
      setSaveError(null)
      dispatch({ type: 'SET_STEP', step: 'success' })
    } catch (error) {
      console.error('Fout bij opslaan opname:', error)
      const message = error instanceof Error ? error.message : 'Onbekende fout'
      setSaveError(`Er ging iets mis bij het opslaan van je opname. ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!currentChapter || !selectedReader) return

    // Reset upload state
    setUploadState({ isUploading: true, error: null, progress: 0 })

    try {
      // Use shared upload utility with validation and duration detection
      const result = await uploadAudioFile(
        file,
        currentChapter.id,
        selectedReader.id,
        {
          maxSizeBytes: 50 * 1024 * 1024, // 50MB
        },
        (progress) => setUploadState(prev => ({ ...prev, progress }))
      )

      if (!result.success) {
        // Handle validation/upload errors
        setUploadState({
          isUploading: false,
          error: result.message,
          progress: 0,
        })
        return
      }

      // Success - refresh recordings and proceed
      setReaderRecordings(getRecordingsForReader(selectedReader.id))
      setUploadState({ isUploading: false, error: null, progress: 0 })
      // Release the lock after successful upload
      await releaseLock(currentChapter.id, selectedReader.id)

      // Brief delay before showing success to let user see the uploaded file
      setTimeout(() => dispatch({ type: 'SET_STEP', step: 'success' }), 500)

    } catch (error) {
      console.error('Unexpected upload error:', error)
      setUploadState({
        isUploading: false,
        error: 'Er ging iets mis bij het uploaden. Probeer het opnieuw.',
        progress: 0,
      })
    }
  }

  const handleBack = () => {
    if (step === 'success') {
      dispatch({ type: 'BACK_TO_RECORD' })
    } else if (step === 'record') {
      if (recordMode) {
        dispatch({ type: 'SET_RECORD_MODE', mode: null })
      } else {
        dispatch({ type: 'BACK_TO_CHAPTER' })
      }
    } else if (step === 'chapter') {
      setBookChapters([])
      dispatch({ type: 'BACK_TO_BOOK' })
    } else if (step === 'book') {
      if (bookMode === 'new') {
        dispatch({ type: 'SET_BOOK_MODE', mode: 'select' })
        setNewBookTitle('')
        setNewBookAuthor('')
      } else {
        dispatch({ type: 'BACK_TO_READER' })
      }
    } else {
      navigate('/')
    }
  }

  // Go to the next chapter directly
  const handleNextChapter = async () => {
    if (!selectedBook || !currentChapter) return
    const chapters = getChaptersForBook(selectedBook.id)
    setBookChapters(chapters)
    const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number)
    const currentIndex = sorted.findIndex(c => c.id === currentChapter.id)
    const nextChapter = sorted[currentIndex + 1]
    if (nextChapter) {
      await handleChapterSelect(nextChapter)
    }
  }

  // Get the next chapter (for UI display)
  const getNextChapter = (): Chapter | null => {
    if (!selectedBook || !currentChapter) return null
    const sorted = [...bookChapters].sort((a, b) => a.chapter_number - b.chapter_number)
    const currentIndex = sorted.findIndex(c => c.id === currentChapter.id)
    return sorted[currentIndex + 1] || null
  }

  // Go back to chapter selection for another recording
  const handleAnotherChapter = () => {
    if (!selectedBook) return
    setBookChapters(getChaptersForBook(selectedBook.id))
    dispatch({ type: 'RESET_FOR_ANOTHER_CHAPTER' })
  }

  const getStepIndex = (s: Step): number => {
    const steps = ['reader', 'book', 'chapter', 'record']
    const index = steps.indexOf(s)
    return index === -1 ? steps.length : index
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
        <Button variant="ghost" onClick={handleBack} className="!min-w-0 !min-h-0 p-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>
        <h1 className="font-display text-3xl md:text-4xl text-cocoa">
          {step === 'reader' && 'Wie ben jij?'}
          {step === 'book' && 'Welk boek ga je voorlezen?'}
          {step === 'chapter' && 'Welk hoofdstuk?'}
          {step === 'record' && selectedBook?.title}
          {step === 'success' && 'Gelukt!'}
        </h1>
      </motion.header>

      {/* Progress indicator */}
      {step !== 'success' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-lg mx-auto mb-8"
        >
          <div className="flex items-center justify-between">
            {['reader', 'book', 'chapter', 'record'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={`
                  w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-display text-sm md:text-lg
                  ${getStepIndex(step) >= i
                    ? 'bg-honey text-white'
                    : 'bg-cream-dark text-cocoa-light'
                  }
                `}>
                  {i + 1}
                </div>
                {i < 3 && (
                  <div className={`
                    w-8 md:w-16 h-1 mx-1 md:mx-3
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
            <span>Hoofdstuk</span>
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
            <p className="text-center text-cocoa-light text-lg mb-8">Kies je naam zodat de kinderen weten wie voorleest</p>
            <div className="grid grid-cols-2 gap-4 md:gap-6">
              {users.filter(u => u.role === 'reader' || u.role === 'admin').map((user) => (
                <motion.button
                  key={user.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleReaderSelect(user)}
                  className="p-6 bg-white rounded-[24px] shadow-soft hover:shadow-lifted flex flex-col items-center gap-4 transition-shadow"
                >
                  <Avatar
                    src={user.avatar_url}
                    name={user.name}
                    size="xl"
                  />
                  <span className="font-display text-xl md:text-2xl text-cocoa">{user.name}</span>
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
                <span className="text-cocoa flex-1">Voorlezer: <strong>{selectedReader.name}</strong></span>
                {readerRecordings.length > 0 && (
                  <button
                    onClick={() => setShowDashboard(!showDashboard)}
                    className="text-sm text-honey font-medium flex items-center gap-1 hover:underline"
                  >
                    {readerRecordings.length} opname{readerRecordings.length !== 1 ? 's' : ''}
                    <svg className={`w-4 h-4 transition-transform ${showDashboard ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Reader's recordings dashboard */}
            <AnimatePresence>
              {showDashboard && readerRecordings.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 overflow-hidden"
                >
                  <div className="bg-white rounded-[20px] p-4 shadow-soft">
                    <h3 className="font-display text-lg text-cocoa mb-3">Jouw opnames</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {readerRecordings.slice().reverse().map((recording) => {
                        const chapter = getChapter(recording.chapter_id)
                        const book = chapter ? getBook(chapter.book_id) : undefined
                        const mins = Math.floor(recording.duration_seconds / 60)
                        const secs = recording.duration_seconds % 60
                        const durationText = `${mins}:${secs.toString().padStart(2, '0')}`

                        return (
                          <div key={recording.id} className="flex items-center gap-3 p-2 rounded-lg bg-cream/50">
                            <div className="w-8 h-8 rounded-lg bg-moss/20 flex items-center justify-center text-sm">
                              ✓
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-cocoa text-sm truncate">
                                {chapter?.title || 'Hoofdstuk'}
                              </p>
                              <p className="text-xs text-cocoa-light truncate">
                                {book?.title || 'Onbekend boek'} • {durationText}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-3">
              {/* Add new book button - always visible at top */}
              <motion.button
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => dispatch({ type: 'SET_BOOK_MODE', mode: 'new' })}
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
                  <div className="flex-1 min-w-0">
                    <span className="font-display text-xl text-cocoa block">{book.title}</span>
                    {book.author && (
                      <span className="text-sm text-cocoa-light">{book.author}</span>
                    )}
                  </div>
                  <svg className="w-6 h-6 text-cocoa-light ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

                <div>
                  <label className="block text-sm font-medium text-cocoa mb-2">
                    Auteur (optioneel)
                  </label>
                  <input
                    type="text"
                    value={newBookAuthor}
                    onChange={(e) => setNewBookAuthor(e.target.value)}
                    placeholder="Bijv. Max Velthuijs"
                    className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey focus:outline-none transition-colors"
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
                      dispatch({ type: 'SET_BOOK_MODE', mode: 'select' })
                      setNewBookTitle('')
                      setNewBookAuthor('')
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

        {/* Step: Chapter Selection */}
        {step === 'chapter' && (
          <motion.div
            key="chapter"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto"
          >
            {selectedBook && (
              <div className="flex items-center gap-3 mb-6 p-3 bg-white/50 rounded-xl">
                <div className="w-10 h-10 rounded-[10px] bg-honey-light flex items-center justify-center text-xl">
                  📖
                </div>
                <span className="text-cocoa">Boek: <strong>{selectedBook.title}</strong></span>
              </div>
            )}

            <div className="space-y-3">
              {/* Add new chapter button - always visible at top */}
              <motion.button
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNewChapter}
                className="w-full p-5 bg-gradient-to-r from-honey to-honey-dark rounded-[20px] shadow-soft hover:shadow-lifted text-left flex items-center gap-4 transition-shadow"
              >
                <div className="w-12 h-12 rounded-[12px] bg-white/30 flex items-center justify-center text-2xl">
                  ➕
                </div>
                <div>
                  <span className="font-display text-xl text-white block">Nieuw hoofdstuk</span>
                  <span className="text-white/80 text-sm">Automatisch genummerd</span>
                </div>
                <svg className="w-6 h-6 text-white/80 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>

              {/* Existing chapters */}
              {bookChapters.length > 0 && (
                <div className="pt-2">
                  {/* Chapter count summary */}
                  {(() => {
                    const sortedChapters = [...bookChapters].sort((a, b) => a.chapter_number - b.chapter_number)
                    const recordedCount = sortedChapters.filter(ch => getRecordingsForChapter(ch.id).length > 0).length
                    return (
                      <div className="flex items-center gap-3 mb-4 px-1">
                        <p className="text-cocoa-light text-base flex-1">Of voeg audio toe aan een bestaand hoofdstuk:</p>
                        <span className="text-sm text-cocoa-light bg-white/60 px-3 py-1 rounded-full">
                          {recordedCount}/{sortedChapters.length} ingelezen
                        </span>
                      </div>
                    )
                  })()}
                  {[...bookChapters].sort((a, b) => a.chapter_number - b.chapter_number).map((chapter) => {
                    const recordings = getRecordingsForChapter(chapter.id)
                    const hasRecording = recordings.length > 0
                    const isEditing = editingChapter?.id === chapter.id
                    const readerNames = hasRecording
                      ? recordings.map(r => users.find(u => u.id === r.reader_id)?.name).filter(Boolean)
                      : []
                    const durationSec = hasRecording ? recordings[0].duration_seconds : 0
                    const durationText = durationSec > 0
                      ? `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`
                      : ''

                    if (isEditing) {
                      return (
                        <div key={chapter.id} className="w-full p-5 bg-white rounded-[20px] shadow-lifted mb-3">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-14 h-14 rounded-[14px] bg-sky-light flex items-center justify-center font-display text-2xl text-cocoa">
                              {chapter.chapter_number}
                            </div>
                            <input
                              type="text"
                              value={editChapterTitle}
                              onChange={(e) => setEditChapterTitle(e.target.value)}
                              className="flex-1 px-4 py-3 text-lg rounded-xl border-2 border-honey focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveChapterEdit()
                                if (e.key === 'Escape') handleCancelChapterEdit()
                              }}
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={handleCancelChapterEdit}>
                              Annuleren
                            </Button>
                            <Button variant="primary" size="sm" onClick={handleSaveChapterEdit}>
                              Opslaan
                            </Button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <motion.div
                        key={chapter.id}
                        whileHover={{ scale: 1.01 }}
                        className="w-full p-5 bg-white rounded-[20px] shadow-soft hover:shadow-lifted flex items-center gap-4 transition-shadow mb-3"
                      >
                        <button
                          onClick={() => handleChapterSelect(chapter)}
                          className="flex-1 flex items-center gap-4 text-left"
                        >
                          <div className={`w-14 h-14 rounded-[14px] flex items-center justify-center font-display text-2xl ${hasRecording ? 'bg-moss/20 text-moss' : 'bg-sky-light text-cocoa'}`}>
                            {hasRecording ? '✓' : chapter.chapter_number}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-display text-xl text-cocoa">{chapter.title}</span>
                              {!hasRecording && (
                                <span className="text-xs text-cocoa-light bg-cream-dark px-2 py-0.5 rounded-full">
                                  {chapter.chapter_number}
                                </span>
                              )}
                            </div>
                            {hasRecording && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-moss">
                                  {readerNames.join(', ')}
                                </span>
                                {durationText && (
                                  <span className="text-xs text-cocoa-light">
                                    · {durationText}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                        {/* Edit button */}
                        <button
                          onClick={(e) => handleEditChapter(chapter, e)}
                          className="p-3 rounded-xl hover:bg-cream-dark transition-colors"
                          title="Titel bewerken"
                        >
                          <svg className="w-6 h-6 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleChapterSelect(chapter)}
                          className="p-3 rounded-xl hover:bg-cream-dark transition-colors"
                        >
                          <svg className="w-6 h-6 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
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

              {/* Storage warning */}
              {storageCheck && !storageCheck.canRecord && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6 p-4 bg-sunset/10 border-2 border-sunset/30 rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-sunset flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-medium text-sunset">Onvoldoende opslagruimte</p>
                      <p className="text-sm text-cocoa-light mt-1">{storageCheck.message}</p>
                      <p className="text-sm text-cocoa-light mt-2">
                        Beschikbaar: <strong>{storageCheck.availableFormatted}</strong> |
                        Nodig: <strong>{storageCheck.requiredFormatted}</strong>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Loading state while checking storage */}
              {isCheckingStorage && (
                <div className="mb-6 flex items-center justify-center gap-3 text-cocoa-light">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-honey border-t-transparent rounded-full"
                  />
                  <span>Opslagruimte controleren...</span>
                </div>
              )}

              <div className="space-y-4">
                <Button
                  variant="record"
                  size="xl"
                  onClick={() => handleStartRecording('record')}
                  disabled={isCheckingStorage || (storageCheck !== null && !storageCheck.canRecord)}
                  className="w-full text-xl py-6"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Direct opnemen
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => handleStartRecording('upload')}
                  disabled={isCheckingStorage || (storageCheck !== null && !storageCheck.canRecord)}
                  className="w-full text-lg py-5"
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
            className="relative"
          >
            {saveError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md mx-auto mb-4 p-4 bg-sunset/10 border-2 border-sunset/30 rounded-xl flex items-start gap-3"
              >
                <svg className="w-6 h-6 text-sunset flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="font-medium text-sunset">Opslaan mislukt</p>
                  <p className="text-sm text-cocoa-light mt-1">{saveError}</p>
                </div>
                <button onClick={() => setSaveError(null)} className="text-cocoa-light hover:text-cocoa">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            )}
            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              onCancel={handleCancelRecording}
              chapterId={currentChapter?.id}
              readerId={selectedReader?.id}
            />

            {/* Saving overlay */}
            <AnimatePresence>
              {isSaving && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-[32px] flex flex-col items-center justify-center z-50"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 border-4 border-honey border-t-transparent rounded-full mb-4"
                  />
                  <p className="font-display text-xl text-cocoa">Opname opslaan...</p>
                  <p className="text-cocoa-light text-sm mt-2">Even geduld, sluit dit scherm niet</p>
                </motion.div>
              )}
            </AnimatePresence>
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
            <FileUpload
              onFileSelect={handleFileUpload}
              isUploading={uploadState.isUploading}
              uploadError={uploadState.error}
              uploadProgress={uploadState.progress}
            />
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
              {/* Primary action: next chapter if available */}
              {getNextChapter() ? (
                <Button variant="primary" size="lg" onClick={handleNextChapter} className="w-full">
                  <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Volgend hoofdstuk: {getNextChapter()?.title}
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={handleAnotherChapter} className="w-full">
                  <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Alle hoofdstukken opgenomen!
                </Button>
              )}

              <div className="flex gap-4">
                <Button variant="secondary" onClick={handleAnotherChapter} className="flex-1">
                  Ander hoofdstuk
                </Button>
                <Button variant="ghost" onClick={() => navigate('/')} className="flex-1">
                  Klaar voor nu
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overwrite confirmation dialog */}
      <ConfirmDialog
        isOpen={showOverwriteConfirm}
        onClose={handleCancelOverwrite}
        onConfirm={handleConfirmOverwrite}
        title="Bestaande opname vervangen?"
        message={`Dit hoofdstuk heeft al een opname. Als je een nieuwe opname maakt, wordt de oude opname vervangen. Weet je dit zeker?`}
        confirmText="Ja, nieuwe opname"
        cancelText="Nee, annuleren"
        variant="default"
      />

      {/* Lock warning dialog */}
      <ConfirmDialog
        isOpen={showLockWarning}
        onClose={() => setShowLockWarning(false)}
        onConfirm={() => setShowLockWarning(false)}
        title="Hoofdstuk wordt al opgenomen"
        message={lockWarning?.message || 'Iemand anders is dit hoofdstuk aan het opnemen.'}
        confirmText="Oké, begrepen"
        cancelText=""
        variant="default"
      />
    </div>
  )
}
