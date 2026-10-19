import { RowMeasurer } from "../../components/infinity-scroll/RowMeasurer.js";
import { VERY_BOTTOM } from "../../components/infinity-scroll/BottomLatch.js";
import { distanceToBottom } from "../../utils/dom.js";

/** Share of the remaining distance a smooth follow covers per 60Hz frame — an ease-out that keeps up with growth. */
const FOLLOW_EASE = 0.25;

/**
 * @typedef {"auto" | "smooth" | "instant"} Behavior
 * @typedef {import("../../components/infinity-scroll/BottomLatch.js").BottomLatch} BottomLatch
 * @typedef {{element: HTMLElement, offset: number, bottomOffset: number, index: string | undefined}} Anchor
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getCanvasElement: () => Element | undefined,
 *   rows: () => Iterable<HTMLElement>,
 *   getBuffer: () => number,
 *   onReconciled?: () => void,
 *   getFollowing?: () => boolean,
 *   getFollowBehavior?: () => Behavior,
 *   getEndElement?: () => Element | undefined,
 *   beforeReconcile?: () => void,
 *   latch: BottomLatch,
 *   isPaused?: () => boolean,
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
  #prevClientHeight = 0;
  #prevClientWidth = 0;
  /** @type {BottomLatch} */
  #latch;
  /** `observe()` has started once — gates the initial pin */
  #everStarted = false;

  /** @type {MutationObserver | null} */
  #mutationObserver = null;
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;
  /** @type {number | null} */
  #scrollFrame = null;
  /** @type {number | null} */
  #followFrame = null;
  #followTime = 0;
  /** rows mutated since the last scroll event — see `takeContentChanged()` */
  #contentChanged = false;
  #disposed = false;

  /** @param {PlainListConfig} config */
  constructor(config) {
    this.#config = config;
    this.#latch = config.latch;
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
      if (this.#latch.atBottom) this.scrollToBottom();
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
    this.stopFollow();
  }

  releaseRows() {
    this.#measurer.releaseRows();
  }

  /** Call from the scroll handler, after the latch read the event. */
  handleScroll = () => {
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.captureAnchor();
    });
  };

  /**
   * Rests the content's end at the bottom edge. Not `scrollHeight`: pin-top's reserved space sits
   * below the end, and landing there shows a blank screen.
   * @param {Behavior} [behavior]
   */
  scrollToBottom(behavior = "auto") {
    const el = this.#config.getScrollElement();
    if (!el) return;
    // set up front: a smooth scroll is still on its way, and must not read as having left the bottom
    this.#latch.atBottom = true;
    if (behavior === "smooth") {
      this.#startFollow();
      return;
    }
    this.stopFollow();
    el.scrollTo({ top: this.#bottomOffset(el), behavior });
  }

  /** Whether rows mutated since the last call — once per scroll event, for `BottomLatch`. */
  takeContentChanged() {
    const changed = this.#contentChanged;
    this.#contentChanged = false;
    return changed;
  }

  /** A user gesture took over: our animated follow is no longer ours to finish. */
  stopFollow() {
    if (this.#followFrame !== null) cancelAnimationFrame(this.#followFrame);
    this.#followFrame = null;
  }

  /** After a gesture's grace ran out without leaving the bottom: catch up with what grew meanwhile. */
  resumeFollow() {
    const el = this.#config.getScrollElement();
    if (!el || !this.#latch.atBottom || !(this.#config.getFollowing?.() ?? true)) return;
    if (Math.abs(el.scrollTop - this.#bottomOffset(el)) > 1) this.#followToBottom();
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
    this.#prevClientHeight = el.clientHeight;
    this.#prevClientWidth = el.clientWidth;

    const items = this.#rowList();
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

    const element = /** @type {HTMLElement} */ (items[found >= 0 ? found : items.length - 1]);
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
    if (!this.#latch.atBottom) {
      const delta = el.scrollHeight - this.#prevScrollHeight;
      if (delta !== 0) el.scrollTop = this.#prevScrollTop + delta;
    }
  }

  /** Waits for row readiness instead of reconciling inline, against the pre-mutation anchor. */
  #handleMutation = () => {
    if (this.#disposed) return;
    this.#contentChanged = true;
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
    const el = this.#config.getScrollElement();
    // first: a moved pin changes the reserved min-height, which the skip below must see
    this.#config.beforeReconcile?.();
    // nothing moved since the last baseline: a streamed chunk that didn't wrap a line, or the
    // resize half of a change its mutation already reconciled
    if (el && this.#unchangedSinceCapture(el)) return;
    if (this.#latch.atBottom && (this.#config.getFollowing?.() ?? true)) {
      // a programmatic scroll cancels the browser's wheel animation — the gesture's scroll decides
      if (!this.#config.isPaused?.()) this.#followToBottom();
    } else {
      this.restoreAnchor();
      // layout alone never rejoins from inside `buffer` — that's where a user's upward scroll rests
      const distance = el ? distanceToBottom(el) : 0;
      if (distance > this.#config.getBuffer()) this.#latch.atBottom = false;
      else if (distance <= VERY_BOTTOM) this.#latch.atBottom = true;
    }
    if (el) this.#latch.baseline(el);
    this.captureAnchor();
    this.#config.onReconciled?.();
  }

  /**
   * Smooth only follows growth that starts within a viewport of the bottom. Catching up from
   * farther (rows that just got their height on first render) jumps: animating it shows the top
   * first, and it's the scroll position `onReconciled`'s load check reads straight after.
   */
  #followToBottom() {
    const el = this.#config.getScrollElement();
    if (!el) return;
    const smooth = (this.#config.getFollowBehavior?.() ?? "auto") === "smooth";
    const near = this.#bottomOffset(el) - el.scrollTop <= el.clientHeight;
    this.scrollToBottom(smooth && near ? "smooth" : "auto");
  }

  /**
   * Smooth scrolling is ours, one `scrollTop` step per frame from wherever the view is toward a target
   * re-read every frame. A native smooth `scrollTo` doesn't survive a layout jump mid-animation (see
   * `BottomLatch`), which streaming content causes in WebKit (confirmed live); ours just carries on.
   */
  #startFollow() {
    if (this.#followFrame !== null) return;
    this.#followTime = performance.now();
    this.#followFrame = requestAnimationFrame(this.#followStep);
  }

  /** @param {number} now */
  #followStep = (now) => {
    this.#followFrame = null;
    const el = this.#config.getScrollElement();
    if (!el || this.#disposed || !this.#latch.atBottom || this.#config.isPaused?.()) return;
    const remaining = this.#bottomOffset(el) - el.scrollTop;
    if (remaining <= 0.5) {
      if (remaining < -0.5) el.scrollTop += remaining; // the end moved up past us
      return;
    }
    const ease = 1 - Math.pow(1 - FOLLOW_EASE, (now - this.#followTime) / (1000 / 60));
    this.#followTime = now;
    const before = el.scrollTop;
    el.scrollTop += Math.min(remaining, Math.max(1, remaining * ease));
    // clamped: the next reconcile restarts it once the content has grown
    if (el.scrollTop <= before) return;
    this.#followFrame = requestAnimationFrame(this.#followStep);
  };

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

  /** @param {Element} el */
  #unchangedSinceCapture(el) {
    const anchor = this.#anchor;
    if (
      !anchor?.element.isConnected ||
      el.scrollTop !== this.#prevScrollTop ||
      el.scrollHeight !== this.#prevScrollHeight ||
      el.clientHeight !== this.#prevClientHeight ||
      el.clientWidth !== this.#prevClientWidth
    ) {
      return false;
    }
    // a row above can move the anchor with scrollHeight held by pin-top's reserved min-height
    const offset = anchor.element.getBoundingClientRect().top - el.getBoundingClientRect().top;
    return Math.abs(offset - anchor.offset) <= 0.5;
  }

  /** Live and indexable — the canvas holds nothing but rows, so no `querySelectorAll` copy of all N.
   *  @returns {ArrayLike<Element>} */
  #rowList() {
    return this.#config.getCanvasElement()?.children ?? [];
  }

  /** @param {number} index @returns {HTMLElement | undefined} */
  #findRow(index) {
    // every row is rendered in order, so its position is its index
    const row = /** @type {HTMLElement | undefined} */ (this.#rowList()[index]);
    if (row && Number(row.dataset.index) === index) return row;
    for (const row of this.#config.rows()) {
      if (Number(row.dataset.index) === index) return row;
    }
    return undefined;
  }

  /** @param {Element} el */
  #bottomOffset(el) {
    const max = el.scrollHeight - el.clientHeight;
    const end = this.#config.getEndElement?.();
    if (!end) return max;
    const padding = parseFloat(getComputedStyle(el).paddingBlockEnd) || 0;
    const endBottom =
      end.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop;
    return Math.min(max, Math.max(0, endBottom + padding - el.clientHeight));
  }
}
