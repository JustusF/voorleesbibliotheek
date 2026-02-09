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
npm run preview  # Preview production build
```

## Deployment

- **Platform:** Vercel
- **Database:** Supabase
- **Git:** Eigen repository

## Configuratie

Vereist in `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Conventies

- ESLint + TypeScript strict mode
- Functionele React componenten
- Supabase voor alle data operaties
- Framer Motion voor animaties
