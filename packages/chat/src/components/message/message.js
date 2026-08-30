import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./message.css?inline";

/**
 * @tag chx-message
 * @summary Message.
 */
@customElement("chx-message")
export class ChxMessage extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    own: { type: Boolean, reflect: true },
    // aria-busy is a real ARIA state, expected as the literal string "true"/"false" — Lit's
    // default Boolean converter reflects by presence/empty-string instead, which assistive tech
    // doesn't reliably read as a boolean state, so this uses an explicit converter
    busy: {
      type: Boolean,
      reflect: true,
      attribute: "aria-busy",
      converter: {
        toAttribute: (/** @type {boolean} */ value) => (value ? "true" : "false"),
        fromAttribute: (/** @type {string | null} */ value) => value === "true",
      },
    },
    // whether this message is currently "drilled into" (its interior controls are tabbable) —
    // set by chx-message-list's roving-focus handling, a plain presence-based flag (not a real
    // ARIA state), matching MUI X's own data-actionable attribute
    actionable: { type: Boolean, reflect: true, attribute: "data-actionable" },
  };

  constructor() {
    super();

    /** @type {boolean} */
    this.own = false;

    /** @type {boolean} */
    this.busy = false;

    /** @type {boolean} */
    this.actionable = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  connectedCallback() {
    super.connectedCallback();
    // host-attribute, not part of render()'s shadow content — the accessibility tree cares about
    // role on the host itself, set once, never toggled
    this.setAttribute("role", "article");
  }

  render() {
    return html`
      <div class="message__avatar" part="avatar">
        <slot name="avatar"></slot>
      </div>
      <div class="message__body" part="body">
        <div class="message__meta" part="meta">
          <slot name="meta"></slot>
        </div>
        <span class="message__content" part="content">
          <slot></slot>
        </span>
        <div class="message__actions" part="actions">
          <slot name="actions"></slot>
        </div>
      </div>
    `;
  }
}
