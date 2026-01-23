import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { BookCover, Avatar, CloudDecoration, Button, Card } from '../components/ui'
import { AudioPlayer } from '../components/AudioPlayer'
import { getBooks, getUsers, getBookWithChapters, getChapterWithRecordings, getChapterProgress, getRecordings, getChapters } from '../lib/storage'
import type { Book, User, Chapter, Recording } from '../types'

type ViewMode = 'books' | 'readers' | 'chapters' | 'player' | 'reader-recordings'

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
  const [viewMode, setViewMode] = useState<ViewMode>('books')
  const [selected, setSelected] = useState<SelectedState>({})
  const [books, setBooks] = useState<Book[]>(() => getBooks())
  const [users, setUsers] = useState<User[]>(() => getUsers())

  // Refresh data when returning to page
  useEffect(() => {
    const refreshData = () => {
      setBooks(getBooks())
      setUsers(getUsers())
    }
    refreshData()
  }, [viewMode])

  const readers = users.filter(u => u.role === 'reader' || u.role === 'admin')

  const handleBookSelect = (book: Book) => {
    setSelected({ book })
    setViewMode('chapters')
  }

  const handleChapterSelect = (chapter: Chapter) => {
    if (!selected.book) return

    const chapterData = getChapterWithRecordings(chapter.id)
    if (chapterData && chapterData.recordings.length > 0) {
      const recording = chapterData.recordings[0]
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
    } else {
      navigate('/')
    }
  }

  const handleClosePlayer = () => {
    setViewMode('chapters')
    setSelected({ book: selected.book })
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
        <h1 className="font-display text-3xl text-cocoa">
          {viewMode === 'books' && 'Kies een boek'}
          {viewMode === 'readers' && 'Wie leest voor?'}
          {viewMode === 'chapters' && selected.book?.title}
          {viewMode === 'reader-recordings' && `Opnames van ${selected.reader?.name}`}
          {viewMode === 'player' && 'Nu aan het luisteren'}
        </h1>
      </motion.header>

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

      {/* Books Grid */}
      {viewMode === 'books' && (
        <>
          {books.length === 0 ? (
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
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8"
            >
              {books.map((book) => (
                <motion.div key={book.id} variants={itemVariants}>
                  <BookCover
                    book={book}
                    size="lg"
                    onClick={() => handleBookSelect(book)}
                  />
                  <p className="mt-3 text-center font-display text-cocoa">
                    {book.title}
                  </p>
                  {book.author && (
                    <p className="text-center text-sm text-cocoa-light">
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
      {viewMode === 'chapters' && bookWithChapters && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl mx-auto space-y-4"
        >
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
              const progressPercent = progress && progress.duration > 0
                ? Math.round((progress.currentTime / progress.duration) * 100)
                : 0

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
                    <p className="font-display text-xl text-cocoa">
                      Hoofdstuk {chapter.chapter_number}
                    </p>
                    <p className="text-cocoa-light">{chapter.title}</p>
                    {hasRecordings && progressPercent > 0 && !progress?.completed && (
                      <p className="text-xs text-sky mt-1">
                        {progressPercent}% beluisterd
                      </p>
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
      )}

      {/* Audio Player Modal */}
      {viewMode === 'player' && selected.recording && selected.chapter && selected.book && selected.reader && (
        <AudioPlayer
          recording={selected.recording}
          chapter={selected.chapter}
          book={selected.book}
          reader={selected.reader}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  )
}
