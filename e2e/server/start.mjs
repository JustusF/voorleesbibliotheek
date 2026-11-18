// Start de nagebouwde Supabase en serveert de gebouwde app (dist-e2e) met de
// echte Vercel-functies uit api/ erachter. Gebruikt door playwright.config.ts.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createFakeSupabase, SERVICE_KEY } from './fake-supabase.mjs'
import { APP_PORT, SUPABASE_PORT, ADMIN_PIN, AUDIO_DIR } from './ports.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.join(root, 'dist-e2e')

process.env.SUPABASE_URL = `http://localhost:${SUPABASE_PORT}`
process.env.SUPABASE_SERVICE_KEY = SERVICE_KEY
process.env.ADMIN_SECRET = 'e2e-secret'
process.env.ADMIN_PIN_HASH = createHash('sha256').update(ADMIN_PIN).digest('hex')

fs.rmSync(AUDIO_DIR, { recursive: true, force: true })
const fake = createFakeSupabase({ audioDir: AUDIO_DIR })
fake.server.listen(SUPABASE_PORT, () => console.log(`fake supabase op :${SUPABASE_PORT}`))

const handlers = {
  '/api/admin-session': (await import(path.join(root, 'api/admin-session.ts'))).default,
  '/api/admin-mutations': (await import(path.join(root, 'api/admin-mutations.ts'))).default,
  '/api/keep-alive': (await import(path.join(root, 'api/keep-alive.ts'))).default,
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const app = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${APP_PORT}`)
  const handler = handlers[url.pathname]
  if (handler) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    })
    try {
      const response = await handler(request)
      const headers = {}
      response.headers.forEach((v, k) => { headers[k] = v })
      const cookies = response.headers.getSetCookie?.() ?? []
      // De sessiecookie is Secure; op http://localhost laat de browser dat toe.
      if (cookies.length) headers['set-cookie'] = cookies
      res.writeHead(response.status, headers)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      console.error('[api]', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(error) }))
    }
    return
  }

  // Zelfde regel als vercel.json: alles buiten /api/ valt terug op index.html.
  let file = path.join(dist, decodeURIComponent(url.pathname))
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, 'index.html')
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
})

app.listen(APP_PORT, () => console.log(`app op http://localhost:${APP_PORT}`))
