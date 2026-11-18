# Voorleesbibliotheek

## Doel

Web applicatie voor families om voorleesboeken te delen. Voorlezers kunnen hoofdstukken opnemen, luisteraars kunnen de opnames afspelen en hun voortgang bijhouden.

## Tech Stack

- **Framework:** React 19 + Vite
- **Taal:** TypeScript
- **UI:** Tailwind CSS 4
- **Animaties:** Framer Motion
- **Database:** Supabase (PostgreSQL)
- **Routing:** React Router DOM

## Structuur

- `src/`
  - `App.tsx` - Hoofdapplicatie
  - `components/` - React componenten
  - `pages/` - Route pages
  - `lib/` - Utilities en Supabase client
  - `context/` - React context providers
  - `hooks/` - Custom hooks
  - `types/` - TypeScript types
- `api/` - Vercel Serverless Functions
- `supabase/` - Supabase configuratie
- `workers/` - Background workers
- `tests/` - Test bestanden
- `screenshots/` - UI screenshots

## Database Schema

- `users` - Voorlezers en luisteraars (reader/admin/listener)
- `books` - Boeken met titel, auteur, cover
- `chapters` - Hoofdstukken per boek
- `recordings` - Audio opnames per hoofdstuk
- `progress` - Voortgang tracking per luisteraar

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build voor productie
npm run lint     # ESLint check
npm test         # Vitest
```

## Deployment

- **Platform:** Vercel. Een push naar `master` is een productie-deploy; er is geen CI of PR-stap.
- **Database:** Supabase-project `bneoomxezoijuhcofezs`, organisatie Studio Zakai.
- `vercel.json` stuurt alle paden behalve `/api/` naar `index.html`. Zonder die regel geeft een rechtstreeks geopende link (`/voorlezen?wie=...`) een 404.
- `/api/keep-alive` draait dagelijks via Vercel Cron. Een gratis Supabase-project pauzeert na een week stilte; dat legde de app in 2026 maanden plat.

## Configuratie

Browser (`.env`, ook in Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Server (alleen Vercel): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_SECRET`, `ADMIN_PIN_HASH`.

## Gotchas

- **Geen login.** De anon-sleutel mag lezen, toevoegen en bijwerken, niet verwijderen. Verwijderen loopt via `api/admin-mutations.ts` (service-sleutel, achter de beheer-pincode). Bouw dus geen functie die als gewone bezoeker iets moet verwijderen: vervang in plaats daarvan (zie `replaceRecordingAsync`).
- **localStorage is een volwaardige kopie.** `src/lib/storage.ts` schrijft eerst lokaal en duwt records die alleen lokaal bestaan bij de volgende sync naar Supabase. Wie lokaal met echte env-vars test, schrijft dus naar productie. Test zonder env-vars en vul localStorage zelf, of maak localStorage leeg na een test op de live site.
- **Eerste bezoek wacht op de sync** (`src/App.tsx`), anders kent een persoonlijke voorleeslink de voorlezer nog niet.
- **Audio** staat deels in Supabase Storage (bucket `audio`) en deels in R2; nieuwe opnames gaan naar Supabase Storage. De R2-code en de worker in `workers/` zijn niet in gebruik in productie.
- **Migraties:** `supabase db push` vraagt hier om `SUPABASE_DB_PASSWORD`; de wachtwoordloze login-rol werkt niet op dit project.
- `api/ocr.ts` (inhoudsopgave scannen) heeft een `ANTHROPIC_API_KEY` nodig; die staat niet in Vercel, dus de scanknop in beheer werkt niet.
- Gebruikersrollen: `reader`, `admin`, `listener`. Persoonlijke links: `/voorlezen?wie=<user-id>` en `/luisteren?hoofdstuk=<chapter-id>`.

## Conventies

- ESLint + TypeScript strict mode
- Functionele React componenten
- Tekst op lichte kleurvlakken (sky, honey, moss) krijgt `text-ink`, geen wit: wit haalt daar ~2:1 contrast
- Iconen via `components/ui/Icon.tsx`, geen emoji
- Framer Motion voor animaties
