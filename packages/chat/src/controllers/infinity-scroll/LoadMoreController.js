/** px from the top edge at which `onLoadMore` is called. */
const LOAD_THRESHOLD = 450;
/** first retry delay after a failed load, doubled per consecutive failure up to `RETRY_MAX` */
const RETRY_BASE = 1000;
const RETRY_MAX = 30000;
/** failures retried on a timer; past that, only the host's next scroll/render re-checks */
const AUTO_RETRIES = 3;

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
 * fired a spurious second fetch. The host's next render/scroll does the re-check instead. The one
 * exception is a failed load's retry timer, which fires a backoff of at least `RETRY_BASE` later.
 */
export class LoadMoreController {
  /** @type {LoadMoreConfig} */
  #config;
  /** Count at which a load produced nothing — blocks re-checks until the list changes. @type {number | null} */
  #blockedAtCount = null;
  #disposed = false;
  #failures = 0;
  /** `performance.now()` before which a failed load isn't retried */
  #retryAt = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #retryTimer = null;

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
    if (performance.now() < this.#retryAt) return;

    const el = config.getScrollElement();
    if ((el ? el.scrollTop : Infinity) > LOAD_THRESHOLD) return;

    this.#blockedAtCount = null;
    this.loading = true;
    config.emit("chx-load-more-start");

    let failed = false;
    try {
      await config.getOnLoadMore()();
    } catch (error) {
      failed = true;
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
        // a failure isn't "nothing older" — backoff instead of blocking until the list changes
        if (failed) this.#scheduleRetry();
        else {
          this.#failures = 0;
          this.#retryAt = 0;
          this.#blockedAtCount = length > count ? null : length;
        }
      }
    }
  }

  #scheduleRetry() {
    const delay = Math.min(RETRY_BASE * 2 ** this.#failures, RETRY_MAX);
    this.#failures++;
    this.#retryAt = performance.now() + delay;
    if (this.#failures > AUTO_RETRIES) return;
    this.#clearRetryTimer();
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.maybeLoad();
    }, delay);
  }

  #clearRetryTimer() {
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  /** Re-arms after the host is re-attached. */
  revive() {
    this.#disposed = false;
    this.#blockedAtCount = null;
    this.#failures = 0;
    this.#retryAt = 0;
  }

  dispose() {
    this.#disposed = true;
    this.#clearRetryTimer();
  }
}
