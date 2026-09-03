import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon-button";
import "@symblight/wc-material/icon";

import arrowDownward from "@material-design-icons/svg/outlined/arrow_downward.svg?raw";

import styles from "./scroll-to-bottom-affordance.css?inline";

/**
 * @tag chx-scroll-to-bottom-affordance
 * @summary Floating "jump to latest" button — a standalone element, slotted by the app into
 * `chx-message-list`'s `scroll-to-bottom` slot (`slot="scroll-to-bottom"`); nothing here
 * auto-registers or auto-renders it, same opt-in connection as chx-typing-indicator/
 * chx-streaming-indicator. `chx-message-list` shows the slot only once the list has scrolled more
 * than its own `buffer` px away from the bottom.
 */
@customElement("chx-scroll-to-bottom-affordance")
export class ChxScrollToBottomAffordance extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    scrollBehavior: { type: String, attribute: "scroll-behavior" },
    label: { type: String, attribute: true },
  };

  constructor() {
    super();

    /**
     * Behavior for the scroll this button triggers — independent of chx-message-list's own
     * `scroll-behavior`, carried in the `chx-scroll-to-bottom-click` event detail instead.
     * @type {"auto" | "smooth" | "instant"}
     */
    this.scrollBehavior = "smooth";

    /** @type {string} */
    this.label = "Scroll to latest messages";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  #handleClick = () => {
    this.dispatchEvent(
      new CustomEvent("chx-scroll-to-bottom-click", {
        detail: { behavior: this.scrollBehavior },
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    return html`
      <md-icon-button
        class="scroll-to-bottom-affordance__button"
        part="button"
        variant="tonal"
        aria-label=${this.label}
        @click=${this.#handleClick}
      >
        <slot><md-icon>${unsafeSVG(arrowDownward)}</md-icon></slot>
      </md-icon-button>
    `;
  }
}
