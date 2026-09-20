import { RowMeasurer } from "./RowMeasurer.js";

/**
 * Real-DOM counterpart to `VirtualListController` + `StickToBottom`, for `noVirtualization` mode —
 * every row already exists in the DOM at its real height, so there is nothing to window. Two problems
 * remain, ported from a reference `<infinity-scroll>` component (no virtualization,
 * `MutationObserver`-driven):
 *
 *  - **anchor restoration on prepend**: before any DOM change, remember the first row still
 *    intersecting the scroll element's top edge and its offset from it; after the change, re-apply
 *    that offset so a prepend doesn't shove the row the user is reading off screen.
 *  - **stick to bottom**: while the user is within `buffer` px of the bottom, growth at the end keeps
 *    the view pinned there. Reuses the existing `buffer` prop rather than a second threshold, so it
 *    doubles as the same "near the bottom" band that already gates `onAwayFromBottomChange`.
 *
 * The reference's own rows are plain, synchronously-rendered elements, so it can safely read their
 * layout the instant its `MutationObserver` fires. This package's rows are usually `<chx-message>` (or
 * a consumer's own custom element), which renders on a *microtask* — reading `getBoundingClientRect()`
 * in the same task a freshly-prepended row was inserted can see a height of **0**, which corrupts the
 * anchor's captured offset and produces a visibly wrong restore once the row actually renders. So a
 * mutation doesn't reconcile immediately; it hands off to {@link RowMeasurer} (the same readiness
 * engine the virtualized path uses, generalized to serve both) and only reconciles once the affected
 * rows are confirmed ready — see `.claude/plans/messages/no-virtualization.md`. A `ResizeObserver`
 * firing needs no such gate: by definition, whatever it reports has already rendered for real.
 *
 * Unlike the virtualized quartet, nothing here needs a per-render `sync()` — the observers already
 * react to every DOM change on their own. `observe()` only needs calling once elements exist (safe to
 * call from every `hostUpdated`, a no-op once observing has already started).
 *
 * `onReconciled` fires every time `#reconcile()` runs — mutation-triggered (after the readiness gate
 * above) or resize-triggered, always with `scrollTop` in its genuinely settled, post-correction state.
 * `InfinityScrollController` uses it as the *only* place it checks `LoadMoreController.maybeLoad()` in
 * this mode — confirmed live (via a stack trace) that checking directly from `hostUpdated()` instead
 * races this same correction and reads a stale value, causing a real, duplicate `onLoadMore()` call.
 */
export class PlainListController {
  /** @type {() => Element | undefined} */
  #getScrollElement;
  /** @type {() => Element | undefined} */
  #getCanvasElement;
  /** @type {() => Iterable<HTMLElement>} */
  #rows;
  /** @type {() => number} */
  #getBuffer;
  /** @type {(awayFromBottom: boolean) => void} */
  #onAwayFromBottomChange;
  /** @type {() => void} */
  #onReconciled;
  #measurer;

  /** @type {{element: HTMLElement, offset: number} | null} */
  #anchor = null;
  #prevScrollTop = 0;
  #prevScrollHeight = 0;
  /** Whether the last recompute found the view within `buffer` of the true bottom. */
  #atBottom = true;
  /** Whether `observe()` has ever successfully started — gates the one-time initial pin dance. */
  #everStarted = false;

  /** @type {MutationObserver | null} */
  #mutationObserver = null;
  /** @type {ResizeObserver | null} */
  #resizeObserver = null;
  /** @type {number | null} */
  #scrollFrame = null;
  #disposed = false;

