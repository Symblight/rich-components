/** px from the top edge at which `onLoadMore` is called. */
const LOAD_THRESHOLD = 450;

/**
 * Decides *when* to ask for an older page. Fetching itself is the consumer's `onLoadMore` — awaited
 * directly (same contract as v2, unlike v1's fire-and-forget `chx-load-more` event), so a page
 * shorter than the viewport can keep auto-chaining until it either fills the view or the source
 * reports `hasMore: false`. Owns `loading`; the host mirrors it for rendering.
 */
export class LoadMoreController {
  /** @type {() => Element | undefined} */
  #getScrollElement;
  /** @type {() => unknown[]} */
  #getData;
  /** @type {() => boolean} */
  #getHasMore;
  /** @type {() => () => Promise<unknown>} */
  #getOnLoadMore;
  /** @type {() => Promise<unknown>} */
  #settled;
  /** @type {(type: string, detail?: unknown) => void} */
  #emit;

  /** @type {number | null} */
  #frame = null;
  /** Item count at which a load produced nothing — blocks the auto-chain until the list actually
   *  changes, rather than until the offset happens to move. @type {number | null} */
  #blockedAtCount = null;
  #disposed = false;

  /** Whether a page fetch is in flight — the host mirrors this for rendering. */
  loading = false;

  /**
   * @param {{
   *   getScrollElement: () => Element | undefined,
   *   getData: () => unknown[],
   *   getHasMore: () => boolean,
   *   getOnLoadMore: () => () => Promise<unknown>,
   *   settled: () => Promise<unknown>,
   *   emit: (type: string, detail?: unknown) => void,
   * }} config
   */
  constructor(config) {
    this.#getScrollElement = config.getScrollElement;
    this.#getData = config.getData;
    this.#getHasMore = config.getHasMore;
    this.#getOnLoadMore = config.getOnLoadMore;
    this.#settled = config.settled;
    this.#emit = config.emit;
  }

  /**
   * Safe to call from anywhere, as often as you like: `loading` is set synchronously before the
   * first await, so it cannot run twice at once.
   */
  async maybeLoad() {
    if (this.#disposed || this.loading || !this.#getHasMore()) return;

    const count = this.#getData().length;
    if (this.#blockedAtCount === count) return;

    const el = this.#getScrollElement();
    if ((el ? el.scrollTop : Infinity) > LOAD_THRESHOLD) return;

    this.#blockedAtCount = null;
    this.loading = true;
    this.#emit("chx-load-more-start");

    try {
      await this.#getOnLoadMore()();
    } catch (error) {
      if (!this.#disposed) {
        // an unheard error would otherwise stop the list growing in silence
        console.error("[chx-infinity-scroll] onLoadMore failed", error);
        this.#emit("chx-load-more-error", error);
      }
    } finally {
      this.loading = false;

      // everything past here touches the host, so a disconnect stops it
      if (!this.#disposed) await this.#settled();
      if (!this.#disposed) {
        this.#emit("chx-load-more-end");
        const grown = this.#getData().length > count;
        this.#blockedAtCount = grown ? null : this.#getData().length;
        // a page shorter than the viewport has to keep filling
        this.#frame = requestAnimationFrame(() => {
          this.#frame = null;
          this.maybeLoad();
        });
      }
    }
  }

  /** re-arms the loader after the host is re-attached to the DOM */
  revive() {
    this.#disposed = false;
    this.#blockedAtCount = null;
  }

  /** Cancels any pending re-chain frame and stops `maybeLoad()` acting past this point. */
  dispose() {
    this.#disposed = true;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }
}
