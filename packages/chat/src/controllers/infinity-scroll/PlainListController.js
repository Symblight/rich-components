import { RowMeasurer } from "../../components/infinity-scroll/RowMeasurer.js";
import { distanceToBottom } from "../../utils/dom.js";

/**
 * @typedef {"auto" | "smooth" | "instant"} Behavior
 * @typedef {{element: HTMLElement, offset: number, bottomOffset: number, index: string | undefined}} Anchor
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getCanvasElement: () => Element | undefined,
 *   rows: () => Iterable<HTMLElement>,
 *   getBuffer: () => number,
 *   onReconciled?: () => void,
 *   getFollowing?: () => boolean,
 *   beforeReconcile?: () => void,
 * }} PlainListConfig
 */

/**
 * `noVirtualization` counterpart to `VirtualListController` + `StickToBottom`: every row is real DOM,
 * so it only has to hold the reading position across a prepend (anchor restore) and stick to the
 * bottom within `buffer`. Rows like `<chx-message>` render on a microtask and read as 0px tall in
 * the mutating task, so a mutation reconciles only once `RowMeasurer` confirms the rows are ready.
 * `onReconciled` fires with `scrollTop` settled — the only safe moment for `maybeLoad()` here.
 */
export class PlainListController {
  /** @type {PlainListConfig} */
  #config;
  #measurer;

  /** @type {Anchor | null} */
  #anchor = null;
  #prevScrollTop = 0;
  #prevScrollHeight = 0;
  /** the last recompute found the view within `buffer` of the bottom */
  #atBottom = true;
  /** `observe()` has started once — gates the initial pin */
  #everStarted = false;

  /** @type {MutationObserver | null} */
  #mutationObserver = null;
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;
  /** @type {number | null} */
  #scrollFrame = null;
  #disposed = false;