  /**
   * @param {{
   *   getScrollElement: () => Element | undefined,
   *   getCanvasElement: () => Element | undefined,
   *   rows: () => Iterable<HTMLElement>,
   *   getBuffer: () => number,
   *   onAwayFromBottomChange: (awayFromBottom: boolean) => void,
   *   onReconciled?: () => void,
   * }} config
   */
  constructor(config) {
    this.#getScrollElement = config.getScrollElement;
    this.#getCanvasElement = config.getCanvasElement;
    this.#rows = config.rows;
    this.#getBuffer = config.getBuffer;
    this.#onAwayFromBottomChange = config.onAwayFromBottomChange;
    this.#onReconciled = config.onReconciled ?? (() => {});
    this.#measurer = new RowMeasurer({
      rows: config.rows,
      // real DOM already has its real height once ready — nothing to cache, unlike the virtualizer
      onRowReady: () => {},
      // ...and so nothing keyed by index either: a row confirmed ready stays ready through the
      // index shift every prepend causes. See RowMeasurer's own doc for why that matters here.
      recheckOnIndexChange: false,
      afterMeasure: () => this.#reconcile(),
    });
  }

  // -------------------------------------------------------------- lifecycle

  /**
   * Idempotent — starts observing the first time the canvas element exists. On the very first start,
   * optimistically pins to the bottom and baselines the anchor (harmless even if today's rows haven't
   * rendered yet — see the class doc — since a not-yet-rendered row has no height to correct for
   * yet), then hands off to {@link RowMeasurer} to catch up once they actually have. On a later start
   * (a reconnect after `dispose()`), just re-pins if the view was at the bottom before — re-attaching
   * a detached element resets `scrollTop`, same as the reference's own `connectedCallback`.
   */
  observe() {
    if (this.#disposed || this.#mutationObserver) return;
    const canvas = this.#getCanvasElement();
    if (!canvas) return;

    this.#mutationObserver = new MutationObserver(this.#handleMutation);
    this.#mutationObserver.observe(canvas, { childList: true, subtree: true, characterData: true });

    this.#resizeObserver = new ResizeObserver(this.#handleResize);
    const scrollElement = this.#getScrollElement();
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

  /** Re-arms after a reconnect — the teardown in `dispose()` disconnected the observers. */
  reset() {
    this.#disposed = false;
    this.#measurer.reset();
    this.observe();
  }

  /** Tears the observers down and cancels any pending frame; call from `hostDisconnected`. */
  dispose() {
    this.#disposed = true;
    this.#measurer.dispose();
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cancelScrollFrame();
  }

  /** Releases this instance's row-readiness tracking for a row that left the DOM — call from the
   *  host's row `ref`, same trigger `InfinityScrollController.releaseRows()` already uses. */
  releaseRows() {
    this.#measurer.releaseRows();
  }

  // ---------------------------------------------------------------- commands

  /**
   * Recomputes `atBottom` against `buffer` and fires `onAwayFromBottomChange` on an actual flip —
   * call synchronously from the scroll handler, so a stale value can't let a later reconcile yank the
   * view back down mid-gesture.
   */
  handleScroll = () => {
    this.#updateAtBottom();
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.captureAnchor();
    });
  };

  /**
   * Jump or glide to the newest content. `"auto"` also re-engages the bottom pin synchronously; a
   * smooth/instant scroll leaves that to the next `handleScroll` once the gesture settles.
   * @param {"auto" | "smooth" | "instant"} [behavior]
   */
  scrollToBottom(behavior = "auto") {
    const el = this.#getScrollElement();
    if (!el) return;
    if (behavior === "auto") {
      el.scrollTop = el.scrollHeight;
      this.#setAtBottom(true);
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  }

  /** @param {number} offset @param {{behavior?: "auto" | "smooth" | "instant"}} [options] */
  scrollToOffset(offset, options = {}) {
    const el = this.#getScrollElement();
    if (!el) return;
    el.scrollTo({ top: offset, behavior: options.behavior ?? "auto" });
  }

  /** @returns {number | undefined} */
  getScrollOffset() {
    return this.#getScrollElement()?.scrollTop;
  }

  /** Plain-DOM counterpart to the virtualizer's `getOffsetForIndex` — the scrollTop that puts the row's
   * edge at the viewport edge, read straight off the real DOM. `undefined` when the row isn't found.
   * @param {number} index @param {"start" | "center" | "end"} [align] @returns {number | undefined} */
  getOffsetForIndex(index, align = "start") {
    const el = this.#getScrollElement();
    const row = this.#findRow(index);
    if (!el || !row) return undefined;
    const viewportRect = el.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    let delta;
    if (align === "center") delta = rowRect.top - viewportRect.top - (el.clientHeight - rowRect.height) / 2;
    else if (align === "end") delta = rowRect.bottom - viewportRect.bottom;
    else delta = rowRect.top - viewportRect.top;
    return el.scrollTop + delta;
  }

  /**
   * Scrolls the row at `index` into view — the plain-DOM counterpart to the virtualizer's own
   * `scrollToIndex`, resolved via `[data-index]` instead of an offset lookup table.
   * @param {number} index
   * @param {{align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}} [options]
   */
  scrollToIndex(index, options = {}) {
    const el = this.#getScrollElement();
    const row = this.#findRow(index);
    if (!el || !row) return;

    const { align = "start", behavior = "auto" } = options;
    const viewportRect = el.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    let delta;
    if (align === "center") {
      delta = rowRect.top - viewportRect.top - (el.clientHeight - rowRect.height) / 2;
    } else if (align === "end") {
      delta = rowRect.bottom - viewportRect.bottom;
    } else if (align === "auto") {
      const aboveTop = rowRect.top < viewportRect.top;
      const belowBottom = rowRect.bottom > viewportRect.bottom;
      if (!aboveTop && !belowBottom) return; // already fully visible
      delta = aboveTop ? rowRect.top - viewportRect.top : rowRect.bottom - viewportRect.bottom;
    } else {
      delta = rowRect.top - viewportRect.top; // "start"
    }

    el.scrollTo({ top: el.scrollTop + delta, behavior });
    this.captureAnchor();
  }

  /**
   * Remembers the current reading position — the first row still intersecting the scroll element's
   * top edge, and its offset from it. Called automatically on scroll and after every observed DOM
   * change; exposed for callers that mutate content in ways the observers cannot see ahead of.
   * @returns {{element: HTMLElement, offset: number} | null}
   */
  captureAnchor() {
    const el = this.#getScrollElement();
    if (!el) return null;

    this.#prevScrollTop = el.scrollTop;
    this.#prevScrollHeight = el.scrollHeight;

    const items = Array.from(this.#rows());
    if (items.length === 0) {
      this.#anchor = null;
      return null;
    }

    const viewportTop = el.getBoundingClientRect().top;

    // Rows are laid out in document order, so their edges are monotonic: binary-search for the
    // first one whose bottom is still in the viewport.
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
    this.#anchor = { element, offset: element.getBoundingClientRect().top - viewportTop };
    return this.#anchor;
  }

  /**
   * Re-applies the captured anchor. After content is inserted above the viewport this puts the
   * previously visible row back under the user's eyes.
   */
  restoreAnchor() {
    const el = this.#getScrollElement();
    if (!el) return;

    const anchor = this.#anchor;
    if (anchor && anchor.element.isConnected) {
      const viewportTop = el.getBoundingClientRect().top;
      const current = anchor.element.getBoundingClientRect().top - viewportTop;
      const delta = current - anchor.offset;
      if (Math.abs(delta) > 0.5) el.scrollTop += delta;
      return;
    }

    // The anchored row is gone (replaced rather than reused, e.g. an unkeyed re-render). Fall back
    // to the height difference, which only describes growth above the viewport.
    if (!this.#atBottom) {
      const delta = el.scrollHeight - this.#prevScrollHeight;
      if (delta !== 0) el.scrollTop = this.#prevScrollTop + delta;
    }
  }

  // ---------------------------------------------------------------- internals

  /**
   * Deliberately does not reconcile inline — see the class doc. Handing off to `RowMeasurer` means
   * the eventual `#reconcile()` (via `afterMeasure`) runs against the *pre-mutation* anchor baseline,
   * once the newly-inserted rows are confirmed to have real layout, instead of re-baselining against
   * a transiently-collapsed one.
   */
  #handleMutation = () => {
    if (this.#disposed) return;
    // A capture queued by an in-flight scroll gesture is still pending on the *same* frame this
    // mutation's reconcile will use, and rAF runs them in request order — so it would land after the
    // prepend and re-baseline onto the already-shifted layout, leaving `restoreAnchor()` with a zero
    // delta and the reading position jumped. Drop it; `#reconcile()` re-captures once corrected.
    this.#cancelScrollFrame();
    this.#measurer.schedule();
  };

  /** A resize means the reported box already reflects real, settled layout — no readiness gate
   *  needed, unlike a mutation (see the class doc). */
  #handleResize = () => {
    if (this.#disposed) return;
    this.#reconcile();
  };

  /** Either hold the bottom or hold the reading position — then re-baseline against the new layout. */
  #reconcile() {
    if (this.#atBottom) {
      this.scrollToBottom();
    } else {
      this.restoreAnchor();
    }
    this.captureAnchor();
    this.#updateAtBottom();
    this.#onReconciled();
  }

  #cancelScrollFrame() {
    if (this.#scrollFrame === null) return;
    cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = null;
  }

  /** @param {number} index @returns {HTMLElement | undefined} */
  #findRow(index) {
    for (const row of this.#rows()) {
      if (Number(row.dataset.index) === index) return row;
    }
    return undefined;
  }

  #updateAtBottom() {
    const el = this.#getScrollElement();
    // no scroll element yet counts as "at the bottom", so an initial load never flashes the affordance
    const distance = el ? el.scrollHeight - el.clientHeight - el.scrollTop : 0;
    this.#setAtBottom(distance <= this.#getBuffer());
  }

  /** @param {boolean} atBottom */
  #setAtBottom(atBottom) {
    if (this.#atBottom === atBottom) return;
    this.#atBottom = atBottom;
    this.#onAwayFromBottomChange(!atBottom);
  }
}
