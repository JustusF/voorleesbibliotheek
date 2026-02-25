import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.1'

const ALLOWED_ORIGINS = [
  'https://voorleesbibliotheek.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { bookTitle } = await req.json()

    if (!bookTitle || typeof bookTitle !== 'string') {
      return new Response(
        JSON.stringify({ error: 'bookTitle is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Geef me de hoofdstuktitels van het boek "${bookTitle}".

Antwoord ALLEEN met de hoofdstuktitels, één per regel, zonder nummering of extra tekst.
Als je het boek niet kent of geen hoofdstukken kunt vinden, antwoord dan met: NIET_GEVONDEN

Voorbeeld van gewenst antwoord:
De ontmoeting
Het avontuur begint
Een nieuwe vriend
Het geheim ontrafeld`
        }
      ]
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    if (responseText.includes('NIET_GEVONDEN') || responseText.trim() === '') {
      return new Response(
        JSON.stringify({ chapters: [], found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the chapters from the response
    const chapters = responseText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.toLowerCase().includes('hoofdstuk'))
      .map(line => line.replace(/^\d+[\.\:\-\)\s]+/, '').trim()) // Remove any numbering
      .filter(line => line.length > 0)

    return new Response(
      JSON.stringify({ chapters, found: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to search for chapters' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
