# Issue 71 — photo framing and font browsing

## Behavior
- Background uploads and featured-card uploads open the existing avatar-style editor. Apply stages the picture and frame; Cancel discards that selection. Reopen through the photo or “Изменить кадр”. The original optimized source remains unchanged when the crop changes.
- Avatar, background and cards share `useCropGestures`: pointer capture, drag, keyboard arrows, wheel and two-finger pinch. Zoom ranges from 25% to 300%, with +/− buttons and Reset. Free space defaults to a blurred copy; solid color is available. There are no background/card position or zoom sliders; the overlay slider remains.
- Background uses a fixed phone frame (9:19.5), cards 16:9. The same `CroppedImage` renderer and fractional data are used in the dialog, preview and public page. The whole phone composition scales with profile width; longer pages continue into a blurred backdrop instead of stretching the chosen frame.
- Featured-card picture/crop controls are in Appearance → Individual card. Links keeps the card type and image description, with a direction to Appearance.
- Desktop font fields cycle with the hovered mouse wheel and up/down keys. At phone widths the horizontal sample tape uses actual name/link/contact text, group separators, centered selection after swiping, and tap selection. Save behavior remains unchanged.

## Data and compatibility
Migration `20261020114649_image_frame_crops.sql` adds validated `background_crop`/`image_crop` JSON. Legacy cover coordinates become fractions with explicit `legacy` semantics, preserving the previous appearance until the owner applies a new frame. The migration can be replayed. RLS, ownership checks and staff audit stay intact. Owner Save, staff RPC, admin-profile, export and PHP preview_bundle carry the metadata. No public access or production schema changes are made by this PR.

## Verification
CI runs lint/build, PHP tests, PostgreSQL migration replay/validation/RLS/staff checks, geometry tests and the full desktop/mobile e2e suite. `crop-font-gestures.spec.ts` performs actual mouse wheel/drag and CDP touch pinch/swipe (no synthetic element change in place of gestures), verifies no document zoom/scroll, Apply/Cancel/Reset, Save/reload, unchanged source path and public geometry at 1280/390/320 px. The actual official Yandex stable binary repeats the affected scenarios; its version appears in the logs. Screenshots are CI artifacts.

## Release and owner acceptance
Apply the migration before releasing the client/PHP build and deploy admin-profile with JWT verification enabled. Test on the owner's actual phone and desktop browser after release; browser emulation does not reproduce that installation's extensions. Keep #71 open until the owner confirms the crop and font interactions. The default fixed phone ratio is intentionally stable across window widths, rather than following the current browser window ratio.
