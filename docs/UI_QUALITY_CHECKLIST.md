# mylinks.bar UI quality checklist

Applies to new or modified UI; it does not authorize a standalone redesign.

- [ ] Preserve accepted behavior, layout and owner-approved appearance.
- [ ] Prefer coherent design tokens/patterns over arbitrary margins, font sizes, radii or icons.
- [ ] Check at 390px mobile and 1280px desktop where applicable: no overflow, overlap, clipping or disappearing controls.
- [ ] Verify realistic edge cases: no links, dozens of links, long titles/URLs, unusual characters, empty media, non-Latin text.
- [ ] Verify focus, hover, active, disabled, loading and error states; test touch/safe-area behavior and input zoom on real devices when possible.
- [ ] Motion is meaningful, interruptible where relevant, respects reduced-motion, avoids layout-heavy animation and delays.
- [ ] No obvious public-page load regression, layout shift, redundant requests or dropped frames. Measure rather than guess.
- [ ] Follow AGENTS.md: lint, build, PHP, unit, impacted desktop/mobile e2e and final CI requirements; include before/after screenshots where requested.

## Cloud verification

Codex Cloud might not automatically advertise repository-local skills. In a cloud task, first explicitly read `.agents/skills/mobile-native/SKILL.md` and `.agents/skills/break-ui/SKILL.md` and confirm whether they appear in the skill catalog. File availability and automatic discovery are separate checks.
