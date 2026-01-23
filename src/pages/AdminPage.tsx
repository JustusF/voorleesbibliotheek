import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Avatar } from '../components/ui'
import {
  getBooks,
  addBook,
  updateBook,
  deleteBook,
  getChaptersForBook,
  addChapter,
  addChapters,
  deleteChapter,
  getUsers,
  addUser,
  deleteUser,
  updateUser,
} from '../lib/storage'
import type { Book, Chapter, User } from '../types'

type Tab = 'books' | 'readers'

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
  const [newChaptersText, setNewChaptersText] = useState('')
  const [isSearchingChapters, setIsSearchingChapters] = useState(false)
  const [editBookTitle, setEditBookTitle] = useState('')
  const [, setEditChaptersText] = useState('')
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newReaderName, setNewReaderName] = useState('')
  const [newReaderPhoto, setNewReaderPhoto] = useState<string | null>(null)
  const [editReaderName, setEditReaderName] = useState('')
  const [editReaderPhoto, setEditReaderPhoto] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

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

    const book = addBook(newBookTitle.trim())
    if (chaptersArray.length > 0) {
      addChapters(book.id, chaptersArray)
    }

    setBooks(getBooks())
    setNewBookTitle('')
    setNewChaptersText('')
    setShowAddBook(false)
  }

  const handleEditBook = (book: Book) => {
    setSelectedBook(book)
    setEditBookTitle(book.title)
    const bookChapters = getChaptersForBook(book.id)
    setEditChaptersText(bookChapters.map(c => c.title).join('\n'))
    setShowEditBook(true)
  }

  const handleSaveBook = () => {
    if (!selectedBook || !editBookTitle.trim()) return

    // Update book title
    updateBook(selectedBook.id, { title: editBookTitle.trim() })

    setBooks(getBooks())
    setSelectedBook({ ...selectedBook, title: editBookTitle.trim() })
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
    if (confirm('Weet je zeker dat je dit boek wilt verwijderen? Alle hoofdstukken en opnames worden ook verwijderd.')) {
      deleteBook(bookId)
      setBooks(getBooks())
      if (selectedBook?.id === bookId) {
        setSelectedBook(null)
        setChapters([])
      }
    }
  }

  const handleDeleteChapter = (chapterId: string) => {
    if (confirm('Weet je zeker dat je dit hoofdstuk wilt verwijderen?')) {
      deleteChapter(chapterId)
      if (selectedBook) {
        setChapters(getChaptersForBook(selectedBook.id))
      }
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
    if (confirm('Weet je zeker dat je deze voorlezer wilt verwijderen?')) {
      deleteUser(userId)
      setUsers(getUsers())
    }
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
      <div className="flex gap-2 mb-8">
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
      </div>

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
                <h2 className="font-display text-2xl text-cocoa mb-2">{selectedBook.title}</h2>
                <p className="text-cocoa-light">{chapters.length} hoofdstukken</p>
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
            <div className="flex gap-3">
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
          </Card>

          {chapters.length === 0 ? (
            <Card hoverable={false} className="p-6 text-center">
              <p className="text-cocoa-light">Geen hoofdstukken toegevoegd.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {chapters.map((chapter) => (
                <Card key={chapter.id} className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-sky-light flex items-center justify-center font-display text-cocoa">
                    {chapter.chapter_number}
                  </div>
                  <p className="flex-1 text-cocoa">{chapter.title}</p>
                  <button
                    onClick={() => handleDeleteChapter(chapter.id)}
                    className="p-2 text-cocoa-light hover:text-sunset transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </Card>
              ))}
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

      {/* Add Book Modal */}
      <AnimatePresence>
        {showAddBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowAddBook(false)}
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
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-cocoa">
                      Hoofdstukken (één per regel)
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
                <Button variant="ghost" onClick={() => setShowAddBook(false)} className="flex-1">
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
    </div>
  )
}
