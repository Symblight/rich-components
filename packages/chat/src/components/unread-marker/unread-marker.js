import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import tokens from "../../styles/tokens.css?inline";
import styles from "./unread-marker.css?inline";

/**
 * @tag chx-unread-marker
 * @summary "This message is unread" marker — `chx-message`'s default `unread-marker` slot content,
 * so `unread` alone renders one; slot your own (`slot="unread-marker"`) to replace it. Structural,
 * not decorative — `role="separator"`, no `aria-hidden`/`aria-live`, a landmark a screen reader user
 * can navigate to.
 */
@customElement("chx-unread-marker")
export class ChxUnreadMarker extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    // host-attribute, not part of render()'s shadow content — set once, never toggled
    this.setAttribute("role", "separator");
  }

  render() {
    return html`<div class="unread-marker__dot" part="dot"></div>`;
  }
}
