import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./streaming-indicator.css?inline";

/**
 * @tag chx-streaming-indicator
 * @summary "Waiting for a reply, no message yet" indicator — a standalone element, slotted by the
 * app into `chx-message-list`'s `streaming` slot (`slot="streaming"`); nothing here auto-registers
 * or auto-renders it. Renders as a not-own message bubble holding animated dots, not a text label —
 * decorative/dots on purpose, unlike chx-typing-indicator's text label.
 */
@customElement("chx-streaming-indicator")
export class ChxStreamingIndicator extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`
      <div class="streaming-indicator__bubble" aria-hidden="true">
        <slot>
          <span class="streaming-indicator__dot"></span>
          <span class="streaming-indicator__dot streaming-indicator__dot_delay-1"></span>
          <span class="streaming-indicator__dot streaming-indicator__dot_delay-2"></span>
        </slot>
      </div>
    `;
  }
}
