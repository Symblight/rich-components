import { distanceToBottom } from "../../utils/dom.js";
import { VERY_BOTTOM } from "../../components/infinity-scroll/BottomLatch.js";

const PINNED_CLASS = "infinity-scroll__content_pinned";

/**
 * @typedef {{
 *   getScrollElement: () => HTMLElement | undefined,
 *   getContentElement: () => HTMLElement | undefined,
 *   getEnabled: () => boolean,
 *   indexOfKey: (key: string | number) => number,
 *   getOffset: (index: number) => number | undefined,
 *   scrollTo: (offset: number) => void,
 *   onFollowChange: (following: boolean) => void,
 *   isUserScroll: () => boolean,
 * }} PinConfig
 */

/**
 * `scroll-mode="pin-top"`: scrolls a sent item to the top once and reserves the space below it in
 * CSS (`PINNED_CLASS` + `--_chx-pin-offset`), so layout never clamps the scroll. The scroll is always
 * instant: a smooth one aims at an offset taken while rows are still measured, and can end on the
 * wrong item (WebKit). Also owns whether
 * the list follows new content: off after a pin or any upward scroll, back on at the very bottom.
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
  /** our own pin scroll must not count as "the user reached the bottom" — cleared by a user scroll */
  #suppressResume = false;
  #lastScrollTop = 0;

  /** @param {PinConfig} config */
  constructor(config) {
    this.#config = config;
  }

  /** Whether the list should stick to the bottom as content grows — always `true` when disabled. */
  get following() {
    return !this.#config.getEnabled() || this.#following;
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
    this.#suppressResume = false;
    this.#setFollowing(true);
  }

  /** Unrelated content is about to land: drops the pin and sets following outright. @param {boolean} following */
  reset(following) {
    this.#clear();
    this.#setFollowing(following);
    this.rebase();
  }

  /** The scroll position moved with nobody scrolling: nothing to read from it. */
  rebase() {
    this.#lastScrollTop = this.#config.getScrollElement()?.scrollTop ?? 0;
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
    if (!this.#config.getEnabled()) return;

    // only a scroll a gesture just started is the user's — a later layout clamp to the bottom isn't
    if (this.#config.isUserScroll()) this.#suppressResume = false;
    const atVeryBottom = distanceToBottom(el) <= VERY_BOTTOM;
    // still at the bottom, it's no scroll away: rows above shrinking (a wider column) move scrollTop up
    if (scrolledUp && !atVeryBottom) this.#setFollowing(false);
    else if (atVeryBottom && !this.#suppressResume) this.#setFollowing(true);
  }

  /** @param {number} offset */
  #scrollToPin(offset) {
    const el = this.#config.getScrollElement();
    if (!el) return;
    this.#config.scrollTo(offset);
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
}
