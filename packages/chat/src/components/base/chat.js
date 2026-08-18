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
    commandFields: { attribute: false },
  };

  constructor() {
    super();

    /** @type {String} */
    this.label = "";

    /** @type {Boolean} */
    this.loading = false;

    /** @type {Map<Element, Element>} */
    this.commandFields = new Map();
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** @returns {import("../message-composer/message-composer.js").ChxMessageComposer} */
  get messageComposerElement() {
    return /** @type {import("../message-composer/message-composer.js").ChxMessageComposer} */ (
      this.renderRoot?.querySelector("chx-message-composer")
    );
  }

  /**
   * Resolves the command search identified by `target` (the token handed to
   * the app via command-query's detail) by replacing its tracked range with
   * `node` — see Editor.resolveCommand for the actual insertion logic.
   * A stale `target` is a no-op.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtCommand(target, node) {
    this.messageComposerElement?.insertAtCommand(target, node);
  }

  /** @param {CustomEvent} event */
  handleSend(event) {
    console.log(event.detail);
  }

  /** @param {CustomEvent} event */
  handleChange(event) {
    console.log(event.detail);
  }

  /**
   * Sole discovery point for <chx-command-field> — chx-chat is the direct
   * parent of both chx-message-composer and (once it consumes this too)
   * chx-message-list, so a plain property passed to both is enough; no
   * @lit/context needed (see commands.spec.md). Key and value are both the
   * live element — chx-chat stays agnostic of what a "plugin" even is,
   * doesn't read commandCharacter itself, just tracks connected elements.
   * @param {Event} event
   */
  handleCommandFieldSlotchange(event) {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.commandFields = new Map(
      slot.assignedElements({ flatten: true }).map((element) => [element, element]),
    );
  }

  render() {
    return html`
      <chx-message-list class="chat__message-list"></chx-message-list>
      <section class="chat__message-composer-layout">
        <chx-message-composer
          .label=${this.label}
          .commandFields=${this.commandFields}
          @chx-send-message=${this.handleSend}
          @change=${this.handleChange}
          class="chat__message-composer"
        >
          <slot name="leading" slot="leading"></slot>
          <slot name="actions" slot="actions"></slot>
          <slot name="flight-icon" slot="flight-icon"></slot>
        </chx-message-composer>
      </section>
      <slot name="command-field" @slotchange=${this.handleCommandFieldSlotchange}></slot>
    `;
  }
}
