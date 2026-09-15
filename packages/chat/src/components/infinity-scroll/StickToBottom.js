/**
 * Covers the one case `anchorTo: "end"` + `followOnAppend` don't handle on their own: a prepend
 * landing while the viewport isn't full yet — older items arrive, the content finally overflows,
 * and the anchor leaves the view pinned to the top instead of the bottom. Everything else (resize
 * compensation, following new tail items while pinned) is the virtualizer's own job.
 */
export class StickToBottom {
  /** @type {() => any} */
  #getVirtualizer;
  /** @type {() => number} */
  #getBuffer;

  /** Whether the last `refresh()` found the view within `buffer` of the true bottom. */
  atBottom = true;
  /** last seen `getTotalSize()`, so `follow()` only acts on an actual increase. @type {number} */
  #lastTotalSize = -1;

  /** @param {{getVirtualizer: () => any, getBuffer: () => number}} config */
  constructor(config) {
    this.#getVirtualizer = config.getVirtualizer;
    this.#getBuffer = config.getBuffer;
  }

  /** Forget the last known size — call on reconnect, so a stale pre-disconnect snapshot can't be
   *  mistaken for growth that happened while detached. */
  reset() {
    this.#lastTotalSize = -1;
  }

  /**
   * Re-reads the offset through the virtualizer's own end test — call on every scroll event. Uses the
   * host's `buffer` (the same "near the bottom" band that gates the away-from-bottom affordance) so a
   * new message still auto-follows anywhere the affordance would stay hidden, matching v1.
   */
  refresh() {
    this.atBottom = this.#getVirtualizer().isAtEnd(this.#getBuffer());
  }

  /**
   * Re-follows the end when content grew out from under us without a scroll event to flip
   * `atBottom` — e.g. a prepend that just made the list taller than the viewport.
   *
   * `atBottom` (computed with `buffer`, a lenient "still counts as near the bottom" band) and the
   * `isAtEnd()` check below (the virtualizer's own tight `scrollEndThreshold`) disagree whenever the
   * scrollable range sits between the two — resting anywhere in that band would otherwise get
   * `scrollToEnd()`'d on every render/remeasure, not just when content actually grew. Gating on a
   * real size increase since the last call closes that gap without touching either threshold.
   */
  follow() {
    const virtualizer = this.#getVirtualizer();

    // cheap and memoized on the virtual-core side — safe to read unconditionally so the comparison
    // never lags behind a size change that happened while `atBottom` was false
    const total = virtualizer.getTotalSize();
    const grew = total > this.#lastTotalSize;
    this.#lastTotalSize = total;

    if (!this.atBottom || !grew) return;

    // Never argue with a gesture in progress — without this guard, the first pixels of an upward
    // scroll still read as "at the bottom" and this would pull the view straight back down.
    if (virtualizer.isScrolling || virtualizer.scrollDirection === "backward") return;

    if (virtualizer.isAtEnd()) return;
    virtualizer.scrollToEnd();
  }
}
