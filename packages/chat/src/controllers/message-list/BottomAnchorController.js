/** @import { ChxInfinityScroll } from "../../components/infinity-scroll/infinity-scroll.js" */
/** @import { StickyController } from "./StickyController.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 */

/**
 * Owns `chx-message-list`'s relationship with the bottom of the scroll: whether the reader has
 * scrolled away from it (which gates the `scroll-to-bottom` slot and feeds `StickyController`),
 * the `chx-scroll-to-bottom-click` event a slotted affordance bubbles up, and the delegation of
 * `scrollToBottom()` down to `chx-infinity-scroll`.
 *
 * Host-bound so the listener can live on `hostConnected`/`hostDisconnected` — that pair is the only
 * reason `chx-message-list` had a `disconnectedCallback` at all.
 * @implements {ReactiveController}
 */
export class BottomAnchorController {
  /** @type {Host} */
  #host;
  /** @type {() => ChxInfinityScroll | undefined} */
  #getInfinityScrollElement;
  /** @type {StickyController} */
  #stickyController;
  #awayFromBottom = false;

  /**
   * @param {Host} host
   * @param {{
   *   getInfinityScrollElement: () => ChxInfinityScroll | undefined,
   *   stickyController: StickyController,
   * }} config
   */
  constructor(host, config) {
    this.#host = host;
    host.addController(this);
    this.#getInfinityScrollElement = config.getInfinityScrollElement;
    this.#stickyController = config.stickyController;
  }

  /** Scrolled further than `buffer` px from the bottom — reported by chx-infinity-scroll. */
  get awayFromBottom() {
    return this.#awayFromBottom;
  }

  hostConnected() {
    // the affordance is a slotted light-DOM child, so its event is caught here rather than by a
    // template binding
    this.#host.addEventListener(
      "chx-scroll-to-bottom-click",
      /** @type {EventListener} */ (this.#handleScrollToBottomClick),
    );
  }

  hostDisconnected() {
    this.#host.removeEventListener(
      "chx-scroll-to-bottom-click",
      /** @type {EventListener} */ (this.#handleScrollToBottomClick),
    );
  }

  /** Wired straight to `chx-infinity-scroll.onAwayFromBottomChange`. @param {boolean} away */
  handleAwayFromBottomChange = (away) => {
    this.#awayFromBottom = away;
    this.#stickyController.handleAwayFromBottomChange(away); // back at bottom — drop the label, cancel the idle timer
    this.#host.requestUpdate(); // gates the scroll-to-bottom slot in the host's own template
  };

  /** @param {"auto" | "smooth" | "instant"} [behavior] */
  scrollToBottom(behavior) {
    this.#getInfinityScrollElement()?.scrollToBottom(behavior);
  }

  /** @param {CustomEvent<{behavior: "auto" | "smooth" | "instant"}>} event */
  #handleScrollToBottomClick = (event) => {
    this.scrollToBottom(event.detail.behavior);
  };
}