  /** @param {PlainListConfig} config */
  constructor(config) {
    this.#config = config;
    this.#measurer = new RowMeasurer({
      rows: config.rows,
      // real DOM already has its real height — nothing to cache, and nothing keyed by index
      onRowReady: () => {},
      recheckOnIndexChange: false,
      afterMeasure: () => this.#reconcile(),
    });
  }

  /**
   * Idempotent — starts observing once the canvas exists. The first start pins to the bottom and
   * baselines the anchor; a later one (reconnect) re-pins if it was at the bottom, since
   * re-attaching resets `scrollTop`.
   */
  observe() {
    if (this.#disposed || this.#mutationObserver) return;
    const canvas = this.#config.getCanvasElement();
    if (!canvas) return;

    this.#mutationObserver = new MutationObserver(this.#handleMutation);
    this.#mutationObserver.observe(canvas, { childList: true, subtree: true, characterData: true });

    this.#resizeObserver = new ResizeObserver(this.#handleResize);
    const scrollElement = this.#config.getScrollElement();
    if (scrollElement) this.#resizeObserver.observe(scrollElement);
    this.#resizeObserver.observe(canvas);

    if (this.#everStarted) {
      if (this.#atBottom) this.scrollToBottom();
      this.captureAnchor();
      return;
    }

    this.#everStarted = true;
    this.scrollToBottom();
    this.captureAnchor();
    this.#measurer.schedule();
  }

  /** Re-arms after a reconnect. */
  reset() {
    this.#disposed = false;
    this.#measurer.reset();
    this.observe();
  }

  dispose() {
    this.#disposed = true;
    this.#measurer.dispose();
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cancelScrollFrame();
  }

  releaseRows() {
    this.#measurer.releaseRows();
  }

  /** Call synchronously from the scroll handler, so a stale `atBottom` can't yank the view mid-gesture. */
  handleScroll = () => {
    this.#updateAtBottom();
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.captureAnchor();
    });
  };

  /** `"auto"` also re-engages the bottom pin synchronously. @param {Behavior} [behavior] */
  scrollToBottom(behavior = "auto") {
    const el = this.#config.getScrollElement();
    if (!el) return;
    if (behavior === "auto") {
      el.scrollTop = el.scrollHeight;
      this.#atBottom = true;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  }

  /** @param {number} offset @param {{behavior?: Behavior}} [options] */
  scrollToOffset(offset, options = {}) {
    this.#config
      .getScrollElement()
      ?.scrollTo({ top: offset, behavior: options.behavior ?? "auto" });
  }

  /** @returns {number | undefined} */
  getScrollOffset() {
    return this.#config.getScrollElement()?.scrollTop;
  }

  /** The scrollTop that aligns row `index`. @param {number} index @param {"start" | "center" | "end"} [align] */
  getOffsetForIndex(index, align = "start") {
    const el = this.#config.getScrollElement();
    const row = this.#findRow(index);
    if (!el || !row) return undefined;
    return el.scrollTop + this.#alignDelta(el, row, align);
  }

  /** @param {number} index @param {{align?: "auto" | "start" | "center" | "end", behavior?: Behavior}} [options] */
  scrollToIndex(index, options = {}) {
    const el = this.#config.getScrollElement();
    const row = this.#findRow(index);
    if (!el || !row) return;

    const { align = "start", behavior = "auto" } = options;
    let delta;
    if (align === "auto") {
      const viewportRect = el.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const aboveTop = rowRect.top < viewportRect.top;
      const belowBottom = rowRect.bottom > viewportRect.bottom;
      if (!aboveTop && !belowBottom) return; // already fully visible
      delta = this.#alignDelta(el, row, aboveTop ? "start" : "end");
    } else {
      delta = this.#alignDelta(el, row, align);
    }

    el.scrollTo({ top: el.scrollTop + delta, behavior });
    this.captureAnchor();
  }

  /**
   * Remembers the first row still crossing the viewport's top edge and its offset. Runs on scroll
   * and after every reconcile; exposed for changes the observers can't see ahead of.
   * @returns {Anchor | null}
   */
  captureAnchor() {
    const el = this.#config.getScrollElement();
    if (!el) return null;

    this.#prevScrollTop = el.scrollTop;
    this.#prevScrollHeight = el.scrollHeight;

    const items = Array.from(this.#config.rows());
    if (items.length === 0) {
      this.#anchor = null;
      return null;
    }

    const viewportTop = el.getBoundingClientRect().top;
    // rows are in document order, so edges are monotonic — binary search
    let lo = 0;
    let hi = items.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].getBoundingClientRect().bottom > viewportTop + 0.5) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    const element = items[found >= 0 ? found : items.length - 1];
    const rect = element.getBoundingClientRect();
    this.#anchor = {
      element,
      offset: rect.top - viewportTop,
      bottomOffset: rect.bottom - viewportTop,
      index: element.dataset.index,
    };
    return this.#anchor;
  }

  /** Puts the anchored row back under the reader's eyes. */
  restoreAnchor() {
    const el = this.#config.getScrollElement();
    if (!el) return;

    const anchor = this.#anchor;
    if (anchor && anchor.element.isConnected) {
      const viewportTop = el.getBoundingClientRect().top;
      const rect = anchor.element.getBoundingClientRect();
      // a prepend (index moved) can resize the anchor row at its top (a divider/author line the new
      // neighbour makes redundant), so hold its bottom edge instead
      const heldByBottom = anchor.element.dataset.index !== anchor.index;
      const delta = heldByBottom
        ? rect.bottom - viewportTop - anchor.bottomOffset
        : rect.top - viewportTop - anchor.offset;
      if (Math.abs(delta) > 0.5) el.scrollTop += delta;
      return;
    }

    // anchor row replaced (unkeyed re-render): fall back to growth above the viewport
    if (!this.#atBottom) {
      const delta = el.scrollHeight - this.#prevScrollHeight;
      if (delta !== 0) el.scrollTop = this.#prevScrollTop + delta;
    }
  }

  /** Waits for row readiness instead of reconciling inline, against the pre-mutation anchor. */
  #handleMutation = () => {
    if (this.#disposed) return;
    // a capture queued by an in-flight scroll would land after the prepend and re-baseline onto the
    // shifted layout, zeroing the restore delta — drop it; #reconcile() re-captures
    this.#cancelScrollFrame();
    this.#measurer.schedule();
  };

  /** A resize already reflects settled layout — no readiness gate. */
  #handleResize = () => {
    if (this.#disposed) return;
    this.#reconcile();
  };

  /** Hold the bottom or the reading position, then re-baseline. */
  #reconcile() {
    this.#config.beforeReconcile?.();
    if (this.#atBottom && (this.#config.getFollowing?.() ?? true)) {
      this.scrollToBottom();
    } else {
      this.restoreAnchor();
    }
    this.captureAnchor();
    this.#updateAtBottom();
    this.#config.onReconciled?.();
  }

  /** px to scroll so `row`'s edge meets the viewport's. @param {Element} el @param {HTMLElement} row @param {"start" | "center" | "end"} align */
  #alignDelta(el, row, align) {
    const viewportRect = el.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (align === "center") {
      return rowRect.top - viewportRect.top - (el.clientHeight - rowRect.height) / 2;
    }
    if (align === "end") return rowRect.bottom - viewportRect.bottom;
    return rowRect.top - viewportRect.top;
  }

  #cancelScrollFrame() {
    if (this.#scrollFrame === null) return;
    cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = null;
  }

  /** @param {number} index @returns {HTMLElement | undefined} */
  #findRow(index) {
    for (const row of this.#config.rows()) {
      if (Number(row.dataset.index) === index) return row;
    }
    return undefined;
  }

  #updateAtBottom() {
    const el = this.#config.getScrollElement();
    this.#atBottom = (el ? distanceToBottom(el) : 0) <= this.#config.getBuffer();
  }
}
