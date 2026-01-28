import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { HomePage, ListenPage, ReadPage, AdminPage } from './pages'
import { AppProvider, useSyncStatus } from './context/AppContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { StorageWarning } from './components/StorageWarning'

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline'

function SyncIndicator({ status, isOnline }: { status: SyncStatus; isOnline: boolean }) {
  const displayStatus = !isOnline ? 'offline' : status

  if (displayStatus === 'idle') return null

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
          ${displayStatus === 'syncing' ? 'bg-sky-light text-cocoa' : ''}
          ${displayStatus === 'success' ? 'bg-moss text-white' : ''}
          ${displayStatus === 'error' ? 'bg-sunset text-white' : ''}
          ${displayStatus === 'offline' ? 'bg-cream-dark text-cocoa-light' : ''}
        `}>
          {displayStatus === 'syncing' && (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-cocoa border-t-transparent rounded-full"
              />
              <span>Synchroniseren...</span>
            </>
          )}
          {displayStatus === 'success' && (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Gesynchroniseerd</span>
            </>
          )}
          {displayStatus === 'error' && (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Sync mislukt</span>
            </>
          )}
          {displayStatus === 'offline' && (
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

function AppContent() {
  const { isOnline, syncStatus } = useSyncStatus()

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/luisteren" element={<ListenPage />} />
        <Route path="/voorlezen" element={<ReadPage />} />
        <Route path="/beheer" element={<AdminPage />} />
      </Routes>
      <SyncIndicator status={syncStatus} isOnline={isOnline} />
    </>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <StorageWarning />
          <AppContent />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
