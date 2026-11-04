import { VirtualizerController } from "@tanstack/lit-virtual";

/** First guess for a row's height (2.25rem, default density); real heights are measured after render. */
const ESTIMATED_ROW_SIZE = 36;
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
  /** Row kept rendered even when scrolled out (the focused one), or -1. */
  #pinnedIndex = -1;
  /** @type {() => number} */
  #getFocusedIndex;
  /** @type {WeakSet<Element>} */
  #measured = new WeakSet();
  /** @type {(index: number) => HTMLElement | null} */
  #rowElement;

  /**
   * @param {import("../base/tree-view.js").TvxTreeView} host
   * @param {() => import("./tree-model-controller.js").TreeRow[]} getRows
   * @param {() => number} getFocusedIndex this row stays rendered even when scrolled out, so focus isn't lost
   * @param {(index: number) => HTMLElement | null} rowElement host seam: the rendered row at `index`
   */
  constructor(host, getRows, getFocusedIndex, rowElement) {
    this.host = host;
    this.#getFocusedIndex = getFocusedIndex;
    this.#rowElement = rowElement;
    this.#controller = new VirtualizerController(host, {
      count: 0,
      enabled: false,
      getScrollElement: () => host,
      // TanStack types the key as string | number, but only uses it as a Map key — symbols work
      getItemKey: (index) => /** @type {any} */ (getRows()[index]?.key ?? index),
      estimateSize: () => ESTIMATED_ROW_SIZE,
      overscan: OVERSCAN,
      // Measuring inside the observer's callback re-renders the rows there, which resizes what it
      // observes: the browser reports "ResizeObserver loop completed". A frame later it doesn't.
      useAnimationFrameWithResizeObserver: true,
      rangeExtractor: (range) => withPinned(range, -1),
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
    const pinned = enabled ? this.#getFocusedIndex() : -1;
    const { options } = virtualizer;
    if (options.enabled !== enabled || options.count !== count || pinned !== this.#pinnedIndex) {
      this.#pinnedIndex = pinned;
      // TanStack caches the range until the scroll range changes; a new extractor forces a recompute
      const rangeExtractor = (/** @type {any} */ range) => withPinned(range, pinned);
      virtualizer.setOptions({ ...options, enabled, count, rangeExtractor });
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

  /** Scrolls row `index` into view — by default just enough to show it. `"smooth"` drops to
   * `"auto"` under `prefers-reduced-motion`.
   * @param {number} index
   * @param {import("../types/api.js").TvxScrollToItemOptions} [options] */
  scrollToIndex(index, { align = "nearest", behavior = "auto" } = {}) {
    if (behavior === "smooth" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      behavior = "auto";
    }
    if (this.enabled) {
      this.#virtualizer.scrollToIndex(index, {
        align: align === "nearest" ? "auto" : align,
        behavior,
      });
    } else {
      this.#rowElement(index)?.scrollIntoView({ block: align, behavior });
    }
  }
}

/** TanStack's default range (visible rows + overscan), plus `pinned` if it lies outside it.
 * @param {{ startIndex: number, endIndex: number, overscan: number, count: number }} range
 * @param {number} pinned
 * @returns {number[]} */
function withPinned({ startIndex, endIndex, overscan, count }, pinned) {
  const start = Math.max(startIndex - overscan, 0);
  const end = Math.min(endIndex + overscan, count - 1);
  const indexes = [];
  for (let i = start; i <= end; i++) indexes.push(i);
  if (pinned >= 0 && pinned < count && (pinned < start || pinned > end)) {
    indexes.push(pinned);
    indexes.sort((a, b) => a - b);
  }
  return indexes;
}
