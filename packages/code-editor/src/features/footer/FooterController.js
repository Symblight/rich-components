/**
 * @typedef {import("./footer.js").CdxFooter} CdxFooter
 * @typedef {import("../../core/symbols.js").CdxSymbol} CdxSymbol
 * @typedef {{
 *   path: string[],
 *   file: string,
 *   breadcrumbs: boolean,
 *   symbols: CdxSymbol[],
 *   outline: CdxSymbol[],
 *   position: string,
 *   selected: number,
 *   diff: { added: number, removed: number, pressed: boolean } | null,
 *   encoding: string,
 *   language: string,
 *   environment: string,
 *   lineAt: (pos: number) => number,
 * }} StatusBarModel
 * `symbols` is the path under the caret, outermost first; `outline` gives each crumb's siblings.
 */

/**
 * The opt-in status bar: present only while a `<cdx-footer slot="footer">` is. Gathers what the
 * bar shows from the editor — caret, selection, symbols, diff, language — and re-renders the host
 * at most once a frame, since the caret moves on every keystroke.
 */
export class FooterController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement & { filename: string }} */
  #host;
  /** @type {import("../../controllers/EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {{ symbols: () => { path: CdxSymbol[], outline: CdxSymbol[] }, diff: () => StatusBarModel["diff"], language: () => string }} */
  #sources;
  /** @type {CdxFooter | null} */
  #element = null;
  #frame = 0;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement & { filename: string }} host
   * @param {import("../../controllers/EditorViewController.js").EditorViewController} editor
   * @param {{ symbols: () => { path: CdxSymbol[], outline: CdxSymbol[] }, diff: () => StatusBarModel["diff"], language: () => string }} sources
   */
  constructor(host, editor, sources) {
    this.#host = host;
    this.#editor = editor;
    this.#sources = sources;
    host.addController(this);
    host.addEventListener("cdx-footer-config", (event) => {
      if (event.target !== host) this.#schedule();
    });
    // symbols and diff settle asynchronously, after the transaction that moved the caret
    host.addEventListener("cdx-symbols-change", () => this.#schedule());
    host.addEventListener("cdx-diff-change", () => this.#schedule());
    editor.onReplace(() => this.#schedule());
    editor.subscribe((before, after, transactions) => {
      if (
        after.doc !== before.doc ||
        !after.selection.eq(before.selection) ||
        transactions.some((tr) => tr.effects.length)
      ) {
        this.#schedule();
      }
    });
  }

  hostDisconnected() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** @param {HTMLSlotElement} slot */
  handleSlotchange(slot) {
    const elements = slot.assignedElements();
    const footer = elements.find((element) => element.localName === "cdx-footer");
    if (elements.length > 1 || (elements.length && !footer)) {
      console.error('cdx-code-editor: slot="footer" takes one <cdx-footer>');
    }
    this.#element = /** @type {CdxFooter | null} */ (footer ?? null);
    this.#host.requestUpdate();
  }

  /** @returns {StatusBarModel | null} */
  get model() {
    const state = this.#editor.state;
    if (!this.#element || !state) return null;
    const config = this.#element.config;
    const segments = (config.path || this.#host.filename || "untitled").split("/").filter(Boolean);
    const main = state.selection.main;
    const line = state.doc.lineAt(main.head);
    const { path, outline } = this.#sources.symbols();
    return {
      path: segments.slice(0, -1),
      file: segments.at(-1) ?? "untitled",
      breadcrumbs: config.breadcrumbs,
      symbols: path,
      outline,
      position: `${line.number}:${main.head - line.from + 1}`,
      selected: state.selection.ranges.reduce((sum, range) => sum + range.to - range.from, 0),
      diff: this.#sources.diff(),
      encoding: config.encoding,
      language: this.#sources.language(),
      environment: config.environment,
      lineAt: (pos) => state.doc.lineAt(Math.min(pos, state.doc.length)).number,
    };
  }

  #schedule() {
    if (!this.#element || this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#host.requestUpdate();
    });
  }
}
