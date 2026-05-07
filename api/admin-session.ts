/**
 * Server-side admin session endpoint.
 *
 * POST   /api/admin-session  { pin }  -> validates PIN and sets HttpOnly cookie
 * DELETE /api/admin-session          -> clears cookie
 *
 * Required server env vars:
 *   ADMIN_SECRET    - random signing secret for session cookies
 *   ADMIN_PIN_HASH  - SHA-256 hex hash of the 4-digit admin PIN
 *
 * ADMIN_PIN is supported as a server-only fallback for local setup, but
 * ADMIN_PIN_HASH is preferred.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'voorleesbibliotheek_admin_session'
const DEFAULT_TTL_SECONDS = 15 * 60
const MAX_FAILED_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const LOCKOUT_MS = 5 * 60 * 1000

interface RateLimitState {
  attempts: number
  firstAttemptAt: number
  lockedUntil: number | null
}

const rateLimitStore = new Map<string, RateLimitState>()

interface NodeLikeRequest {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined> | Headers
  body?: unknown
}

type RuntimeRequest = Request | NodeLikeRequest

interface NodeLikeResponse {
  statusCode?: number
  setHeader?: (name: string, value: string | string[]) => void
  status?: (statusCode: number) => NodeLikeResponse
  json?: (body: unknown) => void
  end?: (body?: string) => void
}

function jsonResponse(
  res: NodeLikeResponse | undefined,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response | void {
  if (!res) {
    return Response.json(body, init)
  }

  const statusCode = init.status ?? 200
  if (init.headers) {
    for (const [key, value] of Object.entries(init.headers)) {
      res.setHeader?.(key, value)
    }
  }

  res.setHeader?.('Content-Type', 'application/json')
  if (res.status) {
    res.status(statusCode)
  } else {
    res.statusCode = statusCode
  }

  if (res.json) {
    res.json(body)
  } else {
    res.end?.(JSON.stringify(body))
  }
}

function getHeader(req: RuntimeRequest, name: string): string | null {
  const headers = req.headers
  if (!headers) return null

  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)
  }

  const value = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()]
  if (Array.isArray(value)) return value.join(', ')
  return value ?? null
}

async function readJson(req: RuntimeRequest): Promise<unknown> {
  if (typeof (req as Request).json === 'function') {
    return (req as Request).json()
  }

  if ('body' in req && req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  }

  return {}
}

function getRequestUrl(req: RuntimeRequest): URL {
  const rawUrl = req.url || '/'
  if (/^https?:\/\//i.test(rawUrl)) return new URL(rawUrl)
  return new URL(rawUrl, `https://${getHeader(req, 'host') || 'localhost'}`)
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function timingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf)
}

function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex')
}

function verifyPin(pin: string): boolean {
  const configuredHash = process.env.ADMIN_PIN_HASH?.trim().toLowerCase()
  const configuredPin = process.env.ADMIN_PIN

  if (configuredHash) {
    return timingEqual(hashPin(pin), configuredHash)
  }

  if (configuredPin) {
    return timingEqual(pin, configuredPin)
  }

  return false
}

function getClientKey(req: RuntimeRequest): string {
  const forwardedFor = getHeader(req, 'x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || getHeader(req, 'cf-connecting-ip') || 'unknown'
}

function checkRateLimit(req: RuntimeRequest): { allowed: boolean; retryAfterSeconds?: number } {
  const key = getClientKey(req)
  const now = Date.now()
  const state = rateLimitStore.get(key)
  if (!state) return { allowed: true }

  if (state.lockedUntil && now < state.lockedUntil) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
    }
  }

  if (state.lockedUntil || now - state.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.delete(key)
  }

  return { allowed: true }
}

function recordFailedAttempt(req: RuntimeRequest): void {
  const key = getClientKey(req)
  const now = Date.now()
  const current = rateLimitStore.get(key)
  const state = current && now - current.firstAttemptAt <= RATE_LIMIT_WINDOW_MS
    ? current
    : { attempts: 0, firstAttemptAt: now, lockedUntil: null }

  state.attempts += 1
  if (state.attempts >= MAX_FAILED_ATTEMPTS) {
    state.attempts = 0
    state.firstAttemptAt = now
    state.lockedUntil = now + LOCKOUT_MS
  }

  rateLimitStore.set(key, state)
}

function clearFailedAttempts(req: RuntimeRequest): void {
  rateLimitStore.delete(getClientKey(req))
}

function getSessionTtlSeconds(): number {
  const raw = Number(process.env.ADMIN_SESSION_TTL_SECONDS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS
}

function sign(value: string, secret: string): string {
  return base64Url(createHmac('sha256', secret).update(value).digest())
}

function createSessionCookie(request: RuntimeRequest, secret: string): string {
  const now = Date.now()
  const ttlSeconds = getSessionTtlSeconds()
  const payload = base64Url(JSON.stringify({
    iat: now,
    exp: now + ttlSeconds * 1000,
    nonce: randomBytes(16).toString('hex'),
  }))
  const token = `${payload}.${sign(payload, secret)}`
  const url = getRequestUrl(request)
  const forwardedProto = getHeader(request, 'x-forwarded-proto')
  const secure = forwardedProto === 'https' || url.protocol === 'https:'

  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${ttlSeconds}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function clearSessionCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ].join('; ')
}

export default async function handler(req: RuntimeRequest, res?: NodeLikeResponse): Promise<Response | void> {
  if (req.method === 'DELETE') {
    return jsonResponse(
      res,
      { success: true },
      { headers: { 'Set-Cookie': clearSessionCookie() } }
    )
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, { error: 'Method not allowed' }, { status: 405 })
  }

  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return jsonResponse(
      res,
      { error: 'ADMIN_SECRET is niet geconfigureerd', code: 'ADMIN_AUTH_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  if (!process.env.ADMIN_PIN_HASH && !process.env.ADMIN_PIN) {
    return jsonResponse(
      res,
      { error: 'ADMIN_PIN_HASH is niet geconfigureerd', code: 'ADMIN_AUTH_NOT_CONFIGURED' },
      { status: 503 }
    )
  }

  const rateLimit = checkRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      res,
      { error: 'Te veel pogingen. Probeer later opnieuw.', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds
          ? { 'Retry-After': String(rateLimit.retryAfterSeconds) }
          : undefined,
      }
    )
  }

  let body: { pin?: string }
  try {
    body = await readJson(req) as { pin?: string }
  } catch {
    return jsonResponse(res, { error: 'Invalid JSON' }, { status: 400 })
  }

  const pin = body.pin || ''
  if (!/^\d{4}$/.test(pin)) {
    return jsonResponse(res, { error: 'PIN moet uit 4 cijfers bestaan' }, { status: 400 })
  }

  if (!verifyPin(pin)) {
    recordFailedAttempt(req)
    return jsonResponse(res, { error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  clearFailedAttempts(req)
  return jsonResponse(
    res,
    { success: true },
    { headers: { 'Set-Cookie': createSessionCookie(req, adminSecret) } }
  )
}
