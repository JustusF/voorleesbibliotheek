import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Avatar } from '../../components/ui'
import {
  getRecordingsForChapter,
  updateChapter,
} from '../../lib/storage'
import type { Chapter, User } from '../../types'

interface ChapterItemProps {
  chapter: Chapter
  index: number
  totalCount: number
  users: User[]
  isUploadingAudio: boolean
  uploadingChapterId: string | null
  onDelete: (chapterId: string) => void
  onMove: (chapter: Chapter, direction: 'up' | 'down') => void
  onAudioFileSelect: (chapterId: string) => void
  onDeleteRecording: (recordingId: string, readerName?: string) => void
}

export function ChapterItem({
  chapter,
  index,
  totalCount,
  users,
  isUploadingAudio,
  uploadingChapterId,
  onDelete,
  onMove,
  onAudioFileSelect,
  onDeleteRecording,
}: ChapterItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')

  const recordings = getRecordingsForChapter(chapter.id)

  const handleEditChapter = () => {
    setIsEditing(true)
    setEditTitle(chapter.title)
  }

  const handleSaveChapter = () => {
    if (!editTitle.trim()) return
    updateChapter(chapter.id, { title: editTitle.trim() })
    setIsEditing(false)
    setEditTitle('')
  }

  return (
    <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
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
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="flex-1 px-3 py-1 rounded-lg border-2 border-honey focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveChapter()
                if (e.key === 'Escape') setIsEditing(false)
              }}
            />
            <Button variant="primary" size="sm" onClick={handleSaveChapter}>
              Opslaan
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
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
              onClick={() => onMove(chapter, 'up')}
              disabled={index === 0}
              className="p-2 text-cocoa-light hover:text-cocoa disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Omhoog"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>

            {/* Move down */}
            <button
              onClick={() => onMove(chapter, 'down')}
              disabled={index === totalCount - 1}
              className="p-2 text-cocoa-light hover:text-cocoa disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Omlaag"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Edit title */}
            <button
              onClick={handleEditChapter}
              className="p-2 text-cocoa-light hover:text-sky transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Naam wijzigen"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            {/* Show recordings / add audio */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`p-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${isExpanded ? 'text-sky' : 'text-cocoa-light hover:text-cocoa'}`}
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
              onClick={() => onDelete(chapter.id)}
              className="p-2 text-cocoa-light hover:text-sunset transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                          onClick={() => onDeleteRecording(recording.id, reader?.name)}
                          className="p-2 text-cocoa-light hover:text-sunset transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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
                onClick={() => onAudioFileSelect(chapter.id)}
                disabled={isUploadingAudio && uploadingChapterId === chapter.id}
                className="w-full p-3 border-2 border-dashed border-sky/50 rounded-lg text-sky hover:bg-sky-light/30 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
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
    </div>
  )
}
