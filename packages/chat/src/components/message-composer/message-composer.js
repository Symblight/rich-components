import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

import styles from "./message-composer.css?inline";

import "../textbox/textbox.js";

/**
 * @tag chx-message-composer
 * @summary Message composer.
 */
@customElement("chx-message-composer")
export class ChxMessageComposer extends LitElement {
  /** @type {import("lit").PropertyDeclarations} */
  static properties = {
    loading: { type: Boolean, reflect: true },
    label: { type: String },
    placeholder: { type: String },
    dropHint: { type: String, attribute: "drop-hint" },
    dragging: { type: Boolean, reflect: true },
    triggerFields: { attribute: false },
    pasteThreshold: { type: Number, attribute: "paste-threshold" },
    renderPasteChip: { attribute: false },
    pasteHandlers: { attribute: false },
    messagesEmpty: { type: Boolean },
  };

  constructor() {
    super();

    /** @type {string} */
    this.label = "";

    /** @type {string} */
    this.placeholder = "Put your text...";

    /** @type {string} Pushed down to chx-textbox — shown while an OS file drag is over the field. */
    this.dropHint = "Release to attach";

    /** @type {boolean} Pushed down by chx-chat — see chx-chat's DropTargetController. */
    this.dragging = false;

    /** @type {boolean} */
    this.loading = false;

    /** @type {Map<string, Element>} Set by chx-chat — see its handleCommandFieldSlotchange. */
    this.triggerFields = new Map();

    /** @type {number} Pastes of at least this many lines collapse to a chip; <= 0 disables. */
    this.pasteThreshold = 205;

    /** @type {((detail: {text: string, lines: number, data: Record<string, unknown>, source: "composer"}) => HTMLElement) | undefined} App override for the paste chip's DOM — see chx-textbox. */
    this.renderPasteChip = undefined;

    /** @type {import("../../types/paste-handler.js").PasteHandler[]} Ordered — first match() to claim a paste wins. See .claude/plans/paste-handlers.spec.md. */
    this.pasteHandlers = [];

    /** @type {boolean} Pushed down by chx-chat — true while #internalMessages is empty. See pushSuggestionListProperties. */
    this.messagesEmpty = true;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [styles];
  }

  /** Stable identity — an inline arrow in the template would dirty chx-textbox on every render. */
  #getTriggerFields = () => this.triggerFields;

