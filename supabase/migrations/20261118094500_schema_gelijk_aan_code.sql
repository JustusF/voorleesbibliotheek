-- Het live schema liep achter op de code:
-- - books miste author en updated_at (de schrijver stond daardoor in de titel)
-- - recording_locks bestond niet, dus de vergrendeling tegen dubbel opnemen
--   van hetzelfde hoofdstuk deed in productie nooit iets.

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.recording_locks (
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reader_name TEXT NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chapter_id, reader_id)
);

ALTER TABLE public.recording_locks ENABLE ROW LEVEL SECURITY;

-- Een voorlezer zet en haalt zijn eigen slot weg vanuit de browser, dus hier
-- mag de anon-sleutel wel verwijderen. Er staat niets in dat bewaard moet blijven.
DO $$
BEGIN
  CREATE POLICY "recording_locks_alles" ON public.recording_locks
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
