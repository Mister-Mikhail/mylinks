# mylinks.bar

Private MVP of a link-in-bio service. A user creates one master profile, adds social links, customizes its appearance, and previews the visitor-facing page.

## Current scope

- Email/password registration and sign-in with Supabase Auth
- Profile editor: name, handle, bio, avatar URL
- Link editor: add, reorder, hide, and remove links
- Three restrained visual themes and three card styles
- Private owner-only preview route at `/p/:handle`
- Free-only capability layer prepared for future feature tiers
- No payments, subscriptions, or anonymous/public database reads

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Required variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Verification

```bash
npm run lint
npm run build
```

## Privacy model

The initial migration enables RLS and grants access only to the authenticated owner. Public profile reads require a later, explicit migration after public launch is approved.

## Architecture

- `src/components` — reusable UI and profile preview
- `src/config/capabilities.ts` — product capability boundary for future tiers
- `src/lib` — Supabase client and validation
- `supabase/migrations` — reviewed database migrations

