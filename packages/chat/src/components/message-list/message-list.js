import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import styles from "./message-list.css?inline";

/**
 * @tag chx-message-list
 * @summary Message list.
 */
@customElement("chx-message-list")
export class ChxMessageList extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    dragging: { type: Boolean, reflect: true, attribute: true },
    dropHint: { type: String, attribute: "drop-hint" },
  };

  constructor() {
    super();

    /** @type {boolean} */
    this.dragging = false;

    /** @type {string} */
    this.dropHint = "Release to attach";
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  render() {
    return html`
      ${when(
        this.dragging,
        () => html`<div class="message-list__drop-hint" part="drop-hint">${this.dropHint}</div>`,
      )}
      message list
    `;
  }
}
