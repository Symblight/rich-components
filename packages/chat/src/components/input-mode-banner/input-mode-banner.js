import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { when } from "lit/directives/when.js";

import "@symblight/wc-material/icon";
import "@symblight/wc-material/icon-button";

import closeIcon from "@material-design-icons/svg/outlined/close.svg?raw";

import tokens from "../../styles/tokens.css?inline";
import styles from "./input-mode-banner.css?inline";

/**
 * @tag chx-input-mode-banner
 * @summary Banner above the composer saying what the next send will do — a standalone element the
 * app slots into `chx-chat`'s `input-banner` slot and manages itself.
 */
@customElement("chx-input-mode-banner")
export class ChxInputModeBanner extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    label: { type: String },
    variant: { type: String, reflect: true },
    dismissible: { type: Boolean, reflect: true },
    dismissLabel: { type: String, attribute: "dismiss-label" },
    hasLabelContent: { state: true },
  };

  constructor() {
    super();

    /** Overridden by anything in the default slot. @type {string} */
    this.label = "";

    /** @type {"default" | "danger"} */
    this.variant = "default";

    /** @type {boolean} */
    this.dismissible = false;

    /** @type {string} */
    this.dismissLabel = "Dismiss";

    /** Default slot holds real content — the markup's own whitespace doesn't count, which a native
     *  slot fallback would, hiding `label` behind an indented `actions` child. @type {boolean} */
    this.hasLabelContent = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    // host-attribute, not shadow content — the live region has to be the element the app keeps
    // mounted, so a label change is announced rather than an insertion that may be missed
    this.setAttribute("role", "status");
  }

  /** @param {Event} event */
  #handleLabelSlotchange = (event) => {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.hasLabelContent = slot
      .assignedNodes({ flatten: true })
      .some((node) => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim());
  };

  #handleDismiss = () => {
    // announce only; the app owns this element's lifetime, so it decides what dismissing means
    this.dispatchEvent(
      new CustomEvent("chx-input-mode-banner-dismiss", { bubbles: true, composed: true }),
    );
  };

  render() {
    return html`
      <div class="input-mode-banner" part="container">
        <div class="input-mode-banner__icon" part="icon">
          <slot name="icon"></slot>
        </div>
        <div class="input-mode-banner__label" part="label">
          <slot @slotchange=${this.#handleLabelSlotchange}></slot>${
            this.hasLabelContent ? nothing : this.label
          }
        </div>
        <div class="input-mode-banner__actions" part="actions">
          <slot name="actions"></slot>
        </div>
        ${when(
          this.dismissible,
          () => html`
            <md-icon-button
              class="input-mode-banner__dismiss"
              part="dismiss"
              variant="standard"
              aria-label=${this.dismissLabel}
              @click=${this.#handleDismiss}
            >
              <md-icon>${unsafeSVG(closeIcon)}</md-icon>
            </md-icon-button>
          `,
        )}
      </div>
    `;
  }
}
