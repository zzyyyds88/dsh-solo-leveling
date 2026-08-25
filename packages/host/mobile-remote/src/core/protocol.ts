/**
 * Mobile-remote wire protocol constants and the closed error-code vocabulary.
 * The envelope shape mirrors the apiproxy `RpcResult` posture:
 * `{ok:true,value}` / `{ok:false,error:{code,message}}`.
 * @module dsh-mobile-remote/core/protocol
 */

/** Bumped on breaking contract changes; reported by GET /api/mobile/info. */
export const PROTOCOL_VERSION = 1

/** The plugin's own HTTP prefix (longest-prefix match wins over connection's /api). */
export const MOBILE_API_PREFIX = '/api/mobile'

/** Exact path of the WebSocket downlink upgrade. */
export const MOBILE_EVENTS_PATH = '/api/mobile/events'

/** Default POST body cap (20 MiB) before the payload-too-large rejection. */
export const DEFAULT_MAX_REQUEST_BYTES = 20_971_520

/** Text preview ceiling for /api/mobile/fs/read (mirrors the aionui-panel 80k cap). */
export const TEXT_CAP_CHARS = 80_000

/** Image data-URL byte budget for /api/mobile/fs/read. */
export const IMAGE_CAP_BYTES = 8 << 20

/** WebSocket ping heartbeat interval for the events downlink. */
export const PING_INTERVAL_MS = 15_000

/** Closed error-code union the app maps to localized copy. */
export type MobileErrorCode =
  | 'method-not-allowed'
  | 'bad-request'
  | 'unauthorized'
  | 'not-found'
  | 'payload-too-large'
  | 'internal'

const ERROR_CODES: readonly MobileErrorCode[] = [
  'method-not-allowed',
  'bad-request',
  'unauthorized',
  'not-found',
  'payload-too-large',
  'internal',
]

/**
 * Fold an arbitrary error code onto the closed set: known codes pass through,
 * anything richer (upstream RpcErrorCode, BoardError codes) degrades to
 * `internal` with its message preserved.
 * @param code - the raw code to admit.
 * @returns the code itself when it is a member, else 'internal'.
 */
export function foldErrorCode(code: string): MobileErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code) ? (code as MobileErrorCode) : 'internal'
}

/** One structured mobile failure: carries its closed-set code to the envelope. */
export class MobileError extends Error {
  /**
   * @param code - closed-set error code.
   * @param message - human-readable diagnostic (safe to surface to the app).
   */
  constructor(public readonly code: MobileErrorCode, message: string) {
    super(message)
    this.name = 'MobileError'
  }
}

/** The unified success envelope. */
export interface MobileOk<T> { ok: true; value: T }

/** The unified failure envelope. */
export interface MobileFail { ok: false; error: { code: MobileErrorCode; message: string } }

/** The unified response envelope every /api/mobile JSON endpoint speaks. */
export type MobileEnvelope<T> = MobileOk<T> | MobileFail

/**
 * Wrap one success value into the envelope.
 * @param value - the endpoint's business value.
 * @returns the `{ok:true,value}` envelope.
 */
export function mobileOk<T>(value: T): MobileOk<T> {
  return { ok: true, value }
}

/**
 * Wrap one {@link MobileError} into the envelope.
 * @param error - the structured failure.
 * @returns the `{ok:false,error}` envelope.
 */
export function mobileFail(error: MobileError): MobileFail {
  return { ok: false, error: { code: error.code, message: error.message } }
}

/**
 * Map a closed-set code onto its HTTP status. Carrier semantics stay narrow;
 * everything unrecognized rides 500.
 * @param code - the envelope error code.
 * @returns the HTTP status answering the request.
 */
export function statusForCode(code: MobileErrorCode): number {
  switch (code) {
    case 'method-not-allowed': return 403
    case 'bad-request': return 400
    case 'unauthorized': return 401
    case 'not-found': return 404
    case 'payload-too-large': return 413
    case 'internal': return 500
  }
}
