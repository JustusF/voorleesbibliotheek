export interface Family {
  id: string
  name: string
  created_at: string
}

export interface User {
  id: string
  family_id: string
  name: string
  avatar_url: string | null
  role: 'admin' | 'reader' | 'listener'
  invite_code: string | null
  created_at: string
}

export interface Book {
  id: string
  family_id: string
  title: string
  cover_url: string | null
  created_at: string
}

export interface Chapter {
  id: string
  book_id: string
  chapter_number: number
  title: string
  created_at: string
}

export interface Recording {
  id: string
  chapter_id: string
  reader_id: string
  audio_url: string
  duration_seconds: number
  created_at: string
  reader?: User
}

export interface BookWithChapters extends Book {
  chapters: Chapter[]
}

export interface ChapterWithRecordings extends Chapter {
  recordings: Recording[]
}
