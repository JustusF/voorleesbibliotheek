import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getStorageUsage, formatBytes, cleanupOldRecordings } from '../lib/storageQuota'

export function StorageWarning() {
  const [show, setShow] = useState(false)
  const [usage, setUsage] = useState({ used: 0, available: 0, percentage: 0, nearLimit: false, criticalLevel: false })

  useEffect(() => {
    const checkStorage = () => {
      const storageUsage = getStorageUsage()
      setUsage(storageUsage)
      setShow(storageUsage.nearLimit || storageUsage.criticalLevel)
    }

    // Check on mount
    checkStorage()

    // Check every 30 seconds
    const interval = setInterval(checkStorage, 30000)

    return () => clearInterval(interval)
  }, [])


  if (!show) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md ${
          usage.criticalLevel ? 'bg-red-50 border-red-400' : 'bg-yellow-50 border-yellow-400'
        } border-2 rounded-[16px] p-4 shadow-lg`}
      >
        <div className="flex items-start gap-3">
          <svg
            className={`w-6 h-6 flex-shrink-0 ${usage.criticalLevel ? 'text-red-500' : 'text-yellow-600'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>

          <div className="flex-1">
            <h3 className={`font-semibold ${usage.criticalLevel ? 'text-red-800' : 'text-yellow-800'}`}>
              {usage.criticalLevel ? 'Opslag bijna vol!' : 'Opslag loopt vol'}
            </h3>
            <p className={`text-sm mt-1 ${usage.criticalLevel ? 'text-red-700' : 'text-yellow-700'}`}>
              {formatBytes(usage.used)} gebruikt van {formatBytes(usage.used + usage.available)}
              ({Math.round(usage.percentage * 100)}%)
            </p>
            {usage.criticalLevel && (
              <p className="text-sm text-red-600 mt-2 font-medium">
                ⚠️ Nieuwe opnames worden geblokkeerd. Ga naar Admin → verwijder oude opnames.
              </p>
            )}
            {!usage.criticalLevel && usage.nearLimit && (
              <p className="text-sm text-yellow-700 mt-2">
                Verwijder oude opnames via de Admin pagina om ruimte te maken.
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShow(false)}
                className="px-3 py-1.5 bg-white rounded-lg text-sm font-medium hover:bg-opacity-80 transition-colors"
                style={{ color: usage.criticalLevel ? '#DC2626' : '#D97706' }}
              >
                Begrepen
              </button>
            </div>
          </div>

          <button
            onClick={() => setShow(false)}
            className="w-6 h-6 flex-shrink-0 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
