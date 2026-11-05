/** px from the top edge at which `onLoadMore` is called. */
const LOAD_THRESHOLD = 450;
/** first retry delay after a failed load, doubled per consecutive failure up to `RETRY_MAX` */
const RETRY_BASE = 1000;
const RETRY_MAX = 30000;

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
 * exception is a failed load's retry, a doubling backoff that holds every re-check until it fires.
 */
export class LoadMoreController {
  /** @type {LoadMoreConfig} */
  #config;
  /** Count at which a load produced nothing — blocks re-checks until the list changes. @type {number | null} */
  #blockedAtCount = null;
  #disposed = false;
  #failures = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #retryTimer = null;
  /** Bumped by `reset()`: a load started before it no longer speaks for what the list shows. */
  #generation = 0;

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
    if (this.#blockedAtCount === count || this.#retryTimer !== null) return;

    const el = config.getScrollElement();
    if ((el ? el.scrollTop : Infinity) > LOAD_THRESHOLD) return;

    this.#blockedAtCount = null;
    this.loading = true;
    const generation = this.#generation;
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
      if (generation === this.#generation) this.loading = false;
      if (!this.#disposed) await config.settled();
      if (!this.#disposed && generation === this.#generation) {
        config.emit("chx-load-more-end");
        const length = config.getData().length;
        // a failure isn't "nothing older" — backoff instead of blocking until the list changes
        if (failed) this.#scheduleRetry();
        else {
          this.#failures = 0;
          this.#blockedAtCount = length > count ? null : length;
        }
      }
    }
  }

  #scheduleRetry() {
    const delay = Math.min(RETRY_BASE * 2 ** this.#failures++, RETRY_MAX);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.maybeLoad();
    }, delay);
  }

  /** The list now shows other content (a conversation switch): nothing learned so far applies. */
  reset() {
    this.#generation++;
    this.loading = false;
    this.#blockedAtCount = null;
    this.#failures = 0;
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  /** Re-arms after the host is re-attached. */
  revive() {
    this.#disposed = false;
    this.#blockedAtCount = null;
    this.#failures = 0;
  }

  dispose() {
    this.#disposed = true;
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }
}
