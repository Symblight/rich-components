/**
 * Watches rendered rows for viewport intersection and calls `onItemVisible(key)` on every
 * `false → true` transition — no memory of which keys have already fired (that dedup is one layer
 * up, see `chx-message-list`'s `ReadTrackingController`). A row is only ever registered once, at
 * the moment it first passes `getShouldObserveItem()`, never re-checked afterwards.
 *
 * Gated on `document.visibilityState`: an intersection while the tab is hidden/backgrounded isn't a
 * real "the user saw this" signal. `takeRecords()` on the way back to `"visible"` catches anything
 * that was already intersecting the whole time the tab was hidden, since no new transition occurs
 * for a row that stays intersecting throughout.
 */
export class VisibilityController {
  /** @type {() => Iterable<HTMLElement>} */
  #rows;
  /** @type {() => Element | undefined} */
  #getScrollElement;
  /** @type {() => number} */
  #getThreshold;
  /** @type {() => unknown[]} */
  #getData;
  /** @type {() => (item: unknown, index: number) => boolean} */
  #getShouldObserveItem;
  /** @type {(key: string) => void} */
  #onItemVisible;
  /** @type {IntersectionObserver | null} */
  #intersectionObserver = null;
  /** @type {Set<Element>} */
  #observed = new Set();
  #disposed = false;

  /**
   * @param {{
   *   rows: () => Iterable<HTMLElement>,
   *   getScrollElement: () => Element | undefined,
   *   getThreshold: () => number,
   *   getData: () => unknown[],
   *   getShouldObserveItem: () => (item: unknown, index: number) => boolean,
   *   onItemVisible: (key: string) => void,
   * }} config
   */
  constructor(config) {
    this.#rows = config.rows;
    this.#getScrollElement = config.getScrollElement;
    this.#getThreshold = config.getThreshold;
    this.#getData = config.getData;
    this.#getShouldObserveItem = config.getShouldObserveItem;
    this.#onItemVisible = config.onItemVisible;
  }

  /** Registers any newly-rendered, eligible row. Call from the composing controller's `hostUpdated()`. */
  schedule() {
    if (this.#disposed) return;
    const observer = this.#ensureObserver();
    if (!observer) return;

    const data = this.#getData();
    const shouldObserveItem = this.#getShouldObserveItem();
    for (const row of this.#rows()) {
      if (this.#observed.has(row)) continue;
      const index = Number(/** @type {HTMLElement} */ (row).dataset.index);
      if (!shouldObserveItem(data[index], index)) continue;
      this.#observed.add(row);
      observer.observe(row);
    }
  }

  /** Created lazily, once — SSR-safe, mirrors `RowMeasurer`'s own `ResizeObserver` guard. */
  #ensureObserver() {
    if (this.#intersectionObserver) return this.#intersectionObserver;
    if (typeof IntersectionObserver === "undefined") return null;
    this.#intersectionObserver = new IntersectionObserver(this.#handleIntersect, {
      root: this.#getScrollElement(),
      threshold: this.#getThreshold(),
    });
    document.addEventListener("visibilitychange", this.#handleVisibilityChange);
    return this.#intersectionObserver;
  }

  #handleIntersect = (/** @type {IntersectionObserverEntry[]} */ entries) => {
    if (document.visibilityState !== "visible") return;
    for (const entry of entries) this.#reportIfIntersecting(entry);
  };

  #handleVisibilityChange = () => {
    if (document.visibilityState !== "visible" || !this.#intersectionObserver) return;
    for (const entry of this.#intersectionObserver.takeRecords()) this.#reportIfIntersecting(entry);
  };

  /** @param {IntersectionObserverEntry} entry */
  #reportIfIntersecting(entry) {
    if (!entry.isIntersecting) return;
    const key = /** @type {HTMLElement} */ (entry.target).dataset.itemKey;
    if (key !== undefined) this.#onItemVisible(key);
  }

  /** Drops observer registrations for rows that left the DOM. Call from the row `ref` on removal. */
  releaseRows() {
    if (!this.#intersectionObserver) return;
    for (const row of this.#observed) {
      if (row.isConnected) continue;
      this.#observed.delete(row);
      this.#intersectionObserver.unobserve(row);
    }
  }

  /** Forgets which rows are observed; the observer itself is re-armed lazily on the next `schedule()`. */
  reset() {
    this.#disposed = false;
    this.#observed.clear();
    this.#teardownObserver();
  }

  /** Tears the observer and listener down; call from `hostDisconnected`. */
  dispose() {
    this.#disposed = true;
    this.#observed.clear();
    this.#teardownObserver();
  }

  #teardownObserver() {
    this.#intersectionObserver?.disconnect();
    this.#intersectionObserver = null;
    document.removeEventListener("visibilitychange", this.#handleVisibilityChange);
  }
}
