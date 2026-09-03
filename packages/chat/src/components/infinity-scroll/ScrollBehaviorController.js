import { ResizeController } from "./ResizeController.js";
import { IntersectionController } from "./IntersectionController.js";

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost} ReactiveControllerHost
 */

/**
 * Fired when the list should try to load more data — listened for by `chx-chat` (via
 * `PaginationController`). A child fires, a parent listens, neither knows the other's internals,
 * same cross-component convention as `chx-send-message`/`chx-messages-change`.
 */
export const LOAD_MORE_EVENT = "chx-load-more";

/**
 * Scroll movement/position for a virtualized list: stick-to-bottom auto-follow, scroll-position
 * preservation across a data prepend, and load-more detection. Knows nothing about pagination
 * beyond firing `LOAD_MORE_EVENT` — no adapter, no cursor, no idea what's listening. Keyed
 * generically via `itemKey`, targets `[data-item-key]` wrapper elements.
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
  #stickToBottom = true;
  #awayFromBottom = false;
  /** @type {unknown[] | undefined} */
  #previousData;
  /** @type {{type: "bottom"} | {type: "anchor", key: string | number, offsetFromBottom: number} | undefined} */
  #pendingCorrection;
  // true only for the render right after hostUpdate() (re-)armed #pendingCorrection — hostUpdated()
  // must not re-apply on every render (e.g. the virtualizer's own scroll-driven ones), only this one
  // plus real ResizeController ticks, or a settled correction fights the user's own scroll forever
  #justArmed = false;
  #bottomEventFired = false; // fires chx-scroll-to-bottom once per correction, not once per pass
  /** @type {HTMLElement | undefined} */
  #scrollListenerAttachedTo;

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
    host.addController(this);

    // Two load-more triggers: an IntersectionObserver on the sentinel, and a ResizeObserver on the
    // viewport firing an overflow check (scrollHeight <= clientHeight) — needed since intersection
    // only fires on a ratio *change*, so a short list that never stops intersecting the sentinel
    // would otherwise under-fire.
    new IntersectionController(host, {
      target: getSentinel,
      root: getScrollElement,
      rootMargin: "40px 0px 0px 0px", // start loading a bit before the sentinel is at the edge
      onIntersect: () => this.#dispatchLoadMore(),
    });

    new ResizeController(host, {
      target: getViewportElement,
      onResize: () => {
        this.#applyCorrection();
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

  /**
   * Recomputes the away-from-bottom boolean (same `buffer` threshold as `#isScrolledToBottom`) and
   * fires `onAwayFromBottomChange` only on an actual flip — the "jump to latest" affordance's own
   * visibility gate, latched the same way `TypingController` latches typing state.
   */
  #updateAwayFromBottom() {
    const away = !this.#isScrolledToBottom();
    if (away === this.#awayFromBottom) return;
    this.#awayFromBottom = away;
    this.#onAwayFromBottomChange(away);
  }

  /**
   * Public — lets an app force this (e.g. a "jump to latest" button). No-op on an empty list.
   * `behavior`, if passed, overrides `getScrollBehavior` for this one call — the affordance button
   * carries its own `scrollBehavior` independent of the list's automatic stick-to-bottom follow.
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
   * Currently-visible item closest to the top, and its offset from the scroller's bottom edge —
   * distance-from-bottom, not top, since a prepend only ever inserts content above it.
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
   * Re-locates the anchor and restores its saved offset from the bottom. No-ops if not mounted yet
   * — resolved on a later tick once it is.
   * @param {{key: string | number, offsetFromBottom: number}} anchor
   */
  #restoreHistoryAnchor(anchor) {
    const scroller = this.#getScrollElement();
    if (!scroller) return;
    const el = scroller.querySelector(`[data-item-key="${anchor.key}"]`);
    if (!el) {
      return;
    }
    const containerRect = scroller.getBoundingClientRect();
    const nextOffsetFromBottom = containerRect.bottom - el.getBoundingClientRect().bottom;
    scroller.scrollTop += anchor.offsetFromBottom - nextOffsetFromBottom;
  }

  /**
   * Applies whatever correction is pending — called once right after it's armed (`hostUpdated()`)
   * and again on every real viewport resize (`ResizeController`). `"anchor"` never self-clears on
   * its own (only `hostUpdate()` or a user interaction clears it) since a small delta one pass
   * doesn't mean content above it is done resizing. `"bottom"` self-clears once actually at the
   * bottom, since its target tracks `scrollHeight` directly with no such indirection.
   */
  #applyCorrection() {
    if (!this.#pendingCorrection) return;
    const correction = this.#pendingCorrection;
    if (correction.type === "anchor") {
      this.#restoreHistoryAnchor(correction);
    } else {
      const data = this.#getData();
      this.#scrollToIndex(data.length - 1, { align: "end", behavior: this.#getScrollBehavior() });
      if (!this.#bottomEventFired) {
        this.#host.dispatchEvent(
          new CustomEvent("chx-scroll-to-bottom", { bubbles: true, composed: true }),
        );
        this.#bottomEventFired = true;
      }
      if (this.#isScrolledToBottom()) this.#pendingCorrection = undefined;
    }
  }

  /**
   * Cancels any pending correction on real user intent (`wheel`/`pointerdown`/`touchstart`), not on
   * a plain `scroll` event — TanStack Virtual's own internal scroll compensation also dispatches
   * `scroll`, which is indistinguishable from a user scroll by value alone. The plain `scroll`
   * listener added alongside it is only for `#updateAwayFromBottom` — that one's fine reacting to
   * TanStack's own compensation scrolls too, since it's just a threshold check, not a cancellation.
   */
  #ensureExternalScrollCancellation() {
    const el = this.#getScrollElement();
    if (!el || el === this.#scrollListenerAttachedTo) return;
    el.addEventListener("wheel", this.#handleUserInteraction, { passive: true });
    el.addEventListener("pointerdown", this.#handleUserInteraction, { passive: true });
    el.addEventListener("touchstart", this.#handleUserInteraction, { passive: true });
    el.addEventListener("scroll", this.#handleScroll, { passive: true });
    this.#scrollListenerAttachedTo = el;
  }

  #handleUserInteraction = () => {
    this.#pendingCorrection = undefined;
  };

  #handleScroll = () => {
    this.#updateAwayFromBottom();
  };

  /** willUpdate timing — snapshots scroll intent before this pass's new `data` render. */
  hostUpdate() {
    this.#ensureExternalScrollCancellation();
    const data = this.#getData();
    if (data !== this.#previousData) {
      this.#justArmed = true;
      this.#stickToBottom = this.#isScrolledToBottom();

      // detected structurally (old first item still present, just shifted) rather than by cause
      const oldFirst = this.#previousData?.[0];
      const oldFirstKey = oldFirst === undefined ? undefined : this.#itemKey(oldFirst, 0);
      const prepended =
        oldFirstKey !== undefined && data.findIndex((item, i) => this.#itemKey(item, i) === oldFirstKey) > 0;

      if (prepended) {
        const anchor = this.#captureHistoryAnchor();
        this.#pendingCorrection = anchor ? { type: "anchor", ...anchor } : undefined;
      } else if (this.#stickToBottom) {
        this.#pendingCorrection = { type: "bottom" };
        this.#bottomEventFired = false;
      } else {
        this.#pendingCorrection = undefined; // scrolled away — leave position alone entirely
      }
    }
    this.#previousData = data;
  }

  hostUpdated() {
    this.#updateAwayFromBottom(); // data/size changes can move the bottom distance without a `scroll` event
    if (!this.#justArmed) return;
    this.#justArmed = false;
    this.#applyCorrection();
  }

  hostDisconnected() {
    this.#scrollListenerAttachedTo?.removeEventListener("wheel", this.#handleUserInteraction);
    this.#scrollListenerAttachedTo?.removeEventListener("pointerdown", this.#handleUserInteraction);
    this.#scrollListenerAttachedTo?.removeEventListener("touchstart", this.#handleUserInteraction);
    this.#scrollListenerAttachedTo?.removeEventListener("scroll", this.#handleScroll);
    this.#scrollListenerAttachedTo = undefined;
  }
}
