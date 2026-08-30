import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../attachment/attachment.js";

import styles from "./attachments.css?inline";

/**
 * @tag chx-attachments
 * @summary Attachment row rendered above the composer's input. Only
 * `<chx-attachment slot="attachment">` children render as cards.
 */
@customElement("chx-attachments")
export class ChxAttachments extends LitElement {
  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  constructor() {
    super();

    /** @type {HTMLTemplateElement | null} Set by setupCardTemplate — the app's `slot="card"` shell, if any. */
    this._cardTemplate = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener(
      "chx-attachment-remove",
      /** @type {EventListener} */ (this.handleAttachmentRemove),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener(
      "chx-attachment-remove",
      /** @type {EventListener} */ (this.handleAttachmentRemove),
    );
  }

  firstUpdated() {
    this.setupCardTemplate();
  }

  /** @returns {HTMLInputElement} */
  get fileInputElement() {
    return /** @type {HTMLInputElement} */ (this.renderRoot?.querySelector(".attachments__input"));
  }

  /** Current card children — only `<chx-attachment>`, excludes the inert `slot="card"` template and anything else. @returns {Element[]} */
  get cardElements() {
    return [...this.children].filter((element) => element.localName === "chx-attachment");
  }

  setupCardTemplate() {
    const slotted = /** @type {HTMLElement | null} */ (this.querySelector('[slot="card"]'));
    if (!slotted) return;

    if (slotted instanceof HTMLTemplateElement) {
      this._cardTemplate = slotted;
      return;
    }

    // A plain element, not a <template> — adopt it into one, so authoring
    // the card shell as ordinary (possibly Lit-bound) markup still works,
    // same pattern chx-command-picker's setupChipTemplate uses.
    const template = /** @type {HTMLTemplateElement} */ (document.createElement("template"));
    template.slot = "card";
    slotted.remove();
    template.content.append(slotted);
    this.appendChild(template);
    this._cardTemplate = template;
  }

  /** Opens the native file picker via the internal hidden file input. */
  open() {
    this.fileInputElement?.click();
  }

  /**
   * Converts raw Files into cards — the default `<chx-attachment>` unless a
   * `slot="card"` template overrides it. Fires `chx-attach` first; a
   * listener calling `preventDefault()` suppresses the default-card
   * creation, leaving file handling entirely to the app.
   * @param {FileList | File[]} files
   * @param {"picker" | "drop" | "api"} [source]
   */
  addFiles(files, source = "picker") {
    const fileArray = [...files];
    if (fileArray.length === 0) return;

    const accepted = this.dispatchEvent(
      new CustomEvent("chx-attach", {
        detail: { files: fileArray, source },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (!accepted) return;

    const fragment = document.createDocumentFragment();
    for (const file of fileArray) fragment.append(this.buildDefaultCard(file));
    this.addAttachments(fragment);
  }

  /**
   * @param {File} file
   * @returns {Node}
   */
  buildDefaultCard(file) {
    if (this._cardTemplate) {
      const clone = /** @type {DocumentFragment} */ (this._cardTemplate.content.cloneNode(true));
      const root = /** @type {(HTMLElement & {file?: File}) | null} */ (clone.firstElementChild);
      // The template's root must be a <chx-attachment> — only that tag
      // is ever accepted as a card (see the class doc comment) — fall
      // back to the plain default if a malformed template slipped
      // through setupCardTemplate rather than silently rendering
      // nothing.
      if (root?.localName === "chx-attachment") {
        root.file = file;
        root.slot = "attachment";
        return clone;
      }
    }
    const card = /** @type {HTMLElement & {file?: File}} */ (
      document.createElement("chx-attachment")
    );
    card.file = file;
    card.slot = "attachment";
    return card;
  }

  /**
   * JS-driven escape hatch — appends each `<chx-attachment>` among
   * `container`'s children as a card, bypassing the File → default-card
   * conversion entirely. Non-`<chx-attachment>` children are dropped —
   * only `<chx-attachment>` is ever accepted (see the class doc comment);
   * for a custom look, put custom content inside one via its own
   * `icon`/default/`actions` slots instead of substituting a different
   * element. `slot="attachment"` is set here regardless of whether the
   * caller already set it, so this can't silently produce an unrendered
   * (unassigned-slot) card.
   * @param {Element | DocumentFragment} container
   */
  addAttachments(container) {
    const items = [...container.children].filter(
      (element) => element.localName === "chx-attachment",
    );
    if (items.length === 0) return;
    for (const item of items) item.slot = "attachment";
    this.append(...items);
  }

  /**
   * Removes one card (own or app-provided) without going through
   * chx-attachment-remove — for programmatic cleanup, e.g. after a failed
   * upload.
   * @param {Element} element
   */
  removeAttachment(element) {
    if (element.parentElement === this) element.remove();
  }

  /** Removes all current cards. */
  clearAttachments() {
    for (const element of this.cardElements) element.remove();
  }

  /** Files currently backing the visible cards — reads `.file` off each, in DOM order. @returns {File[]} */
  getAttachments() {
    return this.cardElements
      .map((element) => /** @type {{file?: File}} */ (element).file)
      .filter((file) => file instanceof File);
  }

  /** @param {Event} event */
  handleAttachmentRemove = (event) => {
    const { element } = /** @type {CustomEvent<{element: Element}>} */ (event).detail;
    this.removeAttachment(element ?? /** @type {Element} */ (event.target));
  };

  handleFileInputChange = () => {
    const { files } = this.fileInputElement;
    if (files) this.addFiles(files, "picker");
    this.fileInputElement.value = "";
  };

  /**
   * Fires on every add *and* remove (native slotchange), regardless of
   * which method caused it — the one reliable "the card list changed"
   * signal, unlike `chx-attach` (fires before the default card is even
   * created) or `chx-attachment-remove` (bubbles, but only covers
   * removal). Consumed by chx-chat to keep its ContextProvider in sync.
   */
  handleSlotChange = () => {
    this.dispatchEvent(
      new CustomEvent("chx-attachments-change", {
        detail: { attachments: this.getAttachments() },
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    return html`
      <div class="attachments" part="list">
        <slot name="attachment" @slotchange=${this.handleSlotChange}></slot>
      </div>
      <input
        class="attachments__input"
        type="file"
        multiple
        hidden
        @change=${this.handleFileInputChange}
      />
    `;
  }
}
