import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react'
import {
  getBooksAsync,
  getUsersAsync,
  getChaptersAsync,
  getRecordingsAsync,
  getBooks,
  getUsers,
  getChapters,
  getRecordings,
  getProgress,
  type ChapterProgress,
  isSupabaseConfigured,
  subscribeToBooks,
  subscribeToChapters,
  subscribeToRecordings,
  subscribeToProgress,
} from '../lib/storage'
import type { Book, Chapter, Recording, User } from '../types'

// ============================================
// STATE TYPES
// ============================================

interface AppState {
  // Data
  books: Book[]
  chapters: Chapter[]
  recordings: Recording[]
  users: User[]
  progress: Record<string, ChapterProgress>

  // Loading states
  isLoading: boolean
  isInitialized: boolean

  // Error state
  error: AppError | null

  // Network state
  isOnline: boolean
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
}

interface AppError {
  message: string
  code?: string
  timestamp: Date
}

// ============================================
// ACTIONS
// ============================================

type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_INITIALIZED' }
  | { type: 'SET_ERROR'; payload: AppError | null }
  | { type: 'SET_ONLINE'; payload: boolean }
  | { type: 'SET_SYNC_STATUS'; payload: AppState['syncStatus'] }
  | { type: 'SET_BOOKS'; payload: Book[] }
  | { type: 'SET_CHAPTERS'; payload: Chapter[] }
  | { type: 'SET_RECORDINGS'; payload: Recording[] }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_PROGRESS'; payload: Record<string, ChapterProgress> }
  | { type: 'ADD_BOOK'; payload: Book }
  | { type: 'UPDATE_BOOK'; payload: Book }
  | { type: 'DELETE_BOOK'; payload: string }
  | { type: 'ADD_CHAPTER'; payload: Chapter }
  | { type: 'DELETE_CHAPTER'; payload: string }
  | { type: 'ADD_RECORDING'; payload: Recording }
  | { type: 'DELETE_RECORDING'; payload: string }
  | { type: 'UPDATE_PROGRESS'; payload: { chapterId: string; progress: ChapterProgress } }

// ============================================
// REDUCER
// ============================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }

    case 'SET_INITIALIZED':
      return { ...state, isInitialized: true, isLoading: false }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'SET_ONLINE':
      return { ...state, isOnline: action.payload }

    case 'SET_SYNC_STATUS':
      return { ...state, syncStatus: action.payload }

    case 'SET_BOOKS':
      return { ...state, books: action.payload }

    case 'SET_CHAPTERS':
      return { ...state, chapters: action.payload }

    case 'SET_RECORDINGS':
      return { ...state, recordings: action.payload }

    case 'SET_USERS':
      return { ...state, users: action.payload }

    case 'SET_PROGRESS':
      return { ...state, progress: action.payload }

    case 'ADD_BOOK':
      return { ...state, books: [action.payload, ...state.books] }

    case 'UPDATE_BOOK':
      return {
        ...state,
        books: state.books.map((b) => (b.id === action.payload.id ? action.payload : b)),
      }

    case 'DELETE_BOOK':
      return {
        ...state,
        books: state.books.filter((b) => b.id !== action.payload),
        chapters: state.chapters.filter((c) => c.book_id !== action.payload),
      }

    case 'ADD_CHAPTER':
      return { ...state, chapters: [...state.chapters, action.payload] }

    case 'DELETE_CHAPTER':
      return {
        ...state,
        chapters: state.chapters.filter((c) => c.id !== action.payload),
        recordings: state.recordings.filter((r) => r.chapter_id !== action.payload),
      }

    case 'ADD_RECORDING':
      return { ...state, recordings: [action.payload, ...state.recordings] }

    case 'DELETE_RECORDING':
      return {
        ...state,
        recordings: state.recordings.filter((r) => r.id !== action.payload),
      }

    case 'UPDATE_PROGRESS':
      return {
        ...state,
        progress: {
          ...state.progress,
          [action.payload.chapterId]: action.payload.progress,
        },
      }

    default:
      return state
  }
}

// ============================================
// INITIAL STATE
// ============================================

const initialState: AppState = {
  books: [],
  chapters: [],
  recordings: [],
  users: [],
  progress: {},
  isLoading: true,
  isInitialized: false,
  error: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncStatus: 'idle',
}

