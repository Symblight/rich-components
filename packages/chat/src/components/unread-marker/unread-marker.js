import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./unread-marker.css?inline";

/**
 * @tag chx-unread-marker
 * @summary "This message is unread" marker — a standalone element, slotted by the app into
 * `chx-message`'s `unread-marker` slot (`slot="unread-marker"`); nothing here auto-registers or
 * auto-renders it. Structural, not decorative — `role="separator"`, no `aria-hidden`/`aria-live`,
 * a landmark a screen reader user can navigate to, same posture MUI X's own real read-receipts
 * `<ChatUnreadMarker>` uses.
 */
@customElement("chx-unread-marker")
export class ChxUnreadMarker extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
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
