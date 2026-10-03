import {
  forEachDiagnostic,
  nextDiagnostic,
  previousDiagnostic,
  setDiagnostics,
  setDiagnosticsEffect,
} from "@codemirror/lint";

/** @typedef {import("../components/code-editor/code-editor.js").CdxCodeEditor} CdxCodeEditor */
/** @typedef {{ errors: number, warnings: number, others: number }} ProblemCounts */

/**
 * Applies pushed `diagnostics` and keeps the problem counts behind the problems indicator —
 * recounted only when diagnostics change, whether pushed or reported by a plugin linter.
 */
export class DiagnosticsController {
  /** @type {CdxCodeEditor} */
  #host;
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {ProblemCounts} */
  #counts = { errors: 0, warnings: 0, others: 0 };

  /**
   * @param {CdxCodeEditor} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#host = host;
    this.#editor = editor;
    editor.onReplace((state) => this.#recount(state));
    editor.subscribe((_before, after, transactions) => {
      if (transactions.some((tr) => tr.effects.some((effect) => effect.is(setDiagnosticsEffect)))) {
        this.#recount(after);
      }
    });
  }

  get counts() {
    return this.#counts;
  }

  /** @param {import("lit").PropertyValues} changed */
  update(changed) {
    // null → null (including the first update) has nothing to clear, so lint stays unloaded
    if (!changed.has("diagnostics") || !(this.#host.diagnostics || changed.get("diagnostics"))) {
      return;
    }
    const state = this.#editor.state;
    if (!state) return;
    const length = state.doc.length;
    const diagnostics = (this.#host.diagnostics ?? []).filter(
      (d) => d.from >= 0 && d.from <= d.to && d.to <= length,
    );
    this.#editor.dispatch(setDiagnostics(state, diagnostics));
    // a detached dispatch reaches no subscriber
    if (!this.#editor.view && this.#editor.state) this.#recount(this.#editor.state);
  }

  /** Moves the caret to the earliest diagnostic; focus stays put. */
  first() {
    const state = this.#editor.state;
    if (!state) return false;
    /** @type {number | undefined} */
    let first;
    forEachDiagnostic(state, (_diagnostic, from) => {
      first ??= from;
    });
    if (first === undefined) return false;
    this.#editor.dispatch({ selection: { anchor: first }, scrollIntoView: true });
    return true;
  }

  /** Selects the next diagnostic after the caret, wrapping (F8). */
  next() {
    const view = this.#editor.view;
    return !!view && nextDiagnostic(view);
  }

  previous() {
    const view = this.#editor.view;
    return !!view && previousDiagnostic(view);
  }

  /** @param {import("@codemirror/state").EditorState} state */
  #recount(state) {
    /** @type {ProblemCounts} */
    const counts = { errors: 0, warnings: 0, others: 0 };
    forEachDiagnostic(state, (diagnostic) => {
      if (diagnostic.severity === "error") counts.errors++;
      else if (diagnostic.severity === "warning") counts.warnings++;
      else counts.others++;
    });
    this.#counts = counts;
    this.#host.requestUpdate();
  }
}
