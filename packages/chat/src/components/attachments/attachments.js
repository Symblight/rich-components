import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import "../attachment/attachment.js";
import "../chip/chip.js";

import {
  buildChipElement,
  ensureTemplateId,
  setupChipTemplate,
  stampChipOwner,
} from "../../editor/command-chip.js";

import styles from "./attachments.css?inline";

/**
 * @tag chx-attachments
 * @summary Attachment row above the input (`mode="header"`), or inline chips in the text (`mode="chip"`).
 */
@customElement("chx-attachments")
export class ChxAttachments extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    mode: { type: String, attribute: true },
  };

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  // real private fields must be declared here, in the class body — a bare `this.#foo = ...`
  // inside the constructor alone isn't enough
  /** @type {HTMLTemplateElement | null} Set by setupCardTemplate — the app's `slot="card"` shell, if any. */
  #cardTemplate = null;
  /** @type {HTMLTemplateElement | null} Set by setupChipTemplate (chip mode only) — the app's `slot="chip"` shell, if any. */
  #chipTemplate = null;

  constructor() {
    super();

    /** Chip mode requires an `id` (see setupChipTemplate). @type {"header" | "chip"} */
    this.mode = "header";
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
    if (this.mode === "chip") this.#chipTemplate = setupChipTemplate(this);
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
      this.#cardTemplate = slotted;
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
    this.#cardTemplate = template;
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
   * @param {"picker" | "drop" | "api" | "paste"} [source]
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

    if (this.mode === "chip") {
      for (const file of fileArray) this.insertChip(file);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const file of fileArray) {
      const card = /** @type {HTMLElement} */ (this.buildAttachment(file, "composer"));
      card.slot = "attachment";
      fragment.append(card);
    }
    this.addAttachments(fragment);
  }

  /**
   * Builds a `<chx-attachment>` card from a File — the single place both live attach and
   * historical re-rendering draw from. Doesn't decide `.slot`/actions, see the two call sites.
   * @param {File} file
   * @param {"composer" | "message"} [_source]
   * @returns {HTMLElement}
   */
  buildAttachment(file, _source) {
    if (this.#cardTemplate) {
      const clone = /** @type {DocumentFragment} */ (this.#cardTemplate.content.cloneNode(true));
      const root = /** @type {(HTMLElement & {file?: File}) | null} */ (clone.firstElementChild);
      // The template's root must be a <chx-attachment> — only that tag
      // is ever accepted as a card (see the class doc comment) — fall
      // back to the plain default if a malformed template slipped
      // through setupCardTemplate rather than silently rendering
      // nothing.
      if (root?.localName === "chx-attachment") {
        root.file = file;
        return root;
      }
    }
    const card = /** @type {HTMLElement & {file?: File}} */ (
      document.createElement("chx-attachment")
    );
    card.file = file;
    return card;
  }

  /**
   * Inserts a file as an inline chip at the current caret position — chip mode's counterpart to
   * buildAttachment/addAttachments. No-op if there's no composer/editor to insert into.
   * @param {File} file
   */
  insertChip(file) {
    const composer =
      /** @type {(Element & {editor?: import("../../editor/Editor.js").Editor}) | null} */ (
        this.closest("chx-message-composer")
      );
    const editor = composer?.editor;
    if (!editor) return;

    const attrs = {
      templateId: /** @type {HTMLTemplateElement} */ (this.#chipTemplate).id,
      label: file.name,
      icon: null,
      data: { fileName: file.name, fileSize: String(file.size), fileType: file.type },
    };
    const node = ensureTemplateId(this.buildChip(attrs, "composer"), attrs.templateId);
    stampChipOwner(node, this.id);
    editor.insertChip(node);
  }

  /**
   * Draws a chip-mode attachment's inline pill — the single place live insertion and historical
   * hydration both draw from. Override to customize the look everywhere at once.
   * @param {{templateId: string, label: string, icon: string | null, data: Record<string, string>}} attrs
   * @param {"composer" | "message"} _source
   * @returns {HTMLElement}
   */
  buildChip(attrs, _source) {
    return buildChipElement(attrs);
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
   * (unassigned-slot) card. Every card here is in the composer, so it's made removable too — set
   * `removable = false` on it afterwards to lock one.
   * @param {Element | DocumentFragment} container
   */
  addAttachments(container) {
    const items = /** @type {(Element & {removable?: boolean})[]} */ (
      [...container.children].filter((element) => element.localName === "chx-attachment")
    );
    if (items.length === 0) return;
    for (const item of items) {
      item.slot = "attachment";
      item.removable = true;
    }
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

  /** file+element pairs for valid cards, in DOM order — the one filtering pass getAttachments()/getAttachmentElements() both derive from, so the two can't drift out of pairing. @returns {Array<{file: File, element: HTMLElement}>} */
  getAttachmentEntries() {
    return /** @type {Array<{file: File, element: HTMLElement}>} */ (
      this.cardElements
        .map((element) => ({ file: /** @type {{file?: File}} */ (element).file, element }))
        .filter((entry) => entry.file instanceof File)
    );
  }

  /** Files currently backing the visible cards, in DOM order. @returns {File[]} */
  getAttachments() {
    return this.getAttachmentEntries().map((entry) => entry.file);
  }

  /** The live `<chx-attachment>` elements, same order as getAttachments(). @returns {HTMLElement[]} */
  getAttachmentElements() {
    return this.getAttachmentEntries().map((entry) => entry.element);
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
