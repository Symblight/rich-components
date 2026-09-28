import { VirtualizerController } from "@tanstack/lit-virtual";

/** First guess for a row's height (2.25rem + gap); real heights are measured after render. */
const ESTIMATED_ROW_SIZE = 38;
const OVERSCAN = 10;

/**
 * Renders only the visible rows, via `@tanstack/lit-virtual`. The host element is the scroll
 * container. `noVirtualization` switches the virtualizer off and every row is rendered.
 */
export class VirtualizationController {
  /** @type {any} */
  #controller;
  /** @type {unknown[] | null} */
  #lastRows = null;
  /** @type {WeakSet<Element>} */
  #measured = new WeakSet();

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {() => import("./tree-model-controller.js").TreeRow[]} getRows
   * @param {() => number} getFocusedIndex this row stays rendered even when scrolled out, so focus isn't lost
   */
  constructor(host, getRows, getFocusedIndex) {
    this.host = host;
    this.#controller = new VirtualizerController(host, {
      count: 0,
      enabled: false,
      getScrollElement: () => host,
      // TanStack types the key as string | number, but only uses it as a Map key — symbols work
      getItemKey: (index) => /** @type {any} */ (getRows()[index]?.key ?? index),
      estimateSize: () => ESTIMATED_ROW_SIZE,
      overscan: OVERSCAN,
      rangeExtractor: (range) => {
        const indexes = [];
        const start = Math.max(range.startIndex - range.overscan, 0);
        const end = Math.min(range.endIndex + range.overscan, range.count - 1);
        for (let i = start; i <= end; i++) indexes.push(i);

        const focused = getFocusedIndex();
        if (focused >= 0 && focused < range.count && (focused < start || focused > end)) {
          indexes.push(focused);
          indexes.sort((a, b) => a - b);
        }
        return indexes;
      },
    });
  }

  get #virtualizer() {
    return this.#controller.getVirtualizer();
  }

  get enabled() {
    return !this.host.noVirtualization;
  }

  /** Call before every render with the current rows. @param {unknown[]} rows */
  sync(rows) {
    const virtualizer = this.#virtualizer;
    const enabled = this.enabled;
    const count = enabled ? rows.length : 0;
    if (virtualizer.options.enabled !== enabled || virtualizer.options.count !== count) {
      virtualizer.setOptions({ ...virtualizer.options, enabled, count });
    }
    // row keys are read through a stable `getItemKey`, so new rows must invalidate TanStack's cache
    if (enabled && rows !== this.#lastRows) virtualizer.itemSizeCacheVersion++;
    this.#lastRows = rows;
  }

  /** Rows to render: `{ index, start }`, where `start` is the row's top offset in px. */
  visibleRows() {
    return /** @type {{ index: number, start: number }[]} */ (this.#virtualizer.getVirtualItems());
  }

  totalSize() {
    return /** @type {number} */ (this.#virtualizer.getTotalSize());
  }

  /** Measures newly rendered rows once; TanStack's ResizeObserver tracks them afterwards.
   * @param {Iterable<Element>} elements */
  measure(elements) {
    if (!this.enabled) return;
    let measuredNew = false;
    for (const el of elements) {
      if (this.#measured.has(el)) continue;
      this.#measured.add(el);
      this.#virtualizer.measureElement(el);
      measuredNew = true;
    }
    if (measuredNew) this.#virtualizer.measureElement(null); // forget rows that were unmounted
  }

  /** Scrolls just enough to show row `index`. @param {number} index */
  scrollToIndex(index) {
    if (this.enabled) this.#virtualizer.scrollToIndex(index, { align: "auto" });
    else this.host.rowElement(index)?.scrollIntoView({ block: "nearest" });
  }
}
