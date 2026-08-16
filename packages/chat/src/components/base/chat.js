import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../message-composer/message-composer.js";
import "../message-list/message-list.js";

import styles from "./chat.css?inline";

/**
 * @tag chx-chat
 * @summary  Chat.
 *
 */

@customElement("chx-chat")
export class ChxChat extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    loading: { type: Boolean, reflect: true, attribute: true },
    label: { type: String, attribute: true },
    mentionCharacter: { type: String, attribute: true },
  };

  constructor() {
    super();

    /** @type {String} */
    this.label = "";

    /** @type {Boolean} */
    this.loading = false;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  handleSend(event) {
    console.log(event.detail);
  }

  handleChange(event) {
    console.log(event.detail);
  }

  render() {
    return html`
      <chx-message-list class="chat__message-list"></chx-message-list>
      <section class="chat__message-composer-layout">
        <chx-message-composer
          .label=${this.label}
          @sendMessage=${this.handleSend}
          @change=${this.handleChange}
          class="chat__message-composer"
        >
          <slot name="leading" slot="leading"></slot>
          <slot name="actions" slot="actions"></slot>
          <slot name="flight-icon" slot="flight-icon"></slot>
          <slot name="mention-field" slot="mention-field"></slot>
        </chx-message-composer>
      </section>
    `;
  }
}
