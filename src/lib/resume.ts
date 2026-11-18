import {
  getBooks,
  getChapters,
  getChapterWithRecordings,
  getProgress,
  getRecordingsForReader,
  getUsers,
} from './storage'
import type { ChapterProgress } from './storage'
import type { Book, Chapter, Recording, User } from '../types'

export interface PlayableChapter {
  book: Book
  chapter: Chapter
  recording: Recording
  reader: User
}

export interface ResumeItem extends PlayableChapter {
  /** Seconds already listened; 0 when this is the next, not yet started chapter */
  currentTime: number
  /** True when the previous chapter was finished and this is the one after it */
  isNextChapter: boolean
}

/** Resolve a chapter to something the player can start, or null if there is no recording. */
export function resolvePlayableChapter(
  chapterId: string,
  preferredRecordingId?: string
): PlayableChapter | null {
  const chapterData = getChapterWithRecordings(chapterId)
  if (!chapterData || chapterData.recordings.length === 0) return null

  const recording =
    chapterData.recordings.find(r => r.id === preferredRecordingId) ?? chapterData.recordings[0]
  const reader = getUsers().find(u => u.id === recording.reader_id)
  const book = getBooks().find(b => b.id === chapterData.book_id)
  if (!reader || !book) return null

  const { recordings: _recordings, ...chapter } = chapterData
  void _recordings
  return { book, chapter, recording, reader }
}

/**
 * Where should this listener pick up? The chapter they were in the middle of,
 * or the chapter after the one they finished last.
 */
export function getResumeItem(listenerId: string): ResumeItem | null {
  const latest = Object.entries(getProgress(listenerId))
    .filter(([, p]: [string, ChapterProgress]) => p.completed || p.currentTime > 5)
    .sort(([, a], [, b]) => (b.lastPlayed || '').localeCompare(a.lastPlayed || ''))[0]
  if (!latest) return null

  const [chapterId, progress] = latest

  if (!progress.completed) {
    const playable = resolvePlayableChapter(chapterId, progress.recordingId)
    return playable ? { ...playable, currentTime: progress.currentTime, isNextChapter: false } : null
  }

  const finished = getChapters().find(c => c.id === chapterId)
  if (!finished) return null

  const later = getChapters()
    .filter(c => c.book_id === finished.book_id && c.chapter_number > finished.chapter_number)
    .sort((a, b) => a.chapter_number - b.chapter_number)

  for (const chapter of later) {
    const playable = resolvePlayableChapter(chapter.id)
    if (playable) return { ...playable, currentTime: 0, isNextChapter: true }
  }
  return null
}

/** The book a reader recorded for most recently, so they can carry on with it. */
export function getLastBookForReader(readerId: string): Book | null {
  const latest = getRecordingsForReader(readerId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
  if (!latest) return null

  const chapter = getChapters().find(c => c.id === latest.chapter_id)
  if (!chapter) return null
  return getBooks().find(b => b.id === chapter.book_id) ?? null
}

const READER_KEY = 'voorleesbibliotheek_reader'

export function rememberReader(readerId: string | null): void {
  if (readerId) localStorage.setItem(READER_KEY, readerId)
  else localStorage.removeItem(READER_KEY)
}

/** Reader from a personal link (?wie=<id>) or the one this device used last. */
export function getKnownReader(search: string): User | null {
  const id = new URLSearchParams(search).get('wie') ?? localStorage.getItem(READER_KEY)
  if (!id) return null
  return getUsers().find(u => u.id === id && (u.role === 'reader' || u.role === 'admin')) ?? null
}

export function readerLink(readerId: string): string {
  return `${window.location.origin}/voorlezen?wie=${readerId}`
}
