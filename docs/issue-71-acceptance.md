# Issue 71 — photo framing and font browsing

## Behavior
- Background uploads and featured-card uploads open the existing avatar-style editor. Apply stages the picture and frame; Cancel discards that selection. Reopen through the photo or “Изменить кадр”. The original optimized source remains unchanged when the crop changes.
- Avatar, background and cards share `useCropGestures`: pointer capture, drag, keyboard arrows, wheel and two-finger pinch. Zoom ranges from 25% to 300%, with +/− buttons and Reset. Free space defaults to a blurred copy; solid color is available. There are no background/card position or zoom sliders; the overlay slider remains.
- The background editor uses a 9:19.5 reference frame; the published background fills the current viewport with a fixed layer, and content scrolls above it. Profile content has no forced portrait aspect. Rendering recalculates cover for the actual viewport while preserving fractional offsets and source proportions. Cards remain 16:9. The desktop background editor frame is up to 320px wide.
- Featured-card picture/crop controls are in Appearance → Individual card. Links keeps the card type and image description, with a direction to Appearance.
- Desktop font fields cycle with the mouse wheel only while the field is focused after a click and up/down keys. At phone widths the horizontal sample tape uses actual name/link/contact text, group separators, centered selection after swiping, and tap selection. Save behavior remains unchanged.

## Data and compatibility
Migration `20261020114649_image_frame_crops.sql` adds validated `background_crop`/`image_crop` JSON. Legacy cover coordinates become fractions with explicit `legacy` semantics, preserving the previous appearance until the owner applies a new frame. The migration can be replayed. RLS, ownership checks and staff audit stay intact. Owner Save, staff RPC, admin-profile, export and PHP preview_bundle carry the metadata. No public access or production schema changes are made by this PR.

## Verification
CI runs lint/build, PHP tests, PostgreSQL migration replay/validation/RLS/staff checks, geometry tests and the full desktop/mobile e2e suite. `crop-font-gestures.spec.ts` performs actual mouse wheel/drag and CDP touch pinch/swipe (no synthetic element change in place of gestures), verifies no document zoom/scroll, Apply/Cancel/Reset, Save/reload, unchanged source path and public geometry at 1280/390/320 px. The actual official Yandex stable binary repeats the affected scenarios; its version appears in the logs. Screenshots are CI artifacts.

## Release and owner acceptance
Apply the migration before releasing the client/PHP build and deploy admin-profile with JWT verification enabled. Test on the owner's actual phone and desktop browser after release; browser emulation does not reproduce that installation's extensions. Keep #71 open until the owner confirms the crop and font interactions. The public background follows the viewport ratio; 9:19.5 is only the editor reference.

## Review verification
Ordinary wheel scrolling over an unfocused font field leaves the selected font unchanged. Clicking focuses the field and enables wheel cycling; blur releases the wheel. Programmatic tape centering suppresses its own scroll-selection event. Background screenshots cover 1280/390/320px with short and long content, including a scrolled fixed layer. The migration defines the complete staff function with existing ownership checks, client IDs, audit and ACL; validation uses an empty search_path.

Cancelled or replaced uploads can leave unreferenced private Storage files. The existing cleanup follow-up remains tracked in [#35](https://github.com/Mister-Mikhail/mylinks/issues/35) and the [#27 queue](https://github.com/Mister-Mikhail/mylinks/issues/27); this PR does not delete files that may still be referenced by saved drafts or staff edits.
