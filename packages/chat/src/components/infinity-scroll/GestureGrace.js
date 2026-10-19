/** ms after a scroll gesture during which a scroll event counts as the user's. */
const USER_SCROLL_GRACE = 200;

/**
 * The window after a user scroll gesture. `recent` marks the scroll events that follow it as the
 * user's; `pause()` holds every follow off until it ends, since a programmatic scroll before the
 * gesture's first scroll event cancels the browser's own wheel animation.
 */
export class GestureGrace {
  /** @type {() => void} */
  #onResume;
  /** @type {ReturnType<typeof setTimeout> | null} */
  #timer = null;
  #lastAt = -Infinity;

  /** @param {() => void} onResume called when a pause ends */
  constructor(onResume) {
    this.#onResume = onResume;
  }

  get paused() {
    return this.#timer !== null;
  }

  /** A scroll gesture started within the grace. */
  get recent() {
    return performance.now() - this.#lastAt < USER_SCROLL_GRACE;
  }

  note() {
    this.#lastAt = performance.now();
  }

  pause() {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#onResume();
    }, USER_SCROLL_GRACE);
  }

  dispose() {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }
}
