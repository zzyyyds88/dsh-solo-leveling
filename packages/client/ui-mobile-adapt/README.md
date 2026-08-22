# dsh-client-ui-mobile-adapt

Narrow-screen adaptation for the DSH Web GUI (fork customization).

## Purpose

Desktop layout stays untouched. On viewports ≤ 768 px the plugin:

- turns the sidebar and details columns into off-canvas drawers and gives the
  chat column full width. The sidebar opens from the left edge (rightward
  swipe) or the top-left menu button, and a tap on the scrim closes any open
  drawer; both ride the shell's `ctx.layout` service
  (`toggleSidebar` / `closeDetails`);
- collapses the aionui side panels (file tree / preview) into overlay drawers
  (kept on their existing `visibility` contract);
- polishes the touch composer: 16 px inputs to suppress iOS focus zoom,
  safe-area padding, bottom-docked hero composer, and `enterkeyhint=send` so
  virtual keyboards advertise "Send" instead of "Return";
- keeps the composer reachable above the virtual keyboard: the browser half
  writes the keyboard inset to `--dsm-keyboard-inset` (visualViewport vs the
  layout viewport), the CSS turns it into bottom scroll room, and the pet
  steps aside while the keyboard is up;
- covers the aionui drawers (file tree / preview) with the same scrim as the
  sidebar/details drawers: tapping it closes them through their own collapse
  controls;
- stacks the settings dialog rows vertically so labels never render as
  vertical glyph runs, and shrinks the dialog nav to an icon rail;
- applies phone-tier guards: `100dvh` viewport height, pinch-zoom lock, tooltip
  suppression, command-panel script-focus blur, and horizontal code-block
  scroll;
- scales the pet down and tucks it into a corner, hiding it while a modal is open.

The host half injects the narrow-screen CSS through `webServer.tapIndex`; the
browser half (`./client`) stamps `data-dshm-role` on the frame columns, drives
the drawer/scrim/menu behavior and the grid override via `data-dshm-narrow` on
the frame. It deliberately uses `data-*` attributes rather than `classList`,
because React rewrites `className` and a `MutationObserver` on it forms a
feedback loop that kills the renderer.

## Model Experience

No model-visible effect: this is a browser-only presentation layer. It emits no
cordis events, registers no tools or settings, and reads no session data.

## Known Limitations and Deferred Work

- The drawer logic queries internal `data-*` frame/panel attributes owned by the
  shell and the aionui panel plugin, so it couples to that DOM structure. The
  preview-drawer close control is located through its zh/en `aria-label`
  (its visual class is a hashed CSS-module name).
- The maid-atelier skin pins `--maid-sidebar-width` to `0` on mobile (see the
  skin's own mobile media query) because the sidebar is a drawer there, not a
  permanent column; other skins are unaffected.
- Tunables (breakpoint, drawer widths, pet scale) are still hardcoded; the
  settings card is a tracked open item (roadmap section 7).
