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

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.addEventListener("change", /** @type {EventListener} */ (this.handleChange));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("chx-send-message", /** @type {EventListener} */ (this.handleSend));
    this.removeEventListener("change", /** @type {EventListener} */ (this.handleChange));
  }

  /**
   * chx-message-composer is now consumer-authored light DOM (see
   * handleDefaultSlotchange) rather than something chx-chat renders itself,
   * so this is a light-DOM query, not a shadow-root one.
   * @returns {import("../message-composer/message-composer.js").ChxMessageComposer}
   */
  get messageComposerElement() {
    return /** @type {import("../message-composer/message-composer.js").ChxMessageComposer} */ (
      this.querySelector("chx-message-composer")
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

  /**
   * chx-message-list/chx-message-composer are consumer-authored light DOM —
   * chx-chat only orchestrates layout (see chat.css's ::slotted() rules) and
   * pushes its own config onto whatever composer shows up here, since it can
   * no longer bind properties onto it via its own template.
   */
  handleDefaultSlotchange() {
    this.pushComposerProperties();
  }

  pushComposerProperties() {
    const composer = this.messageComposerElement;
    if (!composer) return;
    composer.label = this.label;
    composer.loading = this.loading;
    composer.commandFields = this.commandFields;
  }

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    if (
      changedProperties.has("label") ||
      changedProperties.has("loading") ||
      changedProperties.has("commandFields")
    ) {
      this.pushComposerProperties();
    }
  }

  render() {
    return html`
      <slot @slotchange=${this.handleDefaultSlotchange}></slot>
      <slot name="command-field" @slotchange=${this.handleCommandFieldSlotchange}></slot>
    `;
  }
}
