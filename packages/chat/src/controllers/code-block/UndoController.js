/** A pause longer than this starts a new undo step; continuous edits within it group together. */
const COALESCE_MS = 500;

/**
 * Generic linear undo/redo over a sequence of string snapshots, coalescing edits within
 * COALESCE_MS of the previous one into a single step — e.g. a burst of typing becomes one undo,
 * not one per keystroke.
 */
export class UndoController {
  /** @type {string[]} */
  #undoStack = [];
  /** @type {string[]} */
  #redoStack = [];
  #lastPushAt = 0;

  /** Records `value` as the state *before* an edit about to be applied.
   * @param {string} value */
  push(value) {
    const now = Date.now();
    const isNewGroup = this.#undoStack.length === 0 || now - this.#lastPushAt >= COALESCE_MS;
    this.#lastPushAt = now;
    if (!isNewGroup) return;
    this.#undoStack.push(value);
    this.#redoStack = [];
  }

  /** @param {string} current @returns {string | undefined} */
  undo(current) {
    if (this.#undoStack.length === 0) return undefined;
    this.#redoStack.push(current);
    return this.#undoStack.pop();
  }

  /** @param {string} current @returns {string | undefined} */
  redo(current) {
    if (this.#redoStack.length === 0) return undefined;
    this.#undoStack.push(current);
    return this.#redoStack.pop();
  }
}
