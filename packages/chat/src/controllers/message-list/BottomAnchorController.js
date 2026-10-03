/** @import { ChxInfinityScroll } from "../../components/infinity-scroll/infinity-scroll.js" */
/** @import { StickyController } from "./StickyController.js" */

/**
 * @typedef {import("lit").ReactiveController} ReactiveController
 * @typedef {import("lit").ReactiveControllerHost & import("lit").LitElement} Host
 * @typedef {{
 *   getInfinityScrollElement: () => ChxInfinityScroll | undefined,
 *   stickyController: StickyController,
 * }} BottomAnchorConfig
 */

/**
 * `chx-message-list`'s relationship with the bottom: `awayFromBottom` (gates the scroll-to-bottom
 * slot, feeds `StickyController`), the affordance's bubbled click, and scrolling down.
 * @implements {ReactiveController}
 */
export class BottomAnchorController {
  /** @type {Host} */
  #host;
  /** @type {BottomAnchorConfig} */
  #config;
  #awayFromBottom = false;

  /** @param {Host} host @param {BottomAnchorConfig} config */
  constructor(host, config) {
    this.#host = host;
    this.#config = config;
    host.addController(this);
  }

  /** Further than `buffer` px from the bottom — reported by chx-infinity-scroll. */
  get awayFromBottom() {
    return this.#awayFromBottom;
  }

  hostConnected() {
    // the affordance is slotted light DOM, so its event is caught here, not by a template binding
    this.#host.addEventListener("chx-scroll-to-bottom-click", this.#handleScrollToBottomClick);
  }

  hostDisconnected() {
    this.#host.removeEventListener("chx-scroll-to-bottom-click", this.#handleScrollToBottomClick);
  }

  /** `chx-infinity-scroll.onAwayFromBottomChange`. @param {boolean} away */
  handleAwayFromBottomChange = (away) => {
    this.#awayFromBottom = away;
    this.#config.stickyController.handleAwayFromBottomChange(away);
    this.#host.requestUpdate();
  };

  /** @param {"auto" | "smooth" | "instant"} [behavior] */
  scrollToBottom(behavior) {
    this.#config.getInfinityScrollElement()?.scrollToBottom(behavior);
  }

  /** @param {Event} event */
  #handleScrollToBottomClick = (event) => {
    const { behavior } = /** @type {CustomEvent<{behavior: "auto" | "smooth" | "instant"}>} */ (
      event
    ).detail;
    this.scrollToBottom(behavior);
  };
}
