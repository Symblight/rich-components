import { distanceToBottom } from "../../utils/dom.js";

/** px of leftover gap under which the view rests at the bottom */
const EPSILON = 1;
/** frames the size must hold steady at the bottom before the lock hands off */
const SETTLE_FRAMES = 5;
/** ms after which the lock gives up — content that never settles (a stream) can't hold it */
const MAX_MS = 2000;

/**
 * @typedef {{
 *   getScrollElement: () => Element | undefined,
 *   getVirtualizer: () => any,
 * }} InitialBottomLockConfig
 */

/**
 * Holds the first load at the bottom. Rows are measured in one batch, so the canvas reaches full
 * height in a single late jump the virtualizer's reconcile can't catch, leaving the first paint short
 * of the bottom. Until the size settles, a rAF loop re-pins each frame; a user gesture ends it early.
 */
export class InitialBottomLock {
  /** @type {InitialBottomLockConfig} */
  #config;
  /** @type {number | null} */
  #frame = null;
  #started = false;
  #done = false;
  #lastTotalSize = -1;
  #settleFrames = 0;
  #startedAt = 0;

  /** @param {InitialBottomLockConfig} config */
  constructor(config) {
    this.#config = config;
  }

  get active() {
    return this.#started && !this.#done;
  }

  /** Runs once per element: a no-op after the lock started, or after an `end()` that came first. */
  start() {
    if (this.#started || this.#done) return;
    this.#started = true;
    this.#startedAt = performance.now();
    this.#frame = requestAnimationFrame(this.#tick);
  }

  end() {
    this.#done = true;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  /** Call from `hostUpdated`: re-pins against this render's committed canvas, before paint. */
  pinCurrentFrame() {
    if (!this.active) return;
    const el = this.#config.getScrollElement();
    if (el && distanceToBottom(el) > EPSILON) {
      this.#config.getVirtualizer().scrollToEnd({ behavior: "auto" });
    }
  }

  #tick = () => {
    this.#frame = null;
    if (this.#done) return;

    const el = this.#config.getScrollElement();
    if (!el) {
      this.#frame = requestAnimationFrame(this.#tick);
      return;
    }

    const virtualizer = this.#config.getVirtualizer();
    const total = virtualizer.getTotalSize();
    const distance = distanceToBottom(el);
    if (distance > EPSILON) virtualizer.scrollToEnd({ behavior: "auto" });
    if (performance.now() - this.#startedAt >= MAX_MS) {
      this.end();
      return;
    }

    if (total === this.#lastTotalSize && distance <= EPSILON) {
      if (++this.#settleFrames >= SETTLE_FRAMES) {
        this.end();
        return;
      }
    } else {
      this.#settleFrames = 0;
      this.#lastTotalSize = total;
    }
    this.#frame = requestAnimationFrame(this.#tick);
  };
}
