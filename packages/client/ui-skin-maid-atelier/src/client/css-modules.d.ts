/** CSS Modules typing for the tsdown CSS-inline preset (hashed class map). */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/** Window Controls Overlay (PWA) geometry surface — provisional typing. */
interface WindowControlsOverlay extends EventTarget {
  visible: boolean
}

/** Global Navigator surface: the optional Window Controls Overlay accessor. */
interface Navigator {
  readonly windowControlsOverlay?: WindowControlsOverlay
}
