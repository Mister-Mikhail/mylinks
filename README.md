# mylinks.bar

Free MVP of a link-in-bio service, hosted at https://mylinks.bar on Beget. A user creates one master profile, adds social links, customizes its appearance, and previews the visitor-facing page.

## Current scope

- Email/password registration and sign-in with Supabase Auth, including a password visibility toggle
- Profile editor: name, handle, bio, and private avatar upload with crop, reposition, zoom, shape, and continuous size control
- Link editor: choose a platform and enter only the username, or paste any custom address without `https://`
- Automatic domain favicon for custom links
- Manual 18+ warnings with automatic enforcement for known adult-platform domains
- Unlimited address, phone, and email contact cards with device-native actions
- Three restrained visual themes and three card styles
- Separate font and bounded size settings for the name, bio, master URL and every link label
- Per-card selection and up/down arrows; site icons beside the 18+ setting
- Owner-only page views, visitor sessions and link-click statistics for 7, 30 or 90 days
- Server-rendered Open Graph previews with profile name, bio and avatar for Telegram and other crawlers
- Public profiles at `/:handle`, with unpublished profiles visible only to their owner; legacy `/p/:handle` redirects
- Free-only capability layer prepared for future feature tiers
- No payments or subscriptions; public database reads follow publication and moderation RLS rules

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


## Typography, sharing and statistics

Apply `20261009030827_profile_typography_and_analytics.sql` before deploying this release. Font names and sizes are constrained by both the editor and database. Each saved link has its own typography. The master URL under the avatar is displayed as `mylinks.bar/handle` and remains a copy button.

`npm run build` also creates `dist/preview-config.php` from the two public VITE Supabase variables. No privileged key is used. Apache routes supported preview crawlers to `share-profile.php`; ordinary visitors retain the static entry point. Published profiles get escaped title, bio, canonical URL and Open Graph/Twitter image metadata before JavaScript. The avatar endpoint checks publication again before redirecting to a signed Storage URL. Unpublished profiles reveal no personal metadata. Deploy PHP/config/assets before updating `.htaccess`.

Events contain only the profile/link id, random browser-session id and timestamp. Counts start when the feature is deployed; historic traffic cannot be reconstructed. Editor previews and signed-in owners do not generate events; adult-link clicks are recorded only after confirmation. Duplicate events from the same browser session and target within the same minute are collapsed. Statistics RPCs use caller permissions and owner RLS, with daily periods in Europe/Moscow.

Run `php tests/share-preview.php` and `npm run test:e2e -- tests/profile-settings.spec.ts` for sharing, saved typography/order, owner statistics and visitor tracking checks. Tests mock frontend APIs; database verification uses rolled-back transactions.
