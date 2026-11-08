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
 *   contentReachesEnd: () => boolean,
 * }} PinConfig
 */

/**
 * `scroll-mode="pin-top"`: scrolls a sent item to the top once and reserves the space below it in
 * CSS (`PINNED_CLASS` + `--_chx-pin-offset`), so layout never clamps the scroll. The scroll is always
 * instant: a smooth one aims at an offset taken while rows are still measured, and can end on the
 * wrong item (WebKit). Also holds following off after a pin, until the reply has filled the
 * reserved space, the user scrolls to the very bottom, or `scrollToBottom()`. Whether the user
 * has scrolled away is `BottomLatch`'s call, as in stick-bottom — not judged here.
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
  /** following is off for the pin alone, not the user: it resumes once content reaches the end */
  #awaitingContent = false;

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
    this.#awaitingContent = true;
    this.#setFollowing(false);
  }

  /** Follows again: an explicit jump to the bottom, or the hold released by `refresh`/`handleScroll`. */
  resume() {
    this.#awaitingContent = false;
    this.#setFollowing(true);
  }

  /** Unrelated content is about to land: drops the pin and sets following outright. @param {boolean} following */
  reset(following) {
    this.#clear();
    this.#setFollowing(following);
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
    // the reply filled the reserved space: from here its end is followed, as in stick-bottom
    if (this.#awaitingContent && this.#config.contentReachesEnd()) this.resume();
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
    this.#config.scrollTo(offset);
  }

  /** Call synchronously from the scroll handler. Only a scroll a gesture just started is the
   *  user's: the pin's own, a layout clamp, or a compensation for a shrinking row is not. */
  handleScroll() {
    const el = this.#config.getScrollElement();
    if (!el || !this.#config.getEnabled() || !this.#config.isUserScroll()) return;
    if (distanceToBottom(el) <= VERY_BOTTOM) this.resume();
    else this.#awaitingContent = false; // the user's choice now, not the pin's
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
    this.#awaitingContent = false;
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
