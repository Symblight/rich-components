/** px from the true bottom that counts as "the very bottom" for resuming the follow. */
const FOLLOW_THRESHOLD = 8;
/** without `scrollend` (Safari < 26) a smooth scroll counts as done after this long with no `scroll` event */
const SCROLL_IDLE_MS = 150;
const SCROLLEND_SUPPORTED = typeof window !== "undefined" && "onscrollend" in window;
const GESTURES = /** @type {const} */ (["wheel", "touchstart", "keydown", "pointerdown"]);
const PINNED_CLASS = "infinity-scroll__content_pinned";

/**
 * `scroll-mode="pin-top"`: scrolls a sent item to the top once and reserves the space below it in
 * CSS (`PINNED_CLASS` + `--_chx-pin-offset`), so layout never clamps the scroll. Also owns whether
 * the list follows new content: off after a pin and on any upward scroll, back on at the very bottom.
 */
export class PinController {
  #config;

  /** @type {string | number | undefined} */
  #pendingKey;
  /** @type {string | number | undefined} */
  #pinnedKey;
  /** @type {number | undefined} */
  #offset;
  #following = true;
  /** our own pin scroll must not count as "the user reached the bottom" — cleared by a real gesture */
  #suppressResume = false;
  /** a smooth pin scroll is in flight */
  #pinning = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #pinningTimer;
  #lastScrollTop = 0;
  /** @type {HTMLElement | undefined} */
  #attachedTo;

  /**
   * @param {{
   *   getScrollElement: () => HTMLElement | undefined,
   *   getContentElement: () => HTMLElement | undefined,
   *   getEnabled: () => boolean,
   *   indexOfKey: (key: string | number) => number,
   *   getOffset: (index: number) => number | undefined,
   *   scrollTo: (offset: number, behavior: "auto" | "smooth" | "instant") => void,
   *   getScrollBehavior: () => "auto" | "smooth" | "instant",
   *   onFollowChange: (following: boolean) => void,
   * }} config
   */
  constructor(config) {
    this.#config = config;
  }

  /** Whether the list should stick to the bottom as content grows — always `true` when disabled. */
  get following() {
    return !this.#config.getEnabled() || this.#following;
  }

  /** A smooth pin scroll is still running, so anchor restoration must not interrupt it. */
  get pinning() {
    return this.#pinning;
  }

  /** Call before the data carrying `key` lands, so the follow is off when the append is seen.
   *  @param {string | number} key */
  pin(key) {
    if (!this.#config.getEnabled()) return;
    this.#pendingKey = key;
    this.#suppressResume = true;
    this.#setFollowing(false);
  }

  /** An explicit jump to the bottom is a request to follow again. */
  noteScrollToBottom() {
    this.#endPinning();
    this.#suppressResume = false;
    this.#setFollowing(true);
  }

  /** Re-reads the pinned row's offset (it moves when older rows are prepended), or drops the pin
   *  once its item is gone or the mode is off. */
  refresh() {
    if (this.#pinnedKey === undefined) return;
    const index = this.#config.getEnabled() ? this.#config.indexOfKey(this.#pinnedKey) : -1;
    if (index < 0) {
      this.#clear();
      return;
    }
    const offset = this.#config.getOffset(index);
    if (offset !== undefined) this.#setOffset(offset);
  }

  /** Call from every host update, once the DOM reflects the current data. */
  update() {
    this.#attach();
    this.refresh();
    if (this.#pendingKey === undefined) return;
    if (!this.#config.getEnabled()) {
      this.#pendingKey = undefined;
      return;
    }
    const index = this.#config.indexOfKey(this.#pendingKey);
    const offset = index < 0 ? undefined : this.#config.getOffset(index);
    if (offset === undefined) return; // not rendered yet — retried on the next update

    this.#pinnedKey = this.#pendingKey;
    this.#pendingKey = undefined;
    this.#setOffset(offset);
    this.#scrollToPin(offset);
  }

  /** Call synchronously from the scroll handler. */
  handleScroll() {
    const el = this.#config.getScrollElement();
    if (!el) return;
    const top = el.scrollTop;
    const scrolledUp = top < this.#lastScrollTop - 0.5;
    this.#lastScrollTop = top;
    if (this.#pinning && !SCROLLEND_SUPPORTED) this.#restartPinningTimer();
    if (!this.#config.getEnabled() || this.#pinning) return;

    const atVeryBottom = el.scrollHeight - el.clientHeight - top <= FOLLOW_THRESHOLD;
    if (scrolledUp) this.#setFollowing(false);
    else if (atVeryBottom && !this.#suppressResume) this.#setFollowing(true);
  }

  dispose() {
    clearTimeout(this.#pinningTimer);
    const el = this.#attachedTo;
    if (!el) return;
    for (const type of GESTURES) el.removeEventListener(type, this.#onGesture);
    el.removeEventListener("scrollend", this.#endPinning);
    this.#attachedTo = undefined;
  }

  /** @param {number} offset */
  #scrollToPin(offset) {
    const el = this.#config.getScrollElement();
    if (!el) return;
    const behavior = this.#config.getScrollBehavior();
    if (behavior === "smooth" && Math.abs(el.scrollTop - offset) > 1) {
      this.#pinning = true;
      if (SCROLLEND_SUPPORTED) el.addEventListener("scrollend", this.#endPinning, { once: true });
      else this.#restartPinningTimer();
    }
    this.#config.scrollTo(offset, behavior);
    this.#lastScrollTop = el.scrollTop;
  }

  /** @param {number} offset */
  #setOffset(offset) {
    if (offset === this.#offset) return;
    this.#offset = offset;
    const content = this.#config.getContentElement();
    content?.classList.add(PINNED_CLASS);
    content?.style.setProperty("--_chx-pin-offset", `${offset}px`);
  }

  #clear() {
    this.#pendingKey = undefined;
    this.#pinnedKey = undefined;
    this.#offset = undefined;
    this.#endPinning();
    this.#suppressResume = false;
    const content = this.#config.getContentElement();
    content?.classList.remove(PINNED_CLASS);
    content?.style.removeProperty("--_chx-pin-offset");
    this.#setFollowing(true);
  }

  /** @param {boolean} following */
  #setFollowing(following) {
    const before = this.following;
    this.#following = following;
    if (this.following !== before) this.#config.onFollowChange(this.following);
  }

  #restartPinningTimer() {
    clearTimeout(this.#pinningTimer);
    this.#pinningTimer = setTimeout(this.#endPinning, SCROLL_IDLE_MS);
  }

  #endPinning = () => {
    this.#pinning = false;
    clearTimeout(this.#pinningTimer);
    this.#pinningTimer = undefined;
  };

  #onGesture = () => {
    this.#suppressResume = false;
    this.#endPinning();
  };

  #attach() {
    const el = this.#config.getScrollElement();
    if (el === this.#attachedTo) return;
    this.dispose();
    if (!el) return;
    this.#attachedTo = el;
    for (const type of GESTURES) el.addEventListener(type, this.#onGesture, { passive: true });
  }
}