// ============================================
// CONTEXT
// ============================================

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>

  // Selectors (computed values)
  getBookById: (id: string) => Book | undefined
  getChaptersForBook: (bookId: string) => Chapter[]
  getRecordingsForChapter: (chapterId: string) => Recording[]
  getUserById: (id: string) => User | undefined
  getReaders: () => User[]
  getChapterProgress: (chapterId: string) => ChapterProgress | undefined

  // Actions
  refreshData: () => Promise<void>
  clearError: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // ---- Selectors ----
  const getBookById = useCallback(
    (id: string) => state.books.find((b) => b.id === id),
    [state.books]
  )

  const getChaptersForBook = useCallback(
    (bookId: string) =>
      state.chapters
        .filter((c) => c.book_id === bookId)
        .sort((a, b) => a.chapter_number - b.chapter_number),
    [state.chapters]
  )

  const getRecordingsForChapter = useCallback(
    (chapterId: string) => state.recordings.filter((r) => r.chapter_id === chapterId),
    [state.recordings]
  )

  const getUserById = useCallback(
    (id: string) => state.users.find((u) => u.id === id),
    [state.users]
  )

  const getReaders = useCallback(
    () => state.users.filter((u) => u.role === 'reader' || u.role === 'admin'),
    [state.users]
  )

  const getChapterProgress = useCallback(
    (chapterId: string) => state.progress[chapterId],
    [state.progress]
  )

  // ---- Actions ----
  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null })
  }, [])

  const refreshData = useCallback(async () => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' })

    try {
      if (isSupabaseConfigured) {
        const [books, chapters, recordings, users] = await Promise.all([
          getBooksAsync(),
          getChaptersAsync(),
          getRecordingsAsync(),
          getUsersAsync(),
        ])

        dispatch({ type: 'SET_BOOKS', payload: books })
        dispatch({ type: 'SET_CHAPTERS', payload: chapters })
        dispatch({ type: 'SET_RECORDINGS', payload: recordings })
        dispatch({ type: 'SET_USERS', payload: users })
      } else {
        // Fallback to localStorage
        dispatch({ type: 'SET_BOOKS', payload: getBooks() })
        dispatch({ type: 'SET_CHAPTERS', payload: getChapters() })
        dispatch({ type: 'SET_RECORDINGS', payload: getRecordings() })
        dispatch({ type: 'SET_USERS', payload: getUsers() })
      }

      dispatch({ type: 'SET_PROGRESS', payload: getProgress() })
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' })

      // Reset sync status after delay
      setTimeout(() => {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' })
      }, 2000)
    } catch (error) {
      console.error('Failed to refresh data:', error)
      dispatch({
        type: 'SET_ERROR',
        payload: {
          message: 'Kon gegevens niet laden. Probeer het opnieuw.',
          timestamp: new Date(),
        },
      })
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' })

      // Reset sync status after delay
      setTimeout(() => {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' })
      }, 3000)
    }
  }, [])

  // ---- Initialize Data ----
  useEffect(() => {
    const initializeData = async () => {
      // First load from localStorage for instant display
      dispatch({ type: 'SET_BOOKS', payload: getBooks() })
      dispatch({ type: 'SET_CHAPTERS', payload: getChapters() })
      dispatch({ type: 'SET_RECORDINGS', payload: getRecordings() })
      dispatch({ type: 'SET_USERS', payload: getUsers() })
      dispatch({ type: 'SET_PROGRESS', payload: getProgress() })

      // Then sync from Supabase in background
      if (isSupabaseConfigured && state.isOnline) {
        await refreshData()
      }

      dispatch({ type: 'SET_INITIALIZED' })
    }

    initializeData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Online/Offline Tracking ----
  useEffect(() => {
    const handleOnline = () => {
      dispatch({ type: 'SET_ONLINE', payload: true })
      refreshData() // Sync when back online
    }

    const handleOffline = () => {
      dispatch({ type: 'SET_ONLINE', payload: false })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshData])

  // ---- Real-time Subscriptions ----
  useEffect(() => {
    if (!isSupabaseConfigured) return

    const unsubscribers: ((() => void) | null)[] = []

    // Subscribe to books changes
    unsubscribers.push(
      subscribeToBooks((payload) => {
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_BOOK', payload: payload.new })
        } else if (payload.eventType === 'UPDATE') {
          dispatch({ type: 'UPDATE_BOOK', payload: payload.new })
        } else if (payload.eventType === 'DELETE' && payload.old) {
          dispatch({ type: 'DELETE_BOOK', payload: payload.old.id })
        }
      })
    )

    // Subscribe to chapters changes
    unsubscribers.push(
      subscribeToChapters((payload) => {
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_CHAPTER', payload: payload.new })
        } else if (payload.eventType === 'DELETE' && payload.old) {
          dispatch({ type: 'DELETE_CHAPTER', payload: payload.old.id })
        }
      })
    )

    // Subscribe to recordings changes
    unsubscribers.push(
      subscribeToRecordings((payload) => {
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_RECORDING', payload: payload.new })
        } else if (payload.eventType === 'DELETE' && payload.old) {
          dispatch({ type: 'DELETE_RECORDING', payload: payload.old.id })
        }
      })
    )

    // Subscribe to progress changes
    unsubscribers.push(
      subscribeToProgress((payload) => {
        if (payload.new) {
          dispatch({
            type: 'UPDATE_PROGRESS',
            payload: {
              chapterId: payload.new.chapterId,
              progress: payload.new,
            },
          })
        }
      })
    )

    return () => {
      unsubscribers.forEach((unsub) => unsub?.())
    }
  }, [])

  const value: AppContextValue = {
    state,
    dispatch,
    getBookById,
    getChaptersForBook,
    getRecordingsForChapter,
    getUserById,
    getReaders,
    getChapterProgress,
    refreshData,
    clearError,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// ============================================
// HOOK
// ============================================

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

// Convenience hooks for specific data
export function useBooks() {
  const { state } = useApp()
  return state.books
}

export function useUsers() {
  const { state } = useApp()
  return state.users
}

export function useReaders() {
  const { getReaders } = useApp()
  return getReaders()
}

export function useSyncStatus() {
  const { state } = useApp()
  return {
    isOnline: state.isOnline,
    syncStatus: state.syncStatus,
    isLoading: state.isLoading,
  }
}
