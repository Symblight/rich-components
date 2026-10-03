import { EditorView } from "@codemirror/view";

import { emit } from "../core/emit.js";

/**
 * @typedef {{
 *   selection: import("@codemirror/state").EditorSelection,
 *   line: number,
 *   column: number,
 * }} CdxSelectionChangeDetail
 * `line`/`column` are 1-based and describe the main selection's head — what a status bar shows.
 */

export class SelectionController {
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#editor = editor;
    /** @param {import("@codemirror/state").EditorState} state */
    const report = (state) => {
      const head = state.selection.main.head;
      const line = state.doc.lineAt(head);
      /** @type {CdxSelectionChangeDetail} */
      const detail = {
        selection: state.selection,
        line: line.number,
        column: head - line.from + 1,
      };
      emit(host, "cdx-selection-change", detail);
    };
    editor.onReplace(report);
    editor.subscribe((before, after) => {
      if (!after.selection.eq(before.selection)) report(after);
    });
  }

  /** Clamped to the document. @param {number} anchor @param {number} [head] */
  setSelection(anchor, head = anchor) {
    const length = this.#editor.state?.doc.length ?? 0;
    const clamp = (/** @type {number} */ pos) => Math.min(Math.max(Math.trunc(pos), 0), length);
    this.#editor.dispatch({
      selection: { anchor: clamp(anchor), head: clamp(head) },
      scrollIntoView: true,
    });
  }

  get selection() {
    return this.#editor.state?.selection ?? null;
  }

  /** The main range's text. */
  get text() {
    const state = this.#editor.state;
    if (!state) return "";
    const { from, to } = state.selection.main;
    return state.sliceDoc(from, to);
  }

  /** @returns {import("../types/api.js").CdxLineColumn | null} */
  get cursor() {
    const state = this.#editor.state;
    if (!state) return null;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return { line: line.number, column: head - line.from + 1 };
  }

  /** Scrolls without moving the caret. Needs the live view.
   * @param {number} pos @param {import("../types/api.js").CdxScrollOptions} [options] */
  scrollTo(pos, { align = "nearest" } = {}) {
    const view = this.#editor.view;
    if (!view) return;
    const at = Math.min(Math.max(Math.trunc(pos), 0), view.state.doc.length);
    view.dispatch({ effects: EditorView.scrollIntoView(at, { y: align }) });
  }
}
