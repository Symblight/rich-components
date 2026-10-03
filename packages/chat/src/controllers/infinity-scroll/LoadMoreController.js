/** px from the top edge at which `onLoadMore` is called. */
const LOAD_THRESHOLD = 450;

/**
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getData: () => unknown[],
 *   getHasMore: () => boolean,
 *   getOnLoadMore: () => () => Promise<unknown>,
 *   settled: () => Promise<unknown>,
 *   emit: (type: string, detail?: unknown) => void,
 * }} LoadMoreConfig
 */

/**
 * Decides *when* to ask for an older page; the consumer's awaited `onLoadMore` fetches it. Never
 * re-checks on its own after a load — that ran before the list's scroll correction landed and
 * fired a spurious second fetch. The host's next render/scroll does the re-check instead.
 */
export class LoadMoreController {
  /** @type {LoadMoreConfig} */
  #config;
  /** Count at which a load produced nothing — blocks re-checks until the list changes. @type {number | null} */
  #blockedAtCount = null;
  #disposed = false;

  /** A page fetch is in flight — mirrored by the host for rendering. */
  loading = false;

  /** @param {LoadMoreConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Safe to call as often as you like: `loading` is set before the first await. */
  async maybeLoad() {
    const config = this.#config;
    if (this.#disposed || this.loading || !config.getHasMore()) return;

    const count = config.getData().length;
    if (this.#blockedAtCount === count) return;

    const el = config.getScrollElement();
    if ((el ? el.scrollTop : Infinity) > LOAD_THRESHOLD) return;

    this.#blockedAtCount = null;
    this.loading = true;
    config.emit("chx-load-more-start");

    try {
      await config.getOnLoadMore()();
    } catch (error) {
      if (!this.#disposed) {
        console.error("[chx-infinity-scroll] onLoadMore failed", error);
        config.emit("chx-load-more-error", error);
      }
    } finally {
      this.loading = false;
      if (!this.#disposed) await config.settled();
      if (!this.#disposed) {
        config.emit("chx-load-more-end");
        const length = config.getData().length;
        this.#blockedAtCount = length > count ? null : length;
      }
    }
  }

  /** Re-arms after the host is re-attached. */
  revive() {
    this.#disposed = false;
    this.#blockedAtCount = null;
  }

  dispose() {
    this.#disposed = true;
  }
}
