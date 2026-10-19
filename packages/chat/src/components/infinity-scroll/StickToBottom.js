/** @import { BottomLatch } from "./BottomLatch.js" */

/**
 * Covers the one case `anchorTo: "end"` + `followOnAppend` don't handle on their own: a prepend
 * landing while the viewport isn't full yet — older items arrive, the content finally overflows,
 * and the anchor leaves the view pinned to the top instead of the bottom. Everything else (resize
 * compensation, following new tail items while pinned) is the virtualizer's own job.
 */
export class StickToBottom {
  /** @type {() => any} */
  #getVirtualizer;
  /** @type {BottomLatch} */
  #latch;
  /** last seen `getTotalSize()`, so `follow()` only acts on an actual increase. @type {number} */
  #lastTotalSize = -1;

  /** @type {() => boolean} */
  #getFollowing;
  /** @type {() => boolean} */
  #isPaused;

  /**
   * An explicit `scrollToBottom()` not yet seen through: `"sent"` until its first scroll event,
   * `"moving"` after. WebKit ends a smooth scroll short when `scrollHeight` shrinks mid-animation,
   * and virtual-core's reconcile only re-aims when its target moves, so `follow()` finishes it.
   * @type {"none" | "sent" | "moving"}
   */
  #request = "none";

  /** @param {{getVirtualizer: () => any, latch: BottomLatch, getFollowing?: () => boolean, isPaused?: () => boolean}} config */
  constructor(config) {
    this.#getVirtualizer = config.getVirtualizer;
    this.#latch = config.latch;
    this.#getFollowing = config.getFollowing ?? (() => true);
    this.#isPaused = config.isPaused ?? (() => false);
  }

  /** Forget the last known size — call on reconnect, so a stale pre-disconnect snapshot can't be
   *  mistaken for growth that happened while detached. */
  reset() {
    this.#lastTotalSize = -1;
  }

  /**
   * Call on every scroll event, after the latch read it — the DOM, not the virtualizer: this
   * listener runs before virtual-core's own, so its offset and direction are still the previous
   * event's. @param {boolean} left this scroll left the bottom
   */
  refresh(left) {
    if (this.#request === "none") return;
    // scrolled up and away: the user's; a clamp from a shrinking scrollHeight lands at the end
    this.#request = left ? "none" : "moving";
  }

  /** A user gesture took over: an unfinished `scrollToBottom()` is no longer ours to finish. */
  cancelRequest() {
    this.#request = "none";
  }

  /** Call on `scrollToBottom()`: once that scroll goes quiet, `follow()` finishes it. */
  requestBottom() {
    this.#request = this.#getVirtualizer().isAtEnd() ? "none" : "sent";
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
    // before the size read, so growth during a gesture's grace still counts once it ends
    if (this.#isPaused()) return;
    const virtualizer = this.#getVirtualizer();

    // cheap and memoized on the virtual-core side — safe to read unconditionally so the comparison
    // never lags behind a size change that happened while `atBottom` was false
    const total = virtualizer.getTotalSize();
    const grew = total > this.#lastTotalSize;
    this.#lastTotalSize = total;

    if (!this.#getFollowing()) {
      this.#request = "none";
      return;
    }
    if (this.#request !== "moving" && !(this.#latch.atBottom && grew)) return;

    // Never argue with a gesture in progress — without this guard, the first pixels of an upward
    // scroll still read as "at the bottom" and this would pull the view straight back down.
    if (virtualizer.isScrolling || virtualizer.scrollDirection === "backward") return;

    this.#request = "none";
    if (virtualizer.isAtEnd()) return;
    virtualizer.scrollToEnd();
  }
}
