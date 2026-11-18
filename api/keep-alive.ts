/**
 * Daily ping from Vercel Cron (see vercel.json).
 *
 * A free Supabase project is paused after a week without activity; that took
 * the whole library offline in 2026. One small query a day keeps it awake,
 * also in weeks when nobody listens or reads.
 *
 * Env vars (Vercel): SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
export async function GET(): Promise<Response> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    return Response.json({ ok: false, error: 'Supabase env vars ontbreken' }, { status: 500 })
  }

  try {
    const res = await fetch(`${url}/rest/v1/books?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    })
    // A non-200 fails the cron run, so a paused database shows up in Vercel
    return Response.json({ ok: res.ok, status: res.status }, { status: res.ok ? 200 : 502 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'onbekende fout'
    return Response.json({ ok: false, error: message }, { status: 502 })
  }
}
