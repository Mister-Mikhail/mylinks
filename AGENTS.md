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
- Keep the PR as a draft while implementing; accumulate local commits and push only after local checks pass. Prefer a branch based on main; stack PRs only for a necessary dependency.
- Before every push run lint, build, PHP tests, unit tests and the affected desktop e2e specs locally. Install Chromium with `npx playwright install chromium`; an official compatible headless binary may be supplied with PLAYWRIGHT_EXECUTABLE_PATH if the download is unavailable.
- CI is final verification, not an iterative debugger. PR updates run quick desktop smoke plus affected specs. Mark ready once complete to run the full desktop and tagged-mobile suite and real Yandex; full checks also support workflow_dispatch.
- Tag approximately twenty critical browser flows @smoke. Tag mobile-specific coverage @mobile; other tests run only on desktop. Keep pure validation, URL and crop geometry checks in unit tests.
- Merge only after one successful full CI run on the final version, then give a short acceptance report. Main deployment builds and uploads without repeating e2e.
- Do not publish the application or change its audience without explicit owner approval.

