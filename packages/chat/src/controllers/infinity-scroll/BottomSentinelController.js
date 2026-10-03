/**
 * "Away from the bottom": the content-end element (after the rows and `footer`, before any space
 * `scroll-mode="pin-top"` reserves) is more than `buffer` px below the viewport. Measured by one
 * `IntersectionObserver`, so there's no scroll handler or layout read.
 */
export class BottomSentinelController {
  /** @type {() => Element | undefined} */
  #getScrollElement;
  /** @type {() => Element | undefined} */
  #getSentinel;
  /** @type {() => number} */
  #getBuffer;
  /** @type {(away: boolean) => void} */
  #onChange;
  /** @type {IntersectionObserver | null} */
  #observer = null;
  /** @type {Element | undefined} */
  #observed;
  /** @type {number | undefined} */
  #observedBuffer;
  #away = false;

  /**
   * @param {{
   *   getScrollElement: () => Element | undefined,
   *   getSentinel: () => Element | undefined,
   *   getBuffer: () => number,
   *   onChange: (away: boolean) => void,
   * }} config
   */
  constructor(config) {
    this.#getScrollElement = config.getScrollElement;
    this.#getSentinel = config.getSentinel;
    this.#getBuffer = config.getBuffer;
    this.#onChange = config.onChange;
  }

  /** Idempotent — (re)observes only when the sentinel or `buffer` changed. Call from `hostUpdated`. */
  sync() {
    const root = this.#getScrollElement();
    const sentinel = this.#getSentinel();
    const buffer = this.#getBuffer();
    if (!root || !sentinel) return;
    if (this.#observer && this.#observed === sentinel && this.#observedBuffer === buffer) return;

    this.dispose();
    this.#observed = sentinel;
    this.#observedBuffer = buffer;
    this.#observer = new IntersectionObserver(
      ([entry]) => {
        // only *below* the extended viewport is away; above it means reserved blank space is showing
        const away =
          !entry.isIntersecting &&
          entry.boundingClientRect.top > (entry.rootBounds?.bottom ?? Infinity);
        if (away === this.#away) return;
        this.#away = away;
        this.#onChange(away);
      },
      { root, rootMargin: `0px 0px ${buffer}px 0px` },
    );
    this.#observer.observe(sentinel);
  }

  dispose() {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#observed = undefined;
  }
}
