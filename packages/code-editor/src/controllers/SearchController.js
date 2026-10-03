import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";

/** @typedef {import("../types/api.js").CdxSearchQuery} CdxSearchQuery */

/**
 * The `search` namespace over CodeMirror's search state, which the MD3 panel (`core/search.js`)
 * reflects. Off under `no-search`: `openSearchPanel` would otherwise install search on its own.
 */
export class SearchController {
  /** @type {import("./EditorViewController.js").EditorViewController} */
  #editor;
  /** @type {() => boolean} */
  #enabled;

  /**
   * @param {import("./EditorViewController.js").EditorViewController} editor
   * @param {{ enabled: () => boolean }} config
   */
  constructor(editor, config) {
    this.#editor = editor;
    this.#enabled = config.enabled;
  }

  get enabled() {
    return this.#enabled();
  }

  /** @param {Partial<CdxSearchQuery>} [query] */
  open(query) {
    const view = this.#editor.view;
    if (!view || !this.enabled) return;
    openSearchPanel(view);
    if (query) this.setQuery(query);
  }

  close() {
    const view = this.#editor.view;
    if (view && this.enabled) closeSearchPanel(view);
  }

  get isOpen() {
    const state = this.#editor.state;
    return !!state && searchPanelOpen(state);
  }

  /** @returns {CdxSearchQuery} */
  get query() {
    const state = this.#editor.state;
    const { search, replace, caseSensitive, regexp, wholeWord } = state
      ? getSearchQuery(state)
      : new SearchQuery({ search: "" });
    return { search, replace, caseSensitive, regexp, wholeWord };
  }

  /** @param {Partial<CdxSearchQuery>} patch */
  setQuery(patch) {
    if (!this.#editor.state || !this.enabled) return;
    const query = new SearchQuery({ ...this.query, ...patch });
    this.#editor.dispatch({ effects: setSearchQuery.of(query) });
  }

  findNext() {
    return this.#run(findNext);
  }

  findPrevious() {
    return this.#run(findPrevious);
  }

  replaceNext() {
    return this.#run(replaceNext);
  }

  replaceAll() {
    return this.#run(replaceAll);
  }

  /** @param {import("@codemirror/view").Command} command */
  #run(command) {
    const view = this.#editor.view;
    return !!view && this.enabled && command(view);
  }
}
