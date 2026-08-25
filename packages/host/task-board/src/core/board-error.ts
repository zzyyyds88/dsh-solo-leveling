/**
 * The one error type the task-board service raises to the route layer: a
 * stable envelope code (`bad-request | not-found | conflict`) plus a human
 * message. Routes translate it into the JSON error envelope; anything else
 * thrown becomes a logged internal fault with the same envelope.
 * @module dsh-host-task-board/core/board-error
 */

/** Envelope error codes served by the /api/task-board routes. */
export type BoardErrorCode = 'bad-request' | 'not-found' | 'conflict'

/** A caller-facing service rejection carrying its wire code. */
export class BoardError extends Error {
  /**
   * @param code - the stable envelope code.
   * @param message - human explanation (surfaced verbatim in the envelope).
   */
  constructor(public readonly code: BoardErrorCode, message: string) {
    super(message)
    this.name = 'BoardError'
  }
}

/**
 * Whether a thrown value is a service rejection (vs an unexpected fault).
 * @param error - the thrown value to test.
 * @returns true when the value is a {@link BoardError}.
 */
export function isBoardError(error: unknown): error is BoardError {
  return error instanceof BoardError
}