  /**
   * Replaces the tracked range identified by `target` with `node` — see chx-textbox.insertAtRange.
   * @param {string | null} target
   * @param {Node} node
   */
  insertAtRange(target, node) {
    this.textboxElement?.insertAtRange(target, node);
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
   * draft or a suggested reply. Queued until the first render if called
   * before the textbox exists. See chx-textbox.setText for why this isn't
   * called `setValue` (FormControlMixin already owns that name one level
   * down, for a different, form-value-only purpose).
   * @param {string} text
   */
  setText(text) {
    if (this.textboxElement) this.textboxElement.setText(text);
    else this.updateComplete.then(() => this.textboxElement?.setText(text));
  }

  /** Focuses the underlying chx-textbox — see chx-textbox.focus for the ProseMirror-side behavior. */
  focus() {
    this.textboxElement?.focus();
  }

  /** The ProseMirror facade owned by chx-textbox — see chx-textbox's `editor` field. @returns {import("../../editor/Editor.js").Editor | undefined} */
  get editor() {
    return this.textboxElement?.editor;
  }

  /** @returns {import("../textbox/textbox.js").ChxTextbox | null} */
  get textboxElement() {
    return /** @type {import("../textbox/textbox.js").ChxTextbox | null} */ (
      this.renderRoot?.querySelector("chx-textbox") ?? null
    );
  }

  /**
   * chx-attachments is optional, consumer-authored light DOM (slot="attachments"
   * on this element, forwarded into chx-textbox's own attachments slot) — a
   * light-DOM query, same reasoning as chx-chat's messageComposerElement, not
   * a renderRoot one like textboxElement above.
   * @returns {import("../attachments/attachments.js").ChxAttachments | null}
   */
  get attachmentsElement() {
    return /** @type {import("../attachments/attachments.js").ChxAttachments | null} */ (
      this.querySelector("chx-attachments")
    );
  }

  /**
   * Warns if more than one <chx-attachments> is slotted — attachmentsElement silently uses only
   * the first.
   * @param {Event} event
   */
  handleAttachmentsSlotchange(event) {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    const assigned = slot
      .assignedElements({ flatten: true })
      .filter((element) => element.localName === "chx-attachments");
    if (assigned.length > 1) {
      console.error(
        `[chx-message-composer] only one <chx-attachments> is supported, found ${assigned.length} — only the first is used`,
        assigned,
      );
    }
  }

  /**
   * chx-suggestion-list is optional, consumer-authored light DOM (slot="suggestions" on this
   * element) — same status/reasoning as attachmentsElement above.
   * @returns {(HTMLElement & {alwaysVisible: boolean, hidden: boolean}) | null}
   */
  get suggestionListElement() {
    return /** @type {(HTMLElement & {alwaysVisible: boolean, hidden: boolean}) | null} */ (
      this.querySelector("chx-suggestion-list")
    );
  }

  /**
   * chx-suggestion-list never decides its own visibility — this is the one place `alwaysVisible`
   * (declared by the consumer) and `messagesEmpty` (pushed down by chx-chat) actually combine, see
   * .claude/plans/suggestions.spec.md's "Visibility ownership". Called from `updated()` and from the
   * suggestions slot's own `slotchange`, same dual-trigger reasoning chx-chat uses one level up —
   * needed here since either a consumer toggling `always-visible` after the list is already slotted,
   * or the list being (re)assigned after `messagesEmpty` was already pushed, must re-run this check.
   */
  pushSuggestionListProperties() {
    const list = this.suggestionListElement;
    if (!list) return;
    list.hidden = !list.alwaysVisible && !this.messagesEmpty;
  }

  /**
   * @param {CustomEvent<{value: string, autoSubmit: boolean}>} event
   */
  #handleSuggestionSelect = (event) => {
    const { value, autoSubmit } = event.detail;
    this.setText(value);
    if (autoSubmit) this.textboxElement?.closest("form")?.requestSubmit();
    else this.textboxElement?.focusEnd();
  };

  /**
   * `chx-send-message` is cancelable — a listener calling preventDefault()
   * vetoes the send and keeps the draft (editor content + attachments) intact.
   * @param {SubmitEvent} event
   */
  #handleSend(event) {
    event.preventDefault();
    const textbox = this.textboxElement;
    if (!textbox) return;

    const value = textbox.getValue();
    const attachments = this.attachmentsElement?.getAttachments() ?? [];
    if (!value.trim() && attachments.length === 0) return;

    const html = textbox.getHTML();

    const allowed = this.dispatchEvent(
      new CustomEvent("chx-send-message", {
        detail: { value, html, attachments },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (!allowed) return;

    textbox.focus();
    this.clearValue();
  }

  /** Resets the editor's document and any attached files. */
  clearValue() {
    this.textboxElement?.clear();
    this.attachmentsElement?.clearAttachments();
  }

  /**
   * Bound to chx-textbox's own chx-textbox-change — fires on every
   * doc-changing transaction.
   * @param {CustomEvent<{value: string, html: string}>} event
   */
  #handleTextboxChange = (event) => {
    this.dispatchEvent(
      new CustomEvent("chx-change", {
        detail: {
          ...event.detail,
          attachments: this.attachmentsElement?.getAttachments() ?? [],
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    this.pushSuggestionListProperties();
  }

  render() {
    return html`
      <slot
        name="suggestions"
        @slotchange=${this.pushSuggestionListProperties}
        @chx-suggestion-select=${this.#handleSuggestionSelect}
      ></slot>
      <form class="message-composer__form" @submit=${this.#handleSend}>
        <chx-textbox
          name="message"
          class="message-composer__field"
          part="textbox"
          .label=${this.label}
          .placeholder=${this.placeholder}
          .dropHint=${this.dropHint}
          .getTriggerFields=${this.#getTriggerFields}
          .pasteThreshold=${this.pasteThreshold}
          .renderPasteChip=${this.renderPasteChip}
          .pasteHandlers=${this.pasteHandlers}
          ?loading=${this.loading}
          ?dragging=${this.dragging}
          @chx-textbox-change=${this.#handleTextboxChange}
        >
          <slot name="leading" slot="leading"></slot>
          <slot
            name="attachments"
            slot="attachments"
            @slotchange=${this.handleAttachmentsSlotchange}
          ></slot>
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
