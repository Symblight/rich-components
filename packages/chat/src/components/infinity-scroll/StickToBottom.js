/**
 * Covers the one case `anchorTo: "end"` + `followOnAppend` don't handle on their own: a prepend
 * landing while the viewport isn't full yet — older items arrive, the content finally overflows,
 * and the anchor leaves the view pinned to the top instead of the bottom. Everything else (resize
 * compensation, following new tail items while pinned) is the virtualizer's own job.
 */
export class StickToBottom {
  #getVirtualizer;
  #getBuffer;

  atBottom = true;

  /** @param {{getVirtualizer: () => any, getBuffer: () => number}} config */
  constructor(config) {
    this.#getVirtualizer = config.getVirtualizer;
    this.#getBuffer = config.getBuffer;
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
   */
  follow() {
    const virtualizer = this.#getVirtualizer();
    if (!this.atBottom) return;

    // Never argue with a gesture in progress — without this guard, the first pixels of an upward
    // scroll still read as "at the bottom" and this would pull the view straight back down.
    if (virtualizer.isScrolling || virtualizer.scrollDirection === "backward") return;

    if (virtualizer.isAtEnd()) return;
    virtualizer.scrollToEnd();
  }
}
