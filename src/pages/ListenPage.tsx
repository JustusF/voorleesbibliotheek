import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { BookCover, Avatar, CloudDecoration, Button, Card } from '../components/ui'
import { AudioPlayer } from '../components/AudioPlayer'
import { getBooks, getUsers, addUser, getBookWithChapters, getChapterWithRecordings, getChapterProgress, getProgress, getRecordings, getChapters, getBooksAsync, getUsersAsync, setActiveListener, getActiveListener, migrateGlobalProgress } from '../lib/storage'
import type { ChapterProgress } from '../lib/storage'
import { useRealtimeSync } from '../hooks/useRealtimeSync'
import type { Book, User, Chapter, Recording } from '../types'

type ViewMode = 'listener-select' | 'books' | 'readers' | 'chapters' | 'player' | 'reader-recordings'

interface SelectedState {
  book?: Book
  reader?: User
  chapter?: Chapter
  recording?: Recording
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

export function ListenPage() {
  const navigate = useNavigate()
  const [activeListener, setActiveListenerState] = useState<User | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('listener-select')
  const [selected, setSelected] = useState<SelectedState>({})
  const [books, setBooks] = useState<Book[]>(() => getBooks())
  const [users, setUsers] = useState<User[]>(() => getUsers())
  const [newChildName, setNewChildName] = useState('')
  const [showAddChild, setShowAddChild] = useState(false)

  // Restore active listener from session
  useEffect(() => {
    const storedId = getActiveListener()
    if (storedId) {
      const allUsers = getUsers()
      const listener = allUsers.find(u => u.id === storedId)
      if (listener) {
        setActiveListenerState(listener)
        setViewMode('books')
      }
    }
  }, [])

  // Refresh data when returning to page
  useEffect(() => {
    const refreshData = () => {
      setBooks(getBooks())
      setUsers(getUsers())
    }
    refreshData()
  }, [viewMode])

  const [searchQuery, setSearchQuery] = useState('')
  const [lastPlayed, setLastPlayed] = useState<SelectedState | null>(null)

  const handleListenerSelect = (listener: User) => {
    setActiveListenerState(listener)
    setActiveListener(listener.id)
    // Migrate any old global progress to this listener
    migrateGlobalProgress(listener.id)
    setViewMode('books')
  }

  const handleAddChild = () => {
    if (!newChildName.trim()) return
    const child = addUser(newChildName.trim(), 'listener')
    setUsers(getUsers())
    setNewChildName('')
    setShowAddChild(false)
    handleListenerSelect(child)
  }

  const handleSwitchListener = () => {
    setActiveListenerState(null)
    setActiveListener(null)
    setViewMode('listener-select')
    setSelected({})
    setLastPlayed(null)
  }

  // Get children (listeners) for the selection screen
  const listeners = users.filter(u => u.role === 'listener')

  const readers = users.filter(u => u.role === 'reader' || u.role === 'admin')

  // Filter books by search query
  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books
    const q = searchQuery.toLowerCase()
    return books.filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.author && b.author.toLowerCase().includes(q))
    )
  }, [books, searchQuery])

  // Get chapters with saved progress for "Verder luisteren" section
  const continueListening = useMemo(() => {
    const allProgress = getProgress()
    const allChapters = getChapters()
    const results: Array<{
      book: Book
      chapter: Chapter
      recording: Recording
      reader: User
      progress: ChapterProgress
    }> = []

    for (const [chapterId, prog] of Object.entries(allProgress)) {
      if (prog.completed || prog.currentTime < 5) continue // Skip completed or barely started
      const chapter = allChapters.find(c => c.id === chapterId)
      if (!chapter) continue
      const book = books.find(b => b.id === chapter.book_id)
      if (!book) continue
      const chapterData = getChapterWithRecordings(chapterId)
      const rec = chapterData?.recordings.find(r => r.id === prog.recordingId)
      if (!rec) continue
      const reader = users.find(u => u.id === rec.reader_id)
      if (!reader) continue
      results.push({ book, chapter, recording: rec, reader, progress: prog })
    }

    // Sort by most recently listened (highest currentTime relative to duration = most engaged)
    return results.sort((a, b) => {
      // Sort by how recently they were saved (items with higher currentTime are more recent listens)
      const aPercent = a.progress.duration > 0 ? a.progress.currentTime / a.progress.duration : 0
      const bPercent = b.progress.duration > 0 ? b.progress.currentTime / b.progress.duration : 0
      return bPercent - aPercent
    }).slice(0, 5)
  }, [books, users])

  // Real-time sync: refresh data when changes come in from other devices
  const refreshData = useCallback(async () => {
    try {
      const [newBooks, newUsers] = await Promise.all([
        getBooksAsync(),
        getUsersAsync(),
      ])
      setBooks(newBooks.length > 0 ? newBooks : getBooks())
      setUsers(newUsers.length > 0 ? newUsers : getUsers())
    } catch (error) {
      console.error('Error refreshing data:', error)
      // Fallback to localStorage
      setBooks(getBooks())
      setUsers(getUsers())
    }
  }, [])

  useRealtimeSync({
    onBooksChange: refreshData,
    onRecordingsChange: refreshData,
  })

  const handleBookSelect = (book: Book) => {
    setSelected({ book })
    setViewMode('chapters')
  }

  const handleChapterSelect = (chapter: Chapter) => {
    if (!selected.book) return

    const chapterData = getChapterWithRecordings(chapter.id)
    if (chapterData && chapterData.recordings.length > 0) {
      // Check if there's saved progress with a specific recording
      const progress = getChapterProgress(chapter.id)
      let recording = chapterData.recordings[0]
      if (progress && progress.recordingId) {
        const savedRec = chapterData.recordings.find(r => r.id === progress.recordingId)
        if (savedRec) recording = savedRec
      }
      const reader = users.find(u => u.id === recording.reader_id)
      if (reader) {
        setSelected({
          ...selected,
          chapter,
          recording,
          reader,
        })
        setViewMode('player')
      }
    }
  }

  const handleRecordingSelect = (recording: Recording, reader: User) => {
    setSelected(prev => ({
      ...prev,
      recording,
      reader,
    }))
  }

  const handleContinueListening = (item: typeof continueListening[0]) => {
    setSelected({
      book: item.book,
      chapter: item.chapter,
      recording: item.recording,
      reader: item.reader,
    })
    setViewMode('player')
  }

  const handleReaderSelect = (reader: User) => {
    setSelected({ reader })
    setViewMode('reader-recordings')
  }

  // Get recordings for a specific reader
  const getReaderRecordings = (readerId: string) => {
    const allRecordings = getRecordings()
    const allChapters = getChapters()
    return allRecordings
      .filter(r => r.reader_id === readerId)
      .map(recording => {
        const chapter = allChapters.find(c => c.id === recording.chapter_id)
        const book = chapter ? books.find(b => b.id === chapter.book_id) : null
        return { recording, chapter, book }
      })
      .filter(r => r.chapter && r.book)
  }

  const handleBack = () => {
    if (viewMode === 'player') {
      if (selected.reader && !selected.book) {
        // Came from reader view
        setViewMode('reader-recordings')
        setSelected({ reader: selected.reader })
      } else {
        setViewMode('chapters')
        setSelected({ book: selected.book })
      }
    } else if (viewMode === 'chapters') {
      setViewMode('books')
      setSelected({})
    } else if (viewMode === 'reader-recordings') {
      setViewMode('readers')
      setSelected({})
    } else if (viewMode === 'books' || viewMode === 'readers') {
      handleSwitchListener()
    } else if (viewMode === 'listener-select') {
      navigate('/')
    } else {
      navigate('/')
    }
  }

  const handleClosePlayer = () => {
    // Save as last played for mini-player
    if (selected.recording && selected.chapter && selected.book && selected.reader) {
      setLastPlayed({ ...selected })
    }
    setViewMode('chapters')
    setSelected({ book: selected.book })
  }

  const handleResumeFromMiniPlayer = () => {
    if (lastPlayed?.recording && lastPlayed?.chapter && lastPlayed?.book && lastPlayed?.reader) {
      setSelected(lastPlayed)
      setViewMode('player')
      setLastPlayed(null)
    }
  }

  // Get chapters with recordings for navigation
  const getPlayableChapters = () => {
    if (!bookWithChapters) return []
    return bookWithChapters.chapters.filter(chapter => {
      const chapterData = getChapterWithRecordings(chapter.id)
      return chapterData && chapterData.recordings.length > 0
    })
  }

  const handleNextChapter = () => {
    if (!selected.chapter || !selected.book) return
    const playableChapters = getPlayableChapters()
    const currentIndex = playableChapters.findIndex(c => c.id === selected.chapter?.id)
    if (currentIndex < playableChapters.length - 1) {
      const nextChapter = playableChapters[currentIndex + 1]
      const chapterData = getChapterWithRecordings(nextChapter.id)
      if (chapterData && chapterData.recordings.length > 0) {
        const recording = chapterData.recordings[0]
        const reader = users.find(u => u.id === recording.reader_id)
        if (reader) {
          setSelected({
            ...selected,
            chapter: nextChapter,
            recording,
            reader,
          })
        }
      }
    }
  }

  const handlePreviousChapter = () => {
    if (!selected.chapter || !selected.book) return
    const playableChapters = getPlayableChapters()
    const currentIndex = playableChapters.findIndex(c => c.id === selected.chapter?.id)
    if (currentIndex > 0) {
      const prevChapter = playableChapters[currentIndex - 1]
      const chapterData = getChapterWithRecordings(prevChapter.id)
      if (chapterData && chapterData.recordings.length > 0) {
        const recording = chapterData.recordings[0]
        const reader = users.find(u => u.id === recording.reader_id)
        if (reader) {
          setSelected({
            ...selected,
            chapter: prevChapter,
            recording,
            reader,
          })
        }
      }
    }
  }

  // Check if next/previous navigation is possible
  const canNavigate = () => {
    if (!selected.chapter) return { canNext: false, canPrevious: false }
    const playableChapters = getPlayableChapters()
    const currentIndex = playableChapters.findIndex(c => c.id === selected.chapter?.id)
    return {
      canNext: currentIndex < playableChapters.length - 1,
      canPrevious: currentIndex > 0,
    }
  }

  const bookWithChapters = selected.book ? getBookWithChapters(selected.book.id) : null

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
        <h1 className="font-display text-3xl text-cocoa flex-1">
          {viewMode === 'listener-select' && 'Wie gaat luisteren?'}
          {viewMode === 'books' && 'Kies een boek'}
          {viewMode === 'readers' && 'Wie leest voor?'}
          {viewMode === 'chapters' && selected.book?.title}
          {viewMode === 'reader-recordings' && `Opnames van ${selected.reader?.name}`}
          {viewMode === 'player' && 'Nu aan het luisteren'}
        </h1>
        {/* Active listener indicator */}
        {activeListener && viewMode !== 'listener-select' && viewMode !== 'player' && (
          <button
            onClick={handleSwitchListener}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 hover:bg-white transition-colors"
            title="Wissel van luisteraar"
          >
            <Avatar
              src={activeListener.avatar_url}
              name={activeListener.name}
              size="sm"
            />
            <span className="text-sm font-medium text-cocoa hidden sm:inline">{activeListener.name}</span>
          </button>
        )}
      </motion.header>

      {/* Listener Selection */}
      {viewMode === 'listener-select' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg mx-auto"
        >
          <p className="text-center text-cocoa-light text-lg mb-8">Kies je naam zodat we weten waar je gebleven bent</p>

          {listeners.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:gap-6 mb-6">
              {listeners.map((listener) => (
                <motion.button
                  key={listener.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleListenerSelect(listener)}
                  className="p-6 bg-white rounded-[24px] shadow-soft hover:shadow-lifted flex flex-col items-center gap-3 transition-shadow"
                >
                  <Avatar
                    src={listener.avatar_url}
                    name={listener.name}
                    size="xl"
                  />
                  <span className="font-display text-xl text-cocoa">{listener.name}</span>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 mb-6">
              <div className="text-5xl mb-4">👋</div>
              <p className="text-cocoa-light">Voeg een luisteraar toe om te beginnen</p>
            </div>
          )}

          {/* Add child form */}
          {showAddChild ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[24px] shadow-soft p-6"
            >
              <h3 className="font-display text-lg text-cocoa mb-4">Nieuwe luisteraar</h3>
              <input
                type="text"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                placeholder="Naam van het kind..."
                className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newChildName.trim()) handleAddChild()
                  if (e.key === 'Escape') setShowAddChild(false)
                }}
              />
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => { setShowAddChild(false); setNewChildName('') }} className="flex-1">
                  Annuleren
                </Button>
                <Button variant="primary" onClick={handleAddChild} disabled={!newChildName.trim()} className="flex-1">
                  Toevoegen
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowAddChild(true)}
              className="w-full p-4 bg-honey/10 hover:bg-honey/20 border-2 border-dashed border-honey/40 rounded-[20px] flex items-center justify-center gap-2 text-honey font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Luisteraar toevoegen
            </motion.button>
          )}
        </motion.div>
      )}

      {/* View switcher for main views */}
      {(viewMode === 'books' || viewMode === 'readers') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-2 mb-8"
        >
          <Button
            variant={viewMode === 'books' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('books')}
          >
            Boeken
          </Button>
          <Button
            variant={viewMode === 'readers' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('readers')}
          >
            Voorlezers
          </Button>
        </motion.div>
      )}

      {/* Continue Listening Section */}
      {viewMode === 'books' && continueListening.length > 0 && !searchQuery && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="font-display text-xl text-cocoa mb-4 flex items-center gap-2">
            <span className="text-2xl">🎧</span> Verder luisteren
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x snap-mandatory">
            {continueListening.map(item => {
              const percent = item.progress.duration > 0
                ? Math.round((item.progress.currentTime / item.progress.duration) * 100)
                : 0
              const remainMins = Math.ceil((item.progress.duration - item.progress.currentTime) / 60)
              return (
                <motion.button
                  key={`${item.chapter.id}-${item.recording.id}`}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleContinueListening(item)}
                  className="flex-shrink-0 w-64 snap-start bg-white rounded-[20px] shadow-soft p-4 text-left flex items-center gap-3 hover:shadow-lifted transition-shadow"
                >
                  <div className="w-12 h-16 rounded-[10px] overflow-hidden flex-shrink-0 relative">
                    {item.book.cover_url ? (
                      <img src={item.book.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-honey to-honey-dark flex items-center justify-center text-white text-lg">
                        📖
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-sm text-cocoa truncate">{item.book.title}</p>
                    <p className="text-xs text-cocoa-light truncate">H{item.chapter.chapter_number}: {item.chapter.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-cream-dark rounded-full overflow-hidden">
                        <div className="h-full bg-sky rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-[10px] text-cocoa-light whitespace-nowrap">nog {remainMins}m</span>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Search bar */}
      {viewMode === 'books' && books.length > 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          <div className="relative max-w-md">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek een boek..."
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white shadow-soft border-none text-cocoa placeholder:text-cocoa-light/60 focus:outline-none focus:ring-2 focus:ring-sky/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-cream-dark flex items-center justify-center hover:bg-honey-light transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-cocoa" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Books Grid */}
      {viewMode === 'books' && (
        <>
          {filteredBooks.length === 0 && searchQuery ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto text-center py-12"
            >
              <div className="text-6xl mb-6">🔍</div>
              <h2 className="font-display text-2xl text-cocoa mb-4">Geen resultaten</h2>
              <p className="text-cocoa-light mb-6">
                Geen boeken gevonden voor "{searchQuery}"
              </p>
              <Button variant="secondary" onClick={() => setSearchQuery('')}>
                Zoekopdracht wissen
              </Button>
            </motion.div>
          ) : books.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto text-center py-12"
            >
              <div className="text-6xl mb-6">📚</div>
              <h2 className="font-display text-2xl text-cocoa mb-4">Nog geen boeken</h2>
              <p className="text-cocoa-light mb-6">
                Er zijn nog geen boeken toegevoegd. Vraag papa of mama om boeken toe te voegen in Beheer.
              </p>
              <Button variant="secondary" onClick={() => navigate('/beheer')}>
                Naar Beheer
              </Button>
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6"
            >
              {filteredBooks.map((book) => (
                <motion.div key={book.id} variants={itemVariants}>
                  <BookCover
                    book={book}
                    size="lg"
                    onClick={() => handleBookSelect(book)}
                  />
                  <p className="mt-2 text-center font-display text-sm sm:text-base text-cocoa line-clamp-2">
                    {book.title}
                  </p>
                  {book.author && (
                    <p className="text-center text-xs sm:text-sm text-cocoa-light line-clamp-1">
                      {book.author}
                    </p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </>
      )}

      {/* Readers Grid */}
      {viewMode === 'readers' && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 md:gap-8"
        >
          {readers.map((reader) => {
            const readerRecordings = getReaderRecordings(reader.id)
            const recordingCount = readerRecordings.length

            return (
              <motion.button
                key={reader.id}
                variants={itemVariants}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleReaderSelect(reader)}
                aria-label={`${reader.name}, ${recordingCount === 0 ? 'nog geen opnames' : `${recordingCount} opnames`}`}
                className="flex flex-col items-center p-4 sm:p-5 rounded-[24px] hover:bg-white/50 transition-colors min-h-[140px]"
              >
                <div className="relative">
                  <Avatar
                    src={reader.avatar_url}
                    name={reader.name}
                    size="xl"
                  />
                  {recordingCount > 0 && (
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-sky flex items-center justify-center text-white text-sm font-bold shadow-md" aria-hidden="true">
                      {recordingCount}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-center font-display text-lg text-cocoa">
                  {reader.name}
                </p>
                <p className="text-sm text-cocoa-light">
                  {recordingCount === 0 ? 'Nog geen opnames' : `${recordingCount} opname${recordingCount !== 1 ? 's' : ''}`}
                </p>
              </motion.button>
            )
          })}
        </motion.div>
      )}

      {/* Reader Recordings */}
      {viewMode === 'reader-recordings' && selected.reader && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl mx-auto"
        >
          {/* Reader header */}
          <div className="flex items-center gap-4 mb-8 p-4 bg-white/50 rounded-[20px]">
            <Avatar
              src={selected.reader.avatar_url}
              name={selected.reader.name}
              size="lg"
            />
            <div>
              <p className="font-display text-xl text-cocoa">{selected.reader.name}</p>
              <p className="text-cocoa-light">Voorlezer</p>
            </div>
          </div>

          {(() => {
            const readerRecordings = getReaderRecordings(selected.reader.id)

            if (readerRecordings.length === 0) {
              return (
                <Card hoverable={false} className="p-8 text-center">
                  <div className="text-5xl mb-4">🎙️</div>
                  <h3 className="font-display text-xl text-cocoa mb-2">Nog geen opnames</h3>
                  <p className="text-cocoa-light mb-6">
                    {selected.reader.name} heeft nog geen hoofdstukken voorgelezen.
                  </p>
                  <Button variant="secondary" onClick={() => navigate('/voorlezen')}>
                    Ga voorlezen
                  </Button>
                </Card>
              )
            }

            return (
              <div className="space-y-4">
                {readerRecordings.map(({ recording, chapter, book }) => (
                  <motion.button
                    key={recording.id}
                    variants={itemVariants}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (chapter && book) {
                        setSelected({
                          reader: selected.reader,
                          book: book as Book,
                          chapter: chapter,
                          recording,
                        })
                        setViewMode('player')
                      }
                    }}
                    className="w-full p-5 bg-white rounded-[20px] shadow-soft hover:shadow-lifted text-left flex items-center gap-4 transition-shadow"
                  >
                    <div className="w-12 h-12 rounded-[12px] bg-sky-light flex items-center justify-center text-2xl">
                      🎧
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-lg text-cocoa">{book?.title}</p>
                      <p className="text-cocoa-light">Hoofdstuk {chapter?.chapter_number}: {chapter?.title}</p>
                    </div>
                    <svg className="w-6 h-6 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </motion.button>
                ))}
              </div>
            )
          })()}
        </motion.div>
      )}

      {/* Chapters List */}
      {viewMode === 'chapters' && bookWithChapters && (() => {
        // Calculate book-level stats
        const bookStats = bookWithChapters.chapters.reduce(
          (acc, chapter) => {
            const chapterData = getChapterWithRecordings(chapter.id)
            if (chapterData && chapterData.recordings.length > 0) {
              const rec = chapterData.recordings[0]
              acc.totalDuration += rec.duration_seconds || 0
              if (rec.reader?.name && !acc.readers.includes(rec.reader.name)) {
                acc.readers.push(rec.reader.name)
              }
              acc.chaptersWithRecordings++
            }
            return acc
          },
          { totalDuration: 0, readers: [] as string[], chaptersWithRecordings: 0 }
        )

        const formatBookDuration = (seconds: number) => {
          const hours = Math.floor(seconds / 3600)
          const mins = Math.floor((seconds % 3600) / 60)
          if (hours > 0) {
            return `${hours}u ${mins}m`
          }
          return `${mins} min`
        }

        return (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl mx-auto space-y-4"
        >
          {/* Book info header */}
          {bookStats.chaptersWithRecordings > 0 && (
            <motion.div
              variants={itemVariants}
              className="p-4 bg-white/60 rounded-[20px] flex flex-wrap items-center gap-4 mb-2"
            >
              {bookStats.totalDuration > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏱️</span>
                  <span className="text-cocoa">
                    <span className="font-medium">{formatBookDuration(bookStats.totalDuration)}</span>
                    <span className="text-cocoa-light ml-1">totaal</span>
                  </span>
                </div>
              )}
              {bookStats.readers.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎙️</span>
                  <span className="text-cocoa">
                    <span className="text-cocoa-light">Voorgelezen door </span>
                    <span className="font-medium">{bookStats.readers.join(', ')}</span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-cocoa-light">
                <span className="text-lg">📖</span>
                <span>{bookStats.chaptersWithRecordings} van {bookWithChapters.chapters.length} hoofdstukken</span>
              </div>
            </motion.div>
          )}

          {bookWithChapters.chapters.length === 0 ? (
            <Card hoverable={false} className="p-8 text-center">
              <div className="text-4xl mb-4">📝</div>
              <p className="text-cocoa-light">
                Dit boek heeft nog geen hoofdstukken.
              </p>
            </Card>
          ) : (
            bookWithChapters.chapters.map((chapter) => {
              const chapterData = getChapterWithRecordings(chapter.id)
              const hasRecordings = chapterData && chapterData.recordings.length > 0
              const progress = getChapterProgress(chapter.id)

              // Get duration from recording
              const recording = chapterData?.recordings[0]
              const durationSeconds = recording?.duration_seconds || 0
              const currentTimeSeconds = progress?.currentTime || 0
              const remainingSeconds = Math.max(0, durationSeconds - currentTimeSeconds)

              const progressPercent = durationSeconds > 0
                ? Math.round((currentTimeSeconds / durationSeconds) * 100)
                : 0

              // Format time helper
              const formatTime = (seconds: number) => {
                const mins = Math.floor(seconds / 60)
                const secs = Math.floor(seconds % 60)
                if (mins >= 60) {
                  const hours = Math.floor(mins / 60)
                  const remainingMins = mins % 60
                  return `${hours}u ${remainingMins}m`
                }
                return `${mins}:${secs.toString().padStart(2, '0')}`
              }

              // Get reader name
              const readerName = recording?.reader?.name

              return (
                <motion.button
                  key={chapter.id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleChapterSelect(chapter)}
                  disabled={!hasRecordings}
                  className={`
                    w-full p-6 rounded-[24px] text-left
                    flex items-center gap-4
                    transition-colors relative overflow-hidden
                    ${hasRecordings
                      ? 'bg-white shadow-soft hover:shadow-lifted cursor-pointer'
                      : 'bg-cream-dark/50 cursor-not-allowed opacity-60'
                    }
                  `}
                >
                  {/* Progress bar background */}
                  {hasRecordings && progressPercent > 0 && (
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-sky-light/30 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  )}

                  <div className={`
                    relative w-14 h-14 rounded-[16px] flex items-center justify-center text-2xl
                    ${progress?.completed ? 'bg-moss' : hasRecordings ? 'bg-sky-light' : 'bg-cream-dark'}
                  `}>
                    {progress?.completed ? '✅' : hasRecordings ? '🎧' : '📝'}
                  </div>
                  <div className="flex-1 relative">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-xl text-cocoa">
                        Hoofdstuk {chapter.chapter_number}
                      </p>
                      {hasRecordings && durationSeconds > 0 && (
                        <span className="text-sm text-cocoa-light bg-cream-dark/50 px-2 py-0.5 rounded-full">
                          {formatTime(durationSeconds)}
                        </span>
                      )}
                    </div>
                    <p className="text-cocoa-light">{chapter.title}</p>
                    {hasRecordings && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                        {readerName && (
                          <span className="text-cocoa-light">
                            Voorgelezen door <span className="font-medium text-cocoa">{readerName}</span>
                          </span>
                        )}
                        {progressPercent > 0 && !progress?.completed && (
                          <span className="text-sky">
                            {formatTime(currentTimeSeconds)} beluisterd • nog {formatTime(remainingSeconds)}
                          </span>
                        )}
                        {progress?.completed && (
                          <span className="text-moss font-medium">Voltooid</span>
                        )}
                      </div>
                    )}
                  </div>
                  {hasRecordings && chapterData && (
                    <div className="flex -space-x-2 relative">
                      {chapterData.recordings.slice(0, 3).map((rec) => (
                        <Avatar
                          key={rec.id}
                          src={rec.reader?.avatar_url}
                          name={rec.reader?.name || 'Onbekend'}
                          size="sm"
                        />
                      ))}
                    </div>
                  )}
                </motion.button>
              )
            })
          )}
        </motion.div>
        )
      })()}

      {/* Mini-player bar - shows after closing the full player */}
      <AnimatePresence>
        {viewMode !== 'player' && lastPlayed?.recording && lastPlayed?.chapter && lastPlayed?.book && lastPlayed?.reader && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]"
          >
            <button
              onClick={handleResumeFromMiniPlayer}
              className="w-full bg-white shadow-floating border-t border-cream-dark px-4 py-3 flex items-center gap-3 hover:bg-cream/50 transition-colors"
            >
              <div className="w-10 h-12 rounded-lg overflow-hidden flex-shrink-0">
                {lastPlayed.book.cover_url ? (
                  <img src={lastPlayed.book.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-honey to-honey-dark flex items-center justify-center text-white text-sm">
                    📖
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-cocoa truncate">{lastPlayed.chapter.title}</p>
                <p className="text-xs text-cocoa-light truncate">{lastPlayed.book.title} · {lastPlayed.reader.name}</p>
              </div>
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setLastPlayed(null)
                }}
                className="flex-shrink-0 p-2 text-cocoa-light hover:text-cocoa"
                aria-label="Sluiten"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audio Player Modal */}
      {viewMode === 'player' && selected.recording && selected.chapter && selected.book && selected.reader && (() => {
        const { canNext, canPrevious } = canNavigate()
        // Build available recordings for the current chapter
        const chapterData = getChapterWithRecordings(selected.chapter.id)
        const availableRecordings = chapterData?.recordings
          .map(rec => {
            const r = users.find(u => u.id === rec.reader_id)
            return r ? { recording: rec, reader: r } : null
          })
          .filter((item): item is NonNullable<typeof item> => item !== null) || []

        return (
          <AudioPlayer
            recording={selected.recording}
            chapter={selected.chapter}
            book={selected.book}
            reader={selected.reader}
            allChapters={bookWithChapters?.chapters || []}
            onClose={handleClosePlayer}
            onNext={canNext ? handleNextChapter : undefined}
            onPrevious={canPrevious ? handlePreviousChapter : undefined}
            onChapterSelect={handleChapterSelect}
            availableRecordings={availableRecordings}
            onRecordingSelect={handleRecordingSelect}
          />
        )
      })()}
    </div>
  )
}
