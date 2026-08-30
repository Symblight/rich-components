import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./typing-indicator.css?inline";

/**
 * @tag chx-typing-indicator
 * @summary "The other side is typing" indicator — a standalone element, slotted by the app into
 * `chx-message-list`'s `typing` slot (`slot="typing"`); nothing here auto-registers or
 * auto-renders it.
 */
@customElement("chx-typing-indicator")
export class ChxTypingIndicator extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    value: { type: String, attribute: true },
  };

  constructor() {
    super();
    /** @type {string} */
    this.value = "";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`<div class="typing-indicator__label" aria-live="polite">${this.value || "Typing…"}</div>`;
  }
}
