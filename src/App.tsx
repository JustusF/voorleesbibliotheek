import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { HomePage, ListenPage, ReadPage, AdminPage } from './pages'
import { syncFromSupabase, isSupabaseConfigured } from './lib/storage'

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline'

function SyncIndicator({ status }: { status: SyncStatus }) {
  if (status === 'idle') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-4 right-4 z-50"
        role="status"
        aria-live="polite"
      >
        <div className={`
          flex items-center gap-2 px-4 py-2 rounded-full shadow-soft text-sm
          ${status === 'syncing' ? 'bg-sky-light text-cocoa' : ''}
          ${status === 'success' ? 'bg-moss text-white' : ''}
          ${status === 'error' ? 'bg-sunset text-white' : ''}
          ${status === 'offline' ? 'bg-cream-dark text-cocoa-light' : ''}
        `}>
          {status === 'syncing' && (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-cocoa border-t-transparent rounded-full"
              />
              <span>Synchroniseren...</span>
            </>
          )}
          {status === 'success' && (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Gesynchroniseerd</span>
            </>
          )}
          {status === 'error' && (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Sync mislukt</span>
            </>
          )}
          {status === 'offline' && (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
              </svg>
              <span>Offline modus</span>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setSyncStatus('idle')
    }
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Sync data from Supabase on app start
  useEffect(() => {
    if (!isOnline || !isSupabaseConfigured) return

    setSyncStatus('syncing')
    syncFromSupabase()
      .then(() => {
        setSyncStatus('success')
        // Hide success message after 2 seconds
        setTimeout(() => setSyncStatus('idle'), 2000)
      })
      .catch((error) => {
        console.error('Sync failed:', error)
        setSyncStatus('error')
        // Hide error after 3 seconds
        setTimeout(() => setSyncStatus('idle'), 3000)
      })
  }, [isOnline])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/luisteren" element={<ListenPage />} />
        <Route path="/voorlezen" element={<ReadPage />} />
        <Route path="/beheer" element={<AdminPage />} />
      </Routes>
      <SyncIndicator status={syncStatus} />
    </BrowserRouter>
  )
}

export default App
