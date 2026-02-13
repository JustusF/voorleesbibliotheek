import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Button, Card, useToast } from '../../components/ui'
import {
  getChaptersForBook,
  addChapter,
  deleteChapter,
  updateChapter,
  deleteRecording,
  replaceRecordingAsync,
} from '../../lib/storage'
import { extractChaptersFromImages } from '../../lib/ocr'
import { Avatar } from '../../components/ui'
import { ChapterItem } from './ChapterItem'
import type { Book, Chapter, User } from '../../types'

interface ChapterListProps {
  book: Book
  users: User[]
  onBack: () => void
  onEditBook: (book: Book) => void
}

export function ChapterList({ book, users, onBack, onEditBook }: ChapterListProps) {
  const { showToast } = useToast()
  const [chapters, setChapters] = useState<Chapter[]>(() => getChaptersForBook(book.id))
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scannedChapters, setScannedChapters] = useState<Array<{ number: number; title: string }>>([])
  const [uploadingChapterId, setUploadingChapterId] = useState<string | null>(null)
  const [showReaderSelectModal, setShowReaderSelectModal] = useState(false)
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null)
  const [isUploadingAudio, setIsUploadingAudio] = useState(false)
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

  const tocFileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)

  const refreshChapters = () => {
    setChapters(getChaptersForBook(book.id))
  }

  const handleAddChapterToBook = () => {
    if (!newChapterTitle.trim()) return

    const existingChapters = getChaptersForBook(book.id)
    const nextNumber = existingChapters.length + 1

    addChapter(book.id, nextNumber, newChapterTitle.trim())
    refreshChapters()
    setNewChapterTitle('')
  }

  const handleDeleteChapter = (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId)
    setConfirmDialog({
      isOpen: true,
      title: 'Hoofdstuk verwijderen?',
      message: `Weet je zeker dat je "${chapter?.title || 'dit hoofdstuk'}" wilt verwijderen? Eventuele opnames worden ook verwijderd.`,
      confirmText: 'Verwijderen',
      onConfirm: () => {
        deleteChapter(chapterId)
        refreshChapters()
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
      },
    })
  }

  const handleMoveChapter = (chapter: Chapter, direction: 'up' | 'down') => {
    const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number)
    const currentIndex = sortedChapters.findIndex(c => c.id === chapter.id)

    if (direction === 'up' && currentIndex > 0) {
      const prevChapter = sortedChapters[currentIndex - 1]
      updateChapter(chapter.id, { chapter_number: prevChapter.chapter_number })
      updateChapter(prevChapter.id, { chapter_number: chapter.chapter_number })
    } else if (direction === 'down' && currentIndex < sortedChapters.length - 1) {
      const nextChapter = sortedChapters[currentIndex + 1]
      updateChapter(chapter.id, { chapter_number: nextChapter.chapter_number })
      updateChapter(nextChapter.id, { chapter_number: chapter.chapter_number })
    }

    refreshChapters()
  }

  const handleDeleteRecording = (recordingId: string, readerName?: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Opname verwijderen?',
      message: `Weet je zeker dat je de opname${readerName ? ` van ${readerName}` : ''} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
      confirmText: 'Verwijderen',
      onConfirm: () => {
        deleteRecording(recordingId)
        refreshChapters()
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
      },
    })
  }

  const handleScanTableOfContents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsScanning(true)
    setScanError(null)
    setScannedChapters([])

    try {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
      if (imageFiles.length === 0) {
        setScanError('Selecteer een of meer afbeeldingen.')
        return
      }

      const result = await extractChaptersFromImages(imageFiles)

      if (result.success && result.chapters.length > 0) {
        setScannedChapters(result.chapters)
      } else {
        setScanError(result.error || 'Geen hoofdstukken gevonden.')
      }
    } catch (error) {
      setScanError(`Er ging iets mis: ${error instanceof Error ? error.message : 'Onbekende fout'}`)
    } finally {
      setIsScanning(false)
      if (tocFileInputRef.current) {
        tocFileInputRef.current.value = ''
      }
    }
  }

  const handleAddScannedChapters = () => {
    if (scannedChapters.length === 0) return

    const existingChapters = getChaptersForBook(book.id)
    const startNumber = existingChapters.length + 1

    scannedChapters.forEach((ch, index) => {
      addChapter(book.id, startNumber + index, ch.title)
    })

    refreshChapters()
    setScannedChapters([])
  }

  const handleAudioFileSelect = (chapterId: string) => {
    setUploadingChapterId(chapterId)
    audioFileInputRef.current?.click()
  }

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingChapterId) return

    const hasAudioMimeType = file.type.startsWith('audio/')
    const hasAudioExtension = /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name)

    if (!hasAudioMimeType && !hasAudioExtension) {
      showToast('Selecteer een audiobestand (mp3, wav, m4a, etc.)', 'error')
      return
    }

    setPendingAudioFile(file)
    setShowReaderSelectModal(true)

    if (audioFileInputRef.current) {
      audioFileInputRef.current.value = ''
    }
  }

  const handleUploadAudioWithReader = async (readerId: string) => {
    if (!pendingAudioFile || !uploadingChapterId) return

    setIsUploadingAudio(true)
    setShowReaderSelectModal(false)

    try {
      const duration = await new Promise<number>((resolve) => {
        const audio = new Audio()
        audio.onloadedmetadata = () => {
          resolve(Math.round(audio.duration))
        }
        audio.onerror = () => resolve(0)
        audio.src = URL.createObjectURL(pendingAudioFile)
      })

      await replaceRecordingAsync(uploadingChapterId, readerId, pendingAudioFile, duration)
      refreshChapters()
    } catch (error) {
      console.error('Error uploading audio:', error)
      showToast('Er ging iets mis bij het uploaden van de audio.', 'error')
    } finally {
      setIsUploadingAudio(false)
      setPendingAudioFile(null)
      setUploadingChapterId(null)
    }
  }

  const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl"
    >
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-4"
      >
        ← Terug naar boeken
      </Button>

      <Card hoverable={false} className="p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl text-cocoa mb-1">{book.title}</h2>
            {book.author && (
              <p className="text-cocoa-light mb-1">door {book.author}</p>
            )}
            <p className="text-cocoa-light text-sm">{chapters.length} hoofdstukken</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEditBook(book)}
          >
            Bewerken
          </Button>
        </div>
      </Card>

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-lg text-cocoa">Hoofdstukken</h3>
      </div>

      {/* Add new chapter */}
      <Card hoverable={false} className="p-4 mb-4">
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            value={newChapterTitle}
            onChange={(e) => setNewChapterTitle(e.target.value)}
            placeholder="Nieuw hoofdstuk toevoegen..."
            className="flex-1 px-4 py-2 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddChapterToBook()
              }
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleAddChapterToBook}
            disabled={!newChapterTitle.trim()}
          >
            + Toevoegen
          </Button>
        </div>

        {/* Scan table of contents */}
        <div className="border-t border-cream-dark pt-3">
          <input
            ref={tocFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleScanTableOfContents}
            className="hidden"
          />
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => tocFileInputRef.current?.click()}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Scannen...
                </>
              ) : (
                <>📷 Scan inhoudsopgave</>
              )}
            </Button>
            <span className="text-sm text-cocoa-light">
              Maak een foto van de inhoudsopgave
            </span>
          </div>

          {/* Scan error */}
          {scanError && (
            <div className="mt-3 p-3 bg-sunset/10 rounded-xl text-sm text-sunset">
              {scanError}
            </div>
          )}

          {/* Scanned chapters preview */}
          {scannedChapters.length > 0 && (
            <div className="mt-3 p-3 bg-sky-light/30 rounded-xl">
              <p className="text-sm font-medium text-cocoa mb-2">
                {scannedChapters.length} hoofdstukken gevonden:
              </p>
              <ul className="text-sm text-cocoa-light space-y-1 max-h-40 overflow-y-auto">
                {scannedChapters.map((ch, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-sky font-medium">{ch.number}.</span>
                    <span>{ch.title}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddScannedChapters}
                >
                  Alle toevoegen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScannedChapters([])}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {chapters.length === 0 ? (
        <Card hoverable={false} className="p-6 text-center">
          <p className="text-cocoa-light">Geen hoofdstukken toegevoegd.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedChapters.map((chapter, index) => (
            <ChapterItem
              key={chapter.id}
              chapter={chapter}
              index={index}
              totalCount={sortedChapters.length}
              users={users}
              isUploadingAudio={isUploadingAudio}
              uploadingChapterId={uploadingChapterId}
              onDelete={handleDeleteChapter}
              onMove={handleMoveChapter}
              onAudioFileSelect={handleAudioFileSelect}
              onDeleteRecording={handleDeleteRecording}
            />
          ))}
        </div>
      )}

      {/* Hidden audio file input */}
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm"
        onChange={handleAudioFileChange}
        className="hidden"
      />

      {/* Reader selection modal for audio upload */}
      {showReaderSelectModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => {
            setShowReaderSelectModal(false)
            setPendingAudioFile(null)
            setUploadingChapterId(null)
          }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-[24px] sm:rounded-[24px] shadow-floating p-6 max-w-md w-full"
          >
            <h2 className="font-display text-2xl text-cocoa mb-4">Wie heeft voorgelezen?</h2>
            <p className="text-cocoa-light mb-4">
              Selecteer de voorlezer voor deze audio-opname.
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users.filter(u => u.role === 'reader' || u.role === 'admin').map((reader) => (
                <button
                  key={reader.id}
                  onClick={() => handleUploadAudioWithReader(reader.id)}
                  className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-cream-dark/50 transition-colors min-h-[44px]"
                >
                  <Avatar
                    src={reader.avatar_url}
                    name={reader.name}
                    size="md"
                  />
                  <span className="text-cocoa font-medium">{reader.name}</span>
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                setShowReaderSelectModal(false)
                setPendingAudioFile(null)
                setUploadingChapterId(null)
              }}
              className="w-full mt-4"
            >
              Annuleren
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[24px] shadow-floating p-6 max-w-sm w-full"
          >
            <h2 className="font-display text-2xl text-cocoa mb-4">{confirmDialog.title}</h2>
            <p className="text-cocoa-light mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-cream-dark text-cocoa hover:bg-cream transition-colors font-medium min-h-[44px]"
              >
                Annuleren
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 px-4 py-3 rounded-xl bg-sunset text-white hover:bg-sunset/90 font-medium transition-colors min-h-[44px]"
              >
                {confirmDialog.confirmText || 'Bevestigen'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
