import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { getUsers, forceResyncFromSupabase } from '../lib/storage'
import { PinGate, isSessionValid, refreshSession } from './admin/PinGate'
import { BookManager } from './admin/BookManager'
import { ReaderManager } from './admin/ReaderManager'
import { StatsPanel } from './admin/StatsPanel'
import type { User } from '../types'

type Tab = 'books' | 'readers' | 'stats'

export function AdminPage() {
  const navigate = useNavigate()
  const [isUnlocked, setIsUnlocked] = useState(() => isSessionValid())
  const [tab, setTab] = useState<Tab>('books')
  const [users, setUsers] = useState<User[]>(() => getUsers())
  const [isResyncing, setIsResyncing] = useState(false)
  const [resyncMessage, setResyncMessage] = useState<string | null>(null)

  // Session timeout: check every 60 seconds and on user interaction
  useEffect(() => {
    if (!isUnlocked) return

    const checkSession = () => {
      if (!isSessionValid()) {
        setIsUnlocked(false)
      }
    }

    const interval = setInterval(checkSession, 60 * 1000)
    return () => clearInterval(interval)
  }, [isUnlocked])

  // Refresh session timestamp on user interactions
  const handleUserActivity = useCallback(() => {
    if (isUnlocked) {
      refreshSession()
    }
  }, [isUnlocked])

  useEffect(() => {
    if (!isUnlocked) return

    const events = ['click', 'keydown', 'scroll', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true })
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity)
      })
    }
  }, [isUnlocked, handleUserActivity])

  const handleResync = async () => {
    setIsResyncing(true)
    setResyncMessage(null)
    try {
      const result = await forceResyncFromSupabase()
      setResyncMessage(result.message)
      setUsers(getUsers())
    } catch (error) {
      setResyncMessage('Fout bij hersynchroniseren: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsResyncing(false)
      setTimeout(() => setResyncMessage(null), 5000)
    }
  }

  const refreshUsers = () => {
    setUsers(getUsers())
  }

  if (!isUnlocked) {
    return <PinGate onUnlock={() => setIsUnlocked(true)} />
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
          onClick={() => setTab('books')}
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

      {/* Tab content */}
      {tab === 'books' && (
        <BookManager users={users} onBooksChanged={refreshUsers} />
      )}

      {tab === 'readers' && (
        <ReaderManager onUsersChanged={refreshUsers} />
      )}

      {tab === 'stats' && (
        <StatsPanel />
      )}
    </div>
  )
}
