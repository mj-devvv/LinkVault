# LinkVault

Personal web-resource manager: workspaces → nested folders → bookmarks. Vanilla JS + Vite, Supabase for auth and storage, deploys to Vercel.

## Run locally
```bash
npm install
cp .env.example .env.local   # add your Supabase URL + anon key
npm run dev
```
Without the env vars the app shows a setup notice and offers an explicit **local development mode** (browser storage only: no real accounts, not synced, not secure).

## Supabase setup
1. Create a project at supabase.com.
2. SQL Editor → run `supabase/migrations/001_init.sql`, then `002_ordering_profiles_preferences.sql` (tables, ordering, profiles, preferences, and Row Level Security so every row is readable and writable only by its owner). **Run 002 before deploying this version.**
3. Authentication → URL Configuration: set **Site URL** to your Vercel URL and add `https://YOUR-DOMAIN/app` and `https://YOUR-DOMAIN/reset` to **Redirect URLs** (plus `http://localhost:5173/**` for development).
4. Project Settings → API: copy the project URL and the **anon** key into your env vars. Never use the service-role key in the frontend.

## Deploy to Vercel
1. Push this folder to GitHub and import the repo in Vercel (framework preset: Vite; build `npm run build`; output `dist`).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Environment Variables, then deploy. `vercel.json` provides the SPA fallback so `/login`, `/app/...` etc. work on refresh.

## Structure
```
index.html            entry
src/data.js           Supabase client, auth service, repository (+ local dev mode)
src/main.js           router, views, actions
src/styles.css        monochrome liquid-glass design, desktop + mobile layouts
supabase/migrations/  schema + RLS
```

## Optional: automatic title lookup
Browsers can't read other sites' pages, so titles come from an Edge Function: `supabase functions deploy fetch-metadata` (needs the Supabase CLI and a linked project). It requires a signed-in user and blocks private/local addresses. Without it, the title falls back to the domain.

## Optional: contact email
Set `VITE_CONTACT_EMAIL` to show a Contact link in the footer. The privacy and terms pages are plain-language starting points; have them reviewed before relying on them.

## Known limits
Drag-and-drop uses the browser's native drag events (reliable with a mouse; touch depends on the browser, so Edit → Location and Alt+Arrow keys are the fallbacks). Import inserts links one at a time, so very large files are slow. Favicons use Google's favicon service.
