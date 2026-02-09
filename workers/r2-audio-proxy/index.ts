/**
 * Cloudflare Worker - R2 Audio Proxy
 *
 * This worker acts as a secure proxy between the frontend app and R2 storage.
 * It handles CORS, validates requests, and provides upload/delete operations.
 *
 * Endpoints:
 * - PUT /upload/{filename} - Upload audio file to R2
 * - DELETE /delete/{filename} - Delete audio file from R2
 * - OPTIONS /* - Handle CORS preflight
 */

export interface Env {
  AUDIO_BUCKET: R2Bucket // R2 bucket binding
  ALLOWED_ORIGINS: string // Comma-separated list of allowed origins
}

// Helper to get CORS headers
function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())

  // Check if the origin is allowed
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', // 24 hours
  }
}

// Validate filename
function isValidFilename(filename: string): boolean {
  // Only allow .webm files with UUID-like names
  const pattern = /^[a-f0-9-]+\.webm$/i
  return pattern.test(filename)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const corsHeaders = getCorsHeaders(request, env)

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    const path = url.pathname
    const pathParts = path.split('/').filter(Boolean)

    // Validate path structure
    if (pathParts.length !== 2) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [action, filename] = pathParts

    // Validate filename
    if (!isValidFilename(filename)) {
      return new Response(JSON.stringify({ error: 'Invalid filename format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    try {
      // Handle upload
      if (request.method === 'PUT' && action === 'upload') {
        const contentType = request.headers.get('Content-Type')

        // Only allow audio/webm uploads
        if (contentType !== 'audio/webm') {
          return new Response(JSON.stringify({ error: 'Invalid content type. Expected audio/webm' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Get the audio data from the request body
        const audioData = await request.arrayBuffer()

        // Validate file size (max 100MB)
        const maxSize = 100 * 1024 * 1024
        if (audioData.byteLength > maxSize) {
          return new Response(JSON.stringify({ error: 'File too large. Maximum 100MB.' }), {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Upload to R2
        await env.AUDIO_BUCKET.put(filename, audioData, {
          httpMetadata: {
            contentType: 'audio/webm',
          },
        })

        return new Response(
          JSON.stringify({
            success: true,
            filename,
            message: 'Audio uploaded successfully',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Handle delete
      if (request.method === 'DELETE' && action === 'delete') {
        // Check if file exists first
        const existingObject = await env.AUDIO_BUCKET.head(filename)

        if (!existingObject) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'File does not exist (already deleted)',
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }

        // Delete from R2
        await env.AUDIO_BUCKET.delete(filename)

        return new Response(
          JSON.stringify({
            success: true,
            filename,
            message: 'Audio deleted successfully',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Unknown action/method combination
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Worker error:', error)

      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  },
}
