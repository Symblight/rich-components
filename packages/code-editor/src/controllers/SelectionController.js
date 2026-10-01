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

  /** @param {number} anchor @param {number} [head] */
  setSelection(anchor, head = anchor) {
    this.#editor.dispatch({ selection: { anchor, head }, scrollIntoView: true });
  }
}
