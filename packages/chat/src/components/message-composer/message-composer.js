import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";

import "@symblight/wc-material/icon";

import stop from "@material-design-icons/svg/outlined/stop.svg?raw";

import tokens from "../../styles/tokens.css?inline";
import styles from "./message-composer.css?inline";

import "../textbox/textbox.js";
import { CONNECT_REGISTRY } from "../../api/keys.js";
import { EDITOR_EXTENSION } from "../../editor/extension.js";

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
     *  delivery on its own. Swaps chx-textbox's action button to stop while the draft is empty. */
    this.loading = false;

    /** @type {boolean} Pushed down by chx-chat — true in the empty state (no active conversation). Blocks send + editing. */
    this.disabled = false;

    /** @type {boolean} MD3 density −2 — 48dp field, body-medium text. Pushed down to chx-textbox. */
    this.compact = false;

    /** @type {boolean} Pushed down by chx-chat — true while #internalMessages is empty. See #pushSuggestionListProperties. */
    this.messagesEmpty = true;
  }

  /** @returns {import("lit").CSSResultGroup} */
  static get styles() {
    return [tokens, styles];
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("paste", this.#handlePasteFiles);
    this.addEventListener("chx-insert-chip", this.#handleInsertChip);
    this.#registerInput();
    this.#syncAttachmentsOwner();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("paste", this.#handlePasteFiles);
    this.removeEventListener("chx-insert-chip", this.#handleInsertChip);
    this.#unregisterAll();
  }

  /** @type {import("../../context/chat-api-context.js").ChatApiRegistry | undefined} */
  #registry; // pushed by chx-chat, see [CONNECT_REGISTRY]
  /** @type {(() => void) | undefined} */
  #unregisterInput;
  /** @type {{element: import("../attachments/attachments.js").ChxAttachments, unregister: () => void} | undefined} */
  #attachmentsOwner;

  /** Internal: chx-chat hands over its API registry. @param {import("../../context/chat-api-context.js").ChatApiRegistry} registry */
  [CONNECT_REGISTRY](registry) {
    if (registry === this.#registry) return;
    this.#unregisterAll();
    this.#registry = registry;
    this.#registerInput();
    this.#syncAttachmentsOwner();
  }

  #unregisterAll() {
    this.#unregisterInput?.();
    this.#unregisterInput = undefined;
    this.#attachmentsOwner?.unregister();
    this.#attachmentsOwner = undefined;
  }

  #registerInput() {
    if (!this.#registry || this.#unregisterInput || !this.isConnected) return;
    this.#unregisterInput = this.#registry.register("input", this, {
      getValue: () => ({
        value: this.#textbox?.getValue() ?? "",
        html: this.#textbox?.getHTML() ?? "",
      }),
      setText: (text) => this.#setText(text),
      clear: () => this.#textbox?.clear(),
      focus: () => this.focus(),
      focusEnd: () => this.#textbox?.focusEnd(),
      isEmpty: () => this.#textbox?.editor?.isEmpty() ?? true,
      insertChip: (node, target) => this.#insertChip(node, target),
    });
  }

  /**
   * Internal: slotted chx-command-picker / chx-attachments ask for a chip insertion with this
   * event instead of reaching for the composer. `target` (a command search session, may be `null`)
   * replaces that tracked range; without it the chip lands at the caret.
   * @param {Event} event
   */
  #handleInsertChip = (event) => {
    const { node, target } = /** @type {CustomEvent<{node: Node, target?: string | null}>} */ (
      event
    ).detail;
    event.stopPropagation();
    this.#insertChip(node, target);
  };

  /** @param {Node} node @param {string | null} [target] */
  #insertChip(node, target) {
    if (target === undefined) this.#textbox?.insertChip(node);
    else this.#textbox?.insertAtRange(target, node);
  }

  /**
   * Editor extensions from direct children, read live at paste/render time — a child upgraded later
   * counts from its first paste on. Stable identity, so chx-textbox isn't dirtied on every render.
   * @returns {import("../../editor/extension.js").EditorExtension[]}
   */
  #getExtensions = () =>
    [...this.children].flatMap(
      (child) =>
        /** @type {{[EDITOR_EXTENSION]?: import("../../editor/extension.js").EditorExtension}} */ (
          child
        )[EDITOR_EXTENSION] ?? [],
    );

  /** Registers `attachments` on behalf of the slotted `<chx-attachments>`, following slot changes. */
  async #syncAttachmentsOwner() {
    const element = this.#registry && this.isConnected ? this.#attachments : null;
    if (element === (this.#attachmentsOwner?.element ?? null)) return;
    this.#attachmentsOwner?.unregister();
    this.#attachmentsOwner = undefined;
    if (!element) return;

    await customElements.whenDefined("chx-attachments"); // may be imported after the composer
    const registry = this.#registry;
    if (!registry || this.#attachmentsOwner || this.#attachments !== element) return;

    const unregisterNamespace = registry.register(
      "attachments",
      element,
      {
        add: (files) => element.addFiles(Array.isArray(files) ? files : [files], "api"),
        remove: (file) => {
          const entry = element.getAttachmentEntries().find((e) => e.file === file);
          if (entry) element.removeAttachment(entry.element);
        },
        clear: () => element.clearAttachments(),
        getFiles: () => element.getAttachments(),
        open: () => element.open(),
      },
      () => element.getAttachments(),
    );
    // cards are light-DOM children: adding one doesn't re-render chx-attachments, so check on its event
    const check = () => registry.check("attachments");
    element.addEventListener("chx-attachments-change", check);
    this.#attachmentsOwner = {
      element,
      unregister: () => {
        element.removeEventListener("chx-attachments-change", check);
        unregisterNamespace();
      },
    };
  }

  /**
   * Pasted files bypass the editor doc, same as an OS drop — guarded to the textbox so other
   * slotted editable content isn't hijacked.
   * @param {ClipboardEvent} event
   */
  #handlePasteFiles = (event) => {
    const files = event.clipboardData?.files;
    if (!files || files.length === 0) return;
    const textbox = this.#textbox;
    if (!textbox || !event.composedPath().includes(textbox)) return;
    const attachments = this.#attachments;
    if (!attachments) return;

    event.preventDefault();
    attachments.addFiles(files, "paste");
  };

  /** @type {Map<string, Element>} Keyed by element.id — see #handleCommandFieldSlotchange. */
  #triggerFields = new Map();

  /** Stable identity — an inline arrow in the template would dirty chx-textbox on every render. */
  #getTriggerFields = () => this.#triggerFields;

  /**
   * Sole discovery point for <chx-command-field>/<chx-command-picker>, keyed by `element.id` —
   * read live by chx-textbox via `#getTriggerFields` for "@"/"/" query routing while typing (see
   * `textbox.js`).
   * @param {Event} event
   */
  #handleCommandFieldSlotchange(event) {
    const slot = /** @type {HTMLSlotElement} */ (event.target);
    this.#triggerFields = new Map(
      slot.assignedElements({ flatten: true }).map((element) => [element.id, element]),
    );
  }

  /** Queued until the first render if the textbox doesn't exist yet. @param {string} text */
  #setText(text) {
    if (this.#textbox) this.#textbox.setText(text);
    else this.updateComplete.then(() => this.#textbox?.setText(text));
  }

  /** Focuses the underlying chx-textbox — kept as an override: the composer doesn't delegate focus. */
  focus() {
    this.#textbox?.focus();
  }

  /** @returns {import("../textbox/textbox.js").ChxTextbox | null} */
  get #textbox() {
    return /** @type {import("../textbox/textbox.js").ChxTextbox | null} */ (
      this.renderRoot?.querySelector("chx-textbox") ?? null
    );
  }

  /**
   * Optional, consumer-authored light DOM (`slot="attachments"`, forwarded into chx-textbox).
   * @returns {import("../attachments/attachments.js").ChxAttachments | null}
   */
  get #attachments() {
    return /** @type {import("../attachments/attachments.js").ChxAttachments | null} */ (
      this.querySelector("chx-attachments")
    );
  }

  /**
   * Warns if more than one <chx-attachments> is slotted — only the first is used.
   * @param {Event} event
   */
  #handleAttachmentsSlotchange(event) {
    this.#syncAttachmentsOwner();
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
   * element).
   * @returns {(HTMLElement & {alwaysVisible: boolean, hidden: boolean}) | null}
   */
  get #suggestionList() {
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
  #pushSuggestionListProperties() {
    const list = this.#suggestionList;
    if (!list) return;
    list.hidden = !list.alwaysVisible && !this.messagesEmpty;
  }

  /**
   * @param {CustomEvent<{value: string, autoSubmit: boolean}>} event
   */
  #handleSuggestionSelect = (event) => {
    const { value, autoSubmit } = event.detail;
    this.#setText(value);
    if (autoSubmit) this.#textbox?.closest("form")?.requestSubmit();
    else this.#textbox?.focusEnd();
  };

  /**
   * `chx-send-message` is cancelable — a listener calling preventDefault()
   * vetoes the send and keeps the draft (editor content + attachments) intact.
   * A submit can't mean "stop": while `loading` with an empty draft the action button is
   * `type="button"` and dispatches `chx-stop` instead, so the two intents never share this path.
   * A non-empty draft sends even mid-turn — chx-chat delivers it alongside the one in flight.
   * @param {SubmitEvent} event
   */
  #handleSend(event) {
    event.preventDefault();
    const textbox = this.#textbox;
    if (!textbox) return;

    const value = textbox.getValue();
    const attachments = this.#attachments?.getAttachments() ?? [];
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
    this.#clearValue();
  }

  /** Resets the editor's document and any attached files. */
  #clearValue() {
    this.#textbox?.clear();
    this.#attachments?.clearAttachments();
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
          attachments: this.#attachments?.getAttachments() ?? [],
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /** @param {import("lit").PropertyValues} changedProperties */
  updated(changedProperties) {
    super.updated(changedProperties);
    this.#pushSuggestionListProperties();
  }

  render() {
    return html`
      <slot
        name="suggestions"
        @slotchange=${this.#pushSuggestionListProperties}
        @chx-suggestion-select=${this.#handleSuggestionSelect}
      ></slot>
      <slot name="command-field" @slotchange=${this.#handleCommandFieldSlotchange}></slot>
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
          .getExtensions=${this.#getExtensions}
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
            @slotchange=${this.#handleAttachmentsSlotchange}
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
