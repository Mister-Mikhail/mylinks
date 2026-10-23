# Local checks and CI

Work in a draft PR. Finish and verify locally before pushing. Each push must pass `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:php`, and the affected desktop specs. Run `npx playwright install chromium` when needed. CI environment values are publishable configuration, never service-role credentials.

`npm run test:quick -- <base-sha>` runs twenty `@smoke` scenarios and the affected desktop specs without repeating smoke cases. The selector handles known areas and fails safe to all desktop specs for shared or unknown application changes. `@full` visual matrices run in the full suite. Set `CI_BASE_SHA` or pass the base commit to compare the branch with main. The base must be present in the checkout; CI fetches the history.

Every PR update, including draft updates, runs lint, build, unit/PHP and quick desktop checks once. `ready_for_review` and `workflow_dispatch` run the complete desktop suite, only `@mobile` scenarios on Pixel 7 emulation, PostgreSQL/Deno/server-route checks, and the real official Yandex binary. Yandex packages and Chromium are cached. New commits cancel stale runs; changing a ready PR requires another full run before merging (return to draft, finish locally, then mark ready).

The target is at most two minutes for warm quick CI and five minutes for full CI. Cold downloads/setup and the scope of a shared-file change can take longer; report actual timings instead of hiding work behind the target. Full verification remains complete rather than being killed at an arbitrary performance threshold. Screenshots are retained for two days.

Pushes to main run build and deployment only. Tests run before merge, not again during release.
