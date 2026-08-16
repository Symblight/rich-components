import { html, LitElement, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import "@symblight/wc-material/chips";

import styles from "./mention-field.css?inline";

/**
 * @tag chx-mention-field
 * @summary  Mention field.
 *
 * Composes `md-input-chip` for the actual chip chrome (padding, radius,
 * colors, ripple, state-layer hover) — MD3's "Input Chip" is the right
 * variant, semantically "a piece of user-entered information". This
 * component owns mention-specific data (`mentionCharacter`/`value`) and
 * the `mention-click`/`mention-hover` event contract on top of it.
 */
@customElement("chx-mention-field")
export class ChxMentionField extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    mentionCharacter: { type: String, attribute: true },
    value: { type: String, attribute: true },
  };

  constructor() {
    super();
    /** @type {String} */
    this.mentionCharacter = "@";

    /** @type {String} */
    this.value = "";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this.handleClick);
    this.addEventListener("mouseenter", this.handleMouseEnter);
    this.addEventListener("mouseleave", this.handleMouseLeave);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.handleClick);
    this.removeEventListener("mouseenter", this.handleMouseEnter);
    this.removeEventListener("mouseleave", this.handleMouseLeave);
  }

  /**
   * Native `click` is composed by default, so it already bubbles out of
   * md-input-chip's internal <button> through both shadow boundaries to
   * here — no extra plumbing needed. md-input-chip's own click handler
   * also toggles its `selected` state and fires its own `change` event
   * (built for filter/choice chips); deliberately ignored here, only the
   * underlying native click drives mention-click.
   */
  handleClick = () => {
    this.dispatchEvent(
      new CustomEvent("mention-click", {
        detail: { value: this.value, id: this.id },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /**
   * mouseenter/mouseleave don't bubble, but the browser fires them on
   * every ancestor whose box the pointer actually entered/left, not only
   * the innermost target — works as long as :host tightly hugs the
   * composed chip (see mention-field.css), no dead zone around it.
   */
  handleMouseEnter = () => {
    this.dispatchEvent(
      new CustomEvent("mention-hover", {
        detail: { value: this.value, id: this.id, active: true },
        bubbles: true,
        composed: true,
      }),
    );
  };

  handleMouseLeave = () => {
    this.dispatchEvent(
      new CustomEvent("mention-hover", {
        detail: { value: this.value, id: this.id, active: false },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /**
   * Lit property assignment alone doesn't notify anything outside this
   * component — composer needs a signal when .value is set externally
   * (after the app picks a menu option) to know when to finalize the chip.
   * @param {import("lit").PropertyValues} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has("value")) {
      this.dispatchEvent(new Event("change"));
    }
  }

  render() {
    if (!this.value) return nothing;

    return html`<md-input-chip selected>${this.value}</md-input-chip>`;
  }
}
