# mylinks.bar development guide

## Product rules

- The current product is a fully free MVP. Do not add payments, subscriptions, checkout, or upgrade prompts.
- Keep public profile access disabled unless the owner explicitly approves enabling it.
- Preserve the existing visual direction: minimal, precise, restrained, premium, no gold.
- The working mark uses five aligned horizontal bars and a centered angle/check element.
- Keep customization focused: background, card style, avatar shape, and avatar size.

## Technical rules

- Keep Supabase RLS enabled on every user-data table.
- Never expose a service-role key in browser code.
- Use the publishable key for the web client; treat server secrets separately.
- Route future paid capabilities through `src/config/capabilities.ts` instead of scattering plan checks through components.
- Add database changes as new timestamped migrations; do not rewrite applied migrations.
- Run `npm run lint` and `npm run build` before proposing a pull request.

## Git workflow

- Work in a feature branch; keep `main` releasable.
- Use small, descriptive commits.
- Do not publish the application or change its audience without explicit owner approval.

