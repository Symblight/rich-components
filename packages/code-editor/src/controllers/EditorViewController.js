import { EditorView } from "@codemirror/view";

/**
 * @typedef {import("@codemirror/state").EditorState} EditorState
 * @typedef {import("@codemirror/state").Transaction} Transaction
 * @typedef {(before: EditorState, after: EditorState, transactions: readonly Transaction[]) => void} TransactionListener
 */

/**
 * Owns the EditorView: mounts it into the host's shadow root, destroys it on disconnect while
 * keeping the state (document, history, config), and remounts on reconnect. The other controllers
 * reach CodeMirror only through `state`, `dispatch` and `subscribe`.
 */
export class EditorViewController {
  /** @type {import("lit").ReactiveControllerHost & HTMLElement} */
  #host;
  /** @type {() => HTMLElement} */
  #getParent;
  /** @type {EditorView | undefined} */
  #view;
  /** @type {EditorState | undefined} */
  #detachedState;
  /** @type {Set<TransactionListener>} */
  #listeners = new Set();
  /** @type {Set<(state: EditorState) => void>} */
  #replaceListeners = new Set();

  /**
   * @param {import("lit").ReactiveControllerHost & HTMLElement} host
   * @param {{ getParent: () => HTMLElement }} config
   */
  constructor(host, config) {
    this.#host = host;
    this.#getParent = config.getParent;
    host.addController(this);
  }

  get view() {
    return this.#view;
  }

  /** Live state, or the kept one while disconnected; undefined before the first mount. */
  get state() {
    return this.#view?.state ?? this.#detachedState;
  }

  /** @param {EditorState} state */
  mount(state) {
    this.#view = new EditorView({
      state,
      parent: this.#getParent(),
      root: /** @type {ShadowRoot} */ (this.#host.shadowRoot),
      dispatchTransactions: (transactions, view) => {
        const before = view.state;
        view.update(transactions);
        // after the update, so a listener setting `value` doesn't dispatch mid-update
        for (const listener of this.#listeners) listener(before, view.state, transactions);
      },
    });
  }

  /** Applies to the live view, or to the kept state while disconnected — listeners only hear the
   *  former, since nothing is on screen to react to otherwise.
   * @param {import("@codemirror/state").TransactionSpec} spec */
  dispatch(spec) {
    if (this.#view) this.#view.dispatch(spec);
    else if (this.#detachedState) this.#detachedState = this.#detachedState.update(spec).state;
  }

  /** @param {TransactionListener} listener */
  subscribe(listener) {
    this.#listeners.add(listener);
  }

  /** Swaps in a whole other state — a tab switch. No transaction describes it, so listeners that
   *  derive something from the state register here too.
   * @param {EditorState} state */
  replaceState(state) {
    if (this.#view) this.#view.setState(state);
    else if (this.#detachedState) this.#detachedState = state;
    else return;
    for (const listener of this.#replaceListeners) listener(state);
  }

  /** @param {(state: EditorState) => void} listener */
  onReplace(listener) {
    this.#replaceListeners.add(listener);
  }

  focus() {
    this.#view?.focus();
  }

  hostConnected() {
    if (!this.#detachedState) return;
    const state = this.#detachedState;
    this.#detachedState = undefined;
    this.mount(state);
  }

  hostDisconnected() {
    if (!this.#view) return;
    this.#detachedState = this.#view.state;
    this.#view.destroy();
    this.#view = undefined;
  }
}
