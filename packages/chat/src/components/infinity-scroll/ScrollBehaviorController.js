import { ResizeController } from "./ResizeController.js";
import { IntersectionController } from "./IntersectionController.js";

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/** Fired when the list should try to load more data — listened for by `chx-chat` via `PaginationController`. */
export const LOAD_MORE_EVENT = "chx-load-more";

/**
 * Scroll position for a virtualized list: stick-to-bottom auto-follow, load-more detection, and —
 * only when `anchorStart: false` — its own prepend-anchor preservation and resize-driven end-anchor
 * compensation (in default mode the virtualizer natively owns both). Fires `LOAD_MORE_EVENT` only,
 * no adapter/cursor. Keyed via `itemKey`, targets `[data-item-key]` wrapper elements.
 * @implements {ReactiveController}
 */
export class ScrollBehaviorController {
  #host;
  #getScrollElement;
  #getData;
  #itemKey;
  #scrollToIndex;
  #getScrollBehavior;
  #getBuffer;
  #onAwayFromBottomChange;
  #getAnchorStart;
  #awayFromBottom = false;
  /** @type {unknown[] | undefined} */
  #previousData;
  /** Armed by `hostUpdate()` on a data change, consumed by the very next `hostUpdated()`. @type {{type: "bottom"} | {type: "anchor", key: string | number, offsetFromBottom: number} | undefined} */
  #pendingCorrection;
  /** @type {HTMLElement | undefined} */
  #scrollListenerAttachedTo;
  /** @type {number | undefined} */
  #previousViewportHeight;

  /**
   * @param {ReactiveControllerHost & HTMLElement} host
   * @param {{
   *   getScrollElement: () => HTMLElement | undefined,
   *   getViewportElement: () => Element | null | undefined,
   *   getSentinel: () => Element | null | undefined,
   *   getData: () => unknown[],
   *   itemKey: (item: unknown, index: number) => string | number,
   *   scrollToIndex: (index: number, options?: {align?: "auto" | "start" | "center" | "end", behavior?: "auto" | "smooth" | "instant"}) => void,
   *   getScrollBehavior?: () => "auto" | "smooth",
   *   getBuffer?: () => number,
   *   onAwayFromBottomChange?: (awayFromBottom: boolean) => void,
   *   getAnchorStart?: () => "start" | false,
   * }} options
   */
  constructor(
    host,
    {
      getScrollElement,
      getViewportElement,
      getSentinel,
      getData,
      itemKey,
      scrollToIndex,
      getScrollBehavior,
      getBuffer,
      onAwayFromBottomChange,
      getAnchorStart,
    },
  ) {
    this.#host = host;
    this.#getScrollElement = getScrollElement;
    this.#getData = getData;
    this.#itemKey = itemKey;
    this.#scrollToIndex = scrollToIndex;
    this.#getScrollBehavior = getScrollBehavior ?? (() => "auto");
    this.#getBuffer = getBuffer ?? (() => 150);
    this.#onAwayFromBottomChange = onAwayFromBottomChange ?? (() => {});
    this.#getAnchorStart = getAnchorStart ?? (() => "start");
    host.addController(this);

    // Sentinel intersection under-fires for a short list that never stops intersecting it — the
    // resize-driven #checkOverflow below is the fallback.
    new IntersectionController(host, {
      target: getSentinel,
      root: getScrollElement,
      rootMargin: "1000px 0px 0px 0px",
      onIntersect: () => this.#dispatchLoadMore(),
    });

    new ResizeController(host, {
      target: getViewportElement,
      onResize: (entries) => {
        if (this.#getAnchorStart() !== "start") this.#compensateEndAnchor(entries);
        this.#checkOverflow();
        this.#updateAwayFromBottom();
      },
    });
  }

  /** No scroll element yet counts as "at the bottom" too, so an initial load lands at the newest item. */
  #isScrolledToBottom() {
    const el = this.#getScrollElement();
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= this.#getBuffer();
  }

  /** Recomputes away-from-bottom and fires `onAwayFromBottomChange` only on an actual flip. */
  #updateAwayFromBottom() {
    const away = !this.#isScrolledToBottom();
    if (away === this.#awayFromBottom) return;
    this.#awayFromBottom = away;
    this.#onAwayFromBottomChange(away);
  }

  /**
   * Public jump-to-bottom; no-op on an empty list. `behavior` overrides `getScrollBehavior` for this call.
   * @param {"auto" | "smooth" | "instant"} [behavior]
   */
  scrollToBottom(behavior) {
    const data = this.#getData();
    if (data.length === 0) return;
    this.#scrollToIndex(data.length - 1, { align: "end", behavior: behavior ?? this.#getScrollBehavior() });
    this.#host.dispatchEvent(new CustomEvent("chx-scroll-to-bottom", { bubbles: true, composed: true }));
  }

