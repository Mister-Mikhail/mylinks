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


## Design skills and UI quality in Codex

- Project-scoped design skills are vendored under `.agents/skills/`. When implementing or reviewing UI, **open the relevant `SKILL.md` directly** instead of relying solely on skill-catalog auto-discovery (which can be incomplete in Codex Cloud).
- Read `.agents/skills/mobile-native/SKILL.md` for mobile browsers and touch; `break-ui/SKILL.md` for realistic extreme content; `gestures/SKILL.md` for drag/swipe/reorder/avatar input; `emil-design-eng/SKILL.md` for UI polish.
- Read `animate/SKILL.md` when adding motion and `animation-performance/SKILL.md` when optimizing animation. `prototype/SKILL.md` is for explicitly requested isolated alternatives, not unprompted production rewrites. `learn-taste/SKILL.md` is only for owner-approved design rules.
- Maintain consistent spacing, typography, radii, components, icons and states. Prefer fast responsive interfaces, reduced-motion support, clean mobile input and no distracting animations. Do not alter owner-approved design or features simply because a skill recommends it.
- For UI changes, perform or report mobile (e.g. 390px) and desktop (e.g. 1280px) review, long/empty data, focus and interaction states, and regression/performance checks; distinguish performed tests from unavailable real-device checks.
- Consult `docs/UI_QUALITY_CHECKLIST.md` before UI review. These skills never replace the product rules, testing requirements, approval flow or secrets protections above.
