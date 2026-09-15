/**
 * Feeds rendered rows to the virtualizer for measurement.
 *
 * A row is measured on insert and whenever a prepend shifted its index; the virtualizer's own
 * ResizeObserver keeps it current afterwards, so rows already measured at their current index are
 * skipped before any layout is read.
 *
 * The delicate part is *when* a row may be measured. `renderItem` usually returns a custom element
 * (`<chx-message>` or a consumer's own), which renders on a microtask — measuring it in the same
 * task records a height of **0**, and that cached 0 turns the eventual real measurement into a
 * *re-measurement*, which the virtualizer does not compensate for while scrolling up. The list then
 * jumps by one estimate on every prepend.
 *
 * So readiness is awaited from real signals rather than polled:
 *  - an un-upgraded custom element → `customElements.whenDefined()`
 *  - a `ReactiveElement` that has not rendered yet → its `updateComplete`
 *  - a hidden subtree, or a custom element still filling in → parked on a ResizeObserver, which
 *    fires the moment it gains a box
 *
 * Measurement itself always happens in the animation frame, so it stays batched regardless of which
 * signal woke it up.
 */
export class RowMeasurer {
  /** @type {{virtualizer: any}} */
  #list;
  /** @type {() => Iterable<HTMLElement>} */
  #rows;
  /** @type {() => void} */
  #afterMeasure;
  /** el -> index it was last measured at. @type {WeakMap<Element, number>} */
  #measured = new WeakMap();
  /** rows with a readiness promise in flight. @type {WeakSet<Element>} */
  #awaiting = new WeakSet();
  /** Rows waiting on the observer for a box — a real Set, not a WeakSet: the observer holds them
   *  strongly anyway, so they have to be unobservable by iteration when they leave the DOM.
   *  @type {Set<Element>} */
  #parked = new Set();
  /** @type {ResizeObserver | null} */
  #observer = null;
  /** @type {number | null} */
  #frame = null;
  #disposed = false;

  /**
   * @param {{virtualizer: any}} list
   * @param {{rows: () => Iterable<HTMLElement>, afterMeasure: () => void}} config
   */
  constructor(list, config) {
    this.#list = list;
    this.#rows = config.rows;
    this.#afterMeasure = config.afterMeasure;
  }