  #dispatchLoadMore() {
    this.#host.dispatchEvent(new CustomEvent(LOAD_MORE_EVENT, { bubbles: true, composed: true }));
  }

  #checkOverflow() {
    const scroller = this.#getScrollElement();
    if (scroller && scroller.scrollHeight <= scroller.clientHeight) this.#dispatchLoadMore();
  }

  /**
   * Keeps the scroll glued to the bottom as the viewport grows — used instead of the virtualizer's
   * own compensation when `anchorStart: false`. DOM-only: reads the viewport's rendered height, no
   * internal offset tracking needed.
   * @param {ResizeObserverEntry[]} entries
   */
  #compensateEndAnchor(entries) {
    const newHeight = entries[entries.length - 1].contentRect.height;
    const previousHeight = this.#previousViewportHeight;
    this.#previousViewportHeight = newHeight;

    const scroller = this.#getScrollElement();
    if (!scroller || previousHeight === undefined) return; // first observation — just seeds the baseline

    const delta = newHeight - previousHeight;
    if (delta === 0) return;

    // scroller.scrollHeight already reflects the grown size — reconstruct the pre-resize value to
    // test "was at the bottom back then". Tight threshold on purpose, unlike #getBuffer's looser
    // one; < 2 rather than <= 1 because scrollTop can be fractional at non-integer zoom/DPR.
    const previousScrollHeight = scroller.scrollHeight - delta;
    const wasAtEnd = previousScrollHeight - scroller.scrollTop - scroller.clientHeight < 2;
    if (wasAtEnd) scroller.scrollTop += delta;
  }

  /**
   * Currently-visible item closest to the top, and its offset from the bottom edge.
   * @returns {{key: string | number, offsetFromBottom: number} | undefined}
   */
  #captureHistoryAnchor() {
    const scroller = this.#getScrollElement();
    if (!scroller) return undefined;
    const containerRect = scroller.getBoundingClientRect();
    for (const el of scroller.querySelectorAll("[data-item-key]")) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) continue; // not visible
      const key = /** @type {HTMLElement} */ (el).dataset.itemKey;
      if (key === undefined) continue;
      return { key, offsetFromBottom: containerRect.bottom - rect.bottom };
    }
    return undefined;
  }

  /**
   * Re-locates the anchor and restores its offset from the bottom; no-ops if not mounted yet.
   * @param {{key: string | number, offsetFromBottom: number}} anchor
   */
  #restoreHistoryAnchor(anchor) {
    const scroller = this.#getScrollElement();
    if (!scroller) return;
    const el = scroller.querySelector(`[data-item-key="${CSS.escape(String(anchor.key))}"]`);
    if (!el) {
      return;
    }
    const containerRect = scroller.getBoundingClientRect();
    const nextOffsetFromBottom = containerRect.bottom - el.getBoundingClientRect().bottom;
    scroller.scrollTop += anchor.offsetFromBottom - nextOffsetFromBottom;
  }

  /** Applies and consumes the pending correction — armed by `hostUpdate()`, applied once per arming. */
  #applyCorrection() {
    const correction = this.#pendingCorrection;
    if (!correction) return;
    this.#pendingCorrection = undefined;
    if (correction.type === "anchor") {
      this.#restoreHistoryAnchor(correction);
    } else {
      this.scrollToBottom();
    }
  }

  /** Attaches the away-from-bottom `scroll` listener once the scroller exists. */
  #ensureScrollListener() {
    const el = this.#getScrollElement();
    if (!el || el === this.#scrollListenerAttachedTo) return;
    el.addEventListener("scroll", this.#handleScroll, { passive: true });
    this.#scrollListenerAttachedTo = el;
  }

  #handleScroll = () => {
    this.#updateAwayFromBottom();
  };

  /** willUpdate timing — snapshots scroll intent before this pass's new `data` render. */
  hostUpdate() {
    this.#ensureScrollListener();
    const data = this.#getData();
    if (data !== this.#previousData) {
      const stickToBottom = this.#isScrolledToBottom();

      // detected structurally (old first item still present, just shifted) rather than by cause
      const oldFirst = this.#previousData?.[0];
      const oldFirstKey = oldFirst === undefined ? undefined : this.#itemKey(oldFirst, 0);
      const prepended =
        oldFirstKey !== undefined && data.findIndex((item, i) => this.#itemKey(item, i) === oldFirstKey) > 0;

      if (prepended) {
        // Single writer: in default mode the virtualizer's own anchorTo:"end" prepend anchor owns
        // the position — a second DOM-measured delta on top double-corrects (visible double jump
        // under momentum scroll). Anchor manually only where that native mechanism is off.
        const anchor = this.#getAnchorStart() === "start" ? undefined : this.#captureHistoryAnchor();
        this.#pendingCorrection = anchor ? { type: "anchor", ...anchor } : undefined;
      } else if (stickToBottom) {
        this.#pendingCorrection = { type: "bottom" };
      } else {
        this.#pendingCorrection = undefined; // scrolled away — leave position alone entirely
      }
    }
    this.#previousData = data;
  }

  hostUpdated() {
    // correction first — recomputing away-from-bottom before it flickers the state on every append
    this.#applyCorrection();
    this.#updateAwayFromBottom(); // data/size changes can move the bottom distance without a `scroll` event
  }

  hostDisconnected() {
    this.#scrollListenerAttachedTo?.removeEventListener("scroll", this.#handleScroll);
    this.#scrollListenerAttachedTo = undefined;
    // drop pre-disconnect baselines — after a reparent they'd feed stale deltas/diffs
    this.#previousData = undefined;
    this.#previousViewportHeight = undefined;
    this.#pendingCorrection = undefined;
  }
}
