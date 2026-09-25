/** px from the top edge at which `onLoadMore` is called. */
const LOAD_THRESHOLD = 450;

/**
 * Decides *when* to ask for an older page. Fetching itself is the consumer's `onLoadMore` — awaited
 * directly (same contract as v2, unlike v1's fire-and-forget `chx-load-more` event). Owns `loading`;
 * the host mirrors it for rendering.
 *
 * Does **not** auto-chain another `maybeLoad()` after a load completes, even for a page that leaves
 * `scrollTop` still under `LOAD_THRESHOLD` (e.g. one shorter than the viewport) — an earlier version
 * did, via its own `requestAnimationFrame(() => this.maybeLoad())`, but that re-check ran before the
 * list's own scroll-position correction for the just-landed page could land (deferred a frame or more
 * under `noVirtualization`, see `PlainListController`), so it routinely read a stale, still-near-top
 * `scrollTop` and fired a second, spurious fetch — confirmed live by removing exactly that block.
 * Whatever legitimate re-check a short page still needs happens through the host's own normal
 * `hostUpdated()`/scroll-driven `maybeLoad()` calls instead, once a real render/scroll event happens
 * to land after the correction — not guaranteed as eager, but never spuriously wrong.
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

  /** Item count at which a load produced nothing — blocks a re-check until the list actually
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
      }
    }
  }

  /** re-arms the loader after the host is re-attached to the DOM */
  revive() {
    this.#disposed = false;
    this.#blockedAtCount = null;
  }

  /** Stops `maybeLoad()` acting past this point. */
  dispose() {
    this.#disposed = true;
  }
}