  /** Queues a measurement pass for the next animation frame; a no-op while one's already pending. */
  schedule() {
    if (this.#disposed || this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#measure();
      this.#afterMeasure();
    });
  }

  /** Measures every ready, not-yet-measured-at-its-current-index row. */
  #measure() {
    const virtualizer = this.#list.virtualizer;
    /** @type {[HTMLElement, number][]} */
    const todo = [];

    // Two passes on purpose: `measureElement` can write `scrollTop` (the virtualizer compensating
    // for a size change), which invalidates the layout reads below. Collect first, measure after.
    for (const row of this.#rows()) {
      const index = Number(row.dataset.index);
      if (this.#measured.get(row) === index) continue;
      if (this.#isReady(row)) todo.push([row, index]);
    }

    for (const [row, index] of todo) {
      this.#measured.set(row, index);
      virtualizer.measureElement(row);
    }
  }

  /**
   * Decides whether measuring `row` right now would tell the truth, and arranges a wake-up when it
   * would not.
   * @param {HTMLElement} row
   */
  #isReady(row) {
    if (row.offsetHeight > 0) return true;

    // No box at all: an ancestor is display:none, or a content-visibility subtree is being
    // skipped. Its size is not knowable yet.
    if (!this.#isVisible(row)) {
      this.#park(row);
      return false;
    }

    const pending = this.#pendingChild(row);
    if (pending) {
      this.#awaitChild(row, pending);
      return false;
    }

    // Laid out, zero tall, nothing left to render: either a genuinely empty row or a custom element
    // still filling itself in by means we cannot observe. Trust plain markup, park anything custom
    // rather than cache a 0.
    if (row.firstElementChild?.localName.includes("-")) {
      this.#park(row);
      return false;
    }

    return true;
  }

  /**
   * `checkVisibility` distinguishes "has no box" from "laid out but zero tall", which
   * `offsetHeight` alone cannot. The fallback probe works because rows are absolutely positioned,
   * so `offsetParent` is only null when an ancestor is `display: none`.
   * @param {HTMLElement} row
   */
  #isVisible(row) {
    if (typeof row.checkVisibility === "function") {
      return row.checkVisibility({ contentVisibilityAuto: true });
    }
    return row.offsetParent !== null;
  }

  /** @param {HTMLElement} row @returns {Element | null} a child whose rendering can still be awaited */
  #pendingChild(row) {
    const child = row.firstElementChild;
    if (!child) return null;
    // not upgraded yet — its definition may still be loading
    if (child.localName.includes("-") && !customElements.get(child.localName)) return child;
    // ReactiveElement contract: upgraded, but has never rendered
    if (/** @type {any} */ (child).hasUpdated === false) return child;
    return null;
  }

  /** Awaits `child`'s readiness signal, then re-schedules a measurement pass.
   *  @param {HTMLElement} row @param {Element} child */
  async #awaitChild(row, child) {
    if (this.#awaiting.has(row)) return;
    this.#awaiting.add(row);
    try {
      const tag = child.localName;
      if (tag.includes("-") && !customElements.get(tag)) {
        await customElements.whenDefined(tag);
      }
      if (typeof /** @type {any} */ (child).updateComplete?.then === "function") {
        await /** @type {any} */ (child).updateComplete;
      }
    } catch {
      // a definition that never loads, or a child that threw while rendering, must not wedge the
      // rest of the list
    } finally {
      this.#awaiting.delete(row);
    }
    // the row may have been recycled or removed while we waited; the next pass re-decides from
    // scratch
    if (this.#disposed || !row.isConnected) return;
    this.schedule();
  }

  /** Registers `row` with the resize observer so it's measured once it gains a box.
   *  @param {Element} row */
  #park(row) {
    if (this.#parked.has(row)) return;
    const observer = this.#resizeObserver();
    if (!observer) return;
    this.#parked.add(row);
    observer.observe(row, { box: "border-box" });
  }

  /** Created on demand and only where the API exists, so importing this module stays safe on a server. */
  #resizeObserver() {
    if (this.#observer) return this.#observer;
    if (typeof ResizeObserver === "undefined") return null;
    this.#observer = new ResizeObserver((entries) => {
      if (this.#disposed) return;
      let woke = false;
      for (const entry of entries) {
        // read the reported box rather than the DOM: touching layout inside a ResizeObserver
        // callback is what provokes its feedback-loop warning
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height <= 0) continue;
        this.#parked.delete(entry.target);
        this.#observer?.unobserve(entry.target);
        woke = true;
      }
      if (woke) this.schedule();
    });
    return this.#observer;
  }

  /**
   * Drops the virtualizer's ResizeObserver registrations for rows that have left the DOM. Its
   * element cache holds every row it ever measured, and this is the only call that prunes it.
   * Driven by the host's row `ref`, which fires exactly when a row is removed.
   */
  releaseRows() {
    this.#list.virtualizer.measureElement(null);
    if (!this.#observer) return;
    // a parked row that left the DOM would otherwise be retained by the observer for the life of
    // this instance
    for (const row of this.#parked) {
      if (row.isConnected) continue;
      this.#parked.delete(row);
      this.#observer.unobserve(row);
    }
  }

  /**
   * Forgets which rows were measured, so they are registered again. Required on reconnect: tearing
   * the virtualizer down disconnects its ResizeObserver, leaving surviving rows unobserved.
   */
  reset() {
    this.#disposed = false;
    this.#measured = new WeakMap();
    this.#parked.clear();
    this.#observer?.disconnect();
  }

  /** Tears the observer down and cancels any pending frame; call from `hostDisconnected`. */
  dispose() {
    this.#disposed = true;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#parked.clear();
    this.#observer?.disconnect();
    this.releaseRows();
  }
}
