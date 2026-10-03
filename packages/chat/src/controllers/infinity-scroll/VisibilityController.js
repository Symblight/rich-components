/**
 * @typedef {{
 *   rows: () => Iterable<HTMLElement>,
 *   getScrollElement: () => Element | undefined,
 *   getThreshold: () => number,
 *   getData: () => unknown[],
 *   getShouldObserveItem: () => (item: unknown, index: number) => boolean,
 *   onItemVisible: (key: string) => void,
 * }} VisibilityConfig
 */

/**
 * Calls `onItemVisible(key)` on every row's `false → true` intersection (dedup is one layer up, in
 * `ReadTrackingController`). Ignored while the tab is hidden; `takeRecords()` on return catches rows
 * that stayed intersecting the whole time.
 */
export class VisibilityController {
  /** @type {VisibilityConfig} */
  #config;
  /** @type {IntersectionObserver | null} */
  #observer = null;
  /** @type {Set<Element>} */
  #observed = new Set();
  #disposed = false;

  /** @param {VisibilityConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Registers newly rendered, eligible rows — once each. Call from `hostUpdated`. */
  schedule() {
    if (this.#disposed) return;
    const observer = this.#ensureObserver();
    if (!observer) return;

    const data = this.#config.getData();
    const shouldObserveItem = this.#config.getShouldObserveItem();
    for (const row of this.#config.rows()) {
      if (this.#observed.has(row)) continue;
      const index = Number(row.dataset.index);
      if (!shouldObserveItem(data[index], index)) continue;
      this.#observed.add(row);
      observer.observe(row);
    }
  }

  /** Drops rows that left the DOM. Call from the row `ref` on removal. */
  releaseRows() {
    if (!this.#observer) return;
    for (const row of this.#observed) {
      if (row.isConnected) continue;
      this.#observed.delete(row);
      this.#observer.unobserve(row);
    }
  }

  /** The observer is re-armed lazily on the next `schedule()`. */
  reset() {
    this.#disposed = false;
    this.#observed.clear();
    this.#teardown();
  }

  dispose() {
    this.#disposed = true;
    this.#observed.clear();
    this.#teardown();
  }

  /** Lazy, once — SSR-safe. */
  #ensureObserver() {
    if (this.#observer) return this.#observer;
    if (typeof IntersectionObserver === "undefined") return null;
    this.#observer = new IntersectionObserver(this.#handleIntersect, {
      root: this.#config.getScrollElement(),
      threshold: this.#config.getThreshold(),
    });
    document.addEventListener("visibilitychange", this.#handleVisibilityChange);
    return this.#observer;
  }

  /** @param {IntersectionObserverEntry[]} entries */
  #handleIntersect = (entries) => {
    if (document.visibilityState !== "visible") return;
    for (const entry of entries) this.#report(entry);
  };

  #handleVisibilityChange = () => {
    if (document.visibilityState !== "visible" || !this.#observer) return;
    for (const entry of this.#observer.takeRecords()) this.#report(entry);
  };

  /** @param {IntersectionObserverEntry} entry */
  #report(entry) {
    if (!entry.isIntersecting) return;
    const key = /** @type {HTMLElement} */ (entry.target).dataset.itemKey;
    if (key !== undefined) this.#config.onItemVisible(key);
  }

  #teardown() {
    this.#observer?.disconnect();
    this.#observer = null;
    document.removeEventListener("visibilitychange", this.#handleVisibilityChange);
  }
}
