import { EditorView, keymap } from "@codemirror/view";

/**
 * The "Go to line" card. Ctrl-G on every platform, like VS Code — on macOS Cmd-G is search's
 * "find next". Accepts `line` or `line:column`; out-of-range numbers clamp to the document.
 */
export class GoToLineController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {() => void} */
  #focusCard;
  #open = false;
  #invalid = false;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   * @param {{ focusCard: () => void }} config  Puts the caret in the card's field.
   */
  constructor(host, editor, config) {
    this.#host = host;
    this.#editor = editor;
    this.#focusCard = config.focusCard;
  }

  get open() {
    return this.#open;
  }

  get invalid() {
    return this.#invalid;
  }

  get lineCount() {
    return this.#editor.state?.doc.lines ?? 1;
  }

  /** Where the caret is, as the input's placeholder. */
  get position() {
    const state = this.#editor.state;
    if (!state) return "1:1";
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    return `${line.number}:${head - line.from + 1}`;
  }

  get extension() {
    return keymap.of([
      {
        key: "Ctrl-g",
        run: () => {
          this.show();
          return true;
        },
      },
    ]);
  }

  async show() {
    this.#open = true;
    this.#invalid = false;
    this.#host.requestUpdate();
    await this.#host.updateComplete;
    this.#focusCard();
  }

  /** @param {boolean} [refocus] Back to the text — false when focus is already moving elsewhere. */
  hide(refocus = true) {
    if (!this.#open) return;
    this.#open = false;
    this.#host.requestUpdate();
    if (refocus) this.#editor.focus();
  }

  /** @param {string} text @returns {boolean} whether it was a valid target */
  go(text) {
    const state = this.#editor.state;
    const match = /^\s*(\d+)\s*(?::\s*(\d+)\s*)?$/.exec(text);
    if (!state || !match) {
      this.#invalid = true;
      this.#host.requestUpdate();
      return false;
    }
    this.goTo(Number(match[1]), Number(match[2] ?? 1));
    this.hide();
    return true;
  }

  /** Caret to a 1-based line/column, clamped to the document, centered; focus stays put.
   * @param {number} line @param {number} [column] */
  goTo(line, column = 1) {
    const state = this.#editor.state;
    if (!state || !Number.isFinite(line)) return false;
    const target = state.doc.line(Math.min(Math.max(Math.trunc(line), 1), state.doc.lines));
    const col = Number.isFinite(column) ? Math.trunc(column) : 1;
    const pos = target.from + Math.min(Math.max(col, 1), target.length + 1) - 1;
    this.#editor.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    return true;
  }
}
