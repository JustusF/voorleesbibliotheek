-- Bezoekers (anon-sleutel, staat in de publieke bundel) mogen lezen, toevoegen
-- en bijwerken, maar niets meer verwijderen. Verwijderen loopt al via
-- api/admin-mutations.ts met de service-sleutel achter de beheer-pincode.
--
-- Tot nu toe stond op elke tabel en op de audio-bucket een policy
-- "FOR ALL USING (true)": iedereen met de site-URL kon alle opnames wissen.
--
-- Idempotent: ruimt eerst alle bestaande policies op deze tabellen op, wat de
-- namen ook zijn (het live schema wijkt af van supabase-setup.sql).

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'books', 'chapters', 'recordings', 'progress']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    FOR p IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_lezen', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (true)', t || '_toevoegen', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t || '_bijwerken', t);
  END LOOP;
END $$;

-- Audio-bucket: zelfde regel. UPDATE blijft, want uploads gebruiken upsert.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (coalesce(qual, '') LIKE '%audio%' OR coalesce(with_check, '') LIKE '%audio%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;

  CREATE POLICY "audio_lezen" ON storage.objects
    FOR SELECT USING (bucket_id = 'audio');
  CREATE POLICY "audio_toevoegen" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'audio');
  CREATE POLICY "audio_bijwerken" ON storage.objects
    FOR UPDATE USING (bucket_id = 'audio') WITH CHECK (bucket_id = 'audio');
END $$;
