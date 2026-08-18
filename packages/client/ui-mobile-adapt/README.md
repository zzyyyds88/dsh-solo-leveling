# dsh-client-ui-mobile-adapt

Narrow-screen adaptation for the DSH Web GUI (fork customization).

## Purpose

Desktop layout stays untouched. On viewports ≤ 768 px the plugin:

- collapses the aionui side panels (file tree / preview) into overlay drawers and
  gives the chat column full width;
- polishes the touch composer (16 px inputs to suppress iOS focus zoom, safe-area
  padding, edge-docked composer);
- stacks the settings dialog rows vertically so labels never render as
  vertical glyph runs, and shrinks the dialog nav to an icon rail;
- scales the pet down and tucks it into a corner, hiding it while a modal is open.

The host half injects the narrow-screen CSS through `webServer.tapIndex`; the
browser half (`./client`) drives the drawer behavior and the grid override via
`data-dshm-narrow` on the frame. It deliberately uses `data-*` attributes rather
than `classList`, because React rewrites `className` and a `MutationObserver` on
it forms a feedback loop that kills the renderer.

## Model Experience

No model-visible effect: this is a browser-only presentation layer. It emits no
cordis events, registers no tools or settings, and reads no session data.

## Known Limitations and Deferred Work

- The browser half is a faithful port of the hand-written rc.6 bundle and carries
  a `// @ts-nocheck` directive; it is typed in a follow-up.
- The drawer logic queries internal `data-*` frame/panel attributes owned by the
  shell and the aionui panel plugin, so it couples to that DOM structure.
