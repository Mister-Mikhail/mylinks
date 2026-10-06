# mylinks.bar

Private MVP of a link-in-bio service. A user creates one master profile, adds social links, customizes its appearance, and previews the visitor-facing page.

## Current scope

- Email/password registration and sign-in with Supabase Auth, including a password visibility toggle
- Profile editor: name, handle, bio, and private avatar upload with crop, reposition, zoom, shape, and continuous size control
- Link editor: choose a platform and enter only the username, or paste any custom address without `https://`
- Automatic domain favicon for custom links
- Manual 18+ warnings with automatic enforcement for known adult-platform domains
- Unlimited address, phone, and email contact cards with device-native actions
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
- `src/lib` — Supabase client, contact actions, and validation
- `supabase/migrations` — reviewed database migrations

## Administration and moderation

Staff sign in with their existing Supabase account at `/admin`. Roles are assigned in a protected database table; registration never grants staff access. Administrators can assign administrator/moderator roles. Moderators can inspect registrations and restrict or restore publication of profiles and individual links. Both roles have search, user details, registration counters, and a paginated audit log. The last administrator cannot be removed.

Restrictions hide content from visitors while preserving the owner's editor access. Every moderation action requires a reason and creates a server-side audit entry. Staff RPCs check the current database role on every request. Apply both `20260930033033_admin_moderation.sql` and `20260930034130_staff_detail_and_audit_labels.sql`; initial administrator assignment is a separate privileged operation.

Run the focused desktop/mobile access and moderation checks with `npm run test:e2e -- tests/admin.spec.ts`. These tests mock Auth and RPC responses and never modify production users.

## Mobile appearance editor

The appearance screen keeps a compact live preview above independently scrollable controls, including on small phones and in landscape. Theme, link-card style, avatar shape and size update the preview immediately. Photo selection and re-cropping stay inline, with pointer/keyboard positioning, zoom, reset, cancel and apply. A local crop draft is shown in the preview before upload; cancelling never uploads it. Applying the photo persists the avatar; the Save button persists appearance settings.

Run `npm run test:e2e -- tests/appearance.spec.ts` for mocked desktop/mobile persistence, image upload, crop interaction, cancellation, upload failure, and viewport checks. No production users are modified by these tests.
