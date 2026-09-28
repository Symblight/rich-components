import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";

import tokens from "../../styles/tokens.css?inline";
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
    disabled: { type: Boolean, reflect: true },
    compact: { type: Boolean, reflect: true },
    placeholder: { type: String },
    sendLabel: { type: String, attribute: "send-label" },
    stopLabel: { type: String, attribute: "stop-label" },
    dropHint: { type: String, attribute: "drop-hint" },
    dragging: { type: Boolean, reflect: true },
    messagesEmpty: { type: Boolean },
  };

  constructor() {
    super();

    /** @type {string} Applied as the editor's aria-label too — see chx-textbox. */
    this.placeholder = "Put your text...";

    /** @type {string} Pushed down to chx-textbox — the action button's name while it sends. */
    this.sendLabel = "Send";

    /** @type {string} Pushed down to chx-textbox — the action button's name while a turn is in flight. */
    this.stopLabel = "Stop";

    /** @type {string} Pushed down to chx-textbox — shown while an OS file drag is over the field. */
    this.dropHint = "Release to attach";

    /** @type {boolean} Pushed down by chx-chat — see chx-chat's DropTargetController. */
    this.dragging = false;

    /** @type {boolean} Pushed down by chx-chat — `loading || busy`, so it is raised by an in-flight
     *  delivery on its own. Swaps chx-textbox's action button from send to stop. */
    this.loading = false;

    /** @type {boolean} Pushed down by chx-chat — true in the empty state (no active conversation). Blocks send + editing. */
    this.disabled = false;

    /** @type {boolean} MD3 density −2 — 48dp field, body-medium text. Pushed down to chx-textbox. */
    this.compact = false;

    /** @type {boolean} Pushed down by chx-chat — true while #internalMessages is empty. See pushSuggestionListProperties. */
    this.messagesEmpty = true;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("paste", this.#handlePasteFiles);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("paste", this.#handlePasteFiles);
  }

  /**
   * Pasted files bypass the editor doc, same as an OS drop — guarded to the textbox so other
   * slotted editable content isn't hijacked.
   * @param {ClipboardEvent} event
   */
  #handlePasteFiles = (event) => {
    const files = event.clipboardData?.files;
    if (!files || files.length === 0) return;
    const textbox = this.textboxElement;
    if (!textbox || !event.composedPath().includes(textbox)) return;
    const attachments = this.attachmentsElement;
    if (!attachments) return;

    event.preventDefault();
    attachments.addFiles(files, "paste");
  };

  /** @type {Map<string, Element>} Keyed by element.id — see handleCommandFieldSlotchange. */
  #triggerFields = new Map();

  /** Stable identity — an inline arrow in the template would dirty chx-textbox on every render. */
  #getTriggerFields = () => this.#triggerFields;

  /**
   * Sole discovery point for <chx-command-field>/<chx-command-picker>, keyed by `element.id` —
   * read live by chx-textbox via `#getTriggerFields` for "@"/"/" query routing while typing (see
   * `textbox.js`).
   * @param {Event} event
   */
  handleCommandFieldSlotchange(event) {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.#triggerFields = new Map(
      slot.assignedElements({ flatten: true }).map((element) => [element.id, element]),
    );
  }

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
   * (declared by the consumer) and `messagesEmpty` (pushed down by chx-chat) actually combine. Called
   * from `updated()` and from the suggestions slot's own `slotchange`, same dual-trigger reasoning
   * chx-chat uses one level up —
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
   * A submit can't mean "stop": while `loading` the action button is `type="button"` and dispatches
   * `chx-stop` instead, so the two intents never share this path (they used to, and the stop click
   * died silently on the empty-draft guard below).
   * @param {SubmitEvent} event
   */
  #handleSend(event) {
    event.preventDefault();
    if (this.loading) return;
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
      <slot name="command-field" @slotchange=${this.handleCommandFieldSlotchange}></slot>
      <slot name="paste-long-text"></slot>
      <form class="message-composer__form" @submit=${this.#handleSend}>
        <chx-textbox
          name="message"
          class="message-composer__field"
          part="textbox"
          .placeholder=${this.placeholder}
          .sendLabel=${this.sendLabel}
          .stopLabel=${this.stopLabel}
          .dropHint=${this.dropHint}
          .getTriggerFields=${this.#getTriggerFields}
          ?loading=${this.loading}
          ?disabled=${this.disabled}
          ?dragging=${this.dragging}
          ?compact=${this.compact}
          @chx-textbox-change=${this.#handleTextboxChange}
        >
          <slot name="leading" slot="leading"></slot>
          <slot
            name="attachments"
            slot="attachments"
            @slotchange=${this.handleAttachmentsSlotchange}
          ></slot>
          <!-- The default lives here, not in chx-textbox: a forwarding <slot> counts as assigned
               content, so the inner fallback would never render through it. -->
          <slot name="stop" slot="stop"><md-icon>${unsafeSVG(stop)}</md-icon></slot>

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
