import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./message-composer.css?inline";

import "../textbox/textbox.js";
import "@symblight/wc-material/button";

/**
 * @tag chx-message-composer
 * @summary Message composer.
 */
@customElement("chx-message-composer")
export class ChxMessageComposer extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    value: { type: String, state: true },
    loading: { type: Boolean, reflect: true, attribute: true },
    label: { type: String, attribute: true },
    placeholder: { type: String, attribute: true },
    dropHint: { type: String, attribute: "drop-hint" },
    dragging: { type: Boolean, reflect: true, attribute: true },
    commandFields: { attribute: false },
  };

  constructor() {
    super();

    /** @type {String} */
    this.value = "";

    /** @type {String} */
    this.label = "";

    /** @type {String} */
    this.placeholder = "Put your text...";

    /** @type {String} Pushed down to chx-textbox — shown while an OS file drag is over the field. */
    this.dropHint = "Release to attach";

    /** @type {boolean} Pushed down by chx-chat — see its own DropTargetController. */
    this.dragging = false;

    /** @type {Boolean} */
    this.loading = false;

    /** @type {Map<Element, Element>} Set by chx-chat — see its handleCommandFieldSlotchange. */
    this.commandFields = new Map();
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /**
   * Forwarded from chx-chat's own insertAtCommand — see
   * chx-textbox.insertAtCommand for the actual insertion logic.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtCommand(target, node) {
    this.textboxElement?.insertAtCommand(target, node);
  }

  /**
   * Programmatically attaches a file — same effect as picking or dropping
   * one (fires chx-attach, still preventable by a JS-driven listener). A
   * no-op if no <chx-attachments> is connected.
   * @param {File} file
   */
  attachFile(file) {
    this.attachmentsElement?.addFiles([file], "api");
  }

  /**
   * Replaces the textbox's document with plain text — e.g. pre-filling a
   * draft or a suggested reply. See chx-textbox.setText for why this isn't
   * called `setValue` (FormControlMixin already owns that name one level
   * down, for a different, form-value-only purpose).
   * @param {string} text
   */
  setText(text) {
    this.textboxElement?.setText(text);
    this.value = text;
  }

  /** @returns {HTMLFormElement} */
  get formElement() {
    return /** @type {HTMLFormElement} */ (
      this.renderRoot?.querySelector(".message-composer__form")
    );
  }

  /** @returns {import("../textbox/textbox.js").ChxTextbox} */
  get textboxElement() {
    return /** @type {import("../textbox/textbox.js").ChxTextbox} */ (
      this.renderRoot?.querySelector("chx-textbox")
    );
  }

  /**
   * chx-attachments is optional, consumer-authored light DOM (slot="attachments"
   * on this element, forwarded into chx-textbox's own attachments slot) — a
   * light-DOM query, same reasoning as chx-chat's messageComposerElement, not
   * a renderRoot one like textboxElement above.
   * @returns {(HTMLElement & {getAttachments: () => File[], clearAttachments: () => void, addFiles: (files: File[], source?: "picker" | "drop" | "api") => void}) | null}
   */
  get attachmentsElement() {
    return /** @type {(HTMLElement & {getAttachments: () => File[], clearAttachments: () => void, addFiles: (files: File[], source?: "picker" | "drop" | "api") => void}) | null} */ (
      this.querySelector("chx-attachments")
    );
  }

  /** @param {SubmitEvent} event */
  handleSend(event) {
    event.preventDefault();
    if (!this.value || !this.textboxElement) return;

    const value = this.textboxElement.getValue();
    const html = this.textboxElement.getHTML();
    const attachments = this.attachmentsElement?.getAttachments() ?? [];
    const commands = this.textboxElement.getCommands();
    this.textboxElement.focus();
    this.clearValue();

    this.dispatchEvent(
      new CustomEvent("chx-send-message", {
        detail: { value, html, attachments, commands },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Resets both the editor's document, any attached files, and `this.value` — they don't sync automatically. */
  clearValue() {
    this.textboxElement?.clear();
    this.attachmentsElement?.clearAttachments();
    this.value = "";

    this.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Bound to chx-textbox's own chx-textbox-change — fires on every
   * doc-changing transaction, direct replacement for the old native-`input`-
   * event handleInput.
   * @param {CustomEvent<{value: string, html: string}>} event
   */
  handleTextboxChange = (event) => {
    this.value = event.detail.value;

    this.dispatchEvent(
      new CustomEvent("chx-change", {
        detail: {
          ...event.detail,
          attachments: this.attachmentsElement?.getAttachments() ?? [],
          commands: this.textboxElement?.getCommands() ?? [],
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    return html`
      <form class="message-composer__form" @submit=${this.handleSend}>
        <chx-textbox
          name="message"
          class="message-composer__field"
          part="textbox"
          .label=${this.label}
          .placeholder=${this.placeholder}
          .dropHint=${this.dropHint}
          .getCommandFields=${() => this.commandFields}
          ?loading=${this.loading}
          ?dragging=${this.dragging}
          @chx-textbox-change=${this.handleTextboxChange}
        >
          <slot name="leading" slot="leading"></slot>
          <slot name="attachments" slot="attachments"></slot>
          <slot name="flight-icon" slot="flight-icon"></slot>

          <div slot="trailing" class="message-composer__actions-wrapper">
            <div class="message-composer__actions">
              <slot name="actions"></slot>
            </div>
          </div>
        </chx-textbox>
      </form>
    `;
  }
}
