import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, useToast } from '../../components/ui'
import {
  addBook,
  addChapters,
} from '../../lib/storage'
import type { Book } from '../../types'

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

function parseChaptersText(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      return line
        .replace(/^(\d+[\.\:\-\s]+|Hoofdstuk\s+\d+[\.\:\-\s]+)/i, '')
        .trim()
    })
}

interface AddBookModalProps {
  isOpen: boolean
  onClose: () => void
  onBookAdded: () => void
}

export function AddBookModal({ isOpen, onClose, onBookAdded }: AddBookModalProps) {
  const { showToast } = useToast()
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookAuthor, setNewBookAuthor] = useState('')
  const [newBookCover, setNewBookCover] = useState<string | null>(null)
  const [newChaptersText, setNewChaptersText] = useState('')
  const [isSearchingChapters, setIsSearchingChapters] = useState(false)
  const [isSearchingCover, setIsSearchingCover] = useState(false)

  const resetForm = () => {
    setNewBookTitle('')
    setNewBookAuthor('')
    setNewBookCover(null)
    setNewChaptersText('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const searchChaptersOnline = async () => {
    if (!newBookTitle.trim()) {
      showToast('Vul eerst een boektitel in', 'error')
      return
    }

    setIsSearchingChapters(true)

    try {
      const searchTitle = newBookTitle.trim().toLowerCase()
      let chaptersFound: string[] = []

      for (const [bookKey, chapters] of Object.entries(knownBooks)) {
        if (searchTitle.includes(bookKey) || bookKey.includes(searchTitle)) {
          chaptersFound = chapters
          break
        }
      }

      if (chaptersFound.length > 0) {
        setNewChaptersText(chaptersFound.join('\n'))
        setIsSearchingChapters(false)
        return
      }

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
        showToast(`Geen hoofdstukken gevonden voor "${newBookTitle}". Kopieer de inhoudsopgave handmatig.`, 'info', 5000)
      }
    } catch (error) {
      console.error('Error searching for chapters:', error)
      showToast('Er ging iets mis bij het zoeken. Kopieer de inhoudsopgave handmatig.', 'error', 5000)
    } finally {
      setIsSearchingChapters(false)
    }
  }

  const handleSearchCover = async () => {
    if (!newBookTitle.trim()) return

    setIsSearchingCover(true)
    const cover = await searchBookCover(newBookTitle.trim(), newBookAuthor.trim() || undefined)
    if (cover) {
      setNewBookCover(cover)
    }
    setIsSearchingCover(false)
  }

  const handleAddBook = () => {
    if (!newBookTitle.trim()) return

    const chaptersArray = parseChaptersText(newChaptersText)

    const book: Book = addBook(
      newBookTitle.trim(),
      newBookAuthor.trim() || undefined,
      newBookCover || undefined
    )
    if (chaptersArray.length > 0) {
      addChapters(book.id, chaptersArray)
    }

    resetForm()
    onBookAdded()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-[24px] sm:rounded-[24px] shadow-floating p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
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
              <Button variant="ghost" onClick={handleClose} className="flex-1">
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
  )
}
