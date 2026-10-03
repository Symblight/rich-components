import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";

/** @typedef {import("../types/api.js").CdxLineColumn} CdxLineColumn */

/**
 * The `doc` namespace: reads, an edit that behaves like the user's, and history. Positions are
 * offsets; `posAt`/`lineAt` convert to and from 1-based line/column.
 */
export class DocController {
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;

  /** @param {import("./EditorViewController.js").EditorViewController} editor */
  constructor(editor) {
    this.#editor = editor;
  }

  get length() {
    return this.#editor.state?.doc.length ?? 0;
  }

  get lineCount() {
    return this.#editor.state?.doc.lines ?? 0;
  }

  /** @param {number} line @param {number} [column] */
  posAt(line, column = 1) {
    const state = this.#editor.state;
    if (!state) return 0;
    const target = state.doc.line(clamp(Math.trunc(line), 1, state.doc.lines));
    return target.from + clamp(Math.trunc(column), 1, target.length + 1) - 1;
  }

  /** @param {number} pos @returns {CdxLineColumn} */
  lineAt(pos) {
    const state = this.#editor.state;
    if (!state) return { line: 1, column: 1 };
    const at = clamp(Math.trunc(pos), 0, state.doc.length);
    const line = state.doc.lineAt(at);
    return { line: line.number, column: at - line.from + 1 };
  }

  /** Ignores `readOnly` (it gates the user's input), but goes through `cdx-before-change` and into
   *  undo history like the user's edit. The transaction is built first, so a prevented edit is
   *  seen as empty changes and never dispatched.
   * @param {number} from @param {number} to @param {string} text */
  replace(from, to, text) {
    const state = this.#editor.state;
    if (!state) return false;
    const length = state.doc.length;
    const a = clamp(Math.trunc(from), 0, length);
    const b = clamp(Math.trunc(to), 0, length);
    const tr = state.update({
      changes: { from: Math.min(a, b), to: Math.max(a, b), insert: text },
      userEvent: "api",
    });
    if (tr.changes.empty) return false;
    this.#editor.dispatch(tr);
    return true;
  }

  undo() {
    return this.#run(undo);
  }

  redo() {
    return this.#run(redo);
  }

  canUndo() {
    const state = this.#editor.state;
    return !!state && undoDepth(state) > 0;
  }

  canRedo() {
    const state = this.#editor.state;
    return !!state && redoDepth(state) > 0;
  }

  /** @param {import("@codemirror/state").StateCommand} command */
  #run(command) {
    const state = this.#editor.state;
    if (!state) return false;
    return command({ state, dispatch: (tr) => this.#editor.dispatch(tr) });
  }
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
