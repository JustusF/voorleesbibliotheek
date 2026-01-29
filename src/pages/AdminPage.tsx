import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Avatar, ConfirmDialog } from '../components/ui'
import {
  getBooks,
  getBook,
  addBook,
  updateBook,
  deleteBook,
  getChaptersForBook,
  getChapter,
  addChapter,
  addChapters,
  deleteChapter,
  updateChapter,
  getUsers,
  addUser,
  deleteUser,
  updateUser,
  getRecordings,
  getRecordingsForChapter,
  deleteRecording,
  replaceRecordingAsync,
  forceResyncFromSupabase,
} from '../lib/storage'
import { extractChaptersFromImages } from '../lib/ocr'
import type { Book, Chapter, User } from '../types'

type Tab = 'books' | 'readers' | 'stats'

export function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('books')
  const [books, setBooks] = useState<Book[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [showAddBook, setShowAddBook] = useState(false)
  const [showEditBook, setShowEditBook] = useState(false)
  const [showAddReader, setShowAddReader] = useState(false)
  const [showEditReader, setShowEditReader] = useState(false)
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookAuthor, setNewBookAuthor] = useState('')
  const [newBookCover, setNewBookCover] = useState<string | null>(null)
  const [newChaptersText, setNewChaptersText] = useState('')
  const [isSearchingChapters, setIsSearchingChapters] = useState(false)
  const [isSearchingCover, setIsSearchingCover] = useState(false)
  const [editBookTitle, setEditBookTitle] = useState('')
  const [editBookAuthor, setEditBookAuthor] = useState('')
  const [editBookCover, setEditBookCover] = useState<string | null>(null)
  const [isSearchingEditCover, setIsSearchingEditCover] = useState(false)
  const [, setEditChaptersText] = useState('')
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newReaderName, setNewReaderName] = useState('')
  const [newReaderPhoto, setNewReaderPhoto] = useState<string | null>(null)
  const [editReaderName, setEditReaderName] = useState('')
  const [editReaderPhoto, setEditReaderPhoto] = useState<string | null>(null)
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null)
  const [editChapterTitle, setEditChapterTitle] = useState('')
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scannedChapters, setScannedChapters] = useState<Array<{ number: number; title: string }>>([])
  const [uploadingChapterId, setUploadingChapterId] = useState<string | null>(null)
  const [showReaderSelectModal, setShowReaderSelectModal] = useState(false)
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null)
  const [isUploadingAudio, setIsUploadingAudio] = useState(false)

  // Confirmation dialog state
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

  // Resync state
  const [isResyncing, setIsResyncing] = useState(false)
  const [resyncMessage, setResyncMessage] = useState<string | null>(null)

  const handleResync = async () => {
    setIsResyncing(true)
    setResyncMessage(null)
    try {
      const result = await forceResyncFromSupabase()
      setResyncMessage(result.message)
      // Refresh all data
      setBooks(getBooks())
      setUsers(getUsers())
      if (selectedBook) {
        setChapters(getChaptersForBook(selectedBook.id))
      }
    } catch (error) {
      setResyncMessage('Fout bij hersynchroniseren: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsResyncing(false)
      // Clear message after 5 seconds
      setTimeout(() => setResyncMessage(null), 5000)
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const tocFileInputRef = useRef<HTMLInputElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setBooks(getBooks())
    setUsers(getUsers())
  }, [])

  useEffect(() => {
    if (selectedBook) {
      setChapters(getChaptersForBook(selectedBook.id))
    }
  }, [selectedBook])

  // Known children's books with their chapters (common Dutch children's books)
  const knownBooks: Record<string, string[]> = {
    'matilda': [
      'De lezer van boeken',
      'Meneer Wurmansen, de grote handelaar',
      'De hoed en de superlijm',
      'Het spook',
      'Rekenwonders',
      'De platinablonde man',
      'Juffrouw Honingzoet',
      'De Bullemansen',
      'Het goede voorbeeld',
      'Het vaders',
      'De ouders',
      'Lavendel',
      'De wekelijkse test',
      'De eerste wonder',
      'De tweede wonder',
      'Juffrouw Bullemennen\'s huis',
      'Het krijt',
      'De namen',
      'De praktijk',
      'Het derde wonder',
      'Een nieuwe thuis'
    ],
    'de gvr': [
      'Sophie',
      'Wie?',
      'De ontvoering',
      'Het grottenhol',
      'De GVR',
      'De reuzen',
      'De oren van de GVR',
      'Snozkomkommers',
      'De Bloeddorstige Bonkrijzer',
      'Frobbelschotje en Droomvanger',
      'Reis naar Droomenland',
      'Dromenjacht',
      'De droomuitleg',
      'Droomblazen',
      'De nachtmerrie',
      'Het plan',
      'Naar het paleis',
      'Het ontbijt',
      'De andere reuzen',
      'De grote vergadering',
      'De slaap',
      'Het complot',
      'De vangst',
      'Het einde'
    ],
    'charlie en de chocoladefabriek': [
      'Dit zijn de vijf kinderen',
      'De familie van Charlie',
      'De twee oudste',
      'Meneer Willy Wonka\'s fabriek',
      'De gouden toegangskaarten',
      'De eerste twee winnaars',
      'Charlie\'s verjaardag',
      'Nog twee gouden kaarten gevonden',
      'Opa Jakob',
      'De familie begint te verhongeren',
      'Het wonder',
      'Wat er op de gouden toegangskaart stond',
      'De grote dag breekt aan',
      'Meneer Willy Wonka',
      'De chocoladekamer',
      'De Oempa-Loempa\'s',
      'Augustus Smok gaat door de pijp',
      'Naar de boot',
      'De uitvindkamer',
      'De grote pruimachtige kauwgom',
      'De noten sorteerders',
      'De grote glazen lift',
      'Het TV-chocolade kamer',
      'Het einde'
    ],
    'pluk van de petteflet': [
      'Pluk komt met zijn kraanwagen',
      'Zaza de vlinder',
      'De duiven',
      'De torenkamer',
      'Stampertje',
      'Het park',
      'De Petteflet krijgt bezoek',
      'Het uitje',
      'De spin',
      'De rommelmarkt',
      'De reddingsactie',
      'Aagje\'s verjaardag',
      'Het feest'
    ],
    'nijntje': [
      'Nijntje',
      'Nijntje in de dierentuin',
      'Nijntje op het strand',
      'Nijntje in de sneeuw'
    ],
    'jip en janneke': [
      'Jip en Janneke',
      'De buren',
      'Naar school',
      'Het speelkwartier',
      'De zandtaart',
      'In bad',
      'Takkie',
      'De verjaardag'
    ],
    'kikker': [
      'Kikker en zijn vriendjes',
      'Kikker is verliefd',
      'Kikker in de kou',
      'Kikker is bang',
      'Kikker en het vogeltje'
    ]
  }

  // Search for book cover using Google Books API
  const searchBookCover = async (title: string, author?: string): Promise<string | null> => {
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
            // Prefer larger images, use HTTPS
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

  const searchChaptersOnline = async () => {
    if (!newBookTitle.trim()) {
      alert('Vul eerst een boektitel in')
      return
    }

    setIsSearchingChapters(true)

    try {
      const searchTitle = newBookTitle.trim().toLowerCase()
      let chaptersFound: string[] = []

      // First check if we have it in our known books database
      for (const [bookKey, chapters] of Object.entries(knownBooks)) {
        if (searchTitle.includes(bookKey) || bookKey.includes(searchTitle)) {
          chaptersFound = chapters
          break
        }
      }

      // If found in known books, use those
      if (chaptersFound.length > 0) {
        setNewChaptersText(chaptersFound.join('\n'))
        setIsSearchingChapters(false)
        return
      }

      // Try Supabase Edge Function with AI (if configured)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      if (supabaseUrl && supabaseAnonKey) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/search-chapters`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ bookTitle: newBookTitle.trim() }),
          })

          if (response.ok) {
            const data = await response.json()
            if (data.found && data.chapters && data.chapters.length > 0) {
              setNewChaptersText(data.chapters.join('\n'))
              setIsSearchingChapters(false)
              return
            }
          }
        } catch (error) {
          console.log('Supabase function not available, falling back to manual search')
        }
      }

      // If still no chapters found, continue with Google Books API

      // Try Google Books API
      const searchQuery = encodeURIComponent(newBookTitle.trim())
      const googleBooksResponse = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${searchQuery}&maxResults=5`
      )
      const googleData = await googleBooksResponse.json()

      if (googleData.items && googleData.items.length > 0) {
        for (const book of googleData.items) {
          if (book.id) {
            try {
              const detailResponse = await fetch(
                `https://www.googleapis.com/books/v1/volumes/${book.id}`
              )
              const detailData = await detailResponse.json()

              if (detailData.volumeInfo?.tableOfContents) {
                chaptersFound = detailData.volumeInfo.tableOfContents.map(
                  (item: { title: string }) => item.title
                )
                break
              }
            } catch {
              // Continue to next book
            }
          }
        }
      }

      if (chaptersFound.length > 0) {
        setNewChaptersText(chaptersFound.join('\n'))
      } else {
        // Show helpful message
        alert(
          `Geen hoofdstukken gevonden voor "${newBookTitle}".\n\n` +
          'Tip: Kopieer de inhoudsopgave van het boek en plak deze in het tekstveld.'
        )
      }
    } catch (error) {
      console.error('Error searching for chapters:', error)
      alert(
        'Er ging iets mis bij het zoeken.\n\n' +
        'Tip: Kopieer de inhoudsopgave van het boek en plak deze in het tekstveld.'
      )
    } finally {
      setIsSearchingChapters(false)
    }
  }

  // Auto-fetch cover when title changes (debounced)
  const handleSearchCover = async () => {
    if (!newBookTitle.trim()) return

    setIsSearchingCover(true)
    const cover = await searchBookCover(newBookTitle.trim(), newBookAuthor.trim() || undefined)
    if (cover) {
      setNewBookCover(cover)
    }
    setIsSearchingCover(false)
  }

  const parseChaptersText = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove chapter numbers if present (e.g., "1. Title" or "Hoofdstuk 1: Title")
        return line
          .replace(/^(\d+[\.\:\-\s]+|Hoofdstuk\s+\d+[\.\:\-\s]+)/i, '')
          .trim()
      })
  }

  const handleAddBook = () => {
    if (!newBookTitle.trim()) return

    const chaptersArray = parseChaptersText(newChaptersText)

    const book = addBook(
      newBookTitle.trim(),
      newBookAuthor.trim() || undefined,
      newBookCover || undefined
    )
    if (chaptersArray.length > 0) {
      addChapters(book.id, chaptersArray)
    }

    setBooks(getBooks())
    setNewBookTitle('')
    setNewBookAuthor('')
    setNewBookCover(null)
    setNewChaptersText('')
    setShowAddBook(false)
  }

  const handleEditBook = (book: Book) => {
    setSelectedBook(book)
    setEditBookTitle(book.title)
    setEditBookAuthor(book.author || '')
    setEditBookCover(book.cover_url)
    const bookChapters = getChaptersForBook(book.id)
    setEditChaptersText(bookChapters.map(c => c.title).join('\n'))
    setShowEditBook(true)
  }

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
    if (!selectedBook || !editBookTitle.trim()) return

    // Update book title, author and cover
    updateBook(selectedBook.id, {
      title: editBookTitle.trim(),
      author: editBookAuthor.trim() || null,
      cover_url: editBookCover
    })

    setBooks(getBooks())
    setSelectedBook({ ...selectedBook, title: editBookTitle.trim(), author: editBookAuthor.trim() || null, cover_url: editBookCover })
    setShowEditBook(false)
  }

  const handleAddChapterToBook = () => {
    if (!selectedBook || !newChapterTitle.trim()) return

    const existingChapters = getChaptersForBook(selectedBook.id)
    const nextNumber = existingChapters.length + 1

    addChapter(selectedBook.id, nextNumber, newChapterTitle.trim())
    setChapters(getChaptersForBook(selectedBook.id))
    setNewChapterTitle('')
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
        setBooks(getBooks())
        if (selectedBook?.id === bookId) {
          setSelectedBook(null)
          setChapters([])
        }
      },
    })
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
        if (selectedBook) {
          setChapters(getChaptersForBook(selectedBook.id))
        }
      },
    })
  }

  const handleEditChapter = (chapter: Chapter) => {
    setEditingChapter(chapter)
    setEditChapterTitle(chapter.title)
  }

  const handleSaveChapter = () => {
    if (!editingChapter || !editChapterTitle.trim()) return
    updateChapter(editingChapter.id, { title: editChapterTitle.trim() })
    if (selectedBook) {
      setChapters(getChaptersForBook(selectedBook.id))
    }
    setEditingChapter(null)
    setEditChapterTitle('')
  }

  const handleMoveChapter = (chapter: Chapter, direction: 'up' | 'down') => {
    const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number)
    const currentIndex = sortedChapters.findIndex(c => c.id === chapter.id)

    if (direction === 'up' && currentIndex > 0) {
      const prevChapter = sortedChapters[currentIndex - 1]
      // Swap chapter numbers
      updateChapter(chapter.id, { chapter_number: prevChapter.chapter_number })
      updateChapter(prevChapter.id, { chapter_number: chapter.chapter_number })
    } else if (direction === 'down' && currentIndex < sortedChapters.length - 1) {
      const nextChapter = sortedChapters[currentIndex + 1]
      // Swap chapter numbers
      updateChapter(chapter.id, { chapter_number: nextChapter.chapter_number })
      updateChapter(nextChapter.id, { chapter_number: chapter.chapter_number })
    }

    if (selectedBook) {
      setChapters(getChaptersForBook(selectedBook.id))
    }
  }

  const toggleChapterExpand = (chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const handleDeleteRecording = (recordingId: string, readerName?: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Opname verwijderen?',
      message: `Weet je zeker dat je de opname${readerName ? ` van ${readerName}` : ''} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
      confirmText: 'Verwijderen',
      onConfirm: () => {
        deleteRecording(recordingId)
        // Force re-render by toggling expand state
        setExpandedChapters(prev => new Set(prev))
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
      // Reset file input
      if (tocFileInputRef.current) {
        tocFileInputRef.current.value = ''
      }
    }
  }

  const handleAddScannedChapters = () => {
    if (!selectedBook || scannedChapters.length === 0) return

    const existingChapters = getChaptersForBook(selectedBook.id)
    const startNumber = existingChapters.length + 1

    // Add all scanned chapters
    scannedChapters.forEach((ch, index) => {
      addChapter(selectedBook.id, startNumber + index, ch.title)
    })

    setChapters(getChaptersForBook(selectedBook.id))
    setScannedChapters([])
  }

  const handleAudioFileSelect = (chapterId: string) => {
    setUploadingChapterId(chapterId)
    audioFileInputRef.current?.click()
  }

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingChapterId) return

    // Check if it's an audio file - check MIME type OR file extension (iOS voice memos may have empty MIME type)
    const hasAudioMimeType = file.type.startsWith('audio/')
    const hasAudioExtension = /\.(mp3|wav|m4a|ogg|webm)$/i.test(file.name)

    if (!hasAudioMimeType && !hasAudioExtension) {
      alert('Selecteer een audiobestand (mp3, wav, m4a, etc.)')
      return
    }

    // Store the file and show reader selection modal
    setPendingAudioFile(file)
    setShowReaderSelectModal(true)

    // Reset file input
    if (audioFileInputRef.current) {
      audioFileInputRef.current.value = ''
    }
  }

  const handleUploadAudioWithReader = async (readerId: string) => {
    if (!pendingAudioFile || !uploadingChapterId) return

    setIsUploadingAudio(true)
    setShowReaderSelectModal(false)

    try {
      // Get audio duration
      const duration = await new Promise<number>((resolve) => {
        const audio = new Audio()
        audio.onloadedmetadata = () => {
          resolve(Math.round(audio.duration))
        }
        audio.onerror = () => resolve(0)
        audio.src = URL.createObjectURL(pendingAudioFile)
      })

      // Replace existing recording or add new one (prevents duplicates)
      await replaceRecordingAsync(uploadingChapterId, readerId, pendingAudioFile, duration)

      // Force re-render
      setExpandedChapters(prev => new Set(prev))
    } catch (error) {
      console.error('Error uploading audio:', error)
      alert('Er ging iets mis bij het uploaden van de audio.')
    } finally {
      setIsUploadingAudio(false)
      setPendingAudioFile(null)
      setUploadingChapterId(null)
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (max 500KB to keep localStorage manageable)
    if (file.size > 500 * 1024) {
      alert('De foto is te groot. Kies een foto kleiner dan 500KB.')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      if (isEdit) {
        setEditReaderPhoto(result)
      } else {
        setNewReaderPhoto(result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAddReader = () => {
    if (!newReaderName.trim()) return
    const user = addUser(newReaderName.trim(), 'reader')
    if (newReaderPhoto) {
      updateUser(user.id, { avatar_url: newReaderPhoto })
    }
    setUsers(getUsers())
    setNewReaderName('')
    setNewReaderPhoto(null)
    setShowAddReader(false)
  }

  const handleEditReader = (user: User) => {
    setSelectedUser(user)
    setEditReaderName(user.name)
    setEditReaderPhoto(user.avatar_url)
    setShowEditReader(true)
  }

  const handleSaveReader = () => {
    if (!selectedUser || !editReaderName.trim()) return
    updateUser(selectedUser.id, {
      name: editReaderName.trim(),
      avatar_url: editReaderPhoto,
    })
    setUsers(getUsers())
    setSelectedUser(null)
    setEditReaderName('')
    setEditReaderPhoto(null)
    setShowEditReader(false)
  }

  const handleDeleteReader = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (user?.role === 'admin') {
      alert('Je kunt geen beheerder verwijderen.')
      return
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Voorlezer verwijderen?',
      message: `Weet je zeker dat je "${user?.name || 'deze voorlezer'}" wilt verwijderen?`,
      confirmText: 'Verwijderen',
      onConfirm: () => {
        deleteUser(userId)
        setUsers(getUsers())
      },
    })
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <Button variant="ghost" onClick={() => navigate('/')} className="!min-w-0 !min-h-0 p-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>
        <h1 className="font-display text-3xl text-cocoa">Beheer</h1>
      </motion.header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          variant={tab === 'books' ? 'primary' : 'ghost'}
          onClick={() => { setTab('books'); setSelectedBook(null) }}
        >
          Boeken
        </Button>
        <Button
          variant={tab === 'readers' ? 'primary' : 'ghost'}
          onClick={() => setTab('readers')}
        >
          Voorlezers
        </Button>
        <Button
          variant={tab === 'stats' ? 'primary' : 'ghost'}
          onClick={() => setTab('stats')}
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Statistieken
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResync}
          disabled={isResyncing}
          className="text-cocoa-light"
        >
          {isResyncing ? (
            <>
              <svg className="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Herstellen...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Herstel data
            </>
          )}
        </Button>
      </div>

      {/* Resync message */}
      {resyncMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-sky-light rounded-xl text-sm text-cocoa"
        >
          {resyncMessage}
        </motion.div>
      )}

      {/* Books Tab */}
      {tab === 'books' && !selectedBook && (
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
                      className="p-2 text-cocoa-light hover:text-sunset transition-colors"
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
      )}

      {/* Book Detail View */}
      {tab === 'books' && selectedBook && !showEditBook && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-2xl"
        >
          <Button
            variant="ghost"
            onClick={() => setSelectedBook(null)}
            className="mb-4"
          >
            ← Terug naar boeken
          </Button>

          <Card hoverable={false} className="p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl text-cocoa mb-1">{selectedBook.title}</h2>
                {selectedBook.author && (
                  <p className="text-cocoa-light mb-1">door {selectedBook.author}</p>
                )}
                <p className="text-cocoa-light text-sm">{chapters.length} hoofdstukken</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleEditBook(selectedBook)}
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
              {[...chapters].sort((a, b) => a.chapter_number - b.chapter_number).map((chapter, index, sortedChapters) => {
                const recordings = getRecordingsForChapter(chapter.id)
                const isExpanded = expandedChapters.has(chapter.id)
                const isEditing = editingChapter?.id === chapter.id

                return (
                  <Card key={chapter.id} hoverable={false} className="overflow-hidden">
                    <div className="p-4 flex items-center gap-3">
                      {/* Chapter number */}
                      <div className="w-10 h-10 rounded-lg bg-sky-light flex items-center justify-center font-display text-cocoa flex-shrink-0">
                        {chapter.chapter_number}
                      </div>

                      {/* Title - editable or static */}
                      {isEditing ? (
                        <div className="flex-1 flex gap-2">
                          <input
                            type="text"
                            value={editChapterTitle}
                            onChange={(e) => setEditChapterTitle(e.target.value)}
                            className="flex-1 px-3 py-1 rounded-lg border-2 border-honey focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveChapter()
                              if (e.key === 'Escape') setEditingChapter(null)
                            }}
                          />
                          <Button variant="primary" size="sm" onClick={handleSaveChapter}>
                            Opslaan
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingChapter(null)}>
                            Annuleren
                          </Button>
                        </div>
                      ) : (
                        <p className="flex-1 text-cocoa">{chapter.title}</p>
                      )}

                      {/* Action buttons */}
                      {!isEditing && (
                        <div className="flex items-center gap-1">
                          {/* Move up */}
                          <button
                            onClick={() => handleMoveChapter(chapter, 'up')}
                            disabled={index === 0}
                            className="p-2 text-cocoa-light hover:text-cocoa disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Omhoog"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>

                          {/* Move down */}
                          <button
                            onClick={() => handleMoveChapter(chapter, 'down')}
                            disabled={index === sortedChapters.length - 1}
                            className="p-2 text-cocoa-light hover:text-cocoa disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Omlaag"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Edit title */}
                          <button
                            onClick={() => handleEditChapter(chapter)}
                            className="p-2 text-cocoa-light hover:text-sky transition-colors"
                            title="Naam wijzigen"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>

                          {/* Show recordings / add audio */}
                          <button
                            onClick={() => toggleChapterExpand(chapter.id)}
                            className={`p-2 transition-colors ${isExpanded ? 'text-sky' : 'text-cocoa-light hover:text-cocoa'}`}
                            title={recordings.length > 0 ? `${recordings.length} opname${recordings.length !== 1 ? 's' : ''}` : 'Audio toevoegen'}
                          >
                            {recordings.length > 0 && (
                              <span className="text-xs font-bold mr-1">{recordings.length}</span>
                            )}
                            <svg className={`w-4 h-4 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              {recordings.length > 0 ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                              )}
                            </svg>
                          </button>

                          {/* Delete chapter */}
                          <button
                            onClick={() => handleDeleteChapter(chapter.id)}
                            className="p-2 text-cocoa-light hover:text-sunset transition-colors"
                            title="Verwijderen"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded recordings list */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-cream-dark bg-cream/50"
                        >
                          <div className="p-4 space-y-2">
                            {recordings.length > 0 && (
                              <>
                                <p className="text-sm text-cocoa-light font-medium mb-2">Opnames:</p>
                                {recordings.map((recording) => {
                                  const reader = users.find(u => u.id === recording.reader_id)
                                  return (
                                    <div key={recording.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                                      <Avatar
                                        src={reader?.avatar_url}
                                        name={reader?.name || 'Onbekend'}
                                        size="sm"
                                      />
                                      <div className="flex-1">
                                        <p className="text-sm text-cocoa">{reader?.name || 'Onbekende voorlezer'}</p>
                                        <p className="text-xs text-cocoa-light">
                                          {recording.duration_seconds > 0
                                            ? `${Math.floor(recording.duration_seconds / 60)}:${(recording.duration_seconds % 60).toString().padStart(2, '0')}`
                                            : 'Duur onbekend'
                                          }
                                        </p>
                                      </div>
                                      <button
                                        onClick={() => handleDeleteRecording(recording.id, reader?.name)}
                                        className="p-2 text-cocoa-light hover:text-sunset transition-colors"
                                        title="Opname verwijderen"
                                      >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  )
                                })}
                              </>
                            )}

                            {/* Add audio button */}
                            <button
                              onClick={() => handleAudioFileSelect(chapter.id)}
                              disabled={isUploadingAudio && uploadingChapterId === chapter.id}
                              className="w-full p-3 border-2 border-dashed border-sky/50 rounded-lg text-sky hover:bg-sky-light/30 transition-colors flex items-center justify-center gap-2"
                            >
                              {isUploadingAudio && uploadingChapterId === chapter.id ? (
                                <>
                                  <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="w-4 h-4 border-2 border-sky border-t-transparent rounded-full"
                                  />
                                  Uploaden...
                                </>
                              ) : (
                                <>
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Audio toevoegen
                                </>
                              )}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* Readers Tab */}
      {tab === 'readers' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-display text-xl text-cocoa">Voorlezers</h2>
            <Button variant="primary" onClick={() => setShowAddReader(true)}>
              + Voorlezer toevoegen
            </Button>
          </div>

          <div className="space-y-3">
            {users.map((user) => (
              <Card key={user.id} className="p-4 flex items-center gap-4">
                <Avatar
                  src={user.avatar_url}
                  name={user.name}
                  size="md"
                />
                <div className="flex-1">
                  <p className="font-display text-lg text-cocoa">{user.name}</p>
                  <p className="text-sm text-cocoa-light">
                    {user.role === 'admin' ? 'Beheerder' : 'Voorlezer'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditReader(user)}
                >
                  Bewerken
                </Button>
                {user.role !== 'admin' && (
                  <button
                    onClick={() => handleDeleteReader(user.id)}
                    className="p-2 text-cocoa-light hover:text-sunset transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-4xl"
        >
          <h2 className="font-display text-xl text-cocoa mb-6">Statistieken</h2>

          {(() => {
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
              <>
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
              </>
            )
          })()}
        </motion.div>
      )}

      {/* Add Book Modal */}
      <AnimatePresence>
        {showAddBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setShowAddBook(false); setNewBookCover(null) }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] shadow-floating p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <h2 className="font-display text-2xl text-cocoa mb-6">Nieuw boek toevoegen</h2>

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
                    className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-cocoa mb-2">
                    Schrijver (optioneel)
                  </label>
                  <input
                    type="text"
                    value={newBookAuthor}
                    onChange={(e) => setNewBookAuthor(e.target.value)}
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
                      onClick={handleSearchCover}
                      disabled={isSearchingCover || !newBookTitle.trim()}
                    >
                      {isSearchingCover ? (
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
                  {newBookCover ? (
                    <div className="flex items-center gap-4 p-3 bg-cream rounded-xl">
                      <img
                        src={newBookCover}
                        alt="Boekomslag"
                        className="w-16 h-20 object-cover rounded-lg shadow-sm"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-cocoa">Cover gevonden</p>
                        <button
                          onClick={() => setNewBookCover(null)}
                          className="text-sm text-sunset hover:underline"
                        >
                          Verwijderen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-cocoa-light">
                      Klik op "Zoek cover" om automatisch een boekomslag te vinden
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-cocoa">
                      Hoofdstukken (één per regel, optioneel)
                    </label>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={searchChaptersOnline}
                      disabled={isSearchingChapters || !newBookTitle.trim()}
                    >
                      {isSearchingChapters ? (
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          Zoek online
                        </>
                      )}
                    </Button>
                  </div>
                  <textarea
                    value={newChaptersText}
                    onChange={(e) => setNewChaptersText(e.target.value)}
                    placeholder={"De ontmoeting\nHet avontuur begint\nEen nieuwe vriend"}
                    rows={8}
                    className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors resize-none"
                  />
                  <p className="text-sm text-cocoa-light mt-2">
                    Tip: Kopieer de inhoudsopgave van het boek, of klik op "Zoek online"
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" onClick={() => { setShowAddBook(false); setNewBookCover(null) }} className="flex-1">
                  Annuleren
                </Button>
                <Button variant="primary" onClick={handleAddBook} className="flex-1">
                  Toevoegen
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Book Modal */}
      <AnimatePresence>
        {showEditBook && selectedBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditBook(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] shadow-floating p-6 max-w-lg w-full"
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
                    <strong>{chapters.length}</strong> hoofdstukken in dit boek.
                    Ga naar het boek overzicht om hoofdstukken toe te voegen of te verwijderen.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" onClick={() => setShowEditBook(false)} className="flex-1">
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

      {/* Add Reader Modal */}
      <AnimatePresence>
        {showAddReader && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddReader(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] shadow-floating p-6 max-w-md w-full"
            >
              <h2 className="font-display text-2xl text-cocoa mb-6">Voorlezer toevoegen</h2>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoSelect(e, false)}
                className="hidden"
              />

              {/* Photo upload */}
              <div className="flex justify-center mb-6">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="relative group"
                >
                  {newReaderPhoto ? (
                    <img
                      src={newReaderPhoto}
                      alt="Preview"
                      className="w-24 h-24 rounded-full object-cover ring-4 ring-cream-dark"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-cream-dark flex items-center justify-center ring-4 ring-cream">
                      <svg className="w-8 h-8 text-cocoa-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </button>
              </div>
              <p className="text-center text-sm text-cocoa-light mb-6">Klik om een foto toe te voegen</p>

              <div>
                <label className="block text-sm font-medium text-cocoa mb-2">
                  Naam
                </label>
                <input
                  type="text"
                  value={newReaderName}
                  onChange={(e) => setNewReaderName(e.target.value)}
                  placeholder="Bijv. Tante Mia"
                  className="w-full px-4 py-3 rounded-xl border-2 border-cream-dark focus:border-honey outline-none transition-colors"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" onClick={() => { setShowAddReader(false); setNewReaderPhoto(null); setNewReaderName('') }} className="flex-1">
                  Annuleren
                </Button>
                <Button variant="primary" onClick={handleAddReader} className="flex-1">
                  Toevoegen
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Reader Modal */}
      <AnimatePresence>
        {showEditReader && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditReader(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] shadow-floating p-6 max-w-md w-full"
            >
              <h2 className="font-display text-2xl text-cocoa mb-6">Voorlezer bewerken</h2>

              <input
                ref={editFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoSelect(e, true)}
                className="hidden"
              />

              {/* Photo upload */}
              <div className="flex justify-center mb-6">
                <button
                  onClick={() => editFileInputRef.current?.click()}
                  className="relative group"
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
                  className="mt-4 text-sm text-sunset hover:underline"
                >
                  Foto verwijderen
                </button>
              )}

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" onClick={() => setShowEditReader(false)} className="flex-1">
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

      {/* Hidden audio file input */}
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm"
        onChange={handleAudioFileChange}
        className="hidden"
      />

      {/* Reader selection modal for audio upload */}
      <AnimatePresence>
        {showReaderSelectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setShowReaderSelectModal(false)
              setPendingAudioFile(null)
              setUploadingChapterId(null)
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[24px] shadow-floating p-6 max-w-md w-full"
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
                    className="w-full p-3 flex items-center gap-3 rounded-xl hover:bg-cream-dark/50 transition-colors"
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
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant="danger"
      />
    </div>
  )
}
