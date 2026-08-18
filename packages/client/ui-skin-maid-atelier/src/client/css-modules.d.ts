/** CSS Modules typing for the tsdown CSS-inline preset (hashed class map). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** Window Controls Overlay (PWA) geometry surface — provisional typing. */
interface WindowControlsOverlay extends EventTarget {
  visible: boolean
}

interface Navigator {
  readonly windowControlsOverlay?: WindowControlsOverlay
}
