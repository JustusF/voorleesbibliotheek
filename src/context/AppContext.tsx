import { createContext, useContext, useReducer, useEffect, useCallback, useMemo, type ReactNode } from 'react'
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
  type SyncError,
  isSupabaseConfigured,
  setSyncErrorHandler,
  subscribeToBooks,
  subscribeToChapters,
  subscribeToRecordings,
  subscribeToProgress,
  syncFromSupabase,
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
  syncErrors: SyncError[]

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
  | { type: 'ADD_SYNC_ERROR'; payload: SyncError }
  | { type: 'CLEAR_SYNC_ERRORS' }

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

    case 'ADD_SYNC_ERROR':
      // Keep max 10 errors, deduplicate by message
      if (state.syncErrors.some(e => e.message === action.payload.message)) return state
      return {
        ...state,
        syncErrors: [...state.syncErrors, action.payload].slice(-10),
      }

    case 'CLEAR_SYNC_ERRORS':
      return { ...state, syncErrors: [] }

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
  syncErrors: [],
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
  clearSyncErrors: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

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

  const clearSyncErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_SYNC_ERRORS' })
  }, [])

  // Wire up sync error handler from storage layer
  useEffect(() => {
    setSyncErrorHandler((error) => {
      dispatch({ type: 'ADD_SYNC_ERROR', payload: error })
    })
    return () => setSyncErrorHandler(null)
  }, [])

  const refreshData = useCallback(async () => {
    dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' })

    try {
      if (isSupabaseConfigured) {
        const [books, chapters, recordings, users] = await retryWithBackoff(() =>
          Promise.all([
            getBooksAsync(),
            getChaptersAsync(),
            getRecordingsAsync(),
            getUsersAsync(),
          ])
        )

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

      setTimeout(() => {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' })
      }, 2000)
    } catch (error) {
      console.error('Failed to refresh data:', error)

      // Fallback to localStorage on failure
      dispatch({ type: 'SET_BOOKS', payload: getBooks() })
      dispatch({ type: 'SET_CHAPTERS', payload: getChapters() })
      dispatch({ type: 'SET_RECORDINGS', payload: getRecordings() })
      dispatch({ type: 'SET_USERS', payload: getUsers() })
      dispatch({ type: 'SET_PROGRESS', payload: getProgress() })

      dispatch({
        type: 'SET_ERROR',
        payload: {
          message: 'Kon niet synchroniseren. Lokale gegevens worden getoond.',
          timestamp: new Date(),
        },
      })
      dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' })

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

      // Sync from Supabase (source of truth) - this updates localStorage
      if (isSupabaseConfigured && state.isOnline) {
        dispatch({ type: 'SET_SYNC_STATUS', payload: 'syncing' })
        try {
          await retryWithBackoff(() => syncFromSupabase(), 2, 1000)
          // Reload data from localStorage (now updated with Supabase data)
          dispatch({ type: 'SET_BOOKS', payload: getBooks() })
          dispatch({ type: 'SET_CHAPTERS', payload: getChapters() })
          dispatch({ type: 'SET_RECORDINGS', payload: getRecordings() })
          dispatch({ type: 'SET_USERS', payload: getUsers() })
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'success' })
          setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 2000)
        } catch (error) {
          console.error('Failed to sync from Supabase:', error)
          dispatch({ type: 'SET_SYNC_STATUS', payload: 'error' })
          setTimeout(() => dispatch({ type: 'SET_SYNC_STATUS', payload: 'idle' }), 3000)
        }
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
    clearSyncErrors,
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
  const { state } = useApp()
  return useMemo(
    () => state.users.filter((u) => u.role === 'reader' || u.role === 'admin'),
    [state.users]
  )
}

export function useSyncStatus() {
  const { state } = useApp()
  return useMemo(() => ({
    isOnline: state.isOnline,
    syncStatus: state.syncStatus,
    isLoading: state.isLoading,
  }), [state.isOnline, state.syncStatus, state.isLoading])
}

export function useSyncErrors() {
  const { state, clearSyncErrors } = useApp()
  return { syncErrors: state.syncErrors, clearSyncErrors }
}
