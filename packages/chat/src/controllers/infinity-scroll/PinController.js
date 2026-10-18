import { distanceToBottom } from "../../utils/dom.js";

/** px from the true bottom that counts as "the very bottom" for resuming the follow. */
const FOLLOW_THRESHOLD = 8;
/** a smooth scroll counts as done after this long with no `scroll` event (no `scrollend` before Safari 26) */
const SCROLL_IDLE_MS = 150;
/** …or this long before its first one: WebKit can drop a smooth scroll without any event at all */
const SCROLL_START_MS = 500;
/** after landing, the pin is re-checked every frame until it held this many frames in a row… */
const SETTLE_FRAMES = 5;
/** …or this long passed — a timer, since frames can stall (a hidden window runs none) */
const SETTLE_MS = 500;
const SCROLLEND_SUPPORTED = typeof window !== "undefined" && "onscrollend" in window;
const GESTURES = /** @type {const} */ (["wheel", "touchstart", "keydown", "pointerdown"]);
const PINNED_CLASS = "infinity-scroll__content_pinned";

/**
 * @typedef {{
 *   getScrollElement: () => HTMLElement | undefined,
 *   getContentElement: () => HTMLElement | undefined,
 *   getEnabled: () => boolean,
 *   indexOfKey: (key: string | number) => number,
 *   getOffset: (index: number) => number | undefined,
 *   scrollTo: (offset: number, behavior: "auto" | "smooth" | "instant") => void,
 *   getScrollBehavior: () => "auto" | "smooth" | "instant",
 *   onFollowChange: (following: boolean) => void,
 * }} PinConfig
 */

/**
 * `scroll-mode="pin-top"`: scrolls a sent item to the top and reserves the space below it in CSS
 * (`PINNED_CLASS` + `--_chx-pin-offset`), so layout never clamps the scroll. Once the scroll ends it
 * settles: a few frames of re-checking that put the item back if the scroll stopped short, never
 * moved, or rows above it were measured since. A user gesture or `release()` ends that early; after
 * it, nothing moves the view. Also owns whether the list follows new content: off after a pin or
 * any upward scroll, back on at the very bottom.
 */
export class PinController {
  /** @type {PinConfig} */
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
  /** @type {number | null} */
  #settleFrame = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #settleTimer;
  #settledFrames = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #pinningTimer;
  #lastScrollTop = 0;
  /** @type {HTMLElement | undefined} */
  #attachedTo;

  /** @param {PinConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Whether the list should stick to the bottom as content grows — always `true` when disabled. */
  get following() {
    return !this.#config.getEnabled() || this.#following;
  }

  /** The pin scroll or its settle is under way, so anchor restoration must leave the view alone. */
  get landing() {
    return this.#pinning || this.#settleFrame !== null;
  }

  /** Call before the data carrying `key` lands, so the follow is off when the append is seen.
   *  @param {string | number} key */
  pin(key) {
    if (!this.#config.getEnabled()) return;
    this.#stopLanding();
    this.#pendingKey = key;
    this.#suppressResume = true;
    this.#setFollowing(false);
  }

  /** An explicit jump to the bottom is a request to follow again. */
  noteScrollToBottom() {
    this.#stopLanding();
    this.#suppressResume = false;
    this.#setFollowing(true);
  }

  /** The app scrolled somewhere on purpose, so a landing pin must not pull the view back. */
  release() {
    this.#stopLanding();
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
    if (this.#pinning) this.#restartPinningTimer(SCROLL_IDLE_MS);
    if (!this.#config.getEnabled() || this.#pinning) return;

    const atVeryBottom = distanceToBottom(el) <= FOLLOW_THRESHOLD;
    if (scrolledUp) this.#setFollowing(false);
    else if (atVeryBottom && !this.#suppressResume) this.#setFollowing(true);
  }

  dispose() {
    this.#stopLanding();
    const el = this.#attachedTo;
    if (!el) return;
    for (const type of GESTURES) el.removeEventListener(type, this.#onGesture);
    el.removeEventListener("scrollend", this.#onPinScrollEnd);
    this.#attachedTo = undefined;
  }

  /** @param {number} offset */
  #scrollToPin(offset) {
    const el = this.#config.getScrollElement();
    if (!el) return;
    const behavior = this.#config.getScrollBehavior();
    const smooth = behavior === "smooth" && Math.abs(el.scrollTop - offset) > 1;
    if (smooth) {
      this.#pinning = true;
      if (SCROLLEND_SUPPORTED)
        el.addEventListener("scrollend", this.#onPinScrollEnd, { once: true });
      this.#restartPinningTimer(SCROLL_START_MS);
    }
    this.#config.scrollTo(offset, behavior);
    this.#lastScrollTop = el.scrollTop;
    if (!smooth) this.#settle();
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
    this.#stopLanding();
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

  /** @param {number} ms */
  #restartPinningTimer(ms) {
    clearTimeout(this.#pinningTimer);
    this.#pinningTimer = setTimeout(this.#onPinScrollEnd, ms);
  }

  #endPinning() {
    this.#pinning = false;
    clearTimeout(this.#pinningTimer);
    this.#pinningTimer = undefined;
    this.#attachedTo?.removeEventListener("scrollend", this.#onPinScrollEnd);
  }

  /** ended, stopped short or never started — the settle tells them apart */
  #onPinScrollEnd = () => {
    this.#endPinning();
    this.#settle();
  };

  #settle() {
    this.#cancelSettle();
    this.#settledFrames = 0;
    this.#settleFrame = requestAnimationFrame(this.#settleTick);
    this.#settleTimer = setTimeout(() => this.#cancelSettle(), SETTLE_MS);
  }

  #settleTick = () => {
    this.#settleFrame = null;
    this.refresh();
    const el = this.#config.getScrollElement();
    if (!el || this.#pinnedKey === undefined || this.#offset === undefined) {
      this.#cancelSettle();
      return;
    }
    if (Math.abs(el.scrollTop - this.#offset) > 1) {
      this.#config.scrollTo(this.#offset, "auto");
      this.#lastScrollTop = el.scrollTop;
      this.#settledFrames = 0;
    } else {
      this.#settledFrames += 1;
    }
    if (this.#settledFrames >= SETTLE_FRAMES) {
      this.#cancelSettle();
      return;
    }
    this.#settleFrame = requestAnimationFrame(this.#settleTick);
  };

  #cancelSettle() {
    clearTimeout(this.#settleTimer);
    this.#settleTimer = undefined;
    if (this.#settleFrame === null) return;
    cancelAnimationFrame(this.#settleFrame);
    this.#settleFrame = null;
  }

  #stopLanding() {
    this.#cancelSettle();
    this.#endPinning();
  }

  #onGesture = () => {
    this.#suppressResume = false;
    this.#stopLanding();
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
