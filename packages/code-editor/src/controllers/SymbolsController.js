import { syntaxTree } from "@codemirror/language";

import { emit } from "../core/emit.js";
import { symbolPathAt, symbolProvider, syntaxTreeSymbols } from "../core/symbols.js";

/** @typedef {import("../core/symbols.js").CdxSymbol} CdxSymbol */
/** @typedef {{ path: CdxSymbol[] }} CdxSymbolsChangeDetail */

/** Outline rebuilds wait for typing to pause — walking the whole tree per keystroke would hold
 *  the main thread on a large file. */
const OUTLINE_DEBOUNCE_MS = 200;

/**
 * Keeps the document outline and the symbol path under the caret, for a consumer's breadcrumbs or
 * symbol menu. The outline is rebuilt (debounced) only when the syntax tree or the provider
 * changed; the path is read from it cheaply, and `cdx-symbols-change` fires only when it differs.
 */
export class SymbolsController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {CdxSymbol[]} */
  #outline = [];
  /** @type {CdxSymbol[]} */
  #path = [];
  /** What the current outline was built from — see #isStale. @type {unknown} */
  #builtProvider;
  /** @type {unknown} */
  #builtFrom;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;
  #request = 0;

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {import("./EditorViewController.js").EditorViewController} editor
   */
  constructor(host, editor) {
    this.#host = host;
    this.#editor = editor;
    host.addController(this);
    // another document: the old outline is wrong right away, and nobody is typing — no debounce
    editor.onReplace(() => {
      clearTimeout(this.#timer);
      this.#outline = [];
      this.#updatePath();
      this.#rebuild();
    });
    editor.subscribe((before, after) => {
      if (this.#isStale(after)) this.#schedule();
      else if (!after.selection.eq(before.selection) || after.doc !== before.doc)
        this.#updatePath();
    });
  }

  get outline() {
    return this.#outline;
  }

  get path() {
    return this.#path;
  }

  hostConnected() {
    this.#schedule();
  }

  hostDisconnected() {
    clearTimeout(this.#timer);
  }

  /** The default provider depends on the syntax tree (which also grows as parsing catches up);
   *  a custom one on the document.
   * @param {import("@codemirror/state").EditorState} state */
  #inputsOf(state) {
    const provider = state.facet(symbolProvider);
    return { provider, from: provider ? state.doc : syntaxTree(state) };
  }

  /** @param {import("@codemirror/state").EditorState} state */
  #isStale(state) {
    const { provider, from } = this.#inputsOf(state);
    return provider !== this.#builtProvider || from !== this.#builtFrom;
  }

  #schedule() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#rebuild(), OUTLINE_DEBOUNCE_MS);
  }

  async #rebuild() {
    const state = this.#editor.state;
    if (!state) return;
    const request = ++this.#request;
    const inputs = this.#inputsOf(state);
    const provider = inputs.provider ?? syntaxTreeSymbols;
    /** @type {CdxSymbol[]} */
    let outline;
    try {
      outline = await provider(state);
    } catch (error) {
      console.error("cdx-code-editor: symbol provider failed", error);
      outline = [];
    }
    if (request !== this.#request) return;
    this.#builtProvider = inputs.provider;
    this.#builtFrom = inputs.from;
    this.#outline = outline;
    this.#updatePath();
  }

  #updatePath() {
    const state = this.#editor.state;
    if (!state) return;
    const path = symbolPathAt(this.#outline, state.selection.main.head);
    const same =
      path.length === this.#path.length &&
      path.every((s, i) => s.name === this.#path[i].name && s.from === this.#path[i].from);
    this.#path = path;
    if (same) return;
    /** @type {CdxSymbolsChangeDetail} */
    const detail = { path };
    emit(this.#host, "cdx-symbols-change", detail);
  }
}
