-- Voorleesbibliotheek Database Schema
-- Voer dit script uit in de Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (voorlezers en beheerders)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id TEXT NOT NULL DEFAULT '1',
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'admin', 'listener')),
  invite_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Books table
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id TEXT NOT NULL DEFAULT '1',
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chapters table
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Progress tracking table
CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  playback_position FLOAT DEFAULT 0,
  duration FLOAT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  last_played TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chapter_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_recordings_chapter_id ON recordings(chapter_id);
CREATE INDEX IF NOT EXISTS idx_recordings_reader_id ON recordings(reader_id);
CREATE INDEX IF NOT EXISTS idx_progress_chapter_id ON progress(chapter_id);

-- Insert default users for Familie Van Rij
INSERT INTO users (id, family_id, name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', '1', 'Tantanne', 'reader'),
  ('00000000-0000-0000-0000-000000000002', '1', 'Bomma', 'reader'),
  ('00000000-0000-0000-0000-000000000003', '1', 'Gro', 'reader'),
  ('00000000-0000-0000-0000-000000000004', '1', 'Oma Magda', 'reader'),
  ('00000000-0000-0000-0000-000000000005', '1', 'Opa Hans', 'reader'),
  ('00000000-0000-0000-0000-000000000006', '1', 'Papa', 'admin'),
  ('00000000-0000-0000-0000-000000000007', '1', 'Mama', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for this family app, we allow all access)
-- In a production app, you'd want more restrictive policies based on auth

CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to books" ON books FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to chapters" ON chapters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to recordings" ON recordings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to progress" ON progress FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to audio bucket
CREATE POLICY "Allow public read access to audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio');

CREATE POLICY "Allow public insert to audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Allow public update to audio" ON storage.objects
  FOR UPDATE USING (bucket_id = 'audio');

CREATE POLICY "Allow public delete from audio" ON storage.objects
  FOR DELETE USING (bucket_id = 'audio');

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
-- Enable realtime for all tables to allow multi-device sync
ALTER PUBLICATION supabase_realtime ADD TABLE books;
ALTER PUBLICATION supabase_realtime ADD TABLE chapters;
ALTER PUBLICATION supabase_realtime ADD TABLE recordings;
ALTER PUBLICATION supabase_realtime ADD TABLE progress;
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION HELPER (run if table already exists without author column)
-- ============================================
-- ALTER TABLE books ADD COLUMN IF NOT EXISTS author TEXT;
-- ALTER TABLE books ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
