import { motion } from 'framer-motion'
import { Card, Avatar } from '../../components/ui'
import {
  getBooks,
  getChaptersForBook,
  getChapter,
  getBook,
  getUsers,
  getRecordings,
} from '../../lib/storage'

export function StatsPanel() {
  const allRecordings = getRecordings()
  const allBooks = getBooks()
  const allUsers = getUsers()

  // Calculate total recording duration
  const totalDurationSeconds = allRecordings.reduce((acc, r) => acc + (r.duration_seconds || 0), 0)
  const totalHours = Math.floor(totalDurationSeconds / 3600)
  const totalMinutes = Math.floor((totalDurationSeconds % 3600) / 60)

  // Recordings per reader
  const recordingsPerReader = allUsers.map(user => ({
    user,
    count: allRecordings.filter(r => r.reader_id === user.id).length,
    duration: allRecordings.filter(r => r.reader_id === user.id).reduce((acc, r) => acc + (r.duration_seconds || 0), 0)
  })).sort((a, b) => b.count - a.count)

  // Recordings per book
  const recordingsPerBook = allBooks.map(book => {
    const bookChapters = getChaptersForBook(book.id)
    const bookRecordings = bookChapters.flatMap(ch =>
      allRecordings.filter(r => r.chapter_id === ch.id)
    )
    return {
      book,
      chapterCount: bookChapters.length,
      recordedChapters: bookChapters.filter(ch =>
        allRecordings.some(r => r.chapter_id === ch.id)
      ).length,
      totalRecordings: bookRecordings.length
    }
  }).sort((a, b) => b.totalRecordings - a.totalRecordings)

  // Recent recordings (last 10)
  const recentRecordings = [...allRecordings]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl"
    >
      <h2 className="font-display text-xl text-cocoa mb-6">Statistieken</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 text-center">
          <p className="text-3xl font-display text-honey">{allBooks.length}</p>
          <p className="text-sm text-cocoa-light">Boeken</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-display text-sky">{allRecordings.length}</p>
          <p className="text-sm text-cocoa-light">Opnames</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-display text-moss">{allUsers.length}</p>
          <p className="text-sm text-cocoa-light">Voorlezers</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-display text-sunset">
            {totalHours > 0 ? `${totalHours}u ${totalMinutes}m` : `${totalMinutes}m`}
          </p>
          <p className="text-sm text-cocoa-light">Totale duur</p>
        </Card>
      </div>

      {/* Two column layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recordings per reader */}
        <Card className="p-4">
          <h3 className="font-display text-lg text-cocoa mb-4">Opnames per voorlezer</h3>
          <div className="space-y-3">
            {recordingsPerReader.map(({ user, count, duration }) => {
              const mins = Math.floor(duration / 60)
              return (
                <div key={user.id} className="flex items-center gap-3">
                  <Avatar src={user.avatar_url} name={user.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-cocoa truncate">{user.name}</p>
                    <p className="text-xs text-cocoa-light">{mins} minuten</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg text-honey">{count}</p>
                    <p className="text-xs text-cocoa-light">opnames</p>
                  </div>
                </div>
              )
            })}
            {recordingsPerReader.length === 0 && (
              <p className="text-cocoa-light text-sm">Nog geen opnames</p>
            )}
          </div>
        </Card>

        {/* Books progress */}
        <Card className="p-4">
          <h3 className="font-display text-lg text-cocoa mb-4">Voortgang per boek</h3>
          <div className="space-y-3">
            {recordingsPerBook.slice(0, 5).map(({ book, chapterCount, recordedChapters }) => {
              const progress = chapterCount > 0 ? Math.round((recordedChapters / chapterCount) * 100) : 0
              return (
                <div key={book.id}>
                  <div className="flex justify-between mb-1">
                    <p className="font-medium text-cocoa text-sm truncate">{book.title}</p>
                    <p className="text-xs text-cocoa-light">{recordedChapters}/{chapterCount}</p>
                  </div>
                  <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-honey to-honey-dark rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {recordingsPerBook.length === 0 && (
              <p className="text-cocoa-light text-sm">Nog geen boeken</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="p-4 mt-6">
        <h3 className="font-display text-lg text-cocoa mb-4">Recente activiteit</h3>
        <div className="space-y-2">
          {recentRecordings.map(recording => {
            const chapter = getChapter(recording.chapter_id)
            const book = chapter ? getBook(chapter.book_id) : undefined
            const reader = allUsers.find(u => u.id === recording.reader_id)
            const date = new Date(recording.created_at)
            const dateStr = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
            const mins = Math.floor(recording.duration_seconds / 60)
            const secs = recording.duration_seconds % 60

            return (
              <div key={recording.id} className="flex items-center gap-3 p-2 rounded-lg bg-cream/50">
                {reader && <Avatar src={reader.avatar_url} name={reader.name} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cocoa truncate">
                    <strong>{reader?.name}</strong> nam <strong>{chapter?.title}</strong> op
                  </p>
                  <p className="text-xs text-cocoa-light truncate">
                    {book?.title} • {mins}:{secs.toString().padStart(2, '0')}
                  </p>
                </div>
                <p className="text-xs text-cocoa-light whitespace-nowrap">{dateStr}</p>
              </div>
            )
          })}
          {recentRecordings.length === 0 && (
            <p className="text-cocoa-light text-sm">Nog geen recente activiteit</p>
          )}
        </div>
      </Card>
    </motion.div>
  )
}
