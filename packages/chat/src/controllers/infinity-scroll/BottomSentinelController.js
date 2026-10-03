/**
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getSentinel: () => Element | undefined,
 *   getBuffer: () => number,
 *   onChange: (away: boolean) => void,
 * }} BottomSentinelConfig
 */

/**
 * "Away from the bottom": the content-end element (after rows and `footer`, before pin-top's
 * reserved space) is more than `buffer` px below the viewport. One `IntersectionObserver`, no scroll handler.
 */
export class BottomSentinelController {
  /** @type {BottomSentinelConfig} */
  #config;
  /** @type {IntersectionObserver | null} */
  #observer = null;
  /** @type {Element | undefined} */
  #observed;
  /** @type {number | undefined} */
  #observedBuffer;
  #away = false;

  /** @param {BottomSentinelConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Idempotent — re-observes only when the sentinel or `buffer` changed. Call from `hostUpdated`. */
  sync() {
    const root = this.#config.getScrollElement();
    const sentinel = this.#config.getSentinel();
    const buffer = this.#config.getBuffer();
    if (!root || !sentinel) return;
    if (this.#observer && this.#observed === sentinel && this.#observedBuffer === buffer) return;

    this.dispose();
    this.#observed = sentinel;
    this.#observedBuffer = buffer;
    this.#observer = new IntersectionObserver(
      ([entry]) => {
        // only *below* the extended viewport is away; above means reserved blank space is showing
        const away =
          !entry.isIntersecting &&
          entry.boundingClientRect.top > (entry.rootBounds?.bottom ?? Infinity);
        if (away === this.#away) return;
        this.#away = away;
        this.#config.onChange(away);
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
