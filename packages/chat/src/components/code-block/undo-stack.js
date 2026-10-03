/** A pause longer than this starts a new undo step; edits within it group together. */
const COALESCE_MS = 500;

/** Linear undo/redo over string snapshots, coalescing a burst of edits into one step. */
export class UndoStack {
  /** @type {string[]} */
  #undoStack = [];
  /** @type {string[]} */
  #redoStack = [];
  #lastPushAt = 0;

  /** Records `value` as the state *before* an edit. @param {string} value */
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
    return this.#step(this.#undoStack, this.#redoStack, current);
  }

  /** @param {string} current @returns {string | undefined} */
  redo(current) {
    return this.#step(this.#redoStack, this.#undoStack, current);
  }

  /** @param {string[]} from @param {string[]} to @param {string} current */
  #step(from, to, current) {
    if (from.length === 0) return undefined;
    to.push(current);
    return from.pop();
  }
}
